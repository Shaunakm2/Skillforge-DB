"""SCORM isolation, end to end: the app on https://app.test, packages on https://content.test (real content-site
Function code run by tests/e2e/content-server.mjs), Supabase simulated by tests/e2e/mock-supabase.js.
Checks that a package cannot reach the app's session, that the SCORM bridge works across origins, and that forged
messages and tokens are refused.   python3 tests/e2e/scorm_isolation_e2e.py
"""
import asyncio, os, subprocess, sys, time, urllib.request, mimetypes
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
EXE = os.environ.get('CHROME') or (lambda d: d if os.path.exists(d) else None)('/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell')   # None: Playwright's own Chromium (CI)
WEB = os.environ.get('SF_WEB', 'public')   # 'dist' tests the bundled build (npm run build)
CFG = "window.SKILLFORGE_CONFIG = { SUPABASE_URL:'https://mock.supabase.co', SUPABASE_ANON_KEY:'anon', ORG_ID:'northwind', STORAGE_BUCKET:'lms-files' };"
HOOK = "(function(){let sf;Object.defineProperty(window,'Skillforge',{configurable:true,get(){return sf},set(v){const m=v.mount;v.mount=(app,...a)=>{window.__app=app;return m(app,...a)};sf=v;}});})();"
RES = []
def ok(n, c, x=''): RES.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n, '' if c else str(x)[:400], flush=True)
PORT = 18765

