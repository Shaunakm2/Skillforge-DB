// Skillforge LMS — Edge Function "admin-users" (admins only).
// v41.19: logins are created (and reset) with the organisation's default first password (secret DEFAULT_PASSWORD,
// default Pass@123). It must be changed at first sign-in (app_metadata.must_change), so it only ever opens the
// "Set your password" screen. Set DEFAULT_PASSWORD=random to go back to a random 14-character password per person.
//   create      { email, empId, name, role, roleId?, userKey? } -> { tempPassword }
//   bulkCreate  { people: [{ email, empId, name, role }] } -> { created: [{ email, empId, tempPassword }], skipped: [{ email, reason }] }
//   resetPassword { email }                             -> { tempPassword }
//   ban / unban { email }                               -> deactivate / reactivate sign-in
//   setRole     { email, role, roleId? }                -> base type Learner | Trainer | Admin + custom role
// Caller identity is read from the JWT the gateway verified (verify_jwt = true): no /auth/v1/user call per request.
//   rename      { email, name, empId? }                 -> keeps sf_member in step with the person's record
// v34: resetting a password (and creating over an existing login) or deactivating a login ALSO ends all of that person's sessions
//      (sf_revoke_sessions): their refresh token stops working and the database refuses the old access token at once.
// Deploy: supabase functions deploy admin-users
import { createClient } from "jsr:@supabase/supabase-js@2";

