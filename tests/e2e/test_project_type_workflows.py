"""9 Nov: a workflow per task type for each project (like a Jira workflow scheme per project).
Lookup: project + type → project (all types) → team + type → team default → department default → board columns.
Stored in settings-taskflow-<team>.projects[pid] = { all, types: { Bug, Task … } }; the old format (projects[pid] = wfId)
is still read. Admin → Task workflows → "Projects with their own workflow" is a table (All types + one column per type);
saving asks where tasks in a missing status go; mixed workflows → board by category; an Admin with Workflows (own team)
changes only their team's projects."""
from harness import app_session, Check, run

async def main():
    c = Check('project workflow per task type')
    async with app_session() as s:
        pg = s.page; J = s.js
        # ---------- setup: APPS has Standard (team default), Task, Story, Bug; Story tasks use Story (team + type) ----------
        await J("""(() => { const t = U.todayStr();
          const std = Object.assign(TaskFlow.example(), { name: 'Standard' }); const [tk, st, bg] = TaskFlow.examples();
          Store.save({ id: 'settings-taskflow-apps', c: 'settings', flows: [std, tk, st, bg], use: std.id, types: { Story: st.id },
            projects: { 'pj-c': tk.id, 'pj-z': bg.id } });   // old format: pj-c (open) and pj-z (finished) use one workflow for all types
          const P = (id, name, team, status) => Store.save({ c: 'project', id, name, team, status: status || 'In Progress', manager: 'apps-mgr', members: ['yousef', 'layla'], start: t });
          P('pj-a', 'Alpha', 'apps'); P('pj-b', 'Bravo', 'apps'); P('pj-c', 'Charlie', 'apps'); P('pj-e', 'Echo', 'apps'); P('pj-g', 'Golf', 'apps');
          P('pj-z', 'Zulu (finished)', 'apps', 'Done'); P('pj-d', 'Delta (BI)', 'bi');
          const T = (id, project, n, type, status) => Store.save({ c: 'ptask', id, project, n, title: type + ' ' + id, type, points: 1, status, assignee: 'yousef', reporter: 'apps-mgr' });
          T('a-bug', 'pj-a', 1, 'Bug', 'In Review'); T('a-task', 'pj-a', 2, 'Task', 'In Progress'); T('a-story', 'pj-a', 3, 'Story', 'Analysis');
          T('b-task', 'pj-b', 1, 'Task', 'To Do'); T('g-task', 'pj-g', 1, 'Task', 'To Do'); T('d-task', 'pj-d', 1, 'Task', 'To Do'); })()""")
        await J("Store.flush()")
        W = await J("Object.fromEntries(TaskFlow.teamRec('apps').flows.map(w => [w.name, w.id]))")
        of = lambda p, ty: J(f"TaskFlow.of(Store.get('{p}'), '{ty}').name")
        # ---------- the old format is still read ----------
        c('old format: Charlie uses Task for every type', await of('pj-c', 'Task') == 'Task' and await of('pj-c', 'Bug') == 'Task' and await of('pj-c', 'Story') == 'Task')
        c('nothing set for the project: team + type, then team default', await of('pj-e', 'Story') == 'Story' and await of('pj-e', 'Bug') == 'Standard')
        # ---------- Admin → Task workflows: the table ----------
        t = await s.go('#/admin/taskflows', 700)
        heads = await J("[...document.querySelectorAll('#tfprojs thead th')].map(x => x.textContent)")
        c('the table: Project, All types and one column per task type', heads == ['Project', 'All types', 'Story', 'Task', 'Bug'], heads)
        rows = await J("[...document.querySelectorAll('#tfprojs tbody tr td:first-child')].map(x => x.textContent)")
        c('one row per open project of the team (not finished ones, not other teams)', sorted(rows) == ['Alpha', 'Bravo', 'Charlie', 'Echo', 'Golf'], rows)
        c('an old-format choice shows under All types', await J("document.querySelector('[data-tfproj=\"pj-c\"][data-tfpty=\"\"]').value") == W['Task'])
        sel = lambda p, ty, w: pg.select_option(f'[data-tfproj="{p}"][data-tfpty="{ty}"]', w)
        await sel('pj-a', 'Bug', W['Bug']); await sel('pj-a', 'Task', W['Task'])          # Alpha: Bug → Bug, Task → Task (Story: team)
        await sel('pj-b', '', W['Bug']); await sel('pj-b', 'Task', W['Story'])           # Bravo: all → Bug, but Task → Story
        await sel('pj-g', '', W['Standard'])                                              # Golf: one workflow for everything
        await pg.click('#tfusesave'); await pg.wait_for_timeout(400)
        # ---------- the mapping step ----------
        c('a Bug left in "In Review" (not in Bug) → asks where it goes first', await pg.locator('[data-tfmap]').count() >= 1 and await J("Store.get('a-bug').status") == 'In Review')
        keys = await J("[...document.querySelectorAll('[data-tfmap]')].map(x => x.dataset.tfmap)")
        c('…for the Bug workflow, from In Review', f"In Review|{W['Bug']}" in keys, keys)
        await pg.select_option(f'[data-tfmap="In Review|{W["Bug"]}"]', 'UAT'); await pg.click('#tfmapgo'); await J("Store.flush()"); await pg.wait_for_timeout(300)
        r = await J("Store.get('a-bug')")
        c('…moved to the picked status with a history line', r['status'] == 'UAT' and r['hist'][-1]['tr'] == 'Workflow changed', r.get('status'))
        c('tasks already in a status of their new workflow are not touched', await J("Store.get('a-task').status") == 'In Progress' and not await J("Store.get('a-task').hist"))
        # ---------- saved in the new format; the lookup order ----------
        pr = await J("TaskFlow.teamRec('apps').projects")
        c('saved as { all, types }', pr['pj-a'] == {'all': '', 'types': {'Bug': W['Bug'], 'Task': W['Task']}} and pr['pj-b'] == {'all': W['Bug'], 'types': {'Task': W['Story']}}, pr)
        c('Charlie (shown, old format) is now in the new format, same choice', pr['pj-c'] == {'all': W['Task'], 'types': {}}, pr.get('pj-c'))
        c('a finished project not in the table keeps its old entry', pr['pj-z'] == W['Bug'], pr.get('pj-z'))
        c('projects left on Team default are not stored', 'pj-e' not in pr)
        c('project + type wins', await of('pj-a', 'Bug') == 'Bug' and await of('pj-a', 'Task') == 'Task' and await of('pj-b', 'Task') == 'Story')
        c('then project (all types) — even over team + type', await of('pj-b', 'Bug') == 'Bug' and await of('pj-b', 'Story') == 'Bug')
        c('then team + type, then team default', await of('pj-a', 'Story') == 'Story' and await of('pj-e', 'Task') == 'Standard')
        c('Charlie still uses Task for every type', await of('pj-c', 'Bug') == 'Task')
        u = await J(f"TaskFlowAdmin.users('{W['Bug']}').map(p => p.id).sort()")
        c('the workflow list counts projects through types too (and the finished one still on it)', u == ['pj-a', 'pj-b', 'pj-z'], u)
        # ---------- the board ----------
        b = await J("TaskFlow.board(Store.get('pj-a'))")
        c('a project mixing workflows → one column per category', b['byCat'], b)
        g = await J("TaskFlow.board(Store.get('pj-g'))")
        c('a project on one workflow → one column per status', not g['byCat'] and g['cols'] == ['To Do', 'In Progress', 'In Review', 'Done'], g)
        await s.go('#/project/pj-a', 600); await pg.click('.tabs >> text=Board'); await pg.wait_for_timeout(400)
        c('the board opens and cards show their own status', await pg.locator('.pc-stat').count() >= 3)
        # ---------- the page shows what is saved ----------
        await s.go('#/home', 300); await s.go('#/admin/taskflows', 600)
        c('the table shows the saved choices', await J("[document.querySelector('[data-tfproj=\"pj-a\"][data-tfpty=\"Bug\"]').value, document.querySelector('[data-tfproj=\"pj-b\"][data-tfpty=\"\"]').value]") == [W['Bug'], W['Bug']])
        # ---------- an Admin with Workflows (own team) ----------
        await J("saveMembersAll(Store.members().map(m => m.id === 'layla' ? Object.assign({}, m, { admin: true, adminAreas: ['workflows'], adminReach: 'team' }) : m))"); await J("Store.flush()")
        await s.sign_in_as('layla', 'analyst'); await s.go('#/admin/taskflows', 600)
        await sel('pj-e', 'Bug', W['Bug']); await pg.click('#tfusesave'); await pg.wait_for_timeout(400); await J("Store.flush()")
        await s.sign_in_as('adam'); await J("Store.rebuild()")
        c("her change to her team's project is accepted", await of('pj-e', 'Bug') == 'Bug')
        c("trust: another team's workflow settings are not hers", not await J("AdminRole.settingOk({ id: 'settings-taskflow-bi', c: 'settings', projects: { 'pj-d': { all: 'x', types: {} } } }, null, 'layla')"))
        before = await of('pj-d', 'Task')
        await J(f"Store.save(Object.assign({{}}, TaskFlow.teamRec('apps'), {{ projects: Object.assign({{}}, TaskFlow.teamRec('apps').projects, {{ 'pj-d': {{ all: '{W['Bug']}', types: {{}} }} }}) }}))")
        c("a APPS entry naming a BI project has no effect on it", await of('pj-d', 'Task') == before)
        c('no page errors', not s.errors, s.errors[:3])
    c.done(s)

run(main())
