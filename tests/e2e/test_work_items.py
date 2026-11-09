"""Work items like Jira: project keys (BC-101), the types a project takes, epics (tab, progress, link), custom fields per
team and type (admin, required, on a move's screen), the approval step (asked → approver approves / refuses, recorded,
"approval recorded" validator), requests from another team (intake → My requests), automation rules (created, reaches a
status, overdue, epic done), the work dashboard, and per-project permissions (who sees / adds / moves)."""
from harness import app_session, Check, run, SHOTS

async def main():
    c = Check('work items')
    async with app_session() as s:
        pg = s.page
        await s.js("""(() => { const t = U.todayStr();
          Store.save({ c: 'project', id: 'pj-e', name: 'Enhancements', key: 'bc', team: 'apps', status: 'In Progress', manager: 'apps-mgr', members: ['yousef', 'layla'], start: t, types: ['Epic', 'Story', 'Bug'] });
          Store.save({ c: 'ptask', id: 'e1', project: 'pj-e', n: 1, title: 'Pharmacy inventory dashboard', type: 'Epic', points: 0, status: 'To Do' });
          Store.save({ c: 'ptask', id: 's1', project: 'pj-e', n: 2, title: 'Scanning report', type: 'Story', points: 3, status: 'To Do', assignee: 'yousef', epic: 'e1' });
          Store.save({ c: 'ptask', id: 's2', project: 'pj-e', n: 3, title: 'Stock reconciliation', type: 'Story', points: 5, status: 'Done', assignee: 'layla', epic: 'e1', doneDate: t }); })()""")
        await s.js("Store.flush()")
        # ---------- keys + types ----------
        c('project key: BC-2', await s.js("Work.key(Store.get('s1'))") == 'BC-2')
        await s.js("Store.save(Object.assign({}, Store.get('pj-e'), { key: 'BC' }))")
        c('only the project\'s types (+ none others)', await s.js("Work.typesFor(Store.get('pj-e'))") == ['Epic', 'Story', 'Bug'])
        t = await s.go('#/project/pj-e', 700)
        await pg.click('.tabs >> text=Epics'); await pg.wait_for_timeout(400); t = await pg.inner_text('#main')
        c('Epics tab: the epic with its items and progress (5 of 8 points)', 'Pharmacy inventory dashboard' in t and 'Scanning report' in t and '1/2 items' in t and '5/8 points' in t, t[:600])
        # ---------- custom fields ----------
        t = await s.go('#/admin/taskflows', 700)
        c('Admin → Task workflows: fields + automation cards', 'Fields on work items' in t and 'Automation rules' in t)
        await pg.click('#cfadd'); await pg.wait_for_timeout(200)
        await pg.fill('[data-cf="0"] .cf-l', 'Requesting department'); await pg.check('[data-cf="0"] .cf-r[value="Story"]')
        await pg.click('#cfadd'); await pg.wait_for_timeout(200)
        await pg.fill('[data-cf="1"] .cf-l', 'UAT required'); await pg.select_option('[data-cf="1"] .cf-k', 'bool'); await pg.wait_for_timeout(200)
        await pg.click('#cfsave'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        fl = await s.js("Work.custom('apps')")
        c('two fields saved for APPS', [f['label'] for f in fl] == ['Requesting department', 'UAT required'] and fl[0]['req'] == ['Story'], fl)
        dep = fl[0]['key']
        await s.go('#/project/pj-e', 600)
        await s.js("UI.editRecord('ptask', { project: 'pj-e', team: 'apps', type: 'Story' })"); await pg.wait_for_selector(f'#modal [name={dep}]')
        await pg.fill('#modal [name=title]', 'New story'); await pg.click('#modal [data-save], #modal button.primary'); await pg.wait_for_timeout(300)
        c('a required field stops the save', await pg.locator('#modal').count() == 1 and not await s.js("Store.all('ptask').some(t => t.title === 'New story')"))
        await pg.fill(f'#modal [name={dep}]', 'Pharmacy'); await pg.click('#modal [data-save], #modal button.primary'); await pg.wait_for_timeout(300); await s.js("Store.flush()")
        c('…filled → saved with the field', await s.js(f"(Store.all('ptask').find(t => t.title === 'New story') || {{}})['{dep}']") == 'Pharmacy')
        # ---------- automation ----------
        await s.go('#/admin/taskflows', 600)
        await s.js(f"""TaskFlowAdmin.save('apps', {{ autos: [
          {{ id: 'au1', name: 'Bug created', on: 'created', type: 'Bug', do: [{{ k: 'notify', who: 'teamlead' }}, {{ k: 'priority', value: 'High' }}] }},
          {{ id: 'au2', name: 'UAT checklist', on: 'status', status: 'In Review', do: [{{ k: 'checklist', value: 'Test case 1\\nTest case 2' }}, {{ k: 'assign', who: 'reporter' }}] }},
          {{ id: 'au3', name: 'Overdue', on: 'overdue', do: [{{ k: 'notify', who: 'owner' }}] }},
          {{ id: 'au4', name: 'Epic done', on: 'epicDone', do: [{{ k: 'set', field: 'status', value: 'Done' }}, {{ k: 'notify', who: 'owner' }}] }} ] }})"""); await s.js("Store.flush()")
        await s.go('#/projects', 300); t = await s.go('#/admin/taskflows', 600)
        c('rules listed in the admin card', await pg.locator('[data-au]').count() == 4)
        await s.sign_in_as('yousef', 'analyst')
        await s.js("UI.editRecord('ptask', { project: 'pj-e', team: 'apps', type: 'Bug' })"); await pg.wait_for_selector('#modal [name=title]')
        await pg.fill('#modal [name=title]', 'Count is wrong'); await pg.click('#modal [data-save], #modal button.primary'); await pg.wait_for_timeout(500); await s.js("Store.flush()")
        b = await s.js("Store.all('ptask').find(t => t.title === 'Count is wrong')")
        c('created + Bug → priority High, the team manager told', b and b['priority'] == 'High' and await s.js("Store.all('nudge').some(n => n.about === '%s' && n.to === 'apps-mgr')" % b['id']), b)
        await s.js("Store.save(Object.assign({}, Store.get('s1'), { reporter: 'layla' }))")
        await s.js("TaskFlowUI.go('s1', 'In Progress')"); await pg.wait_for_timeout(200); await s.js("TaskFlowUI.go('s1', 'In Review')"); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        r = await s.js("Store.get('s1')")
        c('reaches In Review → checklist added, assigned to the reporter', r['status'] == 'In Review' and [x['t'] for x in r['checklist']] == ['Test case 1', 'Test case 2'] and r['assignee'] == 'layla', r)
        # ---------- approval step ----------
        await s.sign_in_as('adam')
        await s.js("""(() => { const w = TaskFlow.example(); const done = w.trs.find(t => t.to === 'Done'); done.cond = []; done.approve = [{ k: 'planner' }]; done.screen = []; w.trs.push({ id: 'ta', name: 'Close', from: ['In Review'], to: 'Done', valid: [{ k: 'approved' }] });
          TaskFlowAdmin.save('apps', { flows: [w], use: w.id }); })()"""); await s.js("Store.flush()")
        await s.sign_in_as('layla', 'analyst')
        await s.js("Store.save(Object.assign({}, Store.get('s1'), { checklist: [] }))")
        tr = await s.js("TaskFlow.forTask(Store.get('s1')).trs.find(t => t.name === 'Done').id")
        out = await s.js(f"TaskFlow.run(Store.get('s1'), '{tr}', {{ comment: 'Ready' }})"); await s.js("Store.flush()")
        r = await s.js("Store.get('s1')")
        c('a move needing approval waits (status unchanged, pending recorded)', out == 'pending' and r['status'] == 'In Review' and r['pending']['by'] == 'layla', (out, r.get('pending')))
        c('…and the approver is told', await s.js("Store.all('nudge').some(n => n.about === 's1' && n.to === 'apps-mgr' && /approval asked/.test(n.text))"))
        c('the validator "approval recorded" blocks another way round', 'approval' in await s.js("TaskFlow.run(Store.get('s1'), 'ta', {})"))
        await s.sign_in_as('apps-mgr'); t = await s.go('#/home', 600)
        c('Home: "Approvals for you"', 'Approvals for you' in t and 'Scanning report' in t)
        await pg.click('[data-apok="s1"]'); await s.js("Store.flush()"); await pg.wait_for_timeout(400)
        r = await s.js("Store.get('s1')")
        c('approved → moved to Done, approval recorded (who, when)', r['status'] == 'Done' and not r.get('pending') and r['approvals'][-1]['ok'] and r['approvals'][-1]['by'] == 'apps-mgr' and r['approvals'][-1]['asked'] == 'layla', r.get('approvals'))
        # epic done automation (s1 + s2 done) → epic set Done
        await pg.wait_for_timeout(300); await s.js("Store.flush()")
        c('all items of the epic done → the epic rule ran (epic Done)', await s.js("Store.get('e1').status") == 'Done', await s.js("Store.get('e1')"))
        # refuse path
        await s.js("Store.save(Object.assign({}, Store.get('s1'), { status: 'In Review', pending: { tr: '%s', trName: 'Done', to: 'Done', by: 'layla', at: Date.now(), form: {} } }))" % tr)
        await s.go('#/projects', 300); await s.go('#/home', 500); await pg.click('[data-apno="s1"]'); await pg.wait_for_timeout(200)
        c('refusing needs a note', await s.js("!!Store.get('s1').pending"))
        await pg.fill('#apnote-s1', 'Report totals wrong'); await pg.click('[data-apno="s1"]'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        r = await s.js("Store.get('s1')")
        c('…refused: stays, recorded with the note, asker told', r['status'] == 'In Review' and not r.get('pending') and r['approvals'][-1]['ok'] is False and await s.js("Store.all('nudge').some(n => n.to === 'layla' && /refused/.test(n.text))"))
        # ---------- overdue automation ----------
        await s.js("Store.save({ c: 'ptask', id: 'od1', project: 'pj-e', n: 9, title: 'Late one', type: 'Story', status: 'To Do', due: U.addDays(U.todayStr(), -3), assignee: 'yousef', cf: 1 })"); await s.js("Store.flush()")
        await s.js("Work._swept = 0"); await s.go('#/project/pj-e', 600); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        c('overdue → the owner is told, once per due date', await s.js("Store.all('nudge').filter(n => n.about === 'od1' && n.to === 'apps-mgr').length") == 1 and await s.js("Store.get('od1').fired.overdue") == await s.js("Store.get('od1').due"))
        await s.js("Work._swept = 0"); await s.go('#/project/pj-e', 600); await s.js("Store.flush()")
        c('…not twice', await s.js("Store.all('nudge').filter(n => n.about === 'od1' && n.to === 'apps-mgr').length") == 1)
        # ---------- intake ----------
        await s.sign_in_as('adam'); await s.js("Store.save(Object.assign({}, Store.get('pj-e'), { intake: true }))"); await s.js("Store.flush()")
        await s.sign_in_as('khalid'); t = await s.go('#/projects', 600)
        c('Projects: "Submit a request" + "Work dashboard"', await pg.locator('#rqnew').count() == 1 and 'Work dashboard' in t)
        await pg.click('#rqnew'); await pg.wait_for_selector('#rqf')
        c('the request form offers only the project\'s types (no Epic)', await s.js("[...document.querySelectorAll('#rqf [name=type] option')].map(o => o.value)") == ['Story', 'Bug'])
        await pg.fill('#rqf [name=title]', 'Compliance report'); await pg.fill('#rqf [name=requester]', 'Pharmacy')
        await pg.click('#rqgo'); await pg.wait_for_timeout(200)
        c('required custom field asked on the request too', await pg.locator('#rqf').count() == 1)
        await pg.fill(f'#rqf [name={dep}]', 'Pharmacy'); await pg.click('#rqgo'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        q = await s.js("Store.all('ptask').find(t => t.title === 'Compliance report')")
        c('request lands in the project at the start status, marked as a request', q and q['intake'] and q['reporter'] == 'khalid' and q['status'] == 'To Do' and q['requester'] == 'Pharmacy', q)
        t = await s.go('#/projects', 600)
        c('"My requests" shows it with its status', 'My requests' in t and 'Compliance report' in t)
        # ---------- dashboard ----------
        await s.sign_in_as('adam'); t = (await s.go('#/workdash', 700)).lower()
        c('Work dashboard: KPIs, time in status, waiting, workload, projects', all(x.lower() in t for x in ['Open', 'Closed', 'Average time to close', 'Overdue', 'Average days in each status', 'Workload', 'Enhancements']))
        await pg.screenshot(path=f'{SHOTS}/work_dashboard.png', full_page=True)
        # ---------- permissions ----------
        await s.js("Store.save(Object.assign({}, Store.get('pj-e'), { view: 'members' }))")
        await s.sign_in_as('nora', 'analyst') if await s.js("!!Store.member('nora')") else None
        who = await s.js("(Store.members().find(m => (m.team || 'apps') === 'apps' && !['yousef', 'layla', 'apps-mgr', 'adam'].includes(m.id) && m.active !== false && m.role === 'analyst') || {}).id")
        await s.sign_in_as(who, 'analyst')
        c('"Only the people on it": another APPS analyst does not see it', not await s.js("Scrum.canSee(Store.get('pj-e'))"), who)
        await s.sign_in_as('adam'); await s.js("Store.save(Object.assign({}, Store.get('pj-e'), { view: 'team', addBy: 'team', moveBy: 'members' }))")
        await s.sign_in_as(who, 'analyst')
        c('"Anyone in its team" can add work', await s.js("Scrum.canSee(Store.get('pj-e')) && Work.canAdd(Store.get('pj-e'))"))
        await s.sign_in_as('yousef', 'analyst')
        c('"Every member can move any task": Yousef may move Layla\'s task', await s.js("Scrum.canWork(Store.get('s2'))"))
        # the project form has the new fields
        await s.sign_in_as('adam'); await s.js("UI.editRecord('project', Store.get('pj-e'))"); await pg.wait_for_selector('#modal [name=key]')
        mt = await pg.inner_text('#modal')
        c('project form: key, types, requests, who sees / adds / moves', all(x in mt for x in ['Key', 'Work item types it takes', 'Other teams can submit requests', 'Who can see it', 'Who can add work', 'Who can move tasks']))
    c.done(s)

run(main())
