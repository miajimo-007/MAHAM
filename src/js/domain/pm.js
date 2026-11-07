/* MAHAM — Project management on top of the scrum board: health light, phases & milestones,
 * risks / issues / decisions / actions (RAID), weekly status updates, timeline (Gantt) maths, portfolio. */
'use strict';

const PM = {
  RAG: { green: ['🟢', 'On track', 'good'], amber: ['🟡', 'At risk', 'warn'], red: ['🔴', 'Off track', 'bad'] },
  phases(pid) {
    return Store.all('pphase')
      .filter(x => x.project === pid)
      .sort(
        (a, b) => (a.start || a.end || '9').localeCompare(b.start || b.end || '9') || (a.kind === 'milestone') - (b.kind === 'milestone')
      );
  },
  milestones(pid) {
    return PM.phases(pid).filter(x => x.kind === 'milestone');
  },
  raid(pid) {
    return Store.all('praid').filter(x => x.project === pid);
  },
  updates(pid) {
    return Store.all('pstatus')
      .filter(x => x.project === pid)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b._ts || 0) - (a._ts || 0));
  },
  latest(pid) {
    return PM.updates(pid)[0] || null;
  },
  mode(p) {
    return p && p.mode ? p.mode : Scrum.sprints(p && p.id).length ? 'scrum' : 'kanban';
  },
  late(x) {
    return x.status !== 'Done' && !!x.end && x.end < U.todayStr();
  },
  nextMilestone(pid) {
    return (
      PM.milestones(pid)
        .filter(m => m.status !== 'Done')
        .sort((a, b) => (a.end || '9').localeCompare(b.end || '9'))[0] || null
    );
  },
  score(r) {
    return r.kind === 'Risk' ? (+r.impact || 1) * (+r.likelihood || 1) : r.kind === 'Issue' ? (+r.impact || 1) * 3 : 0;
  },
  scoreKind(n) {
    return n >= 6 ? 'bad' : n >= 3 ? 'warn' : 'good';
  },
  openHigh(pid) {
    return PM.raid(pid).filter(r => r.status !== 'Closed' && PM.score(r) >= 6);
  },
  /* the light: the owner's latest weekly update, else worked out (overdue = red; behind, on hold or a late milestone = amber) */
  health(p) {
    const u = PM.latest(p.id);
    if (u && u.date >= U.addDays(U.todayStr(), -14)) return { k: u.health || 'green', from: 'update ' + U.fmtDate(u.date) };
    const d = projDerive(p);
    if (!d.open) return { k: 'green', from: d.health };
    if (d.health === 'Overdue') return { k: 'red', from: 'target date passed' };
    if (
      d.health === 'Behind' ||
      d.health === 'On hold' ||
      PM.phases(p.id).some(PM.late) ||
      (typeof PM2 !== 'undefined' && PM.milestones(p.id).some(m => m.status !== 'Done' && PM2.slip(p, m) > 0))
    )
      return { k: 'amber', from: d.health === 'On track' ? 'a phase or milestone is late or slipped' : d.health };
    return { k: 'green', from: 'on track' };
  },
  light(p, withText) {
    const h0 = PM.health(p);
    const [ic, txt, kind] = PM.RAG[h0.k];
    return withText
      ? `<span class="badge ${kind}" title="${h(h0.from)}">${ic} ${txt}</span>`
      : `<span title="${h(txt + ' · ' + h0.from)}">${ic}</span>`;
  },
  /* the timeline: from the earliest start to the latest end of the project, its phases and tasks */
  span(p) {
    const ds = [p.start, p.due, ...PM.phases(p.id).flatMap(x => [x.start, x.end]), ...Scrum.items(p.id).flatMap(t => [t.start, t.due])]
      .filter(Boolean)
      .sort();
    let a = ds[0] || U.todayStr(),
      b = ds[ds.length - 1] || U.addDays(a, 30);
    a = U.addDays(a, -3);
    b = U.addDays(b, 7);
    if (U.diffDays(a, b) < 28) b = U.addDays(a, 28);
    return { from: a, to: b, days: U.diffDays(a, b) };
  },
  /* tasks that start before the task they depend on is due */
  clash(t) {
    const pre = t.after && Store.get(t.after);
    return !!(pre && pre.status !== 'Done' && pre.due && (t.start || t.due) && (t.start || t.due) < pre.due);
  },
};
