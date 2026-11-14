"""MAHAM open twice as the same person (another window, tab or PC): my own file changes on disk without this copy having
written it → a red bar says so (my own saves never trigger it). A save that fails because the file changed under it says
what to do. Opening from inside a zip shows a warning."""
import json
from harness import app_session, Check, run

async def main():
    c = Check('open twice')
    async with app_session() as s:
        pg = s.page
        for i in range(3):
            await s.js(f"Store.save({{ c: 'shadow', analyst: 'adam', team: 'apps', date: U.todayStr(), subject: 'Own save {i}', minutes: 10, taskType: 'Support', source: 'Phone' }})")
            await s.js("Store.flush()"); await pg.wait_for_timeout(300); await s.js("Store.sync()"); await pg.wait_for_timeout(200)
        await s.go('#/about'); await s.go('#/home', 400)
        c('my own saves never show the "open twice" bar', await pg.locator('#bntwin').count() == 0 and not await s.js("Store.twin()"))
        # the network share changing the file's time (same contents) is NOT another copy
        await pg.wait_for_timeout(1100)
        await s.js("""(async () => { const fh = await Store.usersDir.getFileHandle(App.me + '.json'); const t = await (await fh.getFile()).text(); const w = await fh.createWritable(); await w.write(t); await w.close(); })()""")
        await s.js("Store.sync()"); await pg.wait_for_timeout(300); await s.go('#/about'); await s.go('#/home', 400)
        c('the file time changing alone (same contents) does not show the bar', await pg.locator('#bntwin').count() == 0 and not await s.js("Store.twin()"))
        # another copy (as me) writes my file
        await pg.wait_for_timeout(1100)
        await s.js("""(async () => { const fh = await Store.usersDir.getFileHandle(App.me + '.json'); const j = JSON.parse(await (await fh.getFile()).text());
          j.records.push({ id: 'twin-1', c: 'shadow', analyst: 'adam', team: 'apps', date: U.todayStr(), subject: 'From the other window', minutes: 5, taskType: 'Support', source: 'Phone', _by: 'adam', _ts: Date.now() });
          const w = await fh.createWritable(); await w.write(JSON.stringify(j)); await w.close(); })()""")
        await s.js("Store.sync()"); await pg.wait_for_timeout(300); await s.go('#/about'); await s.go('#/home', 400)
        c('another copy writing my file → the red bar says MAHAM is open twice', await pg.locator('#bntwin').count() == 1 and 'open more than once as you' in await pg.inner_text('#bntwin'))
        c('…and its change is still read (nothing lost)', await s.js("!!Store.get('twin-1')"))
        # a save that fails because the file changed under it: the message says what to do, the change waits
        await s.js("Store._ogh = Store.usersDir.getFileHandle.bind(Store.usersDir); Store.usersDir.getFileHandle = async (n, o) => { if (o && o.create) throw new DOMException('the state had changed since it was read from disk', 'InvalidStateError'); return Store._ogh(n, o); }; 1")
        await s.js("Store.save({ c: 'shadow', analyst: 'adam', team: 'apps', date: U.todayStr(), subject: 'During the clash', minutes: 10, taskType: 'Support', source: 'Phone' })"); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        c('a save that fails because the file changed says what to do', await s.js("Store.dirty && /another program or another copy of MAHAM has it open/.test(Store.lastError)"), await s.js("Store.lastError"))
        await s.js("Store.usersDir.getFileHandle = Store._ogh; 1"); await s.js("Store.flush()"); await pg.wait_for_timeout(400)
        c('…and once the other copy is gone, the waiting change is saved', not await s.js("Store.dirty"))
        saved = await s.js("(async () => (await (await Store.usersDir.getFileHandle(App.me + '.json')).getFile()).text())()")
        c('…it is in the file', 'During the clash' in saved)
        c.done(s)

run(main())
