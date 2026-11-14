/* MAHAM — "Lanes": a third way to run a project (next to Kanban and Scrum). Each lane is a board of its own (e.g.
 * "Build", "Validation") with ITS OWN statuses (e.g. Validation: Waiting → In validation → Passed / Failed). A task belongs to
 * one lane and stays there; its status changes inside the lane. It is finished when its status is a Done one.
 *   project { mode: 'lanes', lanes: [{ id, name, color, limit, statuses: [{ id, name, color, cat }] }], laneLog: [{ at, by, what }] }
 *            cat = 'todo' | 'wait' | 'doing' | 'done' (decides progress, late work, scoring, dashboards)
 *   ptask   { lane: <lane id>, status: <a status name of that lane> }   (no lane: the lane that has its status, else the first)
 *   lanetpl { id: 'lanetpl-<by>-…', by, team, name, lanes }   — a saved lane set (signed record, in the saver's file)
 *   settings-taskflow-<team>.lanes                             — the team's default lanes for new Lanes projects (Admin)
 * Since 2026.11.11.10 the lanes come from ADMIN TEMPLATES (Lanes.sets) a project follows (project.laneSet); project owners
 * no longer change lanes. Older projects keep their own lanes until the admin turns them into templates.
 * 2026.11.11.2 kept lanes as single statuses ({ id, name, color, cat }, no `statuses`): such a project is read as ONE lane
 * "Work" whose statuses are those lanes, so nothing is lost.
 * TaskFlow.forTask(t) returns the task's lane as a workflow (free moves inside the lane), so status chips, colours, done,
 * history, progress, scoring, late work, the dashboards and the step protection all work as for any workflow. */
'use strict';

