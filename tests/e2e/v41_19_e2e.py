"""v41.19: discussions post + sync, usage meter on Database & storage, LCMS types in courses, no sample data,
default first password Pass@123 with forced change, Active by default (no "Invited"), Manage menu for new people,
Back buttons on the password screens, clear admin-users errors.
Connected mode against tests/e2e/mock-supabase.js (real server rules from learning-core.js).
Run:  python3 tests/e2e/v41_19_e2e.py
"""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
EXE = os.environ.get('CHROME') or (lambda d: d if os.path.exists(d) else None)('/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell')
WEB = os.environ.get('SF_WEB', 'public')
CFG = "window.SKILLFORGE_CONFIG = { SUPABASE_URL:'https://mock.supabase.co', SUPABASE_ANON_KEY:'anon', ORG_ID:'northwind', STORAGE_BUCKET:'lms-files' };"
HOOK = "(function(){let sf;Object.defineProperty(window,'Skillforge',{configurable:true,get(){return sf},set(v){const m=v.mount;v.mount=(app,...a)=>{window.__app=app;return m(app,...a)};sf=v;}});})();"
RES = []
def ok(n, c, x=''): RES.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n, '' if c else str(x)[:400], flush=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE)
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, bypass_csp=True)
        await ctx.route('**/js/config.js', lambda r: r.fulfill(body=CFG, content_type='application/javascript'))
        await ctx.route('**/vendor/supabase.js', lambda r: r.fulfill(body='/* mocked */', content_type='application/javascript'))
        pg = await ctx.new_page()
        await pg.add_init_script(path=os.path.join(ROOT, 'tests/e2e/mock-supabase.js')); await pg.add_init_script(script=HOOK)
        await pg.add_init_script(script="window.__sb.firstPw = 'Pass@123'; window.__sb.addMember({ user_id:'u-admin', email:'admin@ims.test', emp_id:'IMS-001', app_name:'Shaunak Admin', role:'Admin', password:'Admin-pass-2026' })")
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto('file://' + ROOT + '/' + WEB + '/index.html'); await pg.wait_for_selector('#sf-user')
        await pg.evaluate("window.__demoRows = Backend.rowsOf(window.__app.state).filter(r => r.coll !== 'roles')")
        await pg.add_script_tag(path=os.path.join(ROOT, 'supabase/functions/_shared/learning-core.js'))
        S = lambda e: pg.evaluate(f"(() => {{ const s = window.__app.state; return {e}; }})()")
        V = lambda e: pg.evaluate(f"(() => {{ const v = window.__app.renderVals(); return {e}; }})()")
        W = lambda ms=300: pg.wait_for_timeout(ms)
        B = lambda n: pg.get_by_role('button', name=n, exact=True)
        async def login(user, pw):
            if await pg.locator('#sf-user').count() == 0: await pg.evaluate("window.__app.setState({ authed:false, loginView:'signin' })"); await W()
            await pg.locator('#sf-user').fill(user); await pg.locator('#sf-pw').fill(pw); await B('Login').click(); await W(900)

        # ---------- 7. Back buttons on the password screens ----------
        await pg.get_by_role('button', name='Forgot password?').click(); await W()
        ok('7 forgot password: Back to sign in at the top', await pg.locator('.sf-back').count() == 1)
        await pg.go_back(); await W()
        ok('7 browser Back returns from Reset password to Sign in', await S("s.loginView === 'signin'"))
        await pg.get_by_role('button', name='Forgot password?').click(); await W(); await pg.locator('.sf-back').click(); await W()
        ok('7 Back button returns to Sign in', await S("s.loginView === 'signin'"))

        # ---------- 4. a new database starts without sample data ----------
        await login('admin@ims.test', 'Admin-pass-2026')
        ok('4 admin signed in on an empty database', await S("s.authed && s.beEmpty"))
        ok('4 no sample people, courses, modules, questions, batches or discussions', await S("s.users.length === 1 && !s.adminCourses.length && !s.lcms.length && !s.qs.length && !s.batches.length && !s.threads.length && !s.quizzes.length"),
           await S("[s.users.length, s.adminCourses.length, s.lcms.length, s.qs.length, s.batches.length, s.threads.length]"))
        await pg.evaluate("window.__app.go('database', { adminView:true })"); await W()
        ok('2 usage meter is on Database & storage', await pg.locator('.um[aria-label="Supabase free plan usage"]').count() == 1)
        ok('4 no "full sample organisation" button', await pg.locator('button').filter(has_text='full sample organisation').count() == 0)
        await B('Start with an empty organisation').click(); await W(1500)
        ok('4 empty start saved: no sample people in the database', await pg.evaluate("[...window.__sb.rows.values()].filter(r => r.coll === 'users').length === 1"))
        await pg.evaluate("window.__app.go('admin', { adminView:true })"); await W()
        ok('2 usage meter is no longer on the Settings home', await pg.locator('.um[aria-label="Supabase free plan usage"]').count() == 0)

        # ---------- 4. sample data that is already in a database is found and deleted ----------
        # the database of an earlier version: the sample organisation was saved into it (as "Save the data shown" did)
        await pg.evaluate("""(() => { for (const r of window.__demoRows) { const id = 'northwind|' + r.coll + '|' + r.key; if (!window.__sb.rows.has(id)) window.__sb.rows.set(id, { coll: r.coll, key: r.key, data: JSON.parse(JSON.stringify(r.data)), version: 1 }); }
          window.__sb.rows.set('northwind|lcms|m1', { coll: 'lcms', key: 'm1', data: { id: 'm1', code: 'MOD-001', type: 'SCORM / xAPI', title: 'POSH Awareness Scorm', mins: 10 }, version: 1 }); })()""")
        await pg.evaluate("Backend.afterSignIn().then(r => window.__app.onBackendSignedIn(r, { restore: true }))"); await W(1500)
        ok('4 (older database) sample data visible before clean-up', await S("s.adminCourses.length > 3 && s.users.length > 10"), await S("[s.adminCourses.length, s.users.length]"))
        before = await S("[s.adminCourses.length, s.lcms.length, s.qs.length]")
        await pg.evaluate("window.__app.go('database', { adminView:true })"); await W()
        await B('Find sample data').click(); await W(800)
        found = await S("(s.dbSample && s.dbSample.items || []).length")
        ok('4 sample rows found', found > 50, (found, await S("s.dbSample && s.dbSample.line")))
        ok('4 a real module that reuses a sample key is kept', await S("!(s.dbSample.items || []).some(i => i.coll === 'lcms' && i.key === 'm1')"))
        ok('4 you are kept', await S("!(s.dbSample.items || []).some(i => i.coll === 'users' && i.key === String(s.users.find(u => u.empId === 'IMS-001').id))"))
        await B('Delete sample data').click(); await W(1500)
        left = await pg.evaluate("[...window.__sb.rows.values()].filter(r => ['adminCourses','qs','quizzes','batches','threads'].includes(r.coll)).length")
        ok('4 sample data deleted from the database', left == 0, left)
        ok('4 and from the screen', await S("!s.adminCourses.length && !s.qs.length && s.lcms.length === 1 && s.lcms[0].title === 'POSH Awareness Scorm'"), (before, await S("[s.adminCourses.length, s.qs.length, s.lcms.length]")))
        ok('4 admin still present', await pg.evaluate("[...window.__sb.rows.values()].some(r => r.coll === 'users' && r.data.empId === 'IMS-001')"))

        # ---------- 5/6. create Gagan: Active, default password, Manage works, first sign-in asks for a new password ----------
        await pg.evaluate("window.__app.go('users', { adminView:true })"); await W()
        await B('+ Create account').click(); await pg.get_by_role('menuitem', name='Single account').click(); await W(); um = pg.locator('.ovl-28').last
        await um.locator('input').nth(0).fill('Gagan Sharma'); await um.locator('input').nth(1).fill('gagan@ims.test')
        await um.locator('input[placeholder="e.g. NW-1015"]').fill('IMS-002'); await W(100)
        await B('Create account').click(); await W(900)
        g = await S("s.users.find(u => u.name === 'Gagan Sharma') || null")
        ok('6 new account is Active (no Invited status)', g and g['status'] == 'Active', g)
        ok('6 new account has a real id (was NaN when the admin was created on an empty database)', g and isinstance(g['id'], int), g and g['id'])
        ok('5 first password Pass@123 is shown to the admin', await S("s.tempPw && s.tempPw.pw === 'Pass@123'"))
        ok('6 no Invited in the status counts', 'Invited' not in str(await V("v.userStats.map(x => x.l)")))
        await pg.evaluate("window.__app.setState({ tempPw:null })"); await W()
        await pg.locator('.ua-mng').filter(has_text='Manage').first.click(); await W()
        ok('6 Manage opens for the new person', await S("!!s.uMng") and await pg.locator('.um[role="dialog"]').count() == 1)
        await pg.evaluate("window.__app.setState({ uMng:null })"); await W(800)

        # deactivate / reactivate through the server (found by employee ID even if the e-mail differs in case)
        await pg.evaluate("window.__app.setState(st => ({ users: st.users.map(u => u.name === 'Gagan Sharma' ? { ...u, email: 'GAGAN@ims.test' } : u) }))"); await W(800)
        gid = await S("s.users.find(u => u.name === 'Gagan Sharma').id")
        await pg.evaluate(f"window.__app.setState({{ uAsk: {{ ids: [{gid}], deact: true }} }})"); await W()
        await pg.evaluate("window.__app.renderVals().uAskYes()"); await W(600)
        ok('6/8 deactivate reaches the login (no 404)', await pg.evaluate("window.__sb.members.find(m => m.emp_id === 'IMS-002').active === false") and await S("s.users.find(u => u.name === 'Gagan Sharma').status === 'Deactivated'"))
        await pg.evaluate(f"window.__app.setState({{ uAsk: {{ ids: [{gid}], deact: false }} }})"); await W()
        await pg.evaluate("window.__app.renderVals().uAskYes()"); await W(600)
        ok('6 reactivate', await pg.evaluate("window.__sb.members.find(m => m.emp_id === 'IMS-002').active === true") and await S("s.users.find(u => u.name === 'Gagan Sharma').status === 'Active'"))

        # sign in as Gagan with Pass@123: asked for a new password; even if Supabase drops the old session, sign-in completes
        await pg.evaluate("window.__sb.dropSessionOnPw = true")
        await pg.evaluate("Backend.signOut()"); await pg.evaluate("window.__app.setState({ authed:false, loginView:'signin', meName:null })"); await W()
        await login('gagan@ims.test', 'Pass@123')
        ok('5 first sign-in with Pass@123 asks for a new password', await S("s.loginView === 'newpw' && !s.authed"))
        ok('7 Set your password has a Back button', await pg.locator('.sf-back').count() == 1)
        await pg.locator('#sf-np1').fill('Pass@123'); await pg.locator('#sf-np2').fill('Pass@123'); await B('Save and continue').click(); await W(400)
        ok('5 the default password cannot be kept', await S("s.loginView === 'newpw' && !s.authed && !!s.login.err"))
        await pg.locator('#sf-np1').fill('Gagan-Strong-2026'); await pg.locator('#sf-np2').fill('Gagan-Strong-2026'); await B('Save and continue').click(); await W(1500)
        ok('5 new password saved and Gagan is signed in (no "not linked" error)', await S("s.authed && s.meName === 'Gagan Sharma'"), await S("s.login.err"))

        # ---------- 1. Discussions: start one, reply, stored in the database ----------
        await pg.evaluate("window.__app.go('discussions')"); await W(500)
        ok('1 empty discussions page explains what to do', await pg.locator('text=No discussions yet').count() >= 1)
        await B('+ New discussion').click(); await W()
        await pg.locator('input[placeholder="What do you want to discuss?"]').fill('POSH: who is the IC member for Mumbai?')
        await pg.locator('textarea[placeholder="Add your question or idea"]').fill('Looking for the internal committee contact.')
        await B('Post discussion').click(); await W(900)
        ok('1 new discussion stored in the database', await pg.evaluate("[...window.__sb.rows.values()].some(r => r.coll === 'threads' && r.data.title.startsWith('POSH: who'))"))
        ok('1 new discussion on screen', await S("s.threads.length === 1 && s.threads[0].title.startsWith('POSH: who')"))
        await pg.locator('textarea[placeholder="Add a reply"]').fill('It is listed in the POSH policy, section 4.'); await B('Post').click(); await W(900)
        ok('1 Post adds the reply in the database', await pg.evaluate("[...window.__sb.rows.values()].find(r => r.coll === 'threads').data.replies.length === 1"))
        ok('1 reply on screen', await S("s.threads[0].replies.length === 1 && s.reply === ''") and await pg.locator('text=It is listed in the POSH policy').count() == 1)
        await pg.locator('textarea[placeholder="Add a reply"]').fill(''); await B('Post').click(); await W(300)
        ok('1 empty reply explains instead of doing nothing', 'Write a reply' in (await S("(s.toast && (s.toast.msg || s.toast)) || ''") or ''))

        ok('no script errors', not errs, errs[:3])
        await b.close()
    bad = [n for n, c in RES if not c]
    print(f"\n{len(RES) - len(bad)}/{len(RES)} passed"); sys.exit(1 if bad else 0)
asyncio.run(main())
