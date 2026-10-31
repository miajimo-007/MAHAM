/* DARRIK — Automatic backups of the shared data folder.
 * Once a day, the first person who opens the app saves a zip of every data file into
 * "DARRIK Data/Backups/backup-YYYY-MM-DD.zip" (the last Config.BACKUP_KEEP are kept).
 * Restore (super admin, System Check) puts records back as they were in a backup:
 * every record in the backup gets a fresh time stamp so it wins; records created after the backup are kept. */
'use strict';

Object.assign(Store, {
  async backupsDir() {
    return Store.dataDir.getDirectoryHandle(Config.BACKUP_FOLDER, { create: true });
  },
  backupName(day) {
    return `backup-${day || U.todayStr()}.zip`;
  },

  /* list backups, newest first: [{ name, day, size, mtime }] */
  async listBackups() {
    if (!Store.dataDir) return [];
    const dir = await Store.backupsDir();
    const out = [];
    for await (const [name, hnd] of dir.entries()) {
      const m = /^backup-(\d{4}-\d{2}-\d{2})(-[\w-]+)?\.zip$/.exec(name);
      if (hnd.kind !== 'file' || !m) continue;
      const f = await hnd.getFile();
      out.push({ name, day: m[1], tag: (m[2] || '').slice(1), size: f.size, mtime: f.lastModified });
    }
    return out.sort((a, b) => b.name.localeCompare(a.name));
  },

  /* zip every users/*.json file exactly as it is on disk */
  async makeBackup(name) {
    if (!Store.usersDir || typeof JSZip === 'undefined') return null;
    const zip = new JSZip();
    const files = [];
    for await (const [fname, hnd] of Store.usersDir.entries()) {
      if (hnd.kind !== 'file' || !fname.endsWith('.json')) continue;
      const text = await (await hnd.getFile()).text();
      zip.file('users/' + fname, text);
      let n = 0;
      try {
        n = (JSON.parse(text).records || []).length;
      } catch (e) {
        /* damaged file: still copied */
      }
      files.push({ name: fname, records: n });
    }
    zip.file(
      'backup.json',
      JSON.stringify({ kind: 'ehr-backup', made: new Date().toISOString(), by: App.me || '', version: APP_VERSION, files }, null, 1)
    );
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const dir = await Store.backupsDir();
    const fh = await dir.getFileHandle(name || Store.backupName(), { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    await Store.pruneBackups();
    return { name: name || Store.backupName(), files };
  },

  async pruneBackups() {
    const dir = await Store.backupsDir();
    const daily = (await Store.listBackups()).filter(b => !b.tag);
    const keep = Store.backupKeep();
    const old = U.addDays(U.todayStr(), -keep);
    const extra = (await Store.listBackups()).filter(b => b.tag && b.day < old); // safety copies made before a restore
    for (const b of daily.slice(keep).concat(extra)) {
      try {
        await dir.removeEntry(b.name);
      } catch (e) {
        /* in use: next time */
      }
    }
  },

  /* today's backup if nobody has made it yet (called at start-up and with the background refresh) */
  async autoBackup() {
    try {
      if (!Store.usersDir || App.preview || Store._backupDay === U.todayStr()) return;
      const dir = await Store.backupsDir();
      try {
        await dir.getFileHandle(Store.backupName());
        Store._backupDay = U.todayStr();
        return;
      } catch (e) {
        /* not made yet */
      }
      await Store.makeBackup();
      Store._backupDay = U.todayStr();
    } catch (e) {
      console.warn('Backup failed', e);
    }
  },

  async readBackup(name) {
    const dir = await Store.backupsDir();
    const blob = await (await dir.getFileHandle(name)).getFile();
    const zip = await JSZip.loadAsync(blob);
    const files = {};
    for (const p of Object.keys(zip.files))
      if (/^users\/[^/]+\.json$/.test(p)) {
        try {
          files[p.slice(6)] = JSON.parse(await zip.file(p).async('string'));
        } catch (e) {
          /* damaged */
        }
      }
    return { blob, files };
  },

  /* put back the records of the chosen files (default: all) from a backup */
  async restoreBackup(name, only, kinds) {
    if (!Store.isSuper(App.me)) throw new Error('Only the super admin can restore a backup');
    if (Store.dirty) await Store.flush();
    await Store.makeBackup(`backup-${U.todayStr()}-before-restore-${Date.now().toString(36)}.zip`); // safety copy first
    const { files } = await Store.readBackup(name);
    let n = 0,
      stamp = Date.now();
    for (const [fname, json] of Object.entries(files)) {
      if (only && only.length && !only.includes(fname)) continue;
      const owner = fname.slice(0, -5);
      const back = (json.records || []).filter(
        r => r && r.id && (r._by === owner || /^_old-/.test(owner)) && (!kinds || !kinds.length || kinds.includes(r.c))
      );
      let current = [];
      try {
        current = (await Store.readJSON(Store.usersDir, fname)).json.records || [];
      } catch (e) {
        /* file was deleted */
      }
      const map = new Map(current.map(r => [r.id, r]));
      for (const r of back) {
        map.set(r.id, Object.assign({}, r, { _ts: stamp++ }));
        n++;
      }
      const payload = JSON.stringify({
        version: 1,
        kind: 'user',
        user: owner,
        updated: U.nowStr(),
        restoredFrom: name,
        records: [...map.values()],
      });
      const fh = await Store.usersDir.getFileHandle(fname, { create: true });
      const w = await fh.createWritable();
      await w.write(payload);
      await w.close();
      if (owner === App.me) for (const r of back) Store.own[r.id] = map.get(r.id);
    }
    await Store.sync(true);
    return n;
  },

  /* super admin: remove the ignored versions listed in System Check from the data files (a backup is made first).
   * Corrected versions are replaced by their corrected form; PINs kept in old people lists are moved to their own record first. */
  backupKeep() {
    return Math.max(7, Math.min(365, +Store.setting('settings-backup', 'keep', Config.BACKUP_KEEP) || Config.BACKUP_KEEP));
  },
  /* super admin downloaded a backup: remember it (Admin → reminder to keep a copy elsewhere) */
  noteCopied() {
    if (Store.isSuper(App.me) && !App.preview)
      Store.save(
        Object.assign({}, Store.get('settings-backup') || { id: 'settings-backup', c: 'settings' }, {
          lastCopy: U.todayStr(),
          _nolog: true,
        })
      );
  },
  /* help-desk requests: older copies of a request left in other people's files (someone else imported a newer one) */
  staleHelpdesk() {
    const out = [];
    for (const [k, src] of Object.entries(Store.sources)) {
      if (!k.startsWith('u:')) continue;
      for (const r of Object.values(src.records || {})) {
        if (!r || r.c !== 'helpdesk') continue;
        const w = Store.db.get(r.id);
        if (w && (w._ts || 0) > (r._ts || 0)) out.push({ file: k.slice(2), id: r.id });
      }
    }
    return out;
  },
  /* super admin: remove those older copies (a backup is made first) */
  async compactHelpdesk() {
    if (!Store.isSuper(App.me)) throw new Error('Only the super admin can do this');
    if (Store.dirty) await Store.flush();
    const stale = Store.staleHelpdesk();
    if (!stale.length) return 0;
    await Store.makeBackup(`backup-${U.todayStr()}-before-compact-${Date.now().toString(36)}.zip`);
    const byFile = new Map();
    for (const x of stale) {
      if (!byFile.has(x.file)) byFile.set(x.file, new Set());
      byFile.get(x.file).add(x.id);
    }
    let n = 0;
    for (const [fname, ids] of byFile) {
      let json;
      try {
        json = (await Store.readJSON(Store.usersDir, fname)).json;
      } catch (e) {
        continue;
      }
      const recs = (json.records || []).filter(r => {
        const w = r && Store.db.get(r.id);
        const drop = r && r.c === 'helpdesk' && ids.has(r.id) && w && (w._ts || 0) > (r._ts || 0);
        if (drop) n++;
        return !drop;
      });
      const fh = await Store.usersDir.getFileHandle(fname, { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify(Object.assign({}, json, { updated: U.nowStr(), records: recs })));
      await w.close();
      if (fname === App.me + '.json') {
        Store.own = {};
        for (const r of recs) Store.own[r.id] = r;
      }
    }
    await Store.sync(true);
    return n;
  },
  /* records deleted more than `days` ago (every copy in every file), old admin-log entries and read receipts of gone announcements */
  purgeable(days) {
    const cut = Date.now() - (days || 30) * 864e5;
    const ids = new Set();
    for (const [id, r] of Store.db) if (r && r._del && (r._ts || 0) < cut && r.c !== 'settings') ids.add(id);
    for (const r of Store.all('adminlog')) if ((r.at || 0) < Date.now() - 180 * 864e5) ids.add(r.id);
    for (const r of Store.all('annread')) {
      const a = Store.get(r.ann);
      if (!a || (a.until && a.until < U.addDays(U.todayStr(), -30))) ids.add(r.id);
    }
    return ids;
  },
  async purgeDeleted(days) {
    if (!Store.isSuper(App.me)) throw new Error('Only the super admin can do this');
    if (Store.dirty) await Store.flush();
    const ids = Store.purgeable(days);
    if (!ids.size) return 0;
    await Store.makeBackup(`backup-${U.todayStr()}-before-purge-${Date.now().toString(36)}.zip`);
    let n = 0;
    for (const [k] of Object.entries(Store.sources)) {
      if (!k.startsWith('u:')) continue;
      const fname = k.slice(2);
      let json;
      try {
        json = (await Store.readJSON(Store.usersDir, fname)).json;
      } catch (e) {
        continue;
      }
      const before = (json.records || []).length;
      const recs = (json.records || []).filter(r => !(r && ids.has(r.id)));
      if (recs.length === before) continue;
      n += before - recs.length;
      const fh = await Store.usersDir.getFileHandle(fname, { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify(Object.assign({}, json, { updated: U.nowStr(), records: recs })));
      await w.close();
      if (fname === App.me + '.json') {
        Store.own = {};
        for (const r of recs) Store.own[r.id] = r;
      }
    }
    await Store.sync(true);
    return n;
  },
  async clearRejected() {
    if (!Store.isSuper(App.me)) throw new Error('Only the super admin can do this');
    if (Store.dirty) await Store.flush();
    await Store.makeBackup(`backup-${U.todayStr()}-before-cleanup-${Date.now().toString(36)}.zip`);
    const pins = Store.members()
      .filter(m => m.pin && !Store.get('userpin-' + m.id))
      .map(m => ({ id: 'userpin-' + m.id, c: 'userpin', member: m.id, pin: m.pin }));
    if (pins.length) {
      Store.saveMany(pins);
      await Store.flush();
    }
    const byFile = new Map();
    for (const x of Store.rejected)
      if (/\.json$/.test(x.file)) {
        if (!byFile.has(x.file)) byFile.set(x.file, []);
        byFile.get(x.file).push(x);
      }
    let n = 0;
    for (const [fname, xs] of byFile) {
      let json;
      try {
        json = (await Store.readJSON(Store.usersDir, fname)).json;
      } catch (e) {
        continue;
      }
      const owner = fname.slice(0, -5);
      const recs = (json.records || []).flatMap(r => {
        const x = r && xs.find(y => y.id === r.id && (r._ts || 0) === y.ts);
        if (!x) return [r];
        n++;
        return x.fixed ? [Object.assign({}, x.fixed, { _ts: r._ts, _by: r._by })] : [];
      });
      const payload = JSON.stringify(Object.assign({}, json, { updated: U.nowStr(), records: recs }));
      const fh = await Store.usersDir.getFileHandle(fname, { create: true });
      const w = await fh.createWritable();
      await w.write(payload);
      await w.close();
      if (owner === App.me) {
        Store.own = {};
        for (const r of recs) Store.own[r.id] = r;
      }
    }
    await Store.sync(true);
    return n;
  },
});
