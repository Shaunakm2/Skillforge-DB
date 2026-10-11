# Skillforge v26 security fixes

## Implemented in code

1. **Closed signed-file authorization bypass.** Learners can receive signed links only for exact file paths referenced by LCMS modules in courses assigned to them. Generic `courses/` and `certificates/` prefixes no longer authorize a file.
2. **Reduced signed-link exposure.** Signed URLs default to 10 minutes and are capped at 15 minutes through `SIGNED_URL_TTL_SECONDS`.
3. **Sanitized unexpected server errors.** HTTP 5xx responses now return a generic message and correlation ID. Full details stay in protected Edge Function logs.
4. **Added regression coverage.** Tests verify that guessed course and certificate paths are denied to learners.
5. **Added go-live gates.** Setup documentation now states the required controls for private storage, MFA, malware scanning, RLS testing and offline demo limitations.

## Already present and retained

- Server-side assessment grading and attempt limits.
- Random temporary passwords for connected accounts with mandatory first-login change.
- RLS-oriented collection controls and server-only SCORM sessions.
- Separate-origin SCORM execution, signed launch tokens and traversal defenses.
- CSP, HSTS, `nosniff`, restrictive referrer policy and permissions policy.
- Upload type/signature checks and SVG blocking.

## Requires deployment or external infrastructure

These cannot be completed by static source code alone:

- Deploying and validating Supabase RLS and Storage policies.
- Enabling MFA for GitHub, Supabase, Cloudflare and production administrators.
- Malware scanning/CDR service for uploaded content.
- Production secret rotation and access reviews.
- Short JWT expiry and revocation operating procedures.
- Independent authenticated penetration testing.
- Audit-log retention and alerting in the production environment.

The offline GitHub build remains a demonstration interface. It must contain synthetic data only and must not be considered secure authentication.
