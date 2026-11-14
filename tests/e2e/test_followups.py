"""Central follow-ups on steps: old records read through the new steps (and upgraded only after a preview + confirm,
scoring unchanged), escalation counted from the last chase in working days, chase log + next chase (Home card,
"Chased today"), moves with their checks (Redmine no., expected date, reason), links to a To Do both ways, the summary
tab, the Manager desk card, the export, Time rules targets, and parties (a vendor with its own key) + workflow editing."""
from harness import app_session, Check, run, SHOTS

async def main():
    c = Check('follow-ups')
    async with app_session() as s:
        pg = s.page
        await s.js("""(() => { const t = U.todayStr(); const d = n => U.addDays(t, -n); const ts = n => Date.parse(d(n) + 'T09:00:00');
          const mk = (id, o, n) => { Store.save(Object.assign({ c: 'central', id, team: 'apps', analyst: 'yousef', module: 'Pharmacy', type: 'Modification' }, o)); Store.get(id)._ts = ts(n); };
          mk('ry1', { date: d(120), subject: 'Old under review', status: 'Under Review', notes: 'Sent email to Central' }, 100);
          mk('ry2', { date: d(80), subject: 'Accepted and deployed', status: 'Accepted', deployed: 'Yes', redmine: 'RM-1' }, 40);
          mk('ry3', { date: d(70), subject: 'Accepted no redmine', status: 'Accepted' }, 60);
          mk('ry4', { date: d(200), subject: 'Solved long ago', status: 'Solved', redmine: 'RM-4' }, 35);
          mk('ry5', { date: d(90), subject: 'Rejected one', status: 'Rejected' }, 50);
          Store.save({ c: 'todo', id: 'td-l', task: 'Pharmacy report change', analyst: 'yousef', team: 'apps', assigned: t, duration: 3, status: 'In Progress' });
          Store.ver++; Calc.invalidate(); })()""")
        solved_before = await s.js("ScoreParts.raw ? null : null")
        cnt = "Store.all('central', '*').filter(r => r.analyst === 'yousef' && FollowUp.isSolved(r)).map(r => FollowUp.doneDay(r).slice(0, 7)).sort().join(',')"
        before = await s.js(cnt)
        # ---------- old records read through the new steps ----------
        st = await s.js("['ry1','ry2','ry3','ry4','ry5'].map(id => FollowUp.norm(Store.get(id)).status)")
        c('old statuses → steps (Under Review, Deployed, Accepted, Deployed, Rejected)', st == ['Under Review', 'Deployed', 'Accepted', 'Deployed', 'Rejected'], st)
        c('Accepted without Redmine is flagged', await s.js("FollowUp.norm(Store.get('ry3')).flag") == 'missing Redmine no.')
        t = await s.go('#/central', 700)
        c('upgrade card with the preview', 'use the old status list' in t and 'Accepted + Deployed → Deployed' in t, t[:400])
        await pg.click('#fuupg'); await pg.click('.modal [data-yes]'); await s.js("Store.flush()"); await pg.wait_for_timeout(400)
        r1 = await s.js("Store.get('ry1')")
        c('upgraded: notes → first chase, steps saved, numbered', r1['fuv'] == 2 and r1['status'] == 'Under Review' and r1['chases'][0]['reply'] == 'Sent email to Central' and not r1.get('notes') and r1.get('n'), r1)
        c('scoring unchanged (solved months the same)', await s.js(cnt) == before, (before, await s.js(cnt)))
        # ---------- escalation from the last chase ----------
        c('last touch ~70 working days ago → "Need Team Leader Follow up"', await s.js("Calc.centralComment(Store.get('ry1'))") == 'Need Team Leader Follow up', await s.js("[FollowUp.lastTouch(Store.get('ry1')), FollowUp.sinceTouch(Store.get('ry1'))]"))
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/central', 600)
        await pg.click('[data-fuqc="ry1"]'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        r1 = await s.js("Store.get('ry1')")
        c('"Chased today": logged, next chase set, escalation cleared', len(r1['chases']) == 2 and r1['next'] > await s.js("U.todayStr()") and await s.js("Calc.centralComment(Store.get('ry1'))") == 'New', r1)
        c('days open still counts from submission', await s.js("FollowUp.daysOpen(Store.get('ry1'))") == 120)
        # ---------- moves ----------
        await s.js("FollowUpUI.go('ry1', 'acc')"); await pg.wait_for_selector('#fuscr [name=redmine]')
        await pg.click('#fugo'); await pg.wait_for_timeout(200)
        c('Accepted needs the Redmine no.', 'Redmine' in await pg.inner_text('#fuerr'))
        await pg.fill('#fuscr [name=redmine]', 'RM-77'); await pg.click('#fugo'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        r1 = await s.js("Store.get('ry1')")
        c('…moved to Accepted with the number, history kept', r1['status'] == 'Accepted' and r1['redmine'] == 'RM-77' and r1['hist'][-1]['to'] == 'Accepted')
        c('comment: Insert Expected date', await s.js("Calc.centralComment(Store.get('ry1'))") == 'Insert Expected date')
        await s.js("FollowUpUI.go('ry1', 'wd')"); await pg.wait_for_selector('#fuscr [name=expected]')
        await pg.fill('#fuscr [name=expected]', await s.js("U.addDays(U.todayStr(), 20)")); await pg.click('#fugo'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        await s.js("FollowUpUI.go('ry1', 'dep')"); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        r1 = await s.js("Store.get('ry1')")
        c('Waiting deployment → Deployed: closed, done date, counts as solved', r1['status'] == 'Deployed' and r1['doneDate'] == await s.js("U.todayStr()") and await s.js("FollowUp.isSolved(Store.get('ry1'))"))
        await s.js("FollowUpUI.go('ry3', 'rej')"); await pg.wait_for_selector('#fuscr [name=comment]'); await pg.click('#fugo'); await pg.wait_for_timeout(200)
        c('Rejected needs the reason', 'comment' in await pg.inner_text('#fuerr'))
        await s.js("UI.closeModal()")
        # ---------- new follow-up: link to a To Do, next chase, Home card ----------
        await s.js("UI.editRecord('central', null)"); await pg.wait_for_selector('#modal [name=subject]'); await pg.wait_for_timeout(150)   # the dialog puts the cursor in its first field first (a person never clicks within 30 ms)
        flds = await s.js("[...document.querySelectorAll('#modal [name]')].map(e => e.name)")
        c('form: priority, requested by, next chase, linked to (no Deployed field)', all(x in flds for x in ['priority', 'requester', 'next', 'link']) and 'deployed' not in flds, flds)
        await pg.fill('#modal [name=subject]', 'Dose range check'); await pg.select_option('#modal [name=link]', 'todo|td-l')
        await pg.click('#modal [data-save], #modal button.primary'); await s.js("Store.flush()")
        await pg.wait_for_function("Store.all('central').some(r => r.subject === 'Dose range check')", timeout=5000)   # the save is not instant
        nr = await s.js("Store.all('central').find(r => r.subject === 'Dose range check')")
        c('new one: key RYD-n, starts Under Review, next chase in 7 working days', nr and nr['status'] == 'Under Review' and (await s.js(f"FollowUp.key(Store.get('{nr['id']}'))")).startswith('RYD-') and nr['next'] > await s.js("U.todayStr()"), nr)
        await s.js("UI.editRecord('todo', Store.get('td-l'))"); await pg.wait_for_timeout(300)
        c('the To Do shows "Waiting on RYD-…"', 'Waiting on' in await pg.inner_text('#modal') and 'RYD-' in await pg.inner_text('#modal'))
        await s.js("UI.closeModal()")
        await s.js(f"Store.save(Object.assign({{}}, Store.get('{nr['id']}'), {{ next: U.todayStr() }}))")
        t = await s.go('#/home', 600)
        c('Home: "Follow-up chases due" with Chased today', 'Follow-up chases due' in t and 'Dose range check' in t)
        # ---------- summary, manager desk, export ----------
        await s.sign_in_as('apps-mgr'); t = await s.go('#/manager', 700)
        c('Manager desk: External follow-ups card (open, escalated, oldest)', 'External follow-ups' in t and 'open' in t)
        await s.go('#/central', 600); await pg.click('[data-rtab="summary"]'); await pg.wait_for_timeout(400); t = await pg.inner_text('#main')
        c('Summary: by step, by module, oldest 10, per analyst', all(x in t for x in ['Open by step', 'Open by module', 'Oldest 10 open', 'Per analyst']))
        await pg.click('[data-rtab="list"]'); await pg.wait_for_timeout(300)
        c('"List for Central" export button', await pg.locator('#fuexp').count() == 1)
        # ---------- Time rules targets ----------
        await s.sign_in_as('adam'); await s.go('#/admin/timerules', 600); await pg.select_option('#trscope', 'apps'); await pg.wait_for_timeout(300)
        await pg.fill('#trf [name=ry_a]', '5'); await pg.click('#trsave'); await s.js("Store.flush()")
        c('Time rules: analyst follow-up after 5 working days', await s.js("FollowUp.targets('apps').analyst") == 5)
        # ---------- parties + workflow ----------
        await s.go('#/admin/work/followups', 600)
        t = await pg.inner_text('#main')
        c('Admin → Work & workflows → Follow-ups: parties, fields, workflows', 'Parties' in t and 'Follow-up workflows' in t and 'Central follow-up' in t)
        await pg.click('#ptadd'); await pg.wait_for_timeout(200)
        await pg.fill('[data-pt="1"] .pt-n', 'Vendor A'); await pg.fill('[data-pt="1"] .pt-p', 'va'); await pg.click('#ptsave'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        va = await s.js("FollowUp.parties().find(p => p.name === 'Vendor A')")
        c('vendor party saved with its key', va and va['prefix'] == 'VA', va)
        await s.js(f"UI.editRecord('central', {{ party: '{va['id']}' }})"); await pg.wait_for_selector('#modal [name=subject]'); await pg.wait_for_timeout(150)   # the dialog puts the cursor in its first field first (a person never clicks within 30 ms)
        await pg.fill('#modal [name=subject]', 'Interface down'); await pg.click('#modal [data-save], #modal button.primary'); await s.js("Store.flush()")
        await pg.wait_for_function("Store.all('central').some(r => r.subject === 'Interface down')", timeout=5000)
        c('a vendor follow-up gets VA-1', await s.js("FollowUp.key(Store.all('central').find(r => r.subject === 'Interface down'))") == 'VA-1')
        await s.go('#/home', 200); await s.go('#/admin/work/followups', 500)
        await pg.click('[data-fufl="fu-central"]'); await pg.wait_for_selector('#tfname')
        idx = await s.js("TFE.draft.statuses.findIndex(x => x.name === 'Under Review')")
        await pg.fill(f'[data-si="{idx}"] .tfs-n', 'With Central'); await pg.dispatch_event(f'[data-si="{idx}"] .tfs-n', 'change'); await pg.wait_for_timeout(200)
        await pg.click('#tfsave'); await s.js("Store.flush()"); await pg.wait_for_timeout(400)
        c('renaming a step moves the follow-ups with it', await s.js(f"Store.get('{nr['id']}').status") == 'With Central' and await s.js("FollowUp.flows()[0].start") == 'With Central', await s.js(f"Store.get('{nr['id']}').status"))
        await s.go('#/central', 700); await pg.screenshot(path=f'{SHOTS}/followups.png', full_page=True)
    c.done(s)

run(main())
