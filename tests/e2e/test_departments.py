"""Several directors: AED → directors → departments → teams. Each director sees only their department's teams;
the AED / super admin sees every department in the overview."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('departments')
    async with app_session() as s:
        pg = s.page
        await s.sign_in_as('adam')
        c('one department (IT) with every team until set up', await s.js("Store.depts().length === 1 && Store.depts()[0].name === 'IT' && Store.depts()[0].teams.length === Store.teams().length"))
        # a second director with his own department (OPS moves to it)
        await s.js("Store.save({id: 'settings-features', c: 'settings', orgLevels: true})")
        await s.js("saveMembersAll(Store.members().concat([{id: 'dir2', name: 'Second Director', short: 'Dir2', role: 'director', team: '', active: true, scored: false}]))")
        await s.go('#/admin/home'); await s.go('#/admin/teams', 500)
        await pg.click('#adddept'); await pg.fill('#ndf [name=name]', 'Health Informatics'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(400)
        await pg.select_option('#deptlist tr[data-dept="health-informatics"] [data-dd]', 'dir2'); await pg.click('#savedepts'); await pg.wait_for_timeout(300)
        await pg.select_option('#teamlist tr[data-t="ops"] [data-tdept]', 'health-informatics'); await pg.click('#saveteams'); await pg.wait_for_timeout(400)
        c('OPS is now in the new department', await s.js("Store.deptOfTeam('ops').name") == 'Health Informatics')
        await s.js("""Store.saveMany([
          {c: 'mgrtask', id: 'dp-1', task: 'APPS audit', manager: 'apps-mgr', team: 'apps', date: U.todayStr(), due: U.addDays(U.todayStr(), 2), status: 'Open'},
          {c: 'mgrtask', id: 'dp-2', task: 'OPS rollout', manager: 'ops-mgr', team: 'ops', date: U.todayStr(), due: U.addDays(U.todayStr(), 3), status: 'Open'}])"""); await s.js("Store.flush()")
        await s.sign_in_as('khalid'); await s.js("Store.sync(true)"); await pg.wait_for_timeout(300)
        c('first director no longer sees OPS', 'ops' not in await s.js("App.myTeams().map(t => t.id)"))
        t = await s.go('#/overview', 600)
        c('his overview: IT only', 'IT — all teams overview' in t and 'APPS audit' in t and 'OPS rollout' not in t, t[:500])
        await s.sign_in_as('dir2'); await pg.wait_for_timeout(300)
        c('second director sees only OPS', await s.js("App.myTeams().map(t => t.id)") == ['ops'])
        t = await s.go('#/overview', 600)
        c('his overview: his department', 'Health Informatics — all teams overview' in t and 'OPS rollout' in t and 'APPS audit' not in t, t[:500])
        await s.sign_in_as('adam'); t = await s.go('#/overview', 600)
        c('super admin / AED: every department', 'All departments overview' in t and 'APPS audit' in t and 'OPS rollout' in t and 'Health Informatics' in t)
        await pg.screenshot(path=f'{SHOTS}/overview_depts.png', full_page=True)
        await pg.click('[data-ovdept="health-informatics"]'); await pg.wait_for_timeout(400); t = await pg.inner_text('#main')
        c('filter by department', 'OPS rollout' in t and 'APPS audit' not in t)
        c.done(s)
run(main())
