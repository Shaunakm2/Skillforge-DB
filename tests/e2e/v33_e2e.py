# v33 detailed scan: gamification, notifications, calendar, discussions, bulk upload, account expiry, dates, certificates,
# password rules, room booking. Each check fails on v32 and passes on v33.
import asyncio, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
from playwright.async_api import async_playwright
EXE = os.environ.get('CHROME') or (lambda d: d if os.path.exists(d) else None)('/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell')
WEB = os.environ.get('SF_WEB', 'public'); RES = []
def ok(n, c, x=''): RES.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n, '' if c else str(x)[:400], flush=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE); pg = await b.new_page(viewport={'width':1400,'height':900})
        await pg.add_init_script(path=os.path.join(ROOT, 'tests/e2e/hook.js')); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + ROOT + '/' + WEB + '/index.html'); await pg.wait_for_selector('#sf-user')
        E = lambda e: pg.evaluate(e); W = lambda ms=300: pg.wait_for_timeout(ms); V = lambda e: pg.evaluate(f"(() => {{ const v = window.__app.renderVals(); return {e}; }})()")
        async def login(who):
            await E("window.__app.setState({ authed:false, loginView:'signin' })"); await W(200)
            await pg.locator('.sf-demo2-b').filter(has_text=who).click(); await pg.get_by_role('button', name='Login', exact=True).click(); await W(800)

        # ---- gamification ----
        await login('Learner'); await E("window.__app.go('progress', {})"); await W(300)
        maya = await V("({ xp: v.xpFmt, you: v.lbRows.filter(r => /\\(you/.test(r.name)).map(r => r.name) })")
        await login('Trainer'); await E("window.__app.go('progress', {})"); await W(300)
        dan = await V("({ xp: v.xpFmt, you: v.lbRows.filter(r => /\\(you/.test(r.name)).map(r => r.name) })")
        ok('each person has their own XP (not one shared number)', maya['xp'] != dan['xp'], (maya, dan))
        ok('the leaderboard marks the signed-in person as “you”', dan['you'] and dan['you'][0].startswith('Daniel Reyes'), dan)
        rc = await E("""(() => { const s = window.__app.state, r = s.itemDone['Daniel Reyes'] || {}; let xp = 0; for (const c in r) { let n = 0; for (const i in r[c]) { const v = r[c][i]; if (!v) continue; n++; xp += 50; if (typeof v === 'object' && v.score != null) xp += Math.max(0, Math.min(100, Math.round(+v.score) || 0)); }
          const a = Progress.courseOf(s, c); if (a && a.items.length && n >= a.items.length) xp += 100; }
          (s.extHistory || []).forEach(x => { if (x.user === 'Daniel Reyes' && x.status === 'Completed') xp += 100; }); return xp; })()""")
        ok('XP = records (50 per module, 100 per course, + scores, + imported completions)', dan['xp'] == f"{rc:,}" and await E("typeof LearnXP !== 'undefined' ? LearnXP.of(window.__app.state, 'Daniel Reyes') : -1") >= rc, (dan, rc))
        await E("window.__app.setState(st => ({ prefs: { ...st.prefs, 'Maya Okafor': { ...(st.prefs['Maya Okafor'] || {}), leaderboard: false } } }))")
        await E("window.__app.setState({ lb:'company' })"); await W(200)
        ok('someone who switched the leaderboard off is left out of other people’s boards', 'Maya Okafor' not in await V("v.lbRows.map(r => r.name).join('|') + '|' + v.podium.map(r => r.name).join('|')"))
        # ---- notifications ----
        nt = await V("v.notifs.map(n => n.t)")
        ok('no sample notifications (e.g. “Daniel Reyes replied” shown to Daniel Reyes)', not any('Daniel Reyes replied' in t or 'Foundations of Management' in t for t in nt), nt)
        due = await E("(() => { const s = window.__app.state, en = s.enroll['Daniel Reyes'] || {}, soon = Progress.plus(TODAY_KEY, 7); return Object.keys(en).filter(c => en[c] <= soon && !Progress.courseDone(s, 'Daniel Reyes', Progress.courseOf(s, c) || { items: [] })).map(c => Progress.courseOf(s, c).title); })()")
        ok('notifications show the person’s own courses due within 7 days', all(any(t.startswith(x) for t in nt) for x in due[:4]), (due, nt))
        # ---- calendar ----
        await E("window.__app.go('calendar', {})"); await W(300)
        nd = await E("(() => { const s = window.__app.state, en = s.enroll['Daniel Reyes'] || {}; const c = Object.keys(en).filter(c => en[c] >= TODAY_KEY && !Progress.courseDone(s, 'Daniel Reyes', Progress.courseOf(s, c) || { items: [] })).sort((a, b) => en[a].localeCompare(en[b]))[0]; return c ? [en[c], Progress.courseOf(s, c).title] : null; })()")
        if nd:
            await E(f"window.__app.setState({{ calSel: '{nd[0]}' }})"); await W(200)
            ok('calendar shows my own due dates', any(nd[1] in e for e in await V("v.selEvents.map(e => e.full)")), (nd, await V("v.selEvents.map(e => e.full)")))
        bt = await E("(() => { const b = window.__app.state.batches.find(b => b.trainer === 'Daniel Reyes'); return b && [b.start, b.code]; })()")
        if bt:
            await E(f"window.__app.setState({{ calSel: '{bt[0]}' }})"); await W(200)
            ok('calendar shows the batches I train', any(bt[1] in e for e in await V("v.selEvents.map(e => e.full)")))
        org = await E("Object.keys(EVENTS).find(k => EVENTS[k].some(e => e.kind === 'live'))")
        await E(f"window.__app.setState({{ calSel: '{org}' }})"); await W(200)
        await E("window.__app.renderVals().selEvents.find(e => e.isLive).register()"); await W(200)
        regd = await E("JSON.stringify(window.__app.state.prefs['Daniel Reyes'] || {})")
        await login('Learner'); await E(f"window.__app.go('calendar', {{ calSel: '{org}' }})"); await W(200)
        ok('a calendar sign-up is per person (another person is not registered)', 'reg' in regd and 'Registered' not in ' '.join(await V("v.selEvents.map(e => e.regLabel)")), regd)
        ok('the sign-up no longer claims an invite e-mail was sent', 'sent' not in ' '.join(await V("v.selEvents.map(e => e.regLabel)")).lower())
        # ---- discussions ----
        await E("window.__app.go('discussions', {})"); await W(200); await E("window.__app.renderVals().upvote()"); await W(100)
        await login('Trainer'); await E("window.__app.go('discussions', {})"); await W(200)
        ok('discussion votes are per person', await V("v.voteBg") == '#FFFFFF')
        await E("window.__app.setState(st => ({ threads: st.threads.filter(t => t.id !== st.threadId) }))"); await W(300)
        await E("window.__app.go('home', {})"); await W(300)
        ok('deleting the open discussion no longer breaks every screen', await E("window.__app.state.screen === 'home'") and not [e for e in errs if 'votes' in e], errs[-2:])
        await E("window.__app.setState({ threads: [] })"); await W(200); await E("window.__app.go('discussions', {})"); await W(300)
        ok('no discussions at all: the page still opens', await V("v.noThreads") and not [e for e in errs if 'votes' in e])

        # ---- bulk upload ----
        await login('Admin'); await E("window.__app.go('users', { adminView:true })"); await W(300)
        u = await E("(() => { const u = window.__app.state.users.find(x => x.name === 'Jonas Berg'); const m = window.__app.state.users.find(x => x.name === 'Lena Fischer'); return { emp: u.empId, mail: u.email, des: u.designation, mgr: m.empId }; })()")
        csv = 'UserId,EmailId,UserName,MobileNumber,Designation,Division,Reporting Manager\\n' + u['emp'] + ',' + u['mail'] + ',Someone Else,+91 9000011111,CHANGED TITLE,Finance Services,\\nNW-7777,new.person@example.com,New Person,+91 9000022222,Analyst,Finance Services,' + u['mgr']
        await E(f"window.__app.setState({{ uImp: {{ text: '{csv}', name: 'x.csv' }} }})"); await E("window.__app.renderVals().uiImport()"); await W(400)
        ok('a rejected upload row changes nothing', await E(f"window.__app.state.users.find(x => x.empId === '{u['emp']}').designation") == u['des'])
        np = await E("(() => { const x = window.__app.state.users.find(x => x.empId === 'NW-7777'); return x && [x.dept, x.division, x.manager]; })()")
        ok('upload Division fills the division used by dashboards and MIS', np and np[1] == 'Finance Services', np)
        ok('a Reporting Manager given as an employee code is linked to that person', np and np[2] == 'Lena Fischer', np)
        # ---- strict dates ----
        ok('impossible dates (31 February) are refused', await E("!realDate('2026-02-31') && realDate('2028-02-29') && !realDate('2026-13-01')"))
        # ---- account expiry ----
        await E("window.__app.setState(st => ({ users: st.users.map(u => u.name === 'Maya Okafor' ? { ...u, expires: '2026-01-01' } : u) }))")
        await E("window.__app.setState({ authed:false, loginView:'signin' })"); await W(200)
        await pg.locator('.sf-demo2-b').filter(has_text='Learner').click(); await pg.get_by_role('button', name='Login', exact=True).click(); await W(600)
        ok('an account past its expiry date cannot sign in', not await E("window.__app.state.authed") and 'expired' in (await E("window.__app.state.login.err || ''")), await E("window.__app.state.login.err"))
        await E("window.__app.setState(st => ({ users: st.users.map(u => u.name === 'Maya Okafor' ? { ...u, expires: '' } : u) }))")
        # ---- certificates ----
        await login('Learner')
        cert = await E("""(() => { const a = window.__app, s = a.state, c = s.adminCourses.find(c => Progress.hasCert(c) && (s.enroll['Maya Okafor'] || {})[c.id]);
          a.setState(st => ({ itemDone: { ...st.itemDone, 'Maya Okafor': { ...st.itemDone['Maya Okafor'], [c.id]: Object.fromEntries(c.items.map((_, i) => [i, '2026-09-01'])) }, 'Jonas Berg': { ...(st.itemDone['Jonas Berg'] || {}), [c.id]: Object.fromEntries(c.items.map((_, i) => [i, '2026-09-01'])) } } })); return c.id; })()"""); await W(200)
        await E("window.__app.go('progress', {})"); await W(300)
        ctitle = await E(f"window.__app.state.adminCourses.find(c => c.id === '{cert}').title")
        id1 = await V(f"(v.certs.find(c => c.title === {ctitle!r}) || {{}}).id")
        await login('Admin'); await E("window.__app.go('home', { role:'learner', meName:'Jonas Berg', meRole:'learner', adminView:false })"); await E("window.__app.go('progress', {})"); await W(300)
        id2 = await V(f"(v.certs.find(c => c.title === {ctitle!r}) || {{}}).id")
        ok('certificate IDs are unique per person (not one ID per course)', id1 and id2 and id1 != id2, (id1, id2))
        # ---- password rules ----
        await E("window.__app.go('account', { acctTab:'security' })"); await W(200)
        await E("window.__app.setState({ pwForm: { cur:'skillforge', next:'abcdefg12', conf:'abcdefg12', err:'', ok:'' } })"); await E("window.__app.renderVals().pwSave()"); await W(200)
        ok('Account › password uses the same rule as the server (10+ chars, upper, lower, number)', '10 characters' in (await E("window.__app.state.pwForm.err || ''")), await E("window.__app.state.pwForm.err"))
        ok('the connected password change calls a function that exists', await E("typeof Backend.setNewPassword === 'function'") and 'Backend.changePassword' not in await E("window.__app.pwSaveSrc || String(window.__app.renderVals().pwSave)"))
        # ---- room booking ----
        await E("window.__app.go('home', { role:'admin', meName:'Lena Fischer', meRole:'admin', adminView:false })"); await W(200)
        rb = await E("""(() => { const s = window.__app.state; const b = s.batches.find(x => batchStatus(x) !== 'Completed' && x.placeId && (x.mode || 'In person') !== 'Virtual' && (s.places.find(p => p.id === x.placeId) || {}).status === 'Available'); return b && { id: b.id, place: b.placeId, start: b.start, type: b.type, trainer: b.trainer }; })()""")
        await E("window.__app.go('batches', { adminView:true })"); await W(300)
        await E("window.__app.renderVals().newBatch()"); await W(200)
        await E(f"""window.__app.setState(st => ({{ bDraft: {{ ...(st.bDraft || {{}}), id:null, segment: st.masters.segments[0], trainingName: st.masters.trainingNames[0], traineeType:'New Hire', mode:'In person', meetLink:'', placeId:'{rb['place']}', name:'Clash test', nameAuto:false, type:'{rb['type']}', trainer:'{rb['trainer']}', division: st.masters.divisions[0], start:'{rb['start']}', trainees:[], holidays:[] }}, bdTab:'details' }}))"""); await W(200)
        sv = ['saveBatch']; await E("window.__app.renderVals().saveBatch()"); await W(300)
        made = await E("window.__app.state.batches.some(b => b.name === 'Clash test')")
        er = await E("(window.__app.state.bDraft || {}).err || window.__app.state.toast || ''")
        ok('a room already booked on the same days cannot be booked again', not made and 'already booked' in er, (sv, made, er))
        ok('NO JS ERRORS (other than the old crash being checked)', not [e for e in errs if 'votes' not in e], errs[:3])
        print('\nSUMMARY', sum(1 for _, c in RES if c), '/', len(RES)); await b.close()
asyncio.run(main())
