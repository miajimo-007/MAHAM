"""Task workflows (Jira-style) for project tasks: with nothing set the board columns work as before; Admin → Task
workflows builds a workflow (statuses with categories, named moves, who may / must be true / then, screens), a team
default and a project override, resolutions, "Test as…", moving tasks whose status disappears, the board drag that
follows the workflow (snaps back with the reason), the transition screen, history, notices, and an Admin with
"Workflows" for their own team only."""
from harness import app_session, Check, run, SHOTS

async def main():
    c = Check('task workflows')
    async with app_session() as s:
        pg = s.page
        await s.js("""(() => { const t = U.todayStr();
          Store.save({ c: 'project', id: 'pj-w', name: 'Workflow project', team: 'apps', status: 'In Progress', manager: 'apps-mgr', members: ['yousef', 'layla'], start: t });
          Store.save({ c: 'project', id: 'pj-x', name: 'Other project', team: 'apps', status: 'In Progress', manager: 'apps-mgr', members: ['yousef'], start: t });
          const tk = (id, n, title, st, who) => Store.save({ c: 'ptask', id, project: 'pj-w', n, title, type: 'Task', points: 2, status: st, assignee: who, reporter: 'apps-mgr', checklist: [{ t: 'Step', done: false }] });
          tk('w1', 1, 'Write spec', 'To Do', 'yousef'); tk('w2', 2, 'Review build', 'In Review', 'yousef'); tk('w3', 3, 'Old finished', 'Done', 'layla');
          Store.save({ c: 'ptask', id: 'x1', project: 'pj-x', n: 1, title: 'Other task', points: 1, status: 'In Review', assignee: 'yousef' }); })()""")
        await s.js("Store.flush()")
        # ---------- nothing set: board columns, any move ----------
        w = await s.js("TaskFlow.of(Store.get('pj-w'))")
        c('nothing set → board columns, To Do / In Progress / Done categories', w['simple'] and [x['cat'] for x in w['statuses']] == ['todo', 'doing', 'doing', 'done'])
        c('done = the Done category', await s.js("Scrum.isDone(Store.get('w3')) && !Scrum.isDone(Store.get('w2'))"))
        # ---------- Admin → Task workflows ----------
        t = await s.go('#/admin/taskflows', 700)
        c('Admin → Work & workflows → Project tasks opens', 'Project tasks' in await pg.inner_text('.adm-sub') and 'Which workflow' in t and 'Resolutions' in t)
        await pg.fill('#tfres', 'Done\nNot needed\nDuplicate'); await pg.click('#tfressave'); await s.js("Store.flush()"); await pg.wait_for_timeout(200)
        c('resolutions are the admins\' own list', await s.js("TaskFlow.resolutions()") == ['Done', 'Not needed', 'Duplicate'])
        await pg.click('#tfnew'); await pg.wait_for_selector('#tfname')
        mt = await pg.inner_text('#main'); c('editor: picture, statuses, moves, test as', all(x in mt for x in ['Picture', 'Statuses', 'Moves (transitions)', 'Test as']))
        await pg.fill('#tfname', 'Development')
        # rename "In Review" → "Testing" (moves follow the rename)
        await pg.fill('[data-si="2"] .tfs-n', 'Testing'); await pg.dispatch_event('[data-si="2"] .tfs-n', 'change'); await pg.wait_for_timeout(200)
        d = await s.js("TFE.draft")
        c('renaming a status keeps its moves', any(x['to'] == 'Testing' for x in d['trs']) and any('Testing' in x['from'] for x in d['trs']), [x['to'] for x in d['trs']])
        # test as: yousef on a To Do task assigned to him → Start ok; on "Testing" → Done needs the owner
        await pg.select_option('#tftwho', 'yousef'); await pg.select_option('#tftst', 'Testing'); await pg.click('#tftgo'); await pg.wait_for_timeout(200)
        out = await pg.inner_text('#tftout')
        c('"Test as…": yousef cannot finish (only the project owner), can send back', '🔒 Done' in out and '✓ Back to work' in out, out)
        await pg.click('#tfsave'); await pg.wait_for_timeout(300); await s.js("Store.flush()")
        wf = await s.js("TaskFlow.teamRec('apps').flows[0]")
        c('workflow saved for APPS', wf and wf['name'] == 'Development' and len(wf['trs']) == 6)
        # team default → the mapping step for In Review → Testing
        await s.go('#/admin/taskflows', 600)
        await pg.select_option('#tfuse [name=use]', wf['id']); await pg.click('#tfusesave'); await pg.wait_for_timeout(300)
        c('switching asks where tasks in a missing status go', await pg.locator('[data-tfmap]').count() >= 1)
        await pg.select_option('[data-tfmap^="In Review|"]', 'Testing'); await pg.click('#tfmapgo'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        r = await s.js("Store.get('w2')")
        c('…tasks moved (In Review → Testing) with a history line', r['status'] == 'Testing' and r['hist'][-1]['tr'] == 'Workflow changed', r)
        c('the team default is in force', await s.js("TaskFlow.of(Store.get('pj-w')).name") == 'Development')
        # ---------- the engine ----------
        await s.sign_in_as('yousef', 'analyst')
        mv = await s.js("TaskFlow.moves(Store.get('w1')).map(m => m.tr.name + ':' + m.ok)")
        c('yousef on his To Do task: Start is offered', 'Start:true' in mv, mv)
        err = await s.js("TaskFlow.run(Store.get('w2'), TaskFlow.moves(Store.get('w2')).find(m => m.tr.to === 'Done').tr.id, {})")
        c('yousef cannot finish (only the project owner / team manager)', 'project owner' in err, err)
        # board: drag w1 to Testing → not a move → snaps back
        await s.go('#/project/pj-w', 700)
        await s.js("TaskFlowUI.go('w1', 'Testing')"); await pg.wait_for_timeout(300)
        c('board: a move the workflow does not have snaps back', await s.js("Store.get('w1').status") == 'To Do')
        await s.js("TaskFlowUI.go('w1', 'In Progress')"); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        r = await s.js("Store.get('w1')")
        c('board: Start runs → In Progress, history kept', r['status'] == 'In Progress' and r['hist'][-1]['tr'] == 'Start' and r['hist'][-1]['by'] == 'yousef', r.get('hist'))
        await pg.click('.tabs >> text=Board'); await pg.wait_for_timeout(400); c('cards show the workflow\'s moves as buttons', await pg.locator('[data-tfrun^="w1|"]').count() >= 1)
        # send for review needs the checklist ticked
        err = await s.js("TaskFlow.run(Store.get('w1'), TaskFlow.moves(Store.get('w1')).find(m => m.tr.to === 'Testing').tr.id, {})")
        c('a validator stops it: the checklist must be ticked', 'checklist' in err, err)
        await s.js("Store.save(Object.assign({}, Store.get('w1'), { checklist: [{ t: 'Step', done: true }] }))")
        err = await s.js("TaskFlow.run(Store.get('w1'), TaskFlow.moves(Store.get('w1')).find(m => m.tr.to === 'Testing').tr.id, {})")
        c('…ticked → it runs', err == '' and await s.js("Store.get('w1').status") == 'Testing', err)
        # the status field in the form only lists allowed moves
        await s.js("UI.editRecord('ptask', Store.get('w1'))"); await pg.wait_for_selector('#modal [name=status]')
        opts = await s.js("[...document.querySelectorAll('#modal [name=status] option')].map(o => o.value)")
        c('the form\'s status list = where it is + allowed moves', opts[0] == 'Testing' and 'Done' not in opts and 'In Progress' in opts, opts)
        c('the form shows the workflow box with history', 'Workflow' in await pg.inner_text('#modal') and 'Start' in await pg.inner_text('#modal .tfx'))
        await s.js("UI.closeModal()"); await s.js("Store.flush()")
        # ---------- the owner finishes on the screen: resolution + notice ----------
        await s.sign_in_as('apps-mgr'); await s.go('#/project/pj-w', 700)
        await s.js("TaskFlowUI.go('w1', 'Done')"); await pg.wait_for_selector('#tfscr')
        c('Done asks on a screen: resolution (admins\' list) + actual hours', await pg.locator('#tfscr [name=resolution]').count() == 1 and await pg.locator('#tfscr [name=actual]').count() == 1)
        await pg.select_option('#tfscr [name=resolution]', 'Not needed'); await pg.click('#tfgo'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        r = await s.js("Store.get('w1')")
        c('…done with the picked resolution and a done date', r['status'] == 'Done' and r['resolution'] == 'Not needed' and r['doneDate'], r)
        c('…the person assigned gets a notice', await s.js("Store.all('nudge').some(n => n.kind === 'flow' && n.to === 'yousef' && n.about === 'w1')"))
        # reopen needs a comment and clears the resolution
        tr = await s.js("TaskFlow.moves(Store.get('w1')).find(m => m.tr.name === 'Reopen').tr.id")
        c('reopen without a comment is refused', 'comment' in await s.js(f"TaskFlow.run(Store.get('w1'), '{tr}', {{}})"))
        await s.js(f"TaskFlow.run(Store.get('w1'), '{tr}', {{ comment: 'Found a gap' }})"); await s.js("Store.flush()")
        r = await s.js("Store.get('w1')")
        c('…with a comment: back to To Do, resolution cleared, comment kept', r['status'] == 'To Do' and not r.get('resolution') and await s.js("PM2.comments('w1').some(x => x.text.includes('Found a gap'))"))
        await s.sign_in_as('yousef', 'analyst'); t = await s.go('#/home', 600)
        c('Home: "Task updates for you"', 'Task updates for you' in t)
        # ---------- project override ----------
        await s.sign_in_as('adam')
        await s.js("Store.save(Object.assign({}, TaskFlow.teamRec('apps'), { id: 'settings-taskflow-apps', c: 'settings', projects: { 'pj-x': '' } }))")
        c('a project left on the team default follows it', await s.js("TaskFlow.of(Store.get('pj-x')).name") == 'Development')
        # ---------- the whiteboard: a workflow per task type, category board ----------
        await s.go('#/admin/taskflows', 600); await pg.click('#tfset'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        names = await s.js("TaskFlow.teamRec('apps').flows.map(w => w.name)")
        c('"Task, Story and Bug set" adds three workflows', all(x in names for x in ['Task', 'Story', 'Bug']), names)
        await s.go('#/admin/taskflows', 600)
        bug = await s.js("TaskFlow.teamRec('apps').flows.find(w => w.name === 'Bug').id")
        await pg.select_option('[data-tftype="Bug"]', bug); await pg.click('#tfusesave'); await pg.wait_for_timeout(300); await s.js("Store.flush()")
        c('Bug tasks follow the Bug workflow, others the team default', await s.js("TaskFlow.of(Store.get('pj-x'), 'Bug').name") == 'Bug' and await s.js("TaskFlow.of(Store.get('pj-x'), 'Task').name") == 'Development')
        await s.js("Store.save({ c: 'ptask', id: 'x2', project: 'pj-x', n: 2, title: 'Order set bug', type: 'Bug', points: 1, status: 'New', assignee: 'yousef' })"); await s.js("Store.flush()")
        b = await s.js("TaskFlow.board(Store.get('pj-x'))")
        c('mixed workflows → board by category (To Do · Waiting · In Progress · Done)', b['byCat'] and b['cols'] == ['To Do', 'Waiting', 'In Progress', 'Done'], b)
        await s.go('#/project/pj-x', 600); await pg.click('.tabs >> text=Board'); await pg.wait_for_timeout(400)
        c('cards show their own status', 'Troubleshooting' not in await pg.inner_text('#main') and await pg.locator('.pc-stat').count() >= 2)
        await s.js("TaskFlowUI.go('x2', 'Waiting')"); await pg.wait_for_timeout(300)
        c('dropping on "Waiting" asks which (On hold, Feedback, …)', await pg.locator('#modal [data-tfp]').count() >= 3)
        await pg.click('#modal [data-tfp="fb"]'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        c('…Feedback picked', await s.js("Store.get('x2').status") == 'Feedback')
        r = await s.js("(() => { const b = Store.get('x1'); const r = Object.assign({}, b, { type: 'Bug' }); Schemas.ptask.beforeSave(r, b); return r; })()")
        c('changing the type moves the status into the new workflow (same category)', r['status'] == 'Troubleshooting' and r['hist'][-1]['tr'] == 'Type changed', r.get('status'))
        # ---------- an Admin with Workflows (own team) ----------
        await s.js("saveMembersAll(Store.members().map(m => m.id === 'layla' ? Object.assign({}, m, { admin: true, adminAreas: ['workflows'], adminReach: 'team' }) : m))"); await s.js("Store.flush()")
        await s.sign_in_as('layla', 'analyst'); t = await s.go('#/admin/taskflows', 600)
        opts = await s.js("[...document.querySelectorAll('#tfscope option')].map(o => o.value)")
        c('Admin (own team): only APPS, no shared, no resolutions', opts == ['apps'] and 'Resolutions' not in t, opts)
        c('trust: her task-workflow setting for APPS is accepted, another team\'s is not', await s.js("AdminRole.settingOk({ id: 'settings-taskflow-apps', c: 'settings', flows: [] }, null, 'layla')") and not await s.js("AdminRole.settingOk({ id: 'settings-taskflow-bi', c: 'settings', flows: [] }, null, 'layla')") and not await s.js("AdminRole.settingOk({ id: 'settings-taskflow', c: 'settings', resolutions: ['x'] }, null, 'layla')"))
        await s.sign_in_as('adam'); await s.go('#/project/pj-w', 700)
        await pg.screenshot(path=f'{SHOTS}/task_workflows_board.png', full_page=True)
    c.done(s)

run(main())
