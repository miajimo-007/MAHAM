"""One kind of project: Team, Owner (anyone in the team), Members, Given by — who sees and who plans."""
from harness import app_session, Check, run
async def main():
    c = Check('project model')
    async with app_session() as s:
        pg = s.page
        await s.sign_in_as('apps-mgr')
        await s.js("Store.saveMany([{c: 'project', id: 'pm1', name: 'Layla leads', manager: 'layla', team: 'apps', status: 'In Progress', members: ['nora']}, {c: 'ptask', id: 'pm1t', project: 'pm1', title: 'Task for Fahad', assignee: 'fahad', status: 'To Do', points: 2, team: 'apps'}])")
        await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        c('manager plans a project his analyst owns', await s.js("Scrum.planner(Store.get('pm1'))"))
        t = await s.go('#/projects/team', 500); c('in his Team projects', 'Layla leads' in t)
        await s.sign_in_as('layla'); c('owner plans it', await s.js("Scrum.planner(Store.get('pm1'))")); t = await s.go('#/projects/mine', 500); c('in her My projects', 'Layla leads' in t)
        await s.sign_in_as('fahad'); c('someone with a task sees it in My projects', 'Layla leads' in await s.go('#/projects/mine', 500))
        c('…and can work on their own task', await s.js("Scrum.canWork(Store.get('pm1t'))"))
        c('…but cannot plan', not await s.js("Scrum.planner(Store.get('pm1'))"))
        await s.sign_in_as('sara'); c('rest of the team can look', await s.js("Scrum.canSee(Store.get('pm1'))") and not await s.js("Scrum.planner(Store.get('pm1'))"))
        t = await s.go('#/projects/team', 500); c('…in Team projects, view only', 'Layla leads' in t and 'view only' in t)
        c('Projects in the menu for everyone', await pg.locator('nav [data-nav="projects"]').count() == 1)
        await s.sign_in_as('lab-mgr'); c('another team cannot see it', not await s.js("Scrum.canSee(Store.get('pm1'))"))
        await s.sign_in_as('khalid')
        c('director sees it (his department)', await s.js("Scrum.canSee(Store.get('pm1'))")); c('…but does not plan what he did not give', not await s.js("Scrum.planner(Store.get('pm1'))"))
        await s.js("Store.save({c: 'project', id: 'pm2', name: 'From Khalid', manager: 'yousef', team: 'apps', status: 'Not Started', members: []})")
        c('director plans what he gave', await s.js("Scrum.planner(Store.get('pm2'))") and await s.js("Store.get('pm2').givenBy") == 'khalid')
        c('director can choose an analyst as owner', 'yousef' in await s.js("Scrum.ownerOptions().map(o => o[0])"))
        await s.go('#/projects/mine', 300); t = await s.go('#/projects/all', 500); c('All tab for directors', 'Layla leads' in t and 'From Khalid' in t)
        c.done(s)
run(main())
