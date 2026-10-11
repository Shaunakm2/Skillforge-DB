/* Skillforge LMS — connection settings.
 * Leave SUPABASE_URL empty to run the app in the browser with sample data (no backend).
 * Fill both values to use Supabase (see SETUP-SUPABASE.md). The anon key is public by design:
 * Row Level Security in the database decides what each signed-in person can read and write.
 */
window.SKILLFORGE_CONFIG = {
  SUPABASE_URL: '',          // e.g. 'https://abcdefghijkl.supabase.co'
  SUPABASE_ANON_KEY: '',     // Project Settings > API > anon public key
  ORG_ID: '',                // REQUIRED with Supabase: your organisation id (no default; the app refuses to start without it)
  STORAGE_BUCKET: 'lms-files',
  CONTENT_ORIGIN: '',        // the SCORM content site, e.g. 'https://content.example.com' (separate origin; also the same value in the "learning" function's CONTENT_ORIGIN secret)
  SESSION_STORAGE: 'session',// 'session' (default): the sign-in lasts until the tab/browser is closed. 'local': survives closing the browser (less safe on shared PCs)
};
