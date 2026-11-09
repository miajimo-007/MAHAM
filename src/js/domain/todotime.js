/* MAHAM — To Do time: default due days, "on hold" (the clock stops once a manager confirms), due-date
 * extensions (kept with old / new date and reason) and "ask for more time" (the manager approves or declines).
 *   todohold { todo, from, to, reason, by, okBy, okOn, declined }  — in the writer's own file
 *   todoext  { todo, days, reason, by, decided: 'ok' | 'no', decidedBy, decidedOn }
 * The trust check accepts the person's own new item, and a manager / team leader of that team deciding it. */
'use strict';

const TodoTime = {
  team(t) {
    return (t && (t.team || (Store.member(t.analyst) || {}).team)) || 'apps';
  },
  isMgrOf(t, me) {
    me = me || App.me;
    return !!t && Store.can(me, 'assignTodo') && Store.inMyTeam(t, me) && t.analyst !== me;
  },
  holdsOf(id) {
    return (Store.byC.todohold || [])
      .filter(h => h && !h._del && h.todo === id)
      .sort((a, b) => String(a.from).localeCompare(String(b.from)));
  },
  asksOf(id) {
    return (Store.byC.todoext || []).filter(x => x && !x._del && x.todo === id);
  },
  openHold(id) {
    return TodoTime.holdsOf(id).find(h => !h.declined && !h.to);
  },
  /* waiting for me (a manager): holds to confirm, time asks to answer */
  waiting(me) {
    me = me || App.me;
    const holds = (Store.byC.todohold || []).filter(h => h && !h._del && !h.okBy && !h.declined && TodoTime.isMgrOf(Store.get(h.todo), me));
    const asks = (Store.byC.todoext || []).filter(x => x && !x._del && !x.decided && TodoTime.isMgrOf(Store.get(x.todo), me));
    return { holds, asks };
  },
  /* ---------- actions ---------- */
  hold(t, reason) {
    const mgr = TodoTime.isMgrOf(t) || Store.isSuper(App.me);
    Store.save({
      c: 'todohold',
      id: `todohold-${App.me}-${Date.now()}`,
      todo: t.id,
      team: TodoTime.team(t),
      from: U.todayStr(),
      to: '',
      reason,
      by: App.me,
      okBy: mgr ? App.me : '',
      okOn: mgr ? U.todayStr() : '',
    });
    UI.toast(mgr ? 'On hold — the clock is stopped' : 'Sent to your manager — the clock stops once they confirm', 'good');
  },
  resume(h) {
    Store.save(Object.assign({}, h, { to: U.addDays(U.todayStr(), -1) < h.from ? h.from : U.addDays(U.todayStr(), -1) }));
    UI.toast('Clock running again', 'good');
  },
  decideHold(h, ok) {
    Store.save(Object.assign({}, h, ok ? { okBy: App.me, okOn: U.todayStr() } : { declined: App.me, okOn: U.todayStr() }));
    UI.toast(ok ? 'Hold confirmed — the clock is stopped' : 'Hold declined', 'good');
  },
  ask(t, days, reason) {
    Store.save({
      c: 'todoext',
      id: `todoext-${App.me}-${Date.now()}`,
      todo: t.id,
      team: TodoTime.team(t),
      days: +days,
      reason,
      by: App.me,
    });
    UI.toast('Asked your manager for more time', 'good');
  },
  decideAsk(x, ok) {
    const t = Store.get(x.todo);
    const recs = [Object.assign({}, x, { decided: ok ? 'ok' : 'no', decidedBy: App.me, decidedOn: U.todayStr() })];
    if (ok && t) recs.push(TodoTime.extend(t, (+t.duration || 0) + (+x.days || 0), x.reason || 'Asked for more time', x.by));
    Store.saveMany(recs);
    UI.toast(ok ? `Approved — ${x.days} more day(s)` : 'Declined', 'good');
  },
  /* a new due date, kept in the To Do's history */
  extend(t, duration, reason, askedBy) {
    const before = Calc.todoDerive(t).due;
    const nt = Object.assign({}, t, { duration });
    const after = Calc.todoDerive(nt).due;
    return Object.assign(nt, {
      extensions: (t.extensions || []).concat([
        {
          from: before,
          to: after,
          days: duration - (+t.duration || 0),
          reason: reason || '',
          by: App.me,
          on: U.todayStr(),
          asked: askedBy || '',
        },
      ]),
    });
  },
  /* ---------- the box in the To Do form ---------- */
  box(r) {
    if (!r || !r.id || r.virtual) return '';
    const holds = TodoTime.holdsOf(r.id);
    const asks = TodoTime.asksOf(r.id).filter(x => !x.decided);
    const ext = r.extensions || [];
    const mine = r.analyst === App.me;
    const mgr = TodoTime.isMgrOf(r) || Store.isSuper(App.me);
    const open = TodoTime.openHold(r.id);
    const d = Calc.todoDerive(r);
    if (!holds.length && !asks.length && !ext.length && !(mine || mgr)) return '';
    if (r.finish && !holds.length && !ext.length) return '';
    return `<div class="fld span2 ttime"><label>⏱ Time${TimeRules.applies(r.assigned) ? ` <span class="muted small">— due ${U.fmtDate(d.due)} (working days${d.held ? ', holds not counted' : ''})</span>` : ''}</label>
      ${ext.map(e => `<div class="small">📅 Due date moved ${U.fmtDate(e.from)} → <b>${U.fmtDate(e.to)}</b> by ${h(Store.memberShort(e.by))} on ${U.fmtDate(e.on)}${e.reason ? ` — “${h(e.reason)}”` : ''}${e.asked ? ' (asked for)' : ''}</div>`).join('')}
      ${holds
        .map(
          x => `<div class="small">⏸ On hold from ${U.fmtDate(x.from)}${x.to ? ' to ' + U.fmtDate(x.to) : ''} — “${h(x.reason || '')}” · ${x.declined ? '<span class="t-bad">declined</span>' : x.okBy ? `confirmed by ${h(Store.memberShort(x.okBy))}` : '<span class="t-warn">waiting for the manager</span>'}
        ${!x.okBy && !x.declined && mgr ? ` <button type="button" class="btn xs primary" data-thok="${h(x.id)}">Confirm</button> <button type="button" class="btn xs ghost" data-thno="${h(x.id)}">Decline</button>` : ''}${x.okBy && !x.to && (mine || mgr) ? ` <button type="button" class="btn xs" data-thend="${h(x.id)}">▶ Resume</button>` : ''}</div>`
        )
        .join('')}
      ${asks.map(x => `<div class="small">⏳ ${h(Store.memberShort(x.by))} asks for <b>${x.days}</b> more working day(s) — “${h(x.reason || '')}”${mgr ? ` <button type="button" class="btn xs primary" data-txok="${h(x.id)}">Approve</button> <button type="button" class="btn xs ghost" data-txno="${h(x.id)}">Decline</button>` : ' · waiting for the manager'}</div>`).join('')}
      ${!r.finish ? `<div class="row-btns tight">${!open && (mine || mgr) ? '<button type="button" class="btn xs" data-thnew>⏸ Put on hold…</button>' : ''}${mine && !mgr && !asks.length ? '<button type="button" class="btn xs" data-txnew>⏳ Ask for more time…</button>' : ''}</div>` : ''}
    </div>`;
  },
  bind(root, r) {
    const q = s => root.querySelector(s);
    const t = () => Store.get(r.id) || r;
    const re = () => {
      UI.closeModal();
      App.render(true);
    };
    root.querySelectorAll('[data-thok]').forEach(
      b =>
        (b.onclick = () => {
          TodoTime.decideHold(Store.get(b.dataset.thok), true);
          re();
        })
    );
    root.querySelectorAll('[data-thno]').forEach(
      b =>
        (b.onclick = () => {
          TodoTime.decideHold(Store.get(b.dataset.thno), false);
          re();
        })
    );
    root.querySelectorAll('[data-thend]').forEach(
      b =>
        (b.onclick = () => {
          TodoTime.resume(Store.get(b.dataset.thend));
          re();
        })
    );
    root.querySelectorAll('[data-txok]').forEach(
      b =>
        (b.onclick = () => {
          TodoTime.decideAsk(Store.get(b.dataset.txok), true);
          re();
        })
    );
    root.querySelectorAll('[data-txno]').forEach(
      b =>
        (b.onclick = () => {
          TodoTime.decideAsk(Store.get(b.dataset.txno), false);
          re();
        })
    );
    const ask = (title, withDays, go) => {
      const box = document.createElement('div');
      box.className = 'tt-ask';
      box.innerHTML = `<b class="small">${title}</b>${withDays ? '<input type="number" min="1" step="1" value="2" data-ttd style="width:70px"> working day(s)' : ''}<input data-ttr placeholder="Reason (needed)" style="flex:1"><button type="button" class="btn xs primary" data-ttgo>Send</button>`;
      const host = q('.ttime');
      host.appendChild(box);
      box.querySelector('[data-ttgo]').onclick = () => {
        const why = box.querySelector('[data-ttr]').value.trim();
        if (!why) return UI.toast('Write a reason', 'bad');
        go(why, withDays ? +box.querySelector('[data-ttd]').value || 1 : 0);
        re();
      };
    };
    const hn = q('[data-thnew]');
    if (hn) hn.onclick = () => ask('Put on hold — waiting on someone outside the team:', false, why => TodoTime.hold(t(), why));
    const xn = q('[data-txnew]');
    if (xn) xn.onclick = () => ask('Ask for more time:', true, (why, n) => TodoTime.ask(t(), n, why));
  },
};

