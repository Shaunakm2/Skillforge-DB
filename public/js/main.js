/* Skillforge LMS — v41.31: every page has its own link (address bar).
 *
 * Until now the app changed pages without changing the address, so every page showed the same link. This file gives
 * each page its own address, without changing how pages are opened:
 *
 *   #/home, #/catalog, #/progress, #/calendar, #/docs, #/search ...   learner pages
 *   #/course/<course id>                                              a course (also while a step, lesson or assessment is open)
 *   #/settings                                                        Settings home
 *   #/settings/<screen>   e.g. #/settings/qbank, #/settings/users      a Settings screen
 *   #/<screen>            e.g. #/gradebook                             any other page outside Settings
 *
 * - Copy, bookmark or share a link: opening it goes to that page, after sign-in if needed.
 * - Refresh stays on the page. Back / Forward keep working as before (v41.8), now with the right address.
 * - Access rules are unchanged: a link to a page the person's role can't open shows "no access", as before.
 * - An unknown page or a course that doesn't exist opens Home (with a short message).
 * - Sign-in links from Supabase (password reset, "#access_token=...") are never touched: only addresses starting "#/" are read.
 * - After an automatic sign-out for inactivity, the next person does NOT land on the previous person's page.
 *
 * v41.31: placed here in main.js (loaded after app.js), so index.html and the build file list need no change.
 */
(function () {
  if (typeof SkillforgeApp === 'undefined') return;
  const P = SkillforgeApp.prototype;
  const LEARN = ['item', 'course', 'lesson', 'quiz'];
  const enc = v => encodeURIComponent(String(v));
  const dec = v => { try { return decodeURIComponent(v); } catch (e) { return ''; } };

  /* Every page name the app knows: learner pages, pages with an access rule, pages in the menu tree, and the ones app.js names. */
  function knownScreens() {
    const k = new Set(['admin', 'gradebook', 'team', 'analytics', 'builder']);
    try { LEARNER_SCREENS.forEach(x => k.add(x)); } catch (e) {}
    try { Object.keys(Access.screenPerms || {}).forEach(x => k.add(x)); } catch (e) {}
    try { Object.keys(PARENT || {}).forEach(x => k.add(x)); } catch (e) {}
    LEARN.forEach(x => k.delete(x));   // opened only through #/course/<id>
    return k;
  }

  function courseExists(s, id) {
    if ((s.adminCourses || []).some(c => String(c.id) === id)) return true;
    try { return !!Progress.courseOf(s, id); } catch (e) { return false; }
  }

  /* The address of the page on screen. */
  P.routeOf = function (s) {
    s = s || this.state;
    if (LEARN.includes(s.screen)) return s.courseId != null && s.courseId !== '' ? '#/course/' + enc(s.courseId) : '#/home';
    if (s.screen === 'admin') return '#/settings';
    return (s.adminView ? '#/settings/' : '#/') + enc(s.screen || 'home');
  };

  /* An address -> { screen, extra } to open, { bad } for an unknown page, or null when it isn't one of ours. */
  P.routeParse = function (hash) {
    hash = String(hash || '');
    if (!/^#\/[^]*/.test(hash)) return null;
    const parts = hash.slice(2).split('/').filter(Boolean).map(dec), s = this.state, known = knownScreens();
    if (!parts.length) return { screen: 'home', extra: { adminView: false } };
    if (parts[0] === 'course') {
      const id = parts[1] || '';
      return id && courseExists(s, id) ? { screen: 'course', extra: { courseId: id, from: 'home', adminView: false } } : { bad: 'That course link isn’t valid or the course no longer exists.' };
    }
    if (parts[0] === 'settings') {
      if (!parts[1]) return { screen: 'admin', extra: { adminView: true } };
      return known.has(parts[1]) ? { screen: parts[1], extra: { adminView: true } } : { bad: 'That Settings link isn’t valid.' };
    }
    return known.has(parts[0]) ? { screen: parts[0], extra: { adminView: false } } : { bad: 'That link isn’t valid.' };
  };

  /* Puts the current page's address in the address bar, on the SAME history entry (no extra Back steps). */
  P.syncUrl = function () {
    if (!this.state.authed) return;
    const want = this.routeOf(this.state);
    if (location.hash === want) return;
    try { history.replaceState(history.state, '', location.pathname + location.search + want); } catch (e) {}
  };

  P.openRoute = function (r) {
    if (!r) return;
    if (r.bad) { this.go('home', { adminView: false }); this.toastMsg(r.bad + ' Home was opened instead.'); return; }
    if (r.screen === this.state.screen && this.routeOf(this.state) === this.routeOf({ ...this.state, ...r.extra, screen: r.screen })) return this.syncUrl();
    this.go(r.screen, { ...this.closeOverlays(), ...r.extra });
  };

  /* go(): unchanged, then the address follows the page. */
  const goOrig = P.go;
  P.go = function (screen, extra) { goOrig.call(this, screen, extra); this.syncUrl(); };

  /* Back / Forward: unchanged. If an unsaved editor kept you on the page, the address is put back to this page. */
  const backOrig = P.onBrowserBack;
  P.onBrowserBack = function (e) { backOrig.call(this, e); this.syncUrl(); };

  const mountOrig = P.componentDidMount;
  P.componentDidMount = function () {
    // The link the tab was opened with, kept until sign-in. Not kept after an automatic sign-out (shared PCs).
    let idle = false; try { idle = !!sessionStorage.getItem('sf-idle'); } catch (e) {}
    this._deepLink = !idle && /^#\//.test(location.hash) ? location.hash : null;   // parsed after sign-in, when the courses are loaded
    if (idle && /^#\//.test(location.hash)) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
    if (mountOrig) mountOrig.call(this);
    // Typing or pasting an address in the bar of an open tab.
    window.addEventListener('hashchange', () => {
      const r = this.routeParse(location.hash); if (!r) return;
      if (!this.state.authed) { this._deepLink = location.hash; return; }
      if (!r.bad && this.routeOf(this.state) === location.hash) return;   // Back / Forward already handled it
      const ed = this.dirtyEditor();
      if (ed && !window.confirm('You have unsaved changes in this ' + ed + '. Leave without saving?')) return this.syncUrl();
      this.openRoute(r);
    });
  };

  /* The saved link is opened once, after sign-in and (connected) after the data has loaded. */
  const renderOrig = P.renderVals;
  P.renderVals = function () {
    const s = this.state;
    if (this._deepLink && !this._deepBusy && s.authed && (!Backend.on || s.beReady)) {
      const r = this._deepLink; this._deepBusy = true;
      setTimeout(() => { this._deepLink = null; this._deepBusy = false; if (this.state.authed) this.openRoute(this.routeParse(r)); }, 0);
    }
    return renderOrig.call(this);
  };
})();

/* Skillforge LMS — bootstrap */
document.addEventListener('DOMContentLoaded', () => {
  Skillforge.mount(new SkillforgeApp(), document.getElementById('app-template'), document.getElementById('app'));
});
