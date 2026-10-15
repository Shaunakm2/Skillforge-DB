"""v41.21: long assessments and idle sign-out, browser Back with editors, Gradebook scope (batch trainees, train-the-trainer),
App settings, optional training-type fields, per-batch schedule, Continue learning and the real drop-off chart.
Run:  python3 tests/e2e/v41_21_e2e.py
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

async def offline(b):
    pg = await b.new_page(viewport={'width': 1400, 'height': 900}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    dialogs = []; answer = {'v': True}
    async def on_dialog(d): dialogs.append(d.message); await (d.accept() if answer['v'] else d.dismiss())
    pg.on('dialog', lambda d: asyncio.ensure_future(on_dialog(d)))
    await pg.add_init_script(path=os.path.join(ROOT, 'tests/e2e/hook.js'))
    await pg.goto('file://' + ROOT + '/' + WEB + '/index.html?small=1'); await pg.wait_for_selector('#sf-user')
    S = lambda e: pg.evaluate(f"(() => {{ const s = window.__app.state; return {e}; }})()")
    V = lambda e: pg.evaluate(f"(() => {{ const v = window.__app.renderVals(); return {e}; }})()")
    W = lambda ms=300: pg.wait_for_timeout(ms)
    await pg.locator('.sf-demo2-b').filter(has_text='Admin').click(); await pg.get_by_role('button', name='Login', exact=True).click(); await W(800)

    # ---------- 2. browser Back ----------
    await pg.evaluate("window.__app.go('catalog')"); await W(); await pg.evaluate("window.__app.go('users', { adminView:true })"); await W()
    # open an account and close it without changes: Back must just go back (it asked about unsaved changes forever)
    await pg.evaluate("(() => { const u = window.__app.state.users[1]; window.__app.setState({ userModal:true, ud:{ ...u } }); })()"); await W()
    await pg.evaluate("window.__app.renderVals().closeUserModal()"); await W()
    dialogs.clear(); await pg.go_back(); await W(500)
    ok('2 after closing an editor, Back goes back with no prompt', await S("s.screen === 'catalog'") and not dialogs, [await S("s.screen"), dialogs])
    await pg.evaluate("window.__app.go('users', { adminView:true })"); await W()
    await pg.evaluate("(() => { const u = window.__app.state.users[1]; window.__app.setState({ userModal:true, ud:{ ...u } }); })()"); await W()
    dialogs.clear(); await pg.go_back(); await W(500)
    ok('2 editor open but unchanged: Back closes it, no prompt', await S("!s.userModal && !s.ud && s.screen === 'users'") and not dialogs, [dialogs])
    await pg.evaluate("(() => { const u = window.__app.state.users[1]; window.__app.setState({ userModal:true, ud:{ ...u } }); })()"); await W()
    await pg.evaluate("window.__app.setState(st => ({ ud: { ...st.ud, designation: 'Changed title' } }))"); await W()
    answer['v'] = False; dialogs.clear(); await pg.go_back(); await W(500)
    ok('2 unsaved changes: Back asks; Cancel keeps the editor', len(dialogs) == 1 and await S("s.userModal && s.ud.designation === 'Changed title' && s.screen === 'users'"))
    answer['v'] = True; dialogs.clear(); await pg.go_back(); await W(500)
    ok('2 unsaved changes: OK discards and actually goes back', len(dialogs) == 1 and await S("!s.userModal && !s.ud && s.screen !== 'users'"), await S("[s.screen, s.userModal]"))
    dialogs.clear(); await pg.go_back(); await W(400)
    ok('2 Back keeps working afterwards', not dialogs, dialogs)

    # ---------- 1. assessment: no idle sign-out while it is in progress ----------
    await pg.evaluate("window.__app.setState({ role:'learner', meName:'Maya Okafor', meRole:'learner', adminView:false })")
    qi = await pg.evaluate("window.__app.state.adminCourses.find(c => c.id === 'safety').items.findIndex(i => i.kind === 'quiz')")
    await pg.evaluate(f"window.__app.setState(st => ({{ itemDone: {{ ...st.itemDone, 'Maya Okafor': {{ ...(st.itemDone['Maya Okafor']||{{}}), safety: {{ 0:'2026-10-01', 1:'2026-10-01', 2:'2026-10-01' }} }} }} }}))")
    await pg.evaluate(f"window.__app.go('item', {{ courseId:'safety', itemIdx:{qi} }})"); await W(300)
    await pg.evaluate("window.__app.renderVals().startQuiz()"); await W(400)
    await pg.evaluate("(() => { const a = window.__app; a._lastAct = Date.now() - 70 * 60000; localStorage.setItem('sf-act', String(a._lastAct)); a._idleCheck(); })()"); await W(300)
    ok('1 70 minutes without a click during an assessment: still signed in', await S("s.authed && s.screen === 'quiz'"))
    await pg.evaluate("window.__app.setState({ qDone:true })"); await W(100)
    await pg.evaluate("(() => { const a = window.__app; a._lastAct = Date.now() - 70 * 60000; localStorage.setItem('sf-act', String(a._lastAct)); a._idleCheck(); })()"); await W(300)
    ok('1 after handing it in, the normal idle sign-out applies', await S("!s.authed"))
    await pg.locator('.sf-demo2-b').filter(has_text='Admin').click(); await pg.get_by_role('button', name='Login', exact=True).click(); await W(800)

    # ---------- 3. Gradebook scope ----------
    # Daniel trains Aisha; Aisha (a trainer elsewhere: train-the-trainer) is graded by Daniel, not by Lena-as-trainer
    await pg.evaluate("""window.__app.setState(st => ({ reviews: [
        { id:'g1', learner:'Aisha Khan', learnerEmp:(st.users.find(u => u.name === 'Aisha Khan') || {}).empId, quiz:'Q', qid: st.qs[0].id, answer:'a', rating:null, at:'2026-10-01' },
        { id:'g2', learner:'Jonas Berg', learnerEmp:(st.users.find(u => u.name === 'Jonas Berg') || {}).empId, quiz:'Q', qid: st.qs[0].id, answer:'b', rating:null, at:'2026-10-01' }],
      asgSub: [{ id:'s1', learner:'Aisha Khan', learnerEmp:(st.users.find(u => u.name === 'Aisha Khan') || {}).empId, courseId:'safety', step:0, status:'Submitted', text:'x', at:'2026-10-01' },
               { id:'s2', learner:'Jonas Berg', learnerEmp:(st.users.find(u => u.name === 'Jonas Berg') || {}).empId, courseId:'safety', step:0, status:'Submitted', text:'y', at:'2026-10-01' }],
      batches: [{ ...st.batches[0], id:'gb1', trainer:'Daniel Reyes', trainees:['Aisha Khan'] }].concat(st.batches.slice(1).map(b => ({ ...b, trainer: b.trainer === 'Daniel Reyes' ? 'Someone Else' : b.trainer, trainees: (b.trainees || []).filter(n => n !== 'Aisha Khan' && n !== 'Jonas Berg') }))) }))""")
    await pg.evaluate("window.__app._perms = new Set(['gradebook']); window.__app.go('gradebook', { role:'instructor', meName:'Daniel Reyes', meRole:'instructor', adminView:true })"); await W(400)
    rv = await V("[v.rvList.map(r => r.learner || r.name || r.who), v.asgRows ? v.asgRows.length : null]")
    seen = await pg.evaluate("document.body.innerText")
    ok('3 trainer sees written answers of their batch trainee', 'Aisha Khan' in seen)
    ok('3 trainer does not see people outside their batches', 'Jonas Berg' not in seen, rv)
    ok('3 scope label explains it', 'Trainees in the batches you train' in seen)
    await pg.evaluate("window.__app.go('gradebook', { role:'admin', meName:'Lena Fischer', meRole:'admin' })"); await W(400)
    seen = await pg.evaluate("document.body.innerText")
    ok('3 admin sees everyone', 'Aisha Khan' in seen and 'Jonas Berg' in seen)
    ok('3 new permission "Gradebook: all learners" exists', await pg.evaluate("MODULES.some(m => m[0] === 'gradeAll')"))

    # ---------- 4. App settings ----------
    await pg.evaluate("window.__app.setState({ role:'learner', meName:'Maya Okafor', meRole:'learner', adminView:false })")
    for k, check in [('discussions', "!window.__app.renderVals().navItems.some(n => n.label === 'Discussions')"),
                     ('calendar', "!window.__app.renderVals().navItems.some(n => n.label === 'Calendar')")]:
        await pg.evaluate(f"window.__app.setState(st => ({{ platform: {{ ...st.platform, feat: {{ ...st.platform.feat, {k}: false }} }} }}))"); await W(150)
        ok('4 switch off ' + k + ': menu item gone', await pg.evaluate(check))
        await pg.evaluate(f"window.__app.setState(st => ({{ platform: {{ ...st.platform, feat: {{ ...st.platform.feat, {k}: true }} }} }}))")
    await pg.evaluate("window.__app.go('progress')"); await W(300)
    for k, sel in [('game', '.f-game'), ('badges', '.f-badges')]:
        before = await pg.evaluate(f"[...document.querySelectorAll('{sel}')].filter(e => e.getBoundingClientRect().height).length")
        await pg.evaluate(f"window.__app.setState(st => ({{ platform: {{ ...st.platform, feat: {{ ...st.platform.feat, {k}: false }} }} }}))"); await W(150)
        after = await pg.evaluate(f"[...document.querySelectorAll('{sel}')].filter(e => e.getBoundingClientRect().height).length")
        ok('4 switch off ' + k + ': its sections are hidden', before > 0 and after == 0, (before, after))
        await pg.evaluate(f"window.__app.setState(st => ({{ platform: {{ ...st.platform, feat: {{ ...st.platform.feat, {k}: true }} }} }}))")
    await pg.evaluate("window.__app.setState(st => ({ platform: { ...st.platform, feat: { ...st.platform.feat, anns: false } } }))"); await pg.evaluate("window.__app.go('home')"); await W(200)
    ok('4 switch off announcements: Home has none', not await V("v.hasAnns"))
    await pg.evaluate("window.__app.setState(st => ({ platform: { ...st.platform, feat: { ...st.platform.feat, anns: true } } }))"); await pg.evaluate("window.__app.go('catalog', { catRel:'all', catSt:'All' })"); await W(300)
    on_ = await V("v.catalogList.filter(c => c.canReq).length")
    await pg.evaluate("window.__app.setState(st => ({ platform: { ...st.platform, feat: { ...st.platform.feat, accessReq: false } } }))"); await W(200)
    ok('4 switch off access requests: catalog cannot request', on_ > 0 and await V("v.catalogList.filter(c => c.canReq).length") == 0, on_)
    await pg.evaluate("window.__app.setState(st => ({ platform: { ...st.platform, feat: { ...st.platform.feat, accessReq: true } } }))")
    await pg.evaluate("window.__app.go('masters', { role:'admin', meName:'Lena Fischer', meRole:'admin', adminView:true, mdTab:'app' })"); await W(300)
    await pg.evaluate("window.__app.setState({ pfDraft: { password:'welcome123', dueDays:14, essDays:20, idleMins:45 } })"); await pg.evaluate("window.__app.renderVals().pfSave()"); await W(200)
    ok('4 default password without an upper-case letter is refused', 'upper-case' in str(await S("s.toast")))
    await pg.evaluate("window.__app.setState({ pfDraft: { password:'Welcome@2026', dueDays:14, essDays:20, idleMins:45 } })"); await pg.evaluate("window.__app.renderVals().pfSave()"); await W(200)
    ok('4 defaults saved', await S("s.platform.defaults.password === 'Welcome@2026' && s.platform.defaults.dueDays === 14"))
    ok('4 default password is used for new accounts', await pg.evaluate("DEFAULT_PASSWORD") == 'Welcome@2026')
    ok('4 default due date is today + 14 days', await pg.evaluate("defaultDue(window.__app.state) === Progress.plus(TODAY_KEY, 14)"))
    await pg.evaluate("window.__app.go('courseAdmin', { adminView:true })"); await W(200); await pg.evaluate("window.__app.renderVals().newCourse()"); await W(200)
    ok('4 essential-training window used for new courses', await S("s.cDraft && +s.cDraft.essentialDays === 20"), await S("s.cDraft && s.cDraft.essentialDays"))
    await pg.evaluate("window.__app.setState({ cDraft:null })")

    # ---------- 5. training type: optional fields ----------
    await pg.evaluate("window.__app.go('batches', { adminView:true, bView:'types' })"); await W(300)
    await pg.evaluate("window.__app.renderVals().newTtype()"); await W(200)
    await pg.evaluate("window.__app.setState(st => ({ ttDraft: { ...st.ttDraft, name:'Quick Pilot', code:'QP', level:'L1', days:[{ title:'', items:[] }, { title:'', items:[] }, { title:'', items:[] }] } }))"); await W(100)
    await pg.evaluate("window.__app.renderVals().saveTt()"); await W(300)
    t = await S("s.ttypes.find(t => t.name === 'Quick Pilot') || null")
    ok('5 training type saved with no passing %, weights, external assessments or day contents', t and t['passPct'] is None and t['lmsW'] is None and t['ext'] == [] and len(t['days']) == 3, [t, await S("s.ttDraft && s.ttDraft.err")])
    ok('5 list shows "Not set"', 'Not set' in await pg.evaluate("document.body.innerText"))
    await pg.evaluate("window.__app.renderVals().newTtype()"); await W(100)
    await pg.evaluate("window.__app.setState(st => ({ ttDraft: { ...st.ttDraft, name:'Bad Pilot', code:'BP', level:'L1', passPct: 150 } }))"); await pg.evaluate("window.__app.renderVals().saveTt()"); await W(150)
    ok('5 a filled-in value must still be valid', 'from 1 to 100' in (await S("s.ttDraft.err")))
    await pg.evaluate("window.__app.setState({ ttDraft:null })")

    # ---------- 5. per-batch schedule ----------
    tid = t['id']
    await pg.evaluate("window.__app.setState({ bView:'list' })"); await W(200)
    tr = await S("s.users.find(u => u.role === 'Trainer' && u.status !== 'Deactivated').name")
    async def make(extra):
        await pg.evaluate(f"""window.__app.setState(st => ({{ bdTab:'details', bDraft: {{ id:null, name:'Sched ' + Date.now(), type:{tid!r}, trainer:{tr!r}, division: (st.masters.divisions || st.masters.departments || ['Ops'])[0] || 'Ops',
          segment:(st.masters.segments || ['Functional Training'])[0] || 'Functional Training', trainingName:(st.masters.trainingNames || ['Core Elements'])[0] || 'Core Elements', traineeType:'New Hire', mode:'Virtual', meetLink:'https://teams.microsoft.com/l/x',
          placeId:'', start:'2026-11-02', trainees:[], holidays:[], err:'', ...{extra} }} }}))"""); await W(150)
        d = await V("[v.bdEndLabel, v.bdSchedNote]")
        await pg.evaluate("window.__app.renderVals().saveBatch()"); await W(250)
        return d, await S("s.bDraft ? s.bDraft.err : s.batches[0]")
    d, b0 = await make("{ sched:'standard' }")
    ok('5 standard batch: 3 training days (Mon 2 – Wed 4 Nov)', isinstance(b0, dict) and b0['end'] == '2026-11-04', [d, b0 if isinstance(b0, str) else b0.get('end')])
    d, b1 = await make("{ sched:'fast', daysN: 2 }")
    ok('5 fast track: 2 days, ends a day earlier', isinstance(b1, dict) and b1['end'] == '2026-11-03' and b1['sched'] == 'fast', b1 if isinstance(b1, str) else b1.get('end'))
    d, b2 = await make("{ sched:'extended', daysN: 5 }")
    ok('5 extended: 5 days', isinstance(b2, dict) and b2['end'] == '2026-11-06', b2 if isinstance(b2, str) else b2.get('end'))
    d, b3 = await make("{ sched:'end', endWant:'2026-11-10' }")
    ok('5 custom end date kept', isinstance(b3, dict) and b3['end'] == '2026-11-10', b3 if isinstance(b3, str) else b3.get('end'))
    d, b4 = await make("{ sched:'extended', daysN: 5, sat:true }")
    ok('5 Saturdays included: 5 days still end Friday 6 Nov (Mon 2 to Fri 6)', isinstance(b4, dict) and b4['end'] == '2026-11-06')
    d, b5 = await make("{ sched:'extended', daysN: 6, sat:true }")
    ok('5 Saturdays as training days: day 6 is Saturday 7 Nov', isinstance(b5, dict) and b5['end'] == '2026-11-07', b5 if isinstance(b5, str) else b5.get('end'))
    d, bad = await make("{ sched:'fast', daysN: 3 }")
    ok('5 fast track must be shorter than the training type', isinstance(bad, str) and 'Fast track' in bad, bad)
    await pg.evaluate("window.__app.setState({ bDraft:null })")
    bid = b1['id']
    await pg.evaluate(f"window.__app.go('batch', {{ batchId:{bid!r}, bTab:'summary' }})"); await W(300)
    ok('5 a batch with a schedule opens (no errors)', await S("s.screen === 'batch'") and not errs, errs[:2])

    # ---------- 6. drop-off chart: real numbers ----------
    await pg.evaluate("window.__app.go('analytics', { adminView:true })"); await W(500)
    d = await V("[v.dropHas, v.dropSub, (v.dropRows || []).map(r => r.pct)]")
    ok('6 drop-off chart built from real records', d[0] and d[1] and len(d[2]) >= 2, d)
    ok('6 the old sample chart is gone', 'Leading Through Change, share of enrolled' not in await pg.evaluate("document.body.innerText"))
    ok('offline: no script errors', not errs, errs[:3])
    await pg.close()

async def connected(b):
    ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, bypass_csp=True)
    await ctx.route('**/js/config.js', lambda r: r.fulfill(body=CFG, content_type='application/javascript'))
    await ctx.route('**/vendor/supabase.js', lambda r: r.fulfill(body='/* mocked */', content_type='application/javascript'))
    await ctx.add_init_script(path=os.path.join(ROOT, 'tests/e2e/mock-supabase.js')); await ctx.add_init_script(script=HOOK)
    await ctx.add_init_script(script="""window.__sb.addMember({ user_id:'u-admin', email:'admin@ims.test', emp_id:'IMS-001', app_name:'Shaunak Admin', role:'Admin', password:'Admin-pass-2026' });
      const R = window.__sb.rows, put = (c, k, d) => R.set('northwind|' + c + '|' + k, { coll: c, key: k, data: d, version: 1 });
      put('users', '1', { id: 1, name: 'Shaunak Admin', email: 'admin@ims.test', empId: 'IMS-001', role: 'Admin', roleId: 'r_admin', status: 'Active', dept: 'L&D', manager: 'None' });
      put('lcms', 'm1', { id:'m1', code:'MOD-001', type:'Document', title:'POSH policy', mins:1, file:{ path:'northwind/lcms/p.pdf', name:'posh.pdf' } });
      put('lcms', 'm2', { id:'m2', code:'MOD-002', type:'Acknowledgment', title:'I agree', mins:1, text:'I have read the POSH policy' });
      put('adminCourses', 'c-posh', { id: 'c-posh', code: 'CRS-1', title: 'POSH Awareness', cat: 'Compliance', status: 'Published', active: true, aud: 'Everyone', features: { linear:false }, color: '#0066A1',
        items: [{ kind:'pdf', moduleId:'m1', title:'POSH policy', mins:1, file:{ path:'northwind/lcms/p.pdf', name:'posh.pdf' } }, { kind:'ack', moduleId:'m2', title:'I agree', mins:1, text:'I have read the POSH policy' }] });
      put('enroll', 'IMS-001', { 'c-posh': '2026-12-31' });""")
    errs = []; pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto('file://' + ROOT + '/' + WEB + '/index.html'); await pg.wait_for_selector('#sf-user')
    await pg.locator('#sf-user').fill('admin@ims.test'); await pg.locator('#sf-pw').fill('Admin-pass-2026'); await pg.get_by_role('button', name='Login', exact=True).click(); await pg.wait_for_timeout(1500)
    await pg.evaluate("window.__app.go('home')"); await pg.wait_for_timeout(500)
    txt = await pg.evaluate("document.body.innerText")
    ok('6 Continue learning shows with ONE course in the database (when it is assigned to you)', 'POSH Awareness' in txt and await pg.evaluate("!!window.__app.renderVals().cont"), txt[:300])
    await pg.evaluate("window.__app.go('analytics', { adminView:true })"); await pg.wait_for_timeout(500)
    d = await pg.evaluate("(() => { const v = window.__app.renderVals(); return [v.dropHas, v.dropSub, (v.dropRows || []).map(r => r.label + ' ' + r.pct)]; })()")
    ok('6 drop-off chart shows for the one real course', d[0] and 'POSH Awareness' in d[1] and len(d[2]) == 2, d)
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
