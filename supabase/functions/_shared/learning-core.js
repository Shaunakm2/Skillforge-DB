/* Skillforge LMS — server-side learning rules (runs in the Edge Function "learning"; unit-tested in Node).
 *
 * Everything that decides a learner's results happens here, never in the browser:
 *   • assessments: attempt limits, question draw, grading, pass/fail, completion of the step
 *   • completion of other steps: enrolment check, linear unlock, minimum viewing time (server clock)
 *   • surveys, feedback answers, access requests, profile edits and forum posts (ownership enforced)
 * Learners have no direct write access to these records (Row Level Security); this code writes them with the
 * service role after checking the rules.
 *
 * Storage: the same sf_doc rows the app uses. Per-person rows are keyed by employee ID.
 *   db.get(coll, key)                     -> { data, version } | null
 *   db.getMany(coll, keys)                -> Map(key -> { data, version })
 *   db.put(coll, key, data, version|null) -> true | false   (false = someone else changed it: re-read and retry)
 *   db.del(coll, key)
 * ctx = { org, emp, userKey, role: 'Learner'|'Trainer'|'Admin', perms: [permission keys of the custom role], now: Date,
 *         contentOrigin, signKey, scormIdleMin?, scormMaxHours? }   (perms are enforced here exactly as in the database policies)
 *
 * SCORM   A package step completes only through scormCommit: the learner must have launched THIS package (a launch
 *         session written here), the package must report completed/passed, and the minimum time must have passed on
 *         the server clock since the first launch. completeStep refuses SCORM steps. The status still comes from code
 *         running in the learner's browser (inherent to SCORM), but the package has to have been launched and run.
 */
