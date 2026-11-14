/* MAHAM — Light / Dark (2026.11.13.7). Each person chooses with ☀ / ☾ in the top bar; the choice is kept on
 * this PC for that person (and as the last one used, for the sign-in page). The glass look is always on (css/theme.css).
 * Loaded early so the page opens in the right colours. */
'use strict';

const Theme = {
  key(me) {
    return 'maham-theme' + (me ? '|' + me : '');
  },
  get() {
    const me = typeof App !== 'undefined' ? App.me : '';
    try {
      return localStorage.getItem(Theme.key(me)) || localStorage.getItem(Theme.key()) || 'light';
    } catch (e) {
      return 'light';
    }
  },
  set(v) {
    const me = typeof App !== 'undefined' ? App.me : '';
    try {
      if (me) localStorage.setItem(Theme.key(me), v);
      localStorage.setItem(Theme.key(), v);
    } catch (e) {
      /* private window: this visit only */
    }
    Theme.apply(v);
  },
  apply(v) {
    const t = v || Theme.get();
    document.documentElement.classList.toggle('dark', t === 'dark');
    document.querySelectorAll('.theme-sw [data-theme]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.theme === t)));
  },
  buttons() {
    const t = Theme.get();
    return `<span class="theme-sw" role="group" aria-label="Light or dark"><button type="button" data-theme="light" title="Light" aria-pressed="${t !== 'dark'}">☀</button><button type="button" data-theme="dark" title="Dark" aria-pressed="${t === 'dark'}">☾</button></span>`;
  },
};
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.theme-sw [data-theme]');
  if (b) Theme.set(b.dataset.theme);
});
Theme.apply();
