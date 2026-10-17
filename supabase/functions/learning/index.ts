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
//   startAttempt / answer / submit / rescore / openStep / completeStep / submitSurvey / answerFeedback /
//   requestAccess / decideRequest / updateProfile / post / docSeen { docId, ack? } (documents library: viewed / acknowledged)
//
// Identity comes from the caller's JWT, which the Supabase gateway has already verified (verify_jwt = true in
// supabase/config.toml). It is decoded locally: no call to /auth/v1/user, so no shared-IP Auth rate limit.
// Secrets: ORG_TIMEZONE (IANA zone for calendar dates, default Asia/Kolkata), ALLOWED_ORIGIN (the app's origin, required), CONTENT_ORIGIN, CONTENT_SIGNING_KEY, STORAGE_BUCKET,
//          SCORM_IDLE_MINUTES (default 30), SCORM_MAX_HOURS (hard cap of a launch link, default 8),
//          SEAT_TIME_STRICT (v41.26, default on: viewing time of a step is counted by the server from stepPing heartbeats; set to "false" to go back to
//          the old rule, time since the step was opened),
//          SIGNED_URL_TTL_SECONDS (v41.26, default 3600, 300 to 14400: lifetime of file links; keep it equal to SIGNED_URL_TTL_SECONDS in js/config.js).
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
const SIGN_TTL = Math.max(300, Math.min(14400, Number(Deno.env.get("SIGNED_URL_TTL_SECONDS") || 3600)));

// The gateway verified the signature (verify_jwt); read the claims without another network call.
// SECURITY ASSUMPTION: decodes without verifying the signature; safe only while supabase/config.toml keeps
// verify_jwt = true for this function (the gateway checks the signature). Guarded by tests/build-csp.test.mjs.
function claims(req: Request): any | null {
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const p = t.split(".")[1]; if (!p) return null;
  try { const c = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(p.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((p.length + 3) % 4)), (ch) => ch.charCodeAt(0))));
    return c && c.sub && c.role === "authenticated" && (!c.exp || c.exp > Date.now() / 1000) ? c : null; } catch { return null; }
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
const strongEnough = (pw: string) => pw.length >= 10 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (ORIGIN && req.headers.get("Origin") && req.headers.get("Origin") !== ORIGIN) return json({ error: "Origin not allowed" }, 403);
  try {
    const c = claims(req); if (!c) return json({ error: "Not signed in" }, 401);
    const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    // v34: the token's session must still exist (deactivation / reset deletes it), and a database error means "no".
    { const live = await admin.rpc("sf_session_ok", { p_user: c.sub, p_sid: String(c.session_id || "") });
      if (live.error || live.data !== true) return json({ error: "Your session has ended. Sign in again." }, 401); }
    const body = await req.json().catch(() => ({}));
    const org = String(body.org || "");
    const mustChange = !!(c.app_metadata || {}).must_change;
    if (body.action === "changePassword") {
      const pw = String(body.password || "");
      if (!strongEnough(pw)) return json({ error: "Use at least 10 characters with upper- and lower-case letters and a number." }, 400);
      // v41.19: the organisation's default first password (DEFAULT_PASSWORD, default Pass@123) can't be kept as the new one
      { const d = (Deno.env.get("DEFAULT_PASSWORD") || "Pass@123").trim();
        const { data: pf } = await admin.from("sf_doc").select("data").eq("org_id", String(body.org || "")).eq("coll", "platform").eq("key", "value").maybeSingle();
        const o = String((((pf || {}).data || {}).defaults || {}).password || "").trim();   // v41.21: App settings › Default password too
        if ((d && pw === d) || (o && pw === o)) return json({ error: "Choose a password different from the default first password." }, 400); }
      const { error } = await admin.auth.admin.updateUserById(c.sub, { password: pw, app_metadata: { ...(c.app_metadata || {}), must_change: false } });
      if (error) return json({ error: error.message }, 400);
      // v34: a new password ends every OTHER session of this person (this one carries on)
      if (c.session_id) { const r = await admin.rpc("sf_revoke_sessions", { p_user: c.sub, p_keep: String(c.session_id) }); if (r.error) console.error("revoke other sessions failed", r.error.message); }
      return json({ ok: true });
    }
    const { data: mem } = await admin.from("sf_member").select("emp_id,role,role_id,user_key,app_name,active").eq("org_id", org).eq("user_id", c.sub).maybeSingle();
    if (!mem || !mem.active) return json({ error: "Your login is not linked to an active Skillforge account" }, 403);
    { const { data: ur } = await admin.from("sf_doc").select("data").eq("org_id", org).eq("coll", "users").eq("data->>empId", mem.emp_id).maybeSingle();
      const exp = ur && ur.data && ur.data.expires; if (exp && exp < L.day(new Date(), Deno.env.get("ORG_TIMEZONE") || "Asia/Kolkata")) return json({ error: "This account has expired. Contact your L&D administrator." }, 403); }
    const db = dbFor(admin, org);
    const roleKey = mem.role_id || (mem.role === "Trainer" ? "r_trainer" : "r_learner");
    const roleDoc = mem.role === "Admin" ? null : await db.get("roles", roleKey);
    const perms: string[] = mem.role === "Admin" ? ["*"] : Object.entries((roleDoc?.data?.perms) || {}).filter(([, v]) => v === true).map(([k]) => k);
    if (body.action === "me") return json({ empId: mem.emp_id, role: mem.role, roleId: mem.role_id, perms, name: mem.app_name, mustChange });
    if (mustChange) return json({ error: "Set a new password first" }, 403);
    const can = (p: string) => mem.role === "Admin" || perms.includes(p);
    let userKey = mem.user_key;
    if (!userKey) { const { data: u } = await admin.from("sf_doc").select("key").eq("org_id", org).eq("coll", "users").eq("data->>empId", mem.emp_id).maybeSingle(); userKey = u ? u.key : null; }
    // ---- signed file links: content staff see all files; others only files of courses assigned to them ----
    if (body.action === "sign") {
      const paths = (Array.isArray(body.paths) ? body.paths : []).map(String).filter((p: string) => p.startsWith(org + "/") && !p.includes("..")).slice(0, 200);
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
      seatStrict: SEAT_STRICT,
      contentOrigin: Deno.env.get("CONTENT_ORIGIN") || "", signKey: Deno.env.get("CONTENT_SIGNING_KEY") || "",
      scormIdleMin: Number(Deno.env.get("SCORM_IDLE_MINUTES") || 30), scormMaxHours: Number(Deno.env.get("SCORM_MAX_HOURS") || 8) };
    const out = await L.handle(db, ctx, String(body.action || ""), body);
    return json(out ?? { ok: true });
  } catch (e) {
    const err = e as any;
    const status = Number(err.status) || 500;
    if (status >= 500) {
      const requestId = crypto.randomUUID();
      console.error("learning request failed", requestId, err);
      return json({ error: "The request could not be completed.", requestId }, 500);
    }
    return json({ error: String(err.message || err) }, status);
  }
});
