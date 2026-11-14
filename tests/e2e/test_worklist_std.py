"""2026.11.13.2 — WorkList pages made the same: A ＋ New at the right end of the filter row, B one field order in every
work form (and Subject + Reference first on the Analyst Desk), C lists only with one line of totals (the quick wins
chart moved to Tasks overview), D one coloured status chip on To Do, quick wins, help desk, project tasks, follow-ups."""
import os
from harness import app_session, Check, run, SHOTS

SEED = r"""(() => { const t = U.todayStr();
  Store.saveMany([
    { c: 'todo', id: 'wl-td', task: 'Fix the discharge template', analyst: 'yousef', team: 'apps', assigned: U.addDays(t, -1), duration: 3, status: 'In Progress' },
    { c: 'todo', id: 'wl-td2', task: 'Check the order set', analyst: 'yousef', team: 'apps', assigned: U.addDays(t, -3), duration: 1, finish: U.addDays(t, -2), status: 'Resolved', reviewedBy: 'apps-mgr' },
    { c: 'shadow', id: 'wl-sw', analyst: 'yousef', team: 'apps', date: t, taskType: 'Support', source: 'Phone', subject: 'Printer mapping', minutes: 90 },
    { c: 'quickwin', id: 'wl-qw', analyst: 'yousef', team: 'apps', date: t, expected: t, subject: 'Faster stock report', module: 'Pharmacy', status: 'Completed', approval: 'Accepted', qwId: 'QW-901', type: 'Modification' },
  ]); })()"""

