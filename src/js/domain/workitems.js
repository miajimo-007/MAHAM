/* MAHAM — Work items like Jira: epics, project keys (BC-101), the task types a project allows, custom fields
 * per team and type, requests from other teams (intake), automation rules, and per-project permissions.
 *
 * Settings:
 *   settings-taskfields-<team>  { list: [{ key: 'cf_…', label, kind: text|number|date|select|bool|textarea, options: [], types: [], req: [] }] }
 *   settings-taskflow-<team>    .autos = [{ id, name, on: 'created'|'status'|'overdue'|'epicDone', status, type, priority, do: [then-actions] }]
 * Project fields: key, types (allowed), intake (accepts requests), view (team|members|dept), addBy (members|team|all), moveBy (planners|members). */
'use strict';

const Work = {
  KINDS: [
    ['text', 'Text'],
    ['textarea', 'Long text'],
    ['number', 'Number'],
    ['date', 'Date'],
    ['select', 'Pick from a list'],
    ['bool', 'Yes / No'],
  ],
  VIEW: [
    ['team', 'Its team (default)'],
    ['members', 'Only the people on it'],
    ['dept', 'The whole department'],
  ],
  ADD: [
    ['members', 'Owner and members (default)'],
    ['team', 'Anyone in its team'],
    ['all', 'Anyone who can see it'],
  ],
  MOVE: [
    ['planners', 'Owner / manager move any task, others their own (default)'],
    ['members', 'Every member can move any task'],
  ],

  /* ---------- keys and types ---------- */
  key(t) {
    const p = t && Store.get(t.project);
    const k =
      p &&
      String(p.key || '')
        .trim()
        .toUpperCase();
    return k ? `${k}-${t.n || ''}` : '#' + ((t && t.n) || '');
  },
  teamTypes(team) {
    const l = (Store.lists(team).ptaskTypes || ['Story', 'Task', 'Bug']).filter(Boolean);
    return l.includes('Epic') ? l : ['Epic', ...l];
  },
  typesFor(p) {
    const all = Work.teamTypes(p ? Scrum.teamOf(p) : undefined);
    const own = (p && Array.isArray(p.types) ? p.types : []).filter(Boolean);
    return own.length ? all.filter(x => own.includes(x)).concat(own.filter(x => !all.includes(x))) : all;
  },

  /* ---------- epics ---------- */
  isEpic(t) {
    return !!t && t.type === 'Epic';
  },
  epics(pid) {
    return Scrum.items(pid)
      .filter(Work.isEpic)
      .sort((a, b) => (a.n || 0) - (b.n || 0));
  },
  children(e) {
    return e ? Scrum.items(e.project).filter(x => x.epic === e.id) : [];
  },
  epicProgress(e) {
    const ch = Work.children(e).filter(x => x.status !== 'Canceled');
    const pts = Scrum.pts(ch);
    const done = ch.filter(x => Scrum.isDone(x));
    return {
      n: ch.length,
      done: done.length,
      pts,
      donePts: Scrum.pts(done),
      pct: ch.length ? Math.round(100 * (pts ? Scrum.pts(done) / pts : done.length / ch.length)) : 0,
    };
  },

  /* ---------- custom fields ---------- */
  customRec(team) {
    return Store.get('settings-taskfields-' + (team || 'apps')) || {};
  },
  custom(team) {
    return (Work.customRec(team).list || []).filter(f => f && f.key && f.label);
  },
  allCustom() {
    const seen = new Map();
    for (const t of Store.teams()) for (const f of Work.custom(t.id)) if (!seen.has(f.key)) seen.set(f.key, f);
    return [...seen.values()];
  },
  def(key, team) {
    return Work.custom(team).find(f => f.key === key) || Work.allCustom().find(f => f.key === key);
  },
  appliesTo(f, type) {
    return !(f.types || []).length || (f.types || []).includes(type || 'Task');
  },
  required(f, type) {
    return (f.req || []).includes(type || 'Task');
  },
  /* a form field for the record forms / move screens */
  ui(f, opts) {
    const base = {
      key: f.key,
      label: f.label,
      type: f.kind === 'textarea' ? 'textarea' : f.kind || 'text',
      span: f.kind === 'textarea' ? 2 : undefined,
      rows: 2,
    };
    if (f.kind === 'select') {
      base.options = f.options || [];
      base.blank = '—';
    }
    if (f.kind === 'bool') base.checkLabel = 'Yes';
    return Object.assign(base, opts || {});
  },
  fmt(f, v) {
    if (v == null || v === '') return '';
    if (f.kind === 'bool') return v ? 'Yes' : 'No';
    if (f.kind === 'date') return U.fmtDate(v);
    return String(v);
  },

  /* ---------- permissions per project ---------- */
  isPlannerish(p) {
    return Scrum.planner(p);
  },
  /* may I add work items here? (beyond owner / members) */
  canAdd(p) {
    if (!p) return false;
    if (Scrum.planner(p) || Scrum.member(p)) return true;
    if (p.addBy === 'all') return Scrum.canSee(p);
    if (p.addBy === 'team')
      return App.myTeams().some(t => t.id === Scrum.teamOf(p)) || (Store.member(App.me) || {}).team === Scrum.teamOf(p);
    return false;
  },

  /* ---------- requests from other teams ---------- */
  intakeProjects() {
    return Store.all('project', '*')
      .filter(p => p.intake && !['Done', 'Canceled'].includes(p.status))
      .sort((a, b) => String(a.name).localeCompare(b.name));
  },
  myRequests() {
    return Store.all('ptask', '*')
      .filter(t => t.intake && t.reporter === App.me)
      .sort((a, b) => (b.createdOn || '').localeCompare(a.createdOn || ''));
  },
  submit(p, f) {
    const type = Work.typesFor(p).includes(f.type) ? f.type : Work.typesFor(p).filter(x => x !== 'Epic')[0] || 'Task';
    const r = {
      id: U.uid('pt'),
      c: 'ptask',
      project: p.id,
      team: p.team,
      title: String(f.title || '').trim(),
      description: String(f.description || '').trim(),
      type,
      priority: f.priority || 'Normal',
      points: 1,
      reporter: App.me,
      requester: String(f.requester || '').trim(),
      intake: true,
      createdOn: U.todayStr(),
      status: TaskFlow.of(p, type).start,
      n: Scrum.items(p.id).reduce((a, t) => Math.max(a, t.n || 0), 0) + 1,
      assignee: '',
      sprint: '',
    };
    for (const c of Work.custom(Scrum.teamOf(p))) if (f[c.key] != null && f[c.key] !== '') r[c.key] = f[c.key];
    r.hist = [{ at: Date.now(), by: App.me, from: '', to: r.status, tr: 'Request submitted' }];
    const side = Work.runAutos({ on: 'created' }, null, r);
    const tell = [p.manager, Scrum.teamManagerOf(p)]
      .filter((x, i, a) => x && x !== App.me && a.indexOf(x) === i)
      .map(to => ({
        id: U.uid('nudge'),
        c: 'nudge',
        to,
        from: App.me,
        about: r.id,
        kind: 'flow',
        text: `New request in ${p.name}: ${Work.key(r)} “${r.title}”${r.requester ? ' (from ' + r.requester + ')' : ''}`,
        at: Date.now(),
      }));
    Store.saveMany([r, ...side, ...tell]);
    return r;
  },

  /* ---------- automation ---------- */
  autos(team) {
    return (TaskFlow.teamRec(team).autos || []).filter(a => a && a.on && (a.do || []).length && a.off !== true);
  },
  matches(a, r) {
    return (!a.type || a.type === (r.type || 'Task')) && (!a.priority || a.priority === (r.priority || 'Normal'));
  },
  /* events: { on: 'created' } · { on: 'status', status } · { on: 'overdue' } · { on: 'epicDone' }; mutates r, returns side records */
  runAutos(ev, before, r, me) {
    me = me || App.me;
    const p = Scrum.proj(r.project);
    if (!p) return [];
    const side = [];
    const tell = new Set();
    for (const a of Work.autos(Scrum.teamOf(p))) {
      if (a.on !== ev.on || (a.on === 'status' && a.status && a.status !== ev.status) || !Work.matches(a, r)) continue;
      for (const x of a.do || []) TaskFlow.doPost(x, r, before || r, p, ev.on === 'overdue' ? '' : me, tell); // overdue: nobody "made" it, so the owner may be told even on their own PC
      r.autoLog = [...(r.autoLog || []), { id: a.id, at: Date.now(), name: a.name || '' }].slice(-20);
      for (const to of tell)
        side.push({
          id: U.uid('nudge'),
          c: 'nudge',
          to,
          from: me,
          about: r.id,
          kind: 'flow',
          text: `${Work.key(r)} “${r.title}”: ${a.name || 'automation'}`,
          at: Date.now(),
        });
      tell.clear();
    }
    return side;
  },
  _sideQ: [],
  queue(side) {
    if (!side.length) return;
    Work._sideQ.push(...side);
    clearTimeout(Work._sideT);
    Work._sideT = setTimeout(() => {
      const l = Work._sideQ.splice(0);
      if (l.length) Store.saveMany(l);
    }, 0);
  },
  /* overdue (and epic) rules are checked when the owner / manager opens their pages — each fires once per due date */
  sweep() {
    if (Work._swept && Date.now() - Work._swept < 60000) return;
    Work._swept = Date.now();
    const today = U.todayStr();
    const recs = [];
    const side = [];
    for (const p of Store.all('project').filter(x => !['Done', 'Canceled'].includes(x.status) && Scrum.planner(x))) {
      if (!Work.autos(Scrum.teamOf(p)).some(a => a.on === 'overdue')) continue;
      for (const t of Scrum.items(p.id)) {
        if (Scrum.isDone(t) || !t.due || t.due >= today || (t.fired || {}).overdue === t.due) continue;
        const r = Object.assign({}, t, { fired: Object.assign({}, t.fired || {}, { overdue: t.due }) });
        side.push(...Work.runAutos({ on: 'overdue' }, t, r));
        recs.push(r);
      }
    }
    if (recs.length) Store.saveMany([...recs, ...side]);
  },
};

