"""'Create and lead team projects': team leaders by default, analysts only when the super admin grants it."""
from harness import app_session, Check, run
async def main():
    c = Check('project permission')
    async with app_session() as s:
        pg = s.page
        set_member = lambda mid, patch: s.js(f"Store.save(Object.assign({{}}, Store.get('settings-team'), {{members: Store.members().map(m => m.id === '{mid}' ? Object.assign({{}}, m, {patch}) : m)}}))")
        await set_member('yousef', "{role: 'teamleader'}"); await pg.wait_for_timeout(300)
        c('team leader has the permission by default', await s.js("Store.can('yousef', 'createProjects')"))
        c('analyst does not by default', not await s.js("Store.can('layla', 'createProjects')"))
        c('manager has it', await s.js("Store.can('apps-mgr', 'createProjects')"))
        # team leader creates a project and becomes its owner
        await s.sign_in_as('yousef'); c('team leader sees Projects in the menu', 'Projects' in await pg.inner_text('nav'))
        await s.go('#/projects'); c('team leader has "New project"', await pg.locator('[data-add="project"]').count() == 1)
        await pg.click('[data-add="project"]'); await pg.wait_for_selector('#recform')
        c('owner defaults to the team leader', await pg.eval_on_selector('#recform [name=manager]', 'e => e.value') == 'yousef')
        await pg.fill('#recform [name=name]', 'Order set clean-up'); await pg.click('[data-save]'); await pg.wait_for_timeout(300)
        pid = await s.js("(Store.all('project').find(p => p.name === 'Order set clean-up') || {}).id")
        c('project saved with the team leader as owner, APPS team', bool(pid) and await s.js(f"(p => p.manager === 'yousef' && p.team === 'apps')(Store.get('{pid}'))"))
        c('team leader plans it (owner)', await s.js(f"Scrum.planner(Store.get('{pid}'))"))
        await s.go(f'#/project/{pid}'); await pg.click('[data-ptab="team"]'); await pg.wait_for_timeout(300)
        c('team leader can pick the project team', await pg.locator('#editmem').count() == 1)
        # analyst: no permission
        await s.sign_in_as('layla'); await s.go('#/projects')
        c('analyst without permission: no New project button', await pg.locator('[data-add="project"]').count() == 0)
        await s.js("Store.save({c: 'project', name: 'Sneaky', manager: 'layla', origin: 'team'})")
        c('…and saving one anyway is refused by the data layer', await s.js("Schemas.project.canCreate()") is False and not await s.js("Store.all('project').some(p => p.name === 'Sneaky')"))
        # super admin grants it to one analyst
        await s.sign_in_as('adam'); await set_member('layla', "{perms: {createProjects: true}}"); await pg.wait_for_timeout(300)
        await s.sign_in_as('layla'); await s.go('#/projects')
        c('after the grant the analyst can create projects', await pg.locator('[data-add="project"]').count() == 1)
        # and can take it away from a team leader
        await s.sign_in_as('adam'); await set_member('yousef', "{perms: {createProjects: false}}"); await pg.wait_for_timeout(300)
        await s.sign_in_as('yousef'); await s.go('#/projects')
        c('removing it from a team leader works', await pg.locator('[data-add="project"]').count() == 0)
        c('…but he still sees the project he owns', 'Order set clean-up' in await pg.inner_text('#main'))
        await s.sign_in_as('adam'); await s.go('#/admin/people'); await pg.click('[data-perm="layla"]'); await pg.wait_for_timeout(300)
        c('permission listed in Admin → Permissions', 'Create and lead team projects' in await pg.inner_text('#modal'))
        c.done(s)
run(main())
