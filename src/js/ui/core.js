/* DARRIK — UI basics: DOM shortcuts, toasts, modal dialogs, confirm. */
'use strict';

const UI = {
  $(sel, root) {
    return (root || document).querySelector(sel);
  },
  $$(sel, root) {
    return [...(root || document).querySelectorAll(sel)];
  },
  toast(msg, kind) {
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    UI.$('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, 3200);
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
      if (e.target === wrap) UI.closeModal();
    });
    wrap.querySelector('[data-close]').onclick = UI.closeModal;
    document.addEventListener('keydown', UI._esc);
    if (onMount) onMount(wrap);
    const f = wrap.querySelector('input:not([type=hidden]):not([readonly]),select,textarea');
    if (f) setTimeout(() => f.focus(), 30);
    return wrap;
  },
  _esc(e) {
    if (e.key === 'Escape') UI.closeModal();
  },
  closeModal() {
    const m = UI.$('#modal');
    if (m) m.remove();
    document.removeEventListener('keydown', UI._esc);
    if (App.pendingRender) {
      App.pendingRender = false;
      App.render();
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
