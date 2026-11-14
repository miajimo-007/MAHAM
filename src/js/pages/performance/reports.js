/* MAHAM — Reports: weekly, monthly, yearly (or any dates) team report with charts — printable / PDF / Excel.
 * A function (Admin → Functions → "Reports"): hidden for everyone until the administrator gives it to a team or person. */
'use strict';

const Rep = {
  SECTIONS: [
    ['summary', 'Summary'],
    ['charts', 'Charts'],
    ['people', 'Per person'],
    ['done', 'Done'],
    ['delayed', 'Delayed'],
    ['waiting', 'Waiting'],
    ['milestones', 'Milestones'],
    ['helpdesk', 'Help Desk'],
    ['quickwins', 'Quick wins'],
    ['shadow', 'Shadow work'],
    ['attendance', 'Attendance & leave'],
    ['projects', 'Projects'],
    ['dirtasks', 'Tasks from the director'],
    ['notes', 'My notes'],
  ],
  DEFAULT: ['summary', 'charts', 'people', 'done', 'delayed', 'waiting', 'milestones', 'notes'],
  st() {
    const s = ps('rep');
    if (!s.kind) {
      const t = LS.get('bct.reptpl.' + App.me, null);
      Object.assign(s, { kind: 'week', anchor: U.todayStr(), secs: (t && t.secs) || Rep.DEFAULT.slice(), people: (t && t.people) || [] });
    }
    // remembered settings from an older copy may lack the lists — fill them in so the page always opens
    if (!Array.isArray(s.secs)) {
      const t = LS.get('bct.reptpl.' + App.me, null);
      s.secs = (t && Array.isArray(t.secs) && t.secs) || Rep.DEFAULT.slice();
    }
    if (!Array.isArray(s.people)) {
      const t = LS.get('bct.reptpl.' + App.me, null);
      s.people = (t && Array.isArray(t.people) && t.people) || [];
    }
    if (!s.anchor) s.anchor = U.todayStr();
    return s;
  },
  /* the dates of a period, and the one before it */
  range(s) {
    const a = s.anchor || U.todayStr();
    const d = new Date(a + 'T12:00:00');
    if (s.kind === 'week') {
      const from = U.addDays(a, -d.getDay());
      return {
        from,
        to: U.addDays(from, 6),
        label: `Week ${U.fmtDate(from)} – ${U.fmtDate(U.addDays(from, 4))}`,
        prev: { from: U.addDays(from, -7), to: U.addDays(from, -1) },
        bucket: 'day',
      };
    }
    if (s.kind === 'month') {
      const from = a.slice(0, 8) + '01';
      const to = U.addDays(U.addDays(from, 32).slice(0, 8) + '01', -1);
      const pf = U.addDays(from, -1).slice(0, 8) + '01';
      return {
        from,
        to,
        label: `${U.MONTHS[+from.slice(5, 7) - 1]} ${from.slice(0, 4)}`,
        prev: { from: pf, to: U.addDays(from, -1) },
        bucket: 'week',
      };
    }
    if (s.kind === 'year') {
      const y = a.slice(0, 4);
      return {
        from: y + '-01-01',
        to: y + '-12-31',
        label: `Year ${y}`,
        prev: { from: y - 1 + '-01-01', to: y - 1 + '-12-31' },
        bucket: 'month',
      };
    }
    const from = s.from || U.addDays(U.todayStr(), -13),
      to = s.to || U.todayStr();
    const n = U.diffDays(from, to) + 1;
    return {
      from,
      to,
      label: `${U.fmtDate(from)} – ${U.fmtDate(to)}`,
      prev: { from: U.addDays(from, -n), to: U.addDays(from, -1) },
      bucket: n <= 31 ? 'day' : n <= 120 ? 'week' : 'month',
    };
  },
  inR: (d, r) => !!d && d.slice(0, 10) >= r.from && d.slice(0, 10) <= r.to,
  years: r => {
    const out = [];
    for (let y = +r.from.slice(0, 4); y <= +r.to.slice(0, 4); y++) out.push(y);
    return out;
  },
  /* every number of the report for a date range */
  calc(r, ids) {
    return Calc.memo('rep|' + r.from + '|' + r.to + '|' + ids.join(','), () => Rep._calc(r, ids));
  }, // same period twice = computed once until data changes
  _calc(r, ids) {
    const today = U.todayStr();
    const set = new Set(ids);
    const end = r.to < today ? r.to : today;
    const todos = Rep.years(r)
      .flatMap(y => Calc.todos(y))
      .filter(t => set.has(t.r.analyst) && t.status !== 'Canceled');
    const done = todos.filter(t => t.r.finish && Rep.inR(t.r.finish, r));
    const late = done.filter(t => t.timing === 'Delayed');
    const overdue = todos.filter(t => !t.r.finish && t.r.assigned <= r.to && t.due && t.due < end);
    const waiting = todos.filter(t => t.status === 'Ready for review' || (!t.r.finish && t.r.assigned <= r.to && !(t.due && t.due < end)));
    const hd = Rep.years(r)
      .flatMap(y => Calc.helpdesk(y))
      .filter(x => set.has(x.mid));
    const hdClosed = hd.filter(x => x.closed && Rep.inR(x.r.resolved || x.r.created, r));
    const hdNew = hd.filter(x => Rep.inR(x.r.created, r));
    const sw = Rep.years(r)
      .flatMap(y => Calc.shadow(y))
      .filter(x => set.has(x.r.analyst) && Rep.inR(x.r.date, r));
    const qw = Store.all('quickwin').filter(
      q =>
        U.lc(q.status) === 'completed' &&
        U.lc(q.approval) === 'accepted' &&
        Rep.inR(q.expected || q.date, r) &&
        (typeof QS !== 'undefined' ? QS.people(q) : [q.analyst]).some(id => set.has(id))
    );
    const qwOpen = Store.all('quickwin').filter(
      q => !qwHistory(q) && (typeof QS !== 'undefined' ? QS.people(q) : [q.analyst]).some(id => set.has(id)) && (q.date || '') <= r.to
    );
    const miles =
      typeof Mile !== 'undefined'
        ? Rep.years(r)
            .flatMap(y => Mile.list(y))
            .filter(x => Rep.inR(x.date, r) && x.who.some(id => set.has(id)))
        : [];
    const att = Rep.years(r)
      .flatMap(y => Calc.attendance(y))
      .filter(a => set.has(a.analyst) && Rep.inR(a.date, r));
    const off = att.filter(a => a.status === 'OFF' || a.leave);
    const permH = U.sum(att.map(a => +a.permHrs || 0));
    const per = ids.map(id => {
      const mine = x => x.r.analyst === id;
      const hdm = hdClosed.filter(x => x.mid === id);
      return {
        id,
        done: done.filter(mine).length,
        onTime: done.filter(mine).filter(t => t.timing === 'On Time').length,
        late: late.filter(mine).length,
        overdue: overdue.filter(mine).length,
        waiting: waiting.filter(mine).length,
        hd: hdm.length,
        hdHrs: U.avg(hdm.filter(x => x.hrs != null).map(x => x.hrs)),
        sw: U.sum(sw.filter(mine).map(x => x.hrs)),
        qw: qw.filter(q => (typeof QS !== 'undefined' ? QS.people(q) : [q.analyst]).includes(id)).length,
        ms: miles.filter(x => x.who.includes(id)).length,
        off: off.filter(a => a.analyst === id).length,
        perm: U.sum(att.filter(a => a.analyst === id).map(a => +a.permHrs || 0)),
        score: Rep.score(id, r),
      };
    });
    const avgH = U.avg(hdClosed.filter(x => x.hrs != null).map(x => x.hrs));
    return {
      done,
      late,
      overdue,
      waiting,
      hdClosed,
      hdNew,
      sw,
      qw,
      qwOpen,
      miles,
      off,
      permH,
      per,
      avgH,
      onTimePct: done.length ? (done.length - late.length) / done.length : null,
      qwCount: new Set(qw.map(q => q.qwId || q.id)).size,
      swHrs: U.sum(sw.map(x => x.hrs)),
    };
  },
  /* average monthly score over the months the range touches */
  score(id, r) {
    const v = [];
    for (const y of Rep.years(r))
      for (let m = 1; m <= 12; m++) {
        const k = `${y}-${U.pad(m)}`;
        if (k < r.from.slice(0, 7) || k > r.to.slice(0, 7)) continue;
        const s = Calc.score(y, id, m);
        if (s) v.push(s.score);
      }
    return v.length ? U.avg(v) : null;
  },
  /* buckets for the trend chart */
  buckets(r) {
    const out = [];
    if (r.bucket === 'day') {
      for (let d = r.from; d <= r.to; d = U.addDays(d, 1)) {
        const wd = new Date(d + 'T12:00:00').getDay();
        if (wd === 5 || wd === 6) continue;
        out.push({
          label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'][wd] + (r.to > U.addDays(r.from, 7) ? ' ' + d.slice(8) : ''),
          from: d,
          to: d,
        });
      }
    } else if (r.bucket === 'week') {
      let n = 1;
      for (let d = r.from; d <= r.to; d = U.addDays(d, 7))
        out.push({ label: 'W' + n++, from: d, to: U.addDays(d, 6) < r.to ? U.addDays(d, 6) : r.to });
    } else
      for (let d = r.from; d <= r.to; d = U.addDays(d.slice(0, 8) + '28', 7).slice(0, 8) + '01')
        out.push({ label: U.MONTHS[+d.slice(5, 7) - 1].slice(0, 3), from: d, to: U.addDays(U.addDays(d, 32).slice(0, 8) + '01', -1) });
    return out;
  },
  /* ---------- small SVG charts ---------- */
  arrow(now, before, goodUp = true) {
    if (now == null || before == null || now === before) return '<span class="muted small">=</span>';
    const up = now > before;
    return `<span class="${up === goodUp ? 't-good' : 't-bad'} small">${up ? '▲' : '▼'}</span>`;
  },
  donut(pct, label) {
    const p = pct == null ? 0 : Math.max(0, Math.min(1, pct));
    const R = 42,
      C = 2 * Math.PI * R;
    return `<svg viewBox="0 0 120 120" class="rep-donut" role="img" aria-label="${h(label)}"><circle cx="60" cy="60" r="${R}" class="dn-bg"/>${p > 0 ? '' : '<!--'}<circle cx="60" cy="60" r="${R}" class="dn-fg ${p >= 0.9 ? 'g' : p >= 0.75 ? 'a' : 'b'}" stroke-dasharray="${(p * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 60 60)"/>${p > 0 ? '' : '-->'}<text x="60" y="58" text-anchor="middle" class="dn-v">${pct == null ? '–' : Math.round(p * 100) + '%'}</text><text x="60" y="76" text-anchor="middle" class="dn-l">${h(label)}</text></svg>`;
  },
  /* grouped bars: several series per label */
  groupBars(labels, series, { height = 190, fmt = v => U.num(v, 0) } = {}) {
    const W = 680,
      H = height,
      pad = 30,
      gw = (W - pad * 2) / Math.max(1, labels.length),
      n = series.length,
      bw = (gw * 0.7) / n;
    const max = Math.max(1, ...series.flatMap(s => s.values)) * 1.15;
    const y = v => H - 24 - (v / max) * (H - 44);
    return `<svg viewBox="0 0 ${W} ${H}" class="chart rep-chart" role="img">${labels
      .map(
        (l, i) =>
          `${series
            .map((s, k) => {
              const v = s.values[i] || 0;
              const x = pad + i * gw + gw * 0.15 + k * bw;
              return `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${Math.max(0, H - 24 - y(v)).toFixed(1)}" rx="2" fill="${s.color}"><title>${h(s.name)} · ${h(l)}: ${fmt(v)}</title></rect>${v ? `<text x="${(x + bw / 2 - 1).toFixed(1)}" y="${(y(v) - 3).toFixed(1)}" text-anchor="middle" class="vl">${fmt(v)}</text>` : ''}`;
            })
            .join('')}<text x="${(pad + i * gw + gw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="xl">${h(l)}</text>`
      )
      .join('')}<line x1="${pad}" x2="${W - pad}" y1="${H - 24}" y2="${H - 24}" class="axis"/></svg>
      <div class="rep-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${h(s.name)}</span>`).join('')}</div>`;
  },
  /* stacked horizontal bars per person */
  stack(rows, parts) {
    const max = Math.max(1, ...rows.map(r => U.sum(parts.map(p => r[p.key] || 0))));
    return `<div class="rep-stack">${rows.map(r => `<div class="rs-row"><span class="rs-l">${h(Store.memberShort(r.id))}</span><span class="rs-t">${parts.map(p => (r[p.key] ? `<span style="width:${((100 * r[p.key]) / max).toFixed(1)}%;background:${p.color}" title="${h(p.name)}: ${r[p.key]}">${r[p.key]}</span>` : '')).join('')}</span></div>`).join('')}</div>
      <div class="rep-legend">${parts.map(p => `<span><i style="background:${p.color}"></i>${h(p.name)}</span>`).join('')}</div>`;
  },
  COL: { teal: '#0f766e', mint: '#5eead4', red: '#dc2626', amber: '#f59e0b', blue: '#2563eb', violet: '#7c3aed', slate: '#94a3b8' },

  /* ---------- the report itself ---------- */
  doc(s) {
    const r = Rep.range(s);
    const team = Store.scoredTeam();
    const ids = s.people && s.people.length ? s.people.filter(id => team.some(m => m.id === id)) : team.map(m => m.id);
    const D = Rep.calc(r, ids);
    const P = Rep.calc(r.prev, ids);
    const on = k => s.secs.includes(k);
    const C = Rep.COL;
    const tile = (label, v, pv, sub, goodUp = true, fmt = x => x) =>
      `<div class="rep-tile"><div class="kpi-label">${h(label)}</div><div class="kpi-val">${v == null ? '–' : fmt(v)} ${Rep.arrow(v, pv, goodUp)}</div><div class="kpi-sub">${sub || ''}${pv != null ? ` <span class="muted">· before ${fmt(pv)}</span>` : ''}</div></div>`;
    const pct = x => (x == null ? '–' : Math.round(x * 100) + '%');
    const list = (rows, empty_) =>
      rows.length
        ? `<table class="tbl rep-tbl">${rows.slice(0, 100).join('')}</table>${rows.length > 100 ? `<p class="muted small">… and ${rows.length - 100} more — the full list is in the Excel export.</p>` : ''}`
        : `<p class="muted small">${h(empty_)}</p>`;
    const sec = (k, title, body) => (on(k) ? `<section class="rep-sec"><h3>${title}</h3>${body}</section>` : '');
    const B = Rep.buckets(r);
    const tr = B.map(b => ({
      done: D.done.filter(t => Rep.inR(t.r.finish, b)).length,
      late: D.late.filter(t => Rep.inR(t.r.finish, b)).length,
      hd: D.hdClosed.filter(x => Rep.inR(x.r.resolved || x.r.created, b)).length,
      sw: U.sum(D.sw.filter(x => Rep.inR(x.r.date, b)).map(x => x.hrs)),
    }));
    const cats = {};
    for (const x of D.sw) cats[x.cat || 'OTHER'] = (cats[x.cat || 'OTHER'] || 0) + x.hrs;
    const yearScores =
      s.kind === 'year'
        ? U.MONTHS.map((m, i) => {
            const v = ids
              .map(id => Calc.score(+r.from.slice(0, 4), id, i + 1))
              .filter(Boolean)
              .map(x => x.score);
            return { label: m.slice(0, 3), value: v.length ? U.r2(U.avg(v)) : 0 };
          })
        : null;
    const who = id => h(Store.memberShort(id));
    const notes = s.notes || {};
    const RP = Custom.get('report', {}); // header / footer: Admin → Customize
    return `<article class="rep-doc">
      <header class="rep-head"><div><div class="rep-brand">${RP.logo === false ? '' : Store.logoHtml('', 'rep-logo')}<b>${h(Store.appName())}</b>${RP.org ? `<span class="rep-org">${h(RP.org)}</span>` : ''}</div><h2>${h(Store.teamName(App.viewTeam))} team report</h2><div class="rep-period">${h(r.label)}</div></div>
        <div class="rep-meta">Prepared by <b>${h(Store.memberName(App.me))}</b><br>${U.fmtDate(U.todayStr())}<br><span class="muted">${ids.length} ${ids.length === 1 ? 'person' : 'people'} · compared with the ${s.kind === 'custom' ? 'same length before' : 'previous ' + s.kind}</span></div></header>
      ${sec(
        'summary',
        'Summary',
        `<div class="rep-tiles">
        ${tile('To Dos done', D.done.length, P.done.length, `${D.late.length} late`)}
        ${tile('On time', D.onTimePct, P.onTimePct, '', true, pct)}
        ${tile('Overdue now', D.overdue.length, P.overdue.length, 'not finished, past due', false)}
        ${tile('Help desk closed', D.hdClosed.length, P.hdClosed.length, D.avgH != null ? `avg ${U.num(D.avgH, 1)} h` : '')}
        ${tile('Quick wins', D.qwCount, P.qwCount, 'completed')}
        ${tile('⭐ Milestones', D.miles.length, P.miles.length, 'done')}
        ${tile('Shadow work', U.r2(D.swHrs), U.r2(P.swHrs), 'hours', true, x => U.num(x, 1))}
        ${tile('Days off', D.off.length, P.off.length, U.mins(D.permH) + ' permission', false)}</div>`
      )}
      ${sec(
        'charts',
        'Charts',
        `<div class="rep-charts">
        <div class="rep-ch"><h4>Work done over the ${r.bucket === 'day' ? 'days' : r.bucket === 'week' ? 'weeks' : 'months'}</h4>${Rep.groupBars(
          B.map(b => b.label),
          [
            { name: 'To Dos done', color: C.teal, values: tr.map(x => x.done) },
            { name: 'Done late', color: C.red, values: tr.map(x => x.late) },
            { name: 'Help desk closed', color: C.blue, values: tr.map(x => x.hd) },
          ]
        )}</div>
        <div class="rep-ch rep-ch-sm"><h4>To Dos on time</h4>${Rep.donut(D.onTimePct, 'on time')}<p class="muted small">${D.done.length - D.late.length} of ${D.done.length} finished on time</p></div>
        <div class="rep-ch"><h4>To Dos per person</h4>${Rep.stack(D.per, [
          { key: 'onTime', name: 'On time', color: C.teal },
          { key: 'late', name: 'Late', color: C.red },
          { key: 'waiting', name: 'Still open', color: C.slate },
        ])}</div>
        <div class="rep-ch"><h4>Shadow work by category (hours)</h4>${
          Object.keys(cats).length
            ? UI.hbars(
                Object.entries(cats)
                  .sort((a, b) => b[1] - a[1])
                  .map(([label, value]) => ({ label, value: U.r2(value) })),
                { fmt: v => U.num(v, 1) }
              )
            : '<p class="muted small">No shadow work.</p>'
        }</div>
        ${yearScores ? `<div class="rep-ch rep-ch-wide"><h4>Team score by month</h4>${UI.barChart(yearScores, { height: 170, fmt: v => U.num(v, 1) })}</div>` : ''}</div>`
      )}
      ${sec('people', 'Per person', `<table class="tbl rep-tbl"><thead><tr><th>Name</th><th class="num">Done</th><th class="num">On time</th><th class="num">Late</th><th class="num">Overdue</th><th class="num">Open</th><th class="num">Help desk</th><th class="num">Avg h</th><th class="num">Shadow h</th><th class="num">QW</th><th class="num">⭐</th><th class="num">Off</th>${s.kind !== 'week' ? '<th class="num">Score</th>' : ''}</tr></thead><tbody>${D.per.map(p => `<tr><td><b>${who(p.id)}</b></td><td class="num">${p.done}</td><td class="num">${p.done ? Math.round((100 * p.onTime) / p.done) + '%' : '–'}</td><td class="num ${p.late ? 't-bad' : ''}">${p.late || ''}</td><td class="num ${p.overdue ? 't-bad' : ''}">${p.overdue || ''}</td><td class="num">${p.waiting || ''}</td><td class="num">${p.hd || ''}</td><td class="num">${p.hdHrs != null ? U.num(p.hdHrs, 1) : ''}</td><td class="num">${p.sw ? U.num(p.sw, 1) : ''}</td><td class="num">${p.qw || ''}</td><td class="num">${p.ms || ''}</td><td class="num">${p.off || ''}</td>${s.kind !== 'week' ? `<td class="num ${p.score != null ? UI.scoreClass(p.score) : ''}">${p.score != null ? U.num(p.score, 1) : ''}</td>` : ''}</tr>`).join('')}</tbody></table>`)}
      ${sec(
        'done',
        `Done <span class="count">${D.done.length}</span>`,
        list(
          D.done
            .sort((a, b) => b.r.finish.localeCompare(a.r.finish))
            .slice(0, 60)
            .map(
              t =>
                `<tr><td class="nw">${U.fmtDate(t.r.finish)}</td><td>${t.r.milestone ? '⭐ ' : ''}${h(t.r.task)}</td><td>${who(t.r.analyst)}</td><td>${t.timing === 'Delayed' ? '<span class="t-bad">late</span>' : ''}</td></tr>`
            ),
          'Nothing finished in this period.'
        )
      )}
      ${sec('delayed', `Delayed <span class="count">${D.overdue.length + D.late.length}</span>`, list([...D.overdue.map(t => `<tr><td class="nw">due ${U.fmtDate(t.due)}</td><td>${h(t.r.task)}</td><td>${who(t.r.analyst)}</td><td class="t-bad">overdue ${U.diffDays(t.due, U.todayStr())} d</td></tr>`), ...D.late.map(t => `<tr><td class="nw">done ${U.fmtDate(t.r.finish)}</td><td>${h(t.r.task)}</td><td>${who(t.r.analyst)}</td><td class="muted">${t.days} d late</td></tr>`)], 'Nothing delayed.'))}
      ${sec(
        'waiting',
        `Waiting <span class="count">${D.waiting.length}</span>`,
        list(
          D.waiting
            .slice(0, 60)
            .map(
              t =>
                `<tr><td>${h(t.r.task)}</td><td>${who(t.r.analyst)}</td><td>${t.status === 'Ready for review' ? 'waiting for manager to confirm' : 'in progress' + (t.due ? ' · due ' + U.fmtDate(t.due) : '')}</td></tr>`
            ),
          'Nothing waiting.'
        )
      )}
      ${sec(
        'milestones',
        `⭐ Milestones <span class="count">${D.miles.length}</span>`,
        list(
          D.miles.map(
            x =>
              `<tr><td class="nw">${U.fmtDate(x.date)}</td><td><b>${h(x.title)}</b></td><td>${h(x.who.map(Store.memberShort).join(', '))}</td><td class="muted">${h((typeof Mile !== 'undefined' && Mile.KINDS[x.kind]) || '')}</td></tr>`
          ),
          'No milestones done in this period.'
        )
      )}
      ${sec(
        'helpdesk',
        'Help Desk',
        `<p>${D.hdNew.length} new · <b>${D.hdClosed.length} closed</b>${D.avgH != null ? ` · average closing <b>${U.num(D.avgH, 1)} h</b>` : ''} · same day ${D.hdClosed.filter(x => x.sameDay === 'Same').length}</p>${UI.hbars(
          D.per.map(p => ({ label: Store.memberShort(p.id), value: p.hd })),
          { fmt: v => U.num(v, 0) }
        )}`
      )}
      ${sec('quickwins', `Quick wins <span class="count">${D.qwCount}</span>`, list([...D.qw.map(q => `<tr><td class="nw">${h(q.qwId || '')}</td><td><b>${h(q.subject)}</b></td><td>${h((typeof QS !== 'undefined' ? QS.people(q) : [q.analyst]).map(Store.memberShort).join(', '))}</td><td class="t-good">completed</td></tr>`), ...D.qwOpen.slice(0, 20).map(q => `<tr><td class="nw">${h(q.qwId || '')}</td><td>${h(q.subject)}</td><td>${who(q.analyst)}</td><td class="muted">${h(q.status || '')}</td></tr>`)], 'No quick wins.'))}
      ${sec(
        'shadow',
        'Shadow work',
        `<p><b>${U.num(D.swHrs, 1)} h</b> logged by the team.</p>${UI.hbars(
          D.per.map(p => ({ label: Store.memberShort(p.id), value: U.r2(p.sw) })),
          { fmt: v => U.num(v, 1) }
        )}`
      )}
      ${sec(
        'attendance',
        'Attendance & leave',
        list(
          D.per
            .filter(p => p.off || p.perm)
            .map(
              p =>
                `<tr><td><b>${who(p.id)}</b></td><td>${p.off} day(s) off</td><td>${p.perm ? U.mins(p.perm) + ' permission' : ''}</td></tr>`
            ),
          'Everyone was in — no days off or permission hours.'
        )
      )}
      ${sec(
        'projects',
        'Projects',
        (() => {
          const l = Scrum.visible()
            .filter(p => Scrum.teamOf(p) === App.viewTeam && p.status !== 'Canceled' && (p.status !== 'Done' || Rep.inR(p.doneDate, r)))
            .map(projDerive);
          return list(
            l.map(
              x =>
                `<tr><td><b>${h(x.r.name)}</b></td><td>${h(Store.memberShort(x.r.manager))}</td><td style="min-width:120px">${UI.bar(x.prog)} <span class="small">${x.prog}%</span></td><td>${h(typeof Flow !== 'undefined' && Flow.of(x.r) ? Flow.stageOf(x.r).name : x.r.status)}</td><td>${x.r.due ? 'target ' + U.fmtDate(x.r.due) : ''}</td></tr>`
            ),
            'No projects.'
          );
        })()
      )}
      ${sec(
        'dirtasks',
        'Tasks from the director',
        (() => {
          const l = Store.all('mgrtask')
            .map(mtDerive)
            .filter(x => x.open || Rep.inR(x.r.doneDate, r));
          return list(
            l.map(
              x =>
                `<tr><td><b>${h(x.r.task)}</b></td><td>${h(Store.memberShort(x.r.manager))}</td><td>${h(UI.statusLabel ? UI.statusLabel(x.st) : x.st)}</td><td>${x.r.due ? (x.late ? '<span class="t-bad">due ' + U.fmtDate(x.r.due) + '</span>' : 'due ' + U.fmtDate(x.r.due)) : ''}</td></tr>`
            ),
            'No tasks from the director.'
          );
        })()
      )}
      ${sec(
        'notes',
        'Notes',
        `<div class="rep-notes">${[
          ['high', 'Highlights'],
          ['issues', 'Issues / support needed'],
          ['next', s.kind === 'year' ? 'Plan for next year' : s.kind === 'month' ? 'Plan for next month' : 'Plan for next week'],
        ]
          .map(
            ([k, l]) =>
              `<div><h4>${l}</h4><div class="rep-note" data-note-out="${k}">${notes[k] ? h(notes[k]).replace(/\n/g, '<br>') : '<span class="muted">—</span>'}</div></div>`
          )
          .join('')}</div>`
      )}
      <footer class="rep-foot">${RP.footer ? `<div class="rep-foot-note">${h(RP.footer)}</div>` : ''}${h(Store.appName())}${RP.org ? ' · ' + h(RP.org) : ''} · ${h(r.from)} → ${h(r.to)} · printed ${U.fmtTs(Date.now())}</footer>
    </article>`;
  },
  async excel(s) {
    const r = Rep.range(s);
    const team = Store.scoredTeam();
    const ids = s.people && s.people.length ? s.people : team.map(m => m.id);
    const D = Rep.calc(r, ids);
    const RP = Custom.get('report', {});
    const sheets = [
      {
        name: 'Report',
        rows: [
          [RP.org || Store.appName()],
          [`${Store.appName()} — ${Store.teamName(App.viewTeam)} team report`],
          [r.label || `${r.from} to ${r.to}`],
          ['Prepared by ' + Store.memberName(App.me) + ' · ' + U.fmtDate(U.todayStr())],
          ...(RP.footer ? [[RP.footer]] : []),
        ],
      },
      {
        name: 'Per person',
        rows: [
          [
            'Name',
            'Done',
            'On time',
            'Late',
            'Overdue',
            'Open',
            'Help desk closed',
            'Avg closing h',
            'Shadow h',
            'Quick wins',
            'Milestones',
            'Days off',
            'Permission (min)',
            'Score',
          ],
          ...D.per.map(p => [
            Store.memberName(p.id),
            p.done,
            p.onTime,
            p.late,
            p.overdue,
            p.waiting,
            p.hd,
            p.hdHrs != null ? U.r2(p.hdHrs) : '',
            U.r2(p.sw),
            p.qw,
            p.ms,
            p.off,
            Math.round((p.perm || 0) * 60),
            p.score != null ? U.r2(p.score) : '',
          ]),
        ],
      },
      {
        name: 'Done',
        rows: [
          ['Finished', 'To Do', 'Person', 'Late', 'Milestone'],
          ...D.done.map(t => [
            t.r.finish,
            t.r.task,
            Store.memberName(t.r.analyst),
            t.timing === 'Delayed' ? 'late' : '',
            t.r.milestone ? 'yes' : '',
          ]),
        ],
      },
      {
        name: 'Delayed',
        rows: [
          ['Due', 'To Do', 'Person', 'Status'],
          ...D.overdue.map(t => [t.due, t.r.task, Store.memberName(t.r.analyst), 'overdue']),
          ...D.late.map(t => [t.due, t.r.task, Store.memberName(t.r.analyst), 'done late']),
        ],
      },
      {
        name: 'Waiting',
        rows: [
          ['To Do', 'Person', 'Status', 'Due'],
          ...D.waiting.map(t => [t.r.task, Store.memberName(t.r.analyst), t.status, t.due || '']),
        ],
      },
      {
        name: 'Milestones',
        rows: [
          ['Date', 'Milestone', 'People', 'Type'],
          ...D.miles.map(x => [
            x.date,
            x.title,
            x.who.map(Store.memberName).join(', '),
            (typeof Mile !== 'undefined' && Mile.KINDS[x.kind]) || '',
          ]),
        ],
      },
    ];
    XL.download(await XL.write(sheets), `${Store.teamName(App.viewTeam)} report ${r.from} to ${r.to}.xlsx`);
  },
};

