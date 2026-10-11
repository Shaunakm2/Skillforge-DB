# v36: full sweep. For each role (learner, trainer, admin) and viewport (laptop, phone): opens every screen, checks layout
# (no page-wide sideways scroll, no unnamed buttons, no broken images, no unsafe links, tap targets), then clicks EVERY
# visible button (screen state restored before each click) and records script errors, sideways scroll after the click,
# buttons covered by something else, and messages that claim something was sent/uploaded without a server.
# Usage: python sweep_e2e.py [role] [laptop|phone]     SWEEP_PART=k/N splits the screens for parallel runs.
import asyncio, os, sys, json, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
from playwright.async_api import async_playwright
EXE = os.environ.get('CHROME') or (lambda d: d if os.path.exists(d) else None)('/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell')
WEB = os.environ.get('SF_WEB', 'public')
ROLES = {'learner': ('learner', 'Maya Okafor', False), 'trainer': ('instructor', 'Daniel Reyes', True), 'admin': ('admin', 'Lena Fischer', True)}
VPS = {'laptop': (1366, 800), 'phone': (390, 844)}
MAXB = int(os.environ.get('SWEEP_MAX', '80'))
async def run(role, vp):
    rid, name, adm = ROLES[role]; W_, H_ = VPS[vp]; issues = []; clicks = 0; screens = 0
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE); pg = await b.new_page(viewport={'width':W_, 'height':H_}, accept_downloads=True)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))
        await pg.add_init_script(path=os.path.join(ROOT, 'tests/e2e/hook.js')); await pg.add_init_script("window.open = () => null; window.print = () => {};")
        async def login():
            await pg.goto('file://' + ROOT + '/' + WEB + '/index.html'); await pg.wait_for_selector('#sf-user')
            await pg.locator('.sf-demo2-b').filter(has_text='Learner').click(); await pg.get_by_role('button', name='Login', exact=True).click(); await pg.wait_for_timeout(500)
            await pg.evaluate(f"window.__app.setState({{ role:{rid!r}, meName:{name!r}, meRole:{rid!r}, adminView:{'true' if adm else 'false'}, toast:null }})")
        await login()
        scr = await pg.evaluate("[...new Set(Object.keys(Access.screenPerms).concat(['home','catalog','progress','calendar','discussions','docs','search','account','admin','settings']))]")
        part = os.environ.get('SWEEP_PART')
        if part: k, N = map(int, part.split('/')); scr = [x for i, x in enumerate(scr) if i % N == k]
        for sc in scr:
            async def goto():
                if not await pg.evaluate("!!window.__app.state.authed"): await login()
                await pg.evaluate(f"window.__app.setState({{ role:{rid!r}, meName:{name!r}, meRole:{rid!r} }}); window.__app.go({sc!r}, {{ adminView:{'true' if adm else 'false'} }})"); await pg.wait_for_timeout(220)
            errs.clear(); await goto(); v = await pg.evaluate("window.__app._scrV")
            if v == 'denied' or (v != sc and sc != 'feedback'): continue
            await pg.evaluate("window.__base = Object.fromEntries(Object.entries(window.__app.state).filter(([k, x]) => x === null || typeof x !== 'object' || (!Array.isArray(x) && Object.keys(x).length < 40)))")
            screens += 1
            lay = await pg.evaluate("""(() => { const o = [], vw = innerWidth;
              if (document.documentElement.scrollWidth > vw + 1) o.push('page scrolls sideways (' + document.documentElement.scrollWidth + 'px wide)');
              const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
              const unnamed = [...document.querySelectorAll('button')].filter(vis).filter(e => !(e.textContent.trim() || e.getAttribute('aria-label') || e.getAttribute('title')));
              if (unnamed.length) o.push(unnamed.length + ' button(s) with no name: ' + unnamed.slice(0, 3).map(e => e.className).join(', '));
              const imgs = [...document.querySelectorAll('img')].filter(vis).filter(i => i.complete && !i.naturalWidth); if (imgs.length) o.push(imgs.length + ' broken image(s)');
              const bad = [...document.querySelectorAll('a[href]')].filter(a => /^\\s*javascript:/i.test(a.getAttribute('href'))); if (bad.length) o.push(bad.length + ' javascript: link(s)');
              const tiny = [...document.querySelectorAll('button, a[href], select')].filter(vis).filter(e => { const r = e.getBoundingClientRect(); return vw < 500 && (r.height < 24 || r.width < 24); });
              if (tiny.length > 3) o.push(tiny.length + ' tap targets under 24px');
              return o; })()""")
            for x in lay: issues.append({'screen': sc, 'kind': 'layout', 'msg': x})
            if errs: issues.append({'screen': sc, 'kind': 'error-on-open', 'msg': errs[:2]})
            n = await pg.evaluate("[...document.querySelectorAll('button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && !e.disabled; }).length")
            for i in range(min(n, MAXB)):
                errs.clear()
                await pg.evaluate("(() => { const s = window.__app.state, b = window.__base, p = {}; for (const k in s) { if (k in b) { if (s[k] !== b[k]) p[k] = b[k]; } else if (s[k] === null || typeof s[k] !== 'object' || (!Array.isArray(s[k]) && Object.keys(s[k]).length < 40)) p[k] = undefined; } p.toast = null; window.__app.setState(p); })()")
                await goto()
                lab = await pg.evaluate(f"""(() => {{ const L = [...document.querySelectorAll('button')].filter(e => {{ const r = e.getBoundingClientRect(); return r.width && r.height && !e.disabled; }}); const e = L[{i}]; if (!e) return null;
                  const t = (e.textContent.trim() || e.getAttribute('aria-label') || e.getAttribute('title') || e.className).replace(/\\s+/g, ' ').slice(0, 50); if (/^(sign out|log out)$/i.test(t)) return '__skip';
                  const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; let cover = '';
                  if (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight) {{ const h = document.elementFromPoint(x, y); if (h && h !== e && !e.contains(h) && !h.closest('.ovl-33')) cover = (h.className || h.tagName) + ''; }}
                  e.click(); return [t, cover]; }})()""")
                if lab is None: break
                if lab == '__skip': continue
                lab, cover = lab; clicks += 1
                if cover: issues.append({'screen': sc, 'kind': 'covered', 'msg': lab + ' is under ' + cover[:60]})
                await pg.wait_for_timeout(120)
                t = await pg.evaluate("window.__app.state.toast || ''")
                if errs: issues.append({'screen': sc, 'kind': 'script-error', 'msg': lab + ' → ' + errs[0][:200]})
                if re.search(r'\b(sent|uploaded|emailed|e-mailed)\b', t, re.I) and not re.search(r"(isn.t|aren.t|not connected|in Skillforge)", t, re.I):
                    issues.append({'screen': sc, 'kind': 'claim', 'msg': lab + ' → “' + t[:120] + '”'})
                if await pg.evaluate("document.documentElement.scrollWidth > innerWidth + 1"): issues.append({'screen': sc, 'kind': 'layout-after-click', 'msg': lab + ' → page scrolls sideways'})
                await pg.keyboard.press('Escape')
        await b.close()
    out = {'role': role, 'viewport': vp, 'screens': screens, 'clicks': clicks, 'issues': issues}
    os.makedirs(os.path.join(ROOT, 'tests/e2e/out'), exist_ok=True)
    sfx = ('-p' + os.environ['SWEEP_PART'].replace('/', 'of')) if os.environ.get('SWEEP_PART') else ''
    json.dump(out, open(os.path.join(ROOT, 'tests/e2e/out', f'sweep-{role}-{vp}{sfx}.json'), 'w'), indent=1)
    print('SWEEP', role, vp, 'screens', screens, 'clicks', clicks, 'issues', len(issues), flush=True)
    return out
async def main():
    rs = [sys.argv[1]] if len(sys.argv) > 1 else list(ROLES); vs = [sys.argv[2]] if len(sys.argv) > 2 else list(VPS)
    tot = 0
    for r in rs:
        for v in vs: tot += len([x for x in (await run(r, v))['issues'] if x['kind'] in ('script-error', 'error-on-open')])
    print('SUMMARY', 'script errors:', tot); sys.exit(1 if tot else 0)
asyncio.run(main())
