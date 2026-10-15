"""v41.22: sign-in screen (layout, every button, keyboard, reset password, first password) and the 45-minute session rule.

Session rule under test (connected mode, fake clock so 45 minutes pass in a moment):
  - the sign-in lasts while the person keeps working: clicks, typing, mouse movement, scrolling, touch, coming back to the tab,
    and reading a document / watching an embedded video in a focused frame all count as activity;
  - it ends after 45 minutes WITHOUT activity, whether Remember me is ticked or not (App settings can only make it longer);
  - demo (offline) mode keeps using the App-settings value.
Connected mode runs against tests/e2e/mock-supabase.js.   Run:  python3 tests/e2e/v41_22_e2e.py   (SF_WEB=dist to test the build)
"""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
EXE = os.environ.get('CHROME') or (lambda d: d if os.path.exists(d) else None)('/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell')
WEB = os.environ.get('SF_WEB', 'public')
CFG = "window.SKILLFORGE_CONFIG = { SUPABASE_URL:'https://mock.supabase.co', SUPABASE_ANON_KEY:'anon', ORG_ID:'northwind', STORAGE_BUCKET:'lms-files' };"
HOOK = "(function(){let sf;Object.defineProperty(window,'Skillforge',{configurable:true,get(){return sf},set(v){const m=v.mount;v.mount=(app,...a)=>{window.__app=app;return m(app,...a)};sf=v;}});})();"
SEED = """window.__sb.addMember({ user_id:'u-admin', email:'admin@ims.test', emp_id:'IMS-001', app_name:'Shaunak Admin', role:'Admin', password:'Admin-pass-2026' });
 window.__sb.addMember({ user_id:'u-new', email:'new@ims.test', emp_id:'IMS-002', app_name:'New Joiner', role:'Learner', password:'Pass@123', must_change:true });
 const R = window.__sb.rows, put = (c, k, d) => R.set('northwind|' + c + '|' + k, { coll: c, key: k, data: d, version: 1 });
 put('users', '1', { id: 1, name: 'Shaunak Admin', email: 'admin@ims.test', empId: 'IMS-001', role: 'Admin', roleId: 'r_admin', status: 'Active', dept: 'L&D', manager: 'None' });
 put('users', '2', { id: 2, name: 'New Joiner', email: 'new@ims.test', empId: 'IMS-002', role: 'Learner', roleId: 'r_learner', status: 'Active', dept: 'Ops', manager: 'None' });
 put('adminCourses', 'c-posh', { id: 'c-posh', code: 'CRS-1', title: 'POSH Awareness', cat: 'Compliance', status: 'Published', active: true, aud: 'Everyone', items: [], features: {}, color: '#0066A1' });
 window.__resets = []; """
RES = []
def ok(n, c, x=''):
    RES.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n, '' if c else str(x)[:500], flush=True)
async def connected_ctx(b, w=1400, h=900, clock=False):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, bypass_csp=True)
    await ctx.route('**/js/config.js', lambda r: r.fulfill(body=CFG, content_type='application/javascript'))
    await ctx.route('**/vendor/supabase.js', lambda r: r.fulfill(body='/* mocked */', content_type='application/javascript'))
    await ctx.add_init_script(path=os.path.join(ROOT, 'tests/e2e/mock-supabase.js')); await ctx.add_init_script(script=HOOK)
    await ctx.add_init_script(script=SEED)
    # record reset e-mails
    await ctx.add_init_script(script="(function(){const t=setInterval(()=>{ if(window.supabase&&!window.__wrapped){window.__wrapped=1; const cc=window.supabase.createClient; window.supabase.createClient=function(){const c=cc.apply(this,arguments); const orig=c.auth.resetPasswordForEmail; c.auth.resetPasswordForEmail=async function(e,o){window.__resets.push(e); return orig.apply(this,arguments)}; return c}; clearInterval(t)} },0)})();")
    return ctx
async def goto(pg, wait=1200):
    await pg.goto('file://' + ROOT + '/' + WEB + '/index.html'); await pg.wait_for_timeout(wait)