P.reports = () => {
  const s = Rep.st();
  const team = Store.scoredTeam();
  const r = Rep.range(s);
  const step = d => {
    const a = s.anchor || U.todayStr();
    s.anchor =
      s.kind === 'week'
        ? U.addDays(a, 7 * d)
        : s.kind === 'month'
          ? U.addDays(a.slice(0, 8) + '15', 30 * d).slice(0, 8) + '01'
          : `${+a.slice(0, 4) + d}${a.slice(4)}`;
    App.render();
  };
  const html = `<div class="rep-controls card">
    <div class="rep-row"><div class="seg">${[
      ['week', 'Weekly'],
      ['month', 'Monthly'],
      ['year', 'Yearly'],
      ['custom', 'Dates…'],
    ]
      .map(([k, l]) => `<a class="${s.kind === k ? 'on' : ''}" href="javascript:void 0" data-rk="${k}">${l}</a>`)
      .join('')}</div>
      ${
        s.kind === 'custom'
          ? `<label class="flt"><span>From</span><input type="date" id="rfrom" value="${h(s.from || r.from)}"></label><label class="flt"><span>To</span><input type="date" id="rto" value="${h(s.to || r.to)}"></label>`
          : s.kind === 'month'
            ? `<button class="btn sm ghost" data-rstep="-1">‹</button><label class="flt"><span>Month</span><input type="month" id="rmonth" value="${h(r.from.slice(0, 7))}"></label><button class="btn sm ghost" data-rstep="1">›</button>`
            : s.kind === 'year'
              ? `<button class="btn sm ghost" data-rstep="-1">‹</button><label class="flt"><span>Year</span><select id="ryear">${[
                  0, 1, 2, 3,
                ]
                  .map(k => new Date().getFullYear() - k)
                  .map(y => `<option ${String(y) === r.from.slice(0, 4) ? 'selected' : ''}>${y}</option>`)
                  .join('')}</select></label><button class="btn sm ghost" data-rstep="1">›</button>`
              : `<button class="btn sm ghost" data-rstep="-1">‹</button><label class="flt"><span>Week of</span><input type="date" id="rweek" value="${h(s.anchor)}"></label><button class="btn sm ghost" data-rstep="1">›</button>`
      }
      <b class="rep-lbl">${h(r.label)}</b><span class="grow"></span>
      <button class="btn" id="rxl">⇩ Excel</button><button class="btn primary" id="rprint">🖨 Print / PDF</button></div>
    <details class="rep-opts" ${ps('rep').open ? 'open' : ''}><summary>Choose what goes in the report</summary>
      <div class="rep-row wrap"><b class="small">Sections</b>${Rep.SECTIONS.map(([k, l]) => `<label class="check chip-check"><input type="checkbox" data-rsec="${k}" ${s.secs.includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      <div class="rep-row wrap"><b class="small">People</b><label class="check chip-check"><input type="checkbox" data-rall ${!s.people.length ? 'checked' : ''}> Everyone</label>${team.map(m => `<label class="check chip-check"><input type="checkbox" data-rp="${h(m.id)}" ${s.people.includes(m.id) ? 'checked' : ''}> ${h(Store.memberShort(m.id))}</label>`).join('')}</div>
      ${
        s.secs.includes('notes')
          ? `<div class="grid-form rep-notes-in">${[
              ['high', 'Highlights'],
              ['issues', 'Issues / support needed'],
              ['next', 'Plan for next period'],
            ]
              .map(
                ([k, l]) =>
                  `<div class="fld"><label>${l}</label><textarea rows="3" data-note="${k}">${h((s.notes || {})[k] || '')}</textarea></div>`
              )
              .join('')}</div>`
          : ''
      }
      <div class="rep-row"><button class="btn sm" id="rtpl">★ Save as my template</button><span class="muted small">Sections and people are remembered for your next report.</span></div>
    </details></div>
    ${Rep.doc(s)}`;
  return {
    title: 'Reports',
    html,
    mount(root) {
      Store.ensureYears(Rep.years(r).concat(Rep.years(r.prev))).then(l => {
        if (l) App.render(true);
      }); // a period in an archived year: read it, then show
      root.querySelectorAll('[data-rk]').forEach(
        a =>
          (a.onclick = () => {
            s.kind = a.dataset.rk;
            s.anchor = U.todayStr();
            App.render();
          })
      );
      root.querySelectorAll('[data-rstep]').forEach(b => (b.onclick = () => step(+b.dataset.rstep)));
      const on = (sel, fn) => {
        const el = root.querySelector(sel);
        if (el)
          el.onchange = () => {
            fn(el.value);
            App.render();
          };
      };
      on('#rweek', v => {
        s.anchor = v || U.todayStr();
      });
      on('#rmonth', v => {
        if (v) s.anchor = v + '-01';
      });
      on('#ryear', v => {
        s.anchor = v + '-01-01';
      });
      on('#rfrom', v => {
        s.from = v;
      });
      on('#rto', v => {
        s.to = v;
      });
      const op = root.querySelector('.rep-opts');
      op.ontoggle = () => {
        ps('rep').open = op.open;
      };
      root.querySelectorAll('[data-rsec]').forEach(
        c =>
          (c.onchange = () => {
            s.secs = Rep.SECTIONS.map(x => x[0]).filter(k => (k === c.dataset.rsec ? c.checked : s.secs.includes(k)));
            App.render();
          })
      );
      const all = root.querySelector('[data-rall]');
      all.onchange = () => {
        if (all.checked) s.people = [];
        App.render();
      };
      root.querySelectorAll('[data-rp]').forEach(
        c =>
          (c.onchange = () => {
            const id = c.dataset.rp;
            s.people = c.checked ? [...new Set([...s.people, id])] : s.people.filter(x => x !== id);
            App.render();
          })
      );
      root.querySelectorAll('[data-note]').forEach(
        t =>
          (t.oninput = () => {
            s.notes = Object.assign({}, s.notes, { [t.dataset.note]: t.value });
            const out = root.querySelector(`[data-note-out="${t.dataset.note}"]`);
            if (out) out.innerHTML = t.value ? h(t.value).replace(/\n/g, '<br>') : '<span class="muted">—</span>';
          })
      );
      root.querySelector('#rtpl').onclick = () => {
        LS.set('bct.reptpl.' + App.me, { secs: s.secs, people: s.people });
        UI.toast('Saved as your template', 'good');
      };
      root.querySelector('#rprint').onclick = () => {
        document.body.classList.add('printing-report');
        setTimeout(() => {
          window.print();
          document.body.classList.remove('printing-report');
        }, 50);
      };
      root.querySelector('#rxl').onclick = () => Rep.excel(s);
    },
  };
};
