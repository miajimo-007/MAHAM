"""Projects list: the Person filter finds projects the person owns, is a member of, or has a task in."""
from harness import app_session, Check, run
async def main():
    c = Check('projects person filter')
    async with app_session() as s:
        pg = s.page
        await s.sign_in_as('adam')
        await s.js("""Store.saveMany([
          {c: 'project', id: 'pf1', name: 'Owned by Layla', manager: 'layla', team: 'apps', origin: 'team', status: 'In Progress', members: []},
          {c: 'project', id: 'pf2', name: 'Adam is a member', manager: 'apps-mgr', team: 'apps', origin: 'team', status: 'In Progress', members: ['adam']},
          {c: 'project', id: 'pf3', name: 'Adam has a task', manager: 'apps-mgr', team: 'apps', origin: 'team', status: 'In Progress', members: []},
          {c: 'ptask', id: 'pf3t', project: 'pf3', title: 'x', assignee: 'adam', status: 'To Do', points: 1, team: 'apps'}])""")
        await s.js("Object.assign(ps('proj'), {mgr: 'adam', team: 'apps'})"); t = await s.go('#/projects', 600)
        c('member project found', 'Adam is a member' in t); c('task project found', 'Adam has a task' in t); c('others not shown', 'Owned by Layla' not in t)
        opts = await s.js("[...document.querySelectorAll('select')].flatMap(sl => [...sl.options].map(o => o.value))")
        c('analysts offered in the Person list', 'adam' in opts and 'layla' in opts, opts)
        c.done(s)
run(main())
