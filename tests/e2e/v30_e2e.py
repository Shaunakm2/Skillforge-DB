# v30: Training overview & MIS fully customisable (all tabs, new dashboards, KPI tiles); certificates per course.
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
        E = lambda e: pg.evaluate(e); W = lambda ms=300: pg.wait_for_timeout(ms); V = lambda e: pg.evaluate(f"(() => {{ const v = window.__app.renderVals(); return {e}; }})()")
        cnt = lambda: E("Object.fromEntries(window.__app.state.dash.boards.map(b => [b.id, b.visuals.length]))")
        await pg.locator('.sf-demo2-b').filter(has_text='Admin').click(); await pg.get_by_role('button', name='Login', exact=True).click(); await W(900)

        # ---- the old bug: editing the Training overview changed the Learning overview ----
        await E("window.__app.go('dashboard', { adminView:true, dbBoard:'b1' })"); await W(300)
        await E("window.__app.go('training', { adminView:true, trTab:'overview' })"); await W(500); c0 = await cnt()
        await E("window.__app.renderVals().dbToggleEdit()"); await E("window.__app.renderVals().dbVisuals[0].remove()"); await W(200); c1 = await cnt()
        ok('Customise on Training overview edits the Training overview (not Learning overview)', c1['mis'] == c0['mis'] - 1 and c1['b1'] == c0['b1'], (c0, c1))
        await E("window.__app.renderVals().dbCancel()"); await W(200)
        ok('Cancel puts it back', await cnt() == c0)

        # ---- MIS tab is a board ----
        await E("window.__app.setState({ trTab:'mis' })"); await W(500)
        v = await V("({ show: v.trShowBoard, can: v.dbCanCustomise, types: v.dbVisuals.map(x => [x.isPipe, x.isAttrend]), weeks: (v.dbVisuals[0].pPipe || []).length, bars: (v.dbVisuals[1].aBars || []).length })")
        ok('MIS tab shows the pipeline and attrition trend as visuals, with Customise', v['show'] and v['can'] and v['types'] == [[True, False], [False, True]] and v['weeks'] == 12 and v['bars'] == 12, v)
        await E("window.__app.renderVals().dbToggleEdit()"); await W(200)
        await E("window.__app.renderVals().dbGallery.find(g => g.src === 'train' && g.k === 'kpi').add()"); await W(200)
        await E("window.__app.renderVals().dbVisuals.find(x => x.isAttrend).remove()"); await W(200)
        await E("window.__app.renderVals().dbSave()"); await W(400)
        mt = await E("window.__app.state.dash.boards.find(b => b.id === 'mistab').visuals.map(x => x.type)")
        ok('MIS tab: add a KPI card, remove the trend, Save', mt == ['pipeline', 'kpi'], mt)
        ok('…the other boards are untouched', (await cnt())['b1'] == c0['b1'] and (await cnt())['mis'] == c0['mis'])

        # ---- new dashboard on the Training page ----
        await E("window.__app.renderVals().dbNewBoard()"); await W(150)
        await E("window.__app.setState(st => ({ dbNew: { ...st.dbNew, name:'Trainer scorecards', from:'tpl:t_trainer' } }))"); await E("window.__app.renderVals().dbNCreate()"); await W(400)
        await E("window.__app.renderVals().dbSave()"); await W(400)
        tabs = await V("v.trTabs.map(t => t.label)")
        ok('new Training dashboard appears as its own tab', 'Trainer scorecards' in tabs and tabs[-1] == 'Batches & trainees', tabs)
        tb = await E("window.__app.state.dash.boards.find(b => b.name === 'Trainer scorecards')")
        ok('…stored as a Training board', tb['area'] == 'train' and await V("v.dbVisuals.some(x => x.isRadar)"), tb.get('area'))
        await E("window.__app.go('dashboard', { adminView:true, dbBoard:'b1' })"); await W(300)
        ok('…and not listed among the Analytics dashboards', 'Trainer scorecards' not in await V("v.dbBoards.map(b => b.label)"))
        await E("window.__app.go('training', { adminView:true, trTab:'attrition' })"); await W(300); await E("window.__app.renderVals().dbToggleEdit()")
        ok('built-in tabs cannot be deleted (Reset layout instead)', not await V("v.dbDelOk"))
        await E("window.__app.renderVals().dbCancel()")

        # ---- KPI tiles ----
        await E("window.__app.setState({ trTab:'overview' })"); await E("window.__app.renderVals().dbToggleEdit()"); await E("window.__app.renderVals().trStripOpenFn()"); await W(200)
        await E("window.__app.renderVals().trStripRows.find(r => r.key === 'Unique trainees').vis.toggle()")
        await E("window.__app.renderVals().trStripRows.find(r => r.key === 'Handed over').setLab({ target: { value: 'Handover to OPS' } })")
        await E("window.__app.setState(st => ({ trStripEd: { measure: 'k:kp2' } }))"); await E("window.__app.renderVals().trStripAdd()"); await W(200)
        k = await V("v.trKpis.map(x => [x.l, x.v])")
        ok('tiles: hide, rename, add a ★ custom KPI tile', 'Unique trainees' not in [x[0] for x in k] and ['Handover to OPS', k[[x[0] for x in k].index('Handover to OPS')][1]] in k and any(x[0] == 'Day-1 absence rate' and x[1].endswith('%') for x in k), k)
        await E("window.__app.renderVals().trStripRows.slice(-1)[0].up()"); await W(150)
        k2 = await V("v.trKpis.map(x => x.l)")
        ok('tiles: reorder', k2.index('Day-1 absence rate') < k.index(['Day-1 absence rate', k[[x[0] for x in k].index('Day-1 absence rate')][1]]) if False else k2[-2] == 'Day-1 absence rate', k2)
        await E("window.__app.renderVals().dbCancel()"); await W(200)
        ok('Cancel restores the tiles', 'Unique trainees' in await V("v.trKpis.map(x => x.l)") and 'Day-1 absence rate' not in await V("v.trKpis.map(x => x.l)"))

        # ---- certificates are per course ----
        cr = await E("""(() => { const s = window.__app.state, all = s.adminCourses, withC = all.filter(Progress.hasCert); let done = 0, certs = 0;
          s.users.forEach(u => { if (u.status === 'Deactivated') return; const en = s.enroll[u.name] || {}; for (const c in en) { const a = Progress.courseOf(s, c); if (!a) continue; const r = (s.itemDone[u.name] || {})[c];
            const d = !!(a.items.length && r && Object.keys(r).length >= a.items.length) || !!Progress.migrated(s, u.name, c); if (d) { done++; if (Progress.hasCert(a)) certs++; } } });
          const L = Dash.learn(s, s.dash.slicers, 'All').tot; return { share: Math.round(withC.length / all.length * 100), done, certs, dash: Dash.measure('learn', L, 'certs'), dashDone: L.completed, blank: blankFeatures().cert }; })()""")
        ok('not every course has a certificate (sample catalogue ~40%)', 25 <= cr['share'] <= 55, cr)
        ok('certificates issued = completions of certificate courses only (dashboard = recount)', cr['dash'] == cr['certs'] and cr['certs'] < cr['done'], cr)
        ok('new courses start with “Certificate” off', cr['blank'] is False)
        await E("window.__app.go('analytics', { adminView:true, range:'12m' })"); await W(800)
        an = await V("v.kpis.map(k => k.v)")
        ok('Engagement trends: certificates issued below courses completed', int(an[3].replace(',', '')) < int(an[1].replace(',', '')), an)
        lc = await E("""(() => { const a = window.__app; a.go('home', { role:'learner', meName:'Maya Okafor', meRole:'learner', adminView:false }); a.go('progress', {});
          const s = a.state, v = a.renderVals(), ids = (v.certs || []).map(c => c.id || c.cid || c.title); const done = Progress.myCourses ? null : null;
          return { n: (v.certs || []).length, allCert: (v.certs || []).every(c => { const ac = s.adminCourses.find(x => x.title === c.title || x.id === c.id); return !ac || Progress.hasCert(ac); }) }; })()""")
        ok('learner sees certificates only for courses that issue one', lc['allCert'], lc)

        # ---- banners still render through the style guard ----
        ok('course banner styles pass the guard', await E("!!Skillforge.safeStyle('linear-gradient(90deg, rgba(255,253,249,.96) 0%, rgba(255,253,249,.35) 100%), url(\"blob:file:///1a2b\") center/cover no-repeat, #FFF') && !!Skillforge.safeStyle('url(\"https://abc.supabase.co/storage/v1/x.png?token=a\") center/cover no-repeat') && Skillforge.stylePartOk('rgba(31,78,121,.4)')"))
        ok('NO JS ERRORS', not errs, errs[:3])
        print('\nSUMMARY', sum(1 for _, c in RES if c), '/', len(RES)); await b.close()
asyncio.run(main())
