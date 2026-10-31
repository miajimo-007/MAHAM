/* DARRIK — Employee — one person's scores and activity. */
'use strict';

P.employee = () => {
  const y = App.year,
    s = ps('employee');
  const team = App.can('viewOthers') ? Store.scoredTeam() : Store.scoredTeam().filter(m => m.id === App.me);
  if (!s.emp || !team.find(m => m.id === s.emp)) s.emp = team.find(m => m.id === App.me) ? App.me : team[0] && team[0].id;
  const mid = s.emp,
    mo = s.month ? +s.month : 0;
  const m = Store.member(mid);
  if (!m) return { title: 'Employee', html: empty('No scored team members. Add them in Settings.') };
  const PF = Calc.perf(y);
  const ytd = PF.members[mid].ytd;
  const sel = mo ? PF.members[mid][mo] : ytd;
  const heat = Calc.heatmap(y).rows.find(r => r.m.id === mid);
  const scoreSel = mo ? Calc.score(y, mid, mo) : heat && heat.avg != null ? { score: heat.avg } : null;
  const todo = Calc.todos(y).filter(t => t.r.analyst === mid && t.status !== 'Canceled' && (!mo || t.month === mo));
  const comps = [];
  for (let i = 1; i <= 12; i++) comps.push(Calc.monthScore(y, mid, i));
  const row = (label, f, dp = 2) =>
    `<tr><td>${label}</td>${comps.map((c, i) => `<td class="num">${c ? U.num(f(c, i), dp) : ''}</td>`).join('')}<td class="num strong">${(() => {
      const v = comps.filter(Boolean).map(f);
      return v.length ? U.num(U.avg(v), dp) : '';
    })()}</td></tr>`;
  const S = Calc.scoring();
  const hdm = Calc.helpdesk(y).filter(x => x.mid === mid && (!mo || x.month === mo));
  const longR = hdm
    .filter(x => x.hrs != null && x.hrs > S.longElapsedHrs)
    .sort((a, b) => b.hrs - a.hrs)
    .slice(0, 8);
  const delayed = todo
    .filter(t => t.timing === 'Delayed')
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);
  const sw = Calc.shadow(y).filter(x => x.r.analyst === mid && (!mo || x.month === mo));
  const byType = [...U.groupBy(sw, x => x.r.taskType || '—')]
    .map(([k, v]) => ({ k, n: v.length, hrs: U.sum(v.map(x => x.hrs)) }))
    .sort((a, b) => b.hrs - a.hrs)
    .slice(0, 5);
  const qws = Store.all('quickwin').filter(
    q =>
      (q.analyst === mid || QS.confirmed(q).includes(mid)) &&
      U.lc(q.approval) === 'accepted' &&
      yearOf(q.date) === y &&
      (!mo || monthOf(q.date) === mo)
  );
  const fmtEl = hrs => {
    const d = Math.floor(hrs / 24),
      hh = Math.floor(hrs % 24),
      mm = Math.round((hrs * 60) % 60);
    return `${d}d ${hh}h ${mm}m`;
  };
  const html = `
  <div class="filters"><label class="flt"><span>Employee</span><select data-flt="employee|emp">${team.map(t => `<option value="${h(t.id)}" ${t.id === mid ? 'selected' : ''}>${h(Store.memberShort(t.id))}</option>`).join('')}</select></label>
  <label class="flt"><span>Month</span><select data-flt="employee|month"><option value="">All (YTD)</option>${U.MONTHS.map((x, i) => `<option value="${i + 1}" ${mo === i + 1 ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
  <div class="kpis k6">
    ${UI.kpi('Score', scoreSel ? U.num(scoreSel.score, 2) : '–', mo ? (scoreSel && scoreSel.locked ? '🔒 locked' : 'live') : 'YTD average', UI.scoreClass(scoreSel && scoreSel.score))}
    ${UI.kpi('Same-day closed', sel.hd ? U.pct(sel.hdSame / sel.hd, 0) : '–', `${sel.hd} requests`)}
    ${UI.kpi('Avg closing', U.num(U.avg(sel.hdHrs), 2) + ' h', `target ≤ ${S.closingTargetHrs} h`)}
    ${UI.kpi('To Do on time', sel.todo ? U.pct(sel.onTime / sel.todo, 0) : '–', `${sel.todo} tasks`)}
    ${UI.kpi('Quick wins', mo ? sel.qw : Store.all('quickwin').filter(q => q.analyst === mid && U.lc(q.approval) === 'accepted' && yearOf(q.date) === y).length, mo ? 'completed' : 'accepted YTD')}
    ${UI.kpi('Shadow work', U.num(sel.swHrs, 1) + ' h', mo ? 'this month' : 'YTD')}
  </div>
  ${card(
    `Monthly breakdown — ${h(Store.memberShort(m.id))}`,
    `<div class="tbl-scroll"><table class="tbl breakdown"><thead><tr><th>Component (points)</th>${U.MONTHS.map(x => `<th class="num">${x}</th>`).join('')}<th class="num">AVG</th></tr></thead><tbody>
    ${row(`To Do on-time <span class="muted">/${S.weights.todo}</span>`, c => c.todo)}
    ${row('· Request score', c => c.req)}
    ${row('· Closing time', c => c.close)}
    ${row(`IT help desk <span class="muted">/${S.weights.helpdesk}</span>`, c => c.helpdesk)}
    ${row(`Shadow work <span class="muted">/${S.weights.shadow}</span>`, c => c.shadow)}
    ${row(`Quick wins <span class="muted">/${S.weights.quickwins}</span>`, c => c.quickwins)}
    ${row(`Attendance <span class="muted">/${S.weights.attendance}</span>`, c => c.attendance)}
    <tr class="foot"><td>Score</td>${comps
      .map((c, i) => {
        const sc = Calc.score(y, mid, i + 1);
        const mk = Calc.monthMark(y, mid, i + 1);
        return `<td class="num ${sc ? UI.scoreClass(sc.score) : ''}" title="${mk ? h((mk.kind === 'set' ? 'Score set by ' : 'Not counted — ') + Store.memberShort(mk.by) + (mk.note ? ': ' + mk.note : '')) : ''}">${mk && mk.kind === 'skip' ? '<span class="muted">⊘ not counted</span>' : sc ? U.num(sc.score, 2) + (sc.set ? ' ✎' : sc.locked ? ' 🔒' : '') : ''}</td>`;
      })
      .join('')}<td class="num strong">${heat && heat.avg != null ? U.num(heat.avg, 2) : ''}</td></tr>
    </tbody></table></div><p class="muted small">Component points are live calculations. A 🔒 score is the locked official value for that month (it may differ if data was changed after locking).</p>`
  )}
  <div class="cols2">
    ${card(`Requests with long elapsed time (> ${S.longElapsedHrs} h)`, longR.length ? `<table class="tbl"><thead><tr><th>Request</th><th>Subject</th><th>Created</th><th class="num">Elapsed</th></tr></thead><tbody>${longR.map(x => `<tr><td>${h(x.r.reqId)}</td><td>${h(x.r.subject)}</td><td>${U.fmtDate(x.r.created)}</td><td class="num">${fmtEl(x.hrs)}</td></tr>`).join('')}</tbody></table>` : empty('None.'))}
    ${card('To Do delayed tasks', delayed.length ? `<table class="tbl"><thead><tr><th>Assigned</th><th>To Do</th><th>Finished</th><th class="num">Days late</th></tr></thead><tbody>${delayed.map(t => `<tr class="click" data-edit="todo|${h(t.r.id)}"><td>${U.fmtDate(t.r.assigned)}</td><td>${h(t.r.task)}</td><td>${U.fmtDate(t.r.finish) || UI.badge('open', 'warn')}</td><td class="num t-bad">${t.days}</td></tr>`).join('')}</tbody></table>` : empty('No delayed tasks.'))}
    ${card(
      'Shadow work summary',
      `<div class="mini-kpis"><div><b>${U.num(U.sum(sw.map(x => x.hrs)), 1)}</b><span>hours</span></div><div><b>${sw.length}</b><span>entries</span></div><div><b>${sw.length ? Math.round(U.sum(sw.map(x => +x.r.minutes || 0)) / sw.length) : 0}</b><span>avg min / entry</span></div></div>
      ${byType.length ? `<table class="tbl"><thead><tr><th>Top task types</th><th class="num">Entries</th><th class="num">Hours</th></tr></thead><tbody>${byType.map(x => `<tr><td>${h(x.k)}</td><td class="num">${x.n}</td><td class="num">${U.num(x.hrs, 1)}</td></tr>`).join('')}</tbody></table>` : ''}`
    )}
    ${card('Quick wins (accepted)', qws.length ? `<table class="tbl"><thead><tr><th>ID</th><th>Subject</th><th>Module</th><th>Type</th></tr></thead><tbody>${qws.map(q => `<tr class="click" data-edit="quickwin|${h(q.id)}"><td>${h(q.qwId)}</td><td>${h(q.subject)}</td><td>${h(q.module)}</td><td>${h(q.type)}</td></tr>`).join('')}</tbody></table>` : empty('None.'))}
  </div>
  ${Mile.personCard(y, mid)}`;
  return { title: 'Employee Dashboard', html };
};
