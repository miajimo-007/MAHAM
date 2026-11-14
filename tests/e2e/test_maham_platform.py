"""MAHAM platform: Hijri dates next to dates (each person's choice), Arabic (right to left, menu translated), CSV import
(contacts with new companies; Jira tasks into a project with status and assignee), goals with a live key result,
Microsoft / Google sign-in buttons only when the company lists them."""
import os, tempfile
from harness import app_session, Check, run


def csv(text):
    f = tempfile.NamedTemporaryFile('w', suffix='.csv', delete=False, encoding='utf-8'); f.write(text); f.close(); return f.name


async def main():
    c = Check('MAHAM platform')
    async with app_session() as s:
        pg = s.page; J = s.js
        await pg.set_viewport_size({'width': 1366, 'height': 900})
        await s.sign_in_as('adam', 'admin')
        # ---------- Hijri
        plain = await J("U.fmtDate('2026-11-14')")
        await J("PLAT.setPref('hijri', '1')")
        hj = await J("U.fmtDate('2026-11-14')")
        c('Hijri dates: the Umm al-Qura date next to the date', hj.startswith(plain) and '1448' in hj and 'AH' in hj, hj)
        await J("PLAT.setPref('hijri', '')")
        # ---------- Arabic
        await J("PLAT.setPref('lang', 'ar')"); await pg.reload(); await pg.wait_for_selector('#main', timeout=20000); await s.sign_in_as('adam', 'admin'); await pg.wait_for_timeout(400)
        nav = await pg.inner_text('nav')
        c('Arabic: right to left, and the menu in Arabic', await J("document.documentElement.dir") == 'rtl' and 'المشاريع' in nav, nav[:200])
        await J("PLAT.setPref('lang', 'en')"); await pg.reload(); await pg.wait_for_selector('#main', timeout=20000); await s.sign_in_as('adam', 'admin')
        c('…and back to English', await J("document.documentElement.dir") == 'ltr' and 'Projects' in await pg.inner_text('nav'))
        # ---------- CSV: contacts (makes the companies too)
        await s.go('#/import', 500)
        await pg.set_input_files('#imf', csv('Name,Email,Company,Phone,Tags\nHuda Saleh,HUDA@example.com,Gulf Clinics,0501,vip;lead\nOmar Ali,omar@example.com,Gulf Clinics,0502,lead\n'))
        await pg.wait_for_selector('#imgo'); await pg.click('#imgo'); await pg.wait_for_timeout(400)
        cons = await J("CRM.all('contact').map(x => [x.name, x.email, CRM.name(x.account), x.tags.length])")
        c('contacts imported, matched by their headers, with one new company', sorted(cons) == [['Huda Saleh', 'huda@example.com', 'Gulf Clinics', 2], ['Omar Ali', 'omar@example.com', 'Gulf Clinics', 1]] and await J("CRM.all('account').length") == 1, cons)
        # ---------- CSV: Jira issues into a project
        await J("Store.save({ c: 'project', id: 'pj-imp', name: 'Migration', team: Store.member('nora').team, manager: 'apps-mgr', members: ['nora'], status: 'In Progress' })")
        await s.go('#/todo', 200); await s.go('#/import', 500); await pg.select_option('#imt', 'ptask'); await pg.select_option('#imp', 'pj-imp')
        await pg.set_input_files('#imf', csv('Issue key,Summary,Status,Assignee,Due date,Story Points\nOLD-1,Move the printers,Done,Nora Al-Ghamdi,2026-12-01,3\nOLD-2,Train the ward,To Do,Unknown Person,,1\n'))
        await pg.wait_for_selector('#imgo'); await pg.click('#imgo'); await pg.wait_for_timeout(400)
        t = await J("Store.all('ptask', '*').filter(x => x.project === 'pj-imp').map(x => [x.title, x.status, x.assignee, x.due, x.points])")
        cols = await J("Scrum.columns(Store.get('pj-imp'))")
        c('Jira issues become project tasks: done → the last column, the assignee found by name', sorted(t) == sorted([['Move the printers', cols[-1], 'nora', '2026-12-01', 3], ['Train the ward', cols[0], '', '', 1]]), (t, cols))
        # ---------- goals with a live key result
        await J("Store.saveMany([1, 2, 3].map(i => ({ c: 'ticket', id: 'g-t' + i, no: 100 + i, subject: 'T' + i, status: 'Resolved', resolvedAt: Date.now(), created: Date.now() })))")
        await J("Store.save({ c: 'okr', id: 'okr-1', title: 'Faster support', owner: 'adam', period: '2026', krs: [{ id: 'k1', title: 'Resolve 6 tickets', link: 'tickets-resolved', target: 6 }, { id: 'k2', title: 'Write 4 articles', link: '', target: 4, current: 1 }] })")
        g = await s.go('#/goals', 500)
        c('a goal: the live key result (3 of 6 = 50%) and the hand one (1 of 4 = 25%) → 38%', '3 of 6' in g and '1 of 4' in g and '38%' in g, g[:300])
        # ---------- Microsoft / Google buttons only when listed
        await J("window.MAHAM_CONFIG = Object.assign(window.MAHAM_CONFIG || {}, { cloud: { url: 'https://x.supabase.co', anonKey: 'k', sso: ['azure'] } }); MahamStorage.signInScreen()")
        c('"Sign in with Microsoft" shows when the company lists it', await J("!!document.querySelector('[data-sso=\"azure\"]') && !document.querySelector('[data-sso=\"google\"]')"))
    c.done(s)

run(main())