/* ---------- wiring: keys, types, epics, custom fields, automation on save, permissions ---------- */
(function wire() {
  const S = Schemas.ptask;
  // the type list: what this project allows (+ Epic)
  const ty = S.fields.find(f => f.key === 'type');
  if (ty) ty.options = () => Work.typesFor(Scrum.proj(UI._recProject));
  // epic link
  const ix = S.fields.findIndex(f => f.key === 'parent');
  S.fields.splice(ix, 0, {
    mgr: true,
    key: 'epic',
    label: 'Epic',
    type: 'select',
    options: () =>
      Work.epics(UI._recProject)
        .filter(e => e.id !== (UI._recBase || {}).id)
        .map(e => [e.id, Work.key(e) + ' · ' + e.title]),
    blank: '— no epic —',
    showIf: r => !Work.isEpic(r) && Work.epics(r.project).length > 0,
  });
  S.fields.splice(ix, 0, {
    key: 'requester',
    label: 'Requested by (department / person)',
    type: 'text',
    showIf: r => !!r.intake || !!r.requester,
  });
  const base = S.fields.slice();
  // custom fields of the project's team, for this type
  const er = UI.editRecord;
  UI.editRecord = function (coll, rec, opts) {
    if (coll === 'ptask') {
      const p = Scrum.proj((rec && rec.project) || UI._recProject);
      const team = p ? Scrum.teamOf(p) : App.viewTeam;
      const type = (rec && rec.type) || 'Task';
      S.fields = base.concat(
        Work.custom(team)
          .filter(f => Work.appliesTo(f, type) || (rec && rec[f.key] != null && rec[f.key] !== ''))
          .map(f => Work.ui(f, { required: Work.required(f, type) }))
      );
    }
    return er.apply(this, arguments);
  };
  const v0 = S.validate;
  S.validate = out => {
    const p = Scrum.proj(out.project);
    const team = p ? Scrum.teamOf(p) : App.viewTeam;
    const miss = Work.custom(team).filter(
      f => Work.required(f, out.type) && (out[f.key] == null || out[f.key] === '' || out[f.key] === false)
    );
    if (miss.length) return 'Fill in ' + miss.map(f => f.label).join(', ');
    if (p && Array.isArray(p.types) && p.types.length && out.type && !Work.typesFor(p).includes(out.type))
      return `${p.name} does not take ${out.type} items`;
    if (out.epic && out.epic === out.id) return 'An epic cannot be inside itself';
    return v0 ? v0(out) : '';
  };
  // automation: created / reached a status / epic done
  const bs = S.beforeSave;
  S.beforeSave = function (r, before) {
    bs.call(this, r, before);
    if (Work.isEpic(r)) r.epic = '';
    if (Work._noAuto) return;
    const side = [];
    if (!before || !before.id) {
      if (!r.id) r.id = U.uid(r.c || 'ptask');
      side.push(...Work.runAutos({ on: 'created' }, null, r));
    } else if (before.status !== r.status) side.push(...Work.runAutos({ on: 'status', status: r.status }, before, r));
    if (r.epic && Scrum.isDone(r) && !(before && Scrum.isDone(before))) {
      const e = Store.get(r.epic);
      if (
        e &&
        !Scrum.isDone(e) &&
        Work.children(e)
          .filter(x => x.id !== r.id)
          .every(x => Scrum.isDone(x))
      ) {
        const er2 = Object.assign({}, e);
        const s2 = Work.runAutos({ on: 'epicDone' }, e, er2);
        if (s2.length || JSON.stringify(er2) !== JSON.stringify(e)) side.push(er2, ...s2);
      }
    }
    Work.queue(side);
  };
  // permissions
  const cs = Scrum.canSee;
  Scrum.canSee = p => {
    if (!p) return false;
    if (p.view === 'members') return App.isSuper() || Scrum.planner(p) || Scrum.onProject(p);
    if (p.view === 'dept') return true;
    return cs(p);
  };
  const cw = Scrum.canWork;
  Scrum.canWork = it => cw(it) || ((Scrum.proj(it.project) || {}).moveBy === 'members' && Scrum.onProject(Scrum.proj(it.project)));
  // the project form: key, allowed types, requests, who can see / add / move
  const PS = Schemas.project;
  const at = PS.fields.findIndex(f => f.key === 'mode');
  PS.fields.splice(
    at,
    0,
    { dir: true, key: 'key', label: 'Key (e.g. BC → BC-101)', type: 'text', placeholder: 'BC' },
    {
      dir: true,
      key: 'types',
      label: 'Work item types it takes',
      type: 'checks',
      options: () => Work.teamTypes(UI._recBase && UI._recBase.team),
      hint: "none ticked = all of the team's types",
      span: 2,
    },
    { dir: true, key: 'intake', label: 'Requests', type: 'bool', checkLabel: 'Other teams can submit requests to it' },
    { dir: true, key: 'view', label: 'Who can see it', type: 'select', options: Work.VIEW, blank: false },
    { dir: true, key: 'addBy', label: 'Who can add work', type: 'select', options: Work.ADD, blank: false },
    { dir: true, key: 'moveBy', label: 'Who can move tasks', type: 'select', options: Work.MOVE, blank: false }
  );
  const pb = PS.beforeSave;
  PS.beforeSave = function (r, b) {
    pb.call(this, r, b);
    r.key = String(r.key || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8);
  };
})();
