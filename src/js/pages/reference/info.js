/* DARRIK — Info & SRS (per team). */
'use strict';

P.info = () => {
  const groups = U.groupBy(Store.all('info'), r => r.category || 'General');
  const html = `<div class="page-actions"><span class="grow"></span>${addBtn('info', 'Add info item')}</div>
  <div class="cols3">${[...groups].map(([k, v]) => card(h(k), v.map(r => `<div class="li click" data-edit="info|${h(r.id)}"><span class="grow">${h(r.title)}</span><span class="muted mono">${h(/^\d{4}-\d{2}-\d{2}$/.test(r.value) ? U.fmtDate(r.value) : r.value)}</span></div>`).join(''))).join('')}</div>
  <div class="page-actions"><h3 class="grow">SRS & E-CTS</h3>${addBtn('srs', 'Add SRS / E-CTS')}</div>
  ${UI.table({
    id: 'srs',
    rows: Store.all('srs'),
    exportName: 'SRS',
    onRow: true,
    cols: [
      { key: 'number', label: 'SRS / E-CTS no.', get: r => r.number },
      { key: 'owner', label: 'Analyst / owner', get: r => r.owner },
      { key: 'notes', label: 'Notes', get: r => r.notes },
    ],
  })}`;
  return {
    title: 'Info & SRS',
    html,
    mount(root) {
      UI.bindTables(root, { srs: r => UI.editRecord('srs', r) });
    },
  };
};
