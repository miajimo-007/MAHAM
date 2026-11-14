"""To Do, Shadow work and Quick wins behave the same way where they can: one Reference field (same label) in all three
forms, the 🔗 link count in all three lists, add buttons named alike, ＋ Quick win from My work, and the Manager Desk's
"Assign a To Do" uses the team's due days and the To Do save rules (still for several people at once)."""
from harness import app_session, Check, run

async def main():
    c = Check('work consistency')
    async with app_session() as s:
        pg = s.page
        # one Reference field in all three forms
        labels = await s.js("['todo', 'shadow', 'quickwin'].map(k => (Schemas[k].fields.find(f => f.key === 'ref') || {}).label)")
        c('Reference is on the To Do, Shadow work and Quick win forms, same label', labels == ['Reference'] * 3, labels)
        # add buttons named alike
        t = await s.go('#/todo', 500); b1 = await pg.inner_text('.page-actions [data-add="todo"]')
        await s.go('#/quickwins', 500); b2 = await pg.inner_text('.page-actions [data-add="quickwin"]')
        await s.go('#/shadow', 500); b3 = await pg.inner_text('.page-actions [data-add="shadow"]')
        c('add buttons: New To Do · New quick win · New shadow work', 'New To Do' in b1 and 'New quick win' in b2 and 'New shadow work' in b3, (b1, b2, b3))
        # links show in every list
        await s.js("""(() => { const t = U.todayStr(); const tt = Store.list('taskTypes')[0] || 'Support', src = Store.list('sources')[0] || 'Phone';
          Store.saveMany([{ c: 'todo', id: 'wc-td', task: 'Consistency To Do', analyst: 'yousef', team: 'apps', assigned: t, duration: 2, status: 'In Progress', priority: 'Normal' },
            { c: 'quickwin', id: 'wc-qw', analyst: 'yousef', team: 'apps', date: t, expected: t, subject: 'Consistency quick win', module: 'Orders', status: 'In-Progress', type: 'Modification' },
            { c: 'shadow', id: 'wc-sw', analyst: 'yousef', team: 'apps', date: t, subject: 'Consistency shadow', minutes: 15, taskType: tt, source: src }]);
          Store.saveMany([WorkLinks.rec(Store.get('wc-sw'), Store.get('wc-td')), WorkLinks.rec(Store.get('wc-sw'), Store.get('wc-qw'))]); })()""")
        await pg.wait_for_timeout(300)
        await s.go('#/home'); t1 = await s.go('#/todo', 500); await s.go('#/home'); t2 = await s.go('#/quickwins', 500); await s.go('#/home'); await s.js("ps('shadow').analyst = ''"); t3 = await s.go('#/shadow', 500)
        c('the 🔗 count shows in the To Do, Quick Wins and Shadow Works lists', '🔗 1' in t1 and '🔗 1' in t2 and '🔗 2' in t3, ['🔗 1' in t1, '🔗 1' in t2, '🔗 2' in t3, t3[t3.find('Consistency') - 80:t3.find('Consistency') + 120], await s.js("(Store.byC.worklink || []).length")])
        # Manager Desk: Assign a To Do follows the team's due days and the To Do rules
        await s.sign_in_as('apps-mgr'); await s.go('#/home'); await s.go('#/manager', 600)
        await pg.click('[data-assign]'); await pg.wait_for_selector('#assign')
        d_norm = await s.js("TimeRules.defaultDays('apps', 'Normal', '')"); d_high = await s.js("TimeRules.defaultDays('apps', 'High', '')")
        c('due days start from the team\'s time rules', await pg.input_value('#assign [name=duration]') == str(d_norm), (await pg.input_value('#assign [name=duration]'), d_norm))
        await pg.select_option('#assign [name=priority]', 'High'); await pg.wait_for_timeout(100)
        c('…and follow the priority', await pg.input_value('#assign [name=duration]') == str(d_high), (await pg.input_value('#assign [name=duration]'), d_high))
        await pg.fill('#assign [name=task]', 'Desk assigned task'); await pg.fill('#assign [name=ref]', 'REQ-7788')
        await pg.check('#assign [name=who][value="yousef"]'); await pg.check('#assign [name=who][value="layla"]')
        await pg.click('#assign [type=submit]'); await pg.wait_for_timeout(400)
        l = await s.js("Store.all('todo', '*').filter(t => t.task === 'Desk assigned task').map(t => [t.analyst, t.ref, +t.duration, t.status, TodoId.key(t), t.priority])")
        c('one To Do per person, with the Reference, due days, an ID and the To Do status', len(l) == 2 and all(x[1] == 'REQ-7788' and x[2] == d_high and x[3] == 'In Progress' and x[4].startswith('TD-') and x[5] == 'High' for x in l), l)
        # ＋ Quick win from My work
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/shadow'); await s.go('#/home', 600)
        c('My work has ＋ Quick win next to ＋ Personal task', await pg.locator('[data-mwqw]').count() == 1)
        await pg.click('[data-mwqw]'); await pg.wait_for_selector('#recform [name=subject]')
        c('…it opens the same quick win form, for me', await pg.input_value('#recform [name=analyst]') == 'yousef' if await pg.locator('#recform [name=analyst]').count() else True)
        await s.js('UI.closeModal()')
        c.done(s)

run(main())
