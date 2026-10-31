/* DARRIK — To Do List. */
'use strict';

P.todo = () => {
  const s = ps('todo');
  if (s.analyst == null) s.analyst = '';
  let rows = App.mine(Calc.todos(App.year), t => t.r.analyst);
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
  ])}${addBtn('todo', 'New task')}</div>
  <div class="chips-row">${UI.badge(`${pend.length} in progress`, 'warn')} ${UI.badge(`${pend.filter(t => t.timing === 'Delayed').length} overdue`, 'bad')} ${UI.badge(`${rows.filter(t => t.timing === 'On Time' && t.status === 'Resolved').length} done on time`, 'good')} ${UI.badge(`${rows.filter(t => t.timing === 'Delayed' && t.status === 'Resolved').length} done late`)}</div>
  ${UI.table({
    id: 'todo',
    rows,
    exportName: 'To Do List',
    onRow: true,
    cols: [
      { key: 'status', label: 'Status', html: t => UI.sbadge(t.status), get: t => t.status },
      {
        key: 'task',
        label: 'To Do',
        html: t =>
          `<b>${h(t.r.task)}</b>${UI.flagTags(t.r, { noPri: true })}${Conv.tag(t.r)}${t.r.instruction ? `<div class="muted small">📝 ${h(t.r.instruction)}</div>` : ''}${t.r.comment ? `<div class="muted small">💬 ${h(t.r.comment)}</div>` : ''}`,
        get: t => t.r.task + ' ' + (t.r.instruction || '') + ' ' + (t.r.comment || ''),
      },
      { key: 'pri', label: 'Priority', get: t => t.r.priority || 'Normal', sortVal: t => UI.PRI_RANK[t.r.priority || 'Normal'] },
      { key: 'fu', label: 'FU', get: t => (t.r.fu ? 'Y' : '') },
      { key: 'analyst', label: 'Assigned to', get: t => Store.memberShort(t.r.analyst) },
      { key: 'assigned', label: 'Assigned', get: t => U.fmtDate(t.r.assigned), sortVal: t => t.r.assigned || '' },
      { key: 'due', label: 'Due', get: t => U.fmtDate(t.due), sortVal: t => t.due },
      { key: 'finish', label: 'Finished', get: t => U.fmtDate(t.r.finish), sortVal: t => t.r.finish || '' },
      { key: 'days', label: 'Days', cls: 'num', get: t => (t.days == null ? '' : t.days), sortVal: t => t.days || 0 },
      { key: 'timing', label: 'Timing', html: t => UI.sbadge(t.timing), get: t => t.timing },
      {
        key: 'act',
        label: '',
        html: t =>
          t.status !== 'Ready for review' && Store.canFinishTodo(t.r, App.me) && App.canEdit('todo')
            ? `<button class="btn sm" data-done="${h(t.r.id)}">✓ Done</button>`
            : Store.canConfirmTodo(t.r, App.me) && App.canEdit('todo')
              ? `<span class="nw"><button class="btn sm primary" data-tdok="${h(t.r.id)}">✓ Confirm</button> <button class="btn sm ghost" data-tdback="${h(t.r.id)}">↩ Send back</button></span>`
              : '',
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
        Store.save(Object.assign({}, r, { status: 'Resolved', reviewedBy: App.me, reviewedOn: U.todayStr() }));
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
  Store.save(x);
  const now = Store.get(id);
  if (now && now.finish)
    UI.toast(now.status === 'Ready for review' ? 'Done — waiting for your manager to confirm' : 'Done and confirmed', 'good');
  App.render();
}
