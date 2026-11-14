"""Converting Shadow work / Quick win ⇄ To Do follows who has the authority: an analyst cannot make a To Do (or convert
someone else's work); a manager can; someone acting for the manager on leave can; and a conversion is all or nothing —
if the new record is refused, the original is NOT removed."""
from harness import app_session, Check, run

async def main():
    c = Check('convert authority')
    async with app_session() as s:
        pg = s.page
        await s.js("""(() => { const t = U.todayStr();
          Store.save({ c: 'shadow', id: 'sw-cv1', analyst: 'yousef', team: 'apps', date: t, subject: 'Printer mapping', minutes: 30, taskType: 'Support', source: 'Phone' });
          Store.save({ c: 'shadow', id: 'sw-cv2', analyst: 'layla', team: 'apps', date: t, subject: 'Layla work', minutes: 20, taskType: 'Support', source: 'Phone' });
          Store.save({ c: 'quickwin', id: 'qw-cv1', analyst: 'yousef', team: 'apps', date: t, expected: t, subject: 'Faster label', status: 'In-Progress', type: 'Modification' }); })()""")
        await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        await s.sign_in_as('yousef', 'analyst')
        why = await s.js("[Conv.why(Store.get('sw-cv1'), 'todo'), Conv.why(Store.get('qw-cv1'), 'todo'), Conv.why(Store.get('sw-cv1'), 'quickwin'), Conv.why(Store.get('sw-cv2'), 'quickwin')]")
        c('analyst: shadow work → To Do is not offered', 'manager or team leader' in why[0], why)
        c('analyst: quick win → To Do is not offered', 'manager or team leader' in why[1], why)
        c('analyst: own shadow work → quick win is fine', why[2] == '', why)
        c("analyst: someone else's work cannot be converted", why[3] != '', why)
        # a hand-made attempt to do it anyway: both parts refused, the original stays
        await s.js("Store.saveMany([{ c: 'todo', id: 'td-cvx', task: 'Printer mapping', analyst: 'yousef', team: 'apps', assigned: U.todayStr(), status: 'In Progress', convertedFrom: { c: 'shadow', id: 'sw-cv1', by: 'yousef', at: Date.now() } }, Object.assign({}, Store.get('sw-cv1'), { _del: true, convertedTo: 'todo' })])")
        await pg.wait_for_timeout(300)
        c('a refused conversion leaves the original in place (all or nothing)', await s.js("!!Store.get('sw-cv1') && !Store.get('td-cvx')"))
        # the manager can
        await s.sign_in_as('apps-mgr')
        c("manager: shadow work → To Do is offered", await s.js("Conv.why(Store.get('sw-cv1'), 'todo')") == '')
        # someone acting for the manager on leave can too
        await s.sign_in_as('adam')
        await s.js("Store.save({ c: 'settings', id: 'settings-delegations', list: [{ from: 'apps-mgr', to: 'layla', start: U.todayStr() }] })"); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        await s.sign_in_as('layla', 'analyst')
        c('acting for the manager: shadow work → To Do is offered', await s.js("Conv.why(Store.get('sw-cv1'), 'todo')") == '', await s.js("Conv.why(Store.get('sw-cv1'), 'todo')"))
        await s.js("Conv.open(Store.get('sw-cv1'), 'todo')"); await pg.wait_for_selector('#recform')
        await pg.click('[data-save]'); await pg.wait_for_timeout(400); await s.js("Store.flush()"); await pg.wait_for_timeout(300); await s.js("Store.sync(true)")
        c('…and the conversion goes through and stays', await s.js("!Store.get('sw-cv1') && Store.all('todo', '*').some(t => t.convertedFrom && t.convertedFrom.id === 'sw-cv1')"))
        c.done(s)

run(main())
