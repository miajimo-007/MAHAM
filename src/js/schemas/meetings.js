/* DARRIK — Record types: meeting (edited on its own page) and personal task. */
'use strict';

Object.assign(Schemas, {
  meeting: { single: 'Meeting', fields: [], readOnly: r => !Meetings.canEdit(r) },
  mytask: {
    single: 'Personal task',
    readOnly: r => !!r.id && r.owner !== App.me,
    defaults: () => ({ owner: App.me, status: 'Open' }),
    fields: [
      { key: 'title', label: 'Task', type: 'text', required: true, span: 2 },
      { key: 'due', label: 'Due date', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: ['Open', 'Done', 'Canceled'], blank: false },
      {
        key: 'project',
        label: 'Project (optional)',
        type: 'select',
        options: () => mineOrAll(Store.all('project')).map(p => [p.id, p.name]),
        blank: '— none —',
      },
      { key: 'note', label: 'Notes', type: 'textarea', span: 2, rows: 2 },
    ],
    beforeSave(r) {
      r.owner = r.owner || App.me;
      if (r.status === 'Done' && !r.doneDate) r.doneDate = U.todayStr();
      if (r.status !== 'Done') r.doneDate = '';
    },
  },
});

/* a meeting action that is not a To Do / director task / personal task (e.g. manager → director) */
Object.assign(Schemas, {
  action: {
    single: 'Meeting action',
    readOnly: r =>
      !!r.id && !(r.who === App.me || r.givenBy === App.me || App.isSuper() || (Store.get(r.fromMeeting) || {}).scribe === App.me),
    canDelete: r => r.givenBy === App.me || App.isSuper(),
    defaults: () => ({ who: App.me, status: 'Open', givenBy: App.me }),
    fields: [
      { key: 'title', label: 'Action', type: 'text', required: true, span: 2 },
      {
        key: 'who',
        label: 'Who',
        type: 'select',
        options: () =>
          Store.members()
            .filter(m => m.active !== false)
            .map(m => [m.id, Store.memberName(m.id)]),
        blank: false,
      },
      { key: 'due', label: 'Due date', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: () => UI.statusOpts(['Open', 'Done', 'Canceled']), blank: false },
      { key: 'milestone', label: 'Milestone', type: 'bool', checkLabel: '⭐ Milestone', flag: true },
      { key: 'update', label: 'Update', type: 'textarea', span: 2, rows: 2 },
      { key: 'note', label: 'Instruction', type: 'textarea', span: 2, rows: 2 },
    ],
    beforeSave(r) {
      if (r.status === 'Done' && !r.doneDate) r.doneDate = U.todayStr();
      if (r.status !== 'Done') r.doneDate = '';
    },
  },
});

/* announcements (posted on their own page) and read receipts */
Object.assign(Schemas, {
  announcement: {
    single: 'Announcement',
    fields: [],
    canCreate: () => App.isSuper(),
    canDelete: () => App.isSuper(),
    readOnly: () => !App.isSuper(),
  },
});
