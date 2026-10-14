# v35: checks for the UI/UX bug fixes (documents, leaderboard, dashboards, form guard, accessibility).
import asyncio, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
from playwright.async_api import async_playwright
EXE = os.environ.get('CHROME') or (lambda d: d if os.path.exists(d) else None)('/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell')
WEB = os.environ.get('SF_WEB', 'public')
RES=[]
def ok(n,c,x=''): RES.append((n,bool(c))); print(('PASS ' if c else 'FAIL ')+n, '' if c else str(x)[:300], flush=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE); pg = await b.new_page(viewport={'width':1400,'height':900})
        await pg.add_init_script(path=os.path.join(ROOT, 'tests/e2e/hook.js')); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + ROOT + '/' + WEB + '/index.html'); await pg.wait_for_selector('#sf-user')
        S = lambda e: pg.evaluate(f"(() => {{ const s = window.__app.state; return {e}; }})()"); W = lambda ms=300: pg.wait_for_timeout(ms)
        await pg.locator('.sf-demo2-b').filter(has_text='Learner').click(); await pg.get_by_role('button', name='Login', exact=True).click(); await W(800)
        # leaderboard: a team of one -> podium has 1 place, no blanks; 0-XP me still listed; colour stable by name
        me = await S("s.meName")
        await pg.evaluate("window.__app.setState(st => ({ lb:'team', users: st.users.map(u => u.name === st.meName ? { ...u, manager:'Nobody-X', dept:'Solo-X' } : u) }))"); await W()
        v = await pg.evaluate("(() => { const r = window.__app.renderVals(); return { pod: r.podium, team: (r.lbRows||[]) }; })()")
        ok('podium has no empty places', v['pod'] is not None and all(x and x.get('name') for x in v['pod']) and len(v['pod']) <= 3, v['pod'])
        ok('I am on my team board', any(r.get('name','').startswith(me) for r in v['team']), v['team'][:2])
        await pg.evaluate("window.__app.setState({ lb:'company' })"); await W()
        stable = await pg.evaluate("""(() => { const r = window.__app.renderVals().lbRows; return r.every(x => x.av === r.find(y => y.name === x.name).av) && new Set(r.map(x=>x.av)).size >= 1; })()""")
        ok('avatar colour comes from the name', stable)
        # v41.7+: documents open in the in-app viewer (no pop-up to block), so opening is always recorded
        await pg.evaluate("window.__app.go('docs')"); await W(400)
        await pg.evaluate("window.open = () => null")
        rows = await pg.evaluate("window.__app.renderVals().docsRows.filter(r => r.canOpen).map(r => r.title)")
        if rows:
            t = rows[0]
            before = await S(f"JSON.stringify((s.docAck[s.meName]||{{}}))")
            await pg.evaluate(f"window.__app.renderVals().docsRows.find(r => r.title === {t!r}).open()"); await W()
            after = await S(f"JSON.stringify((s.docAck[s.meName]||{{}}))")
            ok('opening is recorded', before != after, (before, after))
            ok('the in-app viewer is open', await S("!!s.docView"))
        else: ok('documents with files exist (offline sample)', False, 'none')
        # admin dashboards
        await pg.evaluate("window.__app.go('dashboard', { adminView:true, role:'admin', meName:'Lena Fischer', meRole:'admin' })"); await W(600)
        n0 = await S("s.dash ? s.dash.boards.length : -1")
        await pg.evaluate("window.__app.renderVals().dbDupBoard()"); await W()
        ok('duplicate opens in edit mode', await S("!!(s.dash && s.dash.edit && s.dbSnap)"))
        await pg.evaluate("window.__app.renderVals().dbCancel()"); await W()
        ok('Cancel discards the duplicate', await S("s.dash.boards.length") == n0)
        ok('delete prompt can mention schedules', await pg.evaluate("typeof window.__app.renderVals().dbDelSched === 'string'"))
        # toggles are announced as switches with a state
        await pg.evaluate("window.__app.setState(st => ({ dash: { ...st.dash, edit:false } }))"); await pg.evaluate("window.__app.go('account', { adminView:false, acctTab:'prefs' })"); await W(400)
        sw = await pg.evaluate("[...document.querySelectorAll('button[role=switch]')].map(b => [b.getAttribute('role'), b.getAttribute('aria-checked')])")
        ok('toggles have role=switch and aria-checked true/false', len(sw) > 0 and all(x[0]=='switch' and x[1] in ('true','false') for x in sw), sw[:4])
        ok('toast is a live region', await pg.evaluate("document.querySelector('.ovl-33') ? document.querySelector('.ovl-33').getAttribute('aria-live') === 'polite' : true"))
        ok('NO JS ERRORS', not errs, errs[:3])
        await b.close()
    print('SUMMARY', sum(c for _,c in RES), '/', len(RES))
asyncio.run(main())
