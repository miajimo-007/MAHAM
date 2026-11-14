"""An online company whose database still has the OLD schema (no "records" table, no save_records — schema.sql not run
again after an update): MAHAM must keep working, saving whole person files as before, with no error for the person."""
import os, subprocess, sys, time
from playwright.async_api import async_playwright
from harness import APP, Check, free_port, run
from supa_local import LocalSupabase, Api

HTML = next(f for f in os.listdir(APP) if f.endswith('.html') and f[:-5] in ('MAHAM', 'MAHAM'))
CFGJS = HTML[:-5].lower() + '.config.js'
D = HTML[:-5] + ' Data'


async def main():
    c = Check('online, database not updated yet')
    sb = LocalSupabase()
    if not sb.ok: print('PASS online, database not updated yet (skipped: no PostgreSQL)'); return
    sb.start(); port = free_port()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    cfg = "window.%s_CONFIG = { storage: 'cloud', cloud: { url: '%s', anonKey: 'anon-test' } };" % (HTML[:-5], sb.url)
    try:
        # the database as an older MAHAM left it: no record store
        sb.sql("drop function if exists public.save_records(uuid, jsonb); drop function if exists public.replace_file(uuid, text, jsonb); drop table if exists public.records cascade;")
        P = Api(sb, sb.as_user('owner@platform.test')); sb.make_platform_owner('owner@platform.test')
        st, acme = P.rpc('owner_create_company', p_name='Acme', p_admin_email='admin@acme.test', p_admin_member='adam', p_seats=5)
        async with async_playwright() as p:
            b = await p.chromium.launch()
            ctx = await b.new_context(viewport={'width': 1280, 'height': 860}, service_workers='block'); await ctx.add_init_script("try { localStorage.setItem('bct.test.nowhatsnew', '1'); } catch (e) {}")
            await ctx.route('**/' + CFGJS, lambda r: r.fulfill(status=200, content_type='application/javascript', body=cfg))
            pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(f'http://127.0.0.1:{port}/{HTML}'); await pg.wait_for_selector('#cl-in', timeout=15000)
            await pg.click('[data-cltab=new]')
            for k, v in {'email': 'admin@acme.test', 'password': 'adminpass1', 'password2': 'adminpass1'}.items(): await pg.fill(f'#cl-up [name={k}]', v)
            await pg.click('#cl-up [type=submit]'); await pg.wait_for_selector('#main', timeout=30000); await pg.wait_for_timeout(800)
            c('the app opens on the old database', await pg.evaluate("App.me") == 'adam')
            c('…and knows the record store is not there yet', await pg.evaluate("CloudRecords.off") is True)
            await pg.evaluate("(async () => { Store.save({ c: 'shadow', id: 'old-db', analyst: 'adam', team: Store.teams()[0].id, date: U.todayStr(), taskType: 'TRAINING >> x', source: 'Call', subject: 'Saved the old way', minutes: 15 }); await Store.flush(); })()")
            await pg.wait_for_function("!Store.dirty && !Store.saving", timeout=20000)
            row = sb.sql("select content from public.files where company_id = :'c'::uuid and path = :'p';", params={'c': acme, 'p': f'{D}/users/adam.json'})
            c('saving still works: the whole file, as before', 'Saved the old way' in row, row[:120])
            c('…with no error for the person', not await pg.evaluate("Store.lastError") and not errs, (await pg.evaluate("Store.lastError"), errs[:2]))
            await pg.reload(); await pg.wait_for_selector('#main', timeout=20000); await pg.wait_for_timeout(800)
            c('after a reload the work is read back', await pg.evaluate("!!Store.get('old-db')"))
            await b.close()
    finally:
        srv.terminate(); sb.stop()
    c.done()

run(main())
