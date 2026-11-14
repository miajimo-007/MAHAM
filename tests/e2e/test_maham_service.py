"""MAHAM service desk in the app: settings (SLA, categories, queues), a new ticket goes to the right queue and its least
busy member (who is told), first reply, waiting on the customer pauses the clock, internal notes, resolve + rating,
SLA missed, reports, the timesheet (shadow work + ticket time), tickets in 🔎 search, Public knowledge base articles."""
from harness import app_session, Check, run


async def main():
    c = Check('MAHAM service desk')
    async with app_session() as s:
        pg = s.page; J = s.js
        await pg.set_viewport_size({'width': 1366, 'height': 900})
        await s.sign_in_as('adam', 'admin')
        # ---------- settings (super admin): SLA, categories, one queue with two people
        await s.go('#/tickets/settings', 600)
        c('Service → Tickets has a Settings tab for the admin', 'SLA' in await pg.inner_text('#main'))
        await pg.fill('[data-sla="High|1"]', '24'); await pg.fill('#svcat', 'Access, Printer, Other')
        await pg.click('#svqadd'); await pg.fill('.sv-q .sv-qn', 'Desk'); await pg.select_option('.sv-q .sv-qm', ['yousef', 'nora']); await pg.fill('.sv-q .sv-qc', 'Printer, Access')
        await pg.click('#svsave'); await pg.wait_for_timeout(400)
        cfg = await J("TK.cfg()")
        c('settings saved: SLA, categories, queue', cfg['sla']['High'][1] == 24 and cfg['categories'] == ['Access', 'Printer', 'Other'] and sorted(cfg['queues'][0]['members']) == ['nora', 'yousef'], cfg)
        # Yousef already has an open ticket → the next one goes to Nora (fewest open)
        await J("TK.create({ subject: 'Old one', category: 'Printer', assignee: 'yousef', requester: 'sara' })")
        await s.sign_in_as('sara', 'analyst'); await s.go('#/tickets', 500)
        await pg.click('#tknew'); await pg.fill('#tks', 'Printer on floor 2 jams'); await pg.fill('#tkd', 'It jams on every page'); await pg.select_option('#tkc', 'Printer'); await pg.select_option('#tkp', 'High')
        await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(600)
        t = await J("TK.all().find(x => x.subject === 'Printer on floor 2 jams')")
        c('a new ticket gets a number, the queue and its least busy member', bool(t) and t['no'] >= 2 and t['queue'] == cfg['queues'][0]['id'] and t['assignee'] == 'nora' and t['requester'] == 'sara', t)
        tid = t['id']
        c('…and Nora is told (🔔)', await J(f"Store.all('notify', '*').some(n => n.to === 'nora' && n.on === '{tid}')"))
        await J("UI.closeModal()")
        c('"My requests" lists it for Sara', 'Printer on floor 2 jams' in await s.go('#/tickets/raised', 400))
        # ---------- Nora works it
        await s.sign_in_as('nora', 'analyst'); await s.go('#/tickets/list', 300)
        c('"Assigned to me" lists it for Nora', 'Printer on floor 2 jams' in await s.go('#/tickets/mine', 500))
        await J(f"TK.open(Store.get('{tid}'))"); await pg.wait_for_selector('#tkrt')
        await pg.fill('#tkrt', 'Checked the toner — staff only'); await pg.check('#tkint'); await pg.fill('#tkmin', '20'); await pg.click('[data-tksend=""]'); await pg.wait_for_timeout(400)
        x = await J(f"Store.get('{tid}')")
        c('an internal note is not a first reply (SLA)', not x.get('firstReply'), x.get('firstReply'))
        await pg.fill('#tkrt', 'We are on it — can you send a photo of the error?'); await pg.click('[data-tksend="Waiting on customer"]'); await pg.wait_for_timeout(400)
        x = await J(f"Store.get('{tid}')")
        c('a reply counts as the first reply, and "Reply & wait" pauses the clock', bool(x.get('firstReply')) and x['status'] == 'Waiting on customer' and bool(x.get('pausedAt')), x)
        c('…Sara is told', await J(f"Store.all('notify', '*').some(n => n.to === 'sara' && n.on === '{tid}')"))
        await J("UI.closeModal()")
        # ---------- Sara answers; she does not see the internal note
        await s.sign_in_as('sara', 'analyst'); await J(f"TK.open(Store.get('{tid}'))"); await pg.wait_for_selector('.tk-conv')
        conv = await pg.inner_text('.tk-conv')
        c('the requester sees the reply but not the internal note', 'send a photo' in conv and 'toner' not in conv, conv[:200])
        await pg.fill('#tkrt', 'Here: error 41'); await pg.click('[data-tksend=""]'); await pg.wait_for_timeout(400); await J("UI.closeModal()")
        await s.sign_in_as('nora', 'analyst'); await pg.wait_for_timeout(300); await J(f"TK.save(Store.get('{tid}'), {{ status: 'Open' }})")
        x = await J(f"Store.get('{tid}')")
        c('opening it again adds the paused time to the clock', (x.get('pausedMs') or 0) > 0 and not x.get('pausedAt'), x)
        await J(f"TK.open(Store.get('{tid}'))"); await pg.wait_for_selector('#tkrt')
        await pg.fill('#tkrt', 'Fixed: new fuser unit'); await pg.click('[data-tksend="Resolved"]'); await pg.wait_for_timeout(400); await J("UI.closeModal()")
        c('Reply & resolve resolves it', await J(f"Store.get('{tid}').status") == 'Resolved' and await J(f"!!Store.get('{tid}').resolvedAt"))
        # ---------- Sara rates it
        await s.sign_in_as('sara', 'analyst'); await J(f"TK.open(Store.get('{tid}'))"); await pg.wait_for_selector('[data-csat]')
        await pg.fill('#tkcc', 'Quick, thanks'); await pg.click('[data-csat="5"]'); await pg.wait_for_timeout(400); await J("UI.closeModal()")
        c('the requester rates it 1–5 with a comment', await J(f"(Store.get('{tid}').csat || {{}}).score") == 5)
        # ---------- SLA missed, reports, timesheet, search
        await s.sign_in_as('adam', 'admin')
        await J("TK.create({ subject: 'Old urgent', priority: 'Urgent', category: 'Access', requester: 'sara', created: Date.now() - 30 * 3600e3 })")
        t2 = await s.go('#/tickets/list', 500)
        c('a ticket past its SLA shows it, and the totals count it', 'Old urgent' in t2 and 'no reply yet' in t2 and await J("TK.all().filter(t => TK.sla(t).resp === 'breached').length") >= 1, t2[:300])
        rep = await s.go('#/tickets/report', 500)
        c('Reports: SLA met %, first reply, satisfaction', 'SLA met' in rep and 'satisfaction' in rep and '5 / 5' in rep, rep[:300])
        await J("Store.save({ c: 'shadow', id: 'ts-sh1', analyst: 'nora', team: Store.member('nora').team, date: U.todayStr(), taskType: Store.list('taskTypes')[0] || 'OTHER', source: Store.list('sources')[0] || 'Call', subject: 'Help', minutes: 40 })")
        ts = await s.go('#/timesheet', 500)
        c('Timesheet: shadow work + ticket time per person and day (40 + 20 min = 1 h)', '1 h' in ts and 'Nora' in ts, ts[:300])
        await pg.keyboard.press('Control+k'); await pg.wait_for_timeout(300); await pg.keyboard.type('Printer on floor'); await pg.wait_for_timeout(500)
        c('🔎 search finds tickets', 'Printer on floor 2 jams' in await pg.inner_text('body'))
        await pg.keyboard.press('Escape')
        # ---------- Public knowledge base article
        c('a Knowledge base article can be Public', await J("KB.VIS.some(v => v[0] === 'public')"))
        await J("KB.save({ title: 'Printer jams', problem: 'Paper jams', solution: 'Replace the fuser', vis: 'public', tags: ['printer'] })"); await pg.wait_for_timeout(300)
        c('…it is saved as Public and everyone reads it', await J("(a => !!a && a.vis === 'public' && KB.canRead(a))(KB.all().find(a => a.title === 'Printer jams'))"))
    c.done(s)

run(main())
