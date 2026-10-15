Skillforge sign-in refresh + 45-minute activity rule (v41.22)
Extract, then upload the "public" and "tests" folders to the repo (Add file > Upload files). GitHub merges them.
  public/index.html            sign-in card markup (keeps your Home level-name and certificate-upload edits)
  public/js/learner/auth.js    sign-in logic
  public/js/app.js             45-minute activity rule
  public/css/styles.css        new sign-in styles (appended at the end)
  tests/e2e/v41_22_e2e.py      new test (90 checks)
  tests/e2e/backend_e2e.py, attack_e2e.py   two old tests updated for the new rule
Then run: npm run build   and commit dist/