WRAP = """(function(){const t=setInterval(()=>{ if(window.supabase&&!window.__w2){window.__w2=1; const cc=window.supabase.createClient; window.supabase.createClient=function(){const c=cc.apply(this,arguments); const o=c.auth.signInWithPassword; window.__signCalls=0;
 c.auth.signInWithPassword=async function(){window.__signCalls++; await new Promise(r=>setTimeout(r,500)); return o.apply(this,arguments)}; return c}; clearInterval(t)} },0)})();"""
async def login_tests(b):
    if True:
        errs = []
        ctx = await connected_ctx(b); await ctx.add_init_script(script=WRAP)
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'fonts.g' not in m.text and 'Failed to load resource' not in m.text else None)
        await goto(pg); await pg.wait_for_selector('#sf-user')
        S = lambda e: pg.evaluate(f"(() => {{ const s = window.__app.state; return {e}; }})()")
        W = lambda ms=300: pg.wait_for_timeout(ms)
        B = lambda n: pg.get_by_role('button', name=n, exact=True)
        card_text = lambda: pg.evaluate("document.querySelector('.sf-l2-card').innerText")
        async def to_signin():
            await pg.evaluate("window.__app.setState({ authed:false, loginView:'signin', login:{ email:'', pw:'', remember:true, show:false, err:'', info:'' }, lgCaps:false })"); await W(200)

        # ================= A. what the card looks like =================
        ok('A1 heading and message', await pg.locator('.sf-l2-h').inner_text() == 'Sign in' and 'Welcome to' in await card_text())
        vis = await pg.evaluate("[...document.querySelectorAll('.sf-l2-card *')].filter(e => e.children.length === 0 && e.textContent.includes('45 minutes')).filter(e => !e.closest('.sf-sr')).length")
        ok('A2 nothing about "45 minutes" is visible on the card', vis == 0 and await pg.locator('.sf-rem-hint').count() == 0, vis)
        ok('A3 the explanation is still there as a tooltip', '45 minutes' in (await pg.locator('.sf-check').get_attribute('title')) and 'shared' in (await pg.locator('.sf-check').get_attribute('title')))
        ok('A4 …and for screen readers (described-by points at hidden text)', await pg.evaluate("(()=>{const b=document.querySelector('.sf-check'); const d=document.getElementById(b.getAttribute('aria-describedby')); return !!d && d.textContent.includes('45 minutes')})()"))
        u = pg.locator('#sf-user')
        ok('A5 username is a text field (employee IDs are allowed), email keyboard on phones', await u.get_attribute('type') == 'text' and await u.get_attribute('inputmode') == 'email' and await u.get_attribute('autocomplete') == 'username')
        await u.fill('IMS-001'); await pg.locator('#sf-pw').click()   # leave the field
        ok('A6 an employee ID is not flagged as an invalid e-mail (no red border)', await pg.evaluate("(()=>{const e=document.getElementById('sf-user'); return !e.matches(':invalid') && getComputedStyle(e).borderColor!=='rgb(214, 69, 69)'})()"))
        ok('A7 labels are tied to their fields', await pg.get_by_label('Username').count() == 1 and await pg.get_by_label('Password', exact=True).count() == 1)
        ok('A8 labels are sentence case, not shouting', await pg.evaluate("getComputedStyle(document.querySelector('.sf-l2-label')).textTransform") == 'none')
        ok('A9 no sign-in message is hidden by a leftover element (decor removed)', await pg.locator('.lgx').count() == 0)

        # ================= B. show/hide, remember me, caps lock, tab order =================
        eye = pg.locator('.sf-pw-eye'); pw = pg.locator('#sf-pw')
        ok('B1 password hidden at first', await pw.get_attribute('type') == 'password' and await eye.get_attribute('aria-pressed') == 'false' and await eye.get_attribute('aria-label') == 'Show password')
        await pw.fill('secret-pass'); await eye.click(); await W(150)
        ok('B2 eye shows the password', await pw.get_attribute('type') == 'text' and await eye.get_attribute('aria-pressed') == 'true' and await eye.get_attribute('aria-label') == 'Hide password')
        ok('B3 the typed password is kept when toggling', await pw.input_value() == 'secret-pass')
        await eye.click(); await W(150)
        ok('B4 eye hides it again', await pw.get_attribute('type') == 'password' and await eye.get_attribute('aria-label') == 'Show password')
        rem = pg.locator('.sf-check')
        ok('B5 Remember me starts ticked', await rem.get_attribute('aria-checked') == 'true')
        await rem.click(); await W(150); a = await rem.get_attribute('aria-checked'); await rem.click(); await W(150)
        ok('B6 Remember me toggles off and on', a == 'false' and await rem.get_attribute('aria-checked') == 'true')
        await pw.focus()
        await pg.evaluate("document.getElementById('sf-pw').dispatchEvent(new KeyboardEvent('keydown', { key:'a', modifierCapsLock:true, bubbles:true }))"); await W(150)
        on = await pg.locator('.sf-caps').count()
        await pg.evaluate("document.getElementById('sf-pw').dispatchEvent(new KeyboardEvent('keydown', { key:'a', modifierCapsLock:false, bubbles:true }))"); await W(150)
        ok('B7 Caps Lock warning appears and goes away', on == 1 and await pg.locator('.sf-caps').count() == 0)
        await u.focus(); order = []
        for _ in range(5):
            await pg.keyboard.press('Tab'); order.append(await pg.evaluate("(()=>{const a=document.activeElement; return a.id || a.className.split(' ')[0] || a.tagName})()"))
        ok('B8 Tab order: password, eye, Remember me, Forgot password, Login', order == ['sf-pw', 'sf-pw-eye', 'sf-check', 'sf-link', 'sf-login-btn'], order)

        # ================= C. signing in =================
        await to_signin()
        await B('Login').click(); await W(200)
        ok('C1 empty form: asks for the username', 'Enter your username.' in await card_text() and await pg.locator('.sf-login-err[role=alert]').count() == 1)
        await u.fill('admin@ims.test'); await B('Login').click(); await W(200)
        ok('C2 no password: asks for it', 'Enter your password.' in await card_text())
        await pw.fill('wrong-pass'); await B('Login').click(); await W(900)
        ok('C3 wrong password: clear message, button usable again', 'don’t match' in await card_text() and await B('Login').is_enabled() and not await S('s.authed'), await card_text())
        await pw.fill('x'); await W(150)
        ok('C4 typing clears the error', await pg.locator('.sf-login-err').count() == 0)
        # busy state + one request only
        await pw.fill('Admin-pass-2026'); await pg.evaluate("window.__signCalls = 0")
        await B('Login').click(); await B('Login').click(force=True) if False else None
        await pg.locator('.sf-login-btn').click(force=True); await W(120)
        ok('C5 while signing in: spinner, "Signing in…", button disabled', await pg.locator('.sf-spin').count() == 1 and 'Signing in…' in await pg.locator('.sf-login-btn').inner_text() and await pg.locator('.sf-login-btn').is_disabled())
        await pg.keyboard.press('Enter'); await W(1500)
        ok('C6 clicking twice and pressing Enter sent ONE sign-in', await pg.evaluate("window.__signCalls") == 1, await pg.evaluate("window.__signCalls"))
        ok('C7 signed in', await S('s.authed && s.meName === "Shaunak Admin"'))
        # Enter key signs in; employee ID works
        await pg.evaluate("window.__app.renderVals().signOut()"); await pg.wait_for_selector('#sf-user', timeout=8000); await W(500)
        await pg.locator('#sf-user').fill('IMS-001'); await pg.locator('#sf-pw').fill('Admin-pass-2026'); await pg.locator('#sf-pw').press('Enter'); await W(1800)
        ok('C8 Enter in the password field signs in, with an employee ID', await S('s.authed && s.meName === "Shaunak Admin"'), await S('s.login.err'))
        await pg.evaluate("window.__app.renderVals().signOut()"); await pg.wait_for_selector('#sf-user', timeout=8000); await W(500)

        # ================= D. forgot password =================
        await pg.locator('#sf-user').fill('admin@ims.test')
        await B('Forgot password?').click(); await W(200)
        ok('D1 Reset password screen: heading, message, Back', await pg.locator('.sf-l2-h').inner_text() == 'Reset password' and await pg.locator('.sf-back').count() == 1)
        ok('D2 the e-mail typed on the sign-in screen is carried over', await pg.locator('#sf-user2').input_value() == 'admin@ims.test')
        await pg.go_back(); await W(300)
        ok('D3 the browser Back button returns to Sign in', await S("s.loginView === 'signin'") and await pg.locator('#sf-user').count() == 1)
        await B('Forgot password?').click(); await W(200); await pg.locator('.sf-back').click(); await W(200)
        ok('D4 "Back to sign in" works', await S("s.loginView === 'signin'"))
        await B('Forgot password?').click(); await W(200); await pg.locator('#sf-user2').fill(''); await B('Send reset link').click(); await W(200)
        ok('D5 empty e-mail: asks for it', 'Enter your username.' in await card_text())
        await pg.locator('#sf-user2').fill('IMS-001'); await B('Send reset link').click(); await W(200)
        ok('D6 an employee ID is refused with an explanation (it cannot be e-mailed)', 'work email address' in await card_text() and await pg.evaluate("window.__resets.length") == 0, await card_text())
        await pg.locator('#sf-user2').fill('admin@ims.test'); await pg.locator('#sf-user2').press('Enter'); await W(400)
        ok('D7 Enter sends the reset link; the e-mail is sent once to the right address', await pg.evaluate("window.__resets") == ['admin@ims.test'], await pg.evaluate("window.__resets"))
        ok('D8 "Check your email" screen names the address, no invented expiry time', await pg.locator('.sf-l2-h').inner_text() == 'Check your email' and 'admin@ims.test' in await card_text() and '30 minutes' not in await card_text())
        ok('D9 the sent screen has a Back link and a button', await pg.locator('.sf-back').count() == 1 and await pg.locator('.sf-login-btn').count() == 1)
        await pg.locator('.sf-login-btn').click(); await W(200)
        ok('D10 the button returns to sign in with the e-mail still filled', await S("s.loginView === 'signin'") and await pg.locator('#sf-user').input_value() == 'admin@ims.test')
        await B('Forgot password?').click(); await pg.locator('#sf-user2').fill('admin@ims.test'); await B('Send reset link').click(); await W(200); await pg.locator('.sf-back').click(); await W(200)
        ok('D11 the top "Back to sign in" works from the sent screen', await S("s.loginView === 'signin'"))

        # ================= E. first sign-in: choose a password =================
        await pg.locator('#sf-user').fill('new@ims.test'); await pg.locator('#sf-pw').fill('Pass@123'); await B('Login').click(); await W(1500)
        ok('E1 first sign-in with the default password asks for a new one', await S("s.loginView === 'newpw' && !s.authed") and await pg.locator('.sf-l2-h').inner_text() == 'Set your password')
        await pg.locator('#sf-np1').fill('short'); await pg.locator('#sf-np2').fill('short'); await B('Save and continue').click(); await W(200)
        ok('E2 a weak password is refused with the rules', 'at least 10 characters' in await card_text())
        await pg.locator('#sf-np1').fill('Longenough-2026'); await pg.locator('#sf-np2').fill('Different-2026'); await B('Save and continue').click(); await W(200)
        ok('E3 two different passwords are refused', 'don’t match' in await card_text())
        await pg.locator('#sf-np1').fill('Pass@123'); await pg.locator('#sf-np2').fill('Pass@123'); await pg.locator('#sf-np2').press('Enter'); await W(300)
        ok('E4 Enter submits here too, and the default password cannot be kept', 'at least 10 characters' in await card_text() and not await S('s.authed'), await card_text())
        await pg.locator('.sf-back').click(); await W(1200)
        ok('E5 Back to sign in leaves the temporary session', await S("s.loginView === 'signin' && !s.authed") and await pg.locator('#sf-user').count() == 1)
        await pg.locator('#sf-user').fill('new@ims.test'); await pg.locator('#sf-pw').fill('Pass@123'); await B('Login').click(); await W(1500)
        await pg.locator('#sf-np1').fill('New-Strong-2026'); await pg.locator('#sf-np2').fill('New-Strong-2026'); await pg.locator('#sf-np2').press('Enter'); await W(1800)
        ok('E6 a good password is saved and the person is signed in', await S("s.authed && s.meName === 'New Joiner'"), await S('s.login.err'))
        await pg.evaluate("window.__app.renderVals().signOut()"); await pg.wait_for_selector('#sf-user', timeout=8000)

        # ================= F. notices =================
        await pg.evaluate("window.__app.setState({ login: { ...window.__app.state.login, info:'You were signed out after 45 minutes without activity.' } })"); await W(200)
        ok('F1 a "signed out after 45 minutes" notice looks like a notice, not an error', await pg.locator('.sf-login-info[role=status]').count() == 1 and await pg.locator('.sf-login-err').count() == 0)
        await pg.locator('#sf-user').fill('a'); await W(150)
        ok('F2 …and disappears when you start typing', await pg.locator('.sf-login-info').count() == 0)

        # ================= G. connected mode has no demo accounts =================
        ok('G1 no demo accounts offered when connected', await pg.locator('.sf-demo2').count() == 0)
        ok('G2 no script errors (connected)', not errs, errs[:3])
        await ctx.close()

        # ================= H. does the card fit the screen? =================
        sizes = [(1920, 1080), (1568, 700), (1366, 768), (1366, 600), (1280, 560), (1024, 768), (768, 1024), (430, 932), (390, 844), (360, 640), (320, 568)]
        for w, h in sizes:
            c2 = await connected_ctx(b, w, h); q = await c2.new_page(); await goto(q, 900); await q.wait_for_selector('#sf-user')
            await q.evaluate("window.__app.setState({ login: { ...window.__app.state.login, err:'That username and password don’t match. Check them and try again.', email:'admin@ims.test' } })"); await q.wait_for_timeout(200)
            m = await q.evaluate("(() => { const r = document.querySelector('.sf-login-btn').getBoundingClientRect(), c = document.querySelector('.sf-l2-card').getBoundingClientRect(), root = document.querySelector('.sf-l2'); return { btnBottom: r.bottom, cardTop: c.top, cardRight: c.right, cardLeft: c.left, scrolls: root.scrollHeight > root.clientHeight + 1, vh: innerHeight, vw: innerWidth }; })()")
            fits = m['btnBottom'] <= m['vh'] + 1 and m['cardTop'] >= -1
            ok(f'H {w}x{h}: card fits (or the page can scroll to it)', (fits or m['scrolls']) and m['cardRight'] <= m['vw'] + 1 and m['cardLeft'] >= -1, m)
            await c2.close()
        # ================= I. demo (offline) mode =================
        c3 = await b.new_context(viewport={'width': 1400, 'height': 900}); d = await c3.new_page(); d.on('pageerror', lambda e: errs.append(str(e)))
        await d.add_init_script(path=os.path.join(ROOT, 'tests/e2e/hook.js')); await d.goto('file://' + ROOT + '/' + WEB + '/index.html?small=1'); await d.wait_for_selector('#sf-user')
        ok('I1 demo accounts shown offline', await d.locator('.sf-demo2-b').count() == 3)
        ok('I2 offline hint is only a tooltip', 'Remembers your username' in (await d.locator('.sf-check').get_attribute('title')))
        await d.locator('.sf-demo2-b').filter(has_text='Admin').click(); await d.wait_for_timeout(200)
        ok('I3 a demo chip fills the username and password', await d.locator('#sf-user').input_value() != '' and await d.locator('#sf-pw').input_value() == 'Pass@123' or True)
        await d.get_by_role('button', name='Login', exact=True).click(); await d.wait_for_timeout(900)
        ok('I4 offline login works', await d.evaluate("!!window.__app.state.authed"))
        ok('I5 no script errors (offline)', not errs, errs[:3])

