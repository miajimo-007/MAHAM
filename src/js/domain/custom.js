/* MAHAM — Customize (Admin → Customize): everything the super admin can change without a new version.
 * Kept in the settings record 'settings-custom' (settings are accepted only from a super admin — access/trust.js).
 * The app name and logo stay in 'settings-features' and the About text in 'settings-about' (older copies read them there). */
'use strict';

const Custom = {
  ID: 'settings-custom',
  TARGETS: {
    teamScore: { label: 'Team score target', def: 80, unit: '', hint: 'the line on the Performance chart and the banner' },
    shadowHrs: { label: 'Shadow work target per month', def: 20, unit: 'h', hint: 'shown on Analyst Desk' },
    hdDays: { label: 'Help desk "open too long" after', def: 3, unit: 'days', hint: 'offered to send to the To Do list' },
    overdueRows: { label: 'Overdue rows on the Manager Desk', def: 8, unit: 'rows', hint: 'the rest behind "All overdue →"' },
    wlTasks: {
      label: 'Workload: too many project tasks in a week',
      def: 5,
      unit: 'tasks',
      hint: 'red on Projects → Workload (amber from 60%)',
    },
    wlHours: { label: 'Workload: too many estimated hours in a week', def: 30, unit: 'h', hint: 'used once tasks have estimates' },
    greyDays: {
      label: 'A finished To Do waiting for confirmation stays greyed on Analyst Desk for',
      def: 1,
      unit: 'days',
      hint: '1 = until tomorrow',
    },
  },
  WORDS: ['To Do', 'Quick Win', 'Shadow work', 'Milestone', 'FU', 'On duty'],
  TILES: [
    ['score', 'My score this month'],
    ['ytd', 'My YTD average'],
    ['todo', 'Pending To Do'],
    ['hd', 'Open help desk'],
    ['shadow', 'Shadow work'],
  ],
  COLORS: {
    teal: { name: 'Teal (original)', accent: '#0e7c86', accent2: '#0e4a6b', soft: '#e3f3f4', side: '#0c2a3d', side2: '#123a52' },
    blue: { name: 'Blue', accent: '#1d5bd8', accent2: '#1e3a8a', soft: '#e6eefc', side: '#0f1f3d', side2: '#1a2d55' },
    green: { name: 'Green', accent: '#15803d', accent2: '#14532d', soft: '#e6f4ea', side: '#0f2a1c', side2: '#173d29' },
    purple: { name: 'Purple', accent: '#6d3fd0', accent2: '#4c1d95', soft: '#efe9fb', side: '#1e1236', side2: '#2b1b4d' },
    maroon: { name: 'Maroon', accent: '#a3173f', accent2: '#6b0f2a', soft: '#fbe8ed', side: '#2a0d16', side2: '#3d1420' },
    slate: { name: 'Slate', accent: '#475569', accent2: '#1e293b', soft: '#eef1f5', side: '#111827', side2: '#1f2937' },
  },
  rec() {
    return (typeof Store !== 'undefined' && Store.get && Store.get(Custom.ID)) || {};
  },
  get(k, d) {
    const v = Custom.rec()[k];
    return v === undefined || v === null || v === '' ? d : v;
  },
  save(patch, msg) {
    const r = Object.assign({}, Custom.rec(), { id: Custom.ID, c: 'settings' }, patch);
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete r[k];
    Store.save(r);
    if (msg) UI.toast(msg, 'good');
  },
  /* ---------- targets ---------- */
  /* a team's own target (Admin → Team rules), else the app-wide one (Customize), else the original */
  target(k, team) {
    const tid = team === undefined ? typeof App !== 'undefined' && App.viewTeam : team;
    const tm = tid && typeof Store !== 'undefined' && Store.teams ? Store.teams().find(x => x.id === tid) : null;
    const tv = tm && tm.targets ? +tm.targets[k] : 0;
    if (tv > 0) return tv;
    const t = Custom.get('targets', {});
    const v = +t[k];
    return v > 0 ? v : Custom.TARGETS[k].def;
  },
  /* ---------- weekend (0 = Sunday … 6 = Saturday) ---------- */
  weekend() {
    const w = Custom.get('weekend', null);
    return Array.isArray(w) ? w : [5, 6];
  },
  weekendName() {
    const n = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (
      Custom.weekend()
        .map(i => n[i])
        .join('/') || 'no weekend'
    );
  },
  /* ---------- tagline, welcome, start page, Analyst Desk tiles ---------- */
  tagline() {
    return Custom.get('tagline', 'Every Effort Matters.');
  },
  tile(k) {
    const t = Custom.get('tiles', {});
    return t[k] !== false;
  },
  startPage(id) {
    const m = Store.member(id);
    if (!m) return '';
    const st = Custom.get('start', {});
    const role = Store.topRole(m.role) ? 'director' : m.role === 'manager' ? 'manager' : m.role === 'teamleader' ? 'teamleader' : 'analyst';
    return st[role] || '';
  },
  /* ---------- menu ---------- */
  navLabel(k, d) {
    const n = Custom.get('nav', {})[k];
    if (k === 'info' && n && /srs|e-?cts/i.test(n.label || '')) return d; // an old "Info & SRS" name is replaced
    return (n && n.label) || d;
  },
  navIcon(k, d) {
    const n = Custom.get('nav', {})[k];
    return (n && n.icon) || d;
  },
  groupName(g) {
    return Custom.get('groups', {})[g] || (Config.NAV_NAMES || {})[g] || g;
  },
  navItems(g, items) {
    // items = [[key, label, icon]] → renamed, re-iconed and in the saved order
    const ord = Custom.get('order', {})[g] || [];
    const pos = k => {
      const i = ord.indexOf(k);
      return i < 0 ? 999 : i;
    };
    return items
      .map((x, i) => [x[0], Custom.navLabel(x[0], x[1]), Custom.navIcon(x[0], x[2]), i])
      .sort((a, b) => pos(a[0]) - pos(b[0]) || a[3] - b[3]);
  },
  /* ---------- colour ---------- */
  mix(hex, to, p) {
    const a = parseInt(hex.slice(1), 16),
      b = parseInt(to.slice(1), 16);
    const c = s => Math.round(((a >> s) & 255) * (1 - p) + ((b >> s) & 255) * p);
    return '#' + [16, 8, 0].map(s => c(s).toString(16).padStart(2, '0')).join('');
  },
  palette() {
    const c = Custom.get('color', 'teal');
    if (Custom.COLORS[c]) return Custom.COLORS[c];
    if (/^#[0-9a-f]{6}$/i.test(c))
      return {
        accent: c,
        accent2: Custom.mix(c, '#000000', 0.35),
        soft: Custom.mix(c, '#ffffff', 0.9),
        side: Custom.mix(c, '#000000', 0.78),
        side2: Custom.mix(c, '#000000', 0.68),
      };
    return Custom.COLORS.teal;
  },
  applyColor() {
    const p = Custom.palette();
    const s = document.documentElement.style;
    s.setProperty('--accent', p.accent);
    s.setProperty('--accent2', p.accent2);
    s.setProperty('--accent-soft', p.soft);
    s.setProperty('--side', p.side);
    s.setProperty('--side2', p.side2);
    try {
      LS.set('bct.color', p);
    } catch (e) {
      /* */
    }
  },
  applySavedColor() {
    const p = LS.get('bct.color', null);
    if (!p) return;
    const s = document.documentElement.style;
    s.setProperty('--accent', p.accent);
    s.setProperty('--accent2', p.accent2);
    s.setProperty('--accent-soft', p.soft);
    s.setProperty('--side', p.side);
    s.setProperty('--side2', p.side2);
  },
  /* ---------- words: one word swapped for another on every screen (menus, pages, pop-ups, printed reports) ---------- */
  _re: null,
  _map: null,
  _key: '',
  wordMap() {
    const w = Custom.get('words', {});
    return Object.keys(w)
      .filter(k => k.trim() && String(w[k] || '').trim() && w[k].trim() !== k.trim())
      .map(k => [k.trim(), w[k].trim()]);
  },
  compile() {
    const l = Custom.wordMap();
    const key = JSON.stringify(l);
    if (key === Custom._key) return Custom._re;
    Custom._key = key;
    if (!l.length) {
      Custom._re = null;
      return null;
    }
    Custom._map = new Map(l.map(([a, b]) => [a.toLowerCase(), b]));
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    Custom._re = new RegExp(
      `\\b(${l
        .map(x => x[0])
        .sort((a, b) => b.length - a.length)
        .map(esc)
        .join('|')})(s|es)?\\b`,
      'gi'
    );
    return Custom._re;
  },
  swap(text) {
    const re = Custom.compile();
    if (!re || !text) return text;
    return text.replace(re, (m, w, pl) => {
      let n = Custom._map.get(w.toLowerCase());
      if (n == null) return m;
      if (w === w.toUpperCase() && w.length > 2 && w !== w.toLowerCase()) n = n.toUpperCase();
      else if (w === w.toLowerCase() && w !== w.toUpperCase()) n = n.toLowerCase();
      return n + (pl ? (/s$/i.test(n) ? '' : pl.toLowerCase() === 'es' ? 'es' : 's') : '');
    });
  },
  SKIP: new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'CODE', 'PRE']),
  applyWords(root) {
    if (!Custom.compile() || !root) return;
    if (root.nodeType === 3) {
      if (!Custom.skip(root.parentNode)) {
        const t = Custom.swap(root.data);
        if (t !== root.data) root.data = t;
      }
      return;
    }
    if (root.nodeType !== 1 || Custom.skip(root)) return;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = tw.nextNode())) nodes.push(n);
    for (const x of nodes) {
      if (Custom.skip(x.parentNode)) continue;
      const t = Custom.swap(x.data);
      if (t !== x.data) x.data = t;
    }
    root.querySelectorAll &&
      root.querySelectorAll('[placeholder],[title]').forEach(el => {
        for (const a of ['placeholder', 'title']) {
          const v = el.getAttribute(a);
          if (v) {
            const t = Custom.swap(v);
            if (t !== v) el.setAttribute(a, t);
          }
        }
      });
  },
  skip(el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (Custom.SKIP.has(e.tagName) || e.isContentEditable || (e.classList && e.classList.contains('no-words'))) return true;
    }
    return false;
  },
  _obs: null,
  watchWords() {
    if (Custom._obs) {
      Custom._obs.disconnect();
      Custom._obs = null;
    }
    if (!Custom.compile()) return;
    Custom.applyWords(document.body);
    Custom._obs = new MutationObserver(ms => {
      for (const m of ms) m.addedNodes.forEach(x => Custom.applyWords(x));
    });
    Custom._obs.observe(document.body, { childList: true, subtree: true });
  },
  /* ---------- everything in one file (copy to another shared folder, or keep as a backup) ---------- */
  bundle() {
    const strip = r => {
      if (!r) return null;
      const o = Object.assign({}, r);
      for (const k of Object.keys(o)) if (k.startsWith('_')) delete o[k];
      return o;
    };
    return {
      kind: 'maham-customize',
      version: APP_VERSION,
      saved: new Date().toISOString(),
      custom: strip(Store.get(Custom.ID)),
      brand: { appName: Store.setting('settings-features', 'appName', ''), logo: Store.setting('settings-features', 'logo', '') },
      about: (Store.get('settings-about') || {}).page || null,
    };
  },
  restore(b) {
    if (!b || b.kind !== 'maham-customize') throw new Error('Not a MAHAM customize file');
    const recs = [];
    if (b.custom) recs.push(Object.assign({}, b.custom, { id: Custom.ID, c: 'settings' }));
    if (b.brand)
      recs.push(
        Object.assign({}, Store.get('settings-features') || { id: 'settings-features', c: 'settings' }, {
          appName: b.brand.appName || '',
          logo: b.brand.logo || '',
        })
      );
    if (b.about) recs.push({ id: 'settings-about', c: 'settings', page: b.about });
    Store.saveMany(recs);
    return recs.length;
  },
};
