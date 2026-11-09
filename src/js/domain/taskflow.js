/* MAHAM — Task workflows for project tasks (Jira-style).
 *
 * A workflow = statuses (each in a category: To Do / In Progress / Done) + named transitions.
 * A transition: from (list of statuses, or '*' = any), to, and rules:
 *   cond  — who may see / use it        (assignee, roles, people, subtasks done, project stage)
 *   valid — what must be true to finish  (a field filled, a comment, checklist done, blockers done)
 *   post  — what happens after           (set / clear resolution, assign, set a field, notify)
 *   screen — fields asked when the move runs (resolution, comment, assignee, due, points, actual)
 *
 * Where they live (settings, set by the super admin or an Admin with "Workflows"):
 *   settings-taskflow          — department: resolutions list, shared workflows, the department default
 *   settings-taskflow-<team>   — that team's workflows and its default (the "scheme")
 *   settings-taskflow-<team>.types[type]   — a task type can have its own workflow (Task / Story / Bug)
 *   settings-taskflow-<team>.projects[pid] — a project can use another workflow for all its tasks (override)
 * Categories: To Do · Waiting · In Progress · Done. When a project's tasks follow more than one workflow (or a
 * workflow asks for it) the board shows one column per category, each card with its own status.
 * With nothing set, a team uses its board columns as before (first = To Do, last = Done, others = In Progress)
 * and any task may move to any status — so nothing changes until an admin builds a workflow. */
'use strict';

