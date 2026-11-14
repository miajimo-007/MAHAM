/* MAHAM — Online storage, record by record.
 * The online database keeps the team's data as one row per record (table "records", supabase/schema.sql), each with a
 * change number. So in the online mode:
 *   - refreshing asks only for the rows changed since the last number this PC saw (a few rows, or none);
 *   - saving sends only the records that changed (function save_records), never whole files.
 * The app still sees the same "files" (Store.sources['u:<id>.json'] …, made from the records), so merging, the trust
 * rules and every page run unchanged. Admin tools that read or write a whole file (restore, clean-ups) still work: the
 * folder calls for seed.json and users/*.json are answered from the records here, and a whole file written goes
 * through replace_file. Other files (Backups, Import) stay in the "files" table. */
'use strict';

const CloudRecords = {
  ALL: new Map(), // app file ("users/adam.json", "seed.json") → { ver, recs: Map(id → record) }
  SEQ: 0,
  /* the database has not been updated yet (no "records" table / save_records): keep working the old way, whole files */
  off: false,
  missing(status, j) {
    return status === 404 || (j && /PGRST20[25]|42P01|42883|does not exist|Could not find/i.test(JSON.stringify(j)));
  },
  PAGE: 1000, // rows per request (Supabase's usual maximum)
  root() {
    return Config.DATA_FOLDER + '/';
  },
  /* "MAHAM Data/users/adam.json" → "users/adam.json"; null when it is not one of the record files */
  appFile(path) {
    const r = CloudRecords.root();
    if (!path.startsWith(r)) return null;
    const f = path.slice(r.length);
    return f === 'seed.json' || /^users\/[^/]+\.json$/.test(f) ? f : null;
  },
  put(f, id, r, ver) {
    const A = CloudRecords.ALL;
    let e = A.get(f);
    if (!e) A.set(f, (e = { ver: 0, recs: new Map() }));
    if (r) e.recs.set(id, r);
    else e.recs.delete(id);
    e.ver = Math.max(e.ver + 1, ver || 0);
    if (!e.recs.size) A.delete(f);
  },
  /* the rows changed since the last pull (all = everything again) → were there changes? */
  _pulling: null,
  pull(all) {
    if (CloudRecords._pulling && !all) return CloudRecords._pulling;
    const run = (async () => {
      const c = CloudBackend.company;
      if (!c) return false;
      let since = all ? 0 : CloudRecords.SEQ;
      let any = false;
      if (all) {
        any = CloudRecords.ALL.size > 0;
        CloudRecords.ALL.clear();
      }
      for (;;) {
        const r = await CloudBackend.req(
          `/rest/v1/records?select=f,id,data,seq&company_id=eq.${c}&seq=gt.${since}&order=seq.asc&limit=${CloudRecords.PAGE}`
        );
        if (!r.ok) {
          const j = await r.json().catch(() => null);
          if (CloudRecords.missing(r.status, j)) {
            CloudRecords.off = true;
            console.warn('MAHAM: the database has no records table yet — run supabase/schema.sql; saving whole files meanwhile');
            return false;
          }
          throw new Error('Could not read the data (' + r.status + ')');
        }
        const rows = await r.json();
        for (const x of rows) {
          CloudRecords.put(x.f, x.id, x.data, x.seq);
          since = Math.max(since, x.seq);
          any = true;
        }
        if (rows.length < CloudRecords.PAGE) break;
      }
      CloudRecords.SEQ = since;
      return any;
    })();
    CloudRecords._pulling = run;
    run.finally(() => {
      if (CloudRecords._pulling === run) CloudRecords._pulling = null;
    });
    return run;
  },
  /* one app file as the shared folder had it */
  text(f) {
    const e = CloudRecords.ALL.get(f);
    if (!e) return null;
    return JSON.stringify({
      version: 1,
      kind: f === 'seed.json' ? 'seed' : 'user',
      user: f === 'seed.json' ? '' : Store.fileOwner(f.slice(6)),
      updated: '',
      records: [...e.recs.values()],
    });
  },
  async replaceFile(f, data) {
    const text = typeof data === 'string' ? data : await data.text();
    let j;
    try {
      j = text ? JSON.parse(text) : { records: [] };
    } catch (e) {
      throw new Error(f + ' is not a valid data file', { cause: e });
    }
    const recs = Array.isArray(j.records) ? j.records : Object.values(j.records || {});
    const out = await CloudBackend.rpc('replace_file', { c: CloudBackend.company, p_f: f, recs });
    await CloudRecords.pull();
    return out;
  },
};

