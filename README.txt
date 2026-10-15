Skillforge v41.23: team panel, no Northwind, certificates of any shape

HOW TO PUT IT LIVE
1. Extract this zip. In GitHub: Add file > Upload files, drag the extracted folders in (public, supabase, tests, SETUP-SUPABASE.md), commit.
   GitHub merges them into the existing folders.
2. Rebuild: npm run build, then commit dist/ too. The old bundles dist/js/app.<hash>.js still contain the word Northwind: delete them
   (the build keeps only the newest one).
3. Hard refresh (Ctrl+F5).

WHAT CHANGED
1. Course page "From your team": real teammates only (same manager, else same department) who have that course; hidden when there are none.
   Removed the invented "★ New (0 learners)", the "Foundational" level on every database course, and "and a certificate" on courses without one.
   player.js, courses.js, index.html
2. Northwind removed: certificate default footer, ZingHR address, UserMaster template sample rows, master-data brands, holiday name,
   sample course text, demo e-mail domain, setup docs. The only remaining mention is the legacy cleaner in backend.js that ERASES old sign-in text.
   seed.js, masters.js, scale.js, training-gen.js, batches.js, zinghr.js, users.js, user-import.js, assignments.js, mis.js,
   certificate-default.svg, SETUP-SUPABASE.md, 001_skillforge.sql, index.html (Employee ID example)
3. Certificates: any shape. The design keeps its own shape (A4 landscape, A4 portrait, US Letter, square, your own size from 1:4 to 4:1);
   the PDF page has the same shape. Certificate ID is a field you can drag, resize, recolour or switch off.
   certificates.js, certificate-upload.js, certificate-pdf.js, extras.js (data), index.html

seed.js: the attachment did not open as a file in my workspace, so I edited the v41.21 copy (its text matched what I read from your attachment).
If you changed seed.js yourself since v41.21, do not replace it; make these 5 edits instead:
  - title:'Northwind safety policy (intranet)'          ->  title:'Company safety policy (intranet)'
  - url:'https://example.com/northwind/safety-policy'   ->  url:'https://example.com/safety-policy'
  - ...follow the Northwind code of conduct.            ->  ...follow the company code of conduct.
  - ...for everyone at Northwind. Read the handbook...  ->  ...for everyone at the company. Read the handbook...
  - '@northwind.com' (in USERS0)                         ->  '@example.com'

TESTS: tests/e2e/v41_23_e2e.py is new (73 checks). Other tests only changed the internal test organisation id / e-mail domain.
