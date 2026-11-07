/* MAHAM — Lazy Days — working days with no recorded activity. */
'use strict';

P.lazy = () => {
  const y = App.year;
  const LZ = Calc.lazy(y);
  const team = Store.scoredTeam();
  const s = ps('lazy');
  const pct = o => (o.work ? o.lazy / o.work : null);
  const teamAvg = i => {
    const v = team.map(m => pct(LZ.res[m.id][i])).filter(x => x != null);
    return v.length ? U.avg(v) : null;
  };
  const sel = s.emp || '';
  const mo = +s.month || 0;
  const drill = sel ? LZ.days.filter(d => (!mo || U.month(d.date) === mo) && d.cells[sel] && d.cells[sel].lazy) : [];
  const html = `${card(
    'Percentage of lazy days',
    `<p class="muted small">A lazy day is a working day (Sun–Thu, not on leave) with no recorded work: no shadow work, no help desk request resolved, no To Do assigned or finished, and nothing saved in quick wins, projects, good catches, personal tasks or meetings.</p><div class="tbl-scroll"><table class="tbl"><thead><tr><th>Employee / Month</th>${U.MONTHS.map(x => `<th class="num">${x}</th>`).join('')}<th class="num">YTD</th></tr></thead><tbody>
    ${team
      .map(m => {
        const tot = Object.values(LZ.res[m.id]).reduce((a, o) => ({ work: a.work + o.work, lazy: a.lazy + o.lazy }), { work: 0, lazy: 0 });
        return `<tr><td><b>${h(Store.memberShort(m.id))}</b></td>${[...Array(12)]
          .map((_, i) => {
            const p = pct(LZ.res[m.id][i + 1]);
            return `<td class="num click ${p == null ? '' : p > 0.3 ? 'sc-e' : p > 0.15 ? 'sc-c' : 'sc-a'}" data-lz="${h(m.id)}|${i + 1}">${p == null ? '' : U.pct(p, 0)}</td>`;
          })
          .join('')}<td class="num strong click" data-lz="${h(m.id)}|0">${tot.work ? U.pct(tot.lazy / tot.work, 0) : ''}</td></tr>`;
      })
      .join('')}
    <tr class="foot"><td>Team average</td>${[...Array(12)].map((_, i) => `<td class="num">${teamAvg(i + 1) == null ? '' : U.pct(teamAvg(i + 1), 0)}</td>`).join('')}<td></td></tr></tbody></table></div>`
  )}
    ${sel ? card(`Lazy days — ${h(Store.memberShort(sel))}${mo ? ' · ' + U.MONTHS[mo - 1] : ''} <span class="count">${drill.length}</span>`, drill.length ? `<div class="daylist">${drill.map(d => `<span class="badge">${U.fmtDate(d.date)} (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][U.pd(d.date).getDay()]})</span>`).join(' ')}</div><p class="muted small">If a day was actually a leave day, mark it OFF in Attendance and it will drop out.</p>` : empty('None 👍')) : '<p class="muted">Click any percentage to see the days.</p>'}`;
  return {
    title: 'Lazy Days',
    html,
    mount(root) {
      root.querySelectorAll('[data-lz]').forEach(
        td =>
          (td.onclick = () => {
            const [m, mo] = td.dataset.lz.split('|');
            ps('lazy').emp = m;
            ps('lazy').month = mo;
            App.render();
          })
      );
    },
  };
};
