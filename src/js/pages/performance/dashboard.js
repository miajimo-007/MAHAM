/* DARRIK — Team Dashboard — team score, monthly heat map, score locking. */
'use strict';

P.dashboard = () => {
  // a team that works only in projects (To Do and help desk hidden for it): its dashboard is the project dashboard
  if (Store.teamLevel(App.viewTeam, 'todo') === 'hide' && Store.teamLevel(App.viewTeam, 'helpdesk') === 'hide') {
    const pg = P.projperf();
    return {
      title: 'Team Dashboard',
      html:
        `<div class="insights"><div>◈ ${h(Store.teamName(App.viewTeam))} works in projects, so its dashboard shows project performance.</div></div>` +
        pg.html,
      mount: pg.mount,
    };
  }
  const y = App.year;
  const K = Calc.kpis(y);
  const heat = Calc.heatmap(y);
  const S = Calc.scoring();
  const ranked = heat.rows.filter(r => r.avg != null).sort((a, b) => b.avg - a.avg);
  const onTarget = K.avgClosing != null && K.avgClosing <= S.closingTargetHrs;
  const meta = Store.meta();
  const upd = meta.helpdeskUpdated;
  const ins = [];
  const TT = Custom.target('teamScore'); // team score target (Admin → Customize)
  if (K.teamScore != null)
    ins.push(
      `${K.teamScore >= TT ? '🟢' : '🔴'} Team score <b>${U.num(K.teamScore, 1)}</b>, ${K.teamScore >= TT ? 'at or above' : 'below'} the ${TT} target.`
    );
  if (K.avgClosing != null)
    ins.push(
      `${onTarget ? '🟢' : '🔴'} Average closing <b>${U.num(K.avgClosing, 2)} h</b> — ${onTarget ? 'within' : 'above'} the ${S.closingTargetHrs} h target${K.period ? ' (' + h(K.period) + ')' : ''}.`
    );
  if (ranked[0]) ins.push(`🏆 Top performer: <b>${h(Store.memberShort(ranked[0].m.id))}</b> (${U.num(ranked[0].avg, 2)}).`);
  if (K.closedPct != null)
    ins.push(
      K.closedPct >= 0.95
        ? `✓ Closure rate is excellent at ${U.pct(K.closedPct, 2)}.`
        : K.closedPct >= 0.9
          ? `⚠ Closure rate is acceptable at ${U.pct(K.closedPct, 2)}, but requires monitoring.`
          : `🔴 Closure rate is below target at ${U.pct(K.closedPct, 2)}.`
    );
  if (K.onTime != null)
    ins.push(
      K.onTime >= 0.95
        ? `✓ On-time compliance remains excellent at ${U.pct(K.onTime, 2)}.`
        : `⚠ On-time compliance is ${U.pct(K.onTime, 2)} — check delayed tasks.`
    );
  if (K.sameDay != null)
    ins.push(
      K.sameDay >= 0.8
        ? `✓ Same-day closure is strong at ${U.pct(K.sameDay, 1)}.`
        : `⚠ Same-day closure is ${U.pct(K.sameDay, 1)} and needs improvement.`
    );
  const html = `
  <div class="kpis k8">
    ${UI.kpi('Team score', K.teamScore != null ? U.num(K.teamScore, 1) : '–', 'YTD average', UI.scoreClass(K.teamScore))}
    ${UI.kpi('YTD requests', K.requests.toLocaleString(), `${K.bcRequests.toLocaleString()} by the team`)}
    ${UI.kpi('Closed', U.pct(K.closedPct, 2), 'of team requests')}
    ${UI.kpi('Avg closing', U.num(K.avgClosing, 2) + ' h', `target ≤ ${S.closingTargetHrs} h`, onTarget ? 'sc-a' : 'sc-e')}
    ${UI.kpi('To Do on time', U.pct(K.onTime, 1), 'compliance')}
    ${UI.kpi('Same-day closure', U.pct(K.sameDay, 1), 'of team requests')}
    ${UI.kpi('Shadow work', U.num(K.shadowHrs, 0) + ' h', 'logged this year')}
    ${UI.kpi('Quick wins', K.quickWins, 'completed')}
  </div>
  <div class="insights">${ins.map(i => `<div>${i}</div>`).join('')}<div class="muted small">Help desk data last imported: <b class="${upd === U.todayStr() ? 't-good' : 't-warn'}">${upd ? U.fmtDate(upd) + (upd === U.todayStr() ? ' (today)' : '') : 'never'}</b> · <a href="#/helpdesk/import" class="link">Import latest</a></div></div>
  <div class="cols2 wide-left">
    ${card(
      'Performance leaderboard',
      `<table class="tbl lb"><thead><tr><th>Rank</th><th>Employee</th><th>Score</th><th style="width:34%">Progress</th><th>Last month</th></tr></thead><tbody>
      ${
        ranked
          .map((r, i) => {
            const last = Calc.lastScoredMonth(y, r.m.id);
            return `<tr class="click" data-emp="${h(r.m.id)}"><td class="rank">${['🥇 1', '🥈 2', '🥉 3'][i] || i + 1}</td><td><b>${h(Store.memberShort(r.m.id))}</b></td><td class="${UI.scoreClass(r.avg)} num">${U.num(r.avg, 2)}</td><td>${UI.bar(r.avg)}</td><td class="num">${last ? U.num(last.s.score, 2) + ` <span class="muted small">${U.MONTHS[last.mo - 1]}</span>` : '–'}</td></tr>`;
          })
          .join('') || `<tr><td colspan="5" class="empty">No scores yet for ${y}.</td></tr>`
      }</tbody></table>`
    )}
    ${card(
      'Control metrics',
      `<table class="tbl kv"><tbody>
      <tr><td>Closing target</td><td>≤ ${S.closingTargetHrs} hrs</td><td>${onTarget ? UI.badge('On target', 'good') : UI.badge('Above target', 'bad')}</td></tr>
      <tr><td>Avg closing</td><td>${U.num(K.avgClosing, 2)} h</td><td>${UI.badge(K.avgClosing <= 4.5 ? 'Excellent' : K.avgClosing <= 9 ? 'Acceptable' : 'High', K.avgClosing <= 4.5 ? 'good' : K.avgClosing <= 9 ? 'warn' : 'bad')}</td></tr>
      <tr><td>On-time compliance</td><td>${U.pct(K.onTime, 1)}</td><td>${UI.badge(K.onTime >= 0.95 ? 'Excellent' : K.onTime >= 0.9 ? 'Acceptable' : 'Low', K.onTime >= 0.95 ? 'good' : K.onTime >= 0.9 ? 'warn' : 'bad')}</td></tr>
      <tr><td>Same-day closure</td><td>${U.pct(K.sameDay, 1)}</td><td>${UI.badge(K.sameDay >= 0.8 ? 'Excellent' : K.sameDay >= 0.6 ? 'Acceptable' : 'Low', K.sameDay >= 0.8 ? 'good' : K.sameDay >= 0.6 ? 'warn' : 'bad')}</td></tr>
      <tr><td>Employees scored</td><td>${K.employees}</td><td>${UI.badge('Active', 'good')}</td></tr>
      <tr><td>Data period</td><td>${h(K.period)}</td><td>${UI.badge('YTD')}</td></tr></tbody></table>`
    )}
  </div>
  ${card('Monthly score heatmap', heatmapTable(y, heat), `<span class="muted small">🔒 = locked month (official score) · others are live</span>`)}
  ${card(
    'Team average by month',
    UI.barChart(
      heat.teamCells.map((v, i) => ({ label: U.MONTHS[i], value: v || 0 })),
      { height: 170, width: 1100, fmt: v => U.num(v, 1), target: TT }
    )
  )}
  ${Mile.card(y)}`;
  return {
    title: 'Team Dashboard',
    html,
    mount(root) {
      root.querySelectorAll('[data-emp]').forEach(
        tr =>
          (tr.onclick = () => {
            ps('employee').emp = tr.dataset.emp;
            location.hash = '#/perf/employee';
          })
      );
      bindHeat(root);
    },
  };
};

