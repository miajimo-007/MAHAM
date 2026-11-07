"""My Tasks (personal tasks): private, planned days, repeats, Done → log as shadow work / quick win,
Give to a teammate (same team) who accepts or declines; never mixed with the manager's To Dos."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('personal tasks')
    async with app_session() as s:
        pg = s.page; J = s.js
        await s.sign_in_as('yousef', 'analyst'); t = await s.go('#/mytasks', 500)
        c('My Tasks page, private note', 'Only you see your personal tasks' in t)
        c('My Tasks in the menu', await pg.locator('nav [data-nav="mytasks"]').count() == 1)
        await J("""(async () => { const d = n => U.addDays(U.todayStr(), n);
          Store.saveMany([{ c: 'mytask', owner: 'yousef', title: 'Call the vendor', status: 'Open', priority: 'High', due: d(1) },
                          { c: 'mytask', owner: 'yousef', title: 'Prepare test script', status: 'Open', plan: d(3) },
                          { c: 'mytask', owner: 'yousef', title: 'Check interface log', status: 'Open', plan: d(0), repeat: 'weekly' },
                          { c: 'mytask', owner: 'yousef', title: 'Review order sets', status: 'Open' }]); await Store.flush(); })()""")
        t = await s.go('#/home', 500)
        c("My Day: today's personal tasks with the Personal tag", 'Call the vendor' in t and 'Check interface log' in t and 'Personal' in t)
        c('My Day: a task planned for later is not shown yet', 'Prepare test script' not in t)
        c('the To Do count does not include personal tasks', await J("Calc.todos(null).every(x => x.r.c === 'todo')"))
        t = await s.go('#/mytasks', 500)
        c('Planned section shows the future task', 'Prepare test script' in t and 'Planned' in t)
        # repeating task: Done → next one planned, then "log it too?"
        rid = await J("Store.all('mytask').find(x => x.title === 'Check interface log').id")
        await pg.click(f'[data-ptdone="{rid}"]'); await pg.wait_for_timeout(400)
        nxt = await J("Store.all('mytask').filter(x => x.title === 'Check interface log' && x.status === 'Open').map(x => x.plan)")
        c('weekly repeat: the next one is planned a week later', nxt == [await J("U.addDays(U.todayStr(), 7)")], nxt)
        c('"log it too?" asks shadow work or quick win', await pg.locator('.modal [data-sw]').count() == 1 and await pg.locator('.modal [data-qw]').count() == 1)
        await pg.click('.modal [data-sw]'); await pg.wait_for_timeout(400)
        c('shadow work form opens with the task filled in', await pg.input_value('.modal [name=subject]') == 'Check interface log')
        await J("UI.closeModal()")
        # give to a teammate
        mates = await J("PT.teammates().map(m => m.id)")
        c('Give to: only my own team, no managers', 'layla' in mates and 'apps-mgr' not in mates and 'yousef' not in mates, mates)
        gid = await J("Store.all('mytask').find(x => x.title === 'Review order sets').id")
        await pg.click(f'[data-ptgive="{gid}"]'); await pg.select_option('.modal [name=to]', 'layla'); await pg.fill('.modal [name=note]', 'you know order sets'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300)
        did = await J("Store.all('mytask').find(x => x.title === 'Call the vendor').id")
        await J(f"Store.save(Object.assign({{}}, Store.get('{did}'), {{ offer: {{ to: 'nora', note: '', on: Date.now() }} }}))"); await J("Store.flush()")
        # layla accepts
        await s.sign_in_as('layla', 'analyst'); t = await s.go('#/home', 500)
        c("teammate sees the offer on My Day with Accept / Decline", 'Review order sets' in t and await pg.locator(f'[data-ptacc="{gid}"]').count() == 1)
        c("teammate does not see the giver's other personal tasks", 'Prepare test script' not in t and 'Call the vendor' not in t)
        await pg.click(f'[data-ptacc="{gid}"]'); await pg.wait_for_timeout(400); await J("Store.flush()")
        mine = await J("PT.today().map(x => x.title)")
        c('accepted: it is now her task', 'Review order sets' in mine, mine)
        t = await s.go('#/mytasks', 400); c('note from the giver kept', 'you know order sets' in t)
        # nora declines
        await s.sign_in_as('nora', 'analyst'); await s.go('#/mytasks', 400)
        await pg.click(f'[data-ptdec="{did}"]'); await pg.fill('.modal [name=why]', 'full this week'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300); await J("Store.flush()")
        c('declined: not in her tasks', 'Call the vendor' not in await J("PT.today().map(x => x.title).join('|')"))
        # back to the giver
        await s.sign_in_as('yousef', 'analyst'); t = await s.go('#/mytasks', 500)
        c('giver: handed-over task is out of Today and listed as accepted', 'accepted by Layla' in t and gid not in await J("PT.today().map(x => x.id).join('|')"))
        c('giver: declined task is back with the reason', 'declined by Nora' in t and 'full this week' in t and did in await J("PT.today().map(x => x.id).join('|')"))
        c('a declined task shows once (under Given to others)', t.count('Call the vendor') == 1, t.count('Call the vendor'))
        await pg.screenshot(path=f'{SHOTS}/my_tasks.png', full_page=True)
        # privacy for the manager
        await s.sign_in_as('apps-mgr'); t = await s.go('#/mytasks', 400)
        c("manager's My Tasks shows none of the analysts' tasks", 'Prepare test script' not in t and 'Review order sets' not in t)
        t = await s.go('#/manager', 500); c("analysts' personal tasks are not on the Manager Desk", 'Prepare test script' not in t and 'Check interface log' not in t)
        c.done(s)
run(main())
