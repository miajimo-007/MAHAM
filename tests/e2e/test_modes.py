"""Super admin: opens as an analyst; one click to Admin mode and back."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('analyst / admin mode')
    async with app_session() as s:
        pg = s.page; J = s.js
        # a To Do waiting 5 days, and a settings change made as admin earlier
        await s.sign_in_as('apps-mgr')
        await J("Store.save({id:'st1', c:'todo', team:'apps', task:'Old finished', analyst:'yousef', assigned:U.addDays(U.todayStr(), -9), duration:3, status:'In Progress'}); Store.flush()")
        await s.sign_in_as('yousef'); await J("Store.save(Object.assign({}, Store.get('st1'), {finish:U.addDays(U.todayStr(), -5), finishNote:'done earlier'})); Store.flush()"); await pg.wait_for_timeout(300)
        await s.sign_in_as('adam'); await J("Store.save(Object.assign({}, Store.get('settings-features') || {id:'settings-features', c:'settings'}, {appName:'MAHAM'})); Store.flush()"); await pg.wait_for_timeout(300)
        # real start: setMe → analyst mode
        await J("App.setMe('apps-mgr'); App.setMe('adam'); location.hash = '#/home'; App.launch()"); await pg.wait_for_timeout(500)
        c('opens in analyst mode', await J("App.mode") == 'analyst')
        nav = await pg.inner_text('nav')
        c('analyst menu: no Admin / System Check / Director Desk', 'System Check' not in nav and 'Director Desk' not in nav and await pg.locator('nav [data-nav="admin"]').count() == 0)
        c('not super admin on this screen', not await J("App.isSuper()") and not await J("App.can('assignTodo')"))
        c('really still the super admin', await J("App.realSuper()"))
        c('title stays Admin', 'Admin' in await pg.inner_text('#mebtn'))
        c('admin page blocked', 'Admin' != (await s.go('#/admin', 400))[:5] and not await J("App.pageAllowed('admin')") if await J("typeof App.pageAllowed === 'function'") else True)
        c('earlier admin saves still trusted', await J("Store.setting('settings-features', 'appName', '')") == 'MAHAM' and not await J("Store.rejected.some(r => r.id === 'settings-features')"))
        await J("Store.save(Object.assign({}, Store.get('settings-features'), {appName:'Hacked'}))"); await pg.wait_for_timeout(200)
        c('…cannot change settings', await J("Store.setting('settings-features', 'appName', '')") == 'MAHAM')
        c('switch button with red dot', await pg.locator('#modebtn').count() == 1 and await pg.locator('#modebtn .mdot').count() == 1)
        c('hover lists the stuck To Dos', 'waiting 3+ days' in (await pg.get_attribute('#modebtn', 'title')))
        await s.go('#/todo', 300)
        # → admin
        await pg.click('#modebtn'); await pg.wait_for_timeout(500)
        c('admin mode on', await J("App.mode") == 'admin' and await J("App.isSuper()"))
        c('admin bar shown', await pg.locator('#modebar').count() == 1)
        c('admin menu', await pg.locator('nav [data-nav="admin"]').count() == 1)
        c('first time → Admin page', (await J("location.hash")).startswith('#/admin'))
        t = await s.go('#/admin/home', 600)
        c('daily checklist', 'Daily checklist' in t and 'Backup' in t)
        c('stuck To Dos card', 'To Dos waiting too long' in t and 'Old finished' in t)
        await pg.click('[data-askconfirm="apps-mgr"]'); await pg.wait_for_timeout(300)
        c('ask to confirm → nudge to the manager', await J("Store.all('nudge', '*').some(n => n.kind === 'confirm' && n.to === 'apps-mgr' && n.ids.includes('st1'))"))
        await pg.screenshot(path=f'{SHOTS}/admin_mode.png', full_page=True)
        await J("Store.save(Object.assign({}, Store.get('settings-features'), {appName:'MAHAM 2'}))"); await pg.wait_for_timeout(200)
        c('change log: as Admin', await J("Admin.entries()[0].mode") == 'admin')
        await s.go('#/admin/log', 400); c('log shows the mode', 'as Admin' in await pg.inner_text('#main'))
        # ← back, remembers place
        await s.go('#/admin/people', 300)
        await pg.click('#modeback'); await pg.wait_for_timeout(500)
        c('back to analyst', await J("App.mode") == 'analyst' and not await J("App.isSuper()") and await pg.locator('#modebar').count() == 0)
        c('back where I was (To Do)', await J("location.hash") == '#/todo')
        await pg.screenshot(path=f'{SHOTS}/analyst_mode.png')
        await pg.click('#modebtn'); await pg.wait_for_timeout(500)
        c('admin again → last admin page', (await J("location.hash")).startswith('#/admin/people'))
        # manager sees the request
        await s.sign_in_as('apps-mgr'); t = await s.go('#/home', 500)
        c('manager sees "asked you to confirm"', 'asked you to confirm finished To Dos' in t)
        await J("Store.save(Object.assign({}, Store.get('st1'), {status:'Resolved', reviewedBy:'apps-mgr', reviewedOn:U.todayStr()}))"); t = await s.go('#/todo', 300); t = await s.go('#/home', 500)
        c('…gone once confirmed', 'asked you to confirm finished To Dos' not in t)
        # other analysts never see the switch
        await s.sign_in_as('yousef'); c('no switch for others', await pg.locator('#modebtn').count() == 0)
        c.done(s)
run(main())