/* ---------- the folder calls: seed.json and users/*.json come from the records ---------- */
(() => {
  const B = CloudBackend;
  const orig = { list: B.list, read: B.read, write: B.write, remove: B.remove, hasDir: B.hasDir };
  const usersDir = () => CloudRecords.root() + Config.USERS_FOLDER;
  B.list = async function (dir) {
    if (CloudRecords.off) return orig.list.call(B, dir);
    if (dir === usersDir()) {
      await CloudRecords.pull();
      return [...CloudRecords.ALL.entries()]
        .filter(([f]) => f.startsWith('users/'))
        .map(([f, e]) => ({ name: f.slice(6), kind: 'file', size: e.recs.size, mtime: e.ver }));
    }
    const out = await orig.list.call(B, dir);
    if (dir + '/' === CloudRecords.root()) {
      await CloudRecords.pull();
      if (CloudRecords.off) return out;
      if (!out.some(x => x.name === Config.USERS_FOLDER)) out.push({ name: Config.USERS_FOLDER, kind: 'directory' });
      const s = CloudRecords.ALL.get('seed.json');
      if (s && !out.some(x => x.name === 'seed.json')) out.push({ name: 'seed.json', kind: 'file', size: s.recs.size, mtime: s.ver });
    }
    return out;
  };
  B.read = async function (path, opt = {}) {
    const f = CloudRecords.appFile(path);
    if (!f || CloudRecords.off) return orig.read.call(B, path, opt);
    await CloudRecords.pull();
    if (CloudRecords.off) return orig.read.call(B, path, opt);
    const e = CloudRecords.ALL.get(f);
    if (!e) return null;
    if (opt.head) return { size: e.recs.size, mtime: e.ver };
    const data = CloudRecords.text(f);
    return { data, size: data.length, mtime: e.ver };
  };
  B.write = async function (path, data) {
    const f = CloudRecords.appFile(path);
    if (!f || CloudRecords.off) return orig.write.call(B, path, data);
    if ((typeof data === 'string' ? data : 'x') === '' && !CloudRecords.ALL.has(f)) return { size: 0, mtime: Date.now() }; // "create" of a new file: nothing to save yet
    const r = await CloudRecords.replaceFile(f, data);
    const e = CloudRecords.ALL.get(f);
    return { size: e ? e.recs.size : 0, mtime: e ? e.ver : r.seq };
  };
  B.remove = async function (path) {
    const f = CloudRecords.appFile(path);
    if (!f || CloudRecords.off) return orig.remove.call(B, path);
    await CloudRecords.replaceFile(f, '');
  };
  B.hasDir = async function (dir) {
    return (!CloudRecords.off && dir === usersDir()) || orig.hasDir.call(B, dir);
  };
})();

