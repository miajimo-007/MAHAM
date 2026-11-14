/* MAHAM — Sortable, searchable data table with Excel export. */
'use strict';

try {
  if (localStorage.getItem('maham.dense') === '1') document.body.classList.add('dense');
} catch (e) {
  /* compact rows: this PC only */
}

Object.assign(UI, {
  /* ---------- data table ---------- */
  // state persisted per table id in App.tableState
  // bulk: [{ label, ok: row => bool, run: rows => void, cls }] adds tick boxes and an action bar
  // a column with edit: { type: 'select' | 'date', options, ok: row => bool, value: row => v, save: (row, v) => void } is changed right in the table
  table({ id, rows, cols, onRow, empty, pageSize = 100, toolbar = '', exportName, defaultSort, bulk }) {
    const fresh = !App.tableState[id];
    const st = (App.tableState[id] = App.tableState[id] || { q: '', sort: defaultSort || null, dir: -1, limit: pageSize });
    if (fresh && UI.viewDefault) {
      const dv = UI.viewDefault(id);
      if (dv) {
        st.dfltView = dv.id;
        setTimeout(() => UI.viewApply(dv), 0);
      }
    } // my default view, once per session
    if (!st.limit) st.limit = pageSize;
    let list = rows;
    /* reference notes: 📝 mark, "Has notes" filter, search inside notes, a Notes column in Excel */
    const RN = typeof RefNotes !== 'undefined';
    const recOf = r => (r && r.r && r.r.id ? r.r : r) || {};
    const nCount = r => {
      const x = recOf(r);
      return RN && x.id && RefNotes.COLLS.has(x.c) ? RefNotes.count(x.id) : 0;
    };
    const anyNotes = RN && rows.some(r => nCount(r));
    if (st.notes && anyNotes) list = list.filter(r => nCount(r));
    if (st.q) {
      const q = U.lc(st.q);
      list = list.filter(
        r =>
          cols.some(c => U.lc(c.text ? c.text(r) : c.get ? c.get(r) : '').includes(q)) ||
          (nCount(r) && U.lc(RefNotes.text(recOf(r).id)).includes(q))
      );
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
    const bk = (bulk || []).filter(a => !a.hide);
    const canBulk = bk.length && list.some(r => bk.some(a => a.ok(r)));
    const ids = new Set(list.map(UI.rowId));
    st.sel = (st.sel || []).filter(x => ids.has(x));
    const sel = new Set(st.sel);
    App.tableRows[id] = { list, cols, exportName, bulk: bk, notes: anyNotes ? r => (nCount(r) ? RefNotes.plain(recOf(r).id) : '') : null };
    /* a column that is empty for every row listed is not shown (Excel still has it) — 2026.11.13.4 */
    if (list.length) {
      const blankV = v => v == null || v === '' || v === '—' || v === '–' || v === '-';
      const seen = c => {
        for (const r of list.slice(0, 300)) {
          try {
            const v = c.html
              ? String(c.html(r) ?? '')
                  .replace(/<[^>]*>/g, '')
                  .trim()
              : String(c.get ? (c.get(r) ?? '') : '').trim();
            if (!blankV(v) || (c.edit && c.edit.ok(r)) || (c.html && /<(button|select|input)/.test(String(c.html(r) || '')))) return true;
          } catch (e) {
            return true;
          }
        }
        return false;
      };
      const keep = cols.filter(c => c.keep || !c.label || seen(c));
      if (keep.length && keep.length < cols.length) cols = keep;
    }
    const selRows = canBulk ? list.filter(r => sel.has(UI.rowId(r))) : [];
    const bar =
      canBulk && selRows.length
        ? `<div class="bulk-bar"><b>${selRows.length} selected</b>${bk
            .map((a, i) => {
              const n = selRows.filter(a.ok).length;
              return `<button class="btn sm ${a.cls || ''}" data-tbulk="${id}|${i}" ${n ? '' : 'disabled'} title="${n < selRows.length ? `${selRows.length - n} of the selected can't be changed this way — they will be skipped` : ''}">${h(a.label)}${n < selRows.length ? ` (${n})` : ''}</button>`;
            })
            .join('')}<button class="btn sm ghost" data-tselclr="${id}">✕ Clear</button></div>`
        : '';
    const cell = (c, r, i) => {
      if (c.edit && c.edit.ok(r)) {
        const v = c.edit.value ? c.edit.value(r) : c.get ? c.get(r) : '';
        if (c.edit.type === 'date')
          return `<input type="date" class="inl" data-tinl="${id}|${i}|${h(c.key)}" value="${h(v || '')}" title="Change ${h(c.label)}">`;
        const opts = typeof c.edit.options === 'function' ? c.edit.options(r) : c.edit.options;
        return `<select class="inl" data-tinl="${id}|${i}|${h(c.key)}" title="Change ${h(c.label)}" style="${selW(opts)}${c.edit.color && c.edit.color(r) ? `;border-left:5px solid ${h(c.edit.color(r))}` : ''}">${opts
          .map(o => {
            const [val, lab] = Array.isArray(o) ? o : [o, o];
            return `<option value="${h(val)}" ${String(v || '') === String(val) ? 'selected' : ''}>${h(lab)}</option>`;
          })
          .join('')}</select>`;
      }
      return c.html ? c.html(r) : h(c.text ? c.text(r) : c.get(r));
    };
    const markCol = cols.findIndex(c => !c.edit && c.label); // the 📝 mark goes in the first plain column
    /* columns of long text (Subject, To Do, Title …) keep a readable width instead of one word per line; the buttons column
     * (key 'act') stays fixed at the right edge, so it is never scrolled out of sight; a box in a cell is as wide as its
     * longest choice ("Accepted", not "Accepte") */
    const sample = shown.slice(0, 40);
    const txtLen = c => {
      const g = c.text || c.get;
      if (!g || c.edit || !sample.length) return 0;
      let n = 0;
      for (const r of sample) {
        try {
          n += String(g(r) ?? '').length;
        } catch (e) {
          /* skip */
        }
      }
      return n / sample.length;
    };
    const colCls = cols.map(c => [c.cls || '', c.key === 'act' ? 'act' : '', txtLen(c) >= 28 ? 'tx' : ''].filter(Boolean).join(' '));
    const selW = opts => {
      const n = Math.max(4, ...opts.map(o => String(Array.isArray(o) ? (o[1] ?? o[0]) : o).length));
      return `width:${Math.min(160, Math.round(n * 7.2 + 32))}px;max-width:none`;
    };
    const cellM = (c, r, i, ci) =>
      cell(c, r, i) +
      (ci === markCol && nCount(r)
        ? ` <span class="rn-mark" title="${nCount(r)} note${nCount(r) > 1 ? 's' : ''} for future reference">📝</span>`
        : '');
    return `<div class="tbl-wrap" data-tbl="${id}">
      <div class="tbl-tools"><input class="search" type="search" placeholder="Search…" value="${h(st.q)}" data-tsearch="${id}" aria-label="Search table">${UI.viewsBar ? UI.viewsBar(id) : ''}${anyNotes ? `<label class="check chip-check rn-flt" title="Only items with notes for future reference"><input type="checkbox" data-tnotes="${id}" ${st.notes ? 'checked' : ''}> 📝 Has notes</label>` : ''}${toolbar}${bar}<span class="grow"></span><button type="button" class="btn xs ghost tv-dense" data-tdense title="Shorter rows — more of the list on the screen (remembered on this PC)">${document.body.classList.contains('dense') ? '☰ Normal rows' : '☰ Compact rows'}</button><span class="muted">${total > shown.length ? `showing ${shown.length.toLocaleString()} of ` : ''}${total.toLocaleString()} row${total === 1 ? '' : 's'}</span>${exportName && App.can('export') ? `<button class="btn sm ghost" data-texport="${id}" title="Export these rows to Excel">⇩ Excel</button>` : ''}</div>
      <div class="tbl-scroll"><table class="tbl"><thead><tr>${canBulk ? `<th class="sel"><input type="checkbox" data-tselall="${id}" title="Select all shown" ${shown.length && shown.every(r => sel.has(UI.rowId(r))) ? 'checked' : ''}></th>` : ''}${cols.map((c, ci) => `<th class="${colCls[ci]}" data-tsort="${id}|${c.key}" style="${c.w ? `width:${c.w}` : ''}">${h(c.label)}${st.sort === c.key ? (st.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${shown.length ? shown.map((r, i) => `<tr ${onRow ? `data-trow="${id}|${i}" class="click"` : ''}${UI.rowId(r) ? ` data-rid="${h(UI.rowId(r))}"` : ''}${sel.has(UI.rowId(r)) && canBulk ? ' data-sel="1"' : ''}>${canBulk ? `<td class="sel">${bk.some(a => a.ok(r)) ? `<input type="checkbox" data-tsel="${id}|${h(UI.rowId(r))}" ${sel.has(UI.rowId(r)) ? 'checked' : ''} aria-label="Select row">` : ''}</td>` : ''}${cols.map((c, ci) => `<td class="${colCls[ci]} ${/^(Date|Assigned|Due|Finished|Created|Resolved|Expected|Start|End|Presentation)$/.test(c.label) ? 'nw' : ''}">${cellM(c, r, i, ci)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length + (canBulk ? 1 : 0)}" class="empty">${empty || 'Nothing here yet.'}</td></tr>`}</tbody></table></div>
      ${total > shown.length ? `<div class="more"><button class="btn sm" data-tmore="${id}">Show more (${(total - shown.length).toLocaleString()} left)</button></div>` : ''}
    </div>`;
  },
  rowId(r) {
    return (r && (r.id || (r.r && r.r.id))) || '';
  },
  bindTables(root, handlers) {
    if (UI.bindViews) UI.bindViews(root); // saved views (ui/views.js)
    root.querySelectorAll('[data-tdense]').forEach(
      b =>
        (b.onclick = () => {
          const on = !document.body.classList.contains('dense');
          document.body.classList.toggle('dense', on);
          try {
            localStorage.setItem('maham.dense', on ? '1' : '');
          } catch (e) {
            /* this PC only */
          }
          App.render(true);
        })
    );
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
    root.querySelectorAll('[data-tnotes]').forEach(
      cb =>
        (cb.onchange = () => {
          const st = App.tableState[cb.dataset.tnotes];
          st.notes = cb.checked;
          st.limit = 100;
          App.render(true);
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
    /* tick boxes + bulk actions */
    root.querySelectorAll('[data-tsel]').forEach(
      cb =>
        (cb.onchange = () => {
          const [id, rid] = cb.dataset.tsel.split('|');
          const st = App.tableState[id];
          const s = new Set(st.sel || []);
          if (cb.checked) s.add(rid);
          else s.delete(rid);
          st.sel = [...s];
          App.render(true);
        })
    );
    root.querySelectorAll('[data-tselall]').forEach(
      cb =>
        (cb.onchange = () => {
          const id = cb.dataset.tselall;
          const st = App.tableState[id];
          const T = App.tableRows[id];
          const shown = T.list
            .slice(0, st.limit)
            .filter(r => T.bulk.some(a => a.ok(r)))
            .map(UI.rowId);
          const s = new Set(st.sel || []);
          for (const x of shown) cb.checked ? s.add(x) : s.delete(x);
          st.sel = [...s];
          App.render(true);
        })
    );
    root.querySelectorAll('[data-tselclr]').forEach(
      b =>
        (b.onclick = () => {
          App.tableState[b.dataset.tselclr].sel = [];
          App.render(true);
        })
    );
    root.querySelectorAll('[data-tbulk]').forEach(
      b =>
        (b.onclick = () => {
          const [id, i] = b.dataset.tbulk.split('|');
          const T = App.tableRows[id];
          const a = T.bulk[+i];
          const sel = new Set(App.tableState[id].sel || []);
          const rows = T.list.filter(r => sel.has(UI.rowId(r)) && a.ok(r));
          if (!rows.length) return;
          const done = () => {
            App.tableState[id].sel = [];
          };
          const r = a.run(rows, done);
          if (r !== false) done();
        })
    );
    /* changes made right in the table */
    root.querySelectorAll('[data-tinl]').forEach(el => {
      el.onclick = e => e.stopPropagation();
      el.onchange = () => {
        const [id, i, key] = el.dataset.tinl.split('|');
        const T = App.tableRows[id];
        const r = T.list[+i];
        const c = T.cols.find(x => x.key === key);
        if (r && c && c.edit) c.edit.save(r, el.value);
      };
    });
    root.querySelectorAll('[data-trow]').forEach(
      tr =>
        (tr.onclick = e => {
          if (e.target.closest('a,button,input,select,td.sel')) return;
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
      T.cols.map(c => c.label).concat(T.notes ? ['Notes'] : []),
      ...T.list.map(r =>
        T.cols
          .map(c => {
            const v = c.xval ? c.xval(r) : c.text ? c.text(r) : c.get(r);
            return v == null ? '' : v;
          })
          .concat(T.notes ? [T.notes(r)] : [])
      ),
    ];
    XL.download(await XL.write([{ name: T.exportName, rows }]), `${T.exportName} ${U.todayStr()}.xlsx`);
  },
});
