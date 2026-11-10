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
        c.done(s)
run(main())
