"""To Do: only the person it is assigned to can press Done; the manager always confirms; nobody confirms their own."""
from harness import app_session, Check, run
async def main():
    c = Check('to do owner + confirm')
    async with app_session() as s:
        pg = s.page; J = s.js
        await s.sign_in_as('apps-mgr')
        await J("Store.save({id:'tk1', c:'todo', team:'apps', task:'Layla task', analyst:'layla', assigned:U.todayStr(), duration:3, status:'In Progress'}); Store.save({id:'tm1', c:'todo', team:'apps', task:'Adam task', analyst:'adam', assigned:U.todayStr(), duration:3, status:'In Progress'}); Store.flush()")
        await pg.wait_for_timeout(400)
        # another analyst
        await s.sign_in_as('yousef'); await s.go('#/todo', 500)
        c('no Done button on someone else\'s To Do', await pg.locator('[data-done="tk1"]').count() == 0)
        await J("todoDone('tk1')"); await pg.wait_for_timeout(300)
        c('blocked even if forced', not (await J("Store.get('tk1').finish")))
        await J("UI.editRecord('todo', Store.get('tk1'))"); await pg.wait_for_timeout(300)
        c('opens view-only', await pg.locator('.modal [data-save]').count() == 0)
        await J("UI.closeModal()")
        # the owner
        await s.sign_in_as('layla'); await s.go('#/todo', 500)
        c('owner has Done', await pg.locator('[data-done="tk1"]').count() == 1)
        await pg.click('[data-done="tk1"]'); await pg.wait_for_timeout(500)
        c('goes to Ready for review', await J("Store.get('tk1').status") == 'Ready for review')
        c('owner cannot confirm', await pg.locator('[data-tdok="tk1"]').count() == 0)
        await J("Store.save(Object.assign({}, Store.get('tk1'), {status:'Resolved', reviewedBy:'layla'}))"); await pg.wait_for_timeout(300)
        c('cannot confirm herself by editing', await J("Store.get('tk1').status") == 'Ready for review' and not await J("Store.get('tk1').reviewedBy"))
        # a team leader (assignTodo) with their own To Do
        await s.sign_in_as('adam'); await s.go('#/todo', 500)
        await pg.click('[data-done="tm1"]'); await pg.wait_for_timeout(500)
        c('team leader\'s own To Do also waits for the manager', await J("Store.get('tm1').status") == 'Ready for review')
        c('no Confirm on his own', await pg.locator('[data-tdok="tm1"]').count() == 0)
        c('can confirm Layla\'s', await pg.locator('[data-tdok="tk1"]').count() == 1)
        # the manager
        await s.sign_in_as('apps-mgr'); await s.go('#/todo', 500)
        await pg.click('[data-tdok="tk1"]'); await pg.wait_for_timeout(400)
        c('manager confirms → Done', await J("Store.get('tk1').status") == 'Resolved' and await J("Store.get('tk1').reviewedBy") == 'apps-mgr')
        await pg.click('[data-tdback="tm1"]'); await pg.wait_for_timeout(300)
        await pg.fill('.modal [name=note]', 'Attach the screenshot'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(400)
        c('send back → In Progress with the note', await J("Store.get('tm1').status") == 'In Progress' and 'Attach the screenshot' in await J("Store.get('tm1').instruction"))
        await J("Store.save({id:'tk2', c:'todo', team:'apps', task:'Quick one', analyst:'yousef', assigned:U.todayStr(), duration:1, status:'In Progress'})"); await s.go('#/home', 300); await s.go('#/todo', 500)
        await pg.click('[data-done="tk2"]'); await pg.wait_for_timeout(400)
        c('manager closing an analyst\'s To Do confirms it at once', await J("Store.get('tk2').status") == 'Resolved')
        c.done(s)
run(main())
