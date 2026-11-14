"""Boards the Kanban Method way: a WIP limit per column (header "n / limit", red when over — a warning only), a
"Done when…" policy per column (ⓘ on the header), set with ⚙ Board by the project owner / an Admin / the super admin
(not by a member), and the flow metrics on the project's Reports tab (cycle time, throughput, cumulative flow)."""
from harness import app_session, Check, run, SHOTS

async def main():
    c = Check('Kanban method')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J("""(() => { const t = U.todayStr(); const d = n => U.addDays(t, -n);
          Store.save({ c: 'project', id: 'km-p', name: 'Kanban method', team: 'apps', status: 'In Progress', manager: 'apps-mgr', members: ['yousef', 'layla'], mode: 'kanban', start: d(40) });
          const cols = Scrum.columns(Store.get('km-p'));
          const T = (id, st, extra) => Store.save(Object.assign({ c: 'ptask', id, project: 'km-p', team: 'apps', n: +id.slice(3), title: 'Task ' + id, type: 'Task', points: 1, status: st, assignee: 'yousef' }, extra || {}));
          T('km-1', cols[1], { createdOn: d(10), startedOn: d(8) }); T('km-2', cols[1], { createdOn: d(9), startedOn: d(7) }); T('km-3', cols[1], { createdOn: d(9), startedOn: d(5) });
          T('km-4', cols[cols.length - 1], { createdOn: d(20), startedOn: d(15), doneDate: d(10), hist: [{ at: Date.parse(d(15) + 'T09:00:00'), by: 'yousef', from: cols[0], to: cols[1], tr: 'x' }, { at: Date.parse(d(10) + 'T09:00:00'), by: 'yousef', from: cols[1], to: cols[cols.length - 1], tr: 'x' }] });
          T('km-5', cols[cols.length - 1], { createdOn: d(12), startedOn: d(6), doneDate: d(2) }); T('km-6', cols[0], { createdOn: d(3) }); })()""")
        await J("Store.flush()"); await pg.wait_for_timeout(300)
        cols = await J("Scrum.columns(Store.get('km-p'))")
        # ---------- ⚙ Columns ----------
        await J("ps('prj').tab = 'board'"); await s.go('#/home'); await s.go('#/project/km-p', 700)
        c('the board has ⚙ Board for the super admin', await pg.locator('#boardedit').count() == 1)
        await pg.click('#boardedit'); await pg.wait_for_selector('[data-bdrow="1"] .bd-wip')
        await pg.fill('[data-bdrow="1"] .bd-wip', '2'); await pg.fill('[data-bdrow="1"] .bd-pol', 'tested by someone else'); await pg.click('[data-bdsave]'); await pg.wait_for_timeout(400)
        c('only limits changed: the project still follows the team statuses', await J("!TaskFlow.ownFlow(Store.get('km-p'))"))
        p = await J("Store.get('km-p')")
        c('WIP limit and policy saved on the project', p.get('wip', {}).get(cols[1]) == 2 and p.get('policy', {}).get(cols[1]) == 'tested by someone else', (p.get('wip'), p.get('policy')))
        col = f'[data-col="{cols[1]}"]'
        c('3 open cards, limit 2: the header shows "3 / 2" and the column is red', await pg.locator(f'.kcol.wip-over{col}').count() == 1 and '3 / 2' in await pg.inner_text(f'{col} .kcol-h'))
        c('the "Done when…" policy is on the header (ⓘ)', 'tested by someone else' in (await pg.get_attribute(f'{col} .kpol', 'title') or ''))
        await pg.screenshot(path=f'{SHOTS}/kanban_wip.png')
        await J("TaskFlowUI.go('km-6', " + repr(cols[1]) + ")"); await pg.wait_for_timeout(400)
        c('over the limit is a warning only: a card can still move in', await J("Store.get('km-6').status") == cols[1])
        # ---------- a member cannot change the columns ----------
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/home'); await s.go('#/project/km-p', 700)
        c('a member does not get ⚙ Board', await pg.locator('#boardedit').count() == 0)
        # ---------- flow metrics ----------
        await s.sign_in_as('adam'); await J("ps('prj').tab = 'reports'"); await s.go('#/home'); t = await s.go('#/project/km-p', 800)
        c('Reports: cycle time, throughput, work in progress, cumulative flow', all(x.lower() in t.lower() for x in ['Cycle time (median)', '85% done within', 'Throughput', 'Work in progress', 'Cumulative flow']), t[:300])
        f = await J("(f => ({ med: f.med, n: f.ct.length, wk: f.weeks.reduce((a, w) => a + w.value, 0), last: f.series[f.series.length - 1].n }))(KanbanUI.flow(Store.get('km-p'), Scrum.items('km-p'), 30))")
        c('cycle time: median of the done tasks (5 and 4 days → 4)', f['n'] == 2 and f['med'] == 4, f)
        c('throughput counts the 2 done tasks', f['wk'] == 2, f)
        c('cumulative flow today: 2 done, 4 in progress', f['last'].get('done') == 2 and f['last'].get('doing') == 4, f['last'])
        c('a status from the history is used for past days (km-4 was in progress 12 days ago)', await J(f"KanbanUI.statusOn(Store.get('km-4'), U.addDays(U.todayStr(), -12))") == cols[1])
        await pg.screenshot(path=f'{SHOTS}/kanban_flow.png', full_page=True)
        await J("Store.flush()"); await pg.wait_for_timeout(300); await J("Store.sync(true)")
        c('nothing refused by the trust check', not await J("Store.rejected.some(x => ['project', 'ptask'].includes(x.c))"), await J("JSON.stringify(Store.rejected)"))
        c.done(s)

run(main())
