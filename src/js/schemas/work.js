/* DARRIK — Record types: To Do, shadow work, help desk request, attendance. */
'use strict';

Object.assign(Schemas, {
  todo: {
    single: 'To Do task',
    mgrCreate: true,
    mgrDelete: true,
    mgrPerm: 'assignTodo',
    readOnly: r => !!r.id && r.analyst !== App.me && !App.can('assignTodo'), // someone else's To Do: view only
    defaults: () => ({ analyst: App.me, assigned: U.todayStr(), duration: 0, fu: false, priority: 'Normal', status: 'In Progress' }),
    fields: [
      { mgr: true, key: 'task', label: 'To Do', type: 'textarea', required: true, span: 2, rows: 2 },
      { mgr: true, key: 'analyst', label: 'Assigned to', type: 'member', required: true },
      {
        mgr: true,
        key: 'priority',
        label: 'Priority',
        type: 'select',
        options: ['High', 'Medium', 'Normal', 'Low'],
        blank: false,
        flag: true,
      },
      { mgr: true, key: 'fu', label: 'Follow-up (FU)', type: 'bool', checkLabel: 'Follow-up (FU)', flag: true },
      { key: 'milestone', label: 'Milestone', type: 'bool', checkLabel: '⭐ Milestone', flag: true },
      { mgr: true, key: 'assigned', label: 'Assigned date', type: 'date', required: true },
      { mgr: true, key: 'duration', label: 'Due in (days)', type: 'number', min: 0, step: 1, hint: 'Due date = assigned date + days' },
      {
        key: 'finish',
        label: 'Finish date',
        type: 'date',
        hint: 'Fill when done → it goes to your manager to confirm. An earlier date than today needs a reason',
      },
      {
        key: 'finishNote',
        label: 'Reason for an earlier finish date',
        type: 'text',
        span: 2,
        placeholder: 'Only needed if you finished it on an earlier day',
        showIf: r => !App.can('assignTodo'),
      },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: () =>
          UI.statusOpts(
            App.can('assignTodo')
              ? ['In Progress', 'Ready for review', 'Resolved', 'Canceled']
              : ['In Progress', 'Ready for review', 'Resolved']
          ),
        blank: false,
      },
      { mgr: true, key: 'instruction', label: 'Manager / Team Leader instruction', type: 'textarea', span: 2, rows: 2 },
      { mgr: true, key: 'dirNote', label: 'Director update', type: 'textarea', span: 2, rows: 2, showIf: r => !!r.fromTask },
      {
        key: 'comment',
        label: 'Analyst update / comment',
        type: 'textarea',
        span: 2,
        rows: 2,
        hint: 'Your manager sees your latest update (and the director, for tasks from the director)',
      },
    ],
    beforeSave(r) {
      if (r.status !== 'Canceled') {
        if (!r.finish) {
          r.reviewedBy = '';
          r.reviewedOn = '';
        } else if (!r.reviewedBy && Store.selfConfirms(r, App.me)) {
          r.reviewedBy = App.me;
          r.reviewedOn = U.todayStr();
        }
        r.status = Store.finishStatus(r, App.me);
      }
    },
  },
  shadow: {
    single: 'Shadow work entry',
    defaults: () => ({ analyst: App.me, date: U.todayStr(), minutes: 30 }),
    fields: [
      {
        key: 'date',
        label: 'Date',
        type: 'date',
        required: true,
        hint: `Today or up to ${Config.SELF_BACKDATE_DAYS} days back (older: ask your manager)`,
      },
      { mgr: true, key: 'analyst', label: 'Analyst', type: 'member', required: true },
      { key: 'taskType', label: 'Task type', type: 'tasktype', required: true },
      { key: 'source', label: 'Source', type: 'select', options: L('sources'), required: true },
      { key: 'subject', label: 'Subject', type: 'text', required: true, span: 2 },
      { key: 'minutes', label: 'Duration (minutes)', type: 'minutes', required: true },
      { key: 'ref', label: 'Reference', type: 'text', hint: 'Request ID / SRS / E-CTS no. / who you called / project' },
      { key: 'fu', label: 'Follow-up (FU)', type: 'bool', checkLabel: 'Follow-up (FU)', flag: true },
      { key: 'milestone', label: 'Milestone', type: 'bool', checkLabel: '⭐ Milestone', flag: true },
    ],
  },
  helpdesk: {
    single: 'Help desk request',
    mgrCreate: true,
    mgrDelete: true,
    mgrAll: true,
    mgrPerm: 'importME',
    canDelete: () => App.isSuper(), // adding / deleting by hand: the administrator only (the daily import does the rest)
    fields: [
      { key: 'reqId', label: 'Request ID', type: 'number', required: true },
      {
        key: 'technician',
        label: 'Technician (as in ME)',
        type: 'list',
        options: () =>
          Store.team()
            .map(m => m.me)
            .filter(Boolean),
      },
      { key: 'subject', label: 'Subject', type: 'text', span: 2 },
      { key: 'requester', label: 'Requester', type: 'text' },
      { key: 'department', label: 'Department', type: 'text' },
      {
        key: 'status',
        label: 'Request status',
        type: 'list',
        options: ['Open', 'Closed', 'Resolved', 'Onhold', 'Follow Up', 'Cancelled', 'Awaiting Requester Response'],
      },
      { key: 'group', label: 'Group', type: 'text' },
      { key: 'created', label: 'Created', type: 'datetime' },
      { key: 'resolved', label: 'Resolved', type: 'datetime' },
      { key: 'elapsedHrs', label: 'Time elapsed (hours)', type: 'number' },
    ],
    beforeSave(r) {
      r.id = r.id || 'hd-' + r.reqId;
    },
  },
  attendance: { single: 'Attendance day', fields: [] },
});
