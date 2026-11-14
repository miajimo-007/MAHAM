"""Safety net for the project-task engine: several project setups side by side — Kanban (board columns), Scrum with a
sprint, a project on its own stage workflow (BI-style), a Lanes project and an external follow-up — each gets the
right statuses, board, form status list, moves, "done" and progress, saves through the form, and passes the trust check
after the files are read again. Also: the engine's one place that decides a task's workflow, and the form add-ons."""
from harness import app_session, Check, run

async def main():
    c = Check('project setups side by side')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J("""(() => { const t = U.todayStr();
          Store.save({ c: 'settings', id: 'settings-taskflow-apps', flows: [{ id: 'wf-stages', name: 'Stages', start: 'Initial', statuses: [{ name: 'Initial', cat: 'todo' }, { name: 'Gather', cat: 'doing' }, { name: 'Build', cat: 'doing' }, { name: 'Validation', cat: 'wait' }, { name: 'Done', cat: 'done' }], trs: ['Initial', 'Gather', 'Build', 'Validation', 'Done'].map((n, i) => ({ id: 'm' + i, name: n, from: ['*'], to: n })) }], projects: { 'ps-st': { all: 'wf-stages', types: {} } } });
          const P = (id, mode, extra) => Store.save(Object.assign({ c: 'project', id, name: 'Setup ' + id, team: 'apps', status: 'In Progress', manager: 'apps-mgr', members: ['yousef'], mode, start: t }, extra || {}));
          P('ps-kb', 'kanban'); P('ps-sc', 'scrum'); P('ps-st', 'kanban'); P('ps-ln', 'lanes', { lanes: [{ id: 'b', name: 'Build', color: '#2563eb', statuses: [{ id: 'b1', name: 'Open', cat: 'todo' }, { id: 'b2', name: 'Doing', cat: 'doing' }, { id: 'b3', name: 'Built', cat: 'done' }] }, { id: 'v', name: 'Validation', color: '#7c3aed', statuses: [{ id: 'v1', name: 'Waiting', cat: 'wait' }, { id: 'v2', name: 'Passed', cat: 'done' }] }] });
          Store.save({ c: 'sprint', id: 'ps-sp', project: 'ps-sc', team: 'apps', name: 'Sprint 1', status: 'Active', start: t, end: U.addDays(t, 13), n: 1 });
          const T = (id, project, status, extra) => Store.save(Object.assign({ c: 'ptask', id, project, team: 'apps', n: 1, title: 'Task ' + id, type: 'Task', points: 2, status, assignee: 'yousef' }, extra || {}));
          const cols = Scrum.columns(Store.get('ps-kb'));
          T('t-kb', 'ps-kb', cols[0]); T('t-sc', 'ps-sc', cols[0], { sprint: 'ps-sp' }); T('t-st', 'ps-st', 'Initial'); T('t-ln', 'ps-ln', 'Waiting', { lane: 'v' });
          Store.save({ c: 'central', id: 't-fu', team: 'apps', analyst: 'yousef', party: 'central', fuv: 2, n: 1, date: t, subject: 'FU', status: 'Under Review' }); })()""")
        await J("Store.flush()"); await pg.wait_for_timeout(300)
        # ---------- the one place that decides a task's workflow ----------
        w = await J("['t-kb','t-sc','t-st','t-ln','t-fu'].map(id => TaskFlow.forTask(Store.get(id)).statuses.map(x => x.name).join('/'))")
        cols = await J("Scrum.columns(Store.get('ps-kb')).join('/')")
        c('Kanban and Scrum follow the board columns', w[0] == cols and w[1] == cols, w)
        c('a project on its own workflow follows it', w[2] == 'Initial/Gather/Build/Validation/Done', w[2])
        c('a Lanes task follows its own lane', w[3] == 'Waiting/Passed', w[3])
        c('a follow-up follows its party\'s steps', w[4].startswith('Under Review'), w[4])
        c('the engine has the add-on registries (follow-ups, Lanes)', await J("!!TaskFlow.KINDS.central && !!TaskFlow.MODES.lanes && typeof TaskFlow.scheme === 'function'"))
        c('the task form add-ons are a visible list, in order', await J("Schemas.extensions('ptask').join(',')") == 'workflow,work items,waiting on a follow-up,workflow box,approval box,lanes,definition of done', await J("Schemas.extensions('ptask').join(',')"))
        # ---------- boards ----------
        for pid, want in [('ps-kb', cols), ('ps-st', 'Initial/Gather/Build/Validation/Done')]:
            got = await J(f"Scrum.columns(Store.get('{pid}')).join('/')")
            c(f'board of {pid}: one column per status', got == want, got)
        await J("ps('prj').tab = 'board'")
        for pid in ['ps-kb', 'ps-sc', 'ps-st', 'ps-ln']:
            await s.go('#/home'); t = await s.go(f'#/project/{pid}', 600)
            c(f'the board of {pid} opens with its task', 'Task t-' in t and not s.errors, s.errors[:1])
        # ---------- moves through the engine ----------
        for tid, to in [('t-kb', None), ('t-st', 'Build'), ('t-ln', 'Passed')]:
            target = to or cols.split('/')[-1]
            await J(f"TaskFlowUI.go('{tid}', {target!r})"); await pg.wait_for_timeout(400)
            if await pg.locator('#tfgo').count(): await pg.click('#tfgo'); await pg.wait_for_timeout(300)
            c(f'{tid} moves to {target}', await J(f"Store.get('{tid}').status") == target, await J(f"Store.get('{tid}').status"))
        c('done follows the category (Kanban last column, Lanes "Passed")', await J("Scrum.isDone(Store.get('t-kb')) && Scrum.isDone(Store.get('t-ln')) && !Scrum.isDone(Store.get('t-st'))"))
        c('progress counts them', await J("Scrum.progress(Store.get('ps-kb')) > 0 && Scrum.progress(Store.get('ps-ln')) > 0"))
        # ---------- the task form ----------
        await J("UI.editRecord('ptask', Store.get('t-st'))"); await pg.wait_for_selector('#recform [name=status]')
        st = await J("[...document.querySelectorAll('#recform [name=status] option')].map(o => o.value)")
        c('the form lists the project workflow\'s statuses', st[0] == 'Build' and 'Validation' in st, st)
        await pg.select_option('#recform [name=status]', 'Validation'); await pg.click('[data-save]'); await pg.wait_for_timeout(400)
        t = await J("Store.get('t-st')")
        c('saving a status change through the form records the move', t['status'] == 'Validation' and t['hist'][-1]['to'] == 'Validation', t.get('hist'))
        c('…and the waiting category is waiting', await J("TaskFlow.cat(Store.get('t-st'))") == 'wait')
        await J("UI.editRecord('ptask', Store.get('t-ln'))"); await pg.wait_for_selector('#recform [name=lane]')
        c('a Lanes task form has the Lane box', await J("[...document.querySelectorAll('#recform [name=status] option')].map(o => o.value).join('/')") == 'Waiting/Passed')
        await J("UI.closeModal()")
        await J("UI.editRecord('central', Store.get('t-fu'))"); await pg.wait_for_selector('#recform')
        c('a follow-up form opens with its party\'s reference name', 'Redmine' in await pg.inner_text('#recform'))
        await J("UI.closeModal()")
        # ---------- after reading all files again ----------
        await J("Store.flush()"); await pg.wait_for_timeout(400); await J("Store.sync(true)"); await pg.wait_for_timeout(300)
        c('everything passes the trust check', not await J("Store.rejected.some(x => ['ptask', 'project', 'central', 'sprint'].includes(x.c))"), await J("JSON.stringify(Store.rejected)"))
        c('…and stays', await J("['t-kb','t-st','t-ln'].map(id => Store.get(id).status).join()") == f"{cols.split('/')[-1]},Validation,Passed")
        c.done(s)

run(main())
