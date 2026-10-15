"""v41.23: (1) "From your team" shows real teammates, no invented rating / learners / level, (2) no "Northwind" anywhere,
(3) certificates of any shape (A4 landscape, A4 portrait, your own), the Certificate ID as a movable field.
Offline (sample data) mode, served over http because the PDF reader is loaded as a module.   Run:  python3 tests/e2e/v41_23_e2e.py"""
import asyncio, base64, functools, http.server, os, re, sys, tempfile, threading
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
EXE = os.environ.get('CHROME') or (lambda d: d if os.path.exists(d) else None)('/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell')
WEB = os.environ.get('SF_WEB', 'public')
RES = []
def ok(n, c, x=''): RES.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n, '' if c else str(x)[:500], flush=True)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve(directory):
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=directory)); threading.Thread(target=srv.serve_forever, daemon=True).start(); return srv
def make_pdf(w, h):   # a plain one-page PDF: cream page, red band on top, blue square bottom-right
    st = f"0.99 0.97 0.9 rg 0 0 {w} {h} re f 0.85 0.1 0.1 rg 0 {h*0.88} {w} {h*0.12} re f 0 0.2 0.9 rg {w*0.88} 0 {w*0.12} {h*0.18} re f"
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>", f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w} {h}] /Contents 4 0 R /Resources << >> >>".encode(), f"<< /Length {len(st)} >>\nstream\n{st}\nendstream".encode()]
    out = b"%PDF-1.4\n"; offs = []
    for i, o in enumerate(objs): offs.append(len(out)); out += f"{i+1} 0 obj\n".encode() + o + b"\nendobj\n"
    x = len(out); out += f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n".encode() + b"".join(f"{o:010d} 00000 n \n".encode() for o in offs)
    return out + f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n".encode()
def make_svg(w, h):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"><rect width="{w}" height="{h}" fill="#FDF7E6"/><rect width="{w}" height="{h*0.12}" fill="#D91A1A"/>'
            f'<rect x="{w*0.88}" y="{h*0.82}" width="{w*0.12}" height="{h*0.18}" fill="#0033E6"/></svg>').encode()
IMG_JS = """([w,h,fmt])=>{const cv=document.createElement('canvas');cv.width=w;cv.height=h;const g=cv.getContext('2d');g.fillStyle='#FDF7E6';g.fillRect(0,0,w,h);
 g.fillStyle='#D91A1A';g.fillRect(0,0,w,Math.round(h*.12));g.fillStyle='#0033E6';g.fillRect(Math.round(w*.88),Math.round(h*.82),w-Math.round(w*.88),h-Math.round(h*.82));
 return cv.toDataURL(fmt==='jpg'?'image/jpeg':'image/png',0.95).split(',')[1]}"""
PIX_JS = """async (u)=>{const im=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('img'));i.src=u});const cv=document.createElement('canvas');cv.width=im.naturalWidth;cv.height=im.naturalHeight;const g=cv.getContext('2d');g.drawImage(im,0,0);
 const px=(x,y)=>Array.from(g.getImageData(Math.min(cv.width-1,Math.max(0,x)),Math.min(cv.height-1,Math.max(0,y)),1,1).data).slice(0,3); const W=cv.width,H=cv.height;
 return {w:W,h:H,tl:px(2,2),tr:px(W-3,2),bl:px(2,H-3),br:px(W-3,H-3),mid:px(Math.round(W/2),Math.round(H*.5))}}"""
near = lambda a, b, t=45: all(abs(x - y) <= t for x, y in zip(a, b))
RED, BLUE, CREAM = (217, 26, 26), (0, 51, 230), (253, 247, 230)

