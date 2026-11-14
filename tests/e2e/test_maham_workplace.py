"""MAHAM Workplace: assets (a due service makes one work order — never twice; Done records the service), bookings (a clash
is refused), documents (must-read: confirm; a new version asks again), HR (onboarding checklist from the template; a
review is shared and acknowledged), learning paths (overdue when mandatory and not finished), expenses (approved by the
manager → counted in the budget)."""
from harness import app_session, Check, run


async def main():
    c = Check('MAHAM workplace')
    async with app_session() as s:
        pg = s.page; J = s.js
        await pg.set_viewport_size({'width': 1366, 'height': 900})
        await s.sign_in_as('adam', 'admin')
        c('Workplace section with its six pages', await J("['assets','bookings','documents','hr','learning','expenses'].every(k => !!document.querySelector('nav [data-nav=\"' + k + '\"]'))"))
        # ---------- assets: a service due in 3 days → one work order
        await J("Store.save({ c: 'asset', id: 'as-1', no: 1, name: 'Ward 3 printer', kind: 'Printer', owner: 'yousef', status: 'In use', every: 90, lastService: U.addDays(U.todayStr(), -87) })")
        await s.go('#/assets/register', 500); await s.go('#/assets/orders', 500)
        wo = await J("WP.all('workorder').filter(o => o.asset === 'as-1')")
        c('a service due soon makes a preventive work order, for the owner', len(wo) == 1 and wo[0]['kind'] == 'Preventive' and wo[0]['assignee'] == 'yousef', wo)
        await s.go('#/assets/register', 300); await s.go('#/assets/orders', 500)
        c('…only once, however often the page opens', await J("WP.all('workorder').filter(o => o.asset === 'as-1').length") == 1)
        await J(f"WP.openWO(Store.get('{wo[0]['id']}'))"); await pg.click('[data-wodone]'); await pg.wait_for_timeout(300)
        c('Done records the service on the asset', await J("Store.get('as-1').lastService") == await J("U.todayStr()"))
        # ---------- bookings: a clash is refused
        await J("Store.save({ c: 'resource', id: 'rs-1', name: 'Meeting room A', kind: 'Room', capacity: 8 })")
        await J("Store.save({ c: 'booking', id: 'bk-1', resource: 'rs-1', date: U.todayStr(), from: '10:00', to: '11:00', title: 'Weekly', by: 'nora' })")
        await s.go('#/bookings', 500); await pg.click('#bknew'); await pg.fill('#wp_title', 'Interview'); await pg.select_option('#wp_resource', 'rs-1'); await pg.fill('#wp_from', '10:30'); await pg.fill('#wp_to', '11:30'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300)
        c('a booking that overlaps is refused, saying by whom', await J("WP.all('booking').length") == 1 and 'Already booked' in await pg.inner_text('body'))
        await pg.fill('#wp_from', '11:00'); await pg.fill('#wp_to', '12:00'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300)
        c('…right after it is fine', await J("WP.all('booking').length") == 2)
        # ---------- documents: must read and confirm; a new version asks again
        await J("Store.save({ c: 'doc', id: 'doc-1', title: 'Hand hygiene policy', version: '1', mustRead: true, body: 'Wash hands.', by: 'adam', publishedAt: Date.now() })")
        await s.sign_in_as('yousef', 'analyst'); t = await s.go('#/documents', 500)
        c('a must-read document shows for each person to confirm', 'to read and confirm' in t)
        await J("WP.openDoc(Store.get('doc-1'))"); await pg.click('[data-dok]'); await pg.wait_for_timeout(300)
        c('…confirmed', await J("WP.all('docread').some(r => r.doc === 'doc-1' && r.version === '1' && r.by === 'yousef')"))
        await J("Store.save(Object.assign({}, Store.get('doc-1'), { version: '2', body: 'Wash hands for 20 seconds.' }))")
        c('a new version asks again', 'to read and confirm' in await s.go('#/todo', 200) + await s.go('#/documents', 500))
        # ---------- HR: onboarding from the template; a review shared and acknowledged
        await s.sign_in_as('apps-mgr', 'manager'); await s.go('#/hr/onboarding', 400); await pg.click('#obnew'); await pg.select_option('#wp_person', 'nora'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300)
        ob = await J("WP.all('onboard').find(o => o.person === 'nora')")
        c('an onboarding checklist comes from the template', bool(ob) and len(ob['items']) >= 4 and not any(i['done'] for i in ob['items']), ob)
        await J("Store.save({ c: 'review', id: 'rv-1', person: 'nora', reviewer: 'apps-mgr', period: '2026', score: 88.5, strengths: 'Fast', status: 'Draft' })")
        await J("WP.openReview(Store.get('rv-1'))"); await pg.click('[data-rvshare]'); await pg.wait_for_timeout(300)
        await s.sign_in_as('nora', 'analyst'); await J("WP.openReview(Store.get('rv-1'))"); await pg.fill('#rvrep', 'Thank you'); await pg.click('[data-rvack]'); await pg.wait_for_timeout(300)
        c('a review is shared, then acknowledged with a comment', await J("Store.get('rv-1').status") == 'Acknowledged' and await J("Store.get('rv-1').reply") == 'Thank you')
        # ---------- learning: a mandatory path past its date shows as overdue
        await s.sign_in_as('adam', 'admin')
        await J("Store.save({ c: 'lpath', id: 'lp-1', name: 'Safety basics', courses: ['Fire safety', 'Infection control'], mandatory: true, due: U.addDays(U.todayStr(), -1) })")
        await J("Store.save({ c: 'course', id: 'cr-1', analyst: 'nora', course: 'Fire safety', status: 'Completed', team: Store.member('nora').team })")
        lt = await s.go('#/learning', 500)
        c("a learning path shows each person's progress (1 / 2) and overdue", '1 / 2' in lt and 'overdue' in lt, lt[:300])
        # ---------- expenses → approved → in the budget
        await J("Store.save({ c: 'budget', id: 'bg-1', name: 'Training 2026', amount: 10000, from: U.todayStr().slice(0, 4) + '-01-01', to: U.todayStr().slice(0, 4) + '-12-31', match: 'Training' })")
        await s.sign_in_as('nora', 'analyst'); await s.go('#/expenses/claims', 400); await pg.click('#exnew')
        await pg.fill('#wp_desc', 'Course fee'); await pg.fill('#wp_amount', '2500'); await pg.select_option('#wp_category', 'Training'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300)
        x = await J("WP.all('expense').find(e => e.desc === 'Course fee')")
        c('an expense claim goes to the manager', bool(x) and x['status'] == 'Submitted' and x['approver'] == 'apps-mgr', x)
        await s.sign_in_as('apps-mgr', 'manager'); await J(f"WP.openExpense(Store.get('{x['id']}'))"); await pg.click('[data-exok]'); await pg.wait_for_timeout(300)
        await s.sign_in_as('adam', 'admin'); b = await s.go('#/expenses/budgets', 500)
        c('approved → it counts in the budget (2,500 spent, 25%)', '2,500' in b and '25%' in b, b[:300])
    c.done(s)

run(main())
