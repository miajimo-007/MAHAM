/* MAHAM — Repeating / scheduled To Dos.
 * A manager sets a rule; each copy is a normal To Do created on its day:
 *   { c: 'todorule', id: 'todorule-<by>-<time>', team, by, at, analyst, task, priority, fu, instruction, ttype, wf,
 *     every: 'daily' (working days) | 'weekly' | 'monthly' | 'quarterly', start (first date; weekly → that weekday,
 *     monthly / quarterly → that day of the month), end ('' = no end), times (0 = no limit), dueDays, paused, stopped }
 * The copy for a day has a fixed id — todo-rep-<rule id>-<YYYY-MM-DD> — so it can never be made twice. It is made by the
 * MAHAM of the person it is for, the first time they open it on or after that day (missed days are caught up, up to
 * 60 days back). The trust check accepts such a copy only when it matches a rule a manager made (access/fairness.js). */
'use strict';

const TodoRules = {
  EVERY: [
    ['daily', 'Every working day'],
    ['weekly', 'Every week'],
    ['monthly', 'Every month'],
    ['quarterly', 'Every 3 months'],
  ],
  CATCHUP: 60,
  all(team) {
    return (Store.byC.todorule || []).filter(r => r && !r._del && (!team || team === '*' || (r.team || 'apps') === team));
  },
  everyLabel(r) {
    const d = U.pd(r.start);
    const wd = d ? d.toLocaleDateString('en-GB', { weekday: 'long' }) : '';
    const dm = d ? d.getDate() : '';
    return r.every === 'weekly'
      ? `Every ${wd}`
      : r.every === 'monthly'
        ? `Monthly on day ${dm}`
        : r.every === 'quarterly'
          ? `Every 3 months on day ${dm}`
          : 'Every working day';
  },
  /* occurrence dates of a rule between two dates (inclusive), in order */
  dates(r, from, to) {
    const out = [];
    if (!r || !r.start) return out;
    const start = r.start;
    const end = r.end && r.end < to ? r.end : to;
    if (end < start) return out;
    const sd = U.pd(start);
    const dom = sd.getDate();
    const push = d => {
      if (d >= start && d <= end && d >= from) out.push(d);
    };
    if (r.every === 'daily') {
      let d = start < from ? from : start;
      let guard = 0;
      while (d <= end && guard++ < 4000) {
        if (!U.isOff(d)) push(d);
        d = U.addDays(d, 1);
      }
    } else if (r.every === 'weekly') {
      let d = start;
      let guard = 0;
      while (d < from && guard++ < 4000) d = U.addDays(d, 7);
      while (d <= end && guard++ < 4000) {
        push(d);
        d = U.addDays(d, 7);
      }
    } else {
      const step = r.every === 'quarterly' ? 3 : 1;
      for (let i = 0; i < 400; i++) {
        const m = new Date(sd.getFullYear(), sd.getMonth() + i * step, 1);
        const last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
        const d = U.ds(new Date(m.getFullYear(), m.getMonth(), Math.min(dom, last)));
        if (d > end) break;
        push(d);
      }
    }
    return out;
  },
  /* number of the occurrence (0-based) — for the "times" limit */
  nth(r, date) {
    return TodoRules.dates(r, r.start, date).length - 1;
  },
  isOccurrence(r, date) {
    if (!r || !date || date < r.start || (r.end && date > r.end)) return false;
    const n = TodoRules.dates(r, date, date).length === 1;
    return n && (!r.times || TodoRules.nth(r, date) < r.times);
  },
  next(r, after) {
    if (r.paused || r.stopped) return '';
    const from = after || U.todayStr();
    const l = TodoRules.dates(r, from, U.addDays(from, 400));
    for (const d of l) {
      if (!r.times || TodoRules.nth(r, d) < r.times) return d;
      return '';
    }
    return '';
  },
  copyId(r, date) {
    return `todo-rep-${r.id}-${date}`;
  },
  /* the To Do a rule makes for a day */
  /* the rule as it was for a day: edits apply from the day they were made (hist), earlier copies keep the old wording */
  KEEP: ['analyst', 'task', 'priority', 'fu', 'instruction', 'ttype', 'wf', 'dueDays'],
  asOf(r, date) {
    let v = r;
    for (const x of r.hist || [])
      if (x.from <= date) v = Object.assign({}, r, x);
      else break;
    const first = (r.hist || [])[0];
    if (first && date < first.from && r.orig) v = Object.assign({}, r, r.orig);
    return v;
  },
  copy(r, date) {
    const v = TodoRules.asOf(r, date);
    return {
      c: 'todo',
      id: TodoRules.copyId(r, date),
      analyst: v.analyst,
      team: r.team || (Store.member(v.analyst) || {}).team || 'apps',
      task: v.task,
      priority: v.priority || 'Normal',
      fu: !!v.fu,
      instruction: v.instruction || '',
      ttype: v.ttype || '',
      wf: v.wf || '',
      assigned: date,
      duration: +v.dueDays || 0,
      status: 'In Progress',
      givenBy: r.by,
      fromRule: r.id,
    };
  },
  /* does this To Do exactly match its rule? (trust check for copies made by the person's own MAHAM) */
  validCopy(t) {
    const m = /^todo-rep-(todorule-.+)-(\d{4}-\d{2}-\d{2})$/.exec((t && t.id) || '');
    if (!m) return null;
    const src = Store._verifyRules || Store.db;
    const r = src && src.get(m[1]);
    if (!r || r._del || !TodoRules.isOccurrence(r, m[2])) return null;
    const c = TodoRules.copy(r, m[2]);
    if (t.fromRule !== r.id || t.analyst !== c.analyst || t.assigned !== m[2]) return null;
    return c;
  },
  /* make my copies due up to today */
  run() {
    if (!App.me || App.preview || !Store.usersDir) return 0;
    const today = U.todayStr();
    const from = U.addDays(today, -TodoRules.CATCHUP);
    const add = [];
    for (const r of TodoRules.all('*')) {
      if (r.analyst !== App.me || r.paused || r.stopped) continue;
      for (const d of TodoRules.dates(r, from, today)) {
        if (r.times && TodoRules.nth(r, d) >= r.times) break;
        if (r.createdOn && d < r.createdOn) continue; // never back-fill days before the rule existed
        const id = TodoRules.copyId(r, d);
        if (Store.db.has(id)) continue; // made already (or deleted on purpose)
        add.push(TodoRules.copy(r, d));
      }
    }
    if (add.length) Store.saveMany(add);
    return add.length;
  },
  canManage(r) {
    return App.isSuper() || (App.can('assignTodo') && Store.teamsFor(App.me).some(t => t.id === (r.team || 'apps')));
  },
  save(r) {
    Store.save(r);
  },
  /* the rule a "Repeat" choice in the To Do form makes */
  fromForm(out) {
    const team = out.team || (Store.member(out.analyst) || {}).team || App.viewTeam || 'apps';
    return {
      c: 'todorule',
      id: `todorule-${App.me}-${Date.now().toString(36)}`,
      team,
      by: App.me,
      at: Date.now(),
      createdOn: U.todayStr(),
      analyst: out.analyst,
      task: out.task,
      priority: out.priority || 'Normal',
      fu: !!out.fu,
      instruction: out.instruction || '',
      ttype: out.ttype || '',
      wf: out.wf || '',
      every: out.repeat,
      start: out.assigned || U.todayStr(),
      end: out.repeatEnd || '',
      times: +out.repeatTimes || 0,
      dueDays: +out.duration || 0,
    };
  },
  editRule(r) {
    const team = Store.team().filter(m => m.active !== false && (m.team || 'apps') === (r.team || 'apps'));
    const F = [
      { key: 'task', label: 'To Do', type: 'textarea', rows: 2, span: 2, required: true },
      { key: 'analyst', label: 'For', type: 'select', options: team.map(m => [m.id, Store.memberShort(m.id)]), required: true },
      { key: 'every', label: 'Repeats', type: 'select', options: TodoRules.EVERY, blank: false },
      { key: 'start', label: 'First one on', type: 'date', required: true, hint: 'Weekly: same weekday · monthly: same day of the month' },
      { key: 'end', label: 'Until (optional)', type: 'date' },
      { key: 'times', label: 'Or stop after (times, optional)', type: 'number', min: 0, step: 1 },
      { key: 'dueDays', label: 'Due in (days) for each one', type: 'number', min: 0, step: 1 },
      { key: 'priority', label: 'Priority', type: 'select', options: ['High', 'Medium', 'Normal', 'Low'], blank: false },
      { key: 'instruction', label: 'Instruction', type: 'textarea', rows: 2, span: 2 },
    ];
    const locked = r.createdOn && r.createdOn < U.todayStr(); // once copies exist, the pattern stays (old copies must keep matching it)
    const show = f =>
      locked && ['every', 'start'].includes(f.key)
        ? UI.field(Object.assign({}, f, { type: 'readonly' }), f.key === 'every' ? TodoRules.everyLabel(r) : U.fmtDate(r.start))
        : UI.field(f, r[f.key]);
    UI.modal({
      title: '↻ Repeating To Do',
      wide: true,
      body: `<form class="grid-form" id="trf">${F.map(show).join('')}</form><p class="muted small">Changes apply to the next ones; To Dos already made stay as they are.</p>`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>',
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const v = UI.readForm(w.querySelector('#trf'), locked ? F.filter(f => !['every', 'start'].includes(f.key)) : F);
          if (locked) {
            v.every = r.every;
            v.start = r.start;
          }
          if (!v.task || !v.analyst || !v.start) return UI.toast('To Do, who and the first date are needed', 'bad');
          const today = U.todayStr();
          v.times = +v.times || 0;
          v.dueDays = +v.dueDays || 0;
          // wording / person / due days change from today on; copies already made (or due before today) keep what they had
          const snap = {};
          for (const k of TodoRules.KEEP) snap[k] = v[k];
          const orig =
            r.orig ||
            (() => {
              const o = {};
              for (const k of TodoRules.KEEP) o[k] = r[k];
              return o;
            })();
          const hist = (r.hist || []).filter(x => x.from < today).concat([Object.assign({ from: today }, snap)]);
          Store.save(
            Object.assign({}, r, v, {
              orig,
              hist,
              createdOn: r.createdOn && r.createdOn < today && v.start <= today ? r.createdOn : r.createdOn || today,
            })
          );
          UI.closeModal();
          UI.toast('Saved — the next one is ' + (U.fmtDate(TodoRules.next(Store.get(r.id))) || 'not planned'), 'good');
          App.render(true);
        };
      },
    });
  },
};
