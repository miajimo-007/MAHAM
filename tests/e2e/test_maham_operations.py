"""MAHAM Operations: an incident (IN-n) goes Reported → Investigating → Actions (needs a root cause) → Closed (needs every
action done AND checked by someone other than its owner); an audit's Fail becomes a finding; a purchase request goes to
the requester's manager, who approves (or rejects with a reason) — each told by 🔔; received with a vendor rating that
shows on the vendor's scorecard; a contract near its end shows as "to renew"."""
from harness import app_session, Check, run


async def main():
    c = Check('MAHAM operations')
    async with app_session() as s:
        pg = s.page; J = s.js
        await pg.set_viewport_size({'width': 1366, 'height': 900})
        await s.sign_in_as('yousef', 'analyst')
        c('Operations → Quality and Procurement are in the menu', await J("!!document.querySelector('nav [data-nav=\"quality\"]') && !!document.querySelector('nav [data-nav=\"procurement\"]')"))
        # ---------- an incident, reported by Yousef, owned by the manager
        await s.go('#/quality/incidents', 400); await pg.click('#qnew')
        await pg.fill('#qit', 'Label printer printed the wrong ward'); await pg.select_option('#qis', 'High'); await pg.fill('#qia', 'Ward 3'); await pg.select_option('#qio', 'apps-mgr')
        await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(400)
        i = await J("OPS.all('incident').find(x => x.title.startsWith('Label printer'))")
        c('an incident gets a number and goes to its owner', bool(i) and i['no'] >= 1 and i['owner'] == 'apps-mgr' and i['status'] == 'Reported', i)
        c('…who is told (🔔)', await J(f"Store.all('notify', '*').some(n => n.to === 'apps-mgr' && n.on === '{i['id']}')"))
        iid = i['id']
        # ---------- the owner investigates
        await s.sign_in_as('apps-mgr', 'manager'); await J(f"OPS.openInc(Store.get('{iid}'))"); await pg.wait_for_selector('[data-qnext]')
        await pg.click('[data-qnext]'); await pg.wait_for_timeout(300)
        c('Next step → Investigating', await J(f"Store.get('{iid}').status") == 'Investigating')
        await pg.click('[data-qnext]'); await pg.wait_for_timeout(300)
        c('…Actions needs a root cause first', await J(f"Store.get('{iid}').status") == 'Investigating')
        await pg.fill('#qrc', 'The template had the wrong ward code'); await pg.fill('#qwy', 'Wrong code\nTemplate copied from old ward')
        await pg.fill('#qat', 'Fix the ward code in the template'); await pg.select_option('#qao', 'yousef'); await pg.click('#qago'); await pg.wait_for_timeout(300)
        await pg.click('[data-qnext]'); await pg.wait_for_timeout(300)
        x = await J(f"Store.get('{iid}')")
        c('root cause and 5 whys saved; step Actions; an action for Yousef', x['status'] == 'Actions' and 'wrong ward code' in x['rootCause'] and len(x['whys']) == 2 and await J(f"OPS.caps('{iid}').length") == 1, x)
        await pg.click('[data-qnext]'); await pg.wait_for_timeout(300)
        c('…it cannot close while the action is open', await J(f"Store.get('{iid}').status") == 'Actions')
        await J("UI.closeModal()")
        # Yousef does the action; the manager checks it; then it closes
        await s.sign_in_as('yousef', 'analyst'); await J(f"OPS.openInc(Store.get('{iid}'))"); await pg.wait_for_selector('[data-capdone]'); await pg.click('[data-capdone]'); await pg.wait_for_timeout(300); await J("UI.closeModal()")
        await s.sign_in_as('apps-mgr', 'manager'); await J(f"OPS.openInc(Store.get('{iid}'))"); await pg.wait_for_selector('[data-capok]'); await pg.click('[data-capok]'); await pg.wait_for_timeout(300)
        await pg.click('[data-qnext]'); await pg.wait_for_timeout(300)
        c('done and checked by someone else → it closes', await J(f"Store.get('{iid}').status") == 'Closed')
        await J("UI.closeModal()")
        # ---------- an audit: its Fail becomes a finding
        await s.go('#/quality/audits', 400); await pg.click('#qanew'); await pg.fill('#qan', 'Ward 3 monthly check'); await pg.fill('#qaa', 'Ward 3')
        await pg.fill('#qarows tr:nth-child(1) .qa-q', 'Fire exits clear'); await pg.select_option('#qarows tr:nth-child(1) .qa-r', 'Pass')
        await pg.click('#qaadd'); await pg.fill('#qarows tr:nth-child(2) .qa-q', 'Hand gel at the door'); await pg.select_option('#qarows tr:nth-child(2) .qa-r', 'Fail')
        await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(400)
        c("an audit's Fail opens a finding", await J("OPS.all('incident').some(i => i.kind === 'Audit finding' && i.title.includes('Hand gel'))"))
        rep = await s.go('#/quality/report', 400)
        c('Report: open, closed, late actions', 'open' in rep and 'closed' in rep)
        # ---------- procurement: request → manager approves → ordered → received with a rating
        await J("Store.save({ c: 'vendor', id: 'v-1', name: 'Gulf Supplies', category: 'IT' })")
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/procurement/requests', 400); await pg.click('#prnew')
        await pg.fill('#prt', 'Two label printers'); await pg.select_option('#prv', 'v-1'); await pg.fill('#prl tr:nth-child(1) .pl-i', 'Label printer'); await pg.fill('#prl tr:nth-child(1) .pl-q', '2'); await pg.fill('#prl tr:nth-child(1) .pl-p', '1500')
        await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(400)
        p = await J("OPS.all('purchase').find(x => x.title === 'Two label printers')")
        c('a purchase request goes to the manager for approval (total 3,000)', bool(p) and p['status'] == 'Submitted' and p['approver'] == 'apps-mgr' and await J(f"OPS.prTotal(Store.get('{p['id']}'))") == 3000, p)
        c('…who is told', await J(f"Store.all('notify', '*').some(n => n.to === 'apps-mgr' && n.on === '{p['id']}')"))
        await s.sign_in_as('apps-mgr', 'manager'); txt = await s.go('#/procurement/approve', 400)
        c('"To approve" lists it for the manager', 'Two label printers' in txt)
        await J(f"OPS.openPR(Store.get('{p['id']}'))"); await pg.wait_for_selector('[data-prno]'); await pg.click('[data-prno]'); await pg.wait_for_timeout(200)
        c('rejecting needs a reason', await J(f"Store.get('{p['id']}').status") == 'Submitted')
        await pg.fill('#prc', 'OK, within budget'); await pg.click('[data-prok]'); await pg.wait_for_timeout(300)
        c('approved, and Yousef is told', await J(f"Store.get('{p['id']}').status") == 'Approved' and await J(f"Store.all('notify', '*').some(n => n.to === 'yousef' && n.on === '{p['id']}')"))
        await s.sign_in_as('yousef', 'analyst'); await J(f"OPS.openPR(Store.get('{p['id']}'))"); await pg.wait_for_selector('[data-prord]'); await pg.click('[data-prord]'); await pg.wait_for_timeout(300)
        pg.once('dialog', lambda d: d.accept('5'))
        await J(f"OPS.openPR(Store.get('{p['id']}'))"); await pg.wait_for_selector('[data-prrec]'); await pg.click('[data-prrec]'); await pg.wait_for_timeout(400)
        c('ordered, then received with a rating', await J(f"Store.get('{p['id']}').status") == 'Received' and await J(f"Store.get('{p['id']}').rating") == 5)
        v = await s.go('#/procurement/vendors', 400)
        c("the vendor's scorecard shows the rating and the spend", '5.0 ★' in v or '5 ★' in v, v[:300])
        # ---------- a contract near its end
        await J("Store.save({ c: 'contract', id: 'ct-1', title: 'Printer support', vendor: 'v-1', start: '2026-01-01', end: U.addDays(U.todayStr(), 20), notice: 60, value: 12000, owner: 'yousef' })")
        ct = await s.go('#/procurement/contracts', 400)
        c('a contract within its notice period shows "to renew"', 'to renew soon' in ct and 'Printer support' in ct)
    c.done(s)

run(main())
