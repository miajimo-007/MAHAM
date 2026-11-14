"""MAHAM Sales (CRM): companies, contacts, deals (DL-n) on the pipeline (drag to a stage → history, weighted value),
activities and follow-ups, quotes with VAT (totals), won / lost with a reason, forecast and win rate, the stages in
settings, the new owner is told, 🔎 search finds deals and contacts."""
from harness import app_session, Check, run


async def main():
    c = Check('MAHAM sales')
    async with app_session() as s:
        pg = s.page; J = s.js
        await pg.set_viewport_size({'width': 1366, 'height': 900})
        await s.sign_in_as('adam', 'admin')
        c('Sales is in the menu', await J("!!document.querySelector('nav [data-nav=\"crm\"]')"))
        # ---------- a company and a contact
        await s.go('#/crm/accounts', 400); await pg.click('#crmacc')
        await pg.fill('[data-pf="name"]', 'Gulf Clinics'); await pg.fill('[data-pf="industry"]', 'Healthcare'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300)
        acc = await J("CRM.all('account').find(a => a.name === 'Gulf Clinics')")
        c('a company is saved', bool(acc) and acc['industry'] == 'Healthcare', acc)
        await s.go('#/crm/contacts', 400); await pg.click('#crmcon')
        await pg.fill('[data-pf="name"]', 'Huda Saleh'); await pg.fill('[data-pf="email"]', 'huda@gulfclinics.example'); await pg.select_option('#pfa', acc['id']); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300)
        con = await J("CRM.all('contact').find(x => x.name === 'Huda Saleh')")
        c('a contact is saved with their company', bool(con) and con['account'] == acc['id'], con)
        # ---------- a deal, given to Yousef
        await s.go('#/crm/pipeline', 400); await pg.click('#crmnew')
        await pg.fill('#dlt', 'Clinic booking system'); await pg.select_option('#dla', acc['id']); await pg.select_option('#dlc', con['id']); await pg.fill('#dlv', '120000'); await pg.select_option('#dlo', 'yousef')
        await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(500)
        d = await J("CRM.all('deal').find(x => x.title === 'Clinic booking system')")
        c('a deal gets a number, the first stage and its probability', bool(d) and d['no'] >= 1 and d['stage'] == 'Lead' and await J(f"CRM.prob(Store.get('{d['id']}'))") == 10, d)
        c('…the new owner is told (🔔)', await J(f"Store.all('notify', '*').some(n => n.to === 'yousef' && n.on === '{d['id']}')"))
        await J("UI.closeModal()")
        # ---------- drag it to Proposal on the board
        await s.go('#/crm/deals', 200); await s.go('#/crm/pipeline', 500)
        await pg.drag_and_drop(f'[data-deal="{d["id"]}"]', '.crm-col[data-stage="Proposal"]'); await pg.wait_for_timeout(500)
        d2 = await J(f"Store.get('{d['id']}')")
        c('dragging a deal moves it to that stage, with its history', d2['stage'] == 'Proposal' and d2['hist'][-1]['to'] == 'Proposal', d2.get('hist'))
        c('…the board shows the weighted value (50% of 120,000)', '60,000' in await pg.inner_text('#main'))
        # ---------- an activity with a follow-up, a quote with VAT
        await J(f"CRM.openDeal(Store.get('{d['id']}'))"); await pg.wait_for_selector('#aat')
        await pg.select_option('#aak', 'followup'); await pg.fill('#aat', 'Send the demo video'); await pg.fill('#aad', '2026-12-01'); await pg.click('#aago'); await pg.wait_for_timeout(400)
        c('an activity with a due date is a follow-up to do', await J(f"CRM.acts('{d['id']}').some(a => a.kind === 'followup' && a.due === '2026-12-01' && !a.done)"))
        await pg.click('#qnew'); await pg.wait_for_selector('#qlines')
        await pg.click('#qladd'); await pg.fill('#qlines tr:nth-child(2) .ql-i', 'Training'); await pg.fill('#qlines tr:nth-child(2) .ql-q', '2'); await pg.fill('#qlines tr:nth-child(2) .ql-p', '5000'); await pg.wait_for_timeout(200)
        tot = await pg.inner_text('#qtot')
        c('a quote adds up the lines and 15% VAT (130,000 + 19,500 = 149,500)', '130,000' in tot and '19,500' in tot and '149,500' in tot, tot)
        await pg.select_option('#qst', 'Sent'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300)
        q = await J(f"CRM.all('quote').find(x => x.deal === '{d['id']}')")
        c('…it is saved with its number and status', bool(q) and q['no'] >= 1 and q['status'] == 'Sent' and len(q['lines']) == 2, q)
        await s.go('#/crm/activities', 400)
        c('Activities lists the follow-up to do', 'Send the demo video' in await pg.inner_text('#main'))
        await pg.click('[data-actdone]'); await pg.wait_for_timeout(300)
        c('…✓ Done closes it', await J(f"CRM.acts('{d['id']}').every(a => a.done)"))
        # ---------- won, lost, forecast
        await J(f"CRM.saveDeal(Store.get('{d['id']}'), {{ status: 'won' }})")
        d3 = await J(f"Store.get('{d['id']}')")
        c('won: 100% and the time it was won', d3['status'] == 'won' and d3.get('wonAt') and await J(f"CRM.prob(Store.get('{d['id']}'))") == 100)
        await J("(() => { const x = CRM.newDeal({ title: 'Lab system', value: 50000 }); Store.save(x); CRM.saveDeal(x, { status: 'lost', lostReason: 'price' }); })()")
        fc = await s.go('#/crm/forecast', 500)
        c('Forecast: win rate of the closed deals (1 of 2 = 50%)', 'Win rate 50%' in fc.replace('\n', ' '), fc[:200])
        c('a lost deal keeps its reason', await J("CRM.all('deal').some(x => x.status === 'lost' && x.lostReason === 'price')"))
        # ---------- settings: own stages
        await s.go('#/crm/settings', 500); await pg.click('#crmstadd'); await pg.fill('.crm-st:last-child .crm-sn', 'Contract'); await pg.fill('.crm-st:last-child .crm-sp', '90'); await pg.click('#crmsave'); await pg.wait_for_timeout(300)
        c('the admin adds a stage (Contract, 90%)', await J("CRM.cfg().stages.some(x => x.name === 'Contract' && x.prob === 90)"))
        c('…it is a column on the board', 'Contract' in await s.go('#/crm/pipeline', 500))
        # ---------- search
        await pg.keyboard.press('Control+k'); await pg.wait_for_timeout(300); await pg.keyboard.type('Huda'); await pg.wait_for_timeout(500)
        c('🔎 search finds contacts (and deals)', 'Huda Saleh' in await pg.inner_text('body'))
        await pg.keyboard.press('Escape')
    c.done(s)

run(main())
