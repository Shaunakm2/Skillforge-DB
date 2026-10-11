/* Skillforge LMS — sample data for training places, SCORM bookmarks, the certificate template,
 * Kirkpatrick feedback forms, assessment attempt records and question metadata. */

/* ---------- Training places (classrooms) ---------- */
const PLACES0 = [
  { id:'p1', name:'Training Room A', site:'Ahmedabad HQ', floor:'3rd floor', capacity:24, layout:'Classroom', status:'Available', it:{ pcs:24, projector:true, vc:true, headsets:24, wifi:true, whiteboard:true }, notes:'Main induction room. Thin clients on every desk.' },
  { id:'p2', name:'Training Room B', site:'Ahmedabad HQ', floor:'3rd floor', capacity:16, layout:'U-shape', status:'Available', it:{ pcs:0, projector:true, vc:true, headsets:0, wifi:true, whiteboard:true }, notes:'Bring-your-own-laptop room for soft-skills sessions.' },
  { id:'p3', name:'Voice Lab', site:'Ahmedabad HQ', floor:'4th floor', capacity:12, layout:'Pods', status:'Available', it:{ pcs:12, projector:false, vc:false, headsets:12, wifi:true, whiteboard:false }, notes:'Noise-cancelling headsets and call simulator for voice & accent.' },
  { id:'p4', name:'Boardroom 2', site:'Pune', floor:'Ground floor', capacity:10, layout:'Boardroom', status:'Under maintenance', it:{ pcs:0, projector:false, vc:true, headsets:0, wifi:true, whiteboard:true }, notes:'Display being replaced until Oct 9.' },
];
const BATCH_PLACE0 = { b4:'p3', b3:'p2', b1:'p1', b2:'', b5:'p3' };
/* How trainees join: In person (a training room), Virtual (meeting link) or Hybrid (both). */
const BATCH_MODE0 = { b4:'In person', b3:'Hybrid', b1:'In person', b2:'Virtual', b5:'In person' };
const BATCH_LINK0 = { b3:'https://teams.microsoft.com/l/meetup-join/19%3ameeting_LeadL226001', b2:'https://meet.google.com/csb-oct-boot' };
const MEET_HOSTS = [['teams.microsoft.com', 'Microsoft Teams'], ['teams.live.com', 'Microsoft Teams'], ['zoom.us', 'Zoom'], ['meet.google.com', 'Google Meet'], ['webex.com', 'Webex'], ['gotomeeting.com', 'GoTo Meeting']];
const meetHost = url => { try { const h = new URL(url).hostname.toLowerCase(); const m = MEET_HOSTS.find(([d]) => h === d || h.endsWith('.' + d)); return m ? m[1] : h; } catch (e) { return ''; } };
const meetOk = url => { try { const u = new URL(url.trim()); return u.protocol === 'https:' && !!u.hostname && u.hostname.includes('.'); } catch (e) { return false; } };

/* ---------- SCORM bookmarks: where a learner resumes a SCORM course ---------- */
const BOOKMARKS0 = {
  'Maya Okafor': { safety: { item:2, location:'Scenario 2 · screen 4 of 7', savedAt:'2026-10-02T16:20' } },
  'Jonas Berg': { safety: { item:2, location:'Scenario 1 · screen 6 of 7', savedAt:'2026-09-30T11:05' } },
  'Ishaan Kapoor': { safety: { item:2, location:'Scenario 1 · screen 2 of 7', savedAt:'2026-09-24T09:42' } },
};
const BOOKMARK_LOG0 = [{ id:'bl1', at:'2026-09-28T10:12', by:'Lena Fischer', user:'Aisha Khan', course:'CRS-1001 · Workplace Safety Essentials', resetDone:false, reason:'Package stuck on a blank screen after resume.' }];

/* ---------- Certificate template (Settings › Certificates) ---------- */
const CERT_FIELDS = [['name', 'Learner name', 'Maya Okafor'], ['course', 'Course name', 'Workplace Safety Essentials'], ['date', 'Completion date', 'October 3, 2026'], ['score', 'Score %', 'Score 92%']];
const CERT_TPL0 = { version:2, bg:{ src:'assets/certificate-default.svg', name:'certificate-default.svg' }, updatedBy:'Lena Fischer', updatedAt:'2026-09-12T14:30',
  fields: { name:{ x:50, y:46, size:5.2, color:'#16324F', bold:true, on:true }, course:{ x:50, y:60, size:2.8, color:'#334E68', bold:true, on:true }, date:{ x:27, y:80, size:1.9, color:'#334E68', bold:false, on:true }, score:{ x:73, y:80, size:1.9, color:'#334E68', bold:false, on:true } },
  history:[{ version:1, at:'2026-07-01T10:00', by:'Arjun Mehta', note:'First template' }, { version:2, at:'2026-09-12T14:30', by:'Lena Fischer', note:'Moved the score next to the date' }] };

