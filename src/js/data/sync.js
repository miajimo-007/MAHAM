/* DARRIK — Reading teammates' files and writing my own file. Only files whose modified time changed are re-read. */
'use strict';

Object.assign(Store, {
  /* Load / refresh everything. Only re-reads files whose modified time changed. */
  async sync(force) {
    if (!Store.dataDir) return false;
    let changed = false;
    const seen = new Set();
    const check = async (dir, name, key) => {
      seen.add(key);
      try {
        const fh = await dir.getFileHandle(name);
        const f = await fh.getFile();
        const prev = Store.sources[key];
        if (!force && prev && prev.mtime === f.lastModified && prev.size === f.size) return;
        const j = JSON.parse(await f.text());
        const recs = {};
        const arr = Array.isArray(j.records) ? j.records : Object.values(j.records || {});
        for (const r of arr) if (r && r.id) recs[r.id] = r;
        Store.sources[key] = { mtime: f.lastModified, size: f.size, records: recs, user: j.user || '', updated: j.updated || '' };
        changed = true;
      } catch (e) {
        if (e && e.name === 'NotFoundError') return;
        console.warn('Could not read', name, e); // half-written file? keep the previous copy, try next time
      }
    };
    if (window.SEED_DATA) {
      if (!Store.sources.seed) {
        const recs = {};
        for (const r of window.SEED_DATA.records) recs[r.id] = r;
        Store.sources.seed = { mtime: 0, size: 0, records: recs };
        changed = true;
      }
      seen.add('seed');
    } else await check(Store.dataDir, 'seed.json', 'seed');
    for await (const [name, handle] of Store.usersDir.entries()) {
      if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
      await check(Store.usersDir, name, 'u:' + name);
    }
    for (const k of Object.keys(Store.sources))
      if (!seen.has(k)) {
        delete Store.sources[k];
        changed = true;
      }
    // my own file is the source of truth for "own" (in case I edited from another PC)
    const mine = Store.sources['u:' + App.me + '.json'];
    if (mine)
      for (const [id, r] of Object.entries(mine.records)) {
        const o = Store.own[id];
        if (!o || (r._ts || 0) > (o._ts || 0)) Store.own[id] = r;
      }
    if (changed || force || Store.dirty) Store.rebuild();
    Store.lastSync = Date.now();
    return changed;
  },
  flushSoon: null,
  async flush() {
    if (!Store.dirty || Store.saving || !Store.usersDir || App.preview) return;
    Store.saving = true;
    Store.emit();
    const me = App.me,
      own = Store.own; // captured: switching person mid-save must not mix files
    const ok = await Store.writeUser(me, own);
    if (ok && Store.own === own) {
      Store.dirty = false;
      Store.lastSaved = Date.now();
      Store.lastError = '';
      LS.set('bct.unsaved.' + me, null);
    }
    Store.saving = false;
    Store.emit();
    if (Store.dirty) setTimeout(() => Store.flush(), 5000);
  },
  /* write one person's records to users/<me>.json (merging what is already there) */
  async writeUser(me, own) {
    const name = me + '.json';
    try {
      try {
        const { json } = await Store.readJSON(Store.usersDir, name);
        const arr = Array.isArray(json.records) ? json.records : Object.values(json.records || {});
        for (const r of arr) if (r && r.id && Store.newer(r, own[r.id])) own[r.id] = r;
      } catch (e) {
        /* first save */
      }
      const payload = JSON.stringify({ version: 1, kind: 'user', user: me, updated: U.nowStr(), records: Object.values(own) });
      const fh = await Store.usersDir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(payload);
      await w.close();
      const f = await fh.getFile();
      if (f.lastModified) Store.clockSkew = Date.now() - f.lastModified; // the share stamps the file with its own time: a big gap = this PC's clock is wrong
      Store.sources['u:' + name] = {
        mtime: f.lastModified,
        size: f.size,
        records: Object.fromEntries(Object.values(own).map(r => [r.id, r])),
        user: me,
      };
      return true;
    } catch (e) {
      console.error(e);
      Store.lastError = (e && e.message) || String(e);
      return false;
    }
  },
  /* called when switching person on this PC: keep the previous person's pending changes */
  handOver() {
    const me = App.me,
      own = Store.own;
    if (!me) return;
    Store.sources['u:' + me + '.json'] = Object.assign({}, Store.sources['u:' + me + '.json'] || { mtime: 0, size: 0 }, {
      records: Object.fromEntries(Object.values(own).map(r => [r.id, r])),
    });
    if (Store.dirty) {
      Store.dirty = false;
      Store.writeUser(me, own).then(ok => {
        if (ok) LS.set('bct.unsaved.' + me, null);
      });
    }
  },
  restoreUnsaved() {
    const u = LS.get('bct.unsaved.' + App.me, null);
    if (u && typeof u === 'object') {
      let n = 0,
        any = 0;
      for (const [id, r] of Object.entries(u))
        if (Store.newer(r, Store.own[id])) {
          Store.own[id] = r;
          any++;
          if (r.c !== 'usage') n++;
        } // usage counts silently
      if (any) {
        Store.dirty = true;
        Store.rebuild();
        Store.flushSoon();
      }
      return n;
    }
    return 0;
  },
});

Store.flushSoon = U.debounce(() => Store.flush(), Config.SAVE_DEBOUNCE_MS);
