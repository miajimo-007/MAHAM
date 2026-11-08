/* MAHAM — Where the data lives. Set in maham.config.js (next to MAHAM.html):
 *   'auto'   — the shared folder in desktop Chrome / Edge; this device everywhere else (phones, Safari, Firefox)
 *   'folder' — always the shared folder (desktop Chrome / Edge only)
 *   'device' — this browser only (a phone, a demo, one person)
 *   'cloud'  — the online database (fill in the "cloud" part of maham.config.js — see docs/HOSTING.md)
 * App.boot() asks MahamStorage.boot() first: 'folder' means "carry on with the shared folder as usual". */
'use strict';

const MahamStorage = {
  mode: 'folder',
  cfg() {
    return window.MAHAM_CONFIG || {};
  },
  choose() {
    const want = LS.get('maham.storage', '') || this.cfg().storage || 'auto'; // the person's own choice on this browser wins
    if (want === 'auto') return 'showDirectoryPicker' in window ? 'folder' : 'device';
    if (want === 'folder' && !('showDirectoryPicker' in window)) return 'device';
    return ['folder', 'device', 'cloud'].includes(want) ? want : 'folder';
  },
  async boot() {
    this.installable();
    this.mode = this.choose();
    if (this.mode === 'device') {
      await this.open(VFS.root(DeviceBackend, 'This device'), 'this device');
      return 'started';
    }
    if (this.mode === 'cloud') {
      await this.cloud();
      return 'started';
    }
    this.offerDevice();
    return 'folder';
  },
  async open(root, label) {
    await Store.useRoot(root);
    Store.folderName = label;
    Store.storageMode = this.mode;
    await App.start();
  },
  use(mode) {
    LS.set('maham.storage', mode);
    location.reload();
  },
  /* the shared-folder screen gets a way to try the app without a folder */
  offerDevice() {
    const orig = App.connectScreen.bind(App);
    App.connectScreen = (...a) => {
      orig(...a);
      const card = UI.$('.connect-card');
      if (!card || UI.$('#usedevice')) return;
      card.insertAdjacentHTML(
        'beforeend',
        '<p class="muted small" style="margin-top:14px"><a href="#" class="link" id="usedevice">Try it without a shared folder</a> — everything stays in this browser.</p>'
      );
      UI.$('#usedevice').onclick = e => {
        e.preventDefault();
        this.use('device');
      };
    };
  },
  /* ---------- online database (many companies; people join by invitation) ---------- */
  async cloud() {
    const c = this.cfg().cloud || {};
    if (!CloudBackend.configured(c)) {
      App.screen(
        `<h1>Online storage is not set up yet</h1><p>Fill in <code>cloud.url</code> and <code>cloud.anonKey</code> in <b>maham.config.js</b> (see docs/HOSTING.md), or use the app on this device for now.</p><div class="row-btns"><button class="btn primary" id="cl-dev">Use this device</button></div>`
      );
      UI.$('#cl-dev').onclick = () => this.use('device');
      return;
    }
    CloudBackend.init(c);
    const link = CloudBackend.fromLink(); // came back from an email link (confirm address / reset password)
    if (link === 'recovery') {
      await CloudBackend.me();
      return this.newPasswordScreen();
    }
    if (CloudBackend.session) {
      try {
        if (!CloudBackend.email()) await CloudBackend.me();
        return await this.afterSignIn();
      } catch (e) {
        CloudBackend.signOut();
      }
    }
    this.signInScreen();
  },
  tabs(on) {
    const t = (k, l) => `<a href="#" class="cl-tab ${on === k ? 'on' : ''}" data-cltab="${k}">${l}</a>`;
    return `<div class="cl-tabs">${t('in', 'Sign in')}${t('new', 'Create account')}${t('forgot', 'Forgot password')}</div>`;
  },
  bindTabs() {
    UI.$$('[data-cltab]').forEach(
      a =>
        (a.onclick = e => {
          e.preventDefault();
          ({ in: () => this.signInScreen(), new: () => this.signUpScreen(), forgot: () => this.forgotScreen() })[a.dataset.cltab]();
        })
    );
  },
  note(msg, kind) {
    return msg ? `<div class="insights ${kind === 'good' ? 'goodbox' : 'warnbox'}"><div>${U.h(msg)}</div></div>` : '';
  },
  form(id, fields, button) {
    return `<form id="${id}" class="grid-form cl-form" style="grid-template-columns:1fr">${fields.map(f => UI.field(f, f.value || '')).join('')}<button class="btn primary big" type="submit">${button}</button></form>`;
  },
  fixTypes(f) {
    const e = f.querySelector('[name=email]');
    if (e) {
      e.type = 'email';
      e.autocomplete = 'username';
    }
    f.querySelectorAll('[name^=password]').forEach(p => {
      p.type = 'password';
      p.autocomplete = p.name === 'password' && !f.querySelector('[name=password2]') ? 'current-password' : 'new-password';
    });
  },
  signInScreen(msg, kind) {
    App.screen(`<h1>Sign in</h1>${this.tabs('in')}${this.note(msg, kind)}${this.form(
      'cl-in',
      [
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'password', label: 'Password', type: 'text' },
      ],
      'Sign in'
    )}
      <p class="muted small">New here? You need an invitation from your company's admin — then use <b>Create account</b> with the invited email.</p>`);
    this.bindTabs();
    const f = UI.$('#cl-in');
    this.fixTypes(f);
    f.onsubmit = async e => {
      e.preventDefault();
      try {
        await CloudBackend.signIn(f.querySelector('[name=email]').value.trim(), f.querySelector('[name=password]').value);
        await this.afterSignIn();
      } catch (err) {
        this.signInScreen(err.message);
      }
    };
  },
  signUpScreen(msg, kind) {
    App.screen(`<h1>Create your account</h1>${this.tabs('new')}${this.note(msg, kind)}<p class="small">Use the email your company's admin invited. The account opens your company as soon as it is created.</p>
      ${this.form(
        'cl-up',
        [
          { key: 'email', label: 'Invited email', type: 'text' },
          { key: 'password', label: 'Choose a password (at least 8 characters)', type: 'text' },
          { key: 'password2', label: 'Type it again', type: 'text' },
        ],
        'Create account'
      )}`);
    this.bindTabs();
    const f = UI.$('#cl-up');
    this.fixTypes(f);
    f.onsubmit = async e => {
      e.preventDefault();
      const em = f.querySelector('[name=email]').value.trim(),
        p1 = f.querySelector('[name=password]').value,
        p2 = f.querySelector('[name=password2]').value;
      if (p1.length < 8) return this.signUpScreen('Use at least 8 characters for the password.');
      if (p1 !== p2) return this.signUpScreen('The two passwords are not the same.');
      try {
        const r = await CloudBackend.signUp(em, p1);
        if (r === 'confirm-email')
          return this.signInScreen(`Almost done — we sent a link to ${em}. Open it to confirm your email, then sign in here.`, 'good');
        await this.afterSignIn();
      } catch (err) {
        this.signUpScreen(
          /already registered/i.test(err.message)
            ? 'This email already has an account — sign in instead (or use Forgot password).'
            : err.message
        );
      }
    };
  },
  forgotScreen(msg, kind) {
    App.screen(
      `<h1>Forgot your password?</h1>${this.tabs('forgot')}${this.note(msg, kind)}${this.form('cl-fg', [{ key: 'email', label: 'Your email', type: 'text' }], 'Send me a link')}<p class="muted small">You will get an email with a link to choose a new password.</p>`
    );
    this.bindTabs();
    const f = UI.$('#cl-fg');
    this.fixTypes(f);
    f.onsubmit = async e => {
      e.preventDefault();
      const em = f.querySelector('[name=email]').value.trim();
      if (!em) return;
      try {
        await CloudBackend.recover(em);
        this.signInScreen(`If ${em} has an account, a link to choose a new password is on its way.`, 'good');
      } catch (err) {
        this.forgotScreen(err.message);
      }
    };
  },
  newPasswordScreen(msg) {
    App.screen(
      `<h1>Choose a new password</h1>${this.note(msg)}${this.form(
        'cl-np',
        [
          { key: 'password', label: 'New password (at least 8 characters)', type: 'text' },
          { key: 'password2', label: 'Type it again', type: 'text' },
        ],
        'Save and continue'
      )}`
    );
    const f = UI.$('#cl-np');
    this.fixTypes(f);
    f.onsubmit = async e => {
      e.preventDefault();
      const p1 = f.querySelector('[name=password]').value,
        p2 = f.querySelector('[name=password2]').value;
      if (p1.length < 8) return this.newPasswordScreen('Use at least 8 characters.');
      if (p1 !== p2) return this.newPasswordScreen('The two passwords are not the same.');
      try {
        await CloudBackend.setPassword(p1);
        await this.afterSignIn();
      } catch (err) {
        this.newPasswordScreen(err.message);
      }
    };
  },
  /* signed in: which company? (or the Owner Console for the platform owner) */
  async afterSignIn(choose) {
    const list = await CloudBackend.companies();
    const owner = await CloudBackend.isPlatformOwner();
    this.owner = owner;
    this.list = list;
    const usable = list.filter(m => m.active && m.status === 'active');
    if (owner && (/^#\/owner/.test(location.hash) || !usable.length) && typeof OwnerConsole !== 'undefined') return OwnerConsole.open();
    const m = choose ? null : CloudBackend.pick(list);
    if (m) {
      CloudBackend.use(m);
      return this.cloudStart(m);
    }
    if (usable.length) return this.chooseCompany(usable, owner);
    const paused = list.filter(x => x.status === 'paused'),
      off = list.filter(x => x.status === 'active' && !x.active);
    const em = U.h(CloudBackend.email());
    App.screen(`<h1>${paused.length ? 'Your company is paused' : off.length ? 'Your account is turned off' : 'No company yet'}</h1>
      <p>${paused.length ? `<b>${U.h(paused[0].name)}</b> is paused for now. Please contact your provider.` : off.length ? `Your account in <b>${U.h(off[0].name)}</b> is turned off. Ask your company's admin to turn it on again.` : `You are signed in as <b>${em}</b>, but no company has invited this email yet. Ask your company's admin to invite <b>${em}</b>, then <a href="#" id="cl-again">check again</a>.`}</p>
      <div class="row-btns"><button class="btn" id="cl-out">Sign out</button></div>`);
    UI.$('#cl-out').onclick = () => {
      CloudBackend.signOut();
      location.reload();
    };
    const a = UI.$('#cl-again');
    if (a)
      a.onclick = e => {
        e.preventDefault();
        this.afterSignIn();
      };
  },
  chooseCompany(usable, owner) {
    App.screen(`<h1>Choose a company</h1><div class="cl-companies">${usable.map((m, i) => `<button class="btn big cl-co" data-co="${i}"><b>${U.h(m.name)}</b><small>${m.role === 'admin' ? 'Admin' : 'Member'}</small></button>`).join('')}</div>
      ${owner ? '<p><a href="#" class="link" id="cl-owner">Open the Owner Console</a></p>' : ''}<div class="row-btns"><button class="btn" id="cl-out">Sign out</button></div>`);
    UI.$$('[data-co]').forEach(
      b =>
        (b.onclick = () => {
          const m = usable[+b.dataset.co];
          CloudBackend.use(m);
          this.cloudStart(m);
        })
    );
    const o = UI.$('#cl-owner');
    if (o)
      o.onclick = e => {
        e.preventDefault();
        OwnerConsole.open();
      };
    UI.$('#cl-out').onclick = () => {
      CloudBackend.signOut();
      location.reload();
    };
  },
  async cloudStart(m) {
    // the database decides who is in the company and who is its admin (access/trust.js uses Store.trustedPeople)
    const teams = ((window.SEED_DATA || {}).records || []).find(r => r.id === 'settings-teams');
    const firstTeam = teams && teams.teams && teams.teams[0] ? teams.teams[0].id : '';
    Store.trustedPeople = (await CloudBackend.people(m.company_id)).map(p => Object.assign({ team: firstTeam }, p));
    Store.cloudCompany = m;
    App.me = m.member_id;
    LS.set('bct.me', m.member_id);
    // the online account (email + password) is the sign-in: no employee ID / PIN page on top of it, and "Sign out" leaves the account
    LS.set('bct.session', { me: m.member_id, at: Date.now() });
    App.signOut = async () => {
      try {
        if (Store.dirty) await Store.flush();
      } catch (e) {
        /* */
      }
      LS.set('bct.session', null);
      CloudBackend.signOut();
      location.reload();
    };
    App.loginScreen = () => App.chooseMe();
    // one account = one person: "switch person" becomes "sign out" (or another company)
    App.chooseMe = () => {
      if (!Store.member(App.me)) {
        App.screen(
          `<h1>Account not set up</h1><p>Your account is linked to <b>${U.h(App.me)}</b>, who is not in the people list yet. Ask your company's admin to add them in Admin → People.</p><div class="row-btns"><button class="btn" id="cl-out">Sign out</button></div>`
        );
        UI.$('#cl-out').onclick = () => {
          CloudBackend.signOut();
          location.reload();
        };
        return;
      }
      UI.confirm('Sign out of this account?', () => App.signOut());
    };
    await this.open(VFS.root(CloudBackend, 'MAHAM'), m.name || (this.cfg().cloud || {}).companyName || 'online');
    if (typeof CompanySetup !== 'undefined' && !CloudBackend.supportVisit && CompanySetup.needed()) CompanySetup.open();
  },
  /* ---------- phone: "Add to Home Screen" (works when the app is served over https, e.g. GitHub Pages) ---------- */
  installable() {
    if (!/^https?:$/.test(location.protocol) || !('serviceWorker' in navigator) || this.cfg().installable === false) return;
    window.addEventListener('load', () =>
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* not available: the app still works */
      })
    );
  },
};

