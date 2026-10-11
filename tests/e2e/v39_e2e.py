# v39: Question bank — admins edit existing questions (row Edit, preview Edit), in the same editor as Add.
import asyncio, os, json
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
from playwright.async_api import async_playwright
EXE = os.environ.get('CHROME') or (lambda d: d if os.path.exists(d) else None)('/opt/pw-browsers/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell')
WEB = os.environ.get('SF_WEB', 'public')
RES = []
def ok(n, c, x=''): RES.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n, '' if c else str(x)[:300], flush=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE); errs = []
        pg = await b.new_page(viewport={'width': 1366, 'height': 900})
        await pg.add_init_script(path=os.path.join(ROOT, 'tests/e2e/hook.js')); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + ROOT + '/' + WEB + '/index.html'); await pg.wait_for_selector('#sf-user')
        await pg.locator('.sf-demo2-b').filter(has_text='Admin').click(); await pg.get_by_role('button', name='Login', exact=True).click(); await pg.wait_for_timeout(800)
        W = lambda ms=300: pg.wait_for_timeout(ms)
        S = lambda e: pg.evaluate(f"(() => {{ const s = window.__app.state; return {e}; }})()")
        await pg.evaluate("window.__app.setState({toast:null}); window.__app.go('qbank', { adminView:true })"); await W(500)

        # A multiple-choice question that is used in a quiz
        q = await S("(() => { const used = new Set(s.quizzes.flatMap(z => z.ids || [])); return s.qs.find(q => q.type === 'Multiple choice' && used.has(q.id) && !q.archived); })()")
        ok('setup: a multiple-choice question used in a quiz exists', q is not None)
        before_n = await S('s.qs.length')
        await pg.evaluate(f"window.__app.setState({{ qModal:true, qm:null, qEditId:{json.dumps(q['id'])} }})"); await W()
        title = await pg.locator('.ovl-17 h2').first.text_content()
        ok('edit: the editor says Edit question with its reference', title.startswith('Edit question'), title)
        ok('edit: the question text is loaded', await pg.locator('.ovl-17 textarea').first.input_value() == q['text'])
        ok('edit: a used question shows the "applies to new attempts" note', await pg.locator('.qm-used').count() == 1)
        ok('edit: the save button says Save changes', await pg.get_by_role('button', name='Save changes').count() == 1)
        new_ans = (q['ans'] + 1) % 4
        await pg.locator('.ovl-17 textarea').first.fill(q['text'] + ' (edited)')
        await pg.evaluate(f"window.__app.setState(st => ({{ qm: {{ ...st.qm, ans:{new_ans} }} }}))")
        await pg.get_by_role('button', name='Save changes').click(); await W()
        after = await S(f"s.qs.find(x => x.id === {json.dumps(q['id'])})")
        ok('save: same question updated in place (no new question)', await S('s.qs.length') == before_n)
        ok('save: text and correct answer changed', after['text'] == q['text'] + ' (edited)' and after['ans'] == new_ans, after)
        ok('save: id, reference, author, created and usage kept', all(after.get(k) == q.get(k) for k in ['id', 'ref', 'author', 'created', 'used']))
        ok('save: edited date and editor recorded', after.get('updatedBy') == 'Lena Fischer' and bool(after.get('updated')))
        ok('save: editor closed', not await S('s.qModal') and await S('s.qEditId') is None)

        # Cancel leaves the question unchanged
        await pg.evaluate(f"window.__app.setState({{ qModal:true, qm:null, qEditId:{json.dumps(q['id'])} }})"); await W()
        await pg.locator('.ovl-17 textarea').first.fill('SHOULD NOT SAVE'); await pg.locator('.ovl-4').first.click(); await W()
        ok('cancel: closing without saving changes nothing', (await S(f"s.qs.find(x => x.id === {json.dumps(q['id'])}).text")) == q['text'] + ' (edited)')

        # Validation still applies while editing
        await pg.evaluate(f"window.__app.setState({{ qModal:true, qm:null, qEditId:{json.dumps(q['id'])} }})"); await W()
        await pg.locator('.ovl-17 textarea').first.fill(''); await pg.get_by_role('button', name='Save changes').click(); await W()
        ok('validation: an empty question is refused and the editor stays open', await S('s.qModal') and (await S(f"s.qs.find(x => x.id === {json.dumps(q['id'])}).text")) != '')
        await pg.locator('.ovl-4').first.click(); await W()

        # Edit button on the row and in the preview
        await pg.evaluate("window.__app.setState({ qModal:false, qm:null, qEditId:null })"); await W()
        await pg.locator('.qb-row', has=pg.locator('.sf-row-actions')).first.get_by_role('button', name='Edit', exact=False).click(); await W()
        ok('row: the Edit button opens the editor', await S('s.qModal') and await S('s.qEditId') is not None)
        await pg.locator('.ovl-4').first.click(); await W()
        await pg.locator('.qb-row', has=pg.locator('.sf-row-actions')).first.get_by_role('button', name='View').click(); await W()
        await pg.get_by_role('button', name='Edit', exact=True).last.click(); await W()
        ok('preview: Edit closes the preview and opens the editor', await S('s.qModal') and await S('s.qPrev') is None)
        await pg.locator('.ovl-4').first.click(); await W()

        # Other question types keep their answers when edited
        for t, field in [('Match the following', 'pairs'), ('Ordering', 'items'), ('Fill in the blank', 'accept'), ('Multiple select', 'answers'), ('Image options', 'opts'), ('True / False', 'opts')]:
            x = await S(f"s.qs.find(q => q.type === {json.dumps(t)})")
            if not x: ok(t + ': sample exists', False); continue
            await pg.evaluate(f"window.__app.setState({{ qModal:true, qm:null, qEditId:{json.dumps(x['id'])} }})"); await W()
            await pg.get_by_role('button', name='Save changes').click(); await W()
            y = await S(f"s.qs.find(q => q.id === {json.dumps(x['id'])})")
            ok(t + ': saving without changes keeps the answers', y.get(field) == x.get(field) and y['type'] == t, (x.get(field), y.get(field)))

        mq = await S("s.qs.find(q => q.media && q.media.src)")
        if mq:
            await pg.evaluate(f"window.__app.setState({{ qModal:true, qm:null, qEditId:{json.dumps(mq['id'])} }})"); await W()
            await pg.get_by_role('button', name='Save changes').click(); await W()
            ok('media: an unchanged picture/audio/video is kept as it was', (await S(f"s.qs.find(q => q.id === {json.dumps(mq['id'])}).media")) == mq['media'])
        # Add still adds
        n = await S('s.qs.length')
        await pg.evaluate("window.__app.renderVals().openQModal()"); await W()
        ok('add: the editor says Add question', (await pg.locator('.ovl-17 h2').first.text_content()) == 'Add question')
        ok('add: no "used in" note for a new question', await pg.locator('.qm-used').count() == 0)
        await pg.locator('.ovl-17 textarea').first.fill('A brand new v39 question?')
        await pg.evaluate("window.__app.setState(st => ({ qm: { ...st.qm, opts:['A','B','C','D'], ans:1 } }))")
        await pg.get_by_role('button', name='Add to bank').click(); await W()
        ok('add: a new question is still added', await S('s.qs.length') == n + 1 and await S("s.qs[0].text") == 'A brand new v39 question?')
        ok('NO JS ERRORS', not errs, errs[:3])
        await b.close()
    print('SUMMARY', sum(c for _, c in RES), '/', len(RES))
    import sys; sys.exit(0 if all(c for _, c in RES) else 1)
asyncio.run(main())
