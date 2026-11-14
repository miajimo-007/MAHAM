/* MAHAM — Shadow Works. */
'use strict';

P.shadow = () => {
  const s = ps('shadow');
  if (s.analyst == null || (s.analyst === App.me && !Store.team().some(m => m.id === App.me)))
    s.analyst = Store.team().some(m => m.id === App.me) ? App.me : ''; // in another team: everyone
  let rows = App.mine(Calc.shadow(App.year), x => x.r.analyst);
  if (s.analyst) rows = rows.filter(x => x.r.analyst === s.analyst);
  if (s.month) rows = rows.filter(x => x.month === +s.month);
  if (s.cat) rows = rows.filter(x => x.cat === s.cat);
  if (s.src) rows = rows.filter(x => x.r.source === s.src);
  if (s.fu) rows = rows.filter(x => x.r.fu);
  if (s.ms) rows = rows.filter(x => x.r.milestone);
  rows = [...rows].sort((a, b) => (b.r.date || '').localeCompare(a.r.date || '') || (b.r._ts || 0) - (a.r._ts || 0));
  const html = `<div class="page-actions">${filterBar('shadow', [
    { key: 'analyst', type: 'member' },
    { key: 'month', type: 'month' },
    { key: 'cat', label: 'Category', options: Calc.categories(App.viewTeam, App.year) },
    { key: 'src', label: 'Source', options: Store.list('sources') },
    { key: 'fu', type: 'toggle', label: 'FU only' },
    { key: 'ms', type: 'toggle', label: '⭐ Milestones only' },
  ])}<span class="grow"></span>${addBtn('shadow', 'New shadow work')}</div>
  ${listSum([`<b>${rows.length}</b> entr${rows.length === 1 ? 'y' : 'ies'}`, `<b>${U.num(U.sum(rows.map(x => x.hrs || 0)), 1)}</b> h`, rows.some(x => x.r.fu) || s.fu ? { t: `<b>${rows.filter(x => x.r.fu).length}</b> FU`, f: ['shadow', 'fu', true] } : ''])}
  <div>
    <div>${UI.table({
      id: 'shadow',
      rows,
      exportName: 'Shadow Works',
      onRow: true,
      bulk: [
        {
          label: '🗑 Delete…',
          cls: 'ghost',
          ok: x => App.canEdit('shadow') && UI.canEditField('shadow', x.r, 'subject'),
          run: (rows, done) => {
            UI.confirm(`Delete ${rows.length} shadow work entr${rows.length > 1 ? 'ies' : 'y'}?`, () => {
              done();
              UI.saveUndo(
                rows.map(x => Object.assign({}, x.r, { _del: true })),
                `${rows.length} deleted`,
                ''
              );
              App.render(true);
            });
            return false;
          },
        },
      ],
      cols: [
        { key: 'date', label: 'Date', get: x => U.fmtDate(x.r.date), sortVal: x => x.r.date },
        { key: 'analyst', label: 'Analyst', get: x => Store.memberShort(x.r.analyst) },
        { key: 'taskType', label: 'Task type', get: x => x.r.taskType },
        { key: 'source', label: 'Source', get: x => x.r.source },
        {
          key: 'subject',
          label: 'Subject',
          html: x => h(x.r.subject) + UI.flagTags(x.r, { fu: true }) + Conv.tag(x.r) + WorkLinks.tag(x.r),
          get: x => x.r.subject,
        },
        { key: 'minutes', label: 'Min', cls: 'num', get: x => x.r.minutes, sortVal: x => +x.r.minutes || 0 },
        { key: 'ref', label: 'Reference', get: x => x.r.ref },
      ],
    })}</div>
  </div>`; // hours by category: Performance → Tasks overview (2026.11.12.8)
  return {
    title: 'Shadow work',
    html,
    mount(root) {
      UI.bindTables(root, { shadow: x => UI.editRecord('shadow', x.r) });
    },
  };
};