const TaskFlow = {
  CATS: [
    ['todo', 'To Do'],
    ['wait', 'Waiting'],
    ['doing', 'In Progress'],
    ['done', 'Done'],
  ],
  CAT_COLOR: { todo: '#64748b', wait: '#d97706', doing: '#2563eb', done: '#16a34a' },
  RESOLUTIONS: ['Done', 'Rejected', 'Canceled', 'Duplicate'],
  SCREEN: [
    ['resolution', 'Resolution'],
    ['comment', 'Comment'],
    ['assignee', 'Assigned to'],
    ['due', 'Due date'],
    ['points', 'Story points'],
    ['actual', 'Actual hours'],
  ],
  /* the rule library: key → label (the editor shows these; config sits on the rule object) */
  CONDS: {
    assignee: 'Only the person assigned',
    planner: 'Only the project owner / team manager',
    roles: 'Only these roles',
    people: 'Only these people',
    subsDone: 'All subtasks are done',
    stage: 'The project is in one of these stages',
  },
  VALIDS: {
    field: 'This field is filled',
    comment: 'A comment is written',
    checklist: 'The checklist is all ticked',
    blockers: 'The task it depends on is done',
  },
  POSTS: {
    resolution: 'Set the resolution',
    clearRes: 'Clear the resolution',
    assign: 'Assign to',
    set: 'Set a field',
    notify: 'Tell someone',
  },
  FIELDS: [
    ['due', 'Due date'],
    ['points', 'Story points'],
    ['assignee', 'Assigned to'],
    ['est', 'Estimated hours'],
    ['actual', 'Actual hours'],
    ['resolution', 'Resolution'],
    ['description', 'Description'],
    ['sprint', 'Sprint'],
    ['start', 'Start date'],
  ],

  /* ---------- settings ---------- */
  dept() {
    return Store.get('settings-taskflow') || {};
  },
  teamRec(team) {
    return Store.get('settings-taskflow-' + (team || 'apps')) || {};
  },
  resolutions() {
    const l = (TaskFlow.dept().resolutions || []).filter(Boolean);
    return l.length ? l : TaskFlow.RESOLUTIONS.slice();
  },
  /* the workflows a team can pick from: its own + the department's shared ones */
  listFor(team) {
    return [...(TaskFlow.teamRec(team).flows || []), ...(TaskFlow.dept().flows || []).map(w => Object.assign({ shared: true }, w))];
  },
  find(team, id) {
    return id ? TaskFlow.listFor(team).find(w => w.id === id) : null;
  },

  /* built from the team's board columns: every task may move to every status (same as before workflows) */
  seed(team) {
    const raw = (Store.lists(team).boardColumns || []).filter(Boolean);
    const cols = raw.length >= 2 ? raw : Config.DEFAULT_LISTS.boardColumns;
    const statuses = cols.map((n, i) => ({ name: n, cat: i === 0 ? 'todo' : i === cols.length - 1 ? 'done' : 'doing' }));
    return {
      id: 'board',
      name: 'Board columns (simple)',
      simple: true,
      statuses,
      start: cols[0],
      trs: cols.map((n, i) => ({ id: 'to' + i, name: n, from: ['*'], to: n })),
    };
  },
  /* the Jira-like starting point an admin can copy */
  example() {
    return {
      id: U.uid('tf'),
      name: 'Standard',
      start: 'To Do',
      statuses: [
        { name: 'To Do', cat: 'todo' },
        { name: 'In Progress', cat: 'doing' },
        { name: 'In Review', cat: 'doing' },
        { name: 'Done', cat: 'done' },
      ],
      trs: [
        { id: 't1', name: 'Start', from: ['To Do'], to: 'In Progress', cond: [{ k: 'assignee' }] },
        { id: 't2', name: 'Send for review', from: ['In Progress'], to: 'In Review', valid: [{ k: 'checklist' }] },
        { id: 't3', name: 'Back to work', from: ['In Review'], to: 'In Progress', screen: ['comment'], valid: [{ k: 'comment' }] },
        {
          id: 't4',
          name: 'Done',
          from: ['In Review'],
          to: 'Done',
          screen: ['resolution', 'actual'],
          cond: [{ k: 'planner' }],
          post: [{ k: 'notify', who: 'assignee' }],
        },
        { id: 't5', name: 'Stop', from: ['In Progress'], to: 'To Do' },
        {
          id: 't6',
          name: 'Reopen',
          from: ['Done'],
          to: 'To Do',
          screen: ['comment'],
          valid: [{ k: 'comment' }],
          post: [{ k: 'clearRes' }],
        },
      ],
    };
  },
  /* the whiteboard set: Task / Story / Bug, each with On hold, Rejected and Canceled reachable from any status */
  examples() {
    const side = [
      { name: 'On hold', cat: 'wait' },
      { name: 'Waiting approval', cat: 'wait' },
      { name: 'Feedback', cat: 'wait' },
      { name: 'Waiting access', cat: 'wait' },
      { name: 'Rejected', cat: 'done' },
      { name: 'Canceled', cat: 'done' },
    ];
    const any = start => [
      { id: 'hold', name: 'Put on hold', from: ['*'], to: 'On hold', screen: ['comment'], valid: [{ k: 'comment' }] },
      { id: 'appr', name: 'Wait for approval', from: ['*'], to: 'Waiting approval' },
      { id: 'fb', name: 'Wait for feedback', from: ['*'], to: 'Feedback' },
      { id: 'acc', name: 'Wait for access', from: ['*'], to: 'Waiting access' },
      {
        id: 'rej',
        name: 'Reject',
        from: ['*'],
        to: 'Rejected',
        screen: ['comment'],
        valid: [{ k: 'comment' }],
        cond: [{ k: 'planner' }],
        post: [
          { k: 'resolution', value: 'Rejected' },
          { k: 'notify', who: 'assignee' },
        ],
      },
      {
        id: 'can',
        name: 'Cancel',
        from: ['*'],
        to: 'Canceled',
        screen: ['comment'],
        cond: [{ k: 'planner' }],
        post: [{ k: 'resolution', value: 'Canceled' }],
      },
      {
        id: 'back',
        name: 'Back to ' + start,
        from: ['On hold', 'Waiting approval', 'Feedback', 'Waiting access', 'Rejected', 'Canceled'],
        to: start,
        post: [{ k: 'clearRes' }],
      },
    ];
    const mk = (name, main, moves) => ({
      id: U.uid('tf'),
      name,
      start: main[0].name,
      statuses: main.concat(side),
      trs: moves.concat(any(main[0].name)),
    });
    return [
      mk(
        'Task',
        [
          { name: 'New', cat: 'todo' },
          { name: 'To Do', cat: 'todo' },
          { name: 'In Progress', cat: 'doing' },
          { name: 'Completed', cat: 'done' },
        ],
        [
          { id: 'a1', name: 'Plan', from: ['New'], to: 'To Do' },
          { id: 'a2', name: 'Start', from: ['To Do'], to: 'In Progress', cond: [{ k: 'assignee' }] },
          { id: 'a3', name: 'Complete', from: ['In Progress'], to: 'Completed', screen: ['actual'], valid: [{ k: 'checklist' }] },
          {
            id: 'a4',
            name: 'Reopen',
            from: ['Completed'],
            to: 'To Do',
            screen: ['comment'],
            valid: [{ k: 'comment' }],
            post: [{ k: 'clearRes' }],
          },
        ]
      ),
      mk(
        'Story',
        [
          { name: 'New', cat: 'todo' },
          { name: 'Analysis', cat: 'doing' },
          { name: 'In Testing', cat: 'doing' },
          { name: 'Completed', cat: 'done' },
        ],
        [
          { id: 'b1', name: 'Analyse', from: ['New'], to: 'Analysis' },
          { id: 'b2', name: 'Send to testing', from: ['Analysis'], to: 'In Testing' },
          { id: 'b3', name: 'Back to analysis', from: ['In Testing'], to: 'Analysis', screen: ['comment'], valid: [{ k: 'comment' }] },
          {
            id: 'b4',
            name: 'Complete',
            from: ['In Testing'],
            to: 'Completed',
            screen: ['actual'],
            cond: [{ k: 'planner' }],
            post: [{ k: 'notify', who: 'assignee' }],
          },
          {
            id: 'b5',
            name: 'Reopen',
            from: ['Completed'],
            to: 'Analysis',
            screen: ['comment'],
            valid: [{ k: 'comment' }],
            post: [{ k: 'clearRes' }],
          },
        ]
      ),
      mk(
        'Bug',
        [
          { name: 'New', cat: 'todo' },
          { name: 'Troubleshooting', cat: 'doing' },
          { name: 'Waiting', cat: 'wait' },
          { name: 'UAT', cat: 'doing' },
          { name: 'Completed', cat: 'done' },
          { name: 'Done – next deployment', cat: 'done' },
          { name: 'Deployed', cat: 'done' },
        ],
        [
          { id: 'c1', name: 'Troubleshoot', from: ['New'], to: 'Troubleshooting' },
          { id: 'c2', name: 'Wait', from: ['Troubleshooting'], to: 'Waiting', screen: ['comment'] },
          { id: 'c3', name: 'Resume', from: ['Waiting'], to: 'Troubleshooting' },
          { id: 'c4', name: 'Send to UAT', from: ['Troubleshooting', 'Waiting'], to: 'UAT' },
          { id: 'c5', name: 'Failed UAT', from: ['UAT'], to: 'Troubleshooting', screen: ['comment'], valid: [{ k: 'comment' }] },
          { id: 'c6', name: 'Complete', from: ['UAT', 'New'], to: 'Completed', post: [{ k: 'notify', who: 'reporter' }] },
          { id: 'c7', name: 'Next deployment', from: ['UAT'], to: 'Done – next deployment' },
          { id: 'c8', name: 'Deployed', from: ['Done – next deployment'], to: 'Deployed', post: [{ k: 'notify', who: 'reporter' }] },
          {
            id: 'c9',
            name: 'Reopen',
            from: ['Completed', 'Deployed'],
            to: 'Troubleshooting',
            screen: ['comment'],
            valid: [{ k: 'comment' }],
            post: [{ k: 'clearRes' }],
          },
        ]
      ),
    ];
  },
  /* which workflow a project uses: the project's choice → its team's default → the department default → board columns */
  _cache: null,
  /* the project's choice → the team's workflow for that task type → the team default → the department default → board columns */
  of(p, type) {
    if (!TaskFlow._cache || TaskFlow._cache.ver !== Store.ver) TaskFlow._cache = { ver: Store.ver, m: new Map() };
    const team = p ? Scrum.teamOf(p) : App.viewTeam || 'apps';
    const tr = TaskFlow.teamRec(team),
      d = TaskFlow.dept();
    const pick = p ? (tr.projects || {})[p.id] || '' : '';
    const ty = (tr.types || {})[type || 'Task'] || '';
    const key = team + '|' + pick + '|' + ty;
    if (TaskFlow._cache.m.has(key)) return TaskFlow._cache.m.get(key);
    const w = TaskFlow.norm(
      TaskFlow.find(team, pick) ||
        TaskFlow.find(team, ty) ||
        TaskFlow.find(team, tr.use) ||
        TaskFlow.find(team, d.use) ||
        TaskFlow.seed(team)
    );
    TaskFlow._cache.m.set(key, w);
    return w;
  },
  forTask(t) {
    return TaskFlow.of(Scrum.proj(t && t.project), (t && t.type) || 'Task');
  },
  /* every workflow the project's tasks can follow (one per task type, de-duplicated) */
  allOf(p) {
    const seen = new Map();
    for (const ty of [
      ...new Set([
        ...(Store.lists(p ? Scrum.teamOf(p) : undefined).ptaskTypes || ['Task']),
        ...(p ? Scrum.items(p.id).map(t => t.type || 'Task') : []),
      ]),
    ]) {
      const w = TaskFlow.of(p, ty);
      if (!seen.has(w.id)) seen.set(w.id, w);
    }
    return [...seen.values()];
  },
  /* the board: one column per status (one workflow) or per category (several workflows, or asked for) */
  board(p) {
    const ws = TaskFlow.allOf(p);
    if (ws.length === 1 && !ws[0].boardCats) return { byCat: false, cols: ws[0].statuses.map(s => s.name) };
    const used = new Set(ws.flatMap(w => w.statuses.map(s => s.cat || 'todo')));
    return {
      byCat: true,
      cols: TaskFlow.CATS.filter(([k]) => used.has(k)).map(([k, l]) => l),
      keys: TaskFlow.CATS.filter(([k]) => used.has(k)).map(([k]) => k),
    };
  },
  norm(w) {
    const st = (w.statuses || []).filter(s => s && s.name);
    if (!st.length) return TaskFlow.seed();
    const names = st.map(s => s.name);
    return Object.assign({}, w, {
      statuses: st,
      start: names.includes(w.start) ? w.start : names[0],
      trs: (w.trs || []).filter(t => t && names.includes(t.to)),
    });
  },
  names(p, type) {
    return TaskFlow.of(p, type).statuses.map(s => s.name);
  },
  statusOf(t, name) {
    return TaskFlow.forTask(t).statuses.find(s => s.name === name);
  },
  /* category of a task's status (a status no longer in the workflow: old "Done" → done, else To Do) */
  cat(t) {
    if (!t) return 'todo';
    const s = TaskFlow.statusOf(t, t.status);
    return s ? s.cat || 'todo' : t.status === 'Done' ? 'done' : 'todo';
  },
  color(t, name) {
    const s = TaskFlow.statusOf(t, name == null ? t.status : name);
    return (s && s.color) || TaskFlow.CAT_COLOR[(s && s.cat) || 'todo'];
  },

  /* ---------- the engine ---------- */
  /* rules → reasons it fails ('' = ok). who = person id (default me) */
  condFail(c, t, who) {
    const p = Scrum.proj(t.project);
    const m = Store.member(who) || {};
    switch (c.k) {
      case 'assignee':
        return t.assignee && (t.assignee === who || (who === App.me && App.forMe(t.assignee))) ? '' : 'only the person assigned';
      case 'planner':
        return who === App.me
          ? Scrum.planner(p)
            ? ''
            : 'only the project owner / team manager'
          : p && (p.manager === who || Scrum.teamManagerOf(p) === who)
            ? ''
            : 'only the project owner / team manager';
      case 'roles':
        return (c.roles || []).includes(m.role || 'analyst') || ((c.roles || []).includes('admin') && (m.superAdmin || m.admin))
          ? ''
          : 'only ' + (c.roles || []).map(r => (Config.ROLES.find(x => x[0] === r) || [r, r])[1]).join(' / ');
      case 'people':
        return (c.ids || []).includes(who) ? '' : 'only ' + (c.ids || []).map(id => Store.memberShort(id)).join(', ');
      case 'subsDone': {
        const open = PM2.subtasks(t).filter(x => !Scrum.isDone(x));
        return open.length ? `${open.length} subtask(s) still open` : '';
      }
      case 'stage':
        return p && (c.stages || []).includes(p.status) ? '' : 'the project must be in ' + (c.stages || []).join(' / ');
    }
    return '';
  },
  validFail(v, t, form) {
    const val = k => (form && form[k] != null && form[k] !== '' ? form[k] : t[k]);
    switch (v.k) {
      case 'field': {
        const x = val(v.field);
        return x == null || x === '' || (v.field === 'points' && !(+x > 0))
          ? `fill in ${(TaskFlow.FIELDS.find(f => f[0] === v.field) || [v.field, v.field])[1]}`
          : '';
      }
      case 'comment':
        return form && String(form.comment || '').trim() ? '' : 'write a comment';
      case 'checklist': {
        const l = PM2.checklist(t);
        return l.some(x => !x.done) ? `tick the checklist (${l.filter(x => x.done).length}/${l.length})` : '';
      }
      case 'blockers': {
        const b = t.after && Store.get(t.after);
        return b && !Scrum.isDone(b) ? `${ptKey(b)} must be done first` : '';
      }
    }
    return '';
  },
  /* the moves from where the task is now: [{ tr, ok, why: [...] }] — conditions decide if it is offered, validators are checked when it runs */
  moves(t, who) {
    who = who || App.me;
    const w = TaskFlow.forTask(t);
    const out = [];
    for (const tr of w.trs) {
      if (tr.to === t.status) continue;
      const from = tr.from || ['*'];
      if (!from.includes('*') && !from.includes(t.status)) {
        if (!w.statuses.some(s => s.name === t.status) && from.includes(w.start)) {
          /* a status no longer in the workflow counts as the start */
        } else continue;
      }
      const why = (tr.cond || []).map(c => TaskFlow.condFail(c, t, who)).filter(Boolean);
      out.push({ tr, ok: !why.length, why });
    }
    return out;
  },
  /* a direct move to a status (board drag / the status field): the transitions that reach it */
  movesTo(t, to, who) {
    return TaskFlow.moves(t, who).filter(m => m.tr.to === to);
  },
  /* can it run with this form? → list of what is missing */
  check(t, tr, form, who) {
    who = who || App.me;
    const out = (tr.cond || []).map(c => TaskFlow.condFail(c, t, who)).filter(Boolean);
    for (const v of tr.valid || []) {
      const x = TaskFlow.validFail(v, t, form);
      if (x) out.push(x);
    }
    if ((tr.screen || []).includes('resolution') && TaskFlow.catOf(t, tr.to) === 'done' && !(form && form.resolution) && !t.resolution) {
      /* resolution falls back to the first one */
    }
    return out;
  },
  catOf(t, name) {
    const s = TaskFlow.statusOf(t, name);
    return s ? s.cat || 'todo' : 'todo';
  },
  /* the new record + the side records (comment, notices) */
  apply(t, tr, form, who) {
    who = who || App.me;
    form = form || {};
    const p = Scrum.proj(t.project);
    const r = Object.assign({}, t, { status: tr.to });
    for (const k of ['assignee', 'due', 'points', 'actual', 'resolution'])
      if ((tr.screen || []).includes(k) && form[k] != null && form[k] !== '') r[k] = k === 'points' ? +form[k] : form[k];
    const side = [];
    const tell = new Set();
    for (const a of tr.post || []) {
      if (a.k === 'resolution') r.resolution = a.value || TaskFlow.resolutions()[0];
      else if (a.k === 'clearRes') r.resolution = '';
      else if (a.k === 'assign') {
        const to =
          a.who === 'reporter'
            ? t.reporter || t._by
            : a.who === 'owner'
              ? p && p.manager
              : a.who === 'me'
                ? who
                : a.who === 'none'
                  ? ''
                  : a.who;
        if (to !== undefined) r.assignee = to || '';
      } else if (a.k === 'set' && a.field) r[a.field] = a.value === '@today' ? U.todayStr() : a.value === '@me' ? who : a.value || '';
      else if (a.k === 'notify') {
        const to =
          a.who === 'assignee' ? r.assignee : a.who === 'reporter' ? t.reporter || t._by : a.who === 'owner' ? p && p.manager : a.who;
        if (to && to !== who) tell.add(to);
      }
    }
    const done = TaskFlow.catOf(t, tr.to) === 'done',
      wasDone = Scrum.isDone(t);
    if (done && !r.resolution) r.resolution = form.resolution || TaskFlow.resolutions()[0];
    if (!done && wasDone && !(tr.post || []).some(a => a.k === 'resolution')) r.resolution = '';
    const text = String(form.comment || '').trim();
    r.hist = [
      ...(t.hist || []),
      { at: Date.now(), by: who, from: t.status || '', to: tr.to, tr: tr.name || tr.to, note: text.slice(0, 200) },
    ].slice(-60);
    if (text)
      side.push({
        id: U.uid('pcm'),
        c: 'pcomment',
        project: t.project,
        task: t.id,
        team: p ? p.team : '',
        text: `[${tr.name || tr.to}] ${text}`,
        at: Date.now(),
      });
    for (const to of tell)
      side.push({
        id: U.uid('nudge'),
        c: 'nudge',
        to,
        from: who,
        about: t.id,
        kind: 'flow',
        text: `${ptKey(t)} “${t.title}”: ${tr.name || tr.to} → ${tr.to}`,
        at: Date.now(),
      });
    return { r, side };
  },
  /* run a transition: checks, one save, history, notices → '' or the reason it did not run */
  run(t, trId, form) {
    const m = TaskFlow.moves(t).find(x => x.tr.id === trId);
    if (!m) return 'That move is not allowed from ' + (t.status || 'here');
    if (!Scrum.canWork(t) && !(Scrum.member(Scrum.proj(t.project)) && !t.assignee)) return 'You can only move your own tasks';
    const miss = TaskFlow.check(t, m.tr, form);
    if (miss.length) return 'First ' + miss.join(', ');
    const { r, side } = TaskFlow.apply(t, m.tr, form);
    TaskFlow._running = true;
    try {
      Schemas.ptask.beforeSave(r, t);
    } finally {
      TaskFlow._running = false;
    }
    Store.saveMany([r, ...side]);
    return '';
  },
  /* a status change made some other way (the form) — is it a legal move? → '' or the reason */
  legal(before, after, form) {
    if (!before || !before.id || before.status === after.status) return '';
    const ms = TaskFlow.movesTo(before, after.status);
    if (!ms.length) return `“${before.status}” → “${after.status}” is not an allowed move in this workflow`;
    const ok = ms.find(m => m.ok && !TaskFlow.check(before, m.tr, form).length);
    if (ok) return '';
    const m = ms[0];
    return `${m.tr.name || after.status}: ` + (m.why.length ? m.why : TaskFlow.check(before, m.tr, form)).join(', ');
  },
  /* existing tasks whose status is not in the workflow → where they go (by category of the old board column) */
  mapping(p, wOf) {
    const out = [];
    for (const t of Scrum.items(p.id)) {
      const w = TaskFlow.norm(typeof wOf === 'function' ? wOf(t) : wOf || TaskFlow.forTask(t));
      const names = w.statuses.map(s => s.name);
      if (names.includes(t.status)) continue;
      const c = TaskFlow.cat(t);
      const same = names.find(n => U.lc(n) === U.lc(t.status || ''));
      const first = (w.statuses.find(x => x.cat === c) || {}).name;
      out.push({ t, w, to: same || first || (c === 'done' ? names[names.length - 1] : w.start) });
    }
    return out;
  },
};

