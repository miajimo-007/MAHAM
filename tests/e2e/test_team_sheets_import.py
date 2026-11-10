"""Import Old Data: a team's "Routine Tasks" sheet → shadow work, "Project Tasks" sheet → projects + tasks (Stage = status).
Test data only (made here)."""
import os, tempfile
from datetime import date
from openpyxl import Workbook
from harness import app_session, Check, run


def make(path):
    wb = Workbook(); wb.remove(wb.active)
    r = wb.create_sheet('Routine Tasks')
    r.append(['Init Date', 'Request ID', 'Staff', 'Task', 'Cat/Type', 'Status', 'Complete Date', 'Comment', 'Days'])
    r.append([date(2026, 10, 1), 55501, 'BI Manager', 'Reset user access', 'Access', 'Completed', date(2026, 10, 3), 'done fast', 2])
    r.append([date(2026, 10, 5), None, 'BI Manager', 'Build report', 'Report', 'Open', None, None, None])
    r.append([date(2026, 10, 6), 55503, 'Nobody Known', 'Old request', 'Other', 'Cancelled', None, 'dup', None])
    r.append([None, None, None, None, None, None, None, None, None])
    q = wb.create_sheet('Project Tasks')
    q.append(['Init Date', 'Project', 'TASK Details', 'Stage', 'Staff', 'Date Comp', 'Status', 'Days'])
    q.append([date(2026, 9, 1), 'Lab Interface', 'Map test codes', 'Completed', 'BI Manager', date(2026, 9, 20), 'Done', 19])
    q.append([date(2026, 9, 2), 'Lab Interface', 'Go-live checklist', 'Build', 'BI Manager', None, 'In progress', None])
    q.append([date(2026, 9, 3), 'Lab Interface', 'Train users', 'Not Started', 'Nobody Known', None, None, None])
    q.append([date(2026, 9, 4), 'Bed Board', 'Gather needs', 'UAT', 'BI Manager', date(2026, 9, 9), 'Done', 5])
    wb.save(path)


