"""2026.11.13.3 — Manager Desk in three sections (Needs you · Watch · The team, one row per person) and the Analyst Desk
greeting on one slim line with the Today: buttons shown every day (on a weekend: "only if you worked")."""
import os
from harness import app_session, Check, run, SHOTS

SEED = r"""(() => { const t = U.todayStr();
  Store.saveMany([
    { c: 'todo', id: 'dk-late', task: 'Fix the discharge template', analyst: 'yousef', team: 'apps', assigned: U.addDays(t, -20), duration: 1, status: 'In Progress' },
    { c: 'todo', id: 'dk-soon', task: 'Mapping review', analyst: 'layla', team: 'apps', assigned: t, duration: 0, status: 'In Progress' },
    { c: 'quickwin', id: 'dk-qw', analyst: 'yousef', team: 'apps', date: U.addDays(t, -9), expected: U.addDays(t, -3), subject: 'Faster stock report', module: 'Pharmacy', status: 'In-Progress' },
    { c: 'attendance', id: 'att-' + t + '-nora', date: t, analyst: 'nora', status: 'OFF', leave: 'Annual leave', permHrs: 0 },
  ]); })()"""

async def main():
    c = Check('desks 2026.11.13.3')
    async with app_session() as s:
        pg = s.page
        await s.js(SEED); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        # keep "Mapping review" as given by the manager (no update from Layla)
        await s.js("(() => { const r = Store.get('dk-soon'); Store.save(Object.assign({}, r, { _by: 'apps-mgr' })); Store.db.set('dk-soon', Object.assign({}, Store.get('dk-soon'), { _by: 'apps-mgr' })); })()")
        await s.sign_in_as('apps-mgr', 'manager'); await s.go('#/home'); await s.go('#/manager', 900)
        g = await s.js("[...document.querySelectorAll('#main .desk-grp')].map(x => x.dataset.dg)")
        c('three sections in order: Needs you, Watch, The team', g == ['need', 'watch', 'team'], g)
        c('no KPI tiles and no separate Team today / Team activity boxes', await pg.locator('#main .kpi').count() == 0 and 'Team activity' not in await pg.inner_text('#main') and 'Team today' not in await pg.inner_text('#main'))
        c('the quick win to approve is under Needs you, with how long it waits', await s.js("(() => { const n = document.querySelector('.desk-grp[data-dg=need]'); return /Faster stock report/.test(n.innerText) && /waiting 9 d/.test(n.innerText); })()"))
        await s.open_watch(); w = await pg.inner_text('.desk-grp[data-dg="watch"]')
        c('Watch: overdue To Do with Ask for update', 'Overdue To Do' in w and 'Fix the discharge template' in w and await pg.locator('.desk-grp[data-dg="watch"] [data-nudge]').count() >= 1, w[:300])
        c('Watch → Slipping: quick win past its expected date', 'Quick win past expected date' in w)
        c('Watch → Slipping: due today with no update yet', 'Due today, no update yet' in w and 'Mapping review' in w, w[:400])
        rows = await s.js("[...document.querySelectorAll('.desk-grp[data-dg=team] table.dg-team tbody tr')].map(r => r.innerText)")
        c('The team: one row per scored person', len(rows) == await s.js("Store.scoredTeam().length"), rows)
        c('The team: Nora shows Annual leave', any('Nora' in r and 'Annual leave' in r for r in rows), rows)
        c('The team: Yousef has 1 open To Do, 1 late', any('Yousef' in r and '1 late' in r for r in rows), rows)
        c('empty sections say so in one line', await s.js("[...document.querySelectorAll('.desk-grp > .dg-empty')].every(e => e.style.display === 'none')"))
        await pg.click('.desk-grp[data-dg="team"] tr[data-emp="yousef"]'); await pg.wait_for_timeout(600)
        c('clicking a person opens their page', 'employee' in await s.js("location.hash"))
        await s.go('#/home'); await s.go('#/manager', 800)
        await pg.screenshot(path=os.path.join(SHOTS, 'desk_manager.png'), full_page=True)

        # ---- Analyst Desk: one slim line, Today: buttons every day
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/todo'); await s.go('#/home', 800)
        hl = await s.js("(() => { const x = document.querySelector('#main .hello.one'); const h1 = x && x.querySelector('h1'); return x ? { fs: parseFloat(getComputedStyle(h1).fontSize), hgt: x.getBoundingClientRect().height, att: x.querySelectorAll('[data-att]').length } : null; })()")
        c('greeting on one slim line (17 px, not 24)', hl and hl['fs'] <= 18 and hl['hgt'] < 60, hl)
        c('On duty / Off / Permission buttons on the greeting line', hl and hl['att'] == 3, hl)
        off = await s.js("U.isOff(U.todayStr())")
        if off:
            c('weekend / holiday: buttons still there, "only if you worked"', 'only if you worked' in await pg.inner_text('#main .hello.one'))
        await pg.screenshot(path=os.path.join(SHOTS, 'desk_analyst.png'))
        c('no page errors', not s.errors, '; '.join(s.errors[:3]))
    c.done(s)

run(main())