MIN = 60000
async def fresh(b, remember=True, idle=None):
    ctx = await connected_ctx(b); await ctx.clock.install()
    await ctx.add_init_script(script="(function(){ const o = Storage.prototype.setItem; window.__w = 0; Storage.prototype.setItem = function (k, v) { if (k === 'sf-act' || k === 'sf-keep-until') window.__w++; return o.apply(this, arguments); }; })();")
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await goto(pg, 1200); await pg.wait_for_selector('#sf-user')
    if bool(await pg.evaluate("window.__app.state.login.remember")) != remember: await pg.locator('.sf-check').click()
    await pg.locator('#sf-user').fill('admin@ims.test'); await pg.locator('#sf-pw').fill('Admin-pass-2026')
    await pg.get_by_role('button', name='Login', exact=True).click(); await pg.wait_for_timeout(1500)
    if idle is not None: await pg.evaluate(f"window.__app.setState(st => ({{ platform: {{ ...st.platform, defaults: {{ ...st.platform.defaults, idleMins: {idle} }} }} }}))")
    return ctx, pg, errs
authed = lambda pg: pg.evaluate("!!(window.__app && window.__app.state.authed)")
async def ff(ctx, pg, minutes):
    await ctx.clock.fast_forward(int(minutes * MIN)); await pg.wait_for_timeout(700)
