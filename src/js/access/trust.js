/* MAHAM — Trust check when files are read.
 * The data files are plain JSON in the shared folder, so someone could edit one by hand. When files are merged,
 * a record is accepted only if the person who wrote it was entitled to:
 *   1. a record in users/<id>.json must carry _by = <id>            (nobody writes under someone else's name)
 *   2. settings (roles, permissions, lists, scoring, delegations …) only from a super admin at that time;
 *      other people may only change their own PIN, and record the help-desk import date (settings-meta-*)
 *   3. requests: the requester may raise / cancel; only an approver (not the requester) may decide
 *   4. locked monthly scores only from people with the lockScores permission
 *   5. no time stamps more than a day in the future (they would block every later edit)
 * Anything else is ignored (the previous valid version is used) and listed in Admin → System Check. */
'use strict';

Object.assign(Store, {
  rejected: [], // [{ file, id, c, by, why }] — shown in System Check
  ownerOf(sourceKey) {
    return sourceKey.startsWith('u:') ? Store.fileOwner(sourceKey.slice(2)) : null;
  }, // users/<id>.json and <id>.hd-…/.y… files belong to <id>   // 'seed' → null (shipped with the app)

  /* every version of every record we have, with where it came from */
  candidates() {
    const out = [];
    for (const [k, s] of Object.entries(Store.sources)) {
      const owner = Store.ownerOf(k);
      for (const r of Object.values(s.records)) if (r && r.id) out.push({ r, owner, file: k === 'seed' ? 'app' : k.slice(2) });
    }
    if (App.me) for (const r of Object.values(Store.own)) if (r && r.id) out.push({ r, owner: App.me, file: App.me + '.json (unsaved)' });
    return out;
  },

  /* returns the merged database (Map id → record) built only from allowed versions */
  verify() {
    const rejected = [];
    const bad = (x, why, fixed) =>
      rejected.push({ file: x.file, id: x.r.id, c: x.r.c, by: x.r._by || '', why, ts: x.r._ts || 0, fixed: fixed || null });
    const legacy = o => /^_old-/.test(o || ''); // old-data files from early versions (records only, never settings)
    // 1 — written under the file owner's name, with a believable time
    const latest = Date.now() + 864e5;
    let list = Store.candidates().filter(x => {
      if (!x.owner) return true;
      if ((x.r._ts || 0) > latest) {
        bad(x, 'dated in the future');
        return false;
      }
      if (legacy(x.owner)) return true;
      if (x.r._by !== x.owner) {
        bad(x, `written as "${x.r._by || '?'}" inside ${x.owner}'s file`);
        return false;
      }
      return true;
    });
    list = list.filter(x => !(legacy(x.owner) && x.r.c === 'settings') || (bad(x, 'settings inside an old-data file'), false));

    // 2 — settings: replay the people list in time order to know who was super admin when
    const seedTeam = list.find(x => !x.owner && x.r.id === 'settings-team');
    let cur = seedTeam ? seedTeam.r : { id: 'settings-team', c: 'settings', members: [], _ts: 0 };
    const timeline = [[cur._ts || 0, cur.members || []]];
    const superIn = (members, id) =>
      Array.isArray(Store.trustedPeople)
        ? Store.trustedPeople.some(p => p.id === id && p.admin && p.active !== false)
        : !!((members || []).find(m => m.id === id) || {}).superAdmin;
    const superAt = (id, ts) => {
      let m = timeline[0][1];
      for (const [t, mem] of timeline) {
        if (t <= ts) m = mem;
        else break;
      }
      return superIn(m, id);
    };
    const strip = (members, keep) =>
      JSON.stringify(
        (members || []).map(m => {
          const o = Object.assign({}, m);
          if (o.id === keep) delete o.pin;
          return o;
        })
      );
    const teamVersions = list.filter(x => x.owner && x.r.id === 'settings-team').sort((a, b) => (a.r._ts || 0) - (b.r._ts || 0));
    for (const x of teamVersions) {
      if (x.r._del) {
        if (!superIn(cur.members, x.r._by)) bad(x, 'tried to delete the people list');
        else cur = x.r;
        continue;
      }
      if (superIn(cur.members, x.r._by)) cur = x.r;
      else {
        // not a super admin: keep only their own PIN change, on top of the current trusted list
        const mine = (x.r.members || []).find(m => m.id === x.r._by);
        if (strip(x.r.members, x.r._by) !== strip(cur.members, x.r._by))
          bad(x, 'tried to change people, roles or permissions (only their PIN was kept)');
        if (mine && (cur.members || []).some(m => m.id === x.r._by))
          cur = Object.assign({}, cur, {
            _ts: x.r._ts,
            _by: x.r._by,
            members: cur.members.map(m => (m.id === x.r._by ? Object.assign({}, m, { pin: mine.pin }) : m)),
          });
        else continue;
      }
      timeline.push([cur._ts || 0, cur.members || []]);
    }
    // online database (GitHub version): the database decides who is in the company and who is its admin
    if (Array.isArray(Store.trustedPeople)) {
      const tp = new Map(Store.trustedPeople.map(p => [p.id, p]));
      const have = new Set((cur.members || []).map(m => m.id));
      const ms = (cur.members || []).map(m =>
        tp.has(m.id)
          ? Object.assign({}, m, { superAdmin: !!tp.get(m.id).admin, active: m.active !== false && tp.get(m.id).active !== false })
          : Object.assign({}, m, { superAdmin: false })
      );
      for (const p of Store.trustedPeople)
        if (!have.has(p.id))
          ms.push({
            id: p.id,
            name: p.name || p.id,
            short: p.name || p.id,
            me: '',
            scored: !p.admin,
            active: p.active !== false,
            aliases: [],
            role: 'analyst',
            team: p.team || ((Store.setting && (cur.members || [])[0]) || {}).team || '',
            superAdmin: !!p.admin,
            email: p.email || '',
            hidden: !!p.hidden,
          });
      cur = Object.assign({}, cur, { members: ms });
      timeline.length = 0;
      timeline.push([0, ms]);
    }
    const members = cur.members || [];
    const isMember = id => members.some(m => m.id === id);
    list = list
      .filter(x => {
        if (x.r.c !== 'settings' || !x.owner || x.r.id === 'settings-team') return true;
        if (/^settings-meta(-|$)/.test(x.r.id)) return isMember(x.r._by) || legacy(x.owner) || (bad(x, 'not a team member'), false);
        if (superAt(x.r._by, x.r._ts || 0)) return true;
        bad(x, 'settings can only be changed by the super admin');
        return false;
      })
      .filter(x => x.r.id !== 'settings-team' || !x.owner); // replaced by the replayed version below

    // a temporary database with the trusted settings, so the permission helpers can be used below
    const pick = arr => {
      const db = new Map();
      for (const x of arr) {
        const c0 = db.get(x.r.id);
        if (Store.newer(x.r, c0)) db.set(x.r.id, x.r);
      }
      return db;
    };
    const settingsDb = pick(list.filter(x => x.r.c === 'settings'));
    settingsDb.set('settings-team', cur);
    const keepDb = Store.db;
    Store.db = settingsDb;
    try {
      const day = ts => (ts > 1000 ? U.ds(new Date(ts)) : U.todayStr());
      const actingAt = (id, ts) => Store.delegations().some(d => d.to === id && Store.delegationActive(d, day(ts)));
      const mayApprove = (id, ts) => Store.isSuper(id) || Store.isDirector(id) || Store.can(id, 'approveRequests', 1) || actingAt(id, ts);
      const clean = r => {
        const o = Object.assign({}, r, { status: Requests.firstStatus(r) });
        for (const k of ['mgrBy', 'mgrOn', 'mgrOk', 'mgrComment', 'dirBy', 'dirOn', 'dirOk', 'dirComment', 'escalated']) delete o[k];
        return o;
      };
      // minute-taker: accepted only when the chair's own latest version names that person
      const scribeOf = new Map();
      for (const x of list)
        if (x.owner && x.r.c === 'meeting' && x.r._by === x.r.owner && String(x.r.id).startsWith('meeting-' + x.r.owner + '-')) {
          const p = scribeOf.get(x.r.id);
          if (!p || (x.r._ts || 0) > p.ts) scribeOf.set(x.r.id, { ts: x.r._ts || 0, s: x.r.scribe || '', owner: x.r.owner });
        }
      list = list
        .map(x => {
          // the requester's own version may only raise or cancel: keep the request, drop any decision they gave themselves
          if (
            x.owner &&
            !legacy(x.owner) &&
            x.r.c === 'request' &&
            x.r._by === x.r.requester &&
            !Store.isSuper(x.r._by) &&
            !(Requests.isPending(x.r) || x.r.status === Requests.ST.X || x.r._del)
          ) {
            bad(x, 'a person cannot approve their own request (kept as waiting)');
            return Object.assign({}, x, { r: clean(x.r) });
          }
          return x;
        })
        .filter(x => {
          if (!x.owner || legacy(x.owner)) return true;
          const r = x.r,
            by = r._by;
          if (r.c === 'request') {
            if (Store.isSuper(by) || by === r.requester) return true;
            return mayApprove(by, r._ts || 0) || (bad(x, 'decided by someone who is not an approver'), false);
          }
          if (r.c === 'scoresnap')
            return Store.can(by, 'lockScores', 1) || (bad(x, 'locked scores without the "Lock monthly scores" permission'), false);
          if (r.c === 'userpin')
            return Store.isSuper(by) || (r.id === 'userpin-' + by && r.member === by) || (bad(x, "set someone else's PIN"), false);
          if (r.c === 'nudge') return r.from === by || (bad(x, 'reminder written for someone else'), false);
          if (r.c === 'adminlog')
            return Store.isSuper(by) || (bad(x, 'admin change log written by someone who is not the administrator'), false);
          if (r.c === 'usage') return r.id === 'usage-' + by || (bad(x, 'usage written for someone else'), false);
          if (r.c === 'actlog')
            return (
              (String(r.id).startsWith('actlog-' + by + '-') && r.who === by) || (bad(x, 'activity log written for someone else'), false)
            );
          if (r.c === 'announcement')
            return (
              Store.isSuper(by) ||
              Store.privileged(by, 'postAnnouncements', x.r._ts) ||
              (bad(x, 'announcement posted without the "Post announcements" permission'), false)
            );
          if (r.c === 'todoask')
            return (
              (r.by === by && String(r.id).startsWith('todoask-' + by + '-')) ||
              (bad(x, "follow-up request written in someone else's name"), false)
            );
          if (r.c === 'todostep')
            return (
              (r.by === by && String(r.id).startsWith('todostep-' + by + '-')) ||
              (bad(x, "To Do step written in someone else's name"), false)
            );
          if (r.c === 'todorule')
            return (
              Store.isSuper(by) ||
              Store.privileged(by, 'assignTodo', x.r._ts) ||
              (bad(x, 'repeating To Do set up without the right to give To Dos'), false)
            );
          if (r.c === 'refnote')
            return (
              Store.isSuper(by) ||
              (r.by === by && String(r.id).startsWith('refnote-' + by + '-')) ||
              (bad(x, "note written in someone else's name"), false)
            );
          if (r.c === 'annread')
            return String(r.id).startsWith('annread-' + by + '-') || (bad(x, 'read receipt written for someone else'), false);
          // meeting action: the chair, the chair's minute-taker, or the person it belongs to
          if (r.c === 'action') {
            if (Store.isSuper(by) || by === r.givenBy || by === r.who) return true;
            const sc = scribeOf.get(r.fromMeeting);
            return (sc && sc.s === by && sc.owner === r.givenBy) || (bad(x, 'meeting action changed by someone else'), false);
          }
          if (r.c === 'meeting' || r.c === 'mytask') {
            if (Store.isSuper(by)) return true;
            const creator = r.c === 'meeting' ? r.owner : r.owner;
            return (
              (creator === by && String(r.id).startsWith(r.c + '-' + by + '-')) ||
              (r.c === 'meeting' && (sc => sc && sc.s && sc.s === by && r.owner === sc.owner && r.scribe === by)(scribeOf.get(r.id))) ||
              (bad(
                x,
                r.c === 'meeting'
                  ? 'only the person who runs a meeting can change its minutes'
                  : 'a personal task can only be changed by its owner'
              ),
              false)
            );
          }
          return true;
        });
      // minimum app version: once required, saves made after that moment by older copies are ignored
      const minV = Store.setting('settings-features', 'minVersion', ''),
        minSince = Store.setting('settings-features', 'minSince', 0);
      if (minV && minSince)
        list = list.filter(
          x =>
            !x.owner ||
            legacy(x.owner) ||
            (x.r._ts || 0) <= minSince ||
            (x.r._v && U.verCmp(x.r._v, minV) >= 0) ||
            Store.isSuper(x.r._by) ||
            (bad(x, `saved with an old copy of the app (${x.r._v || 'before ' + minV}) — ask them to update`), false)
        );
      // score fairness (access/fairness.js): replay each record's versions in time order
      const locks = Store.lockMap([...pick(list.filter(x => x.r.c === 'scoresnap')).values()]);
      Store._verifyRules = pick(list.filter(x => x.r.c === 'todorule')); // repeating To Do copies are checked against these
      const groups = new Map();
      const keep = [];
      for (const x of list) {
        if (Store.FAIR_COLLS.has(x.r.c)) {
          if (!groups.has(x.r.id)) groups.set(x.r.id, []);
          groups.get(x.r.id).push(x);
        } else keep.push(x);
      }
      const replay = vs => {
        vs.sort((a, b) => (a.r._ts || 0) - (b.r._ts || 0) || String(a.r._by || '').localeCompare(String(b.r._by || '')));
        let curV = null;
        for (const x of vs) {
          if (!x.owner || legacy(x.owner) || (x.r._ts || 0) < Config.FAIR_SINCE) {
            curV = x.r;
            keep.push(x);
            continue;
          } // older saves followed the old rules
          const res = Store.fairCheck(x.r, curV, x.r._by, x.r._ts || 0, locks);
          if (res.reject) {
            bad(x, res.reject);
            continue;
          }
          if (res.flag) bad(x, res.flag + ' (corrected)', res.fixed);
          const y = res.fixed === x.r ? x : Object.assign({}, x, { r: res.fixed });
          curV = y.r;
          keep.push(y);
        }
        return curV;
      };
      // hand-on steps a workflow made (todo-step-…-a) are checked after the To Do before them, against it (domain/todoflow.js)
      const later = [];
      for (const [id, vs] of groups) {
        if (/^todo-step-/.test(id)) later.push([id, vs]);
        else replay(vs);
      }
      if (later.length) {
        const todos = new Map();
        for (const x of keep) if (x.r.c === 'todo' && Store.newer(x.r, todos.get(x.r.id))) todos.set(x.r.id, x.r);
        Store._verifyTodos = todos;
        for (const [id, vs] of later.sort((a, b) => a[0].length - b[0].length)) {
          const cur = replay(vs);
          if (cur) todos.set(id, cur);
        }
      }
      list = keep;
    } finally {
      Store.db = keepDb;
      Store._verifyRules = null;
      Store._verifyTodos = null;
    }

    const db = pick(list);
    db.set('settings-team', cur);
    // only report changes that would have mattered: newer than (or equal to) the version in use; superseded old versions are just history
    Store.rejected = rejected.filter(x => {
      const w = db.get(x.id);
      return !w || x.ts >= (w._ts || 0);
    });
    return db;
  },
});
