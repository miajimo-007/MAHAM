/* MAHAM — Record types: director task, project, sprint, project task. */
'use strict';

/* project task form: Scrum projects show points and sprint up front; a project with no sprints has no Sprint box */
const PTF = {
  proj: r => Scrum.proj((r && r.project) || UI._recProject),
  scrum: r => {
    const p = PTF.proj(r);
    return !!p && PM.mode(p) === 'scrum';
  },
  sprints: r => {
    const p = PTF.proj(r);
    return !p || PM.mode(p) === 'scrum' || Scrum.sprints(p.id).length > 0 || !!(r && r.sprint);
  },
};

Object.assign(Schemas, {
  mgrtask: {
    single: 'Task for manager',
    dirCreate: true,
    dirDelete: true,
    formExtra: r => `<h4 style="margin:12px 0 4px">Who is working on it</h4>${chainView(r)}`,
    cascade: (r, before, deleting) => Chain.cascade(r, before, deleting),
    defaults: () => ({ date: U.todayStr(), urgency: 'Normal', status: 'Open', manager: App.isDir() || App.isSuper() ? '' : App.me }),
    fields: [
      { dir: true, key: 'task', label: 'Task', type: 'textarea', required: true, span: 2, rows: 2 },
      {
        dir: true,
        key: 'manager',
        label: 'Assigned to',
        type: 'select',
        required: true,
        options: () =>
          App.assignees().map(m => [m.id, `${UI.personName(m.id)} (${Store.topRole(m.role) ? Store.titleOf(m) : Store.teamName(m.team)})`]),
        blank: true,
      },
      { dir: true, key: 'urgency', label: 'Urgency', type: 'select', options: L('urgency'), blank: false, flag: true },
      { key: 'milestone', label: 'Milestone', type: 'bool', checkLabel: '⭐ Milestone', flag: true },
      { dir: true, key: 'date', label: 'Assigned date', type: 'date', required: true },
      { dir: true, key: 'due', label: 'Due date', type: 'date' },
      { dir: true, key: 'comment', label: 'Director instruction', type: 'textarea', span: 2, rows: 2 },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: () => UI.statusOpts(Object.values(Chain.ST)),
        blank: false,
        hint: 'Worked out from the analysts while they work; the manager closes it',
      },
      { key: 'update', label: 'Manager update', type: 'textarea', span: 2, rows: 2 },
    ],
    beforeSave(r) {
      const m = Store.member(r.manager);
      if (m) r.team = Store.topRole(m.role) ? '_top' : m.team || 'apps';
      if (r.status === 'Done' && !r.doneDate) r.doneDate = U.todayStr();
      if (r.status !== 'Done') r.doneDate = '';
    },
  },
  project: {
    single: 'Project',
    canCreate: () => Scrum.canCreate(),
    canDelete: r => Scrum.planner(r),
    fullEdit: r => !r.id || Scrum.planner(r),
    defaults: () => ({
      start: U.todayStr(),
      status: 'Not Started',
      priority: 'Normal',
      progress: 0,
      mode: 'kanban',
      team: (Scrum.teamOptions().find(t => t.id === App.viewTeam) || Scrum.teamOptions()[0] || {}).id || 'apps',
      manager: App.isDir() || App.isSuper() ? '' : App.me,
      members: [],
    }),
    fields: [
      { dir: true, key: 'name', label: 'Project name', type: 'text', required: true, span: 2 },
      {
        dir: true,
        key: 'team',
        label: 'Team',
        type: 'select',
        required: true,
        options: () => Scrum.teamOptions().map(t => [t.id, t.name]),
        blank: false,
      },
      { dir: true, key: 'manager', label: 'Owner', type: 'select', required: true, options: () => Scrum.ownerOptions(), blank: true },
      { dir: true, key: 'priority', label: 'Priority', type: 'select', options: ['High', 'Normal', 'Low'], blank: false },
      { key: 'category', label: 'Category', type: 'select', options: L('projectCategories'), blank: '— none —' },
      { dir: true, key: 'start', label: 'Start date', type: 'date' },
      { dir: true, key: 'due', label: 'Target date', type: 'date' },
      { dir: true, key: 'description', label: 'Description / scope', type: 'textarea', span: 2, rows: 2 },
      { dir: true, key: 'goal', label: 'Goal (why we do it)', type: 'textarea', span: 2, rows: 2 },
      { dir: true, key: 'outScope', label: 'Out of scope', type: 'textarea', span: 2, rows: 2 },
      { dir: true, key: 'success', label: 'Success criteria (how we know it worked)', type: 'textarea', span: 2, rows: 2 },
      {
        dir: true,
        key: 'sponsor',
        label: 'Sponsor',
        type: 'list',
        options: () =>
          Store.visible()
            .filter(m => m.active !== false)
            .map(m => Store.memberShort(m.id)),
        placeholder: 'pick or type a name',
      },
      {
        dir: true,
        key: 'mode',
        label: 'How the work is run',
        type: 'select',
        options: [
          ['kanban', 'Kanban — To do / Doing / Done (simple)'],
          ['scrum', 'Scrum — sprints with points'],
        ],
        blank: false,
      },
      {
        dir: true,
        key: 'workflow',
        label: 'Workflow',
        type: 'select',
        options: () => [
          ['', '— none (simple status) —'],
          ...Flow.list().map(w => [w.id, w.name + (w.team ? ' · ' + Store.teamName(w.team) : '')]),
        ],
        blank: false,
        showIf: r => Flow.list().length > 0 || !!r.workflow,
        hint: 'The stages the project moves through (Admin → Workflows). Moves are made on the project page.',
      },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: ['Not Started', 'In Progress', 'On Hold', 'Done', 'Canceled'],
        blank: false,
        showIf: r => !r.workflow,
      },
      {
        key: 'progress',
        label: 'Progress (%)',
        type: 'number',
        min: 0,
        step: 5,
        hint: 'Calculated from story points once the project has items',
      },
      { key: 'update', label: 'Latest update (manager)', type: 'textarea', span: 2, rows: 2 },
      { dir: true, key: 'directorComment', label: 'Director comment', type: 'textarea', span: 2, rows: 2 },
    ],
    beforeSave(r) {
      Flow.onSave(r, r.id ? Store.db.get(r.id) : null);
      if (!r.team || r.team === '_top') {
        const m = Store.member(r.manager);
        r.team = (m && !Store.topRole(m.role) && m.team) || App.viewTeam || 'apps';
      }
      r.progress = Math.max(0, Math.min(100, +r.progress || 0));
      if (r.status === 'Done') {
        r.progress = 100;
        if (!r.doneDate) r.doneDate = U.todayStr();
      } else r.doneDate = '';
      r.updatedOn = U.todayStr();
    },
  },
  sprint: {
    single: 'Sprint',
    canCreate: () => true,
    canDelete: r => Scrum.planner(Scrum.proj(r.project)),
    readOnly: r => !Scrum.planner(Scrum.proj(r.project)),
    defaults: () => ({ start: U.todayStr(), end: U.ds(new Date(Date.now() + 13 * 864e5)), status: 'Planned' }),
    fields: [
      { key: 'name', label: 'Sprint name', type: 'text', required: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'Active', 'Completed'], blank: false },
      { key: 'start', label: 'Start', type: 'date', required: true },
      { key: 'end', label: 'End', type: 'date', required: true },
      { key: 'goal', label: 'Sprint goal', type: 'textarea', span: 2, rows: 2 },
    ],
    beforeSave(r) {
      const p = Scrum.proj(r.project);
      if (p) r.team = p.team;
      if (!r.n) r.n = Scrum.sprints(r.project).length + 1;
    },
  },
  ptask: {
    single: 'Project task',
    canCreate: () => true,
    canDelete: r => Scrum.planner(Scrum.proj(r.project)),
    mgrOk: r => Scrum.planner(Scrum.proj(r.project)),
    readOnly: r => !!r.id && !Scrum.canWork(r) && !(Scrum.member(Scrum.proj(r.project)) && !r.assignee),
    defaults: () => ({ type: 'Task', status: Scrum.columns(Scrum.proj(UI._recProject))[0], priority: 'Normal', points: 1, sprint: '' }),
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, span: 2 },
      { mgr: true, key: 'type', label: 'Type', type: 'select', options: L('ptaskTypes'), blank: false },
      {
        mgr: true,
        key: 'priority',
        label: 'Priority',
        type: 'select',
        options: ['High', 'Medium', 'Normal', 'Low'],
        blank: false,
        flag: true,
      },
      { key: 'milestone', label: 'Milestone', type: 'bool', checkLabel: '⭐ Milestone', flag: true },
      {
        mgr: true,
        key: 'points',
        more: r => !PTF.scrum(r),
        label: 'Story points',
        type: 'select',
        options: () => Scrum.POINTS.map(String),
        blank: false,
      },
      {
        mgr: true,
        key: 'assignee',
        label: 'Assigned to',
        type: 'select',
        options: () => {
          const p = Scrum.proj(UI._recProject);
          return p ? Scrum.people(p).map(id => [id, UI.personName(id)]) : [];
        },
        blank: 'Unassigned',
      },
      {
        mgr: true,
        key: 'sprint',
        more: r => !PTF.scrum(r),
        showIf: r => PTF.sprints(r),
        label: 'Sprint',
        type: 'select',
        options: () =>
          Scrum.sprints(UI._recProject)
            .filter(s => s.status !== 'Completed')
            .map(s => [s.id, s.name + (s.status === 'Active' ? ' (active)' : '')]),
        blank: 'Backlog',
      },
      { mgr: true, key: 'start', more: true, label: 'Start date', type: 'date' },
      { mgr: true, key: 'due', label: 'Due date', type: 'date' },
      { mgr: true, key: 'est', more: true, label: 'Estimated hours', type: 'number', min: 0, step: 0.5 },
      { key: 'actual', more: true, label: 'Actual hours', type: 'number', min: 0, step: 0.5, hint: 'fill in when it is done' },
      {
        mgr: true,
        key: 'parent',
        more: true,
        label: 'Subtask of',
        type: 'select',
        options: () =>
          Scrum.items(UI._recProject)
            .filter(t => t.id !== (UI._recBase || {}).id && !t.parent)
            .map(t => [t.id, ptKey(t) + ' · ' + t.title]),
        blank: '— not a subtask —',
      },
      {
        mgr: true,
        key: 'after',
        more: true,
        label: 'Starts after (depends on)',
        type: 'select',
        options: () => Scrum.items(UI._recProject).map(t => [t.id, ptKey(t) + ' · ' + t.title]),
        blank: '— nothing —',
      },
      { key: 'status', label: 'Status', type: 'select', options: () => Scrum.columns(Scrum.proj(UI._recProject)), blank: false },
      { mgr: true, key: 'description', label: 'Description / acceptance criteria', type: 'textarea', span: 2, rows: 3 },
      { key: 'comment', label: 'Update / notes', type: 'textarea', span: 2, rows: 2 },
    ],
    onFormMount: (form, base) => PM2V.taskPanel(form, base),
    beforeSave(r, before) {
      const p = Scrum.proj(r.project);
      if (p) r.team = p.team;
      r.points = +r.points || 0;
      if (PM2V.draft && PM2V.draft.id === (before && before.id ? before.id : '') && document.querySelector('.ptx'))
        r.checklist = PM2V.draft.list.slice(); // the checklist edited in the open form
      if (r.parent === r.id) r.parent = '';
      if (!before || !before.id) r.createdOn = r.createdOn || U.todayStr();
      if (!r.startedOn && (Scrum.isDone(r) || Scrum.colIndex(r) > 0)) r.startedOn = U.todayStr();
      if (Scrum.isDone(r) && !r.doneDate) r.doneDate = U.todayStr();
      if (!Scrum.isDone(r)) r.doneDate = '';
      if (!r.n) r.n = Scrum.items(r.project).reduce((a, t) => Math.max(a, t.n || 0), 0) + 1;
    },
  },
  /* project management: phases & milestones, risks / issues / decisions / actions, weekly status updates */
  pphase: {
    single: 'Phase or milestone',
    canCreate: () => true,
    canDelete: r => Scrum.planner(Scrum.proj(r.project)),
    readOnly: r => !Scrum.planner(Scrum.proj(r.project)),
    defaults: () => ({ kind: 'phase', status: 'Planned' }),
    fields: [
      {
        key: 'kind',
        label: 'Kind',
        type: 'select',
        options: [
          ['phase', 'Phase (a stretch of time)'],
          ['milestone', '◆ Milestone (a date to reach)'],
        ],
        blank: false,
      },
      { key: 'name', label: 'Name', type: 'text', required: true, span: 2 },
      { key: 'start', label: 'Start', type: 'date', showIf: r => r.kind !== 'milestone' },
      { key: 'end', label: 'Planned end / date', type: 'date', required: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Planned', 'In progress', 'Done'], blank: false },
      { key: 'doneOn', label: 'Actually finished', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'textarea', span: 2, rows: 2 },
    ],
    beforeSave(r) {
      const p = Scrum.proj(r.project);
      if (p) r.team = p.team;
      if (r.status === 'Done' && !r.doneOn) r.doneOn = U.todayStr();
      if (r.kind === 'milestone') r.start = '';
    },
  },
  praid: {
    single: 'Risk / issue / decision',
    canCreate: () => true,
    canDelete: r => Scrum.planner(Scrum.proj(r.project)) || r.createdBy === App.me,
    readOnly: r => !!r.id && !(Scrum.planner(Scrum.proj(r.project)) || Scrum.member(Scrum.proj(r.project))),
    defaults: () => ({ kind: 'Risk', status: 'Open', impact: '2', likelihood: '2' }),
    fields: [
      { key: 'kind', label: 'Type', type: 'select', options: ['Risk', 'Issue', 'Decision', 'Action'], blank: false },
      { key: 'title', label: 'What', type: 'text', required: true, span: 2 },
      {
        key: 'impact',
        label: 'Impact',
        type: 'select',
        options: [
          ['1', '1 · low'],
          ['2', '2 · medium'],
          ['3', '3 · high'],
        ],
        blank: false,
        showIf: r => r.kind === 'Risk' || r.kind === 'Issue',
      },
      {
        key: 'likelihood',
        label: 'Likelihood',
        type: 'select',
        options: [
          ['1', '1 · unlikely'],
          ['2', '2 · possible'],
          ['3', '3 · likely'],
        ],
        blank: false,
        showIf: r => r.kind === 'Risk',
      },
      {
        key: 'owner',
        label: 'Owner',
        type: 'list',
        options: () =>
          Store.visible()
            .filter(m => m.active !== false)
            .map(m => Store.memberShort(m.id)),
      },
      { key: 'due', label: 'Due / review date', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: ['Open', 'Closed'], blank: false },
      { key: 'notes', label: 'Mitigation / details', type: 'textarea', span: 2, rows: 3 },
    ],
    beforeSave(r) {
      const p = Scrum.proj(r.project);
      if (p) r.team = p.team;
      if (!r.createdBy) r.createdBy = App.me;
      if (r.status === 'Closed' && !r.closedOn) r.closedOn = U.todayStr();
    },
  },
  pstatus: {
    single: 'Weekly status update',
    canCreate: () => true,
    canDelete: r => r.by === App.me || App.isSuper(),
    readOnly: r => !!r.id && r.by !== App.me,
    defaults: () => ({ date: U.todayStr(), health: 'green' }),
    fields: [
      { key: 'date', label: 'Week of', type: 'date', required: true },
      {
        key: 'health',
        label: 'Health',
        type: 'select',
        options: [
          ['green', '🟢 On track'],
          ['amber', '🟡 At risk'],
          ['red', '🔴 Off track'],
        ],
        blank: false,
      },
      { key: 'done', label: 'Done this week', type: 'textarea', span: 2, rows: 3 },
      { key: 'next', label: 'Next week', type: 'textarea', span: 2, rows: 3 },
      { key: 'blockers', label: 'Blockers / help needed', type: 'textarea', span: 2, rows: 2 },
    ],
    beforeSave(r) {
      const p = Scrum.proj(r.project);
      if (p) r.team = p.team;
      r.by = r.by || App.me;
    },
  },
  /* project requests: anyone suggests a project; the team's manager / director decides */
  preq: {
    single: 'Project suggestion',
    canCreate: () => true,
    canDelete: r => (r.createdBy === App.me && r.status === PM2.REQ.P) || App.isSuper(),
    readOnly: r => !!r.id && !(r.createdBy === App.me && r.status === PM2.REQ.P) && !App.isSuper(),
    defaults: () => ({ status: 'Waiting', urgency: 'Normal' }),
    formExtra: r =>
      r.decidedBy
        ? `<p class="note">${h(r.status)} by ${h(Store.memberShort(r.decidedBy))} on ${U.fmtDate(r.decidedOn)}${r.note ? ' — “' + h(r.note) + '”' : ''}</p>`
        : '',
    fields: [
      { key: 'title', label: 'Project name / idea', type: 'text', required: true, span: 2 },
      { key: 'problem', label: 'The problem (why)', type: 'textarea', span: 2, rows: 3, required: true },
      { key: 'benefit', label: 'Expected benefit (how we will know it worked)', type: 'textarea', span: 2, rows: 2 },
      { key: 'dept', label: 'For which department / users', type: 'text' },
      { key: 'urgency', label: 'Urgency', type: 'select', options: ['High', 'Normal', 'Low'], blank: false },
      { key: 'team', label: 'Team', type: 'select', options: () => Store.teams().map(t => [t.id, t.name]), blank: false },
    ],
    beforeSave(r) {
      if (!r.at) r.at = Date.now();
    },
  },
  ptemplate: {
    single: 'Project template',
    canCreate: () => PM2.canTemplate(),
    canDelete: () => PM2.canTemplate(),
    fields: [{ key: 'name', label: 'Name', type: 'text', required: true, span: 2 }],
  },
  pcomment: { single: 'Comment', canCreate: () => true, fields: [{ key: 'text', label: 'Comment', type: 'textarea', span: 2 }] },
});
