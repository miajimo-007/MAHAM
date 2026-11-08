"""8 Nov: (a) a follow-up To Do started from a To Do — the manager creates it (linked both ways); an analyst adds a
personal follow-up or asks the manager, who makes it a To Do or declines with a reason. (Hand-on: test_todo_flow.py)"""
from harness import app_session, Check, run

async def main():
    c = Check('follow-up To Dos')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J("""Store.saveMany([{ c: 'todo', id: 'fu-1', analyst: 'yousef', team: 'apps', task: 'Build the sepsis alert', assigned: U.addDays(U.todayStr(), -2), duration: 3, status: 'In Progress' }])""")
        # ---------- (a) manager: ＋ Follow-up To Do ----------
        await s.sign_in_as('apps-mgr', 'analyst'); await J("UI.editRecord('todo', Store.get('fu-1'))"); await pg.wait_for_selector('#tfollow [data-tfnew]')
        await pg.click('#tfollow [data-tfnew]'); await pg.wait_for_selector('#recform [name=task]')
        c('the new To Do is filled in and says what it follows', 'Follow-up: Build the sepsis alert' in await pg.input_value('#recform [name=task]') and 'Follow-up of' in await pg.inner_text('#recform'))
        await pg.fill('#recform [name=task]', 'Train the ward nurses on the sepsis alert'); await pg.click('#modal [data-save]'); await pg.wait_for_timeout(300)
        kid = await J("Store.all('todo', '*').find(t => t.task.startsWith('Train the ward'))")
        c('follow-up saved, linked to the original', kid and kid['followOf'] == 'fu-1' and kid['analyst'] == 'yousef', kid)
        await J("UI.editRecord('todo', Store.get('fu-1'))"); await pg.wait_for_selector('#tfollow')
        c('the original lists its follow-ups', 'Train the ward nurses' in await pg.inner_text('#tfollow'))
        await J("UI.closeModal()"); await J("Store.flush()")
        # ---------- (a) analyst: personal follow-up, or ask the manager ----------
        await s.sign_in_as('yousef', 'analyst'); await J("UI.editRecord('todo', Store.get('fu-1'))"); await pg.wait_for_selector('#tfollow')
        c('analyst: no direct "Follow-up To Do"', await pg.locator('#tfollow [data-tfnew]').count() == 0 and await pg.locator('#tfollow [data-tfask]').count() == 1)
        if await pg.locator('#tfollow [data-tfpers]').count():
            await pg.click('#tfollow [data-tfpers]'); await pg.wait_for_selector('#recform [name=title]'); await pg.click('#modal [data-save]'); await pg.wait_for_timeout(300)
            c('personal follow-up task, linked', await J("Store.all('mytask', '*').some(t => t.owner === 'yousef' && t.followOf === 'fu-1')"))
            await J("UI.editRecord('todo', Store.get('fu-1'))"); await pg.wait_for_selector('#tfollow')
        await pg.click('#tfollow [data-tfask]'); await pg.wait_for_selector('#tfa'); await pg.fill('#tfa [name=text]', 'Write the downtime procedure for the alert'); await pg.click('#modal [data-ok]'); await pg.wait_for_timeout(300)
        c('request sent', await J("TodoFollow.asks(Store.get('fu-1')).length") == 1)
        await J("""Store.save({ c: 'todo', id: 'fu-forge', analyst: 'yousef', team: 'apps', task: 'self-made', assigned: U.todayStr(), status: 'In Progress', fromAsk: TodoFollow.asks()[0].id })"""); await J("Store.flush()"); await J("Store.sync(true)"); await pg.wait_for_timeout(300)
        c('an analyst cannot make the To Do themselves', await J("!Store.get('fu-forge')") and await J("TodoFollow.stateOf(TodoFollow.asks()[0]).st") == 'open')
        await J("Store.flush()")
        await s.sign_in_as('apps-mgr', 'analyst'); t = await s.go('#/manager', 500)
        c('manager sees the request on the desk', 'Follow-up requests' in t and 'Write the downtime procedure' in t)
        c('menu number includes it', await J("+(document.querySelector('nav a[data-nav=\"todo\"] .count') || {}).textContent || 0") >= 1)
        await pg.click('[data-tfacc]'); await pg.wait_for_selector('#recform [name=task]')
        c('"Make it a To Do" opens the form for the asker', await pg.input_value('#recform [name=task]') == 'Write the downtime procedure for the alert' and await pg.input_value('#recform [name=analyst]') == 'yousef')
        await pg.click('#modal [data-save]'); await pg.wait_for_timeout(300)
        c('request done: To Do made', await J("TodoFollow.stateOf(TodoFollow.asks()[0]).st") == 'made' and await J("TodoFollow.openForMe().length") == 0)
        # decline path
        await J("""(() => { const was = App.me; App.me = 'yousef'; Store.save({ c: 'todoask', id: 'todoask-yousef-x2', on: 'fu-1', team: 'apps', by: 'yousef', at: Date.now(), text: 'Another one' }); App.me = was; })()""")
        await J("TodoFollow.decline(Store.get('todoask-yousef-x2'))"); await pg.fill('#tfd [name=note]', 'Covered by the training To Do'); await pg.click('#modal [data-ok]'); await pg.wait_for_timeout(300)
        c('declined with a reason', await J("TodoFollow.stateOf(Store.get('todoask-yousef-x2')).st") == 'declined')
        c('no page errors', not s.errors, s.errors[:3])
        c.done(s)

run(main())
