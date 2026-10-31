/* DARRIK — Record types: director task, project, sprint, project task. */
'use strict';

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
          App.assignees().map(m => [
            m.id,
            `${Store.memberName(m.id)} (${Store.topRole(m.role) ? Store.titleOf(m) : Store.teamName(m.team)})`,
          ]),
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
      { mgr: true, key: 'points', label: 'Story points', type: 'select', options: () => Scrum.POINTS.map(String), blank: false },
      {
        mgr: true,
        key: 'assignee',
        label: 'Assigned to',
        type: 'select',
        options: () => {
          const p = Scrum.proj(UI._recProject);
          return p ? Scrum.people(p).map(id => [id, Store.memberName(id)]) : [];
        },
        blank: 'Unassigned',
      },
      {
        mgr: true,
        key: 'sprint',
        label: 'Sprint',
        type: 'select',
        options: () =>
          Scrum.sprints(UI._recProject)
            .filter(s => s.status !== 'Completed')
            .map(s => [s.id, s.name + (s.status === 'Active' ? ' (active)' : '')]),
        blank: 'Backlog',
      },
      { mgr: true, key: 'due', label: 'Due date', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: () => Scrum.columns(Scrum.proj(UI._recProject)), blank: false },
      { mgr: true, key: 'description', label: 'Description / acceptance criteria', type: 'textarea', span: 2, rows: 3 },
      { key: 'comment', label: 'Update / notes', type: 'textarea', span: 2, rows: 2 },
    ],
    beforeSave(r, before) {
      const p = Scrum.proj(r.project);
      if (p) r.team = p.team;
      r.points = +r.points || 0;
      if (!before || !before.id) r.createdOn = r.createdOn || U.todayStr();
      if (!r.startedOn && (Scrum.isDone(r) || Scrum.colIndex(r) > 0)) r.startedOn = U.todayStr();
      if (Scrum.isDone(r) && !r.doneDate) r.doneDate = U.todayStr();
      if (!Scrum.isDone(r)) r.doneDate = '';
      if (!r.n) r.n = Scrum.items(r.project).reduce((a, t) => Math.max(a, t.n || 0), 0) + 1;
    },
  },
});
