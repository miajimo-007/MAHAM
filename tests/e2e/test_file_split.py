"""Files stay small: help-desk rows go to monthly files; finished work of past years to a yearly archive (read only when
that year is picked); the one-time move from the old single file loses nothing. Shadow work / attendance of earlier
months, the admin log and the directories stay in the main file (2026.11.11.2)."""
from harness import app_session, Check, run
async def main():
    c = Check('file split')
    async with app_session() as s:
        pg = s.page; J = s.js
        # the old layout: everything in adam.json (as written by earlier versions)
        await J("""(async () => {
          const me = 'adam', recs = [], ts = Date.now() - 864e5;
          const add = r => recs.push(Object.assign(r, { _by: me, _ts: ts + recs.length }));
          for (let i = 0; i < 30; i++) add({ id: 'old-hd-' + i, c: 'helpdesk', reqId: String(500 + i), technician: 'NASSER, ADAM', subject: 'Old req ' + i, status: 'Closed', created: (i < 15 ? '2026-09-' : '2026-10-') + String(10 + (i % 15)).padStart(2, '0') + 'T08:00', resolved: '', elapsedHrs: 3, group: 'x', team: 'apps' });
          for (let i = 0; i < 20; i++) add({ id: 'old-sw-' + i, c: 'shadow', analyst: me, team: 'apps', date: '2025-06-' + String(1 + i).padStart(2, '0'), taskType: 'TRAINING >> x', source: 'Call', subject: 'Last year ' + i, minutes: 60 });
          add({ id: 'old-td-open', c: 'todo', analyst: me, team: 'apps', task: 'Still open from 2025', assigned: '2025-12-20', duration: 5, status: 'In Progress', finish: '' });
          add({ id: 'now-sw', c: 'shadow', analyst: me, team: 'apps', date: U.todayStr(), taskType: 'TRAINING >> x', source: 'Call', subject: 'This year', minutes: 30 });
          const d = new Date(); d.setDate(0); const prevDay = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); window._prevMonth = prevDay.slice(0, 7);
          add({ id: 'pm-sw', c: 'shadow', analyst: me, team: 'apps', date: prevDay, taskType: 'TRAINING >> x', source: 'Call', subject: 'Last month', minutes: 20 });
          add({ id: 'pm-att', c: 'attendance', analyst: me, team: 'apps', date: prevDay, type: 'Leave' });
          add({ id: 'al-1', c: 'adminlog', at: Date.now(), target: 'settings-features', what: 'x', lines: [], before: { big: 'y'.repeat(2000) } });
          add({ id: 'dir-1', c: 'itdir', name: 'Printer desk', ext: '1234' });
          const fh = await Store.usersDir.getFileHandle(me + '.json', { create: true }); const w = await fh.createWritable();
          await w.write(JSON.stringify({ version: 1, kind: 'user', user: me, records: recs })); await w.close();
          Store.own = {}; Store.pending = {}; Store.sources = {}; await Store.sync(true); await Store.flush(); await Store.sync(true);
        })()""")
        await pg.wait_for_timeout(500)
        files = await J("(async () => { const out = []; for await (const [n] of Store.usersDir.entries()) if (n.startsWith('adam')) out.push(n); return out.sort(); })()")
        c('help desk split by month, 2025 work archived, main file kept', 'adam.hd-2026-09.json' in files and 'adam.hd-2026-10.json' in files and 'adam.y2025.json' in files and 'adam.json' in files, files)
        main = await J("(async () => (await Store.readJSON(Store.usersDir, 'adam.json')).json.records.map(r => r.id))()")
        c('main file: no help desk rows, no archived work', not any(x.startswith('old-hd') or x.startswith('old-sw') for x in main), main[:8])
        c('open To Do from last year stays in the main file', 'old-td-open' in main)
        pm = await J("window._prevMonth"); ym = await J("(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })()")
        c('earlier months, the admin log and the directories stay in the main file', all(x in main for x in ('pm-sw', 'pm-att', 'al-1', 'dir-1', 'now-sw')), main[-8:])
        c('…and are read', await J("['pm-sw', 'pm-att', 'al-1', 'dir-1'].every(id => !!Store.get(id))"))
        c('help desk still all there (30)', await J("Store.all('helpdesk', '*').filter(r => r.id.startsWith('old-hd')).length") == 30)
        c('nothing refused by the trust check', await J("Store.rejected.filter(x => /adam\\\\./.test(x.file)).length") == 0, await J("JSON.stringify(Store.rejected.slice(0, 3))"))
        c('a backup was made before the move', await J("(async () => (await Store.listBackups()).some(b => /before-split/.test(b.name)))()"))
        c('archive not read until 2025 is picked', await J("!Store.get('old-sw-0')"))
        yrs = await J("[...document.querySelectorAll('#yearsel option')].map(o => o.value)")
        c('2025 offered in the year box', '2025' in yrs, yrs)
        await pg.select_option('#yearsel', '2025'); await pg.wait_for_timeout(800)
        c('picking 2025 reads the archive', await J("Store.all('shadow', '*').filter(r => r.id.startsWith('old-sw')).length") == 20)
        # another person sees the help desk rows and (after picking 2025) the archive, nothing refused
        await s.sign_in_as('yousef'); await J("Store.sync(true)"); await pg.wait_for_timeout(300)
        c("teammates read the split files", await J("Store.all('helpdesk', '*').filter(r => r.id.startsWith('old-hd')).length") == 30 and await J("Store.rejected.length") == 0)
        c("teammates read the new part files too", await J("!!Store.get('pm-sw') && !!Store.get('dir-1')"))
        # saving again rewrites only what changed
        await s.sign_in_as('adam', 'admin')
        before = await J("(async () => { const o = {}; for await (const [n, h] of Store.usersDir.entries()) if (n.startsWith('adam')) o[n] = (await h.getFile()).lastModified; return o; })()")
        await pg.wait_for_timeout(50)
        await J("(async () => { Store.save({ c: 'shadow', analyst: 'adam', team: 'apps', date: U.todayStr(), taskType: 'TRAINING >> x', source: 'Call', subject: 'One more', minutes: 15 }); await Store.flush(); })()")
        after = await J("(async () => { const o = {}; for await (const [n, h] of Store.usersDir.entries()) if (n.startsWith('adam')) o[n] = (await h.getFile()).lastModified; return o; })()")
        changed = sorted(k for k in after if after[k] != before.get(k))
        c('a normal save writes only the main file (+ its small activity-log file)', [k for k in changed if '.log-' not in k] == ['adam.json'], changed)
        c.done(s)
run(main())
