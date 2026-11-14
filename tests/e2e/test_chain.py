"""Director task → manager → analysts: live status, roll-up, re-assign, director changes flow down, review & close."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('director → manager → analyst chain')
    async with app_session() as s:
        pg = s.page; J = s.js
        d10 = await J("U.addDays(U.todayStr(), 10)"); d12 = await J("U.addDays(U.todayStr(), 12)"); d5 = await J("U.addDays(U.todayStr(), 5)")
        st = lambda: J("Chain.status(Store.all('mgrtask').find(t => t.task === 'Audit order sets'))")
        mid = lambda: J("Store.all('mgrtask').find(t => t.task === 'Audit order sets').id")
        todo = lambda who: J(f"Store.all('todo', '*').find(t => t.analyst === '{who}' && t.task === 'Audit order sets')")
        # director assigns
        await s.sign_in_as('khalid'); await s.go('#/home')
        await pg.click('#dirassign'); await pg.wait_for_selector('#asgf'); await pg.fill('#asgf [name=task]', 'Audit order sets'); await pg.check('#asgf [name=who][value="apps-mgr"]'); await pg.fill('#asgf [name=due]', d10); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300)
        c('new task is Open', await st() == 'Open')
        # manager forwards with a later due date → warning
        await s.sign_in_as('apps-mgr'); await s.go('#/home'); await pg.click('[data-fwd]'); await pg.wait_for_selector('#fwdf')
        await pg.check('#fwdf [name=who][value="yousef"]'); await pg.check('#fwdf [name=who][value="nora"]'); await pg.fill('#fwdf [name=due]', d12); await pg.click('[data-ok]'); await pg.wait_for_timeout(300)
        c('warned: later than the director\'s due date', 'later than the director' in await pg.inner_text('#modal'))
        await pg.click('#modal [data-yes]'); await pg.wait_for_timeout(300)
        c('forwarded to 2 analysts → In Progress, 0 of 2', await st() == 'In Progress' and await J(f"JSON.stringify(Chain.progress(Store.get('{await mid()}')))") == '{"done":0,"total":2}')
        # director sees the chain
        await s.sign_in_as('khalid'); t = await s.go('#/home'); t = await s.open_watch()
        c('director sees 0 of 2 and the names', '0 of 2 analysts done' in t and 'Yousef' in t and 'Nora' in t)
        # analyst works and finishes; update rolls up
        await s.sign_in_as('yousef'); a = await todo('yousef')
        await J(f"Store.save(Object.assign({{}}, Store.get('{a['id']}'), {{comment: 'Checked 40 of 60 order sets', finish: U.todayStr(), status: 'Resolved'}}))")
        await s.sign_in_as('khalid'); t = await s.go('#/home'); t = await s.open_watch()
        c("director sees 1 of 2 and Yousef's update", '1 of 2 analysts done' in t and 'Checked 40 of 60 order sets' in t)
        # manager re-assigns Nora's part to Layla
        await s.sign_in_as('apps-mgr'); await s.go('#/mgrtasks'); await pg.click(f'[data-fwd="{await mid()}"]'); await pg.wait_for_selector('#fwdf')
        c('finished analyst cannot be removed', await pg.is_disabled('#fwdf [name=who][value="yousef"]'))
        await pg.uncheck('#fwdf [name=who][value="nora"]'); await pg.check('#fwdf [name=who][value="layla"]'); await pg.fill('#fwdf [name=due]', d10); await pg.click('[data-ok]'); await pg.wait_for_timeout(300)
        m = await todo('nora')
        c("Nora's To Do canceled as re-assigned (kept, not deleted)", m and m['status'] == 'Canceled' and 'Re-assigned' in m['cancelReason'])
        c("…so it does not count in Nora's score", await J("Calc.perf(new Date().getFullYear()).members.nora ? Object.values(Calc.perf(new Date().getFullYear()).members.nora).reduce((a, o) => a + (o.todo || 0), 0) : 0") == 0)
        c('Layla now has it', (await todo('layla'))['status'] == 'In Progress')
        # director changes due date + instruction → flows down to open To Dos only
        await s.sign_in_as('khalid'); await J(f"UI.editRecord('mgrtask', Store.get('{await mid()}'))"); await pg.wait_for_selector('#recform')
        c('director sees who is working on it in the task form', 'Who is working on it' in await pg.inner_text('#modal'))
        await pg.fill('#recform [name=due]', d5); await pg.fill('#recform [name=comment]', 'Focus on ICU order sets first'); await pg.click('[data-save]')
        await pg.wait_for_function("Store.all('todo', '*').some(t => t.analyst === 'layla' && t.task === 'Audit order sets' && t.dirNote === 'Focus on ICU order sets first')", timeout=10000)   # wait for the save, not a fixed time (slower machines)
        k = await todo('layla'); a = await todo('yousef')
        c("open To Do follows the new due date + director note", await J(f"U.addDays('{k['assigned']}', {k['duration']})") == d5 and k.get('dirNote') == 'Focus on ICU order sets first')
        c('finished To Do is left alone', not a.get('dirNote'))
        await s.sign_in_as('layla'); t = await s.go('#/home'); c('analyst sees "updated by director"', 'updated by director' in t and 'Focus on ICU order sets first' in t)
        await J(f"Store.save(Object.assign({{}}, Store.get('{k['id']}'), {{finish: U.todayStr(), status: 'Resolved', comment: 'ICU done'}}))")
        # all done → Ready for review → manager closes
        c('everyone done → Ready for review', await st() == 'Ready for review')
        await s.sign_in_as('apps-mgr'); t = await s.go('#/home')
        c('manager desk shows "ready for review"', 'ready for review' in t.lower())
        await pg.screenshot(path=f'{SHOTS}/chain_manager.png', full_page=True)
        await pg.click(f'[data-close-task="{await mid()}"]'); await pg.wait_for_selector('#clf'); await pg.fill('#clf [name=note]', 'All 60 checked, 4 fixed'); await pg.click('[data-ok]'); await pg.wait_for_timeout(300)
        c('closed → Done with the note', await st() == 'Done' and await J(f"Store.get('{await mid()}').closeNote") == 'All 60 checked, 4 fixed')
        await s.sign_in_as('khalid'); t = await s.go('#/home'); c('no longer open on the Director Desk', 'Open tasks you assigned' not in t or 'Audit order sets' not in t.split('Open tasks you assigned')[1].split('Projects')[0])
        # cancel and delete flow down
        await J("Store.saveMany([{c: 'mgrtask', id: 'mt-c', task: 'Cancel me', manager: 'apps-mgr', team: 'apps', date: U.todayStr(), status: 'In Progress'}, {c: 'mgrtask', id: 'mt-d', task: 'Delete me', manager: 'apps-mgr', team: 'apps', date: U.todayStr(), status: 'In Progress'}])")
        await s.sign_in_as('apps-mgr'); await J("Store.saveMany([{c: 'todo', id: 'td-c1', task: 'Cancel me', analyst: 'yousef', assigned: U.todayStr(), duration: 3, status: 'In Progress', fromTask: 'mt-c', team: 'apps'}, {c: 'todo', id: 'td-d1', task: 'Delete me', analyst: 'nora', assigned: U.todayStr(), duration: 3, status: 'In Progress', fromTask: 'mt-d', team: 'apps'}])")
        await s.sign_in_as('khalid'); await J("UI.editRecord('mgrtask', Store.get('mt-c'))"); await pg.wait_for_selector('#recform'); await pg.select_option('#recform [name=status]', 'Canceled'); await pg.click('[data-save]'); await pg.wait_for_timeout(400)
        c("director cancels → the analyst's To Do is canceled", await J("Store.get('td-c1').status") == 'Canceled')
        await J("UI.editRecord('mgrtask', Store.get('mt-d'))"); await pg.wait_for_selector('#recform'); await pg.click('[data-del]'); await pg.wait_for_timeout(200)
        c('delete warns about the forwarded To Do', 'will be canceled' in await pg.inner_text('#modal'))
        await pg.click('#modal [data-yes]'); await pg.wait_for_timeout(400)
        c('deleted → To Do canceled, not orphaned', await J("!Store.get('mt-d') && Store.get('td-d1').status === 'Canceled'"))
        # manager does it himself
        await J("Store.save({c: 'mgrtask', id: 'mt-s', task: 'Self task', manager: 'apps-mgr', team: 'apps', date: U.todayStr(), status: 'Open'})")
        await s.sign_in_as('apps-mgr'); await s.go('#/home'); await pg.click('[data-fwd="mt-s"]'); await pg.wait_for_selector('#fwdf'); await pg.check('#fwdf [name=self]'); await pg.click('[data-ok]'); await pg.wait_for_timeout(300)
        c('"I\'ll do it myself" → In Progress, can close', await J("Chain.status(Store.get('mt-s'))") == 'In Progress' and await J("Chain.canClose(Store.get('mt-s'))"))
        c.done(s)
run(main())