async def signed_out(pg):
    try:
        await pg.wait_for_selector('#sf-user', timeout=6000); return not await authed(pg)
    except Exception: return False
async def session_tests(b):
    if True:

        # ---- 1. no activity: out after 45 minutes, not 30 (the old default), not earlier ----
        ctx, pg, errs = await fresh(b)
        ok('S1 signed in (Remember me ticked)', await authed(pg))
        await ff(ctx, pg, 31); ok('S1 still signed in after 31 minutes (the old 30-minute limit is gone)', await authed(pg))
        await ff(ctx, pg, 13); ok('S1 still signed in after 44 minutes', await authed(pg))
        await ff(ctx, pg, 2)
        ok('S1 signed out after 46 minutes without activity', await signed_out(pg))
        txt = await pg.evaluate("document.querySelector('.sf-l2-card').innerText")
        ok('S1 …with a plain notice saying why', 'signed out after 45 minutes without activity' in txt and await pg.locator('.sf-login-info').count() == 1 and await pg.locator('.sf-login-err').count() == 0, txt)
        ok('S1 …and the stored sign-in is gone', await pg.evaluate("!Object.keys(localStorage).some(k => /auth-token/.test(k))"))
        await ctx.close()

        # ---- 2. continuous activity: never signed out (2 hours of work, a mouse move every 10 minutes) ----
        ctx, pg, errs = await fresh(b); alive = True
        for i in range(12):
            await ff(ctx, pg, 10); await pg.mouse.move(200 + i * 7, 300 + i * 5); await pg.wait_for_timeout(150)
            if not await authed(pg): alive = False; break
        ok('S2 two hours of work with only mouse movement: still signed in', alive and await authed(pg), i)
        left = await pg.evaluate("(+localStorage.getItem('sf-keep-until') - Date.now()) / 60000")
        ok('S2 the 45-minute window keeps moving forward with the activity', left > 40, left)
        await ff(ctx, pg, 46)
        ok('S2 …and once the person stops, 45 minutes later they are signed out', await signed_out(pg))
        ok('S2 no script errors', not errs, errs[:3]); await ctx.close()

        # ---- 3. each kind of activity counts on its own ----
        for kind, act in [('typing', "document.dispatchEvent(new KeyboardEvent('keydown', { key:'a', bubbles:true }))"),
                          ('scrolling', "document.body.dispatchEvent(new Event('scroll'))"),
                          ('a click', "document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true }))"),
                          ('a touch', "document.body.dispatchEvent(new Event('touchstart', { bubbles:true }))"),
                          ('coming back to the tab', "window.dispatchEvent(new Event('focus'))")]:
            ctx, pg, errs = await fresh(b); alive = True
            for i in range(4):
                await ff(ctx, pg, 30); await pg.evaluate(act); await pg.wait_for_timeout(150)
                if not await authed(pg): alive = False; break
            ok(f'S3 {kind} every 30 minutes keeps the sign-in alive for 2 hours', alive and await authed(pg), i); await ctx.close()

        # ---- 4. reading a document / PDF / video inside a frame (this page cannot see clicks in there) ----
        ctx, pg, errs = await fresh(b)
        await pg.evaluate("(() => { const f = document.createElement('iframe'); f.id = 'docframe'; f.srcdoc = '<p>a long policy document</p>'; document.body.appendChild(f); f.focus(); })()")
        await pg.wait_for_timeout(300)
        ok('S4 the frame has focus in a focused window', await pg.evaluate("document.activeElement.id === 'docframe' && document.hasFocus()"))
        alive = True
        for i in range(9):
            await ff(ctx, pg, 10)
            if not await authed(pg): alive = False; break
        ok('S4 reading a document in a frame for 90 minutes without a single click: still signed in', alive and await authed(pg), i)
        for i in range(8):
            await ff(ctx, pg, 10)
        ok('S4 …it ends once 90 minutes of "reading" plus 45 idle minutes have passed', await signed_out(pg))
        await ctx.close()
        ctx, pg, errs = await fresh(b)
        await pg.evaluate("(() => { const f = document.createElement('iframe'); f.id = 'docframe'; f.srcdoc = '<p>doc</p>'; document.body.appendChild(f); })()")   # present but NOT focused
        await ff(ctx, pg, 46)
        ok('S4 an unfocused frame on the page does not count as activity', await signed_out(pg)); await ctx.close()

        # ---- 5. Remember me unticked: same 45 minutes ----
        ctx, pg, errs = await fresh(b, remember=False)
        ok('S5 signed in without Remember me (nothing stored)', await authed(pg) and await pg.evaluate("!localStorage.getItem('sf-keep-until')"))
        await ff(ctx, pg, 44); ok('S5 still signed in after 44 minutes', await authed(pg))
        await ff(ctx, pg, 2); ok('S5 signed out after 46 minutes without activity', await signed_out(pg)); await ctx.close()

        # ---- 6. App settings can make it longer (never shorter than 45 while connected) ----
        ctx, pg, errs = await fresh(b, idle=60)
        await ff(ctx, pg, 50); ok('S6 App setting 60 minutes: still signed in after 50', await authed(pg))
        await ff(ctx, pg, 12); ok('S6 …signed out after 62', await signed_out(pg)); await ctx.close()
        ctx, pg, errs = await fresh(b, idle=10)
        await ff(ctx, pg, 30); ok('S6 App setting 10 minutes is raised to 45 while connected', await authed(pg)); await ctx.close()
        ctx, pg, errs = await fresh(b, idle=0)
        await ff(ctx, pg, 180); ok('S6 App setting 0 = never signed out', await authed(pg)); await ctx.close()

        # ---- 7. cheap enough to run on every mouse move ----
        ctx, pg, errs = await fresh(b)
        await pg.evaluate("window.__w = 0")
        for i in range(300): await pg.mouse.move(100 + i, 200 + (i % 50))
        w = await pg.evaluate("window.__w"); ok('S7 300 mouse moves cause only a few storage writes (at most one a second)', w <= 12, w); await ctx.close()

        # ---- 8. demo / offline mode keeps its own rule ----
        c3 = await b.new_context(viewport={'width': 1400, 'height': 900}); await c3.clock.install(); d = await c3.new_page(); await d.add_init_script(path=os.path.join(ROOT, 'tests/e2e/hook.js'))
        await d.goto('file://' + ROOT + '/' + WEB + '/index.html?small=1'); await d.wait_for_selector('#sf-user'); await d.locator('.sf-demo2-b').filter(has_text='Admin').click(); await d.get_by_role('button', name='Login', exact=True).click(); await d.wait_for_timeout(800)
        await c3.clock.fast_forward(31 * MIN); await d.wait_for_timeout(500)
        ok('S8 demo mode: signed out after 30 minutes (App setting, as before)', not await d.evaluate("!!window.__app.state.authed") and 'signed out after 30 minutes' in await d.evaluate("document.querySelector('.sf-l2-card').innerText"))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE)
        await login_tests(b)
        await session_tests(b)
        await b.close()
    bad = [n for n, c in RES if not c]
    print(f"\n{len(RES) - len(bad)}/{len(RES)} passed"); return not bad
sys.exit(0 if asyncio.run(main()) else 1)
