"""v41.20: Remember me (45 minutes, survives closing the tab), no demo courses when connected, duplicate names allowed
(e-mail and employee ID stay unique), Skillforge logo -> LMS home, SCORM full screen.
Run:  python3 tests/e2e/v41_20_e2e.py
"""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
EXE = os.environ.get('CHROME') or (lambda d: d if os.path.exists(d) else None)('/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell')
WEB = os.environ.get('SF_WEB', 'public')
CFG = "window.SKILLFORGE_CONFIG = { SUPABASE_URL:'https://mock.supabase.co', SUPABASE_ANON_KEY:'anon', ORG_ID:'northwind', STORAGE_BUCKET:'lms-files' };"
HOOK = "(function(){let sf;Object.defineProperty(window,'Skillforge',{configurable:true,get(){return sf},set(v){const m=v.mount;v.mount=(app,...a)=>{window.__app=app;return m(app,...a)};sf=v;}});})();"
DEMO = ['Leading Through Change', 'Giving Feedback That Lands', 'Running Effective 1:1s', 'Negotiation Essentials', 'Emotional Intelligence at Work',
        'Presenting with Confidence', 'Coaching Conversations', 'Inclusive Leadership', 'Managing Time & Energy', 'Workplace Safety Essentials']
RES = []
def ok(n, c, x=''): RES.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n, '' if c else str(x)[:400], flush=True)

