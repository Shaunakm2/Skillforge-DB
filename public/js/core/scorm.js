/* Skillforge LMS — SCORM runtime (SCORM 1.2 "API" and SCORM 2004 "API_1484_11").
 * A launched package (same origin, in the player iframe) finds the API on window.parent and calls
 * Initialize / GetValue / SetValue / Commit / Terminate. The runtime keeps the CMI data per person, course and
 * step, saves the resume point (lesson_location / location + suspend_data) as the SCORM bookmark, records the
 * score, and completes the course step when the package reports completed / passed.
 * Packages that only post a message ({ type:'scorm', status:'completed' }) still work.
 * Note: unpacking an uploaded .zip in the browser is not supported in this prototype; packages are served as
 * extracted folders (in production the server extracts the zip and serves imsmanifest.xml's launch file).
 */
const ScormRT = (() => {
  let ctx = null; const store = {}; let lastErr = '0';
  const key = () => ctx ? ctx.user + '|' + ctx.courseId + '|' + ctx.item : '';
  const data = () => store[key()] || (store[key()] = { 'cmi.core.lesson_status':'not attempted', 'cmi.completion_status':'not attempted', 'cmi.core.entry':'ab-initio' });
  const ALIAS = { 'cmi.location':'cmi.core.lesson_location', 'cmi.score.raw':'cmi.core.score.raw', 'cmi.learner_name':'cmi.core.student_name', 'cmi.learner_id':'cmi.core.student_id', 'cmi.entry':'cmi.core.entry' };
  /* v41.18: one status for the LMS. SCORM 1.2: lesson_status. SCORM 2004 keeps completion_status and success_status
   * apart (they used to overwrite each other): passed wins; failed stays failed; otherwise completion_status. */
  const status = d => { const c = String(d['cmi.completion_status'] || '').toLowerCase(), sc = String(d['cmi.success_status'] || '').toLowerCase(), l = String(d['cmi.core.lesson_status'] || '').toLowerCase();
    const is04 = (c && c !== 'not attempted') || (sc && sc !== 'unknown');
    if (!is04) return l;
    if (sc === 'passed') return 'passed'; if (sc === 'failed') return 'failed'; if (c === 'completed') return 'completed'; return c || l; };
  const check = () => { if (!ctx) return 'true'; const d = data(); if (!d.done && /^(completed|passed)$/.test(status(d))) { d.done = true; if (ctx.onComplete) ctx.onComplete(d.score); } return 'true'; };
  const get = k => { if (!ctx) { lastErr = '301'; return ''; } lastErr = '0'; const d = data();
    if (k === 'cmi.core.student_name' || k === 'cmi.learner_name') return ctx.user; if (k === 'cmi.core.student_id' || k === 'cmi.learner_id') return ctx.empId || ctx.user;
    if (k === 'cmi.core.entry' || k === 'cmi.entry') return d['cmi.core.lesson_location'] || d['cmi.suspend_data'] ? 'resume' : 'ab-initio';
    return d[k] != null ? String(d[k]) : d[ALIAS[k]] != null ? String(d[ALIAS[k]]) : ''; };
  const set = (k, v) => { if (!ctx) { lastErr = '301'; return 'false'; } lastErr = '0'; v = String(v); const d = data(); d[k] = v; if (ALIAS[k]) d[ALIAS[k]] = v;
    if (/lesson_location$|^cmi\.location$/.test(k) && ctx.onBookmark) ctx.onBookmark(v);
    if (k === 'cmi.suspend_data' && ctx.onBookmark) ctx.onBookmark(null, v);
    if (/score\.raw$/.test(k)) d.score = Math.max(0, Math.min(100, parseFloat(v) || 0));
    // v41.18: 1.2 lesson_status and 2004 success_status are final on their own; a 2004 completion_status alone is checked
    // at Commit / Terminate, so a "failed" sent right after "completed" is seen first.
    if (/lesson_status$|success_status$/.test(k)) check();
    return 'true'; };
  const api12 = { LMSInitialize: () => 'true', LMSFinish: check, LMSGetValue: get, LMSSetValue: set, LMSCommit: check, LMSGetLastError: () => lastErr, LMSGetErrorString: c => ({ '0':'No error', '301':'Not initialized' })[c] || 'Error', LMSGetDiagnostic: () => '' };
  const api04 = { Initialize: () => 'true', Terminate: check, GetValue: get, SetValue: set, Commit: check, GetLastError: () => lastErr, GetErrorString: c => ({ '0':'No error', '301':'Not initialized' })[c] || 'Error', GetDiagnostic: () => '' };
  if (typeof window !== 'undefined') { window.API = api12; window.API_1484_11 = api04; }
  return { bind: c => { ctx = c; }, clear: () => { ctx = null; }, reset: (user, courseId, item) => { delete store[user + '|' + courseId + '|' + item]; }, peek: () => ({ ...data() }), status: d => status(d || data()) };
})();