async def main():
    srv = subprocess.Popen(['node', os.path.join(ROOT, 'tests/e2e/content-server.mjs'), str(PORT), 'https://app.test'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    srv.stdout.readline()
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path=EXE)
            ctx = await b.new_context(viewport={'width': 1300, 'height': 900})
            async def app_route(route):
                path = route.request.url.split('https://app.test', 1)[1].split('?')[0].split('#')[0] or '/'
                if path == '/': path = '/index.html'
                if path == '/js/config.js': return await route.fulfill(body=CFG, content_type='application/javascript')
                if path == '/vendor/supabase.js': return await route.fulfill(body='/* mocked */', content_type='application/javascript')
                if path == '/__test/learning-core.js': return await route.fulfill(path=os.path.join(ROOT, 'supabase/functions/_shared/learning-core.js'), content_type='application/javascript')
                f = os.path.join(ROOT, WEB, path.lstrip('/'))
                if not os.path.isfile(f): return await route.fulfill(status=404, body='nf')
                await route.fulfill(path=f, content_type=mimetypes.guess_type(f)[0] or 'application/octet-stream')
            async def content_route(route):
                # launch sessions live in the mock database inside the app page: copy them to the content server first
                sess = await pg.evaluate("JSON.stringify(window.__sb.all('scormSess'))")
                urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}/__sess', data=sess.encode(), method='POST'))
                u = route.request.url.replace('https://content.test', f'http://127.0.0.1:{PORT}').split('#')[0]
                try: r = urllib.request.urlopen(u); body, st, hd = r.read(), r.status, dict(r.headers)
                except urllib.error.HTTPError as e: body, st, hd = e.read(), e.code, dict(e.headers)
                await route.fulfill(status=st, body=body, headers=hd)
            await ctx.route('https://app.test/**', app_route)
            await ctx.route('https://content.test/**', content_route)
            pg = await ctx.new_page()
            await pg.add_init_script(path=os.path.join(ROOT, 'tests/e2e/mock-supabase.js')); await pg.add_init_script(script=HOOK)
            await pg.add_init_script(script="if (location.origin === 'https://app.test') { window.__sb.contentOrigin = 'https://content.test'; window.__sb.signKey = 'k'; window.__sb.addMember({ user_id:'u-admin', email:'lena.fischer@northwind.com', emp_id:'NW-1007', app_name:'Lena Fischer', role:'Admin', password:'Admin-pass-2026' }); localStorage.setItem('sb-mock-auth-token', 'SECRET-SESSION'); }")
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('https://app.test/index.html'); await pg.wait_for_selector('#sf-user')
            await pg.add_script_tag(url='https://app.test/__test/learning-core.js')
            await pg.evaluate("window.__demo = { ...window.__app.state }")   # v41.19: sample data is loaded by the test, not offered by the app
            W = lambda ms=300: pg.wait_for_timeout(ms)
            S = lambda e: pg.evaluate(f"(() => {{ const s = window.__app.state; return {e}; }})()")
            async def login(u, pw):
                await pg.evaluate("window.__app.setState({ authed:false, loginView:'signin' })"); await W()
                await pg.locator('#sf-user').fill(u); await pg.locator('#sf-pw').fill(pw); await pg.get_by_role('button', name='Login', exact=True).click(); await W(1000)
            await login('lena.fischer@northwind.com', 'Admin-pass-2026')
            await pg.evaluate("window.__app.setState(Object.fromEntries(Object.entries(window.__demo).filter(([k]) => ['users','adminCourses','lcms','qs','quizzes','enroll','itemDone','assignedOn','bookmarks'].includes(k))))"); await W()
            await pg.evaluate("window.__app.go('database', { adminView:true })"); await W()
            await pg.locator('button').filter(has_text='Start with an empty organisation').click(); await W(2500)
            # a SCORM module in the content store, as step 0 of the safety course (not linear), Maya enrolled
            await pg.evaluate("""(() => { const sb = window.__sb, c = sb.get('adminCourses', 'safety');
              sb.serverWrite('lcms', 'mscorm', { id:'mscorm', code:'MOD-900', type:'SCORM', title:'Fire drill', file:{ name:'fire.zip', path:'northwind/scorm/pk1/', launch:'index.html', src:'' } });
              sb.serverWrite('adminCourses', 'safety', { ...c, features: { ...c.features, linear:false }, items: [{ kind:'scorm', moduleId:'mscorm', title:'Fire drill', file:{ name:'fire.zip', path:'northwind/scorm/pk1/', launch:'index.html' } }].concat(c.items) });
              sb.serverWrite('enroll', 'NW-1001', { ...(sb.get('enroll', 'NW-1001') || {}), safety:'2026-12-31' });
              sb.serverWrite('bookmarks', 'NW-1001', { safety: { item:0, location:'page 1', suspend:'S1' } });
              sb.addMember({ user_id:'u-maya', email:'maya.okafor@northwind.com', emp_id:'NW-1001', app_name:'Maya Okafor', role:'Learner', password:'Maya-pass-2026x' }); })()""")
            await pg.evaluate("Backend.signOut()"); await login('maya.okafor@northwind.com', 'Maya-pass-2026x')
            ok('learner signed in', await S("s.authed && s.meName === 'Maya Okafor'"))
            await pg.evaluate("window.__app.go('item', { courseId:'safety', itemIdx:0, scormOn:false })"); await W(500)
            calls0 = await pg.evaluate("window.__sb.calls.length")
            await pg.evaluate("window.__app.renderVals().launchScorm()"); await W(2500)
            fr = pg.locator('iframe.sf-scorm')
            src = await fr.get_attribute('src'); sb_attr = await fr.get_attribute('sandbox') or ''
            ok('package launched on the separate content origin with a token', src.startswith('https://content.test/c/') and '#sfcmi=' in src, src)
            ok('frame is sandboxed (no top navigation)', 'allow-scripts' in sb_attr and 'allow-top-navigation' not in sb_attr, sb_attr)
            frame = next((f for f in pg.frames if f.url.startswith('https://content.test/')), None)
            txt = await frame.locator('#s').inner_text() if frame else ''
            ok('package ran and could not reach the app (session, storage, window)', txt == 'done isolated', txt)
            cm = await pg.evaluate("ScormRT.peek()['cmi.comments'] || ''")
            ok('resume point and suspend data delivered to the package', 'resume=page 1|S1|resume' in cm, cm)
            bm = await S("(s.bookmarks['Maya Okafor'] || {}).safety || {}")
            ok('bookmark and suspend data saved from the package', bm.get('location') == 'page 2' and bm.get('suspend') == 'S2', bm)
            sent = await pg.evaluate(f"window.__sb.calls.slice({calls0}).map(c => c[1])")
            ok('package status goes to the server (scormCommit), never completeStep', 'scormCommit' in sent and 'completeStep' not in sent, sent)
            ok('completion NOT recorded before the minimum time', not await pg.evaluate("!!((window.__sb.get('itemDone', 'NW-1001') || {}).safety || {})[0]"))
            await pg.evaluate("window.__sb.clockSkew = 120000"); r = await pg.evaluate("Backend.scormFlush()"); await W(500)
            ok('completion recorded by the server once the minimum time has passed', r.get('done') and await pg.evaluate("((window.__sb.get('itemDone', 'NW-1001') || {}).safety || {})[0].src === 'scorm'"), r)
            ok('launch session is never sent to the browser state', await pg.evaluate("!JSON.stringify(window.__app.state).includes('scormSess')"))
            # forged messages: from the app origin itself and from another frame -> ignored
            n0 = await pg.evaluate("window.__sb.calls.filter(c => c[1] === 'completeStep').length")
            await pg.evaluate("ScormRT.reset('Maya Okafor', 'safety', 0); window.postMessage({ sf:'scorm', op:'set', k:'cmi.core.lesson_status', v:'completed' }, '*')"); await W(500)
            ok('forged message from another origin is ignored', await pg.evaluate("window.__sb.calls.filter(c => c[1] === 'completeStep').length") == n0)
            # tampered token
            def status(u):
                try: return urllib.request.urlopen(u.replace('https://content.test', f'http://127.0.0.1:{PORT}')).status
                except urllib.error.HTTPError as e: return e.code
            async def push_sess():
                sess = await pg.evaluate("JSON.stringify(window.__sb.all('scormSess'))")
                urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}/__sess', data=sess.encode(), method='POST'))
            await push_sess()
            ok('the live launch link works', status(src.split('#')[0]) == 200)
            await pg.evaluate("window.__app.go('item', { courseId:'safety', itemIdx:0, scormOn:false })"); await W(300)
            await pg.evaluate("window.__app.renderVals().launchScorm()"); await W(1500); await push_sess()
            src2 = await pg.locator('iframe.sf-scorm').get_attribute('src')
            ok('relaunching revokes the previous link', src2 != src and status(src.split('#')[0]) == 403 and status(src2.split('#')[0]) == 200)
            await pg.evaluate("window.__app.go('home')"); await W(800); await push_sess()
            ok('leaving the step ends the session (link refused)', status(src2.split('#')[0]) == 403, await pg.evaluate("window.__sb.calls.slice(-4)"))
            ok('encoded-slash traversal is refused', status(src.split('#')[0].rsplit('/', 1)[0] + '/..%2F..%2F..%2F..%2Flms-files%2Fnorthwind%2Fx.pdf') in (403, 404))
            st = status('https://content.test/c/bad.token/index.html')
            ok('content site refuses a bad token', st == 403, st)
            st = status(src.split('#')[0].rsplit('/', 1)[0] + '/%2e%2e/%2e%2e/secret')
            ok('content site refuses path tricks', st in (403, 404), st)
            ok('NO JS ERRORS', not errs, errs[:3])
            await b.close()
    finally:
        srv.terminate()
    print('\nSUMMARY', sum(c for _, c in RES), '/', len(RES))
    sys.exit(0 if all(c for _, c in RES) else 1)
asyncio.run(main())
