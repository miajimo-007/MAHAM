/* MAHAM — Usage: which screens and functions each person uses, roughly how long, and when they first saw /
 * opened each To Do given to them. Kept in the person's own record 'usage-<id>' (their own file, 90 days):
 *   days[YYYY-MM-DD] = { n, first, last, pages: { 'todo': 3, 'helpdesk/import': 1 }, time: { key: seconds }, fn: { 'shadow:add': 2 } }
 *   todo[id] = { s: first seen on screen, o: first opened (clicked into) }
 * Time: counted in 30-second steps while the app is visible and the person did something in the last 10 minutes.
 * Seen by people with "See usage" (managers by default for their team; Admin decides). */
'use strict';

Object.assign(Admin, {
  KEEP_DAYS: 90,
  _cur: '',
  _act: Date.now(),
  pend() {
    const id = 'usage-' + App.me;
    if (Admin._pend && Admin._pend.id !== id) Admin._pend = null;
    return Admin._pend || Store.get(id) || { id, c: 'usage', days: {} };
  },
  dayOf(cur, day) {
    const d = Object.assign({ n: 0, pages: {} }, (cur.days || {})[day]);
    d.pages = Object.assign({}, d.pages);
    d.time = Object.assign({}, d.time);
    d.fn = Object.assign({}, d.fn);
    return d;
  },
  put(cur, day, d) {
    const days = Object.assign({}, cur.days);
    days[day] = d;
    const keepFrom = U.addDays(day, -Admin.KEEP_DAYS);
    for (const k of Object.keys(days)) if (k < keepFrom) delete days[k];
    const todo = Object.assign({}, cur.todo);
    const tf = Date.now() - 150 * 864e5;
    for (const [k, v] of Object.entries(todo)) if ((v.s || v.o || 0) < tf) delete todo[k];
    Admin._pend = Object.assign({}, cur, { days, todo });
  },
  ready() {
    return App.me && !App.preview && Store.usersDir;
  },
  track(page) {
    if (!Admin.ready()) return;
    const key = page + (App.sub ? '/' + App.sub : '');
    Admin._cur = key;
    const day = U.todayStr();
    const cur = Admin.pend();
    const d = Admin.dayOf(cur, day);
    const first = !(cur.days || {})[day];
    d.n++;
    d.pages[key] = (d.pages[key] || 0) + 1;
    const now = Date.now();
    if (!d.first) d.first = now;
    d.last = now;
    Admin.put(cur, day, d);
    if (first || now - Admin._last > 5 * 6e4) Admin.flushUsage();
  },
  /* every 30 s: add the time to the screen in front of the person (only while visible and active) */
  tick() {
    if (!Admin.ready() || !Admin._cur || document.hidden || Date.now() - Admin._act > 10 * 6e4) return;
    const day = U.todayStr();
    const cur = Admin.pend();
    const d = Admin.dayOf(cur, day);
    d.time[Admin._cur] = (d.time[Admin._cur] || 0) + 30;
    d.last = Date.now();
    Admin.put(cur, day, d);
    if (Date.now() - Admin._last > 5 * 6e4) Admin.flushUsage();
  },
  /* functions used: what they saved (added / changed / deleted, by kind), imports and Excel exports */
  SKIP: new Set(['usage', 'annread', 'ping', 'adminlog', 'userpin', 'gcupdate', 'pcomment', 'qwjoin']),
  fn(name, n = 1) {
    if (!Admin.ready()) return;
    const day = U.todayStr();
    const cur = Admin.pend();
    const d = Admin.dayOf(cur, day);
    d.fn[name] = (d.fn[name] || 0) + n;
    Admin.put(cur, day, d);
  },
  trackSave(list) {
    if (!Admin.ready() || !list || !list.length) return;
    if (Store._importing && list.some(r => r && r.c === 'helpdesk')) return Admin.fn('helpdesk:import');
    const seen = new Set();
    for (const r of list) {
      if (!r || !r.c || Admin.SKIP.has(r.c) || (r.c === 'settings' && /^settings-meta/.test(r.id || ''))) continue;
      const k = r.c + ':' + (r._del ? 'delete' : r.id && Store.db.get(r.id) ? 'edit' : 'add');
      if (seen.has(k)) continue;
      seen.add(k);
      Admin.fn(k);
    }
    // comments / updates count as their own function, once per save
    if (list.some(r => r && (r.c === 'pcomment' || r.c === 'gcupdate') && !r._del)) Admin.fn('comment:add');
  },
  /* To Do given to me: first time it was on my screen, first time I opened it */
  todoMark(ids, kind) {
    if (!Admin.ready() || !ids.length) return;
    const cur = Admin.pend();
    const todo = Object.assign({}, cur.todo);
    let ch = false;
    const now = Date.now();
    for (const id of ids) {
      const v = Object.assign({}, todo[id]);
      if (!v.s) {
        v.s = now;
        ch = true;
      }
      if (kind === 'o' && !v.o) {
        v.o = now;
        ch = true;
      }
      todo[id] = v;
    }
    if (!ch) return;
    Admin._pend = Object.assign({}, cur, { todo });
    if (kind === 'o') Admin.flushUsage();
  },
  afterRender(root) {
    if (!Admin.ready()) return;
    // only To Dos actually on screen: cards and buttons, and table rows that are shown (not filtered out or beyond "show more")
    const ids = [...(root || document).querySelectorAll('[data-edit^="todo|"], [data-done], [data-todo], tr[data-rid]')]
      .map(el => (el.dataset.edit || '').split('|')[1] || el.dataset.done || el.dataset.todo || el.dataset.rid)
      .filter(Boolean);
    const mine = [...new Set(ids)].filter(id => {
      const t = Store.get(id);
      return t && t.c === 'todo' && t.analyst === App.me;
    });
    const cur = Admin.pend();
    const todo = cur.todo || {};
    const fresh = mine.filter(id => !(todo[id] && todo[id].s));
    if (fresh.length) Admin.todoMark(fresh, 's');
  },
  /* what the manager sees about one To Do */
  todoSeen(t) {
    const u = Store.get('usage-' + t.analyst);
    const x = u && u.todo && u.todo[t.id];
    const own = t.analyst === App.me && Admin._pend && Admin._pend.todo && Admin._pend.todo[t.id];
    return own || x || null;
  },
  seenLabel(t, long) {
    const x = Admin.todoSeen(t);
    const tm = ts => U.fmtDate(U.ds(new Date(ts))) + ' ' + new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const since = Date.parse('2026-11-04T00:00:00+03:00');
    if (!x)
      return t._ts && t._ts < since && !long
        ? '<span class="muted small">not recorded</span>'
        : '<span class="small t-warn">👁 not seen yet</span>';
    if (x.o) return `<span class="small t-good" title="First seen ${tm(x.s)}">👁 opened ${tm(x.o)}</span>`;
    return `<span class="small" title="It was on their screen but they have not clicked into it">👁 seen ${tm(x.s)}, not opened</span>`;
  },
  canSee() {
    return App.isSuper() || App.can('seeUsage');
  },
});
if (typeof document !== 'undefined') {
  const act = () => {
    Admin._act = Date.now();
  };
  ['pointerdown', 'keydown', 'wheel', 'mousemove', 'touchstart'].forEach(ev =>
    document.addEventListener(ev, act, { passive: true, capture: true })
  );
  setInterval(() => {
    try {
      Admin.tick();
    } catch (e) {
      /* never break the app */
    }
  }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden)
      try {
        Admin.flushUsage();
      } catch (e) {
        /* */
      }
  });
  window.addEventListener('beforeunload', () => {
    try {
      Admin.flushUsage();
    } catch (e) {
      /* */
    }
  });
}
