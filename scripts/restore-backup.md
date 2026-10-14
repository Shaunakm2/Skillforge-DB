# Restoring a Skillforge backup (v41.18)

Backups are made by `.github/workflows/backup.yml` every night and kept for **30 days** as GitHub Actions artifacts
(GitHub › Actions › backup › a run › Artifacts). Each file is encrypted with the `BACKUP_PASSPHRASE` secret: keep a copy of
that passphrase somewhere safe outside GitHub, because without it the backup can't be opened.

1. Download the artifact (a `.zip` containing `skillforge-backup-YYYYMMDD-HHMM.tar.gz.enc`) and unzip it.
2. Decrypt and unpack:
   `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in skillforge-backup-….tar.gz.enc -out backup.tar.gz -pass pass:'<passphrase>'`
   `tar -xzf backup.tar.gz` → folders `backup/db` (sf_doc.json, sf_member.json, sf_audit.json) and `backup/storage`.
3. Database (new or emptied project): run all migrations (`supabase/migrations/001…008`), then load the JSON rows, e.g. in
   the SQL editor or with `psql`:
   `insert into sf_doc select * from jsonb_populate_recordset(null::sf_doc, '<contents of sf_doc.json>'::jsonb);`
   (same for `sf_member`; logins in `sf_member` must point to users that exist in Authentication: recreate them with
   Settings › Platform › Database & storage › Create logins, which also issues new temporary passwords).
4. Files: upload `backup/storage/lms-files/*` and `backup/storage/lms-scorm/*` back to the buckets with the same paths
   (Supabase CLI: `supabase storage cp -r backup/storage/lms-files ss:///lms-files --experimental`).
5. Practise a restore into a separate test project now and then (e.g. quarterly).

Not included: Supabase Authentication passwords (they can't be exported) and the audit trigger state. The backup files
hold personal data: share them only with people who may see it.