/* a note under your name when the data is only on this device, with a way back to the shared folder */
(() => {
  const launch = App.launch;
  App.launch = function () {
    launch.apply(this, arguments);
    const foot = UI.$('.side-foot');
    if (!foot) return;
    if (Store.storageMode === 'cloud') {
      const many = (MahamStorage.list || []).filter(m => m.active && m.status === 'active').length > 1;
      if (CloudBackend.supportVisit)
        foot.insertAdjacentHTML(
          'afterbegin',
          '<div class="store-note warn"><b>Support visit — read only.</b> Nothing you change is saved. <a href="#" id="cl-leave">Leave</a></div>'
        );
      const lv = UI.$('#cl-leave');
      if (lv)
        lv.onclick = e => {
          e.preventDefault();
          location.hash = '#/owner';
          location.reload();
        };
      foot.insertAdjacentHTML(
        'afterbegin',
        `<div class="store-note">☁ ${U.h((Store.cloudCompany || {}).name || 'Online')}${many ? ' · <a href="#" id="cl-switch">switch company</a>' : ''}${MahamStorage.owner ? ' · <a href="#" id="cl-console">Owner Console</a>' : ''}</div>`
      );
      const sw = UI.$('#cl-switch');
      if (sw)
        sw.onclick = async e => {
          e.preventDefault();
          if (Store.dirty) await Store.flush();
          LS.set('maham.cloud.company', '');
          location.reload();
        };
      const oc = UI.$('#cl-console');
      if (oc)
        oc.onclick = e => {
          e.preventDefault();
          location.hash = '#/owner';
          location.reload();
        };
      return;
    }
    if (Store.storageMode !== 'device') return;
    foot.insertAdjacentHTML(
      'afterbegin',
      `<div class="store-note">📱 Saved on this device only${'showDirectoryPicker' in window ? ' · <a href="#" id="usefolder">use a shared folder</a>' : ''}</div>`
    );
    const a = UI.$('#usefolder');
    if (a)
      a.onclick = e => {
        e.preventDefault();
        MahamStorage.use('folder');
      };
  };
})();
