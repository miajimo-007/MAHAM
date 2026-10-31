"""Hidden projects (only chosen people see them) + the super admin listed in permission views."""
from harness import app_session, Check, run
async def main():
    c = Check('hidden projects + admin in permissions')
    async with app_session() as s:
        pg = s.page; J = s.js
        # --- permissions: my own row is there (analyst mode values)
        t = await s.go('#/admin/permissions', 500)
        c('my row in the matrix', await pg.locator('#pmrows tr[data-id="adam"]').count() == 1 and 'analyst mode' in t)
        c('shows analyst-mode values, not everything', await J("Store.canA('adam', 'assignTodo', 1)") == await J("Store.asAnalyst('adam', () => Store.can('adam', 'assignTodo', 1))") and await J("[...document.querySelectorAll('#pmrows tr[data-id=\"adam\"] [data-p]')].some(x => !x.checked)"))
        # give myself a permission and see it apply in analyst mode
        await pg.check('#pmrows tr[data-id="adam"] [data-p="importME"]'); await pg.click('#pmsave'); await pg.wait_for_timeout(500)
        await s.sign_in_as('adam', 'analyst')
        c('my permission applies in analyst mode', await J("App.can('importME')") and not await J("App.isSuper()"))
        await s.sign_in_as('adam')
        ex = await J("JSON.stringify(Admin.explain('adam').perms.map(p => p.why))")
        c('Explain access covers me', 'analyst mode' in ex)
        # --- hidden project
        await J("Store.saveMany([{id:'hp1', c:'project', name:'Secret dev work', team:'apps', manager:'yousef', members:['layla'], start:U.todayStr(), status:'In Progress', priority:'Normal', progress:0}, {id:'hpt1', c:'ptask', project:'hp1', team:'apps', title:'Build API', assignee:'layla', status:'To Do', points:3}]); Store.flush()")
        await s.go('#/project/hp1', 400)
        await pg.click('#projvis'); await pg.wait_for_selector('#pvon')
        c('owner, member and assignee pre-ticked', await J("['yousef','layla'].every(id => document.querySelector(`[name=pv][value=\"${id}\"]`).checked)"))
        await pg.check('#pvon'); await pg.uncheck('[name=pv][value="layla"]'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(400)
        c('saved hidden with 1 viewer', await J("Store.get('hp1').restricted") and await J("JSON.stringify(Store.get('hp1').viewers)") == '["yousef"]')
        # viewer sees it
        await s.sign_in_as('yousef'); t = await s.go('#/projects', 400)
        c('chosen person sees it', 'Secret dev work' in t)
        # not chosen: nowhere
        await s.sign_in_as('layla'); t = await s.go('#/projects', 400)
        c('not in Projects for others', 'Secret dev work' not in t)
        t = await s.go('#/home', 400); c('task not in My work', 'Build API' not in t)
        t = await s.go('#/project/hp1', 400); c('page says not found', 'not found' in t)
        c('not in lists at all', await J("Store.all('project', '*').every(p => p.id !== 'hp1') && Store.all('ptask', '*').every(t => t.project !== 'hp1')"))
        await s.sign_in_as('apps-mgr'); t = await s.go('#/projects', 400); c('even the team manager does not see it', 'Secret dev work' not in t)
        # cannot change who sees it
        await s.sign_in_as('yousef'); await J("Store.save(Object.assign({}, Store.get('hp1'), {restricted:false, viewers:[]}))"); await pg.wait_for_timeout(200)
        c('only the admin can change visibility', await J("Store.get('hp1').restricted"))
        # super admin in analyst mode still sees it
        await s.sign_in_as('adam', 'analyst'); c('you see it in analyst mode too', await J("Store.all('project', '*').some(p => p.id === 'hp1') && Scrum.canSee(Store.get('hp1'))"))
        # un-hide
        await s.sign_in_as('adam'); await s.go('#/project/hp1', 400); await pg.click('#projvis'); await pg.wait_for_selector('#pvon'); await pg.uncheck('#pvon'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(400)
        await s.sign_in_as('layla'); t = await s.go('#/projects', 400); c('visible again after un-hiding', 'Secret dev work' in t)
        c.done(s)
run(main())
