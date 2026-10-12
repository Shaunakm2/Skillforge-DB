/* Skillforge LMS — Settings › Roles & permissions.
 * Create roles, pick a base user type and the Settings modules the role can use, and set default courses.
 * Anyone given the role inherits its access, and its courses are assigned to them.
 */
SkillforgeApp.prototype.amRoles = function (c) {
  const { INK, W } = c; let { s } = c;
  if (this._scrV !== 'perms') return {};
  const SEC = { users:'User management', content:'Learning content', delivery:'Training delivery', comms:'Communication', reports:'Reports', platform:'Platform', migration:'Migration' };
  const members = r => s.users.filter(u => u.roleId === r.id);
  if (!(s.roles || []).length) s = { ...s, roles: ROLES0.filter(r => r.builtin) };   // v41.5: never an empty role list
  const cur = s.roles.find(r => r.id === s.roleSel) || s.roles[0];
  const D = s.roleDraft && s.roleDraft.id === cur.id ? s.roleDraft : null;
  const R = D || cur, isAdminBase = R.base === 'Admin';
  const setD = patch => this.setState(st => ({ roleDraft: { ...(st.roleDraft && st.roleDraft.id === cur.id ? st.roleDraft : JSON.parse(JSON.stringify(cur))), err:'', ...patch } }));
  const dirty = !!D;
  const plus30 = Progress.plus(TODAY_KEY, 30);
  const groups = Object.keys(SEC).map(k => ({ title: SEC[k], perms: MODULES.filter(m => m[2] === k).map(([key, label]) => { const on = isAdminBase || !!(R.perms || {})[key];
    return { label, on, tick: on ? '✓' : '', bg: on ? INK : W, bd: on ? INK : '#BFCFDB', lock: isAdminBase, toggle: () => { if (isAdminBase) return this.toastMsg('Admin roles always have every permission'); setD({ perms: { ...(R.perms || {}), [key]: !on } }); } }; }) }));
  return {
    rlList: s.roles.map(r => { const on = r.id === cur.id, n = members(r).length, np = r.base === 'Admin' ? MODULES.length : Object.values(r.perms || {}).filter(Boolean).length;
      return { name: r.name, base: r.base, sub: n + (n === 1 ? ' person' : ' people') + ' · ' + np + (np === 1 ? ' permission' : ' permissions'), tag: r.builtin ? 'Default' : 'Custom', bg: on ? '#EDF5FA' : W, bd: on ? '#0066A1' : '#D7E3EC',
        pick: () => this.setState({ roleSel: r.id, roleDraft:null }) }; }),
    rl: R, rlDirty: dirty, rlClean: !dirty, rlErr: !!(D && D.err), rlBuiltin: !!cur.builtin,
    rlBaseOpts: ['Learner', 'Trainer', 'Admin'].map(v => UI.chip(R.base, v, v, () => { if (cur.builtin) return this.toastMsg('The base type of a default role can’t change'); setD({ base: v }); })),
    setRlName: e => setD({ name: e.target.value }), setRlDesc: e => setD({ desc: e.target.value }),
    rlGroups: groups, rlAdminNote: isAdminBase,
    rlCourses: s.adminCourses.filter(a => a.status === 'Published').map(a => { const on = (R.courses || []).includes(a.id);
      return { label: a.code + ' · ' + a.title, bg: on ? '#CCFBF1' : W, border: on ? '#08AE6E' : '#C9D7E2', pick: () => setD({ courses: on ? R.courses.filter(x => x !== a.id) : (R.courses || []).concat([a.id]) }) }; }),
    rlMembers: members(cur).map(u => ({ name: u.name, sub: u.empId + ' · ' + u.dept })), rlNoMembers: !members(cur).length,
    rlMemberCount: members(cur).length + (members(cur).length === 1 ? ' person has this role' : ' people have this role'),
    rlDiscard: () => this.setState({ roleDraft:null }),
    rlSave: () => {
      const nm = (R.name || '').trim();
      if (!nm) return setD({ err:'Give the role a name.' });
      if (s.roles.some(r => r.id !== cur.id && r.name.toLowerCase() === nm.toLowerCase())) return setD({ err:'Another role is already called ' + nm + '.' });
      const rec = { ...R, name: nm, desc: (R.desc || '').trim(), perms: R.base === 'Admin' ? ALL_PERMS : R.perms }; delete rec.err;
      // People with the role get any newly added default courses.
      let enroll = s.enroll, added = 0;
      members(cur).forEach(u => { const a = Access.applyCourses(enroll, rec, u.name, plus30); enroll = a.enroll; added += a.added; });
      this.setState({ roles: s.roles.map(r => r.id === cur.id ? rec : r), roleDraft:null, enroll,
        users: s.users.map(u => u.roleId === cur.id ? { ...u, role: rec.base } : u) });
      this.logAudit('Changed role', nm); this.toastMsg('“' + nm + '” saved · applies to ' + members(cur).length + (members(cur).length === 1 ? ' person' : ' people') + (added ? ' · ' + added + ' course assignments' : ''));
    },
    rlNew: () => { const id = 'r' + Date.now(); this.setState({ roles: s.roles.concat([{ id, name:'New role', base:'Learner', builtin:false, desc:'', perms:{}, courses:[] }]), roleSel: id, roleDraft:null }); },
    rlCanDelete: !cur.builtin,
    rlDelete: () => { if (members(cur).length) return this.toastMsg(members(cur).length + ' people have this role. Give them another role first.'); this.setState({ roles: s.roles.filter(r => r.id !== cur.id), roleSel:'r_trainer', roleDraft:null }); this.toastMsg('“' + cur.name + '” deleted'); },
  };
};
