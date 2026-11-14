"""Saving on a network share (2026.11.12.1). From 2026.11.11.4 to .11 a save stopped ("Not saved — retrying") whenever re-reading
one's own file before writing failed for a moment — which a network share does right after a save ("the state had changed
since it was read from disk"). Now: the file is re-read only when it changed; a read that fails for a moment uses the copy in
memory and the save goes on (as up to 2026.11.11.1); a DAMAGED file is still never overwritten; a slow write is never
doubled; a change from another PC signed in as me is still merged, not lost."""
from harness import app_session, Check, run

PATCH = r"""(() => {
  if (window._fsPatched) return; window._fsPatched = true;
  window._fs = { textReads: 0, failText: 0, writers: 0, maxWriters: 0, slowNext: 0 };
  const gf = FileSystemFileHandle.prototype.getFile;
  FileSystemFileHandle.prototype.getFile = async function () {
    const f = await gf.call(this); if (this.name !== App.me + '.json') return f;
    const t = f.text.bind(f);
    f.text = async () => { window._fs.textReads++; if (window._fs.failText > 0) { window._fs.failText--; throw new DOMException('An operation that depends on state cached in an interface object was made but the state had changed since it was read from disk.', 'InvalidStateError'); } return t(); };
    return f;
  };
  const cw = FileSystemFileHandle.prototype.createWritable;
  FileSystemFileHandle.prototype.createWritable = async function (...a) {
    const w = await cw.apply(this, a); if (this.name !== App.me + '.json') return w;
    window._fs.writers++; window._fs.maxWriters = Math.max(window._fs.maxWriters, window._fs.writers);
    const slow = window._fs.slowNext; window._fs.slowNext = 0; const close = w.close.bind(w);
    w.close = async () => { try { if (slow) await new Promise(r => setTimeout(r, slow)); return await close(); } finally { window._fs.writers--; } };
    return w;
  };
})()"""

SAVE = """async (txt) => { const r = Object.values(Store.own).find(x => x.c === 'shadow' && !x._del) || Store.own['kb-sv'];
  Store.save(Object.assign({}, r, { subject: txt })); const t0 = Date.now();
  while ((Store.dirty || Store.saving) && Date.now() - t0 < 20000) await new Promise(z => setTimeout(z, 25));
  return { id: r.id, err: Store.lastError || '', dirty: Store.dirty, ms: Date.now() - t0 }; }"""
ONDISK = """async (id) => { const f = await (await Store.usersDir.getFileHandle(App.me + '.json')).getFile(); const gf = Object.getPrototypeOf(f); const txt = await Blob.prototype.text.call(f); const j = JSON.parse(txt); return (j.records.find(r => r.id === id) || {}); }"""

async def main():
    c = Check('saving on a network share')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J("Store.save({ c: 'shadow', id: 'kb-sv', team: 'apps', analyst: 'adam', date: U.todayStr(), subject: 'start', minutes: 10 })"); await J("Store.flush()"); await pg.wait_for_timeout(400)
        await J(PATCH)
        # 1 — an unchanged file is not read again before saving
        await J("window._fs.textReads = 0"); r = await pg.evaluate(SAVE, 'one')
        c('a save does not re-read my unchanged file', r['err'] == '' and not r['dirty'] and await J("window._fs.textReads") == 0, [r, await J("window._fs.textReads")])
        c('…and the change is in the file', (await pg.evaluate(ONDISK, r['id'])).get('subject') == 'one')
        c('the save is timed step by step (System Check → Speed)', await J("(() => { const x = Store.stats.saveSteps; return !!x && x.files.some(f => f.startsWith(App.me + '.json')) && ['check', 'open', 'write', 'close', 'stat'].every(k => typeof x[k] === 'number'); })()"))
        # 2 — the share refuses the read for a moment (the error from the owner's PC): the save still goes through
        await J("Store.sources['u:' + App.me + '.json'].mtime = 1"); await J("window._fs.failText = 50")
        r = await pg.evaluate(SAVE, 'two')
        c('a read refused by the share does not stop the save', r['err'] == '' and not r['dirty'], r)
        c('…and the change is in the file', (await pg.evaluate(ONDISK, r['id'])).get('subject') == 'two')
        await J("window._fs.failText = 0")
        # 3 — a refused read for a moment, then readable: read again and merged
        await J("Store.sources['u:' + App.me + '.json'].mtime = 1"); await J("window._fs.failText = 2")
        r = await pg.evaluate(SAVE, 'three'); c('a read that fails twice is tried again and the save goes through', r['err'] == '' and not r['dirty'], r)
        # 4 — a change written by another copy of me (another PC) is merged, not lost
        await J("""(async () => { const fh = await Store.usersDir.getFileHandle(App.me + '.json'); const j = JSON.parse(await Blob.prototype.text.call(await fh.getFile()));
          j.records.push({ c: 'shadow', id: 'kb-other-pc', team: 'apps', analyst: 'adam', date: U.todayStr(), subject: 'from the other PC', minutes: 5, _by: App.me, _ts: Date.now() });
          const w = await fh.createWritable(); await w.write(JSON.stringify(j)); await w.close(); })()""")
        await pg.wait_for_timeout(300)
        r = await pg.evaluate(SAVE, 'four')
        c('a change from another PC is kept when I save', r['err'] == '' and (await pg.evaluate(ONDISK, 'kb-other-pc')).get('subject') == 'from the other PC')
        # 5 — a slow write: never two at once, and it ends saved
        await J("Config.WRITE_TIMEOUT_MS = 300; window._fs.maxWriters = 0; window._fs.slowNext = 2500")
        await J("Store.save(Object.assign({}, Store.get('kb-sv'), { subject: 'five' }))"); await pg.wait_for_timeout(700)
        await J("Store.save(Object.assign({}, Store.get('kb-sv'), { subject: 'six' }))")
        await pg.wait_for_function("!Store.dirty && !Store.saving && !Store._inflight", timeout=20000)
        c('a slow write is never doubled', await J("window._fs.maxWriters") == 1, await J("window._fs.maxWriters"))
        c('…and the last change ends up saved', (await pg.evaluate(ONDISK, 'kb-sv')).get('subject') == 'six' and await J("Store.lastError") == '')
        await J("Config.WRITE_TIMEOUT_MS = 45000")
        # 6 — a DAMAGED file is still never overwritten
        await J("""(async () => { const fh = await Store.usersDir.getFileHandle(App.me + '.json'); const w = await fh.createWritable(); await w.write('{"version":1,"records":[{"id": broken'); await w.close(); })()""")
        await pg.wait_for_timeout(300)
        await J("Store.save(Object.assign({}, Store.get('kb-sv'), { subject: 'seven' }))")
        await pg.wait_for_function("!Store.saving && !!Store.lastError", timeout=15000)
        txt = await J("(async () => Blob.prototype.text.call(await (await Store.usersDir.getFileHandle(App.me + '.json')).getFile()))()")
        c('a damaged file is not overwritten (the change waits, the red message says why)', txt.startswith('{"version":1,"records":[{"id": broken') and await J("Store.dirty") and 'cannot be read' in await J("Store.lastError"))
        c('no page errors', not s.errors, s.errors)
        c.done(s)

run(main())
