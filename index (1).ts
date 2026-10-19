// Skillforge LMS — Edge Function "learning".
// Everything that decides a learner's results, and every write that needs an ownership or permission check,
// runs here with the service role. Rules: ../_shared/learning-core.js (unit-tested: `npm test`).
//
//   changePassword { password }        -> sets a new password and clears "must change"
//   me             { org }             -> { empId, role, roleId, perms, name, mustChange }
//   sign           { org, paths[] }    -> signed links, only for files this person may open
//   scormLaunch    { org, courseId, step } or { org, moduleId } -> launch URL on the separate content site + session id
//   scormPing / scormEnd { org, courseId, step | moduleId, sid }   -> renew / end the launch session
//   scormCommit    { org, courseId, step, sid, status, score }      -> completion (after the minimum time)
//   stepPing       { org, courseId, step, resume? }                 -> seat-time heartbeat for an open step (v41.26)
//   me             { org, method? }  method "email" | "emp" also records the sign-in (v41.27: replaces a separate signedIn call)
//   startAttempt / answer / submit / rescore / openStep / completeStep / submitSurvey / answerFeedback /
//   requestAccess / decideRequest / updateProfile / post / docSeen { docId, ack? } (documents library: viewed / acknowledged)
//
// Identity comes from the caller's JWT, which the Supabase gateway has already verified (verify_jwt = true in
// supabase/config.toml). It is decoded locally: no call to /auth/v1/user, so no shared-IP Auth rate limit.
// Secrets: ORG_TIMEZONE (IANA zone for calendar dates, default Asia/Kolkata), ALLOWED_ORIGIN (the app's origin, required), CONTENT_ORIGIN, CONTENT_SIGNING_KEY, STORAGE_BUCKET,
//          SCORM_IDLE_MINUTES (default 30), SCORM_MAX_HOURS (hard cap of a launch link, default 8),
//          SEAT_LEGACY_UNTIL (v41.31, default empty = never: an ISO date until which a page older than v41.26 may still use the old viewing-time rule),
//          SEAT_TIME_STRICT (v41.26, default on: viewing time of a step is counted by the server from stepPing heartbeats; set to "false" to go back to
//          the old rule, time since the step was opened),
//          v41.27: who-is-calling checks (session alive, member, expiry, permissions) are ONE database call, sf_learning_ctx (migration 011);
//          without it the function falls back to four separate reads.
//          SIGNED_URL_TTL_SECONDS (v41.26, default 3600, 300 to 14400: lifetime of file links; keep it equal to SIGNED_URL_TTL_SECONDS in js/config.js).
// v41.32: request hygiene (backend audit rows 18, 91, 95, 96).
//          - Only POST (and the OPTIONS preflight): anything else is 405.
//          - Form posts are refused (415); the body is at most 1 MB (413) and must be a JSON object (400). A malformed body
//            used to be read as an empty request.
//          - org and action are checked before any database call. A change-password error from Auth is logged with a
//            reference id instead of being sent to the browser as-is. Passwords are limited to 72 characters.
// Deploy: supabase functions deploy learning
import { createClient } from "jsr:@supabase/supabase-js@2";
import "../_shared/assessment.js";
import "../_shared/learning-core.js";

