/* DARRIK — Sortable, searchable data table with Excel export. */
'use strict';

Object.assign(UI, {
  /* ---------- data table ---------- */
  // state persisted per table id in App.tableState
  table({ id, rows, cols, onRow, empty, pageSize = 100, toolbar = '', exportName, defaultSort }) {
    const st = (App.tableState[id] = App.tableState[id] || { q: '', sort: defaultSort || null, dir: -1, limit: pageSize });
    let list = rows;
    if (st.q) {
      const q = U.lc(st.q);
      list = list.filter(r => cols.some(c => U.lc(c.text ? c.text(r) : c.get ? c.get(r) : '').includes(q)));
    }
    if (st.sort != null) {
      const c = cols.find(c => c.key === st.sort);
      if (c) {
        const g = c.sortVal || c.get || c.text;
        list = [...list].sort((a, b) => {
          const x = g(a),
            y = g(b);
          return (x > y ? 1 : x < y ? -1 : 0) * st.dir;
        });
      }
    }
    const total = list.length;
    const shown = list.slice(0, st.limit);
    App.tableRows[id] = { list, cols, exportName };
    return `<div class="tbl-wrap" data-tbl="${id}">
      <div class="tbl-tools"><input class="search" type="search" placeholder="Search…" value="${h(st.q)}" data-tsearch="${id}" aria-label="Search table">${toolbar}<span class="grow"></span><span class="muted">${total.toLocaleString()} row${total === 1 ? '' : 's'}</span>${exportName && App.can('export') ? `<button class="btn sm ghost" data-texport="${id}" title="Export these rows to Excel">⇩ Excel</button>` : ''}</div>
      <div class="tbl-scroll"><table class="tbl"><thead><tr>${cols.map(c => `<th class="${c.cls || ''}" data-tsort="${id}|${c.key}" style="${c.w ? `width:${c.w}` : ''}">${h(c.label)}${st.sort === c.key ? (st.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${shown.length ? shown.map((r, i) => `<tr ${onRow ? `data-trow="${id}|${i}" class="click"` : ''}>${cols.map(c => `<td class="${c.cls || ''} ${/^(Date|Assigned|Due|Finished|Created|Resolved|Expected|Start|End|Presentation)$/.test(c.label) ? 'nw' : ''}">${c.html ? c.html(r) : h(c.text ? c.text(r) : c.get(r))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}" class="empty">${empty || 'Nothing here yet.'}</td></tr>`}</tbody></table></div>
      ${total > shown.length ? `<div class="more"><button class="btn sm" data-tmore="${id}">Show more (${(total - shown.length).toLocaleString()} left)</button></div>` : ''}
    </div>`;
  },
  bindTables(root, handlers) {
    root.querySelectorAll('[data-tsearch]').forEach(inp => {
      inp.oninput = U.debounce(() => {
        const st = App.tableState[inp.dataset.tsearch];
        st.q = inp.value;
        st.limit = 100;
        const pos = inp.selectionStart;
        App.render();
        const n = UI.$(`[data-tsearch="${inp.dataset.tsearch}"]`);
        if (n) {
          n.focus();
          n.setSelectionRange(pos, pos);
        }
      }, 250);
    });
    root.querySelectorAll('[data-tsort]').forEach(
      th =>
        (th.onclick = () => {
          const [id, key] = th.dataset.tsort.split('|');
          const st = App.tableState[id];
          if (st.sort === key) st.dir *= -1;
          else {
            st.sort = key;
            st.dir = 1;
          }
          App.render();
        })
    );
    root.querySelectorAll('[data-tmore]').forEach(
      b =>
        (b.onclick = () => {
          App.tableState[b.dataset.tmore].limit += 300;
          App.render();
        })
    );
    root.querySelectorAll('[data-texport]').forEach(b => (b.onclick = () => UI.exportTable(b.dataset.texport)));
    root.querySelectorAll('[data-trow]').forEach(
      tr =>
        (tr.onclick = e => {
          if (e.target.closest('a,button,input,select')) return;
          const [id, i] = tr.dataset.trow.split('|');
          const T = App.tableRows[id];
          const r = T.list[+i];
          if (r && handlers && handlers[id]) handlers[id](r);
        })
    );
  },
  async exportTable(id) {
    const T = App.tableRows[id];
    if (!T) return;
    const rows = [
      T.cols.map(c => c.label),
      ...T.list.map(r =>
        T.cols.map(c => {
          const v = c.xval ? c.xval(r) : c.text ? c.text(r) : c.get(r);
          return v == null ? '' : v;
        })
      ),
    ];
    XL.download(await XL.write([{ name: T.exportName, rows }]), `${T.exportName} ${U.todayStr()}.xlsx`);
  },
});