/* ---------- Scrum reads the workflow: columns = statuses, done = the Done category ---------- */
Scrum.columns = p => TaskFlow.board(p).cols;
Scrum.doneCol = p => {
  const b = TaskFlow.board(p);
  if (b.byCat) return b.cols[b.cols.length - 1];
  const w = TaskFlow.of(p);
  const d = w.statuses.filter(s => s.cat === 'done');
  return (d[0] || w.statuses[w.statuses.length - 1]).name;
};
Scrum.startOf = (p, type) => TaskFlow.of(p, type).start;
Scrum.isDone = t => !!t && TaskFlow.cat(t) === 'done';
Scrum.colIndex = t => {
  const p = Scrum.proj(t.project);
  const b = TaskFlow.board(p);
  const k = TaskFlow.cat(t);
  if (b.byCat) {
    const i = b.keys.indexOf(k);
    return i >= 0 ? i : 0;
  }
  const i = b.cols.indexOf(t.status);
  if (i >= 0) return i;
  const w = TaskFlow.forTask(t);
  const j = w.statuses.findIndex(s => s.cat === k);
  return j >= 0 ? j : 0;
};

/* ---------- the task form: new tasks start at the workflow's start; the status list shows only allowed moves ---------- */
(function wireTaskForm() {
  const S = Schemas.ptask;
  if (!S) return;
  const d0 = S.defaults;
  S.defaults = () => Object.assign(d0(), { status: TaskFlow.of(Scrum.proj(UI._recProject), 'Task').start });
  const st = S.fields.find(f => f.key === 'status');
  if (st)
    st.options = () => {
      const p = Scrum.proj(UI._recProject);
      const b = UI._recBase;
      const names = b && b.id ? TaskFlow.forTask(b).statuses.map(s => s.name) : [];
      if (!b || !b.id) return [...new Set(TaskFlow.allOf(p).map(w => w.start))];
      const ok = new Set(
        TaskFlow.moves(b)
          .filter(m => m.ok)
          .map(m => m.tr.to)
      );
      return [b.status, ...names.filter(n => n !== b.status && ok.has(n))];
    };
  const ix = S.fields.findIndex(f => f.key === 'status');
  S.fields.splice(ix + 1, 0, {
    key: 'resolution',
    label: 'Resolution',
    type: 'select',
    options: () => TaskFlow.resolutions(),
    blank: '—',
    showIf: r => !!r && (Scrum.isDone(r) || !!r.resolution),
  });
  const bs = S.beforeSave;
  S.beforeSave = function (r, before) {
    bs.call(this, r, before);
    if (!before || !before.id) {
      r.reporter = r.reporter || App.me;
      const w = TaskFlow.forTask(r);
      if (!r.status || !w.statuses.some(s => s.name === r.status)) r.status = w.start;
    }
    if (before && before.id && (before.type || 'Task') !== (r.type || 'Task')) {
      const w = TaskFlow.forTask(r);
      if (!w.statuses.some(x => x.name === r.status)) {
        const c = TaskFlow.cat(before);
        r.status = (w.statuses.find(x => U.lc(x.name) === U.lc(r.status)) || w.statuses.find(x => x.cat === c) || { name: w.start }).name;
        r.hist = [...(before.hist || []), { at: Date.now(), by: App.me, from: before.status, to: r.status, tr: 'Type changed' }].slice(-60);
      }
      S._last = null;
      return;
    }
    if (TaskFlow._running || !before || !before.id || before.status === r.status) {
      S._last = null;
      return;
    }
    S._last = before; // the form changed the status: validate() below checks it is a legal move, then records it
    const ms = TaskFlow.movesTo(before, r.status).filter(m => m.ok);
    const tr = ms[0] && ms[0].tr;
    if (tr) {
      const { r: x } = TaskFlow.apply(before, tr, { comment: r.comment, resolution: r.resolution });
      for (const k of ['resolution', 'hist', 'assignee']) if (k !== 'assignee' || (tr.post || []).some(a => a.k === 'assign')) r[k] = x[k];
      if (!Scrum.isDone(r) && !r.resolution) r.resolution = '';
    }
  };
  const v0 = S.validate;
  S.validate = out => {
    const b = S._last;
    S._last = null;
    const x = b ? TaskFlow.legal(b, out, { comment: out.comment, resolution: out.resolution }) : '';
    return x || (v0 ? v0(out) : '');
  };
})();
