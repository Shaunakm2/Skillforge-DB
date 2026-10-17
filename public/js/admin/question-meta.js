/* Skillforge LMS — question bank: bulk upload, template and export.
 *
 * v41.22: one upload format, one row per question. Header names are matched without case, spaces or the * sign:
 *   Metadata*  ·  Question Type  ·  Marks*  ·  QuestionText*  ·  AnswerOption1*–AnswerOption5 (the first two required)
 *   ·  CorrectAnswer1*–CorrectAnswer5
 * (an extra "answer options" count column, if a file has one, is accepted and ignored: the options are counted from the cells).
 *
 *  Metadata        A free label that groups questions, e.g. "Post Assessment Telephone Etiquette 2026". When an assessment is built,
 *                  questions are picked by this label. Category, skill, Bloom level and tags are no longer part of the upload.
 *  Question Type   Optional. Multiple choice · Multiple select · True / False · Fill in the blank · Written answer.
 *                  Left empty, it is worked out: two or more options → multiple choice (one correct answer) or multiple select
 *                  (several); True and False as the options → true / false; no options → fill in the blank (when correct answers
 *                  are given) or written answer.
 *                  v41.22: a row WITHOUT a correct answer is always rejected (CorrectAnswer1 is required for every type).
 *  Marks           What the question is worth (a number above 0). A written answer is rated 0 to its marks by a trainer (1–10).
 *  CorrectAnswer   Required. The text of the correct option (or its number 1–5). Several for multiple select. For fill in the blank: every
 *                  accepted answer. For a written answer: what a good answer includes.
 */
const QB_HEAD = ['Metadata*', 'Question Type', 'Marks*', 'QuestionText*', 'AnswerOption1*', 'AnswerOption2*', 'AnswerOption3', 'AnswerOption4', 'AnswerOption5',
  'CorrectAnswer1*', 'CorrectAnswer2', 'CorrectAnswer3', 'CorrectAnswer4', 'CorrectAnswer5'];
const QB_KEYS = ['metadata', 'questiontype', 'marks', 'questiontext', 'answeroption1', 'answeroption2', 'answeroption3', 'answeroption4', 'answeroption5',
  'correctanswer1', 'correctanswer2', 'correctanswer3', 'correctanswer4', 'correctanswer5'];
const QB_REQUIRED = ['metadata', 'marks', 'questiontext', 'answeroption1', 'correctanswer1'];
const QB_TYPES_BULK = ['Multiple choice', 'Multiple select', 'True / False', 'Fill in the blank', 'Written answer'];
const QB_TYPE_ALIAS = { multiplechoice:'Multiple choice', mcq:'Multiple choice', singlechoice:'Multiple choice', singleselect:'Multiple choice', singleanswer:'Multiple choice',
  multipleselect:'Multiple select', multiselect:'Multiple select', msq:'Multiple select', multipleanswer:'Multiple select', multipleanswers:'Multiple select', multiplechoicemultipleanswer:'Multiple select',
  truefalse:'True / False', tf:'True / False', boolean:'True / False', fillintheblank:'Fill in the blank', fillintheblanks:'Fill in the blank', fillblank:'Fill in the blank', fillinblank:'Fill in the blank',
  writtenanswer:'Written answer', written:'Written answer', essay:'Written answer', subjective:'Written answer', shortanswer:'Written answer' };
const QB_HEADER_ALIAS = { question:'questiontext', type:'questiontype', mark:'marks', points:'marks', meta:'metadata' };
const qbHeadKey = h => { const k = String(h == null ? '' : h).replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, ''); return QB_HEADER_ALIAS[k] || k; };
const qbNorm = v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').toLowerCase();
const qbClean = v => String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
const qbMetaClean = v => qbClean(v).replace(/\s+/g, ' ');
const tagsOf = v => String(v || '').split(/[;,]/).map(t => t.trim().toLowerCase()).filter(Boolean).filter((t, i, a) => a.indexOf(t) === i);   // still used by the Add question editor for tags saved on older questions

/* Pure part of the import (no screen state), so it can be tested on its own.
 *   rows      parsed CSV (array of arrays), header row first
 *   existing  the questions already in the bank
 *   o         { author, today, nextId: first free numeric id }
 * Returns { error } when the file can't be used at all, else { ok: [questions], bad: [{ n, raw, why }], total, groups: Map(label → count) }. */
