"""Online storage, against a stand-in for Supabase (no internet): sign in, the app opens as the linked person,
saving writes that person's file to the database, a reload keeps the session, sign-out returns to the sign-in page."""
import json, os, subprocess, sys, time
from urllib.parse import urlparse, parse_qs, unquote
from playwright.async_api import async_playwright
from harness import APP, SHOTS, Check, free_port, run

API = 'https://demo.supabase.test'
CONFIG = "window.MAHAM_CONFIG = { storage: 'cloud', cloud: { url: '%s', anonKey: 'anon-test', companyName: 'Demo Co' } };" % API

class FakeSupabase:
    def __init__(self): self.files = {}; self.calls = []; self.t = int(time.time() * 1000)
    def now(self): self.t = max(self.t + 1, int(time.time() * 1000)); return time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(self.t / 1000)) + '.000+00:00'
    async def handle(self, route, req):
        cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'}
        if req.method == 'OPTIONS': return await route.fulfill(status=204, headers=cors)
        u = urlparse(req.url); q = {k: v[0] for k, v in parse_qs(u.query).items()}; self.calls.append((req.method, u.path))
        js = lambda body, status=200: route.fulfill(status=status, headers=dict(cors, **{'Content-Type': 'application/json'}), body=json.dumps(body))
        if u.path == '/auth/v1/token':
            body = json.loads(req.post_data or '{}')
            if body.get('password') != 'secret': return await js({'error_description': 'Invalid login credentials'}, 400)
            return await js({'access_token': 'tok', 'refresh_token': 'ref', 'user': {'id': 'u-1', 'email': body.get('email')}})
        if (req.headers.get('authorization') or '') != 'Bearer tok': return await js({'message': 'JWT invalid'}, 401)
        if u.path == '/rest/v1/company_members': return await js([{'company_id': 'c-1', 'member_id': 'adam', 'is_owner': True}])
        if u.path == '/rest/v1/files':
            path = q.get('path', '')
            if req.method == 'POST':
                b = json.loads(req.post_data); row = {'path': b['path'], 'content': b['content'], 'size': len(b['content'].encode()), 'updated_at': self.now()}
                self.files[b['path']] = row; return await js([row], 201)
            if req.method == 'DELETE': self.files.pop(unquote(path[3:]), None); return await route.fulfill(status=204, headers=cors)
            if path.startswith('eq.'): rows = [r for k, r in self.files.items() if k == path[3:]]
            elif path.startswith('like.'): pre = path[5:].rstrip('*').replace('\\_', '_').replace('\\%', '%'); rows = [r for k, r in self.files.items() if k.startswith(pre)]
            else: rows = list(self.files.values())
            cols = q.get('select', '').split(',')
            return await js([{k: r[k] for k in cols if k in r} for r in rows])
        return await js({'message': 'unknown'}, 404)

async def main():
    c = Check('online storage (mock)')
    port = free_port(); fake = FakeSupabase()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1280, 'height': 860}, service_workers='block')   # the routed settings file must reach the page
            await ctx.route('**/maham.config.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=CONFIG))
            await ctx.route(API + '/**', fake.handle)
            pg = await ctx.new_page(); errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
            await pg.goto(f'http://127.0.0.1:{port}/MAHAM.html'); await pg.wait_for_selector('#cl-in', timeout=15000)
            c('sign-in page shown', 'Sign in' in await pg.inner_text('#app'))
            await pg.fill('#cl-in [name=email]', 'owner@demo.co'); await pg.fill('#cl-in [name=password]', 'wrong'); await pg.click('#cl-in [type=submit]')
            await pg.wait_for_timeout(500); c('wrong password refused', 'Invalid login credentials' in await pg.inner_text('#app'))
            await pg.fill('#cl-in [name=email]', 'owner@demo.co'); await pg.fill('#cl-in [name=password]', 'secret'); await pg.click('#cl-in [type=submit]')
            await pg.wait_for_selector('#main', timeout=30000); await pg.wait_for_timeout(600)
            c('opens as the linked person (adam)', await pg.evaluate("App.me") == 'adam')
            c('storage is online', await pg.evaluate("Store.storageMode") == 'cloud')
            await pg.evaluate("(async () => { Store.save({ c: 'shadow', id: 'cloud-td', analyst: 'adam', team: 'apps', date: U.todayStr(), taskType: 'TRAINING >> x', source: 'Call', subject: 'Saved online', minutes: 45 }); await Store.flush(); })()")
            await pg.wait_for_timeout(1200)
            mine = fake.files.get('MAHAM Data/users/adam.json')
            c("saved into adam's file in the database", bool(mine) and 'Saved online' in mine['content'], list(fake.files)[:5])
            await pg.reload(); await pg.wait_for_selector('#main', timeout=15000); await pg.wait_for_timeout(600)
            c('reload: still signed in, data loaded from the database', await pg.evaluate("App.me === 'adam' && !!Store.get('cloud-td')"))
            await pg.screenshot(path=f'{SHOTS}/cloud_mock.png')
            await pg.evaluate("App.chooseMe(true)"); await pg.wait_for_timeout(300)
            await pg.click('.modal [data-yes]'); await pg.wait_for_selector('#cl-in', timeout=15000)
            c('switch person = sign out → sign-in page', True)
            c('no page errors', not errors, errors[:3])
            await b.close()
    finally: srv.terminate()
    c.done()
run(main())
