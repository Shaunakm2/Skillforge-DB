// Skillforge LMS — Edge Function "content" (v34). No JWT: the signed launch token IS the credential (verify_jwt = false).
//
// The SCORM content site (a SEPARATE origin on Cloudflare Pages) calls this function for every package file, so that site
// holds NO Supabase key at all. This function:
//   1. verifies the launch token's signature and expiry (HMAC with CONTENT_SIGNING_KEY, the same key "learning" signs with);
//   2. checks that the launch session is still the person's current one (sf_doc "scormSess": not ended, not idle-expired);
//   3. checks that the person's login is still active (deactivating someone ends their open packages at once);
//   4. returns a 60-second signed URL for exactly that file under exactly that package folder of the SCORM bucket.
//
//   POST { token, file: ["content", "index.html"] }  ->  200 { url }   403 link expired / not live   404 no such file
//
// Secrets: CONTENT_SIGNING_KEY (required), SCORM_BUCKET (default lms-scorm).
// Deploy:  supabase functions deploy content --no-verify-jwt        (the token is checked here, not by the gateway)
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, KEY = Deno.env.get("CONTENT_SIGNING_KEY") || "";
const BUCKET = Deno.env.get("SCORM_BUCKET") || "lms-scorm";
const H = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };   // no CORS: server-to-server only
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: H });

const b64uDecode = (s: string) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
async function verifyToken(token: string, nowSec = Math.floor(Date.now() / 1000)): Promise<any | null> {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig || !KEY) return null;
  let good = false;
  try {
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    good = await crypto.subtle.verify("HMAC", k, b64uDecode(sig), new TextEncoder().encode(body));
  } catch { return null; }
  if (!good) return null;
  let p: any; try { p = JSON.parse(new TextDecoder().decode(b64uDecode(body))); } catch { return null; }
  if (!p || typeof p.p !== "string" || typeof p.o !== "string" || !/^[A-Za-z0-9_-]+$/.test(p.o) || !/^[A-Za-z0-9_-]+\/scorm\/[A-Za-z0-9_-]+\/$/.test(p.p) || !p.p.startsWith(p.o + "/")) return null;
  if (typeof p.s !== "string" || !/^[a-f0-9]{16,64}$/.test(p.s) || typeof p.k !== "string" || !p.k || p.k.length > 200 || typeof p.e !== "string" || !p.e) return null;
  if (!(p.x > nowSec)) return null;
  return p;
}
// every part of the file path must be a plain name (this function is public, so it never trusts its caller to have checked)
const plainName = (x: unknown) => typeof x === "string" && x.length > 0 && x.length <= 255 && x !== "." && x !== ".." && !/[\/\\%\u0000-\u001f\u007f]/.test(x);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const raw = await req.text(); if (raw.length > 8192) return json({ error: "Too large" }, 413);
    let body: any; try { body = JSON.parse(raw); } catch { return json({ error: "Bad request" }, 400); }
    const tok = await verifyToken(String(body.token || ""));
    if (!tok) return json({ error: "This link has expired. Open the course again in Skillforge." }, 403);
    const file = Array.isArray(body.file) ? body.file : [];
    if (!file.length || file.length > 24 || !file.every(plainName)) return json({ error: "Not found" }, 404);

    const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const { data: row, error: e1 } = await admin.from("sf_doc").select("data").eq("org_id", tok.o).eq("coll", "scormSess").eq("key", tok.k).maybeSingle();
    if (e1) return json({ error: "Content service unavailable" }, 503);
    const d = row && row.data, until = d ? Date.parse(d.until) || 0 : 0;
    if (!d || d.sid !== tok.s || d.emp !== tok.e || d.prefix !== tok.p || d.ended || !(until > Date.now())) return json({ error: "This link has expired. Open the course again in Skillforge." }, 403);
    const { data: mem, error: e2 } = await admin.from("sf_member").select("active").eq("org_id", tok.o).eq("emp_id", tok.e).eq("active", true).maybeSingle();
    if (e2) return json({ error: "Content service unavailable" }, 503);
    if (!mem) return json({ error: "This link has expired. Open the course again in Skillforge." }, 403);

    const path = tok.p + file.join("/");
    if (!path.startsWith(tok.p)) return json({ error: "Not found" }, 404);
    const { data: signed, error: e3 } = await admin.storage.from(BUCKET).createSignedUrl(path, 60);
    if (e3 || !signed || !signed.signedUrl) return json({ error: "Not found" }, 404);
    return json({ url: signed.signedUrl });
  } catch (e) {
    const id = crypto.randomUUID(); console.error("content request failed", id, e);
    return json({ error: "The request could not be completed.", requestId: id }, 500);
  }
});
