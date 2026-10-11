# Skillforge content site (SCORM)

A second Cloudflare Pages project on its **own origin** (for example `content.example.com`, never a sub-path of
the app). It serves extracted SCORM packages from the private `lms-scorm` bucket using launch tokens issued by the
Edge Function `learning`. Package code runs here and can't reach the app's session.

- Root directory: `content-site` · Build command: none · Output directory: `public`
- Environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (encrypted), `CONTENT_SIGNING_KEY` (encrypted;
  same value as the Supabase secret), `APP_ORIGIN` (e.g. `https://lms.example.com`)

Each request needs a valid token **and** a live launch session in the database (`sf_doc` collection `scormSess`,
read with the service-role key). Relaunching, leaving the step, signing out, or 30 minutes without a heartbeat
ends the session. Paths come from the raw URL and are decoded once. A segment containing `/`, `\`, `%`, a control
character, `.` or `..` is refused, so the storage URL can't leave the package.

Before go-live, run on staging:
`curl -s -o /dev/null -w "%{http_code}" "https://content.example.com/c/<valid token>/..%2F..%2F..%2F..%2Flms-files%2F<org>%2Fx"`
It must print 403 or 404.