const Lanes = {
  CATS: [
    ['todo', 'To Do'],
    ['wait', 'Waiting'],
    ['doing', 'In Progress'],
    ['done', 'Done'],
  ],
  CAT_COLOR: { todo: '#64748b', wait: '#d97706', doing: '#2563eb', done: '#16a34a' },
  COLORS: ['#2563eb', '#7c3aed', '#0891b2', '#d97706', '#db2777', '#16a34a', '#dc2626', '#64748b'],
  STD_STATUSES: () => [
    { id: 's1', name: 'Open', color: '#64748b', cat: 'todo' },
    { id: 's2', name: 'In Progress', color: '#2563eb', cat: 'doing' },
    { id: 's3', name: 'Done', color: '#16a34a', cat: 'done' },
  ],
  STANDARD: () => [{ id: 'work', name: 'Work', color: '#2563eb', limit: 0, statuses: Lanes.STD_STATUSES() }],
  is(p) {
    return !!p && p.mode === 'lanes';
  },
  uid(x) {
    return x + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  },
  color(c, i) {
    return /^#[0-9a-f]{6}$/i.test(c || '') ? c : Lanes.COLORS[i % Lanes.COLORS.length];
  },
  cleanStatuses(list) {
    const seen = new Set();
    const out = [];
    for (const s of list || []) {
      const name = String((s && s.name) || '')
        .trim()
        .slice(0, 40);
      if (!name || seen.has(U.lc(name))) continue;
      seen.add(U.lc(name));
      const cat = Lanes.CATS.some(c => c[0] === s.cat) ? s.cat : 'doing';
      out.push({ id: s.id || Lanes.uid('s'), name, color: /^#[0-9a-f]{6}$/i.test(s.color || '') ? s.color : Lanes.CAT_COLOR[cat], cat });
    }
    return out;
  },
  /* a clean lane list (names unique, at least one status each); the 2026.11.11.2 shape becomes one lane "Work" */
  clean(list) {
    list = Array.isArray(list) ? list.filter(Boolean) : [];
    if (list.length && list.every(l => !Array.isArray(l.statuses)))
      list = [
        {
          id: 'work',
          name: 'Work',
          color: '#2563eb',
          limit: 0,
          statuses: list.map(l => ({ id: l.id, name: l.name, color: l.color, cat: l.cat })),
        },
      ];
    const seen = new Set();
    const out = [];
    for (const l of list) {
      const name = String(l.name || '')
        .trim()
        .slice(0, 40);
      if (!name || seen.has(U.lc(name))) continue;
      seen.add(U.lc(name));
      const statuses = Lanes.cleanStatuses(l.statuses);
      if (!statuses.length) continue;
      out.push({
        id: l.id || Lanes.uid('ln'),
        name,
        color: Lanes.color(l.color, out.length),
        limit: Math.max(0, Math.round(+l.limit || 0)) || 0,
        statuses,
      });
    }
    return out;
  },
  /* the lanes a project uses: its admin template (linked — the project follows it), else (older projects) its own, else standard */
  of(p) {
    const t = Lanes.tplOf(p);
    if (t) return Lanes.clean(t.lanes);
    const l = Lanes.clean(p && p.lanes);
    return l.length ? l : Lanes.STANDARD();
  },
  /* ---------- admin templates (2026.11.11.10): made in Admin → Work & workflows → Project tasks → Lanes ----------
   *   settings-taskflow-<team>.laneSets = [{ id, name, lanes }]   (that team)     settings-taskflow.laneSets   (shared with every team)
   *   'std' = the built-in one: one lane "Work" (Open → In Progress → Done). A project keeps { laneSet: id } and follows it. */
  STD_SET: () => ({ id: 'std', name: 'Standard: Open → In Progress → Done', lanes: Lanes.STANDARD(), builtin: true }),
  sets(team) {
    const own = ((TaskFlow.teamRec(team || 'apps') || {}).laneSets || [])
      .filter(x => x && x.id && Lanes.clean(x.lanes).length)
      .map(x => Object.assign({ scope: team || 'apps' }, x));
    const shared = ((TaskFlow.dept() || {}).laneSets || [])
      .filter(x => x && x.id && Lanes.clean(x.lanes).length)
      .map(x => Object.assign({ scope: '', shared: true }, x));
    return [...own, ...shared, Lanes.STD_SET()];
  },
  tplOf(p) {
    if (!p || !p.laneSet) return null;
    return Lanes.sets(Scrum.teamOf(p)).find(x => x.id === p.laneSet) || null;
  },
  usedBy(id) {
    return Store.all('project', '*').filter(p => Lanes.is(p) && p.laneSet === id);
  },
  /* a lane is closed when it has tasks and every one of them is done (it opens again when one is added or reopened) */
  closed(p, lane) {
    const it = Lanes.tasksIn(p, lane);
    return it.length > 0 && it.every(t => Scrum.isDone(t));
  },
  /* from before admin templates: a team default, templates owners saved, projects with their own lanes → offered to convert */
  legacy(team) {
    const d = Lanes.clean((TaskFlow.teamRec(team || 'apps') || {}).lanes);
    return {
      teamDefault: d.length ? d : null,
      saved: Lanes.templates(team).filter(t => !t.team || t.team === team),
      projects: Store.all('project', '*').filter(p => Lanes.is(p) && !p.laneSet && Scrum.teamOf(p) === team),
    };
  },
  /* the task changes that follow new lanes for a project: renamed statuses follow, tasks that lost their place go where
     `moves` says ({ 'Lane › Status': { lane, status } }), else to the first lane's first status */
  taskMoves(p, next, moves) {
    const recs = [];
    for (const t of Scrum.items(p.id)) {
      if (t.status === 'Canceled') continue;
      const l = Lanes.laneOf(t, p);
      const nl = next.find(x => x.id === l.id);
      const s = l.statuses.find(x => x.name === t.status);
      const ns = nl && s && nl.statuses.find(x => x.id === s.id);
      let to = null;
      if (nl && ns) {
        if (ns.name !== t.status || t.lane !== nl.id)
          to = { lane: nl.id, status: ns.name, why: ns.name !== t.status ? 'Status renamed' : '' };
      } else {
        const m = moves && moves[Lanes.label(l, t.status || '—')];
        to = m
          ? { lane: m.lane, status: m.status, why: 'Lane changes' }
          : { lane: next[0].id, status: next[0].statuses[0].name, why: 'Lane changes' };
      }
      if (!to) continue;
      const r = Object.assign({}, t, { lane: to.lane, status: to.status });
      if (to.status !== t.status || to.lane !== t.lane)
        r.hist = [...(t.hist || []), { at: Date.now(), by: App.me, from: t.status, to: to.status, tr: to.why || 'Lane set' }].slice(-60);
      recs.push(r);
    }
    return recs;
  },
  copy(list) {
    return JSON.parse(JSON.stringify(Lanes.clean(list)));
  },
  /* the lane a task is in: its `lane`, else the lane that has its status, else the first */
  laneOf(t, p) {
    p = p || Scrum.proj(t && t.project);
    if (!Lanes.is(p)) return null;
    const ls = Lanes.of(p);
    return ls.find(l => l.id === t.lane) || ls.find(l => l.statuses.some(s => s.name === t.status)) || ls[0];
  },
  statusOf(t, p) {
    const l = Lanes.laneOf(t, p);
    return l ? l.statuses.find(s => s.name === t.status) || null : null;
  },
  /* the team's default lane set, the saved templates, "Start from" */
  teamDefault(team) {
    const l = Lanes.clean((TaskFlow.teamRec(team || 'apps') || {}).lanes);
    return l.length ? l : null;
  },
  templates(team) {
    return (Store.byC.lanetpl || [])
      .filter(x => x && !x._del && (!team || !x.team || x.team === team))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  },
  /* a lane as a workflow: its statuses, a free move to each (cached per project + lane) */
  _wf: new Map(),
  flowOf(p, lane) {
    const key = p.id + '|' + JSON.stringify(lane);
    if (Lanes._wf.has(key)) return Lanes._wf.get(key);
    const w = TaskFlow.norm({
      id: 'lanes-' + p.id + '-' + lane.id,
      name: lane.name,
      lanes: true,
      start: lane.statuses[0].name,
      statuses: lane.statuses.map(s => ({ name: s.name, cat: s.cat, color: s.color })),
      trs: lane.statuses.map(s => ({ id: 'ls-' + s.id, name: s.name, from: ['*'], to: s.name })),
    });
    if (Lanes._wf.size > 400) Lanes._wf.clear();
    Lanes._wf.set(key, w);
    return w;
  },
  /* who may change a project's lanes: its owner, the team manager (or acting), the super admin, an Admin with Task workflows for the team */
  /* who may make lane templates / pick a project's template: the super admin, an Admin with Task workflows for the team */
  canEdit(p) {
    return (
      !!p &&
      !App.preview &&
      (App.isSuper() || (typeof AdminRole !== 'undefined' && AdminRole.can(App.me, 'task-workflows', Scrum.teamOf(p))))
    );
  },
  tasksIn(p, lane) {
    const ls = Lanes.of(p);
    return Scrum.items(p.id).filter(t => t.status !== 'Canceled' && (Lanes.laneOf(t, p) || ls[0]).id === lane.id);
  },
  openIn(p, lane) {
    return Lanes.tasksIn(p, lane).filter(t => !Scrum.isDone(t)).length;
  },
  over(p, lane) {
    return !!lane.limit && Lanes.openIn(p, lane) > lane.limit;
  },
  /* "Lane › Status" — one label for the move step */
  label(lane, st) {
    return `${lane.name} › ${st}`;
  },
  /* what changed between two lane lists, in words (for the project's lane history) */
  diff(a, b) {
    const A = new Map(a.map(l => [l.id, l])),
      B = new Map(b.map(l => [l.id, l]));
    const out = [];
    for (const l of b) {
      const o = A.get(l.id);
      if (!o) {
        out.push(`added lane “${l.name}” (${l.statuses.map(s => s.name).join(', ')})`);
        continue;
      }
      if (o.name !== l.name) out.push(`renamed lane “${o.name}” → “${l.name}”`);
      if (o.color !== l.color) out.push(`“${l.name}” colour`);
      if ((o.limit || 0) !== (l.limit || 0)) out.push(`“${l.name}” limit ${l.limit || 'none'}`);
      const S = new Map(o.statuses.map(s => [s.id, s]));
      for (const s of l.statuses) {
        const x = S.get(s.id);
        if (!x) out.push(`“${l.name}”: added status “${s.name}”`);
        else {
          if (x.name !== s.name) out.push(`“${l.name}”: renamed “${x.name}” → “${s.name}”`);
          if (x.cat !== s.cat) out.push(`“${l.name}”: “${s.name}” counts as ${(Lanes.CATS.find(c => c[0] === s.cat) || ['', s.cat])[1]}`);
          if (x.color !== s.color) out.push(`“${l.name}”: “${s.name}” colour`);
        }
      }
      for (const s of o.statuses) if (!l.statuses.some(x => x.id === s.id)) out.push(`“${l.name}”: deleted status “${s.name}”`);
      if (
        o.statuses
          .filter(s => l.statuses.some(x => x.id === s.id))
          .map(s => s.id)
          .join() !==
        l.statuses
          .filter(s => S.has(s.id))
          .map(s => s.id)
          .join()
      )
        out.push(`“${l.name}”: statuses reordered`);
    }
    for (const l of a) if (!B.has(l.id)) out.push(`deleted lane “${l.name}”`);
    if (
      a
        .filter(l => B.has(l.id))
        .map(l => l.id)
        .join() !==
      b
        .filter(l => A.has(l.id))
        .map(l => l.id)
        .join()
    )
      out.push('lanes reordered');
    return out;
  },
  /* the tasks that lose their place with `next`: a deleted lane, or a deleted status → [{ t, from: 'Lane › Status' }] */
  homeless(p, next) {
    const out = [];
    for (const t of Scrum.items(p.id)) {
      if (t.status === 'Canceled') continue;
      const l = Lanes.laneOf(t, p);
      const nl = next.find(x => x.id === l.id);
      const s = l.statuses.find(x => x.name === t.status);
      const ns = nl && s && nl.statuses.find(x => x.id === s.id);
      if (!nl || !ns) out.push({ t, from: Lanes.label(l, t.status || '—') });
    }
    return out;
  },
  /* save new lanes: the project (lanes + history) and its tasks — renamed statuses follow, homeless tasks go where `moves` says ({ 'Lane › Status': { lane, status } }) */
  /* a project with its own lanes (⚙ Lanes on its board, or older projects): save new lanes on the project (+ history) and
     move its tasks. A project that followed a template stops following it (laneSet: '') — 2026.11.12.8 */
  save(p, next, moves) {
    const cur = Lanes.of(p);
    next = Lanes.clean(next);
    if (!next.length) return 'Keep at least one lane';
    const what = Lanes.diff(cur, next);
    if (!what.length) return '';
    const tpl = Lanes.tplOf(p);
    if (tpl) what.unshift(`stopped following the template “${tpl.name}”`);
    const np = Object.assign({}, p, {
      lanes: next,
      laneSet: '',
      laneLog: [...(p.laneLog || []), { at: Date.now(), by: App.me, what: what.join('; ') }].slice(-60),
    });
    const recs = Lanes.taskMoves(p, next, moves);
    Store.save(np);
    if (recs.length) Store.saveMany(recs);
    return ''; // the project first: the moves are checked against its new lanes
  },
  saveTemplate(p, name, lanes) {
    const t = {
      c: 'lanetpl',
      id: `lanetpl-${App.me}-${Date.now().toString(36)}`,
      by: App.me,
      team: Scrum.teamOf(p),
      name:
        String(name || '')
          .trim()
          .slice(0, 60) || p.name,
      lanes: Lanes.copy(lanes || Lanes.of(p)),
    };
    Store.save(t);
    return t;
  },
};

/* ---------- the engine: a task of a Lanes project follows its lane's statuses (TaskFlow.MODES, domain/taskflow.js) ---------- */
(function wire() {
  // a Lanes project is a project mode: its tasks follow their lane, a new task / the board the first lane (TaskFlow.MODES)
  TaskFlow.MODES.lanes = {
    of: p => Lanes.flowOf(p, Lanes.of(p)[0]),
    forTask: (t, p) => Lanes.flowOf(p, Lanes.laneOf(t, p)),
  };
  // lane templates are signed records: written by the person named in `by` (access/trust.js)
  if (Store.SIGNED) Store.SIGNED.lanetpl = { what: 'lane template', superOk: true };
})();
