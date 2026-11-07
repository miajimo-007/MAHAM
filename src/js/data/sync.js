/* MAHAM — Reading teammates' files and writing my own file. Only files whose modified time changed are re-read. */
'use strict';

Object.assign(Store, {
  /* Load / refresh everything. Only re-reads files whose modified time changed. */
  async sync(force) {
    if (!Store.dataDir) return false;
    const t0 = performance.now();
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
      if (Store.STRAY_RE.test(name)) continue; // a stray file written while nobody was signed in (2026.11.07.2 bug) — never read; its owner's records are rescued (Store.rescueStray)
      Store.noteFile(name);
      if (!Store.wantFile(name)) continue; // archives of past years: only when that year is asked for (data/files.js)
      await check(Store.usersDir, name, 'u:' + name);
    }
    for (const k of Object.keys(Store.sources))
      if (!seen.has(k)) {
        delete Store.sources[k];
        changed = true;
      }
    // my own file is the source of truth for "own" (in case I edited from another PC)
    if (changed || force)
      for (const [k, src] of Object.entries(Store.sources)) {
        // only when a file was (re)read
        if (!k.startsWith('u:') || Store.fileOwner(k.slice(2)) !== App.me) continue;
        for (const [id, r] of Object.entries(src.records)) {
          const o = Store.own[id];
          if (!o || (r._ts || 0) > (o._ts || 0)) Store.own[id] = r;
        }
      }
    if ((changed || force) && App.me && !App.preview && Store.misplaced()) Store.flushSoon(); // move my records to the right files (one-time after updating)
    if (changed || force || Store.dirty) Store.rebuild();
    if (changed && Store.saveSnapshotSoon) Store.saveSnapshotSoon();
    Store.lastSync = Date.now();
    Store.stats.syncMs = Math.round(performance.now() - t0);
    return changed;
  },
  flushSoon: null,
  STRAY_RE: /^(null|undefined)(\.|$)/,
  /* 2026.11.07.2 could write "null.json" when someone signed out while a save was waiting. That file holds copies of
     that person's records: put any that are newer than their own copy back into their own file (once, quietly). */
  async rescueStray() {
    if (!App.me || App.preview || !Store.usersDir || Store._rescued === App.me) return 0;
    Store._rescued = App.me;
    const back = [];
    try {
      for await (const [name, h] of Store.usersDir.entries()) {
        if (h.kind !== 'file' || !Store.STRAY_RE.test(name) || !name.endsWith('.json')) continue;
        let j;
        try {
          j = JSON.parse(await (await h.getFile()).text());
        } catch (e) {
          continue;
        }
        const arr = Array.isArray(j.records) ? j.records : Object.values(j.records || {});
        for (const r of arr) {
          if (!r || !r.id || r._by !== App.me) continue;
          const cur = Store.own[r.id] || Store.db.get(r.id);
          if (!cur || (cur._ts || 0) < (r._ts || 0)) back.push(r);
        }
      }
    } catch (e) {
      return 0;
    }
    if (!back.length) return 0;
    for (const r of back) {
      Store.own[r.id] = r;
      Store.pending[r.id] = r;
    }
    Store.dirty = true;
    LS.set('bct.unsaved.' + App.me, Store.pending);
    Store.applyLocal(back);
    Store.flushSoon();
    Store.emit();
    return back.length;
  },
  async flush() {
    if (!Store.dirty || Store.saving || !Store.usersDir || App.preview || !App.me) return; // never write without a signed-in person
    Store.saving = true;
    Store.emit();
    const me = App.me,
      own = Store.own; // captured: switching person mid-save must not mix files
    const snap = Object.assign({}, Store.pending);
    const sent = Object.keys(snap);
    const moving = new Set(Store._moveFrom); // only the moves known when this save started
    const files = new Set([me + '.json', ...moving, ...sent.map(id => Store.fileFor(own[id] || Store.pending[id], me))]);
    if (moving.size && LS.get('bct.splitbk.' + me, '') !== U.todayStr()) {
      // first move to the split files: a full backup before
      try {
        await Store.makeBackup(`backup-${U.todayStr()}-before-split-${me}.zip`);
        LS.set('bct.splitbk.' + me, U.todayStr());
      } catch (e) {
        console.warn('backup before split failed', e);
      }
    }
    const tw = performance.now();
    const ok = await Store.writeUser(me, own, files);
    Store.stats.saveMs = Math.round(performance.now() - tw);
    Store.stats.saveFiles = files.size;
    if (ok) for (const f of moving) Store._moveFrom.delete(f);
    if (ok && Store.own === own) {
      for (const id of sent) if (Store.pending[id] === snap[id]) delete Store.pending[id]; // changed again meanwhile? keep it pending
      if (Store._dropped) {
        Store._dropped = false;
        Store.rebuild();
      }
      Store.dirty = Object.keys(Store.pending).length > 0;
      Store.lastSaved = Date.now();
      Store.lastError = '';
      LS.set('bct.unsaved.' + me, Store.dirty ? Store.pending : null);
    }
    Store.saving = false;
    Store.emit();
    if (Store.dirty) setTimeout(() => Store.flush(), 5000);
  },
  /* write one person's records to their files (merging what is already in them). files = the file names to write;
   * none = every file their records belong in. A record read from a file that now belongs in another file is written
   * there too, so nothing can be dropped; the main file is written last. */
  async writeUser(me, own, files) {
    try {
      const want = new Set(files || [me + '.json', ...Object.values(own).map(r => Store.fileFor(r, me))]);
      const queue = [...want];
      const done = new Set();
      while (queue.length) {
        const name = queue.shift();
        if (done.has(name)) continue;
        done.add(name);
        want.add(name);
        let arr = [];
        try {
          const { json } = await Store.readJSON(Store.usersDir, name);
          arr = Array.isArray(json.records) ? json.records : Object.values(json.records || {});
        } catch (e) {
          /* new file */
        }
        for (const r of arr)
          if (r && r.id) {
            if (Store.newer(r, own[r.id])) own[r.id] = r;
            const t = Store.fileFor(own[r.id], me);
            if (!want.has(t)) {
              want.add(t);
              queue.push(t);
            }
          }
      }
      const groups = new Map([...want].map(n => [n, []]));
      for (const r of Object.values(own)) {
        const n = Store.fileFor(r, me);
        if (groups.has(n)) groups.get(n).push(r);
      }
      const order = [...groups.keys()].sort((a, b) => (a === me + '.json') - (b === me + '.json'));
      for (const name of order) {
        const recs = groups.get(name);
        if (!recs.length && name !== me + '.json') {
          try {
            await Store.usersDir.removeEntry(name);
          } catch (e) {
            /* not there */
          }
          delete Store.sources['u:' + name];
          continue;
        }
        const payload = JSON.stringify({ version: 1, kind: 'user', user: me, updated: U.nowStr(), records: recs });
        const fh = await Store.usersDir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(payload);
        await w.close();
        const f = await fh.getFile();
        if (name === me + '.json' && f.lastModified) Store.clockSkew = Date.now() - f.lastModified; // the share stamps the file with its own time: a big gap = this PC's clock is wrong
        Store.noteFile(name);
        if (!Store.wantFile(name)) {
          for (const r of recs) delete own[r.id];
          delete Store.sources['u:' + name];
          Store._dropped = true;
          continue;
        } // a past year nobody picked: saved, and out of memory
        Store.sources['u:' + name] = {
          mtime: f.lastModified,
          size: f.size,
          records: Object.fromEntries(recs.map(r => [r.id, r])),
          user: me,
        };
      }
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
      const pend = Store.pending;
      Store.writeUser(me, own).then(ok => {
        if (ok) LS.set('bct.unsaved.' + me, null);
        else LS.set('bct.unsaved.' + me, pend);
      });
    }
    Store.pending = {};
  },
  restoreUnsaved() {
    const u = LS.get('bct.unsaved.' + App.me, null);
    if (u && typeof u === 'object') {
      let n = 0,
        any = 0;
      for (const [id, r] of Object.entries(u))
        if (Store.newer(r, Store.own[id])) {
          Store.own[id] = r;
          Store.pending[id] = r;
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
