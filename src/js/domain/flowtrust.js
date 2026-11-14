/* MAHAM — Workflow moves are checked when the files are read, and when saving.
 * Project tasks (ptask) and external follow-ups (central) move through the steps of a workflow (domain/taskflow.js). The
 * screens only offer the allowed moves, but a data file is plain JSON. So, like the fairness rules, every saved version
 * that changes the step is replayed in time order and kept only if:
 *   - the workflow has a move from the step before to the new step ('*' = from any step), and
 *   - the person who saved it passes that move's "who may" rules (the person assigned / the project owner or team
 *     manager / these roles / these people — or someone acting for them that day), or, for a move that needs an
 *     approval, is one of its approvers.
 * A step that is no longer in the workflow (the workflow was changed) may move to any step of it, and a task whose type,
 * project or party changed may take any step of its new workflow.
 * A move passes if it was allowed by the workflow in force when it was saved OR by today's (so changing a workflow
 * later never undoes old moves, and a PC clock a little off does not matter).
 * Rules that depend on other records at that moment (subtasks done, checklist, comment, project stage, blockers) are
 * checked by the screens only. The super admin is not limited.
 * A wrong move is undone — the step, resolution, approval and history go back; the rest of that save is kept — and is
 * listed in Admin → System Check. Moves saved before Config.FLOW_SINCE are left as they are. */
'use strict';