/* ---------- Kirkpatrick feedback (L1–L4) ---------- */
const KP_LEVELS = [
  ['L1', 'Reaction', 'Did learners find the training engaging and relevant?'],
  ['L2', 'Learning', 'Did they gain the intended knowledge, skills and confidence?'],
  ['L3', 'Behaviour', 'Are they applying it on the job?'],
  ['L4', 'Results', 'Did it improve business results?'],
];
const KP_DEFAULT = () => ({
  L1:{ on:true, audience:'Learner', days:0, qs:[{ t:'How relevant was this course to your work?', kind:'rating' }, { t:'How likely are you to recommend it to a colleague?', kind:'rating' }, { t:'What one thing would you improve?', kind:'text' }] },
  L2:{ on:true, audience:'Learner', days:30, qs:[{ t:'How confident are you applying what you learned?', kind:'rating' }, { t:'Which idea from the course have you remembered best?', kind:'text' }] },
  L3:{ on:true, audience:'Learner & manager', days:60, qs:[{ t:'How often is the learned behaviour applied on the job?', kind:'rating' }, { t:'Give one example of it being applied.', kind:'text' }] },
  L4:{ on:false, audience:'Manager', days:90, qs:[{ t:'How much has this improved the team’s results?', kind:'rating' }, { t:'Which business measure changed, and by how much?', kind:'text' }] },
});
/* Standard Kirkpatrick question library (Settings › Master data › Feedback questions). New course setups start from it. */
const KP_LIB0 = KP_DEFAULT();
const KP0 = { safety: { ...KP_DEFAULT(), auto:true }, feedback: (() => { const k = KP_DEFAULT(); k.L4.on = true; k.auto = false; return k; })() };
/* Responses and sends so far: key "course|learner|level|recipient" */
const FB_LOG0 = {
  'feedback|Jonas Berg|L1|Jonas Berg': { sentAt:'2026-09-18T09:00', response:{ at:'2026-09-18T15:12', answers:[5, 4, 'More role-play time.'] } },
  'feedback|Aisha Khan|L1|Aisha Khan': { sentAt:'2026-09-20T09:00', response:{ at:'2026-09-21T10:40', answers:[4, 5, 'Shorter videos.'] } },
  'feedback|Maya Okafor|L1|Maya Okafor': { sentAt:'2026-09-26T09:00' },
};

/* ---------- Assessment attempt records (for the assessment result reports) ---------- */
const attemptSeed = (users, quizzes, qbank, enroll, courses) => {
  const h = str => { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0) / 4294967295; };
  const out = [];
  users.filter(u => u.status !== 'Deactivated').forEach(u => Object.keys(enroll[u.name] || {}).forEach(cid => {
    const c = courses.find(x => x.id === cid); if (!c) return;
    c.items.filter(it => it.kind === 'quiz').forEach(it => { const z = quizzes.find(q => q.id === it.quizId); if (!z || out.some(r => r.user === u.name && r.quizId === z.id)) return;
      const n = 1 + Math.floor(h(u.name + z.id) * 2); // 1–2 attempts (stops at the first pass)
      for (let k = 0; k < n; k++) {
        const r = h(u.name + z.id + k), day = new Date('2026-08-10T00:00:00'); day.setDate(day.getDate() + Math.floor(r * 50) + k * 3);
        if (dateKey(day) > TODAY_KEY) continue;
        const pool = z.ids.map(id => qbank.find(q => q.id === id)).filter(q => q && q.type !== 'Likert scale' && q.type !== 'Written answer');
        const shown = z.dynamic ? pool.slice(0, Math.min(z.drawCount, pool.length)) : pool;
        const skill = 0.45 + h(u.name) * 0.5 + k * 0.1;
        const res = shown.map((q, i) => ({ qid: q.id, ok: h(u.name + q.id + k) < skill }));
        const right = res.filter(x => x.ok).length, pct = shown.length ? Math.round(right / shown.length * 100) : 0;
        const st = new Date(day); st.setHours(9 + Math.floor(r * 8), Math.floor(h('m' + u.name + k) * 60));
        const mins = 4 + Math.floor(h('d' + u.name + z.id + k) * 14), en = new Date(st.getTime() + mins * 60000);
        const iso = d => dateKey(d) + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        out.push({ id:'ar' + out.length, user: u.name, empId: u.empId, quizId: z.id, quizName: z.name, courseId: cid, courseCode: c.code, courseTitle: c.title, attemptNo: k + 1, startedAt: iso(st), submittedAt: iso(en), mins, correct: right, total: shown.length, score: pct, pass: pct >= z.pass, res });
        if (pct >= z.pass) break;
      }
    });
  }));
  return out.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
};

