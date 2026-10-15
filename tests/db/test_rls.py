"""Runs supabase/migrations/001_skillforge.sql on a real PostgreSQL and checks the policies for every role × collection.

    python3 tests/db/test_rls.py            # uses $PGURL, or starts a throwaway cluster with pgserver if installed
In CI against a real Supabase stack:  supabase start && PGURL=postgresql://postgres:postgres@127.0.0.1:54322/postgres python3 tests/db/test_rls.py
(with a real Supabase stack the shim is skipped: SKIP_SHIM=1).
"""
import json, os, sys, uuid, time, subprocess, tempfile, atexit
import psycopg

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
ORG = 'acme' if not os.environ.get('SKIP_SHIM') else 'acme' + uuid.uuid4().hex[:6]
RES = []
def ok(name, cond, extra=''):
    RES.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name, '' if cond else str(extra)[:500], flush=True)

def server_url():
    if os.environ.get('PGURL'): return os.environ['PGURL']
    if not _has('pgserver'):
        sys.exit('Set PGURL to a PostgreSQL 15+ server (e.g. postgresql://postgres:postgres@127.0.0.1:5432/postgres), or pip install pgserver')
    b = os.path.join(os.path.dirname(__import__('pgserver').__file__), 'pginstall', 'bin'); d = tempfile.mkdtemp(prefix='sfpg'); sock = tempfile.mkdtemp(prefix='sfsock')
    subprocess.run([b + '/initdb', '-D', d, '-U', 'postgres', '-A', 'trust'], check=True, capture_output=True)
    subprocess.run([b + '/pg_ctl', '-D', d, '-o', f"-k {sock} -p 54331 -c listen_addresses=''", '-l', d + '/log', 'start', '-w'], check=True, capture_output=True)
    atexit.register(lambda: subprocess.run([b + '/pg_ctl', '-D', d, 'stop', '-m', 'immediate'], capture_output=True))
    return f'postgresql://postgres@/postgres?host={sock}&port=54331'
def _has(m):
    try: __import__(m); return True
    except Exception: return False

URL = server_url()
admin = psycopg.connect(URL, autocommit=True)
DB = 'sf_test_' + uuid.uuid4().hex[:8]
if os.environ.get('SKIP_SHIM'):   # real Supabase stack: auth/storage live in this database; isolate by organisation id
    DB = None; conn = psycopg.connect(URL, autocommit=True)
else:
    admin.execute(f'create database {DB}')
    url_db = URL.replace('/postgres?', f'/{DB}?') if '/postgres?' in URL else URL.rsplit('/', 1)[0] + '/' + DB
    conn = psycopg.connect(url_db, autocommit=True)
if not os.environ.get('SKIP_SHIM'): conn.execute(open(os.path.join(HERE, 'supabase_shim.sql')).read())
import glob
MIGS = sorted(glob.glob(os.path.join(ROOT, 'supabase/migrations/*.sql')))   # v36: every migration, in order
mig = '\n'.join(open(m).read() for m in MIGS)
for m in MIGS: conn.execute(open(m).read())
for m in MIGS: conn.execute(open(m).read())   # idempotent
ok('migration runs twice without error', True)

