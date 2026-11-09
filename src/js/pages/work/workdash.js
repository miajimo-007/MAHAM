/* MAHAM — Work dashboard: every project I can see, together. Open vs closed, how long things take,
 * approvals waiting, overdue, time spent in each status, waiting time (e.g. vendor), workload, completion. */
'use strict';

const WorkDash = {
  days(a, b) {
    return a && b ? Math.max(0, U.diffDays(a, b)) : null;
  },
  avg(l) {
    const x = l.filter(v => v != null);
    return x.length ? Math.round((10 * x.reduce((a, b) => a + b, 0)) / x.length) / 10 : null;
  },
  /* days spent in each status, from the move history (the current status counts until today) */
  timeIn(t, today) {
    const out = {};
    const hist = (t.hist || []).filter(x => x.to && x.from !== x.to);
    let at = t.createdOn || (hist[0] ? U.ds(new Date(hist[0].at)) : null);
    let st = hist.length ? hist[0].from || t.status : t.status;
    for (const x of hist) {
      const d = U.ds(new Date(x.at));
      if (at && st) out[st] = (out[st] || 0) + WorkDash.days(at, d);
      st = x.to;
      at = d;
    }
    if (at && st && !Scrum.isDone(t)) out[st] = (out[st] || 0) + WorkDash.days(at, today);
    return out;
  },
};

