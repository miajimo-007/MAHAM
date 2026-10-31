/* DARRIK — Project performance metrics for one team and year (Performance → Projects).
 * Team:      active / completed projects, on-time project delivery, projects at risk, story points and tasks delivered,
 *            task on-time %, cycle time (started → done), sprint reliability (done ÷ planned points) and velocity,
 *            work in progress, overdue and unassigned tasks, points delivered per month.
 * Employee:  open / in-progress tasks, tasks and points delivered, share of the team's points, on-time %, overdue,
 *            cycle time, projects they work on / own.
 * A task "counts" in the month of its doneDate. Cycle time needs startedOn / createdOn (recorded from this version on). */
'use strict';

Object.assign(Calc, {
  projPerf(team, year) {
    const today = U.todayStr();
    const inY = d => !!d && U.year(d) === year;
    const projects = Store.all('project').filter(p => (p.team || 'apps') === team && p.status !== 'Canceled');
    const pids = new Set(projects.map(p => p.id));
    const tasks = Store.all('ptask').filter(t => pids.has(t.project) && t.status !== 'Canceled');
    const done = tasks.filter(t => Scrum.isDone(t));
    const doneY = done.filter(t => inY(t.doneDate));
    const open = tasks.filter(t => !Scrum.isDone(t));
    const started = t => t.startedOn || t.createdOn || '';
    const cyc = l => {
      const d = l.filter(t => started(t) && t.doneDate).map(t => Math.max(0, U.diffDays(started(t), t.doneDate)));
      return d.length ? U.avg(d) : null;
    };
    const onTime = l => {
      const d = l.filter(t => t.due && t.doneDate);
      return d.length ? d.filter(t => t.doneDate <= t.due).length / d.length : null;
    };
    const inProg = t => !Scrum.isDone(t) && Scrum.colIndex(t) > 0;
    // projects
    const pDone = projects.filter(p => p.status === 'Done' && inY(p.doneDate || p.updatedOn));
    const pDue = pDone.filter(p => p.due);
    const pRows = projects.map(p => {
      const d = projDerive(p);
      const it = tasks.filter(t => t.project === p.id);
      return {
        p,
        d,
        total: it.length,
        done: it.filter(t => Scrum.isDone(t)).length,
        late: it.filter(t => !Scrum.isDone(t) && t.due && t.due < today).length,
        pts: Scrum.pts(it.filter(t => Scrum.isDone(t) && inY(t.doneDate))),
      };
    });
    // sprints finished this year
    const sprints = Store.all('sprint')
      .filter(s => pids.has(s.project) && s.status === 'Completed' && inY(s.end))
      .sort((a, b) => (a.end || '').localeCompare(b.end || ''));
    const sp = sprints.map(s => {
      const it = tasks.filter(t => t.sprint === s.id);
      const plan = Scrum.pts(it);
      const got = Scrum.pts(it.filter(t => Scrum.isDone(t)));
      return { s, plan, got, rel: plan ? got / plan : null };
    });
    const rels = sp.map(x => x.rel).filter(x => x != null);
    const monthly = U.MONTHS.map((m, i) => ({ label: m, value: Scrum.pts(doneY.filter(t => U.month(t.doneDate) === i + 1)) }));
    const T = {
      active: projects.filter(p => !['Done', 'On Hold'].includes(p.status)).length,
      onHold: projects.filter(p => p.status === 'On Hold').length,
      completed: pDone.length,
      projOnTime: pDue.length ? pDue.filter(p => (p.doneDate || p.updatedOn) <= p.due).length / pDue.length : null,
      atRisk: pRows.filter(x => x.d.open && (x.d.health === 'Overdue' || x.d.health === 'Behind')).length,
      tasksDone: doneY.length,
      ptsDone: Scrum.pts(doneY),
      taskOnTime: onTime(doneY),
      cycle: cyc(doneY),
      wip: open.filter(inProg).length,
      overdue: open.filter(t => t.due && t.due < today).length,
      unassigned: open.filter(t => !t.assignee).length,
      openTasks: open.length,
      reliability: rels.length ? U.avg(rels) : null,
      velocity: sp.length ? U.avg(sp.slice(-3).map(x => x.got)) : null,
      sprints: sp.length,
    };
    // people: everyone in the team, plus anyone outside it who has tasks in its projects
    const ids = new Set([
      ...Store.visible()
        .filter(m => m.active !== false && !Store.topRole(m.role) && (m.team || 'apps') === team)
        .map(m => m.id),
      ...tasks.map(t => t.assignee).filter(Boolean),
    ]);
    const people = [...ids]
      .filter(id => Store.member(id))
      .map(id => {
        const mine = tasks.filter(t => t.assignee === id);
        const md = mine.filter(t => Scrum.isDone(t) && inY(t.doneDate));
        const mo = mine.filter(t => !Scrum.isDone(t));
        return {
          m: Store.member(id),
          open: mo.length,
          inProg: mo.filter(inProg).length,
          done: md.length,
          pts: Scrum.pts(md),
          share: T.ptsDone ? Scrum.pts(md) / T.ptsDone : null,
          onTime: onTime(md),
          overdue: mo.filter(t => t.due && t.due < today).length,
          cycle: cyc(md),
          projects: projects.filter(
            p => !['Done'].includes(p.status) && ((p.members || []).includes(id) || p.manager === id || mine.some(t => t.project === p.id))
          ).length,
          owns: projects.filter(p => p.manager === id && p.status !== 'Done').length,
        };
      })
      .sort((a, b) => b.pts - a.pts || b.done - a.done || a.m.name.localeCompare(b.m.name));
    return { T, people, pRows, sp, monthly, projects, tasks };
  },
});
