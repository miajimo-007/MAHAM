/* MAHAM — what every MAHAM-only module uses to plug into the app (menu sections, pages as functions, record kinds).
 * The app's own config is frozen at the top, but its lists are not: a module adds to them here, once, before the app
 * starts. A page added with Maham.page() is a "function" like any other: Admin → Functions turns it on, view-only or
 * off per team and per person, and the menu hides what someone may not open. */
'use strict';

const Maham = {
  /* a menu section (after another one) with its pages: [[key, label, icon, meta?]] */
  section(name, icon, items, after) {
    const nav = Config.NAV;
    if (nav.some(([g]) => g === name)) return;
    const i = after ? nav.findIndex(([g]) => g === after) : -1;
    nav.splice(i >= 0 ? i + 1 : nav.length, 0, [name, items]);
    Config.NAV_ICONS[name] = icon;
  },
  /* add pages to an existing section */
  addTo(section, items) {
    const g = Config.NAV.find(([n]) => n === section);
    if (g) for (const it of items) if (!g[1].some(x => x[0] === it[0])) g[1].push(it);
  },
  /* a function (Admin → Functions) and the record kinds it governs (who may add / change them follows its level) */
  page(key, label, colls) {
    if (!Config.PAGES.some(p => p[0] === key)) Config.PAGES.push([key, label]);
    for (const c of colls || []) Config.COLL_PAGE[c] = key;
  },
  /* small helpers the modules share */
  uid(kind) {
    return `${kind}-${App.me || 'x'}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  },
  when(t) {
    if (!t) return '';
    const d = new Date(t);
    const today = U.todayStr();
    const ds = U.ds(d);
    const hm = d.toTimeString().slice(0, 5);
    return ds === today ? hm : ds === U.addDays(today, -1) ? 'Yesterday ' + hm : U.fmtDate(ds) + ' ' + hm;
  },
  /* text → safe HTML with links, line breaks, @mentions and item keys (TD-12, TK-3 …) */
  rich(text) {
    let s = h(text || '');
    s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/(^|[\s(])@([A-Za-z][\w.-]{1,40})/g, (m, pre, who) => {
      const p = Maham.memberByHandle(who);
      return p ? `${pre}<span class="mention${p.id === App.me ? ' me' : ''}">@${h(Store.memberShort(p.id))}</span>` : m;
    });
    return s.replace(/\n/g, '<br>');
  },
  /* @handle → a person: their id, or their short name without spaces */
  handle(id) {
    return String(Store.memberShort(id) || id).replace(/\s+/g, '');
  },
  memberByHandle(x) {
    const l = String(x).toLowerCase();
    return (
      Store.members().find(m => m.active !== false && (String(m.id).toLowerCase() === l || Maham.handle(m.id).toLowerCase() === l)) || null
    );
  },
  mentions(text) {
    const out = new Set();
    String(text || '').replace(/(^|[\s(])@([A-Za-z][\w.-]{1,40})/g, (m, pre, who) => {
      const p = Maham.memberByHandle(who);
      if (p) out.add(p.id);
      return m;
    });
    return [...out];
  },
  people() {
    return Store.members()
      .filter(m => m.active !== false && !m.hidden)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  },
};
