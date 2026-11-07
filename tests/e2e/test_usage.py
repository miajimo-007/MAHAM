"""Usage: To Do first seen / opened, screens + functions + approximate time, report behind the "See usage" permission."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('usage')
    async with app_session() as s:
        pg = s.page; J = s.js
        await s.sign_in_as('apps-mgr')
        tid = await J("Store.save({id:'td-use1', c:'todo', task:'Check the OR order set', analyst:'yousef', team:'apps', assigned:U.todayStr(), duration:2, priority:'Normal', status:'In Progress', finish:''}).id")
        c('manager sees "not seen yet"', 'not seen' in await J(f"Admin.seenLabel(Store.get('{tid}'))"))
        await J("Store.flush()")
        # the analyst sees it on My Day, then opens it
        await s.sign_in_as('yousef'); await s.go('#/home', 500)
        c('first seen recorded when it is on the screen', bool(await J(f"(Admin.todoSeen(Store.get('{tid}')) || {{}}).s")))
        c('not opened yet', not await J(f"(Admin.todoSeen(Store.get('{tid}')) || {{}}).o"))
        await s.go('#/todo', 400); await J(f"UI.editRecord('todo', Store.get('{tid}'))"); await pg.wait_for_timeout(300); await J("UI.closeModal()")
        c('opened recorded', bool(await J(f"(Admin.todoSeen(Store.get('{tid}')) || {{}}).o")))
        # functions + time
        await J("Store.save({c:'shadow', analyst:'yousef', team:'apps', date:U.todayStr(), minutes:30, subject:'Helped pharmacy', category:'PHARMACY'})"); await pg.wait_for_timeout(200)
        await s.go('#/helpdesk/requests', 300)
        await J("Admin._act = Date.now(); Admin.tick(); Admin.tick(); Admin.flushUsage(); Store.flush()"); await pg.wait_for_timeout(500)
        u = await J("JSON.stringify(Store.get('usage-yousef').days[U.todayStr()])")
        c('function counted (added shadow work)', '"shadow:add":1' in u)
        c('screen with tab counted', '"helpdesk/requests":' in u)
        c('time counted on the current screen', '"time":{' in u and '"helpdesk/requests":60' in u)
        # analyst cannot see the report by default
        c('analyst: no Usage page by default', not await J("App.pageAllowed('usage')") and await pg.locator('nav [data-nav="usage"]').count() == 0)
        # manager sees it
        await s.sign_in_as('apps-mgr'); t = await s.go('#/usage', 500)
        c('manager sees the Usage report', 'Yousef' in t and 'to dos opened' in t.lower())
        c('manager sees "opened" on the To Do', 'opened' in await J(f"Admin.seenLabel(Store.get('{tid}'))"))
        await pg.select_option('#uwho', 'yousef'); await pg.wait_for_timeout(400); t = await pg.inner_text('#main')
        c('person view: screens, functions, never opened', 'Added shadow work' in t and 'IT Help Desk → Requests' in t and 'Never opened' in t)
        await pg.screenshot(path=f'{SHOTS}/usage.png', full_page=True)
        t = await s.go('#/todo', 400); c('To Do list has the 👁 column', 'opened' in t)
        # admin gives an analyst the permission
        await s.sign_in_as('adam', 'admin'); await J("saveMembersAll(Store.members().map(m => m.id === 'layla' ? Object.assign({}, m, { perms: { seeUsage: true } }) : m), 'x')")
        await s.sign_in_as('layla'); c('permission given → analyst sees Usage', await J("App.pageAllowed('usage')"))
        c.done(s)
run(main())
