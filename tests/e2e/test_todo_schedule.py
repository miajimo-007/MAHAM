"""8 Nov: repeating / scheduled To Dos — set up from the To Do form (↻ Repeat), dates (working days, weekly, monthly
incl. short months, every 3 months), copies made by the person's own MAHAM on their day with missed days caught up,
never twice, accepted by the trust check only when they match a manager's rule; pause / stop / edit; times limit."""
from harness import app_session, Check, run

async def main():
    c = Check('scheduled To Dos')
    async with app_session() as s:
        pg = s.page; J = s.js
        # ---- dates ----
        d = await J("""(() => { const r = (every, start, extra) => Object.assign({ every, start }, extra || {});
          return { daily: TodoRules.dates(r('daily', '2026-11-01'), '2026-11-01', '2026-11-14').every(x => !U.isOff(x)) && TodoRules.dates(r('daily', '2026-11-01'), '2026-11-01', '2026-11-14').length === [...Array(14)].map((_, i) => U.addDays('2026-11-01', i)).filter(x => !U.isOff(x)).length,
            weekly: TodoRules.dates(r('weekly', '2026-11-03'), '2026-11-01', '2026-11-30').join(),
            monthly31: TodoRules.dates(r('monthly', '2026-01-31'), '2026-01-01', '2026-04-30').join(),
            quarterly: TodoRules.dates(r('quarterly', '2026-01-15'), '2026-01-01', '2026-12-31').join(),
            until: TodoRules.dates(r('weekly', '2026-11-03', { end: '2026-11-17' }), '2026-11-01', '2026-12-31').length,
            next: TodoRules.next(r('weekly', '2026-11-03', { times: 2 }), '2026-11-04') }; })()""")
        c('every working day skips days off', d['daily'], d)
        c('weekly: same weekday every 7 days', d['weekly'] == '2026-11-03,2026-11-10,2026-11-17,2026-11-24', d['weekly'])
        c('monthly on the 31st uses the last day of short months', d['monthly31'] == '2026-01-31,2026-02-28,2026-03-31,2026-04-30', d['monthly31'])
        c('every 3 months', d['quarterly'] == '2026-01-15,2026-04-15,2026-07-15,2026-10-15', d['quarterly'])
        c('"until" stops it', d['until'] == 3, d['until'])
        c('"times" limit: next after the 2nd is none', d['next'] == '2026-11-10', d['next'])
        # ---- set up from the To Do form as the APPS manager ----
        await s.sign_in_as('apps-mgr', 'analyst'); await s.go('#/todo', 400)
        await J("UI.editRecord('todo')"); await pg.wait_for_selector('#recform')
        await pg.fill('#recform [name=task]', 'Weekly order-set audit'); await pg.select_option('#recform [name=analyst]', 'yousef')
        await pg.select_option('#recform [name=repeat]', 'weekly'); await pg.click('#modal [data-save]'); await pg.wait_for_timeout(400)
        rule = await J("(TodoRules.all('*').find(r => r.task === 'Weekly order-set audit') || {})")
        c('a repeating rule is saved (not a single To Do)', rule.get('every') == 'weekly' and rule.get('analyst') == 'yousef' and rule.get('by') == 'apps-mgr', rule)
        c("today's one is made at once", await J(f"!!Store.get(TodoRules.copyId(Store.get('{rule['id']}'), U.todayStr()))"))
        # ---- catch-up by the analyst's own MAHAM, never twice ----
        await J("""Store.save({ c: 'todorule', id: 'todorule-apps-mgr-catch', team: 'apps', by: 'apps-mgr', at: Date.now(), createdOn: U.addDays(U.todayStr(), -10), analyst: 'yousef', task: 'Daily check', every: 'daily', start: U.addDays(U.todayStr(), -10), dueDays: 0 })""")
        await J("Store.flush()")
        await s.sign_in_as('yousef', 'analyst')
        await J("TodoRules.run()"); want = await J("TodoRules.dates(Store.get('todorule-apps-mgr-catch'), U.addDays(U.todayStr(), -10), U.todayStr()).length")
        made = await J("Store.all('todo', '*').filter(t => t.fromRule === 'todorule-apps-mgr-catch').length")
        c('missed working days are caught up on opening (by the analyst\'s own MAHAM)', made == want and want > 0, [made, want])
        c('running again makes none (never twice)', await J("TodoRules.run()") == 0)
        await J("Store.flush()"); await J("Store.sync(true)"); await pg.wait_for_timeout(300)
        rej = await J("(Store.rejected || []).filter(x => String(x.id).startsWith('todo-rep-')).map(x => x.id + ': ' + x.why)")
        c("the analyst's own copies pass the trust check", not rej and await J("Store.all('todo', '*').filter(t => t.fromRule === 'todorule-apps-mgr-catch').length") == want, rej[:3])
        c('copies show on My Day', 'Daily check' in await s.go('#/home', 500))
        # forged copies: a day that is not in the rule / for someone else
        await J("""(() => { let off = U.todayStr(); while (!U.isOff(off)) off = U.addDays(off, -1);
          Store.saveMany([Object.assign(TodoRules.copy(Store.get('todorule-apps-mgr-catch'), off), {}), Object.assign(TodoRules.copy(Store.get('todorule-apps-mgr-catch'), U.todayStr()), { id: 'todo-rep-todorule-apps-mgr-catch-2020-01-01', assigned: '2020-01-01' }),
            { c: 'todo', id: 'todo-rep-todorule-apps-mgr-catch-' + U.todayStr() + 'x', analyst: 'yousef', task: 'fake', assigned: U.todayStr(), fromRule: 'todorule-apps-mgr-catch', status: 'In Progress' }]); })()""")
        await J("Store.flush()"); await J("Store.sync(true)"); await pg.wait_for_timeout(300)
        bad = await J("Store.all('todo', '*').filter(t => t.fromRule === 'todorule-apps-mgr-catch' && (U.isOff(t.assigned) || t.assigned === '2020-01-01' || t.task === 'fake')).length")
        c('copies that do not match the rule are ignored', bad == 0, bad)
        # analyst finishes a copy → manager confirms as usual
        cid = await J("TodoRules.copyId(Store.get('todorule-apps-mgr-catch'), TodoRules.dates(Store.get('todorule-apps-mgr-catch'), U.addDays(U.todayStr(), -10), U.todayStr()).pop())")
        await J(f"todoDone('{cid}')"); await J("Store.flush()")
        await s.sign_in_as('apps-mgr', 'analyst')
        c('manager can confirm a finished copy', await J(f"Store.canConfirmTodo(Store.get('{cid}'), 'apps-mgr')"))
        # ---- edit / pause / stop on the Scheduled tab ----
        t = await s.go('#/todo/scheduled', 500)
        c('Scheduled tab lists the rules with the next date', 'Weekly order-set audit' in t and 'Daily check' in t and 'next' in t.lower())
        await J("""(() => { const r = Store.get('todorule-apps-mgr-catch'); const today = U.todayStr(); Store.save(Object.assign({}, r, { task: 'Daily check v2', orig: { analyst: 'yousef', task: 'Daily check', dueDays: 0 }, hist: [{ from: today, analyst: 'yousef', task: 'Daily check v2', dueDays: 0 }] })); })()""")
        await J("Store.flush()"); await J("Store.sync(true)"); await pg.wait_for_timeout(300)
        c('after an edit, copies already made keep their wording and stay valid', await J("Store.all('todo', '*').filter(t => t.fromRule === 'todorule-apps-mgr-catch').length") == want
          and await J("Store.all('todo', '*').filter(t => t.fromRule === 'todorule-apps-mgr-catch' && t.assigned < U.todayStr()).every(t => t.task === 'Daily check')"))
        await s.go('#/todo/scheduled', 400)
        await pg.click(f"[data-trp=\"{rule['id']}\"]"); await pg.wait_for_timeout(300)
        c('pause', await J(f"Store.get('{rule['id']}').paused === true"))
        c('a paused rule has no next date', await J(f"TodoRules.next(Store.get('{rule['id']}')) === ''"))
        await pg.click(f"[data-trp=\"{rule['id']}\"]"); await pg.wait_for_timeout(300)
        c('resume', await J(f"!Store.get('{rule['id']}').paused && !!TodoRules.next(Store.get('{rule['id']}'))"))
        await pg.click(f"[data-trs=\"{rule['id']}\"]"); await pg.click('#modal [data-yes]'); await pg.wait_for_timeout(300)
        c('stop: no more, the ones made stay', await J(f"Store.get('{rule['id']}').stopped && TodoRules.next(Store.get('{rule['id']}')) === '' && !!Store.get(TodoRules.copyId(Store.get('{rule['id']}'), U.todayStr()))"))
        # ---- times limit ----
        await J("""Store.save({ c: 'todorule', id: 'todorule-apps-mgr-three', team: 'apps', by: 'apps-mgr', at: Date.now(), createdOn: U.addDays(U.todayStr(), -20), analyst: 'layla', task: 'Three times', every: 'daily', start: U.addDays(U.todayStr(), -20), times: 3, dueDays: 1 })""")
        await J("Store.flush()"); await s.sign_in_as('layla', 'analyst'); await J("TodoRules.run()")
        c('"stop after 3 times" makes 3', await J("Store.all('todo', '*').filter(t => t.fromRule === 'todorule-apps-mgr-three').length") == 3)
        # ---- an analyst cannot set up a rule ----
        await J("Store.save({ c: 'todorule', id: 'todorule-layla-x', team: 'apps', by: 'layla', at: Date.now(), createdOn: U.todayStr(), analyst: 'layla', task: 'self', every: 'daily', start: U.todayStr() })"); await J("Store.flush()"); await J("Store.sync(true)"); await pg.wait_for_timeout(300)
        c('a rule made by an analyst is ignored', await J("!Store.get('todorule-layla-x')"))
        c('no page errors', not s.errors, s.errors[:3])
        c.done(s)

run(main())
