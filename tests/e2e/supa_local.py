"""A local stand-in for Supabase, for the tests: a real PostgreSQL (the real supabase/schema.sql with its row-level
security) behind a small HTTP server that speaks the parts of Supabase's REST and sign-in API the app uses.
  - /auth/v1/signup, /auth/v1/token (password, refresh_token), /auth/v1/recover, /auth/v1/user, /auth/v1/logout
  - /rest/v1/<table>   GET (select, eq. / like. / in. filters, order, limit), POST (insert / upsert), PATCH, DELETE
  - /rest/v1/rpc/<fn>  POST (named arguments)
Every request runs as Supabase's "anon" or "authenticated" role with the caller's claims, so the policies decide.
Needs the PostgreSQL server programs (initdb, pg_ctl, psql); tests skip when they are missing."""
import glob, json, os, re, secrets, shutil, socket, subprocess, sys, tempfile, threading, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qsl, unquote

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCHEMA = os.path.join(ROOT, 'supabase', 'schema.sql')

def pg_bin():
    win = sorted(glob.glob(os.path.join(os.environ.get('ProgramFiles', 'C:/Program Files'), 'PostgreSQL', '*', 'bin')), reverse=True) if os.name == 'nt' else []
    for d in win + sorted(glob.glob('/usr/lib/postgresql/*/bin'), reverse=True) + ['/usr/local/bin', '/usr/bin', '/opt/homebrew/bin']:
        if os.path.isfile(os.path.join(d, EXE('initdb'))) and os.path.isfile(os.path.join(d, EXE('pg_ctl'))): return d
    return None

WIN = os.name == 'nt'
def EXE(n): return n + '.exe' if WIN else n
def ROOT_USER(): return not WIN and os.geteuid() == 0   # as root (Linux CI) the server runs as a separate user

def free_port():
    with socket.socket() as s: s.bind(('127.0.0.1', 0)); return s.getsockname()[1]

AUTH_SQL = r"""
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique not null, encrypted_password text, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.email() returns text language sql stable as $$ select auth.jwt() ->> 'email' $$;
grant execute on all functions in schema auth to anon, authenticated;
-- what Supabase grants by default on new tables in public (the schema then narrows it)
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
"""

