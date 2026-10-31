"""The logic fixes batch: holidays, cancel leave, To Do review, minimum version, per-year scoring, minute-taker,
grouped tasks, My work + new count, explain access, purge, given-by, year selector, banners, team move."""
import json
from harness import app_session, Check, run
async def main():
    c = Check('logic batch')
    async with app_session() as s:
        pg = s.page; J = s.js
        await s.sign_in_as('adam')
        # holidays
        await J("Store.save({id: 'settings-holidays', c: 'settings', list: [{from: '2026-12-01', to: '2026-12-03', name: 'Test Eid'}]})")
        c('holiday is a day off', await J("U.isOff('2026-12-02') && !U.isOff('2026-12-07')"))
        c('leave days skip holidays', await J("Requests.days({from: '2026-11-30', to: '2026-12-07'}).length") == 3)  # Mon 30, Thu... (Sun 6? weekend Fri/Sat) -> Nov30, Dec6, Dec7
        c('shadow work 7 days back', await J("Config.SELF_BACKDATE_DAYS") == 7)
        # year selector hidden where it does nothing
        await s.go('#/projects', 400); c('Year hidden on Projects', await J("getComputedStyle(document.querySelector('#yearsel').closest('.yearsel')).display") == 'none')
        await s.go('#/dashboard', 400); c('Year shown on the dashboard', await J("getComputedStyle(document.querySelector('#yearsel').closest('.yearsel')).display") != 'none')
        # cancel approved leave
        await s.sign_in_as('yousef')
        await J("Store.save({c: 'request', id: 'lv1', type: 'leave', requester: 'yousef', team: 'apps', from: U.addDays(U.todayStr(), 10), to: U.addDays(U.todayStr(), 12), status: 'Pending manager', created: U.todayStr()})"); await J("Store.flush()")
        await s.sign_in_as('apps-mgr'); r = await J("Store.get('lv1')"); 
        await J("Store.saveMany([Object.assign({}, Store.get('lv1'), {status: 'Completed', mgrBy: 'apps-mgr', mgrOk: true}), ...Requests.attendanceFor(Object.assign({}, Store.get('lv1'), {status: 'Completed'}))])"); await J("Store.flush()")
        n_off = await J("Store.all('attendance', '*').filter(a => a.fromRequest === 'lv1').length")
        c('approved leave wrote OFF days', n_off > 0, n_off)
        await s.sign_in_as('yousef'); await s.go('#/requests/mine', 500)
        await pg.click('[data-rqask="lv1"]'); await pg.click('[data-yes]'); await pg.wait_for_timeout(300); await J("Store.flush()")
        c('asked to cancel', await J("Store.get('lv1').status") == 'Cancel requested')
        await s.sign_in_as('apps-mgr'); await J("Store.sync(true)"); await s.go('#/requests/approve', 500)
        await pg.click('[data-rqcok="lv1"] >> nth=0'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(400)
        c('leave canceled, OFF days removed', await J("Store.get('lv1').status") == 'Canceled' and await J("Store.all('attendance', '*').filter(a => a.fromRequest === 'lv1').length") == 0)
        # To Do review
        await s.sign_in_as('adam'); await J("Store.save({id: 'settings-teams', c: 'settings', teams: Store.teams().map(t => t.id === 'apps' ? Object.assign({}, t, {todoReview: true}) : t)})"); await J("Store.flush()")
        await s.sign_in_as('apps-mgr'); await J("Store.save({c: 'todo', id: 'rv1', task: 'Check sets', analyst: 'layla', team: 'apps', assigned: U.todayStr(), duration: 2, status: 'In Progress'})"); await J("Store.flush()")
        await s.sign_in_as('layla'); await J("Store.sync(true)"); await s.go('#/todo', 500); await pg.click('[data-done="rv1"]'); await pg.wait_for_timeout(300); await J("Store.flush()")
        c('finished To Do waits for review', await J("Store.get('rv1').status") == 'Ready for review')
        await s.sign_in_as('apps-mgr'); await J("Store.sync(true)"); t = await s.go('#/home', 500)
        c('Manager Desk: To Dos to confirm', 'To Dos to confirm' in t)
        await pg.click('[data-tdok="rv1"]'); await pg.wait_for_timeout(300)
        c('manager confirms', await J("Store.get('rv1').status") == 'Resolved' and await J("Store.get('rv1').reviewedBy") == 'apps-mgr')
        # My work + new count
        await s.sign_in_as('yousef'); await s.go('#/home', 400); await s.go('#/todo', 300)
        await s.sign_in_as('apps-mgr'); await J("Store.save({c: 'todo', id: 'nw1', task: 'Fresh one', analyst: 'yousef', team: 'apps', assigned: U.todayStr(), duration: 1, status: 'In Progress'})"); await J("Store.flush()")
        await s.sign_in_as('yousef'); await J("Store.sync(true)"); await s.go('#/todo', 400)
        c('new-for-you count in the menu', await J("(document.querySelector('nav a[data-nav=\"home\"] .newc') || {}).textContent") == '1')
        t = await s.go('#/home', 500); c('My work lists it', 'My work' in t and 'Fresh one' in t)
        # grouped task
        await s.sign_in_as('khalid'); await J("Store.saveMany(['apps-mgr', 'lab-mgr'].map(m => ({c: 'mgrtask', task: 'Group audit', manager: m, team: m.split('-')[0], date: U.todayStr(), status: 'Open', group: 'g1'})))")
        t = await s.go('#/mgrtasks', 500); c('one row for a task sent to two managers', t.count('Group audit') == 1 and '0 of 2 managers done' in t, t[:600])
        # minute-taker
        await J("Store.save({id: U.uid('meeting'), c: 'meeting', owner: 'khalid', title: 'Weekly', date: U.todayStr(), attendees: ['apps-mgr'], items: [{id: 'i1', title: 'A', notes: '', decision: ''}], followups: {}, scribe: 'apps-mgr'})"); await J("Store.flush()")
        mid = await J("Store.all('meeting').find(m => m.title === 'Weekly').id")
        await s.sign_in_as('apps-mgr'); await J("Store.sync(true)")
        c('minute-taker can edit', await J(f"Meetings.canEdit(Store.get('{mid}'))"))
        await J(f"Store.save(Object.assign({{}}, Store.get('{mid}'), {{items: [{{id: 'i1', title: 'A', notes: 'written by the scribe', decision: ''}}]}}))"); await J("Store.flush()")
        await s.sign_in_as('adam'); await J("Store.sync(true)")
        c("minute-taker's notes accepted", (await J(f"Store.get('{mid}').items[0].notes")) == 'written by the scribe')
        # explain access, given-by, purge
        t = await s.go('#/adminperson/yousef', 500); c('Explain access on the card', 'Explain access' in t)
        t = await s.go('#/admin/data', 500); c('Who gave older tasks + clean-up cards', 'Who gave older tasks' in t and 'Clean up deleted records' in t)
        # per-year scoring
        await J("Calc.saveScoring('apps', Object.assign({}, Config.DEFAULT_SCORING, {weights: {todo: 40, helpdesk: 30, attendance: 15, quickwins: 10, shadow: 5}}))")
        y = await J("new Date().getFullYear()")
        c('earlier year keeps its rules', await J(f"Calc.scoring({y-1}).weights.todo") == 35 and await J(f"Calc.scoring({y}).weights.todo") == 40)
        # team move offers to move this year's records
        await J("Store.save({c: 'shadow', id: 'sw-mv', analyst: 'nora', team: 'apps', date: U.todayStr(), task: 'x', minutes: 30})")
        await J("saveMembersChecked(Store.members().map(m => m.id === 'nora' ? Object.assign({}, m, {team: 'lab'}) : m), 'saved')"); await pg.wait_for_timeout(400)
        c('team move asks to move records', 'Move their records too?' in await pg.inner_text('body'))
        await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300)
        c("this year's records moved", await J("Store.get('sw-mv').team") == 'lab')
        # purge: a record deleted long ago disappears from the files
        await J("Store.save({c: 'course', id: 'old-del', analyst: 'adam', course: 'gone', team: 'apps'})"); await J("Store.flush()")
        await J("(async () => { const fh = await Store.usersDir.getFileHandle('adam.json'); const j = JSON.parse(await (await fh.getFile()).text()); j.records = j.records.map(r => r.id === 'old-del' ? Object.assign(r, {_del: true, _ts: Date.now() - 60 * 864e5}) : r); const w = await fh.createWritable(); await w.write(JSON.stringify(j)); await w.close(); })()")
        await J("Store.own = {}; Store.sync(true)"); await pg.wait_for_timeout(400)
        c('old deleted record can be purged', await J("Store.purgeable(30).has('old-del')"))
        await J("Store.purgeDeleted(30)"); await pg.wait_for_timeout(800)
        c('purged from the file', not await J("(async () => JSON.parse(await (await (await Store.usersDir.getFileHandle('adam.json')).getFile()).text()).records.some(r => r.id === 'old-del'))()"))
        # banners: clock and minimum version
        await J("Store.clockSkew = 3 * 3600e3; App.renderSync()"); c('clock warning', await pg.locator('#bnclock').count() == 1)
        await J("Store.clockSkew = 0; App.renderSync()")
        await J("Store.save(Object.assign({}, Store.get('settings-features') || {id: 'settings-features', c: 'settings'}, {minVersion: '2099.1.1', minSince: Date.now()}))")
        await J("App.renderSync()"); c('too-old copy: red bar', await pg.locator('#bnold').count() == 1)
        await J("Store.save({c: 'todo', id: 'old1', task: 'x', analyst: 'adam', team: 'apps', assigned: U.todayStr(), status: 'In Progress'})"); c('too-old copy cannot save', not await J("Store.get('old1')"))
        c.done(s)
run(main())