const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "";
const cors: Record<string, string> = { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sf-org", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
if (ORIGIN) cors["Access-Control-Allow-Origin"] = ORIGIN;
// SECURITY ASSUMPTION: claims() only DECODES the JWT; it does not check the signature. That is safe only because
// supabase/config.toml sets verify_jwt = true for this function, so the Supabase gateway rejects unsigned or forged
// tokens before this code runs. If verify_jwt is ever turned off, this must verify the signature itself.
// tests/build-csp.test.mjs ("verify_jwt stays on") fails if the setting changes.
function claims(req: Request): any | null {
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""), p = t.split(".")[1]; if (!p) return null;
  try { const c = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(p.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((p.length + 3) % 4)), (ch) => ch.charCodeAt(0))));
    return c && c.sub && c.role === "authenticated" && (!c.exp || c.exp > Date.now() / 1000) ? c : null; } catch { return null; }
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const ROLES = ["Learner", "Trainer", "Admin"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMP = /^[A-Z0-9][A-Z0-9_\-/]{1,29}$/;

const DEFAULT_PW = (Deno.env.get("DEFAULT_PASSWORD") || "Pass@123").trim();
// v41.21: Settings › Master data › App settings › Default password wins (orgPw); then the DEFAULT_PASSWORD secret; then Pass@123.
let orgPw = "";
function firstPassword() { const d = orgPw || DEFAULT_PW; return d && d.toLowerCase() !== "random" ? d : tempPassword(); }
function tempPassword() {   // 14 characters, upper + lower + digit + symbol, from crypto
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%*?"], all = sets.join("");
  const b = new Uint32Array(14); crypto.getRandomValues(b);
  const out = sets.map((s, i) => s[b[i] % s.length]);
  for (let i = 4; i < 14; i++) out.push(all[b[i] % all.length]);
  for (let i = out.length - 1; i > 0; i--) { const j = b[i] % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    if (ORIGIN && req.headers.get("Origin") && req.headers.get("Origin") !== ORIGIN) return json({ error: "Origin not allowed" }, 403);
    const c = claims(req); if (!c) return json({ error: "Not signed in" }, 401);
    const me = { user: { id: c.sub, app_metadata: c.app_metadata || {} } };
    // v34: the token's session must still exist (deactivation / reset deletes it), and a database error means "no".
    { const live = await admin.rpc("sf_session_ok", { p_user: c.sub, p_sid: String(c.session_id || "") });
      if (live.error || live.data !== true) return json({ error: "Your session has ended. Sign in again." }, 401); }
    const body = await req.json();
    const org = String(body.org || "");
    const { data: mem } = await admin.from("sf_member").select("role,active").eq("org_id", org).eq("user_id", me.user.id).maybeSingle();
    if (!mem || !mem.active || mem.role !== "Admin") return json({ error: "Only admins can manage accounts" }, 403);
    if ((me.user.app_metadata || {}).must_change) return json({ error: "Set a new password first" }, 403);
    { const { data: pf } = await admin.from("sf_doc").select("data").eq("org_id", org).eq("coll", "platform").eq("key", "value").maybeSingle();
      const p = String((((pf || {}).data || {}).defaults || {}).password || "").trim(); orgPw = p.length >= 8 ? p : ""; }

    // End every session of a login. A failure is an error for the caller (they must know the person is still signed in).
    const revoke = async (userId: string) => { const r = await admin.rpc("sf_revoke_sessions", { p_user: userId, p_keep: null }); if (r.error) throw new Error("Could not end the person's sessions: " + r.error.message); };
    // Find a login by email: membership first, then auth.users through a service-only SQL function (no listing).
    // v41.18: reset / ban / role / rename act ONLY on logins that belong to this organisation (sf_member). Before, the
    // auth.users fallback let an admin of one organisation reset or ban a login of another organisation on the same project.
    // v41.19: also matched by employee ID (an e-mail edited in Users & accounts, or different letter case, no longer
    // makes the login "disappear"), and the e-mail is compared case-insensitively.
    const findMember = async (email: string, empId?: unknown) => {
      const e = String(email || "").trim().toLowerCase();
      if (e) { const { data } = await admin.from("sf_member").select("user_id").eq("org_id", org).ilike("email", e.replace(/[\\%_]/g, (ch) => "\\" + ch)).limit(1);
        if (data && data.length) return data[0].user_id as string; }
      const emp = String(empId || "").trim().toUpperCase();
      if (emp) { const { data } = await admin.from("sf_member").select("user_id").eq("org_id", org).eq("emp_id", emp).maybeSingle(); if (data) return data.user_id as string; }
      return null;
    };
    const noLogin = (email: string) => (email || "This person") + " has no login yet. Use Settings › Database & storage › Create missing logins, or create the account again.";
    // Creating an account may reuse an existing login only if that login is not a member of ANOTHER organisation.
    const findUser = async (email: string) => {
      const mine = await findMember(email); if (mine) return mine;
      const { data: id, error } = await admin.rpc("sf_auth_user_id", { p_email: email }); if (error) throw error;
      if (!id) return null;
      const { data: other } = await admin.from("sf_member").select("org_id").eq("user_id", id).neq("org_id", org).limit(1);
      if (other && other.length) throw Object.assign(new Error("This email already has a login in another organisation"), { reason: true });
      return id as string;
    };
    const isMe = (id: string | null) => !!id && id === me.user.id;
    const createOne = async (p: any) => {
      const email = String(p.email || "").trim().toLowerCase(), empId = String(p.empId || "").trim().toUpperCase(), name = String(p.name || "").trim();
      const role = ROLES.includes(p.role) ? p.role : "Learner";
      if (!EMAIL.test(email)) return { email, reason: "Invalid email" };
      if (!EMP.test(empId)) return { email, reason: "Invalid employee ID" };
      if (!name) return { email, reason: "Name is required" };
      if (name in Object.prototype || name === "__proto__" || name === "prototype" || name.length > 120) return { email, reason: "Choose another name" };
      const { data: dupe } = await admin.from("sf_member").select("email").eq("org_id", org).eq("emp_id", empId).maybeSingle();
      if (dupe && dupe.email !== email) return { email, reason: "Employee ID " + empId + " already belongs to " + dupe.email };
      const pw = firstPassword();
      let id: string | null; try { id = await findUser(email); } catch (e) { if ((e as any).reason) return { email, reason: (e as Error).message }; throw e; }
      if (id) {
        const { error } = await admin.auth.admin.updateUserById(id, { password: pw, app_metadata: { must_change: true } }); if (error) return { email, reason: error.message };
        try { await revoke(id); } catch (e) { return { email, reason: String((e as Error).message) }; }
      } else {
        const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, app_metadata: { must_change: true }, user_metadata: { name } });
        if (error) return { email, reason: error.message }; id = data.user.id;
      }
      const { error } = await admin.from("sf_member").upsert({ org_id: org, user_id: id, email, emp_id: empId, app_name: name, role, role_id: p.roleId ? String(p.roleId) : null, user_key: p.userKey != null ? String(p.userKey) : null, active: true });
      if (error) return { email, reason: error.message };
      return { email, empId, tempPassword: pw };
    };

    switch (body.action) {
      case "create": { const r: any = await createOne(body); return r.reason ? json({ error: r.reason }, 400) : json(r); }
      case "bulkCreate": {
        // v37: at most 100 per call so one invocation stays well inside the Edge time limit. The browser sends chunks
        // (backend.js createLogins) and can resume from `next` after a failure.
        const all = Array.isArray(body.people) ? body.people : [];
        if (all.length > 100) return json({ error: "Send at most 100 people per call" }, 413);
        const people = all;
        const created: any[] = [], skipped: any[] = [];
        for (const p of people) { const r: any = await createOne(p); (r.reason ? skipped : created).push(r); }
        return json({ created, skipped });
      }
      case "resetPassword": {
        const email = String(body.email || "").toLowerCase(), id = await findMember(email, body.empId); if (!id) return json({ error: noLogin(email) }, 404);
        const pw = firstPassword();
        const { error } = await admin.auth.admin.updateUserById(id, { password: pw, app_metadata: { must_change: true } });
        if (error) return json({ error: error.message }, 400);
        await revoke(id);
        return json({ tempPassword: pw });
      }
      case "ban": case "unban": {
        const email = String(body.email || "").toLowerCase(), id = await findMember(email, body.empId); if (!id) return json({ error: noLogin(email), noLogin: true }, 404);
        if (body.action === "ban" && isMe(id)) return json({ error: "You cannot deactivate your own account" }, 400);
        const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: body.action === "ban" ? "876000h" : "none" }); if (error) return json({ error: error.message }, 400);
        const { error: e2 } = await admin.from("sf_member").update({ active: body.action === "unban" }).eq("org_id", org).eq("user_id", id);
        if (e2) return json({ error: e2.message }, 400);
        if (body.action === "ban") await revoke(id);
        return json({ ok: true });
      }
      case "setRole": {
        const email = String(body.email || "").toLowerCase(), id = await findMember(email, body.empId); if (!id) return json({ error: noLogin(email), noLogin: true }, 404);
        if (isMe(id) && body.role !== "Admin") return json({ error: "You cannot remove your own admin access. Ask another admin." }, 400);
        if (!ROLES.includes(body.role)) return json({ error: "Role must be Learner, Trainer or Admin" }, 400);
        const { error } = await admin.from("sf_member").update({ role: body.role, role_id: body.roleId ? String(body.roleId) : null }).eq("org_id", org).eq("user_id", id);
        if (error) return json({ error: error.message }, 400);
        // No session revoke: RLS (sf_ctx, 001:124) and both functions re-read role and active from sf_member on every
        // request, so the new role applies at once. The "re-roling" wording in 001:91 is wrong; see 003 header.
        return json({ ok: true });
      }
      case "rename": {
        const email = String(body.email || "").toLowerCase(), id = await findMember(email, body.empId); if (!id) return json({ ok: true, note: "no login" });
        const patch: any = { app_name: String(body.name || "").trim() }; if (body.empId) patch.emp_id = String(body.empId).trim().toUpperCase();
        const { error } = await admin.from("sf_member").update(patch).eq("org_id", org).eq("user_id", id);
        return error ? json({ error: error.message }, 400) : json({ ok: true });
      }
      default: return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {   // v37: never return internal messages; log them with an id the admin can quote
    const requestId = crypto.randomUUID(); console.error("admin-users", requestId, e);
    return json({ error: "Something went wrong. Quote this reference to support.", requestId }, 500);
  }
});