const L = (globalThis as any).LearningCore;
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "";
const cors: Record<string, string> = { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sf-org", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
if (ORIGIN) cors["Access-Control-Allow-Origin"] = ORIGIN;   // no wildcard: without ALLOWED_ORIGIN browsers are refused
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const URL_ = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = Deno.env.get("STORAGE_BUCKET") || "lms-files";
const SEAT_STRICT = (Deno.env.get("SEAT_TIME_STRICT") || "true").toLowerCase() !== "false";
// v41.31: optional, time-limited compatibility for pages older than v41.26 (they cannot send heartbeats). ISO date, e.g. 2026-11-30. Empty = never (the default).
const SEAT_LEGACY_UNTIL = Date.parse(Deno.env.get("SEAT_LEGACY_UNTIL") || "") || 0;
const SIGN_TTL = Math.max(300, Math.min(14400, Number(Deno.env.get("SIGNED_URL_TTL_SECONDS") || 3600)));
// v41.32: request limits
const MAX_BODY = 1024 * 1024;
const ORG = /^[A-Za-z0-9_-]{1,64}$/;
const ACTION = /^[A-Za-z]{1,40}$/;

// The gateway verified the signature (verify_jwt); read the claims without another network call.
// SECURITY ASSUMPTION: decodes without verifying the signature; safe only while supabase/config.toml keeps
// verify_jwt = true for this function (the gateway checks the signature). Guarded by tests/build-csp.test.mjs.
function claims(req: Request): any | null {
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const p = t.split(".")[1]; if (!p) return null;
  try { const c = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(p.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((p.length + 3) % 4)), (ch) => ch.charCodeAt(0))));
    return c && c.sub && c.role === "authenticated" && (!c.exp || c.exp > Date.now() / 1000) ? c : null; } catch { return null; }
}
/* v41.32: read the body safely. Returns the object, or a Response to send back. */
async function readBody(req: Request): Promise<any> {
  // JSON is expected. Form posts (the kind another web page could send) are refused outright.
  const ct = (req.headers.get("Content-Type") || "").toLowerCase();
  if (ct && !ct.startsWith("application/json") && !ct.startsWith("text/plain")) return json({ error: "Send the request as JSON (Content-Type: application/json)" }, 415);
  if (Number(req.headers.get("Content-Length") || 0) > MAX_BODY) return json({ error: "The request is too large" }, 413);
  let text = "";
  try { text = await req.text(); } catch { return json({ error: "The request body could not be read" }, 400); }
  if (text.length > MAX_BODY) return json({ error: "The request is too large" }, 413);
  if (!text.trim()) return json({ error: "The request body is empty" }, 400);
  let body: any;
  try { body = JSON.parse(text); } catch { return json({ error: "The request body is not valid JSON" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "The request body must be a JSON object" }, 400);
  return body;
}
function dbFor(admin: any, org: string) {
  return {
    async get(coll: string, key: string) {
      const { data, error } = await admin.from("sf_doc").select("data,version").eq("org_id", org).eq("coll", coll).eq("key", key).maybeSingle();
      if (error) throw error; return data;
    },
    async getMany(coll: string, keys: string[]) {
      const m = new Map(); if (!keys.length) return m;
      for (let i = 0; i < keys.length; i += 200) {
        const { data, error } = await admin.from("sf_doc").select("key,data,version").eq("org_id", org).eq("coll", coll).in("key", keys.slice(i, i + 200));
        if (error) throw error; (data || []).forEach((r: any) => m.set(r.key, { data: r.data, version: r.version }));
      }
      return m;
    },
    async put(coll: string, key: string, data: unknown, version: number | null) {
      if (version == null) {
        const { error } = await admin.from("sf_doc").insert({ org_id: org, coll, key, data, version: 1 });
        if (error) { if (error.code === "23505") return false; throw error; } return true;
      }
      const { data: rows, error } = await admin.from("sf_doc").update({ data, version: version + 1 }).eq("org_id", org).eq("coll", coll).eq("key", key).eq("version", version).select("key");
      if (error) throw error; return (rows || []).length === 1;
    },
    async del(coll: string, key: string) { await admin.from("sf_doc").delete().eq("org_id", org).eq("coll", coll).eq("key", key); },
  };
}
/* v41.27: who is calling, in one database call. Returns { deny: true } when the sign-in has ended, otherwise
 * { mem, exp, perms, userKey } where mem is the sf_member row (or null) and perms the active permission keys of a non-admin.
 * sf_learning_ctx (migration 011) answers everything at once; if it is not installed, or fails, the four separate reads below give
 * the same answer. Nothing here is cached: a deactivated or reset person is refused on their next request. */
let CTX_RPC: boolean | null = null;   // null = not tried yet, false = migration 011 is not installed
async function loadCtx(admin: any, c: any, org: string, db: any) {
  if (CTX_RPC !== false) {
    const r = await admin.rpc("sf_learning_ctx", { p_user: c.sub, p_sid: String(c.session_id || ""), p_org: org });
    if (!r.error && r.data && typeof r.data === "object" && "live" in r.data) {
      CTX_RPC = true;
      if (r.data.live !== true) return { deny: true };
      const m = r.data.member;
      return { mem: m || null, exp: String(r.data.expires || ""), perms: Array.isArray(r.data.perms) ? r.data.perms.map(String) : [], userKey: m ? (m.user_key || null) : null };
    }
    if (r.error && /PGRST202|42883|could not find|does not exist/i.test(String(r.error.code || "") + " " + String(r.error.message || ""))) CTX_RPC = false;
    else if (r.error) console.error("sf_learning_ctx failed, using separate reads", r.error.message);
  }
  // separate reads (before v41.27, and the fallback)
  const live = await admin.rpc("sf_session_ok", { p_user: c.sub, p_sid: String(c.session_id || "") });
  if (live.error || live.data !== true) return { deny: true };
  const { data: mem } = await admin.from("sf_member").select("emp_id,role,role_id,user_key,app_name,active").eq("org_id", org).eq("user_id", c.sub).maybeSingle();
  if (!mem) return { mem: null, exp: "", perms: [], userKey: null };
  const { data: ur } = await admin.from("sf_doc").select("key,data").eq("org_id", org).eq("coll", "users").eq("data->>empId", mem.emp_id).maybeSingle();
  const roleKey = mem.role_id || (mem.role === "Trainer" ? "r_trainer" : "r_learner");
  const roleDoc = mem.role === "Admin" ? null : await db.get("roles", roleKey);
  const perms: string[] = Object.entries((roleDoc?.data?.perms) || {}).filter(([, v]) => v === true).map(([k]) => k);
  return { mem, exp: String((ur && ur.data && ur.data.expires) || ""), perms, userKey: mem.user_key || (ur ? ur.key : null) };
}
const strongEnough = (pw: string) => pw.length >= 10 && pw.length <= 72 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // v41.32: only POST
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json", "Allow": "POST, OPTIONS" } });
  if (ORIGIN && req.headers.get("Origin") && req.headers.get("Origin") !== ORIGIN) return json({ error: "Origin not allowed" }, 403);
  try {
    const c = claims(req); if (!c) return json({ error: "Not signed in" }, 401);
    // v41.32: a malformed body is a 400 (it used to be read as an empty request); org and action are checked first
    const body = await readBody(req); if (body instanceof Response) return body;
    if (typeof body.action !== "string" || !ACTION.test(body.action)) return json({ error: "Unknown action" }, 400);
    const org = String(body.org ?? "");
    if (body.action !== "changePassword" && !ORG.test(org)) return json({ error: "Missing or invalid organisation" }, 400);
    const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const db = dbFor(admin, org);
    // v34: the token's session must still exist (deactivation / reset deletes it), and a database error means "no".
    // v41.27: that check, the member, the expiry date and the permissions come back from ONE database call (loadCtx).
    const cx: any = await loadCtx(admin, c, org, db);
    if (cx.deny) return json({ error: "Your session has ended. Sign in again." }, 401);
    const mustChange = !!(c.app_metadata || {}).must_change;
    if (body.action === "changePassword") {
      const pw = typeof body.password === "string" ? body.password : "";
      if (!strongEnough(pw)) return json({ error: "Use 10 to 72 characters with upper- and lower-case letters and a number." }, 400);
      // v41.19: the organisation's default first password (DEFAULT_PASSWORD, default Pass@123) can't be kept as the new one
      { const d = (Deno.env.get("DEFAULT_PASSWORD") || "Pass@123").trim();
        let o = "";   // v41.21: App settings › Default password too
        if (ORG.test(org)) { const { data: pf } = await admin.from("sf_doc").select("data").eq("org_id", org).eq("coll", "platform").eq("key", "value").maybeSingle();
          o = String((((pf || {}).data || {}).defaults || {}).password || "").trim(); }
        if ((d && pw === d) || (o && pw === o)) return json({ error: "Choose a password different from the default first password." }, 400); }
      const { error } = await admin.auth.admin.updateUserById(c.sub, { password: pw, app_metadata: { ...(c.app_metadata || {}), must_change: false } });
      if (error) {   // v41.32: Auth's own text is logged, not sent
        const requestId = crypto.randomUUID(); console.error("changePassword failed", requestId, error.message);
        return json({ error: "The password could not be changed. Try a different password, or quote this reference to support.", requestId }, 400); }
      // v34: a new password ends every OTHER session of this person (this one carries on)
      if (c.session_id) { const r = await admin.rpc("sf_revoke_sessions", { p_user: c.sub, p_keep: String(c.session_id) }); if (r.error) console.error("revoke other sessions failed", r.error.message); }
      return json({ ok: true });
    }
    const mem = cx.mem;
    if (!mem || !mem.active) return json({ error: "Your login is not linked to an active Skillforge account" }, 403);
    if (cx.exp && cx.exp < L.day(new Date(), Deno.env.get("ORG_TIMEZONE") || "Asia/Kolkata")) return json({ error: "This account has expired. Contact your L&D administrator." }, 403);
    const perms: string[] = mem.role === "Admin" ? ["*"] : cx.perms;
    if (body.action === "me") {
      // v41.27: the sign-in record (count, first and last time, method) is written here, so the app makes one call instead of two.
      // It only counts when the app asks (method) and the password is not waiting to be changed; a failure never blocks signing in.
      let logged = false;
      if ((body.method === "email" || body.method === "emp") && !mustChange) {
        try { const now = new Date().toISOString(), m = String(body.method);
          await L.update(db, "loginLog", mem.emp_id, (cur: any) => ({ n: (cur.n || 0) + 1, first: cur.first || now, last: now, by: { ...(cur.by || {}), [m]: ((cur.by || {})[m] || 0) + 1 } }), {});
          logged = true; } catch (e) { console.error("login log failed", (e as any)?.message || e); }
      }
      return json({ empId: mem.emp_id, role: mem.role, roleId: mem.role_id, perms, name: mem.app_name, mustChange, logged });
    }
    if (mustChange) return json({ error: "Set a new password first" }, 403);
    const can = (p: string) => mem.role === "Admin" || perms.includes(p);
    const userKey = cx.userKey || mem.user_key || null;   // v41.27: resolved together with the other checks
    // ---- signed file links: content staff see all files; others only files of courses assigned to them ----
    if (body.action === "sign") {
      if (body.paths != null && !Array.isArray(body.paths)) return json({ error: "paths must be a list" }, 400);   // v41.32
      const paths = (Array.isArray(body.paths) ? body.paths : []).slice(0, 200).map(String).filter((p: string) => p.length <= 512 && p.startsWith(org + "/") && !p.includes(".."));
      let allowed = paths;
      if (!["lcms", "lcmsForms", "courseAdmin", "builder", "certs", "qbank"].some(can)) {
        const en = (await db.get("enroll", mem.emp_id))?.data || {};
        const courses = await db.getMany("adminCourses", Object.keys(en));
        const mods = new Set<string>(); courses.forEach((x: any) => (x.data.items || []).forEach((it: any) => it.moduleId && mods.add(String(it.moduleId))));
        const lcms = await db.getMany("lcms", [...mods]);
        const okp = new Set<string>(); lcms.forEach((m: any) => { const p = m.data.file && m.data.file.path; if (p) okp.add(p); });
        // documents library: the current version of documents this person may see (managers: every version)
        // v37: only look at documents when some path is not course content, and then only the documents holding
        // those paths (sf_docs_by_paths, 003). Falls back to the old whole-collection read on a database without 003.
        const rest = paths.filter((p: string) => !okp.has(p));
        let drows: any[] = [];
        if (rest.length) {
          const r = await admin.rpc("sf_docs_by_paths", { p_org: org, p_paths: rest });
          drows = r.error ? ((await admin.from("sf_doc").select("data").eq("org_id", org).eq("coll", "docs")).data || []) : (r.data || []).map((d: any) => ({ data: d }));
        }
        const today = L.day(new Date(), Deno.env.get("ORG_TIMEZONE") || "Asia/Kolkata"), docOk = new Set<string>();
        (drows || []).forEach((r: any) => { const d = r.data || {};
          if (can("documents")) (d.versions || []).forEach((v: any) => { if (v && v.file && v.file.path) docOk.add(String(v.file.path)); });
          else if (L.docVisible(d, mem.role, today)) { const p = L.docCurPath(d); if (p) docOk.add(p); } });
        allowed = paths.filter((p: string) => okp.has(p) || docOk.has(p));
      }
      if (!allowed.length) return json({ urls: {} });
      const { data } = await admin.storage.from(BUCKET).createSignedUrls(allowed, SIGN_TTL);   // v41.26: same lifetime as the links the app signs for staff
      return json({ urls: Object.fromEntries((data || []).filter((x: any) => x.signedUrl).map((x: any) => [x.path, x.signedUrl])) });
    }
    // v41.21: the trainees of the batches this person trains (kept by the database from batches: sf_trainee), for grading scope
    let trainees: string[] = [];
    if (mem.role !== "Admin" && perms.includes("gradebook") && ["rescore", "reviewAssignment"].includes(String(body.action))) {
      const { data: tr } = await admin.from("sf_trainee").select("trainee_emp").eq("org_id", org).eq("trainer_emp", mem.emp_id);
      trainees = (tr || []).map((x: any) => String(x.trainee_emp)).filter((e: string) => e !== mem.emp_id); }
    const ctx = { tz: Deno.env.get("ORG_TIMEZONE") || "Asia/Kolkata", org, emp: mem.emp_id, role: mem.role, perms: mem.role === "Admin" ? [] : perms, trainees, name: mem.app_name, userKey, now: new Date(),
      seatStrict: SEAT_STRICT, seatLegacy: SEAT_LEGACY_UNTIL > 0 && Date.now() < SEAT_LEGACY_UNTIL,
      contentOrigin: Deno.env.get("CONTENT_ORIGIN") || "", signKey: Deno.env.get("CONTENT_SIGNING_KEY") || "",
      scormIdleMin: Number(Deno.env.get("SCORM_IDLE_MINUTES") || 30), scormMaxHours: Number(Deno.env.get("SCORM_MAX_HOURS") || 8) };
    const out = await L.handle(db, ctx, String(body.action || ""), body);
    return json(out ?? { ok: true });
  } catch (e) {
    const err = e as any;
    const status = Number(err && err.status) || 500;
    if (status >= 500) {
      const requestId = crypto.randomUUID();
      console.error("learning request failed", requestId, err);
      return json({ error: "The request could not be completed.", requestId }, 500);
    }
    return json({ error: String(err.message || err) }, status);
  }
});
