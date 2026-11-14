"""Scrum the Scrum Guide way: Product owner / Scrum master / sprint length / Definition of Done on the project form; the
next sprint suggested with the sprint length; the backlog ordered by dragging (kept); capacity against the average
velocity; the Daily view; review + retrospective on Complete sprint (kept, actions to my personal tasks); the Definition of
Done asked when a task is finished (board) and required in the task form, cleared when reopened."""
from harness import app_session, Check, run, SHOTS

async def main():
    c = Check('Scrum guide')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J("""(() => { const t = U.todayStr(); const d = n => U.addDays(t, -n);
          Store.save({ c: 'project', id: 'sg-p', name: 'Scrum guide', team: 'apps', status: 'In Progress', manager: 'apps-mgr', members: ['yousef', 'layla'], mode: 'scrum', start: d(40) });
          Store.save({ c: 'sprint', id: 'sg-s0', project: 'sg-p', team: 'apps', name: 'Sprint 0', status: 'Completed', start: d(30), end: d(17), n: 1, donePoints: 8, committed: 10 });
          Store.save({ c: 'sprint', id: 'sg-s1', project: 'sg-p', team: 'apps', name: 'Sprint 1', status: 'Active', start: d(3), end: U.addDays(t, 10), n: 2 });
          const cols = Scrum.columns(Store.get('sg-p'));
          const T = (id, n, sprint, st, pts, who, extra) => Store.save(Object.assign({ c: 'ptask', id, project: 'sg-p', team: 'apps', n, title: 'Task ' + n, type: 'Task', points: pts, status: st, assignee: who, sprint }, extra || {}));
          T('sg-1', 1, 'sg-s1', cols[1], 5, 'yousef', { hist: [{ at: Date.now() - 3600e3, by: 'yousef', from: cols[0], to: cols[1], tr: 'x' }] }); T('sg-2', 2, 'sg-s1', cols[0], 5, 'layla'); T('sg-3', 3, '', cols[0], 1, ''); T('sg-4', 4, '', cols[0], 1, ''); T('sg-5', 5, '', cols[0], 1, ''); })()""")
        await J("Store.flush()"); await pg.wait_for_timeout(300)
        cols = await J("Scrum.columns(Store.get('sg-p'))")
        # ---------- the project form ----------
        await J("UI.editRecord('project', Store.get('sg-p'))"); await pg.wait_for_selector('#recform [name=po]')
        await pg.select_option('#recform [name=po]', 'layla'); await pg.select_option('#recform [name=sm]', 'yousef'); await pg.select_option('#recform [name=sprintDays]', '7')
        await pg.fill('#recform [name=dod]', 'Tested by someone else\nThe owner has seen it'); await pg.click('[data-save]'); await pg.wait_for_timeout(400)
        p = await J("Store.get('sg-p')")
        c('project form: Product owner, Scrum master, sprint length, Definition of Done', p.get('po') == 'layla' and p.get('sm') == 'yousef' and p.get('sprintDays') == '7' and 'owner has seen it' in p.get('dod', ''), p)
        # ---------- sprint length ----------
        await J("ps('prj').tab = 'sprints'"); await s.go('#/home'); await s.go('#/project/sg-p', 600)
        await pg.click('#addsprint'); await pg.wait_for_selector('#recform [name=end]')
        st, en = await pg.input_value('#recform [name=start]'), await pg.input_value('#recform [name=end]')
        c('the next sprint is suggested with the sprint length (1 week)', await J(f"U.diffDays('{st}', '{en}')") == 6, (st, en))
        await J("UI.closeModal()")
        # ---------- backlog order + capacity ----------
        await J("ps('prj').tab = 'backlog'"); await s.go('#/home'); t = await s.go('#/project/sg-p', 600)
        c('capacity: planned points against the average velocity (10 / 8)', '10 planned / capacity ≈ 8' in t and 'more than the team usually finishes' in t, t[:500])
        await pg.drag_and_drop('[data-bkrow="sg-5"]', '[data-bkrow="sg-3"]'); await pg.wait_for_timeout(400)
        order = await J("[...document.querySelectorAll('[data-bkrow]')].map(x => x.dataset.bkrow).filter(id => ['sg-3','sg-4','sg-5'].includes(id))")
        c('dragging a backlog row puts it there, and the order is kept', order == ['sg-5', 'sg-3', 'sg-4'] and await J("Store.get('sg-5').rank < Store.get('sg-3').rank"), order)
        # ---------- the Daily ----------
        await J("ps('prj').tab = 'board'; ps('prj').sp = 'sg-s1'"); await s.go('#/home'); await s.go('#/project/sg-p', 600)
        await pg.check('#dailyv'); await pg.wait_for_timeout(300); t = await pg.inner_text('#main')
        c('the Daily: per person, what moved and what they work on', 'moved since' in t.lower() and 'yousef' in t.lower() and 'task 1' in t.lower(), t[:600])
        await pg.uncheck('#dailyv'); await pg.wait_for_timeout(200)
        # ---------- Definition of Done ----------
        await J(f"TaskFlowUI.go('sg-1', {cols[-1]!r})"); await pg.wait_for_selector('[data-dodok]')
        c('finishing a task asks for the Definition of Done', 'Tested by someone else' in await pg.inner_text('#modal'))
        await pg.click('[data-dodok]'); await pg.wait_for_timeout(200)
        c('…every line must be ticked', 'Tick every line' in await pg.inner_text('#modal') and await J("!Scrum.isDone(Store.get('sg-1'))"))
        for i in range(2): await pg.check(f'[data-dod="{i}"]')
        await pg.click('[data-dodok]'); await pg.wait_for_timeout(500)
        if await pg.locator('#tfgo').count(): await pg.click('#tfgo'); await pg.wait_for_timeout(300)
        c('…then the task is done (and marked as meeting the DoD)', await J("Scrum.isDone(Store.get('sg-1')) && Store.get('sg-1').dodOk === true"))
        await J("UI.editRecord('ptask', Store.get('sg-2'))"); await pg.wait_for_selector('#recform [name=status]')
        opts = await J("[...document.querySelectorAll('#recform [name=status] option')].map(o => o.value)")
        await pg.select_option('#recform [name=status]', [o for o in opts if o == cols[-1]] or opts[-1:]); await pg.click('[data-save]'); await pg.wait_for_timeout(300)
        c('the task form will not finish a task without "Definition of Done is met"', await J("!Scrum.isDone(Store.get('sg-2'))") and await pg.locator('#recform').count() == 1)
        await J("UI.closeModal()")
        # ---------- review + retrospective ----------
        await J("ps('prj').tab = 'sprints'"); await s.go('#/home'); await s.go('#/project/sg-p', 600)
        await pg.click('[data-spdone="sg-s1"]'); await pg.wait_for_selector('#retf [name=review]')
        await pg.fill('#retf [name=review]', 'Showed the label screen; pharmacy liked it'); await pg.fill('#retf [name=well]', 'Pairing'); await pg.fill('#retf [name=improve]', 'Smaller tasks')
        await pg.fill('#retf [name=actions]', 'Split tasks under 2 days\nDemo every Thursday'); await pg.check('#retf [name=mine]')
        await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(500)
        sp = await J("Store.get('sg-s1')")
        c('Complete sprint keeps the review and the retrospective', sp['status'] == 'Completed' and 'pharmacy liked it' in sp.get('review', '') and sp.get('retro', {}).get('actions') == ['Split tasks under 2 days', 'Demo every Thursday'], sp)
        c('…the actions went to my personal tasks', await J("Store.all('mytask').filter(t => t.owner === App.me && /retrospective of Sprint 1/.test(t.note || '')).length") == 2)
        t = await pg.inner_text('#main')
        c('the Sprints tab shows them with the sprint', 'Smaller tasks' in t)
        await pg.screenshot(path=f'{SHOTS}/scrum_guide.png', full_page=True)
        await J("Store.flush()"); await pg.wait_for_timeout(300); await J("Store.sync(true)")
        c('nothing refused by the trust check', not await J("Store.rejected.some(x => ['project', 'ptask', 'sprint', 'mytask'].includes(x.c))"), await J("JSON.stringify(Store.rejected)"))
        c.done(s)

run(main())
