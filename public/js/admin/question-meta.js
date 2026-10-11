/* Skillforge LMS — question metadata, bulk upload and export.
 * Metadata on every question: skill, Bloom's level, tags and a reference ID (plus category and difficulty).
 * It makes it quick to find the right questions among thousands when building an assessment.
 * Bulk upload: CSV template → import → result with a rejected-rows file (reason per row).
 */
const QB_HEAD = ['Question', 'Type', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct answer', 'Explanation', 'Category', 'Difficulty', 'Skill', 'Bloom level', 'Tags', 'Points'];
const QB_TYPES_BULK = ['Multiple choice', 'Multiple select', 'True / False', 'Fill in the blank', 'Written answer', 'Likert scale'];
const tagsOf = v => String(v || '').split(/[;,]/).map(t => t.trim().toLowerCase()).filter(Boolean).filter((t, i, a) => a.indexOf(t) === i);
SkillforgeApp.prototype.amQuestionMeta = function (c) {
  const { s, role } = c;
  if (this._scrV !== 'qbank') return { qbBulkOpen:false };
  const B = s.qbBulk, setB = patch => this.setState(st => ({ qbBulk: { ...(st.qbBulk || {}), ...patch } }));
  const nextId = () => Math.max(0, ...s.qs.map(q => typeof q.id === 'number' ? q.id : 0)) + 1;
  const importCsv = () => {
    if (!B || !B.text) return setB({ msg:'Choose a file first.' });
    const rows = parseCsv(B.text); if (rows.length < 2) return setB({ msg: rows.length ? 'The file has a header row but no questions.' : 'The file is empty.' });
    const head = rows[0].map(h => h.trim().toLowerCase()), col = n => head.findIndex(h => h === n.toLowerCase());
    const I = Object.fromEntries(QB_HEAD.map(h => [h, col(h)]));
    if (I['Question'] < 0 || I['Type'] < 0) return setB({ msg:'The header row must include Question and Type. Download the template to see the format.' });
    const ok = [], bad = [], seen = new Set(s.qs.map(q => q.text.trim().toLowerCase()));
    let id = nextId();
    rows.slice(1).forEach((r, i) => { const n = i + 2, g = k => I[k] < 0 ? '' : (r[I[k]] || '').trim(), rej = why => bad.push({ n, raw: QB_HEAD.map(g), why });
      const text = g('Question'), type = QB_TYPES_BULK.find(t => t.toLowerCase() === g('Type').toLowerCase()), diff = ['Easy', 'Medium', 'Hard'].find(d => d.toLowerCase() === (g('Difficulty') || 'Medium').toLowerCase());
      const bloom = g('Bloom level') ? BLOOM.find(b => b.toLowerCase() === g('Bloom level').toLowerCase()) : 'Understand';
      if (!text) return rej('Question text is missing');
      if (!type) return rej(g('Type') ? '“' + g('Type') + '” can’t be bulk uploaded. Use: ' + QB_TYPES_BULK.join(', ') + ', or add it one by one' : 'Type is missing');
      if (!diff) return rej('Difficulty must be Easy, Medium or Hard');
      if (!bloom) return rej('Bloom level must be one of ' + BLOOM.join(', '));
      if (seen.has(text.toLowerCase())) return rej('This question is already in the bank (or earlier in the file)');
      const opts = ['Option A', 'Option B', 'Option C', 'Option D'].map(g).filter(Boolean), corr = g('Correct answer');
      const letters = corr.toUpperCase().split(/[;, ]+/).filter(Boolean), idx = letters.map(L => 'ABCD'.indexOf(L));
      let extra;
      if (type === 'Multiple choice' || type === 'Multiple select') {
        if (opts.length < 2) return rej('Give at least two options');
        if (!letters.length || idx.some(x => x < 0 || x >= opts.length)) return rej('Correct answer must be the option letter(s) given, e.g. B' + (type === 'Multiple select' ? ' or A;C' : ''));
        if (type === 'Multiple choice' && idx.length > 1) return rej('Multiple choice has one correct answer. Use Multiple select for more');
        extra = type === 'Multiple choice' ? { opts, ans: idx[0] } : { opts, answers: idx.sort() };
      } else if (type === 'True / False') { const v = corr.toLowerCase(); if (!['true', 'false', 'a', 'b'].includes(v)) return rej('Correct answer must be True or False'); extra = { opts:['True', 'False'], ans: v === 'true' || v === 'a' ? 0 : 1 }; }
      else if (type === 'Fill in the blank') { const acc = corr.split(';').map(x => x.trim()).filter(Boolean); if (!acc.length) return rej('Give the accepted answers in Correct answer, separated by ;'); if (!/_{3,}/.test(text)) return rej('Mark the blank in the question with ___'); extra = { accept: acc }; }
      else if (type === 'Written answer') { const pts = parseInt(g('Points') || '5', 10); if (![5, 10].includes(pts)) return rej('Points must be 5 or 10 for written answers'); extra = { points: pts, guide: g('Explanation') }; }
      else extra = {};
      seen.add(text.toLowerCase());
      const q = { id: id++, text, type, diff, topic: g('Category') || 'General', why: type === 'Written answer' ? '' : g('Explanation'), skill: g('Skill') || g('Category') || 'General', bloom, tags: tagsOf(g('Tags')), lang:'English', used:0, author: role.name, created: TODAY_KEY, media:null, ...extra };
      q.ref = 'QB-' + String(q.id).padStart(4, '0'); ok.push(q);
    });
    this.setState(st => ({ qs: ok.concat(st.qs), qbBulk: { ...st.qbBulk, msg:'', result:{ total: rows.length - 1, ok: ok.length, bad, skills: new Set(ok.map(q => q.skill)).size } } }));
  };
  const R = B && B.result;
  return {
    qbBulkOpen: !!B, qbB: B || {}, qbBMsg: !!(B && B.msg), qbBNoFile: !(B && B.text), qbBHasRes: !!R,
    qbOpenBulk: () => this.setState({ qbBulk: {} }), qbCloseBulk: () => this.setState({ qbBulk:null }),
    qbTemplate: () => { csvDownload('question-bank-template.csv', [QB_HEAD,
        ['What does the “O” in GROW stand for?', 'Multiple choice', 'Outcome', 'Options', 'Obstacles', 'Ownership', 'B', 'GROW is Goal, Reality, Options, Will.', 'Coaching', 'Easy', 'Coaching', 'Remember', 'grow;coaching-models', ''],
        ['Which are signs of passive resistance?', 'Multiple select', 'Missing related deadlines', 'Asking questions', 'Sticking with the old process', 'Proposing an alternative', 'A;C', '', 'Change management', 'Medium', 'Leading change', 'Analyze', 'resistance;scenario', ''],
        ['Lifts are safe to use in a fire.', 'True / False', '', '', '', '', 'False', 'Always use the stairs.', 'Workplace safety', 'Easy', 'Health & safety', 'Remember', 'fire;basics', ''],
        ['People judge a change by the ___ behind it.', 'Fill in the blank', '', '', '', '', 'why;reason', '', 'Change management', 'Easy', 'Leading change', 'Understand', 'change-story', ''],
        ['Describe how you would open a difficult 1:1.', 'Written answer', '', '', '', '', '', 'Names the issue, asks an open question, agrees a next step.', '1:1s', 'Hard', 'People management', 'Create', 'one-on-ones', '10']]);
      this.toastMsg('Template downloaded'); },
    qbPick: e => { const f = e.target.files && e.target.files[0]; if (!f) return; if (!/\.csv$/i.test(f.name)) { e.target.value = ''; return setB({ name:'', text:'', msg:'Upload a .csv file. In Excel, use File › Save As › CSV.' }); } f.text().then(t => setB({ name: f.name, text: t, msg:'', result:null })); },
    qbImport: importCsv,
    qbRes: R ? { okLine: R.ok ? R.ok + (R.ok === 1 ? ' question added' : ' questions added') + ' · ' + R.skills + (R.skills === 1 ? ' skill' : ' skills') : 'No questions were added.', hasOk: R.ok > 0, hasBad: R.bad.length > 0,
      badLine: R.bad.length + ' of ' + R.total + (R.total === 1 ? ' row' : ' rows') + ' not added.', badRows: R.bad.slice(0, 5).map(x => ({ n:'Row ' + x.n, why: x.why })), more: R.bad.length > 5 ? '+ ' + (R.bad.length - 5) + ' more in the download' : '' } : {},
    qbRejects: () => { csvDownload('question-upload-rejected-' + TODAY_KEY + '.csv', [['Row'].concat(QB_HEAD).concat(['Reason'])].concat(R.bad.map(x => [x.n].concat(x.raw).concat([x.why])))); this.toastMsg(R.bad.length + ' rejected rows downloaded'); },
    qbResetBulk: () => this.setState({ qbBulk: {} }),
    qbExport: () => { const act = s.qs.filter(q => !q.archived);
      const optsOf = q => q.type === 'Match the following' ? q.pairs.map(p => p[0] + ' → ' + p[1]) : q.type === 'Ordering' ? q.items : (q.opts || []).map(o => typeof o === 'string' ? o : o.label);
      const corrOf = q => q.type === 'Multiple select' ? (q.answers || []).map(i => 'ABCDEFGH'[i]).join(';') : ['Multiple choice', 'True / False', 'Image options'].includes(q.type) ? 'ABCDEFGH'[q.ans] : q.type === 'Fill in the blank' ? (q.accept || []).join(';') : q.type === 'Ordering' ? 'In the order listed' : q.type === 'Match the following' ? 'As paired' : q.type === 'Written answer' ? 'Rated 0–' + q.points : 'Not scored';
      const used = q => s.quizzes.filter(z => z.ids.includes(q.id)).map(z => z.name).join('; ');
      csvDownload('active-questions-' + TODAY_KEY + '.csv', [['Question ID', 'Reference', 'Question', 'Type', 'Option A', 'Option B', 'Option C', 'Option D', 'Option E', 'Option F', 'Correct answer', 'Explanation', 'Category', 'Difficulty', 'Skill', 'Bloom level', 'Tags', 'Language', 'Media', 'Author', 'Created', 'Used in quizzes']]
        .concat(act.map(q => { const o = optsOf(q); return [q.id, q.ref || '', q.text, q.type, o[0] || '', o[1] || '', o[2] || '', o[3] || '', o[4] || '', o[5] || '', corrOf(q), q.why || q.guide || '', q.topic, q.diff, q.skill || '', q.bloom || '', (q.tags || []).join('; '), q.lang || 'English', q.media ? q.media.kind + ': ' + q.media.name : '', q.author || '', q.created || '', used(q)]; })));
      this.toastMsg(act.length + ' active questions exported'); },
  };
};
