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
    const ref = r.finish || U.todayStr();
    const days = due ? U.diffDays(due, ref) : null;
    const status =
      r.status === 'Canceled' ? 'Canceled' : r.finish ? (r.status === 'Ready for review' ? 'Ready for review' : 'Resolved') : 'In Progress';
    const timing = r.task ? (days > 0 ? 'Delayed' : 'On Time') : '';
    return { due, days, status, timing, month: U.month(r.assigned), year: U.year(r.assigned) };
  },
  todos(year) {
    return Calc.memo('todos' + year, () =>
      Store.all('todo')
        .map(r => Object.assign({ r }, Calc.todoDerive(r)))
        .filter(x => !year || x.year === year)
    );
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
  category(taskType) {
    const t = String(taskType || '');
    const i = t.indexOf(' >>');
    return i > 0 ? t.slice(0, i) : t ? 'OTHER' : '';
  },
  shadow(year) {
    return Calc.memo('sw' + year, () =>
      Store.all('shadow')
        .map(r => ({ r, month: U.month(r.date), year: U.year(r.date), cat: Calc.category(r.taskType), hrs: (+r.minutes || 0) / 60 }))
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
