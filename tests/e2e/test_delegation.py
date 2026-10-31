"""Manager on leave: the super admin delegates to someone; they act as manager and the director sees it."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('manager leave & delegation')
    async with app_session() as s:
        pg = s.page
        # super admin sets it up in Admin
        await s.go('#/admin/leave'); await pg.click('#adddlg'); await pg.wait_for_selector('#dlgf')
        await pg.select_option('#dlgf [name=from]', 'apps-mgr'); await pg.select_option('#dlgf [name=to]', 'yousef')
        await pg.fill('#dlgf [name=end]', await s.js("U.addDays(U.todayStr(), 7)")); await pg.fill('#dlgf [name=note]', 'Annual leave'); await pg.click('[data-ok]'); await pg.wait_for_timeout(300)
        c('delegation saved and active', await s.js("Store.actingFor('yousef').join()") == 'apps-mgr' and 'Active now' in await pg.inner_text('#main'))
        # only the super admin may change delegations
        await s.sign_in_as('khalid'); await s.js("Store.save({id: 'settings-delegations', c: 'settings', list: []})")
        c('director cannot change delegations', await s.js("Store.delegations().length") == 1)
        # director assigns work to the manager on leave and sees who is covering
        await s.go('#/home'); t = await pg.inner_text('#main')
        c('Director Desk: "Managers on leave" card', 'managers on leave' in t.lower() and await pg.locator('.card:has-text("Managers on leave") >> text=Yousef').count() == 1)
        c('Teams table shows the acting person', await pg.locator('td:has-text("on leave") >> text=Yousef').count() == 1)
        await pg.click('#dirassign'); await pg.wait_for_selector('#asgf')
        c('assign form marks the manager as on leave', await pg.locator('#asgf label:has-text("acting")').count() == 1)
        await pg.fill('#asgf [name=task]', 'Q4 access review'); await pg.check('#asgf [name=who][value="apps-mgr"]'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{SHOTS}/delegation_director.png', full_page=True)
        # the acting person
        await s.sign_in_as('yousef'); nav = await pg.inner_text('nav')
        c('acting person gets "Acting manager" menu', 'acting manager' in nav.lower() and 'Manager Desk' in nav)
        c('…and keeps his own My Day', 'My Day' in nav)
        t = await s.go('#/manager')
        c('Manager Desk opens with "You are acting for"', 'You are acting for' in t and 'Q4 access review' in t)
        c('has the manager\'s permissions (approve QW, assign To Do)', await s.js("App.can('approveQW') && App.can('assignTodo')"))
        c('…but not director-level ones', not await s.js("App.can('assignToManagers')"))
        c('can forward the director task', await pg.locator('[data-fwd]').count() >= 1)
        await s.js("Store.save({c: 'project', name: 'Mgr project', manager: 'apps-mgr', team: 'apps', origin: 'team', members: []})")
        pid = await s.js("(Store.all('project').find(p => p.name === 'Mgr project') || {}).id")
        c("plans the manager's projects", bool(pid) and await s.js(f"Scrum.planner(Store.get('{pid}'))"))
        await pg.screenshot(path=f'{SHOTS}/delegation_acting.png', full_page=True)
        # others are unaffected
        await s.sign_in_as('layla'); c('other analysts cannot open Manager Desk', 'permission' in await s.go('#/manager'))
        await s.sign_in_as('apps-mgr'); c('manager sees he is marked on leave', 'marked as on leave' in await s.go('#/manager'))
        # once the leave is over, the rights end automatically
        await s.sign_in_as('adam'); await s.js("Store.save({id: 'settings-delegations', c: 'settings', list: [{from: 'apps-mgr', to: 'yousef', start: U.addDays(U.todayStr(), -10), end: U.addDays(U.todayStr(), -1)}]})"); await pg.wait_for_timeout(300)
        await s.sign_in_as('yousef')
        c('after the end date the acting rights stop', not await s.js("App.isActing()") and not await s.js("App.can('approveQW')") and 'acting manager' not in (await pg.inner_text('nav')).lower())
        await s.sign_in_as('adam'); c('Admin shows it as Ended', 'Ended' in await s.go('#/admin/leave'))
        c.done(s)
run(main())
