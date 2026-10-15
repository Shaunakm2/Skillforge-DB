PDF.js 5.4.296 (legacy build), Apache-2.0 licence in LICENSE.
Vendored for Settings > Certificates: it draws page 1 of an uploaded PDF certificate design to a picture, in the browser.
It is loaded only when an admin chooses a PDF (js/admin/certificate-upload.js). Nothing is loaded from the internet.
Files: pdf.min.mjs (reader), pdf.worker.min.mjs (worker), standard_fonts/ (fallback fonts for PDFs that do not embed theirs).
Not shipped on purpose: WebAssembly decoders (the site's Content-Security-Policy does not allow WebAssembly), so a PDF whose pictures
are JPEG 2000 will not draw. Normal certificate PDFs (from Canva, PowerPoint, Word, Illustrator) are fine.