async def main():
    c = Check('worklist standard 2026.11.13.2')
    async with app_session() as s:
        pg = s.page
        await s.js(SEED); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        await s.sign_in_as('apps-mgr', 'analyst')

        # ---- A: ＋ New at the right end of the filter row, same words
        for route, label in [('#/todo', 'New To Do'), ('#/shadow', 'New shadow work'), ('#/quickwins', 'New quick win'), ('#/mytasks', 'New personal task')]:
            await s.go('#/home'); await s.go(route, 600)
            r = await s.js("""(() => { const pa = document.querySelector('#main .page-actions'); if (!pa) return null; const b = [...pa.children].filter(x => x.matches('.btn.primary')).pop();
              return { last: !!b && b === pa.lastElementChild, text: b ? b.textContent : '', grow: !!pa.querySelector(':scope > .grow'), first: pa === document.querySelector('#main .page-actions') }; })()""")
            c(f'{route}: ＋ {label} at the end of the filter row', r and r['last'] and r['grow'] and label in r['text'], r)
            c(f'{route}: one line of totals, no KPI tiles or charts', await pg.locator('#main .list-sum').count() == 1 and await pg.locator('#main .kpis, #main svg.chart').count() == 0)
        await s.go('#/home'); await s.go('#/shadow', 600)
        await s.js("ps('shadow').analyst = ''"); await s.go('#/home'); await s.go('#/shadow', 600)
        sm = await s.js("document.querySelector('#main .list-sum').textContent")
        c('Shadow Works: entries and hours in the line', '1 entry' in sm and '1.5 h' in sm, sm)
        await s.go('#/home'); await s.go('#/quickwins', 600)
        sm = await s.js("document.querySelector('#main .list-sum').textContent")
        c('Quick wins: completed / in progress / awaiting / overdue in the line', all(w in sm for w in ['completed', 'in progress', 'awaiting approval', 'overdue']), sm)

        # ---- C: the quick wins chart is on Tasks overview
        await s.sign_in_as('apps-mgr', 'manager'); await s.go('#/home'); await s.go('#/perf/tasksov', 800)
        t = await pg.inner_text('#main')
        c('Tasks overview: Quick wins completed by month', 'Quick wins completed by month' in t)
        await s.go('#/home'); await s.go('#/quickwins', 600)
        c('manager: totals line links to Tasks overview', await pg.locator('#main .list-sum a[href="#/perf/tasksov"]').count() == 1)

        # ---- D: one coloured chip
        await s.go('#/home'); await s.go('#/todo', 600)
        ch = await s.js("[...document.querySelectorAll('#main td .tf-st')].map(x => x.textContent + '|' + x.style.getPropertyValue('--c'))")
        c('To Do status as a coloured chip (In progress blue, Done green)', any(x.startswith('In progress|#2563eb') for x in ch) and any(x.startswith('Done|#16a34a') for x in ch), ch)
        await s.go('#/home'); await s.go('#/quickwins', 600)
        c('Quick wins status (a box for the manager) carries the status colour', await s.js("[...document.querySelectorAll('#main select[data-tinl$=\"|status\"]')].some(x => /16a34a/.test(x.getAttribute('style')))"))
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/home'); await s.go('#/quickwins', 600)
        c('Quick wins status as the same chip (analyst, approved = read-only)', await pg.locator('#main td .tf-st').count() >= 1 or await s.js("[...document.querySelectorAll('#main select[data-tinl$=\"|status\"]')].some(x => /16a34a/.test(x.getAttribute('style')))"))
        c('statusCat: review waits, canceled off, open to do', await s.js("UI.statusCat('Ready for review') === 'wait' && UI.statusCat('Canceled') === 'off' && UI.statusCat('Open') === 'todo' && UI.statusCat('On Hold') === 'wait'"))

        # ---- B: one field order
        await s.sign_in_as('apps-mgr', 'manager'); await s.go('#/home'); await s.go('#/todo', 500)
        order = await s.js("""(() => { const out = {}; for (const [c, r] of [['todo', Store.get('wl-td')], ['shadow', null], ['quickwin', null], ['mytask', null]]) {
          UI.editRecord(c, r); out[c] = [...document.querySelectorAll('#recform [name]')].map(x => x.name).filter((v, i, a) => a.indexOf(v) === i && !/__t$/.test(v)); UI.closeModal(); } return out; })()""")
        def before(c_, a, b):
            l = order[c_]; return a in l and b in l and l.index(a) < l.index(b)
        c('To Do: To Do text first, then Assigned to, Reference, dates, Status', order['todo'][0] == 'task' and before('todo', 'analyst', 'ref') and before('todo', 'ref', 'assigned') and before('todo', 'assigned', 'status'), order['todo'])
        c('Shadow: Subject first, Reference before Date', order['shadow'][0] == 'subject' and before('shadow', 'ref', 'date') and before('shadow', 'source', 'ref'), order['shadow'])
        c('Quick win: Subject first, Module before Reference, Status after Expected', order['quickwin'][0] == 'subject' and before('quickwin', 'module', 'ref') and before('quickwin', 'expected', 'status'), order['quickwin'])
        c('Personal task: Task first, dates before Status', order['mytask'][0] == 'title' and before('mytask', 'due', 'status'), order['mytask'])
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/todo'); await s.go('#/home', 700)
        q = await s.js("[...document.querySelectorAll('#quicksw [name]')].map(x => x.name).filter(n => !/__t$/.test(n))")
        c('Analyst Desk: Subject and Reference first', q[:2] == ['subject', 'ref'], q)
        await pg.screenshot(path=os.path.join(SHOTS, 'worklist_desk.png'), full_page=True)
        await s.sign_in_as('apps-mgr', 'analyst'); await s.go('#/home'); await s.go('#/todo', 600)
        await pg.screenshot(path=os.path.join(SHOTS, 'worklist_todo.png'), full_page=True)
        await s.js("UI.editRecord('todo', Store.get('wl-td'))"); await pg.wait_for_selector('#recform')
        await pg.screenshot(path=os.path.join(SHOTS, 'worklist_todo_form.png'))
        c('no page errors', not s.errors, '; '.join(s.errors[:3]))
    c.done(s)

run(main())
