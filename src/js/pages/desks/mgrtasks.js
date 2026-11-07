/* MAHAM — Tasks from the director: forward to analysts, follow the chain, review & close. */
'use strict';

const chainBadge = st =>
  UI.badge(
    UI.statusLabel(st),
    st === Chain.ST.DONE ? 'good' : st === Chain.ST.REVIEW ? 'good' : st === Chain.ST.X ? '' : st === Chain.ST.OPEN ? 'warn' : 'warn'
  );

/* the chain under a director task: each analyst with status, due date and latest update */
function chainView(mt, opts = {}) {
  const all = Chain.todos(mt);
  const p = Chain.progress(mt);
  const st = Chain.status(mt);
  const people = all
    .map(t => {
      const d = Calc.todoDerive(t);
      const done = Chain.finished(t);
      const x = t.status === 'Canceled';
      return `<div class="chain-row ${x ? 'off' : ''}"><span class="av sm">${h((Store.memberShort(t.analyst) || '?').slice(0, 1))}</span><div class="grow"><b>${h(Store.memberShort(t.analyst))}</b>
      ${x ? UI.badge(t.cancelReason ? 'canceled' : 'canceled', '') : done ? UI.badge('done ' + U.fmtDate(t.finish), 'good') : d.timing === 'Delayed' ? UI.badge(`late · due ${U.fmtDate(d.due)}`, 'bad') : UI.badge('due ' + U.fmtDate(d.due), 'warn')}
      ${x && t.cancelReason ? `<span class="muted small">${h(t.cancelReason)}</span>` : ''}${t.comment ? `<div class="small">💬 ${h(t.comment)}</div>` : ''}</div></div>`;
    })
    .join('');
  return `<div class="chain">${opts.title === false ? '' : `<div class="chain-head">${chainBadge(st)}${p.total ? ` <span class="small">${p.done} of ${p.total} done</span><span class="chain-bar">${UI.bar((100 * p.done) / p.total)}</span>` : ''}${mt.selfDo ? ' <span class="small muted">· manager is doing it</span>' : ''}</div>`}
    ${people || (opts.empty === false ? '' : '<p class="muted small">Not forwarded to anyone yet.</p>')}
    ${mt.closeNote ? `<div class="small">✅ ${h(Store.memberShort(mt.doneBy))}: ${h(mt.closeNote)}</div>` : ''}</div>`;
}
function chainButtons(mt) {
  return `${Chain.canForward(mt) ? `<button class="btn xs" data-fwd="${h(mt.id)}">➜ ${Chain.todos(mt).length || mt.selfDo ? 'Change people' : 'Forward'}</button>` : ''}${Chain.canClose(mt) ? ` <button class="btn xs primary" data-close-task="${h(mt.id)}">✓ Review &amp; close</button>` : ''}`;
}

