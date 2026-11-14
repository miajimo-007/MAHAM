/* MAHAM — Store — the in-memory database.
 *  sources : every data file read from the shared folder (one per person)
 *  own     : MY records — the only ones this PC writes (to users/<me>.json)
 *  db      : merged view, newest edit of each record wins (_ts, then _by)
 * Records: { id, c (collection), team?, _ts, _by, _del? } */
'use strict';

const Store = {
  root: null,
  dataDir: null,
  usersDir: null,
  sources: {}, // filename -> { mtime, size, records: {id: rec} }
  own: {}, // my records (id -> rec) — what goes into users/<me>.json
  db: new Map(), // merged view id -> rec
  byC: {}, // collection -> [visible recs]
  dirty: false,
  saving: false,
  lastSaved: 0,
  lastError: '',
  lastSync: 0,
  listeners: [],
  PERMS: Config.PERMS,
  SUPER_ONLY: Config.SUPER_ONLY,
  PAGES: Config.PAGES,
  LEVELS: Config.LEVELS,
  ADMIN_EDIT: Config.ADMIN_EDIT,
  COLL_PAGE: Config.COLL_PAGE,
  TEAM_SCOPED: Config.TEAM_SCOPED,
  ROLES: Config.ROLES,
};

Object.assign(Store, {
  /* No lost changes when two people change the same item at about the same time.
   * Each saved version of these kinds lists the fields it changed (_chg, worked out against what the saver saw). When the
   * files are merged, versions are applied oldest → newest and a version with _chg only overwrites those fields — so
   * "✓ Done" by the analyst and "Priority: High" by the manager both survive, even from a copy that was a few seconds old.
   * A version without _chg (new items, older app versions) replaces the whole record, as before. */
  MERGE_COLLS: new Set([
    'todo',
    'shadow',
    'quickwin',
    'central',
    'oncall',
    'gcatch',
    'ptask',
    'mgrtask',
    'action',
    'mytask',
    'project',
    'attendance',
  ]),
  /* the fields that differ between what I saw (cur) and what I am saving (rec); '_' fields are bookkeeping, except _del */
  diffKeys(cur, rec) {
    const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    return [...new Set([...Object.keys(cur), ...Object.keys(rec)])].filter(
      k => (!k.startsWith('_') || k === '_del') && !eq(cur[k], rec[k])
    );
  },
  /* apply version r on top of the merged record so far (prev) */
  fold(prev, r) {
    if (!prev || !r || !Array.isArray(r._chg) || !Store.MERGE_COLLS.has(r.c) || prev.c !== r.c) return r;
    const out = Object.assign({}, prev);
    for (const k of r._chg) {
      if (k in r) out[k] = r[k];
      else delete out[k];
    }
    for (const k of ['_ts', '_by', '_v', '_chg']) if (k in r) out[k] = r[k];
    return out;
  },
  newer(a, b) {
    // is a newer than b?
    if (!b) return true;
    const ta = a._ts || 0,
      tb = b._ts || 0;
    if (ta !== tb) return ta > tb;
    return String(a._by || '') > String(b._by || '');
  },
  rebuild() {
    // merge every file — newest allowed version of each record wins (see access/trust.js)
    Store.db = Store.verify();
    const byC = {};
    for (const r of Store.db.values()) {
      if (r._del) continue;
      (byC[r.c] = byC[r.c] || []).push(r);
    }
    Store.byC = byC;
    Store.ver = (Store.ver || 0) + 1; // data version: caches compare against it
    Calc.invalidate();
  },
  teamOf(r) {
    return r.team || 'apps';
  },
  all(c, team) {
    const list = Store.byC[c] || [];
    const t = team || App.viewTeam;
    if (!Store.TEAM_SCOPED.has(c) || !t || t === '*') return list;
    const k = c + '|' + t;
    if (!Store._scoped || Store._scopedV !== Store.byC) {
      Store._scoped = {};
      Store._scopedV = Store.byC;
    }
    return Store._scoped[k] || (Store._scoped[k] = list.filter(r => Store.teamOf(r) === t));
  },
  get(id) {
    const r = Store.db.get(id);
    return r && !r._del ? r : null;
  },
  save(rec) {
    Store.saveMany([rec]);
    return rec;
  },
  saveMany(list) {
    list = (list || []).filter(r => !(r && (r.virtual || /^chk~/.test(r.id || '')))); // check To Dos are worked out, never saved
    if (!App.me) {
      console.warn('Nothing saved: nobody is signed in');
      return;
    } // every record belongs to the person signed in
    if (App.tooOld && App.tooOld()) {
      if (typeof UI !== 'undefined')
        UI.toast(
          `This copy of the app (${APP_VERSION}) is too old — copy the new MAHAM.html from the shared folder. Nothing was saved.`,
          'bad'
        );
      return;
    }
    if (App.preview) {
      if (typeof UI !== 'undefined') UI.toast('Preview only — nothing is saved while you view as someone else', 'warn');
      return;
    }
    let fairMsg = '';
    // small rules every record follows, whoever saves it (domain/rules.js): QW IDs, To Do status
    if (typeof nextQwId === 'function') nextQwId.taken = []; // QW IDs given out in this one save, so two never get the same number
    if (Store.normalize) list = list.map(r => (r ? Store.normalize(r) : r));
    if (typeof nextQwId === 'function') nextQwId.taken = [];
    const blocked = list.filter(r => {
      if (!r || !r.c) return false;
      if (
        !Store.canEditColl(App.me, r.c, App.viewTeam) ||
        !Store.settingAllowed(r) ||
        !Store.createAllowed(r) ||
        !Store.requestAllowed(r) ||
        !Store.announceAllowed(r)
      )
        return true;
      const xm = Store.extraBlock ? Store.extraBlock(r) : '';
      if (xm) {
        fairMsg = fairMsg || xm;
        return true;
      }
      const w = Store.whyNotFair(r);
      if (w) {
        fairMsg = fairMsg || w;
        return true;
      }
      return false;
    });
    if (blocked.length) {
      if (typeof UI !== 'undefined')
        UI.toast(
          fairMsg ||
            (blocked.some(r => r.c === 'settings')
              ? 'Only the administrator can change roles, permissions and settings'
              : 'You have view-only access to this function'),
          'bad'
        );
      // a conversion is all or nothing: when the new record is refused, the original is not removed (and its notes are not copied)
      const cv = new Set([
        ...blocked.filter(r => r.convertedFrom && r.convertedFrom.id).map(r => r.convertedFrom.id),
        ...blocked.filter(r => r.keptFrom).map(r => r.keptFrom),
      ]); // keptFrom: the time kept as shadow work when converting
      const cvNew = new Set(blocked.filter(r => r.convertedFrom).map(r => r.id));
      const gone = new Set(blocked.filter(r => r._del && r.convertedTo).map(r => r.id));
      list = list.filter(
        r =>
          !blocked.includes(r) &&
          !cv.has(r.id) &&
          !(r.c === 'refnote' && r.carried && cvNew.has(r.on)) &&
          !(r.convertedFrom && (gone.has(r.convertedFrom.id) || cv.has(r.convertedFrom.id))) &&
          !(r.keptFrom && (gone.has(r.keptFrom) || cv.has(r.keptFrom)))
      );
      if (!list.length) return;
    }
    if (typeof Admin !== 'undefined' && Admin.trackSave)
      try {
        Admin.trackSave(list);
      } catch (e) {
        /* usage only */
      }
    const logs = typeof Admin !== 'undefined' ? Admin.logFor(list) : []; // super admin: change log (domain/admin.js)
    for (const x of logs) {
      delete x.rec._nolog;
      list.push(x.log);
    }
    if (typeof ActLog !== 'undefined')
      try {
        const a = ActLog.forSave(list);
        if (a) list.push(a);
      } catch (e) {
        console.warn('activity log', e);
      }
    for (const r of list) {
      delete r._nolog;
      delete r._undoOf;
    }
    const now = Date.now();
    for (const rec of list) {
      if (!rec.id) rec.id = U.uid(rec.c);
      const cur = Store.db.get(rec.id);
      // who gave a director task / director project (directors see only the ones they gave)
      if (!cur && !rec.givenBy && (rec.c === 'mgrtask' || rec.c === 'project' || rec.c === 'todo')) rec.givenBy = App.me;
      if (!cur && !rec.createdBy && Store.OWNED && Store.OWNED[rec.c] === 'createdBy') rec.createdBy = App.me; // shared lists: who added it owns it
      rec._ts = Math.max(now, cur ? (cur._ts || 0) + 1 : 0);
      if ((rec.c === 'mgrtask' || rec.c === 'project') && cur && rec.givenBy !== App.me) {
        rec.updAt = now;
        rec.updBy = App.me;
      } // answers the director's "ask for update"
      // only these fields win when merged. My file keeps only my latest version, so it lists every field I have changed
      // in it so far (my earlier "take it" must survive my later "resolve")
      if (cur && Store.MERGE_COLLS.has(rec.c)) {
        const mine = Store.own[rec.id];
        rec._chg = [...new Set([...(mine && Array.isArray(mine._chg) ? mine._chg : []), ...Store.diffKeys(cur, rec)])];
      } else delete rec._chg;
      rec._by = App.me;
      rec._v = APP_VERSION; // which app version saved it (Admin → minimum version)
      if (Store.TEAM_SCOPED.has(rec.c) && !rec.team) rec.team = Store.saveTeam(rec); // data/people.js
      Store.own[rec.id] = rec;
    }
    for (const x of logs) x.log.afterTs = x.rec._ts;
    Store.dirty = true;
    for (const r of list) Store.pending[r.id] = r;
    LS.set('bct.unsaved.' + App.me, Store.pending); // safety copy of what is not in the shared folder yet (only that, so it stays small)
    Store.applyLocal(list);
    if (typeof TodoFlow !== 'undefined' && list.some(r => r && r.c === 'todo' && r.wf && r.finish)) {
      const l2 = list.slice();
      setTimeout(() => {
        try {
          TodoFlow.autoNext(l2);
        } catch (e) {
          console.warn(e);
        }
      }, 0);
    } // workflow: hand on to the next step
    Store.flushSoon();
    Store.emit();
  },
  /* my own saves: update just those records now (instant), and re-check everything with the trust rules shortly after */
  pending: {},
  applyLocal(list) {
    if (list.length > 300 || !Store.byC) {
      Store.rebuild();
      return;
    }
    for (let rec of list) {
      const cur = Store.db.get(rec.id);
      if (cur && !Store.newer(rec, cur)) continue;
      Store.db.set(rec.id, (rec = Store.fold(cur, rec)));
      const arr = (Store.byC[rec.c] = Store.byC[rec.c] || []);
      const i = arr.findIndex(x => x.id === rec.id);
      if (rec._del) {
        if (i >= 0) arr.splice(i, 1);
      } else if (i >= 0) arr[i] = rec;
      else arr.push(rec);
    }
    Store._scoped = null;
    Store.ver = (Store.ver || 0) + 1;
    Calc.invalidate();
    clearTimeout(Store._recheck);
    Store._recheck = setTimeout(() => {
      Store.rebuild();
      Store.emit();
    }, 1500);
  },
  remove(id) {
    const cur = Store.db.get(id);
    if (!cur) return;
    Store.save(Object.assign({}, cur, { _del: true }));
  },
  on(fn) {
    Store.listeners.push(fn);
  },
  emit() {
    for (const f of Store.listeners)
      try {
        f();
      } catch (e) {
        console.error(e);
      }
  },
  /* settings helpers */
  setting(id, key, dflt) {
    const r = Store.get(id);
    return r && r[key] !== undefined ? r[key] : dflt;
  },
  metaId(t) {
    return 'settings-meta-' + (t || App.viewTeam || 'apps');
  },
  meta(t) {
    const tm = t || App.viewTeam || 'apps';
    return Store.get('settings-meta-' + tm) || (tm === 'apps' ? Store.get('settings-meta') : null) || {};
  },
  /* per-team settings: settings-lists-<team> / settings-scoring-<team>, falling back to the shared default */
  tset(base, key, dflt, team) {
    const t = team || App.viewTeam || 'apps';
    const r = Store.get(base + '-' + t);
    if (r && r[key] !== undefined) return r[key];
    return Store.setting(base, key, dflt);
  },
  lists(team) {
    const base = Object.assign({}, Config.DEFAULT_LISTS, Store.setting('settings-lists', 'lists', {}));
    const own = (Store.get('settings-lists-' + (team || App.viewTeam || 'apps')) || {}).lists;
    return own ? Object.assign({}, base, own) : base;
  },
  list(key) {
    return Store.lists()[key] || [];
  },
});
