/* Skillforge LMS — essential training for new joiners.
 * - A course marked "Essential for new joiners" (Course catalog › course › Assignment) must be completed within
 *   N working days of a person's joining date (default 30; weekends and holidays don't count).
 * - It applies to people who joined on or after the date the rule was switched on, and is assigned to them
 *   automatically with the deadline as the due date.
 * - Anyone past the deadline sees a pop-up when they sign in, and a red banner on Home until it's done. */
const Essentials = {
  /* Courses whose rule covers this person. */
  rulesFor: (courses, u) => courses.filter(a => a.essential && a.status === 'Published' && a.active !== false && u.joined && a.essentialFrom && u.joined >= a.essentialFrom),
  deadline: (u, a, holidays) => Progress.workingDeadline(u.joined, a.essentialDays || 30, holidays),
  /* Assign essential courses to everyone they apply to (existing due dates are kept). Returns { enroll, assignedOn, added }. */
  apply(enroll, courses, users, holidays, assignedOn) {
    const e = { ...enroll }, on = { ...(assignedOn || {}) }; let added = 0;
    users.filter(u => u.status !== 'Deactivated').forEach(u => Essentials.rulesFor(courses, u).forEach(a => {
      if ((e[u.name] || {})[a.id]) return;
      e[u.name] = { ...(e[u.name] || {}), [a.id]: Essentials.deadline(u, a, holidays) };
      on[u.name + '|' + a.id] = u.joined > TODAY_KEY ? TODAY_KEY : u.joined; added++;
    }));
    return { enroll: e, assignedOn: on, added };
  },
  /* Status of each essential course for one person. */
  statusFor(s, u) {
    // The person's own due date wins: an admin who extends it (or unassigns the course as an exemption) stops the pop-up.
    const en = s.enroll[u.name] || {};
    return Essentials.rulesFor(s.adminCourses, u).filter(a => en[a.id]).map(a => {
      const by = en[a.id] || Essentials.deadline(u, a, s.holidays), done = Progress.courseDone(s, u.name, a);
      const left = done ? 0 : TODAY_KEY > by ? -Progress.workingDaysBetween(by, TODAY_KEY, s.holidays) : Progress.workingDaysBetween(TODAY_KEY, by, s.holidays);
      return { a, by, done, overdue: !done && TODAY_KEY > by, left };
    });
  },
};
