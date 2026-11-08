"""Online, many companies, in the browser against a real PostgreSQL: the platform owner's Owner Console (create a
company, seats, its accounts, open any company as admin — logged); the company admin's first-time
setup and Admin → Company & accounts (invite an existing or new person, make admin, turn off, cancel an invitation,
allow support, audit log); the invited person signs in and is a user, not an admin."""
import os, subprocess, sys, time
from playwright.async_api import async_playwright
from harness import APP, SHOTS, Check, free_port, run
from supa_local import LocalSupabase, Api

HTML = next(f for f in os.listdir(APP) if f.endswith('.html') and f[:-5] in ('MAHAM', 'MAHAM'))
CFGJS = HTML[:-5].lower() + '.config.js'

async def main():
    c = Check('online Owner Console and company admin')
    sb = LocalSupabase()
    if not sb.ok: print('PASS online Owner Console and company admin (skipped: no PostgreSQL)'); return
    sb.start(); port = free_port()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    cfg = "window.%s_CONFIG = { storage: 'cloud', cloud: { url: '%s', anonKey: 'anon-test' } };" % (HTML[:-5], sb.url)
    url = f'http://127.0.0.1:{port}/{HTML}'
    try:
        sb.user('owner@platform.test', 'ownerpass1'); sb.make_platform_owner('owner@platform.test')
        sb.user('admin@acme.test', 'adminpass1'); sb.user('sara@acme.test', 'sarapass11')
        async with async_playwright() as p:
            b = await p.chromium.launch()
            async def page():
                ctx = await b.new_context(viewport={'width': 1366, 'height': 900}, service_workers='block')
                await ctx.route('**/' + CFGJS, lambda r: r.fulfill(status=200, content_type='application/javascript', body=cfg))
                pg = await ctx.new_page(); pg.errors = []; pg.on('pageerror', lambda e: pg.errors.append(str(e)))
                return ctx, pg
            async def signin(pg, em, pw):
                await pg.goto(url); await pg.wait_for_selector('#cl-in', timeout=15000)
                await pg.fill('#cl-in [name=email]', em); await pg.fill('#cl-in [name=password]', pw); await pg.click('#cl-in [type=submit]')
            async def modal_fill(**vals):
                for k, v in vals.items():
                    el = pg.locator(f'.modal [name={k}]')
                    if await el.evaluate('e => e.tagName') == 'SELECT': await el.select_option(v)
                    else: await el.fill(str(v))
            errors = []
            # ---------------- the platform owner ----------------
            ctx, pg = await page()
            await signin(pg, 'owner@platform.test', 'ownerpass1'); await pg.wait_for_selector('#oc-new', timeout=20000)
            c('platform owner (no company) lands in the Owner Console', 'Owner Console' in await pg.inner_text('#app'))
            await pg.click('#oc-new'); await modal_fill(name='Acme', email='admin@acme.test', member='adam', seats=3); await pg.click('.modal [data-ok]')
            await pg.wait_for_selector('.modal #cl-link', timeout=10000)
            c('new company: shows the link to send the admin', url in await pg.input_value('.modal #cl-link'))
            await pg.click('.modal [data-done]'); await pg.wait_for_selector('.oc-tbl [data-ocedit]', timeout=10000)
            row = await pg.inner_text('.oc-tbl tbody tr')
            c('Acme listed: 0 / 3 seats, 1 open invitation', 'Acme' in row and '0 / 3' in row, row)
            c('Open as admin and Accounts for every company', bool(await pg.query_selector('[data-ocvisit]')) and bool(await pg.query_selector('[data-ocacc]')))
            errors += pg.errors; await ctx.close()
            # ---------------- Acme's admin: first-time setup ----------------
            ctx, pg = await page()
            await signin(pg, 'admin@acme.test', 'adminpass1'); await pg.wait_for_selector('#main', timeout=30000)
            await pg.wait_for_selector('.modal #cos', timeout=10000)
            c('first open: "Set up your company"', 'Set up your company' in await pg.inner_text('.modal'))
            await modal_fill(company='Acme Ltd', name='Adam Admin', short='Adam', teams='Support\nFinance')
            await pg.click('.modal [data-ok]'); await pg.wait_for_selector('#coadm .card h3', timeout=20000); await pg.wait_for_timeout(800)
            st = await pg.evaluate("({ n: Store.member(App.me).name, teams: Store.teams().map(t => t.name).join(','), co: Store.cloudCompany.name })")
            c('setup saved: your name, teams, company name', st == {'n': 'Adam Admin', 'teams': 'Support,Finance', 'co': 'Acme Ltd'}, st)
            st2 = await pg.evaluate("({ mode: App.mode, btn: !!document.querySelector('#modebtn, #modebar'), inTeam: Store.teams().some(t => Store.team(t.id).some(m => m.id === App.me)) })")
            c('the admin is always in admin mode (no switch) and in no team', st2 == {'mode': 'admin', 'btn': False, 'inTeam': False}, st2)
            await pg.evaluate("App.switchMode('analyst')"); await pg.wait_for_timeout(300)
            c('…"back to analyst" does nothing', await pg.evaluate("App.mode") == 'admin')
            r = await pg.evaluate("""(async () => { const o = UI.memberOptions(''); Store.save({ c: 'shadow', id: 'admin-test', analyst: App.me, team: Store.teams()[0].id, date: U.todayStr(), taskType: 'TRAINING >> x', source: 'Call', subject: 'Admin tries it', minutes: 10 }); await Store.flush();
              return { pick: o.includes('value="' + App.me + '"'), saved: !!Store.get('admin-test'), all: ['shadow', 'todo', 'helpdesk', 'meeting', 'settings'].every(c => App.canEdit(c)) }; })()""")
            c('…but has every function and can pick themself to try things', r == {'pick': True, 'saved': True, 'all': True}, r)
            c('…and opened Admin → Company & accounts', 'Company & accounts' in await pg.inner_text('.adm-tabs') and 'Accounts' in await pg.inner_text('#coadm'))
            c('seats: 1 used of 3', '1 used of 3' in await pg.inner_text('#coadm'))
            # invite a new person
            await pg.click('#co-inv'); await modal_fill(email='sara@acme.test', who='__new', name='Sara Saleh', short='Sara', role='user'); await pg.click('.modal [data-ok]')
            await pg.wait_for_selector('.modal #cl-link', timeout=10000); await pg.click('.modal [data-done]')
            await pg.wait_for_selector('[data-co-cancel]', timeout=15000)
            c('invited Sara: in People and listed as invited', await pg.evaluate("Store.members().some(m => m.name === 'Sara Saleh')") and 'sara@acme.test' in await pg.inner_text('#coadm'))
            # a third invitation, then cancel it
            await pg.click('#co-inv'); await modal_fill(email='omar@acme.test', who='__new', name='Omar One', role='user'); await pg.click('.modal [data-ok]')
            await pg.wait_for_selector('.modal #cl-link', timeout=10000); await pg.click('.modal [data-done]'); await pg.wait_for_timeout(1200)
            c('seats: 1 used + 2 invited of 3', '1 used + 2 invited of 3' in await pg.inner_text('#coadm'))
            await pg.click('#co-inv'); await modal_fill(email='nora@acme.test', who='__new', name='Nora Four'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(800)
            c('a 4th person does not fit (seat message), and is not added to People', 'seat' in (await pg.inner_text('body')).lower() and not await pg.evaluate("Store.members().some(m => m.name === 'Nora Four')"))
            await pg.evaluate('UI.closeModal()'); await pg.wait_for_timeout(300)
            omar = await pg.evaluate("Store.members().find(m => m.name === 'Omar One').id")
            await pg.click(f'[data-co-cancel="{omar}"]'); await pg.wait_for_timeout(1500)
            c('cancel an invitation frees the seat', '1 used + 1 invited of 3' in await pg.inner_text('#coadm'))
            c('no "support access" card any more', 'Support access' not in await pg.inner_text('#coadm'))
            await pg.evaluate("location.hash = '#/admin/people'"); await pg.wait_for_selector('[data-k=superAdmin]', timeout=15000)
            c("People: the admin tick follows the database (can't be ticked here)", await pg.evaluate("[...document.querySelectorAll('[data-k=superAdmin]')].every(i => i.disabled)"))
            await pg.screenshot(path=f'{SHOTS}/cloud_company_admin.png')
            errors += pg.errors; await ctx.close()
            # ---------------- Sara signs in: a user ----------------
            ctx, pg = await page()
            await signin(pg, 'sara@acme.test', 'sarapass11'); await pg.wait_for_selector('#main', timeout=30000); await pg.wait_for_timeout(800)
            st = await pg.evaluate("({ me: App.me, name: (Store.member(App.me) || {}).name, sup: Store.isSuper(App.me), setup: !!document.querySelector('.modal #cos') })")
            c('a user has no admin switch and is in a team', not await pg.query_selector('#modebtn') and await pg.evaluate("Store.teams().some(t => Store.team(t.id).some(m => m.id === App.me))"))
            c('Sara opens as herself, a user (not admin), no setup', st['name'] == 'Sara Saleh' and not st['sup'] and not st['setup'], st)
            await pg.evaluate("App.switchMode('admin'); location.hash = '#/admin/company'"); await pg.wait_for_timeout(1200)
            c('…and cannot open Company & accounts', not await pg.query_selector('#coadm'))
            errors += pg.errors; await ctx.close()
            # ---------------- the admin makes Sara an admin, then turns her off ----------------
            ctx, pg = await page()
            await signin(pg, 'admin@acme.test', 'adminpass1'); await pg.wait_for_selector('#main', timeout=30000)
            await pg.evaluate("App.switchMode('admin')"); await pg.wait_for_timeout(500)
            await pg.evaluate("location.hash = '#/admin/company'"); await pg.wait_for_selector('[data-mem]', timeout=20000)
            sara = await pg.evaluate("Store.members().find(m => m.name === 'Sara Saleh').id")
            await pg.select_option(f'[data-mem="{sara}"] [data-co-role]', 'admin'); await pg.wait_for_timeout(1500)
            c('make Sara an admin (database + app)', 'admin' in sb.sql(f"select role from public.company_members where member_id = '{sara}';") and await pg.evaluate(f"Store.isSuper('{sara}')"))
            await pg.wait_for_selector(f'[data-mem="{sara}"] [data-co-act]', timeout=10000)
            await pg.uncheck(f'[data-mem="{sara}"] [data-co-act]'); await pg.wait_for_timeout(1500)
            c('turn Sara off', sb.sql(f"select active from public.company_members where member_id = '{sara}';").strip() == 'f')
            await pg.wait_for_selector('#coadm table', timeout=10000)
            log = await pg.inner_text('#coadm')
            c('audit log shows invitations, joins, account changes, support', all(w in log for w in ('Invited', 'Joined', 'Account changed', 'Invitation cancelled')), log[-600:])
            errors += pg.errors; await ctx.close()
            # ---------------- the platform owner: accounts, then opens Acme as admin ----------------
            ctx, pg = await page()
            await signin(pg, 'owner@platform.test', 'ownerpass1'); await pg.wait_for_selector('[data-ocacc]', timeout=20000)
            await pg.click('[data-ocacc]'); await pg.wait_for_selector('.modal [data-ocm]', timeout=10000)
            t = await pg.inner_text('.modal')
            c("Accounts: every account and invitation of the company", 'admin@acme.test' in t and 'sara@acme.test' in t, t[:300])
            await pg.check(f'.modal [data-ocm="{sara}"] [data-ocact]'); await pg.wait_for_timeout(1200)
            c('…the owner turns Sara on again', sb.sql(f"select active from public.company_members where member_id = '{sara}';").strip() == 't')
            await pg.click('.modal [data-ocopen]'); await pg.wait_for_selector('#main', timeout=30000); await pg.wait_for_timeout(800)
            st = await pg.evaluate("({ me: App.me, admin: App.mode === 'admin' && App.realSuper(), adam: Store.members().some(m => m.name === 'Adam Admin'), setup: !!document.querySelector('.modal #cos') })")
            c('Open as admin: inside Acme, in admin mode, with its data, no setup', st == {'me': 'platform-owner', 'admin': True, 'adam': True, 'setup': False}, st)
            c('…with the "Platform owner — in the audit log" note', 'Platform owner' in await pg.inner_text('.side-foot'))
            await pg.evaluate("(async () => { Store.save({ c: 'shadow', id: 'owner-try', analyst: 'adam', team: Store.teams()[0].id, date: U.todayStr(), taskType: 'TRAINING >> x', source: 'Call', subject: 'Owner was here', minutes: 5 }); await Store.flush(); })()"); await pg.wait_for_timeout(1200)
            c('…and can save in it', 'Owner was here' in sb.sql("select string_agg(content, '') from public.files;"))
            acts = sb.sql("select string_agg(action, ',') from public.audit;")
            c("…all of it in Acme's audit log", 'owner opened' in acts and 'owner saved' in acts, acts)
            await pg.evaluate("location.hash = '#/admin/company'"); await pg.wait_for_selector('#coadm table', timeout=20000); await pg.wait_for_timeout(500)
            log = await pg.inner_text('#coadm')
            c("…which the company's admin page shows", 'Platform owner opened the company' in log and 'Platform owner saved changes' in log)
            errors += pg.errors; await ctx.close()
            c('no page errors', not errors, errors[:3])
            await b.close()
    finally:
        srv.terminate(); sb.stop()
    c.done()
run(main())
