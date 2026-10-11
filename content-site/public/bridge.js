/* Skillforge SCORM bridge — runs inside the package on the CONTENT origin.
 * Gives the package the standard SCORM 1.2 (window.API) and SCORM 2004 (window.API_1484_11) objects. Calls are
 * answered from a local copy (SCORM calls are synchronous) and every change is sent to the Skillforge app with
 * postMessage, addressed only to the app's origin. The package never touches the app's window, storage or session.
 * Initial values (resume point, suspend data) arrive in the launch URL fragment: #sfcmi=<base64url JSON>.
 */
(function () {
  var me = document.currentScript, APP = me && me.getAttribute('data-app-origin');
  try { if (window.parent !== window && (window.parent.API || window.parent.API_1484_11)) return; } catch (e) {}   // nested frame: use the parent's
  if (!APP) return;
  var cmi = {}, last = '0', inited = false;
  try { var m = location.hash.match(/sfcmi=([^&]+)/); if (m) { var s = m[1].replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; cmi = JSON.parse(decodeURIComponent(escape(atob(s)))) || {}; } } catch (e) { cmi = {}; }
  var ALIAS = { 'cmi.location': 'cmi.core.lesson_location', 'cmi.completion_status': 'cmi.core.lesson_status', 'cmi.success_status': 'cmi.core.lesson_status', 'cmi.score.raw': 'cmi.core.score.raw',
    'cmi.learner_name': 'cmi.core.student_name', 'cmi.learner_id': 'cmi.core.student_id', 'cmi.entry': 'cmi.core.entry', 'cmi.exit': 'cmi.core.exit', 'cmi.session_time': 'cmi.core.session_time' };
  var send = function (op, k, v) { try { window.parent.postMessage({ sf: 'scorm', op: op, k: k, v: v }, APP); } catch (e) {} };
  var get = function (k) { last = '0';
    if (k === 'cmi.core.entry' || k === 'cmi.entry') return cmi['cmi.core.lesson_location'] || cmi['cmi.suspend_data'] ? 'resume' : 'ab-initio';
    var v = cmi[k] != null ? cmi[k] : cmi[ALIAS[k]]; return v == null ? '' : String(v); };
  var set = function (k, v) { if (typeof k !== 'string' || k.length > 255) { last = '201'; return 'false'; } v = String(v); if (v.length > 65536) { last = '405'; return 'false'; }
    cmi[k] = v; if (ALIAS[k]) cmi[ALIAS[k]] = v; send('set', k, v); last = '0'; return 'true'; };
  var init = function () { if (!inited) { inited = true; send('init'); } last = '0'; return 'true'; };
  var fin = function () { send('commit'); send('finish'); return 'true'; };
  var errs = { '0': 'No error', '201': 'Invalid argument', '301': 'Not initialized', '405': 'Value too long' };
  window.API = { LMSInitialize: init, LMSFinish: fin, LMSGetValue: get, LMSSetValue: set, LMSCommit: function () { send('commit'); return 'true'; },
    LMSGetLastError: function () { return last; }, LMSGetErrorString: function (c) { return errs[c] || 'Error'; }, LMSGetDiagnostic: function () { return ''; } };
  window.API_1484_11 = { Initialize: init, Terminate: fin, GetValue: get, SetValue: set, Commit: function () { send('commit'); return 'true'; },
    GetLastError: function () { return last; }, GetErrorString: function (c) { return errs[c] || 'Error'; }, GetDiagnostic: function () { return ''; } };
  window.addEventListener('pagehide', function () { send('commit'); });
})();
