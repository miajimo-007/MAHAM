/* MAHAM — Convert a record between To Do, Shadow work and Quick win.
 * The new type's form opens filled in; on save the original is deleted from its area and the new record keeps
 * convertedFrom { c, id, title, date, by, at } ("Converted from To Do"). Undo within 15 minutes brings the original back.
 * Rules: analysts convert their own Shadow work ⇄ Quick win; anything to or from a To Do needs a manager / team leader;
 * an approved Quick win or a record in a locked month only the super admin. */
'use strict';

const Conv = {
  KINDS: { todo: 'To Do', shadow: 'Shadow work', quickwin: 'Quick win' },
  UNDO_MIN: 15,
  title(r) {
    return r.task || r.subject || '';
  },
  date(r) {
    return r.c === 'todo' ? r.finish || r.assigned : r.c === 'quickwin' ? r.date || r.expected : r.date;
  },
  locked(r) {
    const ym = Store.recMonth(r);
    return !!(ym && Store.lockMap()[`${r.team || App.viewTeam || 'apps'}|${ym}`]);
  },
  /* '' = allowed, otherwise why not */
  why(r, to) {
    if (!r || !Conv.KINDS[r.c] || !Conv.KINDS[to] || r.c === to) return 'Not possible';
    if (App.isSuper()) return '';
    if (Conv.locked(r)) return 'This month is locked — only the administrator can convert it';
    if (r.c === 'quickwin' && r.approval) return 'An approved quick win can only be converted by the administrator';
    const mgr = App.can('assignTodo');
    if ((r.c === 'todo' || to === 'todo') && !mgr) return 'Only your manager or team leader can convert to or from a To Do';
    if (!mgr && r.analyst !== App.me) return 'You can only convert your own records';
    return '';
  },
  /* the new record, filled in from the old one */
  draft(r, to) {
    const t = Conv.title(r);
    const d = Conv.date(r) || U.todayStr();
    const base = {
      c: to,
      analyst: r.analyst,
      team: r.team,
      convertedFrom: { c: r.c, id: r.id, title: t, date: Conv.date(r) || '', by: App.me, at: Date.now() },
    };
    if (to === 'shadow') return Object.assign(base, { subject: t, date: d, minutes: r.minutes || 30, ref: r.ref || r.qwId || '' });
    if (to === 'quickwin')
      return Object.assign(base, {
        subject: t,
        date: r.c === 'todo' ? r.assigned || d : d,
        expected: r.c === 'todo' ? r.finish || '' : d,
        status: (r.c === 'todo' ? r.finish : true) ? 'Completed' : 'In-Progress',
        type: 'Modification',
        impact: r.ref ? 'Ref: ' + r.ref : '',
      });
    if (to === 'todo') {
      const done = r.c === 'shadow' || U.lc(r.status) === 'completed';
      const fin = r.c === 'shadow' ? r.date : r.expected || '';
      return Object.assign(base, {
        task: t,
        assigned: r.date || d,
        duration: 0,
        fu: false,
        finish: done ? fin : '',
        status: done && fin ? 'Resolved' : 'In Progress',
        reviewedBy: done && fin ? App.me : '',
        reviewedOn: done && fin ? U.todayStr() : '',
      });
    }
    return base;
  },
  /* choose the new type, then the filled-in form */
  start(r) {
    const opts = Object.keys(Conv.KINDS)
      .filter(k => k !== r.c)
      .map(k => ({ k, why: Conv.why(r, k) }));
    UI.modal({
      title: '⇄ Convert “' + Conv.title(r).slice(0, 60) + '”',
      body: `<p class="muted small">From <b>${h(Conv.KINDS[r.c])}</b>. The new record opens filled in — check it and save. The ${h(Conv.KINDS[r.c]).toLowerCase()} is then removed and the new one shows “Converted from ${h(Conv.KINDS[r.c])}”.</p>
      <div class="row-btns">${opts.map(o => `<button class="btn ${o.why ? '' : 'primary'}" data-cvto="${o.k}" ${o.why ? `disabled title="${h(o.why)}"` : ''}>→ ${h(Conv.KINDS[o.k])}</button>`).join('')}</div>${opts.every(o => o.why) ? `<p class="note">${h(opts[0].why)}</p>` : ''}`,
      actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelectorAll('[data-cvto]').forEach(
          b =>
            (b.onclick = () => {
              const to = b.dataset.cvto;
              UI.closeModal();
              setTimeout(() => Conv.open(r, to), 0);
            })
        );
      },
    });
  },
  open(r, to) {
    const orig = Store.get(r.id);
    if (!orig) return;
    UI.editRecord(to, Conv.draft(orig, to), {
      title: `Convert to ${Conv.KINDS[to]}`,
      with: () => [Object.assign({}, Store.get(orig.id) || orig, { _del: true, convertedTo: to })],
      savedMsg: `Converted to ${Conv.KINDS[to]}`,
    });
  },
  canUndo(r) {
    const f = r && r.convertedFrom;
    return !!(f && f.by === App.me && Date.now() - (f.at || 0) < Conv.UNDO_MIN * 6e4 && Store.db.get(f.id));
  },
  undo(r) {
    const f = r.convertedFrom;
    const o = Store.db.get(f.id);
    if (!o) return;
    const back = Object.assign({}, o);
    delete back._del;
    delete back.convertedTo;
    Store.saveMany([back, Object.assign({}, r, { _del: true })]);
    UI.closeModal();
    UI.toast('Undone — back to ' + Conv.KINDS[f.c], 'good');
    App.render();
  },
  /* shown in the form and the lists */
  note(r) {
    const f = r && r.convertedFrom;
    return f
      ? `<p class="note conv">⇄ Converted from <b>${h(Conv.KINDS[f.c] || f.c)}</b>${f.date ? ' (' + U.fmtDate(f.date) + ')' : ''} by ${h(Store.memberShort(f.by))} · ${U.fmtTs(f.at)}${Conv.canUndo(r) ? ` <button class="btn xs ghost" data-cvundo>Undo</button>` : ''}</p>`
      : '';
  },
  tag(r) {
    const f = r && r.convertedFrom;
    return f ? ` <span class="badge" title="Converted from ${h(Conv.KINDS[f.c] || f.c)}">⇄ ${h(Conv.KINDS[f.c] || f.c)}</span>` : '';
  },
};
