/* MAHAM — Milestones: a ⭐ flag on To Dos, shadow work, quick wins, project tasks, meeting actions and director
 * tasks. Anyone marks their own work; managers mark or unmark anyone's. A milestone counts only once it is done. */
'use strict';

const Mile = {
  KINDS: {
    todo: 'To Do',
    shadow: 'Shadow work',
    quickwin: 'Quick win',
    ptask: 'Project task',
    action: 'Meeting action',
    mgrtask: 'Director task',
  },
  /* done? when? who? (null = not done yet) */
  done(r) {
    const ts = r._ts ? U.ds(new Date(r._ts)) : '';
    switch (r.c) {
      case 'todo':
        return r.status === 'Resolved' && r.finish ? { date: r.finish, who: [r.analyst], title: r.task } : null;
      case 'shadow':
        return r.date ? { date: r.date, who: [r.analyst], title: r.subject } : null;
      case 'quickwin':
        return U.lc(r.status) === 'completed'
          ? { date: r.expected || r.date, who: typeof QS !== 'undefined' ? QS.people(r) : [r.analyst], title: r.subject }
          : null;
      case 'ptask':
        return Scrum.isDone(r) ? { date: r.doneDate || r.updatedOn || ts, who: [r.assignee].filter(Boolean), title: r.title } : null;
      case 'action':
        return r.status === 'Done' ? { date: r.doneDate || ts, who: [r.who], title: r.title } : null;
      case 'mgrtask':
        return Chain.status(r) === Chain.ST.DONE ? { date: r.doneDate || ts, who: [r.manager], title: r.task } : null;
    }
    return null;
  },
  /* done milestones of a team in a year (each counted once) */
  list(year, team) {
    const t = team || App.viewTeam || 'apps';
    return Calc.memo('miles' + year + t, () => {
      const out = [];
      for (const c of Object.keys(Mile.KINDS))
        for (const r of Store.all(c, '*')) {
          if (!r.milestone || r.status === 'Canceled') continue;
          const d = Mile.done(r);
          if (!d || !d.date || U.year(d.date) !== year) continue;
          const rt =
            r.c === 'ptask'
              ? Scrum.teamOf(Store.get(r.project))
              : r.c === 'mgrtask'
                ? r.team
                : r.c === 'action'
                  ? (Store.member(r.who) || {}).team || 'apps'
                  : r.team || (Store.member(d.who[0]) || {}).team || 'apps';
          if (rt !== t) continue;
          out.push({ r, kind: c, date: d.date, who: d.who, title: d.title });
        }
      return out.sort((a, b) => b.date.localeCompare(a.date));
    });
  },
  forPerson(year, id, team) {
    return Mile.list(year, team).filter(x => x.who.includes(id));
  },
  /* Team Dashboard card */
  card(year) {
    const l = Mile.list(year);
    const mo = new Date().getMonth() + 1;
    const thisMonth = l.filter(x => U.month(x.date) === mo && U.year(x.date) === new Date().getFullYear()).length;
    const byKind = Object.entries(Mile.KINDS)
      .map(([k, lab]) => ({ label: lab, value: l.filter(x => x.kind === k).length }))
      .filter(x => x.value);
    const people = {};
    for (const x of l) for (const id of x.who) people[id] = (people[id] || 0) + 1;
    const byPerson = Object.entries(people)
      .map(([id, n]) => ({ label: Store.memberShort(id), value: n }))
      .sort((a, b) => b.value - a.value);
    const byMonth = U.MONTHS.map((m, i) => ({ label: m.slice(0, 3), value: l.filter(x => U.month(x.date) === i + 1).length }));
    return card(
      `⭐ Milestones — ${year} <span class="count">${l.length}</span>`,
      l.length
        ? `<div class="kpis k3">${UI.kpi('This year', l.length, 'done milestones')}${UI.kpi('This month', thisMonth, U.MONTHS[mo - 1])}${UI.kpi('People', byPerson.length, 'with a milestone')}</div>
      <div class="cols3"><div><h4>By type</h4>${UI.hbars(byKind)}</div><div><h4>By person</h4>${UI.hbars(byPerson)}</div><div><h4>By month</h4>${UI.barChart(byMonth, { height: 200, width: 380, fmt: v => U.num(v, 0) })}</div></div>
      <h4>Latest</h4>${l
        .slice(0, 15)
        .map(
          x =>
            `<div class="li click" data-edit="${h(x.kind)}|${h(x.r.id)}"><span class="ag-kind">${h(Mile.KINDS[x.kind])}</span><span class="grow">⭐ <b>${h(x.title)}</b> <span class="muted small">· ${h(x.who.map(Store.memberShort).join(', '))}</span></span><span class="muted small nw">${U.fmtDate(x.date)}</span></div>`
        )
        .join('')}`
        : empty('No milestones done yet this year. Tick ⭐ Milestone on important work — it counts here once it is done.')
    );
  },
  personCard(year, id) {
    const l = Mile.forPerson(year, id);
    return card(
      `⭐ Milestones <span class="count">${l.length}</span>`,
      l.length
        ? l
            .map(
              x =>
                `<div class="li click" data-edit="${h(x.kind)}|${h(x.r.id)}"><span class="ag-kind">${h(Mile.KINDS[x.kind])}</span><span class="grow"><b>${h(x.title)}</b></span><span class="muted small nw">${U.fmtDate(x.date)}</span></div>`
            )
            .join('')
        : empty('No milestones done this year.')
    );
  },
};
