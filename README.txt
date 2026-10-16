Sign-in card fix for short windows
1) PREVIEW NOW (no deploy): open your live sign-in page, press F12, open the Console tab, paste the contents of preview-in-browser-console.js, press Enter.
   The card should grow to full size and centre itself. Refresh the page to undo.
2) DEPLOY: upload public/css/styles.css to GitHub (replaces the file), commit.
   Then rebuild dist/ if your site serves a committed dist/: in a Codespace run  npm run build  and commit dist/ (dist/css/styles.css must change too).
3) Hard refresh (Ctrl+Shift+R). To confirm it is live, open /css/styles.css on your site and search for  short windows.
This styles.css = the v41.21 styles.css + the sign-in refresh + this fix. If you changed styles.css yourself since the sign-in refresh, send it to me and I will apply the fix to your copy.
