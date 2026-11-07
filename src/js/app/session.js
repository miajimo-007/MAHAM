/* MAHAM — Signing in: the login page (employee ID + PIN), PINs, signing out, and switching person (super admin only). */
'use strict';

Object.assign(App, {
  chooseMe(switching) {
    if (switching && !App.realSuper()) return; // only the super admin can switch person; everyone else signs out and in
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
    const pin = App.pinFor(m.id);
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
            if (await App.verifyPin(inp.value, pin)) {
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
    const cur = App.pinFor(App.me);
    UI.modal({
      title: cur ? 'Change my PIN' : 'Set my PIN',
      body: `<form id="pinf" class="grid-form">${cur ? UI.field({ key: 'c', label: 'Current PIN', type: 'text', span: 2 }, '') : ''}${UI.field({ key: 'a', label: 'New PIN', type: 'text' }, '')}${UI.field({ key: 'b', label: 'Repeat PIN', type: 'text' }, '')}</form><p class="note">You sign in with your employee ID and this PIN. At least 4 characters.</p>`,
      actions: `<span class="grow"></span><button class="btn primary" data-ok>Save PIN</button>`,
      onMount: w => {
        w.querySelectorAll('input').forEach(i => {
          i.type = 'password';
          i.autocomplete = 'new-password';
        });
        w.querySelector('[data-ok]').onclick = async () => {
          const c = (w.querySelector('[name=c]') || {}).value,
            a = w.querySelector('[name=a]').value,
            b = w.querySelector('[name=b]').value;
          if (cur && !(await App.verifyPin(c, cur))) return UI.toast('The current PIN is not right', 'bad');
          if (a.length < 4) return UI.toast('Use at least 4 characters', 'bad');
          if (a !== b) return UI.toast('PINs do not match', 'bad');
          Store.save(App.pinRec(App.me, { pin: await App.makePin(a) }));
          UI.closeModal();
          UI.toast('PIN saved', 'good');
          App.render();
        };
      },
    });
  },
  /* ---------- PINs: stored as PBKDF2 (salted, 150,000 rounds) — "p2$rounds$salt$hash". Older PINs (one SHA-256) still work and are upgraded at the next sign-in. ---------- */
  PIN_ROUNDS: 150000,
  hex: b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''),
  async pbkdf2(pin, salt, rounds) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
    return App.hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, 256));
  },
  async makePin(pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return `p2$${App.PIN_ROUNDS}$${App.hex(salt)}$${await App.pbkdf2(pin, salt, App.PIN_ROUNDS)}`;
  },
  async verifyPin(pin, stored) {
    if (!stored || pin == null || pin === '') return false;
    stored = String(stored);
    if (stored.startsWith('p2$')) {
      const [, r, sh, hh] = stored.split('$');
      const salt = new Uint8Array((sh.match(/../g) || []).map(x => parseInt(x, 16)));
      return (await App.pbkdf2(pin, salt, +r || App.PIN_ROUNDS)) === hh;
    }
    return (await App.hash(pin)) === stored;
  },
  pinFor(id) {
    return Store.pinOf(id) || (id === 'khalid' ? (Store.get('settings-meta') || {}).mgrPin || '' : '');
  },
  /* ---------- the login page: employee ID + PIN. Stays signed in on this PC until "Sign out". ---------- */
  normId: v =>
    String(v ?? '')
      .trim()
      .toLowerCase()
      .replace(/^0+(?=\d)/, ''),
  /* by employee ID; someone the admin has not given an employee ID yet signs in with their MAHAM user name */
  findLogin(q) {
    const k = App.normId(q);
    if (!k) return null;
    const all = Store.members();
    return all.find(m => m.empId && App.normId(m.empId) === k) || all.find(m => !m.empId && App.normId(m.id) === k) || null;
  },
  signedIn() {
    const s = LS.get('bct.session', null);
    const m = s && Store.member(s.me);
    return !!(m && s.me === App.me && m.active !== false);
  },
  lockLeft(id) {
    const l = LS.get('bct.lock.' + id, null);
    return l && l.until > Date.now() ? Math.ceil((l.until - Date.now()) / 60000) : 0;
  },
  /* 5 wrong PINs in a row → that account is locked on this PC for 15 minutes; returns the tries left */
  wrongPin(id) {
    const l = LS.get('bct.lock.' + id, null) || {};
    const n = (l.until && l.until <= Date.now() ? 0 : l.n || 0) + 1;
    if (n >= 5) {
      LS.set('bct.lock.' + id, { n: 0, until: Date.now() + 15 * 60000 });
      return 0;
    }
    LS.set('bct.lock.' + id, { n });
    return 5 - n;
  },
  loginHtml(inner) {
    const lg = Store.appLogo();
    const tag = Store.db && Store.db.size ? Custom.tagline() : LS.get('bct.brand', {}).tagline || 'Every Effort Matters.';
    return `<div class="login-wrap"><div class="login-card"><div class="login-logo ${lg ? 'img' : ''}">${lg ? `<img src="${U.h(lg)}" alt="">` : U.h(APP_MARK)}</div><h1>${U.h(Store.appName())}</h1><p class="login-sub">${U.h(tag)}</p>${inner}</div><p class="login-foot">${U.h(Store.appName())} · ${U.h(APP_VERSION)}</p></div>`;
  },
  loginScreen(err, idVal) {
    try {
      Custom.applyColor();
    } catch (e) {
      /* */
    }
    const wel = Custom.get('welcome', '');
    try {
      UI.closeModal();
    } catch (e) {
      /* */
    } // no window from the signed-in app stays on top of the login page
    document.body.className = 'pre login-pre';
    {
      const t = document.getElementById('toasts');
      if (t) t.innerHTML = '';
    }
    UI.$('#app').innerHTML =
      App.loginHtml(`${wel ? `<div class="login-welcome">${U.h(wel).replace(/\n/g, '<br>')}</div>` : ''}${err ? `<p class="login-err" role="alert">${U.h(err)}</p>` : ''}
      <form id="loginf" class="login-form" autocomplete="on"><label>Employee ID<input id="lid" name="id" autocomplete="username" spellcheck="false" value="${U.h(idVal || '')}"></label>
        <label>PIN<input type="password" id="lpin" name="pin" autocomplete="current-password"></label>
        <button class="btn primary login-big" id="lgo" type="submit">Sign in</button></form>
      <p class="login-note">First time? Enter your employee ID and leave the PIN empty — you will choose one.<br><a href="#" class="link" id="lrec">Forgot your PIN? Use a recovery code</a> · or ask the admin to reset it.</p>`);
    {
      const f = UI.$(idVal ? '#lpin' : '#lid');
      if (f) f.focus();
    } // at once: a late focus would move typing into the wrong box
    UI.$('#lrec').onclick = e => {
      e.preventDefault();
      App.recoverScreen('', UI.$('#lid').value.trim());
    };
    UI.$('#loginf').onsubmit = async e => {
      e.preventDefault();
      const idv = UI.$('#lid').value.trim(),
        pin = UI.$('#lpin').value;
      if (!idv) return App.loginScreen('Enter your employee ID.');
      const m = App.findLogin(idv);
      if (!m) return App.loginScreen('Employee ID not found. Ask the admin to add it to your name (Admin → People).', idv);
      if (m.active === false) return App.loginScreen('This account is no longer active.', idv);
      const lk = App.lockLeft(m.id);
      if (lk)
        return App.loginScreen(
          `Too many wrong PINs — try again in ${lk} minute${lk > 1 ? 's' : ''}, or ask the admin to reset your PIN.`,
          idv
        );
      const stored = App.pinFor(m.id);
      if (!stored) return App.newPinScreen(m);
      UI.$('#lgo').disabled = true;
      if (!(await App.verifyPin(pin, stored))) {
        const left = App.wrongPin(m.id);
        return App.loginScreen(
          left ? `Wrong PIN — ${left} ${left > 1 ? 'tries' : 'try'} left.` : 'Too many wrong PINs — locked on this PC for 15 minutes.',
          idv
        );
      }
      LS.set('bct.lock.' + m.id, null);
      App.finishLogin(m.id, String(stored).startsWith('p2$') ? '' : await App.makePin(pin)); // an older PIN is stored the strong way from now on
    };
  },
  /* first sign-in (or after the admin reset the PIN): choose a PIN */
  newPinScreen(m, err) {
    UI.$('#app').innerHTML =
      App.loginHtml(`<p class="login-hello">Welcome, <b>${U.h(m.short || m.name)}</b>. Choose a PIN — you will use it with your employee ID every time you sign in.</p>${err ? `<p class="login-err" role="alert">${U.h(err)}</p>` : ''}
      <form id="newpinf" class="login-form"><label>New PIN<input type="password" id="lnew" autocomplete="new-password"></label><label>Repeat PIN<input type="password" id="lnew2" autocomplete="new-password"></label>
        <button class="btn primary login-big" id="lset" type="submit">Save PIN and sign in</button></form>
      <p class="login-note">At least 4 characters. <a href="#" class="link" id="lback">← Not you?</a></p>`);
    UI.$('#lnew').focus();
    UI.$('#lback').onclick = e => {
      e.preventDefault();
      App.loginScreen();
    };
    UI.$('#newpinf').onsubmit = async e => {
      e.preventDefault();
      const a = UI.$('#lnew').value,
        b = UI.$('#lnew2').value;
      if (a.length < 4) return App.newPinScreen(m, 'Use at least 4 characters.');
      if (a !== b) return App.newPinScreen(m, 'The two PINs are not the same.');
      App.finishLogin(m.id, await App.makePin(a));
    };
  },
  /* ---------- recovery code (super admins): a one-time code that sets a new PIN from the login page ---------- */
  RC_ALPHA: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // no 0/O or 1/I/L: easy to read back
  normCode: s =>
    String(s || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, ''),
  /* kept in the person's own PIN record (userpin-<id>), which they may always write: { rc: scrambled code, rcAt } */
  recoveryOf(id) {
    const r = Store.get('userpin-' + id);
    return r && r.rc ? { hash: r.rc, at: r.rcAt } : null;
  },
  pinRec(id, patch) {
    return Object.assign({ id: 'userpin-' + id, c: 'userpin', member: id, pin: App.pinFor(id) }, Store.get('userpin-' + id) || {}, patch);
  },
  async newRecovery() {
    const raw = [...crypto.getRandomValues(new Uint8Array(20))].map(x => App.RC_ALPHA[x % 32]).join('');
    Store.save(App.pinRec(App.me, { rc: await App.makePin(raw), rcAt: U.todayStr() }));
    return raw.match(/.{4}/g).join('-');
  },
  recoveryDialog() {
    if (!App.realSuper() || App.preview) return;
    const cur = App.recoveryOf(App.me);
    UI.modal({
      title: '🔑 Recovery code',
      body: `<p>If you forget your PIN, a recovery code lets you set a new one from the login page (<b>Forgot your PIN?</b>). It works <b>once</b>.</p>${cur ? `<p class="muted">You made one on ${U.h(U.fmtDate(cur.at))}. Making a new one stops the old one from working.</p>` : '<div class="insights warnbox"><div>You have no recovery code yet. Without one, a forgotten super admin PIN can only be reset by another super admin.</div></div>'}<div id="rcout"></div>`,
      actions: `<span class="grow"></span><button class="btn" data-c>Close</button><button class="btn primary" id="rcgo">${cur ? 'Make a new code' : 'Make my recovery code'}</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('#rcgo').onclick = async () => {
          const go = w.querySelector('#rcgo');
          go.disabled = true;
          const code = await App.newRecovery();
          w.querySelectorAll('.modal-body > p.muted, .modal-body > .insights').forEach(x => x.remove());
          w.querySelector('#rcout').innerHTML =
            `<div class="rc-code" id="rccode">${U.h(code)}</div><p class="small">Keep it somewhere safe and private, away from this PC — printed in a drawer, or in your phone's notes. It is shown <b>only now</b>; MAHAM keeps only a scrambled copy.</p><div class="row-btns"><button class="btn" id="rccopy">📋 Copy</button><button class="btn" id="rcfile">⬇ Save as a text file</button></div>`;
          go.textContent = 'Done — I kept it';
          go.disabled = false;
          go.onclick = () => {
            UI.closeModal();
            App.render();
          };
          w.querySelector('#rccopy').onclick = () => App.copyText(code);
          w.querySelector('#rcfile').onclick = () =>
            XL.download(
              new Blob(
                [
                  `${Store.appName()} recovery code for ${Store.memberName(App.me)}\n\n${code}\n\nMade ${U.fmtDate(U.todayStr())}. Works once: on the login page choose "Forgot your PIN? Use a recovery code".\n`,
                ],
                { type: 'text/plain' }
              ),
              `${Store.appName()} recovery code.txt`
            );
          UI.toast('Recovery code made', 'good');
        };
      },
    });
  },
  recoverScreen(err, idVal) {
    UI.$('#app').innerHTML =
      App.loginHtml(`<p class="login-hello">Forgot your PIN? Enter your employee ID, your <b>recovery code</b> and a new PIN.</p>${err ? `<p class="login-err" role="alert">${U.h(err)}</p>` : ''}
      <form id="recf" class="login-form"><label>Employee ID<input id="lid" autocomplete="username" spellcheck="false" value="${U.h(idVal || '')}"></label><label>Recovery code<input id="lcode" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"></label>
        <label>New PIN<input type="password" id="lnew" autocomplete="new-password"></label><label>Repeat PIN<input type="password" id="lnew2" autocomplete="new-password"></label>
        <button class="btn primary login-big" id="lrgo" type="submit">Set the new PIN and sign in</button></form>
      <p class="login-note">No recovery code? Ask the super admin to reset your PIN. <a href="#" class="link" id="lback">← Back to sign in</a></p>`);
    UI.$(idVal ? '#lcode' : '#lid').focus();
    UI.$('#lback').onclick = e => {
      e.preventDefault();
      App.loginScreen();
    };
    UI.$('#recf').onsubmit = async e => {
      e.preventDefault();
      const idv = UI.$('#lid').value.trim(),
        code = App.normCode(UI.$('#lcode').value),
        a = UI.$('#lnew').value,
        b = UI.$('#lnew2').value;
      const m = App.findLogin(idv);
      if (!m) return App.recoverScreen('Employee ID not found.', idv);
      if (m.active === false) return App.recoverScreen('This account is no longer active.', idv);
      const lk = App.lockLeft(m.id);
      if (lk) return App.recoverScreen(`Too many wrong tries — try again in ${lk} minute${lk > 1 ? 's' : ''}.`, idv);
      const rc = App.recoveryOf(m.id);
      if (!rc) return App.recoverScreen('There is no recovery code for this account. Ask the super admin to reset your PIN.', idv);
      UI.$('#lrgo').disabled = true;
      if (!(await App.verifyPin(code, rc.hash))) {
        const left = App.wrongPin(m.id);
        return App.recoverScreen(
          left
            ? `That recovery code is not right — ${left} ${left > 1 ? 'tries' : 'try'} left.`
            : 'Too many wrong tries — locked on this PC for 15 minutes.',
          idv
        );
      }
      if (a.length < 4) return App.recoverScreen('Use at least 4 characters for the new PIN.', idv);
      if (a !== b) return App.recoverScreen('The two PINs are not the same.', idv);
      LS.set('bct.lock.' + m.id, null);
      App.finishLogin(m.id, await App.makePin(a), true); // the new PIN replaces the record without the code: used up
      setTimeout(
        () => UI.toast('New PIN saved. Your recovery code is used up — make a new one (menu on your name → 🔑 Recovery code).', 'warn'),
        400
      );
    };
  },
  finishLogin(id, newPin, usedCode) {
    App.setMe(id);
    document.body.className = '';
    if (newPin)
      Store.save(
        usedCode
          ? { id: 'userpin-' + id, c: 'userpin', member: id, pin: newPin, rc: '', rcUsed: U.todayStr() }
          : App.pinRec(id, { pin: newPin })
      ); // an upgrade keeps the recovery code
    {
      const sp = Custom.startPage(id);
      if (sp && App.pageAllowed(sp)) history.replaceState(null, '', '#/' + sp);
    }
    App.launch();
  },
  async signOut() {
    if (App.preview) App.exitPreview();
    try {
      if (typeof Admin !== 'undefined') Admin.flushUsage();
    } catch (e) {
      /* */
    }
    // everything is written to MY file before "me" is cleared: a save that ran later would have nobody to write for
    for (let i = 0; i < 50 && Store.saving; i++) await new Promise(r => setTimeout(r, 100));
    if (Store.dirty) {
      try {
        await Store.flush();
      } catch (e) {
        /* */
      }
    }
    if (Store.dirty)
      return UI.toast('Your last changes could not be saved to the shared folder yet — check the connection, then sign out again.', 'bad');
    LS.set('bct.session', null);
    App.me = null;
    Store.own = {};
    Store._rescued = null;
    history.replaceState(null, '', location.pathname);
    App.loginScreen();
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
    if (App.me !== id) {
      App.mode = 'analyst';
      App.restoreView(id);
    }
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
    LS.set('bct.session', { me: id, at: Date.now() });
    App.setViewTeam(App.teamFor(id));
    Store.own = {};
    const mine = Store.sources['u:' + id + '.json'];
    if (mine) Store.own = Object.assign({}, mine.records);
    Store.rebuild();
  },
});

