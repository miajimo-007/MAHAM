/* MAHAM — "Why is my score 87?" (employee page + Analyst Desk), the Projects row in the monthly breakdown,
 * and the printable rules (every team's scoring weights, tiers and time rules, with the date each one started). */
'use strict';

const ScoreWhy = {
  tierText(list, ge, unit) {
    return (list || [])
      .map(
        ([t, p]) =>
          (t <= -1
            ? 'otherwise'
            : t >= 1e8
              ? 'otherwise'
              : `${ge ? '≥' : '≤'} ${unit === '%' ? Math.round(t * 100) + '%' : t + (unit || '')}`) + ` → ${p}`
      )
      .join(' · ');
  },
  rows(y, mid, mo) {
    const c = Calc.monthScore(y, mid, mo);
    if (!c) return null;
    const S = Calc.scoring(y);
    const W = S.weights,
      T = S.tiers;
    const o = c.raw;
    const v = {
      todo: [
        o.todo ? `${o.onTime} of ${o.todo} on time (${U.pct(o.onTime / o.todo, 0)})` : 'no To Dos given',
        ScoreWhy.tierText(T.todo, true, '%'),
      ],
      helpdesk: [
        `${o.hd} request(s)${o.hdHrs.length ? `, average closing ${U.num(U.avg(o.hdHrs), 1)} h` : ''}`,
        `requests vs team average: ${ScoreWhy.tierText(T.requests, true, '×')} · closing: ${ScoreWhy.tierText(T.closing, false, ' h')}`,
      ],
      attendance: [`${U.num(o.permHrs, 1)} h permission`, ScoreWhy.tierText(T.attendance, false, ' h')],
      shadow: [
        `${U.num(o.swHrs, 1)} h${c.presence && c.presence < 1 ? ` (counted as ${U.num(o.swHrs / Math.max(0.2, c.presence), 1)} h for the days you were there)` : ''}`,
        ScoreWhy.tierText(T.shadow, true, ' h'),
      ],
      quickwins: [`${o.qw} completed`, ScoreWhy.tierText(T.quickwins, true)],
      projects: [
        o.pt || o.pts
          ? `${o.ptOn || 0} of ${o.pt || 0} task(s) on time, ${o.pts || 0} story point(s)${c.projShare != null ? ` (${U.num(c.projShare, 2)}× the team average)` : ''}`
          : 'no project tasks',
        `on time: ${ScoreWhy.tierText(T.projects, true, '%')} · points share: ${ScoreWhy.tierText(T.projShare, true, '×')}`,
      ],
    };
    const parts =
      c.parts ||
      ['todo', 'helpdesk', 'attendance', 'shadow', 'quickwins']
        .filter(k => +W[k])
        .map(k => ({ key: k, label: ProjScore.LABEL[k], weight: +W[k], points: U.r2(c[k] || 0) }));
    return { c, parts, v };
  },
  box(y, mid, mo, title) {
    const x = ScoreWhy.rows(y, mid, mo);
    if (!x) return '';
    const sc = Calc.score(y, mid, mo);
    const shown = sc ? sc.score : x.c.score;
    return card(
      title || `Why is the ${U.MONTHS[mo - 1]} score ${U.num(shown, 1)}?`,
      `<div class="tbl-scroll"><table class="tbl why"><thead><tr><th>Part</th><th>Weight</th><th>What counted</th><th>Rule</th><th class="num">Points</th></tr></thead><tbody>
      ${x.parts.map(p => `<tr class="${p.skipped ? 'muted' : ''}"><td><b>${h(p.label)}</b></td><td class="num">${p.weight}%</td><td>${h(x.v[p.key][0])}</td><td class="small muted">${h(x.v[p.key][1])}</td><td class="num">${p.skipped ? '<span class="small">left out — nothing to score</span>' : `${U.num(p.points, 2)} / ${p.weight}`}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="small">${
        x.c.skipped && x.c.skipped.length
          ? `Parts with nothing to score this month are left out and their weight goes to the others: points ${U.num(
              x.parts.filter(p => !p.skipped).reduce((a, p) => a + p.points, 0),
              2
            )} out of ${x.parts.filter(p => !p.skipped).reduce((a, p) => a + p.weight, 0)} → <b>${U.num(x.c.score, 2)}</b> out of 100.`
          : `Total: <b>${U.num(x.c.score, 2)}</b> out of 100.`
      }${sc && sc.locked ? ' The month is 🔒 locked at its official score.' : ''}${sc && sc.set ? ' The score was set by the administrator.' : ''}${x.c.presence && x.c.presence < 1 ? ` You were there ${Math.round(x.c.presence * 100)}% of the working days (leave not counted against you).` : ''}</p>`
    );
  },
};

const RulesPrint = {
  open() {
    const teams = App.realSuper() ? Store.teams() : Store.teams().filter(t => AdminRole.teamsOf(App.me).includes(t.id));
    const today = U.todayStr();
    const y = new Date().getFullYear();
    const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
    const kv = o =>
      Object.entries(o || {})
        .map(([k, v]) => `${esc(k)} = ${esc(v)}`)
        .join(', ') || '—';
    const sec = t => {
      const S = Calc.memo
        ? (() => {
            const keep = App.viewTeam;
            App.viewTeam = t.id;
            Calc.invalidate();
            try {
              return Calc.scoring(y);
            } finally {
              App.viewTeam = keep;
              Calc.invalidate();
            }
          })()
        : Calc.scoring(y);
      const rec = Store.get('settings-timerules-' + t.id);
      const R = TimeRules.at(t.id);
      const tier = (k, ge, unit) => ScoreWhy.tierText(S.tiers[k], ge, unit);
      return `<h2>${esc(t.name)}</h2>
        <h3>Scoring ${y}</h3><table><tr><th>Part</th><th>Weight</th><th>Tiers</th></tr>
        <tr><td>To Do on time</td><td>${S.weights.todo}%</td><td>${esc(tier('todo', true, '%'))}</td></tr>
        <tr><td>IT help desk</td><td>${S.weights.helpdesk}%</td><td>requests ${S.helpdeskSplit.requests}%: ${esc(tier('requests', true, '×'))}<br>closing ${S.helpdeskSplit.closing}% (target ${S.closingTargetHrs} h): ${esc(tier('closing', false, ' h'))}</td></tr>
        <tr><td>Attendance</td><td>${S.weights.attendance}%</td><td>${esc(tier('attendance', false, ' h'))}</td></tr>
        <tr><td>Shadow work</td><td>${S.weights.shadow}%</td><td>${esc(tier('shadow', true, ' h'))}</td></tr>
        <tr><td>Quick wins</td><td>${S.weights.quickwins}%</td><td>${esc(tier('quickwins', true))}</td></tr>
        <tr><td>Projects</td><td>${S.weights.projects || 0}%</td><td>on time ${S.projectsSplit.onTime}%: ${esc(tier('projects', true, '%'))}<br>points share ${S.projectsSplit.share}%: ${esc(tier('projShare', true, '×'))}</td></tr></table>
        <p class="note">From November 2026: a part with nothing to score that month is left out and its weight goes to the other parts; shadow hours and quick wins are counted for the days the person was there.</p>
        <h3>Time rules ${rec && rec.from ? `(in force since ${U.fmtDate(rec.from)})` : '(department default)'}</h3><table>
        <tr><td>Days</td><td>${R.workingDays ? 'Working days (no weekend, holidays, own leave, confirmed holds)' : 'Calendar days'}</td></tr>
        <tr><td>To Do due in (days)</td><td>${kv(R.todo.byPriority)}${Object.keys(R.todo.byType || {}).length ? '; by type: ' + kv(R.todo.byType) : ''}; grace ${R.todo.grace}; “due soon” ${R.todo.dueSoon} day(s) before</td></tr>
        <tr><td>Help desk</td><td>closing target ${R.helpdesk.closingHrs} h; late after ${R.helpdesk.longHrs} h open${Object.keys(R.helpdesk.byCategory || {}).length ? '; by category: ' + kv(R.helpdesk.byCategory) : ''}</td></tr>
        <tr><td>Requests</td><td>decide within ${R.requests.approveDays} day(s)</td></tr>
        <tr><td>Project tasks</td><td>grace ${R.ptask.grace} day(s); project at risk at ${R.ptask.riskLatePct}% tasks late or ${R.ptask.riskDaysLeft} day(s) to its due date</td></tr>
        <tr><td>Stuck</td><td>follow-ups after ${R.stuck.followup} day(s); quick wins after ${R.stuck.quickwin} day(s)</td></tr>
        <tr><td>Escalation</td><td>Manager Desk at ${R.escalate.manager} day(s) late; Director Desk at ${R.escalate.director}</td></tr></table>
        ${((rec && rec.history) || []).length ? `<p class="note">Earlier versions (still used for work given before): ${rec.history.map(x => 'from ' + U.fmtDate(x.from)).join(', ')}</p>` : ''}`;
    };
    const hol = Store.get('settings-holidays') || {};
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(Store.appName())} — rules ${today}</title><style>body{font:13px/1.45 system-ui,Segoe UI,Arial;margin:28px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:26px 0 6px;border-bottom:2px solid #0e7c86;padding-bottom:3px}h3{font-size:13px;margin:12px 0 4px}table{border-collapse:collapse;width:100%;margin-bottom:6px}td,th{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f2f4f5}.note{color:#555;font-size:12px}@media print{button{display:none}}</style></head><body>
      <button onclick="print()">Print / save as PDF</button><h1>${esc(Store.appName())} — scoring and time rules</h1><p class="note">Printed ${U.fmtDate(today)} by ${esc(Store.memberName(App.me))}. Locked months keep their official scores.</p>
      ${teams.map(sec).join('')}
      <h2>Public holidays</h2><p>${(hol.list || []).map(x => `${U.fmtDate(x.from)}${x.to && x.to !== x.from ? ' – ' + U.fmtDate(x.to) : ''} ${esc(x.name || '')}`).join('<br>') || '—'}</p>
      ${hol.ramadan ? `<p>Ramadan ${U.fmtDate(hol.ramadan.from)} – ${U.fmtDate(hol.ramadan.to)}: ${hol.ramadan.hours} h a day (normally ${hol.ramadan.normal} h) — help desk hour targets stretch by ${hol.ramadan.normal} ÷ ${hol.ramadan.hours}.</p>` : ''}</body></html>`;
    const w = window.open('', '_blank');
    if (!w) {
      UI.toast('Allow pop-ups to open the printable page', 'warn');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  },
};

(function () {
  // employee page: the breakdown gets a Projects row; a "Why is the score …?" card for the month picked (or the last scored)
  if (P.employee) {
    const base = P.employee;
    P.employee = function () {
      const out = base.apply(this, arguments);
      if (!out || !out.html) return out;
      try {
        const sel = document.querySelector('[data-flt="employee|emp"]');
        const mid = (out.html.match(/data-flt="employee\|emp">[\s\S]*?<option value="([^"]+)" selected/) || [])[1];
        if (!mid) return out;
        const y = App.year;
        const S = Calc.scoring(y);
        if (+S.weights.projects) {
          const cells = [];
          for (let i = 1; i <= 12; i++) {
            const c = Calc.monthScore(y, mid, i);
            cells.push(c ? U.num(c.projects || 0, 2) : '');
          }
          out.html = out.html.replace(
            '<tr class="foot"><td>Score</td>',
            `<tr><td>Projects <span class="muted">/${S.weights.projects}</span></td>${cells.map(v => `<td class="num">${v}</td>`).join('')}<td></td></tr><tr class="foot"><td>Score</td>`
          );
        }
        const moSel = (out.html.match(/data-flt="employee\|month">[\s\S]*?<option value="(\d+)" selected/) || [])[1];
        const last = moSel
          ? { mo: +moSel }
          : Calc.lastScoredMonth(y, mid) || (Calc.monthScore(y, mid, new Date().getMonth() + 1) ? { mo: new Date().getMonth() + 1 } : null);
        if (last) {
          const box = ScoreWhy.box(y, mid, last.mo);
          const at = out.html.indexOf('<section class="card"');
          if (box && at >= 0) out.html = out.html.slice(0, at) + box + out.html.slice(at);
        }
        void sel;
      } catch (e) {
        console.warn('score breakdown', e);
      }
      return out;
    };
  }
  // Analyst Desk: "Why is my score …?"
  if (P.home) {
    const base = P.home;
    P.home = function () {
      const out = base.apply(this, arguments);
      if (!out || !out.html || App.isDir() || App.isMgr()) return out;
      const m = Store.member(App.me);
      if (!m || !m.scored) return out;
      const y = App.year;
      const mo = new Date().getMonth() + 1;
      const c = Calc.monthScore(y, App.me, mo);
      if (!c) return out;
      const btn = `<div class="row-btns" style="margin:4px 0 10px"><button class="btn sm ghost" id="whyscore">Why is my score ${U.num(c.score, 1)}?</button></div>`;
      const at = out.html.indexOf('<div class="kpis');
      const end = at >= 0 ? out.html.indexOf('</div>\n', at) : -1;
      out.html = at >= 0 ? out.html.replace(/(<div class="kpis[\s\S]*?<\/div>\s*<\/div>)/, '$1' + btn) : btn + out.html;
      if (!out.html.includes('id="whyscore"')) out.html = btn + out.html;
      void end;
      const m0 = out.mount;
      out.mount = root => {
        if (m0) m0(root);
        const b = root.querySelector('#whyscore');
        if (b)
          b.onclick = () =>
            UI.modal({
              title: 'Your score this month',
              wide: true,
              body: ScoreWhy.box(y, App.me, mo, `${U.MONTHS[mo - 1]} ${y} — live`),
              actions: '<span class="grow"></span><button class="btn" data-close>Close</button>',
              onMount: w => {
                const x = w.querySelector('[data-close]');
                if (x) x.onclick = () => UI.closeModal();
              },
            });
      };
      return out;
    };
  }
  // printable rules: from Time rules and Scoring
  if (typeof TimeRulesUI !== 'undefined') {
    const pg = TimeRulesUI.page;
    TimeRulesUI.page = function () {
      const out = pg.apply(this, arguments);
      out.html = out.html.replace(
        '<span class="grow"></span>',
        '<button class="btn sm ghost" id="rulesprint">🖨 Printable rules</button><span class="grow"></span>'
      );
      const m0 = out.mount;
      out.mount = root => {
        if (m0) m0(root);
        const b = root.querySelector('#rulesprint');
        if (b) b.onclick = () => RulesPrint.open();
      };
      return out;
    };
  }
})();
