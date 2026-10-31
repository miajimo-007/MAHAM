/* DARRIK — Central Follow-up. */
'use strict';

P.central = () => {
  const s = ps('riy');
  let rows = App.mine(Store.all('central'), r => r.analyst).map(r => ({ r, c: Calc.centralComment(r), days: Calc.centralDays(r) }));
  const all = rows;
  if (s.analyst) rows = rows.filter(x => x.r.analyst === s.analyst);
  if (s.st) rows = rows.filter(x => x.r.status === s.st);
  if (s.open) rows = rows.filter(x => x.c !== 'Request closed');
  rows.sort((a, b) => (b.days || 0) - (a.days || 0));
  const n = t => all.filter(x => x.c === t).length;
  const html = `<div class="kpis k4">${UI.kpi('Need analyst follow-up', n('Need Analyst Follow up'), '> 30 days under review', n('Need Analyst Follow up') ? 'sc-c' : '')}${UI.kpi('Need team leader follow-up', n('Need Team Leader Follow up'), '> 60 days', n('Need Team Leader Follow up') ? 'sc-d' : '')}${UI.kpi('Need manager follow-up', n('Need Manager Follow Up'), '> 90 days', n('Need Manager Follow Up') ? 'sc-e' : '')}${UI.kpi('Missing Redmine / date', all.filter(x => /Insert/.test(x.c)).length, 'accepted requests')}</div>
  <div class="page-actions">${filterBar('riy', [
    { key: 'analyst', type: 'member' },
    { key: 'st', label: 'Status', options: Store.list('centralStatus') },
    { key: 'open', type: 'toggle', label: 'Hide closed', dflt: true },
  ])}${addBtn('central', 'New follow-up')}</div>
  ${UI.table({
    id: 'riy',
    rows,
    exportName: 'Central FU',
    onRow: true,
    cols: [
      { key: 'date', label: 'Date', get: x => U.fmtDate(x.r.date), sortVal: x => x.r.date || '' },
      { key: 'reqId', label: 'Req ID', get: x => x.r.reqId },
      { key: 'analyst', label: 'Analyst', get: x => Store.memberShort(x.r.analyst) },
      { key: 'module', label: 'Module', get: x => x.r.module },
      {
        key: 'subject',
        label: 'Subject',
        html: x => h(x.r.subject) + (x.r.notes ? `<div class="muted small">📝 ${h(x.r.notes)}</div>` : ''),
        get: x => x.r.subject,
      },
      { key: 'type', label: 'Type', get: x => x.r.type },
      { key: 'status', label: 'Status', html: x => UI.sbadge(x.r.status), get: x => x.r.status },
      { key: 'redmine', label: 'Redmine', get: x => x.r.redmine },
      { key: 'expected', label: 'Expected', get: x => U.fmtDate(x.r.expected), sortVal: x => x.r.expected || '' },
      { key: 'deployed', label: 'Deployed', get: x => x.r.deployed },
      { key: 'days', label: 'Days', cls: 'num', get: x => (x.days == null ? '' : x.days), sortVal: x => x.days || 0 },
      { key: 'c', label: 'Auto comment', html: x => UI.sbadge(x.c), get: x => x.c },
    ],
  })}`;
  return {
    title: 'Central Follow-up',
    html,
    mount(root) {
      UI.bindTables(root, { riy: x => UI.editRecord('central', x.r) });
    },
  };
};