P.mgrtasks = () => {
  if (!App.isMgr() && !App.isSuper() && !App.isActing())
    return { title: 'Tasks from Director', html: empty('Only managers and the director use this page.') };
  const s = ps('mgr');
  let rows = mineOrAll(Store.all('mgrtask')).map(mtDerive);
  if (s.mgr) rows = rows.filter(x => x.r.manager === s.mgr);
  if (s.st) rows = rows.filter(x => x.st === s.st);
  if (s.month) rows = rows.filter(x => inMonth(x.r.date, s.month) || inMonth(x.r.due, s.month));
  rows.sort(
    (a, b) => !a.open - !b.open || (b.st === Chain.ST.REVIEW) - (a.st === Chain.ST.REVIEW) || (b.r.date || '').localeCompare(a.r.date || '')
  );
  const top = App.isDir() || App.isSuper();
  if (top && s.grouped !== false) rows = mtGroup(rows);
  const flt = [
    ...(top
      ? [
          {
            key: 'mgr',
            label: 'Assignee',
            options: () =>
              App.assignees().map(m => [
                m.id,
                `${Store.memberShort(m.id)} (${Store.topRole(m.role) ? Store.titleOf(m) : Store.teamName(m.team)})`,
              ]),
          },
        ]
      : []),
    { key: 'st', label: 'Status', options: UI.statusOpts(Object.values(Chain.ST)) },
    { key: 'month', type: 'month' },
  ];
  const html = `<div class="page-actions">${filterBar('mgr', flt)}${top ? `<label class="flt tog"><input type="checkbox" id="mgrgrp" ${s.grouped !== false ? 'checked' : ''}> One row per task sent to several managers</label>` : ''}${top ? `<button class="btn primary" id="asgnew">＋ Assign to managers</button>` : addBtn('mgrtask', 'New task')}</div>
  ${UI.table({
    id: 'mgr',
    rows,
    exportName: 'Manager Tasks',
    onRow: true,
    cols: [
      { key: 'date', label: 'Assigned', get: x => U.fmtDate(x.r.date), sortVal: x => x.r.date || '' },
      {
        key: 'manager',
        label: 'Manager',
        html: x =>
          x.group
            ? x.items.map(y => `${h(Store.memberShort(y.r.manager))}${y.open ? '' : ' ✓'}`).join(', ')
            : h(Store.memberShort(x.r.manager) + (x.r.team ? ' · ' + Store.teamName(x.r.team) : '')),
        get: x =>
          x.group
            ? x.items.map(y => Store.memberShort(y.r.manager)).join(', ')
            : Store.memberShort(x.r.manager) + (x.r.team ? ' · ' + Store.teamName(x.r.team) : ''),
      },
      { key: 'urgency', label: 'Urgency', html: x => UI.sbadge(x.r.urgency), get: x => x.r.urgency },
      {
        key: 'task',
        label: 'Task',
        html: x =>
          `<b>${h(x.r.task)}</b>${x.r.comment ? `<div class="muted small">📝 ${h(x.r.comment)}</div>` : ''}${x.r.update ? `<div class="muted small">💬 ${h(x.r.update)}</div>` : ''}`,
        get: x => x.r.task,
      },
      {
        key: 'due',
        label: 'Due',
        html: x => `<span class="${x.late ? 't-bad strong' : ''}">${U.fmtDate(x.r.due)}</span>`,
        get: x => U.fmtDate(x.r.due),
        sortVal: x => x.r.due || '',
      },
      { key: 'days', label: 'Open days', cls: 'num', get: x => (x.days == null ? '' : x.days), sortVal: x => x.days || 0 },
      {
        key: 'chain',
        label: 'Progress',
        html: x =>
          x.group
            ? `${UI.badge(x.st, x.open ? 'warn' : 'good')}<div class="muted small">${x.items.map(y => `${h(Store.memberShort(y.r.manager))}: ${h(UI.statusLabel(y.st))}`).join(' · ')}</div>`
            : chainView(x.r, { empty: true }) +
              `<div class="row-btns tight">${chainButtons(x.r)}${top && x.open && x.r.manager !== App.me ? (Dir.asked(x.r.id) ? '<span class="muted small">update asked</span>' : `<button class="btn xs ghost" data-askup="${h(x.r.id)}">Ask for update</button>`) : ''}${x.r.escalation && !x.r.escalation.answer && top ? `<button class="btn xs primary" data-answer="${h(x.r.id)}">⚑ Decide</button>` : ''}</div>`,
        get: x => `${x.st}${x.prog.total ? ` (${x.prog.done}/${x.prog.total})` : ''}`,
        sortVal: x => x.st,
      },
    ],
  })}`;
  return {
    title: top ? 'Manager Tasks' : 'Tasks from Director',
    html,
    mount(root) {
      UI.bindTables(root, { mgr: x => (x.group ? groupDialog(x) : UI.editRecord('mgrtask', x.r)) });
      bindForward(root);
      Dir.bind(root);
      const an = root.querySelector('#asgnew');
      if (an) an.onclick = () => assignDialog();
      const g = root.querySelector('#mgrgrp');
      if (g)
        g.onchange = () => {
          s.grouped = g.checked;
          App.render();
        };
    },
  };
};

