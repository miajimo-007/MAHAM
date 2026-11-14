/* MAHAM — Director Desk (also the AED desk). */
'use strict';

/* Director Desk = one page with tabs: Today · By team (all-teams board) · Tasks · Meetings */
P.director = sub => {
  const tabs = [
    ['today', 'Today'],
    ['team', 'By team'],
    ['tasks', 'Tasks'],
    ['timeline', 'Timeline'],
    ['meetings', 'Meetings'],
  ];
  const tab = tabs.some(t => t[0] === sub) ? sub : 'today';
  const inner =
    tab === 'timeline'
      ? { html: card('Project timeline', Dir.timeline()) }
      : tab === 'team'
        ? P.overview()
        : tab === 'tasks'
          ? P.mgrtasks()
          : tab === 'meetings'
            ? P.meetings(ps('dirmeet').sub || 'list')
            : directorToday();
  return {
    title: App.isAED() ? 'AED Desk' : 'Director Desk',
    html:
      `<div class="tabs desk-tabs">${tabs.map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/director/${k}">${l}</a>`).join('')}</div>` +
      inner.html,
    mount: inner.mount,
  };
};
function directorToday() {
  const y = App.year,
    today = U.todayStr();
  const saved = App.viewTeam;
  const teams = App.myTeams().map(t => {
    App.viewTeam = t.id;
    const K = Calc.kpis(y);
    const td = Calc.todos(y).filter(x => x.status === 'In Progress');
    const meta = Store.meta(t.id);
    const r = {
      t,
      mgr: Store.teamManager(t.id),
      size: Store.scoredTeam().length,
      score: K.teamScore,
      open: td.length,
      overdue: td.filter(x => x.timing === 'Delayed').length,
      onTime: K.onTime,
      closing: K.avgClosing,
      hdUpd: meta.helpdeskUpdated,
      qwPending: Store.all('quickwin').filter(q => !q.approval).length,
    };
    return r;
  });
  App.viewTeam = saved;
  const mt = mineOrAll(Store.all('mgrtask'))
    .filter(r => r.manager !== App.me)
    .map(mtDerive);
  const pj = Scrum.visible()
    .filter(r => r.manager !== App.me)
    .map(projDerive); // every project in my department
  const myTasks = Store.all('mgrtask')
    .filter(r => r.manager === App.me)
    .map(mtDerive)
    .filter(x => x.open);
  const myProj = Store.all('project')
    .filter(r => r.manager === App.me)
    .map(projDerive)
    .filter(x => x.open);
  const directors = App.isAED() || App.isSuper() ? Store.visible().filter(m => m.role === 'director' && m.active !== false) : [];
  const mtOpen = mt.filter(x => x.open);
  const quiet = []; // empty boxes become one small line
  let html = `${annBanner()}
  <div class="hello slim"><div><p class="muted">${U.fmtDate(today)} · ${h(Store.orgName())} · ${teams.length} team${teams.length === 1 ? '' : 's'}</p></div><div class="row-btns">${App.can('assignToManagers') || App.isSuper() ? '<button class="btn primary" id="dirassign">＋ Assign to managers</button>' : ''}</div></div>
  ${deskGroup(
    'need',
    'Needs you',
    'decisions and follow-ups waiting for you',
    `<!--QUIET-->${Dir.attention().length ? Dir.attentionCard() : (quiet.push('nothing needs your attention'), '')}
  ${App.isDir() && myWork().length ? myWorkCard() : ''}
  ${(() => {
    const soon = U.addDays(today, 7);
    // everything I am waiting for: open director tasks I gave (from a meeting or not) + open actions from my meetings
    const seen = new Set();
    const openAll = [
      ...mtOpen.map(x => x.r),
      ...Store.all('meeting')
        .filter(m => m.owner === App.me || App.isSuper())
        .flatMap(m => Meetings.actionsOf(m.id)),
    ].filter(t => t.c !== 'mytask' && Meetings.isOpen(t) && !seen.has(t.id) && seen.add(t.id));
    const acts = openAll
      .filter(t => Meetings.due(t) && Meetings.due(t) <= soon)
      .sort((a, b) => Meetings.due(a).localeCompare(Meetings.due(b)));
    const later = openAll.length - acts.length;
    const mine = Meetings.myTasks()
      .filter(t => t.status === 'Open')
      .sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
    const groups = U.groupBy(acts, t => Meetings.who(t));
    const fuCard =
      acts.length || later
        ? card(
            `Follow-ups due this week <span class="count">${acts.length}</span>`,
            (acts.length
              ? [...groups]
                  .map(
                    ([who, l]) =>
                      `<h4 class="act-h">${h(Store.memberShort(who))}</h4>` + l.map(t => actionRow(t, null, { from: true })).join('')
                  )
                  .join('')
              : empty(
                  openAll.length
                    ? 'Nothing overdue or due in the next 7 days.'
                    : 'Nothing to follow up yet — give a task to a manager (Director tasks) or add actions in a meeting.'
                )) +
              (later
                ? `<p class="muted small">${later} more open with a later or no due date — <a class="link" href="#/mgrtasks">see all director tasks</a>.</p>`
                : ''),
            '<a href="#/meetings/follow" class="link">Meeting actions →</a>'
          )
        : (quiet.push('no follow-ups due this week'), '');
    const btns =
      '<div class="row-btns tight"><button class="btn xs" id="dirnewtask">＋ Task</button> <button class="btn xs" id="dirnewmeet">＋ Meeting</button></div>';
    const myCard = mine.length
      ? card(
          `My tasks <span class="count">${mine.length}</span>`,
          (mine.length
            ? mine
                .slice(0, 8)
                .map(
                  t =>
                    `<div class="li click" data-edit="mytask|${h(t.id)}"><div class="grow"><b>${h(t.title)}</b><div class="muted small">${t.due ? 'Due ' + U.fmtDate(t.due) : 'No date'}${t.fromMeeting && Store.get(t.fromMeeting) ? ' · from ' + h(Store.get(t.fromMeeting).title) : ''}</div></div>${t.due && t.due < today ? UI.badge('Overdue', 'bad') : ''}<button class="btn xs" data-mydone="${h(t.id)}">✓ Done</button></div>`
                )
                .join('')
            : empty('No personal tasks.')) +
            '<div class="row-btns tight"><button class="btn xs" id="dirnewtask">＋ Task</button> <button class="btn xs" id="dirnewmeet">＋ Meeting</button></div>',
          '<a href="#/meetings/mine" class="link">All →</a>'
        )
      : (quiet.push('no personal tasks'), '');
    return fuCard && myCard
      ? `<div class="cols2">${fuCard}${myCard}</div>`
      : (fuCard || myCard) + (myCard ? '' : `<div class="oneline-btns">${btns}</div>`);
  })()}
  ${myTasks.length || myProj.length ? `<div class="cols2">${card(`From the AED <span class="count">${myTasks.length}</span>`, myTasks.length ? myTasks.map(x => `<div class="li click" data-edit="mgrtask|${h(x.r.id)}"><div class="grow"><b>${h(x.r.task)}</b><div class="muted small">${x.r.due ? 'Due ' + U.fmtDate(x.r.due) : 'No due date'}${x.r.comment ? ' · 📝 ' + h(x.r.comment) : ''}</div></div>${UI.sbadge(x.late ? 'Overdue' : x.r.status)}</div>`).join('') : empty('Nothing open.'))}${card(`My projects <span class="count">${myProj.length}</span>`, myProj.length ? myProj.map(x => `<div class="li click" data-proj="${h(x.r.id)}"><div class="grow"><b>${h(x.r.name)}</b><div style="max-width:260px">${UI.bar(x.prog)}</div></div>${UI.badge(x.health, healthKind(x.health))}</div>`).join('') : empty('None.'))}</div>` : ''}`,
    '✓ Nothing needs your attention right now.'
  )}
  ${deskGroup(
    'watch',
    'Watch',
    'before it goes wrong',
    `${(() => {
      const mine = new Set(App.myTeams().map(t => t.id));
      const ds = Store.delegations().filter(
        d =>
          Store.member(d.from) &&
          (App.isSuper() || App.isAED() || mine.has(Store.member(d.from).team || 'apps')) &&
          (!d.end || d.end >= today)
      );
      return ds.length
        ? card(
            `Managers on leave <span class="count">${ds.length}</span>`,
            `<table class="tbl"><thead><tr><th>Manager</th><th>Team</th><th>Acting</th><th>From</th><th>Until</th><th></th></tr></thead><tbody>${ds.map(d => `<tr><td><b>${h(Store.memberShort(d.from))}</b></td><td>${h(Store.teamName(Store.member(d.from).team))}</td><td>${h(Store.memberShort(d.to))}</td><td>${U.fmtDate(d.start)}</td><td>${U.fmtDate(d.end) || '—'}</td><td>${Store.delegationActive(d) ? UI.badge('Now', 'warn') : UI.badge('Planned', '')}</td></tr>`).join('')}</tbody></table><p class="muted small">Tasks and projects you give these managers go to the acting person while they are away.</p>`
          )
        : '';
    })()}
${
  !mtOpen.length
    ? (quiet.push('no open tasks with managers'), '')
    : `<div>
    ${card(
      `Open tasks you assigned <span class="count">${mtOpen.length}</span>`,
      mtOpen.length
        ? mtGroup(mtOpen)
            .sort((a, b) => b.late - a.late || (a.r.due || '9').localeCompare(b.r.due || '9'))
            .slice(0, 12)
            .map(x =>
              x.group
                ? `<div class="li"><div class="grow"><b>${h(x.r.task)}</b><div class="muted small">${x.items.length} managers${x.r.due ? ' · due ' + U.fmtDate(x.r.due) : ''}</div><div class="small">${UI.badge(x.st, x.open ? 'warn' : 'good')} ${x.items.map(y => `<span class="link click" data-edit="mgrtask|${h(y.r.id)}">${h(Store.memberShort(y.r.manager))}${y.open ? '' : ' ✓'}</span>`).join(', ')}</div></div>${x.late ? UI.badge('Overdue', 'bad') : ''}</div>`
                : (() => {
                    const lt = Chain.latest(x.r);
                    return `<div class="li click" data-edit="mgrtask|${h(x.r.id)}"><div class="grow"><b>${h(x.r.task)}</b><div class="muted small">${h(Store.memberShort(x.r.manager))} · ${h(Store.teamName(x.r.team))}${x.r.due ? ' · due ' + U.fmtDate(x.r.due) : ''}</div><div class="small">${chainBadge(x.st)}${
                      x.prog.total
                        ? ` ${x.prog.done} of ${x.prog.total} analysts done — ${h(
                            Chain.active(x.r)
                              .map(t => Store.memberShort(t.analyst) + (Chain.finished(t) ? ' ✓' : ''))
                              .join(', ')
                          )}`
                        : x.r.selfDo
                          ? ' manager is doing it'
                          : ' not forwarded yet'
                    }</div>${lt ? `<div class="small muted">💬 ${h(Store.memberShort(lt.who))}: ${h(lt.text)}</div>` : x.r.update ? `<div class="small muted">💬 ${h(x.r.update)}</div>` : ''}</div>${x.late ? UI.badge('Overdue', 'bad') : ''}</div>`;
                  })()
            )
            .join('')
        : empty('No open tasks.'),
      '<a href="#/director/tasks" class="link">All →</a>'
    )}
  </div>`
}`,
    '✓ Nothing slipping — no late tasks with managers.'
  )}
  <section class="desk-grp" data-dg="team"><div class="dg-head"><h3>The teams <span class="count">${teams.length}</span></h3></div>
  <div class="dg-sum muted small">${teams.reduce((a, t) => a + t.size, 0)} analysts · avg team score <b>${(() => {
    const v = teams.map(t => t.score).filter(x => x != null);
    return v.length ? U.num(U.avg(v), 1) : '–';
  })()}</b> YTD · <b>${mtOpen.length}</b> task${mtOpen.length === 1 ? '' : 's'} with managers${mtOpen.some(x => x.late) ? ` (<b class="t-bad">${mtOpen.filter(x => x.late).length} overdue</b>)` : ''} · <b>${pj.filter(x => x.open).length}</b> active project${pj.filter(x => x.open).length === 1 ? '' : 's'}${pj.some(x => ['Behind', 'Overdue'].includes(x.health)) ? ` (<b class="t-warn">${pj.filter(x => ['Behind', 'Overdue'].includes(x.health)).length} need attention</b>)` : ''}${teams.some(t => t.hdUpd !== today) ? ` · <span class="t-warn">${teams.filter(t => t.hdUpd !== today).length} team${teams.filter(t => t.hdUpd !== today).length === 1 ? '' : 's'} not imported today</span>` : ''}</div>
  ${card(
    'Teams',
    `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Team</th><th>Manager</th><th class="num">Analysts</th><th class="num">Team score</th><th class="num">To Do on time</th><th class="num">Avg closing</th><th class="num">Open To Do</th><th class="num">Overdue</th><th class="num">QW to approve</th><th>Help desk data</th><th></th></tr></thead><tbody>
    ${teams.map(r => `<tr><td><b>${h(r.t.name)}</b></td><td>${r.mgr ? `<button class="btn xs ghost" data-oneone="${h(r.mgr.id)}" title="Prepare a 1:1">1:1</button> ` : ''}${r.mgr ? h(Store.memberShort(r.mgr.id)) + (Store.delegationOf(r.mgr.id) ? `<div class="small t-warn">🌴 on leave${Store.delegationOf(r.mgr.id).end ? ' until ' + U.fmtDate(Store.delegationOf(r.mgr.id).end) : ''} — acting: <b>${h(Store.memberShort(Store.delegationOf(r.mgr.id).to))}</b></div>` : '') : '<span class="t-warn">no manager</span>'}</td><td class="num">${r.size}</td><td class="num ${UI.scoreClass(r.score)}">${r.score != null ? U.num(r.score, 1) : '–'}</td><td class="num">${U.pct(r.onTime, 0)}</td><td class="num">${r.closing != null ? U.num(r.closing, 2) + ' h' : '–'}</td><td class="num">${r.open}</td><td class="num ${r.overdue ? 't-bad strong' : ''}">${r.overdue}</td><td class="num">${r.qwPending}</td><td>${r.hdUpd ? (r.hdUpd === today ? UI.badge('Today', 'good') : UI.badge(U.fmtDate(r.hdUpd), 'warn')) : UI.badge('Never', '')}</td><td><button class="btn xs" data-team="${h(r.t.id)}">Dashboard →</button> <button class="btn xs ghost" data-desk="${h(r.t.id)}">Team desk →</button></td></tr>`).join('')}</tbody></table></div>`
  )}
  ${
    directors.length
      ? card(
          'Directors',
          `<table class="tbl"><thead><tr><th>Director</th><th>Teams</th><th class="num">Open tasks from you</th><th class="num">Active projects</th></tr></thead><tbody>${directors
            .map(
              d =>
                `<tr><td><b>${h(Store.memberShort(d.id))}</b></td><td>${h(
                  Store.teamsFor(d.id)
                    .map(t => t.name)
                    .join(', ')
                )}</td><td class="num">${Store.all('mgrtask').filter(r => r.manager === d.id && r.status !== 'Done').length}</td><td class="num">${Store.all('project').filter(r => r.manager === d.id && !['Done', 'Canceled'].includes(r.status)).length}</td></tr>`
            )
            .join('')}</tbody></table>`
        )
      : ''
  }
  ${
    !pj.some(x => x.open)
      ? (quiet.push('no active projects'), '')
      : card(
          'Projects',
          pj.filter(x => x.open).length
            ? `<table class="tbl"><thead><tr><th>Project</th><th>Team</th><th>Owner</th><th>Target</th><th style="width:22%">Progress</th><th>Health</th></tr></thead><tbody>${pj
                .filter(x => x.open)
                .sort((a, b) => (a.r.due || '9').localeCompare(b.r.due || '9'))
                .map(
                  x =>
                    `<tr class="click" data-proj="${h(x.r.id)}"><td><b>${h(x.r.name)}</b>${x.r.update ? `<div class="muted small">💬 ${h(x.r.update)}</div>` : ''}</td><td>${h(Store.teamName(x.r.team))}</td><td>${h(Store.memberShort(x.r.manager))}</td><td class="nw">${U.fmtDate(x.r.due)}</td><td>${UI.bar(x.prog)}<span class="muted small">${x.prog}%</span></td><td>${UI.badge(x.health, healthKind(x.health))}</td></tr>`
                )
                .join('')}</tbody></table>`
            : empty('No active projects.'),
          '<a href="#/projects" class="link">All projects →</a>'
        )
  }
  </section>`;
  html = html.replace(
    '<!--QUIET-->',
    quiet.length ? `<div class="oneline">✓ ${quiet.join(' · ').replace(/^./, c => c.toUpperCase())}</div>` : ''
  );
  return {
    title: 'Director Desk',
    html,
    mount(root) {
      bindRequests(root);
      bindMyTasks(root);
      bindAnn(root);
      root.querySelectorAll('[data-oneone]').forEach(
        b =>
          (b.onclick = e => {
            e.stopPropagation();
            location.hash = '#/oneonone/' + b.dataset.oneone;
          })
      );
      const dt = root.querySelector('#dirnewtask');
      if (dt) dt.onclick = () => myTaskDialog();
      const dm = root.querySelector('#dirnewmeet');
      if (dm) dm.onclick = () => meetingDialog(null);
      root.querySelectorAll('[data-team]').forEach(
        b =>
          (b.onclick = () => {
            App.setViewTeam(b.dataset.team);
            location.hash = '#/perf/dashboard';
          })
      );
      root.querySelectorAll('button[data-desk]').forEach(
        b =>
          (b.onclick = () => {
            App.setViewTeam(b.dataset.desk);
            location.hash = '#/manager';
          })
      );
      Dir.bind(root);
      deskEmpty(root);
      const da = root.querySelector('#dirassign');
      if (da) da.onclick = () => assignDialog();
    },
  };
}