const QuestionImport = {
  parse(rows, existing, o) {
    if (!rows || !rows.length) return { error: 'The file is empty.' };
    if (rows.length < 2) return { error: 'The file has a header row but no questions.' };
    const idx = {}, head = rows[0].map(qbHeadKey);
    QB_KEYS.forEach(k => { idx[k] = head.indexOf(k); });
    const miss = QB_REQUIRED.filter(k => idx[k] < 0).map(k => QB_HEAD.find(h => qbHeadKey(h) === k));
    if (miss.length) return { error: 'The header row is missing: ' + miss.join(', ') + '. Download the template to see the format.' };
    const ok = [], bad = [], groups = new Map(), seen = new Set(), canon = new Map();
    (existing || []).forEach(q => { const m = qbMetaClean(q.meta); if (m) { if (!canon.has(m.toLowerCase())) canon.set(m.toLowerCase(), m); seen.add(m.toLowerCase() + '|' + qbNorm(q.text)); } });
    let id = o.nextId;
    rows.slice(1).forEach((r, i) => {
      if (!r || !r.some(c => String(c == null ? '' : c).trim() !== '')) return;   // blank line
      const n = i + 2, g = k => idx[k] < 0 ? '' : qbClean(r[idx[k]]), raw = QB_KEYS.map(g), rej = why => bad.push({ n, raw, why });
      const meta0 = qbMetaClean(g('metadata')), text = g('questiontext');
      if (!meta0) return rej('Metadata is missing');
      if (meta0.length > 160) return rej('Metadata is too long (160 characters at most)');
      if (!text) return rej('QuestionText is missing');
      if (text.length > 2000) return rej('QuestionText is too long (2,000 characters at most)');
      const marks = Math.round(Number(g('marks').replace(',', '.')) * 100) / 100;
      if (!g('marks')) return rej('Marks is missing');
      if (!isFinite(marks) || marks <= 0 || marks > 100) return rej('Marks must be a number above 0 (up to 100)');
      // options keep their column number, so CorrectAnswer can also say "2" for the option in AnswerOption2
      let opts = [1, 2, 3, 4, 5].map(k => ({ n: k, t: g('answeroption' + k) })).filter(x => x.t);
      const corr = [1, 2, 3, 4, 5].map(k => g('correctanswer' + k)).filter(Boolean), c1 = g('correctanswer1');   // CorrectAnswer1 is required for every type
      if (opts.some(x => x.t.length > 300)) return rej('An answer option is too long (300 characters at most)');
      const isTF = opts.length === 2 && opts.every(x => ['true', 'false'].includes(qbNorm(x.t)));
      let type = null;
      if (g('questiontype')) { type = QB_TYPE_ALIAS[g('questiontype').toLowerCase().replace(/[^a-z]/g, '')];
        if (!type) return rej('Question Type “' + g('questiontype') + '” can’t be uploaded here. Use: ' + QB_TYPES_BULK.join(', ') + ', or leave it empty'); }
      else if (opts.length >= 2) type = isTF ? 'True / False' : corr.length > 1 ? 'Multiple select' : 'Multiple choice';
      else if (opts.length === 0) type = corr.length ? 'Fill in the blank' : 'Written answer';
      else return rej('Give at least two answer options (AnswerOption1 and AnswerOption2)');
      // find the option a CorrectAnswer cell points at: by its text first, then by its column number
      const pick = (list, c) => { const t = qbNorm(c), byText = list.findIndex(x => qbNorm(x.t) === t); if (byText >= 0) return byText;
        const k = /^[1-5]$/.test(c.trim()) ? +c.trim() : 0; return k ? list.findIndex(x => x.n === k) : -1; };
      let extra;
      if (type === 'Multiple choice' || type === 'Multiple select') {
        if (opts.length < 2) return rej('Give at least two answer options (AnswerOption1 and AnswerOption2)');
        if (new Set(opts.map(x => qbNorm(x.t))).size < opts.length) return rej('The answer options must all be different');
        if (!c1) return rej('CorrectAnswer1 is missing');
        const at = []; for (const c of corr) { const p = pick(opts, c); if (p < 0) return rej('Correct answer “' + c + '” is not one of the answer options'); if (!at.includes(p)) at.push(p); }
        if (type === 'Multiple choice' && at.length > 1) return rej('Multiple choice has one correct answer. Use Multiple select when several are correct');
        extra = type === 'Multiple choice' ? { opts: opts.map(x => x.t), ans: at[0] } : { opts: opts.map(x => x.t), answers: at.sort((a, b) => a - b) };
      } else if (type === 'True / False') {
        if (opts.length && !isTF) return rej('A True / False question uses the options True and False');
        const list = opts.length ? opts : [{ n: 1, t: 'True' }, { n: 2, t: 'False' }];
        if (!c1) return rej('CorrectAnswer1 is missing (True or False)');
        const lc = qbNorm(corr[0]), p = ['t', 'yes'].includes(lc) ? list.findIndex(x => qbNorm(x.t) === 'true') : ['f', 'no'].includes(lc) ? list.findIndex(x => qbNorm(x.t) === 'false') : pick(list, corr[0]);
        if (p < 0 || corr.length > 1) return rej('Correct answer must be True or False');
        extra = { opts: ['True', 'False'], ans: qbNorm(list[p].t) === 'true' ? 0 : 1 };
      } else if (type === 'Fill in the blank') {
        const acc = corr.filter((c, k, a) => a.findIndex(x => qbNorm(x) === qbNorm(c)) === k);
        if (!c1 || !acc.length) return rej('Give the accepted answers in CorrectAnswer1 (and CorrectAnswer2–5 for other accepted spellings)');
        extra = { accept: acc };
      } else {   // Written answer
        if (!c1) return rej('CorrectAnswer1 is missing (for a written answer: what a good answer includes, so the trainer can rate it)');
        if (!Number.isInteger(marks) || marks < 1 || marks > 10) return rej('Marks for a written answer must be a whole number from 1 to 10 (a trainer rates it from 0 to that number)');
        extra = { points: marks, guide: corr[0] || '' };
      }
      const meta = canon.get(meta0.toLowerCase()) || meta0, key = meta.toLowerCase() + '|' + qbNorm(text);
      if (seen.has(key)) return rej('This question is already in the bank under the same Metadata (or earlier in the file)');
      seen.add(key); if (!canon.has(meta0.toLowerCase())) canon.set(meta0.toLowerCase(), meta);
      const q = { id: id++, text, type, diff: 'Medium', topic: 'General', why: '', skill: 'General', bloom: 'Understand', tags: [], lang: 'English', used: 0, author: o.author, created: o.today, media: null, meta, marks, ...extra };
      q.ref = 'QB-' + String(q.id).padStart(4, '0'); ok.push(q); groups.set(meta, (groups.get(meta) || 0) + 1);
    });
    return { ok, bad, total: ok.length + bad.length, groups };
  },
};

