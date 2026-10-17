/* Skillforge LMS — assessment helpers
 * Builds a learner attempt from a quiz definition, grades each question type and scores it.
 *
 *  Dynamic assessment  quiz.dynamic = true draws quiz.drawCount questions at random
 *                      from the quiz's selected pool, so every attempt is different.
 *  Shuffle             quiz.shuffle reorders questions; quiz.shuffleOpts reorders options.
 *                      True / False keeps its order. Match and Ordering are always shuffled.
 *  Attempts            quiz.attempts ('1' | '2' | '3' | 'Unlimited') plus any extra attempts
 *                      an admin grants to a specific learner.
 *  Marks               v41.22: every question is worth question.marks (a number above 0; written answers: their points). The score is
 *                      the marks earned over the marks of the questions shown, as a percentage. A question without marks counts 1,
 *                      so assessments built before marks existed score exactly as before.
 *  Written answers     are rated by a trainer from 0 to question.points.
 *  Likert scale        is an opinion question and is not scored.
 */
const Assessment = (() => {
  // Randomness: crypto when available (server and modern browsers), so attempt order can't be predicted.
  const rand = () => { try { const a = new Uint32Array(1); globalThis.crypto.getRandomValues(a); return a[0] / 4294967296; } catch (e) { return Math.random(); } };
  const shuffle = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  // Shuffle that never returns the original order (used for Ordering questions).
  const derange = arr => {
    if (arr.length < 2) return arr.slice();
    let a; do { a = shuffle(arr); } while (a.every((v, i) => v === arr[i]));
    return a;
  };

  const TYPES = ['Multiple choice', 'Multiple select', 'True / False', 'Image options', 'Match the following', 'Likert scale', 'Fill in the blank', 'Ordering', 'Written answer'];
  const LIKERT = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
  const isWritten = q => q.type === 'Written answer';
  const isScored = q => q.type !== 'Likert scale';
  const weight = q => (Number(q.marks) > 0 ? Number(q.marks) : 1);   // what a question is worth (also shown to admins as its marks)
  const optCount = q => (q.opts || []).length || (q.pairs || []).length || (q.items || []).length;

  const MEDIA_KINDS = ['image', 'audio', 'video'];
  const MEDIA_ACCEPT = { image:'image/*', audio:'audio/*', video:'video/*' };
  const MEDIA_HINT = { image:'PNG, JPG, GIF or WebP', audio:'MP3, WAV, M4A or OGG', video:'MP4 or WebM' };

  /* Pool = quiz questions that still exist and are not archived. */
  function pool(quiz, bank) {
    return quiz.ids.map(id => bank.find(q => String(q.id) === String(id))).filter(q => q && !q.archived);
  }
  function shownCount(quiz, bank) {
    const n = pool(quiz, bank).length;
    return quiz.dynamic ? Math.min(Math.max(1, quiz.drawCount || 1), n) : n;
  }

  /* Attempts: allowed = quiz setting + extra granted to this learner. */
  function attemptsInfo(quiz, used, extra) {
    const unlimited = quiz.attempts === 'Unlimited';
    const base = unlimited ? Infinity : parseInt(quiz.attempts, 10) || 1;
    const allowed = base + (extra || 0);
    const u = used || 0;
    return { unlimited, base, extra: extra || 0, allowed, used: u, left: unlimited ? Infinity : Math.max(0, allowed - u), canStart: unlimited || u < allowed };
  }

  /* Returns [{ qid, order }]. order = display position -> original index
     (options, the right-hand column for Match, or the starting order for Ordering). */
  function buildAttempt(quiz, bank) {
    let qs = pool(quiz, bank);
    if (quiz.dynamic) {
      const picked = new Set(shuffle(qs).slice(0, shownCount(quiz, bank)).map(q => q.id));
      qs = qs.filter(q => picked.has(q.id));
    }
    if (quiz.shuffle) qs = shuffle(qs);
    return qs.map(q => {
      const idx = Array.from({ length: optCount(q) }, (_, i) => i);
      let order = idx;
      if (q.type === 'Match the following') order = shuffle(idx);
      else if (q.type === 'Ordering') order = derange(idx);
      else if (quiz.shuffleOpts && ['Multiple choice', 'Multiple select', 'Image options'].includes(q.type)) order = shuffle(idx);
      return { qid: q.id, order };
    });
  }

  /* Grade one answer: 0..1, or null when not auto-graded (written / Likert). */
  function grade(q, ans) {
    ans = ans || {};
    switch (q.type) {
      case 'Multiple choice': case 'True / False': case 'Image options':
        return ans.sel === q.ans ? 1 : 0;
      case 'Multiple select': {
        const want = new Set(q.answers || []), got = new Set(ans.multi || []);
        return want.size === got.size && [...want].every(i => got.has(i)) ? 1 : 0;
      }
      case 'Match the following': {
        const m = ans.match || {}, n = q.pairs.length;
        return n ? q.pairs.filter((_, i) => m[i] === i).length / n : 0;
      }
      case 'Fill in the blank': {
        const norm = v => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
        return (q.accept || []).some(a => norm(a) === norm(ans.text)) ? 1 : 0;
      }
      case 'Ordering': {
        const o = ans.order || [];
        return o.length === q.items.length && o.every((v, i) => v === i) ? 1 : 0;
      }
      default: return null;
    }
  }

  /* Score an attempt. Each scored question counts its marks (1 when it has none); a written answer earns marks * rating / points.
     Likert questions are excluded. */
  function score(attempt, answers, bank, reviews) {
    let auto = 0, autoRight = 0, written = 0, rated = 0, earned = 0, scoredW = 0, gradedW = 0;
    attempt.forEach((a, i) => {
      const q = bank.find(x => String(x.id) === String(a.qid));
      const ans = answers[i] || {};
      if (!q || !isScored(q)) return;
      const w = weight(q);
      scoredW += w;
      if (isWritten(q)) {
        written++;
        const r = reviews.find(x => x.id === ans.reviewId);
        if (r && r.rating !== null) { rated++; gradedW += w; earned += w * r.rating / q.points; }
      } else {
        auto++; gradedW += w;
        const g = grade(q, ans) || 0;
        earned += w * g;
        if (g === 1) autoRight++;
      }
    });
    const pending = written - rated;
    const pct = pending ? (gradedW ? Math.round(100 * earned / gradedW) : 0) : (scoredW ? Math.round(100 * earned / scoredW) : 100);
    return { auto, autoRight, written, rated, pending, pct, final: pending === 0 };
  }
  return { rand, shuffle, TYPES, LIKERT, isWritten, isScored, weight, pool, shownCount, attemptsInfo, buildAttempt, grade, score, MEDIA_KINDS, MEDIA_ACCEPT, MEDIA_HINT };
})();

/* Shared with the server: supabase/functions/_shared/assessment.js is an exact copy (tests check this). */
if (typeof globalThis !== 'undefined') globalThis.Assessment = Assessment;
