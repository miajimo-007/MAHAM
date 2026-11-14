"""Saving writes only the files that changed, at the same time (2026.11.12.4). On the shared folder each file costs about a
second to finish (Windows checks and swaps it), so writing several files one after another took seconds. Now: the main file is
written only when something in it changed; the other files are written together; a file records are LEAVING is written
after the files they go to (so a record is never only in memory); one file never has two writers; a write that fails
waits for the others before the save gives up, and the retry saves everything."""
from harness import app_session, Check, run

PATCH = r"""(() => {
  if (window._fsPatched) return; window._fsPatched = true;
  window._fs = { live: 0, maxLive: 0, perFile: {}, maxPerFile: 0, order: [], delay: 400, failNext: '' };
  const cw = FileSystemFileHandle.prototype.createWritable;
  FileSystemFileHandle.prototype.createWritable = async function (...a) {
    const w = await cw.apply(this, a); const n = this.name; if (!n.startsWith(App.me + '.')) return w;
    const F = window._fs; F.live++; F.maxLive = Math.max(F.maxLive, F.live);
    F.perFile[n] = (F.perFile[n] || 0) + 1; F.maxPerFile = Math.max(F.maxPerFile, F.perFile[n]);
    const close = w.close.bind(w);
    w.close = async () => {
      try {
        await new Promise(r => setTimeout(r, F.delay));   // the share finishing the file
        if (F.failNext && n.includes(F.failNext)) { F.failNext = ''; try { await w.abort(); } catch (e) { /* */ } throw new DOMException('The share refused the file', 'NoModificationAllowedError'); }
        const res = await close(); F.order.push(n); return res;
      } finally { F.live--; F.perFile[n]--; }
    };
    return w;
  };
})()"""

ONDISK = """async (name) => { try { const f = await (await Store.usersDir.getFileHandle(name)).getFile(); return JSON.parse(await Blob.prototype.text.call(f)).records.map(r => r.id); } catch (e) { return null; } }"""
WAIT = "!Store.dirty && !Store.saving && !Store._inflight"


