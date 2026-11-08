/* MAHAM — To Do List. */
'use strict';

P.todo = sub => {
  if (sub === 'scheduled') return todoScheduled();
  const s = ps('todo');
  if (s.analyst == null) s.analyst = '';
  let rows = App.mine(Calc.todos(App.year), t => t.r.analyst);
  if (s.chk) rows = rows.filter(t => TodoFlow.has(t.r));
  if (s.analyst) rows = rows.filter(t => t.r.analyst === s.analyst);
  if (s.month) rows = rows.filter(t => t.month === +s.month);
  if (s.st === 'Delayed') rows = rows.filter(t => t.timing === 'Delayed' && t.status !== 'Canceled');
  else if (s.st) rows = rows.filter(t => t.status === s.st);
  if (s.fu) rows = rows.filter(t => t.r.fu);
  if (s.pri) rows = rows.filter(t => (t.r.priority || 'Normal') === s.pri);
  if (s.ms) rows = rows.filter(t => t.r.milestone);
  rows = [...rows].sort((a, b) => (b.r.assigned || '').localeCompare(a.r.assigned || ''));
  const pend = rows.filter(t => t.status === 'In Progress');
  const html = `<div class="page-actions">${filterBar('todo', [
    { key: 'analyst', type: 'member', label: 'Assigned to' },
    { key: 'month', type: 'month' },
    { key: 'st', label: 'Status', options: UI.statusOpts(['In Progress', 'Ready for review', 'Resolved', 'Canceled', 'Delayed']) },
    { key: 'pri', label: 'Priority', options: ['High', 'Medium', 'Normal', 'Low'] },
    { key: 'fu', type: 'toggle', label: 'Follow-up only (TDFU)' },
    { key: 'ms', type: 'toggle', label: '⭐ Milestones only' },
    { key: 'chk', type: 'toggle', label: '🔀 Handed on only' },
  ])}${App.can('assignTodo') || TodoRules.all(App.viewTeam).some(r => r.analyst === App.me) ? `<a class="btn ghost" href="#/todo/scheduled">↻ Scheduled <span class="count">${TodoRules.all(App.viewTeam).filter(r => !r.stopped && (App.can('assignTodo') || r.analyst === App.me)).length}</span></a>` : ''}${addBtn('todo', 'New task')}</div>
  <div class="chips-row">${UI.badge(`${pend.length} in progress`, 'warn')} ${UI.badge(`${pend.filter(t => t.timing === 'Delayed').length} overdue`, 'bad')} ${UI.badge(`${rows.filter(t => t.timing === 'On Time' && t.status === 'Resolved').length} done on time`, 'good')} ${UI.badge(`${rows.filter(t => t.timing === 'Delayed' && t.status === 'Resolved').length} done late`)}</div>
  ${UI.table({
    id: 'todo',
    rows,
    exportName: 'To Do List',
    onRow: true,
    bulk: todoBulk(),
    cols: [
      {
        key: 'status',
        label: 'Status',
        html: t => {
          const l = TodoFlow.label(t.r);
          return UI.sbadge(t.status) + (l ? `<div class="tf-lab">${h(l)}</div>` : '');
        },
        get: t => t.status + ' ' + TodoFlow.label(t.r),
      },
      {
        key: 'task',
        label: 'To Do',
        html: t =>
          `${t.r.prevStep ? '<span class="muted small" title="Handed on from ' + h(Store.memberShort((Store.get(t.r.prevStep) || {}).analyst)) + '">➜ </span>' : ''}<b>${h(t.r.task)}</b>${UI.flagTags(t.r, { noPri: true })}${Conv.tag(t.r)}${t.r.instruction ? `<div class="muted small">📝 ${h(t.r.instruction)}</div>` : ''}${t.r.comment ? `<div class="muted small">💬 ${h(t.r.comment)}</div>` : ''}${t.r.fromRule ? ' <span class="muted small" title="Repeating To Do">↻</span>' : ''}`,
        get: t => t.r.task + ' ' + (t.r.instruction || '') + ' ' + (t.r.comment || ''),
      },
      {
        key: 'pri',
        label: 'Priority',
        get: t => t.r.priority || 'Normal',
        sortVal: t => UI.PRI_RANK[t.r.priority || 'Normal'],
        edit: {
          type: 'select',
          options: ['High', 'Medium', 'Normal', 'Low'],
          ok: t => !t.r.virtual && t.status === 'In Progress' && UI.canEditField('todo', t.r, 'priority'),
          value: t => t.r.priority || 'Normal',
          save: (t, v) => UI.saveField('todo', t.r, 'priority', v, 'Priority changed to ' + v),
        },
      },
      { key: 'fu', label: 'FU', get: t => (t.r.fu ? 'Y' : '') },
      { key: 'analyst', label: 'Assigned to', get: t => Store.memberShort(t.r.analyst) },
      { key: 'assigned', label: 'Assigned', get: t => U.fmtDate(t.r.assigned), sortVal: t => t.r.assigned || '' },
      { key: 'due', label: 'Due', get: t => U.fmtDate(t.due), sortVal: t => t.due },
      { key: 'finish', label: 'Finished', get: t => U.fmtDate(t.r.finish), sortVal: t => t.r.finish || '' },
      { key: 'days', label: 'Days', cls: 'num', get: t => (t.days == null ? '' : t.days), sortVal: t => t.days || 0 },
      { key: 'timing', label: 'Timing', html: t => UI.sbadge(t.timing), get: t => t.timing },
      ...(Admin.canSee()
        ? [
            {
              key: 'seen',
              label: '👁',
              html: t => (t.r.analyst === App.me ? '' : Admin.seenLabel(t.r)),
              get: t => {
                const x = Admin.todoSeen(t.r);
                return x ? (x.o ? 'opened' : 'seen') : 'not seen';
              },
            },
          ]
        : []),
      {
        key: 'act',
        label: '',
        html: t => {
          const tf = TodoFlow.buttons(t.r);
          if (tf) return tf; // ✓ Fixed (sent back to me) · ➜ Choose who (workflow)
          const back = TodoFlow.buttons(t.r, { backOnly: true }); // on a handed-on To Do: something wrong with the step before
          if (t.status !== 'Ready for review' && Store.canFinishTodo(t.r, App.me) && App.canEdit('todo'))
            return `<span class="nw"><button class="btn sm" data-done="${h(t.r.id)}">✓ Done</button>${back ? ' ' + back : ''}</span>`;
          if (Store.canConfirmTodo(t.r, App.me) && App.canEdit('todo'))
            return `<span class="nw"><button class="btn sm primary" data-tdok="${h(t.r.id)}">✓ Confirm</button> <button class="btn sm ghost" data-tf="send|${h(t.r.id)}" title="A new To Do for the next person (testing, go-live …)">➜ Send on</button> <button class="btn sm ghost" data-tdback="${h(t.r.id)}">↩ Send back</button></span>`;
          return back;
        },
        get: () => '',
      },
    ],
  })}`;
  return {
    title: 'To Do List',
    html,
    mount(root) {
      UI.bindTables(root, { todo: t => UI.editRecord('todo', t.r) });
      root.querySelectorAll('[data-done]').forEach(
        b =>
          (b.onclick = e => {
            e.stopPropagation();
            todoDone(b.dataset.done);
          })
      );
      bindTodoReview(root);
      TodoFlow.bind(root);
    },
  };
};
/* manager confirms a finished To Do, or sends it back */
function bindTodoReview(root) {
  root.querySelectorAll('[data-tdok]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        const r = Store.get(b.dataset.tdok);
        if (!Store.canConfirmTodo(r, App.me)) {
          UI.toast('Only a manager or team leader can confirm — and not their own To Do', 'bad');
          return;
        }
        Store.save(Store.confirmedTodo(r));
        UI.toast('Confirmed', 'good');
        App.render();
      })
  );
  root.querySelectorAll('[data-tdback]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        const r = Store.get(b.dataset.tdback);
        if (!Store.canConfirmTodo(r, App.me)) {
          UI.toast('Only a manager or team leader can send it back', 'bad');
          return;
        }
        UI.modal({
          title: 'Send back: ' + r.task,
          body: `<form class="grid-form" id="tdbf">${UI.field({ key: 'note', label: 'What is still missing?', type: 'textarea', span: 2, rows: 2 }, '')}</form>`,
          actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Send back</button>`,
          onMount: w => {
            w.querySelector('[data-c]').onclick = UI.closeModal;
            w.querySelector('[data-ok]').onclick = () => {
              const note = w.querySelector('[name=note]').value.trim();
              Store.save(
                Object.assign({}, r, {
                  finish: '',
                  status: 'In Progress',
                  finishNote: '',
                  flowFrom: Date.now(),
                  instruction: [r.instruction, note ? '↩ ' + note : ''].filter(Boolean).join('\n'),
                })
              );
              UI.closeModal();
              UI.toast('Sent back', 'good');
              App.render();
            };
          },
        });
      })
  );
}

/* Done on a To Do: only the person it is assigned to (or a manager); the message says what really happened */
function todoDone(id) {
  const r = Store.get(id);
  if (!r) return;
  if (!Store.canFinishTodo(r, App.me)) {
    UI.toast('This To Do belongs to ' + Store.memberShort(r.analyst) + ' — only they or your manager can mark it done', 'bad');
    return;
  }
  const x = Object.assign({}, r, { finish: U.todayStr() });
  Schemas.todo.beforeSave(x);
  const vw = Schemas.todo.validate(x);
  if (vw) {
    UI.toast(vw, 'bad');
    UI.editRecord('todo', r);
    return;
  }
  Store.save(x);
  const now = Store.get(id);
  const nd = now && now.finish && now.wf && typeof TodoFlow !== 'undefined' ? TodoFlow.nextDef(now) : null;
  if (nd && nd.who === 'pick')
    setTimeout(() => TodoFlow.pick(Store.get(id)), 50); // the workflow asks me who does the next step
  else if (nd) {
    /* handed on by itself — the message comes from the hand-on */
  } else if (now && now.finish)
    UI.toast(now.status === 'Ready for review' ? 'Done — waiting for your manager to confirm' : 'Done and confirmed', 'good');
  App.render();
}

/* To Do list: tick several rows and act on them together */
function todoBulk() {
  const today = U.todayStr();
  const n = (k, w) => `${k} To Do${k === 1 ? '' : 's'} ${w}`;
  const mgrOk = t => !t.r.virtual && t.status === 'In Progress' && App.can('assignTodo') && App.canEdit('todo') && Store.mayChange(t.r);
  return [
    {
      label: '✓ Mark done',
      ok: t => t.status === 'In Progress' && App.canEdit('todo') && Store.canFinishTodo(t.r, App.me),
      run: rows => {
        const list = rows.map(t => {
          const x = Object.assign({}, t.r, { finish: today });
          Schemas.todo.beforeSave(x);
          return x;
        });
        UI.saveUndo(list, n(list.length, 'marked done'));
        App.render(true);
      },
    },
    {
      label: '✓ Confirm',
      ok: t => App.canEdit('todo') && Store.canConfirmTodo(t.r, App.me),
      run: rows => {
        UI.saveUndo(
          rows.map(t => Store.confirmedTodo(t.r)),
          n(rows.length, 'confirmed')
        );
        App.render(true);
      },
    },
    {
      label: '👤 Reassign…',
      ok: mgrOk,
      run: (rows, done) => {
        UI.modal({
          title: `Reassign ${n(rows.length, '')}`.trim(),
          body: `<form class="grid-form" id="rsf">${UI.field({ key: 'who', label: 'Give to', type: 'select', options: Store.scoredTeam().map(m => [m.id, Store.memberShort(m.id)]), required: true }, '')}</form>`,
          actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Reassign</button>`,
          onMount: w => {
            w.querySelector('[data-c]').onclick = UI.closeModal;
            w.querySelector('[data-ok]').onclick = () => {
              const who = w.querySelector('[name=who]').value;
              if (!who) return UI.toast('Pick a person', 'bad');
              UI.closeModal();
              done();
              UI.saveUndo(
                rows.map(t =>
                  Object.assign({}, t.r, { analyst: who, team: (Store.member(who) || {}).team || t.r.team, reassignedFrom: t.r.analyst })
                ),
                `${n(rows.length, 'given to')} ${Store.memberShort(who)}`
              );
              App.render(true);
            };
          },
        });
        return false;
      },
    },
    {
      label: '✕ Cancel…',
      cls: 'ghost',
      ok: mgrOk,
      run: (rows, done) => {
        UI.confirm(`Cancel ${n(rows.length, '')}? They stay in the list as Canceled.`, () => {
          done();
          UI.saveUndo(
            rows.map(t => Object.assign({}, t.r, { status: 'Canceled' })),
            n(rows.length, 'canceled'),
            ''
          );
          App.render(true);
        });
        return false;
      },
    },
  ];
}

