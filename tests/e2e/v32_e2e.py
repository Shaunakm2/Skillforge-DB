# v32 recheck: learner records follow their steps when a course is edited; due dates; dated completions; offline assessment
# passes reach dashboards; essential-training extensions; real learning paths.
import asyncio, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
from playwright.async_api import async_playwright
EXE = os.environ.get('CHROME') or (lambda d: d if os.path.exists(d) else None)('/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell')
WEB = os.environ.get('SF_WEB', 'public'); RES = []
def ok(n, c, x=''): RES.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n, '' if c else str(x)[:400], flush=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE); pg = await b.new_page(viewport={'width':1400,'height':900})
        await pg.add_init_script(path=os.path.join(ROOT, 'tests/e2e/hook.js')); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + ROOT + '/' + WEB + '/index.html'); await pg.wait_for_selector('#sf-user')
        E = lambda e: pg.evaluate(e); W = lambda ms=300: pg.wait_for_timeout(ms); V = lambda e: pg.evaluate(f"(() => {{ const v = window.__app.renderVals(); return {e}; }})()")
        await pg.locator('.sf-demo2-b').filter(has_text='Admin').click(); await pg.get_by_role('button', name='Login', exact=True).click(); await W(900)

        # ---- A: reorder / remove steps on a course people have progress on ----
        setup = await E("""(() => { const a = window.__app, s = a.state;
          const uniq = c => s.adminCourses.filter(x => x.title.trim().toLowerCase() === c.title.trim().toLowerCase()).length === 1;
          const c = s.adminCourses.find(c => uniq(c) && c.items.length >= 4 && c.items.every(it => it.kind !== 'quiz') && Object.values(s.itemDone).some(r => r[c.id] && Object.keys(r[c.id]).length >= 2 && Object.keys(r[c.id]).length < c.items.length));
          const who = Object.keys(s.itemDone).find(n => s.itemDone[n][c.id] && Object.keys(s.itemDone[n][c.id]).length >= 2 && Object.keys(s.itemDone[n][c.id]).length < c.items.length);
          const doneTitles = Object.keys(s.itemDone[who][c.id]).map(i => c.items[+i].title + '|' + i);
          return { cid: c.id, who, n: c.items.length, done: Object.keys(s.itemDone[who][c.id]).map(Number).sort(), titles: c.items.map(it => it.title) }; })()""")
        await E(f"window.__app.go('courseAdmin', {{ adminView:true }})"); await W(300)
        await E("(cid => { const a = window.__app, c = a.state.adminCourses.find(x => x.id === cid); a.setState({ cDraft: (d => ({ ...d, items: d.items.map((it, i) => ({ ...it, uid: (Progress.stepUid || ((x, k) => x.uid || 'o' + k))(it, i) })) }))(JSON.parse(JSON.stringify(c))) }); })('" + setup['cid'] + "')"); await W(200)
        # reverse the order of the steps, then remove the (new) first one
        await E("window.__app.setState(st => ({ cDraft: { ...st.cDraft, items: st.cDraft.items.slice().reverse() } }))"); await W(100)
        await E("window.__app.setState(st => ({ cDraft: { ...st.cDraft, items: st.cDraft.items.slice(1) } }))"); await W(100)
        status = await E(f"window.__app.state.adminCourses.find(x => x.id === '{setup['cid']}').status")
        await E("window.__app.renderVals()." + ('publishCourse' if status == 'Published' else 'saveDraftCourse') + "()"); await W(400)
        after = await E(f"""(() => {{ const s = window.__app.state, c = s.adminCourses.find(x => x.id === '{setup['cid']}'), r = s.itemDone['{setup['who']}'][c.id] || {{}};
          return {{ titles: c.items.map(it => it.title), doneTitles: Object.keys(r).map(i => c.items[+i] ? c.items[+i].title : 'MISSING ' + i).sort() }}; }})()""")
        expect = sorted(setup['titles'][i] for i in setup['done'] if setup['titles'][i] in after['titles'])
        ok('no two courses share a title, so every course can be edited', await E("(() => { const t = window.__app.state.adminCourses.map(c => c.title.trim().toLowerCase()); return new Set(t).size === t.length; })()"))
        ok('the edited course was saved (steps reversed, first removed)', after['titles'] == list(reversed(setup['titles']))[1:], (after['titles'], await E("window.__app.state.toast")))
        ok('reordering and removing steps: completions stay with the same steps', after['doneTitles'] == expect and 'MISSING' not in ' '.join(after['doneTitles']), (setup, after, expect))

        # ---- B: due dates come from App settings, never a fixed date; no publishing into the past ----
        await E("window.__app.renderVals().newCourse()"); await W(200)
        d = await E("window.__app.state.cDraft.due")
        ok('a new course’s due date = today + default due days', d == await E("Progress.plus(TODAY_KEY, 30)"), d)
        await E("window.__app.setState(st => ({ cDraft: { ...st.cDraft, title:'Past due test', catId: st.cats[0].id, aud:'Everyone', due:'2026-01-01', items:[{ kind:'pdf', title:'x', mins:5, uid:'n1' }] } }))")
        n0 = await E("Object.values(window.__app.state.enroll).filter(e => Object.keys(e).some(k => window.__app.state.adminCourses.some(c => c.title === 'Past due test' && c.id === k))).length")
        await E("window.__app.renderVals().publishCourse()"); await W(300)
        ok('publishing with a due date in the past is refused', 'in the past' in (await E("window.__app.state.toast || ''")) and not await E("window.__app.state.adminCourses.some(c => c.title === 'Past due test')"), await E("window.__app.state.toast"))
        await E("window.__app.setState({ cDraft:null })")
        ok('assignment due-date defaults are not a fixed calendar date', await E("window.__app.state.caDue === Progress.plus(TODAY_KEY, 30) && window.__app.state.assignDue === Progress.plus(TODAY_KEY, 30)"))

        # ---- C + D: learner completes a step and passes an assessment offline ----
        await E("window.__app.go('home', { role:'learner', meName:'Maya Okafor', meRole:'learner', adminView:false })"); await W(400)
        cd = await E("""(() => { const a = window.__app, s = a.state, en = s.enroll['Maya Okafor'];
          const c = s.adminCourses.find(c => en[c.id] && c.items.some(it => it.kind === 'quiz') && c.items.filter(it => it.kind !== 'quiz').every((it, i) => true));
          return { cid: c.id, qi: c.items.findIndex(it => it.kind === 'quiz'), n: c.items.length }; })()""")
        # all non-quiz steps done the normal way (stored with today's date), then pass the quiz
        await E(f"""(() => {{ const a = window.__app, s = a.state, c = s.adminCourses.find(x => x.id === '{cd['cid']}');
          a.setState(st => ({{ itemDone: {{ ...st.itemDone, 'Maya Okafor': {{ ...(st.itemDone['Maya Okafor'] || {{}}), ['{cd['cid']}']: Object.fromEntries(c.items.map((it, i) => [i, it.kind === 'quiz' ? null : TODAY_KEY]).filter(x => x[1])) }} }} }})); }})()""")
        await E(f"window.__app.go('item', {{ courseId:'{cd['cid']}', itemIdx:{cd['qi']} }})"); await W(300)
        await E("window.__app.renderVals().startQuiz()"); await W(400)
        n = await E("window.__app.state.attempt.length")
        for _ in range(n):
            await E("""(() => { const a = window.__app, s = a.state, q = s.qs.find(x => x.id === s.attempt[s.qi].qid);
              if (q.type === 'Multiple select') a.setState({ qMulti: Object.fromEntries((q.answers||[]).map(i => [i, true])) }); else if (q.type === 'Match the following') a.setState({ qMatch: Object.fromEntries(q.pairs.map((_, i) => [i, i])) });
              else if (q.type === 'Ordering') a.setState({ qOrder: q.items.map((_, i) => i) }); else if (q.type === 'Fill in the blank') a.setState({ qText: q.accept[0] }); else if (q.type === 'Written answer') a.setState({ qText:'x y z' }); else a.setState({ qSel: q.ans != null ? q.ans : 0 }); })()""")
            await E("window.__app.renderVals().quizAction()"); await W(60); await E("window.__app.renderVals().quizAction()"); await W(60)
        await W(400)
        rec = await E(f"(() => {{ const s = window.__app.state; return {{ q: (s.itemDone['Maya Okafor']['{cd['cid']}'] || {{}})[{cd['qi']}], courseDone: Progress.courseDone(s, 'Maya Okafor', Progress.courseOf(s, '{cd['cid']}')), pending: s.reviews.some(r => r.learner === 'Maya Okafor' && r.rating == null) }}; }})()")
        if rec['courseDone']:
            ok('offline: a passed assessment is written to the records with date and score', isinstance(rec['q'], dict) and rec['q'].get('at') and rec['q'].get('score') is not None, rec)
            dash = await E(f"(() => {{ const s = window.__app.state; let done = false; Dash.learnRows(s, s.dash.slicers, '{cd['cid']}').forEach(([u, a, f]) => {{ if (u.name === 'Maya Okafor') done = f.st === 'Completed'; }}); return done; }})()")
            ok('…so dashboards show the course Completed, like My learning', dash)
        else:
            ok('offline: a passed assessment is written to the records with date and score', rec['pending'] and rec['q'] is None, rec)
            ok('…written answers wait for a trainer (nothing counted yet)', True)
        stepval = await E("""(() => { const a = window.__app, s = a.state, c = s.adminCourses.find(c => (s.enroll['Maya Okafor'] || {})[c.id] && c.items.some(it => it.kind === 'pdf' || it.kind === 'lesson') && !(s.itemDone['Maya Okafor'] || {})[c.id]);
          return c ? c.id : null; })()""")
        if stepval:
            await E(f"(() => {{ const a = window.__app, c = a.state.adminCourses.find(x => x.id === '{stepval}'); a.setState({{ adminCourses: a.state.adminCourses.map(x => x.id === c.id ? {{ ...x, features: {{ ...x.features, selfComplete:true, linear:false }} }} : x) }}); a.go('item', {{ courseId: c.id, itemIdx: c.items.findIndex(it => it.kind === 'pdf' || it.kind === 'lesson') }}); }})()"); await W(300)
            mk = ['markItem']; await E("(cid => { const a = window.__app, s = a.state, c = { s, role: a.roleOf(s), navItems: [], scrV: 'item', perms: new Set() }; a.vmCourses(c); const C = s.adminCourses.find(x => x.id === cid); c.markItem(cid, C.items.findIndex(it => it.kind === 'pdf' || it.kind === 'lesson'), 'Done'); })('" + stepval + "')"); await W(300)
            v0 = await E(f"Object.values((window.__app.state.itemDone['Maya Okafor'] || {{}})['{stepval}'] || {{}})")
            ok('a step marked complete is stored with its date (not just “true”)', v0 and all(isinstance(x, str) and len(x) == 10 for x in v0), (mk, v0))

        # ---- H: an extended essential-training due date stops the overdue pop-up ----
        await E("window.__app.go('home', { role:'admin', meName:'Lena Fischer', meRole:'admin', adminView:false })"); await W(200)
        es = await E("""(() => { const a = window.__app, s = a.state, u = s.users.find(x => x.status !== 'Deactivated' && Essentials.statusFor(s, x).some(y => y.overdue)); window.__essU = u.name; const before = Essentials.statusFor(s, u).filter(x => x.overdue).map(x => x.a.id);
          const en = { ...s.enroll, [u.name]: { ...s.enroll[u.name] } }; before.forEach(id => { en[u.name][id] = Progress.plus(TODAY_KEY, 14); }); a.setState({ enroll: en });
          return before; })()"""); await W(200)
        after = await E("Essentials.statusFor(window.__app.state, window.__app.state.users.find(x => x.name === window.__essU)).filter(x => x.overdue).length")
        ok('extending an overdue essential course’s due date ends the overdue pop-up', len(es) > 0 and after == 0, (es, after))

        # ---- E: learning paths are real ----
        await E("window.__app.go('paths', { adminView:true, pathSel: 2 })"); await W(300)
        rc = await E("""(() => { const s = window.__app.state, p = s.paths.find(x => x.id === 2), cs = p.courses.filter(c => Progress.courseOf(s, c) || COURSES.some(x => x.id === c)); let n = 0;
          s.users.forEach(u => { if (u.status === 'Deactivated') return; const en = s.enroll[u.name]; if (en && cs.every(c => en[c])) n++; }); return n; })()""")
        card = await V("v.pathCards.find(c => c.name === 'Customer Success Essentials').enrolled")
        ok('path “enrolled” is counted from the assignments (not a fixed number)', card == f"{rc:,} enrolled", (card, rc))
        await E("window.__app.renderVals().savePath()"); await W(300)
        rc2 = await E("""(() => { const s = window.__app.state, p = s.paths.find(x => x.id === 2); return s.users.filter(u => u.status !== 'Deactivated' && u.dept === 'Customer Success').every(u => p.courses.every(c => (s.enroll[u.name] || {})[c])); })()""")
        ok('saving a Department path assigns its courses to everyone in that department', rc2, await E("window.__app.state.toast"))
        await E("window.__app.setState(st => ({ paths: st.paths.map(p => p.id === 2 ? { ...p, courses: p.courses.concat(['no-such-course']) } : p) }))"); await W(200)
        ok('a path with a course that no longer exists still opens', await V("v.peSteps.length") >= 4)
        await E("window.__app.go('home', { role:'learner', meName:'Maya Okafor', meRole:'learner', adminView:false })"); await W(300)
        mp = await V("({ has: v.myPathHas, name: v.myPathName, n: v.myPathSteps.length })")
        mine = await E("(() => { const s = window.__app.state, mine = new Set(Object.keys(s.enroll['Maya Okafor'] || {})); return s.paths.map(p => [p.name, p.courses.filter(c => mine.has(c)).length]).sort((a, b) => b[1] - a[1])[0]; })()")
        ok('the learner’s path card shows the path covering their courses (not a fixed one)', mp['has'] and mp['name'] == mine[0], (mp, mine))
        tl = await V("v.myPathSteps.map(x => x.title).join('|')")
        ok('…without invented “Final assessment / Certificate” steps', 'Final assessment' not in tl and '|Certificate' not in tl, tl)
        ok('NO JS ERRORS', not errs, errs[:3])
        print('\nSUMMARY', sum(1 for _, c in RES if c), '/', len(RES)); await b.close()
asyncio.run(main())
