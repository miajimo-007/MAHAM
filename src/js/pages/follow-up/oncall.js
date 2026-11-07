/* MAHAM — On-Call / Good Catch: two tabs — the on-call log, and good catches (domain/goodcatch.js). */
'use strict';

P.oncall = sub => {
  const tab = sub === 'goodcatch' || (!sub && ps('oc').tab === 'goodcatch') ? 'goodcatch' : 'oncall';
  ps('oc').tab = tab;
  // On-Call sheet (Team & Time) and Good Catch (Follow-up) are separate menu items now: no inner tabs
  const tabs = '';
  if (tab === 'goodcatch') {
    const g = goodCatchTab();
    return { title: 'Good Catch', html: tabs + g.html, mount: g.mount };
  }
  const plan = Store.all('info').filter(r => r.category === 'On-Call Plan');
  const s = ps('oc');
  let rows = App.mine(Store.all('oncall'), r => r.analyst);
  if (s.analyst) rows = rows.filter(r => r.analyst === s.analyst);
  if (s.month) rows = rows.filter(r => inMonth(r.date, s.month));
  if (s.st) rows = rows.filter(r => (r.status || '') === s.st);
  rows = [...rows].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const html = `${tabs}${card(`On-call plan ${App.year}`, plan.length ? `<div class="oc-plan">${plan.map(p => `<div class="click" data-edit="info|${h(p.id)}"><b>${h(p.title)}</b><span>${h(p.value)}</span></div>`).join('')}</div>` : empty('No plan yet — add "On-Call Plan" items in Info & Dashboards.'))}
  <div class="page-actions">${filterBar('oc', [
    { key: 'analyst', type: 'member' },
    { key: 'month', type: 'month' },
    {
      key: 'st',
      label: 'Status',
      options: () => [
        ...new Set(
          Store.all('oncall')
            .map(r => r.status)
            .filter(Boolean)
        ),
      ],
    },
  ])}${addBtn('oncall', 'Log on-call issue')}</div>
  ${UI.table({
    id: 'oc',
    rows,
    exportName: 'On-Call Sheet',
    onRow: true,
    cols: [
      { key: 'analyst', label: 'Analyst', get: r => Store.memberShort(r.analyst) },
      { key: 'date', label: 'Date', get: r => U.fmtDate(r.date), sortVal: r => r.date || '' },
      { key: 'time', label: 'Time', get: r => r.time },
      { key: 'issue', label: 'Issue', get: r => r.issue },
      { key: 'action', label: 'Action', get: r => r.action },
      { key: 'status', label: 'Status', html: r => UI.sbadge(r.status), get: r => r.status },
    ],
  })}`;
  return {
    title: 'On-Call',
    html,
    mount(root) {
      UI.bindTables(root, { oc: r => UI.editRecord('oncall', r) });
    },
  };
};