SkillforgeApp.prototype.amQuestionMeta = function (c) {
  const { s, role } = c;
  if (this._scrV !== 'qbank') return { qbBulkOpen:false };
  const B = s.qbBulk, setB = patch => this.setState(st => ({ qbBulk: { ...(st.qbBulk || {}), ...patch } }));
  const importCsv = () => {
    if (!B || !B.text) return setB({ msg:'Choose a file first.' });
    const res = QuestionImport.parse(parseCsv(B.text), s.qs, { author: role.name, today: TODAY_KEY, nextId: nextUserId(s.qs) });
    if (res.error) return setB({ msg: res.error });
    this.setState(st => ({ qs: res.ok.concat(st.qs), qbBulk: { ...st.qbBulk, msg:'', result:{ total: res.total, ok: res.ok.length, bad: res.bad, groups: [...res.groups.entries()] } } }));
  };
  const R = B && B.result;
  const groupsLine = g => g.length + (g.length === 1 ? ' metadata group' : ' metadata groups') + ': ' + g.slice(0, 3).map(([m, n]) => m + ' (' + n + ')').join(', ') + (g.length > 3 ? ' and ' + (g.length - 3) + ' more' : '');
  return {
    qbBulkOpen: !!B, qbB: B || {}, qbBMsg: !!(B && B.msg), qbBNoFile: !(B && B.text), qbBHasRes: !!R,
    qbOpenBulk: () => this.setState({ qbBulk: {} }), qbCloseBulk: () => this.setState({ qbBulk:null }),
    qbTemplate: () => { csvDownload('question-bank-template.csv', [QB_HEAD,
        ['Post Assessment Telephone Etiquette 2026', 'Multiple choice', 1, 'What should you do first when you pick up a customer call?', 'Greet the customer and state your name', 'Ask for their account number', 'Put them on hold', 'Transfer the call', '', 'Greet the customer and state your name', '', '', '', ''],
        ['Post Assessment Telephone Etiquette 2026', 'Multiple select', 2, 'Which of these are good call-closing habits?', 'Summarise what was agreed', 'Hang up as soon as the customer stops talking', 'Ask if there is anything else you can help with', 'Thank the customer', '', 'Summarise what was agreed', 'Ask if there is anything else you can help with', 'Thank the customer', '', ''],
        ['Post Assessment Telephone Etiquette 2026', 'True / False', 1, 'You should always let the customer finish speaking before you reply.', 'True', 'False', '', '', '', 'True', '', '', '', ''],
        ['Pre Assessment Telephone Etiquette 2026', '', 1, 'Which operator narrows a search so that BOTH words must appear?', 'AND', 'OR', 'NOT', '', '', 'AND', '', '', '', ''],
        ['Pre Assessment Telephone Etiquette 2026', 'Fill in the blank', 1, 'The ___ is the first thing a caller hears when you answer.', '', '', '', '', '', 'greeting', 'opening greeting', '', '', ''],
        ['Pre Assessment Telephone Etiquette 2026', 'Written answer', 5, 'Describe how you would handle an angry caller.', '', '', '', '', '', 'Stays calm, acknowledges the problem, offers a next step', '', '', '', '']]);
      this.toastMsg('Template downloaded'); },
    qbPick: e => { const f = e.target.files && e.target.files[0]; if (!f) return; if (!/\.csv$/i.test(f.name)) { e.target.value = ''; return setB({ name:'', text:'', msg:'Upload a .csv file. In Excel, use File › Save As › CSV.' }); } f.text().then(t => setB({ name: f.name, text: t, msg:'', result:null })); },
    qbImport: importCsv,
    qbRes: R ? { okLine: R.ok ? R.ok + (R.ok === 1 ? ' question added' : ' questions added') + ' · ' + groupsLine(R.groups) : 'No questions were added.', hasOk: R.ok > 0, hasBad: R.bad.length > 0,
      badLine: R.bad.length + ' of ' + R.total + (R.total === 1 ? ' row' : ' rows') + ' not added.', badRows: R.bad.slice(0, 5).map(x => ({ n:'Row ' + x.n, why: x.why })), more: R.bad.length > 5 ? '+ ' + (R.bad.length - 5) + ' more in the download' : '' } : {},
    // The rejected rows come back in the upload layout (same 14 headers, original cells), with the reason in the first column and the row number
    // from your file in the second. Fix the cells, delete the two extra columns or leave them (they are ignored), and upload the file again.
    qbRejects: () => { csvDownload('question-upload-rejected-' + TODAY_KEY + '.csv', [['Rejection reason', 'Row in your file'].concat(QB_HEAD)].concat(R.bad.map(x => [x.why, x.n].concat(x.raw)))); this.toastMsg(R.bad.length + ' rejected ' + (R.bad.length === 1 ? 'row' : 'rows') + ' downloaded. Fix them and upload the file again.'); },
    qbResetBulk: () => this.setState({ qbBulk: {} }),
    // Export uses the upload layout first (so a file can be edited and uploaded again), then a few extra columns.
    qbExport: () => { const act = s.qs.filter(q => !q.archived);
      const optsOf = q => q.type === 'Match the following' ? q.pairs.map(p => p[0] + ' → ' + p[1]) : q.type === 'Ordering' ? q.items : q.type === 'Fill in the blank' || q.type === 'Written answer' ? [] : (q.opts || []).map(o => typeof o === 'string' ? o : o.label);
      const corrOf = q => { const o = optsOf(q);
        if (q.type === 'Multiple select') return (q.answers || []).map(i => o[i]);
        if (['Multiple choice', 'True / False', 'Image options'].includes(q.type)) return [o[q.ans]];
        if (q.type === 'Fill in the blank') return q.accept || [];
        if (q.type === 'Ordering') return ['In the order listed'];
        if (q.type === 'Match the following') return ['As paired'];
        if (q.type === 'Written answer') return q.guide ? [q.guide] : [];
        return ['Not scored']; };
      const marksOf = q => q.marks > 0 ? q.marks : (q.type === 'Written answer' ? (q.points || 1) : 1);
      const used = q => s.quizzes.filter(z => z.ids.includes(q.id)).map(z => z.name).join('; ');
      csvDownload('active-questions-' + TODAY_KEY + '.csv', [['Metadata', 'Question Type', 'Marks', 'QuestionText', 'AnswerOption1', 'AnswerOption2', 'AnswerOption3', 'AnswerOption4', 'AnswerOption5',
        'CorrectAnswer1', 'CorrectAnswer2', 'CorrectAnswer3', 'CorrectAnswer4', 'CorrectAnswer5', 'Reference', 'Difficulty', 'Explanation', 'Language', 'Media', 'Author', 'Created', 'Used in assessments']]
        .concat(act.map(q => { const o = optsOf(q), k = corrOf(q);
          return [q.meta || '', q.type, marksOf(q), q.text, o[0] || '', o[1] || '', o[2] || '', o[3] || '', o[4] || '', k[0] || '', k[1] || '', k[2] || '', k[3] || '', k[4] || '',
            q.ref || '', q.diff, q.why || '', q.lang || 'English', q.media ? q.media.kind + ': ' + q.media.name : '', q.author || '', q.created || '', used(q)]; })));
      this.toastMsg(act.length + ' active questions exported'); },
  };
};