# ---------------- seed (as the service role / owner) ----------------
def pw(p): return conn.execute("select extensions.crypt(%s, extensions.gen_salt('bf'))", (p,)).fetchone()[0]
PEOPLE = {   # name: (emp, role base, role_id, extra)
  'admin':   ('NW-1',  'Admin',   None),
  'trainer': ('NW-2',  'Trainer', None),
  'lite':    ('NW-3',  'Trainer', 'r_lite'),     # custom trainer role: batches only
  'learner': ('NW-10', 'Learner', None),
  'other':   ('NW-11', 'Learner', None),
  'qa':      ('NW-12', 'Learner', 'r_qa'),       # learner base + gradebook
  'mustchg': ('NW-13', 'Learner', None),
  'gone':    ('NW-14', 'Learner', None),
}
UID = {}
SID = {}
for name, (emp, base, rid) in PEOPLE.items():
    uid = str(uuid.uuid4()); UID[name] = uid; SID[name] = str(uuid.uuid4())
    conn.execute('insert into auth.users (id, email, encrypted_password) values (%s, %s, %s)', (uid, name + '@acme.test', pw('Pass-' + name + '-123')))
    conn.execute('insert into auth.sessions (id, user_id) values (%s, %s)', (SID[name], uid))
    conn.execute('insert into sf_member (org_id, user_id, email, emp_id, user_key, app_name, role, role_id, active) values (%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                 (ORG, uid, name + '@acme.test', emp, 'u-' + name, name.title(), base, rid, name != 'gone'))
def doc(coll, key, data): conn.execute('insert into sf_doc (org_id, coll, key, data) values (%s,%s,%s,%s)', (ORG, coll, key, json.dumps(data)))
doc('roles', 'r_learner', {'perms': {}}); doc('roles', 'r_trainer', {'perms': {'assignments': True, 'attempts': True, 'batches': True, 'gradebook': True, 'reportsCompletion': True, 'lcmsForms': True}})
doc('roles', 'r_lite', {'perms': {'batches': True}}); doc('roles', 'r_qa', {'perms': {'gradebook': True, 'gradeAll': True, 'reportsCompletion': True}})   # v41.21: gradeAll = all learners
for name, (emp, base, rid) in PEOPLE.items():
    doc('users', 'u-' + name, {'name': name.title(), 'empId': emp, 'email': name + '@acme.test', 'phone': '+91 9' + emp[-2:] * 4, 'role': base, 'status': 'Deactivated' if name == 'gone' else 'Active', 'managerKey': 'u-trainer'})
doc('batches', 'b1', {'name': 'B1', 'trainerEmp': 'NW-2', 'traineeEmps': ['NW-10']})
doc('batches', 'b2', {'name': 'B2', 'trainerEmp': 'NW-3', 'traineeEmps': ['NW-11']})
for e in ['NW-10', 'NW-11']:
    for c in ['enroll', 'itemDone', 'attemptsUsed', 'prefs', 'extraAttempts', 'bookmarks']: doc(c, e, {'x': 1})
doc('roles', 'r_rep', {'perms': {'reports': True, 'analytics': True, 'dashboard': True}})
doc('roles', 'r_qb', {'perms': {'qbank': True}}); doc('roles', 'r_bm', {'perms': {'bookmarks': True}})
for e, a in [('NW-10', [5, 'good']), ('NW-11', [3, 'ok']), ('NW-12', [4, '']), ('NW-13', [2, 'x'])]: doc('surveyResp', e, {'c-pub:0': {'answers': a}})
doc('scormSess', 'NW-10|c-pub|0', {'sid': 'abc', 'emp': 'NW-10'})
doc('qs', 'q1', {'id': 1, 'text': 'Q', 'ans': 2})
doc('adminCourses', 'c-pub', {'status': 'Published', 'title': 'Pub'}); doc('adminCourses', 'c-draft', {'status': 'Draft', 'title': 'Draft'})
doc('attemptRecs', 'ar10', {'empId': 'NW-10', 'score': 50}); doc('attemptRecs', 'ar11', {'empId': 'NW-11', 'score': 90})
doc('reviews', 'rv10', {'learnerEmp': 'NW-10', 'rating': None}); doc('reviews', 'rv11', {'learnerEmp': 'NW-11', 'rating': None})
doc('accessReqs', 'rq10', {'empId': 'NW-10', 'managerKey': 'u-trainer', 'status': 'Pending'})
doc('fbLog', 'c-pub|NW-10|L1|NW-10', {'sentAt': 'x'}); doc('fbLog', 'c-pub|NW-11|L1|NW-11', {'sentAt': 'x'})
doc('threads', 't1', {'title': 'Hi', 'authorKey': 'u-learner'}); doc('lcms', 'm1', {'type': 'Document', 'title': 'Doc'})
doc('masters', 'value', {'x': 1}); doc('syncLog', 's1', {'x': 1}); doc('zh', 'value', {'x': 1}); doc('dash', 'value', {'x': 1})

# ---------------- helpers ----------------
def claims(name, must_change=False):
    return json.dumps({'sub': UID[name], 'role': 'authenticated', 'session_id': SID[name], 'app_metadata': {'must_change': must_change or name == 'mustchg'}})
def as_user(name, sql, params=(), keep=False):
    with conn.transaction() as tx:
        cur = conn.cursor()
        cur.execute("select set_config('request.jwt.claims', %s, true)", (claims(name),))
        cur.execute('set local role authenticated')
        try:
            cur.execute(sql, params); rows = cur.fetchall() if cur.description else []
        except Exception as e:
            rows = e
        if not keep: raise psycopg.Rollback()
    return rows
def readable(name, coll):
    r = as_user(name, 'select key from sf_doc where org_id = %s and coll = %s order by key', (ORG, coll))
    return [x[0] for x in r]
def save(name, coll, key, data, version='cur', keep=False):
    if version == 'cur':
        v = conn.execute('select version from sf_doc where org_id=%s and coll=%s and key=%s', (ORG, coll, key)).fetchone()
        version = v[0] if v else None
    r = as_user(name, 'select sf_save(%s, %s)', (ORG, json.dumps([{'coll': coll, 'key': key, 'data': data, 'version': version}])), keep=keep)
    return r if isinstance(r, Exception) else r[0][0][0]['status']
def get(coll, key): r = conn.execute('select data from sf_doc where org_id=%s and coll=%s and key=%s', (ORG, coll, key)).fetchone(); return r and r[0]

# ---------------- reads ----------------
ok('admin reads everything except attempts in progress', set(readable('admin', 'users')) == {'u-' + n for n in PEOPLE} and readable('admin', 'qs') == ['q1'])
L = 'learner'
ok('learner: own per-person rows only', readable(L, 'enroll') == ['NW-10'] and readable(L, 'itemDone') == ['NW-10'] and readable(L, 'extraAttempts') == ['NW-10'])
ok('learner: only own user row (no emails/phones of others)', readable(L, 'users') == ['u-learner'])
ok('learner: no question bank (answer keys)', readable(L, 'qs') == [])
ok('learner: no batches', readable(L, 'batches') == [])
ok('learner: published courses only', readable(L, 'adminCourses') == ['c-pub'])
ok('learner: own attempts and reviews only', readable(L, 'attemptRecs') == ['ar10'] and readable(L, 'reviews') == ['rv10'])
ok('learner: own feedback requests only', readable(L, 'fbLog') == ['c-pub|NW-10|L1|NW-10'])
ok('learner: no admin logs or settings', readable(L, 'syncLog') == [] and readable(L, 'zh') == [] and readable(L, 'dash') == [])
ok('learner: shared content readable', readable(L, 'lcms') == ['m1'] and readable(L, 'threads') == ['t1'] and readable(L, 'masters') == ['value'])
d = as_user(L, 'select sf_directory(%s)', (ORG,))[0][0]
ok('directory has names but no employee IDs, emails or phones', len(d) == 7 and all('empId' not in x and 'email' not in x and 'phone' not in x and 'managerEmp' not in x for x in d), d[:1])
ok('directory excludes deactivated people', all(x['name'] != 'Gone' for x in d))
ok('manager sees requests addressed to them (by record key)', readable('trainer', 'accessReqs') == ['rq10'])
ok('other learner does not see the request', readable('other', 'accessReqs') == [])
T = 'trainer'
ok('trainer: own batch only (no dashboard permission)', readable(T, 'batches') == ['b1'])
ok('trainer: trainee’s records, not others', readable(T, 'enroll') == ['NW-10'] and readable(T, 'attemptRecs') == ['ar10'], [readable(T, 'enroll'), readable(T, 'attemptRecs'), readable(T, 'reviews')])
ok('trainer with gradebook does NOT read the question bank (answer keys)', readable(T, 'qs') == [])
ok('v41.21: trainer with gradebook reads written answers of their batch trainees only', readable(T, 'reviews') == ['rv10'], readable(T, 'reviews'))
ok('trainer reads users: own + trainees only (no users permission)', sorted(readable(T, 'users')) == ['u-learner', 'u-trainer'])
LI = 'lite'
ok('custom role without gradebook/users: no question bank', readable(LI, 'qs') == [])
ok('custom role: own batch and its trainee only', readable(LI, 'batches') == ['b2'] and sorted(readable(LI, 'users')) == ['u-lite', 'u-other'])
ok('custom role: no attempt records outside trainees', readable(LI, 'attemptRecs') == ['ar11'])
Q = 'qa'
ok('learner-base role with gradebook: reviews to rate, but no answer keys', sorted(readable(Q, 'reviews')) == ['rv10', 'rv11'] and readable(Q, 'qs') == [])
def with_role(name, rid, fn):
    old = conn.execute('select role_id from sf_member where org_id=%s and user_id=%s', (ORG, UID[name])).fetchone()[0]
    conn.execute('update sf_member set role_id=%s where org_id=%s and user_id=%s', (rid, ORG, UID[name]))
    try: return fn()
    finally: conn.execute('update sf_member set role_id=%s where org_id=%s and user_id=%s', (old, ORG, UID[name]))
ok('question-bank permission reads the question bank', with_role('qa', 'r_qb', lambda: readable(Q, 'qs')) == ['q1'])
rep_reads = with_role('qa', 'r_rep', lambda: {c: readable(Q, c) for c in ['enroll', 'prefs', 'bookmarks', 'surveyResp']})
ok('reports/analytics/dashboard: progress rows yes; prefs, bookmarks, survey answers no',
   rep_reads['enroll'] == ['NW-10', 'NW-11'] and rep_reads['prefs'] == [] and rep_reads['bookmarks'] == [] and rep_reads['surveyResp'] == ['NW-12'], rep_reads)
ok('owner reads own prefs, bookmarks and survey answers', readable(L, 'prefs') == ['NW-10'] and readable(L, 'bookmarks') == ['NW-10'] and readable(L, 'surveyResp') == ['NW-10'])
ok('trainer does not read trainee prefs, bookmarks or survey answers', readable(T, 'prefs') == [] and readable(T, 'bookmarks') == [] and readable(T, 'surveyResp') == [])
ok('SCORM-bookmark permission reads and clears bookmarks', with_role('qa', 'r_bm', lambda: (readable(Q, 'bookmarks'), save(Q, 'bookmarks', 'NW-11', {}))) == (['NW-10', 'NW-11'], 'ok'))
ok('SCORM launch sessions: invisible and unwritable, even for admins', readable('admin', 'scormSess') == [] and readable(L, 'scormSess') == []
   and save('admin', 'scormSess', 'NW-10|c-pub|0', {'sid': 'x', 'emp': 'NW-10'}) in ('denied', 'gone') and save(L, 'scormSess', 'NW-10|c-pub|9', {'sid': 'x'}, None) == 'denied')
summ = lambda who: as_user(who, 'select sf_survey_summary(%s, %s, %s)', (ORG, 'c-pub', 0))[0][0]
s_admin, s_l = summ('admin'), summ(L)
ok('survey results: aggregates for feedback/reports, nothing for learners', s_l is None and s_admin['responses'] == 4 and s_admin['questions'][0]['avg'] == 3.5 and s_admin['questions'][0]['dist'] == [0, 1, 1, 1, 1], [s_admin, s_l])
conn.execute("delete from sf_doc where org_id=%s and coll='surveyResp' and key in ('NW-12','NW-13')", (ORG,))
ok('survey results: fewer than 3 responses -> count only', summ('admin') == {'responses': 2, 'questions': []}, summ('admin'))
ok('learner-base role with gradebook: still no other people’s user rows', readable(Q, 'users') == ['u-qa'])
ok('must-change session: no access at all', all(readable('mustchg', c) == [] for c in ['users', 'lcms', 'masters', 'enroll']) and as_user('mustchg', 'select * from sf_member') == [])
ok('deactivated member: no access', readable('gone', 'lcms') == [] and readable('gone', 'users') == [])

# ---------------- writes ----------------
ok('learner cannot write own results', save(L, 'itemDone', 'NW-10', {'c': {'0': 'x'}}) == 'denied' and save(L, 'attemptsUsed', 'NW-10', {}) == 'denied')
ok('learner cannot create attempt records or threads', save(L, 'attemptRecs', 'arX', {'empId': 'NW-10', 'score': 100}, None) == 'denied' and save(L, 'threads', 't1', {'title': 'pwned'}) == 'denied')
ok('learner cannot edit own user row (role)', save(L, 'users', 'u-learner', {'empId': 'NW-10', 'role': 'Admin'}) == 'denied')
ok('learner can save own preferences and bookmarks', save(L, 'prefs', 'NW-10', {'tz': 'IST'}) == 'ok' and save(L, 'bookmarks', 'NW-10', {'c': 1}) == 'ok')
ok('learner cannot write someone else’s preferences', save(L, 'prefs', 'NW-11', {'tz': 'x'}) in ('denied', 'gone'))
ok('learner cannot change roles or settings', save(L, 'roles', 'r_learner', {'perms': {'users': True}}) == 'denied' and save(L, 'masters', 'value', {}) == 'denied')
ok('trainer assigns courses to own trainee only', save(T, 'enroll', 'NW-10', {'c-pub': '2026-12-01'}) == 'ok' and save(T, 'enroll', 'NW-11', {'c': 1}) in ('denied', 'gone'))
ok('trainer cannot assign to themselves', save(T, 'enroll', 'NW-2', {'c-pub': 'x'}, None) == 'denied')
ok('trainer edits own batch details', save(T, 'batches', 'b1', {**get('batches', 'b1'), 'name': 'B1 renamed'}) == 'ok')
ok('trainer cannot add people to their batch (self-grant)', save(T, 'batches', 'b1', {**get('batches', 'b1'), 'traineeEmps': ['NW-10', 'NW-11']}) == 'denied')
ok('trainer cannot add themselves as trainee', save(T, 'batches', 'b1', {**get('batches', 'b1'), 'traineeEmps': ['NW-10', 'NW-2']}) == 'denied')
ok('trainer cannot create batches', save(T, 'batches', 'b9', {'trainerEmp': 'NW-2', 'traineeEmps': ['NW-11']}, None) == 'denied')
ok('trainer cannot take over another batch', save(T, 'batches', 'b2', {**get('batches', 'b2'), 'trainerEmp': 'NW-2'}) in ('denied', 'gone'))
ok('custom role without assignments cannot assign', save(LI, 'enroll', 'NW-11', {'c': 1}) == 'denied')
ok('trainer (lcmsForms) creates own feedback form, not documents', save(T, 'lcms', 'f1', {'type': 'Feedback form', 'ownerEmp': 'NW-2'}, None) == 'ok' and save(T, 'lcms', 'd2', {'type': 'Document', 'ownerEmp': 'NW-2'}, None) == 'denied')
ok('trainer cannot change roles (no self-escalation)', save(T, 'roles', 'r_trainer', {'perms': {'users': True}}) == 'denied')
r = as_user('admin', "select sf_save(%s, %s)", (ORG, json.dumps([{'coll': 'batches', 'key': 'b3', 'data': {'trainerEmp': 'NW-2', 'traineeEmps': ['NW-2']}, 'version': None}])))
ok('nobody (not even admin) can make a trainer their own trainee', r[0][0][0]['status'] == 'denied')
ok('admin adds a trainee; trainer scope follows', save('admin', 'batches', 'b1', {**get('batches', 'b1'), 'traineeEmps': ['NW-10', 'NW-11']}, keep=True) == 'ok' and readable(T, 'enroll') == ['NW-10', 'NW-11'])
save('admin', 'batches', 'b1', {**get('batches', 'b1'), 'traineeEmps': ['NW-10']}, keep=True)
ok('scope removed when the trainee is removed', readable(T, 'enroll') == ['NW-10'])
# conflict
v = conn.execute("select version from sf_doc where org_id=%s and coll='masters' and key='value'", (ORG,)).fetchone()[0]
r = as_user('admin', 'select sf_save(%s, %s)', (ORG, json.dumps([{'coll': 'masters', 'key': 'value', 'data': {'x': 2}, 'version': v - 1}])))[0][0][0]
ok('stale version returns conflict with the current data', r['status'] == 'conflict' and r['data'] == {'x': 1}, r)
r = as_user('learner', 'select sf_delete(%s, %s)', (ORG, json.dumps([{'coll': 'lcms', 'key': 'm1'}])))[0][0][0]
ok('learner delete refused', r['status'] == 'denied')

# ---------------- storage ----------------
def put_obj(name, path, bucket='lms-files'):
    r = as_user(name, 'insert into storage.objects (bucket_id, name) values (%s, %s) returning id', (bucket, path))
    return not isinstance(r, Exception)
ok('learner cannot upload', not put_obj(L, ORG + '/lcms/2026-10/x.pdf'))
ok('trainer uploads to lcms only', put_obj(T, ORG + '/lcms/2026-10/x.pdf') and not put_obj(T, ORG + '/courses/2026-10/x.png'))
ok('only LCMS admins upload SCORM', put_obj('admin', ORG + '/scorm/p1/index.html', 'lms-scorm') and not put_obj(T, ORG + '/scorm/p1/index.html', 'lms-scorm'), [put_obj('admin', ORG + '/scorm/p1/index.html', 'lms-scorm'), put_obj(T, ORG + '/scorm/p1/index.html', 'lms-scorm'), as_user('admin', "insert into storage.objects (bucket_id, name) values ('lms-scorm', 'acme/scorm/p/x')")])
conn.execute("insert into storage.objects (bucket_id, name) values ('lms-files', %s)", (ORG + '/lcms/2026-10/y.pdf',))
ok('learner cannot read the bucket directly', as_user(L, "select count(*) from storage.objects where bucket_id = 'lms-files'")[0][0] == 0)

# ---------------- login lookup ----------------
def lookup(emp, p, ip='10.0.0.1', xff='6.6.6.6'):
    hdr = {'x-forwarded-for': xff + ', 1.1.1.1'}
    if ip is not None: hdr['cf-connecting-ip'] = ip
    with conn.transaction() as tx:
        cur = conn.cursor(); cur.execute("select set_config('request.headers', %s, true)", (json.dumps(hdr),)); cur.execute('set local role anon')
        cur.execute('select sf_login_lookup(%s, %s, %s)', (ORG, emp, p)); return cur.fetchone()[0]
def client_ip(hdr):
    with conn.transaction() as tx:
        cur = conn.cursor(); cur.execute("select set_config('request.headers', %s, true)", (json.dumps(hdr),)); cur.execute('set local role anon')
        cur.execute('select sf_client_ip()'); return cur.fetchone()[0]
def age_failures(emp, secs):   # move this ID's failures back in time (simulates waiting)
    conn.execute("update sf_login_attempt set at = at - make_interval(secs => %s) where org_id = %s and emp_id = %s", (secs, ORG, emp))
ok('client IP comes from CF-Connecting-IP; X-Forwarded-For (client-controlled) is ignored',
   client_ip({'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '1.2.3.4'}) == '203.0.113.9' and client_ip({'x-forwarded-for': '1.2.3.4'}) == '' and client_ip({'cf-connecting-ip': "1.1.1.1'; drop"}) == '')
ok('employee-ID lookup returns the email only with the right password', lookup('nw-10', 'Pass-learner-123') == {'email': 'learner@acme.test'} and lookup('NW-10', 'wrong') == {'error': 'invalid'})
ok('unknown ID and wrong password look the same', lookup('NW-999', 'x') == {'error': 'invalid'})
ok('deactivated login refused', lookup('NW-14', 'Pass-gone-123') == {'error': 'invalid'})
ok('over-long input refused without work', lookup('NW-10', 'x' * 500) == {'error': 'invalid'} and lookup('N' * 60, 'x') == {'error': 'invalid'})
t0 = time.time()
for i in range(5): lookup('NW-11', 'nope', '10.0.0.2', xff='9.9.9.%d' % i)
fast = time.time() - t0
r = lookup('NW-11', 'Pass-other-123', '10.0.0.2')
ok('5 failures from one IP pause that ID on that IP (spoofed X-Forwarded-For does not help)', r.get('error') == 'locked' and 0 < r.get('retryAfter', 0) <= 30, r)
ok('failures are not slowed with pg_sleep (no pooled connection held)', fast < 1.5, fast)
ok('the real person on another IP is NOT locked out', lookup('NW-11', 'Pass-other-123', '10.0.0.3') == {'email': 'other@acme.test'})
age_failures('NW-11', 31)
ok('pause ends after 30 s', lookup('NW-11', 'Pass-other-123', '10.0.0.2') == {'email': 'other@acme.test'})
for i in range(5): lookup('NW-12', 'nope', '10.0.0.4')
age_failures('NW-12', 31); lookup('NW-12', 'nope', '10.0.0.4')          # pause over, fails again
r = lookup('NW-12', 'nope', '10.0.0.4')
ok('pause grows with more failures (progressive: 30 s, then 60 s …)', r.get('error') == 'locked' and 30 < r.get('retryAfter', 0) <= 60, r)
age_failures('NW-12', 900)
ok('a success clears the pause for that ID and IP', lookup('NW-12', 'Pass-qa-123', '10.0.0.4') == {'email': 'qa@acme.test'} and lookup('NW-12', 'nope', '10.0.0.4') == {'error': 'invalid'})
conn.execute("insert into sf_login_attempt (org_id, emp_id, ip, ok) select %s, 'NW-10', '198.51.100.' || g, false from generate_series(1, 30) g", (ORG,))
r = lookup('NW-10', 'Pass-learner-123', '10.0.0.5')
ok('30 failures on one ID from many IPs pause employee-ID sign-in for it (email sign-in still works)', r.get('error') == 'locked' and r.get('useEmail') is True, r)
ok('v34: an address that already signed this person in is NOT paused by strangers\' failures', lookup('NW-10', 'Pass-learner-123', '10.0.0.1') == {'email': 'learner@acme.test'}, lookup('NW-10', 'Pass-learner-123', '10.0.0.1'))
ok('v34: a known address still faces its own 5-failure pause (guessing from that address is not free)', [lookup('NW-10', 'bad', '10.0.0.1') for _ in range(5)] and lookup('NW-10', 'Pass-learner-123', '10.0.0.1').get('error') == 'locked')
ok('v34: the unknown address stays paused', lookup('NW-10', 'Pass-learner-123', '10.0.0.77').get('useEmail') is True)
conn.execute("update sf_login_attempt set at = at - interval '1 hour' where org_id = %s and emp_id = 'NW-10'", (ORG,))
ok('v34: addresses are remembered per person (another person at that address is unaffected)', lookup('NW-11', 'Pass-other-123', '10.0.0.1') == {'email': 'other@acme.test'})
conn.execute("insert into sf_login_attempt (org_id, emp_id, ip, ok) select %s, 'X' || g, '10.9.9.9', false from generate_series(1, 50) g", (ORG,))
ok('50 failures from one IP across IDs pause that IP', lookup('NW-13', 'Pass-mustchg-123', '10.9.9.9').get('error') == 'locked')
conn.execute("insert into sf_setting (k, v) values ('ip_fail_limit', '80') on conflict (k) do update set v = excluded.v")
ok('v34: the per-IP limit is configurable (shared office address)', lookup('NW-13', 'Pass-mustchg-123', '10.9.9.9').get('error') != 'locked')
conn.execute("insert into sf_setting (k, v) values ('ip_fail_limit', 'abc') on conflict (k) do update set v = excluded.v")
ok('v34: a bad setting falls back to 50', lookup('NW-13', 'Pass-mustchg-123', '10.9.9.9').get('error') == 'locked')
conn.execute("delete from sf_setting where k = 'ip_fail_limit'")
conn.execute("insert into sf_login_attempt (org_id, emp_id, ip, ok, at) select %s, 'OLD' || g, '10.1.1.1', false, now() - interval '2 days' from generate_series(1, 20) g", (ORG,))
n_old = conn.execute("select sf_login_attempt_cleanup()").fetchone()[0]
ok('cleanup deletes attempts older than a day', n_old >= 20 and conn.execute("select count(*) from sf_login_attempt where at < now() - interval '1 day'").fetchone()[0] == 0, n_old)
r = as_user(L, 'select sf_login_attempt_cleanup()')
ok('cleanup is not callable by users', isinstance(r, Exception))
r = as_user(L, 'select * from sf_setting')
ok('server settings (dummy hash) are not readable', isinstance(r, Exception) or r == [])
r = as_user(L, "select sf_auth_user_id('admin@acme.test')")
ok('sf_auth_user_id is not callable by users', isinstance(r, Exception))
r = as_user(L, "insert into sf_member (org_id, user_id, email, emp_id, app_name, role) values (%s, %s, 'x', 'NW-99', 'X', 'Admin')", (ORG, UID['learner']))
ok('members cannot add themselves as admin', isinstance(r, Exception))


# ---------------- v34: live sessions ----------------
RL = 'learner'
ok('v34: a token whose session exists reads its data', len(readable(RL, 'enroll')) >= 1)
def claims_for(name, sid): return json.dumps({'sub': UID[name], 'role': 'authenticated', 'session_id': sid, 'app_metadata': {}})
def with_claims(c, sql, params=()):
    with conn.transaction() as tx:
        cur = conn.cursor(); cur.execute("select set_config('request.jwt.claims', %s, true)", (c,)); cur.execute('set local role authenticated')
        try: cur.execute(sql, params); rows = cur.fetchall() if cur.description else []
        except Exception as e: rows = e
        raise psycopg.Rollback()
    return rows
ok('v34: a token with an unknown session id is refused', with_claims(claims_for(RL, str(uuid.uuid4())), 'select key from sf_doc where org_id = %s and coll = %s', (ORG, 'enroll')) == [])
ok('v34: a malformed session id is refused (no error)', with_claims(claims_for(RL, 'not-a-uuid'), 'select key from sf_doc where org_id = %s and coll = %s', (ORG, 'enroll')) == [])
ok('v34: someone else\'s session id does not work for this person', with_claims(claims_for(RL, SID['other']), 'select key from sf_doc where org_id = %s and coll = %s', (ORG, 'enroll')) == [])
ok('v34: no session claim = not checked (older GoTrue)', len(with_claims(json.dumps({'sub': UID[RL], 'role': 'authenticated', 'app_metadata': {}}), 'select key from sf_doc where org_id = %s and coll = %s', (ORG, 'enroll'))) >= 1)
ok('v34: sf_session_ok / sf_revoke_sessions / sf_session_live are not callable by users except sf_session_live',
   isinstance(as_user(RL, 'select sf_session_ok(%s, %s)', (UID[RL], SID[RL])), Exception) and isinstance(as_user(RL, 'select sf_revoke_sessions(%s, null)', (UID['admin'],)), Exception))
ok('v34: service role: session_ok true for a live session, false for another or malformed one',
   conn.execute('select sf_session_ok(%s, %s)', (UID[RL], SID[RL])).fetchone()[0] is True and conn.execute('select sf_session_ok(%s, %s)', (UID[RL], SID['other'])).fetchone()[0] is False and conn.execute("select sf_session_ok(%s, 'x')", (UID[RL],)).fetchone()[0] is False)
# a second session for the learner (another device), then revoke
S2 = str(uuid.uuid4()); conn.execute('insert into auth.sessions (id, user_id) values (%s, %s)', (S2, UID[RL]))
n = conn.execute('select sf_revoke_sessions(%s, %s)', (UID[RL], S2)).fetchone()[0]
ok('v34: revoking "all but this one" keeps the kept session and removes the rest', n == 1 and with_claims(claims_for(RL, S2), 'select count(*) from sf_doc where org_id = %s and coll = %s', (ORG, 'enroll'))[0][0] >= 1 and with_claims(claims_for(RL, SID[RL]), 'select count(*) from sf_doc where org_id = %s and coll = %s', (ORG, 'enroll'))[0][0] == 0)
ok('v34: a revoked token sees nothing in ANY collection, and its own member row is hidden', with_claims(claims_for(RL, SID[RL]), 'select count(*) from sf_doc where org_id = %s', (ORG,))[0][0] == 0 and with_claims(claims_for(RL, SID[RL]), 'select count(*) from sf_member')[0][0] == 0)
ok('v34: a revoked token cannot write', isinstance(with_claims(claims_for(RL, SID[RL]), "insert into sf_doc (org_id, coll, key, data) values (%s, 'threads', 'zz', '{}')", (ORG,)), Exception))
ok('v34: a revoked token cannot call sf_directory or learn the role', with_claims(claims_for(RL, SID[RL]), 'select sf_ctx()')[0][0] is None)
n = conn.execute('select sf_revoke_sessions(%s, null)', (UID[RL],)).fetchone()[0]
ok('v34: revoking everything removes the remaining session; a fresh session works again', n == 1 and conn.execute("insert into auth.sessions (id, user_id) values (%s, %s) returning 1", (SID[RL], UID[RL])).fetchone() is not None and with_claims(claims_for(RL, SID[RL]), 'select count(*) from sf_doc where org_id = %s and coll = %s', (ORG, 'enroll'))[0][0] >= 1)

# ---------------- v36: 002_v36_hardening.sql ----------------
na = conn.execute('select count(*) from sf_audit where org_id = %s', (ORG,)).fetchone()[0]
as_user('admin', "select sf_save(%s, %s::jsonb)", (ORG, json.dumps([{'coll': 'threads', 'key': 'v36-dup', 'data': {'t': 1}}])), keep=True)
na1 = conn.execute('select count(*) from sf_audit where org_id = %s', (ORG,)).fetchone()[0]
as_user('admin', "select sf_save(%s, %s::jsonb)", (ORG, json.dumps([{'coll': 'threads', 'key': 'v36-dup', 'data': {'t': 2}}])), keep=True)
na2 = conn.execute('select count(*) from sf_audit where org_id = %s', (ORG,)).fetchone()[0]
ok('v36: an insert that did not happen (conflict) leaves no audit row', na1 == na + 1 and na2 == na1, (na, na1, na2))
big = json.dumps([{'coll': 'threads', 'key': 'b' + str(i), 'data': {}} for i in range(501)])
ok('v36: sf_save refuses more than 500 rows in one call', isinstance(as_user('admin', "select sf_save(%s, %s::jsonb)", (ORG, big)), Exception))
ok('v36: sf_audit_purge is not callable by users', isinstance(as_user('admin', 'select sf_audit_purge(4000)'), Exception))
try: conn.execute('select sf_audit_purge(30)'); short = False
except Exception: short = True
ok('v36: sf_audit_purge keeps at least a year', short)

# ---------------- v37: 003_v37_audit_tz_limits.sql ----------------
as_user('admin', "select sf_save(%s, %s::jsonb)", (ORG, json.dumps([{'coll': 'threads', 'key': 'v37-a', 'data': {'t': 1, 'x': 'keep'}}])), keep=True)
v = conn.execute("select version from sf_doc where org_id=%s and coll='threads' and key='v37-a'", (ORG,)).fetchone()[0]
as_user('admin', "select sf_save(%s, %s::jsonb)", (ORG, json.dumps([{'coll': 'threads', 'key': 'v37-a', 'version': v, 'data': {'t': 2, 'x': 'keep'}}])), keep=True)
ch = conn.execute("select changes from sf_audit where org_id=%s and coll='threads' and key='v37-a' order by id desc limit 1", (ORG,)).fetchone()[0]
ok('v37: audit row records only the changed field, before and after', ch == {'t': [1, 2]}, ch)
conn.execute("update sf_setting set v='America/New_York' where k='org_timezone'")
ny = conn.execute("select sf_today() = to_char(now() at time zone 'America/New_York','YYYY-MM-DD')").fetchone()[0]
conn.execute("update sf_setting set v='Not/AZone' where k='org_timezone'")
bad = conn.execute("select sf_today() = to_char(now() at time zone 'Asia/Kolkata','YYYY-MM-DD')").fetchone()[0]
conn.execute("update sf_setting set v='Asia/Kolkata' where k='org_timezone'")
ok('v37: sf_today follows sf_setting org_timezone; an invalid zone falls back to Asia/Kolkata', ny and bad)
r = as_user('admin', "select sf_save(%s, %s::jsonb)", (ORG, json.dumps([{'coll': 'threads', 'key': 'v37-big', 'data': {'b': 'x' * 600000}}])))
ok('v37: a row over 512 KB is refused', (not isinstance(r, Exception)) and 'denied' in json.dumps(r), str(r)[:120])
conn.execute('delete from sf_rate'); conn.execute("insert into sf_setting(k,v) values ('save_per_minute','5') on conflict (k) do update set v='5'")
res = [as_user('admin', "select sf_save(%s, '[]'::jsonb)", (ORG,), keep=True) for _ in range(5)] + [as_user('admin', "select sf_save(%s, '[]'::jsonb)", (ORG,)) for _ in range(2)]
conn.execute("delete from sf_setting where k='save_per_minute'"); conn.execute('delete from sf_rate')
ok('v37: sf_save is rate-limited per user per minute', not isinstance(res[0], Exception) and isinstance(res[-1], Exception), [type(x).__name__ for x in res])
ok('v37: sf_rate is not readable by members', isinstance(as_user('admin', 'select count(*) from sf_rate'), Exception))

doc('docs', 'v37-d1', {'versions': [{'file': {'path': ORG + '/docs/a.pdf'}}]}); doc('docs', 'v37-d2', {'versions': [{'file': {'path': ORG + '/docs/b.pdf'}}]})
got = conn.execute('select count(*) from sf_docs_by_paths(%s, %s)', (ORG, [ORG + '/docs/a.pdf'])).fetchone()[0]
ok('v37: sf_docs_by_paths returns only documents holding the paths', got == 1, got)
ok('v37: sf_docs_by_paths is not callable by members', isinstance(as_user('admin', 'select sf_docs_by_paths(%s, %s)', (ORG, ['x'])), Exception))

# ---------------- v41: 004_v41_trainer_defaults.sql ----------------
doc('roles', 'r_trainer_v41', {'perms': {}})
conn.execute("update sf_doc set data = %s where org_id = %s and coll = 'roles' and key = 'r_trainer'", (json.dumps({'perms': {'assignments': True, 'attempts': True, 'batches': True, 'lcms': True, 'lcmsForms': True}}), ORG))
conn.execute(open(os.path.join(ROOT, 'supabase/migrations/004_v41_trainer_defaults.sql')).read())
p41 = conn.execute("select data->'perms' from sf_doc where org_id = %s and coll = 'roles' and key = 'r_trainer'", (ORG,)).fetchone()[0]
ok('v41: 004 removes attempts, lcms and lcmsForms from the Trainer role and keeps the rest', p41 == {'assignments': True, 'batches': True}, p41)
conn.execute(open(os.path.join(ROOT, 'supabase/migrations/004_v41_trainer_defaults.sql')).read())
ok('v41: 004 is safe to run again', conn.execute("select data->'perms' from sf_doc where org_id = %s and coll = 'roles' and key = 'r_trainer'", (ORG,)).fetchone()[0] == p41)
# v41.18: an admin turns LCMS back on for trainers; the next deploy re-runs 004 and must keep that choice
conn.execute("update sf_doc set data = jsonb_set(data, '{perms,lcms}', 'true') where org_id = %s and coll = 'roles' and key = 'r_trainer'", (ORG,))
conn.execute(open(os.path.join(ROOT, 'supabase/migrations/004_v41_trainer_defaults.sql')).read())
ok('v41.18: re-running 004 keeps the admin\'s choice', conn.execute("select (data->'perms'->>'lcms')::boolean from sf_doc where org_id = %s and coll = 'roles' and key = 'r_trainer'", (ORG,)).fetchone()[0] is True)

# ---------------- v41.18: 008 usage meter ----------------
u_l = as_user(L, 'select sf_usage()')[0][0]
u_a = as_user('admin', 'select sf_usage()')[0][0]
ok('v41.18: a learner gets no usage totals', u_l is None, u_l)
ok('v41.18: an admin gets them', isinstance(u_a, dict) and 'storage' in u_a, u_a)
failed = [n for n, c in RES if not c]
print('\nSUMMARY', len(RES) - len(failed), '/', len(RES))
if DB: conn.close(); admin.execute(f'drop database {DB} with (force)')
else:
    conn.execute('delete from sf_doc where org_id = %s', (ORG,)); conn.execute('delete from sf_member where org_id = %s', (ORG,)); conn.execute("delete from auth.users where email like %s", ('%@acme.test',)); conn.close()
admin.close()
sys.exit(1 if failed else 0)
