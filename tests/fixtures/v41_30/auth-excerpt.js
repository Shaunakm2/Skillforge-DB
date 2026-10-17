/* Skillforge LMS — sign-in screen, sign-out and the profile menu (top right). */
SkillforgeApp.prototype.vmAuth = function (c) {
  const { navItems, role, s } = c;
  const L0 = s.login, setL = patch => this.setState(st => ({ login: { ...st.login, err:'', info:'', ...patch } }));
  const doLogin = () => {}; const loginVals = {
    lgRemOn: !!L0.remember, lgRemember: () => setL({ remember: !L0.remember }), lgDemoOpen: !!s.lgDemo, toggleLgDemo: () => this.setState({ lgDemo: !s.lgDemo }), lgKey: e => { if (e.key === 'Enter') { doLogin(); return; } if (e.target && e.target.id === 'sf-pw' && e.getModifierState) { const on = !!e.getModifierState('CapsLock'); if (on !== !!this.state.lgCaps) this.setState({ lgCaps: on }); } }, lgKeyReset: e => { if (e.key === 'Enter') loginVals.sendReset(); },
    doLogin, lgSignin: s.loginView === 'signin',
  };
  return { authed: s.authed, ...loginVals, navItems, searchOpen: s.searchOpen, gq: s.gq, toggleSearch: () => this.setState({ searchOpen: !s.searchOpen, notifOpen:false, roleMenu:false, gq:'' }), setGq: e => this.setState({ gq: e.target.value }),
  };
};
