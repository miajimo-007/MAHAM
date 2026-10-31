/* DARRIK — Store — the in-memory database.
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
    if (App.tooOld && App.tooOld()) {
      if (typeof UI !== 'undefined')
        UI.toast(
          `This copy of the app (${APP_VERSION}) is too old — copy the new DARRIK.html from the shared folder. Nothing was saved.`,
          'bad'
        );
      return;
    }
    if (App.preview) {
      if (typeof UI !== 'undefined') UI.toast('Preview only — nothing is saved while you view as someone else', 'warn');
      return;
    }
    let fairMsg = '';
    // a To Do's status always follows its finish date and the manager's confirmation — whoever saves it
    // a quick win gets its QW ID automatically the moment it is accepted (however it was approved)
    nextQwId.taken = [];
    list = list.map(r => {
      if (
        r &&
        r.c === 'quickwin' &&
        !r._del &&
        U.lc(r.approval) === 'accepted' &&
        !String(r.qwId || '').trim() &&
        Store.can(App.me, 'approveQW')
      ) {
        const id = nextQwId();
        nextQwId.taken.push({ qwId: id });
        return Object.assign({}, r, { qwId: id });
      }
      return r;
    });
    nextQwId.taken = [];
    list = list.map(r =>
      r && r.c === 'todo' && !r._del && r.status !== 'Canceled' && App.me
        ? Object.assign({}, r, {
            status: (() => {
              const p = r.id && Store.db.get(r.id);
              return p && !p._del && p.status === 'Resolved' && p.finish && p.finish === r.finish
                ? 'Resolved'
                : Store.finishStatus(r, App.me);
            })(),
          })
        : r
    ); // already-done To Dos stay done when someone adds a comment
    if (typeof nextQwId === 'function') nextQwId.taken = [];
    if (Store.normalize) list = list.map(r => (r ? Store.normalize(r) : r)); // e.g. a quick win gets its QW ID when accepted (domain/rules.js)
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
      list = list.filter(r => !blocked.includes(r));
      if (!list.length) return;
    }
    const logs = typeof Admin !== 'undefined' ? Admin.logFor(list) : []; // super admin: change log (domain/admin.js)
    for (const x of logs) {
      delete x.rec._nolog;
      list.push(x.log);
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
      rec._ts = Math.max(now, cur ? (cur._ts || 0) + 1 : 0);
      if ((rec.c === 'mgrtask' || rec.c === 'project') && cur && rec.givenBy !== App.me) {
        rec.updAt = now;
        rec.updBy = App.me;
      } // answers the director's "ask for update"
      rec._by = App.me;
      rec._v = APP_VERSION; // which app version saved it (Admin → minimum version)
      if (Store.TEAM_SCOPED.has(rec.c) && !rec.team && App.viewTeam && App.viewTeam !== '*') rec.team = App.viewTeam;
      Store.own[rec.id] = rec;
    }
    for (const x of logs) x.log.afterTs = x.rec._ts;
    Store.dirty = true;
    LS.set('bct.unsaved.' + App.me, Store.own);
    Store.rebuild();
    Store.flushSoon();
    Store.emit();
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
