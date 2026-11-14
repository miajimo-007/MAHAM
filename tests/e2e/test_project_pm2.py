"""Projects stage 2: checklist, subtasks, comments, hours, workload, suggestions → project, templates, baseline & slippage, close-out, lessons."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('project management stage 2')
    async with app_session() as s:
        pg = s.page
        async def tab(k): await pg.click(f'[data-ptab="{k}"]'); await pg.wait_for_timeout(300); return await pg.inner_text('#main')
        # an analyst suggests a project
        await s.sign_in_as('yousef'); await s.go('#/projects/ideas'); await pg.click('[data-rqnew]'); await pg.wait_for_selector('#recform')
        await pg.fill('#recform [name=title]', 'Pharmacy label reprint'); await pg.fill('#recform [name=problem]', 'Labels have to be reprinted by hand'); await pg.fill('#recform [name=benefit]', 'No manual reprints'); await pg.click('[data-save]'); await pg.wait_for_timeout(300)
        q = await s.js("Store.all('preq').find(x => x.title === 'Pharmacy label reprint').id")
        c('suggestion saved as Waiting, owned by the analyst', await s.js(f"(x => x.status === 'Waiting' && x.createdBy === 'yousef')(Store.get('{q}'))"))
        c('analyst cannot decide', not await s.js(f"PM2.canDecide(Store.get('{q}'))"))
        # the manager approves → project with the charter filled
        await s.sign_in_as('apps-mgr'); await s.go('#/projects/ideas')
        c('manager sees it under To decide', 'To decide' in await pg.inner_text('#main') and 'Pharmacy label reprint' in await pg.inner_text('#main'))
        await pg.click(f'[data-rqok="{q}"]'); await pg.wait_for_selector('#recform')
        c('project form filled from the suggestion', await pg.input_value('#recform [name=name]') == 'Pharmacy label reprint' and 'reprinted by hand' in await pg.input_value('#recform [name=goal]'))
        await pg.click('[data-save]'); await pg.wait_for_timeout(500)
        pid = await s.js(f"Store.get('{q}').project")
        c('suggestion approved and linked to the project', await s.js(f"Store.get('{q}').status") == 'Approved' and bool(pid) and await s.js(f"Store.get('{pid}').success") == 'No manual reprints')
        # tasks with checklist, subtask, hours
        await s.js(f"Store.save(Object.assign({{}}, Store.get('{pid}'), {{ members: ['yousef','layla'], start: U.todayStr(), due: U.addDays(U.todayStr(), 30) }}))")
        t1 = await s.js(f"Store.save({{c:'ptask', project:'{pid}', title:'Build reprint screen', status:'To Do', assignee:'yousef', start:U.todayStr(), due:U.addDays(U.todayStr(), 4), est: 10, n:1, team:'apps'}}).id")
        t2 = await s.js(f"Store.save({{c:'ptask', project:'{pid}', title:'Test reprint', status:'To Do', assignee:'yousef', start:U.addDays(U.todayStr(), 2), due:U.addDays(U.todayStr(), 5), est: 25, parent:'{t1}', n:2, team:'apps'}}).id")
        await s.go(f'#/project/{pid}'); await tab('board')
        await pg.wait_for_timeout(500); await s.js(f"UI.editRecord('ptask', Store.get('{t1}'))"); await pg.wait_for_selector('#clnew')
        await pg.wait_for_timeout(400)
        for i, step in enumerate(['Design', 'Code', 'Review']):
            for _ in range(3):
                await pg.fill('#clnew', step); await pg.press('#clnew', 'Enter')
                try: await pg.wait_for_function(f"PM2V.draft.list.length === {i + 1}", timeout=2000); break
                except Exception: pass
        await pg.click('[data-cli="0"]'); await pg.wait_for_timeout(300)
        try: await pg.wait_for_function(f"PM2.clDone(Store.get('{t1}')) === 1 && PM2.checklist(Store.get('{t1}')).length === 3", timeout=5000)
        except Exception: print('DEBUG', await s.js(f"JSON.stringify([PM2V.draft, Store.get('{t1}'), !!document.querySelector('.ptx')])"))
        c('checklist saved at once (1/3)', await s.js(f"PM2.clDone(Store.get('{t1}')) + '/' + PM2.checklist(Store.get('{t1}')).length") == '1/3')
        await pg.fill('#cmnew', 'Vendor API docs are in the shared folder'); await pg.click('#cmadd'); await pg.wait_for_timeout(250)
        c('comment posted', await s.js(f"PM2.comments('{t1}').length") == 1 and await s.js(f"PM2.comments('{t1}')[0].createdBy") == 'apps-mgr')
        await pg.fill('#recform [name=title]', 'Build reprint screen v2'); await pg.click('[data-save]'); await pg.wait_for_timeout(300)
        c('saving the form keeps the checklist', await s.js(f"PM2.checklist(Store.get('{t1}')).length") == 3 and await s.js(f"Store.get('{t1}').title") == 'Build reprint screen v2')
        t = await pg.inner_text('#main')
        c('card badges: checklist, subtasks, comments, hours', all(x in t for x in ['☑ 1/3', '⧉ 0/1', '💬 1', '⏱ 10']))
        # workload
        await s.go('#/projects/workload'); t = await pg.inner_text('#main')
        c('workload: yousef has 2 tasks / 35h this week → red', await pg.locator('td.wl.bad').count() >= 1 and '35h' in t)
        await pg.click('td.wl.bad >> nth=0'); await pg.wait_for_timeout(250); c('click shows the tasks', 'Test reprint' in await pg.inner_text('.modal')); await pg.keyboard.press('Escape')
        await pg.screenshot(path=f'{SHOTS}/pm_workload.png', full_page=True)
        # baseline & slippage
        await s.go(f'#/project/{pid}'); await s.js(f"Store.save({{c:'pphase', project:'{pid}', kind:'milestone', name:'Go-live', end:U.addDays(U.todayStr(), 20), status:'Planned', team:'apps'}})")
        await tab('timeline'); await pg.click('[data-blset=""]'); await pg.wait_for_timeout(300)
        c('baseline set', bool(await s.js(f"PM2.baseline(Store.get('{pid}'))")))
        m = await s.js(f"PM.milestones('{pid}')[0].id"); await s.js(f"Store.save(Object.assign({{}}, Store.get('{m}'), {{ end: U.addDays(U.todayStr(), 27) }}))"); await s.js(f"Store.save(Object.assign({{}}, Store.get('{t2}'), {{ due: U.addDays(U.todayStr(), 9) }}))")
        await tab('timeline'); c('baseline ghosts drawn', await pg.locator('.g-base').count() >= 2 and await pg.locator('.g-ms.base').count() == 1)
        t = await tab('overview'); c('overview shows the slip (+7 days, 1 task slipped)', '+7 days' in t and '1 task slipped' in t)
        await pg.screenshot(path=f'{SHOTS}/pm_overview2.png', full_page=True)
        # actual hours + reports
        await s.js(f"Store.save(Object.assign({{}}, Store.get('{t1}'), {{ status: 'Done', actual: 14 }}))")
        t = await tab('reports'); c('estimated vs actual shown', 'Estimated vs actual hours' in t and '140%' in t)
        # template
        await pg.click('#savetpl'); await pg.fill('.modal [name=name]', 'Label project'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300)
        c('template saved with phases and tasks', await s.js("(t => t && t.tasks.length === 2 && t.phases.length === 1 && t.tasks.some(x => x.parent && t.tasks.some(y => y.key === x.parent && y.key !== x.key)))(Store.all('ptemplate')[0])"))
        await s.go('#/projects/mine'); await pg.click('#fromtpl'); await pg.click('[data-tpuse]'); await pg.wait_for_selector('#recform')
        await pg.fill('#recform [name=name]', 'Radiology label reprint'); await pg.fill('#recform [name=start]', await s.js("U.addDays(U.todayStr(), 10)")); await pg.click('[data-save]'); await pg.wait_for_timeout(600)
        np = await s.js("Store.all('project').find(p => p.name === 'Radiology label reprint').id")
        c('new project from the template: tasks, subtask link, dates shifted', await s.js(f"(l => l.length === 2 && l.some(t => t.parent) && l.find(t => t.title.startsWith('Build')).start === U.addDays(U.todayStr(), 10))(Scrum.items('{np}'))"))
        c('checklist copied, unticked', await s.js(f"(t => t.checklist.length === 3 && !t.checklist.some(x => x.done))(Scrum.items('{np}').find(t => t.title.startsWith('Build')))"))
        # close-out
        await s.js(f"Store.save({{c:'praid', project:'{pid}', kind:'Risk', title:'Printer driver', status:'Open', impact:'2', likelihood:'2', team:'apps'}})")
        await s.go(f'#/project/{pid}'); await pg.click('#closeout'); await pg.wait_for_selector('#cof')
        await pg.fill('#cof [name=impact]', '200 reprints a month saved'); await pg.fill('#cof [name=doBetter]', 'Ask the vendor for the API early'); await pg.click('.modal [data-ok]')
        try: await pg.wait_for_function(f"(() => {{ const p = Store.get('{pid}'); return p && p.status === 'Done' && !!p.closeout; }})()", timeout=15000)   # slower machines (CI)
        except Exception: pass
        await pg.wait_for_timeout(300)
        c('closed out: Done, lessons kept, risk closed, open task canceled', await s.js(f"(p => p.status === 'Done' && p.closeout.doBetter.includes('vendor'))(Store.get('{pid}'))") and await s.js(f"PM.raid('{pid}').every(r => r.status === 'Closed')") and await s.js(f"Store.get('{t2}').status") == 'Canceled')
        await s.go('#/projects/lessons'); c('lessons learned list', 'Ask the vendor for the API early' in await pg.inner_text('#main'))
        await s.go(f'#/project/{np}'); await tab('overview'); c('similar project shows the lesson', 'Lessons from similar projects' in await pg.inner_text('#main'))
        # comments belong to their writer
        await s.sign_in_as('yousef'); ok = await s.js(f"(() => {{ const cm = PM2.comments('{t1}')[0]; Store.save(Object.assign({{}}, cm, {{ text: 'hacked' }})); return PM2.comments('{t1}')[0].text; }})()")
        c("analyst cannot change the manager's comment", ok != 'hacked')
        c('analyst has no workload tab', await s.go('#/projects') and await pg.locator('[data-pltab="workload"]').count() == 0)
        c.done(s)
run(main())
