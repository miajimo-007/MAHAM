"""Project categories and project task types are lists the super admin edits; projects use and filter by them."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('project categories')
    async with app_session() as s:
        pg = s.page
        c('default categories available', 'Enhancement' in await s.js("Store.list('projectCategories')"))
        # super admin adds a category and a task type in Admin → Work & workflows → Projects
        await s.go('#/admin/work/projects', 600)
        cats = await pg.input_value('[data-list="projectCategories"]')
        await pg.fill('[data-list="projectCategories"]', cats + '\nEPIC Go-live')
        types = await pg.input_value('[data-list="ptaskTypes"]')
        await pg.fill('[data-list="ptaskTypes"]', types + '\nTesting')
        await pg.click('#savelists'); await pg.wait_for_timeout(400)
        c('admin saved the new category and task type', 'EPIC Go-live' in await s.js("Store.list('projectCategories')") and 'Testing' in await s.js("Store.list('ptaskTypes')"))
        # nobody else can change the lists
        await s.sign_in_as('apps-mgr')
        await s.js("Store.save({id: 'settings-lists-apps', c: 'settings', lists: {projectCategories: ['Hacked']}})")
        c('manager cannot change the lists', 'Hacked' not in await s.js("Store.list('projectCategories')"))
        # manager uses them
        await s.go('#/projects'); await pg.click('[data-add="project"]'); await pg.wait_for_selector('#recform')
        await pg.fill('#recform [name=name]', 'EHR vendor upgrade wave 2'); await pg.select_option('#recform [name=category]', 'EPIC Go-live'); await pg.click('[data-save]'); await pg.wait_for_timeout(300)
        await pg.click('[data-add="project"]'); await pg.wait_for_selector('#recform')
        await pg.fill('#recform [name=name]', 'Lab interface'); await pg.select_option('#recform [name=category]', 'Integration'); await pg.click('[data-save]'); await pg.wait_for_timeout(300)
        t = await s.go('#/projects')
        c('category shown on the projects list', 'EPIC Go-live' in t and 'Integration' in t)
        await pg.select_option('[data-flt="proj|cat"]', 'Integration'); await pg.wait_for_timeout(300)
        t = await pg.inner_text('#main'); c('filter by category', 'Lab interface' in t and 'EHR vendor upgrade wave 2' not in t)
        await pg.screenshot(path=f'{SHOTS}/project_categories.png', full_page=True)
        pid = await s.js("Store.all('project').find(p => p.name === 'Lab interface').id")
        await pg.select_option('[data-flt="proj|cat"]', ''); await s.go(f'#/project/{pid}')
        c('category on the project page', 'Integration' in await pg.inner_text('.phead'))
        await pg.click('[data-ptab="backlog"]'); await pg.wait_for_timeout(200); await pg.click('#additem'); await pg.wait_for_selector('#recform')
        opts = await pg.eval_on_selector_all('#recform [name=type] option', 'os => os.map(o => o.value)')
        c('custom task type offered', 'Testing' in opts and 'Story' in opts, opts)
        await pg.fill('#recform [name=title]', 'UAT round 1'); await pg.select_option('#recform [name=type]', 'Testing'); await pg.click('[data-save]'); await pg.wait_for_timeout(300)
        c('task saved with the custom type', await s.js("Store.all('ptask').some(t => t.title === 'UAT round 1' && t.type === 'Testing')"))
        c.done(s)
run(main())
