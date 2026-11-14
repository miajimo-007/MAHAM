"""No text spills: with long names and texts, every page (menu, tabs, sub-tabs, Admin, a project's tabs, a person's page,
a meeting) and the main forms and windows are opened at 1366 px (a common work PC). Nothing may stick out of its box, the
page may not scroll sideways, and IDs / keys / dates may not break in the middle. (tests/e2e/spill.py does the work.)"""
from harness import app_session, Check, run
from spill import crawl

async def main():
    c = Check('no spill')
    async with app_session() as s:
        f = await crawl(s, [1366], extra=['#/project/sp-p1', '#/project/sp-p2', '#/project/sp-p3', '#/admin/work/tasks', '#/workdash', '#/projects/mine', '#/employee/yousef', '#/meeting/meeting-adam-sp', '#/adminperson/yousef', '#/todo/scheduled'])
        lines = [f"{r} | {p['k']} +{p['over']} | {p['where'][:50]} | {p.get('text', '')[:50]}" for r, ps in f.items() for p in ps]
        for l in lines[:40]: print('   ', l)
        c('nothing spills, breaks or scrolls sideways on any page or window', not lines, f'{len(lines)} problem(s)')
        c.done(s)

run(main())