/* ---------- saving and refreshing (only in the online mode; the shared folder and this device work as before) ---------- */
(() => {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const keyOf = f => (f === 'seed.json' ? 'seed' : 'u:' + f.slice(6));
  const sync0 = Store.sync,
    write0 = Store.writeUser,
    snap0 = Store.useSnapshot;
  const cloud = () => Store.storageMode === 'cloud';
  Object.assign(Store, {
    async sync(force) {
      if (!cloud() || CloudRecords.off) return sync0.apply(Store, arguments);
      if (!Store.dataDir) return false;
      const t0 = performance.now();
      try {
        await CloudRecords.pull(force);
        if (CloudRecords.off) return sync0.apply(Store, arguments);
      } catch (e) {
        console.warn('Could not refresh', e);
        Store.lastError = e.message || String(e);
        return false;
      }
      let changed = false;
      const seen = new Set();
      if (window.SEED_DATA) {
        if (!Store.sources.seed) {
          const recs = {};
          for (const r of window.SEED_DATA.records) recs[r.id] = r;
          Store.sources.seed = { mtime: 0, size: 0, records: recs };
          changed = true;
        }
        seen.add('seed');
      }
      for (const [f, e] of CloudRecords.ALL) {
        if (f === 'seed.json' && window.SEED_DATA) continue;
        if (f !== 'seed.json') {
          const name = f.slice(6);
          if (Store.STRAY_RE.test(name)) continue;
          Store.noteFile(name);
          if (!Store.wantFile(name)) continue;
        }
        const key = keyOf(f);
        seen.add(key);
        const prev = Store.sources[key];
        if (!force && prev && prev.mtime === e.ver) continue;
        Store.sources[key] = {
          mtime: e.ver,
          size: e.recs.size,
          records: Object.fromEntries(e.recs),
          user: f === 'seed.json' ? '' : Store.fileOwner(f.slice(6)),
          updated: '',
        };
        changed = true;
      }
      for (const k of Object.keys(Store.sources))
        if (!seen.has(k)) {
          delete Store.sources[k];
          changed = true;
        }
      if (changed || force)
        for (const [k, src] of Object.entries(Store.sources)) {
          if (!k.startsWith('u:') || Store.fileOwner(k.slice(2)) !== App.me) continue;
          for (const [id, r] of Object.entries(src.records)) {
            const o = Store.own[id];
            if (!o || (r._ts || 0) > (o._ts || 0)) Store.own[id] = r;
          }
        }
      if ((changed || force) && App.me && !App.preview && Store.misplaced()) Store.flushSoon();
      if (changed || force || Store.dirty) Store.rebuild();
      Store.lastSync = Date.now();
      Store.stats.syncMs = Math.round(performance.now() - t0);
      return changed;
    },
    async writeUser(me, own, files) {
      if (!cloud() || CloudRecords.off) return write0.apply(Store, arguments);
      try {
        const fileOf = r => 'users/' + Store.fileFor(r, me);
        const want = new Set([...(files || [me + '.json', ...Object.values(own).map(r => Store.fileFor(r, me))])].map(n => 'users/' + n));
        const queue = [...want];
        const done = new Set();
        while (queue.length) {
          const f = queue.shift();
          if (done.has(f)) continue;
          done.add(f);
          want.add(f);
          const e = CloudRecords.ALL.get(f);
          if (!e) continue;
          for (const r of e.recs.values()) {
            if (Store.newer(r, own[r.id])) own[r.id] = r;
            const t = fileOf(own[r.id]);
            if (!want.has(t)) {
              want.add(t);
              queue.push(t);
            }
          }
        }
        const groups = new Map([...want].map(f => [f, new Map()]));
        for (const r of Object.values(own)) {
          const g = groups.get(fileOf(r));
          if (g) g.set(r.id, r);
        }
        const items = [];
        for (const [f, recs] of groups) {
          const e = CloudRecords.ALL.get(f);
          const cur = e ? e.recs : new Map();
          for (const [id, r] of recs) {
            const c = cur.get(id);
            if (!c || !same(c, r)) items.push({ f, r });
          }
          for (const [id, c] of cur) if (!recs.has(id)) items.push({ f, id, d: true, ts: c._ts || 0 });
        }
        const tw = performance.now();
        if (items.length) {
          let j;
          try {
            j = await CloudBackend.rpc('save_records', { c: CloudBackend.company, items });
          } catch (e) {
            if (CloudRecords.missing(e.status, { message: e.message })) {
              CloudRecords.off = true;
              return write0.call(Store, me, own, files);
            }
            throw e;
          }
          for (const it of items) CloudRecords.put(it.f, it.id || it.r.id, it.d ? null : it.r, j.seq);
          if (j.skipped) await CloudRecords.pull(true); // the database had newer copies of some: read them
        }
        Store.stats.sent = items.length;
        Store.stats.sendMs = Math.round(performance.now() - tw);
        for (const f of want) {
          const name = f.slice(6),
            key = 'u:' + name;
          const e = CloudRecords.ALL.get(f);
          if (!e) {
            delete Store.sources[key];
            continue;
          }
          Store.noteFile(name);
          if (!Store.wantFile(name)) {
            for (const id of e.recs.keys()) if (own[id] && Store.fileFor(own[id], me) === name) delete own[id];
            delete Store.sources[key];
            Store._dropped = true;
            continue;
          }
          Store.sources[key] = { mtime: e.ver, size: e.recs.size, records: Object.fromEntries(e.recs), user: me };
        }
        return true;
      } catch (e) {
        console.error(e);
        Store.lastError = (e && e.message) || String(e);
        return false;
      }
    },
    /* online, opening is one read of the rows (in pages): no copy is kept on this PC */
    async useSnapshot() {
      return cloud() ? false : snap0.apply(Store, arguments);
    },
  });
})();
