"""Online storage with many companies, in the browser, against a real PostgreSQL running supabase/schema.sql:
sign in / wrong password; an account without an invitation sees "no company yet"; an invited admin creates an account
and the app opens as that person with the database's admin; saving goes to their own file in the database; a reload
keeps the session; someone in two companies chooses one; forgot password; a reset link sets a new password; sign out."""
import json, os, subprocess, sys, time
from playwright.async_api import async_playwright
from harness import APP, SHOTS, Check, free_port, run
from supa_local import LocalSupabase, Api, SCHEMA

HTML = next(f for f in os.listdir(APP) if f.endswith('.html') and f[:-5] in ('MAHAM', 'MAHAM'))
CFGJS = HTML[:-5].lower() + '.config.js'
D = HTML[:-5] + ' Data'

async def main():
    c = Check('online sign-in, many companies')
    sb = LocalSupabase()
    if not sb.ok: print('SKIP online sign-in: PostgreSQL is not installed here'); print('PASS online sign-in, many companies (skipped)'); return
    sb.start(); port = free_port()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    cfg = "window.%s_CONFIG = { storage: 'cloud', cloud: { url: '%s', anonKey: 'anon-test' } };" % (HTML[:-5], sb.url)
    try:
        P = Api(sb, sb.as_user('owner@platform.test')); sb.make_platform_owner('owner@platform.test')
        st, acme = P.rpc('owner_create_company', p_name='Acme', p_admin_email='admin@acme.test', p_admin_member='adam', p_seats=5)
        async with async_playwright() as p:
            b = await p.chromium.launch()
            async def page():
                ctx = await b.new_context(viewport={'width': 1280, 'height': 860}, service_workers='block')
                await ctx.route('**/' + CFGJS, lambda r: r.fulfill(status=200, content_type='application/javascript', body=cfg))
                pg = await ctx.new_page(); pg.errors = []; pg.on('pageerror', lambda e: pg.errors.append(str(e)))
                return ctx, pg
            async def text(pg): return await pg.inner_text('#app')
            async def form(pg, sel, **vals):
                for k, v in vals.items(): await pg.fill(f'{sel} [name={k}]', v)
                await pg.click(f'{sel} [type=submit]')
            url = f'http://127.0.0.1:{port}/{HTML}'
            ctx, pg = await page()
            await pg.goto(url); await pg.wait_for_selector('#cl-in', timeout=15000)
            t0 = await text(pg); c('sign-in page with Sign in / Create account / Forgot password', all(t in t0 for t in ('Sign in', 'Create account', 'Forgot password')))
            c('email and password fields are typed for the browser', await pg.evaluate("[document.querySelector('#cl-in [name=email]').type, document.querySelector('#cl-in [name=password]').type].join()") == 'email,password')
            await form(pg, '#cl-in', email='admin@acme.test', password='wrong'); await pg.wait_for_timeout(500)
            c('wrong password refused', 'Invalid login credentials' in await text(pg))
            # an account nobody invited
            await pg.click('[data-cltab=new]'); await form(pg, '#cl-up', email='stranger@nowhere.test', password='longpassword', password2='longpassword')
            await pg.wait_for_selector('#cl-out', timeout=15000)
            t0 = await text(pg); c('an account without an invitation: "No company yet", and nothing opens', 'No company yet' in t0 and 'stranger@nowhere.test' in t0 and not await pg.query_selector('#main'), t0[:200])
            await pg.click('#cl-out'); await pg.wait_for_selector('#cl-in', timeout=15000)
            # the invited admin creates an account
            await pg.click('[data-cltab=new]'); await form(pg, '#cl-up', email='admin@acme.test', password='short', password2='short'); await pg.wait_for_timeout(300)
            c('a short password is refused', 'at least 8' in await text(pg))
            await form(pg, '#cl-up', email='admin@acme.test', password='adminpass1', password2='adminpass2'); await pg.wait_for_timeout(300)
            c('two different passwords are refused', 'not the same' in await text(pg))
            await form(pg, '#cl-up', email='Admin@Acme.test', password='adminpass1', password2='adminpass1')
            await pg.wait_for_selector('#main', timeout=30000); await pg.wait_for_timeout(800)
            c('the invited admin opens Acme as "adam"', await pg.evaluate("App.me") == 'adam' and await pg.evaluate("Store.storageMode") == 'cloud')
            c("…and is the company's admin (from the database)", await pg.evaluate("!!(Store.members().find(m => m.id === 'adam') || {}).superAdmin && Store.members().length === 1"))
            c('the company name shows under your name', 'Acme' in await pg.inner_text('.side-foot'))
            await pg.evaluate("(async () => { Store.save({ c: 'shadow', id: 'cloud-td', analyst: 'adam', team: 'apps', date: U.todayStr(), taskType: 'TRAINING >> x', source: 'Call', subject: 'Saved online', minutes: 45 }); await Store.flush(); })()")
            await pg.wait_for_timeout(1500)
            row = sb.sql(f"select content from public.files where company_id = :'c'::uuid and path = :'p';", params={'c': acme, 'p': f'{D}/users/adam.json'})
            c("saved into adam's own file, in Acme", 'Saved online' in row, row[:120])
            await pg.reload(); await pg.wait_for_selector('#main', timeout=20000); await pg.wait_for_timeout(800)
            c('reload: still signed in, data read back from the database', await pg.evaluate("App.me === 'adam' && !!Store.get('cloud-td')"))
            await pg.screenshot(path=f'{SHOTS}/cloud_signin.png')
            # a second company for the same person → a chooser
            P.rpc('owner_create_company', p_name='Beta', p_admin_email='admin@acme.test', p_admin_member='boss')
            await pg.evaluate("LS.set('maham.cloud.company', ''); LS.set('maham.cloud.company', '')"); await pg.reload()
            await pg.wait_for_selector('[data-co]', timeout=20000)
            names = await pg.inner_text('#app')
            c('in two companies: choose one', 'Choose a company' in names and 'Acme' in names and 'Beta' in names)
            await pg.click('[data-co]:has-text("Beta")'); await pg.wait_for_selector('#main', timeout=30000); await pg.wait_for_timeout(800)
            c("Beta opens as 'boss' with none of Acme's data", await pg.evaluate("App.me === 'boss' && !Store.get('cloud-td')"))
            c('…and offers to switch company', bool(await pg.query_selector('#cl-switch')))
            # sign out
            await pg.evaluate("App.chooseMe()"); await pg.wait_for_timeout(300); await pg.click('.modal [data-yes]')
            await pg.wait_for_selector('#cl-in', timeout=15000); c('sign out → sign-in page', True)
            # forgot password, then the emailed link
            await pg.click('[data-cltab=forgot]'); await form(pg, '#cl-fg', email='admin@acme.test'); await pg.wait_for_selector('#cl-in', timeout=10000)
            c('forgot password: "a link is on its way"', 'on its way' in await text(pg))
            tok = sb.session_for(sb.sql("select id from auth.users where email = 'admin@acme.test';").strip(), 'admin@acme.test')['access_token']
            await pg.goto('about:blank'); await pg.goto(url + f'#access_token={tok}&refresh_token=x&type=recovery'); await pg.wait_for_selector('#cl-np', timeout=15000)
            c('the reset link asks for a new password', 'new password' in (await text(pg)).lower() and 'access_token' not in pg.url)
            await form(pg, '#cl-np', password='brandnew123', password2='brandnew123'); await pg.wait_for_selector('#main, [data-co]', timeout=30000)
            c('…then opens the app', True)
            st, _ = Api(sb).call('POST', '/auth/v1/token?grant_type=password', {'email': 'admin@acme.test', 'password': 'brandnew123'})
            c('…and the new password works', st == 200)
            errs = pg.errors; await ctx.close()
            c('no page errors', not errs, errs[:3])
            await b.close()
    finally:
        srv.terminate(); sb.stop()
    c.done()
run(main())