async def main():
    c = Check('saving several files at once')
    async with app_session() as s:
        pg = s.page; J = s.js
        me = await J("App.me")
        ym = await J("U.todayStr().slice(0, 7)")
        pm = await J("(() => { const d = new Date(); d.setDate(0); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()")
        main_f, hd_f, m_f = f'{me}.json', f'{me}.hd-{ym}.json', f'{me}.y2025.json'
        # starting point: a shadow record in the main file and an admin-log line in its own file, both written
        await J("Store.save({ c: 'shadow', id: 'ps-sw', team: 'apps', analyst: App.me, date: U.todayStr(), subject: 'start', minutes: 10 })")
        await J("Store.save({ c: 'helpdesk', id: 'ps-al-0', reqId: '9000', subject: 'hd', status: 'Open', created: U.todayStr() + 'T08:00', team: 'apps' })")
        await J("Store.flush()"); await pg.wait_for_function(WAIT, timeout=20000)
        await J(PATCH)

        # 1 — a change in the main file and an admin-log line: two files, written at the same time
        await J("window._fs.maxLive = 0")
        await J("""(async () => { Store.save(Object.assign({}, Store.get('ps-sw'), { subject: 'one' }));
          Store.save({ c: 'helpdesk', id: 'ps-al-1', reqId: '9001', subject: 'hd', status: 'Open', created: U.todayStr() + 'T08:00', team: 'apps' }); await Store.flush(); })()""")
        await pg.wait_for_function(WAIT, timeout=20000)
        st = await J("Store.stats.saveSteps")
        names = sorted(f.split(' ')[0] for f in st['files'] if '.log-' not in f)   # + the small activity-log file when it changed too
        c('main file + help-desk file written in one save', names == sorted([main_f, hd_f]), names)
        c('…at the same time (all open together)', await J("window._fs.maxLive") >= 2, await J("window._fs.maxLive"))
        c('…so the save takes about one file\'s time, not two', st['wall'] < 750, round(st['wall']))
        c('…and both are on disk', 'ps-sw' in (await pg.evaluate(ONDISK, main_f)) and 'ps-al-1' in (await pg.evaluate(ONDISK, hd_f)))
        c('the Speed line says how many files and how long', 'file(s) written at the same time' in await J("(async () => { location.hash = '#/home'; await new Promise(r => setTimeout(r, 300)); location.hash = '#/admin/system/check'; await new Promise(r => setTimeout(r, 800)); const e = document.querySelector('#savesteps'); return e ? e.textContent : ''; })()"),
          await J("(document.querySelector('#savesteps') || {}).textContent || location.hash"))

        # 1b — the case from the shared folder: an Admin change (settings in the main file + its line in the Admin change log)
        await J("window._fs.maxLive = 0")
        await J("""(async () => { Store.save({ id: 'settings-ps-test', c: 'settings', v: 1 });
          Store.save({ c: 'adminlog', id: 'ps-adm-1', at: Date.now(), target: 'settings-ps-test', what: 'x', lines: [] }); await Store.flush(); })()""")
        await pg.wait_for_function(WAIT, timeout=20000)
        st = await J("Store.stats.saveSteps"); names = sorted(f.split(' ')[0] for f in st['files'] if '.log-' not in f)
        c('an Admin change writes the main file and the Admin change log file, together', names == sorted([main_f, f'{me}.alog-{ym}.json']) and await J("window._fs.maxLive") >= 2 and st['wall'] < 750, [names, round(st['wall'])])
        # 2 — only an admin-log line changed: the main file is not rewritten
        await J("window._fs.order = []")
        await J("(async () => { Store.save({ c: 'helpdesk', id: 'ps-al-2', reqId: '9002', subject: 'hd', status: 'Open', created: U.todayStr() + 'T08:00', team: 'apps' }); await Store.flush(); })()")
        await pg.wait_for_function(WAIT, timeout=20000)
        order = await J("window._fs.order")
        c('a save with only a help-desk row does not rewrite it', main_f not in order and hd_f in order, order)

        # 3 — a record LEAVES the main file (its date moved to 2025: archive): new file first, then the main file
        await J("window._fs.order = []")
        await J(f"(async () => {{ Store.save(Object.assign({{}}, Store.get('ps-sw'), {{ date: '2025-06-01' }})); await Store.flush(); }})()")
        await pg.wait_for_function(WAIT, timeout=20000)
        order = await J("window._fs.order"); rounds = await J("Store.stats.saveSteps.rounds")
        c('a record moving out of the main file: its new file is written first, the main file after', order.index(m_f) < order.index(main_f) if (m_f in order and main_f in order) else False, order)
        c('…in two rounds', rounds == 2, rounds)
        c('…the record is in its new file and no longer in the main file', 'ps-sw' in (await pg.evaluate(ONDISK, m_f) or []) and 'ps-sw' not in (await pg.evaluate(ONDISK, main_f)))

        # 4 — one write fails: the save waits for the others, says so, and the retry saves everything
        await J("window._fs.failNext = '.hd-'; window._fs.maxPerFile = 0")
        res = await J("""(async () => { Store.save({ c: 'shadow', id: 'ps-sw2', team: 'apps', analyst: App.me, date: U.todayStr(), subject: 'two', minutes: 5 });
          Store.save({ c: 'helpdesk', id: 'ps-al-3', reqId: '9003', subject: 'hd', status: 'Open', created: U.todayStr() + 'T08:00', team: 'apps' });
          await Store.flush(); return { err: Store.lastError, dirty: Store.dirty, live: window._fs.live }; })()""")
        c('a failed write stops the save with a message and keeps the change', bool(res['err']) and res['dirty'], res)
        c('…only after the other write of that save has finished', res['live'] == 0, res)
        await pg.wait_for_function(WAIT, timeout=30000)
        c('…and the retry saves both', 'ps-sw2' in (await pg.evaluate(ONDISK, main_f)) and 'ps-al-3' in (await pg.evaluate(ONDISK, hd_f)) and await J("Store.lastError") == '')
        c('a file never has two writers at once', await J("window._fs.maxPerFile") == 1, await J("window._fs.maxPerFile"))

        # 5 — everything still reads back after a fresh read of the folder
        await J("(async () => { Store.own = {}; Store.pending = {}; Store.sources = {}; await Store.sync(true); })()"); await pg.wait_for_timeout(400)
        c('after reading the folder again everything is there', await J("['ps-sw2', 'ps-al-0', 'ps-al-1', 'ps-al-2', 'ps-al-3'].every(id => !!Store.get(id))"))
        c('no page errors', not s.errors, s.errors)
        c.done(s)

run(main())