/* a task sent to several managers: each manager's part */
function groupDialog(g) {
  UI.modal({
    title: g.r.task,
    wide: true,
    body: `<p class="muted small">Sent to ${g.items.length} managers${g.r.due ? ' · due ' + U.fmtDate(g.r.due) : ''} — ${h(g.st)}.</p>${g.items.map(y => `<div class="li click" data-gopen="${h(y.r.id)}"><div class="grow"><b>${h(Store.memberShort(y.r.manager))}</b> <span class="muted small">${h(Store.teamName(y.r.team))}</span><div>${chainView(y.r, { empty: true })}</div></div>${UI.badge(y.late ? 'Overdue' : y.st, y.late ? 'bad' : y.open ? 'warn' : 'good')}</div>`).join('')}`,
    actions: `<span class="grow"></span><button class="btn" data-c>Close</button>`,
    onMount: w => {
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelectorAll('[data-gopen]').forEach(
        el =>
          (el.onclick = () => {
            UI.closeModal();
            UI.editRecord('mgrtask', Store.get(el.dataset.gopen));
          })
      );
    },
  });
}

function bindForward(root) {
  root.querySelectorAll('[data-fwd]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        forwardTask(b.dataset.fwd);
      })
  );
  root.querySelectorAll('[data-close-task]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        closeTask(b.dataset.closeTask);
      })
  );
}

/* forward, re-assign or "I'll do it myself" */
function forwardTask(id) {
  const mt = Store.get(id);
  if (!mt || !Chain.canForward(mt)) return UI.toast('You cannot forward this task', 'bad');
  const team = mt.team || 'apps';
  const today = U.todayStr();
  const active = Chain.active(mt);
  const has = new Map(active.map(t => [t.analyst, t]));
  const people = Store.visible().filter(
    m => m.active !== false && (m.team || 'apps') === team && !Store.topRole(m.role) && m.role !== 'manager'
  );
  const first = !active.length;
  UI.modal({
    title: first ? 'Forward task' : 'Change who is working on it',
    body: `<p><b>${h(mt.task)}</b><br><span class="muted small">From ${h(Store.memberShort(mt._by) || 'the director')}${mt.due ? ' · director due date <b>' + U.fmtDate(mt.due) + '</b>' : ''}</span></p>
      <form class="grid-form" id="fwdf">
        <div class="fld span2"><label>Analysts</label><div class="pick">${
          people
            .map(m => {
              const t = has.get(m.id);
              return `<label class="check"><input type="checkbox" name="who" value="${h(m.id)}" ${t ? 'checked' : ''} ${t && Chain.finished(t) ? 'disabled' : ''}> ${h(Store.memberShort(m.id))}${t ? ` <span class="muted small">(${Chain.finished(t) ? 'done' : 'has it'})</span>` : ''}</label>`;
            })
            .join('') || '<span class="muted">No analysts in this team</span>'
        }</div>
          ${active.length ? '<small>Untick someone to take it away from them — their To Do is marked "Canceled (re-assigned)" and does not count against them.</small>' : ''}</div>
        ${UI.field({ key: 'self', label: 'Manager', type: 'bool', checkLabel: "I'll do it myself", span: 2 }, !!mt.selfDo)}
        ${UI.field({ key: 'due', label: 'Due date for new analysts', type: 'date' }, mt.due && mt.due >= today ? mt.due : '')}
        ${UI.field({ key: 'fu', label: 'Follow-up (FU)', type: 'bool', checkLabel: 'Needs follow-up' }, false)}
        ${UI.field({ key: 'instruction', label: 'Instruction to the analyst', type: 'textarea', span: 2, rows: 2 }, mt.comment || '')}
      </form><p class="muted small">Analysts get it in their To Do list and Analyst Desk. When everyone is done it becomes <b>Ready for review</b> and you close it for the director.</p>`,
    actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>`,
    onMount: w => {
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelector('[data-ok]').onclick = () => {
        const f = w.querySelector('#fwdf');
        const v = UI.readForm(f, [{ key: 'self', type: 'bool' }, { key: 'due' }, { key: 'fu', type: 'bool' }, { key: 'instruction' }]);
        const picked = new Set([...f.querySelectorAll('[name=who]:checked')].map(b => b.value));
        for (const t of active) if (Chain.finished(t)) picked.add(t.analyst);
        const add = [...picked].filter(a => !has.has(a));
        const remove = active.filter(t => !picked.has(t.analyst) && !Chain.finished(t));
        if (!picked.size && !v.self) return UI.toast('Pick at least one analyst, or tick "I\'ll do it myself"', 'bad');
        const go = () => {
          const dur = v.due ? Math.max(0, U.diffDays(today, v.due)) : 0;
          const recs = add.map(a => ({
            c: 'todo',
            task: mt.task,
            analyst: a,
            assigned: today,
            duration: dur,
            fu: !!v.fu,
            status: 'In Progress',
            instruction: v.instruction,
            fromTask: mt.id,
            team,
          }));
          recs.push(...remove.map(t => Object.assign({}, t, { status: 'Canceled', cancelReason: 'Re-assigned by the manager' })));
          recs.push(
            Object.assign({}, mt, { selfDo: !!v.self, status: mt.status === Chain.ST.OPEN || !mt.status ? Chain.ST.PROG : mt.status })
          );
          Store.saveMany(recs);
          UI.closeModal();
          UI.toast(
            [
              add.length ? `Forwarded to ${add.map(x => Store.memberShort(x)).join(', ')}` : '',
              remove.length ? `taken from ${remove.map(t => Store.memberShort(t.analyst)).join(', ')}` : '',
              v.self ? 'you are doing it' : '',
            ]
              .filter(Boolean)
              .join(' · ') || 'Saved',
            'good'
          );
          App.render();
        };
        if (add.length && v.due && mt.due && v.due > mt.due)
          return UI.confirm(
            `The analyst due date (${U.fmtDate(v.due)}) is later than the director's due date (${U.fmtDate(mt.due)}). Forward anyway?`,
            go
          );
        go();
      };
    },
  });
}

