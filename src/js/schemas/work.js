/* MAHAM — Record types: To Do, shadow work, help desk request, attendance. */
'use strict';

Object.assign(Schemas, {
  todo: {
    single: 'To Do task',
    keyOf: r => TodoId.key(r),
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
      {
        mgr: true,
        key: 'ttype',
        label: 'Type',
        type: 'select',
        options: () => (typeof TodoFlow !== 'undefined' ? TodoFlow.types() : []),
        showIf: () => typeof TodoFlow !== 'undefined' && TodoFlow.types().length > 0,
        hint: 'Some types go through a workflow by themselves',
      },
      {
        mgr: true,
        key: 'wf',
        label: 'Steps after it is done',
        type: 'select',
        options: r =>
          [['', 'None — the manager confirms it']].concat(
            TodoFlow.defsFor((r && r.team) || App.viewTeam || 'apps').map(d => [d.id, '🔀 ' + d.name])
          ),
        blank: false,
        showIf: () => typeof TodoFlow !== 'undefined' && TodoFlow.defs().length > 0,
      },
      {
        mgr: true,
        key: 'repeat',
        label: '↻ Repeat',
        type: 'select',
        options: () => [['', 'Does not repeat']].concat(TodoRules.EVERY),
        blank: false,
        showIf: r => !r.id && !r.prevStep && typeof TodoRules !== 'undefined',
        hint: 'Each one is a new To Do on its day (weekly: same weekday as the assigned date · monthly: same day of the month)',
      },
      {
        mgr: true,
        key: 'repeatEnd',
        label: 'Repeat until (optional)',
        type: 'date',
        showIf: r => !r.id && !r.prevStep && typeof TodoRules !== 'undefined',
      },
      {
        mgr: true,
        key: 'repeatTimes',
        label: 'Or stop after (times, optional)',
        type: 'number',
        min: 0,
        step: 1,
        showIf: r => !r.id && !r.prevStep && typeof TodoRules !== 'undefined',
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
    validate(r) {
      if (typeof TodoFlow === 'undefined' || !r.finish || !r.stepNo || !r.wf) return '';
      const d = TodoFlow.def(r.wf);
      const st = d && d.steps[r.stepNo - 1];
      return st && st.needNote && !String(r.comment || '').trim() ? `Write a comment (what you did / found) to finish "${st.name}"` : '';
    },
    /* a "Repeat" choice saves a repeating rule instead of one To Do (domain/todorules.js) */
    transform(out) {
      if (!out.repeat || typeof TodoRules === 'undefined') return null;
      const rule = TodoRules.fromForm(out);
      return rule;
    },
    formExtra(r) {
      return typeof TodoFlow !== 'undefined' ? TodoFlow.panel(Store.get(r.id) || r) + TodoFollow.box(Store.get(r.id) || r) : '';
    },
    onFormMount(form, base) {
      const m = form.closest('#modal') || document;
      if (typeof TodoFlow !== 'undefined') {
        TodoFlow.bind(m);
        if (base.id) TodoFollow.bind(m, Store.get(base.id) || base);
      }
      if (!base.id && base.followOf && Store.get(base.followOf))
        form.insertAdjacentHTML(
          'afterbegin',
          `<div class="fld span2 small">↪ Follow-up of: <b>${h(Store.get(base.followOf).task)}</b></div>`
        );
      if (!base.id && base.prevStep && Store.get(base.prevStep)) {
        const p = Store.get(base.prevStep);
        form.insertAdjacentHTML(
          'afterbegin',
          `<div class="fld span2 small">➜ Handed on from <b>${h(Store.memberShort(p.analyst))}</b>: ${h(p.task)} — their part counts as done once you add this.</div>`
        );
      }
      const ty = form.querySelector('[name=ttype]'),
        wf = form.querySelector('[name=wf]');
      if (ty && wf)
        ty.addEventListener('change', () => {
          const d = TodoFlow.autoFor(ty.value, base.team || App.viewTeam || 'apps');
          if (d && !wf.value) wf.value = d.id;
        });
      const rp = form.querySelector('[name=repeat]');
      const tog = () => {
        for (const k of ['repeatEnd', 'repeatTimes']) {
          const f = form.querySelector(`[name=${k}]`);
          if (f) f.closest('.fld').style.display = rp.value ? '' : 'none';
        }
      };
      if (rp) {
        rp.addEventListener('change', tog);
        tog();
      }
    },
    beforeSave(r) {
      delete r.repeat;
      delete r.repeatEnd;
      delete r.repeatTimes;
      delete r._sendOn;
      if (r.prevStep && !r.stepName) r.stepName = (String(r.task || '').split(':')[0] || '').trim().slice(0, 40) || 'Next step';
      if (!r.wf && r.ttype && typeof TodoFlow !== 'undefined') {
        const d = TodoFlow.autoFor(r.ttype, r.team || (Store.member(r.analyst) || {}).team || 'apps');
        if (d) r.wf = d.id;
      }
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
    canDelete: r => (App.isSuper() || App.can('editHelpdeskByHand')) && !HDLock.locked(r), // adding / deleting by hand: the administrator only (the daily import does the rest)
    readOnly: r => !!r.id && HDLock.locked(r),
    formExtra: r =>
      r.id && HDLock.locked(r)
        ? `<p class="muted small">🔒 ${HDLock.label(HDLock.monthOf(r))} is locked by the admin — its numbers stay as reported. ${App.isSuper() ? 'Unlock it in Admin → Customize → Help desk months to change it.' : ''}</p>`
        : '',
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
