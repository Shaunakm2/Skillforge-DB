"""v41.24: the Certificates screen moves from Settings › Learning content to Settings › Master data (admins only).
Offline (sample data) for the screens and permissions; connected mode (tests/e2e/mock-supabase.js) for "an admin can still save the template".
Run:  python3 tests/e2e/v41_24_e2e.py"""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
EXE = os.environ.get('CHROME') or (lambda d: d if os.path.exists(d) else None)('/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell')
WEB = os.environ.get('SF_WEB', 'public')
CFG = "window.SKILLFORGE_CONFIG = { SUPABASE_URL:'https://mock.supabase.co', SUPABASE_ANON_KEY:'anon', ORG_ID:'testorg', STORAGE_BUCKET:'lms-files' };"
HOOK = "(function(){let sf;Object.defineProperty(window,'Skillforge',{configurable:true,get(){return sf},set(v){const m=v.mount;v.mount=(app,...a)=>{window.__app=app;return m(app,...a)};sf=v;}});})();"
RES = []
def ok(n, c, x=''): RES.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n, '' if c else str(x)[:500], flush=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE)
        errs = []
        async def page(who):
            ctx = await b.new_context(viewport={'width': 1440, 'height': 900}); pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.add_init_script(path=os.path.join(ROOT, 'tests/e2e/hook.js')); await pg.goto('file://' + ROOT + '/' + WEB + '/index.html?small=1'); await pg.wait_for_selector('#sf-user')
            await pg.locator('.sf-demo2-b').filter(has_text=who).click(); await pg.get_by_role('button', name='Login', exact=True).click(); await pg.wait_for_timeout(900); return pg
        pg = await page('Admin'); E = lambda e: pg.evaluate(e); S = lambda e: pg.evaluate(f"(() => {{ const s = window.__app.state; return {e}; }})()"); V = lambda e: pg.evaluate(f"(() => {{ const v = window.__app.renderVals(); return {e}; }})()"); W = lambda ms=250: pg.wait_for_timeout(ms)

        # ---------- 1. Settings home: the tile is in Master data, not in Learning content ----------
        await E("window.__app.go('admin', { adminView:true })"); await W(400)
        secs = await V("Object.fromEntries(v.setSections.map(x => [x.key, x.tiles.map(t => t.title)]))")
        ok('1 Certificates is a tile in Master data', 'Certificates' in secs['masters'], secs['masters'])
        ok('1 …right after Badges', secs['masters'].index('Certificates') == secs['masters'].index('Badges') + 1, secs['masters'])
        ok('1 Certificates is no longer in Learning content', 'Certificates' not in secs['content'], secs['content'])
        ok('1 no other tile moved (Learning content keeps the rest)', all(t in secs['content'] for t in ['Question bank', 'LCMS', 'Course catalog', 'Course assignment', 'Categories', 'Learning paths', 'Course builder']), secs['content'])
        d = await V("Object.fromEntries(v.setSections.map(x => [x.key, x.desc]))")
        ok('1 section descriptions match the move', 'certificates' not in d['content'].lower() and 'certificate design' in d['masters'], d)
        tile = await V("v.setSections.find(x => x.key === 'masters').tiles.find(t => t.title === 'Certificates')")
        ok('1 the tile describes the real feature (upload PNG, JPG, SVG or PDF)', 'PNG, JPG, SVG or PDF' in tile['desc'] and tile['stat'].startswith('v'), tile)

        # ---------- 2. the tile and the Master data tab both open the editor ----------
        await E("window.__app.renderVals().setSections.find(x => x.key === 'masters').tiles.find(t => t.title === 'Certificates').go()"); await W(500)
        ok('2 the tile opens the certificate editor', await S("s.screen === 'certs'") and await V('v.isCerts && !v.isDenied'))
        ok('2 the editor is complete (fields, upload zone)', await V("v.ctFields.length >= 4") and await pg.locator('.lm-drop').count() >= 1 or await V("v.ctFields.length >= 4"))
        await E("window.__app.renderVals().toggleAdmin()"); await W(400)
        ok('2 the gear icon returns to the Master data tab (not Learning content)', await S("s.screen === 'admin' && s.setTab === 'masters'"), await S("[s.screen, s.setTab]"))
        await E("window.__app.go('masters', { adminView:true, mdTab:'lists' })"); await W(400)
        tabs = await V("v.mdTabs.map(t => t.label)")
        ok('2 Master data has a Certificates tab, between Badges and Tile management', tabs == ['MIS lists', 'Training types', 'Trainee statuses', 'Holiday list', 'Badges', 'Certificates', 'Tile management', 'App settings'], tabs)
        await E("window.__app.renderVals().mdTabs.find(t => t.label === 'Certificates').pick()"); await W(500)
        ok('2 the Certificates tab opens the editor', await S("s.screen === 'certs'") and await V('v.isCerts'))
        await E("window.__app.go('masters', { adminView:true, mdTab:'app' })"); await W(400)
        await E("window.__app.renderVals().pfWhere.find(x => x.t === 'Certificates').go()"); await W(400)
        ok('2 the "everything you can customise" map in App settings still lands on it', await S("s.screen === 'certs'") and await V('v.isCerts'))

        # ---------- 3. permissions: admins only ----------
        ok('3 there is no separate "certs" permission any more', await E("!('certs' in ALL_PERMS) && !MODULES.some(m => m[0] === 'certs')"))
        ok('3 the Certificates screen needs the Master data permission', await E("JSON.stringify(Access.screenPerms.certs) === JSON.stringify(['masters'])"), await E("JSON.stringify(Access.screenPerms.certs)"))
        ok('3 Master data permission says what it covers', await E("MODULES.find(m => m[0] === 'masters')[1].includes('certificate design')"))
        await E("window.__app.go('perms', { adminView:true })"); await W(400)
        labels = await V("v.rlGroups.flatMap(g => g.perms.map(p => p.label))")
        ok('3 Roles & permissions no longer offers a Certificates checkbox', 'Certificates' not in labels and 'Course catalog' in labels, labels[:6])
        ok('3 the Admin role still has everything', await E("Access.permsFor(window.__app.state, null, { admin:true }).has('masters')") and await E("Access.permsFor(window.__app.state, null, { admin:true }).size === MODULES.length"))
        ok('3 a custom role that was given the old "certs" permission can no longer open the screen',
           await E("(() => { const s = { roles: [{ id:'r_old', name:'Old', base:'Learner', builtin:false, perms:{ certs:true, gradebook:true }, courses:[] }] }, perms = Access.permsFor(s, { roleId:'r_old' }, { admin:false }); return perms.has('certs') && !Access.screenPerms.certs.some(p => perms.has(p)); })()"))
        for who in ('Trainer', 'Learner'):
            q = await page(who)
            # even if someone adds the old key to the built-in role in the browser, the screen stays closed
            await q.evaluate("window.__app.setState(st => ({ roles: st.roles.map(r => ({ ...r, perms: { ...r.perms, certs: true } })) }))"); await q.wait_for_timeout(200)
            await q.evaluate("window.__app.go('certs', { adminView:true })"); await q.wait_for_timeout(500)
            ok(f'3 {who}: the Certificates screen is denied', await q.evaluate("window.__app.renderVals().isDenied && !window.__app.renderVals().isCerts"))
            await q.evaluate("window.__app.go('admin', { adminView:true })"); await q.wait_for_timeout(400)
            allt = await q.evaluate("window.__app.renderVals().setSections.flatMap(x => x.tiles.map(t => t.title))")
            ok(f'3 {who}: no Certificates tile anywhere in Settings', 'Certificates' not in allt, allt)
            await q.context.close()

        # ---------- 4. Tile management keeps working for the moved tile ----------
        await E("window.__app.go('masters', { adminView:true, mdTab:'tiles', tileGroup:'settings' })"); await W(400)
        cat = await V("(v.tgRows || []).find(x => x.key === 'Certificates') || null")
        ok('4 Tile management lists it under Master data', cat and cat['sec'] == 'Master data', cat)
        await E("window.__app.setState({ tiles: { settings: { order:[], hide:{ Certificates:true }, label:{} } } })"); await E("window.__app.go('admin', { adminView:true })"); await W(400)
        ok('4 a tile hidden before the move stays hidden', 'Certificates' not in (await V("v.setSections.flatMap(x => x.tiles.map(t => t.title))")))
        await E("window.__app.setState({ tiles: { settings: { order:[], hide:{}, label:{ Certificates:'Certificate design' } } } })"); await W(300)
        secs = await V("Object.fromEntries(v.setSections.map(x => [x.key, x.tiles.map(t => t.title)]))")
        ok('4 a tile renamed before the move keeps its new name', 'Certificate design' in secs['masters'], secs['masters'])
        await E("window.__app.setState({ tiles: {} })")

        # ---------- 5. nothing else on the Settings home changed ----------
        cnt = await V("({ total: v.setSections.flatMap(x => x.tiles).length, content: v.setSections.find(x => x.key === 'content').tiles.length, masters: v.setSections.find(x => x.key === 'masters').tiles.length })")
        ok('5 the Settings home has the same 40 tiles as before: Learning content 11 -> 10, Master data 7 -> 8, none lost', cnt == { 'total': 40, 'content': 10, 'masters': 8 }, cnt)
        ok('5 no script errors (offline)', not errs, errs[:3])
        await pg.context.close()

        # ---------- 6. connected mode: an admin can still save the template ----------
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, bypass_csp=True)
        await ctx.route('**/js/config.js', lambda r: r.fulfill(body=CFG, content_type='application/javascript'))
        await ctx.route('**/vendor/supabase.js', lambda r: r.fulfill(body='/* mocked */', content_type='application/javascript'))
        await ctx.add_init_script(path=os.path.join(ROOT, 'tests/e2e/mock-supabase.js')); await ctx.add_init_script(script=HOOK)
        await ctx.add_init_script(script="""window.__sb.addMember({ user_id:'u-admin', email:'admin@ims.test', emp_id:'IMS-001', app_name:'Shaunak Admin', role:'Admin', password:'Admin-pass-2026' });
          const R = window.__sb.rows, put = (c, k, d) => R.set('testorg|' + c + '|' + k, { coll: c, key: k, data: d, version: 1 });
          put('users', '1', { id: 1, name: 'Shaunak Admin', email: 'admin@ims.test', empId: 'IMS-001', role: 'Admin', roleId: 'r_admin', status: 'Active', dept: 'L&D', manager: 'None' });""")
        c = await ctx.new_page(); cerr = []; c.on('pageerror', lambda e: cerr.append(str(e)))
        await c.goto('file://' + ROOT + '/' + WEB + '/index.html'); await c.wait_for_timeout(1500); await c.wait_for_selector('#sf-user')
        await c.locator('#sf-user').fill('admin@ims.test'); await c.locator('#sf-pw').fill('Admin-pass-2026'); await c.get_by_role('button', name='Login', exact=True).click(); await c.wait_for_timeout(1800)
        CE = lambda e: c.evaluate(e)
        ok('6 connected: signed in as Admin', await CE("!!window.__app.state.authed"))
        await CE("window.__app.go('masters', { adminView:true, mdTab:'lists' })"); await c.wait_for_timeout(500)
        await CE("window.__app.renderVals().mdTabs.find(t => t.label === 'Certificates').pick()"); await c.wait_for_timeout(600)
        v0 = await CE("window.__app.state.certTpl.version"); den0 = await CE("window.__sb.denied")
        await CE("window.__app.renderVals().setCtX({ target: { value: '41' } })"); await c.wait_for_timeout(200)
        await CE("window.__app.renderVals().ctSave()"); await c.wait_for_timeout(1500)
        ok('6 connected: the admin saves a new template version', await CE("window.__app.state.certTpl.version") == v0 + 1, await CE("[window.__app.state.certTpl.version, window.__app.state.toast]"))
        ok('6 connected: the database accepted it (stored, nothing refused)', await CE("[...window.__sb.rows.values()].some(r => r.data && r.data.history && r.data.version === window.__app.state.certTpl.version)") and await CE("window.__sb.denied") == den0, await CE("window.__sb.denied"))
        ok('6 connected: no script errors', not cerr, cerr[:3])
        await ctx.close(); await b.close()
    bad = [n for n, c in RES if not c]; print(f"\n{len(RES) - len(bad)}/{len(RES)} passed"); return not bad
sys.exit(0 if asyncio.run(main()) else 1)