async def offline(b):
    pg = await b.new_page(viewport={'width': 1400, 'height': 900}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.add_init_script(path=os.path.join(ROOT, 'tests/e2e/hook.js'))
    await pg.goto('file://' + ROOT + '/' + WEB + '/index.html?small=1'); await pg.wait_for_selector('#sf-user')
    S = lambda e: pg.evaluate(f"(() => {{ const s = window.__app.state; return {e}; }})()"); W = lambda ms=300: pg.wait_for_timeout(ms)
    await pg.locator('.sf-demo2-b').filter(has_text='Admin').click(); await pg.get_by_role('button', name='Login', exact=True).click(); await W(800)

    # ---------- 4. logo -> LMS home, also from Settings ----------
    await pg.evaluate("window.__app.go('users', { adminView:true })"); await W()
    await pg.locator('.hdr-4').click(); await W()
    ok('4 logo from Settings opens the LMS home page', await S("s.screen === 'home' && !s.adminView"), await S("[s.screen, s.adminView]"))
    await pg.evaluate("window.__app.go('admin', { adminView:true })"); await W(); await pg.locator('.hdr-4').click(); await W()
    ok('4 logo from the Settings home opens the LMS home page', await S("s.screen === 'home' && !s.adminView"))
    await pg.evaluate("window.__app.go('catalog')"); await W(); await pg.locator('.hdr-4').click(); await W()
    ok('4 logo from the catalog opens home', await S("s.screen === 'home'"))

    # ---------- 3. bulk upload: same name allowed, e-mail and employee ID unique ----------
    csv = ('UserId,EmailId,UserName,MobileNumber\\n'
           'IMS-101,gagan.one@ims.test,Gagan Sharma,+91 9000000001\\n'
           'IMS-102,gagan.two@ims.test,Gagan Sharma,+91 9000000002\\n'
           'IMS-103,gagan.one@ims.test,Someone Else,+91 9000000003\\n'
           'IMS-101,third@ims.test,Gagan Sharma,+91 9000000004\\n'
           'IMS-104,gagan.three@ims.test,Gagan Sharma,+91 9000000005')
    await pg.evaluate("window.__app.go('users', { adminView:true })"); await W()
    await pg.evaluate(f"window.__app.setState({{ uImp: {{ text: '{csv}', name: 'people.csv' }} }})"); await pg.evaluate("window.__app.renderVals().uiImport()"); await W(500)
    g = await S("s.users.filter(u => u.empId && /^IMS-10/.test(u.empId)).map(u => ({ emp: u.empId, name: u.name, plain: Identity.plain(u.name) }))")
    ok('3 three people named Gagan Sharma created', len(g) == 3 and all(x['plain'] == 'Gagan Sharma' for x in g), g)
    ok('3 no employee ID added to the name', all('(' not in x['name'] for x in g), [x['name'] for x in g])
    ok('3 names stay distinct inside the app (records never mix)', len(set(x['name'] for x in g)) == 3)
    rej = await S("JSON.stringify(s.uImp)")
    ok('3 duplicate e-mail rejected', 'EmailId already belongs' in rej, rej[:300])
    ok('3 duplicate employee ID rejected', 'UserId repeated' in rej, rej[:300])
    await pg.evaluate("window.__app.go('users', { adminView:true, userQuery:'Gagan', userStatus:'All', uImp:null })"); await W(400)
    shown = await pg.evaluate("[...document.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.replace(/\\u2063/g, '').trim() === 'Gagan Sharma').length")
    ok('3 the list shows "Gagan Sharma" for each of them', shown >= 3, shown)
    ok('3 exports leave out the invisible marker', await pg.evaluate("[...window.__app.state.users].filter(u => /^IMS-10/.test(u.empId || '')).every(u => csvSafe(u.name) === 'Gagan Sharma')"))
    # editing one of them keeps the name and does not rename anybody
    gid = await S("s.users.find(u => u.empId === 'IMS-102').id")
    await pg.evaluate(f"window.__app.setState({{ userModal:true, uImp:null, ud: {{ ...window.__app.state.users.find(u => u.id === {gid}), name: Identity.plain(window.__app.state.users.find(u => u.id === {gid}).name) }} }})"); await W()
    ok('3 the edit form shows the plain name', await S("s.ud.name === 'Gagan Sharma'"))
    await pg.evaluate("window.__app.renderVals().saveUser()"); await W(400)
    ok('3 saving an unchanged duplicate name works and keeps the three apart', await S("new Set(s.users.filter(u => /^IMS-10/.test(u.empId || '')).map(u => u.name)).size === 3 && !s.userModal"), await S("s.toast"))

    # ---------- 5. SCORM full screen ----------
    await pg.evaluate("""window.__app.setState(st => ({ role:'learner', meName:'Maya Okafor', meRole:'learner', adminView:false,
      adminCourses: st.adminCourses.map(c => c.id !== 'safety' ? c : { ...c, features: { ...c.features, linear:false },
        items: [{ kind:'scorm', title:'POSH package', mins:1, file:{ src:'assets/scorm/workplace-safety/index.html', launch:'index.html', name:'posh.zip' } }].concat(c.items.slice(1)) }),
      enroll: { ...st.enroll, 'Maya Okafor': { ...(st.enroll['Maya Okafor'] || {}), safety:'2026-12-31' } } }))""")
    await pg.evaluate("window.__app.go('item', { courseId:'safety', itemIdx:0, scormOn:false })"); await W(400)
    await pg.evaluate("window.__app.renderVals().launchScorm()"); await W(600)
    ok('5 package on screen with a Full screen button', await pg.locator('iframe.sf-scorm').count() == 1 and await pg.locator('.sf-scorm-fs').count() == 1)
    await pg.evaluate("document.querySelector('iframe.sf-scorm').__mark = 1")
    await pg.locator('.sf-scorm-fs').click(); await W(500)
    box = await pg.evaluate("(() => { const r = document.getElementById('sf-scorm-wrap').getBoundingClientRect(), f = document.querySelector('iframe.sf-scorm').getBoundingClientRect(); return [r.width, r.height, f.height, innerWidth, innerHeight]; })()")
    ok('5 full screen fills the browser', await S("s.scormFull") and box[0] >= box[3] - 2 and box[1] >= box[4] - 2 and box[2] > box[4] * 0.8, box)
    ok('5 the package is not reloaded (learner keeps their place)', await pg.evaluate("document.querySelector('iframe.sf-scorm').__mark === 1"))
    ok('5 Exit full screen button shown', 'Exit' in (await pg.locator('.sf-scorm-fs').inner_text()))
    await pg.keyboard.press('Escape'); await W(400)
    ok('5 Escape leaves full screen', not await S("s.scormFull") and await pg.evaluate("document.body.style.overflow === ''"))
    ok('5 still the same package after leaving', await pg.evaluate("document.querySelector('iframe.sf-scorm').__mark === 1"))
    await pg.locator('.sf-scorm-fs').click(); await W(300)
    ok('5 in full screen the package covers the whole page (header hidden)', await pg.evaluate("(() => { const h = document.querySelector('.hdr-4').getBoundingClientRect(); const e = document.elementFromPoint(h.left + 5, h.top + 5); return !!(e && e.closest('#sf-scorm-wrap')); })()"))
    await pg.evaluate("window.__app.goHomePage()"); await W(400)
    ok('5 leaving the page ends full screen', not await S("s.scormFull") and await S("s.screen === 'home'"))
    ok('offline: no script errors', not errs, errs[:3])
    await pg.close()

async def connected(b):
    ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, bypass_csp=True)
    await ctx.route('**/js/config.js', lambda r: r.fulfill(body=CFG, content_type='application/javascript'))
    await ctx.route('**/vendor/supabase.js', lambda r: r.fulfill(body='/* mocked */', content_type='application/javascript'))
    await ctx.add_init_script(path=os.path.join(ROOT, 'tests/e2e/mock-supabase.js')); await ctx.add_init_script(script=HOOK)
    # the database: one admin and one real course (what an organisation that deleted the sample data has)
    await ctx.add_init_script(script="""window.__sb.addMember({ user_id:'u-admin', email:'admin@ims.test', emp_id:'IMS-001', app_name:'Shaunak Admin', role:'Admin', password:'Admin-pass-2026' });
      const R = window.__sb.rows, put = (c, k, d) => R.set('northwind|' + c + '|' + k, { coll: c, key: k, data: d, version: 1 });
      put('users', '1', { id: 1, name: 'Shaunak Admin', email: 'admin@ims.test', empId: 'IMS-001', role: 'Admin', roleId: 'r_admin', status: 'Active', dept: 'L&D', manager: 'None' });
      put('adminCourses', 'c-posh', { id: 'c-posh', code: 'CRS-1', title: 'POSH Awareness', cat: 'Compliance', status: 'Published', active: true, aud: 'Everyone', items: [], features: {}, color: '#0066A1' });""")
    errs = []
    async def page():
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + ROOT + '/' + WEB + '/index.html'); await pg.wait_for_timeout(1500); return pg
    async def login(pg, remember=True):
        await pg.wait_for_selector('#sf-user')
        on = await pg.evaluate("window.__app.state.login.remember")
        if bool(on) != remember: await pg.locator('.sf-check').click()
        await pg.locator('#sf-user').fill('admin@ims.test'); await pg.locator('#sf-pw').fill('Admin-pass-2026')
        await pg.get_by_role('button', name='Login', exact=True).click(); await pg.wait_for_timeout(1200)
    authed = lambda pg: pg.evaluate("!!window.__app.state.authed")

    # ---------- 1. Remember me ----------
    pg = await page(); await login(pg, True)
    ok('1 signed in', await authed(pg))
    ok('1 Remember me explains what it does', 'even if you close the browser' in (await pg.evaluate("window.__app.renderVals().lgRemHint")))
    # ---------- 2. no demo courses ----------
    await pg.evaluate("window.__app.go('catalog')"); await pg.wait_for_timeout(500)
    txt = await pg.evaluate("document.body.innerText")
    ok('2 catalog shows the real course', 'POSH Awareness' in txt)
    ok('2 catalog shows no demo course', not any(t in txt for t in DEMO), [t for t in DEMO if t in txt])
    ok('2 the course list holds only database courses', await pg.evaluate("window.__app.renderVals().catalog ? true : true") and 'Leading Through Change' not in str(await pg.evaluate("Object.values(window.__app.renderVals()).filter(v => Array.isArray(v)).flat().map(x => x && x.title).filter(Boolean)")))
    await pg.evaluate("window.__app.go('home')"); await pg.wait_for_timeout(500)
    ht = await pg.evaluate("document.body.innerText")
    ok('2 home shows no demo course', not any(t in ht for t in DEMO), [t for t in DEMO if t in ht])
    await pg.evaluate("window.__app.setState({ searchOpen:true, gq:'change' })"); await pg.wait_for_timeout(300)
    ok('2 search finds no demo lessons', 'Leading Through Change' not in (await pg.evaluate("document.body.innerText")))
    await pg.evaluate("window.__app.go('analytics', { adminView:true, searchOpen:false, gq:'' })"); await pg.wait_for_timeout(500)
    ok('2 no demo "Where learners drop off" panel', await pg.locator('text=Where learners drop off').count() == 0)

    # close the tab, open a new one: still signed in
    await pg.close(); pg = await page()
    ok('1 Remember me: still signed in after closing the tab', await authed(pg))
    # 46 minutes later (keep-until in the past): signed out
    await pg.evaluate("localStorage.setItem('sf-keep-until', String(Date.now() - 60000))"); await pg.close(); pg = await page()
    ok('1 after 45 minutes the stored sign-in is gone', not await authed(pg) and await pg.locator('#sf-user').count() == 1)
    ok('1 the expired sign-in was removed from the browser', await pg.evaluate("!Object.keys(localStorage).some(k => /auth-token/.test(k))"))
    # activity moves the 45 minutes forward
    await login(pg, True); t1 = await pg.evaluate("+localStorage.getItem('sf-keep-until')")
    await pg.evaluate("localStorage.setItem('sf-keep-until', String(Date.now() + 60000))"); await pg.wait_for_timeout(100)
    await pg.evaluate("Backend.rememberTouch()"); await pg.mouse.click(5, 300); await pg.wait_for_timeout(200)
    t2 = await pg.evaluate("+localStorage.getItem('sf-keep-until')")
    ok('1 keep time is 45 minutes after sign-in', abs(t1 - (await pg.evaluate("Date.now()")) - 45 * 60000) < 120000, t1)
    ok('1 activity extends it back to 45 minutes', t2 - (await pg.evaluate("Date.now()")) > 40 * 60000, t2)
    # Sign out forgets it
    await pg.evaluate("window.__app.renderVals().signOut()"); await pg.wait_for_timeout(1500)
    ok('1 sign out removes the stored sign-in', await pg.evaluate("!localStorage.getItem('sf-keep-until') && !Object.keys(localStorage).some(k => /auth-token/.test(k))"))
    # not ticked: closing the tab ends the sign-in
    await pg.close(); pg = await page(); await login(pg, False)
    ok('1 signed in without Remember me', await authed(pg))
    ok('1 without Remember me nothing is stored in the browser', await pg.evaluate("!localStorage.getItem('sf-keep-until') && !Object.keys(localStorage).some(k => /auth-token/.test(k))"))
    await pg.close(); pg = await page()
    ok('1 without Remember me closing the tab signs you out', not await authed(pg))
    ok('connected: no script errors', not errs, errs[:3])
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE)
        await offline(b); await connected(b)
        await b.close()
    bad = [n for n, c in RES if not c]
    print(f"\n{len(RES) - len(bad)}/{len(RES)} passed"); sys.exit(1 if bad else 0)
asyncio.run(main())
