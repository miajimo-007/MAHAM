/* MAHAM — Personal tasks (My Tasks): what a person plans for themselves. Not To Dos (those come from the
 * manager), not scored, private: only the owner sees them — and a teammate while a task is offered to them.
 *   plan     the day you will work on it (until then it waits under "Planned"; on the day it appears in My work)
 *   repeat   '', 'daily' (working days), 'weekly', 'monthly' — when one is done, the next one is planned
 *   offer    { to, note, on } — "Give to…" a teammate in the same team; they Accept (it becomes theirs) or Decline
 * Everyone writes only their own file, so an acceptance is the teammate's own copy (fromOffer = the original id)
 * and a refusal is a small hidden record of theirs (declineOf + the offer time); the original stays the giver's. */
'use strict';

const PT = {
  REPEAT: [
    ['', 'Does not repeat'],
    ['daily', 'Every working day'],
    ['weekly', 'Every week'],
    ['monthly', 'Every month'],
  ],
  REPEAT_LABEL: { daily: 'every working day', weekly: 'every week', monthly: 'every month' },
  all() {
    return Store.all('mytask');
  },
  mine(who) {
    const me = who || App.me;
    return PT.all().filter(t => t.owner === me && !t.declineOf);
  },
  /* the offer on a task and what became of it */
  acceptedCopy(t) {
    return t && t.offer ? PT.all().find(x => x.fromOffer === t.id && x.offerOn === t.offer.on) : null;
  },
  declined(t) {
    return t && t.offer ? PT.all().find(x => x.declineOf === t.id && x.offerOn === t.offer.on) : null;
  },
  offerState(t) {
    if (!t.offer) return '';
    if (PT.acceptedCopy(t)) return 'accepted';
    if (PT.declined(t)) return 'declined';
    return 'pending';
  },
  given(t) {
    return PT.offerState(t) === 'accepted';
  },
  isOpen(t) {
    return t.status === 'Open' && !t.declineOf && !PT.given(t);
  },
  planned(t, today = U.todayStr()) {
    return PT.isOpen(t) && !!t.plan && t.plan > today;
  },
  /* open and for today (no plan date, or the plan date has come) */
  today(who) {
    const d = U.todayStr();
    return PT.mine(who).filter(t => PT.isOpen(t) && (!t.plan || t.plan <= d));
  },
  /* offered to me and not answered yet */
  offersForMe() {
    return PT.all().filter(
      t => t.offer && t.offer.to === App.me && t.owner !== App.me && PT.offerState(t) === 'pending' && t.status === 'Open'
    );
  },
  /* teammates a task can be given to: same team, active, not me (analysts and team leaders) */
  teammates() {
    const me = Store.member(App.me);
    const team = (me && me.team) || 'apps';
    return Store.activeTeam().filter(
      m => m.id !== App.me && (m.team || 'apps') === team && !['manager', 'director', 'aed'].includes(m.role)
    );
  },
  late(t) {
    return !!t.due && t.due < U.todayStr();
  },

  /* ---------- actions ---------- */
  next(t) {
    // the next occurrence of a repeating task
    const from = t.plan || t.due || U.todayStr();
    let n = from;
    if (t.repeat === 'daily') {
      do {
        n = U.addDays(n, 1);
      } while (U.isOff(n));
    } else if (t.repeat === 'weekly') n = U.addDays(from, 7);
    else if (t.repeat === 'monthly') {
      const d = U.pd(from);
      const m = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      m.setDate(Math.min(d.getDate(), last));
      n = U.ds(m);
    } else return null;
    const shift = t.due && t.plan ? U.diffDays(t.plan, t.due) : 0;
    const o = Object.assign({}, t, {
      plan: n,
      due: t.due ? (t.plan ? U.addDays(n, shift) : n) : '',
      status: 'Open',
      doneDate: '',
      offer: null,
      repeatOf: t.repeatOf || t.id,
    });
    for (const k of ['id', '_ts', '_by', '_v', 'fromOffer', 'offerOn', 'loggedAs']) delete o[k];
    return o;
  },
  done(t, opts = {}) {
    const cur = Store.get(t.id) || t;
    if (cur.owner !== App.me) return;
    const recs = [Object.assign({}, cur, { status: 'Done', doneDate: U.todayStr() })];
    const nx = PT.next(cur);
    if (nx) recs.push(nx);
    Store.saveMany(recs);
    UI.toast(nx ? `Done ✓ — next one planned for ${U.fmtDate(nx.plan)}` : 'Done ✓', 'good');
    if (opts.ask !== false) PT.askLog(Store.get(cur.id) || cur);
    else App.render();
  },
  /* after Done: also log it as shadow work or a quick win (opens the form filled in) */
  askLog(t) {
    UI.modal({
      title: 'Done ✓ — log it too?',
      body: `<p><b>${h(t.title)}</b></p><p class="muted small">Personal tasks are not counted. Log it as shadow work (time) or a quick win (an improvement) if it should count.</p>`,
      actions: `<button class="btn" data-skip>No, just done</button><span class="grow"></span><button class="btn" data-qw>⚡ Log as quick win</button><button class="btn primary" data-sw>Log as shadow work</button>`,
      onMount: w => {
        w.querySelector('[data-skip]').onclick = () => {
          UI.closeModal();
          App.render();
        };
        w.querySelector('[data-sw]').onclick = () => {
          UI.closeModal();
          setTimeout(() => PT.logAs(t, 'shadow'), 0);
        };
        w.querySelector('[data-qw]').onclick = () => {
          UI.closeModal();
          setTimeout(() => PT.logAs(t, 'quickwin'), 0);
        };
      },
    });
  },
  logAs(t, to) {
    const me = Store.member(App.me) || {};
    const today = U.todayStr();
    const base = { c: to, analyst: App.me, team: me.team || App.viewTeam, fromPersonal: t.id };
    const draft =
      to === 'shadow'
        ? Object.assign(base, { subject: t.title, date: today, minutes: 30, ref: '' })
        : Object.assign(base, {
            subject: t.title,
            date: t.plan || today,
            expected: today,
            status: 'Completed',
            type: 'Modification',
            impact: t.note || '',
          });
    UI.editRecord(to, draft, {
      title: to === 'shadow' ? 'Log as shadow work' : 'Log as quick win',
      with: () => [Object.assign({}, Store.get(t.id) || t, { loggedAs: to })],
      savedMsg: to === 'shadow' ? 'Logged as shadow work' : 'Logged as a quick win',
    });
  },
  give(t) {
    const mates = PT.teammates();
    if (!mates.length) return UI.toast('Nobody else in your team to give it to', 'bad');
    UI.modal({
      title: 'Give to a teammate',
      body: `<p><b>${h(t.title)}</b></p><form class="grid-form" id="ptg">
      ${UI.field({ key: 'to', label: 'Give to', type: 'select', options: mates.map(m => [m.id, Store.memberShort(m.id)]), blank: false })}
      ${UI.field({ key: 'note', label: 'Note for them (optional)', type: 'text', span: 2, placeholder: 'e.g. you know this module better' })}</form>
      <p class="muted small">It stays yours until they accept. If they decline, it comes back to you with their reason.</p>`,
      actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Give</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const to = w.querySelector('[name=to]').value,
            note = w.querySelector('[name=note]').value.trim();
          Store.save(Object.assign({}, Store.get(t.id) || t, { offer: { to, note, on: Date.now() } }));
          UI.closeModal();
          UI.toast('Offered to ' + Store.memberShort(to), 'good');
          App.render();
        };
      },
    });
  },
  takeBack(t) {
    Store.save(Object.assign({}, Store.get(t.id) || t, { offer: null }));
    UI.toast('Taken back', 'good');
    App.render();
  },
  accept(t) {
    const o = {
      c: 'mytask',
      owner: App.me,
      title: t.title,
      plan: t.plan || '',
      due: t.due || '',
      priority: t.priority || 'Normal',
      repeat: t.repeat || '',
      note: [t.note, t.offer.note ? '↪ ' + Store.memberShort(t.owner) + ': ' + t.offer.note : ''].filter(Boolean).join('\n'),
      status: 'Open',
      fromOffer: t.id,
      offerOn: t.offer.on,
      fromWho: t.owner,
    };
    Store.save(o);
    UI.toast('Accepted — it is in your tasks now', 'good');
    App.render();
  },
  decline(t) {
    UI.modal({
      title: 'Decline: ' + t.title,
      body: `<form class="grid-form" id="ptd">${UI.field({ key: 'why', label: 'Why? (they will see it)', type: 'text', span: 2, placeholder: 'e.g. full this week' })}</form>`,
      actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Decline</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          Store.save({
            c: 'mytask',
            owner: App.me,
            title: t.title,
            status: 'Canceled',
            declineOf: t.id,
            offerOn: t.offer.on,
            why: w.querySelector('[name=why]').value.trim(),
          });
          UI.closeModal();
          UI.toast('Declined — it goes back to ' + Store.memberShort(t.owner), 'good');
          App.render();
        };
      },
    });
  },
  /* a one-line description of a task: planned day, due, repeat */
  meta(t) {
    const p = [];
    if (t.plan) p.push('planned ' + (t.plan === U.todayStr() ? 'today' : U.fmtDate(t.plan)));
    if (t.due) p.push((PT.late(t) && t.status === 'Open' ? '<b class="t-bad">overdue</b> · due ' : 'due ') + U.fmtDate(t.due));
    if (t.repeat) p.push('↻ ' + PT.REPEAT_LABEL[t.repeat]);
    if (t.fromWho) p.push('from ' + h(Store.memberShort(t.fromWho)));
    return p.join(' · ');
  },
  bind(root) {
    const get = id => Store.get(id);
    root.querySelectorAll('[data-ptdone]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          const t = get(b.dataset.ptdone);
          if (t) PT.done(t);
        })
    );
    root.querySelectorAll('[data-ptgive]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          const t = get(b.dataset.ptgive);
          if (t) PT.give(t);
        })
    );
    root.querySelectorAll('[data-ptback]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          const t = get(b.dataset.ptback);
          if (t) PT.takeBack(t);
        })
    );
    root.querySelectorAll('[data-ptacc]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          const t = get(b.dataset.ptacc);
          if (t) PT.accept(t);
        })
    );
    root.querySelectorAll('[data-ptdec]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          const t = get(b.dataset.ptdec);
          if (t) PT.decline(t);
        })
    );
    root.querySelectorAll('[data-pttoday]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          const t = get(b.dataset.pttoday);
          if (t) {
            Store.save(Object.assign({}, t, { plan: U.todayStr() }));
            App.render();
          }
        })
    );
    root.querySelectorAll('[data-ptlog]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          const t = get(b.dataset.ptlog);
          if (t) PT.askLog(t);
        })
    );
    root.querySelectorAll('[data-ptnew]').forEach(
      b =>
        (b.onclick = e => {
          e.preventDefault();
          e.stopPropagation();
          PT.add(b.dataset.ptnew || '');
        })
    );
    root.querySelectorAll('[data-mwqw]').forEach(
      b =>
        (b.onclick = e => {
          e.preventDefault();
          e.stopPropagation();
          UI.editRecord('quickwin', {});
        })
    ); // My work: ＋ Quick win (the same form as the Quick Wins page)
  },
  add(plan) {
    UI.editRecord('mytask', { owner: App.me, status: 'Open', priority: 'Normal', plan: plan || '', repeat: '' });
  },
};
