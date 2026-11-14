/* MAHAM — Projects list. */
'use strict';

P.projects = sub => {
  const s = ps('proj');
  const wide = App.isSuper() || App.isDir() || App.isAED();
  const tabs = [
    ['mine', 'My projects'],
    ['team', 'Team projects'],
    ...(wide ? [['all', 'All']] : []),
    ...(App.isSuper() || App.can('seePortfolio') ? [['portfolio', 'Portfolio']] : []),
    ...(PM2.canSeeWorkload() ? [['workload', 'Workload']] : []),
    ['ideas', 'Suggestions'],
    ['lessons', 'Lessons learned'],
  ];
  const tab = tabs.some(t => t[0] === (sub || s.tab)) ? sub || s.tab : 'mine';
  const my = new Set(App.myTeams().map(t => t.id));
  const vis = Scrum.visible();
  const isMine = p => Scrum.onProject(p) || (Scrum.planner(p) && p.givenBy === App.me);
  const base =
    {
      mine: vis.filter(isMine),
      team: vis.filter(p => my.has(Scrum.teamOf(p))),
      all: vis,
      portfolio: wide ? vis : vis.filter(p => my.has(Scrum.teamOf(p))),
    }[tab] || [];
  const special = ['workload', 'ideas', 'lessons'].includes(tab);
  let rows = base.map(projDerive);
  const allRows = rows;
  if (s.mgr) rows = rows.filter(x => Scrum.onProject(x.r, s.mgr));
  if (s.team) rows = rows.filter(x => Scrum.teamOf(x.r) === s.team);
  if (s.cat) rows = rows.filter(x => (x.r.category || '') === s.cat);
  if (s.st) rows = rows.filter(x => x.r.status === s.st);
  if (s.month) rows = rows.filter(x => inMonth(x.r.due, s.month) || inMonth(x.r.start, s.month));
  if (s.open) rows = rows.filter(x => x.open);
  rows.sort((a, b) => b.open - a.open || (a.r.due || '9').localeCompare(b.r.due || '9'));
  const lights = allRows.filter(x => x.open).map(x => PM.health(x.r).k);
  const n = k => lights.filter(v => v === k).length;
  const people = () =>
    Store.visible()
      .filter(m => m.active !== false && (Store.topRole(m.role) ? wide : my.has(m.team || 'apps')))
      .filter(m => !s.team || Store.topRole(m.role) || (m.team || 'apps') === s.team)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(m => [m.id, Store.memberShort(m.id)]);
  const flt = [
    ...(App.myTeams().length > 1 ? [{ key: 'team', label: 'Team', options: () => App.myTeams().map(t => [t.id, t.name]) }] : []),
    { key: 'mgr', label: 'Person', options: people },
    {
      key: 'cat',
      label: 'Category',
      options: () => [...new Set([...Store.list('projectCategories'), ...allRows.map(x => x.r.category).filter(Boolean)])],
    },
    { key: 'st', label: 'Status', options: ['Not Started', 'In Progress', 'On Hold', 'Done', 'Canceled'] },
    { key: 'month', type: 'month' },
    { key: 'open', type: 'toggle', label: 'Open projects only', dflt: true },
  ];
  const role = p =>
    Scrum.planner(p)
      ? p.manager === App.me
        ? 'owner'
        : 'can plan'
      : (p.members || []).includes(App.me)
        ? 'member'
        : Scrum.hasTask(p)
          ? 'has a task'
          : 'view only';
  const html = `  <div class="tabs">${tabs.map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/projects/${k}" data-pltab="${k}">${l} ${(c => (c === '' ? '' : `<span class="count">${c}</span>`))({ mine: vis.filter(isMine).length, team: vis.filter(p => my.has(Scrum.teamOf(p))).length, all: vis.length, portfolio: (wide ? vis : vis.filter(p => my.has(Scrum.teamOf(p)))).length, ideas: PM2.toDecide().length || '', workload: '', lessons: '' }[k])}</a>`).join('')}</div>
  ${
    special
      ? { workload: () => PM2V.workload(), ideas: () => PM2V.requests(), lessons: () => PM2V.lessons() }[tab]()
      : `<div class="page-actions">${filterBar('proj', flt)}<span class="grow"></span>${Scrum.canCreate() ? `${PM2.templates().length ? '<button class="btn" id="fromtpl">＋ From template</button>' : ''}${addBtn('project', 'New project')}` : ''}</div>
  ${listSum([`<b>${rows.length}</b> listed`, `<b>${allRows.filter(x => x.open).length}</b> active`, `🟢 <b>${n('green')}</b> on track`, `🟡 <b class="t-warn">${n('amber')}</b> at risk`, `🔴 <b class="t-bad">${n('red')}</b> off track`], { noLink: true })}
  ${
    tab === 'portfolio'
      ? portfolio(rows)
      : UI.table({
          id: 'proj',
          rows,
          exportName: 'Projects',
          onRow: true,
          cols: [
            {
              key: 'name',
              label: 'Project',
              html: x =>
                `<b>${h(x.r.name)}</b>${x.r.update ? `<div class="muted small">💬 ${h(x.r.update)}${x.r.updatedOn ? ' · ' + U.fmtDate(x.r.updatedOn) : ''}</div>` : ''}${x.r.directorComment ? `<div class="muted small">📝 ${h(x.r.directorComment)}</div>` : ''}`,
              get: x => x.r.name,
            },
            {
              key: 'category',
              label: 'Category',
              html: x => (x.r.category ? UI.badge(x.r.category, 'cat') : ''),
              get: x => x.r.category || '',
            },
            { key: 'team', label: 'Team', get: x => Store.teamName(Scrum.teamOf(x.r)) },
            { key: 'manager', label: 'Owner', html: x => `${h(Store.memberShort(x.r.manager))}`, get: x => Store.memberShort(x.r.manager) },
            { key: 'me', label: 'Me', html: x => `<span class="muted small">${role(x.r)}</span>`, get: x => role(x.r) },
            { key: 'members', label: 'Members', cls: 'num', get: x => Scrum.people(x.r).length },
            {
              key: 'sprint',
              label: 'Current sprint',
              get: x => {
                const a = Scrum.active(x.r.id);
                return a ? a.name : '';
              },
            },
            { key: 'priority', label: 'Priority', html: x => UI.sbadge(x.r.priority), get: x => x.r.priority },
            { key: 'due', label: 'Target', get: x => U.fmtDate(x.r.due), sortVal: x => x.r.due || '' },
            {
              key: 'progress',
              label: 'Progress',
              html: x => `<div style="min-width:110px">${UI.bar(x.prog)}<span class="muted small">${x.prog}%</span></div>`,
              get: x => x.prog,
            },
            {
              key: 'lock',
              label: '',
              html: x => (x.r.restricted ? '<span title="Hidden project — only chosen people see it">🔒</span>' : ''),
              get: x => (x.r.restricted ? 'hidden' : ''),
            },
            {
              key: 'status',
              label: 'Status',
              html: x =>
                Flow.of(x.r)
                  ? `${h(Flow.stageOf(x.r).name)}${x.r.pending ? ' <span class="badge warn">approval</span>' : ''}${Flow.stuck(x.r) ? ` <span class="badge bad">${Flow.daysIn(x.r)}d</span>` : ''}`
                  : h(UI.statusLabel(x.r.status)),
              get: x => (Flow.of(x.r) ? Flow.stageOf(x.r).name : x.r.status),
            },
            {
              key: 'health',
              label: 'Health',
              html: x => (x.open ? PM.light(x.r, true) : UI.badge(x.health, healthKind(x.health))),
              get: x => (x.open ? PM.RAG[PM.health(x.r).k][1] : x.health),
            },
          ],
        }) + ''
  }`
  }${!special && !rows.length && tab === 'mine' ? '<p class="muted small">You are not on a project yet — see <b>Team projects</b> for your team\'s projects.</p>' : ''}`;
  return {
    title: 'Projects',
    html,
    mount(root) {
      root.querySelectorAll('[data-pltab]').forEach(
        a =>
          (a.onclick = () => {
            s.tab = a.dataset.pltab;
          })
      );
      if (tab === 'workload') PM2V.bindWorkload(root);
      if (tab === 'ideas') PM2V.bindRequests(root);
      if (tab === 'lessons') PM2V.bindLessons(root);
      const ft = root.querySelector('#fromtpl');
      if (ft) ft.onclick = () => PM2V.pickTemplate();
      root.querySelectorAll('[data-pfopen]').forEach(
        r =>
          (r.onclick = () => {
            location.hash = '#/project/' + r.dataset.pfopen;
          })
      );
      UI.bindTables(root, {
        proj: x => {
          location.hash = '#/project/' + x.r.id;
        },
      });
    },
  };
};

/* Portfolio: every project at a glance, grouped by team — health light, progress, next milestone, high risks, last update */
function portfolio(rows) {
  if (!rows.length) return empty('No projects match the filters.');
  const byTeam = U.groupBy(rows, x => Store.teamName(Scrum.teamOf(x.r)));
  return `${[...byTeam]
    .map(([team, l]) =>
      card(
        `${h(team)} <span class="count">${l.length}</span>`,
        `<div class="tbl-scroll"><table class="tbl"><thead><tr><th></th><th>Project</th><th>Owner</th><th>Progress</th><th>Next milestone</th><th class="num">High risks</th><th>Last update</th><th>Target</th></tr></thead><tbody>${l
          .sort(
            (a, b) =>
              ['red', 'amber', 'green'].indexOf(PM.health(a.r).k) - ['red', 'amber', 'green'].indexOf(PM.health(b.r).k) ||
              (a.r.due || '9').localeCompare(b.r.due || '9')
          )
          .map(x => {
            const p = x.r;
            const nm = PM.nextMilestone(p.id);
            const hi = PM.openHigh(p.id).length;
            const u = PM.latest(p.id);
            return `<tr class="click" data-pfopen="${h(p.id)}"><td>${PM.light(p)}</td><td><b>${h(p.name)}</b>${u && u.blockers ? `<div class="small t-bad">⛔ ${h(u.blockers.split('\n')[0])}</div>` : ''}</td><td>${h(Store.memberShort(p.manager))}</td><td style="min-width:110px">${UI.bar(x.prog)}<span class="muted small">${x.prog}%</span></td><td>${nm ? `${h(nm.name)} <span class="small ${PM.late(nm) ? 't-bad strong' : 'muted'}">${U.fmtDate(nm.end)}</span>` : '<span class="muted">–</span>'}</td><td class="num ${hi ? 't-bad strong' : ''}">${hi || ''}</td><td class="nw">${u ? `${PM.RAG[u.health || 'green'][0]} ${U.fmtDate(u.date)}` : '<span class="muted small">none</span>'}</td><td class="nw ${x.health === 'Overdue' ? 't-bad strong' : ''}">${U.fmtDate(p.due)}</td></tr>`;
          })
          .join('')}</tbody></table></div>`
      )
    )
    .join('')}`;
}
