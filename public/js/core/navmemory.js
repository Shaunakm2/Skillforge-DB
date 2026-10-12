/* Skillforge LMS — remembers which page is open, so a browser refresh returns to it (v41.2).
 * Kept in sessionStorage (this tab only, gone when the tab closes), tied to the signed-in person's name.
 * Only plain navigation keys are stored; access is still checked by the normal screen permissions after restore. */
const NavMemory = (() => {
  const KEY = 'sf-nav', KEYS = ['screen', 'navFrom', 'courseId', 'lessonKey', 'itemIdx', 'repType', 'mdTab', 'mdList', 'tileGroup', 'trTab', 'adminView', 'setTab', 'batchId'];
  const LEARN = ['item', 'course', 'lesson', 'quiz'];
  let last = '';
  const plain = v => v === null || ['string', 'number', 'boolean'].includes(typeof v);
  function save(s) {
    const o = { who: s.meName || '' }; KEYS.forEach(k => { if (plain(s[k])) o[k] = s[k]; });
    if (LEARN.includes(o.screen) && s.screen === 'quiz') o.screen = 'course';   // never re-open a quiz attempt mid-way
    const t = JSON.stringify(o); if (t === last) return; last = t;
    try { sessionStorage.setItem(KEY, t); } catch (e) {}
  }
  function load(state, who) {
    let o; try { o = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { o = null; }
    if (!o || typeof o.screen !== 'string' || !o.screen || o.who !== who) return null;
    // a course page needs its course; if it is gone (deleted, not assigned) go to the page the person came from
    if (LEARN.includes(o.screen)) { const ok = (state.adminCourses || []).some(c => c.id === o.courseId) || (typeof COURSES !== 'undefined' && COURSES.some(c => c.id === o.courseId));
      if (!ok) { o.screen = o.navFrom && !LEARN.includes(o.navFrom) ? o.navFrom : 'home'; } }
    const out = {}; KEYS.forEach(k => { if (k in o && plain(o[k])) out[k] = o[k]; });
    return out;
  }
  function clear() { last = ''; try { sessionStorage.removeItem(KEY); } catch (e) {} }
  return { save, load, clear };
})();
