/* MAHAM — Usage report (permission "See usage"): screens, functions and approximate time per person,
 * and which To Dos they have not opened. Data: domain/usage.js. */
'use strict';

const UsageR = {
  pageName(key) {
    const [p, sub] = key.split('/');
    const nav = Config.NAV.flatMap(g => g[1]);
    const n = nav.find(x => x[0] === p) || (Config.PAGES || []).find(x => x[0] === p);
    const base =
      {
        home: 'Analyst Desk / Desk',
        manager: 'Manager Desk',
        director: 'Director Desk',
        project: 'Project',
        admin: 'Admin',
        adminperson: 'Admin → person',
        settings: 'Settings',
        syscheck: 'System Check',
        about: 'About',
        feedback: 'Feedback',
        perf: 'Performance',
        overview: 'All Teams Overview',
      }[p] || (n ? Custom.navLabel(p, n[1]) : p);
    return sub && !/^(project|mt|meeting)-/.test(sub) && !/^[a-z]+-[a-z0-9-]{8,}$/.test(sub)
      ? `${base} → ${sub.charAt(0).toUpperCase() + sub.slice(1)}`
      : base;
  },
  fnName(k) {
    const [c, a] = k.split(':');
    if (k === 'helpdesk:import') return 'Imported ManageEngine';
    if (k === 'excel:export') return 'Exported to Excel';
    if (k === 'comment:add') return 'Wrote a comment / update';
    const S = Schemas[c];
    const nm = S ? S.single : c;
    return { add: 'Added ', edit: 'Updated ', delete: 'Deleted ' }[a] + nm.charAt(0).toLowerCase() + nm.slice(1);
  },
  range(s) {
    const t = U.todayStr();
    const d = U.pd(t);
    if (s.per === 'week') return [U.addDays(t, -d.getDay()), t];
    if (s.per === 'last') {
      const a = new Date(d.getFullYear(), d.getMonth() - 1, 1),
        b = new Date(d.getFullYear(), d.getMonth(), 0);
      return [U.ds(a), U.ds(b)];
    }
    if (s.per === 'custom' && s.from && s.to) return [s.from, s.to];
    if (s.per === '30') return [U.addDays(t, -29), t];
    return [t.slice(0, 8) + '01', t];
  },
  /* one person over a period */
  of(id, from, to) {
    const u = Store.get('usage-' + id) || {};
    const days = Object.entries(u.days || {}).filter(([d]) => d >= from && d <= to);
    const scr = {},
      fn = {};
    let time = 0;
    for (const [day, d] of days) {
      for (const [k, n] of Object.entries(d.pages || {})) {
        const x = (scr[k] = scr[k] || { n: 0, days: new Set(), t: 0 });
        x.n += n;
        x.days.add(day);
      }
      for (const [k, sec] of Object.entries(d.time || {})) {
        const x = (scr[k] = scr[k] || { n: 0, days: new Set(), t: 0 });
        x.t += sec;
        time += sec;
      }
      for (const [k, n] of Object.entries(d.fn || {})) fn[k] = (fn[k] || 0) + n;
    }
    const todos = Store.all('todo', '*').filter(
      t => t.analyst === id && t.assigned && t.assigned >= from && t.assigned <= to && t.status !== 'Canceled'
    );
    const todoSeen = u.todo || {};
    return {
      days: days.sort((a, b) => a[0].localeCompare(b[0])),
      scr,
      fn,
      time,
      todos,
      opened: todos.filter(t => (todoSeen[t.id] || {}).o).length,
      notOpened: todos.filter(t => !(todoSeen[t.id] || {}).o),
      todoSeen,
    };
  },
  hrs(sec) {
    if (!sec) return '–';
    const m = Math.round(sec / 60);
    return m < 60 ? m + ' min' : U.num(m / 60, 1) + ' h';
  },
  people() {
    const teams = new Set(App.myTeams().map(t => t.id));
    return Store.visible()
      .filter(m => m.active !== false && (App.isSuper() || (!Store.topRole(m.role) && teams.has(m.team || 'apps'))))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  /* Manager Desk line: To Dos given more than a day ago that the person has not opened */
  mgrLine() {
    if (!Admin.canSee()) return '';
    const old = U.addDays(U.todayStr(), -1);
    const since = Date.parse('2026-11-04T00:00:00+03:00');
    const l = Store.all('todo').filter(
      t =>
        t.status === 'In Progress' &&
        t.analyst !== App.me &&
        t.assigned &&
        t.assigned <= old &&
        (t._ts || 0) >= since &&
        !(Admin.todoSeen(t) || {}).o
    );
    return l.length
      ? `<div class="oneline">👁 <b>${l.length}</b> To Do${l.length === 1 ? '' : 's'} given more than a day ago not opened yet: ${[...U.groupBy(l, t => t.analyst)].map(([a, x]) => `${h(Store.memberShort(a))} ${x.length}`).join(' · ')} <a class="link" href="#/usage">Usage →</a></div>`
      : '';
  },
};

P.usage = () => {
  if (!Admin.canSee()) return { title: 'Usage', html: empty('Not available.') };
  const s = ps('usage');
  const [from, to] = UsageR.range(s);
  const ppl = UsageR.people();
  const who = ppl.some(m => m.id === s.who) ? s.who : '';
  const head = `<div class="page-actions"><label class="flt"><span>Period</span><select id="uper">${[
    ['month', 'This month'],
    ['week', 'This week'],
    ['30', 'Last 30 days'],
    ['last', 'Last month'],
    ['custom', 'Pick dates'],
  ]
    .map(([v, l]) => `<option value="${v}" ${(s.per || 'month') === v ? 'selected' : ''}>${l}</option>`)
    .join('')}</select></label>
    ${s.per === 'custom' ? `<label class="flt"><span>From</span><input type="date" id="ufrom" value="${h(s.from || from)}"></label><label class="flt"><span>To</span><input type="date" id="uto" value="${h(s.to || to)}"></label>` : ''}
    <label class="flt"><span>Person</span><select id="uwho"><option value="">Whole team</option>${ppl.map(m => `<option value="${h(m.id)}" ${who === m.id ? 'selected' : ''}>${h(Store.memberShort(m.id))}</option>`).join('')}</select></label>
    <span class="muted small">${U.fmtDate(from)} – ${U.fmtDate(to)} · time is approximate (only while the app is open and used; idle over 10 minutes is not counted)</span></div>`;
  let body;
  if (!who) {
    const rows = ppl.map(m => Object.assign({ m }, UsageR.of(m.id, from, to)));
    body = UI.table({
      id: 'usage',
      rows,
      exportName: 'Usage ' + from + ' to ' + to,
      onRow: true,
      cols: [
        {
          key: 'name',
          label: 'Person',
          html: x => `<b>${h(Store.memberShort(x.m.id))}</b> <span class="muted small">${h(Store.teamName(x.m.team))}</span>`,
          get: x => Store.memberShort(x.m.id),
        },
        { key: 'days', label: 'Days active', cls: 'num', get: x => x.days.length },
        {
          key: 'time',
          label: 'Time (approx.)',
          cls: 'num',
          get: x => UsageR.hrs(x.time),
          sortVal: x => x.time,
          xval: x => Math.round(x.time / 60),
        },
        { key: 'scr', label: 'Screens used', cls: 'num', get: x => Object.keys(x.scr).length },
        {
          key: 'top',
          label: 'Most used',
          get: x =>
            Object.entries(x.scr)
              .sort((a, b) => b[1].t - a[1].t || b[1].n - a[1].n)
              .slice(0, 3)
              .map(([k]) => UsageR.pageName(k))
              .join(', '),
        },
        { key: 'fn', label: 'Things done', cls: 'num', get: x => U.sum(Object.values(x.fn)) },
        {
          key: 'todo',
          label: 'To Dos opened',
          cls: 'num',
          html: x =>
            x.todos.length
              ? `${x.opened}/${x.todos.length}${x.notOpened.length ? ` <span class="t-warn small">${x.notOpened.length} not opened</span>` : ''}`
              : '–',
          get: x => (x.todos.length ? `${x.opened}/${x.todos.length}` : ''),
        },
        {
          key: 'last',
          label: 'Last used',
          get: x => {
            const d = x.days[x.days.length - 1];
            return d ? U.fmtDate(d[0]) : 'not in this period';
          },
        },
      ],
    });
  } else {
    const x = UsageR.of(who, from, to);
    const tm = ts => (ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
    const allowed = [
      ...new Set(
        Config.NAV.flatMap(g => g[1])
          .filter(n => !(n[3] && (n[3].mgr || n[3].superOnly)))
          .map(n => (n[3] && n[3].page) || n[0])
      ),
    ].filter(k => Store.pageOn(who, k, (Store.member(who) || {}).team) && !['usage'].includes(k));
    const used = new Set(Object.keys(x.scr).map(k => k.split('/')[0]));
    const never = allowed.filter(k => !used.has(k) && !(k === 'perf' && ['performance', 'dashboard'].some(p => used.has(p))));
    const scr = Object.entries(x.scr).sort((a, b) => b[1].t - a[1].t || b[1].n - a[1].n);
    const fns = Object.entries(x.fn).sort((a, b) => b[1] - a[1]);
    body = `<div class="kpis k4">${UI.kpi('Days active', x.days.length, '')}${UI.kpi('Time (approx.)', UsageR.hrs(x.time), x.days.length ? '≈ ' + UsageR.hrs(x.time / x.days.length) + ' a day' : '')}${UI.kpi('Screens used', Object.keys(x.scr).length, never.length ? never.length + ' never opened' : '')}${UI.kpi('To Dos opened', x.todos.length ? `${x.opened}/${x.todos.length}` : '–', x.notOpened.length ? `<b class="t-warn">${x.notOpened.length} not opened</b>` : '', x.notOpened.length ? 'sc-c' : '')}</div>
    <div class="cols2"><div>
      ${card('Screens', scr.length ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Screen</th><th class="num">Opened</th><th class="num">Days</th><th class="num">Time</th></tr></thead><tbody>${scr.map(([k, v]) => `<tr><td>${h(UsageR.pageName(k))}</td><td class="num">${v.n}</td><td class="num">${v.days.size}</td><td class="num">${UsageR.hrs(v.t)}</td></tr>`).join('')}</tbody></table></div>` : empty('Nothing in this period.'))}
      ${never.length ? card(`Never opened in this period <span class="count">${never.length}</span>`, `<div class="small">${never.map(k => h(UsageR.pageName(k))).join(' · ')}</div>`) : ''}
    </div><div>
      ${card('Functions used', fns.length ? `<table class="tbl"><thead><tr><th>What</th><th class="num">Times</th></tr></thead><tbody>${fns.map(([k, n]) => `<tr><td>${h(UsageR.fnName(k))}</td><td class="num">${n}</td></tr>`).join('')}</tbody></table>` : empty('Nothing done in this period (or not recorded yet — functions are counted from version 2026.11.04.3).'))}
      ${card(
        `To Dos given in this period <span class="count">${x.todos.length}</span>`,
        x.todos.length
          ? x.todos
              .sort((a, b) => (b.assigned || '').localeCompare(a.assigned || ''))
              .map(
                t =>
                  `<div class="li click" data-edit="todo|${h(t.id)}"><div class="grow"><b>${h(t.task)}</b><div class="muted small">given ${U.fmtDate(t.assigned)} · ${h(t.status)}</div></div>${Admin.seenLabel(t)}</div>`
              )
              .join('')
          : empty('None.')
      )}
    </div></div>
    ${card(
      'Day by day',
      x.days.length
        ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Day</th><th>First</th><th>Last</th><th class="num">Screens opened</th><th class="num">Time</th><th class="num">Things done</th></tr></thead><tbody>${x.days
            .slice()
            .reverse()
            .map(
              ([d, v]) =>
                `<tr><td>${U.fmtDate(d)}</td><td>${tm(v.first)}</td><td>${tm(v.last)}</td><td class="num">${v.n || 0}</td><td class="num">${UsageR.hrs(U.sum(Object.values(v.time || {})))}</td><td class="num">${U.sum(Object.values(v.fn || {}))}</td></tr>`
            )
            .join('')}</tbody></table></div>`
        : empty('Did not use the app in this period.')
    )}`;
  }
  return {
    title: who ? 'Usage — ' + Store.memberShort(who) : 'Usage',
    html: head + body,
    mount(root) {
      root.querySelector('#uper').onchange = e => {
        s.per = e.target.value;
        App.render();
      };
      root.querySelector('#uwho').onchange = e => {
        s.who = e.target.value;
        App.render();
      };
      const f = root.querySelector('#ufrom'),
        t = root.querySelector('#uto');
      if (f)
        f.onchange = () => {
          s.from = f.value;
          App.render();
        };
      if (t)
        t.onchange = () => {
          s.to = t.value;
          App.render();
        };
      UI.bindTables(root, {
        usage: x => {
          s.who = x.m.id;
          App.render();
        },
      });
    },
  };
};
