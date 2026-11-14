"""⚙ Board / ⚙ Lanes on a project's board (2026.11.12.8): only the project owner, an Admin with Task workflows for the team
and the super admin get it. Kanban / Scrum: limits only → still follows the team; statuses changed → own statuses
(renamed ones follow on the tasks, removed ones ask where tasks go), "Follow … again" puts it back. Lanes: saving gives
the project its own lanes (it stops following its template). Also: Analyst Desk Subject wide / Reference small, the
Shadow Works list has no "Hours by category", and Performance → Tasks overview."""
from harness import app_session, Check, run, SHOTS


async def main():
    c = Check('board button and tasks overview')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J("""(() => { const t = U.todayStr();
          Store.save({ c: 'project', id: 'be-k', name: 'Board edit kanban', team: 'apps', status: 'In Progress', manager: 'yousef', members: ['yousef', 'layla'], mode: 'kanban', start: t });
          const cols = Scrum.columns(Store.get('be-k')); window._cols = cols;
          const T = (id, n, st) => Store.save({ c: 'ptask', id, project: 'be-k', team: 'apps', n, title: 'Task ' + n, type: 'Task', points: 1, status: st, assignee: 'layla' });
          T('bk-1', 1, cols[0]); T('bk-2', 2, cols[1]); T('bk-3', 3, cols[cols.length - 1]);
          Store.save({ c: 'project', id: 'be-l', name: 'Board edit lanes', team: 'apps', status: 'In Progress', manager: 'yousef', members: ['yousef'], mode: 'lanes', laneSet: 'std', start: t });
          Store.save({ c: 'ptask', id: 'bl-1', project: 'be-l', team: 'apps', n: 1, title: 'Lane task', type: 'Task', points: 1, lane: 'work', status: 'In Progress', assignee: 'yousef' }); })()""")
        await J("Store.flush()"); await pg.wait_for_timeout(300)
        cols = await J("window._cols")
        # ---------- who gets the button ----------
        await J("ps('prj').tab = 'board'")
        await s.sign_in_as('layla', 'analyst'); await s.go('#/home'); await s.go('#/project/be-k', 700)
        c('a member does not get ⚙ Board', await pg.locator('#boardedit').count() == 0)
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/home'); await s.go('#/project/be-k', 700)
        c('the project owner gets ⚙ Board next to ＋ Add task', await pg.locator('.page-actions #boardedit').count() == 1 and '⚙ Board' in await pg.inner_text('#boardedit'))
        # ---------- limits only: still follows the team ----------
        await pg.click('#boardedit'); await pg.wait_for_selector('[data-bdrow="0"] .bd-wip')
        await pg.fill('[data-bdrow="0"] .bd-wip', '3'); await pg.click('[data-bdsave]'); await pg.wait_for_timeout(400)
        p = await J("Store.get('be-k')")
        c('only a WIP limit changed: saved, and the project still follows the team statuses', p.get('wip', {}).get(cols[0]) == 3 and not p.get('board'), (cols, p.get('wip'), p.get('board')))
        # ---------- statuses changed: own statuses, renamed ones follow, a removed one asks ----------
        await pg.click('#boardedit'); await pg.wait_for_selector('[data-bdrow="1"] .bd-name')
        await pg.fill('[data-bdrow="1"] .bd-name', 'Building')
        await pg.click('#bdadd'); await pg.wait_for_timeout(100)
        n = await J("document.querySelectorAll('[data-bdrow]').length")
        await pg.fill(f'[data-bdrow="{n - 2}"] .bd-name', 'Testing')   # added before the Done status
        await pg.click('[data-bddel="0"]'); await pg.wait_for_timeout(100)   # remove the first status (bk-1 is in it)
        await pg.click('[data-bdsave]'); await pg.wait_for_selector('#tfmapgo')
        c('removing a status that has tasks asks where they go', await pg.locator('[data-tfmap]').count() == 1)
        await pg.click('#tfmapgo'); await pg.wait_for_timeout(500)
        w = await J("TaskFlow.scheme(Store.get('be-k')).statuses.map(s => s.name)")
        c('the project now has its own statuses', await J("!!TaskFlow.ownFlow(Store.get('be-k'))") and 'Building' in w and 'Testing' in w and cols[0] not in w, w)
        c('the renamed status followed on its task', await J("Store.get('bk-2').status") == 'Building')
        c('the task of the removed status went to a status of the new set', await J("Store.get('bk-1').status") in w, await J("Store.get('bk-1').status"))
        main_t = await pg.inner_text('#main'); c('the board shows the new columns', all(x in main_t for x in ('Building', 'Testing')))
        await J("UI.editRecord('project', Store.get('be-k'))"); await pg.wait_for_selector('#recform [name=taskflow]')
        opts = await J("[...document.querySelectorAll('#recform [name=taskflow] option')].map(o => o.textContent).join('|')")
        c('Edit project → Task statuses shows only "its own statuses"', 'own statuses' in opts and '|' not in opts, opts); await J("UI.closeModal()")
        c('the change is in the board history', 'Building' in (await J("(Store.get('be-k').boardLog || []).map(x => x.what).join(' ')")))
        # ---------- back to the team's statuses ----------
        await s.go('#/home'); await s.go('#/project/be-k', 700)
        await pg.click('#boardedit'); await pg.wait_for_selector('[data-bdback]'); await pg.click('[data-bdback]'); await pg.wait_for_timeout(300)
        if await pg.locator('#tfmapgo').count(): await pg.click('#tfmapgo'); await pg.wait_for_timeout(500)
        c('"Follow … again": the project follows the team statuses again', await J("!Store.get('be-k').board && !TaskFlow.ownFlow(Store.get('be-k'))"))
        c('…every task has a status of the team set', await J(f"['bk-1', 'bk-2', 'bk-3'].every(id => {cols!r}.includes(Store.get(id).status))"), await J("['bk-1','bk-2','bk-3'].map(id => Store.get(id).status)"))
        # ---------- Lanes: ⚙ Lanes, saving drops the template ----------
        await s.go('#/home'); await s.go('#/project/be-l', 700)
        c('a Lanes project shows ⚙ Lanes to its owner', await pg.locator('#boardedit').count() == 1 and '⚙ Lanes' in await pg.inner_text('#boardedit'))
        await pg.click('#boardedit'); await pg.wait_for_selector('#lneditor')
        c('…it says the project follows its template', 'follows the lane template' in await pg.inner_text('.modal'))
        await J("""(() => { const i = document.querySelector('#lneditor input'); i.value = 'Delivery'; i.dispatchEvent(new Event('input', { bubbles: true })); })()""")
        await pg.click('[data-lnsave]'); await pg.wait_for_timeout(500)
        if await pg.locator('#tfmapgo').count(): await pg.click('#tfmapgo'); await pg.wait_for_timeout(500)
        p = await J("Store.get('be-l')")
        c('saving gives the project its own lanes (template dropped)', not p.get('laneSet') and [l['name'] for l in p.get('lanes') or []] == ['Delivery'], (p.get('laneSet'), p.get('lanes')))
        c('…its task is still in its lane and status', await J("Store.get('bl-1').status") == 'In Progress' and await J("Lanes.laneOf(Store.get('bl-1'), Store.get('be-l')).name") == 'Delivery')
        await pg.screenshot(path=f'{SHOTS}/board_edit.png')

        # ---------- Analyst Desk: Subject wide, Reference small ----------
        await s.sign_in_as('adam'); await J("Store.save({ c: 'shadow', analyst: 'adam', team: 'apps', date: U.todayStr(), taskType: (Store.list('taskTypes') || ['x'])[0], source: (Store.list('sources') || ['Call'])[0], subject: 'Earlier work for the Again chips', minutes: 15 })")
        await s.go('#/todo'); await s.go('#/home', 700)
        wd = await J("(() => { const sj = document.querySelector('#quicksw [name=subject]'), rf = document.querySelector('#quicksw [name=ref]'); return sj && rf ? [sj.getBoundingClientRect().width, rf.getBoundingClientRect().width] : null; })()")
        c('Analyst Desk shadow form: Subject wide, Reference small (with the Again chips showing)', bool(wd) and wd[0] > 1.5 * wd[1] and wd[1] <= 190, wd)
        # ---------- Shadow Works: no hours by category ----------
        t = await s.go('#/shadow', 600)
        c('Shadow Works list: no "Hours by category"', 'Hours by category' not in t)
        # ---------- Performance → Tasks overview ----------
        t = await s.go('#/perf/tasksov', 900)
        c('Performance has a "Tasks overview" tab', 'Tasks overview' in await pg.inner_text('.desk-tabs'))
        c('…with To Do, shadow work, quick wins, help desk, project tasks, follow-ups', all(x.lower() in t.lower() for x in ('To Do', 'Shadow work', 'Quick wins', 'Help desk', 'Project tasks', 'Follow-ups', 'Shadow work by category', 'Per person')), t[-600:])
        sw = await J("(() => { const y = App.year; return U.num(U.sum(Calc.shadow(y).filter(x => Store.scoredTeam().some(m => m.id === x.r.analyst)).map(x => x.hrs)), 1) + ' h'; })()")
        c('…its shadow hours match Performance (year so far)', sw in t, (sw, t[-400:]))
        await pg.select_option('#tov-who', 'adam'); await pg.wait_for_timeout(500)
        c('…the person box filters to one person', await pg.locator('#tov-people tbody tr').count() == 1)
        await pg.select_option('#tov-per', '1'); await pg.wait_for_timeout(500)
        c('…the period box picks a month', 'Jan' in await pg.inner_text('#main'))
        await pg.screenshot(path=f'{SHOTS}/tasks_overview.png', full_page=True)

        await J("Store.flush()"); await pg.wait_for_timeout(300); await J("Store.sync(true)")
        c('nothing refused by the trust check', not await J("Store.rejected.some(x => ['project', 'ptask'].includes(x.c))"), await J("JSON.stringify(Store.rejected.slice(0, 3))"))
        c('no page errors', not s.errors, s.errors)
        c.done(s)


def U_num(v):
    return f'{v:.1f}'


run(main())
