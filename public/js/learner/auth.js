/* Skillforge LMS — sign-in screen, sign-out and the profile menu (top right). */
SkillforgeApp.prototype.vmAuth = function (c) {
  const { navItems, role, s } = c;
  // sign in
  const RMAP = { 'Learner':'learner', 'Trainer':'instructor', 'Admin':'admin' };
  const L0 = s.login, setL = patch => this.setState(st => ({ login: { ...st.login, err:'', ...patch } }));
  const signInAs = u => {
    const rid = RMAP[u.role] || 'learner', r = ROLES.find(x => x.id === rid);
    try { if (L0.remember) localStorage.setItem('sf-remember', u.email); else localStorage.removeItem('sf-remember'); } catch (e) {}
    this.setState(st => ({ users: st.users.map(x => x.id === u.id ? { ...x, lastLogin:'Just now', status: x.status === 'Invited' ? 'Active' : x.status } : x), login: { ...st.login, pw:'', err:'' } }));
    this.go(r.home, { essPopup:true, authed:true, role:rid, meName:u.name, meRole:rid, meTitle:u.designation || u.role, adminView:false, roleMenu:false, notifOpen:false });
    this.toastMsg('Welcome, ' + u.name.split(' ')[0]);
  };
  const doLogin = () => {
    // Username = work email or employee ID.
    const em = L0.email.trim().toLowerCase();
    if (!em) return setL({ err:'Enter your username.' });
    if (!L0.pw) return setL({ err:'Enter your password.' });
    // With Supabase: Supabase Auth checks the password (email, or employee ID resolved on the server). Role and
    // person come from the server (sf_member), never from the editable user record.
    if (Backend.on) { setL({ busy:true });
      Backend.signIn(L0.email.trim(), L0.pw).then(() => Backend.afterSignIn()).then(r => this.onBackendSignedIn(r))
        .catch(e => setL({ busy:false, err: /invalid/i.test(e.message || '') ? 'That username and password don’t match. Check them and try again.' : (e.message || String(e)) }));
      return; }
    const u = s.users.find(x => x.email.toLowerCase() === em || (x.empId || '').toLowerCase() === em);
    if (!u || L0.pw !== (s.passwords[u.email] || DEMO_PASSWORD)) return setL({ err:'That username and password don’t match. Check them and try again.' });
    if (u.status === 'Deactivated') return setL({ err:'This account is deactivated. Contact your L&D administrator.' });
    if (u.expires && u.expires < TODAY_KEY) return setL({ err:'This account expired on ' + Fmt.medium(u.expires) + '. Contact your L&D administrator.' });
    // sign-in record for the User login report (connected: written by the server, action signedIn)
    this.setState(st => { const l = (st.loginLog || {})[u.name] || { n:0, by:{} }, now = new Date().toISOString(), m = /@/.test(em) ? 'email' : 'emp';
      return { loginLog: { ...(st.loginLog || {}), [u.name]: { n: l.n + 1, first: l.first || now, last: now, by: { ...l.by, [m]: (l.by[m] || 0) + 1 } } } }; });
    signInAs(u);
  };
  this._signInAs = signInAs;
  const loginVals = {
    brandInitial: (s.brandName || 'S').trim().charAt(0).toUpperCase(), lg: L0, lgErr: !!L0.err, lgPwType: L0.show ? 'text' : 'password', lgShowLabel: L0.show ? 'Hide' : 'Show',
    setLgEmail: e => setL({ email: e.target.value }), setLgPw: e => setL({ pw: e.target.value }), toggleLgShow: () => setL({ show: !L0.show }),
    lgRemOn: !!L0.remember, lgRemember: () => setL({ remember: !L0.remember }), lgDemoOpen: !!s.lgDemo, toggleLgDemo: () => this.setState({ lgDemo: !s.lgDemo }), lgKey: e => { if (e.key === 'Enter') doLogin(); }, doLogin,
    lgSignin: s.loginView === 'signin', lgForgot: s.loginView === 'forgot', lgSent: s.loginView === 'sent', lgNewPw: s.loginView === 'newpw',
    // First sign-in (or after an admin reset): the temporary password must be replaced.
    setLgNew: e => setL({ npw: e.target.value }), setLgNew2: e => setL({ npw2: e.target.value }),
    saveNewPw: () => { const a = L0.npw || '', b = L0.npw2 || '';
      if (a.length < 10 || !/[a-z]/.test(a) || !/[A-Z]/.test(a) || !/\d/.test(a)) return setL({ err:'Use at least 10 characters with upper- and lower-case letters and a number.' });
      if (a !== b) return setL({ err:'The two passwords don’t match.' });
      setL({ busy:true }); Backend.setNewPassword(a).then(() => Backend.afterSignIn()).then(r => { this.setState(st => ({ login: { ...st.login, npw:'', npw2:'' } })); this.onBackendSignedIn(r); })
        .catch(e => setL({ busy:false, err: e.message || String(e) })); },
    goForgot: () => this.setState({ loginView:'forgot', login: { ...L0, err:'' } }), goSignin: () => this.setState({ loginView:'signin', login: { ...L0, err:'' } }),
    sendReset: () => { if (!L0.email.trim()) return setL({ err:'Enter your username.' }); if (Backend.on) { const u = s.users.find(x => (x.empId || '').toLowerCase() === L0.email.trim().toLowerCase()); Backend.resetLink(u ? u.email : L0.email.trim()).catch(() => {}); } this.setState({ loginView:'sent' }); },
    // Microsoft sign-in: real OAuth through Supabase (Azure provider) when connected; a demo shortcut offline.
    ssoLogin: () => { if (Backend.on) return Backend.client().auth.signInWithOAuth({ provider:'azure', options:{ scopes:'email', redirectTo: location.origin + location.pathname } });
      const u = s.users.find(x => x.email.toLowerCase() === L0.email.trim().toLowerCase()); if (u && u.status !== 'Deactivated') signInAs(u); else setL({ err:'Enter your work email first, then continue with Microsoft.' }); },
    // Demo accounts as role chips inside the card: one tap fills the username and password.
    demoAccounts: [['Learner', 'Maya Okafor', '#007A4D'], ['Trainer', 'Daniel Reyes', '#5B7DB8'], ['Admin', 'Lena Fischer', '#8C5A9E']].map(([r, n, col]) => { const u = s.users.find(x => x.name === n); if (!u) return null; const on = L0.email === u.email;
      return { name: n, role: r, first: n.split(' ')[0], fg: col, bd: on ? col : '#D7E3EC', bg: on ? col + '14' : '#FFFFFF', pick: () => this.setState({ lgDemo:false, login: { ...L0, email:u.email, pw:DEMO_PASSWORD, err:'' } }) }; }).filter(Boolean),
    // Connected mode configured but the Supabase client file is missing: say so instead of failing silently.
    lgSetupErr: Backend.configured && !Backend.on ? 'Setup is incomplete: js/config.js points to Supabase but vendor/supabase.js is missing. Run scripts/vendor-supabase.sh (see SETUP-SUPABASE.md).' : '',
    demoPw: DEMO_PASSWORD, lgShowDemo: !Backend.on, lgBusy: !!L0.busy, lgBtnLabel: L0.busy ? 'Signing in…' : 'Login',
    // Login background: decorative shapes drift slightly with the pointer (direct style update, no re-render).
    lgParallax: e => { const el = e.currentTarget, r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      el.querySelectorAll('.lgx-i').forEach(n => { const d = +n.dataset.d || 0; n.style.translate = (x * d).toFixed(1) + 'px ' + (y * d).toFixed(1) + 'px'; }); },
    signOut: () => { if (Backend.on) { Backend.signOut().finally(() => location.reload()); return; } this.setState({ authed:false, roleMenu:false, notifOpen:false, meName:null, meRole:null, loginView:'signin', gq:'', userModal:false, qModal:false, annModal:false, enrModal:null, attModal:null, cDraft:null, mod:null, modPreview:null, bDraft:null, ttDraft:null, sm:null, caM:null, am:null }); window.scrollTo(0, 0); },
  };
  const meUser = s.users.find(u => u.name === role.name) || {};
  const acctMenu = { me: { name: role.name, initials: ini(role.name), type: role.label, email: meUser.email || '', sub: (meUser.designation || role.label) + (meUser.empId ? ' · ' + meUser.empId : '') },
    goAccount: () => this.go('account', { acctTab:'profile', adminView:false, acctDraft:null }), goPrefs: () => this.go('account', { acctTab:'prefs', adminView:false, acctDraft:null }), goSecurity: () => this.go('account', { acctTab:'security', adminView:false, acctDraft:null }),
    goHelp: () => this.go('account', { acctTab:'help', adminView:false, acctDraft:null }), menuSettings: (this._perms || new Set()).size > 0, goSettingsMenu: () => this.go('admin', { adminView:true, setTab:null }) };
  return {
    authed: s.authed,
    notAuthed: !s.authed,
    ...loginVals,
    ...acctMenu,
    navItems,
    searchOpen: s.searchOpen,
    gq: s.gq,
    toggleSearch: () => this.setState({ searchOpen: !s.searchOpen, notifOpen:false, roleMenu:false, gq:'' }),
    setGq: e => this.setState({ gq: e.target.value }),
    roleMenu: s.roleMenu,
    roleLabel: role.label,
    persona: { name: role.name, initials: ini(role.name) },
  };
};
