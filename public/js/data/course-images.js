/* Skillforge LMS — course cover images (banner + icon) for the published courses, as an admin would upload them.
 * Images live in assets/courses/ (same origin, so the Content-Security-Policy and the engine's url() guard allow them).
 * Load AFTER js/data/seed.js and js/data/scale.js, and before the app mounts (js/main.js).
 * The ten named demo courses always get a cover; sample-catalogue drafts are left without one. */
(function () {
  'use strict';
  const DIR = 'assets/courses/';
  const img = (key, kind) => ({ src: DIR + key + (kind === 'icon' ? '-icon' : '') + '.jpg', name: key + (kind === 'icon' ? '-icon' : '') + '.jpg', uploaded: true });
  const set = (c, key, any) => { if (!key || (!any && c.status !== 'Published')) return; if (!c.banner) c.banner = img(key, 'banner'); if (!c.icon) c.icon = img(key, 'icon'); };

  // The ten named demo courses: one photo each.
  const BY_ID = { change:'change', feedback:'feedback', oneonones:'oneonones', negotiation:'negotiation', eq:'eq', present:'present',
    coaching:'coaching', inclusive:'inclusive', energy:'energy', safety:'safety' };
  if (typeof ADMIN_COURSES0 !== 'undefined') ADMIN_COURSES0.forEach(c => set(c, BY_ID[c.id], true));   // v41: the ten demo courses always have a cover (some are shown to learners while marked Draft)

  // The 1,000-course sample catalogue: titles start with one of 20 subjects; each subject reuses the closest photo.
  const BY_SUBJECT = [
    ['Customer Empathy', 'feedback'], ['Data Privacy', 'safety'], ['Objection Handling', 'negotiation'], ['Time Management', 'energy'],
    ['Negotiation', 'negotiation'], ['Stakeholder Mapping', 'change'], ['Conflict Resolution', 'oneonones'], ['Business Writing', 'eq'],
    ['Excel for Analysts', 'present'], ['Coaching', 'coaching'], ['Remote Collaboration', 'inclusive'], ['Information Security', 'safety'],
    ['POSH Awareness', 'inclusive'], ['Anti-bribery', 'oneonones'], ['Quality Audits', 'safety'], ['Escalation Handling', 'feedback'],
    ['Product Knowledge', 'present'], ['Sales Discovery', 'negotiation'], ['Presentation Skills', 'present'], ['Feedback', 'feedback'],
  ];
  const subjectKey = title => { const t = String(title || ''); const m = BY_SUBJECT.find(([s]) => t.startsWith(s + ' ')); return m ? m[1] : null; };
  if (typeof ScaleData !== 'undefined' && ScaleData && typeof ScaleData.build === 'function') {
    const build = ScaleData.build;
    ScaleData.build = function () {
      const d = build.apply(this, arguments);
      (d.adminCourses || []).forEach(c => set(c, BY_ID[c.id] || subjectKey(c.title), !!BY_ID[c.id]));
      return d;
    };
  }
})();
