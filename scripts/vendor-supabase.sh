#!/usr/bin/env bash
# Downloads a pinned supabase-js build into public/vendor/ so the app never loads code from a CDN at runtime.
# Run ONCE and commit both files:  npm run vendor  &&  git add public/vendor/supabase.js public/vendor/supabase.js.sha384
#   • npm verifies the package tarball against the registry's integrity hash;
#   • the file's SHA-384 is recorded in supabase.js.sha384 the first time. Later runs (and CI) refuse a file that
#     does not match the recorded hash, so a changed or tampered copy cannot slip in unnoticed.
set -euo pipefail
VERSION="2.45.4"
cd "$(dirname "$0")/../public"
mkdir -p vendor
sum() { openssl dgst -sha384 -binary "$1" | openssl base64 -A; }
if [ ! -s vendor/supabase.js ]; then
  tmp="$(mktemp -d)"
  ( cd "$tmp" && npm pack "@supabase/supabase-js@${VERSION}" >/dev/null && tar -xzf supabase-supabase-js-${VERSION}.tgz )
  cp "$tmp/package/dist/umd/supabase.js" vendor/supabase.js
  rm -rf "$tmp"
fi
if [ -s vendor/supabase.js.sha384 ]; then
  [ "$(sum vendor/supabase.js)" = "$(cat vendor/supabase.js.sha384)" ] || { echo "vendor/supabase.js does not match vendor/supabase.js.sha384" >&2; exit 1; }
else
  sum vendor/supabase.js > vendor/supabase.js.sha384
fi
echo "vendor/supabase.js = @supabase/supabase-js@${VERSION}  sha384-$(cat vendor/supabase.js.sha384)"
