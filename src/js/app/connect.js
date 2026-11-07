/* MAHAM — Start-up: browser check, connecting to the shared folder, first load. */
'use strict';

Object.assign(App, {
  async boot() {
    App.me = LS.get('bct.me', null);
    App.year = LS.get('bct.year', App.year);
    App.ps = LS.get('bct.ps', {});
    if (App.me && App.restoreView) App.restoreView(App.me); // this person's remembered filters, search and sort (older copies kept one set for the PC)
    // editions with other storage (this device / online database) plug in here; this build has none, so the shared folder is used
    if (typeof MahamStorage !== 'undefined' && (await MahamStorage.boot()) === 'started') return;
    if (!Store.supported())
      return App.screen(
        `<h1>Please open this in Microsoft Edge or Google Chrome</h1><p>This app saves to the shared folder using a browser feature that Edge and Chrome have (Firefox and Internet Explorer do not).</p><p class="muted">Right-click <b>MAHAM.html</b> → <b>Open with</b> → <b>Microsoft Edge</b>.</p>`
      );
    let st;
    try {
      st = await Store.tryRestore();
    } catch (e) {
      st = 'none';
    }
    if (st === 'ok') return App.start();
    App.connectScreen(st === 'needs-permission');
  },
  screen(html) {
    const ready = Store.db && Store.db.size;
    try {
      if (ready) Custom.applyColor();
      else Custom.applySavedColor();
    } catch (e) {
      /* */
    }
    document.body.className = 'pre';
    UI.$('#app').innerHTML =
      `<div class="connect"><div class="connect-card"><div class="brand big">${Store.logoHtml()}<div><b>${U.h(Store.appName())}</b><small>${U.h(ready ? Custom.tagline() : LS.get('bct.brand', {}).tagline || 'Every Effort Matters.')}</small></div></div>${html}</div></div>`;
    if (ready) Custom.watchWords();
  },
  connectScreen(reconnect) {
    App.screen(
      reconnect
        ? `<h1>Welcome back</h1><p>Click below to reconnect to the team's shared folder <b>${U.h(Store._pending && Store._pending.name)}</b>.</p><div class="row-btns"><button class="btn primary big" id="grant">Connect to shared folder</button><button class="btn ghost" id="pick">Choose a different folder…</button></div><p class="muted small">Your browser asks once per session for permission to save to the folder. Choose <b>“Allow on every visit”</b> if it is offered so you won't be asked again.</p><div id="connerr"></div>`
        : `<h1>Connect to the team folder</h1><ol class="steps"><li>Click <b>Choose folder</b>.</li><li>Select the team's <b>shared folder</b> on the network drive (the same folder for all 7 people — e.g. the folder where this file is).</li><li>When the browser asks, allow it to <b>view and edit</b> files — that is how your work is saved for the team.</li></ol><div class="row-btns"><button class="btn primary big" id="pick">Choose folder…</button></div><p class="muted small">The app creates a <b>MAHAM Data</b> folder inside it for everyone's saved work. Nothing is uploaded anywhere.</p><div id="connerr"></div><div class="dropzone" id="drop"><b>Or drag the shared folder here</b><span>Open the shared folder's parent in File Explorer and drag the team folder onto this box</span></div>`
    );
    UI.$$('[data-copypath]').forEach(b => (b.onclick = () => App.copyText(b.dataset.copypath)));
    const showWrite = denied => {
      const ce = UI.$('#connerr');
      if (!ce) return;
      ce.innerHTML = denied
        ? `<div class="insights warnbox"><div><b>Edge refused to let the app save in this folder.</b><br>If you saw a prompt and chose “Don't allow”, click the button again and choose <b>Edit files</b> / <b>Allow</b>.<br>If no prompt appears at all, hospital policy is blocking web pages from editing files — tell me, and we'll switch to a SharePoint / Teams version.</div><div class="row-btns"><button class="btn primary" id="allowwrite">Allow editing</button></div></div>`
        : `<div class="insights"><div><b>Almost done:</b> Edge gave the app permission to <i>view</i> the folder but not to <i>save</i> in it. Click the button and choose <b>Edit files</b> / <b>Allow on every visit</b>.</div><div class="row-btns"><button class="btn primary big" id="allowwrite">Allow editing</button></div></div>`;
      UI.$('#allowwrite').onclick = () => go(() => Store.grantWrite());
    };
    const go = async fn => {
      try {
        await fn();
        await App.start();
      } catch (e) {
        if (e && e.name === 'WriteError') {
          showWrite(e.message === 'WRITE_DENIED');
          return;
        }
        if (e && e.name === 'AbortError') {
          const ce = UI.$('#connerr');
          if (ce)
            ce.innerHTML =
              '<p class="t-warn small">The folder window closed without a folder. If you did click Select Folder, Edge refused it — try dragging the folder onto the box below instead.</p>';
          return;
        }
        const msg = 'Could not open folder: ' + ((e && e.name + ' — ' + e.message) || e);
        UI.toast(msg, 'bad');
        const ce = UI.$('#connerr');
        if (ce) ce.innerHTML = `<p class="t-bad small">${U.h(msg)}</p>`;
      }
    };
    const g = UI.$('#grant');
    if (g)
      g.onclick = () =>
        go(async () => {
          if (!(await Store.grantPending())) {
            const e = new Error('WRITE_DENIED');
            e.name = 'WriteError';
            throw e;
          }
        });
    UI.$('#pick').onclick = () => go(() => Store.pick());
    const dz = UI.$('#drop');
    if (dz) {
      ['dragenter', 'dragover'].forEach(ev =>
        dz.addEventListener(ev, e => {
          e.preventDefault();
          dz.classList.add('over');
        })
      );
      dz.addEventListener('dragleave', () => dz.classList.remove('over'));
      dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('over');
        const it = [...e.dataTransfer.items].find(i => i.kind === 'file');
        if (!it || !it.getAsFileSystemHandle) {
          UI.$('#connerr').innerHTML =
            '<p class="t-bad small">This browser does not support dropping folders. Use Microsoft Edge or Chrome.</p>';
          return;
        }
        const hp = it.getAsFileSystemHandle();
        go(async () => {
          const h = await hp;
          if (!h || h.kind !== 'directory') throw new Error('Please drop a folder, not a file');
          await Store.useHandle(h);
        });
      });
    }
  },
  copyText(t) {
    const done = () => UI.toast('Copied: ' + t, 'good');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText)
        return navigator.clipboard.writeText(t).then(done, () => App._copyOld(t, done));
    } catch (e) {
      /* */
    }
    App._copyOld(t, done);
  },
  _copyOld(t, done) {
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      done();
    } catch (e) {
      UI.toast('Select the path and press Ctrl+C', 'warn');
    }
    ta.remove();
  },
  /* the shared folder path, with a Copy button (Settings, System Check, update notice) */
  pathHtml() {
    const p = Store.sharedPath();
    return p
      ? `<code class="pathcode">${U.h(p)}</code> <button class="btn xs" data-copypath="${U.h(p)}" title="Copy the path">Copy</button>`
      : `<b>${U.h(Store.folderName || '')}</b> <span class="muted small">(full path not set — the administrator can add it in Admin → Teams &amp; departments)</span>`;
  },
  /* every path, one per line, each with a Copy button */
  pathsHtml(which) {
    const P = Store.paths();
    const L = { folder: 'Shared folder', data: 'Data folder', users: "Everyone's data files", backups: 'Backups', mine: 'My data file' };
    return `<div class="pathlist">${(which || ['folder', 'data', 'users', 'backups', 'mine'])
      .filter(k => P[k])
      .map(
        k =>
          `<div class="pathrow"><span class="muted small">${L[k]}</span><code class="pathcode">${U.h(P[k])}</code><button class="btn xs" data-copypath="${U.h(P[k])}">Copy</button></div>`
      )
      .join(
        ''
      )}${P.full ? '' : '<p class="muted small">Full path not set yet — the administrator adds it in Admin → Teams &amp; departments → Shared folder path.</p>'}</div>`;
  },
  bindCopy(root) {
    (root || document).querySelectorAll('[data-copypath]').forEach(
      b =>
        (b.onclick = e => {
          e.preventDefault();
          e.stopPropagation();
          App.copyText(b.dataset.copypath);
        })
    );
  },
  async start() {
    const t0 = performance.now();
    App.screen('<p class="muted">Loading team data…</p>');
    if (App.year && App.year < Store.archiveCut()) Store.loadYears.add(App.year); // last chosen year was a past one: read its archive too
    // fast opening: show this PC's copy of the data at once, then read only what changed in the shared folder
    if (!App.preview && App.me && (await Store.useSnapshot()) && Store.get('settings-team') && Store.member(App.me) && App.signedIn()) {
      App.setViewTeam(App.teamFor(App.me));
      {
        const sp = Custom.startPage(App.me);
        if (sp && (!location.hash || location.hash === '#/' || location.hash === '#/home') && App.pageAllowed(sp))
          history.replaceState(null, '', '#/' + sp);
      }
      App.launch();
      Store.stats.openMs = Math.round(performance.now() - t0);
      Store.stats.openedFrom = "this PC's copy, then the shared folder";
      if (await Store.sync(false)) {
        App.render(true);
      }
      App.renderSync();
      return;
    }
    await Store.sync(true);
    if (!Store.get('settings-team')) {
      App.screen(
        `<h1>No team data found</h1><p>The folder <b>${U.h(Store.folderName)}</b> was opened but <code>data/seed.json</code> is missing or unreadable. Make sure you picked the folder you unzipped (it contains <b>MAHAM.html</b> and a <b>data</b> folder).</p><div class="row-btns"><button class="btn primary" id="pick">Choose folder…</button></div>`
      );
      UI.$('#pick').onclick = async () => {
        try {
          await Store.pick();
          App.start();
        } catch (e) {
          /* */
        }
      };
      return;
    }
    {
      const sp = Store.sharedPath();
      if (sp) LS.set('bct.sharedPath', sp);
    } // remembered for the connect screen next time
    if (!App.me || !Store.member(App.me) || !App.signedIn()) {
      App.loginScreen();
      return;
    } // the login page: employee ID + PIN
    App.setViewTeam(App.teamFor(App.me));
    {
      const sp = Custom.startPage(App.me);
      if (sp && (!location.hash || location.hash === '#/' || location.hash === '#/home') && App.pageAllowed(sp))
        history.replaceState(null, '', '#/' + sp);
    } // start page for the role (Admin → Customize)
    App.launch();
    Store.stats.openMs = Math.round(performance.now() - t0);
    Store.stats.openedFrom = 'the shared folder';
  },
});
