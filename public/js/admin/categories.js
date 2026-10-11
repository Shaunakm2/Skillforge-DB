/* Skillforge LMS — three-level course categories. */
SkillforgeApp.prototype.amCategories = function (c) {
  const { s } = c;
  // categories (3 levels)
  const coursesUsing = (level, id) => s.adminCourses.filter(c => c[level] === id).length;
  const catOps = (level, list, setList) => {
    const key = { c:'catId', s:'subId', ss:'subsubId' }[level];
    return list.map(item => {
      const editing = s.catEdit && s.catEdit.level === level && s.catEdit.id === item.id;
      const selected = level === 'c' ? s.catSel.c === item.id : level === 's' ? s.catSel.s === item.id : false;
      const used = coursesUsing(key, item.id);
      return { ...item, editing, viewing: !editing, editVal: editing ? s.catEdit.name : '', count: used + (used === 1 ? ' course' : ' courses') + (item.subs ? ' · ' + item.subs.length + ' sub' : ''),
        bg: selected ? '#EDF5FA' : '#FFFFFF', border: selected ? '#0066A1' : '#D7E3EC',
        pick: () => { if (level === 'c') this.setState({ catSel: { c:item.id, s:(item.subs[0] || {}).id || null } }); else if (level === 's') this.setState({ catSel: { ...s.catSel, s:item.id } }); },
        edit: e => { e.stopPropagation(); this.setState({ catEdit: { level, id:item.id, name:item.name } }); },
        setEdit: e => this.setState({ catEdit: { ...s.catEdit, name: e.target.value } }),
        cancel: e => { e.stopPropagation(); this.setState({ catEdit:null }); },
        save: e => { e.stopPropagation(); const nm = s.catEdit.name.trim(); if (!nm) return this.toastMsg('Name cannot be empty'); if (list.some(x => x.id !== item.id && x.name.toLowerCase() === nm.toLowerCase())) return this.toastMsg('“' + nm + '” already exists here'); setList(list.map(x => x.id === item.id ? { ...x, name:nm } : x)); this.setState({ catEdit:null }); this.toastMsg('Renamed to ' + nm); },
        del: e => { e.stopPropagation(); const desc = level === 'c' ? item.subs.flatMap(x => [x.id].concat(x.subs.map(y => y.id))) : level === 's' ? item.subs.map(y => y.id) : []; const n = used + s.adminCourses.filter(c => desc.includes(c.subId) || desc.includes(c.subsubId)).length; if (n) return this.toastMsg('In use by ' + n + (n === 1 ? ' course' : ' courses') + '. Move them to another category first.'); setList(list.filter(x => x.id !== item.id)); if (level === 'c' && s.catSel.c === item.id) this.setState({ catSel: { c:null, s:null } }); if (level === 's' && s.catSel.s === item.id) this.setState({ catSel: { ...s.catSel, s:null } }); this.toastMsg('“' + item.name + '” deleted'); } };
    });
  };
  const selCat = s.cats.find(c => c.id === s.catSel.c) || null;
  const selSub = selCat ? selCat.subs.find(x => x.id === s.catSel.s) || null : null;
  const setCats = cats => this.setState({ cats });
  const setSubs = subs => setCats(s.cats.map(c => c.id === selCat.id ? { ...c, subs } : c));
  const setSubSubs = subs => setSubs(selCat.subs.map(x => x.id === selSub.id ? { ...x, subs } : x));
  const addCat = (level) => {
    const nm = (s.catNew[level] || '').trim(); if (!nm) return this.toastMsg('Type a name first');
    const list = level === 'c' ? s.cats : level === 's' ? selCat.subs : selSub.subs;
    if (list.some(x => x.name.toLowerCase() === nm.toLowerCase())) return this.toastMsg('“' + nm + '” already exists here');
    const id = level + Date.now(), item = level === 'ss' ? { id, name:nm } : { id, name:nm, subs:[] };
    if (level === 'c') { setCats(s.cats.concat([item])); this.setState({ catSel: { c:id, s:null } }); }
    else if (level === 's') { setSubs(selCat.subs.concat([item])); this.setState({ catSel: { ...s.catSel, s:id } }); }
    else setSubSubs(selSub.subs.concat([item]));
    this.setState(st => ({ catNew: { ...st.catNew, [level]:'' } })); this.toastMsg('“' + nm + '” added');
  };
  const catVals = {
    catCols: [
      { title:'Category', hint:'Top level, e.g. Leadership', items: catOps('c', s.cats, setCats), show:true, level:'c' },
      { title:'Sub category', hint: selCat ? 'Inside ' + selCat.name : 'Select a category', items: selCat ? catOps('s', selCat.subs, setSubs) : [], show: !!selCat, level:'s' },
      { title:'Sub-sub category', hint: selSub ? 'Inside ' + selCat.name + ' › ' + selSub.name : 'Select a sub category', items: selSub ? catOps('ss', selSub.subs, setSubSubs) : [], show: !!selSub, level:'ss' },
    ].map(col => ({ ...col, empty: col.show && !col.items.length, newVal: s.catNew[col.level] || '', setNew: e => { const v = e.target.value; this.setState(st => ({ catNew: { ...st.catNew, [col.level]: v } })); }, add: () => addCat(col.level), addKey: e => { if (e.key === 'Enter') addCat(col.level); } })),
  };
  return {
    ...catVals,
  };
};
