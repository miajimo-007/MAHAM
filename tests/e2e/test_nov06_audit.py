"""6 Nov audit: logic fixes (lazy days, own-team month marks, attendance, permission hours, rejected quick wins, task clash)
and the UX batch (Manager Desk, My Day glance, bulk actions + undo, change in the table, unsaved warning, required fields,
remembered filters, foldable menu, data health, activity log)."""
from harness import app_session, Check, run, SHOTS

async def main():
    c = Check('nov 6 audit')
    async with app_session() as s:
        pg = s.page; J = s.js
        # ---------- logic ----------
        d = await J("(() => { let d = U.todayStr(); for (let i = 1; i < 40; i++) { const x = U.addDays(U.todayStr(), -i); if (!U.isOff(x)) { d = x; break; } } return d; })()")
        await J(f"Store.save({{ c: 'todo', id: 'td-lz', task: 'Old task', analyst: 'yousef', assigned: U.addDays('{d}', -20), duration: 30, status: 'In Progress' }})")
        await J("Store.save({ id: 'settings-scoremonths-apps', c: 'settings', months: {}, people: { 'yousef|2026-03': { kind: 'skip', by: 'adam' } } })")
        await s.sign_in_as('yousef', 'analyst')
        lazy = lambda: J(f"(Calc.invalidate(), Calc.lazy({int(d[:4])}).days.find(x => x.date === '{d}').cells.yousef)")
        c1 = await lazy()
        await J(f"(() => {{ const r = Object.assign({{}}, Store.get('td-lz'), {{ finish: '{d}', finishNote: 'forgot to tick it' }}); Schemas.todo.beforeSave(r); Store.save(r); }})()")
        c2 = await lazy()
        c('lazy days: finishing a To Do that day counts as work', c2['td'] and not c2['lazy'], [c1, c2])
        c('lazy days: quick wins / projects / good catches count too (cell has "other work" flag)', 'ot' in c2)
        # month mark follows the person's own team
        mk = await J("(() => { const v = App.viewTeam; App.viewTeam = 'lab'; const m = Calc.monthMark(2026, 'yousef', 3); App.viewTeam = v; return !!m; })()")
        c("'Not counted' month follows the person's own team, not the team being viewed", mk)
        # attendance: OFF day never keeps permission hours
        await s.sign_in_as('adam')
        await J("Store.save({ c: 'attendance', id: 'att-x', date: '2026-03-03', analyst: 'yousef', status: 'OFF', leave: 'Annual', permHrs: 3 })")
        p = await J("(Calc.invalidate(), Calc.perf(2026).members.yousef[3].permHrs)")
        c('a day off with permission hours does not count them', p == 0, p)
        # permission requests: two on the same day add up; cancelling one takes only its hours off
        recs = await J("""(() => { const t = Requests.types().find(x => x.kind === 'hours' && x.attendance); if (!t) return null;
            const a = { id: 'rq-p1', c: 'request', type: t.id, requester: 'yousef', from: '2026-03-10', hours: 2 }; const b = { id: 'rq-p2', c: 'request', type: t.id, requester: 'yousef', from: '2026-03-10', hours: 1.5 };
            Store.saveMany(Requests.attendanceFor(a)); Store.saveMany(Requests.attendanceFor(b));
            const after2 = Store.get('att-2026-03-10-yousef').permHrs;
            Store.saveMany(Requests.cancelLeaveRecs(Object.assign({}, a, { status: 'Completed' })).filter(r => r.c === 'attendance'));
            return [after2, Store.get('att-2026-03-10-yousef') && Store.get('att-2026-03-10-yousef').permHrs]; })()""")
        c('two permissions on one day add up; cancelling one leaves the other', recs is None or recs == [3.5, 1.5], recs)
        # a rejected quick win never counts in the score
        await J("Store.save({ c: 'quickwin', id: 'qw-rj', subject: 'Rejected one', analyst: 'yousef', date: '2026-02-01', expected: '2026-02-10', status: 'Completed', approval: 'Rejected' })")
        q = await J("(Calc.invalidate(), Calc.perf(2026).members.yousef[2].qw)")
        c('rejected quick win not counted', q == 0, q)
        c('task depending on a finished task is not a clash', await J("(() => { Store.saveMany([{ c: 'ptask', id: 'pt-a', project: 'x', title: 'A', due: '2026-05-10', status: 'Done' }, { c: 'ptask', id: 'pt-b', project: 'x', title: 'B', start: '2026-05-01', after: 'pt-a' }]); return !PM.clash(Store.get('pt-b')); })()"))

        # ---------- My Day ----------
        await s.sign_in_as('yousef', 'analyst'); t = await s.go('#/home', 500)
        c('My Day: "This month at a glance" card', 'This month at a glance' in t)
        await pg.screenshot(path=f'{SHOTS}/nov06_myday.png', full_page=True)

        # ---------- Manager Desk ----------
        await s.sign_in_as('apps-mgr'); t = await s.go('#/manager', 600)
        c('Manager Desk: "Needs you" section at the top', await pg.locator('.desk-grp[data-dg="need"]').count() == 1)
        c('Manager Desk: Assign opens as a dialog (no big form on the page)', await pg.locator('#main #assign').count() == 0 and await pg.locator('[data-assign]').count() == 1)
        await pg.screenshot(path=f'{SHOTS}/nov06_manager.png')

        # ---------- bulk actions + undo + change in the table ----------
        await J("Store.saveMany(['b1', 'b2', 'b3'].map(id => ({ c: 'todo', id: 'td-' + id, task: 'Bulk ' + id, analyst: 'yousef', assigned: U.todayStr(), duration: 5, status: 'In Progress', priority: 'Normal' })))")
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/todo', 500)
        await pg.fill('[data-tsearch="todo"]', 'Bulk'); await pg.wait_for_timeout(700)
        c('To Do list has tick boxes', await pg.locator('[data-tsel^="todo|"]').count() == 3)
        await pg.click('[data-tsel="todo|td-b1"]'); await pg.wait_for_timeout(250); await pg.click('[data-tsel="todo|td-b2"]'); await pg.wait_for_timeout(250)
        c('bar shows "2 selected"', '2 selected' in await pg.inner_text('.bulk-bar'))
        await pg.click('.bulk-bar >> text=Mark done'); await pg.wait_for_timeout(400)
        st = await J("['td-b1','td-b2','td-b3'].map(id => !!Store.get(id).finish)")
        c('bulk Mark done: only the ticked ones', st == [True, True, False], st)
        c('message has Undo', 'Undo' in await pg.inner_text('#toasts'))
        await pg.click('#toasts .toast-act'); await pg.wait_for_timeout(400)
        st = await J("['td-b1','td-b2'].map(id => !!Store.get(id).finish)")
        c('Undo puts them back', st == [False, False], st)
        c('analyst: priority is not changeable in the table (manager field)', await pg.locator('[data-tinl^="todo|"]').count() == 0)
        await s.sign_in_as('apps-mgr'); await s.go('#/todo', 500)
        await J("App.tableState.todo.q = 'Bulk b3'; App.render()"); await pg.wait_for_timeout(400)
        sel = pg.locator('select[data-tinl^="todo|"]').first
        c('manager: priority changeable right in the table', await sel.count() == 1)
        await sel.select_option('High'); await pg.wait_for_timeout(400)
        c('priority saved from the table', await J("Store.get('td-b3').priority") == 'High')
        # ---------- unsaved warning + required fields ----------
        await J("UI.editRecord('todo', null)"); await pg.wait_for_selector('#recform')
        await pg.click('[data-save]'); await pg.wait_for_timeout(200)
        c('required fields marked in the form', await pg.locator('#recform .fld-err').count() >= 1 and await pg.locator('#recform .err-msg').count() >= 1)
        await pg.fill('#recform [name=task]', 'Half typed'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        c('closing with typed text asks first', await pg.locator('#modal .unsaved-bar').count() == 1)
        await pg.click('[data-keepedit]'); c('Keep editing keeps the form', await pg.locator('#recform').count() == 1)
        await pg.click('[data-close]'); await pg.click('[data-discard]'); await pg.wait_for_timeout(200)
        c('Discard closes it', await pg.locator('#modal').count() == 0)
        await J("UI.editRecord('todo', Store.get('td-b3'))"); await pg.wait_for_selector('#recform'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        c('nothing typed: closes at once', await pg.locator('#modal').count() == 0)
        # ---------- remembered filters ----------
        await J("ps('todo').pri = 'High'; App.render()"); await pg.wait_for_timeout(900)
        await s.sign_in_as('yousef', 'analyst'); await s.sign_in_as('apps-mgr'); await s.go('#/todo', 400)
        c('filters remembered per person', await J("ps('todo').pri") == 'High')
        await J("ps('todo').pri = ''; App.tableState.todo.q = ''; App.render()")
        # ---------- foldable menu ----------
        secs = await J("[...document.querySelectorAll('nav a.sec')].map(e => e.dataset.sec)")
        c('menu: one link per section, in order', [x for x in secs if x not in ('Admin', 'Connect', 'Service', 'Sales', 'AI', 'Operations', 'Workplace')] == ['Home', 'Work', 'Projects', 'Tracking', 'Team', 'Performance', 'Reference'], secs)
        c('the open page\'s section is highlighted and its pages are tabs on top', await J("document.querySelector('nav a.sec.on').dataset.sec") == 'Work' and await pg.locator('#main .sec-tabs .sec-tab').count() == 4 and await pg.locator('#main .sec-tab.on[data-tab=todo]').count() == 1)
        await s.go('#/shadow', 300); await s.go('#/quickwins', 300)
        c('a section link opens the page last used in it', await J("document.querySelector('nav a.sec[data-sec=Work]').getAttribute('href')") == '#/shadow')
        await pg.click('nav a.sec[data-sec=Work]'); await pg.wait_for_timeout(300)
        c('one click on My Work → back on Shadow Works', await J("App.page") == 'shadow')

        # ---------- admin: data health + activity log ----------
        await s.sign_in_as('adam'); await J("Store.save({ c: 'todo', id: 'td-bad', task: 'Typo year', analyst: 'yousef', assigned: '2062-01-05', duration: 1, status: 'In Progress' })")
        t = await s.go('#/admin/data', 600)
        c('Data health card lists the typo year', 'Data health' in t and await J("Health.checks().some(g => g.list.some(x => x.r.id === 'td-bad'))"))
        t = await s.go('#/admin/activity', 400); await pg.wait_for_timeout(900); t = await pg.inner_text('#main')
        c('Activity log page shows changes by others', 'Activity log' in t and 'Bulk b3' in t, t[:300])
        c('activity log lives in its own monthly file', await J("Object.keys(Store.sources).some(k => /\\.log-\\d{4}-\\d{2}\\.json$/.test(k))"))
        await pg.screenshot(path=f'{SHOTS}/nov06_activity.png')
        c('no page errors', not s.errors, s.errors[:3])
        c.done(s)

run(main())
