"""Director assigns to a manager; the manager forwards to analysts; rejected quick wins become history."""
from harness import app_session, Check, run
async def main():
    c = Check('director tasks & quick wins')
    async with app_session() as s:
        pg = s.page
        await s.sign_in_as('khalid'); await s.go('#/home')
        await pg.click('#dirassign'); await pg.wait_for_selector('#asgf'); await pg.fill('#asgf [name=task]', 'Prepare OR booking report'); await pg.check('#asgf [name=who][value="apps-mgr"]'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(400)
        await s.sign_in_as('adam'); c('super admin sees it on Director Desk', 'Prepare OR booking report' in await s.go('#/director'))
        await s.sign_in_as('apps-mgr'); await s.go('#/home')
        await pg.click('[data-fwd]'); await pg.wait_for_selector('#fwdf')
        await pg.check('#fwdf [name=who][value="yousef"]'); await pg.check('#fwdf [name=who][value="nora"]'); await pg.fill('#fwdf [name=due]', await s.js("U.addDays(U.todayStr(), 7)"))
        await pg.click('[data-ok]'); await pg.wait_for_timeout(400)
        f = await s.js("Store.all('todo','*').filter(t => t.fromTask).map(t => [t.analyst, t.duration, t.status])")
        c('forwarded as To Dos to 2 analysts, due in 7 days', sorted(f) == sorted([['yousef', 7, 'In Progress'], ['nora', 7, 'In Progress']]), f)
        c('director task moved to In Progress', await s.js("Store.all('mgrtask')[0].status") == 'In Progress')
        await s.sign_in_as('yousef'); t = await s.go('#/home'); c('in the analyst\'s My Day, marked "from director"', 'Prepare OR booking report' in t and 'from director' in t)
        await s.js("Store.saveMany([{c:'quickwin',id:'qw-b',analyst:'yousef',date:'2026-10-01',subject:'QW rejected one'}])")
        await s.sign_in_as('apps-mgr'); await s.go('#/quickwins'); await pg.click('[data-qwr="qw-b"]'); await pg.fill('[name=managerComment]', 'Not a quick win'); await pg.click('[data-ok]'); await pg.wait_for_timeout(300)
        t = await s.go('#/quickwins'); c('Quick Wins hides rejected by default', 'QW rejected one' not in t and 'Show rejected (history' in t)
        await pg.check('[data-flt="qw|hist"]'); await pg.wait_for_timeout(300); c('history toggle shows it', 'QW rejected one' in await pg.inner_text('#main'))
        await s.sign_in_as('yousef'); c('rejected quick win not in My Day', 'QW rejected one' not in await s.go('#/home'))
        c.done(s)
run(main())