/* the manager checks the work and closes the director task */
function closeTask(id) {
  const mt = Store.get(id);
  if (!mt || !Chain.canClose(mt)) return UI.toast('This task is not ready to close yet', 'bad');
  UI.modal({
    title: 'Review & close',
    body: `<p><b>${h(mt.task)}</b></p>${chainView(mt)}
      <form class="grid-form" id="clf">${UI.field({ key: 'note', label: 'Note to the director (optional)', type: 'textarea', span: 2, rows: 2, placeholder: 'What was done, anything they should know' }, '')}</form>`,
    actions: `<span class="grow"></span><button class="btn" data-c>Not yet</button><button class="btn primary" data-ok>Close task</button>`,
    onMount: w => {
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelector('[data-ok]').onclick = () => {
        const note = w.querySelector('[name=note]').value.trim();
        Store.save(
          Object.assign({}, mt, {
            status: Chain.ST.DONE,
            doneDate: U.todayStr(),
            doneBy: App.me,
            closeNote: note,
            update: note || mt.update,
          })
        );
        UI.closeModal();
        UI.toast('Closed — the director sees it as done', 'good');
        App.render();
      };
    },
  });
}

/* ONE way to give managers work — used by the Director Desk, Assigned Tasks and the actions of a director's meeting.
 * opts.meeting / opts.item: the action comes from a meeting (adds "Me — personal task"; records fromMeeting) */
