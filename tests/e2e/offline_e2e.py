import asyncio, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
from playwright.async_api import async_playwright
EXE = os.environ.get('CHROME') or (lambda d: d if os.path.exists(d) else None)('/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell')   # None: Playwright's own Chromium (CI)
WEB = os.environ.get('SF_WEB', 'public')   # 'dist' tests the bundled build (npm run build)
RES=[]
def ok(n,c,x=''): RES.append((n,bool(c))); print(('PASS ' if c else 'FAIL ')+n, '' if c else str(x)[:300], flush=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE); pg = await b.new_page(viewport={'width':1400,'height':900})
        await pg.add_init_script(path=os.path.join(ROOT, 'tests/e2e/hook.js')); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + ROOT + '/' + WEB + '/index.html'); await pg.wait_for_selector('#sf-user')
        S = lambda e: pg.evaluate(f"(() => {{ const s = window.__app.state; return {e}; }})()"); W = lambda ms=300: pg.wait_for_timeout(ms)
        ok('offline: full sample org still generated', await S("s.users.length") == 3500)
        await pg.locator('.sf-demo2-b').filter(has_text='Learner').click(); await pg.get_by_role('button', name='Login', exact=True).click(); await W(800)
        ok('offline learner login', await S("s.authed && s.meName === 'Maya Okafor'"))
        qi = await pg.evaluate("window.__app.state.adminCourses.find(c => c.id === 'safety').items.findIndex(i => i.kind === 'quiz')")
        await pg.evaluate("window.__app.setState(st => ({ itemDone: { ...st.itemDone, 'Maya Okafor': { ...(st.itemDone['Maya Okafor']||{}), safety: { 0:'2026-10-01', 1:'2026-10-01', 2:'2026-10-01' } } } }))")
        await pg.evaluate(f"window.__app.go('item', {{ courseId:'safety', itemIdx:{qi} }})"); await W(300)
        await pg.evaluate("window.__app.renderVals().startQuiz()"); await W(400)
        ok('offline quiz uses local engine', await S("s.screen === 'quiz' && !s.rAttemptId && s.attempt.length > 0"))
        n = await S("s.attempt.length")
        for k in range(n):
            await pg.evaluate("""(() => { const a = window.__app, s = a.state, q = s.qs.find(x => x.id === s.attempt[s.qi].qid);
              if (q.type === 'Multiple select') a.setState({ qMulti: Object.fromEntries((q.answers||[]).map(i => [i, true])) }); else if (q.type === 'Match the following') a.setState({ qMatch: Object.fromEntries(q.pairs.map((_, i) => [i, i])) });
              else if (q.type === 'Ordering') a.setState({ qOrder: q.items.map((_, i) => i) }); else if (q.type === 'Fill in the blank') a.setState({ qText: q.accept[0] }); else if (q.type === 'Written answer') a.setState({ qText:'x y z' }); else a.setState({ qSel: q.ans != null ? q.ans : 0 }); })()""")
            await pg.evaluate("window.__app.renderVals().quizAction()"); await W(80); await pg.evaluate("window.__app.renderVals().quizAction()"); await W(80)
        ok('offline quiz completes', await S("s.qDone"))
        await pg.evaluate("window.__app.go('users', { adminView:true, role:'admin', meName:'Lena Fischer', meRole:'admin' })"); await W(400)
        await pg.get_by_role('button', name='+ Create account').click(); await pg.get_by_role('menuitem', name='Single account').click(); await W(); um = pg.locator('.ovl-28').last
        await um.locator('input').nth(0).fill('Maya Okafor'); await um.get_by_placeholder('name@northwind.com').fill('maya2@northwind.com'); await um.get_by_placeholder('e.g. NW-1015').fill('NW-4444')
        await pg.get_by_role('button', name='Create account', exact=True).click(); await W(400)
        ok('offline: duplicate name made unique', await S("s.users.some(u => u.name === 'Maya Okafor (NW-4444)')"))
        ok('NO JS ERRORS', not errs, errs[:3])
        await b.close()
    print('SUMMARY', sum(c for _,c in RES), '/', len(RES))
asyncio.run(main())
