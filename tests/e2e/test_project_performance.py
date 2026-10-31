"""Performance → Projects: team metrics and per-employee metrics."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('project performance')
    async with app_session() as s:
        pg = s.page
        await s.sign_in_as('apps-mgr')
        y = await s.js("new Date().getFullYear()")
        await s.js(f"""(() => {{ const d = (m, dd) => `{y}-${{String(m).padStart(2,'0')}}-${{String(dd).padStart(2,'0')}}`; const today = U.todayStr();
          Store.saveMany([
            {{c: 'project', id: 'pp1', name: 'Order sets cleanup', manager: 'apps-mgr', team: 'apps', origin: 'team', start: d(1,5), due: d(2,28), status: 'Done', doneDate: d(2,20), members: ['yousef','layla'], progress: 100}},
            {{c: 'project', id: 'pp2', name: 'Nursing forms', manager: 'yousef', team: 'apps', origin: 'team', start: d(1,5), due: U.addDays(today, -3), status: 'In Progress', members: ['yousef','layla'], progress: 20}},
            {{c: 'sprint', id: 'sp1', project: 'pp1', name: 'Sprint 1', start: d(1,5), end: d(1,19), status: 'Completed', team: 'apps'}},
            {{c: 'ptask', id: 'pt1', project: 'pp1', title: 'Map sets', assignee: 'yousef', points: 5, status: 'Done', due: d(1,18), doneDate: d(1,15), startedOn: d(1,10), sprint: 'sp1', team: 'apps'}},
            {{c: 'ptask', id: 'pt2', project: 'pp1', title: 'Retire old sets', assignee: 'layla', points: 3, status: 'Done', due: d(1,18), doneDate: d(1,25), startedOn: d(1,12), sprint: 'sp1', team: 'apps'}},
            {{c: 'ptask', id: 'pt3', project: 'pp1', title: 'Leftover', assignee: 'layla', points: 2, status: 'To Do', sprint: 'sp1', team: 'apps'}},
            {{c: 'ptask', id: 'pt4', project: 'pp2', title: 'Design form', assignee: 'yousef', points: 3, status: 'In Progress', due: U.addDays(today, -1), team: 'apps'}},
            {{c: 'ptask', id: 'pt5', project: 'pp2', title: 'Nobody yet', points: 1, status: 'To Do', team: 'apps'}}]); }})()""")
        await s.go('#/home'); await s.js("ps('projperf').pview = 'team'"); t = await s.go('#/projperf', 600)
        c('Projects tab opens', 'Something went wrong' not in t and 'points delivered' in t.lower(), t[:300])
        P = await s.js("Calc.projPerf('apps', new Date().getFullYear()).T")
        c('points delivered = 8', P['ptsDone'] == 8, P)
        c('task on-time = 50%', abs(P['taskOnTime'] - .5) < 1e-9, P)
        c('sprint reliability = 80% (8 of 10 points)', abs(P['reliability'] - .8) < 1e-9, P)
        c('project on time = 100%', P['projOnTime'] == 1, P)
        c('at risk / overdue / unassigned', P['atRisk'] >= 1 and P['overdue'] == 1 and P['unassigned'] == 1, P)
        c('cycle time = 9 days', abs(P['cycle'] - 9) < 1e-9, P)
        await pg.screenshot(path=f'{SHOTS}/projperf_team.png', full_page=True)
        await pg.click('[data-pview="people"]'); await pg.wait_for_timeout(400); t = await pg.inner_text('#main')
        c('per employee view', 'per employee' in t.lower() and 'share of team points' in t.lower())
        R = await s.js("Calc.projPerf('apps', new Date().getFullYear()).people.find(x => x.m.id === 'yousef')")
        c('Yousef: 5 points, 1 overdue, owns 1', R['pts'] == 5 and R['overdue'] == 1 and R['owns'] == 1, R)
        await pg.screenshot(path=f'{SHOTS}/projperf_people.png', full_page=True)
        await s.sign_in_as('yousef'); t = await s.go('#/projperf', 600)
        c('analysts can view it', 'Per employee' in t or 'Points' in t)
        c('Project Performance is a tab of Performance', await pg.locator('nav [data-nav="perf"]').count() == 1 and 'Projects' in await s.go('#/perf', 500))
        t = await s.go('#/performance', 500); c('no Projects tab inside Performance any more', 'Points delivered' not in t)
        # a project-only team: hide To Do and help desk etc. for APPS → menu shows projects + Project Performance, dashboard shows projects
        await s.sign_in_as('adam')
        await s.js("Store.save({id: 'settings-teams', c: 'settings', teams: Store.teams().map(x => x.id === 'apps' ? Object.assign({}, x, {pageLevels: {todo: 'hide', shadow: 'hide', helpdesk: 'hide', performance: 'hide', lazy: 'hide', employee: 'hide'}}) : x)})")
        await s.sign_in_as('layla'); await pg.wait_for_timeout(300)
        nav = await s.js("[...document.querySelectorAll('nav [data-nav]')].map(a => a.dataset.nav)")
        c('project-only team menu', 'perf' in nav and 'todo' not in nav and 'helpdesk' not in nav and await s.js("!App.pageAllowed('performance') && App.pageAllowed('projperf')"), nav)
        t = await s.go('#/dashboard', 600); c('their Team Dashboard shows project performance', 'works in projects' in t and 'whole team' in t.lower(), t[:300])
        c.done(s)
run(main())