async def main():
    tmp = tempfile.mkdtemp(); srv = serve(os.path.join(ROOT, WEB)); base = f'http://127.0.0.1:{srv.server_address[1]}/index.html?small=1'
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE)
        ctx = await b.new_context(viewport={'width': 1500, 'height': 1000}, accept_downloads=True); pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); await pg.add_init_script(path=os.path.join(ROOT, 'tests/e2e/hook.js'))
        E = lambda e: pg.evaluate(e); S = lambda e: pg.evaluate(f"(() => {{ const s = window.__app.state; return {e}; }})()"); V = lambda e: pg.evaluate(f"(() => {{ const v = window.__app.renderVals(); return {e}; }})()")
        W = lambda ms=250: pg.wait_for_timeout(ms)
        async def login(who):
            await pg.goto(base); await pg.wait_for_selector('#sf-user'); await pg.locator('.sf-demo2-b').filter(has_text=who).click(); await pg.get_by_role('button', name='Login', exact=True).click(); await W(900)

        # =============== 1. From your team: real people, nothing invented ===============
        await login('Learner')
        await E("window.__app.go('course', { courseId:'feedback' })"); await W(500)
        exp = await S("(() => { const me = s.users.find(u => u.name === 'Maya Okafor'), mgr = me.manager; const names = s.users.filter(u => u.name !== me.name && u.status !== 'Deactivated' && u.manager === mgr && (s.enroll[u.name] || {}).feedback).map(u => u.name); return names; })()")
        v = await V("({ has: v.teamHas, line: v.teamLine, faces: v.teamFaces.map(f => f.name) })")
        ok('1 the panel appears only because teammates really have this course', len(exp) > 0 and v['has'], (exp, v))
        nums = [int(x) for x in re.findall(r'(\d+) (?:teammates?|finished)', v['line'])]
        ok('1 taking + finished = the people with this course in my team, counted from the data', sum(nums) == len(exp) and set(v['faces']) <= set(exp) and len(v['faces']) == min(4, len(exp)), (v['line'], exp))
        ok('1 the fixed text "4 teammates are taking this" is gone from the page template', '>4 teammates are taking this<' not in open(os.path.join(ROOT, WEB, 'index.html'), encoding='utf-8').read())
        txt = await E("document.querySelector('.course-overview-27 + .course-overview-27, aside .course-overview-33') ? document.querySelector('aside').innerText : ''")
        ok('1 "From your team" shows on screen with the real line', 'From your team' in txt and v['line'] in txt, txt[:200])
        none_id = await S("(() => { const me = s.users.find(u => u.name === 'Maya Okafor'); return s.adminCourses.map(c => c.id).find(id => !s.users.some(u => u.name !== me.name && u.status !== 'Deactivated' && u.manager === me.manager && (s.enroll[u.name] || {})[id])); })()")
        await E(f"window.__app.go('course', {{ courseId:{none_id!r} }})"); await W(400)
        ok('1 a course nobody in my team has: the panel is hidden', none_id and not (await V('v.teamHas')) and 'From your team' not in (await E("document.body.innerText")), none_id)
        # teammates who finished are counted separately
        await E("window.__app.go('course', { courseId:'feedback' })"); await W(300)
        other = exp[0]
        await E(f"window.__app.setState(st => ({{ itemDone: {{ ...st.itemDone, [{other!r}]: {{ ...(st.itemDone[{other!r}] || {{}}), feedback: Object.fromEntries(st.adminCourses.find(c => c.id === 'feedback').items.map((x, i) => [i, '2026-10-01'])) }} }} }}))"); await W(400)
        v2 = await V("v.teamLine")
        ok('1 a teammate who finished is shown as "finished", not "taking"', 'finished' in v2, v2)
        # no invented rating / learners / level for a course from the database
        await E("window.__app.go('course', { courseId:'safety' })"); await W(400)
        t = await E("document.body.innerText")
        ok('1 database course: no star rating, no learner count, no level chip', '★' not in t.split('Your progress')[0] and 'learners)' not in t and 'Foundational' not in t and 'Intermediate' not in t, t[:300])
        ok('1 "and a certificate" only where the course has a certificate', ' and a certificate' in t)
        await E("window.__app.setState(st => ({ adminCourses: st.adminCourses.map(c => c.id === 'safety' ? { ...c, features: { ...c.features, cert: false } } : c) }))"); await W(300)
        ok('1 …and it disappears when the certificate switch is off', ' and a certificate' not in (await E("document.body.innerText")) and 'XP' in (await E("document.body.innerText")))
        await E("window.__app.go('course', { courseId:'feedback' })"); await W(300); t = await E("document.body.innerText")
        ok('1 the built-in sample courses keep their sample rating', '★ 4.9' in t)
        await E("window.__app.go('catalog')"); await W(400)
        ok('1 catalog still offers the level filter while sample courses have levels', await E("[...document.querySelectorAll('select')].some(s => [...s.options].some(o => o.textContent === 'Foundational'))"))

        # =============== 2. no "Northwind" ===============
        leak = []
        for root, _, files in os.walk(os.path.join(ROOT, 'public')):
            if 'vendor' in root: continue
            for f in files:
                if f.endswith(('.js', '.html', '.css', '.svg', '.json', '.md')):
                    for i, line in enumerate(open(os.path.join(root, f), encoding='utf-8', errors='ignore')):
                        if re.search('northwind', line, re.I) and not (f == 'backend.js' and 'brandFix' in line): leak.append(f'{f}:{i+1}')
        ok('2 no file of the app mentions Northwind (only the legacy sign-in-message cleaner in backend.js)', not leak, leak)
        for fn in ('SETUP-SUPABASE.md', 'supabase/migrations/001_skillforge.sql'):
            ok(f'2 {fn} has no Northwind example', not re.search('northwind', open(os.path.join(ROOT, fn), encoding='utf-8').read(), re.I))
        await login('Admin')
        st = await S("JSON.stringify({ brands: s.masters.brands, hol: s.holidays.map(h => h.name), zh: s.zh.baseUrl, mails: s.users.slice(0, 40).map(u => u.email) })")
        ok('2 default master data, holidays and ZingHR address carry no Northwind', 'orthwind' not in st, st[:300])
        await E("window.__app.go('users', { adminView:true })"); await W(500); await E("window.__app.setState({ uImp: {} })"); await W(300)
        async with pg.expect_download(timeout=15000) as dl: await E("window.__app.renderVals().uiTemplate()")
        d = await dl.value; await d.save_as(os.path.join(tmp, 'tpl.csv')); body = open(os.path.join(tmp, 'tpl.csv'), encoding='utf-8').read()
        ok('2 the UserMaster template download has no Northwind and no NW- sample IDs', 'orthwind' not in body and 'NW-' not in body and 'EMP-2101' in body, body[:200])
        await E("window.__app.setState({ uImp: null })"); await E("window.__app.go('users', { adminView:true })"); await E("window.__app.setState({ userModal: true, ud: null })"); await W(300)
        ok('2 Create account: employee ID example is generic', await pg.locator('input[placeholder="e.g. EMP-1015"]').count() == 1)
        await E("window.__app.setState({ userModal: false })")
        txt_all = ''
        for scr, extra in [('home', ''), ('certs', 'adminView:true'), ('zinghr', 'adminView:true'), ('batches', 'adminView:true')]:
            await E(f"window.__app.go('{scr}', {{ {extra} }})"); await W(450); txt_all += await E("document.body.innerText")
        ok('2 no screen shows the word Northwind', 'orthwind' not in txt_all)

        # =============== 3. certificates of any shape ===============
        await E("window.__app.go('certs', { adminView:true })"); await W(500)
        fi = pg.locator('.lm-drop input[type=file]').first
        async def settle():
            for _ in range(500):
                if await E("window.__app.state.certBusy === false && !!window.__app.state.toast"): return
                await W(100)
            raise Exception('timed out')
        async def up(name, data):
            path = os.path.join(tmp, name); open(path, 'wb').write(data); await E("window.__app.setState({ toast: null })"); await fi.set_input_files(path); await settle(); await W(150)
            return await E("(window.__app.state.certDraft && window.__app.state.certDraft.bg) || null"), await E("window.__app.state.toast")
        async def img(w, h, fmt='png'): return base64.b64decode(await E(f"({IMG_JS})({[w, h, fmt]})"))
        async def check(label, bg, w, h, expect_label=None, corners=True):
            ok(f'3 {label}: stored as {w}x{h}', bg and bg['w'] == w and bg['h'] == h, bg)
            if not bg: return
            px = await pg.evaluate(PIX_JS, bg['src'])
            ok(f'3 {label}: the picture really is {w}x{h}', px['w'] == w and px['h'] == h, px)
            if corners: ok(f'3 {label}: fills the whole page, no white margins (red top, blue bottom-right)', near(px['tl'], RED) and near(px['tr'], RED) and near(px['br'], BLUE), px)
        bg, t = await up('a4l.png', await img(3508, 2480)); await check('A4 landscape PNG', bg, 3508, 2480); ok('3 A4 landscape is named in the message', 'A4 landscape' in t, t)
        a = await V('[v.ctAspect, v.ctWidth, v.ctBgName]'); ok('3 preview has the A4 landscape shape', abs(float(a[0]) - 3508 / 2480) < 0.01 and a[1] == '100%' and 'A4 landscape' in a[2], a)
        bg, t = await up('a4p.png', await img(2480, 3508)); await check('A4 portrait PNG', bg, 2480, 3508); ok('3 A4 portrait is named in the message', 'A4 portrait' in t, t)
        a = await V('[v.ctAspect, v.ctWidth]'); ok('3 preview is portrait, narrower than the column', abs(float(a[0]) - 2480 / 3508) < 0.01 and a[1].startswith('min('), a)
        box = await pg.locator('.ct-canvas').bounding_box(); ok('3 the preview box on screen is taller than wide', box['height'] > box['width'], box)
        bg, t = await up('p1200.png', await img(1200, 1700)); await check('portrait 1200x1700 PNG (within 1.5 % of A4, so exact A4)', bg, 2480, 3508)
        bg, t = await up('r43.jpg', await img(1600, 1200, 'jpg')); await check('4:3 JPG', bg, 3508, 2631)
        bg, t = await up('r169.png', await img(1920, 1080)); await check('16:9 PNG', bg, 3508, 1973)
        bg, t = await up('sq.png', await img(1000, 1000)); await check('square PNG', bg, 3508, 3508); ok('3 a low-resolution design is flagged as blurry', 'blurry' in t and '1000' in t, t)
        bg, t = await up('tiny.png', await img(212, 150)); await check('tiny 212x150 PNG', bg, 3508, 2480); ok('3 tiny design: blurry warning', 'blurry' in t, t)
        before = (await E("window.__app.state.certDraft.bg.src"))
        bg, t = await up('wide.png', await img(2000, 400)); ok('3 a strip wider than 4:1 is refused with a clear message', 'too long and narrow' in t and (await E("window.__app.state.certDraft.bg.src")) == before, t)
        bg, t = await up('s_l.svg', make_svg(297, 210)); await check('landscape SVG', bg, 3508, 2480)
        bg, t = await up('s_p.svg', make_svg(210, 297)); await check('portrait SVG', bg, 2480, 3508)
        bg, t = await up('p_l.pdf', make_pdf(842, 595)); await check('landscape PDF', bg, 3508, 2480)
        bg, t = await up('p_p.pdf', make_pdf(595, 842)); await check('portrait PDF', bg, 2480, 3508)
        bg, t = await up('p_l5.pdf', make_pdf(720, 405)); await check('16:9 PDF', bg, 3508, 1973)

        # ----- the Certificate ID is a field like the others -----
        ok('3 Certificate ID is listed with the other fields', await V("v.ctFields.map(f => f.k).join()") == 'name,course,date,score,id')
        bg, t = await up('a4p2.png', await img(2480, 3508))
        await E("window.__app.setState({ certSel: 'id' })"); await W(200)
        box = await pg.locator('.ct-canvas').bounding_box(); idf = pg.locator('.ct-f', has_text='Certificate ID'); ib = await idf.bounding_box()
        x0, y0 = await S("[s.certDraft.fields.id.x, s.certDraft.fields.id.y]")
        await pg.mouse.move(ib['x'] + ib['width'] / 2, ib['y'] + ib['height'] / 2); await pg.mouse.down(); await pg.mouse.move(box['x'] + box['width'] * 0.30, box['y'] + box['height'] * 0.20, steps=8); await pg.mouse.up(); await W(200)
        x1, y1 = await S("[s.certDraft.fields.id.x, s.certDraft.fields.id.y]")
        ok('3 drag the Certificate ID anywhere on the portrait design', abs(x1 - 30) < 4 and abs(y1 - 20) < 4 and (x0, y0) != (x1, y1), (x0, y0, x1, y1))
        await E("window.__app.renderVals().ctFields.find(f => f.k === 'id').toggle()"); await W(200)
        ok('3 the ID can be switched off', await S("s.certDraft.fields.id.on === false") and await pg.locator('.ct-f', has_text='Certificate ID').count() == 0)
        await E("window.__app.renderVals().ctFields.find(f => f.k === 'id').toggle()"); await W(200)
        # render the real thing in the page and find where the ID text lands
        r = await E("""(async () => { const tpl = Certificate.withDefaults(window.__app.state.certDraft); ['name','course','date','score'].forEach(k => { tpl.fields[k].on = false; });
          const cv = await new Promise(res => Certificate.render(tpl, { name:'A', course:'B', date:'C', score:'D', id:'SF-1234' }, (c, S) => res(c))); const g = cv.getContext('2d'), W = cv.width, H = cv.height, d = g.getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = 0, y1 = 0;
          for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const i = (y * W + x) * 4; if (d[i] < 120 && d[i+1] < 140 && d[i+2] < 160) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
          return { W, H, cx: (x0 + x1) / 2 / W * 100, cy: (y0 + y1) / 2 / H * 100, found: x1 > x0 }; })()""")
        ok('3 the printed ID is at the place it was dragged to (portrait page 2480x3508)', r['W'] == 2480 and r['H'] == 3508 and r['found'] and abs(r['cx'] - x1) < 3 and abs(r['cy'] - y1) < 3, r)
        # ----- save, then download as PDF: the page has the design's shape -----
        await E("window.__app.renderVals().ctSave()"); await W(400)
        saved = await S("({ v: s.certTpl.version, bg: s.certTpl.bg, id: !!s.certTpl.fields.id })")
        ok('3 saved template remembers the design size and the ID field', saved['bg']['w'] == 2480 and saved['bg']['h'] == 3508 and saved['id'], saved)
        async def dl_pdf(js):
            async with pg.expect_download(timeout=30000) as d: await E(js)
            dd = await d.value; path = os.path.join(tmp, dd.suggested_filename); await dd.save_as(path); raw = open(path, 'rb').read()
            mb = re.search(rb'/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]', raw); im = re.search(rb'/Width (\d+) /Height (\d+)', raw)
            return dd.suggested_filename, (float(mb.group(1)), float(mb.group(2))), (int(im.group(1)), int(im.group(2))), raw[:5]
        fn, mb, im, magic = await dl_pdf("Certificate.download(window.__app.state.certTpl, { ...Certificate.values('Test Learner', 'POSH Awareness', '2026-10-15', 100), id: 'SF-TEST-1' }, 'certificate-posh.png')")
        ok('3 portrait template downloads as a portrait A4 PDF', fn == 'certificate-posh.pdf' and magic == b'%PDF-' and abs(mb[0] - 595.28) < 0.1 and abs(mb[1] - 841.89) < 0.1 and im == (2480, 3508), (fn, mb, im))
        await E("window.__app.renderVals().ctDefaultBg()"); await W(300); await E("window.__app.renderVals().ctSave()"); await W(300)
        fn, mb, im, magic = await dl_pdf("window.__app.renderVals().ctSample()")
        ok('3 the default design downloads as an A4 landscape PDF (as before)', abs(mb[0] - 841.89) < 0.1 and abs(mb[1] - 595.28) < 0.1 and im == (3508, 2480), (mb, im))
        ok('3 "Use default" gives the 1600x1131 default design', await S("s.certTpl.bg.w === 1600 && s.certTpl.bg.h === 1131"))
        # ----- a design that is neither A4 nor saved by this version: shape read from the picture -----
        await E("""(() => { const cv = document.createElement('canvas'); cv.width = 600; cv.height = 800; const g = cv.getContext('2d'); g.fillStyle = '#FDF7E6'; g.fillRect(0, 0, 600, 800); g.fillStyle = '#D91A1A'; g.fillRect(0, 0, 600, 96);
          const old = { version: 1, bg: { src: cv.toDataURL('image/png'), name: 'old-design.png' }, updatedBy: 'x', updatedAt: '2026-01-01T10:00', fields: { name:{ x:50, y:46, size:5.2, color:'#16324F', bold:true, on:true }, course:{ x:50, y:60, size:2.8, color:'#334E68', bold:true, on:true }, date:{ x:27, y:80, size:1.9, color:'#334E68', bold:false, on:true }, score:{ x:73, y:80, size:1.9, color:'#334E68', bold:false, on:true } }, history: [] };
          window.__app.setState({ certTpl: old, certDraft: null }); })()"""); await W(900)
        a = await V("[v.ctAspect, v.ctBgName, v.ctFields.length, v.ctFields.map(f => f.k).join()]")
        ok('3 an older template (no ID field, no stored size) opens with the ID field and the right shape', a[2] == 5 and a[3].endswith(',id') and abs(float(a[0]) - 0.75) < 0.01 and '2631 × 3508' in a[1], a)
        fn, mb, im, magic = await dl_pdf("Certificate.download(window.__app.state.certTpl, { ...Certificate.values('Old Template', 'Course', '2026-10-15', 90), id: 'SF-OLD' }, 'old.png')")
        ok('3 …and it downloads in its own 3:4 shape (2631x3508 px, 631x842 pt page)', im == (2631, 3508) and abs(mb[0] - 631.44) < 0.1 and abs(mb[1] - 841.92) < 0.1, (mb, im))
        ok('3 no script errors', not errs, errs[:3])
        await b.close()
    bad = [n for n, c in RES if not c]; print(f"\n{len(RES) - len(bad)}/{len(RES)} passed"); return not bad
sys.exit(0 if asyncio.run(main()) else 1)
