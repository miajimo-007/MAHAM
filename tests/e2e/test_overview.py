"""All teams overview: director sees tasks between director and managers (any giver, incl. meetings), projects,
requests waiting for the director and meetings — as an agenda; not manager → analyst To Dos."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('all teams overview')
    async with app_session() as s:
        pg = s.page
        await s.sign_in_as('adam')
        await s.js("""Store.saveMany([
          {c: 'mgrtask', id: 'ov-1', task: 'Audit LAB interfaces', manager: 'lab-mgr', team: 'lab', date: U.todayStr(), due: U.addDays(U.todayStr(), 2), status: 'Open'},
          {c: 'mgrtask', id: 'ov-2', task: 'Late report', manager: 'apps-mgr', team: 'apps', date: U.addDays(U.todayStr(), -9), due: U.addDays(U.todayStr(), -2), status: 'Open'},
          {c: 'project', id: 'ov-p', name: 'OPS team rollout', manager: 'ops-mgr', team: 'ops', origin: 'team', start: U.todayStr(), due: U.addDays(U.todayStr(), 30), status: 'In Progress', members: []},
          {c: 'project', id: 'ov-pa', name: 'Analyst-led cleanup', manager: 'yousef', team: 'apps', origin: 'team', start: U.todayStr(), status: 'In Progress', members: []},
          {c: 'todo', id: 'ov-td', task: 'Analyst daily task', analyst: 'yousef', team: 'apps', assigned: U.todayStr(), duration: 1, status: 'In Progress'}])""")
        await s.js("Store.flush()")
        await s.sign_in_as('apps-mgr')
        await s.js("Store.save({c: 'request', id: 'ov-rq', type: 'vacation', title: 'Manager leave', requester: 'apps-mgr', team: 'apps', from: U.addDays(U.todayStr(), 5), to: U.addDays(U.todayStr(), 8), status: 'Pending director', created: U.todayStr()})"); await s.js("Store.flush()")
        await s.sign_in_as('khalid'); await s.js("Store.sync(true)"); await pg.wait_for_timeout(300)
        d = await s.go('#/director', 500); c('Director Desk has a By team tab', 'By team' in d)
        t = await s.go('#/overview', 700)
        c('page opens', 'Something went wrong' not in t and 'all teams overview' in t, t[:300])
        c('task given by someone else (admin) shown', 'Audit LAB interfaces' in t)
        heads = await s.js("[...document.querySelectorAll('.ov-col-head b')].map(e => e.textContent)")
        c('board: one column per team', all(x in heads for x in ['APPS', 'LAB', 'BI', 'OPS']), heads)
        col = await s.js("[...document.querySelectorAll('.ov-col')].find(c => c.querySelector('.ov-col-head b').textContent === 'LAB').innerText")
        c('card sits under its team', 'Audit LAB interfaces' in col and 'Late report' not in col)
        await s.page.screenshot(path=f'{SHOTS}/overview_board.png', full_page=True)
        await pg.click('[data-ovview="agenda"]'); await pg.wait_for_timeout(400); t = await pg.inner_text('#main')
        c('overdue section', '⚠ Overdue' in t and t.index('Late report') < t.index('Audit LAB interfaces'))
        c('team project shown', 'OPS team rollout' in t)
        c('project owned by an analyst shown with their role', 'Analyst-led cleanup' in t and '(Analyst)' in t, t[-800:])
        c('manager request waiting for the director shown', 'Manager leave' in t)
        c('analyst To Do not shown', 'Analyst daily task' not in t)
        await pg.screenshot(path=f'{SHOTS}/overview.png', full_page=True)
        await pg.click('[data-ovview="board"]'); await pg.wait_for_timeout(300)
        await pg.click('[data-ovteam="lab"]'); await pg.wait_for_timeout(400); t = await pg.inner_text('#main')
        c('filter by team', 'Audit LAB interfaces' in t and 'Late report' not in t)
        c.done(s)
run(main())
