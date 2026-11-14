/* MAHAM — Day-first date boxes.
 * The browser's own date box shows dates the way the PC's language says (on a US-English PC: 11/12/2026 = month first),
 * while the rest of the app writes 12-Nov-2026. Every <input type="date"> on any page or window is given a text box that
 * shows 12-Nov-2026 and understands typing day first (12-11-2026, 12/11, 12 nov, today), with a 📅 button that opens the
 * usual calendar. The real date box stays in place, hidden, with its name and id: everything that reads or sets its value
 * (forms, filters, tests) still sees 2026-11-12, and a change made in either box updates the other. Nothing is stored
 * differently. */
'use strict';

const DateBox = {
  VAL: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'),
  /* "12-11-2026", "12/11/26", "12.11", "12 nov 2026", "12-Nov-2026", "2026-11-12", "today", "tomorrow", "yesterday" → "2026-11-12";
   * '' → ''; anything else → null */
  parse(s) {
    s = String(s || '')
      .trim()
      .toLowerCase();
    if (!s) return '';
    const t = U.todayStr();
    if (s === 'today') return t;
    if (s === 'tomorrow') return U.addDays(t, 1);
    if (s === 'yesterday') return U.addDays(t, -1);
    const ok = (y, m, d) => {
      if (y < 100) y += 2000;
      const dt = new Date(y, m - 1, d);
      return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d && y > 1900 && y < 2200
        ? `${y}-${U.pad(m)}-${U.pad(d)}`
        : null;
    };
    let x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (x) return ok(+x[1], +x[2], +x[3]);
    const cy = +t.slice(0, 4);
    x = s.match(/^(\d{1,2})[-/. ](\d{1,2})(?:[-/. ](\d{2}|\d{4}))?$/);
    if (x) return ok(x[3] ? +x[3] : cy, +x[2], +x[1]);
    x = s.match(/^(\d{1,2})[-/. ]*([a-z]{3,})\.?(?:[-/., ]+(\d{2}|\d{4}))?$/);
    if (x) {
      const m = U.MONTHS.findIndex(n => x[2].startsWith(n.toLowerCase())) + 1;
      return m ? ok(x[3] ? +x[3] : cy, m, +x[1]) : null;
    }
    return null;
  },
  show(v) {
    return v ? U.fmtDate(v) : '';
  },
  enhance(nat) {
    if (nat.dataset.dx || nat.type !== 'date' || !nat.parentNode) return;
    nat.dataset.dx = '1';
    const box = document.createElement('span');
    box.className = 'dbox';
    const txt = document.createElement('input');
    txt.type = 'text';
    txt.className = ((nat.className || '') + ' dtext').trim();
    txt.autocomplete = 'off';
    txt.placeholder = 'dd-mm-yyyy';
    txt.title = nat.title || 'Type the day first (e.g. 12-11-2026, 12 Nov, today) or pick it with 📅';
    if (nat.getAttribute('style')) txt.setAttribute('style', nat.getAttribute('style'));
    if (nat.getAttribute('aria-label')) txt.setAttribute('aria-label', nat.getAttribute('aria-label'));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dpick';
    btn.tabIndex = -1;
    btn.textContent = '📅';
    btn.title = 'Pick a date';
    btn.setAttribute('aria-label', 'Pick a date');
    nat.parentNode.insertBefore(box, nat);
    box.append(txt, btn, nat);
    nat.classList.add('dnative');
    nat.tabIndex = -1;
    if (nat.id) {
      txt.id = nat.id + '__t';
      const lb = document.querySelector(`label[for="${CSS.escape(nat.id)}"]`);
      if (lb) lb.htmlFor = txt.id;
    }
    const sync = () => {
      txt.value = DateBox.show(DateBox.VAL.get.call(nat));
      txt.classList.remove('dbad');
      txt.disabled = nat.disabled;
      btn.disabled = nat.disabled || nat.readOnly;
      txt.readOnly = nat.readOnly;
    };
    /* code that sets the date (e.g. a due date worked out from the priority) updates the text too */
    Object.defineProperty(nat, 'value', {
      configurable: true,
      get() {
        return DateBox.VAL.get.call(this);
      },
      set(v) {
        DateBox.VAL.set.call(this, v);
        sync();
      },
    });
    nat.addEventListener('input', sync);
    nat.addEventListener('change', sync);
    const apply = () => {
      const v = DateBox.parse(txt.value);
      const cur = DateBox.VAL.get.call(nat);
      if (v === null) {
        txt.classList.add('dbad');
        if (typeof UI !== 'undefined' && UI.toast) UI.toast(`"${txt.value}" is not a date — type the day first, e.g. 12-11-2026`, 'bad');
        return false;
      }
      if (v && ((nat.min && v < nat.min) || (nat.max && v > nat.max))) {
        txt.classList.add('dbad');
        if (UI.toast)
          UI.toast(
            `Pick a date ${nat.min && v < nat.min ? 'on or after ' + U.fmtDate(nat.min) : 'on or before ' + U.fmtDate(nat.max)}`,
            'bad'
          );
        return false;
      }
      txt.classList.remove('dbad');
      txt.value = DateBox.show(v);
      if (v !== cur) {
        DateBox.VAL.set.call(nat, v);
        nat.dispatchEvent(new Event('input', { bubbles: true }));
        nat.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    };
    txt.addEventListener('change', e => {
      e.stopPropagation();
      apply();
    });
    txt.addEventListener('input', e => e.stopPropagation()); // only the real date box tells the page about a change
    txt.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (!apply()) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    });
    txt.addEventListener('click', e => e.stopPropagation());
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (nat.disabled || nat.readOnly) return;
      try {
        nat.showPicker();
      } catch (err) {
        nat.style.pointerEvents = 'auto';
        nat.focus();
        nat.click();
        nat.style.pointerEvents = '';
      }
    });
    sync();
  },
  scan(root) {
    if (root && root.querySelectorAll) {
      if (root.matches && root.matches('input[type=date]')) DateBox.enhance(root);
      root.querySelectorAll('input[type=date]:not([data-dx])').forEach(DateBox.enhance);
    }
  },
  start() {
    DateBox.scan(document.body);
    new MutationObserver(list => {
      for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) DateBox.scan(n);
    }).observe(document.body, { childList: true, subtree: true });
  },
};
if (document.body) DateBox.start();
else document.addEventListener('DOMContentLoaded', DateBox.start);
