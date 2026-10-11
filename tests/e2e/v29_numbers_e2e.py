# v29: the audit fixes. Every number is compared with an independent recount from the raw records.
import asyncio, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
from playwright.async_api import async_playwright
EXE = os.environ.get('CHROME') or (lambda d: d if os.path.exists(d) else None)('/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell')
WEB = os.environ.get('SF_WEB', 'public')
RES = []
def ok(n, c, x=''): RES.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n, '' if c else str(x)[:400], flush=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE); pg = await b.new_page(viewport={'width':1400,'height':900})
        await pg.add_init_script(path=os.path.join(ROOT, 'tests/e2e/hook.js')); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + ROOT + '/' + WEB + '/index.html'); await pg.wait_for_selector('#sf-user')
        E = lambda e: pg.evaluate(e); W = lambda ms=300: pg.wait_for_timeout(ms)
        V = lambda e: pg.evaluate(f"(() => {{ const v = window.__app.renderVals(); return {e}; }})()")
        await pg.locator('.sf-demo2-b').filter(has_text='Admin').click(); await pg.get_by_role('button', name='Login', exact=True).click(); await W(1000)

        # ---- #5 attrition: people who left after joining ÷ people who joined (did-not-join excluded, as on the batch page)
        a = await E("""(() => { const s = window.__app.state, st = new Map(s.statuses.map(x => [x.id, x])); let joined = 0, left = 0, ns = 0;
          s.batches.forEach(b => b.trainees.forEach(n => { const l = (b.st || {})[n] || [], S = st.get(l.length ? l[l.length - 1].status : 'st_intr') || { type:'active' };
            if (S.type === 'noshow') ns++; else { joined++; if (groupOf(S) === 'attrited') left++; } }));
          const t = Dash.train(s, s.dash.slicers).tot; return { joined, left, ns, rate: Math.round(left / joined * 1000) / 10, dash: Dash.measure('train', t, 'attritionRate'), dashLeft: t.attrJoined }; })()""")
        ok('attrition rate excludes people who never joined (recount)', a['dash'] == a['rate'] and a['dashLeft'] == a['left'], a)
        await E("window.__app.go('training', { adminView:true, trTab:'overview' })"); await W(800)
        tile = await V("v.trKpis.find(k => k.l === 'Attrition')")
        ok('Training overview tile: left after joining, did-not-join shown beside it', str(tile['v']) == str(a['left']) and f"{a['ns']} did not join" in tile['sub'], tile)

        # ---- #6/#8 day-1 KPIs: no value (—) where day 1 is not marked; HRMS day 0 = New Hire batches that started
        d = await E("""(() => { const s = window.__app.state; Dash.useKpis(s.dash.kpis); const T = Dash.train(s, s.dash.slicers), out = { unmarked: 0, bad: [] };
          for (const [k, r] of T.T.batch) { if (r.dM[1]) continue; out.unmarked++; ['k:kp1', 'k:kp2', 'k:kp3'].forEach(m => { const v = Dash.measure('train', r, m); if (v != null) out.bad.push([k, m, v]); }); }
          let hr0 = 0; s.batches.forEach(b => b.trainees.forEach(n => { const u = s.users.find(x => x.name === n) || {}; if (b.traineeType === 'New Hire' && b.start <= TODAY_KEY && u.joined && u.joined <= b.start) hr0++; }));
          const exist = s.batches.filter(b => b.traineeType !== 'New Hire').reduce((t, b) => t + b.trainees.length, 0);
          return { ...out, hr0, dashHr0: T.tot.hrms0, exist }; })()""")
        ok('batches with no day-1 attendance show — for every day-1 KPI', d['unmarked'] > 0 and not d['bad'], d)
        ok('HRMS joined on day 0 counts only New Hire batches that have started (recount)', d['hr0'] == d['dashHr0'] and d['exist'] > 0, d)

        # ---- #7 completion-month rows: no fake 100%; due month adds up to every assignment
        m = await E("""(() => { const s = window.__app.state, L = Dash.learn(s, s.dash.slicers, 'All'), mo = [...L.T.month.values()], du = [...L.T.dueMonth.values()];
          return { rate: [...new Set(mo.map(r => Dash.measure('learn', r, 'completionRate')))], over: [...new Set(mo.map(r => Dash.measure('learn', r, 'overdue')))], done: mo.reduce((t, r) => t + r.completed, 0), tot: L.tot.completed, dueSum: du.reduce((t, r) => t + r.assignments, 0), asg: L.tot.assignments }; })()""")
        ok('completion-month rows show — for rates and status counts (not 100%)', m['rate'] == [None] and m['over'] == [None], m)
        ok('completed by month still adds up to all completions', m['done'] == m['tot'], m)
        ok('new Due month dimension covers every assignment', m['dueSum'] == m['asg'], m)

        # ---- #11 imported completions count on the dashboards (same rule as the reports)
        mg = await E("""(() => { const a = window.__app, s = a.state, u = s.users.find(x => x.status === 'Active' && s.enroll[x.name] && Object.keys(s.enroll[x.name]).some(c => !Progress.courseDone(s, x.name, Progress.courseOf(s, c) || { items:[] })));
          const cid = Object.keys(s.enroll[u.name]).find(c => { const r = (s.itemDone[u.name] || {})[c], n = (Progress.courseOf(s, c) || { items:[] }).items.length; return !(r && Object.keys(r).length >= n); });
          const before = Dash.learn(s, s.dash.slicers, 'All').tot.completed;
          a.setState(st => ({ extHistory: st.extHistory.concat([{ id:'exT', user: u.name, empId: u.empId, courseId: cid, status:'Completed', completedOn:'2026-09-01', source:'Test' }]) }));
          return { before, cid, user: u.name }; })()"""); await W(200)
        after = await E("Dash.learn(window.__app.state, window.__app.state.dash.slicers, 'All').tot.completed")
        ok('a completion imported from another LMS counts as completed', after == mg['before'] + 1, (mg, after))

        # ---- #9/#10 People: current headcount, joiners in the last 30 days when no dates are set
        h = await E("""(() => { const s = window.__app.state, t = Dash.hr(s, { ...s.dash.slicers, from:'', to:'' }).tot, f = Progress.plus(TODAY_KEY, -30);
          return { emp: t.employees, acc: t.accounts, j: t.joiners, rc: s.users.filter(u => u.status !== 'Deactivated').length, all: s.users.length, rj: s.users.filter(u => u.joined && u.joined >= f && u.joined <= TODAY_KEY).length }; })()""")
        ok('People = active + invited; all accounts kept as a separate measure', h['emp'] == h['rc'] and h['acc'] == h['all'] and h['emp'] < h['acc'], h)
        ok('joiners with no dates = last 30 days (not everyone)', h['j'] == h['rj'] and h['j'] < h['emp'], h)

        # ---- #18 division by zero shows no value; NZ() gives a number back
        f = await E("[Formula.evaluate(Formula.parse('PCT(1, 0)'), {}), Formula.evaluate(Formula.parse('DIV(1, 0)'), {}), Formula.evaluate(Formula.parse('NZ(PCT(1, 0), 0)'), {})]")
        ok('PCT / DIV by zero → no value, NZ() → 0', f == [None, None, 0], f)

        # ---- #19 bounded cache
        await E("(() => { const s = window.__app.state; for (let i = 0; i < 60; i++) Dash.learn(s, { ...s.dash.slicers, from: Progress.plus('2026-01-01', i) }, 'All'); })()")
        ok('dashboard cache stays bounded (32 entries)', await E("Dash._cacheSize()") <= 32)

        # ---- #20 a deleted KPI is reported on its visual and in the KPI builder, never swapped for another measure
        await E("window.__app.go('dashboard', { adminView:true, dbBoard:'b1' })"); await W(300)
        await E("window.__app.renderVals().dbNewBoard()"); await E("window.__app.setState(st => ({ dbNew: { ...st.dbNew, name:'V29', from:'tpl:t_induction' } }))"); await E("window.__app.renderVals().dbNCreate()"); await W(300); await E("window.__app.renderVals().dbSave()"); await W(500)
        await E("window.__app.setState(st => ({ dash: { ...st.dash, kpis: st.dash.kpis.filter(k => k.code !== 'day1_retained') } }))"); await W(300)
        mv = await V("v.dbVisuals.filter(x => x.isMissing).length")
        ok('visual using a deleted KPI says so (no silent substitute)', mv >= 2, mv)
        await E("window.__app.setState(st => ({ dash: { ...st.dash, kpis: st.dash.kpis.concat([{ id:'kpz', code:'uses_gone', name:'Uses a gone KPI', src:'train', formula:'day1_retained + 1', fmt:'n', dp:'', dir:'up', green:'', amber:'', desc:'' }]) } }))")
        await E("window.__app.go('kpis', { adminView:true })"); await W(300)
        ok('KPI builder flags a formula that no longer works', await V("v.kpiRows.find(k => k.code === 'uses_gone').broken"))

        # ---- #15 drill-through refreshes when the records change
        await E("window.__app.go('dashboard', { adminView:true, dbBoard:'b1' })"); await W(400)
        await E("window.__app.renderVals().dbVisuals.find(x => x.isDonut).slices.find(x => x.l === 'Overdue').drill()"); await W(800)
        c1 = await V("v.dbDrillCount")
        await E("""window.__app.setState(st => { const e = { ...st.enroll }; const open = (n, c) => e[n][c] >= TODAY_KEY && !Object.keys((st.itemDone[n] || {})[c] || {}).length && !Progress.migrated(st, n, c);
          const n = Object.keys(e).find(n => st.users.some(u => u.name === n && u.status === 'Active') && Object.keys(e[n]).some(c => open(n, c))); const cid = Object.keys(e[n]).find(c => open(n, c)); e[n] = { ...e[n], [cid]: '2026-01-01' }; return { enroll: e }; })"""); await W(800)
        c2 = await V("v.dbDrillCount")
        ok('drill-through list refreshes after the records change', int(c2.split(' ')[0].replace(',', '')) == int(c1.split(' ')[0].replace(',', '')) + 1, (c1, c2))
        await E("window.__app.setState({ dbDrill:null })")

        # ---- #1/#2/#4/#14 persistence shape and the viewers' snapshot
        sh = await E("""(() => { const s = window.__app.state, rows = Backend.rowsOf(s), d = rows.find(r => r.coll === 'dash');
          const st = Backend.stateOf(rows.filter(r => r.coll === 'users' || r.coll === 'dashBoard'), { ...s, dash: { slicers: { division:'X' } } });
          return { dashKeys: Object.keys(d.data), boards: rows.filter(r => r.coll === 'dashBoard').length, kpis: rows.filter(r => r.coll === 'dashKpi').length, anySlicers: rows.some(r => r.coll.startsWith('dash') && 'slicers' in r.data),
            viewerBoards: st.dash.boards.length, viewerKpis: st.dash.kpis.length, keepsLocal: st.dash.slicers.division === 'X' && st.dash.edit === false }; })()""")
        ok('saved shape: one row per board and KPI; no filters or edit flag saved', sh['dashKeys'] == ['v', 'templates'] and sh['boards'] > 4 and sh['kpis'] >= 3 and not sh['anySlicers'], sh)
        ok('a viewer’s load (board rows only) rebuilds dashboards and keeps their own filters', sh['viewerBoards'] == sh['boards'] and sh['viewerKpis'] == 0 and sh['keepsLocal'], sh)
        snap = await E("(() => { const b = window.__app.state.dash.boards.find(x => x.name === 'V29'); const j = JSON.stringify(b.snap || {}); return { has: !!b.snap, n: (b.snap || { visuals: [] }).visuals.length, opts: j.includes('courseOpts'), names: j.includes('NW-1') }; })()")
        ok('saving publishes a snapshot (numbers only: no option lists, no employee IDs)', snap['has'] and snap['n'] == 8 and not snap['opts'] and not snap['names'], snap)
        await E("""window.__app.setState(st => ({ roles: st.roles.map(r => r.id === 'r_trainer' ? { ...r, perms: { ...r.perms, dashView: true } } : r) }))""")
        await E("window.__app.go('home', { role:'instructor', meName:'Daniel Reyes', meRole:'instructor', adminView:false })"); await W(300)
        await E("window.__app.setState({ dbBoard: window.__app.state.dash.boards.find(x => x.name === 'V29').id })"); await E("window.__app.go('dashboard', { adminView:true })"); await W(600)
        vv = await V("({ snap: v.dbIsSnap, n: v.dbVisuals.length, exp: v.dbCanExport, sl: v.dbShowSl, drill: v.dbVisuals.some(x => x.isHeat && x.hRows.some(r => r.cells.some(c => typeof c.drill === 'function'))) })")
        ok('viewer sees the snapshot: no filters, no export, no drill-through', vv['snap'] and vv['n'] == 8 and not vv['exp'] and not vv['sl'] and not vv['drill'], vv)

        # ---- #13 reports from real records
        await E("window.__app.go('home', { role:'admin', meName:'Lena Fischer', meRole:'admin', adminView:false })"); await W(300)
        rc = await E("""(() => { const s = window.__app.state, act = s.users.filter(u => u.status !== 'Deactivated'); let asg = 0, done = 0, cert = 0;
          act.forEach(u => { const en = s.enroll[u.name] || {}; for (const c in en) { const a = Progress.courseOf(s, c); if (!a) continue; asg++; const r = (s.itemDone[u.name] || {})[c], n = a.items.length;
            const dn = !!(n && r && Object.keys(r).length >= n) || !!Progress.migrated(s, u.name, c); if (dn) { done++; if (a.features && a.features.cert === true) cert++; } } });
          const f30 = Progress.plus(TODAY_KEY, -29), names = new Set(act.map(u => u.name)), q = (s.attemptRecs || []).filter(r => names.has(r.user) && r.submittedAt && r.submittedAt.slice(0, 10) >= f30);
          return { asg, done, cert, pct: Math.round(done / asg * 100), qn: q.length, qp: Math.round(q.filter(r => r.pass).length / q.length * 100) }; })()""")
        async def rep(t, extra=''):
            await E(f"window.__app.go('reports', {{ adminView:true, repType:'{t}', repRange:'30d', repDept:'All', repMgr:'All', repStatus:'All', repCourse:'All', repUser:'' {extra} }})"); await W(1200)
            return await V("({ k: v.rep.kpis.map(x => [x.l, String(x.v)]), n: v.rep.rowCount, row: (v.rep.rows[0] || { cells: [] }).cells.map(c => c.v) })")
        r = await rep('completion'); kd = dict(r['k'])
        ok('Course completion report: completion % and certificates = recount', kd['Completion'] == f"{rc['pct']}%" and kd['Certificates issued'] == f"{rc['cert']:,}", (kd, rc))
        r = await rep('coursewise'); kd = dict(r['k'])
        ok('Course-wise report: enrollments and completed = recount', kd['Enrollments'] == f"{rc['asg']:,}" and kd['Completed'] == f"{rc['done']:,}", (kd, rc))
        rows_ok = await V("v.rep.rows.every(r => { const c = r.cells.map(x => +String(x.v).replace(/,/g, '')); return c[2] + c[3] + c[4] === c[1]; })")
        ok('Course-wise: not started + in progress + completed = enrolled on every row', rows_ok)
        r = await rep('quiz'); kd = dict(r['k'])
        ok('Quiz report: attempts and pass rate in the period = recount', kd['Attempts'] == f"{rc['qn']:,}" and kd['Pass rate'] == f"{rc['qp']}%", (kd, rc))
        r = await rep('compliance'); ok('Compliance report built from mandatory / essential / re-certified courses', r['n'] > 0 and all(isinstance(x, str) for x in r['row']), r)
        r = await rep('learning'); ok('User learning report has real columns', r['n'] > 1000 and r['row'][2] not in ('', None), r['row'])
        r = await rep('login'); kd = dict(r['k'])
        ok('Login report counts this session’s sign-in (recorded, not generated)', int(kd['Total sign-ins (tracked)'].replace(',', '')) >= 1, kd)
        # ---- Engagement trends: active learners recount (last 90 days, weekly buckets)
        await E("window.__app.go('analytics', { adminView:true, range:'90d' })"); await W(1200)
        en = await V("v.kpis.map(k => [k.l, k.v])")
        rcA = await E("""(() => { const s = window.__app.state, first = Progress.plus(TODAY_KEY, -12 * 7 - 6), act = new Set();
          s.users.forEach(u => { if (u.status === 'Deactivated') return; const recs = s.itemDone[u.name] || {}, en = s.enroll[u.name] || {};
            for (const c in recs) { if (!(c in en) || !Progress.courseOf(s, c)) continue; for (const i in recs[c]) { const v = recs[c][i], at = typeof v === 'string' ? v : v && v.at; if (at >= first && at <= TODAY_KEY) act.add(u.name); } } });
          return act.size; })()""")
        ok('Engagement trends: active learners = recount (no fixed numbers)', en[0][1] == f"{rcA:,}", (en, rcA))

        ok('NO JS ERRORS', not errs, errs)
        print('\nSUMMARY', sum(1 for _, c in RES if c), '/', len(RES)); await b.close()
asyncio.run(main())
