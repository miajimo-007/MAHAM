/* MAHAM — Saved views on every list (UI.table): a person saves the list's search, sort, "Has notes" and the page's
 * filters under a name, and gets them back with one click. Kept in their own data file (listview records, signed —
 * Store.SIGNED), so they follow the person to any PC. Only the person who made a view sees it.
 *   listview { id: 'listview-<by>-…', by, table: '<table id>', name, st: { q, sort, dir, notes }, flt: { <filter page>: {…} } } */
'use strict';

const FLT_ROUTE = {}; // filter page → the page address it was last shown on (filterBar, pages/_shared.js)

Object.assign(UI, {
  viewDefault(table) {
    return UI.views(table).find(v => v.dflt) || null;
  },
  views(table) {
    return (Store.byC.listview || [])
      .filter(v => v.by === App.me && v.table === table)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  },
  /* what a view would hold right now */
  viewNow(table) {
    const st = App.tableState[table] || {};
    const here = location.hash;
    const flt = {};
    for (const [page, route] of Object.entries(FLT_ROUTE))
      if (route === here && App.ps[page]) flt[page] = JSON.parse(JSON.stringify(App.ps[page]));
    return { st: { q: st.q || '', sort: st.sort == null ? null : st.sort, dir: st.dir || -1, notes: !!st.notes }, flt };
  },
  viewOn(v) {
    const n = UI.viewNow(v.table);
    const strip = o =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(o || {})
            .filter(([, x]) => x !== '' && x != null && x !== false)
            .sort()
        )
      );
    return (
      JSON.stringify(n.st) === JSON.stringify(Object.assign({ q: '', sort: null, dir: -1, notes: false }, v.st)) &&
      Object.keys(Object.assign({}, n.flt, v.flt)).every(p => strip(n.flt[p]) === strip((v.flt || {})[p]))
    );
  },
  viewApply(v) {
    const st = (App.tableState[v.table] = App.tableState[v.table] || {});
    Object.assign(st, { q: '', sort: null, dir: -1, notes: false }, v.st || {}, { limit: 100, sel: [] });
    for (const [page, f] of Object.entries(v.flt || {})) App.ps[page] = JSON.parse(JSON.stringify(f));
    App.render(true);
  },
  /* the chips next to the search box */
  viewsBar(table) {
    if (!App.me) return '';
    const l = UI.views(table);
    return `<span class="tv-bar">${l
      .slice(0, 4)
      .map(
        v =>
          `<button type="button" class="chip tv-chip ${UI.viewOn(v) ? 'on' : ''}" data-tview="${h(table)}|${h(v.id)}" title="Show this view">${h(v.name)}</button>`
      )
      .join(
        ''
      )}<button type="button" class="btn xs ghost" data-tviews="${h(table)}" title="Save the filters, search and sort as a view · your views">☆ Views${l.length > 4 ? ` (${l.length})` : ''}</button></span>`;
  },
  viewsDialog(table) {
    const l = UI.views(table);
    UI.modal({
      title: '☆ Views of this list',
      body: `<p class="muted small">A view keeps this list's filters, search and sort. Only you see your views; they follow you to any PC.</p>
      <form id="tvf" class="row-btns"><input name="name" class="grow" placeholder="Name, e.g. My late items" maxlength="40" aria-label="View name"><button class="btn primary" data-tvsave>☆ Save this view</button></form>
      <div class="li-list" style="margin-top:10px">${l.map(v => `<div class="li"><span class="grow click" data-tvuse="${h(v.id)}"><b>${h(v.name)}</b>${UI.viewOn(v) ? ' <span class="muted small">· showing now</span>' : ''}</span><button type="button" class="btn xs ${v.dflt ? 'primary' : 'ghost'}" data-tvdef="${h(v.id)}" title="${v.dflt ? 'Opens this way every time — click to stop' : 'Open the list this way every time'}">${v.dflt ? '★ Default' : '☆ Make default'}</button><button type="button" class="btn xs ghost" data-tvup="${h(v.id)}" title="Replace it with the filters shown now">Update</button><button type="button" class="btn xs ghost danger" data-tvdel="${h(v.id)}" title="Delete this view">✕</button></div>`).join('') || '<p class="muted small">No saved views yet.</p>'}</div>`,
      onMount: w => {
        w.querySelector('#tvf').onsubmit = e => {
          e.preventDefault();
          const name = String(new FormData(e.target).get('name') || '').trim();
          if (!name) return UI.toast('Give the view a name', 'bad');
          const same = l.find(v => U.lc(v.name) === U.lc(name));
          const now = UI.viewNow(table);
          Store.save(
            Object.assign(same ? Object.assign({}, same) : { id: U.uid('listview'), c: 'listview', by: App.me, table }, {
              name,
              st: now.st,
              flt: now.flt,
            })
          );
          UI.closeModal();
          UI.toast(`View “${name}” saved`, 'good');
          App.render(true);
        };
        w.querySelectorAll('[data-tvuse]').forEach(
          b =>
            (b.onclick = () => {
              const v = Store.get(b.dataset.tvuse);
              UI.closeModal();
              if (v) UI.viewApply(v);
            })
        );
        w.querySelectorAll('[data-tvdef]').forEach(
          b =>
            (b.onclick = () => {
              const v = Store.get(b.dataset.tvdef);
              if (!v) return;
              const on = !v.dflt;
              Store.saveMany([
                ...l.filter(x => x.id !== v.id && x.dflt).map(x => Object.assign({}, x, { dflt: false })),
                Object.assign({}, v, { dflt: on }),
              ]);
              UI.closeModal();
              UI.toast(on ? `“${v.name}” opens by itself from now on` : 'No default view', 'good');
              App.render(true);
            })
        );
        w.querySelectorAll('[data-tvup]').forEach(
          b =>
            (b.onclick = () => {
              const v = Store.get(b.dataset.tvup);
              if (!v) return;
              const now = UI.viewNow(table);
              Store.save(Object.assign({}, v, { st: now.st, flt: now.flt }));
              UI.closeModal();
              UI.toast(`View “${v.name}” updated`, 'good');
              App.render(true);
            })
        );
        w.querySelectorAll('[data-tvdel]').forEach(
          b =>
            (b.onclick = () => {
              const v = Store.get(b.dataset.tvdel);
              if (!v) return;
              Store.remove(v.id);
              UI.closeModal();
              UI.toast(`View “${v.name}” deleted`, 'good');
              App.render(true);
            })
        );
      },
    });
  },
  bindViews(root) {
    root.querySelectorAll('[data-tview]').forEach(
      b =>
        (b.onclick = () => {
          const [, id] = b.dataset.tview.split('|');
          const v = Store.get(id);
          if (v) UI.viewApply(v);
        })
    );
    root.querySelectorAll('[data-tviews]').forEach(b => (b.onclick = () => UI.viewsDialog(b.dataset.tviews)));
  },
});
