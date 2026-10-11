"""Load check of the policies at the sample organisation's scale (3,500 people, 1,000 courses, ~150 batches,
~20,000 rows). Prints the time to load everything a learner / trainer / admin may read (what the app does at sign-in),
the directory, a 400-row save and the login lookup.   python3 tests/db/load_test.py   (same PGURL / pgserver rules as test_rls.py)
"""
import json, os, sys, time, uuid, random
sys.argv = sys.argv[:1]
import importlib.util
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
spec = importlib.util.spec_from_file_location('t', os.path.join(HERE, 'test_rls.py'))
src = open(os.path.join(HERE, 'test_rls.py')).read().split('# ---------------- seed')[0]   # reuse the server/db setup only
ns = {'__file__': os.path.join(HERE, 'test_rls.py')}; exec(src, ns)
conn, ORG, psycopg = ns['conn'], 'acme', ns['psycopg']
random.seed(7)
N, C = 3500, 1000
conn.execute("insert into sf_doc (org_id, coll, key, data) values ('acme','roles','r_learner','{\"perms\":{}}'), ('acme','roles','r_trainer', %s)",
             (json.dumps({'perms': {'assignments': True, 'attempts': True, 'batches': True, 'gradebook': True, 'lcmsForms': True}}),))
trainers = [f'NW-T{i}' for i in range(20)]
people = [f'NW-{i}' for i in range(N)]
uids = {}
with conn.cursor() as cur:
    rows_u, rows_m, rows_d = [], [], []
    for i, e in enumerate(people + trainers):
        uid = str(uuid.uuid4()); uids[e] = uid
        rows_u.append((uid, e.lower() + '@acme.test', 'h$x'))
        rows_m.append(('acme', uid, e.lower() + '@acme.test', e, 'u' + str(i), e, 'Trainer' if e.startswith('NW-T') else 'Learner', None, True))
        rows_d.append(('acme', 'users', 'u' + str(i), json.dumps({'name': e, 'empId': e, 'email': e + '@acme.test', 'phone': '+91 99', 'status': 'Active', 'dept': 'Ops'})))
    cur.executemany('insert into auth.users (id, email, encrypted_password) values (%s,%s,%s)', rows_u)
    cur.executemany('insert into sf_member (org_id, user_id, email, emp_id, user_key, app_name, role, role_id, active) values (%s,%s,%s,%s,%s,%s,%s,%s,%s)', rows_m)
    cur.executemany('insert into sf_doc (org_id, coll, key, data) values (%s,%s,%s,%s)', rows_d)
    docs = []
    for c in range(C): docs.append(('acme', 'adminCourses', f'c{c}', json.dumps({'status': 'Published' if c % 10 else 'Draft', 'title': f'Course {c}', 'items': [{'kind': 'pdf'}] * 5})))
    for e in people:
        cs = random.sample(range(C), 35)
        docs.append(('acme', 'enroll', e, json.dumps({f'c{c}': '2026-12-01' for c in cs})))
        docs.append(('acme', 'itemDone', e, json.dumps({f'c{c}': {'0': '2026-10-01', '1': '2026-10-02'} for c in cs[:15]})))
        docs.append(('acme', 'assignedOn', e, json.dumps({f'c{c}': '2026-09-01' for c in cs})))
    for b in range(150):
        docs.append(('acme', 'batches', f'b{b}', json.dumps({'trainerEmp': trainers[b % 20], 'traineeEmps': random.sample(people, 20), 'name': f'B{b}'})))
    for q in range(600): docs.append(('acme', 'qs', f'q{q}', json.dumps({'text': 'Q', 'ans': 1})))
    for a in range(5000): docs.append(('acme', 'attemptRecs', f'a{a}', json.dumps({'empId': random.choice(people), 'score': 70})))
    cur.executemany('insert into sf_doc (org_id, coll, key, data) values (%s,%s,%s,%s)', docs)
conn.execute('analyze')
total = conn.execute("select count(*) from sf_doc where org_id='acme'").fetchone()[0]
print(f'seeded {total:,} rows', flush=True)

def as_emp(e, fn):
    with conn.transaction():
        cur = conn.cursor()
        cur.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({'sub': uids[e], 'role': 'authenticated'}),))
        cur.execute('set local role authenticated')
        t = time.perf_counter(); r = fn(cur); dt = time.perf_counter() - t
        raise_rb = r
        conn.rollback() if False else None
    return dt, raise_rb
def load_all(cur):   # what the app does at sign-in: pages of 1000, ordered
    n, last = 0, ('', '')
    while True:   # keyset paging, like the app
        cur.execute("select coll, key, data, version from sf_doc where org_id='acme' and (coll, key) > (%s, %s) order by coll, key limit 1000", last); rows = cur.fetchall(); n += len(rows)
        if len(rows) < 1000: return n
        last = (rows[-1][0], rows[-1][1])
conn.execute("update sf_member set role = 'Admin' where emp_id = 'NW-0'")
for who, e in [('learner', 'NW-5'), ('trainer', 'NW-T3'), ('admin', 'NW-0')]:
    dt, n = as_emp(e, load_all)
    print(f'{who:8s} sign-in load: {n:>6,} rows readable in {dt*1000:7.0f} ms', flush=True)
dt, d = as_emp('NW-5', lambda cur: (cur.execute("select jsonb_array_length(sf_directory('acme'))"), cur.fetchone()[0])[1])
print(f'directory for a learner: {d:,} names in {dt*1000:.0f} ms')
rows = [{'coll': 'enroll', 'key': p, 'data': {'c1': '2027-01-01'}, 'version': 1} for p in people[:400]]
dt, _ = as_emp('NW-0', lambda cur: cur.execute('select sf_save(%s, %s)', ('acme', json.dumps(rows))))
print(f'admin saves 400 rows (versioned): {dt*1000:.0f} ms')
b = json.loads(conn.execute("select data::text from sf_doc where org_id='acme' and coll='batches' and key='b3'").fetchone()[0]); t = b['traineeEmps'][0]
dt, _ = as_emp('NW-T3', lambda cur: cur.execute('select sf_save(%s, %s)', ('acme', json.dumps([{'coll': 'enroll', 'key': t, 'data': {'c2': 'x'}, 'version': 1}]))))
print(f'trainer saves one trainee row (scope check): {dt*1000:.0f} ms')
conn.close(); ns['admin'].execute(f"drop database {ns['DB']} with (force)") if ns['DB'] else None
