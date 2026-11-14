/* MAHAM — Performance → Tasks overview (2026.11.12.8): the work of the team (or one person) in one place, for a
 * month or the year so far — To Do, shadow work (hours by category and source, moved here from the Shadow Works list),
 * quick wins, help desk, project tasks and follow-ups. The figures come from the same calculations as Performance and
 * the scores (Calc.perf / Calc.todos / Calc.shadow), so they match everywhere. Who sees it: like the other Performance
 * tabs (permission "View dashboards"); it can be switched off per team or person in Admin → Functions ("tasksov"). */
'use strict';

P.tasksov = () => {
  const y = App.year;
  const s = ps('tasksov');
  const per = s.per || 'ytd';
  const team = Store.scoredTeam();
  const ids = new Set(team.map(m => m.id));
  if (s.who && !ids.has(s.who)) s.who = '';
  const who = s.who || '';
  const mine = id => (who ? id === who : ids.has(id));
  const inP = d => !!d && U.year(d) === y && (per === 'ytd' || U.month(d) === +per);
  const perName = per === 'ytd' ? `${y} so far` : `${U.MONTHS[+per - 1]} ${y}`;
  const today = U.todayStr();

  // To Do (by the month it was assigned, as Performance counts it)
  const todos = Calc.todos(y).filter(t => !t.r.virtual && t.status !== 'Canceled' && mine(t.r.analyst) && inP(t.r.assigned));
  const tdDone = todos.filter(t => t.status === 'Resolved');
  const tdOpen = todos.filter(t => t.status !== 'Resolved');
  const tdLate = tdOpen.filter(t => t.due && t.due < today);
  const onTime = todos.filter(t => t.timing === 'On Time').length;
  // shadow work
  const sw = Calc.shadow(y).filter(x => mine(x.r.analyst) && inP(x.r.date));
  const swH = U.sum(sw.map(x => x.hrs));
  const group = (rows, key) =>
    [...U.groupBy(rows, key)]
      .map(([label, v]) => ({ label: label || '—', value: U.r2(U.sum(v.map(x => x.hrs))) }))
      .sort((a, b) => b.value - a.value);
  // quick wins (by their date; completed ones count by the expected date, as in Performance)
  const qws = Store.all('quickwin').filter(q => mine(q.analyst) && (inP(q.date) || inP(q.expected)));
  const qwDone = qws.filter(q => U.lc(q.status) === 'completed' && U.lc(q.approval) !== 'rejected' && inP(q.expected));
  const qwBy = [...U.groupBy(qws, q => q.status || '—')]
    .map(([label, v]) => ({ label: UI.statusLabel(label), value: v.length, color: UI.CAT_COLOR[UI.statusCat(label)] }))
    .sort((a, b) => b.value - a.value);
  // help desk (closed requests, as Performance counts them)
  const hd = Calc.helpdesk(y).filter(x => x.bc && mine(x.mid) && inP(x.r.created));
  const hdHrs = hd.map(x => x.hrs).filter(v => v != null);
  // project tasks: open now, done in the period
  const pts = Store.all('ptask').filter(
    t => t.assignee && mine(t.assignee) && t.status !== 'Canceled' && Scrum.canSee(Scrum.proj(t.project))
  );
  const ptOpen = pts.filter(t => !Scrum.isDone(t));
  const ptDone = pts.filter(t => Scrum.isDone(t) && inP(t.doneDate));
  // follow-ups open now
  const fus = Store.all('central').filter(r => mine(r.analyst) && (typeof FollowUp === 'undefined' || FollowUp.isOpen(r)));

  const pct = (a, b) => (b ? U.pct(a / b, 0) : '–');
  const kpis = `<div class="kpis k6">
    ${UI.kpi('To Do', `${tdDone.length} / ${todos.length}`, `done · on time ${pct(onTime, todos.length)}${tdLate.length ? ` · <span class="t-bad">${tdLate.length} overdue</span>` : ''}`)}
    ${UI.kpi('Shadow work', U.num(swH, 1) + ' h', `${sw.length} entr${sw.length === 1 ? 'y' : 'ies'}`)}
    ${UI.kpi('Quick wins', String(qwDone.length), `completed · ${qws.filter(q => U.lc(q.status) === 'in-progress').length} in progress`)}
    ${UI.kpi('Help desk', String(hd.length), hdHrs.length ? `avg ${U.num(U.avg(hdHrs), 1)} h to close` : 'requests')}
    ${UI.kpi('Project tasks', String(ptDone.length), `done · ${ptOpen.length} open now`)}
    ${UI.kpi('Follow-ups', String(fus.length), 'open now')}</div>`;

  const tdBy = [
    ['In Progress', tdOpen.filter(t => t.status === 'In Progress').length],
    ['Ready for review', tdOpen.filter(t => t.status === 'Ready for review').length],
    ['Resolved', tdDone.length],
    ['Overdue (open)', tdLate.length],
  ].map(([label, value]) => ({
    label: UI.statusLabel(label),
    value,
    color: /Overdue/.test(label) ? 'var(--bad)' : UI.CAT_COLOR[UI.statusCat(label)],
  }));
  // quick wins completed by month, the whole year (moved here from the Quick wins list, 2026.11.13.2): unique QW IDs, accepted
  const qwMonth = U.MONTHS.map((mn, i) => ({
    label: mn,
    value: new Set(
      Store.all('quickwin')
        .filter(
          q =>
            q.qwId &&
            mine(q.analyst) &&
            U.lc(q.status) === 'completed' &&
            U.lc(q.approval) === 'accepted' &&
            q.expected &&
            U.year(q.expected) === y &&
            U.month(q.expected) === i + 1
        )
        .map(q => q.qwId)
    ).size,
  }));
  const people = who ? team.filter(m => m.id === who) : team;
  const row = m => {
    const id = m.id;
    const td = todos.filter(t => t.r.analyst === id);
    const ot = td.filter(t => t.timing === 'On Time').length;
    return `<tr><td>${h(Store.memberShort(id))}</td><td class="num">${td.filter(t => t.status === 'Resolved').length} / ${td.length}</td><td class="num">${pct(ot, td.length)}</td><td class="num">${td.filter(t => t.status !== 'Resolved' && t.due && t.due < today).length || ''}</td>
      <td class="num">${U.num(U.sum(sw.filter(x => x.r.analyst === id).map(x => x.hrs)), 1)}</td><td class="num">${qwDone.filter(q => q.analyst === id).length || ''}</td><td class="num">${hd.filter(x => x.mid === id).length || ''}</td>
      <td class="num">${ptDone.filter(t => t.assignee === id).length || ''}</td><td class="num">${ptOpen.filter(t => t.assignee === id).length || ''}</td><td class="num">${fus.filter(r => r.analyst === id).length || ''}</td></tr>`;
  };
  const html = `<div class="page-actions">
      <label class="flt"><span>Period</span><select id="tov-per"><option value="ytd" ${per === 'ytd' ? 'selected' : ''}>${y} so far</option>${U.MONTHS.map((mn, i) => `<option value="${i + 1}" ${String(per) === String(i + 1) ? 'selected' : ''}>${mn} ${y}</option>`).join('')}</select></label>
      <label class="flt"><span>Person</span><select id="tov-who"><option value="">Whole team</option>${team.map(m => `<option value="${h(m.id)}" ${who === m.id ? 'selected' : ''}>${h(Store.memberShort(m.id))}</option>`).join('')}</select></label>
      <span class="grow"></span><span class="muted small">${h(perName)} · ${who ? h(Store.memberShort(who)) : `${team.length} people`}</span></div>
    ${kpis}
    <div class="cols2">
      ${card(
        `Shadow work by category · ${U.num(swH, 1)} h`,
        sw.length
          ? UI.hbars(
              group(sw, x => x.cat),
              { fmt: v => U.num(v, 1) }
            )
          : empty('No shadow work in this period.')
      )}
      ${card(
        'Shadow work by source (hours)',
        sw.length
          ? UI.hbars(
              group(sw, x => x.r.source),
              { fmt: v => U.num(v, 1) }
            )
          : empty('No shadow work in this period.')
      )}
      ${card('To Do by status', todos.length ? UI.hbars(tdBy, { fmt: v => U.num(v, 0) }) : empty('No To Do assigned in this period.'))}
      ${card('Quick wins by status', qws.length ? UI.hbars(qwBy, { fmt: v => U.num(v, 0) }) : empty('No quick wins in this period.'))}
    </div>
    ${card(`Quick wins completed by month — ${y}`, UI.barChart(qwMonth, { height: 130, width: 1100, fmt: v => U.num(v, 0), emptyText: 'No quick wins completed yet this year.' }))}
    ${card(
      'Per person',
      `<div class="tbl-scroll"><table class="tbl" id="tov-people"><thead><tr><th>Person</th><th class="num">To Do done</th><th class="num">On time</th><th class="num">Overdue</th><th class="num">Shadow (h)</th><th class="num">Quick wins</th><th class="num">Help desk</th><th class="num">Project tasks done</th><th class="num">Project tasks open</th><th class="num">Follow-ups open</th></tr></thead><tbody>${people.map(row).join('')}</tbody></table></div>
      <p class="muted small">To Do counts by the month it was assigned; quick wins by their expected date; help desk by the month the request was created; project tasks done by the day they were done. Open project tasks and follow-ups are as of today.</p>`
    )}`;
  return {
    title: 'Tasks overview',
    html,
    mount(root) {
      const a = root.querySelector('#tov-per');
      if (a)
        a.onchange = () => {
          ps('tasksov').per = a.value;
          App.render();
        };
      const b = root.querySelector('#tov-who');
      if (b)
        b.onchange = () => {
          ps('tasksov').who = b.value;
          App.render();
        };
    },
  };
};

/* a Performance tab, after Details */
(function addTab() {
  if (typeof PERF_TABS === 'undefined' || PERF_TABS.some(t => t[0] === 'tasksov')) return;
  const at = PERF_TABS.findIndex(t => t[0] === 'performance');
  PERF_TABS.splice(at < 0 ? PERF_TABS.length : at + 1, 0, ['tasksov', 'Tasks overview']);
})();
