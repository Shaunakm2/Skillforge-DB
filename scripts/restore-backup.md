# Restoring a Skillforge backup

1. Download the file from R2 (Cloudflare dashboard › R2 › bucket, or `aws s3 cp ... --endpoint-url https://<account>.r2.cloudflarestorage.com`).
2. Decrypt with the private key (kept offline): `age -d -i skillforge-backup.key skillforge-YYYYMMDDTHHMMSSZ.tar.gz.age | tar -xzf -`
3. Database (new or emptied project): `psql "$SUPABASE_DB_URL" -f roles.sql -f schema.sql -f data.sql`
4. Files: upload `storage/lms-files/*` and `storage/lms-scorm/*` back to the buckets with the same paths
   (Supabase CLI: `supabase storage cp -r storage/lms-files ss:///lms-files --experimental`).
5. Test restores regularly (e.g. quarterly) into a separate project.
