/* DARRIK — On-Call. */
'use strict';

P.oncall = () => {
  const plan = Store.all('info').filter(r => r.category === 'On-Call Plan');
  const s = ps('oc');
  let rows = App.mine(Store.all('oncall'), r => r.analyst);
  if (s.analyst) rows = rows.filter(r => r.analyst === s.analyst);
  rows = [...rows].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const html = `${card(`On-call plan ${App.year}`, plan.length ? `<div class="oc-plan">${plan.map(p => `<div class="click" data-edit="info|${h(p.id)}"><b>${h(p.title)}</b><span>${h(p.value)}</span></div>`).join('')}</div>` : empty('No plan yet — add "On-Call Plan" items in Info & SRS.'))}
  <div class="page-actions">${filterBar('oc', [{ key: 'analyst', type: 'member' }])}${addBtn('oncall', 'Log on-call issue')}</div>
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
