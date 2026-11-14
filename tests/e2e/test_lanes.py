"""Lanes with admin templates (2026.11.11.10). The admin makes lane templates in Admin → Work & workflows → Project tasks
(lanes = boards of their own, each with its own statuses, colours and a limit); a Lanes project picks one and FOLLOWS it.
Covers: making a template, a project owner creating a Lanes project from it, the board (status box on the card, the task
stays in its lane, no ⚙ Lanes for owners, limit, Closed when all done, Hide done, quick add), the task form's Lane box,
editing a template changes every project that uses it (renames follow; a removed status asks once where tasks go), only the
admin switches a project's template, a template shared with every team, turning lanes made before into templates, and
the trust check keeping all of it."""
from harness import app_session, Check, run, SHOTS

async def fill_template(pg, name, lanes):
    """lanes = [(lane name, limit, [(status, cat)…])…] — in the open template window (starts with one lane, 3 statuses)"""
    await pg.wait_for_timeout(400)   # the window focuses its first box a moment after opening — let that happen before typing
    await pg.fill('#lnname', name)
    for i, (ln, lim, sts) in enumerate(lanes):
        if i: await pg.click('[data-ladd]'); await pg.wait_for_selector(f'[data-lrow="{i}"] .lr-name')
        await pg.fill(f'[data-lrow="{i}"] .lr-name', ln)
        if lim: await pg.fill(f'[data-lrow="{i}"] .lr-limit', str(lim))
        n = await pg.locator(f'[data-lrow="{i}"] [data-srow]').count()
        while n < len(sts):   # wait for each redraw — a second click on a stale button would add an empty status
            await pg.click(f'[data-sadd="{i}"]'); await pg.wait_for_selector(f'[data-srow="{i}|{n}"]'); n += 1
        while n > len(sts): n -= 1; await pg.click(f'[data-sdel="{i}|{n}"]'); await pg.wait_for_selector(f'[data-srow="{i}|{n}"]', state='detached')
        for j, (sn, cat) in enumerate(sts):
            await pg.fill(f'[data-srow="{i}|{j}"] .sr-name', sn); await pg.select_option(f'[data-srow="{i}|{j}"] .sr-cat', cat)

