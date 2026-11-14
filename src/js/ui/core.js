/* MAHAM — UI basics: DOM shortcuts, toasts, modal dialogs, confirm. */
'use strict';

const UI = {
  $(sel, root) {
    return (root || document).querySelector(sel);
  },
  $$(sel, root) {
    return [...(root || document).querySelectorAll(sel)];
  },
  toast(msg, kind, action) {
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    if (action) {
      const b = document.createElement('button');
      b.className = 'toast-act';
      b.textContent = action.label;
      b.onclick = () => {
        t.remove();
        action.fn();
      };
      t.appendChild(b);
      t.classList.add('has-act');
    }
    UI.$('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(
      () => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
      },
      action ? 8000 : 3200
    );
  },
  /* save with an "Undo" button on the message: undo puts each record back as it was (a new one is removed again) */
  saveUndo(list, msg, kind) {
    list = list.filter(Boolean);
    for (const r of list) if (!r.id) r.id = U.uid(r.c);
    const before = list.map(r => {
      const p = Store.db.get(r.id);
      return p ? JSON.parse(JSON.stringify(p)) : null;
    });
    const ids = list.map(r => r.id);
    const v0 = Store.ver;
    Store.saveMany(list);
    if (Store.ver === v0) return false; // nothing was saved (not allowed) — saveMany already said why
    UI.toast(msg || 'Saved', kind || 'good', {
      label: '↶ Undo',
      fn: () => {
        const back = ids
          .map((id, i) =>
            before[i] ? Object.assign({}, before[i]) : Store.db.get(id) ? Object.assign({}, Store.db.get(id), { _del: true }) : null
          )
          .filter(Boolean);
        Store.saveMany(back);
        UI.toast('Undone', 'good');
        App.render(true);
      },
    });
    return true;
  },
  /* ---------- modal ---------- */
  modal({ title, body, wide, onMount, actions }) {
    UI.closeModal();
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.id = 'modal';
    wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${h(title)}">
      <div class="modal-head"><h2>${h(title)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="modal-body">${body}</div>
      ${actions ? `<div class="modal-foot">${actions}</div>` : ''}</div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('mousedown', e => {
      if (e.target === wrap) UI.tryClose();
    });
    wrap.querySelector('[data-close]').onclick = UI.tryClose;
    document.addEventListener('keydown', UI._esc);
    if (onMount) onMount(wrap);
    wrap.addEventListener('input', UI._grow);
    wrap.querySelectorAll('textarea').forEach(t => {
      if (t.value) UI._grow({ target: t });
    }); // long text boxes fit what is in them
    try {
      UI.noBreak(wrap);
    } catch (e) {
      /* layout only */
    }
    wrap._start = UI.formState(wrap); // to know later whether anything was typed
    const f = wrap.querySelector('input:not([type=hidden]):not([readonly]),select,textarea');
    if (f) setTimeout(() => f.focus(), 30);
    return wrap;
  },
  /* IDs, keys, dates and numbers never break in the middle ("TD-" / "12", "08-" / "Nov-" / "2026"): a cell or label whose
     whole text is one short word gets "nw" (no wrap). Run after every page and window is drawn. */
  noBreak(root) {
    if (!root) return;
    for (const el of root.querySelectorAll('td, th, span, a, b, small, .li > *')) {
      if (el.children.length || el.classList.contains('nw')) continue;
      const t = (el.textContent || '').trim();
      if (t.length >= 3 && t.length <= 24 && !/\s/.test(t) && /[-\d]/.test(t)) el.classList.add('nw');
    }
  },
  /* a text box grows with what is typed (2026.11.13.4) */
  _grow(e) {
    const t = e.target;
    if (!t || t.tagName !== 'TEXTAREA' || !t.closest('#modal')) return;
    t.style.height = 'auto';
    t.style.height = Math.min(window.innerHeight * 0.5, t.scrollHeight + 2) + 'px';
  },
  _esc(e) {
    if (e.key === 'Escape') UI.tryClose();
  },
  /* what is typed in the dialog's forms right now */
  formState(wrap) {
    return [...wrap.querySelectorAll('.modal-body form input, .modal-body form select, .modal-body form textarea')]
      .filter(el => el.name && el.type !== 'hidden')
      .map(el => (el.type === 'checkbox' || el.type === 'radio' ? (el.checked ? 1 : 0) : el.value))
      .join('\u0001');
  },
  modalDirty(wrap) {
    if (!wrap) return false;
    const rn = wrap.querySelector('#rnnew, .rn-edit');
    if (rn && rn.value.trim()) return true;
    /* a note typed but not added yet */ return wrap._start != null && UI.formState(wrap) !== wrap._start;
  },
  /* closing by ✕ / Esc / clicking outside / Cancel: ask first when something was typed */
  tryClose() {
    const m = UI.$('#modal');
    if (!m) return;
    if (UI.modalDirty(m)) {
      // the bar is added only now, so it never gets in the way of the dialog's own buttons
      if (m.querySelector('.unsaved-bar')) return UI.closeModal(); // asked already: a second Esc / ✕ discards
      const b = document.createElement('div');
      b.className = 'unsaved-bar';
      b.innerHTML =
        'You have changes that are not saved. <span class="grow"></span><button class="btn sm" data-keepedit>Keep editing</button><button class="btn sm danger" data-discard>Discard changes</button>';
      const body = m.querySelector('.modal-body');
      body.after(b);
      b.querySelector('[data-keepedit]').onclick = () => b.remove();
      b.querySelector('[data-discard]').onclick = () => UI.closeModal();
      b.querySelector('[data-keepedit]').focus();
      return;
    }
    UI.closeModal();
  },
  closeModal() {
    const m = UI.$('#modal');
    if (m) m.remove();
    document.removeEventListener('keydown', UI._esc);
    if (App.pendingRender) {
      if (App.applyPending) setTimeout(App.applyPending, 0);
      else {
        App.pendingRender = false;
        App.render();
      }
    }
  },
  confirm(msg, yes) {
    UI.modal({
      title: 'Please confirm',
      body: `<p>${h(msg)}</p>`,
      actions: `<button class="btn" data-close2>Cancel</button><button class="btn danger" data-yes>Yes, continue</button>`,
      onMount: w => {
        w.querySelector('[data-close2]').onclick = UI.closeModal;
        w.querySelector('[data-yes]').onclick = () => {
          UI.closeModal();
          yes();
        };
      },
    });
  },
};
/* leaving the page with a half-filled form open: the browser asks first */
window.addEventListener('beforeunload', e => {
  const m = document.getElementById('modal');
  if (m && UI.modalDirty(m)) {
    e.preventDefault();
    e.returnValue = '';
  }
});
