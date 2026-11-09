/* MAHAM — Time rules: when work counts as late (Admin → Time rules & holidays).
 * settings-timerules (department default) and settings-timerules-<team>: { rules, from, history: [{ from, rules }] }
 * A rule applies from the day it was saved; work given earlier keeps the rule it had (history), so past scores never move.
 * Working days skip the weekend, public holidays, the person's approved leave and confirmed "on hold" days.
 * Before START nothing changes: the old calendar-day rule stays for older To Dos. */
'use strict';

const TimeRules = {
  START: '2026-11-09',
  PRIORITIES: ['High', 'Medium', 'Normal', 'Low'],
  DEF: {
    workingDays: true,
    todo: { byPriority: { High: 2, Medium: 3, Normal: 5, Low: 10 }, byType: {}, grace: 0, dueSoon: 1 },
    helpdesk: { closingHrs: 9, longHrs: 24, byCategory: {} },
    requests: { approveDays: 2 },
    ptask: { grace: 0, riskLatePct: 20, riskDaysLeft: 7 },
    stuck: { followup: 14, quickwin: 30 },
    central: { analyst: 30, leader: 60, manager: 90, chase: 7 },
    escalate: { manager: 2, director: 5 },
    show: { todo: true, helpdesk: true, requests: true, ptask: true, quickwin: true, followup: true },
  },
  /* ---------- the rules in effect for a team on a day ---------- */
  pickAt(rec, day) {
    if (!rec || !rec.rules) return null;
    if (!rec.from || rec.from <= day) return rec.rules;
    const h = (rec.history || [])
      .filter(x => !x.from || x.from <= day)
      .sort((a, b) => String(b.from || '').localeCompare(String(a.from || '')))[0];
    return h ? h.rules : null;
  },
  merge(...parts) {
    const out = JSON.parse(JSON.stringify(TimeRules.DEF));
    for (const p of parts)
      if (p)
        for (const [k, v] of Object.entries(p))
          out[k] = v && typeof v === 'object' && !Array.isArray(v) ? Object.assign({}, out[k] || {}, v) : v;
    return out;
  },
  _cache: new Map(),
  _cacheV: -1,
  at(team, day) {
    day = day || U.todayStr();
    if (TimeRules._cacheV !== Store.ver) {
      TimeRules._cache.clear();
      TimeRules._cacheV = Store.ver;
    }
    const k = (team || 'apps') + '|' + day;
    if (TimeRules._cache.has(k)) return TimeRules._cache.get(k);
    const v = TimeRules._at(team, day);
    TimeRules._cache.set(k, v);
    return v;
  },
  _at(team, day) {
    return TimeRules.merge(
      TimeRules.pickAt(Store.get('settings-timerules'), day),
      TimeRules.pickAt(Store.get('settings-timerules-' + (team || 'apps')), day)
    );
  },
  /* the record to save: the current rules move to history (they keep applying to work given before today) */
  recordFor(team, rules) {
    const id = team ? 'settings-timerules-' + team : 'settings-timerules';
    const cur = Store.get(id) || { id, c: 'settings', history: [] };
    const today = U.todayStr();
    const hist = (cur.history || []).slice();
    if (cur.rules && cur.from !== today) hist.push({ from: cur.from || TimeRules.START, rules: cur.rules });
    return Object.assign({}, cur, { id, c: 'settings', rules, from: today, history: hist.slice(-40) });
  },
  applies(day) {
    return !!day && day >= TimeRules.START;
  },

  /* ---------- days off: weekend + holidays (working days), leave, holds ---------- */
  _leave: null,
  _leaveV: -1,
  leaveOn(mid, d) {
    if (!mid) return false;
    if (TimeRules._leaveV !== Store.ver || !TimeRules._leave) {
      const s = new Set();
      for (const a of Store.all('attendance', '*')) if (a.status === 'OFF' && a.analyst && a.date) s.add(a.analyst + '|' + a.date);
      TimeRules._leave = s;
      TimeRules._leaveV = Store.ver;
    }
    return TimeRules._leave.has(mid + '|' + d);
  },
  holds(todoId) {
    return (Store.byC.todohold || []).filter(h => h && !h._del && h.todo === todoId && h.okBy && !h.declined);
  },
  heldOn(todoId, d) {
    return TimeRules.holds(todoId).some(h => h.from <= d && (!h.to || d <= h.to));
  },
  offFn(rules, mid, todoId) {
    return d => (rules.workingDays && U.isOff(d)) || TimeRules.leaveOn(mid, d) || (todoId ? TimeRules.heldOn(todoId, d) : false);
  },
  /* n working days after start (start itself not counted) */
  addWork(start, n, off) {
    let d = start;
    let left = Math.max(0, +n || 0);
    let guard = 0;
    while (left > 0 && guard++ < 1000) {
      d = U.addDays(d, 1);
      if (!off(d)) left--;
    }
    return d;
  },
  /* working days from a to b: >0 when b is after a (late), <0 when before (days left) */
  workBetween(a, b, off) {
    if (!a || !b || a === b) return 0;
    const sign = b > a ? 1 : -1;
    let n = 0;
    let d = sign > 0 ? a : b;
    const end = sign > 0 ? b : a;
    let guard = 0;
    while (d < end && guard++ < 1500) {
      d = U.addDays(d, 1);
      if (!off(d)) n++;
    }
    return sign * n;
  },
  /* default "due in (days)" for a new To Do */
  defaultDays(team, priority, type) {
    const R = TimeRules.at(team).todo;
    if (type && R.byType && R.byType[type] != null && R.byType[type] !== '') return +R.byType[type];
    return +((R.byPriority || {})[priority || 'Normal'] ?? 5);
  },

  /* ---------- To Do: due date and lateness by the rules of the day it was given ---------- */
  adjustTodo(r, d) {
    if (!r || !TimeRules.applies(r.assigned) || !d) return d;
    const team = r.team || (Store.member(r.analyst) || {}).team || 'apps';
    const R = TimeRules.at(team, r.assigned);
    const off = TimeRules.offFn(R, r.analyst, r.id);
    const due = TimeRules.addWork(r.assigned, r.duration || 0, off);
    const ref = d.due && d.days != null ? U.addDays(d.due, d.days) : r.finish || U.todayStr(); // the finish the old rule used (incl. hand-on chains)
    const days = TimeRules.workBetween(due, ref, off);
    const grace = +(R.todo.grace || 0);
    const timing = r.task ? (days > grace ? 'Delayed' : 'On Time') : '';
    const ext = (r.extensions || []).length;
    return Object.assign({}, d, {
      due,
      days,
      timing,
      extended: ext > 0,
      extensions: ext,
      held: TimeRules.holds(r.id).length > 0,
      dueSoon: !r.finish && days <= 0 && -days <= +(R.todo.dueSoon || 0),
    });
  },

  /* ---------- late work, for escalation (manager desk at N working days late, director at M) ---------- */
  /* which kinds of late work show on the desks (Admin → Time rules → "Show on the desks"), per team */
  KINDS: [
    ['todo', 'To Do'],
    ['helpdesk', 'Help desk'],
    ['requests', 'Requests'],
    ['ptask', 'Project tasks'],
    ['quickwin', 'Quick wins'],
    ['followup', 'Follow-ups'],
  ],
  /* "Seen — remind me in 7 days": per person, on this PC */
  snoozeKey() {
    return 'bct.lateSeen.' + (App.me || '');
  },
  snoozed(id) {
    const m = LS.get(TimeRules.snoozeKey(), {});
    return !!(id && m[id] && m[id] >= U.todayStr());
  },
  snooze(id, days) {
    const m = LS.get(TimeRules.snoozeKey(), {});
    const today = U.todayStr();
    for (const k of Object.keys(m)) if (m[k] < today) delete m[k];
    m[id] = U.addDays(today, days || 7);
    LS.set(TimeRules.snoozeKey(), m);
  },
  /* the day an item last moved: its own date, or its last save if later (any note, status change or edit restarts the clock) */
  lastMove(date, r) {
    const s = r && r._ts > 1000 ? U.ds(new Date(r._ts)) : '';
    return [date || '', s].filter(Boolean).sort().pop() || '';
  },
  lateItems(teams, all) {
    const today = U.todayStr();
    const out = [];
    const tset = new Set(teams);
    const S0 = TimeRules.START;
    const lvl = (R, n) => (n >= +R.escalate.director ? 'director' : n >= +R.escalate.manager ? 'manager' : '');
    const on = (R, k) => !R.show || R.show[k] !== false;
    const push = x => {
      if (all || !TimeRules.snoozed(x.id)) out.push(x);
    };
    for (const t of Calc.todos(new Date().getFullYear())) {
      const r = t.r;
      const team = r.team || (Store.member(r.analyst) || {}).team || 'apps';
      if (!tset.has(team) || r.virtual || t.status !== 'In Progress' || !TimeRules.applies(r.assigned) || t.days <= 0) continue;
      const R = TimeRules.at(team, r.assigned);
      if (!on(TimeRules.at(team), 'todo')) continue;
      const n = t.days - +(R.todo.grace || 0);
      const l = lvl(R, n);
      if (l) push({ id: r.id, kind: 'To Do', title: r.task, who: r.analyst, team, days: n, level: l, edit: 'todo|' + r.id });
    }
    for (const team of tset) {
      const R = TimeRules.at(team);
      const off = TimeRules.offFn(R, null);
      if (on(R, 'helpdesk'))
        for (const x of Calc.helpdesk(new Date().getFullYear())) {
          const r = x.r;
          if (
            x.closed ||
            x.unassigned ||
            !x.mid ||
            ((Store.member(x.mid) || {}).team || 'apps') !== team ||
            !r.created ||
            String(r.created).slice(0, 10) < S0
          )
            continue;
          const lim = TimeRules.ramadanHrs(
            +((R.helpdesk.byCategory || {})[r.category] || R.helpdesk.longHrs || 24),
            String(r.created).slice(0, 10)
          );
          const ageH = (Date.now() - Date.parse(String(r.created).replace(' ', 'T'))) / 36e5;
          if (!(ageH > lim)) continue;
          const n = TimeRules.workBetween(U.ds(new Date(Date.parse(String(r.created).replace(' ', 'T')) + lim * 36e5)), today, off);
          const l = lvl(R, n);
          if (l) push({ id: r.id, kind: 'Help desk', title: r.subject || r.reqId || 'Request', who: x.mid, team, days: n, level: l });
        }
      if (on(R, 'requests'))
        for (const q of Store.all('request', '*')) {
          if (!Requests.isPending(q) || ((Store.member(q.requester) || {}).team || 'apps') !== team) continue;
          const since = TimeRules.lastMove(q.mgrOn || q.from, q);
          if (!since || since < S0) continue;
          const n = TimeRules.workBetween(since, today, off) - +R.requests.approveDays;
          const l = lvl(R, n);
          if (l)
            push({
              id: q.id,
              kind: 'Request',
              title: Requests.type(q.type).label + ' — ' + Store.memberShort(q.requester),
              who: q.requester,
              team,
              days: n,
              level: l,
            });
        }
      if (on(R, 'quickwin'))
        for (const q of Store.all('quickwin', team)) {
          if (!['In-Progress', 'Under Review', ''].includes(q.status || '') || !q.date || q.date < S0) continue;
          const n = TimeRules.workBetween(TimeRules.lastMove(q.date, q), today, off) - +R.stuck.quickwin;
          const l = lvl(R, n);
          if (l) push({ id: q.id, kind: 'Quick win', title: q.subject, who: q.analyst, team, days: n, level: l, edit: 'quickwin|' + q.id });
        }
      if (on(R, 'followup'))
        for (const q of Store.all('central', team)) {
          if (
            !(typeof FollowUp !== 'undefined' ? FollowUp.isOpen(q) : ['Under Review', 'Accepted', ''].includes(q.status || '')) ||
            !q.date ||
            q.date < S0
          )
            continue;
          const n =
            TimeRules.workBetween(typeof FollowUp !== 'undefined' ? FollowUp.lastTouch(q) : TimeRules.lastMove(q.date, q), today, off) -
            +R.stuck.followup;
          const l = lvl(R, n);
          if (l)
            push({
              id: q.id,
              kind: 'Follow-up',
              title: q.subject || q.reqId || 'Central follow-up',
              who: q.analyst,
              team,
              days: n,
              level: l,
              edit: 'central|' + q.id,
            });
        }
      if (on(R, 'ptask') && typeof Scrum !== 'undefined')
        for (const p of Store.all('project').filter(p => (p.team || 'apps') === team && p.status !== 'Canceled'))
          for (const k of Store.all('ptask').filter(
            k => k.project === p.id && !Scrum.isDone(k) && k.due && k.due < today && (k.createdOn || '') >= S0
          )) {
            const n = TimeRules.workBetween(k.due, today, off) - +R.ptask.grace;
            const l = lvl(R, n);
            if (l)
              push({
                id: k.id,
                kind: 'Project task',
                title: k.title + ' · ' + p.name,
                who: k.assignee,
                team,
                days: n,
                level: l,
                proj: p.id,
              });
          }
    }
    return out.sort((a, b) => b.days - a.days);
  },
  /* Ramadan: help desk hour targets stretch by normal ÷ Ramadan hours (settings-holidays.ramadan) */
  ramadanHrs(hrs, day) {
    const rm = (Store.get('settings-holidays') || {}).ramadan;
    if (!rm || !rm.from || !day || day < rm.from || day > (rm.to || rm.from) || !(+rm.hours > 0)) return hrs;
    return Math.round(((hrs * (+rm.normal || 8)) / +rm.hours) * 10) / 10;
  },
  /* a project at risk: too many late tasks, or close to its due date with work left */
  projectRisk(p) {
    const R = TimeRules.at(p.team || 'apps');
    const today = U.todayStr();
    const ts = Store.all('ptask').filter(k => k.project === p.id && k.status !== 'Canceled');
    const open = ts.filter(k => !Scrum.isDone(k));
    const late = open.filter(k => k.due && k.due < today);
    const why = [];
    if (ts.length && (late.length / ts.length) * 100 >= +R.ptask.riskLatePct) why.push(`${late.length} of ${ts.length} tasks late`);
    if (p.due && open.length && p.due >= today && TimeRules.workBetween(today, p.due, TimeRules.offFn(R, null)) <= +R.ptask.riskDaysLeft)
      why.push(`due ${U.fmtDate(p.due)} with ${open.length} task(s) open`);
    return why;
  },
};

/* the To Do clock follows the time rules (wraps the old calendar-day rule) */
(function () {
  const base = Calc.todoDerive;
  Calc.todoDerive = function (r) {
    return TimeRules.adjustTodo(r, base.apply(Calc, arguments));
  };
})();