P.workdash = () => {
  const s = ps('workdash');
  const today = U.todayStr();
  const period = +s.period || 90;
  const from = U.addDays(today, -period);
  const projs = Scrum.visible().filter(p => (!s.team || Scrum.teamOf(p) === s.team) && (!s.project || p.id === s.project));
  const pids = new Set(projs.map(p => p.id));
  const all = Store.all('ptask').filter(t => pids.has(t.project) && !Work.isEpic(t) && (!s.type || (t.type || 'Task') === s.type));
  const open = all.filter(t => !Scrum.isDone(t));
  const closed = all.filter(t => Scrum.isDone(t) && t.doneDate && t.doneDate >= from);
  const created = all.filter(t => (t.createdOn || '') >= from);
  const over = open.filter(t => t.due && t.due < today);
  const appr = all.filter(t => t.pending);
  const res = WorkDash.avg(closed.map(t => WorkDash.days(t.createdOn || t.startedOn, t.doneDate)));
  // created vs closed by week (last 12)
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const a = U.addDays(today, -7 * i - 6),
      b = U.addDays(today, -7 * i);
    weeks.push({ a, b, label: i % 2 ? '' : U.fmtDate(a).slice(0, 6) });
  }
  const wk = f =>
    weeks.map(w => ({
      label: w.label,
      value: all.filter(t => {
        const d = f(t);
        return d && d >= w.a && d <= w.b;
      }).length,
    }));
  // time in status
  const tin = {};
  const cnt = {};
  for (const t of all) {
    const m = WorkDash.timeIn(t, today);
    for (const [k, v] of Object.entries(m)) {
      if (v == null) continue;
      tin[k] = (tin[k] || 0) + v;
      cnt[k] = (cnt[k] || 0) + 1;
    }
  }
  const tinL = Object.keys(tin)
    .map(k => ({ label: k, value: Math.round((10 * tin[k]) / cnt[k]) / 10 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
  // waiting (category "Waiting") per project
  const waitL = projs
    .map(p => {
      let d = 0,
        n = 0;
      for (const t of all.filter(x => x.project === p.id)) {
        const m = WorkDash.timeIn(t, today);
        let any = false;
        for (const [k, v] of Object.entries(m)) {
          const st = TaskFlow.statusOf(t, k);
          if (st && st.cat === 'wait') {
            d += v || 0;
            any = true;
          }
        }
        if (any) n++;
      }
      return { label: p.name, value: n ? Math.round((10 * d) / n) / 10 : 0, n };
    })
    .filter(x => x.n)
    .sort((a, b) => b.value - a.value);
  // workload
  const ppl = {};
  for (const t of open.filter(t => t.assignee)) {
    const x = (ppl[t.assignee] = ppl[t.assignee] || { n: 0, pts: 0, late: 0 });
    x.n++;
    x.pts += +t.points || 0;
    if (t.due && t.due < today) x.late++;
  }
  const byType = {};
  for (const t of all) {
    const k = t.type || 'Task';
    byType[k] = byType[k] || { open: 0, done: 0 };
    byType[k][Scrum.isDone(t) ? 'done' : 'open']++;
  }
  const byRes = {};
  for (const t of closed) {
    const k = t.resolution || 'Done';
    byRes[k] = (byRes[k] || 0) + 1;
  }
  const sel = (id, opts, v) =>
    `<select id="${id}">${opts.map(([a, b]) => `<option value="${h(a)}" ${String(a) === String(v || '') ? 'selected' : ''}>${h(b)}</option>`).join('')}</select>`;
  const teams = [...new Set(Scrum.visible().map(p => Scrum.teamOf(p)))];
  const types = [
    ...new Set(
      Store.all('ptask')
        .filter(t => !Work.isEpic(t))
        .map(t => t.type || 'Task')
    ),
  ];
  const html = `<p><a class="link" href="#/projects">← Projects</a></p>
    <div class="filters"><label>Team ${sel('wdteam', [['', 'All my teams']].concat(teams.map(t => [t, Store.teamName(t)])), s.team)}</label><label>Project ${sel(
      'wdproj',
      [['', 'All projects']].concat(
        Scrum.visible()
          .filter(p => !s.team || Scrum.teamOf(p) === s.team)
          .map(p => [p.id, p.name])
      ),
      s.project
    )}</label><label>Type ${sel('wdtype', [['', 'All types']].concat(types.map(t => [t, t])), s.type)}</label><label>Period ${sel(
      'wdper',
      [
        [30, 'Last 30 days'],
        [90, 'Last 90 days'],
        [180, 'Last 6 months'],
        [365, 'Last 12 months'],
      ],
      period
    )}</label></div>
    <div class="kpis k5">${UI.kpi('Open', U.num(open.length), `${created.length} created in the period`)}${UI.kpi('Closed', U.num(closed.length), `in the period`, 'sc-a')}${UI.kpi('Average time to close', res == null ? '—' : res + ' d', 'created → done')}${UI.kpi('Waiting approval', U.num(appr.length), '', appr.length ? 'sc-c' : '')}${UI.kpi('Overdue', U.num(over.length), '', over.length ? 'sc-e' : '')}</div>
    <div class="wd-grid">
      ${card(
        'Created per week',
        UI.barChart(
          wk(t => t.createdOn),
          { height: 160, width: 520 }
        )
      )}
      ${card(
        'Closed per week',
        UI.barChart(
          wk(t => (Scrum.isDone(t) ? t.doneDate : '')),
          { height: 160, width: 520, color: 'var(--good, #16a34a)' }
        )
      )}
      ${card('Average days in each status', tinL.length ? UI.hbars(tinL, { fmt: v => v + ' d' }) : empty('No moves recorded yet — the history starts with task workflows.'))}
      ${card('Waiting time per project <span class="muted small">(days in Waiting statuses — e.g. vendor, approval, access)</span>', waitL.length ? UI.hbars(waitL, { fmt: v => v + ' d' }) : empty('Nothing has waited yet.'))}
      ${card(
        'Workload (open items)',
        Object.keys(ppl).length
          ? `<table class="tbl"><thead><tr><th>Person</th><th class="num">Items</th><th class="num">Points</th><th class="num">Overdue</th></tr></thead><tbody>${Object.entries(
              ppl
            )
              .sort((a, b) => b[1].pts - a[1].pts || b[1].n - a[1].n)
              .map(
                ([id, x]) =>
                  `<tr><td>${h(Store.memberShort(id))}</td><td class="num">${x.n}</td><td class="num">${x.pts}</td><td class="num ${x.late ? 't-bad strong' : ''}">${x.late || ''}</td></tr>`
              )
              .join('')}</tbody></table>`
          : empty('Nobody has open items.')
      )}
      ${card(
        'Projects',
        projs.length
          ? `<table class="tbl"><thead><tr><th>Project</th><th class="num">Done</th><th class="num">Open</th><th class="num">Overdue</th><th style="width:22%">Done %</th></tr></thead><tbody>${projs
              .map(p => {
                const it = all.filter(t => t.project === p.id && t.status !== 'Canceled');
                const d = it.filter(t => Scrum.isDone(t)).length;
                const o = it.length - d;
                const l = it.filter(t => !Scrum.isDone(t) && t.due && t.due < today).length;
                return { p, it, d, o, l };
              })
              .filter(x => x.it.length)
              .sort((a, b) => b.l - a.l || b.o - a.o)
              .map(
                x =>
                  `<tr><td><a class="link" href="#/project/${h(x.p.id)}">${h(x.p.name)}</a></td><td class="num">${x.d}</td><td class="num">${x.o}</td><td class="num ${x.l ? 't-bad strong' : ''}">${x.l || ''}</td><td>${UI.bar(Math.round((100 * x.d) / x.it.length))}</td></tr>`
              )
              .join('')}</tbody></table>`
          : empty('No projects.')
      )}
      ${card(
        'By type',
        `<table class="tbl"><thead><tr><th>Type</th><th class="num">Open</th><th class="num">Done</th></tr></thead><tbody>${Object.entries(
          byType
        )
          .map(([k, x]) => `<tr><td>${h(k)}</td><td class="num">${x.open}</td><td class="num">${x.done}</td></tr>`)
          .join('')}</tbody></table>`
      )}
      ${card('Closed by resolution', Object.keys(byRes).length ? UI.hbars(Object.entries(byRes).map(([k, v]) => ({ label: k, value: v }))) : empty('Nothing closed in the period.'))}
      ${appr.length ? card('Waiting approval', `<div class="li-list">${appr.map(t => `<div class="li click" data-edit="ptask|${h(t.id)}"><span class="mono small">${h(Work.key(t))}</span> ${h(t.title)} <span class="muted small">· ${h(t.pending.trName)} · asked ${h(U.fmtDate(U.ds(new Date(t.pending.at))))} by ${h(Store.memberShort(t.pending.by))}</span></div>`).join('')}</div>`) : ''}
      ${
        over.length
          ? card(
              'Overdue',
              `<div class="li-list">${over
                .sort((a, b) => a.due.localeCompare(b.due))
                .slice(0, 30)
                .map(
                  t =>
                    `<div class="li click" data-edit="ptask|${h(t.id)}"><span class="mono small">${h(Work.key(t))}</span> ${h(t.title)} <span class="t-bad small">· due ${h(U.fmtDate(t.due))}</span> <span class="muted small">· ${h(t.assignee ? Store.memberShort(t.assignee) : 'unassigned')} · ${h(t.status)}</span></div>`
                )
                .join('')}</div>`
            )
          : ''
      }
    </div>`;
  return {
    title: 'Work dashboard',
    html,
    mount(root) {
      const on = (id, k) => {
        const e = root.querySelector('#' + id);
        if (e)
          e.onchange = () => {
            s[k] = e.value;
            if (k === 'team') s.project = '';
            App.render();
          };
      };
      on('wdteam', 'team');
      on('wdproj', 'project');
      on('wdtype', 'type');
      on('wdper', 'period');
    },
  };
};
