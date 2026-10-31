/* DARRIK — Signing in: choosing a person, PINs, switching person. */
'use strict';

Object.assign(App, {
  chooseMe(switching) {
    const all = Store.members().filter(m => m.active !== false && !m.hidden);
    const btn = m =>
      `<button class="who-btn" data-me="${U.h(m.id)}"><span class="av">${U.h((m.short || m.name).slice(0, 1))}</span><span><b>${U.h(m.name)}</b>${(m.role && m.role !== 'analyst') || m.title || m.superAdmin ? `<small class="muted" style="display:block">${U.h(Store.titleOf(m))}</small>` : ''}</span></button>`;
    const dirs = all.filter(m => Store.topRole(m.role)).sort((a, b) => (b.role === 'aed') - (a.role === 'aed'));
    const groups = Store.teams()
      .map(t => [
        t,
        all
          .filter(m => !Store.topRole(m.role) && (m.team || 'apps') === t.id)
          .sort((a, b) => (({ manager: 0, teamleader: 1 })[a.role] ?? 2) - ({ manager: 0, teamleader: 1 }[b.role] ?? 2)),
      ])
      .filter(([, l]) => l.length);
    const wel = Custom.get('welcome', '');
    const body = `<h1>${switching ? 'Switch person' : 'Who are you?'}</h1>${wel ? `<div class="insights welcome"><div>${U.h(wel).replace(/\n/g, '<br>')}</div></div>` : ''}<p class="muted">This is remembered on this computer. Your entries are saved under your name.</p>
      ${dirs.length ? `<h4 class="who-g">${dirs.some(m => m.role === 'aed') ? 'AED &amp; Directors' : dirs.length > 1 ? 'Directors' : 'Director'}</h4><div class="who">${dirs.map(btn).join('')}</div>` : ''}
      ${groups.map(([t, l]) => `<h4 class="who-g">${U.h(t.name)}</h4><div class="who">${l.map(btn).join('')}</div>`).join('')}
      ${Store.members().some(m => m.hidden && m.active !== false) ? '<p class="muted small" style="margin-top:16px"><a href="#" class="link" id="notlisted">Not listed? Sign in by name</a></p>' : ''}`;
    const pick = async (id, inModal) => {
      if (!(await App.checkPin(id))) return;
      App.setMe(id);
      if (inModal) UI.closeModal();
      {
        const sp = Custom.startPage(id);
        if (sp && App.pageAllowed(sp)) history.replaceState(null, '', '#/' + sp);
      }
      App.launch();
    };
    if (switching) {
      UI.modal({
        title: 'Switch person',
        body: body.replace(/<h1>.*?<\/h1>/, ''),
        onMount: w => {
          w.querySelectorAll('[data-me]').forEach(b => (b.onclick = () => pick(b.dataset.me, true)));
          const nl = w.querySelector('#notlisted');
          if (nl)
            nl.onclick = e => {
              e.preventDefault();
              UI.closeModal();
              App.signInByName(id => pick(id, false));
            };
        },
      });
      return;
    }
    App.screen(body);
    UI.$$('[data-me]').forEach(b => (b.onclick = () => pick(b.dataset.me, false)));
    const nl = UI.$('#notlisted');
    if (nl)
      nl.onclick = e => {
        e.preventDefault();
        App.signInByName(id => pick(id, false));
      };
  },
  signInByName(done) {
    UI.modal({
      title: 'Sign in by name',
      body: `<form id="nmf">${UI.field({ key: 'n', label: 'Your name (full or short)', type: 'text' }, '')}</form>`,
      actions: `<span class="grow"></span><button class="btn primary" data-ok>Continue</button>`,
      onMount: w => {
        const go = () => {
          const q = U.lc(w.querySelector('[name=n]').value);
          const m = Store.members().find(x => x.active !== false && [x.name, x.short, x.id, ...(x.aliases || [])].some(a => U.lc(a) === q));
          if (!m) return UI.toast('Name not found', 'bad');
          UI.closeModal();
          done(m.id);
          if (!Store.pinOf(m.id)) setTimeout(() => UI.toast('Tip: set a PIN in Settings so nobody else can sign in as you', 'warn'), 800);
        };
        w.querySelector('[data-ok]').onclick = go;
        w.querySelector('#nmf').onsubmit = e => {
          e.preventDefault();
          go();
        };
      },
    });
  },
  async hash(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bct:' + s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  },
  checkPin(id) {
    const m = Store.member(id) || {};
    const legacy = (Store.get('settings-meta') || {}).mgrPin;
    const pin = Store.pinOf(m.id) || (m.id === 'khalid' ? legacy : '');
    if (!pin) return Promise.resolve(true); // no PIN set yet
    return new Promise(res => {
      const prev = UI.$('#modal');
      if (prev) prev.remove();
      UI.modal({
        title: `PIN for ${m.name || ''}`,
        body: `<form id="pinf">${UI.field({ key: 'pin', label: 'Enter your PIN', type: 'text' }, '')}</form>`,
        actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Continue</button>`,
        onMount: w => {
          const inp = w.querySelector('[name=pin]');
          inp.type = 'password';
          const ok = async () => {
            if ((await App.hash(inp.value)) === pin) {
              UI.closeModal();
              res(true);
            } else UI.toast('Wrong PIN', 'bad');
          };
          w.querySelector('[data-ok]').onclick = ok;
          w.querySelector('#pinf').onsubmit = e => {
            e.preventDefault();
            ok();
          };
          w.querySelector('[data-c]').onclick = () => {
            UI.closeModal();
            res(false);
          };
        },
      });
    });
  },
  setPin() {
    UI.modal({
      title: 'Set my PIN',
      body: `<form id="pinf" class="grid-form">${UI.field({ key: 'a', label: 'New PIN', type: 'text' }, '')}${UI.field({ key: 'b', label: 'Repeat PIN', type: 'text' }, '')}</form><p class="note">Light protection only — it stops someone choosing your name by mistake.</p>`,
      actions: `<span class="grow"></span><button class="btn primary" data-ok>Save PIN</button>`,
      onMount: w => {
        w.querySelectorAll('input').forEach(i => (i.type = 'password'));
        w.querySelector('[data-ok]').onclick = async () => {
          const a = w.querySelector('[name=a]').value,
            b = w.querySelector('[name=b]').value;
          if (a.length < 4) return UI.toast('Use at least 4 characters', 'bad');
          if (a !== b) return UI.toast('PINs do not match', 'bad');
          const hsh = await App.hash(a);
          Store.save({ id: 'userpin-' + App.me, c: 'userpin', member: App.me, pin: hsh });
          UI.closeModal();
          UI.toast('PIN saved', 'good');
          App.render();
        };
      },
    });
  },
  teamFor(id) {
    const mm = Store.member(id);
    const ts = Store.teamsFor(id).map(t => t.id);
    const last = LS.get('bct.viewTeam', '');
    if (mm && !Store.topRole(mm.role) && !mm.superAdmin) return mm.team || 'apps';
    if (mm && mm.superAdmin && !Store.topRole(mm.role) && !ts.includes(last)) return mm.team || 'apps';
    return ts.includes(last) ? last : ts[0] || 'apps';
  },
  setMe(id) {
    if (App.me !== id) App.mode = 'analyst';
    if (App.me && App.me !== id) {
      if (typeof Admin !== 'undefined' && !App.preview)
        try {
          Admin.flushUsage();
        } catch (e) {
          /* */
        }
      Store.handOver();
    }
    App.me = id;
    LS.set('bct.me', id);
    App.setViewTeam(App.teamFor(id));
    Store.own = {};
    const mine = Store.sources['u:' + id + '.json'];
    if (mine) Store.own = Object.assign({}, mine.records);
    Store.rebuild();
  },
});
