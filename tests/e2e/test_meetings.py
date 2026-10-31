"""Meetings: minutes, actions → real tasks, follow-up at the next meeting, decision log, 1:1 prep, privacy."""
import json
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('meetings & follow-up')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J("Store.save({c: 'project', id: 'pj-m', name: 'Order set clean-up', manager: 'apps-mgr', team: 'apps', origin: 'team', members: []})")
        # director creates a meeting
        await s.sign_in_as('khalid'); c('Meetings in the director menu', 'Meetings' in await pg.inner_text('nav'))
        await s.go('#/meetings'); await pg.click('#newmeet'); await pg.wait_for_selector('#mtf')
        await pg.fill('#mtf [name=title]', "Managers' weekly"); await pg.check('#mtf [name=att][value="apps-mgr"]'); await pg.check('#mtf [name=att][value="lab-mgr"]')
        await pg.click('[data-ok]'); await pg.wait_for_timeout(500)
        mid = await J("Store.all('meeting').find(m => m.title === \"Managers' weekly\").id")
        c('meeting created with the default agenda, opened', (await J("location.hash")).endswith(mid) and await J(f"Store.get('{mid}').items.length") == 4)
        # minutes
        await pg.fill('[data-mf$="|notes"] >> nth=1', 'LAB closing time went up'); await pg.press('[data-mf$="|notes"] >> nth=1', 'Tab'); await pg.wait_for_timeout(200)
        await pg.fill('[data-mf$="|decision"] >> nth=1', 'Each team reviews requests older than 3 days daily'); await pg.press('[data-mf$="|decision"] >> nth=1', 'Tab'); await pg.wait_for_timeout(300)
        await pg.fill('[data-mf="_|privateNotes"]', 'Talk to LAB manager privately'); await pg.press('[data-mf="_|privateNotes"]', 'Tab'); await pg.wait_for_timeout(300)
        it = await J(f"Store.get('{mid}').items[1]")
        c('notes and decision saved as you type', it['notes'] == 'LAB closing time went up' and it['decision'].startswith('Each team'))
        # actions
        async def add_action(item_idx, what, who, due_days, project=''):
            await pg.click(f'[data-addact] >> nth={item_idx}'); await pg.wait_for_selector('#acf, #asgf')
            if await pg.locator('#asgf').count():   # a director's meeting uses the one "Assign to managers" dialog
                await pg.fill('#asgf [name=task]', what); await pg.check(f'#asgf [name=who][value="{who}"]'); await pg.fill('#asgf [name=due]', await J(f"U.addDays(U.todayStr(), {due_days})"))
                if project: await pg.select_option('#asgf [name=project]', project)
            else:
                await pg.fill('#acf [name=what]', what); await pg.select_option('#acf [name=who]', who); await pg.fill('#acf [name=due]', await J(f"U.addDays(U.todayStr(), {due_days})"))
                if project: await pg.select_option('#acf [name=project]', project)
            await pg.click('[data-ok]'); await pg.wait_for_timeout(400)
        await add_action(1, 'Report requests older than 3 days', 'apps-mgr', 5, 'pj-m')
        await add_action(1, 'Prepare LAB staffing plan', 'lab-mgr', 20)
        await add_action(2, 'Book steering committee room', 'khalid', 3)
        acts = await J(f"Meetings.actionsOf('{mid}').map(t => t.c + ':' + Meetings.who(t)).sort().join()")
        c('actions became a director task per manager + a personal task', acts == 'mgrtask:apps-mgr,mgrtask:lab-mgr,mytask:khalid', acts)
        await pg.screenshot(path=f'{SHOTS}/meeting_minutes.png', full_page=True)
        # manager works on it through the chain
        await s.sign_in_as('apps-mgr'); t = await s.go('#/home')
        c("manager sees the action as a task from the director", 'Report requests older than 3 days' in t)
        tid = await J("Store.all('mgrtask').find(t => t.task === 'Report requests older than 3 days').id")
        await pg.click(f'[data-fwd="{tid}"]'); await pg.wait_for_selector('#fwdf'); await pg.check('#fwdf [name=who][value="yousef"]'); await pg.click('[data-ok]'); await pg.wait_for_timeout(400)
        if await pg.locator('#modal [data-yes]').count(): await pg.click('#modal [data-yes]'); await pg.wait_for_timeout(300)
        # director desk
        await s.sign_in_as('khalid'); t = await s.go('#/home')
        c('Director Desk: follow-ups due this week + my tasks', 'Follow-ups due this week' in t and 'Report requests older than 3 days' in t and 'Book steering committee room' in t)
        c('1:1 button per manager', await pg.locator('[data-oneone="apps-mgr"]').count() == 1)
        # next meeting: follow-up
        await s.go(f'#/meeting/{mid}'); await pg.click('#nextmeet'); await pg.wait_for_selector('#mtf'); await pg.click('[data-ok]'); await pg.wait_for_timeout(500)
        mid2 = await J("location.hash.split('/').pop()")
        t = await pg.inner_text('#main')
        c('next meeting lists the 3 open actions as follow-up', mid2 != mid and 'Follow-up from earlier meetings' in t and '3 open' in t)
        c('…with live status from the chain', '0 of 1 analysts done' in t)
        mt = await J("Store.all('mytask').find(t => t.title === 'Book steering committee room').id")
        await pg.click(f'[data-fu="{mt}|done"]'); await pg.wait_for_timeout(300)
        c('"Done" closes the real task', await J(f"Store.get('{mt}').status") == 'Done')
        await pg.click(f'[data-fu="{tid}|due"]'); await pg.wait_for_selector('#ndf'); nd = await J("U.addDays(U.todayStr(), 9)"); await pg.fill('#ndf [name=d]', nd); await pg.click('[data-ok]'); await pg.wait_for_timeout(400)
        td = await J(f"Store.all('todo', '*').find(t => t.fromTask === '{tid}')")
        c('"New date" moves the task and the analyst\'s To Do', await J(f"Store.get('{tid}').due") == nd and await J(f"U.addDays('{td['assigned']}', {td['duration']})") == nd)
        lt = await J("Store.all('mgrtask').find(t => t.task === 'Prepare LAB staffing plan').id")
        await pg.click(f'[data-fu="{lt}|drop"]'); await pg.wait_for_timeout(200); await pg.click('#modal [data-yes]'); await pg.wait_for_timeout(300)
        c('"Drop" cancels it', await J(f"Store.get('{lt}').status") == 'Canceled')
        c('outcomes are recorded in this meeting', await J(f"Object.keys(Store.get('{mid2}').followups).length") == 3)
        await pg.screenshot(path=f'{SHOTS}/meeting_followup.png', full_page=True)
        # third meeting: only the still-open one carries forward
        await pg.click('#nextmeet'); await pg.wait_for_selector('#mtf'); await pg.click('[data-ok]'); await pg.wait_for_timeout(500)
        t = await pg.inner_text('#main'); c('third meeting carries forward only what is still open', '1 open' in t and 'Report requests older than 3 days' in t and 'Book steering committee room' not in t)
        # decision log
        t = await s.go('#/meetings/decisions'); c('decision log', 'Each team reviews requests older than 3 days daily' in t)
        # project link
        await s.sign_in_as('apps-mgr'); await s.go('#/project/pj-m'); await pg.click('[data-ptab="backlog"]'); await pg.wait_for_timeout(300)
        c('linked action shows on the project', 'Actions from meetings' in await pg.inner_text('#main'))
        # attendee can read, cannot edit, does not see private notes
        await s.sign_in_as('lab-mgr'); t = await s.go(f'#/meeting/{mid}')
        c('attendee reads the minutes', 'LAB closing time went up' in t and await pg.locator('textarea[data-mf]').count() == 0)
        c('…but not the private notes', 'Talk to LAB manager privately' not in t)
        # hand-edited minutes by an attendee are ignored
        m = await J(f"Store.get('{mid}')")
        payload = json.dumps({'version': 1, 'kind': 'user', 'user': 'lab-mgr', 'records': [dict(m, items=[dict(i, decision='Forged decision') for i in m['items']], _ts=await J('Date.now()'), _by='lab-mgr')]})
        await J(f"(async () => {{ const fh = await Store.usersDir.getFileHandle('lab-mgr.json', {{create: true}}); const w = await fh.createWritable(); await w.write({json.dumps(payload)}); await w.close(); }})()"); await J("Store.sync(true)")
        c('attendee cannot change the minutes by editing files', 'Forged decision' not in json.dumps(await J(f"Store.get('{mid}').items")))
        # not an attendee
        await s.sign_in_as('yousef'); t = await s.go(f'#/meeting/{mid}'); c('analyst who did not attend cannot open it', ('did not attend' in t or 'permission' in t) and 'LAB closing time' not in t)
        c('…and can set up her own meetings (Meetings in the menu)', 'Meetings' in await pg.inner_text('nav'))
        # 1:1 preparation
        await s.sign_in_as('khalid'); t = await s.go('#/oneonone/apps-mgr')
        c('1:1 prep shows open tasks and projects', '1:1 with APPS Manager' in t and 'Report requests older than 3 days' in t and 'Order set clean-up' in t)
        await pg.click('#start11'); await pg.wait_for_timeout(500)
        c('"Start a 1:1" creates the meeting', await J("Store.get(location.hash.split('/').pop()).type") == '1:1')
        # manager runs a team meeting: actions for analysts become To Dos
        await s.sign_in_as('apps-mgr'); await s.go('#/meetings'); await pg.click('#newmeet'); await pg.wait_for_selector('#mtf')
        await pg.fill('#mtf [name=title]', 'APPS team meeting'); await pg.select_option('#mtf [name=type]', 'Team meeting'); await pg.check('#mtf [name=att][value="yousef"]'); await pg.click('[data-ok]'); await pg.wait_for_timeout(500)
        await add_action(0, 'Update the downtime guide', 'yousef', 4)
        c("manager's action for an analyst becomes a To Do", await J("Store.all('todo', '*').some(t => t.task === 'Update the downtime guide' && t.analyst === 'yousef' && !!t.fromMeeting)"))
        await s.sign_in_as('yousef'); c('analyst sees it on My Day', 'Update the downtime guide' in await s.go('#/home'))
        c.done(s)
run(main())
