"""One set of statuses per project (2026.11.11.7): every task type of a project follows the same statuses — the project's
own choice (Edit project → Task statuses), else the team default, else the department default, else the board columns.
Choices per task type from before are ignored; the older way of storing a project's choice (projects[pid] = wfId) is still
read. Only an admin (super admin / Admin with Task workflows for the team) changes it; others see it fixed. Changing it
asks where tasks go whose status the new set does not have. Admin → Project tasks shows a read-only overview."""
from harness import app_session, Check, run

async def main():
    c = Check('one set of statuses per project')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J("""(() => { const t = U.todayStr();
          const wf = (id, name, st) => ({ id, name, start: st[0], statuses: st.map((n, i) => ({ name: n, cat: i === 0 ? 'todo' : i === st.length - 1 ? 'done' : 'doing' })), trs: st.map((n, i) => ({ id: id + i, name: n, from: ['*'], to: n })) });
          Store.save({ c: 'settings', id: 'settings-taskflow-apps', flows: [wf('wf-a', 'Stages A', ['Initial', 'Build', 'Check', 'Done']), wf('wf-b', 'Bug flow', ['Open', 'Fixing', 'Fixed'])],
            types: { Bug: 'wf-b' }, projects: { 'pp-1': { all: 'wf-a', types: { Bug: 'wf-b' } }, 'pp-old': 'wf-a' } });
          for (const id of ['pp-1', 'pp-2', 'pp-old']) Store.save({ c: 'project', id, name: 'Project ' + id, team: 'apps', status: 'In Progress', manager: 'apps-mgr', members: ['yousef'], mode: 'kanban', start: t });
          const T = (id, project, type, status) => Store.save({ c: 'ptask', id, project, team: 'apps', n: 1, title: 'T ' + id, type, points: 1, status, assignee: 'yousef' });
          T('a-task', 'pp-1', 'Task', 'Initial'); T('a-bug', 'pp-1', 'Bug', 'Build'); T('b-bug', 'pp-2', 'Bug', 'To Do'); })()""")
        await J("Store.flush()"); await pg.wait_for_timeout(300)
        names = lambda tid: J(f"TaskFlow.forTask(Store.get('{tid}')).statuses.map(x => x.name).join('/')")
        c('every type of a project follows the same statuses (a Bug too)', await names('a-task') == await names('a-bug') == 'Initial/Build/Check/Done')
        c('old choices per task type are ignored (team "Bug flow")', 'Fixing' not in await names('b-bug'))
        c('the older way of storing a project\'s choice is still read', await J("TaskFlow.of(Store.get('pp-old')).name") == 'Stages A')
        c('the board is one column per status (never by category)', await J("(b => !b.byCat && b.cols.join('/') === 'Initial/Build/Check/Done')(TaskFlow.board(Store.get('pp-1')))"))
        # ---------- Edit project → Task statuses ----------
        await J("UI.editRecord('project', Store.get('pp-2'))"); await pg.wait_for_selector('#recform [name=taskflow]')
        opts = await J("[...document.querySelectorAll('#recform [name=taskflow] option')].map(o => o.textContent)")
        c('the project form has "Task statuses" (team default + the team\'s workflows)', opts[0].startswith('Team default') and 'Stages A' in opts and 'Bug flow' in opts, opts)
        await pg.select_option('#recform [name=taskflow]', 'wf-a'); await pg.click('[data-save]'); await pg.wait_for_selector('#tfmapgo', timeout=5000)
        c('changing it asks where tasks go (To Do is not in Stages A)', 'To Do' in await pg.inner_text('#modal'))
        await pg.select_option('[data-tfmap^="To Do|"]', 'Initial'); await pg.click('#tfmapgo'); await pg.wait_for_timeout(500)
        c('…the project now uses it, the task moved', await J("TaskFlow.of(Store.get('pp-2')).name") == 'Stages A' and await J("Store.get('b-bug').status") == 'Initial')
        # ---------- others see it fixed ----------
        await s.sign_in_as('apps-mgr', 'analyst')
        await J("UI.editRecord('project', Store.get('pp-2'))"); await pg.wait_for_selector('#recform')
        opts = await J("[...document.querySelectorAll('#recform [name=taskflow] option')].map(o => o.value)")
        c('a project owner who is not an admin sees it fixed (only the current choice)', opts == ['wf-a'], opts)
        await J("UI.closeModal()")
        # ---------- Admin overview ----------
        await s.sign_in_as('adam'); t = await s.go('#/admin/work/tasks', 800)
        c('Admin → Project tasks: a read-only overview, no per-type boxes', 'Which statuses each project uses' in t and await pg.locator('[data-tftype], [data-tfproj]').count() == 0)
        await J("Store.flush()"); await pg.wait_for_timeout(300); await J("Store.sync(true)"); await pg.wait_for_timeout(300)
        c('nothing refused by the trust check', not await J("Store.rejected.some(x => ['ptask', 'project', 'settings'].includes(x.c))"), await J("JSON.stringify(Store.rejected)"))
        c.done(s)

run(main())
