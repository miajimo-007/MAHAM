"""Project task sets (save ticked tasks as a set, add a set to another project with dates from a start day, edit in
Admin → Lists, only allowed people make sets) and shadow work groups that follow each team's task type list."""
from harness import app_session, Check, run, SHOTS

async def main():
    c = Check('task sets and shadow groups')
    async with app_session() as s:
        pg = s.page
        await s.js("""(() => { const t = U.todayStr();
          Store.save({ c: 'project', id: 'pj-a', name: 'Ward A go-live', team: 'apps', status: 'In Progress', manager: 'apps-mgr', start: t });
          Store.save({ c: 'project', id: 'pj-b', name: 'Ward B go-live', team: 'apps', status: 'In Progress', manager: 'apps-mgr', start: t });
          const tk = (id, n, title, due, pts) => Store.save({ c: 'ptask', id, project: 'pj-a', n, title, type: 'Task', points: pts, due: U.addDays(t, due), start: t, status: 'To Do', assignee: 'yousef', checklist: [{ t: 'Check with nurse', done: true }] });
          tk('a1', 1, 'Build order sets', 3, 2); tk('a2', 2, 'Train users', 6, 3); tk('a3', 3, 'Go-live support', 9, 5); })()""")
        await s.js("Store.flush()")
        t = await s.go('#/project/pj-a', 800)
        c('project page: "＋ Add task set" and "Save as task set"', await pg.locator('#tsadd').count() == 1 and await pg.locator('#tssave').count() == 1)
        await pg.click('#tssave'); await pg.wait_for_selector('#tss')
        await pg.fill('#tss [name=name]', 'Go-live checklist'); await pg.uncheck('[data-tsk="a3"]'); await pg.click('.modal [data-ok]'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        st = await s.js("TaskSets.all()[0]")
        c('set saved: 2 ticked tasks, gaps between dates kept, no people', st and st['name'] == 'Go-live checklist' and [x['title'] for x in st['tasks']] == ['Build order sets', 'Train users'] and st['tasks'][1]['dueOff'] - st['tasks'][0]['dueOff'] == 3 and 'assignee' not in st['tasks'][0], st)
        await s.go('#/project/pj-b', 800); await pg.click('#tsadd'); await pg.wait_for_selector('#tsf')
        start = await s.js("U.addDays(U.todayStr(), 10)"); await pg.fill('#tsf [name=start]', start); await pg.select_option('#tsf [name=who]', 'apps-mgr')
        c('preview lists the tasks with their due dates', 'Build order sets' in await pg.inner_text('#tsprev'))
        await pg.click('.modal [data-ok]'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        b = await s.js("Scrum.items('pj-b').sort((x, y) => x.n - y.n)")
        c('added to Ward B: 2 tasks, dates from the start day, checklist reset, given to the owner', len(b) == 2 and b[0]['due'] == await s.js(f"U.addDays('{start}', {st['tasks'][0]['dueOff']})") and b[0]['assignee'] == 'apps-mgr' and not b[0]['checklist'][0]['done'], b)
        t = await s.go('#/admin/lists', 700)
        c('Admin → Lists: Project task sets', 'Project task sets' in t and 'Go-live checklist' in t)
        await pg.click('[data-tsedit]'); await pg.wait_for_selector('#tse'); await pg.click('#tseadd'); await pg.wait_for_selector('#tse')
        await pg.fill('#tserows tr:last-child [data-f=title]', 'Sign-off'); await pg.fill('#tserows tr:last-child [data-f=dueOff]', '12'); await pg.click('.modal [data-ok]'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        c('edit: a task added to the set', [x['title'] for x in (await s.js("TaskSets.all()[0]"))['tasks']] == ['Build order sets', 'Train users', 'Sign-off'])
        # an analyst cannot make sets (hand-edit ignored), and sees no buttons on a project he does not plan
        await s.sign_in_as('yousef', 'analyst'); t = await s.go('#/project/pj-a', 700)
        c('an analyst sees no task set buttons', await pg.locator('#tsadd').count() == 0)
        await s.js("Store.save({ c: 'ptaskset', id: 'tset-fake', name: 'Fake', team: 'apps', tasks: [] })"); await s.js("Store.flush()")
        await s.sign_in_as('adam'); await s.js("Store.sync(true)"); await pg.wait_for_timeout(300)
        c("an analyst's set is ignored", not await s.js("Store.get('tset-fake')"))
        # shadow groups follow the team's list
        await s.js("Store.save({ id: 'settings-lists-bi', c: 'settings', lists: Object.assign({}, Store.lists('apps'), { taskTypes: ['>>> Reports', 'Report Validation', 'Visualization', 'Access'] }) })")
        g = await s.js("[Calc.category('PA >> Meeting', 'apps'), Calc.category('Report Validation', 'bi'), Calc.category('Access', 'bi'), Calc.category('Something new', 'bi')]")
        c('groups: "PA >> Meeting" → PA, under a heading → the heading, else the type itself (never OTHER)', g == ['PA', 'Reports', 'Reports', 'Something new'], g)
        cats = await s.js("Calc.categories('bi')")
        c('Category filter for BI lists its own groups', 'Reports' in cats and 'PA' not in cats, cats)
    c.done(s)

run(main())
