"""Live menu counts, text stays in boxes, QW auto ID, shared quick wins, milestones, To Do priority, shadow FU,
help desk overview without the To Do card."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('oct-29 batch')
    async with app_session() as s:
        pg = s.page; J = s.js
        y = await J("App.year")
        # ---------- live menu counts
        await s.sign_in_as('yousef')
        await J("Store.save({c:'request', id:'rq-live', type:'other', title:'To Do status', requester:'yousef', team:'apps', from:U.todayStr(), status:'Pending manager', reason:'About To Do: EMR Backup Drill. Please change status, it is not delayed but canceled. ' + 'Averyveryverylongwordwithoutanyspaces'.repeat(6), created:U.todayStr()})"); await J("Store.flush()")
        await s.sign_in_as('apps-mgr'); await s.go('#/home', 500)
        cnt = lambda: J("(document.querySelector('nav a[data-nav=\"requests\"] .count') || {}).textContent || ''")
        c('menu shows 1 request', await cnt() == '1')
        c('clicking it goes to To approve', '/approve' in (await J("document.querySelector('nav a[data-nav=\"requests\"]').getAttribute('href')")))
        # text stays in its box
        t = await s.go('#/requests/approve', 500)
        over = await J("[...document.querySelectorAll('#main .card, #main .li')].filter(el => el.scrollWidth > el.clientWidth + 2).length")
        c('long text stays inside its box', over == 0, str(over))
        await pg.screenshot(path=f'{SHOTS}/wrap_requests.png')
        await pg.locator('[data-rqok="rq-live"]').first.click(); await pg.wait_for_timeout(500)
        if await pg.locator('.modal [data-ok]').count(): await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(500)
        c('count clears right after approving', await cnt() == '')
        # ---------- help desk overview: no To Do card
        t = await s.go('#/helpdesk', 500); c('no To Do card on Help Desk overview', 'To Do list —' not in t)
        # ---------- To Do priority
        await J("Store.saveMany([{c:'todo', id:'pr-l', task:'Low one', analyst:'yousef', team:'apps', assigned:U.todayStr(), duration:5, status:'In Progress', priority:'Low'}, {c:'todo', id:'pr-h', task:'Urgent one', analyst:'yousef', team:'apps', assigned:U.todayStr(), duration:5, status:'In Progress', priority:'High'}])")
        await J("UI.editRecord('todo', Store.get('pr-h'))"); await pg.wait_for_selector('#recform')
        c('priority in the To Do form', await pg.locator('#recform [name=priority]').count() == 1)
        c('flags on one row', await J("!!document.querySelector('#recform .flag-row')"))
        await J("UI.closeModal()")
        await s.sign_in_as('yousef'); t = await s.go('#/home', 500)
        c('High priority first on My Day', t.find('Urgent one') != -1 and (t.find('Low one') == -1 or t.find('Urgent one') < t.find('Low one')))
        # ---------- shadow FU + milestone
        await J(f"Store.saveMany([{{c:'shadow', id:'sw-fu', analyst:'yousef', team:'apps', date:U.todayStr(), taskType:'Support', source:'Phone', subject:'Follow me up', minutes:30, fu:true, milestone:true}}, {{c:'shadow', id:'sw-no', analyst:'yousef', team:'apps', date:U.todayStr(), taskType:'Support', source:'Phone', subject:'Plain one', minutes:30}}])")
        await s.go('#/shadow', 400); await J("ps('shadow').fu = true; App.render()"); await pg.wait_for_timeout(300)
        t = await J("document.querySelector('#main').innerText")
        c('FU only filter', 'Follow me up' in t and 'Plain one' not in t)
        await J("ps('shadow').fu = false; App.render()")
        # ---------- quick win: auto ID however it is accepted + shared
        await J("Store.save({c:'quickwin', id:'qs1', analyst:'yousef', team:'apps', date:U.todayStr(), subject:'Order set clean-up for ICU', module:'Orders', type:'Modification', status:'In-Progress', coWorkers:['layla','nora']})"); await pg.wait_for_timeout(200)
        await s.sign_in_as('layla'); t = await s.go('#/home', 500)
        c('teammate gets the confirm request on My Day', 'added you to' in t and 'Order set clean-up for ICU' in t)
        c('Quick Wins menu shows 1', await J("(document.querySelector('nav a[data-nav=\"quickwins\"] .count') || {}).textContent") == '1')
        await pg.click('[data-qwyes="qs1"]'); await pg.wait_for_timeout(400)
        await s.sign_in_as('nora'); await s.go('#/home', 400); await pg.click('[data-qwno="qs1"]'); await pg.wait_for_timeout(400)
        await s.sign_in_as('layla')
        await J("Store.save(Object.assign({}, Store.get('qs1'), {impact: 'Saves 2 h a week'}))"); await pg.wait_for_timeout(200)
        c('confirmed teammate can edit it', await J("Store.get('qs1').impact") == 'Saves 2 h a week')
        await s.sign_in_as('nora'); await J("Store.save(Object.assign({}, Store.get('qs1'), {impact: 'hacked'}))"); await pg.wait_for_timeout(200)
        c('"Not me" cannot edit it', await J("Store.get('qs1').impact") == 'Saves 2 h a week')
        # manager accepts through the edit form (not the button) -> still gets an ID
        await s.sign_in_as('apps-mgr')
        await J("Store.save(Object.assign({}, Store.get('qs1'), {approval: 'Accepted', status: 'Completed', expected: U.todayStr(), milestone: true}))"); await pg.wait_for_timeout(300)
        qid = await J("Store.get('qs1').qwId")
        c('QW ID given automatically on acceptance', bool(qid) and qid.startswith('QW-'))
        c('message is not "Wait for Manager approval"', await J("Calc.qwComment(Store.get('qs1'))") != 'Wait for Manager approval')
        await J("Calc.invalidate()")
        P = await J(f"(() => {{ const P = Calc.perf({y}); const mo = new Date().getMonth() + 1; return {{ a: P.members.yousef[mo].qw, k: P.members.layla[mo].qw, m: P.members.nora[mo].qw, team: Calc.qwCompletedIds({y}).size }}; }})()")
        c('counted for Yousef and Layla, not Nora; team once', P['a'] == 1 and P['k'] == 1 and P['m'] == 0 and P['team'] == 1, str(P))
        # ---------- milestones
        await J("Calc.invalidate()")
        t = await s.go('#/dashboard', 600)
        c('Milestones on Team Dashboard', 'Milestones' in t and 'Order set clean-up for ICU' in t and 'Follow me up' in t)
        await J("Store.save({c:'todo', id:'ms-open', task:'Not finished milestone', analyst:'yousef', team:'apps', assigned:U.todayStr(), duration:5, status:'In Progress', milestone:true})"); await J("Calc.invalidate()")
        t = await s.go('#/dashboard', 600); c('an unfinished milestone does not count', 'Not finished milestone' not in t)
        await pg.screenshot(path=f'{SHOTS}/milestones.png', full_page=True)
        # manager can mark anyone's work; analyst only their own
        await J("Store.save(Object.assign({}, Store.get('sw-no'), {milestone: true}))"); await pg.wait_for_timeout(200)
        c("manager marks an analyst's work", await J("!!Store.get('sw-no').milestone"))
        await s.sign_in_as('layla'); await J("Store.save(Object.assign({}, Store.get('sw-no'), {milestone: false}))"); await pg.wait_for_timeout(200)
        c("an analyst cannot unmark someone else's", await J("!!Store.get('sw-no').milestone"))
        c.done(s)
run(main())