/* ---------- Question metadata ---------- */
const BLOOM = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
const Q_SKILL = { 'Change management':'Leading change', 'Feedback':'Giving feedback', 'Coaching':'Coaching', 'Negotiation':'Negotiation', '1:1s':'People management', 'Workplace safety':'Health & safety' };
const qMetaSeed = q => {
  const bloom = q.type === 'Written answer' ? 'Create' : q.type === 'Ordering' || q.type === 'Match the following' ? 'Understand' : q.diff === 'Hard' ? 'Analyze' : q.diff === 'Medium' ? 'Apply' : 'Remember';
  const tags = [q.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')].concat(q.media ? ['media'] : []).concat(/scenario|says|asks|goes quiet|you see/i.test(q.text) ? ['scenario'] : []).concat(q.diff === 'Easy' ? ['basics'] : []);
  return { skill: Q_SKILL[q.topic] || q.topic, bloom, tags, ref: 'QB-' + String(q.id).padStart(4, '0'), lang:'English' };
};
QBANK0.forEach(q => Object.assign(q, qMetaSeed(q), q));

/* ---------- Course access requests (learner → manager / L&D) ---------- */
const ACCESS_REQS0 = [
  { id:'rq1', user:'Jonas Berg', empId:'NW-1002', dept:'Customer Success', manager:'Priya Raman', courseId:'negotiation', course:'Negotiation Essentials', reason:'Taking over renewals for two enterprise accounts from November.', at:'2026-10-01T11:20', status:'Pending' },
  { id:'rq2', user:'Aisha Khan', empId:'NW-1003', dept:'Customer Success', manager:'Priya Raman', courseId:'present', course:'Presenting with Confidence', reason:'Presenting the quarterly CSAT review to leadership.', at:'2026-09-29T16:05', status:'Pending' },
  { id:'rq3', user:'Maya Okafor', empId:'NW-1001', dept:'Customer Success', manager:'Priya Raman', courseId:'coaching', course:'Coaching Conversations', reason:'Starting as a buddy for new joiners next month.', at:'2026-09-20T10:00', status:'Pending' },
];

/* ---------- Surveys and Kirkpatrick feedback forms (LCMS modules) ---------- */
const FORM_MODULES0 = (() => { const K = KP_DEFAULT(), mk = (id, n, title, extra) => ({ id, code:'MOD-' + String(n).padStart(3, '0'), by:'Lena Fischer', updated:'2026-09-20', desc:'', mins:3, ...extra, title });
  return [
    mk('f1', 12, 'Standard L1 · Reaction', { type:'Feedback form', level:'L1', audience: K.L1.audience, days: K.L1.days, qs: K.L1.qs, applyAll:false, courses:['safety', 'feedback'], trainings:['New Hire Induction', 'Customer Support Basics'] }),
    mk('f2', 13, 'Standard L2 · Learning (30 days)', { type:'Feedback form', level:'L2', audience: K.L2.audience, days: K.L2.days, qs: K.L2.qs, applyAll:false, courses:['safety', 'feedback'], trainings:[] }),
    mk('f3', 14, 'Standard L3 · Behaviour (60 days)', { type:'Feedback form', level:'L3', audience: K.L3.audience, days: K.L3.days, qs: K.L3.qs, applyAll:false, courses:['safety', 'feedback'], trainings:[] }),
    mk('f4', 15, 'Feedback course · L4 Results', { type:'Feedback form', level:'L4', audience: K.L4.audience, days: K.L4.days, qs: K.L4.qs, applyAll:false, courses:['feedback'], trainings:[] }),
    mk('f5', 16, 'Sales induction · L1 Reaction', { type:'Feedback form', level:'L1', audience:'Learner', days:0, qs:[{ t:'How ready do you feel for your first week on the floor?', kind:'rating' }, { t:'Which session helped most?', kind:'text' }], applyAll:false, courses:[], trainings:['Inside Sales Programme', 'Field Sales Programme'] }),
    mk('s1', 17, 'Before you start: your goals', { type:'Survey', mins:2, qs:[{ t:'How confident are you about this topic today?', kind:'rating' }, { t:'What do you want to get out of this course?', kind:'text' }] }),
  ]; })();
