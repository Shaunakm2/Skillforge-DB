"""End-to-end test of the connected (Supabase) mode against tests/e2e/mock-supabase.js.
Run:  python3 tests/e2e/backend_e2e.py   (needs Playwright + Chromium)
"""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
EXE = os.environ.get('CHROME') or (lambda d: d if os.path.exists(d) else None)('/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell')   # None: Playwright's own Chromium (CI)
WEB = os.environ.get('SF_WEB', 'public')   # 'dist' tests the bundled build (npm run build)
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
        await pg.add_init_script(script="window.__sb.addMember({ user_id:'u-admin', email:'lena.fischer@northwind.com', emp_id:'NW-1007', app_name:'Lena Fischer', role:'Admin', password:'Admin-pass-2026' })")
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + ROOT + '/' + WEB + '/index.html'); await pg.wait_for_selector('#sf-user')
        await pg.add_script_tag(path=os.path.join(ROOT, 'supabase/functions/_shared/learning-core.js'))
        S = lambda e: pg.evaluate(f"(() => {{ const s = window.__app.state; return {e}; }})()")
        W = lambda ms=300: pg.wait_for_timeout(ms)
        B = lambda n: pg.get_by_role('button', name=n, exact=True)
        async def login(user, pw):
            if await pg.locator('#sf-user').count() == 0: await pg.evaluate("window.__app.setState({ authed:false, loginView:'signin' })"); await W()
            await pg.locator('#sf-user').fill(user); await pg.locator('#sf-pw').fill(pw); await B('Login').click(); await W(900)

        await pg.evaluate("window.__demo = { ...window.__app.state }")
        ok('no sample organisation generated when Supabase is configured', await S("s.users.length") < 50)
        await login('lena.fischer@northwind.com', 'Admin-pass-2026')
        ok('admin signed in on an empty database', await S("s.authed && s.meName === 'Lena Fischer' && s.role === 'admin' && s.beEmpty"))
        # v41.19: the app no longer offers the sample organisation; this test loads it on purpose (snapshot taken before sign-in)
        await pg.evaluate("window.__app.setState(Object.fromEntries(Object.entries(window.__demo).filter(([k]) => ['users','adminCourses','lcms','qs','quizzes','batches','threads','enroll','itemDone','assignedOn','attemptRecs','reviews','docs','accessReqs','fbLog','places','groups','paths','anns','attemptsUsed','extraAttempts','bookmarks','docAck','loginLog','syncLog','extHistory','attemptLog','bmLog','asgSub','prefs','itemQuiz','surveyResp'].includes(k))))"); await W()
        await pg.evaluate("window.__app.go('database', { adminView:true })"); await W()
        await pg.locator('button').filter(has_text='Start with an empty organisation').click(); await W(2500)
        keys = await pg.evaluate("[...window.__sb.rows.values()].filter(r => r.coll === 'enroll').map(r => r.key)")
        ok('per-person rows are keyed by employee ID', keys and all(k.startswith('NW-') for k in keys), keys[:5])
        ok('batches carry trainer and trainee IDs', await pg.evaluate("[...window.__sb.rows.values()].filter(r => r.coll === 'batches').every(r => r.data.trainerEmp && Array.isArray(r.data.traineeEmps))"))
        # storage: content check and SCORM packages
        zb64 = __import__('base64').b64encode(open(os.path.join(ROOT, 'tests/fixtures/scorm12.zip'), 'rb').read()).decode()
        r = await pg.evaluate("""async b64 => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), f = new File([bin], 'fire.zip', { type:'application/zip' });
          const fake = new File([new Uint8Array([0x4D, 0x5A, 0x90, 0])], 'report.pdf', { type:'application/pdf' }), real = new File([new TextEncoder().encode('%PDF-1.4 x')], 'r.pdf', { type:'application/pdf' });
          const pkg = await Backend.Files.scorm(f); return { pkg, fake: await Backend._sniff(fake), real: await Backend._sniff(real), stored: [...window.__sb.storage.keys()].filter(k => k.startsWith('lms-scorm/')).length }; }""", zb64)
        ok('renamed executable rejected, real PDF accepted', r['fake'] is False and r['real'] is True, r)
        ok('SCORM zip extracted to the private SCORM bucket (launched later through the content site)', r['stored'] == 4 and r['pkg']['launch'] == 'content/index.html' and r['pkg']['path'].startswith('northwind/scorm/') and r['pkg']['src'] == '', r)
        # logins for everyone
        await pg.locator('button').filter(has_text='Create missing logins').click(); await W(1500)
        n = await pg.evaluate("window.__sb.members.length")
        ok('missing logins created with temporary passwords', n > 10 and 'Download the temporary passwords' in await pg.locator('main').inner_text(), n)
        maya_pw = await pg.evaluate("window.__sb.members.find(m => m.emp_id === 'NW-1001').password")
        # role trust: editing the users row's role does not grant admin
        await pg.evaluate("window.__sb.serverWrite('users', '1', { ...window.__sb.get('users', '1'), role:'Admin', roleId:'r_admin' })")
        # learner via employee ID, must change password
        await pg.evaluate("window.__app.setState({ authed:false, loginView:'signin' })"); await W()
        await pg.evaluate("window.__sb.members.find(m => m.emp_id === 'NW-1007').__keep = 1")
        await pg.evaluate("window.__app.state.beReady = false")
        await login('NW-1001', maya_pw)
        ok('first sign-in asks for a new password', await S("s.loginView") == 'newpw')
        await pg.locator('#sf-np1').fill('short'); await pg.locator('#sf-np2').fill('short'); await B('Save and continue').click(); await W()
        ok('weak password refused', 'at least 10' in await pg.locator('.sf-login-err').inner_text())
        await pg.locator('#sf-np1').fill('Maya-New-pass1'); await pg.locator('#sf-np2').fill('Maya-New-pass1'); await B('Save and continue').click(); await W(1500)
        ok('learner signed in by employee ID', await S("s.authed && s.meName === 'Maya Okafor'"))
        ok('role comes from the server, not the edited user row', await S("s.role") == 'learner')
        ok('learner cannot see answer keys, batches, or other people’s contact details and employee IDs (usernames)',
           await S("s.qs.length === 0 && s.batches.length === 0 && s.users.filter(u => u.name !== 'Maya Okafor').every(u => !u.email && !u.phone && !u.empId)"))
        ok('employee-ID sign-in checked by the database lookup, then signed in from the browser', await pg.evaluate("window.__sb.calls.some(c => c[0] === 'sf_login_lookup')"))
        ok('learner does not subscribe to live updates', await pg.evaluate("Backend.me().role === 'Learner' && (Backend.me().perms || []).length === 0"))
        ok('learner sees only their own learning records', await S("Object.keys(s.itemDone).every(n => n === 'Maya Okafor') && Object.keys(s.enroll).every(n => n === 'Maya Okafor')"))
        # forging results: a local change to itemDone is never sent; a direct RPC is refused
        before = await pg.evaluate("window.__sb.calls.length")
        await pg.evaluate("window.__app.setState(st => ({ itemDone: { ...st.itemDone, 'Maya Okafor': { ...(st.itemDone['Maya Okafor'] || {}), safety: { 0:'x', 1:'x', 2:'x', 3:'x' } } } }))"); await W(1200)
        sent = await pg.evaluate(f"window.__sb.calls.slice({before}).filter(c => c[0] === 'sf_save')")
        ok('local result edits are not sent', not any('itemDone' in k for c in sent for k in c[1]), sent)
        r = await pg.evaluate("Backend.client().rpc('sf_save', { p_org:'northwind', p_rows:[{ coll:'itemDone', key:'NW-1001', data:{ safety:{ 0:'x' } }, version:null }] }).then(x => x.data[0].status)")
        ok('direct write of results is refused by the database policy', r in ('denied', 'conflict'), r)
        # ---- v30 attacks as a learner, straight at the database and the server (no app screens involved) ----
        atk = await pg.evaluate("""(async () => { const sb = Backend.client(), save = (coll, key, data) => sb.rpc('sf_save', { p_org:'northwind', p_rows:[{ coll, key, data, version:null }] }).then(x => x.data[0].status);
          const out = {};
          out.roles = await save('roles', 'r_learner', { id:'r_learner', name:'Learner', base:'Learner', perms: Object.fromEntries(['users','roles','reports','dashboard','documents','masters'].map(k => [k, true])) });
          try { await sb.from('sf_member').update({ role:'Admin' }).eq('emp_id', 'NW-1001'); } catch (e) {}   // no update rule exists for sf_member
          out.member = window.__sb.members.find(m => m.emp_id === 'NW-1001').role;
          out.kpi = await save('dashKpi', 'evil', { id:'evil', code:'evil', formula:'1' });
          out.board = await save('dashBoard', 'evil', { id:'evil', name:'Evil', visuals:[] });
          out.sched = await save('dashSched', 'evil', { id:'evil', to:['me@gmail.com'] });
          out.docAck = await save('docAck', 'NW-1001', { d1: { ackAt:'2020-01-01', ackV: 99 } });
          out.loginLog = await save('loginLog', 'NW-1001', { n: 9999 });
          out.docs = await save('docs', 'evil', { status:'Published', audience:['All'], title:'Phish' });
          out.users = await save('users', '1', { name:'x', role:'Admin' });
          out.readLog = (await sb.from('sf_doc').select('key').eq('org_id', 'northwind').eq('coll', 'loginLog')).data.filter(r => r.key !== 'NW-1001').length;
          out.readKpi = (await sb.from('sf_doc').select('key').eq('org_id', 'northwind').eq('coll', 'dashKpi')).data.length;
          const err = async f => { try { await f; return 'accepted'; } catch (e) { return e.message; } };
          out.ctor = await err(Backend.call('constructor', {})); out.tostr = await err(Backend.call('toString', {}));
          out.proto = await err(Backend.call('docSeen', { docId: '__proto__' }));
          return out; })()""")
        ok('learner cannot grant their own role permissions', atk['roles'] in ('denied', 'conflict'), atk)
        ok('learner cannot change their membership role', atk['member'] == 'Learner', atk)
        ok('learner cannot write KPIs, dashboards or schedules', all(atk[k] in ('denied', 'conflict') for k in ('kpi', 'board', 'sched')), atk)
        ok('learner cannot forge acknowledgements or sign-in records', atk['docAck'] in ('denied', 'conflict') and atk['loginLog'] in ('denied', 'conflict'), atk)
        ok('learner cannot publish a document or edit an account', atk['docs'] in ('denied', 'conflict') and atk['users'] in ('denied', 'conflict'), atk)
        ok('learner cannot read other people’s sign-ins or the KPI definitions', atk['readLog'] == 0 and atk['readKpi'] == 0, atk)
        ok('server refuses built-in names as actions or ids', 'Unknown action' in atk['ctor'] and 'Unknown action' in atk['tostr'] and 'Invalid value' in atk['proto'], atk)
        await pg.evaluate("Backend.pull([{ coll:'itemDone', key:'NW-1001' }])"); await W(300)
        # take the safety assessment through the server
        await pg.evaluate("window.__sb.serverWrite('itemDone', 'NW-1001', { safety: { 0:'2026-10-01', 1:'2026-10-01', 2:'2026-10-01' } })"); await W(300)
        await pg.evaluate("Backend.pull([{ coll:'itemDone', key:'NW-1001' }])"); await W(300)
        qi = await pg.evaluate("window.__app.state.adminCourses.find(c => c.id === 'safety').items.findIndex(i => i.kind === 'quiz')")
        await pg.evaluate(f"window.__app.go('item', {{ courseId:'safety', itemIdx:{qi} }})"); await W(400)
        await pg.evaluate("window.__app.renderVals().startQuiz()"); await W(800)
        ok('attempt started on the server, questions have no answer key', await S("!!s.rAttemptId && Object.values(s.rq).every(q => !('ans' in q) && !('answers' in q) && !('accept' in q))"))
        nq = await S("s.attempt.length")
        for k in range(nq):
            await pg.evaluate("""(() => { const a = window.__app, s = a.state, q = s.rq[s.attempt[s.qi].qid];
              if (q.type === 'Multiple select') a.setState({ qMulti: { 0:true } }); else if (q.type === 'Match the following') a.setState({ qMatch: Object.fromEntries(q.pairs.map((_, i) => [i, i])) });
              else if (q.type === 'Fill in the blank' || q.type === 'Written answer') a.setState({ qText:'answer' }); else a.setState({ qSel: 0 }); })()"""); await W(100)
            await pg.evaluate("window.__app.renderVals().quizAction()"); await W(500)
            await pg.evaluate("window.__app.renderVals().quizAction()"); await W(500)
        ok('submitted and scored on the server', await S("s.qDone && !!s.rResult"))
        ok('attempt recorded by the server', await pg.evaluate("[...window.__sb.rows.values()].some(r => r.coll === 'attemptRecs' && r.data.empId === 'NW-1001')"))
        ok('attempt count updated on screen from the server', await S("Object.values(s.attemptsUsed['Maya Okafor'] || {}).some(n => n >= 1)"))
        await pg.evaluate("window.__app.go('item', { courseId:'safety', itemIdx:0 })"); await W(400)
        # completeStep on an assessment or SCORM step that is NOT done yet must be refused (an already-passed step just returns done)
        sc = await pg.evaluate("""(async () => { const s = window.__app.state, c = s.adminCourses.find(x => x.id === 'safety'), done = (s.itemDone['Maya Okafor'] || {}).safety || {};
          const i = c.items.findIndex((it, k) => (it.kind === 'quiz' || it.kind === 'scorm') && !done[k]);
          if (i < 0) return { skip: true };
          try { await Backend.call('completeStep', { courseId:'safety', step:i }); return { i, kind: c.items[i].kind, err: '' }; } catch (e) { return { i, kind: c.items[i].kind, err: e.message }; } })()""")
        ok('step completion still enforces the server rules', sc.get('skip') or bool(sc['err']), sc)
        # back to admin: conflict merge, refusals, deletes, optimistic UI
        await pg.evaluate("Backend.signOut()"); await pg.evaluate("window.__app.setState({ authed:false, loginView:'signin' })"); await W()
        await login('lena.fischer@northwind.com', 'Admin-pass-2026'); await W(800)
        ok('admin back', await S("s.role === 'admin'"))
        # ---- v29: dashboards stored one row per board / KPI / schedule; filters and edit mode never saved ----
        await pg.evaluate("window.__app.setState(st => ({ dash: { ...st.dash, slicers: { ...st.dash.slicers, division: 'Finance Services' } } }))"); await W(1500)
        rowsD = await pg.evaluate("(() => { const R = [...window.__sb.rows.values()]; return { boards: R.filter(r => r.coll === 'dashBoard').length, kpis: R.filter(r => r.coll === 'dashKpi').length, dash: (R.find(r => r.coll === 'dash') || {}).data || null, slicerSaved: R.some(r => r.coll.startsWith('dash') && JSON.stringify(r.data).includes('Finance Services')) }; })()")
        ok('dashboards saved as one row per board and per KPI', rowsD['boards'] >= 4 and rowsD['kpis'] >= 3, rowsD)
        ok('shared settings row holds templates only (no boards, filters or edit mode)', rowsD['dash'] is not None and set(rowsD['dash'].keys()) <= {'v', 'templates'}, rowsD['dash'])
        ok('one person’s filters are never saved for everyone', not rowsD['slicerSaved'])
        # schedule recipients are checked by the database too (not only on screen)
        await pg.evaluate("window.__app.setState(st => ({ dash: { ...st.dash, schedules: [{ id:'scx', board:'b1', freq:'Daily', day:'', time:'09:00', to:['leak@gmail.com'], fmt:'CSV', on:true }] } }))"); await W(1800)
        ok('schedule to an outside domain refused by the database and reverted', not await pg.evaluate("window.__sb.rows.has('northwind|dashSched|scx')") and not await S("(s.dash.schedules || []).some(x => x.id === 'scx')"))
        await pg.evaluate("window.__app.setState(st => ({ dash: { ...st.dash, schedules: [{ id:'scy', board:'b1', freq:'Daily', day:'', time:'09:00', to:['boss@northwind.com'], fmt:'CSV', on:true }] } }))"); await W(1500)
        ok('internal schedule saved', await pg.evaluate("window.__sb.rows.has('northwind|dashSched|scy')"))
        # publish a snapshot of b1 for viewers, restrict b2 to admins, and make the Trainer role a viewer
        await pg.evaluate("window.__app.go('dashboard', { adminView:true, dbBoard:'b1' })"); await W(600); await pg.evaluate("window.__app.renderVals().dbPublish()"); await W(300)
        await pg.evaluate("window.__app.setState(st => ({ dash: { ...st.dash, boards: st.dash.boards.map(b => b.id === 'b2' ? { ...b, audience: ['r_admin'] } : b) }, roles: st.roles.map(r => r.id === 'r_trainer' ? { ...r, perms: { ...r.perms, dashView: true } } : r) }))"); await W(1800)
        # v32: deactivating someone by any route (here: bulk / sync style, the users row only) cuts their database access at once
        tgt = await pg.evaluate("(() => { const m = window.__sb.members.find(x => !['Lena Fischer','Maya Okafor','Daniel Reyes','Jonas Berg','Jonas Bergström'].includes(x.app_name) && x.role === 'Learner'); return m && m.emp_id; })()")
        await pg.evaluate(f"window.__app.setState(st => ({{ users: st.users.map(u => u.empId === '{tgt}' ? {{ ...u, status:'Deactivated' }} : u) }}))"); await W(1800)
        ok('a person deactivated without the single-person switch loses database access immediately', await pg.evaluate(f"window.__sb.members.find(m => m.emp_id === '{tgt}').active") is False, tgt)
        await pg.evaluate(f"window.__app.setState(st => ({{ users: st.users.map(u => u.empId === '{tgt}' ? {{ ...u, status:'Active' }} : u) }}))"); await W(1800)
        ok('…and reactivating restores it', await pg.evaluate(f"window.__sb.members.find(m => m.emp_id === '{tgt}').active") is True)
        ok('published snapshot stored on the board row (numbers, no records)', await pg.evaluate("(() => { const d = window.__sb.get('dashBoard', 'b1'); return !!(d && d.snap && d.snap.visuals.length) && !JSON.stringify(d.snap).includes('courseOpts'); })()"))
        # someone else edits Jonas's phone; I edit his designation at the same time -> merged
        await pg.evaluate("""(() => { const sb = window.__sb, k = [...sb.rows.values()].find(r => r.coll === 'users' && r.data.name === 'Jonas Berg').key; window.__jk = k;
          sb.rows.get('northwind|users|' + k).version += 0; const d = sb.get('users', k); sb.rows.set('northwind|users|' + k, { coll:'users', key:k, data:{ ...d, phone:'+91 90000 11111' }, version: sb.rows.get('northwind|users|' + k).version + 1 }); })()""")
        await pg.evaluate("window.__app.setState(st => ({ users: st.users.map(u => u.name === 'Jonas Berg' ? { ...u, designation:'Team Lead' } : u) }))"); await W(2000)
        d = await pg.evaluate("window.__sb.get('users', window.__jk)")
        ok('concurrent edits merged (no lost update)', d['phone'] == '+91 90000 11111' and d['designation'] == 'Team Lead', d)
        ok('merged value shown on screen', await S("s.users.find(u => u.name === 'Jonas Berg').phone === '+91 90000 11111'"))
        # realtime: another admin adds a holiday
        await pg.evaluate("window.__sb.serverWrite('holidays', 'hx', { id:'hx', date:'2026-12-25', name:'Christmas' })"); await W(500)
        ok('other people’s changes appear live', await S("s.holidays.some(h => h.id === 'hx')"))
        # deletes are not dropped when another row in the same save is refused
        await pg.evaluate("window.__sb.rows.set('northwind|attempt|zz', { coll:'attempt', key:'zz', data:{}, version:1 })")
        await pg.evaluate("window.__app.setState(st => ({ holidays: st.holidays.filter(h => h.id !== 'hx'), anns: st.anns.slice(1) }))"); await W(2000)
        ok('deletes saved', not await pg.evaluate("window.__sb.rows.has('northwind|holidays|hx')"))
        # optimistic UI: a failing deactivation leaves the person active
        await pg.evaluate("window.__sb.failAdmin = 'Supabase unreachable'")
        await pg.evaluate("window.__app.go('users', { adminView:true, userStatus:'All' })"); await W(400)
        await pg.locator('.users-and-accounts-15').filter(has_text='Jonas Berg').locator('.ua-mng').click(); await W(); await pg.locator('.um-danger').click(); await W(); await B('Deactivate').click(); await W(600)   # v36: Manage › Deactivate › confirm
        ok('failed deactivation changes nothing', await S("s.users.find(u => u.name === 'Jonas Berg').status") == 'Active')
        await pg.evaluate("window.__sb.failAdmin = null")
        # rename cascades and keeps history (keyed by employee ID)
        await pg.locator('.users-and-accounts-15').filter(has_text='Jonas Berg').locator('.ua-mng').click(); await W(); await pg.locator('.um-i').filter(has_text='Edit details').click(); await W()   # v36: Manage › Edit details
        await pg.locator('.ovl-28').last.locator('input').nth(0).fill('Jonas Bergström'); await B('Save changes').click(); await W(1800)
        ok('rename cascades in the app', await S("!!s.enroll['Jonas Bergström'] && !s.enroll['Jonas Berg']"))
        ok('rename does not orphan history in the database', await pg.evaluate("!!window.__sb.get('enroll', 'NW-1002') && window.__sb.members.find(m => m.emp_id === 'NW-1002').app_name === 'Jonas Bergström'"))
        # v41.20: duplicate names are allowed (same visible name, kept apart internally)
        await B('+ Create account').click(); await pg.get_by_role('menuitem', name='Single account').click(); await W(); um = pg.locator('.ovl-28').last
        await um.locator('input').nth(0).fill('Maya Okafor'); await um.get_by_placeholder('name@company.com').fill('maya.o2@northwind.com'); await um.get_by_placeholder('e.g. NW-1015').fill('NW-3999')
        await B('Create account').click(); await W(1500)
        ok('duplicate name allowed (same name, no employee ID added), first password shown once', await S("s.users.some(u => u.empId === 'NW-3999' && u.name !== 'Maya Okafor' && Identity.plain(u.name) === 'Maya Okafor')") and await pg.locator('.tp-pw').count() == 1)
        # trainer scope: can't change another trainer's batch; refused change is reverted and reported
        dan = await pg.evaluate("(() => { const m = window.__sb.members.find(x => x.app_name === 'Daniel Reyes'); m.must_change = false; m.password = 'Dan-pass-2026x'; return m.emp_id; })()")
        await pg.evaluate("Backend.signOut()"); await pg.evaluate("window.__app.setState({ authed:false, loginView:'signin' })"); await W()
        await login(dan, 'Dan-pass-2026x'); await W(800)
        ok('trainer signed in', await S("s.role === 'instructor'"))
        ok('viewer receives only boards shared with their role (not KPIs, schedules or other boards)', await S("s.dash.boards.some(b => b.id === 'b1') && !s.dash.boards.some(b => b.id === 'b2') && !(s.dash.kpis || []).length && !(s.dash.schedules || []).length"), await S("[s.dash.boards.map(b => b.id), (s.dash.kpis || []).length]"))
        await pg.evaluate("window.__app.go('dashboard', { adminView:true, dbBoard:'b1' })"); await W(600)
        vv = await pg.evaluate("(() => { const v = window.__app.renderVals(); return { snap: v.dbIsSnap, n: v.dbVisuals.length, kv: (v.dbVisuals.find(x => x.isKpi) || {}).kv, exp: v.dbCanExport, sl: v.dbShowSl }; })()")
        ok('viewer sees the published numbers, not an empty live calculation', vv['snap'] and vv['n'] > 3 and vv['kv'] not in (None, '', '0', '—') and not vv['exp'] and not vv['sl'], vv)
        ok('trainer sees only their own batches', await S("s.batches.length > 0 && s.batches.every(b => b.trainer === 'Daniel Reyes')"))
        other = await pg.evaluate("[...window.__sb.rows.values()].find(r => r.coll === 'batches' && r.data.trainer !== 'Daniel Reyes').key")
        r = await pg.evaluate(f"Backend.client().rpc('sf_save', {{ p_org:'northwind', p_rows:[{{ coll:'batches', key:'{other}', data:{{ name:'Hijacked', trainerEmp:'x' }}, version:1 }}] }}).then(x => x.data[0].status)")
        ok('another trainer’s batch cannot be written', r in ('denied', 'gone', 'conflict') and await pg.evaluate(f"window.__sb.get('batches', '{other}').name") != 'Hijacked', r)
        own = await pg.evaluate("(() => window.__app.state.batches[0].id)()")
        n0 = await pg.evaluate(f"window.__sb.get('batches', '{own}').traineeEmps.length")
        await pg.evaluate(f"window.__app.setState(st => ({{ batches: st.batches.map(b => b.id === '{own}' ? {{ ...b, trainees: b.trainees.concat(['Daniel Reyes']) }} : b) }}))"); await W(2200)
        dbn = await pg.evaluate(f"window.__sb.get('batches', '{own}').traineeEmps.length"); scr = await S(f"s.batches.find(b => b.id === '{own}').trainees.includes('Daniel Reyes')")
        ok('trainer adding a trainee (here: themselves): refused and reverted', dbn == n0 and not scr, (n0, dbn, scr))
        ok('refusal reported', 'not saved' in (await S("s.beStatus.text")).lower())
        mine = await pg.evaluate("(() => { const s = window.__app.state; const b = s.batches.find(x => x.trainer === 'Daniel Reyes'); return b && b.id; })()")
        await pg.evaluate(f"window.__app.setState(st => ({{ batches: st.batches.map(b => b.id === '{mine}' ? {{ ...b, name: 'Renamed by Daniel' }} : b) }}))"); await W(2000)
        ok('own batch saved', await pg.evaluate(f"window.__sb.get('batches', '{mine}').name") == 'Renamed by Daniel')
        # Gradebook without Question bank: no answer keys, but the written answer can still be rated (question is in the review)
        ok('trainer (Gradebook) does not receive the question bank / answer keys', await S("s.qs.length === 0"))
        await pg.evaluate("window.__sb.serverWrite('reviews', 'rvK', { id:'rvK', learnerEmp:'NW-1001', quiz:'Feedback check', quizId:1, attemptId:'ax', qid:999, qText:'Explain SBI feedback', points:5, guide:'Mentions situation', answer:'my answer', submitted:'2026-10-04T10:00:00Z', rating:null })"); await W(600)
        await pg.evaluate("Backend.pull([{ coll:'reviews', key:'rvK' }])"); await W(400)
        rv = await pg.evaluate("(() => { const v = window.__app.renderVals(); const l = (v.rvList || []).concat(v.rvAll || []); const r = l.find(x => x.id === 'rvK'); return r ? { q: r.question, n: r.scale.length } : null; })()")
        ok('gradebook shows the question and 0–points scale from the review row', rv == {'q': 'Explain SBI feedback', 'n': 6}, rv)
        # v33: Account › change password works when connected (it called a function that didn't exist), then expiry is enforced
        await pg.evaluate("window.__app.go('account', { acctTab:'security', adminView:false })"); await W(300)
        await pg.evaluate("window.__app.setState({ pwForm: { cur:'Dan-pass-2026x', next:'Dan-New-pass-2027', conf:'Dan-New-pass-2027', err:'', ok:'' } })"); await pg.evaluate("window.__app.renderVals().pwSave()"); await W(1500)
        ok('connected: changing the password from Account settings works', 'Password changed' in (await S("s.pwForm.ok || ''")) and await pg.evaluate("window.__sb.members.find(m => m.app_name === 'Daniel Reyes').password") == 'Dan-New-pass-2027', await S("[s.pwForm.err, s.pwForm.ok]"))
        dk = await pg.evaluate("(() => { const r = [...window.__sb.rows.values()].find(r => r.coll === 'users' && r.data.name === 'Daniel Reyes'); return r && r.key; })()")
        await pg.evaluate(f"(() => {{ const d = window.__sb.get('users', '{dk}'); window.__sb.serverWrite('users', '{dk}', {{ ...d, expires: '2026-01-01' }}); }})()"); await W(300)
        ex = await pg.evaluate("Backend.call('me', {}).then(() => 'allowed', e => e.message)")
        rd = await pg.evaluate("(async () => { const r = await Backend.client().from('sf_doc').select('key').eq('org_id', 'northwind').eq('coll', 'batches'); return ((r && r.data) || []).length; })()")
        ok('connected: an account past its expiry date is refused by the server and reads nothing', ex != 'allowed' and rd == 0, (ex, rd))
        await pg.evaluate(f"(() => {{ const d = window.__sb.get('users', '{dk}'); window.__sb.serverWrite('users', '{dk}', {{ ...d, expires: '' }}); }})()"); await W(200)
        # v31: idle sign-out when connected reloads the tab, so nothing the previous person could read stays in memory
        # (last check: the reload also resets the in-page test database)
        await pg.evaluate("window.__app.setState(st => ({ platform: { ...st.platform, defaults: { ...st.platform.defaults, idleMins: 5 } } }))"); await W(200)
        # v41.20: with Remember me, 10 minutes idle is not enough (at least 45 minutes)
        await pg.evaluate("(() => { const a = window.__app; Backend.keepSignIn(true); a._lastAct = Date.now() - 10 * 60000; localStorage.setItem('sf-act', String(a._lastAct)); a._idleCheck(); })()"); await W(800)
        ok('v41.20: Remember me keeps you signed in through 10 idle minutes', await pg.evaluate("window.__app.state.authed"))
        await pg.evaluate("Backend.keepSignIn(false)")
        # v41.22: connected, 45 minutes is the minimum for everybody (App settings can only make it longer), with or without Remember me
        await pg.evaluate("(() => { const a = window.__app; a._lastAct = Date.now() - 10 * 60000; localStorage.setItem('sf-act', String(a._lastAct)); a._idleCheck(); })()"); await W(500)
        ok('v41.22: without Remember me, 10 idle minutes (App setting 5) does not sign you out: 45 is the minimum', await pg.evaluate("window.__app.state.authed"))
        marker = await pg.evaluate("window.__app.__marker = 'previous-person'; window.__app.state.authed")
        await pg.evaluate("(() => { const a = window.__app; a._lastAct = Date.now() - 50 * 60000; localStorage.setItem('sf-act', String(a._lastAct)); a._idleCheck(); })()")
        await pg.wait_for_function("!window.__app || window.__app.__marker !== 'previous-person'", timeout=10000); await pg.wait_for_selector('#sf-user'); await W(500)
        ok('connected idle sign-out reloads: the previous session’s data is gone from memory', marker and await pg.evaluate("window.__app.__marker === undefined && !window.__app.state.authed"))
        ok('…and the sign-in page says why (as a notice, not an error)', 'without activity' in await pg.evaluate("window.__app.state.login.info || ''") and not await pg.evaluate("window.__app.state.login.err"))
        ok('NO JS ERRORS', not errs, errs[:3])
        await b.close()
    print('\nSUMMARY', sum(c for _, c in RES), '/', len(RES))
    sys.exit(0 if all(c for _, c in RES) else 1)
asyncio.run(main())
