# v41: Trainer has no LCMS and no Assessment attempt management by default; an admin can switch them on and off
# in Roles & permissions and the trainer's access follows. Course covers on the home page.
import asyncio, os, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
from playwright.async_api import async_playwright
EXE = os.environ.get('CHROME') or (lambda d: d if os.path.exists(d) else None)('/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell')
WEB = os.environ.get('SF_WEB', 'public')
RES = []
def ok(n, c, x=''): RES.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n, '' if c else str(x)[:300], flush=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE); errs = []
        pg = await b.new_page(viewport={'width': 1366, 'height': 900})
        await pg.add_init_script(path=os.path.join(ROOT, 'tests/e2e/hook.js')); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + ROOT + '/' + WEB + '/index.html'); await pg.wait_for_selector('#sf-user')
        W = lambda ms=300: pg.wait_for_timeout(ms)
        async def login(who):
            await pg.locator('.sf-demo2-b').filter(has_text=who).click(); await pg.get_by_role('button', name='Login', exact=True).click(); await W(900)
            await pg.evaluate("window.__app.setState({ toast:null })")
        async def logout():
            await pg.evaluate("window.__app.renderVals().signOut()"); await pg.wait_for_selector('#sf-user')
        async def screen(sc):
            await pg.evaluate(f"window.__app.go('{sc}', {{ adminView:true }})"); await W(250); return await pg.evaluate('window.__app._scrV')
        async def tiles():
            await screen('admin'); return await pg.evaluate("document.body.innerText")
        async def set_perm(label, want):
            await pg.evaluate("window.__app.setState({ roleSel:'r_trainer', roleDraft:null })"); await screen('perms')
            on = await pg.evaluate("!!window.__app.state.roles.find(r => r.id === 'r_trainer').perms[" + repr({'Assessment attempt management': 'attempts', 'LCMS': 'lcms'}[label]) + "]")
            if on != want:
                await pg.locator('button').filter(has_text=label).first.click(); await W(150)
                await pg.get_by_role('button', name='Save').first.click(); await W(250)

        await login('Trainer')
        ok('default trainer: LCMS is refused', await screen('lcms') == 'denied')
        ok('default trainer: Assessment attempt management is refused', await screen('attempts') == 'denied')
        t = await tiles()
        ok('default trainer: neither appears in Settings', 'Assessment attempt management' not in t and 'Upload hub for documents' not in t)
        ok('default trainer: still has batches, assignment and gradebook', all([await screen(x) == x for x in ['batches', 'assignments', 'gradebook']]))
        await logout(); await login('Admin')
        await set_perm('Assessment attempt management', True); await set_perm('LCMS', True)
        ok('admin: switching both on is saved on the Trainer role', await pg.evaluate("(() => { const p = window.__app.state.roles.find(r => r.id === 'r_trainer').perms; return !!(p.attempts && p.lcms); })()"))
        await logout(); await login('Trainer')
        ok('trainer after admin switched them on: LCMS opens', await screen('lcms') == 'lcms')
        ok('trainer after admin switched them on: attempts open', await screen('attempts') == 'attempts')
        await logout(); await login('Admin')
        await set_perm('Assessment attempt management', False); await set_perm('LCMS', False)
        await logout(); await login('Trainer')
        ok('trainer after admin switched them off again: LCMS refused', await screen('lcms') == 'denied')
        ok('trainer after admin switched them off again: attempts refused', await screen('attempts') == 'denied')
        await logout(); await login('Admin'); await screen('home'); await W(1500)
        rec = await pg.evaluate("[...document.querySelectorAll('.learner-dashboard-40')].map(e => e.getAttribute('style'))")
        ok('home: every Recommended card shows its course cover', rec and all('assets/courses/' in s for s in rec), rec)
        th = await pg.evaluate("[...document.querySelectorAll('.lp-thumb')].map(i => i.naturalWidth)")
        ok('home: learning-path rows show loaded thumbnails', th and all(w > 0 for w in th), th)
        miss = await pg.evaluate("(() => { const ids = ['change','feedback','oneonones','negotiation','eq','present','coaching','inclusive','energy','safety']; return window.__app.state.adminCourses.filter(c => ids.includes(c.id) && !(c.banner && c.banner.src && c.icon && c.icon.src)).map(c => c.id); })()")
        ok('all ten demo courses have a cover and an icon (Draft included)', not miss, miss)
        ok('NO JS ERRORS', not errs, errs[:3])
        await b.close()
    print('SUMMARY', sum(c for _, c in RES), '/', len(RES)); sys.exit(0 if all(c for _, c in RES) else 1)
asyncio.run(main())