function heatmapTable(y, heat) {
  return `<div class="tbl-scroll"><table class="tbl heat"><thead><tr><th>Employee / Month</th>${U.MONTHS.map((m, i) => `<th class="num">${m}${lockBtn(y, i + 1, heat)}</th>`).join('')}<th class="num">AVG</th></tr></thead><tbody>
    ${heat.rows
      .map(
        r =>
          `<tr><td><b>${h(Store.memberShort(r.m.id))}</b></td>${r.cells
            .map((c, i) => {
              const mk = Calc.monthMark(App.year, r.m.id, i + 1);
              return `<td class="num ${c ? UI.scoreClass(c.score) : 'sc-none'}" title="${mk ? h((mk.kind === 'set' ? 'Score set by ' : 'Not counted — set by ') + Store.memberShort(mk.by) + (mk.note ? ': ' + mk.note : '')) : c ? (c.locked ? 'Locked score' : 'Live score') : ''}">${mk && mk.kind === 'skip' ? '<span class="muted">⊘</span>' : c ? U.num(c.score, 2) + (c.set ? ' <sup>✎</sup>' : c.locked ? '' : '<sup>•</sup>') : ''}</td>`;
            })
            .join('')}<td class="num strong ${UI.scoreClass(r.avg)}">${r.avg != null ? U.num(r.avg, 2) : ''}</td></tr>`
      )
      .join('')}
    <tr class="foot"><td>Team average</td>${heat.teamCells.map(v => `<td class="num">${v != null ? U.num(v, 2) : ''}</td>`).join('')}<td class="num strong">${heat.teamAvg != null ? U.num(heat.teamAvg, 2) : ''}</td></tr></tbody></table></div>
    <p class="muted small">• live score (recalculates as data changes). Lock a month once it is closed to keep its official score — click the lock in the month header.</p>`;
}