class LocalSupabase:
    def __init__(self):
        self.bin = pg_bin(); self.ok = bool(self.bin) and (os.path.isfile(os.path.join(self.bin, EXE('psql'))) or shutil.which('psql') is not None)
        self.tokens = {}; self.lock = threading.Lock(); self.calls = []

    # ---------- PostgreSQL ----------
    def _as_pg_user(self, cmd):
        if not ROOT_USER(): return cmd
        return ['su', 'pgtest', '-s', '/bin/sh', '-c', ' '.join("'" + c.replace("'", "'\\''") + "'" for c in cmd)]
    def start(self):
        if not self.ok: return False
        if ROOT_USER() and subprocess.run(['id', 'pgtest'], capture_output=True).returncode != 0:
            subprocess.run(['useradd', '-m', 'pgtest'], check=True)
        self.dir = tempfile.mkdtemp(prefix='supa-'); os.chmod(self.dir, 0o777)
        data = os.path.join(self.dir, 'data'); self.sock = self.dir; self.pgport = free_port()
        subprocess.run(self._as_pg_user([os.path.join(self.bin, EXE('initdb')), '-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8'] + (['--no-locale'] if WIN else [])), check=True, capture_output=True)
        # Linux: a Unix socket in the temp folder; Windows: local TCP only
        opts = f'-p {self.pgport} -c listen_addresses=127.0.0.1' if WIN else f'-p {self.pgport} -k {self.sock} -c listen_addresses='
        if WIN: self.sock = '127.0.0.1'
        subprocess.run(self._as_pg_user([os.path.join(self.bin, EXE('pg_ctl')), '-D', data, '-o', opts, '-l', os.path.join(self.dir, 'log'), '-w', 'start']), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)   # no pipes: on Windows the server would keep them open and this would wait forever
        self.psql = os.path.join(self.bin, EXE('psql')) if os.path.isfile(os.path.join(self.bin, EXE('psql'))) else shutil.which('psql')
        self.sql('create database app;', db='postgres')
        self.sql(AUTH_SQL)
        out = self.sql(open(SCHEMA, encoding='utf-8').read())
        self.srf = set(self.sql("select string_agg(proname, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proretset").strip().split(','))
        self.port = free_port(); self.url = f'http://127.0.0.1:{self.port}'
        self.httpd = ThreadingHTTPServer(('127.0.0.1', self.port), self._handler()); threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        return True
    def stop(self):
        try: self.httpd.shutdown()
        except Exception: pass
        try: subprocess.run(self._as_pg_user([os.path.join(self.bin, EXE('pg_ctl')), '-D', os.path.join(self.dir, 'data'), '-m', 'immediate', 'stop']), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
        except Exception: pass
        shutil.rmtree(self.dir, ignore_errors=True)

    def sql(self, script, db='app', params=None, claims=None, role=None):
        """run SQL; params become psql variables (:'name'); with a role, inside a transaction as that role with these claims"""
        params = dict(params or {})
        head = '\\set ON_ERROR_STOP on\n\\set VERBOSITY verbose\n'
        if role:
            params['_claims'] = json.dumps(claims or {})
            script = f"begin;\nset local role {role};\nselect set_config('request.jwt.claims', :'_claims', true) \\g {os.devnull}\n{script}\ncommit;\n"
        cmd = [self.psql, '-h', self.sock, '-p', str(self.pgport), '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t']
        pre = ''; tmp = []
        for k, v in params.items():
            if len(v) > 30000:   # big values (whole files) do not fit on a command line: read them from a file first
                f = os.path.join(self.dir, f'v-{secrets.token_hex(6)}'); open(f, 'w', encoding='utf-8').write(v); os.chmod(f, 0o644); tmp.append(f)
                cmd += ['-v', f'_f_{k}={f}']; pre += f"select pg_read_file(:'_f_{k}') as {k} \\gset\n"
            else: cmd += ['-v', f'{k}={v}']
        r = subprocess.run(cmd, input=head + pre + script, capture_output=True, text=True, encoding='utf-8')
        for f in tmp: os.remove(f)
        if r.returncode != 0:
            m = re.search(r'ERROR:\s+(?:([0-9A-Z]{5}):\s+)?(.*)', r.stderr); code = m.group(1) if m else ''; msg = m.group(2).strip() if m else r.stderr.strip()
            raise PgError(code, msg)
        return r.stdout

    # ---------- people ----------
    def user(self, email, password='secret'):
        out = self.sql("insert into auth.users (email, encrypted_password) values (lower(:'e'), :'p') on conflict (email) do update set encrypted_password = excluded.encrypted_password returning id;", params={'e': email, 'p': password})
        return out.strip()
    def make_platform_owner(self, email):
        self.sql("insert into public.platform_owners (user_id) select id from auth.users where email = lower(:'e') on conflict do nothing;", params={'e': email})
    def session_for(self, uid, email):
        tok = 'tok-' + secrets.token_hex(12); ref = 'ref-' + secrets.token_hex(12)
        with self.lock: self.tokens[tok] = (uid, email); self.tokens[ref] = (uid, email)
        return {'access_token': tok, 'refresh_token': ref, 'token_type': 'bearer', 'expires_in': 3600, 'user': {'id': uid, 'email': email}}
    def as_user(self, email, password='secret'):
        """sign in like the app does — for API-level tests"""
        uid = self.user(email, password); return self.session_for(uid, email.lower())

    # ---------- REST ----------
    def rest(self, method, path, query, body, claims):
        role = 'authenticated' if claims else 'anon'
        m = re.match(r'^/rest/v1/rpc/([a-z_]+)$', path)
        if m:
            fn = m.group(1); args = body or {}; params = {}; parts = []
            for i, (k, v) in enumerate(args.items()):
                if not re.match(r'^[a-z_]+$', k): raise PgError('42601', 'bad argument')
                params[f'a{i}'] = '' if v is None else (json.dumps(v) if isinstance(v, (dict, list)) else (str(v).lower() if isinstance(v, bool) else str(v)))
                parts.append(f"{k} => " + ('null' if v is None else f":'a{i}'"))
            call = f"public.{fn}({', '.join(parts)})"
            q = f"select coalesce(json_agg(t), '[]') from {call} t;" if fn in self.srf else f"select coalesce(to_json({call}), 'null'::json);"
            return json.loads(self.sql(q, params=params, claims=claims, role=role) or 'null')
        m = re.match(r'^/rest/v1/([a-z_]+)$', path)
        if not m: raise PgError('404', 'not found')
        table = 'public.' + m.group(1); params = {}; where = []; sel = '*'; order = ''; limit = ''; oc = ''
        for i, (k, v) in enumerate(query):
            if k == 'select': sel = ','.join(c for c in v.split(',') if re.match(r'^[a-z_]+$', c)) or '*'; continue
            if k == 'order': col, _, d = v.partition('.'); order = f' order by {col} {"desc" if d.startswith("desc") else "asc"}' if re.match(r'^[a-z_]+$', col) else ''; continue
            if k == 'limit': limit = f' limit {int(v)}'; continue
            if k == 'on_conflict': oc = ','.join(c for c in v.split(',') if re.match(r'^[a-z_]+$', c)); continue
            if not re.match(r'^[a-z_]+$', k): continue
            op, _, val = v.partition('.')
            p = f'p{i}'
            col = f'{table}.{k}'
            if op == 'eq': params[p] = val; where.append(f"{col} = :'{p}'")
            elif op in ('gt', 'gte', 'lt'): params[p] = val; where.append(f"{col} {'>' if op == 'gt' else '>=' if op == 'gte' else '<'} :'{p}'")
            elif op == 'like': params[p] = val.replace('*', '%'); where.append(f"{col} like :'{p}'")
            elif op == 'in':
                items = [x.strip().strip('"') for x in val.strip('()').split(',') if x.strip()]
                if not items: where.append('false')
                else:
                    names = []
                    for j, it in enumerate(items): params[f'{p}_{j}'] = it; names.append(f":'{p}_{j}'")
                    where.append(f"{col} in ({', '.join(names)})")
            elif op == 'is' and val == 'null': where.append(f'{col} is null')
        w = (' where ' + ' and '.join(where)) if where else ''
        if method == 'GET':
            return json.loads(self.sql(f"select coalesce(json_agg(t), '[]') from (select {sel} from {table}{w}{order}{limit}) t;", params=params, claims=claims, role=role))
        if method == 'DELETE':
            self.sql(f'delete from {table}{w};', params=params, claims=claims, role=role); return None
        rows = body if isinstance(body, list) else [body]; cols = list(rows[0].keys())
        if not all(re.match(r'^[a-z_]+$', c) for c in cols): raise PgError('42601', 'bad column')
        params['body'] = json.dumps(rows)
        if method == 'PATCH':
            params['one'] = json.dumps(rows[0]); sets = ', '.join(f'{c} = r.{c}' for c in cols)
            return json.loads(self.sql(f"select coalesce(json_agg(t), '[]') from (update {table} set {sets} from json_populate_record(null::{table}, :'one') r{w} returning {table}.*) t;", params=params, claims=claims, role=role))
        clist = ', '.join(cols)
        conflict = f" on conflict ({oc}) do update set {', '.join(f'{c} = excluded.{c}' for c in cols if c not in oc.split(','))}" if oc else ''
        return json.loads(self.sql(f"with ins as (insert into {table} ({clist}) select {clist} from json_populate_recordset(null::{table}, :'body'){conflict} returning *) select coalesce(json_agg(ins), '[]') from ins;", params=params, claims=claims, role=role))

    def _handler(self):
        sb = self
        class H(BaseHTTPRequestHandler):
            def log_message(self, *a): pass
            def _send(self, status, body=None):
                self.send_response(status)
                for k, v in {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'Content-Type': 'application/json'}.items(): self.send_header(k, v)
                data = b'' if body is None else json.dumps(body).encode()
                self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
            def do_OPTIONS(self): self._send(204)
            def _claims(self):
                a = self.headers.get('Authorization') or ''
                if not a.startswith('Bearer '): return None
                with sb.lock: t = sb.tokens.get(a[7:])
                if not t: return 'bad'
                return {'sub': t[0], 'email': t[1], 'role': 'authenticated'}
            def _body(self):
                n = int(self.headers.get('Content-Length') or 0); raw = self.rfile.read(n) if n else b''
                return json.loads(raw) if raw else None
            def _go(self, method):
                u = urlparse(self.path); path = u.path; q = parse_qsl(u.query, keep_blank_values=True); body = self._body() if method in ('POST', 'PATCH', 'PUT') else None
                sb.calls.append((method, path))
                try:
                    if path.startswith('/auth/v1/'):
                        return self._auth(path, dict(q), body or {})
                    claims = self._claims()
                    if claims == 'bad': return self._send(401, {'message': 'JWT expired'})
                    out = sb.rest(method, path, q, body, claims)
                    if method == 'DELETE': return self._send(204)
                    self._send(201 if method == 'POST' and not path.startswith('/rest/v1/rpc/') else 200, out)
                except PgError as e:
                    st = 403 if e.code == '42501' or 'row-level security' in e.msg or 'permission denied' in e.msg else 404 if e.code == '404' else 400
                    self._send(st, {'message': e.msg, 'code': e.code})
            def _auth(self, path, q, b):
                if path == '/auth/v1/signup':
                    em = (b.get('email') or '').strip().lower()
                    if not em or not b.get('password'): return self._send(400, {'msg': 'Email and password are required'})
                    if len(b['password']) < 6: return self._send(422, {'msg': 'Password should be at least 6 characters.'})
                    if sb.sql("select count(*) from auth.users where email = :'e';", params={'e': em}).strip() != '0': return self._send(422, {'msg': 'User already registered'})
                    uid = sb.user(em, b['password']); return self._send(200, sb.session_for(uid, em))
                if path == '/auth/v1/token':
                    if q.get('grant_type') == 'password':
                        em = (b.get('email') or '').strip().lower()
                        row = sb.sql("select id || '|' || coalesce(encrypted_password, '') from auth.users where email = :'e';", params={'e': em}).strip()
                        if not row or row.split('|', 1)[1] != (b.get('password') or ''): return self._send(400, {'error': 'invalid_grant', 'error_description': 'Invalid login credentials'})
                        return self._send(200, sb.session_for(row.split('|')[0], em))
                    if q.get('grant_type') == 'refresh_token':
                        with sb.lock: t = sb.tokens.get(b.get('refresh_token') or '')
                        if not t: return self._send(400, {'error_description': 'Invalid Refresh Token'})
                        return self._send(200, sb.session_for(*t))
                if path == '/auth/v1/recover': return self._send(200, {})
                if path == '/auth/v1/logout': return self._send(204)
                if path == '/auth/v1/user':
                    c = self._claims()
                    if not c or c == 'bad': return self._send(401, {'msg': 'not signed in'})
                    if self.command == 'PUT' and b.get('password'):
                        sb.sql("update auth.users set encrypted_password = :'p' where id = :'i'::uuid;", params={'p': b['password'], 'i': c['sub']})
                    return self._send(200, {'id': c['sub'], 'email': c['email']})
                return self._send(404, {'msg': 'unknown'})
            def do_GET(self): self._go('GET')
            def do_POST(self): self._go('POST')
            def do_PATCH(self): self._go('PATCH')
            def do_DELETE(self): self._go('DELETE')
            def do_PUT(self): self._go('PUT')
        return H

class PgError(Exception):
    def __init__(self, code, msg): super().__init__(msg); self.code = code; self.msg = msg

# ---------- a tiny client for API-level tests ----------
import urllib.request, urllib.error, urllib.parse
class Api:
    def __init__(self, sb, session=None): self.sb = sb; self.s = session
    def call(self, method, path, body=None):
        path = urllib.parse.quote(path, safe='/?=&,.*:()-_')
        req = urllib.request.Request(self.sb.url + path, method=method, data=None if body is None else json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'apikey': 'anon', **({'Authorization': 'Bearer ' + self.s['access_token']} if self.s else {}), 'Prefer': 'resolution=merge-duplicates,return=representation'})
        try:
            with urllib.request.urlopen(req) as r: raw = r.read(); return r.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raw = e.read(); return e.code, (json.loads(raw) if raw else None)
    def rpc(self, fn, **args): return self.call('POST', f'/rest/v1/rpc/{fn}', args)
    def get(self, path): return self.call('GET', path)
