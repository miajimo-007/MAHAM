/* MAHAM — Quick Wins — list, approval and rejection. */
'use strict';

P.quickwins = () => {
  const s = ps('qw');
  const y = App.year;
  let rows = App.mine(Store.all('quickwin'), r => (QS.onIt(r) ? App.me : r.analyst))
    .filter(r => !r.date || yearOf(r.date) === y || yearOf(r.expected) === y)
    .map(r => ({ r, c: Calc.qwComment(r), days: r.date ? U.diffDays(r.date, U.todayStr()) : null }));
  const allY = rows;
  if (!s.hist && s.ap !== 'Rejected') rows = rows.filter(x => !qwHistory(x.r, true));
  if (s.analyst) rows = rows.filter(x => x.r.analyst === s.analyst || QS.confirmed(x.r).includes(s.analyst));
  if (s.st) rows = rows.filter(x => x.r.status === s.st);
  if (s.month) rows = rows.filter(x => inMonth(x.r.date, s.month) || inMonth(x.r.expected, s.month));
  if (s.ap) rows = rows.filter(x => (x.r.approval || 'Pending') === s.ap);
  if (s.ms) rows = rows.filter(x => x.r.milestone);
  rows.sort((a, b) => (b.r.qwId || '').localeCompare(a.r.qwId || '') || (b.r.date || '').localeCompare(a.r.date || ''));
  const uniq = list => new Set(list.map(x => x.r.qwId || x.r.subject)).size;
  const monthly = U.MONTHS.map((m, i) => ({ label: m, value: Calc.qwCompletedIds(y, i + 1).size }));
  const html = `<div class="kpis k4">${UI.kpi('Completed', Calc.qwCompletedIds(y).size, 'unique QW IDs, accepted')}${UI.kpi('In progress', uniq(allY.filter(x => U.lc(x.r.status) === 'in-progress')), '')}${UI.kpi('Awaiting approval', allY.filter(x => !x.r.approval).length, 'need manager decision')}${UI.kpi('Overdue', allY.filter(x => /Overdue/.test(x.c)).length, '', allY.some(x => /Overdue/.test(x.c)) ? 'sc-e' : '')}</div>
  ${card(`Quick wins completed by month — ${y}`, UI.barChart(monthly, { height: 130, width: 1100, fmt: v => U.num(v, 0), emptyText: 'No quick wins completed yet this year.' }))}
  <div class="page-actions">${filterBar('qw', [
    { key: 'analyst', type: 'member' },
    { key: 'month', type: 'month' },
    { key: 'st', label: 'Status', options: Store.list('qwStatus') },
    { key: 'ap', label: 'Approval', options: ['Accepted', 'Rejected', 'Pending'] },
    { key: 'ms', type: 'toggle', label: '⭐ Milestones only' },
    { key: 'hist', type: 'toggle', label: `Show rejected (history · ${allY.filter(x => qwHistory(x.r, true)).length})`, dflt: false },
  ])}${addBtn('quickwin', 'New quick win')}</div>
  ${UI.table({
    id: 'qw',
    rows,
    exportName: 'Quick Wins',
    onRow: true,
    bulk: qwBulk(),
    cols: [
      { key: 'date', label: 'Date', get: x => U.fmtDate(x.r.date), sortVal: x => x.r.date || '' },
      { key: 'qwId', label: 'ID', get: x => x.r.qwId },
      { key: 'analyst', label: 'Analyst', get: x => Store.memberShort(x.r.analyst) },
      { key: 'module', label: 'Module', get: x => x.r.module },
      {
        key: 'subject',
        label: 'Subject',
        html: x => h(x.r.subject) + UI.flagTags(x.r) + QS.tag(x.r) + Conv.tag(x.r),
        get: x => x.r.subject,
      },
      { key: 'type', label: 'Type', get: x => x.r.type },
      {
        key: 'status',
        label: 'Status',
        html: x => UI.sbadge(x.r.status),
        get: x => x.r.status,
        edit: {
          type: 'select',
          options: () => [['', '—'], ...Store.list('qwStatus')],
          ok: x => UI.canEditField('quickwin', x.r, 'status'),
          value: x => x.r.status || '',
          save: (x, v) => UI.saveField('quickwin', x.r, 'status', v, 'Status changed'),
        },
      },
      {
        key: 'expected',
        label: 'Expected',
        get: x => U.fmtDate(x.r.expected),
        sortVal: x => x.r.expected || '',
        edit: {
          type: 'date',
          ok: x => UI.canEditField('quickwin', x.r, 'expected'),
          value: x => x.r.expected || '',
          save: (x, v) => UI.saveField('quickwin', x.r, 'expected', v, 'Expected date changed'),
        },
      },
      {
        key: 'approval',
        label: 'Approval',
        html: x =>
          !x.r.approval && App.can('approveQW') && App.canEdit('quickwin')
            ? `<button class="btn xs primary" data-qwa="${h(x.r.id)}">Approve</button> <button class="btn xs ghost" data-qwr="${h(x.r.id)}">Reject</button>`
            : UI.sbadge(x.r.approval || 'Pending'),
        get: x => x.r.approval || 'Pending',
      },
      { key: 'days', label: 'Days', cls: 'num', get: x => (x.days == null ? '' : x.days), sortVal: x => x.days || 0 },
      {
        key: 'c',
        label: 'Auto comment',
        html: x => UI.sbadge(x.c) + (x.r.managerComment ? `<div class="muted small">💬 ${h(x.r.managerComment)}</div>` : ''),
        get: x => x.c,
      },
    ],
  })}`;
  return {
    title: 'Quick Wins',
    html: QS.card() + html,
    mount(root) {
      QS.bind(root);
      UI.bindTables(root, { qw: x => UI.editRecord('quickwin', x.r) });
      root.querySelectorAll('[data-qwa]').forEach(b => (b.onclick = () => decideQW(b.dataset.qwa, true)));
      root.querySelectorAll('[data-qwr]').forEach(b => (b.onclick = () => decideQW(b.dataset.qwr, false)));
    },
  };
};