function assignDialog(opts = {}) {
  const m = opts.meeting;
  if (!m && !App.can('assignToManagers') && !App.isSuper()) return UI.toast("You don't have permission to assign work", 'bad');
  const who = m ? Meetings.assignees(m).filter(x => x.id !== App.me) : App.assignees();
  const today = U.todayStr();
  const projects = Scrum.visible().filter(p => !['Done', 'Canceled'].includes(p.status));
  UI.modal({
    title: m
      ? 'New action' + (opts.item ? ' — ' + opts.item.title : '')
      : App.isAED()
        ? 'Assign to directors / managers'
        : 'Assign to managers',
    wide: true,
    body: `<form id="asgf" class="grid-form">
      ${m ? '' : UI.field({ key: 'kind', label: 'Type', type: 'select', options: ['Task', 'Project'], blank: false }, 'Task')}
      ${UI.field({ key: 'urgency', label: 'Urgency / priority', type: 'select', options: ['High', 'Normal', 'Low'], blank: false }, 'Normal')}
      ${UI.field({ key: 'task', label: m ? 'What needs to be done' : 'Task / project name', type: 'text', required: true, span: 2 }, opts.task || '')}
      <div class="fld span2"><label>Who <i>*</i> <button type="button" class="btn xs ghost" id="asgall">all</button></label><div class="pick">${m ? `<label class="check"><input type="checkbox" name="who" value="${h(App.me)}"> <b>Me</b> <span class="muted small">${h(Meetings.kindLabel(Meetings.kindFor(m, App.me)))}</span></label>` : ''}${who.map(x => `<label class="check"><input type="checkbox" name="who" value="${h(x.id)}" ${opts.who === x.id ? 'checked' : ''}> ${h(Store.memberShort(x.id))} <span class="muted small">${h(Store.topRole(x.role) ? Store.titleOf(x) : Store.teamName(x.team))}${m ? ' · ' + h(Meetings.kindLabel(Meetings.kindFor(m, x.id))) : ''}</span>${Store.delegationOf(x.id) ? ` <span class="small t-warn">🌴 acting: ${h(Store.memberShort(Store.delegationOf(x.id).to))}</span>` : ''}</label>`).join('')}</div></div>
      ${UI.field({ key: 'due', label: 'Due / target date', type: 'date' }, m ? U.addDays(today, 7) : '')}
      ${UI.field({ key: 'project', label: 'Project (optional)', type: 'select', options: projects.map(p => [p.id, p.name]), blank: '— none —' }, opts.project || '')}
      ${UI.field({ key: 'comment', label: 'Instruction / description', type: 'textarea', span: 2, rows: 2 }, '')}</form>
      <p class="muted small">${m ? 'Each person gets it as shown next to their name: a director task (a manager can forward it), a To Do, a personal task, or a meeting action in their My work. Open actions come back at the next meeting of this series.' : 'Sent to several managers it stays one task ("2 of 3 managers done"); each manager can forward it to analysts or do it himself.'}</p>`,
    actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Assign</button>`,
    onMount: w => {
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelector('#asgall').onclick = () => {
        const bx = [...w.querySelectorAll('[name=who]')].filter(b => b.value !== App.me);
        const all = bx.every(b => b.checked);
        bx.forEach(b => {
          b.checked = !all;
        });
      };
      w.querySelector('[data-ok]').onclick = () => {
        const f = w.querySelector('#asgf');
        const v = UI.readForm(f, [
          { key: 'kind' },
          { key: 'urgency' },
          { key: 'task' },
          { key: 'due' },
          { key: 'project' },
          { key: 'comment' },
        ]);
        const ids = [...f.querySelectorAll('[name=who]:checked')].map(b => b.value);
        if (!v.task) return UI.toast('Write the task', 'bad');
        if (!ids.length) return UI.toast('Pick who', 'bad');
        const group = ids.filter(id => id !== App.me).length > 1 ? U.uid('grp') : '';
        const recs = ids.map(mid => {
          if (m) {
            const r = Meetings.makeAction(m, opts.item, {
              what: v.task,
              who: mid,
              due: v.due,
              urgency: v.urgency,
              project: v.project,
              note: v.comment,
            });
            if (r.c === 'mgrtask' && group) r.group = group;
            return r;
          }
          const am = Store.member(mid) || {};
          const team = Store.topRole(am.role) ? '_top' : am.team || 'apps';
          return v.kind === 'Project'
            ? {
                c: 'project',
                name: v.task,
                manager: mid,
                team,
                priority: v.urgency,
                start: today,
                due: v.due,
                description: v.comment,
                status: 'Not Started',
                progress: 0,
                updatedOn: today,
                members: [],
              }
            : {
                c: 'mgrtask',
                task: v.task,
                manager: mid,
                team,
                urgency: v.urgency,
                date: today,
                due: v.due,
                comment: v.comment,
                status: 'Open',
                group,
                project: v.project || '',
              };
        });
        Store.saveMany(recs);
        UI.closeModal();
        UI.toast(`Assigned to ${ids.length} ${ids.length > 1 ? 'people' : 'person'}`, 'good');
        App.render();
      };
    },
  });
}
