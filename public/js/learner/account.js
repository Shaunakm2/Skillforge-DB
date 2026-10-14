/* Skillforge LMS — My account (opened from the profile menu, top right).
 *  Profile      Contact details the person can change (phone, preferred name). Name, email, employee ID,
 *               department and user type are managed by an admin.
 *  Preferences  Notifications, time zone, date format, daily goal, leaderboard visibility, reduced motion.
 *  Security     Change password (prototype: kept in state.passwords and used at sign-in).
 *  Help         Who to contact and quick answers.
 * Adds SkillforgeApp.prototype.accountVals(), merged into renderVals() by app.js.
 */
const PREF_DEFAULTS = { notif:{ assign:true, due:true, ann:true, digest:false, inapp:true }, tz:'Asia/Kolkata', dateFmt:'MMM D, YYYY', goal:15, leaderboard:true, motion:false };
const TIMEZONES = [['Asia/Kolkata', 'India (IST, UTC+5:30)'], ['Europe/London', 'London (UK)'], ['Europe/Berlin', 'Central Europe (CET)'], ['America/New_York', 'US Eastern'], ['America/Los_Angeles', 'US Pacific'], ['Asia/Singapore', 'Singapore (SGT)'], ['Australia/Sydney', 'Sydney (AEST)']];
const prefsFor = (s, name) => { const p = (s.prefs || {})[name] || {}; return { ...PREF_DEFAULTS, ...p, notif: { ...PREF_DEFAULTS.notif, ...(p.notif || {}) } }; };