function decideQW(id, approve) {
  const r = Store.get(id);
  if (!r) return;
  UI.modal({
    title: (approve ? 'Approve' : 'Reject') + ' quick win',
    body: `<p><b>${h(r.subject)}</b><br><span class="muted">${h(Store.memberShort(r.analyst))} · ${h(r.module || '')} · expected ${U.fmtDate(r.expected) || '—'}</span>${
      QS.shared(r)
        ? `<br><span class="small">🔗 With: ${QS.invited(r)
            .map(id => h(Store.memberShort(id)) + (QS.ans(r, id) === 'yes' ? ' ✓' : QS.ans(r, id) === 'no' ? ' ✕' : ' (waiting)'))
            .join(', ')} — one QW ID for all</span>`
        : ''
    }</p>
      <form class="grid-form" id="qwd">${approve ? UI.field({ key: 'qwId', label: 'QW ID', type: 'text' }, r.qwId || nextQwId()) : ''}${UI.field({ key: 'managerComment', label: 'Comment (optional)', type: 'textarea', span: 2, rows: 2 }, r.managerComment || '')}</form>`,
    actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn ${approve ? 'primary' : 'danger'}" data-ok>${approve ? 'Approve' : 'Reject'}</button>`,
    onMount: w => {
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelector('[data-ok]').onclick = () => {
        const f = w.querySelector('#qwd');
        const v = UI.readForm(f, approve ? [{ key: 'qwId' }, { key: 'managerComment' }] : [{ key: 'managerComment' }]);
        Store.save(Object.assign({}, r, v, { approval: approve ? 'Accepted' : 'Rejected' }));
        UI.closeModal();
        UI.toast(approve ? 'Approved' : 'Rejected', 'good');
        App.render();
      };
    },
  });
}

/* Quick wins list: approve or reject several at once (QW IDs are given automatically on approval) */
function qwBulk() {
  const ok = x => !x.r.approval && App.can('approveQW') && App.canEdit('quickwin');
  return [
    {
      label: '✓ Approve',
      ok,
      run: rows => {
        UI.saveUndo(
          rows.map(x => Object.assign({}, x.r, { approval: 'Accepted' })),
          `${rows.length} quick win${rows.length > 1 ? 's' : ''} approved`
        );
        App.render(true);
      },
    },
    {
      label: '✕ Reject',
      cls: 'ghost',
      ok,
      run: (rows, done) => {
        UI.confirm(`Reject ${rows.length} quick win${rows.length > 1 ? 's' : ''}?`, () => {
          done();
          UI.saveUndo(
            rows.map(x => Object.assign({}, x.r, { approval: 'Rejected' })),
            `${rows.length} rejected`,
            ''
          );
          App.render(true);
        });
        return false;
      },
    },
  ];
}
