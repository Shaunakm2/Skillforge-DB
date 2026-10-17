Skillforge question bank update (metadata, marks, static / dynamic assessments, rejected-row export)

Copy each file over the file with the same name in your project (same folder layout):
  public/index.html
  public/js/core/assessment.js
  public/js/admin/questions.js
  public/js/admin/question-list.js
  public/js/admin/question-meta.js
  public/js/admin/quizzes.js
  public/js/admin/lcms.js
  supabase/functions/_shared/assessment.js      (identical to public/js/core/assessment.js; the project test checks they match)
question-bank-template.csv is the new upload template (it is also what the Template button downloads).

These files were built on the versions you attached on 17 Oct. If you changed any of them since, send me the newer copy first.
After copying: run `npm test`, then `node scripts/build.mjs` (refreshes dist/), and redeploy the app. Redeploy the Edge Functions too
(Actions > deploy-functions) so the server copy of assessment.js is used.
