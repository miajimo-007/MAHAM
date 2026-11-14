"""Super admin sees everything; directory editing is admin-controlled; courses/SRS are per team; pages are guarded."""
from harness import app_session, Check, run
async def main():
    c = Check('roles and access')
    async with app_session() as s:
        pg = s.page
        nav = await pg.inner_text('nav')
        c('admin menu: Admin, System Check, every desk and the ManageEngine import', all(x in nav for x in ['Admin', 'System Check', 'Director Desk', 'Manager Desk', 'All Teams Overview', 'Tasks from the director', 'Projects', 'ManageEngine Import']))
        t = await s.go('#/syscheck'); c('System Check opens', 'Everyone' in t and 'Latest changes' in t)
        await pg.click('#sc_test'); await pg.wait_for_timeout(1500)
        c('save test writes and reads back', 'read back correctly' in await pg.inner_text('#toasts'))
        for who in ['yousef', 'apps-mgr']:
            await s.sign_in_as(who); t = await s.go('#/directory/it')
            c(f'directory view-only for {who}', 'View only' in t and await pg.locator('[data-add="itdir"]').count() == 0)
        await s.sign_in_as('adam'); await s.go('#/directory/it'); c('super admin can add contacts', await pg.locator('[data-add="itdir"]').count() == 1)
        await s.js("Store.save(Object.assign({}, Store.get('settings-team'), {members: Store.members().map(m => m.id==='yousef' ? Object.assign({}, m, {pages:{directory:'edit'}}) : m)}))"); await pg.wait_for_timeout(300)
        await s.sign_in_as('yousef'); await s.go('#/directory/it'); c('granting Edit to one person works', await pg.locator('[data-add="itdir"]').count() == 1)
        await s.sign_in_as('adam')
        await s.js("App.setViewTeam('apps'); Store.saveMany([{c:'reccourse',id:'rc1',category:'BI',course:'APPS course',hrs:2},{c:'srs',id:'s1',number:'SRS-APPS-1'}])")
        await s.js("App.setViewTeam('lab'); Store.saveMany([{c:'reccourse',id:'rc2',category:'BI',course:'LAB course',hrs:2},{c:'srs',id:'s2',number:'SRS-LAB-1'}])"); await pg.wait_for_timeout(300)
        t1 = await s.go('#/courses'); t2 = await s.go('#/info')
        c('LAB sees only LAB courses / SRS', 'LAB course' in t1 and 'APPS course' not in t1 and 'SRS-LAB-1' in t2 and 'SRS-APPS-1' not in t2)
        await s.js("App.setViewTeam('apps')")
        await s.sign_in_as('yousef')
        await s.js("Store.save(Object.assign({}, Store.get('settings-team'), {members: Store.members().map(m => m.id==='fahad' ? Object.assign({}, m, {role:'teamleader'}) : m)}))"); await pg.wait_for_timeout(300)
        for who in ['fahad', 'apps-mgr', 'khalid']:
            await s.sign_in_as(who)
            c(f'Import Old Data blocked for {who}', 'permission' in await s.go('#/importdata') and 'Import Old Data' not in await pg.inner_text('nav') and not await s.js("App.can('importOld')"))
        await s.sign_in_as('adam'); c('super admin keeps Import Old Data', 'Import Old Data' in await pg.inner_text('nav') and 'permission' not in await s.go('#/importdata'))
        await s.sign_in_as('yousef')
        for k in ['syscheck', 'admin', 'settings', 'director']:
            c(f'analyst blocked from {k}', 'permission' in await s.go('#/' + k))
        await s.js("Store.save({id:'settings-x', c:'settings', a:1})"); c('analyst cannot write settings', await s.js("!Store.get('settings-x')"))
        c.done(s)
run(main())
