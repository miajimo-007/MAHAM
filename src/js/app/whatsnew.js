/* MAHAM — "What's new": after an update, each person sees once what changed for them (notes in config/whatsnew.js,
 * picked by their role). "✨ What's new" at the bottom of the menu opens it again. What a person has seen is kept on
 * this PC (browser storage); someone who has never opened the app here sees everything since WHATS_NEW_FROM (the version
 * the team ran before these notes started). The newest version is open; earlier ones are folded. */
'use strict';

const WhatsNew = {
  key() {
    return 'bct.whatsnew.' + App.me;
  },
  /* who the person is, for the notes: all + analyst or lead (+ admin) */
  groups() {
    const g = new Set(['all']);
    const m = Store.member(App.me) || {};
    const lead = App.isSuper() || App.isMgr() || App.isActing() || ['teamleader', 'manager', 'director', 'aed'].includes(m.role);
    g.add(lead ? 'lead' : 'analyst');
    if (App.isSuper() || (typeof AdminRole !== 'undefined' && AdminRole.any(App.me))) g.add('admin');
    return g;
  },
  /* the versions newer than `seen` (nothing seen yet: everything since WHATS_NEW_FROM), each with only this person's lines */
  entries(seen) {
    const g = WhatsNew.groups();
    const all = WHATS_NEW.filter(e => U.verCmp(e.ver, APP_VERSION) <= 0);
    const from = seen || (typeof WHATS_NEW_FROM !== 'undefined' ? WHATS_NEW_FROM : '');
    const l = from ? all.filter(e => U.verCmp(e.ver, from) > 0) : all;
    return l.map(e => Object.assign({}, e, { items: e.items.filter(i => g.has(i.who)) })).filter(e => e.items.length);
  },
  show(list) {
    list = list || WhatsNew.entries('');
    LS.set(WhatsNew.key(), APP_VERSION);
    const ul = e => `<ul class="wn-list">${e.items.map(x => `<li>${x.text}</li>`).join('')}</ul>`;
    const head = (e, i) =>
      `${i === 0 && e.ver === APP_VERSION ? 'This update' : 'Version ' + U.h(e.ver)} <span class="muted small">· ${i === 0 && e.ver === APP_VERSION ? 'version ' + U.h(e.ver) + ' · ' : ''}${U.h(e.date || '')}</span>`;
    const body = list.length
      ? list
          .map((e, i) =>
            i === 0
              ? `<section class="wn-ver"><h4>${head(e, i)}</h4>${ul(e)}</section>`
              : `<details class="wn-ver"><summary><b>${head(e, i)}</b> <span class="muted small">· ${e.items.length} change${e.items.length > 1 ? 's' : ''}</span></summary>${ul(e)}</details>`
          )
          .join('') + (list.length > 1 ? `<p class="muted small">Earlier versions are folded — click one to read it.</p>` : '')
      : '<p class="muted">Nothing new for you in this version.</p>';
    UI.modal({
      title: '✨ What’s new in ' + Store.appName(),
      body: body + '<p class="muted small">Open this again any time: <b>✨ What’s new</b> at the bottom of the menu.</p>',
      actions: '<span class="grow"></span><button class="btn primary" data-wnok>Got it</button>',
      onMount: w => {
        w.querySelector('.modal').classList.add('wn-modal');
        w.querySelector('[data-wnok]').onclick = UI.closeModal;
      },
    });
  },
  /* after signing in: once per new version (not in preview, not over another window) */
  auto() {
    if (!App.me || App.preview || LS.get('bct.test.nowhatsnew', '')) return;
    const seen = LS.get(WhatsNew.key(), '');
    if (seen === APP_VERSION) return;
    const l = WhatsNew.entries(seen);
    if (!l.length) {
      LS.set(WhatsNew.key(), APP_VERSION);
      return;
    }
    if (UI.$('#modal')) {
      clearTimeout(WhatsNew._t);
      WhatsNew._t = setTimeout(WhatsNew.auto, 4000);
      return;
    }
    WhatsNew.show(l);
  },
};

(function wire() {
  const launch = App.launch;
  App.launch = function (...a) {
    const out = launch.apply(this, a);
    const f = UI.$('.side-foot');
    if (f && !UI.$('#wnbtn')) {
      f.insertAdjacentHTML(
        'afterbegin',
        '<button class="btn xs wn-btn" id="wnbtn" title="What changed in the latest updates">✨ What’s new</button>'
      );
      UI.$('#wnbtn').onclick = () => WhatsNew.show(WhatsNew.entries(''));
    }
    clearTimeout(WhatsNew._t);
    WhatsNew._t = setTimeout(WhatsNew.auto, 800);
    return out;
  };
})();