/* ↻ Scheduled: the repeating To Dos of the team (managers), or my own (analysts) */
function todoScheduled() {
  const mgr = App.can('assignTodo');
  const today = U.todayStr();
  const rules = TodoRules.all(App.viewTeam)
    .filter(r => mgr || r.analyst === App.me)
    .sort((a, b) => !!a.stopped - !!b.stopped || (TodoRules.next(a) || '9').localeCompare(TodoRules.next(b) || '9'));
  const made = id => (Store.byC.todo || []).filter(t => t && !t._del && t.fromRule === id).length;
  const st = r =>
    r.stopped
      ? UI.badge('Stopped')
      : r.paused
        ? UI.badge('Paused', 'warn')
        : TodoRules.next(r)
          ? UI.badge('Active', 'good')
          : UI.badge('Finished');
  const html = `<div class="page-actions"><a class="btn ghost" href="#/todo">← To Do List</a><span class="grow"></span>${mgr && App.canEdit('todo') ? addBtn('todo', 'New repeating To Do') : ''}</div>
  <p class="muted small">Each repeating To Do becomes a normal To Do on its day — on My Day, scored and confirmed as usual. To start one: <b>＋ New task</b> → <b>↻ Repeat</b>.</p>
  ${UI.table({
    id: 'todorules',
    rows: rules,
    empty: 'No repeating To Dos yet.',
    cols: [
      { key: 'task', label: 'To Do', html: r => `<b>${h(TodoRules.asOf(r, today).task)}</b>`, get: r => r.task },
      { key: 'who', label: 'For', get: r => Store.memberShort(TodoRules.asOf(r, today).analyst) },
      {
        key: 'every',
        label: 'Repeats',
        get: r => TodoRules.everyLabel(r) + (r.end ? ' · until ' + U.fmtDate(r.end) : '') + (r.times ? ` · ${r.times} times` : ''),
      },
      { key: 'due', label: 'Due in', get: r => (+TodoRules.asOf(r, today).dueDays || 0) + ' days' },
      { key: 'next', label: 'Next', get: r => U.fmtDate(TodoRules.next(r)) || '—', sortVal: r => TodoRules.next(r) || '9' },
      { key: 'made', label: 'Made so far', cls: 'num', get: r => made(r.id) },
      { key: 'st', label: 'Status', html: st, get: r => (r.stopped ? 'Stopped' : r.paused ? 'Paused' : 'Active') },
      {
        key: 'act',
        label: '',
        html: r =>
          !r.stopped && TodoRules.canManage(r) && App.canEdit('todo')
            ? `<span class="nw"><button class="btn sm ghost" data-trp="${h(r.id)}">${r.paused ? '▶ Resume' : '⏸ Pause'}</button> <button class="btn sm ghost" data-tre="${h(r.id)}">Edit</button> <button class="btn sm ghost t-bad" data-trs="${h(r.id)}">■ Stop</button></span>`
            : '',
        get: () => '',
      },
    ],
  })}`;
  return {
    title: 'To Do List',
    html,
    mount(root) {
      UI.bindTables(root, { todorules: r => (TodoRules.canManage(r) && !r.stopped ? TodoRules.editRule(r) : null) });
      root.querySelectorAll('[data-trp]').forEach(
        b =>
          (b.onclick = e => {
            e.stopPropagation();
            const r = Store.get(b.dataset.trp);
            if (!r) return;
            Store.save(Object.assign({}, r, r.paused ? { paused: false, createdOn: U.todayStr() } : { paused: true }));
            UI.toast(
              r.paused
                ? 'Resumed — next one ' + (U.fmtDate(TodoRules.next(Object.assign({}, r, { paused: false }))) || '—')
                : 'Paused — no new ones until you resume',
              'good'
            );
            App.render(true);
          })
      );
      root.querySelectorAll('[data-tre]').forEach(
        b =>
          (b.onclick = e => {
            e.stopPropagation();
            const r = Store.get(b.dataset.tre);
            if (r) TodoRules.editRule(r);
          })
      );
      root.querySelectorAll('[data-trs]').forEach(
        b =>
          (b.onclick = e => {
            e.stopPropagation();
            const r = Store.get(b.dataset.trs);
            if (!r) return;
            UI.confirm('Stop this repeating To Do? No new ones will be made; the ones already made stay.', () => {
              Store.save(
                Object.assign({}, r, { stopped: true, stoppedOn: U.todayStr(), end: r.end && r.end < U.todayStr() ? r.end : U.todayStr() })
              );
              UI.toast('Stopped', 'good');
              App.render(true);
            });
          })
      );
    },
  };
}
