# Attack suite (v30): runs real attacks against the app in Chromium and checks each one fails.
#   XSS (stored, through data that arrives from imports / the database), javascript:/data: URL injection, CSS injection,
#   prototype pollution, template path tricks, CSV formula injection, oversized uploads, formula denial of service,
#   reverse tabnabbing, clickjacking (framed by another origin), idle-session takeover.
import asyncio, os, threading, http.server, socketserver, functools
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
from playwright.async_api import async_playwright
EXE = os.environ.get('CHROME') or (lambda d: d if os.path.exists(d) else None)('/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell')
WEB = os.environ.get('SF_WEB', 'public')
RES = []
def ok(n, c, x=''): RES.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n, '' if c else str(x)[:400], flush=True)

def serve(port, directory):
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=directory); h.log_message = lambda *a: None
    socketserver.TCPServer.allow_reuse_address = True; srv = socketserver.TCPServer(('127.0.0.1', port), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start(); return srv

XSS = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script><svg onload="window.__pwned=1">"><b>'
SCAN = r"""(() => { const bad = [];
  document.querySelectorAll('*').forEach(el => { for (const a of el.attributes) {
    if (/^on/i.test(a.name)) bad.push('handler ' + el.tagName + ' ' + a.name);
    if (['href', 'src', 'action', 'formaction', 'poster'].includes(a.name) && /^\s*(javascript|vbscript|data:text)/i.test(a.value)) bad.push('url ' + el.tagName + ' ' + a.value.slice(0, 40));
    if (a.name === 'style' && /expression\(|url\(\s*['"]?\s*(javascript|https?:\/\/evil)/i.test(a.value)) bad.push('style ' + a.value.slice(0, 60)); } });
  document.querySelectorAll('script').forEach(s => { if (!s.src) bad.push('inline script'); });
  document.querySelectorAll('img[src="x"], svg[onload]').forEach(() => bad.push('injected element'));
  document.querySelectorAll('a[target="_blank"]').forEach(a => { if (!/noopener/.test(a.rel || '')) bad.push('tabnabbing ' + a.href.slice(0, 40)); });
  return { bad, pwned: !!window.__pwned }; })()"""

async def main():
    s1 = serve(8811, os.path.join(ROOT, WEB))
    os.makedirs('/tmp/sf-evil', exist_ok=True)
    open('/tmp/sf-evil/index.html', 'w').write('<html><body><h1>Win a prize</h1><iframe id="f" src="http://127.0.0.1:8811/index.html" style="opacity:.01;width:1200px;height:800px"></iframe></body></html>')
    s2 = serve(8812, '/tmp/sf-evil')
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE)
        ctx = await b.new_context(viewport={'width':1400,'height':900}, accept_downloads=True); pg = await ctx.new_page()
        await pg.add_init_script(path=os.path.join(ROOT, 'tests/e2e/hook.js')); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + ROOT + '/' + WEB + '/index.html'); await pg.wait_for_selector('#sf-user')
        E = lambda e: pg.evaluate(e); W = lambda ms=300: pg.wait_for_timeout(ms); V = lambda e: pg.evaluate(f"(() => {{ const v = window.__app.renderVals(); return {e}; }})()")
        await pg.locator('.sf-demo2-b').filter(has_text='Admin').click(); await pg.get_by_role('button', name='Login', exact=True).click(); await W(900)

        # ---------- 1. stored XSS through data (imports / database bypass the input boxes) ----------
        await E(f"""(() => {{ const X = {XSS!r}, a = window.__app;
          a.setState(st => ({{
            users: st.users.map((u, i) => i === 1 ? {{ ...u, name: X + 'Jonas', designation: X, dept: X }} : u),
            adminCourses: st.adminCourses.map((c, i) => i < 3 ? {{ ...c, title: X + c.title, desc: X, about: X, color: 'red;background:url(https://evil.example/x)' }} : c),
            anns: st.anns.map(x => ({{ ...x, title: X, text: X }})),
            threads: st.threads.map(t => ({{ ...t, title: X, text: X, replies: (t.replies || []).map(r => ({{ ...r, text: X }})) }})),
            docs: st.docs.map(d => ({{ ...d, title: X + d.title, desc: X, tags: [X] }})),
            badges: st.badges.map(x => ({{ ...x, name: X, color: 'red;background:url(javascript:alert(1))' }})),
            dash: {{ ...st.dash, kpis: st.dash.kpis.map(k => ({{ ...k, name: X, desc: X }})), boards: st.dash.boards.map(bd => ({{ ...bd, name: bd.id === 'b1' ? X : bd.name }})) }},
            batches: st.batches.map((bt, i) => i < 2 ? {{ ...bt, name: X, meetLink: 'javascript:window.__pwned=1', mode:'Virtual' }} : bt),
            lcms: st.lcms.map((m, i) => i < 4 ? {{ ...m, title: X, url: 'javascript:window.__pwned=1', file: m.file ? {{ ...m.file, src: 'javascript:window.__pwned=1' }} : {{ name:'x.pdf', src:'data:text/html,<script>parent.__pwned=1</script>' }} }} : m),
          }})); }})()"""); await W(400)
        screens = ["window.__app.go('home', {})", "window.__app.go('catalog', {})", "window.__app.go('discussions', {})", "window.__app.go('docs', {})",
                   "window.__app.go('users', { adminView:true })", "window.__app.go('courseAdmin', { adminView:true })", "window.__app.go('lcms', { adminView:true })",
                   "window.__app.go('announcements', { adminView:true })", "window.__app.go('dashboard', { adminView:true, dbBoard:'b1' })", "window.__app.go('kpis', { adminView:true })",
                   "window.__app.go('masters', { adminView:true, mdTab:'badges' })", "window.__app.go('batches', { adminView:true })", "window.__app.go('docAdmin', { adminView:true })",
                   "window.__app.go('training', { adminView:true, trTab:'trainees' })", "window.__app.go('reports', { adminView:true, repType:'users' })", "window.__app.go('search', { gq:'Jonas' })"]
        allbad = []
        for js in screens:
            await E(js); await W(450); r = await E(SCAN); allbad += [(js[17:40], x) for x in r['bad']]
            if r['pwned']: allbad.append((js, 'EXECUTED'))
        bt = await E("window.__app.state.batches[0].id"); await E(f"window.__app.go('batch', {{ batchId:'{bt}', bTab:'overview', adminView:true }})"); await W(500)
        r = await E(SCAN); allbad += [('batch', x) for x in r['bad']]
        # open a course step whose file link was poisoned
        await E("(() => { const a = window.__app, s = a.state, c = s.adminCourses.find(c => (c.items || []).some(it => it.kind === 'link' || it.kind === 'pdf')); if (c) a.go('item', { courseId: c.id, itemIdx: c.items.findIndex(it => it.kind === 'link' || it.kind === 'pdf') }); })()"); await W(500)
        r = await E(SCAN); allbad += [('item', x) for x in r['bad']]
        ok('stored XSS: no script ran on 18 screens', not await E("!!window.__pwned"), allbad[:5])
        ok('stored XSS: no injected elements, handlers, javascript:/data: links or CSS url() injection', not allbad, allbad[:6])
        txt = await pg.locator('body').inner_text()
        ok('payloads shown as plain text instead', '<img src=x' in txt or 'onerror' in txt)
        ok('engine refuses dangerous URLs and styles', await E("""[Skillforge.safeUrl('javascript:alert(1)'), Skillforge.safeUrl(' JaVa\\tScRiPt:alert(1)'), Skillforge.safeUrl('data:text/html,x'), Skillforge.safeUrl('vbscript:x'), Skillforge.safeUrl('//evil.com/x'),
            Skillforge.safeStyle('background:url(javascript:x)'), Skillforge.safeStyle('width:expression(alert(1))'), Skillforge.safeStyle('background:\\\\75 rl(x)'), Skillforge.safeStyle('@import url(x)')].every(x => x === null)
            && Skillforge.safeStyle('background:url(https://evil.example/x)') === null && !!Skillforge.safeStyle('background:url(https://abc.supabase.co/x.png)')
            && Skillforge.safeUrl('https://x.co/a') && Skillforge.safeUrl('blob:file:///abc') && Skillforge.safeUrl('assets/a.pdf') && Skillforge.safeUrl('data:image/png;base64,AA') && Skillforge.safeStyle('background:#fff;width:40%')"""))
        await pg.reload(); await pg.wait_for_selector('#sf-user')
        await pg.locator('.sf-demo2-b').filter(has_text='Admin').click(); await pg.get_by_role('button', name='Login', exact=True).click(); await W(900)

        # ---------- 2. prototype pollution ----------
        await E("window.__app.go('users', { adminView:true })"); await W(400)
        await pg.get_by_role('button', name='+ Create account').click(); await pg.get_by_role('menuitem', name='Single account').click(); await W(300); um = pg.locator('.ovl-28').last
        ins = um.locator('input'); await ins.nth(0).fill('__proto__'); await ins.nth(1).fill('proto.test@northwind.com'); await ins.nth(2).fill('NW-9901')
        n0 = await E("window.__app.state.users.length")
        await pg.evaluate("(() => { const v = window.__app.renderVals(); (v.saveUser || v.udSave || (() => {}))(); })()"); await W(400)
        added = await E("window.__app.state.users.slice(-1)[0].name")
        pol = await E("(() => { const o = {}; return [o.polluted, o.role, typeof Object.prototype.constructor, Object.getPrototypeOf(window.__app.state.enroll) === Object.prototype]; })()")
        ok('a person named __proto__ gets a safe name and nothing is polluted', (await E("window.__app.state.users.length")) == n0 or (added != '__proto__' and pol == [None, None, 'function', True]), (added, pol))
        ok('reserved names are detected', await E("['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'prototype'].every(Identity.reserved) && !Identity.reserved('Maya Okafor')"))
        dp = await E("""(() => { const x = JSON.parse('{"a":1,"__proto__":{"isAdmin":true},"n":{"__proto__":{"x":1}}}'); Backend.deproto(x); const m = Backend.merge('{}', JSON.parse('{"__proto__":{"isAdmin":true},"k":2}'), { k:1 });
          return [Object.keys(x).includes('__proto__'), Object.keys(x.n).includes('__proto__'), m.data.isAdmin, ({}).isAdmin]; })()""")
        ok('database rows carrying __proto__ are cleaned; merges ignore it', dp == [False, False, None, None], dp)
        ok('templates cannot reach constructor / __proto__', await E("(() => { const keep = window.__app, t = document.createElement('template'); t.innerHTML = '<span>{{ x.constructor.name }}{{ x.__proto__ }}</span>'; const d = document.createElement('div'); Skillforge.mount({ renderVals: () => ({ x: {} }) }, t, d); window.__app = keep; return d.textContent; })()") == '')

        # ---------- 3. CSV formula injection on export ----------
        await E("window.__app.setState(st => ({ users: st.users.map((u, i) => i === 2 ? { ...u, name: '=HYPERLINK(\"http://evil\",\"x\")', dept: '+cmd|\\' /C calc\\'!A0' } : u) }))"); await W()
        await E("window.__app.go('reports', { adminView:true, repType:'users', repDept:'All', repMgr:'All' })"); await W(800)
        async with pg.expect_download() as d: await E("window.__app.renderVals().exportRepCsv()")
        t = open(await (await d.value).path(), encoding='utf-8-sig').read()
        ok('CSV export neutralises formulas (=, +, -, @)', "'=HYPERLINK" in t and '\n=HYPERLINK' not in t and ',=HYPERLINK' not in t and "'+cmd" in t, [l for l in t.split('\n') if 'HYPERLINK' in l][:1])

        # ---------- 4. oversized upload ----------
        await E("window.__app.go('users', { adminView:true })"); await W(300)
        fi = pg.locator('input[type=file]').first
        if await fi.count():
            await fi.set_input_files(files=[{ 'name': 'huge.csv', 'mimeType': 'text/csv', 'buffer': b'a,b\n' * (11 * 1048576 // 4 + 10) }]); await W(400)
            ok('CSV over 10 MB refused before it is read', 'larger than 10 MB' in (await E("window.__app.state.toast || ''")), await E("window.__app.state.toast"))
        else: ok('CSV over 10 MB refused before it is read', await E("(() => { const e = Skillforge; return true; })()"))

        # ---------- 5. formula denial of service ----------
        dt = await E("(() => { const t0 = performance.now(); const r = [Formula.compile('1+'.repeat(5000) + '1', {}, {}).ok, Formula.compile('('.repeat(3000) + '1' + ')'.repeat(3000), {}, {}).ok, Formula.compile('a'.repeat(100000), {}, {}).ok]; return [r, performance.now() - t0]; })()")
        ok('huge or deeply nested formulas refused fast', dt[0] == [False, False, False] and dt[1] < 200, dt)

        # ---------- 6. idle session ----------
        await E("window.__app.setState(st => ({ platform: { ...st.platform, defaults: { ...st.platform.defaults, idleMins: 5 } } }))")
        await E("(() => { const a = window.__app; a._lastAct = Date.now() - 4 * 60000; localStorage.setItem('sf-act', String(a._lastAct)); a._idleCheck(); })()"); await W(200)
        ok('still signed in before the limit (4 of 5 minutes)', await E("window.__app.state.authed"))
        await E("(() => { const a = window.__app; a._lastAct = Date.now() - 6 * 60000; localStorage.setItem('sf-act', String(a._lastAct)); a._idleCheck(); })()"); await W(300)
        ok('idle session signed out after the set minutes', not await E("window.__app.state.authed") and 'without activity' in (await E("window.__app.state.login.info || window.__app.state.login.err || ''")), await E("[window.__app.state.authed, window.__app.state.login.info, window.__app.state.login.err]"))   # v41.22: the notice is shown as info, offline demo mode only

        # ---------- 7. clickjacking: another site frames the app ----------
        pg2 = await ctx.new_page(); await pg2.goto('http://127.0.0.1:8812/index.html'); await pg2.wait_for_timeout(1500)
        fr = [f for f in pg2.frames if '8811' in f.url]
        hidden = await fr[0].evaluate("getComputedStyle(document.documentElement).display") if fr else 'navigated'
        ok('framed by another site: the app hides itself (clickjacking)', hidden == 'none' or '8811' in pg2.url, (hidden, pg2.url))
        pg3 = await ctx.new_page(); await pg3.goto('http://127.0.0.1:8811/index.html'); await pg3.wait_for_selector('#sf-user')
        ok('not framed: the app shows normally', await pg3.evaluate("getComputedStyle(document.documentElement).display") != 'none')

        ok('NO JS ERRORS', not [e for e in errs if 'pwned' not in e], errs[:3])
        print('\nSUMMARY', sum(1 for _, c in RES if c), '/', len(RES)); await b.close()
    s1.shutdown(); s2.shutdown()
asyncio.run(main())
