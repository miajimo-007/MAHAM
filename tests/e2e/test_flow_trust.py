"""Workflow moves are checked when files are read (and when saving): a hand-edited file cannot skip a step, make a move
reserved for the project owner, or move someone else's task. Allowed moves (incl. someone acting for the assignee) are
kept, the rest of a refused save is kept, a later workflow change never undoes earlier moves, and follow-ups follow
their party's workflow the same way. Refused moves are listed in System Check."""
import json
from harness import app_session, Check, run

async def write_file(s, name, records):
    existing = await s.js(f"(async () => {{ try {{ const f = await (await Store.usersDir.getFileHandle({json.dumps(name)})).getFile(); return JSON.parse(await f.text()).records; }} catch (e) {{ return []; }} }})()")
    ids = {r['id'] for r in records}
    payload = json.dumps({'version': 1, 'kind': 'user', 'user': name[:-5], 'records': [r for r in existing if r['id'] not in ids] + records})
    await s.js(f"(async () => {{ const fh = await Store.usersDir.getFileHandle({json.dumps(name)}, {{create: true}}); const w = await fh.createWritable(); await w.write({json.dumps(payload)}); await w.close(); }})()")

async def main():
    c = Check('workflow moves trust check')
    async with app_session() as s:
        pg = s.page
        await s.js("""(() => { const t = U.todayStr();
          Store.save({ c: 'settings', id: 'settings-taskflow-apps', use: 'wf-strict', flows: [{ id: 'wf-strict', name: 'Strict', start: 'To Do',
            statuses: [{ name: 'To Do', cat: 'todo' }, { name: 'In Progress', cat: 'doing' }, { name: 'Testing', cat: 'doing' }, { name: 'Done', cat: 'done' }],
            trs: [{ id: 's', name: 'Start', from: ['To Do'], to: 'In Progress', cond: [{ k: 'assignee' }] },
                  { id: 'f', name: 'Finish', from: ['In Progress'], to: 'Done', cond: [{ k: 'planner' }] },
                  { id: 't', name: 'Test', from: ['In Progress'], to: 'Testing' },
                  { id: 'b', name: 'Back', from: ['In Progress'], to: 'To Do' },
                  { id: 'r', name: 'Reopen', from: ['Done'], to: 'To Do' }] }] });
          Store.save({ c: 'project', id: 'pj-f', name: 'Flow trust', team: 'apps', status: 'In Progress', manager: 'apps-mgr', members: ['yousef', 'layla'], start: t });
          const tk = (id, n, st, who) => Store.save({ c: 'ptask', id, project: 'pj-f', team: 'apps', n, title: 'Task ' + n, type: 'Task', points: 1, status: st, assignee: who });
          tk('f1', 1, 'To Do', 'yousef'); tk('f2', 2, 'In Progress', 'yousef'); tk('f3', 3, 'To Do', 'layla'); tk('f4', 4, 'In Progress', 'yousef'); tk('f5', 5, 'To Do', 'yousef'); tk('f6', 6, 'To Do', 'yousef'); tk('f7', 7, 'In Progress', 'yousef'); tk('f8', 8, 'To Do', 'yousef'); tk('f9', 9, 'To Do', 'yousef');
          const fu = (id, n) => Store.save({ c: 'central', id, team: 'apps', analyst: 'yousef', party: 'central', fuv: 2, n, date: t, subject: 'FU ' + n, status: 'Under Review' });
          fu('ry-a', 901); fu('ry-b', 902);
          Store.save({ c: 'settings', id: 'settings-delegations', list: [{ from: 'yousef', to: 'layla', start: t }] }); })()""")
        await s.js("Store.flush()"); await pg.wait_for_timeout(500)
        c('the workflow is in force', await s.js("TaskFlow.forTask(Store.get('f1')).name") == 'Strict')
        ts = await s.js('Date.now() + 1000')
        g = lambda id: s.js(f"Store.get('{id}')")
        f = {k: await g(k) for k in ['f1', 'f2', 'f3', 'f4', 'f5', 'f7', 'f8', 'f9', 'ry-a', 'ry-b']}
        h = lambda r, to, by: r.get('hist', []) + [{'at': ts, 'by': by, 'from': r['status'], 'to': to, 'tr': 'x'}]
        await write_file(s, 'yousef.json', [
            dict(f['f1'], status='Done', hist=h(f['f1'], 'Done', 'yousef'), _ts=ts, _by='yousef'),        # skips a step
            dict(f['f2'], status='Done', resolution='Done', _ts=ts, _by='yousef'),                        # Finish is for the owner / manager
            dict(f['f3'], status='In Progress', _ts=ts, _by='yousef'),                                    # not his task
            dict(f['f4'], status='Done', title='Renamed by Yousef', _ts=ts, _by='yousef'),                 # wrong move + a fine change
            dict(f['f5'], status='In Progress', _ts=ts, _by='yousef'),                                    # allowed: Start, his own task
            dict(f['f7'], status='To Do', _ts=ts, _by='yousef'),                                          # allowed: Back (no rule)
            dict(f['f8'], status='Testing', _ts=ts, _by='yousef', hist=[{'at': ts - 50, 'by': 'yousef', 'from': 'To Do', 'to': 'In Progress', 'tr': 'Start'}, {'at': ts - 10, 'by': 'yousef', 'from': 'In Progress', 'to': 'Testing', 'tr': 'Test'}]),   # two allowed moves in one save
            dict(f['f9'], status='Testing', _ts=ts, _by='yousef'),                                        # the same jump with no moves behind it
            dict(f['ry-a'], status='Deployed', _ts=ts, _by='yousef'),                                     # follow-up: skips steps
            dict(f['ry-b'], status='Rejected', resolution='Rejected', _ts=ts, _by='yousef'),              # follow-up: Reject (from any step)
        ])
        f6 = await g('f6')
        await write_file(s, 'layla.json', [dict(f6, status='In Progress', _ts=ts, _by='layla')])   # acting for Yousef today
        await s.js("Store.sync(true)"); await pg.wait_for_timeout(400)
        st = await s.js("['f1','f2','f3','f4','f5','f6','f7','ry-a','ry-b'].map(id => Store.get(id).status)")
        c('skipping a step is undone', st[0] == 'To Do', st)
        c('a move only the project owner / manager may make is undone', st[1] == 'In Progress' and not (await g('f2')).get('resolution'), st)
        c("moving someone else's task is undone", st[2] == 'To Do', st)
        f4 = await g('f4')
        c('…the rest of that save is kept (title), only the step goes back', f4['status'] == 'In Progress' and f4['title'] == 'Renamed by Yousef', f4)
        c('allowed moves are kept (Start on his task, Back with no rule)', st[4] == 'In Progress' and st[6] == 'To Do', st)
        c('two allowed moves saved together are kept (Start, then Test)', await s.js("Store.get('f8').status") == 'Testing')
        c('…the same jump with no moves behind it is undone', await s.js("Store.get('f9').status") == 'To Do')
        c('someone acting for the assignee may move it', st[5] == 'In Progress', st)
        c('follow-up: skipping steps is undone', st[7] == 'Under Review', st)
        c('follow-up: an allowed move is kept', st[8] == 'Rejected', st)
        c('the undone move\'s history line is gone too', len((await g('f1')).get('hist') or []) == 0)
        rej = await s.js("Store.rejected.filter(x => /step change undone/.test(x.why)).map(x => x.id).sort()")
        c('System Check lists the 6 refused moves', rej == ['f1', 'f2', 'f3', 'f4', 'f9', 'ry-a'], await s.js("JSON.stringify(Store.rejected.map(x => [x.id, x.why]))"))
        t = await s.go('#/syscheck', 600)
        c('System Check shows the reason', 'not an allowed move' in t or 'step change undone' in t)
        # a later workflow change does not undo earlier moves (f5 Start was allowed then)
        await s.js("Store.save(Object.assign({}, Store.get('settings-taskflow-apps'), { flows: [Object.assign({}, Store.get('settings-taskflow-apps').flows[0], { trs: Store.get('settings-taskflow-apps').flows[0].trs.filter(x => x.id !== 's') })] }))")
        await s.js("Store.flush()"); await pg.wait_for_timeout(400); await s.js("Store.sync(true)"); await pg.wait_for_timeout(300)
        c('workflow changed later → the earlier allowed move stays', await s.js("Store.get('f5').status") == 'In Progress')
        c('…and the refused moves stay refused', await s.js("['f1','f2','f3','f4'].map(id => Store.get(id).status).join()") == 'To Do,In Progress,To Do,In Progress')
        # saving: the same check with a message
        await s.sign_in_as('yousef', 'analyst')
        await s.js("Store.save(Object.assign({}, Store.get('f3'), { status: 'In Progress' }))"); await pg.wait_for_timeout(300)
        toast = await s.js("[...document.querySelectorAll('.toast')].map(x => x.textContent).join(' | ')")
        c('saving a move that is not allowed is stopped with a reason', await s.js("Store.get('f3').status") == 'To Do' and 'not allowed' in toast, toast)
        err = await s.js("TaskFlow.run(Store.get('f5'), 'b', {})"); await s.js("Store.flush()"); await pg.wait_for_timeout(300); await s.js("Store.sync(true)")
        c("the screens' own moves still work and stay", err == '' and await s.js("Store.get('f5').status") == 'To Do', err)
        # super admin is not limited
        await s.sign_in_as('adam')
        await s.js("Store.save(Object.assign({}, Store.get('f1'), { status: 'Done' }))"); await s.js("Store.flush()"); await pg.wait_for_timeout(400); await s.js("Store.sync(true)")
        c('the super admin may set any step', await s.js("Store.get('f1').status") == 'Done')
        # (2026.11.12.1 kept moves saved by copies older than the step rules — parked, list item 5)
        c.done(s)

run(main())