Object.assign(Store, {
  FLOW_COLLS: new Set(['ptask', 'central']),
  FLOW_FIX: ['status', 'resolution', 'pending', 'hist', 'approvals', 'doneDate'], // what a refused move puts back
  FLOW_SETTINGS: /^settings-(taskflow|fuflow|lists)(-|$)/, // where workflows live (lists: board columns)
  /* the people `by` works for that day: themself + anyone they are acting for */
  flowFor(by, day) {
    return [
      by,
      ...Store.delegations()
        .filter(d => d.to === by && Store.delegationActive(d, day))
        .map(d => d.from),
    ];
  },
  /* one "who may" / "approved by" rule, for any person (not only the one using this PC) */
  flowCond(c, t, ids) {
    const any = f => ids.some(f);
    if (c.k === 'subsDone' || c.k === 'stage') return true; // depends on other records at that moment: screens only
    if (t.c === 'central') {
      if (c.k === 'assignee') return any(i => i === t.analyst);
      if (c.k === 'planner') return any(i => FollowUp.isLead(i));
    } else {
      const p = Scrum.proj(t.project);
      if (c.k === 'assignee') return !!t.assignee && any(i => i === t.assignee);
      if (c.k === 'planner') {
        if (!p) return true;
        const tm = Scrum.teamManagerOf(p);
        return any(i => i === p.manager || (tm && i === tm) || Store.isDirector(i));
      }
    }
    return any(i => !TaskFlow.condFail(c, t, i)); // roles / people: the same rule the screens use
  },
  /* is this change of step allowed? → '' or the reason. prev / r: the record before and after; by: who saved it; ts: when.
   * A file keeps only its writer's latest version, so one version can hold several moves (To Do → In Progress → Testing):
   * the history lines it added are walked one move at a time, each checked as a move by the person who saved it (a
   * made-up history line gains nothing — every step must still be a move they may make), then the last step to its status. */
  flowWhy(prev, r, by, ts) {
    if (!prev || prev._del || !r || r._del || !Store.FLOW_COLLS.has(r.c)) return '';
    const a = r.c === 'central' ? FollowUp.norm(prev) : prev;
    if (!r.status || a.status === r.status || Store.isSuper(by)) return '';
    const wa = TaskFlow.forTask(a),
      wr = TaskFlow.forTask(r);
    const names = w => w.statuses.map(s => s.name);
    if (wa.id !== wr.id) return names(wr).includes(r.status) ? '' : `“${r.status}” is not a step of its workflow`; // type / project / party changed
    if (Store.flowByAuto(a, r)) return '';
    const ids = Store.flowFor(by, ts > 1000 ? U.ds(new Date(ts)) : U.todayStr());
    if (r.c === 'ptask' && r.status === 'Canceled' && !names(wa).includes('Canceled') && Store.flowCond({ k: 'planner' }, a, ids))
      return ''; // project close-out: the owner / manager cancels what is still open
    // a project with its own statuses (⚙ Board) keeps when each set was in force (project.boardHist): a move into a status
    // of the set in force at that moment was a free move then, even if the project's statuses changed since (2026.11.12.8)
    const ownThen = to => {
      if (r.c !== 'ptask') return false;
      const p = Scrum.proj(a.project);
      const hs = (p && p.boardHist) || [];
      const when = ts > 1000 ? ts : Date.now();
      for (let i = 0; i < hs.length; i++) {
        const from = (hs[i].at || 0) - 6e5,
          till = hs[i + 1] ? (hs[i + 1].at || 0) + 6e5 : Infinity;
        if (when >= from && when <= till && Array.isArray(hs[i].statuses) && hs[i].statuses.includes(to)) return true;
      }
      return false;
    };
    const step = (from, to) => {
      if (!names(wa).includes(from)) return names(wa).includes(to) || ownThen(to) ? '' : `“${to}” is not a step of its workflow`; // its step left the workflow
      const trs = wa.trs.filter(tr => tr.to === to && ((tr.from || ['*']).includes('*') || (tr.from || []).includes(from)));
      if (!trs.length) return ownThen(to) ? '' : `“${from}” → “${to}” is not an allowed move in its workflow`;
      for (const tr of trs) {
        if ((tr.approve || []).length) {
          if (tr.approve.some(c => Store.flowCond(c, a, ids))) return '';
          continue;
        } // needs approval: only an approver moves it
        if ((tr.cond || []).every(c => Store.flowCond(c, a, ids))) return '';
      }
      const tr = trs[0];
      const nm = tr.name || tr.to;
      if ((tr.approve || []).length) return `${nm}: needs an approval first`;
      return `${nm}: ${(tr.cond || [])
        .filter(c => !Store.flowCond(c, a, ids))
        .map(c => U.lc(TaskFlow.CONDS[c.k] || c.k))
        .join(', ')}`;
    };
    const key = e => `${e.at}|${e.from}|${e.to}`;
    const had = new Set((a.hist || []).map(key));
    let at = a.status;
    for (const e of r.hist || []) {
      if (had.has(key(e)) || e.from === e.to || e.from !== at) continue;
      const w = step(at, e.to);
      if (w) return w;
      at = e.to;
    }
    return at === r.status ? '' : step(at, r.status);
  },
  /* the step was set by one of the team's automation rules ("Then: set Status to …", Admin → Work items) that ran in this save */
  flowByAuto(a, r) {
    if (r.c !== 'ptask' || typeof Work === 'undefined' || !Work.autos) return false;
    const had = new Set((a.autoLog || []).map(x => x.id + '|' + x.at));
    const ran = new Set((r.autoLog || []).filter(x => !had.has(x.id + '|' + x.at)).map(x => x.id));
    if (!ran.size) return false;
    const p = Scrum.proj(r.project);
    if (!p) return false;
    return Work.autos(Scrum.teamOf(p)).some(
      au => ran.has(au.id) && (au.do || []).some(d => d.k === 'set' && d.field === 'status' && d.value === r.status)
    );
  },
  /* the replay, called by Store.verify (access/trust.js) with the versions that passed the other checks */
  flowReplay(list, bad, legacy, pick) {
    const ord = (a, b) => (a.r._ts || 0) - (b.r._ts || 0) || String(a.r._by || '').localeCompare(String(b.r._by || ''));
    const groups = new Map();
    for (const x of list)
      if (Store.FLOW_COLLS.has(x.r.c)) {
        if (!groups.has(x.r.id)) groups.set(x.r.id, []);
        groups.get(x.r.id).push(x);
      }
    const late = x => x.owner && !legacy(x.owner) && (x.r._ts || 0) >= Config.FLOW_SINCE;
    const todo = [...groups.values()].filter(vs => {
      if (vs.length < 2) return false;
      vs.sort(ord);
      return vs.some((x, i) => i && late(x) && x.r.status !== vs[i - 1].r.status);
    });
    if (!todo.length) return list; // nothing changed step since FLOW_SINCE: nothing to check
    // a database to look things up in: people, projects, delegations, permissions + the workflows (now, or at a moment)
    const db = pick(list.filter(x => !Store.FLOW_COLLS.has(x.r.c)));
    db.set('settings-team', Store.db.get('settings-team'));
    // each workflow setting's history: the versions in the files (a file keeps only its writer's latest) + the version
    // before every change, from the admin change log (adminlog.before; null = it did not exist yet)
    const sets = new Map();
    const add = (id, r) => {
      if (!sets.has(id)) sets.set(id, []);
      sets.get(id).push(r);
    };
    for (const x of list) {
      if (x.r.c === 'settings' && Store.FLOW_SETTINGS.test(x.r.id)) add(x.r.id, x.r);
      else if (x.r.c === 'adminlog' && Store.FLOW_SETTINGS.test(x.r.target || '') && !x.r.undoOf)
        add(x.r.target, x.r.before ? x.r.before : { id: x.r.target, _del: true, _ts: 0 });
    }
    for (const v of sets.values()) v.sort((a, b) => (a._ts || 0) - (b._ts || 0));
    const now = new Map([...sets.keys()].map(id => [id, db.get(id)]));
    const fresh = () => {
      TaskFlow._cache = null;
      if (typeof FollowUp !== 'undefined') FollowUp._fc = null;
    };
    // the workflows in force at ts (a setting whose history before ts is unknown keeps today's version)
    const at = ts => {
      for (const [id, v] of sets) {
        let w = null;
        for (const s of v) {
          if ((s._ts || 0) <= ts) w = s;
          else break;
        }
        if (!w) continue;
        if (!w._del) db.set(id, w);
        else db.delete(id);
      }
      fresh();
    };
    const back = () => {
      for (const [id, v] of now) {
        if (v) db.set(id, v);
        else db.delete(id);
      }
      fresh();
    };
    const keepDb = Store.db;
    const fixed = new Map();
    Store.db = db;
    fresh();
    try {
      for (const vs of todo) {
        let cur = null;
        for (const x of vs) {
          const m = Store.fold(cur, x.r);
          let why = cur && late(x) ? Store.flowWhy(cur, m, x.r._by, x.r._ts || 0) : '';
          if (why) {
            at(x.r._ts || 0);
            if (!Store.flowWhy(cur, m, x.r._by, x.r._ts || 0)) why = '';
            back();
          }
          if (!why) {
            cur = m;
            if (m !== x.r) fixed.set(x, Object.assign({}, x, { r: m }));
            continue;
          }
          const base = m.c === 'central' ? FollowUp.norm(cur) : cur;
          const f = Object.assign({}, m);
          for (const k of Store.FLOW_FIX) {
            if (base[k] === undefined) delete f[k];
            else f[k] = base[k];
          }
          bad(x, why + ' (step change undone)', f);
          cur = f;
          fixed.set(x, Object.assign({}, x, { r: f }));
        }
      }
    } finally {
      Store.db = keepDb;
      fresh();
    }
    return list.map(x => fixed.get(x) || x);
  },
  /* the same check when saving, with a message */
  flowBlock(r) {
    if (!r || !Store.FLOW_COLLS.has(r.c) || !r.id || !App.me || App.isSuper()) return '';
    const prev = Store.db.get(r.id);
    if (!prev) return '';
    const why = Store.flowWhy(prev, r, App.me, Date.now());
    return why ? 'That step change is not allowed — ' + why : '';
  },
});

(function wire() {
  const xb = Store.extraBlock;
  Store.extraBlock = r =>
    (xb ? xb(r) : '') ||
    (() => {
      try {
        return Store.flowBlock(r);
      } catch (e) {
        console.error('workflow step check skipped while saving:', e);
        return '';
      }
    })(); // never stop a save
})();
