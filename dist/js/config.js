/* Skillforge LMS — connection settings.
 * Leave SUPABASE_URL empty to run the app in the browser with sample data (no backend).
 * Fill both values to use Supabase (see SETUP-SUPABASE.md). The anon key is public by design:
 * Row Level Security in the database decides what each signed-in person can read and write.
 */
window.SKILLFORGE_CONFIG = {
  SUPABASE_URL: 'https://mkujaqcmhwrkqdbxdvfd.supabase.co',          // e.g. 'https://abcdefghijkl.supabase.co'
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rdWphcWNtaHdya3FkYnhkdmZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MzU3MjIsImV4cCI6MjEwNzMxMTcyMn0.uTgk7jwvpTMl0NwzcLY8K7CBzGti5iuYIcx4yEVko0g',     // Project Settings > API > anon public key
  ORG_ID: 'ims',                // REQUIRED with Supabase: your organisation id (no default; the app refuses to start without it)
  STORAGE_BUCKET: 'lms-files',
  CONTENT_ORIGIN: 'https://skillforge-db.pages.dev',        // the SCORM content site, e.g. 'https://content.example.com' (separate origin; also the same value in the "learning" function's CONTENT_ORIGIN secret)
  SESSION_STORAGE: 'session',// 'session' (default): the sign-in lasts until the tab/browser is closed. 'local': survives closing the browser (less safe on shared PCs)
};
