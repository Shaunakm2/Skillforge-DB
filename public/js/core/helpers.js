/* Skillforge LMS — shared helpers used across feature modules. */
const UI = {
  W:'#FFFFFF', INK:'#16324F',
  /* Switch: { on, track, knob, toggle } for the toggle-switch markup. */
  toggle: (on, fn) => ({ on: !!on, track: on ? '#08AE6E' : '#C9D7E2', knob: on ? '21px' : '3px', toggle: fn }),
  /* Chip / segmented button: dark when selected. */
  chip: (cur, v, label, pick) => { const on = cur === v; return { label, bg: on ? '#16324F' : '#FFFFFF', fg: on ? '#F8FBFD' : '#16324F', border: on ? '#16324F' : '#C9D7E2', pick }; },
};

/* Download rows as a UTF-8 CSV file (Excel-friendly).
 * Formula injection guard (OWASP “CSV injection”): a text cell that starts with = + - @ tab or CR would run as a
 * formula when the file is opened in Excel, so it gets a leading apostrophe. Plain numbers (−12, +3.5, 40%) are kept. */
const csvSafe = v => { if (typeof v === 'number') return String(v); const t = String(v == null ? '' : v);
  return /^[=+\-@\t\r]/.test(t) && !/^[-+]?\d[\d,]*(\.\d+)?%?$/.test(t) ? "'" + t : t; };
const csvDownload = (name, rows) => {
  const cell = v => { const t = csvSafe(v); return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const csv = '\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/* CSV parser: quotes, escaped quotes, commas and newlines inside quotes, BOM, CRLF. */
const parseCsv = text => { const rows = []; let row = [], cell = '', q = false; text = text.replace(/^\ufeff/, '');
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c; }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== '')); };

/* Cached date formatting: Intl formatting is slow (~0.15 ms a call), and big reports format tens of thousands
   of dates, so each distinct value is formatted once. */
const Fmt = (() => {
  const mk = opts => { const f = new Intl.DateTimeFormat('en-US', opts), m = new Map(); return k => { if (!k) return ''; let v = m.get(k); if (v === undefined) { v = f.format(new Date(k.length === 10 ? k + 'T12:00:00' : k)); m.set(k, v); } return v; }; };
  return { short: mk({ month:'short', day:'numeric' }), medium: mk({ month:'short', day:'numeric', year:'numeric' }), dt: mk({ month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) };
})();
/* Pagination for long tables: returns the slice for the current page plus pager controls. */
const Pager = (app, s, key, list, size) => {
  size = size || 50; const pages = Math.max(1, Math.ceil(list.length / size)), page = Math.min(pages, Math.max(1, (s.pages || {})[key] || 1));
  const go = n => () => app.setState(st => ({ pages: { ...(st.pages || {}), [key]: n } }));
  return { rows: list.slice((page - 1) * size, page * size), pager: { show: pages > 1, label: list.length ? ((page - 1) * size + 1).toLocaleString('en-US') + '–' + Math.min(page * size, list.length).toLocaleString('en-US') + ' of ' + list.length.toLocaleString('en-US') : '0',
    page, pages, canPrev: page > 1, canNext: page < pages, noPrev: page <= 1, noNext: page >= pages, prev: go(page - 1), next: go(page + 1), first: go(1), last: go(pages) } };
};
/* Tile management (Settings › Master data › Tile management): each tile group can be reordered, renamed and
   hidden. Tiles carry a stable key; the configuration lives in s.tiles[group] = { order:[keys], hide:{}, label:{} }. */
const TILE_GROUPS = {
  home: ['Home · learner tiles', 'The five tiles under “Good morning” on Home.'],
  settings: ['Settings · module tiles', 'Every tile in the Admin Console (within its section).'],
  batchcard: ['Batch cards · figures', 'The small figures on each batch card in Batch management.'],
  training: ['Training overview · KPIs', 'The KPI tiles at the top of Training overview & MIS.'],
  nav: ['Learner menu', 'The menu at the top of every page: rename, hide or reorder items.'],
};
/* App settings (Settings › Master data › App settings): feature switches and defaults. */
const PLATFORM0 = { feat: { game:true, badges:true, paths:true, discussions:true, calendar:true, accessReq:true, essPopup:true, anns:true },
  defaults: { password:'Pass@123', dueDays:30, essDays:30, idleMins:30 } };
const PLATFORM_FEATS = [['game', 'XP, levels, quests and leaderboards', 'Gamification on Home and My learning.'], ['badges', 'Badges', 'The badges section on My learning.'], ['paths', 'Learning path on Home', 'The “My learning path” card on Home.'],
  ['discussions', 'Discussions', 'The Discussions page and menu item.'], ['calendar', 'Calendar', 'The Calendar page and menu item.'], ['accessReq', 'Request access from the catalog', 'Learners can ask for courses that are not assigned to them.'],
  ['essPopup', 'Overdue essential-training pop-up', 'Shown at sign-in when a new joiner is past an essential-training deadline.'], ['anns', 'Announcements on Home', 'Homepage banners from Settings › Announcements.']];
/* Default due date for new assignments: today + App settings › default due days (30 when not set). */
const defaultDue = s => Progress.plus(TODAY_KEY, Math.max(1, +(((s && s.platform) || PLATFORM0).defaults || {}).dueDays || 30));
/* A real calendar date in YYYY-MM-DD (rejects 2026-02-31, which new Date() silently turns into March 3). */
const realDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); if (!m) return false; const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return t.getUTCFullYear() === +m[1] && t.getUTCMonth() === +m[2] - 1 && t.getUTCDate() === +m[3]; };
const Tiles = {
  apply(s, group, list, keyOf, setLabel) {
    const cfg = (s.tiles || {})[group] || {}, order = cfg.order || [], hide = cfg.hide || {}, label = cfg.label || {};
    const pos = k => { const i = order.indexOf(k); return i < 0 ? 1e6 : i; };
    return list.map((x, i) => [x, i]).filter(([x]) => !hide[keyOf(x)])
      .sort((a, b) => pos(keyOf(a[0])) - pos(keyOf(b[0])) || a[1] - b[1])
      .map(([x]) => label[keyOf(x)] ? setLabel(x, label[keyOf(x)]) : x);
  },
};
