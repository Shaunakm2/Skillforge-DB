/* Skillforge LMS — Settings › Training places: classrooms with site, seating capacity, layout and IT infrastructure.
 * Batches pick a room; the batch form warns when the room is too small or under maintenance. */
const PLACE_IT = [['pcs', 'PCs / laptops', 'num'], ['headsets', 'Headsets', 'num'], ['projector', 'Projector', 'bool'], ['vc', 'Video conferencing', 'bool'], ['wifi', 'Wi-Fi', 'bool'], ['whiteboard', 'Whiteboard', 'bool']];
const PLACE_LAYOUTS = ['Classroom', 'U-shape', 'Boardroom', 'Pods', 'Theatre'];
SkillforgeApp.prototype.amPlaces = function (c) {
  const { s } = c;
  if (this._scrV !== 'places') return { isPlaces:false, plModal:false };
  const q = (s.plQuery || '').trim().toLowerCase();
  const usedBy = p => s.batches.filter(b => b.placeId === p.id && batchStatus(b) !== 'Completed');
  const itText = p => PLACE_IT.filter(([k, , t]) => t === 'num' ? p.it[k] > 0 : p.it[k]).map(([k, l, t]) => t === 'num' ? p.it[k] + ' ' + l.toLowerCase() : l).join(' · ') || 'No IT equipment';
  const rows = s.places.filter(p => !q || (p.name + ' ' + p.site + ' ' + p.floor + ' ' + p.layout).toLowerCase().includes(q)).map(p => { const ub = usedBy(p);
    return { ...p, itText: itText(p), seats: p.capacity + ' seats', stBg: p.status === 'Available' ? '#DCFCE7' : '#FEF3C7', stFg: p.status === 'Available' ? '#166534' : '#92400E',
      used: ub.length ? ub.map(b => b.code).join(', ') : 'Free', edit: () => this.setState({ plDraft: JSON.parse(JSON.stringify({ ...p, err:'' })) }),
      del: () => { if (ub.length) return this.toastMsg('Booked by ' + ub.map(b => b.code).join(', ') + '. Move those batches first.'); this.setState({ places: s.places.filter(x => x.id !== p.id) }); this.toastMsg(p.name + ' removed'); } }; });
  const D = s.plDraft, setD = patch => this.setState(st => ({ plDraft: { ...st.plDraft, err:'', ...patch } }));
  const modal = !D ? { plModal:false } : {
    plModal:true, pl: D, plErr: !!D.err, plTitle: D.id ? 'Edit room' : 'Add a training room',
    setPl: { name: e => setD({ name: e.target.value }) }, setPlSite: e => setD({ site: e.target.value }), setPlFloor: e => setD({ floor: e.target.value }), setPlNotes: e => setD({ notes: e.target.value }),
    setPlCap: e => setD({ capacity: e.target.value === '' ? '' : parseInt(e.target.value, 10) }),
    plLayouts: PLACE_LAYOUTS.map(v => UI.chip(D.layout, v, v, () => setD({ layout: v }))),
    plStatus: ['Available', 'Under maintenance'].map(v => UI.chip(D.status, v, v, () => setD({ status: v }))),
    plIt: PLACE_IT.map(([k, l, t]) => ({ label: l, isNum: t === 'num', isBool: t === 'bool', val: D.it[k] || 0, set: e => setD({ it: { ...D.it, [k]: Math.max(0, parseInt(e.target.value, 10) || 0) } }), ...UI.toggle(!!D.it[k], () => setD({ it: { ...D.it, [k]: !D.it[k] } })) })),
    plSave: () => { const nm = (D.name || '').trim();
      if (!nm) return setD({ err:'Give the room a name.' }); if (!(D.site || '').trim()) return setD({ err:'Add the site or building.' });
      if (!(D.capacity >= 1 && D.capacity <= 500)) return setD({ err:'Seating capacity must be 1 to 500.' });
      if (s.places.some(p => p.id !== D.id && p.name.toLowerCase() === nm.toLowerCase() && p.site === D.site)) return setD({ err:'There is already a room called ' + nm + ' at ' + D.site + '.' });
      const rec = { ...D, name: nm, site: D.site.trim(), floor: (D.floor || '').trim(), notes: (D.notes || '').trim() }; delete rec.err;
      const small = s.batches.filter(b => b.placeId === rec.id && batchStatus(b) !== 'Completed' && b.trainees.length > rec.capacity);
      this.setState({ places: D.id ? s.places.map(p => p.id === D.id ? rec : p) : s.places.concat([{ ...rec, id:'p' + Date.now() }]), plDraft:null });
      this.toastMsg(nm + ' saved' + (small.length ? ' · too small for ' + small.map(b => b.code).join(', ') : '')); },
    plClose: () => this.setState({ plDraft:null }),
  };
  return { isPlaces:true, ...modal, plRows: rows, plEmpty: !rows.length, plQuery: s.plQuery || '', setPlQuery: e => this.setState({ plQuery: e.target.value }),
    plStats: [['Rooms', s.places.length], ['Seats', s.places.reduce((t, p) => t + p.capacity, 0)], ['Available', s.places.filter(p => p.status === 'Available').length], ['Booked now', s.places.filter(p => usedBy(p).length).length]].map(([l, v]) => ({ l, v })),
    plNew: () => this.setState({ plDraft: { id:null, name:'', site:'Ahmedabad HQ', floor:'', capacity:20, layout:'Classroom', status:'Available', it:{ pcs:0, headsets:0, projector:true, vc:false, wifi:true, whiteboard:true }, notes:'', err:'' } }) };
};