SkillforgeApp.prototype.accountVals = function (s, role) {
  const me = role.name, u = s.users.find(x => x.name === me) || { name: me, email:'', role: role.label };
  const P = prefsFor(s, me);
  const base = { rootCls: P.motion ? 'sf-reduce-motion' : '' };
  if (this._scrV !== 'account') return { ...base, isAccount:false };
  const W = '#FFFFFF', INK = '#16324F';
  const tg = (on, fn) => ({ on: !!on, track: on ? '#08AE6E' : '#C9D7E2', knob: on ? '21px' : '3px', toggle: fn });
  const setP = patch => this.setState(st => { const cur = prefsFor(st, me); return { prefs: { ...st.prefs, [me]: { ...cur, ...patch, notif: { ...cur.notif, ...(patch.notif || {}) } } } }; });
  const D = s.acctDraft || { phone: u.phone || '', preferred: u.preferred || '' };
  const setD = patch => this.setState(st => ({ acctDraft: { ...(st.acctDraft || D), ...patch } }));
  const pw = s.pwForm, setPw = patch => this.setState(st => ({ pwForm: { ...st.pwForm, err:'', ok:'', ...patch } }));
  const TABS = [['profile', 'Account settings'], ['prefs', 'Preferences'], ['security', 'Password & security'], ['help', 'Help & support']];
  const myCourses = Object.keys(s.enroll[me] || {}).length, myBatches = s.batches.filter(b => b.trainees.includes(me) || b.trainer === me).length;
  const fmtDate = k => k ? new Date(k + 'T12:00:00').toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) : '—';
  const strength = v => { let n = 0; if (v.length >= 8) n++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) n++; if (/\d/.test(v)) n++; if (/[^A-Za-z0-9]/.test(v)) n++; return n; };
  const st = strength(pw.next || ''), STR = [['', '#C9D7E2'], ['Weak', '#D64545'], ['Fair', '#0066A1'], ['Good', '#08AE6E'], ['Strong', '#007A4D']][st];
  return {
    ...base, isAccount: true,
    acTabs: TABS.map(([k, l]) => { const on = s.acctTab === k; return { label: l, bg: on ? INK : 'transparent', fg: on ? '#F8FBFD' : '#334E68', pick: () => this.setState({ acctTab:k }) }; }),
    acProfile: s.acctTab === 'profile', acPrefs: s.acctTab === 'prefs', acSecurity: s.acctTab === 'security', acHelp: s.acctTab === 'help',
    ac: { name: u.name, initials: ini(u.name), type: u.role, typeDesc: { Learner:'Learner (trainee) access', Trainer:'Learner access + trainer Settings', Admin:'Learner access + full Settings' }[u.role] || '', sub: (u.designation || '') + (u.dept ? ' · ' + u.dept : ''),
      stats: [['Assigned courses', myCourses], ['Batches', myBatches], ['XP', fmt(LearnXP.of(s, me))]].map(([l, v]) => ({ l, v })) },
    acFixed: [['Full name', u.name], ['Work email (username)', u.email], ['Employee ID', u.empId], ['User type', u.role], ['Department', u.dept], ['Designation', u.designation], ['Manager', u.manager], ['Date of joining', fmtDate(u.joined)]].map(([l, v]) => ({ l, v: v || '—' })),
    acD: D, setAcPhone: e => setD({ phone: e.target.value }), setAcPreferred: e => setD({ preferred: e.target.value }),
    acDirty: (D.phone || '') !== (u.phone || '') || (D.preferred || '') !== (u.preferred || ''),
    acClean: !((D.phone || '') !== (u.phone || '') || (D.preferred || '') !== (u.preferred || '')),
    acSave: () => { const ph = (D.phone || '').trim();
      if (ph && ph.replace(/\D/g, '').length < 7) return this.toastMsg('Phone number looks too short');
      if ((D.preferred || '').length > 40) return this.toastMsg('Preferred name is too long');
      if (Backend.on) { Backend.call('updateProfile', { phone: ph, preferred: (D.preferred || '').trim() }).then(() => { this.setState({ acctDraft:null }); this.toastMsg('Account details saved'); }).catch(e => this.toastMsg(e.message)); return; }
      this.setState(x => ({ users: x.users.map(y => y.name === me ? { ...y, phone: ph, preferred: (D.preferred || '').trim() } : y), acctDraft:null })); this.toastMsg('Account details saved'); },
    acDiscard: () => this.setState({ acctDraft:null }),
    // preferences
    pfNotif: [['assign', 'A course is assigned to me'], ['due', 'Due-date reminders (7 days and 1 day before)'], ['ann', 'New announcements'], ['digest', 'Weekly progress digest'], ['inapp', 'In-app notifications (bell icon)']]
      .map(([k, l]) => ({ label: l, ...tg(P.notif[k], () => setP({ notif: { [k]: !P.notif[k] } })) })),
    pfTzOpts: TIMEZONES.map(([v, l]) => ({ v, l })), pfTz: P.tz, setPfTz: e => { setP({ tz: e.target.value }); this.toastMsg('Time zone saved'); },
    pfDateOpts: ['MMM D, YYYY', 'D MMM YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY'].map(v => ({ v, l: v })), pfDate: P.dateFmt, setPfDate: e => { setP({ dateFmt: e.target.value }); this.toastMsg('Date format saved'); },
    pfGoals: [10, 15, 30, 45].map(v => { const on = P.goal === v; return { label: v + ' min', bg: on ? INK : W, fg: on ? '#F8FBFD' : INK, border: on ? INK : '#C9D7E2', pick: () => setP({ goal:v }) }; }),
    pfBoard: tg(P.leaderboard, () => setP({ leaderboard: !P.leaderboard })), pfMotion: tg(P.motion, () => setP({ motion: !P.motion })),
    pfReset: () => { this.setState(x => { const pr = { ...x.prefs }; delete pr[me]; return { prefs: pr }; }); this.toastMsg('Preferences reset to defaults'); },
    // security
    pw, setPwCur: e => setPw({ cur: e.target.value }), setPwNext: e => setPw({ next: e.target.value }), setPwConf: e => setPw({ conf: e.target.value }),
    pwStrLabel: STR[0], pwStrColor: STR[1], pwStrW: (st * 25) + '%', pwErr: !!pw.err, pwOk: !!pw.ok,
    pwRules: [['At least 10 characters', (pw.next || '').length >= 10], ['Upper- and lower-case letters and a number', /[a-z]/.test(pw.next || '') && /[A-Z]/.test(pw.next || '') && /\d/.test(pw.next || '')], ['Different from your current password', !!pw.next && pw.next !== pw.cur]].map(([t, okk]) => ({ t, mark: okk ? '✓' : '·', fg: okk ? '#166534' : '#6E8796' })),
    pwSave: () => {
      const cur = s.passwords[u.email] || DEMO_PASSWORD;
      if (!pw.cur) return setPw({ err:'Enter your current password.' });
      if (!Backend.on && pw.cur !== cur) return setPw({ err:'Your current password is incorrect.' });
      // Same rule as the server (it refused 8-character passwords the screen accepted).
      if ((pw.next || '').length < 10 || !/[a-z]/.test(pw.next) || !/[A-Z]/.test(pw.next) || !/\d/.test(pw.next)) return setPw({ err:'Use at least 10 characters with upper- and lower-case letters and a number.' });
      if (pw.next === pw.cur) return setPw({ err:'Choose a password you haven’t just used.' });
      if (pw.next !== pw.conf) return setPw({ err:'The two new passwords don’t match.' });
      if (Backend.on) { Backend.signIn(u.email, pw.cur).then(() => Backend.setNewPassword(pw.next)).then(() => this.setState({ pwForm: { cur:'', next:'', conf:'', err:'', ok:'Password changed. Use it the next time you sign in.' } }))
        .catch(e => setPw({ err: /invalid/i.test(e.message || '') ? 'Your current password is incorrect.' : 'Could not change the password: ' + e.message })); return; }
      this.setState(x => ({ passwords: { ...x.passwords, [u.email]: pw.next }, pwForm: { cur:'', next:'', conf:'', err:'', ok:'Password changed. Use it the next time you sign in.' } }));
    },
    acLastLogin: u.lastLogin || 'Just now',
    // help
    hpRows: [['How do I find my assigned courses?', 'Home shows what’s due soon. Catalog › “Assigned to me” lists every course assigned to you.'], ['I ran out of assessment attempts', 'Ask your L&D admin. They can give extra attempts from Settings › Assessment attempt management.'], ['My name, email or department is wrong', 'Ask an admin to update it in Users & accounts.'], ['I can’t open a document or video', 'Check that pop-ups are allowed, then try again. If it still fails, contact L&D support below.']].map(([q, a]) => ({ q, a })),
    hpContact: 'L&D support · contact your L&D administrator',
  };
};
