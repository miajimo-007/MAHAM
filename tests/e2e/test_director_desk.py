"""Director: short menu, Needs your attention, ask for update, escalation + decision, workload, timeline."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('director desk')
    async with app_session() as s:
        pg = s.page; J = s.js
        await s.sign_in_as('khalid')
        nav = await J("[...document.querySelectorAll('nav [data-nav]')].map(a => a.dataset.nav)")
        c('short menu: no analyst / manager pages', not any(k in nav for k in ['todo', 'shadow', 'helpdesk', 'attendance', 'manager']), nav)
        await J("""Store.saveMany([
          {c: 'mgrtask', id: 'dd1', task: 'Late audit', manager: 'apps-mgr', team: 'apps', date: U.addDays(U.todayStr(), -10), due: U.addDays(U.todayStr(), -2), status: 'Open'},
          {c: 'project', id: 'ddp', name: 'Old rollout', manager: 'apps-mgr', team: 'apps', start: U.addDays(U.todayStr(), -60), due: U.addDays(U.todayStr(), -5), status: 'In Progress', members: []}])"""); await J("Store.flush()")
        t = await s.go('#/home', 600); t = await s.open_watch()
        c('Watch lists the overdue task and the project behind (2026.11.13.6)', 'Projects behind' in t and 'Late audit' in t and 'Old rollout' in t, t[:800])
        await pg.click('[data-askup="dd1"]'); await pg.fill('.modal [name=text]', 'Where are we?'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300); await J("Store.flush()")
        await s.sign_in_as('apps-mgr'); await J("Store.sync(true)"); t = await s.go('#/home', 600)
        c('manager sees the request for an update', 'asked for an update' in t and 'Where are we?' in t)
        await J("Store.save(Object.assign({}, Store.get('dd1'), {update: 'Half done, finishing Sunday'}))"); await s.go('#/todo', 200); t = await s.go('#/home', 500)
        c('it disappears once he updates the task', 'asked for an update' not in t)
        # escalation
        await pg.click('[data-escalate="dd1"]'); await pg.fill('.modal [name=note]', 'Do we include LAB?'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300); await J("Store.flush()")
        await s.sign_in_as('khalid'); await J("Store.sync(true)"); t = await s.go('#/home', 600)
        c('decision needed on the directors list', 'Decision needed' in t and 'Do we include LAB?' in t)
        await pg.click('[data-answer="dd1"]'); await pg.fill('.modal [name=note]', 'Yes, include LAB'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300); await J("Store.flush()")
        await pg.screenshot(path=f'{SHOTS}/director_attention.png', full_page=True)
        await s.sign_in_as('apps-mgr'); await J("Store.sync(true)"); t = await s.go('#/home', 600)
        c('manager sees the decision', 'decided' in t and 'Yes, include LAB' in t)
        await s.sign_in_as('khalid'); t = await s.go('#/director/team', 600)
        c('workload under each manager', 'From you:' in t and 'open task' in t)
        t = await s.go('#/director/timeline', 600)
        c('timeline tab', 'Project timeline' in t and 'Old rollout' in t and await pg.locator('.tl-bar').count() >= 1)
        await pg.screenshot(path=f'{SHOTS}/director_timeline.png', full_page=True)
        await s.go('#/director/today', 300); await pg.click('[data-desk="apps"]'); await pg.wait_for_timeout(400)
        c('team desk still reachable', (await J("location.hash")) == '#/manager')
        c.done(s)
run(main())
