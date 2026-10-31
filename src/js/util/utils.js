/* DARRIK — General helpers (HTML escaping, numbers, ids, collections). `h` is the HTML-escape shorthand used in templates. */
'use strict';

const U = {
  h(s) {
    return s == null
      ? ''
      : String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  },
  pad(n) {
    return String(n).padStart(2, '0');
  },
  num(v, dp = 1) {
    return v == null || v === '' || isNaN(v) ? '–' : (+v).toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: 0 });
  },
  pct(v, dp = 1) {
    return v == null || isNaN(v) ? '–' : (v * 100).toFixed(dp) + '%';
  },
  r2(v) {
    return Math.round((v + 1e-9) * 100) / 100;
  },
  uid(prefix) {
    return `${prefix}-${App.me || 'x'}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  },
  debounce(fn, ms) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  },
  slug(s) {
    return (
      String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30) || 'user'
    );
  },
  sum(a) {
    return a.reduce((x, y) => x + (+y || 0), 0);
  },
  avg(a) {
    return a.length ? U.sum(a) / a.length : null;
  },
  groupBy(a, f) {
    const m = new Map();
    for (const x of a) {
      const k = f(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  },
  /* compare version strings like 2026.10.22.12 part by part (as numbers): >0 when a is newer */
  verCmp(a, b) {
    const x = String(a || '')
        .split('.')
        .map(Number),
      y = String(b || '')
        .split('.')
        .map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] || 0) - (y[i] || 0);
      if (d) return d;
    }
    return 0;
  },
  lc(s) {
    return String(s || '')
      .trim()
      .toLowerCase();
  },
};

const h = U.h;