/* Good Catch tab */
function goodCatchTab() {
  const s = ps('gc');
  const view = s.view || 'all';
  const all = GC.all();
  let rows = all;
  if (view === 'mine') rows = rows.filter(g => GC.finder(g) === App.me);
  if (view === 'taken') rows = rows.filter(g => g.taker === App.me && GC.isOpen(g));
  if (view === 'free') rows = rows.filter(g => GC.isOpen(g) && !g.taker);
  if (s.month) rows = rows.filter(g => inMonth(g.found, s.month) || inMonth(g.resolvedOn, s.month));
  if (s.kind) rows = rows.filter(g => g.kind === s.kind);
  if (s.st) rows = rows.filter(g => (s.st === 'open' ? GC.isOpen(g) : (g.status || 'New') === s.st));
  if (s.by) rows = rows.filter(g => GC.finder(g) === s.by);
  if (s.tk) rows = rows.filter(g => g.taker === s.tk);
  if (s.sys) rows = rows.filter(g => g.system === s.sys || g.where === s.sys);
  rows = [...rows].sort(
    (a, b) =>
      GC.isOpen(b) - GC.isOpen(a) ||
      { High: 0, Medium: 1, Low: 2 }[a.impact || 'Medium'] - { High: 0, Medium: 1, Low: 2 }[b.impact || 'Medium'] ||
      (b.found || '').localeCompare(a.found || '')
  );
  const mo = U.todayStr().slice(0, 7);
  const res = all.filter(g => g.status === GC.ST.R && g.resolvedOn);
  const avg = res.length ? U.avg(res.map(GC.days)) : null;
  const people = () =>
    Store.visible()
      .filter(m => m.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(m => [m.id, Store.memberShort(m.id)]);
  const cnt = v =>
    ({
      mine: all.filter(g => GC.finder(g) === App.me).length,
      taken: all.filter(g => g.taker === App.me && GC.isOpen(g)).length,
      free: all.filter(g => GC.isOpen(g) && !g.taker).length,
      all: all.length,
    })[v];
  const html = `<div class="kpis k4">${UI.kpi('Open', all.filter(g => (g.status || 'New') === GC.ST.N).length, `${cnt('free')} with nobody on it`, cnt('free') ? 'sc-c' : '')}${UI.kpi('In progress', all.filter(g => g.status === GC.ST.P).length, '')}${UI.kpi('Resolved this month', res.filter(g => g.resolvedOn.startsWith(mo)).length, `${all.filter(g => (g.found || '').startsWith(mo)).length} found this month`, 'sc-a')}${UI.kpi('Average days to resolve', avg == null ? '–' : U.num(avg, 1), res.length + ' resolved in all')}</div>
  <div class="page-actions"><div class="pm-seg">${[
    ['all', 'All'],
    ['mine', 'My catches'],
    ['taken', 'Taken by me'],
    ['free', 'Open, nobody on it'],
  ]
    .map(
      ([v, l]) =>
        `<button class="btn sm ${view === v ? 'primary' : 'ghost'}" data-gcv="${v}">${l} <span class="count">${cnt(v)}</span></button>`
    )
    .join('')}</div><span class="grow"></span>${addBtn('gcatch', 'Report a good catch')}</div>
  <div class="page-actions">${filterBar('gc', [
    { key: 'month', type: 'month' },
    { key: 'kind', label: 'Type', options: GC.KINDS },
    { key: 'st', label: 'Status', options: [['open', 'Open (new + in progress)'], ...Object.values(GC.ST)] },
    { key: 'by', label: 'Found by', options: people },
    { key: 'tk', label: 'Taken by', options: people },
    { key: 'sys', label: 'Where', options: () => [...new Set(all.flatMap(g => [g.system, g.where]).filter(Boolean))].sort() },
  ])}</div>
  <p class="muted small">Saw something wrong, or something that could work better? Report it — anyone in the department can take it and resolve it. Good catches are not scored; they show on Performance as recognition.</p>
  ${UI.table({
    id: 'gc',
    rows,
    exportName: 'Good catches',
    onRow: true,
    bulk: [
      {
        label: "🙋 I'll take these",
        ok: g => GC.canTake(g),
        run: rows => {
          UI.saveUndo(
            rows.flatMap(g => [
              Object.assign({}, g, { taker: App.me, status: GC.ST.P }),
              { c: 'gcupdate', catch: g.id, text: '🙋 Took it', at: Date.now() },
            ]),
            `${rows.length} good catch${rows.length > 1 ? 'es' : ''} taken — they're yours`
          );
          App.render(true);
        },
      },
    ],
    cols: [
      { key: 'found', label: 'Found', get: g => U.fmtDate(g.found), sortVal: g => g.found || '' },
      {
        key: 'title',
        label: 'What',
        html: g => `<b>${h(g.title)}</b>${g.action ? `<div class="muted small">did: ${h(g.action.split('\n')[0])}</div>` : ''}`,
        get: g => g.title,
      },
      {
        key: 'kind',
        label: 'Type',
        html: g => UI.badge(g.kind === 'Issue' ? 'Issue' : 'Enhancement', g.kind === 'Issue' ? 'bad' : 'cat'),
        get: g => g.kind,
      },
      { key: 'where', label: 'Where', get: g => [g.system, g.where].filter(Boolean).join(' · ') },
      { key: 'impact', label: 'Impact', html: g => UI.sbadge(g.impact), get: g => g.impact },
      {
        key: 'by',
        label: 'Found by',
        get: g =>
          Store.memberShort(GC.finder(g)) +
          ((Store.member(GC.finder(g)) || {}).team && (Store.member(GC.finder(g)) || {}).team !== App.viewTeam
            ? ' (' + Store.teamName(Store.member(GC.finder(g)).team) + ')'
            : ''),
      },
      {
        key: 'taker',
        label: 'Taken by',
        html: g =>
          g.taker
            ? h(Store.memberShort(g.taker))
            : GC.canTake(g)
              ? `<button class="btn xs" data-gctake="${h(g.id)}">🙋 I'll take it</button>`
              : '<span class="muted">—</span>',
        get: g => Store.memberShort(g.taker),
      },
      {
        key: 'status',
        label: 'Status',
        html: g =>
          UI.badge(g.status || 'New', { Resolved: 'good', 'In progress': 'warn', New: '' }[g.status || 'New'] || '') +
          (g.convertedTo ? ` <span class="muted small">→ ${g.convertedTo === 'quickwin' ? 'quick win' : 'project'}</span>` : ''),
        get: g => g.status || 'New',
      },
      { key: 'days', label: 'Days', cls: 'num', get: g => GC.days(g), sortVal: g => GC.days(g) },
      {
        key: 'ups',
        label: '',
        html: g => (n => (n ? `<span class="muted small">💬 ${n}</span>` : ''))(GC.updates(g.id).length),
        get: g => GC.updates(g.id).length,
      },
    ],
  })}`;
  return {
    html,
    mount(root) {
      root.querySelectorAll('[data-gcv]').forEach(
        b =>
          (b.onclick = () => {
            s.view = b.dataset.gcv;
            App.render();
          })
      );
      root.querySelectorAll('[data-gctake]').forEach(
        b =>
          (b.onclick = e => {
            e.stopPropagation();
            GC.take(Store.get(b.dataset.gctake));
          })
      );
      UI.bindTables(root, { gc: g => UI.editRecord('gcatch', Store.get(g.id) || g) });
    },
  };
}
