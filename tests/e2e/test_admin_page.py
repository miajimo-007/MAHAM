"""Admin page: tabs, search, health tiles, person card, bulk edit, risky confirm, permission matrix + templates,
view-as (read-only), change log + undo, month locks, scoring what-if, technician matching, clean-up, offboarding,
reminders, usage; directors see every team and only the tasks they gave."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('admin page')
    async with app_session() as s:
        pg = s.page
        await s.sign_in_as('adam')
        for tab in ['home', 'people', 'permissions', 'teams', 'leave', 'months', 'scoring', 'data', 'log']:
            t = await s.go('#/admin/' + tab, 500)
            c(f'tab {tab} opens', 'Something went wrong' not in t, t[:300])
            if tab == 'home': await pg.screenshot(path=f'{SHOTS}/admin_home.png', full_page=True)
        # search
        await s.go('#/admin/home'); await pg.fill('#adsearch', 'layl'); await pg.wait_for_timeout(200)
        c('search finds a person', 'Layla' in await pg.inner_text('#adresults'))
        await pg.fill('#adsearch', 'templ'); await pg.wait_for_timeout(200)
        c('search finds a setting', 'Permission templates' in await pg.inner_text('#adresults'))
        # person card
        t = await s.go('#/adminperson/layla', 500)
        c('person card shows onboarding & open work', 'Onboarding' in t and 'Open work' in t and 'Activity' in t, t[:400])
        await pg.screenshot(path=f'{SHOTS}/admin_person.png', full_page=True)
        # change log: change Layla's short name on the card
        await pg.fill('#pcf [name=short]', 'Kholo'); await pg.click('#pcsave'); await pg.wait_for_timeout(400)
        c('saved from the card', await s.js("Store.member('layla').short") == 'Kholo')
        t = await s.go('#/admin/log', 500)
        c('change log records it', 'Short name of' in t and 'Kholo' in t, t[:600])
        await pg.click('[data-undo]'); await pg.click('[data-yes]'); await pg.wait_for_timeout(400)
        c('undo restores it', await s.js("Store.member('layla').short") != 'Kholo')
        # bulk edit
        await s.go('#/admin/people', 500)
        await pg.check('tr[data-id="yousef"] [data-sel]'); await pg.check('tr[data-id="layla"] [data-sel]')
        await pg.select_option('#bulkop', 'scored:0'); await pg.click('#bulkapply'); await pg.click('#savepeople'); await pg.wait_for_timeout(400)
        c('bulk edit applied', not await s.js("Store.member('yousef').scored") and not await s.js("Store.member('layla').scored"))
        # risky change asks first
        await s.go('#/admin/people', 500)
        await pg.uncheck('tr[data-id="apps-mgr"] [data-k="active"]'); await pg.click('#savepeople'); await pg.wait_for_timeout(300)
        c('retiring a manager asks for confirmation', 'Please check before saving' in await pg.inner_text('body'))
        await pg.click('[data-close2]'); await pg.wait_for_timeout(200)
        c('nothing saved when cancelled', await s.js("Store.member('apps-mgr').active") is not False)
        # permission template
        await s.js("Store.save({id: 'settings-permtemplates', c: 'settings', list: [{name: 'Senior analyst', perms: {createProjects: true, export: true, viewDashboards: true, viewOthers: true}}]})")
        await s.go('#/admin/home'); await s.go('#/admin/permissions', 500)
        await pg.check('#pmrows tr[data-id="yousef"] [data-psel]'); await pg.select_option('#tplapply', '0'); await pg.click('[data-yes]'); await pg.wait_for_timeout(400)
        c('template applied', await s.js("Store.can('yousef', 'createProjects', 1)"))
        # month locks
        await s.go('#/admin/months', 500)
        c('month lock grid shown', await pg.locator('[data-lockm], [data-unlock]').count() > 0)
        # scoring what-if
        await s.go('#/admin/scoring', 500); await pg.fill('[name=w_todo]', '0'); await pg.wait_for_timeout(500)
        c('what-if warns when weights do not add up', 'must add up to 100' in await pg.inner_text('#main'))
        # technician names
        await s.js("Store.save({id: 'hd-x1', c: 'helpdesk', number: 'X1', technician: 'Baitalmal Abulaziz', team: 'apps', created: U.todayStr()})")
        await s.go('#/admin/home'); t = await s.go('#/admin/data', 500)
        c('unmatched technician listed', 'Baitalmal Abulaziz' in t)
        i = await s.js("Admin.unmatched().findIndex(x => x.name === 'Baitalmal Abulaziz')")
        await pg.click(f'[data-tign="{i}"]'); await pg.wait_for_timeout(300)
        c('ignored technician no longer listed', not await s.js("Admin.unmatched().some(x => x.name === 'Baitalmal Abulaziz')"))
        # duplicates
        await s.js("Store.saveMany([{id: 'td-d1', c: 'todo', task: 'Same task', analyst: 'yousef', team: 'apps', assigned: '2026-10-01', status: 'In Progress'}, {id: 'td-d2', c: 'todo', task: 'Same task', analyst: 'yousef', team: 'apps', assigned: '2026-10-01', status: 'In Progress'}])")
        await s.go('#/admin/home'); await s.go('#/admin/data', 500)
        c('duplicates found', await s.js("Admin.duplicates().some(g => g.list.some(r => r.id === 'td-d1'))"))
        await pg.click('#dupall'); await pg.click('[data-yes]'); await pg.wait_for_timeout(300)
        c('duplicates removed (newest kept)', (await s.js("[!!Store.get('td-d1'), !!Store.get('td-d2')].filter(Boolean).length")) == 1)
        # offboarding
        await s.js("Store.save({id: 'td-ob', c: 'todo', task: 'Hand me over', analyst: 'layla', team: 'apps', assigned: U.todayStr(), duration: 3, status: 'In Progress'})")
        await s.go('#/admin/home'); await s.go('#/adminperson/layla', 500)
        await pg.click('#offboard'); await pg.wait_for_selector('#obf'); await pg.select_option('#obf [name=todo]', 'yousef'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(400)
        c('offboarding hands work over', await s.js("Store.get('td-ob').analyst") == 'yousef')
        c('offboarding retires', await s.js("Store.member('layla').active") is False)
        # reminder
        await s.go('#/admin/home', 500); await pg.click('[data-remind="pin"] >> nth=0'); await pg.wait_for_timeout(300)
        rid = await s.js("(Store.all('announcement').find(a => a.reminder) || {}).id")
        c('reminder created for people without a PIN', bool(rid))
        await s.sign_in_as('yousef'); c('reminder shown to them', await s.js(f"Ann.forMe(Store.get('{rid}'))"))
        await s.sign_in_as('khalid'); c('not shown to others', not await s.js(f"Ann.forMe(Store.get('{rid}'))") or await s.js("!!Store.pinOf('khalid')") is False)
        # director scope: sees every team, only the tasks he gave
        await s.js("Store.save({c: 'mgrtask', id: 'mt-mine', task: 'From Khalid', manager: 'apps-mgr', team: 'apps', date: U.todayStr(), status: 'Open'})"); await s.js("Store.flush()")
        await s.sign_in_as('adam'); await s.js("Store.save({c: 'mgrtask', id: 'mt-other', task: 'From admin', manager: 'apps-mgr', team: 'apps', date: U.todayStr(), status: 'Open'})"); await s.js("Store.flush()")
        await s.sign_in_as('khalid'); await s.js("Store.sync(true)"); await pg.wait_for_timeout(300)
        c('director sees every team', await s.js("App.myTeams().length") == await s.js("Store.teams().length"))
        t = await s.go('#/mgrtasks', 600)
        c('director sees the task he gave', 'From Khalid' in t); c("director does not see someone else's task", 'From admin' not in t)
        # view as (read-only)
        await s.sign_in_as('adam'); await s.go('#/adminperson/yousef', 500); await pg.click('#viewas'); await pg.wait_for_timeout(600)
        c('viewing as Yousef', await s.js("App.me") == 'yousef' and await pg.locator('#previewbar').count() == 1)
        await s.js("Store.save({id: 'td-preview', c: 'todo', task: 'x', analyst: 'yousef', team: 'apps', assigned: U.todayStr(), status: 'In Progress'})")
        c('nothing can be saved while previewing', not await s.js("Store.get('td-preview')"))
        await pg.click('#exitpreview'); await pg.wait_for_timeout(500)
        c('back to my account', await s.js("App.me") == 'adam' and await pg.locator('#previewbar').count() == 0)
        # usage
        await s.js("Admin.flushUsage()"); c('usage recorded', await s.js("!!Store.get('usage-adam')"))
        c.done(s)
run(main())