(() => {
  const A = globalThis.Assessment;
  class Fail extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const fail = (status, msg) => { throw new Fail(status, msg); };
  const iso = d => d.toISOString();
  // Calendar dates (completion dates, document validity) are in the organisation's time zone, like the app's dates.
  // UTC would record a completion at 01:00 IST as the previous day. ctx.tz comes from ORG_TIMEZONE (default Asia/Kolkata).
  const DAYF = new Map(), day = (d, tz) => { tz = tz || 'Asia/Kolkata'; let f = DAYF.get(tz);
    if (!f) DAYF.set(tz, f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })); return f.format(d); };
  const str = (v, max, name) => { v = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F<>]/g, '').trim(); if (v.length > max) fail(400, name + ' is too long (' + max + ' characters max)'); return v; };
  const uid = () => { const b = new Uint8Array(16); globalThis.crypto.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); };
  const viewNeed = mins => Math.min(60, Math.max(15, Math.round((mins || 5) * 6)));
  const VIEW_KINDS = ['pdf', 'doc', 'image', 'link', 'lesson', 'video', 'audio', 'html', 'xapi', 'embed', 'youtube'];   // v41.11: + packages without SCORM tracking, H5P, YouTube
  const PKG_KINDS = ['scorm', 'html', 'xapi'];   // played on the content site
  const can = (ctx, p) => ctx.role === 'Admin' || (ctx.perms || []).includes(p);
  // Who can read answer keys (question bank / assessment authoring). Gradebook alone does NOT include keys.
  const KEY_PERMS = ['qbank', 'quizzes'];
  const hasKeys = ctx => ctx.role === 'Admin' || KEY_PERMS.some(p => (ctx.perms || []).includes(p));
  // SCORM: minimum time from first launch to a completion that counts (seconds), idle timeout of a launch link.
  const scormNeed = it => Number.isFinite(Number(it.minSecs)) && Number(it.minSecs) >= 0 ? Math.min(7200, Number(it.minSecs)) : viewNeed(it.mins);
  const SCORM_DONE = /^(completed|passed)$/;
  const b64u = bytes => { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  /* SCORM launch token for the separate content site: base64url(JSON) + '.' + base64url(HMAC-SHA256). */
  async function signToken(key, payload) {
    const body = b64u(new TextEncoder().encode(JSON.stringify(payload)));
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return body + '.' + b64u(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body))));
  }

  /* Read-modify-write with optimistic concurrency: retries when another writer got there first. */
  async function update(db, coll, key, fn, init) {
    for (let i = 0; i < 6; i++) {
      const cur = await db.get(coll, key);
      const next = await fn(cur ? JSON.parse(JSON.stringify(cur.data)) : (init === undefined ? null : JSON.parse(JSON.stringify(init))));
      if (next === undefined) return cur ? cur.data : null;            // nothing to change
      if (await db.put(coll, key, next, cur ? cur.version : null)) return next;
    }
    fail(409, 'Busy: please try again');
  }

  async function course(db, cid) { const c = await db.get('adminCourses', String(cid)); if (!c) fail(404, 'Course not found'); return c.data; }
  async function enrolled(db, ctx, cid) {
    const en = await db.get('enroll', ctx.emp); return !!(en && en.data[cid]);
  }
  async function stepStates(db, ctx, c) {
    const done = ((await db.get('itemDone', ctx.emp)) || { data: {} }).data[c.id] || {};
    let prevOk = true;
    return c.items.map((it, i) => { const d = !!done[i], locked = !!(c.features || {}).linear && !prevOk; prevOk = prevOk && d; return { done: d, locked }; });
  }
  async function checkStep(db, ctx, cid, step) {
    const c = await course(db, cid);
    if (c.status !== 'Published' && ctx.role === 'Learner') fail(403, 'This course is not published');
    if (!(await enrolled(db, ctx, c.id))) fail(403, 'This course is not assigned to you');
    const i = Number(step); if (!Number.isInteger(i) || i < 0 || i >= c.items.length) fail(400, 'No such step');
    const st = await stepStates(db, ctx, c);
    if (st[i].locked) fail(409, 'Finish the earlier steps first');
    return { c, i, it: c.items[i], st: st[i] };
  }
  async function markDone(db, ctx, cid, i, value) {
    return update(db, 'itemDone', ctx.emp, d => { d = d || {}; d[cid] = d[cid] || {}; if (d[cid][i]) return undefined; d[cid][i] = value; return d; }, {});
  }

  /* ---------- assessments ---------- */
  // What the browser gets: questions in display order with no answer key. Answers come back as display positions.
  function sanitize(q, order) {
    const out = { id: q.id, type: q.type, text: q.text, media: q.media || null, points: q.points || null };
    if (['Multiple choice', 'Multiple select', 'Image options', 'True / False'].includes(q.type)) out.opts = order.map(i => q.opts[i]);
    if (q.type === 'Match the following') out.pairs = q.pairs.map((p, li) => [p[0], q.pairs[order[li]][1]]);
    if (q.type === 'Ordering') out.items = order.map(i => q.items[i]);
    if (q.type === 'Written answer') { out.minWords = q.minWords || 0; out.maxWords = q.maxWords || 0; }
    return out;
  }
  // display-position answer -> original-index answer (what Assessment.grade expects)
  function toOriginal(q, order, a) {
    a = a || {};
    const pos = p => { const n = Number(p); if (!Number.isInteger(n) || n < 0 || n >= order.length) return -1; return order[n]; };
    switch (q.type) {
      case 'Multiple choice': case 'True / False': case 'Image options': return { sel: a.sel == null ? null : pos(a.sel) };
      case 'Multiple select': return { multi: Array.isArray(a.multi) ? [...new Set(a.multi.map(pos))].filter(x => x >= 0) : [] };
      case 'Match the following': { const m = {}; q.pairs.forEach((_, li) => { if (a.match && a.match[li] != null) m[li] = pos(a.match[li]); }); return { match: m }; }
      case 'Ordering': return { order: Array.isArray(a.order) && a.order.length === q.items.length ? a.order.map(pos) : [] };
      case 'Likert scale': { const n = Number(a.sel); return { sel: Number.isInteger(n) && n >= 0 && n < 5 ? n : null }; }
      default: return { text: String(a.text == null ? '' : a.text).slice(0, 5000) };
    }
  }
  function reveal(q, order, f) {
    const r = { why: q.why || '' };
    if (!f.correct) return r;   // course setting: show correct answers
    const idx = i => order.indexOf(i);
    if (['Multiple choice', 'True / False', 'Image options'].includes(q.type)) r.ans = idx(q.ans);
    if (q.type === 'Multiple select') r.answers = (q.answers || []).map(idx);
    if (q.type === 'Fill in the blank') r.accept = (q.accept || []).slice(0, 3);
    if (q.type === 'Match the following') r.matchKey = q.pairs.map((_, li) => idx(li));
    if (q.type === 'Ordering') r.orderKey = q.items.map((_, p) => idx(p));
    return r;
  }

  async function startAttempt(db, ctx, b) {
    const { c, i, it } = await checkStep(db, ctx, b.courseId, b.step);
    if (it.kind !== 'quiz') fail(400, 'This step is not an assessment');
    const z = (await db.get('quizzes', String(it.quizId)) || fail(404, 'Assessment not found')).data;
    const bank = [...(await db.getMany('qs', z.ids.map(String))).values()].map(x => x.data);
    const used = ((await db.get('attemptsUsed', ctx.emp)) || { data: {} }).data[z.id] || 0;
    const extra = ((await db.get('extraAttempts', ctx.emp)) || { data: {} }).data[z.id] || 0;
    const info = A.attemptsInfo(z, used, extra);
    if (!info.canStart) fail(409, 'You have used all ' + info.allowed + ' attempts. Ask your admin for another attempt.');
    const att = A.buildAttempt(z, bank);
    if (!att.length) fail(409, 'This assessment has no questions yet');
    // count the attempt first (concurrency-safe), so parallel starts can't exceed the limit
    let n = 0;
    await update(db, 'attemptsUsed', ctx.emp, d => { d = d || {}; const cur = d[z.id] || 0; if (!A.attemptsInfo(z, cur, extra).canStart) fail(409, 'You have used all your attempts.'); d[z.id] = n = cur + 1; return d; }, {});
    const id = uid(), byId = new Map(bank.map(q => [String(q.id), q]));
    // Someone who can read the answer keys may still take the course; the attempt is marked so reports can show it.
    // v41.18: the quiz's time limit (Quizzes › Time limit, saved as z.time in minutes) is enforced here, on the server clock.
    const limitMin = timeLimitOf(z), endsAt = limitMin ? iso(new Date(ctx.now.getTime() + limitMin * 60000)) : null;
    const rec = { id, emp: ctx.emp, courseId: c.id, step: i, quizId: z.id, attemptNo: n, items: att, answers: {}, startedAt: iso(ctx.now), endsAt, submittedAt: null, keyAccess: hasKeys(ctx) };
    if (!(await db.put('attempt', id, rec, null))) fail(409, 'Try again');
    return { attemptId: id, attemptNo: n, quiz: { id: z.id, name: z.name, pass: z.pass, timeLimit: limitMin || null, endsAt }, attempts: A.attemptsInfo(z, n, extra),
      questions: att.map(a => sanitize(byId.get(String(a.qid)), a.order)) };
  }
  // Time limit in minutes (0 = none). Older quizzes may carry timeLimit instead of time.
  const timeLimitOf = z => Math.max(0, Math.min(600, Math.round(Number(z.time || z.timeLimit) || 0)));
  const TIME_GRACE_MS = 30 * 1000;   // network delay between the learner's last click and the server
  const timeUp = (at, ctx) => !!at.endsAt && ctx.now.getTime() > Date.parse(at.endsAt) + TIME_GRACE_MS;
  async function loadAttempt(db, ctx, id) {
    const r = await db.get('attempt', String(id)); if (!r || r.data.emp !== ctx.emp) fail(404, 'Attempt not found'); return r;
  }
  async function answer(db, ctx, b) {
    const r = await loadAttempt(db, ctx, b.attemptId), at = r.data, k = Number(b.index);
    if (at.submittedAt) fail(409, 'This attempt is already submitted');
    if (!Number.isInteger(k) || k < 0 || k >= at.items.length) fail(400, 'No such question');
    if (at.answers[k]) fail(409, 'This question is already answered');
    if (timeUp(at, ctx)) fail(409, 'Time is up for this attempt. Answers after the time limit are not accepted; submit to see your result.');
    const q = (await db.get('qs', String(at.items[k].qid))).data, orig = toOriginal(q, at.items[k].order, b.answer);
    const c = (await db.get('adminCourses', String(at.courseId))).data;
    const ok = await db.put('attempt', at.id, { ...at, answers: { ...at.answers, [k]: orig } }, r.version);
    if (!ok) fail(409, 'This question is already answered');
    const g = A.grade(q, orig);
    return { g, ...(g === null ? {} : reveal(q, at.items[k].order, c.features || {})), feedbackIncorrect: !!(c.features || {}).incorrect };
  }
  async function submit(db, ctx, b) {
    const r = await loadAttempt(db, ctx, b.attemptId), at = r.data;
    if (at.submittedAt) fail(409, 'This attempt is already submitted');
    const z = (await db.get('quizzes', String(at.quizId))).data, c = (await db.get('adminCourses', String(at.courseId))).data;
    const qmap = await db.getMany('qs', at.items.map(x => String(x.qid))), bank = [...qmap.values()].map(x => x.data);
    const answers = { ...at.answers }, newReviews = [];
    at.items.forEach((a, i) => { const q = qmap.get(String(a.qid)).data; if (A.isWritten(q) && answers[i] && answers[i].text) { const rid = 'r' + uid().slice(0, 12); answers[i] = { ...answers[i], reviewId: rid };
      // the review carries what a rater needs (question, points, guide): raters don't need the question bank or its keys
      newReviews.push({ id: rid, learnerEmp: ctx.emp, quiz: z.name, quizId: z.id, attemptId: at.id, qid: q.id, qText: q.text || '', points: q.points || 0, guide: q.guide || '', answer: answers[i].text, submitted: iso(ctx.now), rating: null }); } });
    const sc = A.score(at.items, answers, bank, newReviews), passed = sc.final && sc.pct >= z.pass;
    if (!(await db.put('attempt', at.id, { ...at, answers, submittedAt: iso(ctx.now), result: sc }, r.version))) fail(409, 'This attempt is already submitted');
    for (const rv of newReviews) await db.put('reviews', rv.id, rv, null);
    await update(db, 'itemQuiz', ctx.emp, d => { d = d || {}; d[c.id] = d[c.id] || {}; d[c.id][at.step] = (d[c.id][at.step] || []).concat([{ attemptId: at.id, attempt: at.items, answers }]); return d; }, {});
    const res = at.items.map((a, i) => ({ qid: a.qid, ok: A.grade(qmap.get(String(a.qid)).data, answers[i]) === 1 }));
    await db.put('attemptRecs', at.id, { id: at.id, empId: ctx.emp, quizId: z.id, quizName: z.name, courseId: c.id, courseCode: c.code || '', courseTitle: c.title, attemptNo: at.attemptNo,
      startedAt: at.startedAt, submittedAt: iso(ctx.now), mins: Math.max(1, Math.round((ctx.now - new Date(at.startedAt)) / 60000)), correct: sc.autoRight, total: sc.auto + sc.written, score: sc.pct, pass: passed, res, keyAccess: !!at.keyAccess }, null);
    if (passed) await markDone(db, ctx, c.id, at.step, { at: day(ctx.now, ctx.tz), score: sc.pct });
    return { score: sc, passed, pending: sc.pending > 0 };
  }

  /* After a trainer rates a written answer, the attempt is re-scored here (never in the browser). */
  async function rescore(db, ctx, b) {
    if (!can(ctx, 'gradebook')) fail(403, 'Rating answers needs the Gradebook permission');
    const rv = await db.get('reviews', String(b.reviewId)); if (!rv) fail(404, 'Answer not found');
    // v41.18: nobody rates their own answer (an admin included: another rater must do it)
    if (rv.data.learnerEmp === ctx.emp) fail(403, 'You cannot rate your own answer');
    const q = (await db.get('qs', String(rv.data.qid))).data, rating = Number(b.rating);
    if (!Number.isInteger(rating) || rating < 0 || rating > (q.points || 0)) fail(400, 'Rating must be 0 to ' + q.points);
    // v41.18: the rater's note to the learner was dropped when connected; it is now stored with the rating
    const feedback = b.feedback === undefined ? undefined : str(b.feedback, 1000, 'Feedback');
    await update(db, 'reviews', rv.data.id, d => ({ ...d, rating, ...(feedback === undefined ? {} : { feedback }), ratedBy: ctx.emp, ratedAt: iso(ctx.now) }));
    const at = (await db.get('attempt', rv.data.attemptId)).data, z = (await db.get('quizzes', String(at.quizId))).data;
    const qmap = await db.getMany('qs', at.items.map(x => String(x.qid)));
    const ids = Object.values(at.answers).map(a => a && a.reviewId).filter(Boolean), rvs = [...(await db.getMany('reviews', ids)).values()].map(x => x.data);
    const sc = A.score(at.items, at.answers, [...qmap.values()].map(x => x.data), rvs), passed = sc.final && sc.pct >= z.pass;
    await update(db, 'attemptRecs', at.id, d => d && ({ ...d, score: sc.pct, pass: passed }));
    if (passed) await markDone(db, { ...ctx, emp: at.emp }, at.courseId, at.step, { at: day(ctx.now, ctx.tz), score: sc.pct });
    return { score: sc, passed };
  }

  /* ---------- other steps ---------- */
  async function openStep(db, ctx, b) {
    const { c, i } = await checkStep(db, ctx, b.courseId, b.step);
    const key = ctx.emp + '|' + c.id + '|' + i, cur = await db.get('stepOpen', key);
    if (!cur) await db.put('stepOpen', key, { at: iso(ctx.now) }, null);
    return { openedAt: cur ? cur.data.at : iso(ctx.now) };
  }
  async function completeStep(db, ctx, b) {
    const { c, i, it, st } = await checkStep(db, ctx, b.courseId, b.step);
    if (st.done) return { done: true };
    if (it.kind === 'quiz') fail(400, 'Assessments complete when you pass them');
    if (it.kind === 'survey') fail(400, 'Submit the survey to complete this step');
    if (it.kind === 'scorm') fail(400, 'SCORM steps complete when the package reports completion');
    if (it.kind === 'checklist') fail(400, 'Tick every item and submit the checklist to complete this step');
    if (it.kind === 'assignment') fail(400, 'Submit your assignment: it completes when a trainer accepts it');
    const f = c.features || {};
    if (VIEW_KINDS.includes(it.kind) && !f.selfComplete) {
      const o = await db.get('stepOpen', ctx.emp + '|' + c.id + '|' + i); if (!o) fail(409, 'Open this step first');
      const need = viewNeed(it.mins), spent = (ctx.now - new Date(o.data.at)) / 1000;
      if (spent + 2 < need) fail(409, 'Spend at least ' + need + ' seconds on this step (' + Math.ceil(need - spent) + 's to go)');
    }
    await markDone(db, ctx, c.id, i, { at: day(ctx.now, ctx.tz), src: it.kind === 'ack' ? 'agreed' : 'viewed' });
    return { done: true };
  }
  async function submitSurvey(db, ctx, b) {
    const { c, i, it } = await checkStep(db, ctx, b.courseId, b.step);
    if (it.kind !== 'survey') fail(400, 'This step is not a survey');
    const qs = it.qs || [], a = Array.isArray(b.answers) ? b.answers : [];
    const answers = qs.map((q, k) => { if (q.kind === 'rating') { const n = Number(a[k]); if (!Number.isInteger(n) || n < 1 || n > 5) fail(400, 'Answer question ' + (k + 1)); return n; } return str(a[k], 1000, 'Answer ' + (k + 1)); });
    await update(db, 'surveyResp', ctx.emp, d => { d = d || {}; d[c.id + ':' + i] = { answers, at: iso(ctx.now) }; return d; }, {});
    await markDone(db, ctx, c.id, i, { at: day(ctx.now, ctx.tz), src: 'survey' });
    return { done: true };
  }

  /* ---------- v41.11: checklist and assignment steps ---------- */
  async function submitChecklist(db, ctx, b) {
    const { c, i, it } = await checkStep(db, ctx, b.courseId, b.step);
    if (it.kind !== 'checklist') fail(400, 'This step is not a checklist');
    const n = (it.list || []).length, t = Array.isArray(b.ticks) ? b.ticks : [];
    if (!n) fail(400, 'This checklist has no items');
    if (t.length !== n || t.some(x => x !== true)) fail(400, 'Tick every item first');
    await update(db, 'surveyResp', ctx.emp, d => { d = d || {}; d[c.id + ':' + i] = { ticks: t, at: iso(ctx.now) }; return d; }, {});
    await markDone(db, ctx, c.id, i, { at: day(ctx.now, ctx.tz), src: 'checklist' });
    return { done: true };
  }
  const asgKey = (emp, cid, i) => emp + '|' + cid + '|' + i;
  async function submitAssignment(db, ctx, b) {
    const { c, i, it, st } = await checkStep(db, ctx, b.courseId, b.step);
    if (it.kind !== 'assignment') fail(400, 'This step is not an assignment');
    if (st.done) fail(409, 'This assignment is already accepted');
    const text = str(b.text, 4000, 'Your answer'), link = str(b.link, 500, 'The link');
    if (!text && !link) fail(400, 'Write your answer or add a link to your work');
    if (link && (!/^https:\/\/\S+\.\S+/.test(link) || it.allowLink === false)) fail(400, it.allowLink === false ? 'This assignment takes a written answer only' : 'The link must start with https://');
    const key = asgKey(ctx.emp, c.id, i);
    await update(db, 'asgSub', key, d => { const h = (d && d.history) || []; if (d && d.status === 'Submitted') fail(409, 'Already submitted: wait for the review');
      return { id: key, learnerEmp: ctx.emp, courseId: c.id, step: i, title: it.title || 'Assignment', text, link, status: 'Submitted', at: iso(ctx.now),
        history: h.concat(d ? [{ text: d.text, link: d.link, at: d.at, status: d.status, comment: d.comment || '', by: d.reviewedBy || '' }] : []).slice(-10) }; }, null);
    return { submitted: true };
  }
  async function reviewAssignment(db, ctx, b) {
    if (!can(ctx, 'gradebook')) fail(403, 'Reviewing assignments needs the Gradebook permission');
    const cur = await db.get('asgSub', String(b.id || '')); if (!cur) fail(404, 'Submission not found');
    if (cur.data.status !== 'Submitted') fail(409, 'This submission was already reviewed');
    if (cur.data.learnerEmp === ctx.emp) fail(403, 'You cannot review your own assignment');
    const accept = b.decision === 'accept', comment = str(b.comment, 1000, 'Comment');
    if (!accept && !comment) fail(400, 'Say what to change when you return an assignment');
    const d = cur.data;
    await update(db, 'asgSub', d.id, x => ({ ...x, status: accept ? 'Accepted' : 'Returned', comment, reviewedBy: ctx.emp, reviewedAt: iso(ctx.now) }));
    if (accept) await markDone(db, { ...ctx, emp: d.learnerEmp }, d.courseId, d.step, { at: day(ctx.now, ctx.tz), src: 'assignment' });
    return { status: accept ? 'Accepted' : 'Returned' };
  }

  /* ---------- feedback, requests, profile, forum ---------- */
  async function answerFeedback(db, ctx, b) {
    const key = String(b.key || ''), parts = key.split('|'); if (parts.length !== 4 || parts[3] !== ctx.emp) fail(403, 'This feedback request is not addressed to you');
    const form = (await db.get('lcms', String(b.formId)) || fail(404, 'Form not found')).data;
    if (form.type !== 'Feedback form' || form.level !== parts[2]) fail(400, 'Wrong form');
    const a = Array.isArray(b.answers) ? b.answers : [];
    const answers = form.qs.map((q, k) => { if (q.kind === 'rating') { const n = Number(a[k]); if (!Number.isInteger(n) || n < 1 || n > 5) fail(400, 'Rate question ' + (k + 1)); return n; } return str(a[k], 1000, 'Answer ' + (k + 1)); });
    await update(db, 'fbLog', key, d => { d = d || {}; if (d.response) fail(409, 'Already answered'); return { ...d, response: { at: iso(ctx.now), answers } }; }, {});
    return { ok: true };
  }
  async function requestAccess(db, ctx, b) {
    const c = await course(db, b.courseId); if (c.status !== 'Published') fail(400, 'Course not available');
    if (await enrolled(db, ctx, c.id)) fail(409, 'This course is already assigned to you');
    const reason = str(b.reason, 500, 'Reason'); if (reason.length < 10) fail(400, 'Tell your manager why you need this course (at least 10 characters)');
    const me = await db.get('users', String(ctx.userKey)), managerKey = me && me.data.managerKey || '';
    const id = 'rq-' + ctx.emp + '-' + c.id, cur = await db.get('accessReqs', id);
    if (cur && cur.data.status === 'Pending') fail(409, 'You already asked for this course');
    await db.put('accessReqs', id, { id, empId: ctx.emp, managerKey, courseId: c.id, course: c.title, reason, at: iso(ctx.now), status: 'Pending' }, cur ? cur.version : null);
    return { id };
  }
  async function decideRequest(db, ctx, b) {
    const r = await db.get('accessReqs', String(b.id)); if (!r) fail(404, 'Request not found');
    if (!can(ctx, 'assignments') && !(ctx.userKey && r.data.managerKey === String(ctx.userKey))) fail(403, 'Only the person’s manager or someone with the Course assignment permission can decide this');
    if (r.data.status !== 'Pending') fail(409, 'Already decided');
    if (r.data.empId === ctx.emp && ctx.role !== 'Admin') fail(403, 'You cannot decide your own request');
    const today = day(ctx.now, ctx.tz), approve = !!b.approve;
    // A due date sent by the browser must be a real date from today on (a past date would assign the course already overdue).
    let due = day(new Date(ctx.now.getTime() + 30 * 864e5), ctx.tz);
    if (b.due != null && b.due !== '') { const ok = /^\d{4}-\d{2}-\d{2}$/.test(String(b.due)) && !isNaN(Date.parse(b.due + 'T12:00:00Z')) && String(b.due) >= today && String(b.due) <= day(new Date(ctx.now.getTime() + 730 * 864e5), ctx.tz);
      if (!ok) fail(400, 'Choose a due date from today to two years ahead'); due = String(b.due); }
    if (approve) { const c = await db.get('adminCourses', String(r.data.courseId)); if (!c || c.data.status !== 'Published') fail(409, 'This course is no longer published, so it cannot be assigned'); }
    if (!(await db.put('accessReqs', r.data.id, { ...r.data, status: approve ? 'Approved' : 'Declined', byEmp: ctx.emp, decidedAt: iso(ctx.now) }, r.version))) fail(409, 'Someone else just decided this request');
    if (approve) {
      await update(db, 'enroll', r.data.empId, d => { d = d || {}; d[r.data.courseId] = d[r.data.courseId] || due; return d; }, {});
      await update(db, 'assignedOn', r.data.empId, d => { d = d || {}; d[r.data.courseId] = day(ctx.now, ctx.tz); return d; }, {});
    }
    return { ok: true };
  }
  const PROFILE_FIELDS = { phone: v => { v = str(v, 20, 'Phone'); if (v && !/^[0-9+ ()-]{7,20}$/.test(v)) fail(400, 'Phone number: 7–15 digits'); return v; }, preferred: v => str(v, 40, 'Preferred name'), pronouns: v => str(v, 20, 'Pronouns'), bio: v => str(v, 300, 'About') };
  async function updateProfile(db, ctx, b) {
    const patch = {}; for (const k in PROFILE_FIELDS) if (b[k] !== undefined) patch[k] = PROFILE_FIELDS[k](b[k]);
    await update(db, 'users', String(ctx.userKey), d => { if (!d || d.empId !== ctx.emp) fail(403, 'Not your profile'); return { ...d, ...patch }; });
    return { ok: true, patch };
  }
  async function post(db, ctx, b) {
    const body = str(b.body, 4000, 'Post'); if (!body) fail(400, 'Write something first');
    if (b.threadId) {
      await update(db, 'threads', String(b.threadId), d => { if (!d) fail(404, 'Thread not found'); return { ...d, replies: (d.replies || []).concat([{ id: 'p' + uid().slice(0, 10), authorKey: String(ctx.userKey || ''), author: ctx.name || '', body, at: iso(ctx.now) }]) }; });
      return { ok: true };
    }
    const id = 't' + uid().slice(0, 12), title = str(b.title, 140, 'Title'); if (!title) fail(400, 'Add a title');
    await db.put('threads', id, { id, title, body, authorKey: String(ctx.userKey || ''), author: ctx.name || '', at: iso(ctx.now), replies: [], tag: str(b.tag, 40, 'Topic') }, null);
    return { id };
  }

  /* ---------- SCORM ----------
   * scormLaunch  writes the launch session 'scormSess' (server-only) and returns a link to the content site. The
   *              session key is per person + step (or per person + module for an LCMS preview), so a relaunch
   *              replaces the session id and every older link stops working.
   * scormPing    renews the idle timeout while the package is on screen.  scormEnd  ends it (leaving the step).
   * scormCommit  records the package's reported status; completion counts only after the minimum time.        */
  const idleMs = ctx => Math.max(5, Math.min(120, Number(ctx.scormIdleMin) || 30)) * 60000;
  const sessKey = (ctx, b) => b.moduleId != null ? 'pv|' + ctx.emp + '|' + String(b.moduleId) : ctx.emp + '|' + String(b.courseId) + '|' + Number(b.step);
  async function scormLaunch(db, ctx, b) {
    if (!ctx.signKey || !ctx.contentOrigin) fail(500, 'SCORM content site is not configured (CONTENT_ORIGIN, CONTENT_SIGNING_KEY)');
    let mod, it = null, c = null, i = null;
    if (b.moduleId != null) {   // preview from LCMS
      if (!can(ctx, 'lcms') && !can(ctx, 'courseAdmin')) fail(403, 'Previewing packages needs the LCMS permission');
      mod = (await db.get('lcms', String(b.moduleId)) || fail(404, 'Module not found')).data;
    } else {
      ({ c, i, it } = await checkStep(db, ctx, b.courseId, b.step));
      if (!PKG_KINDS.includes(it.kind) || !it.moduleId) fail(400, 'This step is not a package');
      mod = (await db.get('lcms', String(it.moduleId)) || fail(404, 'Package not found')).data;
    }
    const f = mod.file || {};
    if (!f.path || !/^[A-Za-z0-9_-]+\/scorm\/[A-Za-z0-9_-]+\/$/.test(f.path) || !f.path.startsWith(ctx.org + '/')) fail(409, 'This package has not been uploaded to the content store');
    const launch = String(f.launch || 'index.html').replace(/^\/+/, '');
    if (launch.split('/').some(p => !p || p === '.' || p === '..' || /[\\%]/.test(p) || /[\u0000-\u001f]/.test(p))) fail(400, 'Invalid launch file');
    const key = sessKey(ctx, b), sid = uid() + uid().slice(0, 16), nowMs = ctx.now.getTime();
    await update(db, 'scormSess', key, d => ({ sid, emp: ctx.emp, prefix: f.path, courseId: c ? c.id : null, step: i, moduleId: String(it ? it.moduleId : b.moduleId),
      ended: false, firstAt: d && d.firstAt && d.prefix === f.path ? d.firstAt : iso(ctx.now), launchedAt: iso(ctx.now), until: new Date(nowMs + idleMs(ctx)).toISOString(),
      status: d && d.prefix === f.path ? d.status || null : null, score: d && d.prefix === f.path ? d.score ?? null : null }), null);
    if (c) { const ok = ctx.emp + '|' + c.id + '|' + i; if (!(await db.get('stepOpen', ok))) await db.put('stepOpen', ok, { at: iso(ctx.now) }, null); }
    const maxH = Math.max(1, Math.min(12, Number(ctx.scormMaxHours) || 8));
    const token = await signToken(ctx.signKey, { o: ctx.org, p: f.path, e: ctx.emp, s: sid, k: key, x: Math.floor(nowMs / 1000) + maxH * 3600 });
    const origin = ctx.contentOrigin.replace(/\/$/, '');
    return { url: origin + '/c/' + token + '/' + launch.split('/').map(encodeURIComponent).join('/'), origin, sid, pingSecs: Math.floor(idleMs(ctx) / 3000) };
  }
  async function liveSession(db, ctx, b) {
    const key = sessKey(ctx, b), cur = await db.get('scormSess', key);
    if (!cur || cur.data.emp !== ctx.emp || cur.data.sid !== String(b.sid || '') || cur.data.ended) fail(409, 'This SCORM session has ended. Open the package again.');
    if (Date.parse(cur.data.until) <= ctx.now.getTime()) fail(409, 'This SCORM session timed out. Open the package again.');
    return { key, cur };
  }
  async function scormPing(db, ctx, b) {
    const { key } = await liveSession(db, ctx, b), sid = String(b.sid);
    await update(db, 'scormSess', key, d => d && d.sid === sid ? { ...d, until: new Date(ctx.now.getTime() + idleMs(ctx)).toISOString() } : undefined);
    return { ok: true };
  }
  async function scormEnd(db, ctx, b) {
    const key = sessKey(ctx, b), sid = String(b.sid || '');
    await update(db, 'scormSess', key, d => d && d.sid === sid && d.emp === ctx.emp ? { ...d, ended: true, until: iso(ctx.now) } : undefined);
    return { ok: true };
  }
  async function scormCommit(db, ctx, b) {
    if (b.moduleId != null) fail(400, 'Previews are not recorded');
    const { c, i, it, st } = await checkStep(db, ctx, b.courseId, b.step);
    if (it.kind !== 'scorm') fail(400, 'This step is not a SCORM package');
    const { key } = await liveSession(db, ctx, b), sid = String(b.sid);
    const status = String(b.status || '').toLowerCase().slice(0, 20), n = Number(b.score), score = b.score == null || b.score === '' || !Number.isFinite(n) ? null : Math.max(0, Math.min(100, n));
    const s2 = await update(db, 'scormSess', key, d => d && d.sid === sid ? { ...d, status: status || d.status || null, score: score ?? d.score ?? null, lastCommit: iso(ctx.now),
      until: new Date(ctx.now.getTime() + idleMs(ctx)).toISOString() } : undefined);
    if (st.done) return { done: true };
    if (!SCORM_DONE.test(s2.status || '')) return { done: false, status: s2.status || null };
    const need = scormNeed(it), spent = (ctx.now - new Date(s2.firstAt)) / 1000;
    if (spent + 2 < need) return { done: false, status: s2.status, wait: Math.ceil(need - spent) };
    await markDone(db, ctx, c.id, i, { at: day(ctx.now, ctx.tz), src: 'scorm', ...(s2.score != null ? { score: s2.score } : {}) });
    return { done: true };
  }

  /* ---------- documents library (SOPs, policies, handbooks) ----------
   * A document is visible to a non-manager when it is Published, its audience is 'All' or their base role, and today is
   * inside its effective … expiry window. The same rule is in the database policy (sf_read_ok) and mirrored in the app
   * (js/admin/documents.js). Only the current version's file can be opened by non-managers. */
  const docVisible = (d, role, today) => !!d && d.status === 'Published' && Array.isArray(d.audience) && (d.audience.includes('All') || d.audience.includes(role))
    && (!d.effective || d.effective <= today) && (!d.expiry || d.expiry >= today);
  const docCurPath = d => { const v = ((d && d.versions) || []).find(x => x.v === d.cur); return (v && v.file && typeof v.file.path === 'string' && v.file.path) || ''; };
  /* Viewed / acknowledged, recorded with the server's clock. An acknowledgement needs the current version to have been
   * opened first, and only required-reading documents take one. */
  async function docSeen(db, ctx, b) {
    const id = str(b.docId, 40, 'Document'); if (!id) fail(400, 'Which document?');
    const row = await db.get('docs', id); if (!row) fail(404, 'Document not found');
    const d = row.data, today = day(ctx.now, ctx.tz), ack = b.ack === true;
    if (!docVisible(d, ctx.role, today) && !can(ctx, 'documents')) fail(403, 'This document is not available to you');
    if (ack && !d.mandatory) fail(400, 'This document does not need an acknowledgement');
    await update(db, 'docAck', ctx.emp, cur => { const e = cur[id] || {};
      if (ack) { if (e.viewedV !== d.cur) fail(409, 'Open the document before acknowledging it'); if (e.ackV === d.cur) return undefined;
        return { ...cur, [id]: { ...e, ackAt: iso(ctx.now), ackV: d.cur } }; }
      return { ...cur, [id]: { ...e, viewedAt: e.viewedAt || iso(ctx.now), lastViewAt: iso(ctx.now), viewedV: d.cur } }; }, {});
    return { ok: true };
  }

  /* Sign-in record for the User login report: count, first and last time, method. Server clock; browsers can't write it. */
  async function signedIn(db, ctx, b) { const m = b.method === 'emp' ? 'emp' : 'email', now = iso(ctx.now);
    await update(db, 'loginLog', ctx.emp, cur => ({ n: (cur.n || 0) + 1, first: cur.first || now, last: now, by: { ...(cur.by || {}), [m]: ((cur.by || {})[m] || 0) + 1 } }), {});
    return { ok: true }; }

  // rows no browser ever reads (Row Level Security hides them from everyone except the service role)
  const SERVER_PRIVATE = ['attempt', 'stepOpen', 'scormSess'];
  const ACTIONS = { scormLaunch, scormPing, scormEnd, scormCommit, startAttempt, answer, submit, rescore, openStep, completeStep, submitSurvey, submitChecklist, submitAssignment, reviewAssignment, answerFeedback, requestAccess, decideRequest, updateProfile, post, docSeen, signedIn };
  async function handle(db, ctx, action, body) {
    const fn = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null; if (!fn) fail(400, 'Unknown action');
    // Ids and keys sent by the browser are used as record keys: built-in object property names are never valid ones.
    for (const k in (body || {})) { const v = body[k]; if (k === '__proto__' || (typeof v === 'string' && (v === '__proto__' || v === 'constructor' || v === 'prototype'))) fail(400, 'Invalid value'); }
    if (!ctx.emp) fail(403, 'Your login is not linked to a Skillforge account');
    // Record every row written so the app can re-read exactly those rows afterwards.
    const touched = [], seen = new Set(), tdb = { ...db, put: async (c, k, d, v) => { const ok = await db.put(c, k, d, v); if (ok && !seen.has(c + '|' + k)) { seen.add(c + '|' + k); touched.push({ coll: c, key: String(k) }); } return ok; } };
    const out = await fn(tdb, ctx, body || {});
    return { ...(out || {}), _touched: touched.filter(t => !SERVER_PRIVATE.includes(t.coll)) };
  }
  globalThis.LearningCore = { day, handle, Fail, sanitize, toOriginal, viewNeed, scormNeed, hasKeys, update, signToken, docVisible, docCurPath, SERVER_PRIVATE, ACTIONS: Object.keys(ACTIONS) };
})();
