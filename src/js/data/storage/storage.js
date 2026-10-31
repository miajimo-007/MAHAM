/* DARRIK — Where the data lives. Set in darrik.config.js (next to DARRIK.html):
 *   'auto'   — the shared folder in desktop Chrome / Edge; this device everywhere else (phones, Safari, Firefox)
 *   'folder' — always the shared folder (desktop Chrome / Edge only)
 *   'device' — this browser only (a phone, a demo, one person)
 *   'cloud'  — the online database (fill in the "cloud" part of darrik.config.js — see docs/HOSTING.md)
 * App.boot() asks DarrikStorage.boot() first: 'folder' means "carry on with the shared folder as usual". */
'use strict';

const DarrikStorage = {
  mode: 'folder',
  cfg() {
    return window.DARRIK_CONFIG || {};
  },
  choose() {
    const want = LS.get('darrik.storage', '') || this.cfg().storage || 'auto'; // the person's own choice on this browser wins
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
    LS.set('darrik.storage', mode);
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
  /* ---------- online database ---------- */
  async cloud() {
    const c = this.cfg().cloud || {};
    if (!CloudBackend.configured(c)) {
      App.screen(
        `<h1>Online storage is not set up yet</h1><p>Fill in <code>cloud.url</code> and <code>cloud.anonKey</code> in <b>darrik.config.js</b> (see docs/HOSTING.md), or use the app on this device for now.</p><div class="row-btns"><button class="btn primary" id="cl-dev">Use this device</button></div>`
      );
      UI.$('#cl-dev').onclick = () => this.use('device');
      return;
    }
    CloudBackend.init(c);
    if (CloudBackend.session) {
      try {
        const m = await CloudBackend.membership();
        if (m) return this.cloudStart(m);
      } catch (e) {
        CloudBackend.signOut();
      }
    }
    this.signInScreen();
  },
  signInScreen(msg) {
    App.screen(`<h1>Sign in</h1>${msg ? `<div class="insights warnbox"><div>${U.h(msg)}</div></div>` : ''}<form id="cl-in" class="grid-form" style="grid-template-columns:1fr">
      ${UI.field({ key: 'email', label: 'Email', type: 'text' }, '')}${UI.field({ key: 'password', label: 'Password', type: 'text' }, '')}
      <button class="btn primary big" type="submit">Sign in</button></form><p class="muted small">Ask your company's owner for an account.</p>`);
    const f = UI.$('#cl-in');
    f.querySelector('[name=password]').type = 'password';
    f.querySelector('[name=email]').type = 'email';
    f.onsubmit = async e => {
      e.preventDefault();
      try {
        await CloudBackend.signIn(f.querySelector('[name=email]').value.trim(), f.querySelector('[name=password]').value);
        const m = await CloudBackend.membership();
        if (!m) {
          CloudBackend.signOut();
          return this.signInScreen('This account is not linked to a company yet — ask the owner to add you.');
        }
        await this.cloudStart(m);
      } catch (err) {
        this.signInScreen(err.message);
      }
    };
  },
  async cloudStart(m) {
    App.me = m.member_id;
    LS.set('bct.me', m.member_id);
    // one account = one person: "switch person" signs out instead of listing everyone
    App.chooseMe = () => {
      if (!Store.member(App.me)) {
        App.screen(
          `<h1>Account not set up</h1><p>Your account is linked to <b>${U.h(App.me)}</b>, who is not in the people list yet. Ask the owner to add them in Admin → People.</p><div class="row-btns"><button class="btn" id="cl-out">Sign out</button></div>`
        );
        UI.$('#cl-out').onclick = () => {
          CloudBackend.signOut();
          location.reload();
        };
        return;
      }
      UI.confirm('Sign out of this account?', () => {
        CloudBackend.signOut();
        location.reload();
      });
    };
    await this.open(VFS.root(CloudBackend, 'DARRIK'), (this.cfg().cloud || {}).companyName || 'online');
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
    if (!foot || Store.storageMode !== 'device') return;
    foot.insertAdjacentHTML(
      'afterbegin',
      `<div class="store-note">📱 Saved on this device only${'showDirectoryPicker' in window ? ' · <a href="#" id="usefolder">use a shared folder</a>' : ''}</div>`
    );
    const a = UI.$('#usefolder');
    if (a)
      a.onclick = e => {
        e.preventDefault();
        DarrikStorage.use('folder');
      };
  };
})();
