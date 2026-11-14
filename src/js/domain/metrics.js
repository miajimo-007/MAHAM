/* MAHAM — Derived values per record (due dates, delays, closing hours, auto comments). Results are memoised per team until data changes. */
'use strict';

const Calc = {
  _cache: {},
  invalidate() {
    Calc._cache = {};
  },
  memo(key, fn) {
    key = (App.viewTeam || '') + '|' + (App.me || '') + '|' + (App.mode || '') + '|' + key;
    if (!(key in Calc._cache)) Calc._cache[key] = fn();
    return Calc._cache[key];
  },
  /* ---------- To Do ---------- */
  todoDerive(r) {
    const due = r.assigned ? U.addDays(r.assigned, r.duration || 0) : '';
    // hand-on chains (domain/todoflow.js): handed on = done; sent back = open again until fixed; finish = last fix
    const v = typeof TodoFlow !== 'undefined' && !r.virtual && TodoFlow.has(r) ? TodoFlow.view(r) : null;
    const fin = v ? v.finish : r.finish;
    const ref = fin || U.todayStr();
    const days = due ? U.diffDays(due, ref) : null;
    const status =
      v && v.status
        ? v.status
        : r.status === 'Canceled'
          ? 'Canceled'
          : r.finish
            ? r.status === 'Ready for review'
              ? 'Ready for review'
              : 'Resolved'
            : 'In Progress';
    const timing = r.task ? (days > 0 ? 'Delayed' : 'On Time') : '';
    return { due, days, status, timing, month: U.month(r.assigned), year: U.year(r.assigned) };
  },
  /* the To Do's timing in words (instead of a bare +/− number): { text, cls } — cls t-bad late, t-warn due today */
  todoWhen(t) {
    if (!t || t.days == null || t.status === 'Canceled') return { text: '', cls: '' };
    const d = Math.abs(t.days),
      n = `${d} day${d === 1 ? '' : 's'}`,
      done = !!t.r && !!(t.r.finish || ['Resolved', 'Ready for review'].includes(t.status));
    if (done)
      return t.days > 0
        ? { text: `Done ${n} late`, cls: 't-bad' }
        : t.days < 0
          ? { text: `Done ${n} early`, cls: 't-good' }
          : { text: 'Done on the due day', cls: 't-good' };
    return t.days > 0
      ? { text: `${n} late`, cls: 't-bad' }
      : t.days < 0
        ? { text: `${n} left`, cls: '' }
        : { text: 'Due today', cls: 't-warn' };
  },
  todos(year) {
    // + the checks (validation …) each person does on To Do steps — a To Do for them too (domain/todoflow.js)
    return Calc.memo('todos' + year, () => {
      const l = Store.all('todo');
      return l
        .concat(typeof TodoFlow !== 'undefined' ? TodoFlow.checkTodos(l) : [])
        .map(r => Object.assign({ r }, Calc.todoDerive(r)))
        .filter(x => !year || x.year === year);
    });
  },
  /* ---------- Help desk (ManageEngine) ---------- */
  isClosed(st) {
    return ['closed', 'canceled', 'cancelled', 'resolved'].includes(U.lc(st));
  },
  hdDerive(r) {
    const mid = Store.memberByMeName(r.technician);
    const m = Store.member(mid);
    const bc = !!(m && m.scored && m.active !== false);
    const closed = Calc.isClosed(r.status);
    const unassigned = U.lc(r.technician) === 'not assigned' || !r.technician;
    const sameDay = unassigned || !r.resolved ? 'Open' : r.created.slice(0, 10) === r.resolved.slice(0, 10) ? 'Same' : 'Next';
    const central = U.lc(r.group) === 'central support';
    return { mid, bc, closed, unassigned, sameDay, central, hrs: r.elapsedHrs, month: U.month(r.created), year: U.year(r.created) };
  },
  helpdesk(year) {
    return Calc.memo('hd' + year, () =>
      Store.all('helpdesk')
        .map(r => Object.assign({ r }, Calc.hdDerive(r)))
        .filter(x => !year || x.year === year)
    );
  },
  /* ---------- Shadow ---------- */
  /* the groups a team's shadow work falls into: from its task type list (in that order), then any other group in the data */
  categories(team, year) {
    const out = [];
    const add = c => {
      if (c && !out.includes(c)) out.push(c);
    };
    try {
      for (const x of Store.lists(team).taskTypes || []) {
        if (/^>>>/.test(x)) continue;
        add(Calc.category(x, team));
      }
    } catch (e) {
      /* */
    }
    for (const s of Calc.shadow(year || App.year))
      if (!team || (s.r.team || (Store.member(s.r.analyst) || {}).team || 'apps') === team) add(s.cat);
    return out;
  },
  /* the group of a task type: "PA >> Meeting" → PA; a type without ">>" → the ">>>" heading it sits under in its team's
   * list, else the type itself (so a team whose types have no groups still gets one line per type, not "OTHER") */
  category(taskType, team) {
    const t = String(taskType || '').trim();
    if (!t) return '';
    const i = t.indexOf(' >>');
    if (i > 0) return t.slice(0, i);
    let head = '';
    try {
      for (const x of Store.lists(team || App.viewTeam).taskTypes || []) {
        if (/^>>>/.test(x)) head = x.replace(/[<>]/g, '').trim();
        else if (String(x).trim() === t) return head || t;
      }
    } catch (e) {
      /* lists not ready */
    }
    return t; // not in the list (an old type): its own group
  },
  shadow(year) {
    return Calc.memo('sw' + year, () =>
      Store.all('shadow')
        .map(r => ({
          r,
          month: U.month(r.date),
          year: U.year(r.date),
          cat: Calc.category(r.taskType, r.team || (Store.member(r.analyst) || {}).team),
          hrs: (+r.minutes || 0) / 60,
        }))
        .filter(x => !year || x.year === year)
    );
  },
  /* ---------- Attendance ---------- */
  attendance(year) {
    return Calc.memo('att' + year, () => Store.all('attendance').filter(r => !year || U.year(r.date) === year));
  },
  attMap(year) {
    return Calc.memo('attmap' + year, () => {
      const m = {};
      for (const r of Calc.attendance(year)) m[r.date + '|' + r.analyst] = r;
      return m;
    });
  },
  /* ---------- Quick wins / Central auto comments ---------- */
  qwComment(r) {
    if (!r.date) return '';
    if (r.managerComment) return 'Read Comment';
    const st = U.lc(r.status),
      ap = U.lc(r.approval),
      days = U.diffDays(r.date, U.todayStr());
    const t = U.todayStr();
    if (ap === 'rejected') return 'Manager Rejected';
    if (ap === '') return 'Pending Manager Approval';
    if (!r.qwId) return 'Wait for Manager approval';
    if (st === '') return 'Insert Status';
    if (!r.expected) return 'Insert Expected Date';
    if (st === 'completed') return 'Completed';
    if (st === 'rejected') return 'Rejected';
    if (st === 'in-progress' && r.expected < t) return `Overdue by ${U.diffDays(r.expected, t)} Days`;
    if (st === 'in-progress' && r.expected === t) return 'Due Today';
    if (st === 'in-progress') return `Due in ${U.diffDays(t, r.expected)} Days`;
    if (st === 'under review' && days > 90) return 'Urgent: Manager Follow-Up';
    if (st === 'under review' && days > 60) return 'Team Leader Follow-Up';
    if (st === 'under review' && days > 30) return 'Analyst Follow-Up';
    if (st === 'under review') return 'Under Review';
    return 'New';
  },
  centralDays(r) {
    return r.date ? U.diffDays(r.date, U.todayStr()) : null;
  },
  centralComment(r) {
    const st = U.lc(r.status),
      k = Calc.centralDays(r);
    if (st === 'solved' || st === 'rejected') return 'Request closed';
    if (st === 'accepted') return !r.redmine ? 'Insert Redmine No' : !r.expected ? 'Insert Expected date' : 'Waiting deployment';
    if (st === 'under review')
      return k > 90 ? 'Need Manager Follow Up' : k > 60 ? 'Need Team Leader Follow up' : k > 30 ? 'Need Analyst Follow up' : 'New';
    if (!st && r.reqId) return 'New';
    return '';
  },
  qwCompletedIds(year, mo) {
    // unique QW IDs completed + manager-accepted (Quick Wins sheet row 3)
    return new Set(
      Store.all('quickwin')
        .filter(
          q =>
            q.qwId &&
            U.lc(q.status) === 'completed' &&
            U.lc(q.approval) === 'accepted' &&
            q.expected &&
            U.year(q.expected) === year &&
            (!mo || U.month(q.expected) === mo)
        )
        .map(q => q.qwId)
    );
  },
};