async def main():
    c = Check('team Routine Tasks / Project Tasks import')
    path = os.path.join(tempfile.mkdtemp(), 'BI.xlsx'); make(path)
    async with app_session() as s:
        pg = s.page
        await s.js("App.setViewTeam('bi')")
        await s.go('#/home'); await s.go('#/importdata'); await pg.set_input_files('#impfiles', [path]); await pg.wait_for_selector('#impgo2', timeout=60000)
        txt = await pg.inner_text('#impstatus')
        c('both sheets recognised', 'Routine Tasks → Shadow Works' in txt and 'Project Tasks → Projects' in txt, txt)
        c('unknown staff listed', 'Nobody Known' in txt, txt)
        await pg.fill('#impmin', '45')
        await pg.click('#impgo2'); await pg.wait_for_timeout(1500)

        sh = await s.js("Store.all('shadow','*').filter(r => r.id.startsWith('xl-bi-')).map(r => [r.subject, r.analyst, r.team, r.date, r.minutes, r.taskType, r.ref, r.source, r.fu])")
        c('2 shadow entries (unknown staff left out)', len(sh) == 2, sh)
        c('shadow fields', ['Reset user access', 'bi-mgr', 'bi', '2026-10-01', 45, 'Access', '55501', 'IT Request', False] in sh, sh)
        c('open routine task flagged FU', any(x[0] == 'Build report' and x[8] for x in sh), sh)
        c('new Cat/Type added to BI list', await s.js("['Access','Report'].every(t => Store.lists('bi').taskTypes.includes(t))"))

        ps = await s.js("Store.all('project').filter(p => p.team === 'bi').map(p => [p.id, p.name, p.manager, p.status])")
        c('2 BI projects owned by the BI manager', len(ps) == 2 and all(p[2] == 'bi-mgr' for p in ps), ps)
        c('Bed Board done, Lab Interface in progress', sorted((p[1], p[3]) for p in ps) == [('Bed Board', 'Done'), ('Lab Interface', 'In Progress')], ps)
        lab = next(p[0] for p in ps if p[1] == 'Lab Interface')
        cols = await s.js(f"Scrum.columns(Store.get('{lab}'))")
        c('stages are the board columns (to do → doing → done)', cols == ['Not Started', 'Build', 'Completed', 'UAT'], cols)
        t = await s.js(f"Scrum.items('{lab}').sort((a,b)=>a.n-b.n).map(t => [t.n, t.title, t.status, t.assignee, Scrum.isDone(t), t.doneDate])")
        c('tasks with stage as status', [x[:4] for x in t] == [[1, 'Map test codes', 'Completed', 'bi-mgr'], [2, 'Go-live checklist', 'Build', 'bi-mgr'], [3, 'Train users', 'Not Started', '']], t)
        c('done follows the stage', [x[4] for x in t] == [True, False, False] and t[0][5] == '2026-09-20', t)
        c('progress from tasks', await s.js(f"Scrum.progress(Store.get('{lab}'))") == 33)

        # importing again: no duplicates
        await s.go('#/home'); await s.go('#/importdata'); await pg.set_input_files('#impfiles', [path]); await pg.wait_for_selector('#impgo2', timeout=60000)
        await pg.click('#impgo2'); await pg.wait_for_timeout(1500)
        n = await s.js("[Store.all('shadow','*').filter(r => r.id.startsWith('xl-bi-')).length, Store.all('project').filter(p => p.team === 'bi').length, Store.all('ptask').filter(t => t.team === 'bi').length]")
        c('no duplicates on re-import', n == [2, 2, 4], n)
        txt = await s.go('#/project/' + lab, 800)
        c('project page opens', 'Map test codes' in txt or 'Lab Interface' in txt, txt[:300])

        # ---- undo the import (2026.11.10.2) ----
        logs = await s.js("Importer.logs().map(g => [g.team, g.counts, g.ids.length, !!g.undone])")
        c('one import listed (the re-import added nothing)', len(logs) == 1 and logs[0][0] == 'bi' and logs[0][1] == {'shadow': 2, 'project': 2, 'ptask': 4} and logs[0][2] == 8, logs)
        # someone moves a task after the import → counted as changed since
        await s.sign_in_as('bi-mgr', 'manager')
        await s.js(f"(() => {{ const t = Scrum.items('{lab}').find(x => x.n === 2); Store.save(Object.assign({{}}, t, {{ status: 'Completed' }})); }})()")
        await pg.wait_for_timeout(1800)
        await s.sign_in_as('adam', 'admin'); await s.js("App.setViewTeam('bi')")
        c('the manager could move it', await s.js(f"Scrum.items('{lab}').find(x => x.n === 2).status") == 'Completed')
        c('changed since import counted', await s.js("Importer.changedSince(Store.all('importlog')[0])") == 1)
        await s.go('#/home'); txt = await s.go('#/importdata', 600)
        c('Past imports shows it with Undo', 'Past imports' in txt and await pg.locator('[data-impundo]').count() == 1, txt[-500:])
        await pg.click('[data-impundo]'); await pg.wait_for_selector('#modal [data-yes]')
        msg = await pg.inner_text('#modal')
        c('confirm says what goes and what changed', 'removes 8 record(s)' in msg and '1 of them were changed' in msg, msg)
        await pg.click('#modal [data-yes]'); await pg.wait_for_timeout(2500)   # past the trust re-check
        n = await s.js("[Store.all('shadow','*').filter(r => r.id.startsWith('xl-bi-')).length, Store.all('project').filter(p => p.team === 'bi').length, Store.all('ptask').filter(t => t.team === 'bi').length]")
        c('everything it added is gone (after the trust re-check)', n == [0, 0, 0], n)
        tf = await s.js("(() => { const r = Store.get('settings-taskflow-bi') || {}; return [(r.flows || []).map(w => w.id), Object.keys(r.projects || {})]; })()")
        c('its workflow and project picks removed', tf == [[], []], tf)
        c('its task types removed', await s.js("!['Access','Report'].some(t => Store.lists('bi').taskTypes.includes(t))"))
        c('marked undone, no second Undo', await s.js("!!Store.all('importlog')[0].undone") and await pg.locator('[data-impundo]').count() == 0)
        # import again after undo works (deleted ids come back)
        await s.go('#/home'); await s.go('#/importdata'); await pg.set_input_files('#impfiles', [path]); await pg.wait_for_selector('#impgo2', timeout=60000)
        await pg.click('#impgo2'); await pg.wait_for_timeout(2500)
        n = await s.js("[Store.all('shadow','*').filter(r => r.id.startsWith('xl-bi-')).length, Store.all('project').filter(p => p.team === 'bi').length, Store.all('ptask').filter(t => t.team === 'bi').length]")
        c('can import again after undo', n == [2, 2, 4], n)
        # an import that overwrote records: undo puts them back
        await s.js("(() => { const r = Store.all('shadow','*').find(x => x.subject === 'Reset user access'); Store.save(Object.assign({}, r, { minutes: 99 })); })()")
        await s.go('#/home'); await s.go('#/importdata'); await pg.set_input_files('#impfiles', [path]); await pg.wait_for_selector('#impgo2', timeout=60000)
        await pg.check('#impover'); await pg.click('#impgo2'); await pg.wait_for_timeout(1500)
        c('overwrite import set minutes back to 30', await s.js("Store.all('shadow','*').find(x => x.subject === 'Reset user access').minutes") == 30)
        await s.js("Importer.undo(Importer.logs()[0])"); await pg.wait_for_timeout(2500)
        c('undo of an overwrite puts the old record back', await s.js("(Store.all('shadow','*').find(x => x.subject === 'Reset user access') || {}).minutes") == 99)
        c('the earlier import is untouched', await s.js("Store.all('ptask').filter(t => t.team === 'bi').length") == 4)
        # only the super admin sees Past imports
        await s.sign_in_as('bi-mgr', 'manager'); await s.go('#/home'); await s.go('#/importdata', 600)
        c('managers do not see Past imports / Undo', await pg.locator('#implogs').count() == 0)
        c.done(s)
run(main())