async def main():
    c = Check('lanes (admin templates)')
    async with app_session() as s:
        pg = s.page; J = s.js
        # ---------- the admin makes a template ----------
        t = await s.go('#/admin/work/tasks', 800)
        c('Admin → Project tasks: Lane templates, with the built-in standard one', 'Lane templates' in t and 'Standard: Open → In Progress → Done' in t)
        await pg.click('#lnnew'); await pg.wait_for_selector('#lnname')
        await fill_template(pg, 'Dashboard project', [('Build', 0, [('Open', 'todo'), ('Doing', 'doing'), ('Built', 'done')]), ('Validation', 1, [('Waiting', 'wait'), ('In validation', 'doing'), ('Failed', 'doing'), ('Passed', 'done')])])
        await pg.click('[data-lnsave]'); await pg.wait_for_timeout(500)
        tpl = await J("Lanes.sets('apps').find(x => x.name === 'Dashboard project')")
        c('template saved: two lanes with their own statuses and a limit', tpl and [l['name'] for l in tpl['lanes']] == ['Build', 'Validation'] and [x['name'] for x in tpl['lanes'][1]['statuses']] == ['Waiting', 'In validation', 'Failed', 'Passed'] and tpl['lanes'][1]['limit'] == 1, tpl or await J("JSON.stringify({ toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent), open: !!document.querySelector('#lnname'), names: [...document.querySelectorAll('#lneditor input.lr-name, #lneditor input.sr-name')].map(x => x.value), sets: Lanes.sets('apps').map(x => x.name) })"))
        tid = tpl['id']; bid, vid = tpl['lanes'][0]['id'], tpl['lanes'][1]['id']
        # ---------- a project owner creates a Lanes project from it ----------
        await s.sign_in_as('apps-mgr'); await s.go('#/projects', 500)
        await J("UI.editRecord('project', {})"); await pg.wait_for_selector('#recform [name=mode]')
        await pg.fill('#recform [name=name]', 'Lab dashboard'); await pg.select_option('#recform [name=mode]', 'lanes')
        opts = await J("[...document.querySelectorAll('#recform [name=laneSet] option')].map(o => o.textContent)")
        c('the project form lists the admin templates', 'Dashboard project' in opts and any('Standard' in o for o in opts), opts)
        await pg.select_option('#recform [name=laneSet]', tid); await pg.click('[data-save]'); await pg.wait_for_timeout(500)
        p = await J("Store.all('project', '*').find(x => x.name === 'Lab dashboard')"); pid = p['id']
        c('the project follows the template (no copy of its own)', p.get('laneSet') == tid and not p.get('lanes') and await J(f"Lanes.of(Store.get('{pid}')).map(l => l.name).join()") == 'Build,Validation')
        await J(f"""(() => {{ const T = (id, n, lane, st) => Store.save({{ c: 'ptask', id, project: '{pid}', team: 'apps', n, title: 'Task ' + n, type: 'Task', points: 1, lane, status: st, assignee: 'yousef' }});
          T('l1', 1, '{vid}', 'Waiting'); T('l2', 2, '{vid}', 'In validation'); T('l3', 3, '{bid}', 'Built'); }})()""")
        await J("ps('prj').tab = 'board'"); await s.go('#/home'); await s.go(f'#/project/{pid}', 700)
        c('the board shows its template and ⚙ Lanes for the super admin (2026.11.12.8)', await pg.locator('#boardedit').count() == 1 and 'Dashboard project' in await pg.inner_text('#main'))
        c('the Validation lane is over its limit (2 open, limit 1)', await pg.locator(f'.kcol.lane-full[data-lane="{vid}"]').count() == 1)
        c('the Build lane is Closed (every task in it is done)', await pg.locator(f'.kcol.lane-closed[data-lane="{bid}"]').count() == 1 and 'Closed' in await pg.inner_text(f'[data-lane="{bid}"] .lane-h'))
        opts = await J("[...document.querySelector('[data-lst=\"l1\"]').options].map(o => o.value)")
        c("a card's status box lists only its lane's statuses", opts == ['Waiting', 'In validation', 'Failed', 'Passed'], opts)
        await pg.select_option('[data-lst="l2"]', 'Passed'); await pg.wait_for_timeout(500)
        c('changing the status on the card: same lane, done by status', await J("(t => t.status === 'Passed' && t.lane === '" + vid + "' && Scrum.isDone(t))(Store.get('l2'))"))
        await pg.fill(f'[data-laneadd="{bid}"]', 'One more build'); await pg.press(f'[data-laneadd="{bid}"]', 'Enter'); await pg.wait_for_timeout(400)
        c('adding a task to a closed lane opens it again', await pg.locator(f'.kcol.lane-closed[data-lane="{bid}"]').count() == 0)
        await pg.check('#hidedone'); await pg.wait_for_timeout(300)
        c('Hide done', await pg.locator('[data-lst="l2"]').count() == 0 and await pg.locator('[data-showdone]').count() >= 1)
        await pg.uncheck('#hidedone'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=f'{SHOTS}/lanes_board.png', full_page=True)
        await J("UI.editRecord('ptask', Store.get('l1'))"); await pg.wait_for_selector('#recform [name=lane]')
        c('the task form: a Lane box, the Status list follows the lane', await J("[...document.querySelectorAll('#recform [name=status] option')].map(o => o.value).join('/')") == 'Waiting/In validation/Failed/Passed')
        await J("UI.closeModal()")
        # ---------- only the admin switches a project's template ----------
        await J(f"UI.editRecord('project', Store.get('{pid}'))"); await pg.wait_for_selector('#recform [name=laneSet]')
        c('the owner sees the template fixed', await J("[...document.querySelectorAll('#recform [name=laneSet] option')].map(o => o.value)") == [tid])
        await J("UI.closeModal()"); await J("Store.flush()"); await pg.wait_for_timeout(300)
        # ---------- the admin edits the template: every project follows ----------
        await s.sign_in_as('adam'); await s.go('#/admin/work/tasks', 800)
        await pg.click(f'[data-lnedit="{tid}"]'); await pg.wait_for_selector('#lnname')
        c('the template window says which projects use it', 'Lab dashboard' in await pg.inner_text('#modal'))
        await pg.fill('[data-srow="1|0"] .sr-name', 'Queued'); await pg.click('[data-lnsave]'); await pg.wait_for_timeout(500)
        c('renaming a status in the template renames it on the project\'s tasks', await J("Store.get('l1').status") == 'Queued')
        await pg.click(f'[data-lnedit="{tid}"]'); await pg.wait_for_selector('#lnname')
        await pg.click('[data-sdel="1|0"]'); await pg.wait_for_timeout(100); await pg.click('[data-lnsave]'); await pg.wait_for_selector('#tfmapgo')
        c('removing a status that has tasks asks (once) where they go', 'Validation › Queued' in await pg.inner_text('#modal'))
        await pg.select_option('[data-tfmap^="Validation › Queued|"]', 'Validation › Failed'); await pg.click('#tfmapgo'); await pg.wait_for_timeout(500)
        c('…they go there', await J("Store.get('l1').status") == 'Failed')
        # the admin switches the project to the standard template
        await J(f"UI.editRecord('project', Store.get('{pid}'))"); await pg.wait_for_selector('#recform [name=laneSet]')
        await pg.select_option('#recform [name=laneSet]', 'std'); await pg.click('[data-save]'); await pg.wait_for_selector('#tfmapgo', timeout=5000)
        c('switching the template asks where tasks go', await pg.locator('[data-tfmap]').count() >= 1)
        await pg.click('#tfmapgo'); await pg.wait_for_timeout(500)
        c('…the project now follows the standard lanes', await J(f"Lanes.of(Store.get('{pid}')).map(l => l.name).join()") == 'Work' and await J("Store.get('l1').lane") == 'work')
        # ---------- a template shared with every team ----------
        await s.go('#/home'); await s.go('#/admin/work/tasks', 800)
        await pg.click('#lnnew'); await pg.wait_for_selector('#lnname')
        await fill_template(pg, 'Shared go-live', [('Go-live', 0, [('Planned', 'todo'), ('Live', 'done')])]); await pg.check('#lnshared'); await pg.click('[data-lnsave]'); await pg.wait_for_timeout(400)
        c('a shared template shows for another team too', await J("Lanes.sets('bi').some(x => x.name === 'Shared go-live' && x.shared)"))
        # ---------- lanes made before templates → admin templates ----------
        await J("""(() => { Store.save({ c: 'project', id: 'old-l', name: 'Made before', team: 'apps', status: 'In Progress', manager: 'apps-mgr', members: ['yousef'], mode: 'lanes', start: U.todayStr(), lanes: [{ id: 'w', name: 'Work', color: '#2563eb', statuses: [{ id: 'a', name: 'Open', cat: 'todo' }, { id: 'b', name: 'Closed', cat: 'done' }] }] });
          Store.save({ c: 'ptask', id: 'old-t', project: 'old-l', team: 'apps', n: 1, title: 'Old', type: 'Task', points: 1, lane: 'w', status: 'Closed', assignee: 'yousef' }); })()""")
        await s.go('#/home'); t = await s.go('#/admin/work/tasks', 800)
        c('Admin offers to turn lanes made before into templates', 'From before templates' in t and await pg.locator('#lnconv').count() == 1)
        await pg.click('#lnconv'); await pg.click('.modal [data-yes]'); await pg.wait_for_timeout(500)
        op = await J("Store.get('old-l')")
        c('…the project follows its new template, same lanes, the task untouched', op.get('laneSet') and await J("Lanes.tplOf(Store.get('old-l')).name") == 'Made before — lanes' and await J("(t => t.status === 'Closed' && t.lane === 'w' && Scrum.isDone(t))(Store.get('old-t'))"))
        # ---------- the trust check ----------
        await J("Store.flush()"); await pg.wait_for_timeout(400); await J("Store.sync(true)"); await pg.wait_for_timeout(300)
        c('everything passes the trust check', not await J("Store.rejected.some(x => ['ptask', 'project', 'settings', 'lanetpl'].includes(x.c))"), await J("JSON.stringify(Store.rejected)"))
        c.done(s)

run(main())