/* ---------- wiring into the To Do form ---------- */
(function () {
  const S = Schemas.todo;
  if (!S) return;
  // default due days from the time rules (priority / type), until the manager types their own
  const defs = S.defaults;
  S.defaults = () => {
    const d = defs();
    d.duration = TimeRules.defaultDays(App.viewTeam || 'apps', d.priority, '');
    return d;
  };
  const fx = S.formExtra;
  S.formExtra = r => (fx ? fx(r) : '') + TodoTime.box(Store.get(r.id) || r);
  const om = S.onFormMount;
  S.onFormMount = (form, base) => {
    if (om) om(form, base);
    const m = form.closest('#modal') || document;
    TodoTime.bind(m, Store.get(base.id) || base);
    if (!base.id) {
      const du = form.querySelector('[name=duration]'),
        pr = form.querySelector('[name=priority]'),
        ty = form.querySelector('[name=ttype]');
      let touched = false;
      if (du) du.addEventListener('input', () => (touched = true));
      const upd = () => {
        if (!touched && du)
          du.value = TimeRules.defaultDays(base.team || App.viewTeam || 'apps', pr ? pr.value : 'Normal', ty ? ty.value : '');
      };
      if (pr) pr.addEventListener('change', upd);
      if (ty) ty.addEventListener('change', upd);
    } else {
      const du = form.querySelector('[name=duration]');
      const rf = form.querySelector('[name=extReason]');
      const sh = () => {
        if (rf) rf.closest('.fld').style.display = du && String(du.value) !== String(base.duration ?? '') ? '' : 'none';
      };
      if (du) du.addEventListener('input', sh);
      sh();
    }
  };
  // a reason when the manager moves the due date of an existing To Do (kept in its history)
  const iDur = S.fields.findIndex(f => f.key === 'duration');
  S.fields.splice(iDur + 1, 0, {
    mgr: true,
    key: 'extReason',
    label: 'Reason for the new due date',
    type: 'text',
    span: 2,
    placeholder: 'Kept with the To Do',
    showIf: r => !!r.id,
  });
  const bs = S.beforeSave;
  S.beforeSave = r => {
    const p = r.id && Store.get(r.id);
    if (p && !p._del && String(+p.duration || 0) !== String(+r.duration || 0) && !r._sendOn) {
      const x = TodoTime.extend(p, +r.duration || 0, r.extReason || '');
      r.extensions = x.extensions;
    }
    delete r.extReason;
    if (bs) bs(r);
  };
})();