/* Remembered filters: each person's page filters, table search and sort are kept on this PC and come back next time */
App.saveView = U.debounce(() => {
  if (!App.me || App.preview) return;
  const ok = v => v == null || ['string', 'number', 'boolean'].includes(typeof v);
  const ps = {};
  for (const [pg, o] of Object.entries(App.ps || {})) {
    if (!o || typeof o !== 'object') continue;
    const x = {};
    for (const [k, v] of Object.entries(o)) if (ok(v)) x[k] = v;
    ps[pg] = x;
  }
  const ts = {};
  for (const [id, st] of Object.entries(App.tableState || {}))
    if (!id.startsWith('cap:') && st && typeof st === 'object')
      ts[id] = { q: st.q || '', sort: st.sort == null ? null : st.sort, dir: st.dir || -1 };
  LS.set('bct.view.' + App.me, { ps, ts });
}, 600);
App.restoreView = function (id) {
  const v = LS.get('bct.view.' + id, null);
  if (!v || typeof v !== 'object') return;
  App.ps = v.ps && typeof v.ps === 'object' ? v.ps : {};
  App.tableState = {};
  for (const [k, st] of Object.entries(v.ts || {})) App.tableState[k] = { q: st.q || '', sort: st.sort, dir: st.dir || -1, limit: 100 };
};
