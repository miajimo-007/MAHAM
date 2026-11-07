/* MAHAM — Performance — monthly metrics per person. */
'use strict';

P.performance = () => {
  const y = App.year,
    PF = Calc.perf(y),
    team = Store.scoredTeam(),
    N = PF.N;
  const tab = ps('performance').tab || 'overview';
  const tbl = (title, f, teamF, dp = 1, fmt) => {
    const F = fmt || (v => U.num(v, dp));
    return card(
      title,
      `<div class="tbl-scroll"><table class="tbl perf"><thead><tr><th></th>${U.MONTHS.map(m => `<th class="num">${m}</th>`).join('')}<th class="num">YTD</th></tr></thead><tbody>
      <tr class="foot"><td>Team (per analyst)</td>${[...Array(12)].map((_, i) => `<td class="num">${F(teamF(PF.team[i + 1]))}</td>`).join('')}<td class="num strong">${F(teamF(PF.team.ytd))}</td></tr>
      ${team.map(m => `<tr><td>${h(Store.memberShort(m.id))}</td>${[...Array(12)].map((_, i) => `<td class="num">${F(f(PF.members[m.id][i + 1]))}</td>`).join('')}<td class="num strong">${F(f(PF.members[m.id].ytd))}</td></tr>`).join('')}</tbody></table></div>`
    );
  };
  const pctF = v => (v == null ? '' : U.pct(v, 0));
  const tabs = [
    ['overview', 'YTD summary'],
    ['todo', 'To Do'],
    ['hd', 'Help desk'],
    ['shadow', 'Shadow work'],
    ['qw', 'Quick wins'],
    ['gc', 'Good catches'],
  ];
  let body = '';
  if (tab === 'overview') {
    body =
      card(
        `Performance year to date [${y}]`,
        `<div class="tbl-scroll"><table class="tbl"><thead><tr><th></th><th class="num">To Do</th><th class="num">On-time %</th><th class="num">Help desk</th><th class="num">Closing (h)</th><th class="num">Same day</th><th class="num">Shadow (h)</th><th class="num">Quick wins</th></tr></thead><tbody>
      <tr class="foot"><td>YTD averages on ${N} team members</td><td class="num">${U.num(PF.team.ytd.todo / N, 1)}</td><td class="num">${pctF(PF.team.ytd.todo ? PF.team.ytd.onTime / PF.team.ytd.todo : null)}</td><td class="num">${U.num(PF.team.ytd.hd / N, 1)}</td><td class="num">${U.num(U.avg(PF.team.ytd.hdHrs), 2)}</td><td class="num">${pctF(PF.team.ytd.hd ? PF.team.ytd.hdSame / PF.team.ytd.hd : null)}</td><td class="num">${U.num(PF.team.ytd.swHrs / N, 1)}</td><td class="num">${PF.team.ytd.qw}</td></tr>
      ${team
        .map(m => {
          const o = PF.members[m.id].ytd;
          return `<tr><td>${h(Store.memberShort(m.id))}</td><td class="num">${o.todo}</td><td class="num">${pctF(o.todo ? o.onTime / o.todo : null)}</td><td class="num">${o.hd}</td><td class="num">${U.num(U.avg(o.hdHrs), 2)}</td><td class="num">${pctF(o.hd ? o.hdSame / o.hd : null)}</td><td class="num">${U.num(o.swHrs, 1)}</td><td class="num">${o.qw}</td></tr>`;
        })
        .join('')}</tbody></table></div>`
      ) +
      `<div class="cols2">${card(
        'Help desk requests (YTD)',
        UI.hbars(
          team.map(m => ({ label: Store.memberShort(m.id), value: PF.members[m.id].ytd.hd })),
          { fmt: v => U.num(v, 0) }
        )
      )}${card(
        'Shadow work hours (YTD)',
        UI.hbars(
          team.map(m => ({ label: Store.memberShort(m.id), value: PF.members[m.id].ytd.swHrs })),
          { fmt: v => U.num(v, 0) }
        )
      )}</div>`;
  } else if (tab === 'todo') {
    body =
      tbl(
        'To Do tasks assigned',
        o => o.todo || '',
        o => (o.todo ? o.todo / N : ''),
        1
      ) +
      tbl(
        'To Do on-time %',
        o => (o.todo ? o.onTime / o.todo : null),
        o => (o.todo ? o.onTime / o.todo : null),
        0,
        pctF
      );
  } else if (tab === 'hd') {
    body =
      tbl(
        'Help desk requests',
        o => o.hd || '',
        o => (o.hd ? o.hd / N : ''),
        1
      ) +
      tbl(
        'Help desk closing time [hours]',
        o => U.avg(o.hdHrs),
        o => U.avg(o.hdHrs),
        2
      ) +
      tbl(
        'Help desk same-day close',
        o => (o.hd ? o.hdSame / o.hd : null),
        o => (o.hd ? o.hdSame / o.hd : null),
        0,
        pctF
      );
  } else if (tab === 'shadow') {
    const cats = ['PA', 'PHYSICIAN', 'NURSING', 'PHARMACY', 'ANCILLARIES', 'ACCREDIATATION', 'COMMITTEES', 'OTHER'];
    body =
      tbl(
        'Shadow work [hours]',
        o => o.swHrs || '',
        o => (o.swHrs ? o.swHrs / N : ''),
        1
      ) +
      `<div class="cols2">${team.map(m => card(h(Store.memberShort(m.id)), `<table class="tbl perf"><thead><tr><th>Category</th>${U.MONTHS.map(x => `<th class="num">${x}</th>`).join('')}<th class="num">YTD</th></tr></thead><tbody>${cats.map(c => `<tr><td>${c}</td>${[...Array(12)].map((_, i) => `<td class="num">${U.num(PF.members[m.id][i + 1].swCat[c] || 0, 1).replace(/^0$/, '')}</td>`).join('')}<td class="num strong">${U.num(PF.members[m.id].ytd.swCat[c] || 0, 1)}</td></tr>`).join('')}</tbody></table>`)).join('')}</div>`;
  } else if (tab === 'gc') {
    const ppl = Store.visible().filter(m => m.active !== false && !Store.topRole(m.role) && (m.team || 'apps') === App.viewTeam);
    const rows = ppl.map(m => Object.assign({ m }, GC.counts(m.id, y))).sort((a, b) => b.found + b.resolved - (a.found + a.resolved));
    body = card(
      `Good catches ${y} — recognition, not scored`,
      rows.some(r => r.found || r.resolved)
        ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Person</th><th class="num">Found</th><th class="num">Resolved</th></tr></thead><tbody>${rows.map(r => `<tr><td>${h(Store.memberShort(r.m.id))}</td><td class="num">${r.found || ''}</td><td class="num">${r.resolved || ''}</td></tr>`).join('')}</tbody></table></div>`
        : empty('No good catches yet this year.')
    );
  } else if (tab === 'qw') {
    body = tbl(
      'Quick wins completed (by expected-date month)',
      o => o.qw || '',
      o => o.qw || '',
      0
    );
  }
  return {
    title: 'Performance',
    html: `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>${body}`,
    mount(root) {
      root.querySelectorAll('[data-tab]').forEach(
        b =>
          (b.onclick = () => {
            ps('performance').tab = b.dataset.tab;
            App.render();
          })
      );
    },
  };
};

/* Performance → Projects: the team as a whole, and per employee (domain/project-metrics.js) */
function projPerfView(y) {
  const R = Calc.projPerf(App.viewTeam, y);
  const T = R.T;
  const view = ps('projperf').pview || 'team';
  const pc = v => (v == null ? '–' : U.pct(v, 0));
  const n1 = v => (v == null ? '–' : U.num(v, 1));
  const kind = (v, good, ok) => (v == null ? '' : v >= good ? 'good' : v >= ok ? 'warn' : 'bad');
  const seg = `<div class="page-actions"><span class="seg"><button class="btn sm ${view === 'team' ? 'primary' : ''}" data-pview="team">👥 Whole team</button><button class="btn sm ${view === 'people' ? 'primary' : ''}" data-pview="people">👤 Per employee</button></span><span class="muted small">${h(Store.teamName(App.viewTeam))} · ${y} · ${R.projects.length} project(s), ${R.tasks.length} task(s)</span></div>`;
  if (!R.projects.length) return seg + empty(`No projects in ${Store.teamName(App.viewTeam)} yet.`);
  if (view === 'people') {
    return (
      seg +
      card(
        'Per employee',
        `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Person</th><th class="num" title="Open tasks assigned to them">Open tasks</th><th class="num" title="Moved past the first board column, not done">In progress</th><th class="num">Tasks done</th><th class="num">Points done</th><th class="num">Share of team points</th><th class="num" title="Done on or before the due date">On-time %</th><th class="num">Overdue</th><th class="num" title="Average days from started to done">Cycle time (days)</th><th class="num">Projects</th><th class="num">Owns</th></tr></thead><tbody>
      ${R.people
        .filter(x => x.open || x.done || x.projects || x.owns)
        .map(
          x =>
            `<tr><td><b>${h(Store.memberShort(x.m.id))}</b>${(x.m.team || 'apps') !== App.viewTeam ? ' <span class="muted small">(other team)</span>' : ''}</td><td class="num">${x.open || ''}</td><td class="num">${x.inProg || ''}</td><td class="num">${x.done || ''}</td><td class="num strong">${x.pts || ''}</td><td class="num">${x.share == null || !x.pts ? '' : pc(x.share)}</td><td class="num"><span class="${x.onTime == null ? '' : 't-' + kind(x.onTime, 0.85, 0.7)}">${pc(x.onTime)}</span></td><td class="num ${x.overdue ? 't-bad strong' : ''}">${x.overdue || ''}</td><td class="num">${n1(x.cycle)}</td><td class="num">${x.projects || ''}</td><td class="num">${x.owns || ''}</td></tr>`
        )
        .join('')}
    </tbody></table></div>${(() => {
      const idle = R.people.filter(x => !(x.open || x.done || x.projects || x.owns));
      return idle.length
        ? `<p class="muted small">No project work this year: ${h(idle.map(x => x.m.short || Store.memberShort(x.m.id)).join(', '))}.</p>`
        : '';
    })()}`
      ) +
      `<div class="cols2">${card(
        'Story points done (YTD)',
        UI.hbars(
          R.people.filter(x => x.pts).map(x => ({ label: Store.memberShort(x.m.id), value: x.pts })),
          { fmt: v => U.num(v, 0) }
        ) || empty('No points done yet.')
      )}${card(
        'Open work now',
        UI.hbars(
          R.people
            .filter(x => x.open)
            .map(x => ({ label: Store.memberShort(x.m.id), value: x.open, color: x.overdue ? 'var(--bad, #dc2626)' : '' })),
          { fmt: v => U.num(v, 0) }
        ) || empty('Nothing open.')
      )}</div>` +
      projGuide()
    );
  }
  return (
    seg +
    `<div class="kpis k6">
      ${UI.kpi('Active projects', T.active, `${T.completed} completed in ${y}${T.onHold ? ' · ' + T.onHold + ' on hold' : ''}`)}
      ${UI.kpi('Projects on time', pc(T.projOnTime), 'finished by their target date', kind(T.projOnTime, 0.8, 0.6))}
      ${UI.kpi('Projects at risk', T.atRisk, 'overdue or behind schedule', T.atRisk ? 'bad' : '')}
      ${UI.kpi('Points delivered', U.num(T.ptsDone, 0), `${T.tasksDone} task(s) done in ${y}`)}
      ${UI.kpi('Tasks on time', pc(T.taskOnTime), 'done by their due date', kind(T.taskOnTime, 0.85, 0.7))}
      ${UI.kpi('Cycle time', T.cycle == null ? '–' : U.num(T.cycle, 1) + ' d', 'average, started → done')}
    </div><div class="kpis k6">
      ${UI.kpi('Sprint reliability', pc(T.reliability), `done ÷ planned points · ${T.sprints} sprint(s)`, kind(T.reliability, 0.85, 0.7))}
      ${UI.kpi('Velocity', T.velocity == null ? '–' : U.num(T.velocity, 1), 'points per sprint (last 3)')}
      ${UI.kpi('Work in progress', T.wip, 'tasks being worked on now')}
      ${UI.kpi('Open tasks', T.openTasks, 'not done yet')}
      ${UI.kpi('Overdue tasks', T.overdue, 'open and past due', T.overdue ? 'bad' : '')}
      ${UI.kpi('Unassigned', T.unassigned, 'open tasks with nobody on them', T.unassigned ? 'warn' : '')}
    </div>
    <div class="cols2">${card(`Story points delivered per month — ${y}`, UI.barChart(R.monthly, { fmt: v => U.num(v, 0) }))}${card(
      'Sprint reliability (finished sprints)',
      R.sp.length
        ? UI.barChart(
            R.sp
              .slice(-12)
              .map(x => ({
                label: (x.s.name || '').slice(0, 10),
                value: x.rel == null ? 0 : Math.round(x.rel * 100),
                color: x.rel != null && x.rel < 0.7 ? 'var(--bad, #dc2626)' : '',
              })),
            { fmt: v => v + '%', target: 85 }
          )
        : empty('No finished sprints this year.')
    )}</div>
    ${card(
      'Projects',
      `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Project</th><th>Owner</th><th>Health</th><th>Progress</th><th>Target date</th><th class="num">Tasks done</th><th class="num">Overdue tasks</th><th class="num">Points done ${y}</th></tr></thead><tbody>
      ${R.pRows
        .sort((a, b) => b.d.open - a.d.open || (a.p.due || '9').localeCompare(b.p.due || '9'))
        .map(
          x =>
            `<tr class="click" data-proj="${h(x.p.id)}"><td><b>${h(x.p.name)}</b></td><td>${h(Store.memberShort(x.p.manager))} <span class="muted small">${h(Store.titleOf(Store.member(x.p.manager) || {}))}</span></td><td>${UI.badge(x.d.health, healthKind(x.d.health))}</td><td style="min-width:120px">${UI.bar(x.d.prog)} <span class="small">${x.d.prog}%</span></td><td>${U.fmtDate(x.p.due)}</td><td class="num">${x.done} / ${x.total}</td><td class="num ${x.late ? 't-bad strong' : ''}">${x.late || ''}</td><td class="num">${x.pts || ''}</td></tr>`
        )
        .join('')}
    </tbody></table></div>`
    )}` +
    projGuide()
  );
}
function projGuide() {
  return `<details class="card guide"><summary><b>What these numbers mean</b></summary><ul class="small">
    <li><b>Projects on time</b> — of the projects finished this year that had a target date, how many finished by it.</li>
    <li><b>Projects at risk</b> — open projects past their target date, or whose progress is well behind the time used.</li>
    <li><b>Points delivered</b> — story points of tasks finished this year; the fairest measure of output (a big task counts more than a small one).</li>
    <li><b>Tasks on time</b> — tasks with a due date finished on or before it. Aim for 85% or more.</li>
    <li><b>Cycle time</b> — average days from when a task was started (moved past the first column) to done. Lower is better; it is measured for tasks started from this version on.</li>
    <li><b>Sprint reliability</b> — in each finished sprint, points done ÷ points planned. Around 85–100% means the team plans realistically.</li>
    <li><b>Velocity</b> — points done per sprint (average of the last 3); use it to plan the next sprint.</li>
    <li><b>Work in progress / Overdue / Unassigned</b> — what needs attention now: too much in progress slows everything, overdue needs a decision, unassigned needs an owner.</li>
    <li><b>Per employee</b> — the same measures for each person, plus their share of the team's points and how many projects they are on. Use it for balance and support, not as a ranking: points depend on the tasks people are given.</li></ul></details>`;
}

/* Project Performance — its own function (menu → Performance), so a team can have only this one (Admin → Functions) */
P.projperf = () => ({
  title: 'Project Performance',
  html: projPerfView(App.year),
  mount(root) {
    root.querySelectorAll('[data-pview]').forEach(
      b =>
        (b.onclick = () => {
          ps('projperf').pview = b.dataset.pview;
          App.render();
        })
    );
  },
});

/* Performance = one menu item; each tab is a function that can be switched off per team / person (Admin → Functions) */
const PERF_TABS = [
  ['dashboard', 'Team Dashboard'],
  ['employee', 'Employee'],
  ['performance', 'Details'],
  ['lazy', 'Lazy Days'],
  ['projperf', 'Projects'],
];
P.perf = sub => {
  const tabs = PERF_TABS.filter(([k]) => App.pageAllowed(k));
  if (!tabs.length) return { title: 'Performance', html: empty('Not available.') };
  const tab = tabs.some(t => t[0] === sub) ? sub : (tabs.find(t => t[0] === ps('perfhub').tab) || tabs[0])[0];
  ps('perfhub').tab = tab;
  const inner = P[tab]();
  return {
    title: 'Performance',
    html:
      `<div class="tabs desk-tabs">${tabs.map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/perf/${k}">${l}</a>`).join('')}</div>` +
      inner.html,
    mount: inner.mount,
  };
};
