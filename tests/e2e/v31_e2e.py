# v31: idle sign-out never interrupts a learner watching a video or working in SCORM; reset returns a created board to its
# creation layout. (Connected sign-out reload is checked in backend_e2e.py.)
import asyncio, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
from playwright.async_api import async_playwright
EXE = os.environ.get('CHROME') or (lambda d: d if os.path.exists(d) else None)('/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell')
WEB = os.environ.get('SF_WEB', 'public'); RES = []
def ok(n, c, x=''): RES.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n, '' if c else str(x)[:300], flush=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE); pg = await b.new_page(viewport={'width':1400,'height':900})
        await pg.add_init_script(path=os.path.join(ROOT, 'tests/e2e/hook.js')); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + ROOT + '/' + WEB + '/index.html'); await pg.wait_for_selector('#sf-user')
        E = lambda e: pg.evaluate(e); W = lambda ms=300: pg.wait_for_timeout(ms)
        await pg.locator('.sf-demo2-b').filter(has_text='Learner').click(); await pg.get_by_role('button', name='Login', exact=True).click(); await W(900)
        stale = "(() => { const a = window.__app; a._lastAct = Date.now() - 40 * 60000; localStorage.setItem('sf-act', String(a._lastAct)); a._idleCheck(); })()"
        # a video playing for 40 minutes without a click
        await E("(() => { const v = document.createElement('video'); Object.defineProperty(v, 'paused', { get: () => false }); Object.defineProperty(v, 'ended', { get: () => false }); v.id = 'tv'; document.body.appendChild(v); })()")
        await E(stale); await W(200)
        ok('watching a video for 40 minutes does not sign the learner out', await E("window.__app.state.authed"))
        await E("document.getElementById('tv').remove()")
        await E("window.__app.setState({ screen:'item', scormOn:true })"); await W(100); await E(stale); await W(200)
        ok('working in a SCORM package does not sign the learner out', await E("window.__app.state.authed"))
        await E("window.__app.setState({ screen:'home', scormOn:false })"); await W(100); await E(stale); await W(300)
        ok('really idle for 40 minutes: signed out', not await E("window.__app.state.authed"))
        # reset on a created board
        await pg.locator('.sf-demo2-b').filter(has_text='Admin').click(); await pg.get_by_role('button', name='Login', exact=True).click(); await W(900)
        await E("window.__app.go('training', { adminView:true, trTab:'overview' })"); await W(300)
        await E("window.__app.renderVals().dbNewBoard()"); await E("window.__app.setState(st => ({ dbNew: { ...st.dbNew, name:'Trainer view', from:'tpl:t_trainer' } }))"); await E("window.__app.renderVals().dbNCreate()"); await W(300)
        await E("window.__app.renderVals().dbSave()"); await W(300)
        before = await E("window.__app.state.dash.boards.find(b => b.name === 'Trainer view').visuals.map(v => v.type)")
        await E("window.__app.renderVals().dbToggleEdit()"); await E("window.__app.renderVals().dbVisuals[0].remove()"); await E("window.__app.renderVals().dbVisuals[0].remove()"); await W(150)
        await E("window.__app.renderVals().dbReset()"); await W(150)
        after = await E("window.__app.state.dash.boards.find(b => b.name === 'Trainer view').visuals.map(v => v.type)")
        ok('Reset layout on a created Training board returns its own layout (not Learning overview)', after == before and 'radar' in after, (before, after))
        ids = await E("window.__app.state.dash.boards.find(b => b.name === 'Trainer view').visuals.map(v => v.id)")
        ok('…with fresh, unique visual ids', len(set(ids)) == len(ids))
        await E("window.__app.renderVals().dbCancel()")
        ok('NO JS ERRORS', not errs, errs[:3])
        print('\nSUMMARY', sum(1 for _, c in RES if c), '/', len(RES)); await b.close()
asyncio.run(main())
