/* MAHAM — Requests & approvals (vacation, permission, training, overtime, other).
 * Flow: analyst → manager (or acting manager / anyone with approveRequests in that team) → director when the
 * type needs it (or when a manager is the requester). Approved leave / permission is written to Attendance. */
'use strict';

const Requests = {
  ST: { MGR: 'Pending manager', DIR: 'Pending director', OK: 'Completed', NO: 'Rejected', X: 'Canceled', CR: 'Cancel requested' },
  /* finished and approved ('Approved' was the earlier name of 'Completed') */
  isDone(r) {
    return r.status === Requests.ST.OK || r.status === 'Approved';
  },
  /* directors are the top approvers: nobody above them approves, so they do not raise requests */
  canRaise() {
    return !Store.topRole((Store.member(App.me) || {}).role);
  },
  types() {
    return Store.setting('settings-requests', 'types', Config.REQUEST_TYPES);
  },
  type(id) {
    return Requests.types().find(t => t.id === id) || { id, label: id || 'Request', kind: 'other' };
  },
  isPending(r) {
    return r.status === Requests.ST.MGR || r.status === Requests.ST.DIR || r.status === Requests.ST.CR;
  },
  /* approved leave can be called off: the requester asks, an approver confirms (or does it directly) */
  canAskCancel(r) {
    return (
      !!r && r.requester === App.me && Requests.isDone(r) && !!Requests.type(r.type).attendance && (r.to || r.from || '') >= U.todayStr()
    );
  },
  canCancelLeave(r) {
    return (
      !!r &&
      r.requester !== App.me &&
      (r.status === Requests.ST.CR || (Requests.isDone(r) && !!Requests.type(r.type).attendance)) &&
      (App.isSuper() || ((App.can('approveRequests') || App.isDir()) && Requests.inMyTeams(r)))
    );
  },
  /* records that call the leave off: the request is canceled and the OFF days it wrote to Attendance are removed */
  cancelLeaveRecs(r, note) {
    return [
      Object.assign({}, r, { status: Requests.ST.X, canceledBy: App.me, canceledOn: U.todayStr(), cancelNote: note || '' }),
      ...Store.all('attendance', '*')
        .filter(a => a.fromRequest === r.id || (a.permReqs || []).includes(r.id))
        .map(a => {
          if (Requests.type(r.type).kind !== 'hours') return Object.assign({}, a, { _del: true });
          // a permission: take only its hours off the day (the day itself and other permissions stay)
          const left = (a.permReqs || []).filter(x => x !== r.id);
          return Object.assign({}, a, {
            permHrs: Math.max(0, U.r2((+a.permHrs || 0) - (+r.hours || 0))),
            permReqs: left,
            fromRequest: left.length ? a.fromRequest : '',
          });
        }),
    ];
  },
  /* director step needed? the type says so, or the requester is a manager */
  needsDirector(r) {
    const m = Store.member(r.requester);
    return !!Requests.type(r.type).director || !!(m && m.role === 'manager');
  },
  firstStatus(r) {
    const m = Store.member(r.requester);
    return m && m.role === 'manager' ? Requests.ST.DIR : Requests.ST.MGR;
  },
  inMyTeams(r) {
    return Store.teamsFor(App.me).some(t => t.id === (r.team || Config.DEFAULT_TEAM));
  },
  canApproveMgr(r) {
    return (
      !!r &&
      r.status === Requests.ST.MGR &&
      r.requester !== App.me &&
      (App.isSuper() || (App.can('approveRequests') && Requests.inMyTeams(r)))
    );
  },
  canApproveDir(r) {
    return (
      !!r &&
      r.status === Requests.ST.DIR &&
      r.requester !== App.me &&
      (App.isSuper() || ((App.isDir() || App.isAED()) && App.can('approveRequests') && Requests.inMyTeams(r)))
    );
  },
  canDecide(r) {
    return Requests.canApproveMgr(r) || Requests.canApproveDir(r) || (r && r.status === Requests.ST.CR && Requests.canCancelLeave(r));
  },
  /* the status after an approval at the current step (a director approving at the manager step finishes it) */
  nextStatus(r) {
    return r.status === Requests.ST.MGR && Requests.needsDirector(r) && !App.isDir() && !App.isSuper() ? Requests.ST.DIR : Requests.ST.OK;
  },
  /* working days (Fri/Sat off) covered by a days request */
  days(r) {
    const out = [];
    if (!r.from) return out;
    const end = r.to && r.to >= r.from ? r.to : r.from;
    for (let d = r.from; d <= end && out.length < 370; d = U.addDays(d, 1)) if (!U.isOff(d)) out.push(d);
    return out;
  },
  /* attendance records written when the request is finally approved */
  attendanceFor(r) {
    const t = Requests.type(r.type);
    if (!t.attendance) return [];
    const mk = (d, patch) =>
      Object.assign(
        {},
        Store.get(`att-${d}-${r.requester}`) || { id: `att-${d}-${r.requester}`, c: 'attendance', date: d, analyst: r.requester },
        { team: r.team, fromRequest: r.id },
        patch
      );
    if (t.kind === 'days') return Requests.days(r).map(d => mk(d, { status: 'OFF', leave: r.leaveType || 'Annual', permHrs: 0 }));
    if (t.kind === 'hours' && r.from) {
      // never turn a leave day back into a working day; a second permission the same day adds its hours
      const cur = Store.get(`att-${r.from}-${r.requester}`);
      if (cur && cur.status === 'OFF') return [];
      const done = (cur && cur.permReqs) || [];
      if (done.includes(r.id)) return [];
      return [
        mk(r.from, { status: 'ON', leave: '', permHrs: U.r2((cur ? +cur.permHrs || 0 : 0) + (+r.hours || 0)), permReqs: [...done, r.id] }),
      ];
    }
    return [];
  },
  /* things a request can be about: my open To Dos and project tasks */
  relatedOptions(mid) {
    const who = mid || App.me;
    const todos = Store.all('todo', '*')
      .filter(t => t.analyst === who && t.status === 'In Progress')
      .map(t => [`todo:${t.id}`, `To Do: ${String(t.task || '').slice(0, 70)}`]);
    const pts = Store.all('ptask')
      .filter(t => t.assignee === who && t.status !== 'Done')
      .map(t => {
        const p = Store.get(t.project);
        return [`ptask:${t.id}`, `Project${p ? ' ' + p.name : ''}: #${t.n || ''} ${String(t.title || '').slice(0, 60)}`];
      });
    return todos.concat(pts);
  },
  relatedLabel(r) {
    if (!r.related) return '';
    const [kind, id] = r.related.split(':');
    const x = Store.get(id);
    if (!x) return '';
    if (kind === 'todo') return 'To Do: ' + (x.task || '');
    const p = Store.get(x.project);
    return `Project${p ? ' ' + p.name : ''}: #${x.n || ''} ${x.title || ''}`;
  },
  relatedLink(r) {
    if (!r.related) return '';
    const [kind, id] = r.related.split(':');
    const x = Store.get(id);
    if (!x) return '';
    return kind === 'ptask' ? `#/project/${x.project}` : '#/todo';
  },
  /* another pending / approved time-away request of mine that covers one of these days */
  clash(r) {
    const k = Requests.type(r.type).kind;
    if (k === 'other') return null;
    const mineDays = new Set(k === 'days' ? Requests.days(r) : [r.from]);
    return (
      Store.all('request', '*').find(
        o =>
          o.id !== r.id &&
          o.requester === r.requester &&
          (Requests.isPending(o) || Requests.isDone(o)) &&
          Requests.type(o.type).kind === 'days' &&
          Requests.type(o.type).attendance &&
          Requests.days(o).some(d => mineDays.has(d))
      ) || null
    );
  },
  /* all requests I may look at (in the team being viewed) */
  visible() {
    return Store.all('request').filter(
      r => r.requester === App.me || App.isSuper() || (Requests.inMyTeams(r) && (App.can('approveRequests') || App.isDir()))
    );
  },
  mine() {
    return Store.all('request', '*').filter(r => r.requester === App.me);
  },
  /* what is waiting for me, across every team I can approve for */
  waitingForMe() {
    return Store.all('request', '*')
      .filter(Requests.canDecide)
      .sort((a, b) => (a.from || '').localeCompare(b.from || ''));
  },
  /* approved time away (no reasons) — shown to the whole team */
  teamLeave() {
    return Store.all('request').filter(r => Requests.isDone(r) && Requests.type(r.type).kind === 'days');
  },
  when(r) {
    const t = Requests.type(r.type);
    if (t.kind === 'hours') return `${U.fmtDate(r.from)} · ${U.num(r.hours, 2)} h`;
    if (!r.from) return '';
    return r.to && r.to !== r.from
      ? `${U.fmtDate(r.from)} → ${U.fmtDate(r.to)} · ${Requests.days(r).length} working day${Requests.days(r).length === 1 ? '' : 's'}`
      : `${U.fmtDate(r.from)}${t.kind === 'days' ? ' · 1 day' : ''}`;
  },
};