function lockBtn(y, mo, heat) {
  if (!App.can('lockScores')) return '';
  const now = new Date();
  if (y > now.getFullYear() || (y === now.getFullYear() && mo > now.getMonth() + 1)) return '';
  const locked = heat.rows.some(r => r.cells[mo - 1] && r.cells[mo - 1].locked);
  const any = heat.rows.some(r => r.cells[mo - 1]);
  if (!any) return '';
  return ` <button class="lock" data-lock="${mo}" title="${locked ? 'Unlock (use live scores)' : "Lock this month's scores"}">${locked ? '🔒' : '🔓'}</button>`;
}

function bindHeat(root) {
  root.querySelectorAll('[data-lock]').forEach(
    b =>
      (b.onclick = () => {
        const y = App.year,
          mo = +b.dataset.lock;
        const team = Store.scoredTeam();
        const locked = team.some(m => Calc.snapshot(y, m.id, mo) != null);
        if (locked)
          UI.confirm(`Unlock ${U.MONTHS[mo - 1]} ${y}? Scores will be recalculated live from the data.`, () => {
            for (const m of team) {
              const id = `snap-${y}-${U.pad(mo)}-${m.id}`;
              if (Store.get(id)) Store.remove(id);
            }
            App.render();
          });
        else
          UI.confirm(`Lock ${U.MONTHS[mo - 1]} ${y} scores at their current values?`, () => {
            const recs = [];
            for (const m of team) {
              const c = Calc.monthScore(y, m.id, mo);
              if (c) recs.push({ id: `snap-${y}-${U.pad(mo)}-${m.id}`, c: 'scoresnap', analyst: m.id, year: y, month: mo, score: c.score });
            }
            Store.saveMany(recs);
            UI.toast(`${U.MONTHS[mo - 1]} locked`, 'good');
            App.render();
          });
      })
  );
}
