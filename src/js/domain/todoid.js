/* MAHAM — To Do ID (TD-12): a short number on every To Do, so it can be quoted and linked (e.g. from a follow-up).
 * - New To Dos store their number in `tdNo` the first time they are saved (Store.normalize, below) — however they are made
 *   (form, manager's batch, repeating rule, hand-on, meeting, help desk, import).
 * - To Dos made before this version have no `tdNo`: they get a fixed number from their order (assigned date, then id),
 *   counting deleted ones too. That list never grows (new ones always store theirs), so the numbers never move,
 *   and nobody's old records are rewritten. New numbers start after the old ones.
 * - Set Admin → App version → "Minimum version allowed to save" after rolling out, so an older copy can't add To Dos without a number. */
'use strict';

const TodoId = {
  taken: [], // numbers handed out in the save that is running now (several new To Dos at once)
  idx() {
    if (TodoId._i && TodoId._v === Store.ver && TodoId._db === Store.db) return TodoId._i;
    const old = [];
    let max = 0;
    for (const r of Store.db.values()) {
      if (!r || r.c !== 'todo' || r.virtual) continue;
      if (+r.tdNo) max = Math.max(max, +r.tdNo);
      else old.push(r);
    }
    old.sort((a, b) => String(a.assigned || '').localeCompare(String(b.assigned || '')) || String(a.id).localeCompare(String(b.id)));
    TodoId._i = { legacy: new Map(old.map((r, i) => [r.id, i + 1])), top: Math.max(max, old.length) };
    TodoId._v = Store.ver;
    TodoId._db = Store.db;
    return TodoId._i;
  },
  no(r) {
    if (!r || r.virtual) return 0;
    return +r.tdNo || TodoId.idx().legacy.get(r.id) || 0;
  },
  key(r) {
    const n = TodoId.no(r);
    return n ? 'TD-' + n : '';
  },
  next() {
    const n = Math.max(TodoId.idx().top, ...TodoId.taken) + 1;
    TodoId.taken.push(n);
    return n;
  },
};

(() => {
  const norm = Store.normalize;
  Store.normalize = r => {
    r = norm ? norm(r) : r;
    if (!r || r.c !== 'todo' || r._del || r.virtual || +r.tdNo) return r;
    const cur = r.id && Store.db.get(r.id);
    if (cur && +cur.tdNo) return Object.assign({}, r, { tdNo: +cur.tdNo }); // keep its number if a save left it out
    if (cur) return r; // a To Do from before this version: its number is worked out (see above)
    return Object.assign({}, r, { tdNo: TodoId.next() });
  };
  const sm = Store.saveMany;
  Store.saveMany = list => {
    TodoId.taken = [];
    try {
      return sm(list);
    } finally {
      TodoId.taken = [];
    }
  };
})();
