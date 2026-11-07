"""Project management: charter, health light, phases & milestones, timeline drag, risks & issues, weekly status, report, portfolio, Kanban mode."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('project management')
    async with app_session() as s:
        pg = s.page
        async def tab(k): await pg.click(f'[data-ptab="{k}"]'); await pg.wait_for_timeout(300); return await pg.inner_text('#main')
        await s.sign_in_as('apps-mgr'); await s.go('#/projects'); await pg.click('[data-add="project"]'); await pg.wait_for_selector('#recform')
        await pg.fill('#recform [name=name]', 'Lab Results Upgrade'); await pg.fill('#recform [name=goal]', 'Faster lab results for doctors')
        await pg.fill('#recform [name=success]', 'Results in under 5 minutes'); await pg.click('[data-save]'); await pg.wait_for_timeout(300)
        pid = await s.js("Store.all('project').find(p => p.name === 'Lab Results Upgrade').id")
        c('new project defaults to Kanban', await s.js(f"PM.mode(Store.get('{pid}'))") == 'kanban')
        t = await s.go(f'#/project/{pid}')
        c('opens on Overview with the charter', 'Faster lab results for doctors' in t and 'Charter' in t)
        c('Kanban project has no Sprints tab', await pg.locator('[data-ptab="sprints"]').count() == 0 and await pg.locator('[data-ptab="backlog"]').inner_text() == 'List')
        c('health light shown (green when new)', await s.js(f"PM.health(Store.get('{pid}')).k") == 'green')
        today = await s.js('U.todayStr()')
        # phases and milestones
        await pg.click('[data-pmph="phase"] >> nth=0'); await pg.wait_for_selector('#recform')
        await pg.fill('#recform [name=name]', 'Build'); await pg.fill('#recform [name=start]', await s.js("U.addDays(U.todayStr(), -20)")); await pg.fill('#recform [name=end]', await s.js("U.addDays(U.todayStr(), -2)"))
        await pg.click('[data-save]'); await pg.wait_for_timeout(300)
        await pg.click('[data-pmph="milestone"] >> nth=0'); await pg.wait_for_selector('#recform')
        await pg.fill('#recform [name=name]', 'Go-live'); await pg.fill('#recform [name=end]', await s.js("U.addDays(U.todayStr(), 10)")); await pg.click('[data-save]'); await pg.wait_for_timeout(300)
        c('phase and milestone saved', await s.js(f"PM.phases('{pid}').map(x => x.kind + ':' + x.name).join()") == 'phase:Build,milestone:Go-live')
        c('next milestone on the overview', 'Go-live' in await pg.inner_text('#main .kpis'))
        c('a late phase turns the light amber', await s.js(f"PM.health(Store.get('{pid}')).k") == 'amber')
        # tasks with dates and a dependency
        a = await s.js(f"Store.save({{c:'ptask', project:'{pid}', title:'Design screens', status:'To Do', start:U.addDays(U.todayStr(), 0), due:U.addDays(U.todayStr(), 5), n:1, team:'apps'}}).id")
        b = await s.js(f"Store.save({{c:'ptask', project:'{pid}', title:'Test screens', status:'To Do', start:U.addDays(U.todayStr(), 2), due:U.addDays(U.todayStr(), 8), after:'{a}', n:2, team:'apps'}}).id")
        c('starting before the task it depends on is due = clash', await s.js(f"PM.clash(Store.get('{b}'))"))
        t = await tab('timeline')
        c('timeline draws phase, milestone and task bars', await pg.locator('.gantt .g-bar').count() == 3 and await pg.locator('.gantt .g-ms').count() == 1)
        c('clash warning shown', 'starts before' in t)
        await pg.screenshot(path=f'{SHOTS}/pm_timeline.png', full_page=True)
        # drag the second task 4 days to the right
        bar = pg.locator(f'[data-gbar="ptask|{b}"]'); box = await bar.bounding_box()
        px = await s.js("(g => g.querySelector('.g-row:not(.g-head) .g-track').getBoundingClientRect().width / +g.dataset.gdays)(document.querySelector('.gantt'))")
        await pg.mouse.move(box['x'] + 8, box['y'] + box['height'] / 2); await pg.mouse.down(); await pg.mouse.move(box['x'] + 8 + px * 4, box['y'] + box['height'] / 2, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(400)
        c('drag moves start and due by 4 days', await s.js(f"(t => t.start === U.addDays(U.todayStr(), 6) && t.due === U.addDays(U.todayStr(), 12))(Store.get('{b}'))"))
        c('no clash after the move', not await s.js(f"PM.clash(Store.get('{b}'))"))
        # stretch the end of the first task by 2 days
        g = pg.locator(f'[data-gbar="ptask|{a}"] .g-grip'); box = await g.bounding_box()
        await pg.mouse.move(box['x'] + 3, box['y'] + 5); await pg.mouse.down(); await pg.mouse.move(box['x'] + 3 + px * 2, box['y'] + 5, steps=4); await pg.mouse.up(); await pg.wait_for_timeout(400)
        c('dragging the end only changes the due date', await s.js(f"(t => t.start === U.todayStr() && t.due === U.addDays(U.todayStr(), 7))(Store.get('{a}'))"))
        # risks & issues
        await tab('raid'); await pg.click('[data-pmraid]'); await pg.wait_for_selector('#recform')
        await pg.fill('#recform [name=title]', 'Vendor late with interface'); await pg.select_option('#recform [name=impact]', '3'); await pg.select_option('#recform [name=likelihood]', '3'); await pg.click('[data-save]'); await pg.wait_for_timeout(300)
        c('risk scored 9 = high', await s.js(f"PM.openHigh('{pid}').length") == 1 and '9' in await pg.inner_text('#main'))
        await pg.click('[data-raidk="Decision"]'); await pg.wait_for_timeout(200); c('filter by type', 'Vendor late' not in await pg.inner_text('#main'))
        # weekly status
        t = await tab('status'); await pg.click('[data-pmupd]'); await pg.wait_for_selector('#recform')
        await pg.select_option('#recform [name=health]', 'red'); await pg.fill('#recform [name=done]', 'Screens designed'); await pg.fill('#recform [name=blockers]', 'Waiting for vendor'); await pg.click('[data-save]'); await pg.wait_for_selector('#recform', state='detached'); await pg.wait_for_timeout(800)
        c('latest update sets the light', await s.js(f"PM.health(Store.get('{pid}')).k") == 'red')
        await pg.click('[data-pmupd]'); await pg.wait_for_selector('#recform'); c('same week: edits the existing update', await pg.input_value('#recform [name=done]') == 'Screens designed'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        rep = await s.js(f"PMV.report(Store.get('{pid}'))")
        c('status report has health, update, milestones, risks', all(x in rep for x in ['Off track', 'Screens designed', 'Go-live', 'Vendor late']))
        # kanban board: all open items, no sprint picker
        await tab('board'); c('Kanban board shows every open task, no sprint picker', await pg.locator('#spsel').count() == 0 and await pg.locator('.kanban .pcard').count() == 2)
        # portfolio
        await s.go('#/projects/portfolio'); t = await pg.inner_text('#main')
        c('portfolio lists the project with its light and blocker', 'Lab Results Upgrade' in t and 'Waiting for vendor' in t and 'Go-live' in t)
        await pg.screenshot(path=f'{SHOTS}/pm_portfolio.png', full_page=True)
        # members can add risks and updates, the rest of the team only looks
        await s.js(f"Store.save(Object.assign({{}}, Store.get('{pid}'), {{ members: ['yousef'] }}))")
        await s.sign_in_as('yousef'); await s.go(f'#/project/{pid}'); await tab('overview')
        c('member can post an update', await pg.locator('[data-pmupd]').count() >= 1)
        c('member cannot add phases', await pg.locator('[data-pmph]').count() == 0)
        await tab('timeline'); c('timeline bars are not draggable for a member', await pg.locator('[data-gbar]').count() == 0)
        c('analyst gets no portfolio tab', await s.go('#/projects') and await pg.locator('[data-pltab="portfolio"]').count() == 0)
        await s.sign_in_as('khalid'); await s.go('#/projects/portfolio'); c('director sees the portfolio', 'Lab Results Upgrade' in await pg.inner_text('#main'))
        c.done(s)
run(main())
