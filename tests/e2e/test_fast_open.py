"""Fast opening: the app opens from this PC's copy of the data, then reads only changed files; System Check → Speed."""
from harness import app_session, Check, run
async def main():
    c = Check('fast opening')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J("(async () => { Store.save({ c: 'shadow', analyst: 'adam', team: 'apps', date: U.todayStr(), taskType: 'TRAINING >> x', source: 'Call', subject: 'Before reopening', minutes: 20 }); await Store.flush(); await Store.sync(true); })()")
        await pg.wait_for_timeout(4600)
        c("this PC keeps a copy after reading", await J("(async () => !!(await IDB.get(Store.snapKey())))()"))
        # a teammate saves while "this PC" is closed
        await J("(async () => { const fh = await Store.usersDir.getFileHandle('yousef.json', { create: true }); const w = await fh.createWritable(); await w.write(JSON.stringify({ version: 1, kind: 'user', user: 'yousef', records: [{ id: 'fo-1', c: 'shadow', analyst: 'yousef', team: 'apps', date: U.todayStr(), taskType: 'TRAINING >> x', source: 'Call', subject: 'Saved by a teammate meanwhile', minutes: 10, _by: 'yousef', _ts: Date.now() }] })); await w.close(); })()")
        await J("(async () => { Store.sources = {}; Store.db = new Map(); await App.start(); })()"); await pg.wait_for_timeout(800)
        c("opened from this PC's copy", 'copy' in (await J("Store.stats.openedFrom || ''")), await J("Store.stats.openedFrom"))
        c('my data is there', await J("Store.all('shadow').some(r => r.subject === 'Before reopening')"))
        c("then the teammate's new change is read", await J("!!Store.get('fo-1')"))
        t = await s.go('#/syscheck', 600)
        c('System Check shows Speed (opening, refresh, saving, file sizes)', 'speed' in t.lower() and 'opening' in t.lower() and 'main file' in t.lower())
        c.done(s)
run(main())
