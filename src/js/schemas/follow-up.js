/* MAHAM — Record types: Central follow-up, quick win, on-call log. */
'use strict';

Object.assign(Schemas, {
  central: {
    single: 'Central follow-up',
    defaults: () => ({ analyst: App.me, date: U.todayStr(), status: 'Under Review', type: 'Modification' }),
    fields: [
      { key: 'date', label: 'Date', type: 'date' },
      { key: 'reqId', label: 'Request ID', type: 'text' },
      { key: 'analyst', label: 'Analyst', type: 'member', required: true },
      { key: 'module', label: 'Module', type: 'list', options: L('modules') },
      { key: 'subject', label: 'Subject', type: 'text', required: true, span: 2 },
      { key: 'type', label: 'Type', type: 'select', options: L('centralTypes') },
      { key: 'status', label: 'Status', type: 'select', options: L('centralStatus') },
      { key: 'redmine', label: 'Redmine no.', type: 'text' },
      { key: 'expected', label: 'Expected date', type: 'date' },
      { key: 'deployed', label: 'Deployed', type: 'select', options: ['Yes', 'No'] },
      { key: 'notes', label: 'Follow-up notes', type: 'textarea', span: 2, rows: 2 },
    ],
  },
  quickwin: {
    single: 'Quick win',
    mgrDelete: true,
    mgrPerm: 'approveQW',
    lockedFields: r => (r.approval ? Store.QW_LOCKED_FIELDS : []), // details are fixed once approved
    formExtra: r => QS.formNote(r),
    defaults: () => ({ analyst: App.me, date: U.todayStr(), status: 'In-Progress', type: 'Modification' }),
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true },
      { mgr: true, key: 'qwId', label: 'QW ID', type: 'text', hint: 'Given by manager on approval (e.g. QW-045)' },
      { mgr: true, key: 'analyst', label: 'Analyst', type: 'member', required: true },
      { key: 'module', label: 'Module', type: 'list', options: L('modules'), required: true },
      { key: 'subject', label: 'Subject', type: 'text', required: true, span: 2 },
      {
        key: 'coWorkers',
        label: 'Worked on with',
        type: 'members',
        span: 2,
        hint: 'Teammates who worked on it with you — each gets a request to confirm, then it counts for them too (once for the team)',
      },
      { key: 'type', label: 'Type', type: 'select', options: L('qwTypes') },
      { key: 'status', label: 'Status', type: 'select', options: L('qwStatus') },
      { key: 'impact', label: 'Impact', type: 'text', span: 2 },
      { key: 'expected', label: 'Expected date', type: 'date', hint: 'Counts toward the month of this date' },
      { key: 'milestone', label: 'Milestone', type: 'bool', checkLabel: '⭐ Milestone', flag: true },
      { mgr: true, key: 'approval', label: 'Manager approval', type: 'select', options: L('approval') },
      { mgr: true, key: 'managerComment', label: 'Manager comment', type: 'textarea', span: 2, rows: 2 },
    ],
  },
  oncall: {
    single: 'On-call log entry',
    defaults: () => ({ analyst: App.me, date: U.todayStr(), time: '', status: '' }),
    fields: [
      { key: 'analyst', label: 'Analyst', type: 'member', required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'time', label: 'Time', type: 'time' },
      { key: 'status', label: 'Status', type: 'select', options: ['resolved', 'escalated', 'pending'] },
      { key: 'issue', label: 'Issue', type: 'textarea', required: true, span: 2, rows: 2 },
      { key: 'action', label: 'Action taken', type: 'textarea', span: 2, rows: 2 },
    ],
  },
  /* Good Catch (On-Call / Good Catch → Good Catch tab) */
  gcatch: {
    single: 'Good catch',
    canCreate: () => true,
    canDelete: r => GC.canAll(r),
    mgrOk: r => !r.id || GC.canAll(r),
    readOnly: r => !!r.id && !GC.canWork(r),
    defaults: () => ({ kind: 'Issue', impact: 'Medium', status: 'New', found: U.todayStr() }),
    formNote: '🔒 No patient names, MRNs or other details that identify a patient.',
    onFormMount: (form, base) => GC.panel(form, base),
    fields: [
      { mgr: true, roSuffix: '', key: 'title', label: 'What you saw', type: 'text', required: true, span: 2 },
      { mgr: true, roSuffix: '', key: 'kind', label: 'Type', type: 'select', options: () => GC.KINDS, blank: false },
      { mgr: true, roSuffix: '', key: 'impact', label: 'Impact', type: 'select', options: ['High', 'Medium', 'Low'], blank: false },
      {
        mgr: true,
        roSuffix: '',
        key: 'system',
        label: 'System / module',
        type: 'list',
        options: () => [
          ...new Set(
            GC.all()
              .map(g => g.system)
              .filter(Boolean)
          ),
        ],
        placeholder: 'e.g. EHR order entry',
      },
      {
        mgr: true,
        roSuffix: '',
        key: 'where',
        label: 'Department / location',
        type: 'list',
        options: () => [
          ...new Set(
            GC.all()
              .map(g => g.where)
              .filter(Boolean)
          ),
        ],
      },
      { mgr: true, roSuffix: '', key: 'found', label: 'Found on', type: 'date', required: true },
      { mgr: true, roSuffix: '', key: 'ref', label: 'Request ID / reference', type: 'text' },
      { mgr: true, roSuffix: '', key: 'details', label: 'Details', type: 'textarea', span: 2, rows: 3 },
      {
        mgr: true,
        roSuffix: '',
        key: 'action',
        label: 'What I did about it',
        type: 'textarea',
        span: 2,
        rows: 2,
        hint: 'e.g. called the user, raised a ManageEngine request, temporary workaround',
      },
      { key: 'status', label: 'Status', type: 'select', options: () => Object.values(GC.ST), blank: false },
      {
        key: 'taker',
        label: 'Taken by',
        type: 'select',
        options: () =>
          Store.visible()
            .filter(m => m.active !== false)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(m => [m.id, Store.memberName(m.id)]),
        blank: '— nobody yet —',
      },
      { key: 'resolution', label: 'Resolution (what fixed it / why not)', type: 'textarea', span: 2, rows: 2 },
    ],
    beforeSave(r, before) {
      if (!r.createdBy) r.createdBy = (before && before.createdBy) || App.me;
      if (!r.team) {
        const m = Store.member(r.createdBy);
        r.team = (m && !Store.topRole(m.role) && m.team) || App.viewTeam || 'apps';
      }
      if (r.taker && r.status === GC.ST.N) r.status = GC.ST.P;
      if (!GC.isOpen(r)) {
        if (!r.resolvedOn) r.resolvedOn = U.todayStr();
        if (!r.resolvedBy) r.resolvedBy = App.me;
      } else {
        r.resolvedOn = '';
        r.resolvedBy = '';
      }
    },
  },
  gcupdate: { single: 'Good catch update', canCreate: () => true, fields: [{ key: 'text', label: 'Update', type: 'textarea', span: 2 }] },
});
