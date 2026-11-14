/* MAHAM — Reference notes ("📝 Notes for future reference") on every kind of task.
 * A note is its own small record, saved in the writer's own file, so anyone who can open the item can add one without
 * changing someone else's record (and two people adding notes at once never clash):
 *   { c: 'refnote', id: 'refnote-<by>-<time>', on: <item id>, onC: <item type>, team, by, at (ms), text, edited? }
 * Notes stay after the item is done. The writer (or the super admin) can change or delete a note. */
'use strict';

const RefNotes = {
  COLLS: new Set(['todo', 'shadow', 'quickwin', 'gcatch', 'central', 'mytask', 'mgrtask', 'ptask', 'action', 'oncall']),
  /* item id → its notes, newest first */
  index() {
    return Calc.memo('refnotes', () => {
      const m = new Map();
      for (const n of Store.byC.refnote || []) {
        if (!n || n._del || !n.on) continue;
        if (!m.has(n.on)) m.set(n.on, []);
        m.get(n.on).push(n);
      }
      for (const l of m.values()) l.sort((a, b) => (b.at || 0) - (a.at || 0));
      return m;
    });
  },
  /* notes on this item — also those written before it was converted (Conv.family: every id the item has had) */
  of(id) {
    if (!id) return [];
    const ix = RefNotes.index();
    const ids = typeof Conv !== 'undefined' ? Conv.family(id) : [id];
    if (ids.length === 1) return ix.get(id) || [];
    return ids.flatMap(i => ix.get(i) || []).sort((a, b) => (b.at || 0) - (a.at || 0));
  },
  count(id) {
    return RefNotes.of(id).length;
  },
  text(id) {
    return RefNotes.of(id)
      .map(n => n.text)
      .join(' \n');
  },
  /* for Excel: "8-Nov-2026 Adam: …" one per line, oldest first */
  plain(id) {
    return RefNotes.of(id)
      .slice()
      .reverse()
      .map(n => `${U.fmtDate(U.ds(new Date(n.at)))} ${Store.memberShort(n.by) || n.by}: ${n.text}`)
      .join('\n');
  },
  canEdit(n) {
    return !!n && (n.by === App.me || App.isSuper()) && !App.preview;
  },
  add(rec, text) {
    text = String(text || '').trim();
    if (!text || !rec || !rec.id) return null;
    const n = {
      c: 'refnote',
      id: `refnote-${App.me}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      on: rec.id,
      onC: rec.c,
      team: rec.team || '',
      by: App.me,
      at: Date.now(),
      text,
    };
    Store.save(n);
    return n;
  },
  edit(n, text) {
    text = String(text || '').trim();
    if (!text || !RefNotes.canEdit(n)) return;
    Store.save(Object.assign({}, n, { text, edited: Date.now() }));
  },
  remove(n) {
    if (RefNotes.canEdit(n)) Store.save(Object.assign({}, n, { _del: true }));
  },

  /* the section at the bottom of an item's form */
  box(rec) {
    if (!rec || !rec.id || !RefNotes.COLLS.has(rec.c)) return '';
    const list = RefNotes.of(rec.id);
    const can = !App.preview && App.me;
    const li = n =>
      `<div class="rn-item" data-rn="${h(n.id)}"><div class="rn-meta"><b>${h(Store.memberShort(n.by) || n.by)}</b> · ${h(U.fmtTs(n.at))}${n.edited ? ' · edited' : ''}${RefNotes.canEdit(n) ? ` <span class="grow"></span><a href="#" class="link" data-rnedit="${h(n.id)}">Edit</a> · <a href="#" class="link t-bad" data-rndel="${h(n.id)}">Delete</a>` : ''}</div><div class="rn-text">${h(n.text)}</div></div>`;
    return `<div class="refnotes" id="refnotes"><div class="rn-head">📝 <b>Notes for future reference</b> <span class="count">${list.length}</span><span class="muted small"> — kept with this item, also after it is done; everyone who can open it sees them</span></div>
      ${can ? `<div class="rn-add"><textarea rows="2" id="rnnew" placeholder="e.g. how it was solved, where the setting is, who to contact next time…" aria-label="New note"></textarea><button type="button" class="btn sm" id="rnaddbtn">＋ Add note</button></div>` : ''}
      <div class="rn-list">${list.length ? list.map(li).join('') : '<div class="muted small">No notes yet.</div>'}</div></div>`;
  },
  bind(w, rec) {
    const host = w.querySelector('#refnotes');
    if (!host) return;
    const redraw = () => {
      const n = w.querySelector('#refnotes');
      if (n) {
        n.outerHTML = RefNotes.box(Store.get(rec.id) || rec);
        RefNotes.bind(w, rec);
      }
    };
    const ta = host.querySelector('#rnnew');
    const btn = host.querySelector('#rnaddbtn');
    if (btn)
      btn.onclick = () => {
        if (!ta.value.trim()) {
          ta.focus();
          return;
        }
        RefNotes.add(rec, ta.value);
        ta.value = '';
        UI.toast('Note added', 'good');
        redraw();
      };
    if (ta)
      ta.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          btn.click();
        }
        e.stopPropagation();
      });
    host.querySelectorAll('[data-rndel]').forEach(
      a =>
        (a.onclick = e => {
          e.preventDefault();
          const n = Store.get(a.dataset.rndel);
          if (n) {
            RefNotes.remove(n);
            UI.toast('Note deleted', 'good');
            redraw();
          }
        })
    );
    host.querySelectorAll('[data-rnedit]').forEach(
      a =>
        (a.onclick = e => {
          e.preventDefault();
          const n = Store.get(a.dataset.rnedit);
          if (!n) return;
          const box = host.querySelector(`[data-rn="${CSS.escape(n.id)}"] .rn-text`);
          box.innerHTML = `<textarea rows="2" class="rn-edit" aria-label="Edit note">${h(n.text)}</textarea><div class="rn-editbar"><button type="button" class="btn sm primary" data-rnsave>Save note</button> <button type="button" class="btn sm ghost" data-rncancel>Cancel</button></div>`;
          const t = box.querySelector('textarea');
          t.focus();
          t.addEventListener('keydown', ev => ev.stopPropagation());
          box.querySelector('[data-rncancel]').onclick = redraw;
          box.querySelector('[data-rnsave]').onclick = () => {
            RefNotes.edit(n, t.value);
            UI.toast('Note saved', 'good');
            redraw();
          };
        })
    );
  },
};
