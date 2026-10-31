/* DARRIK — Main layout (menu, top bar) and keeping data fresh: save, refresh, polling, update notice. */
'use strict';

Object.assign(App, {
  launch() {
    LS.set('bct.brand', { name: Store.appName(), logo: Store.appLogo(), tagline: Custom.tagline() });
    App.favicon();
    Custom.applyColor();
    document.body.className = '';
    const n = App.preview ? 0 : Store.restoreUnsaved();
    if (n) UI.toast(`Recovered ${n} unsaved change${n > 1 ? 's' : ''} — saving now`, 'warn');
    const years = [
      ...new Set(
        [
          new Date().getFullYear(),
          ...Store.all('todo').map(r => U.year(r.assigned)),
          ...Store.all('helpdesk').map(r => U.year(r.created)),
        ].filter(Boolean)
      ),
    ].sort((a, b) => b - a);
    UI.$('#app').innerHTML =
      `<aside class="side"><div class="brand">${Store.logoHtml()}<div><b id="brandapp">${U.h(Store.appName())}</b><small id="brandteam">${U.h(Store.teamName(App.viewTeam))}</small></div></div>
      <nav>${App.isSuper() ? `<div class="nav-g">Admin</div><a href="#/admin" data-nav="admin"><span class="ni">⛨</span>Admin</a><a href="#/syscheck" data-nav="syscheck"><span class="ni">✓</span>System Check</a>${App.isDir() ? '' : `<a href="#/importdata" data-nav="importdata"><span class="ni">⇪</span>Import Old Data</a><div class="nav-g">Desks</div><a href="#/director" data-nav="director"><span class="ni">★</span>Director Desk</a><a href="#/manager" data-nav="manager"><span class="ni">★</span>Manager Desk</a><a href="#/overview" data-nav="overview"><span class="ni">▤</span>All Teams Overview</a><a href="#/mgrtasks" data-nav="mgrtasks"><span class="ni">✦</span>Tasks from Director</a><a href="#/projects" data-nav="projects"><span class="ni">◈</span>Projects</a><a href="#/helpdesk/import" data-nav="hdimport"><span class="ni">⇪</span>ManageEngine Import</a>`}` : ''}${
        App.isDir()
          ? `<div class="nav-g">${App.isAED() ? 'AED' : 'Director'}</div><a href="#/home" data-nav="home"><span class="ni">★</span>${App.isAED() ? 'AED Desk' : 'Director Desk'}</a>${App.pageAllowed('projects') ? '<a href="#/projects" data-nav="projects"><span class="ni">◈</span>Projects</a>' : ''}${App.isSuper() ? '<a href="#/importdata" data-nav="importdata"><span class="ni">⇪</span>Import Old Data</a>' : ''}`
          : (Store.member(App.me) || {}).role === 'teamleader'
            ? `<div class="nav-g">Team leader</div>${App.can('importME') ? '<a href="#/helpdesk/import" data-nav="hdimport"><span class="ni">⇪</span>ManageEngine Import</a>' : ''}${App.can('editAttendanceOthers') ? '<a href="#/attendance" data-nav="attendance-tl"><span class="ni">▦</span>Team Attendance</a>' : ''}`
            : App.isMgr()
              ? `<div class="nav-g">Manager</div><a href="#/home" data-nav="home"><span class="ni">★</span>Manager Desk</a>${App.pageAllowed('projects') ? '<a href="#/projects" data-nav="projects"><span class="ni">◈</span>Projects</a>' : ''}${App.pageAllowed('mgrtasks') ? '<a href="#/mgrtasks" data-nav="mgrtasks"><span class="ni">✦</span>Tasks from Director</a>' : ''}`
              : ''
      }${App.isActing() ? `<div class="nav-g">Acting manager</div><a href="#/manager" data-nav="manager" data-actmgr><span class="ni">★</span>Manager Desk</a><a href="#/mgrtasks" data-nav="mgrtasks" data-actmgr><span class="ni">✦</span>Tasks from Director</a>` : ''}${Config.NAV.map(
        ([g, all]) => {
          const items = Custom.navItems(g, all).filter(([k]) => !(k === 'home' && App.isMgr()) && App.pageAllowed(k));
          const extraProj = g === 'Work' && !App.isMgr() && !App.isSuper() && !App.isDir() && App.pageAllowed('projects');
          return !items.length && !extraProj
            ? ''
            : `<div class="nav-g">${U.h(Custom.groupName(g))}</div>${items.map(([k, l, i]) => `<a href="#/${k}${k === 'requests' && !Requests.canRaise() ? '/approve' : ''}" data-nav="${k}"><span class="ni">${i}</span>${l}${k === 'announcements' && Ann.unread().length ? ` <span class="count">${Ann.unread().length}</span>` : ''}</a>`).join('')}${extraProj ? '<a href="#/projects" data-nav="projects"><span class="ni">◈</span>Projects</a>' : ''}`;
        }
      ).join(
        ''
      )}<div class="nav-g">${U.h(Store.appName())}</div><a href="#/feedback" data-nav="feedback"><span class="ni">💡</span>Feedback</a><a href="#/about" data-nav="about"><span class="ni">✦</span>About ${U.h(Store.appName())}</a></nav>
      <div class="side-foot"><button class="me" id="mebtn" title="Switch person"><span class="av">${U.h(Store.memberShort(App.me).slice(0, 1))}</span><span><b>${U.h(Store.memberShort(App.me))}</b><small>${U.h(Store.titleOf(App.me))} · switch · PIN</small></span></button></div></aside>
      <div class="mainwrap"><header class="top"><button class="icon-btn menu" id="menubtn" aria-label="Menu">☰</button><h1 id="ptitle"></h1><span class="grow"></span>
        ${
          App.isDir() || App.isSuper() || App.myTeams().length > 1
            ? `<label class="yearsel">Team <select id="teamsel">${App.myTeams()
                .map(t => `<option value="${U.h(t.id)}" ${t.id === App.viewTeam ? 'selected' : ''}>${U.h(t.name)}</option>`)
                .join('')}</select></label>`
            : `<span class="badge">${U.h(Store.teamName(App.viewTeam))}</span>`
        }
        <label class="yearsel">Year <select id="yearsel">${years.map(y => `<option ${y === App.year ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
        <span id="syncst" class="sync"></span><button class="btn sm" id="savebtn" title="Save your changes to the shared folder now">💾 Save</button><button class="btn sm" id="refresh" title="Get everyone's latest changes">⟳ Refresh</button></header>
        <main id="main"></main></div>`;
    UI.$('#mebtn').onclick = () =>
      UI.modal({
        title: Store.memberName(App.me),
        body: `<p class="muted small">${U.h(Store.titleOf(Store.member(App.me) || {}))} · ${U.h(Store.teamName(App.viewTeam))}</p><div class="row-btns"><button class="btn" id="m_switch">Switch person</button><button class="btn" id="m_pin">${Store.pinOf(App.me) ? 'Change my PIN' : 'Set my PIN'}</button></div><p class="muted small">Set a PIN so nobody else can open the app as you.</p>`,
        onMount: w => {
          App.bindCopy(w);
          w.querySelector('#m_switch').onclick = () => {
            UI.closeModal();
            App.chooseMe(true);
          };
          w.querySelector('#m_pin').onclick = () => {
            UI.closeModal();
            App.setPin();
          };
        },
      });
    UI.$$('nav [data-actmgr]').forEach(a =>
      a.addEventListener('click', () => {
        const m = Store.member(App.acting()[0]);
        if (m) App.setViewTeam(m.team || 'apps');
      })
    );
    UI.$('#menubtn').onclick = () => document.body.classList.toggle('nav-open');
    const ts = UI.$('#teamsel');
    if (ts)
      ts.onchange = e => {
        App.setViewTeam(e.target.value);
        if (App.page === 'home') location.hash = '#/manager';
        else App.render();
      };
    UI.$('#yearsel').onchange = e => {
      App.year = +e.target.value;
      LS.set('bct.year', App.year);
      App.render();
    };
    UI.$('#refresh').onclick = () => App.refresh(true);
    UI.$('#savebtn').onclick = () => App.saveNow();
    App.modeUi();
    Store.on(App.renderSync);
    window.onhashchange = () => {
      document.body.classList.remove('nav-open');
      App.route();
    };
    Custom.watchWords();
    App.route();
    App._verChecked = Date.now();
    App.checkVersion();
    clearTimeout(App._bk);
    App._bk = setTimeout(() => {
      if (!App.preview) Store.autoBackup();
    }, 3000); // today's backup, if nobody has made it yet
    // background refresh: pick up teammates' changes
    clearInterval(App._poll);
    App._poll = setInterval(App.poll, Config.POLL_MS);
    window.addEventListener('focus', App.poll);
    window.addEventListener('beforeunload', e => {
      if (Store.dirty) {
        Store.flush();
        e.preventDefault();
        e.returnValue = '';
      }
    });
  },
  /* who changed what since last look */
  others() {
    const o = {};
    for (const [k, v] of Object.entries(Store.sources))
      if (k.startsWith('u:') && k !== 'u:' + App.me + '.json') o[k.slice(2, -5)] = v.mtime;
    return o;
  },
  async refresh(manual) {
    const b = UI.$('#refresh');
    if (b) {
      b.disabled = true;
      b.textContent = '⟳ Refreshing…';
    }
    const before = App.others();
    try {
      if (Store.dirty) await Store.flush();
      await Store.sync(true);
      const after = App.others();
      const who = Object.keys(after)
        .filter(k => after[k] !== before[k])
        .map(k => Store.memberShort(k) || k);
      if (UI.$('#modal')) App.pendingRender = true;
      else App.render(true);
      if (manual) UI.toast(who.length ? `Updated — new changes from ${who.join(', ')}` : 'Up to date — no new changes', 'good');
      else if (who.length) UI.toast(`New changes from ${who.join(', ')}`, '');
    } catch (e) {
      UI.toast('Could not refresh: ' + e.message, 'bad');
    }
    if (b) {
      b.disabled = false;
      b.textContent = '⟳ Refresh';
    }
    App.renderSync();
  },
  /* red "not saved" bar while a save keeps failing; amber bar when this PC's clock is far from the shared folder's */
  /* "new for you" count on the desk link */
  navCounts() {
    const a = UI.$('nav a[data-nav="home"]') || UI.$('nav a[data-nav="director"]');
    if (!a) return;
    const n = App.page === 'home' ? 0 : newForMe().length;
    let b = a.querySelector('.newc');
    if (!n && b) b.remove();
    if (n) {
      if (!b) {
        b = document.createElement('span');
        b.className = 'count newc';
        b.title = 'New or changed for you';
        a.appendChild(b);
      }
      b.textContent = n;
    }
  },
  /* browser tab icon = the logo (or the first letter of the app name) */
  favicon() {
    try {
      let l = document.querySelector('link[rel=icon]');
      if (!l) {
        l = document.createElement('link');
        l.rel = 'icon';
        document.head.appendChild(l);
      }
      const lg = Store.appLogo();
      l.href =
        lg ||
        `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='#0f766e'/><text x='16' y='23' font-family='Segoe UI,Arial' font-size='19' font-weight='700' fill='white' text-anchor='middle'>${Store.appName().slice(0, 1).toUpperCase()}</text></svg>`)}`;
    } catch (e) {
      /* */
    }
  },
  banners() {
    const want = [];
    if (App.tooOld())
      want.push([
        'bnold',
        'bad',
        `⛔ <b>This copy of the app is out of date (${U.h(APP_VERSION)}) — it can't save any more.</b> Close it, delete it, and copy the new <b>DARRIK.html</b> from the shared folder (version ${U.h(Store.minVersion())} or newer).`,
      ]);
    if (Store.lastError && Store.dirty)
      want.push([
        'bnsave',
        'bad',
        `⛔ <b>Your last changes are NOT saved to the shared folder</b> — they are only on this PC. The app keeps retrying. Check the network / shared drive, then press 💾 Save now. (${U.h(Store.lastError)})`,
      ]);
    if (Math.abs(Store.clockSkew || 0) > 10 * 6e4) {
      const m = Math.round(Store.clockSkew / 6e4);
      want.push([
        'bnclock',
        'warn',
        `⏰ <b>This PC's clock is ${Math.abs(m) >= 120 ? Math.round(Math.abs(m) / 60) + ' hours' : Math.abs(m) + ' minutes'} ${m > 0 ? 'ahead of' : 'behind'} the shared folder.</b> Changes are ordered by time, so ask IT to correct the date / time on this PC.`,
      ]);
    }
    const host = UI.$('.mainwrap');
    if (!host) return;
    for (const id of ['bnold', 'bnsave', 'bnclock']) {
      const el = UI.$('#' + id);
      const w = want.find(x => x[0] === id);
      if (!w && el) el.remove();
      if (w && !el) {
        const d = document.createElement('div');
        d.id = id;
        d.className = 'sysbanner ' + w[1];
        d.innerHTML = w[2];
        host.insertBefore(d, host.querySelector('main'));
      } else if (w && el) el.innerHTML = w[2];
    }
  },
  async saveNow() {
    const b = UI.$('#savebtn');
    if (!Store.dirty && !Store.saving) {
      UI.toast('All your changes are already saved', 'good');
      return;
    }
    if (b) {
      b.disabled = true;
      b.textContent = '💾 Saving…';
    }
    for (let i = 0; i < 40 && Store.saving; i++) await new Promise(r => setTimeout(r, 150));
    await Store.flush();
    if (b) b.disabled = false;
    App.renderSync();
    if (Store.dirty || Store.lastError) UI.toast('Could not save to the shared folder: ' + (Store.lastError || 'try again'), 'bad');
    else UI.toast('Saved — teammates will see it when they refresh', 'good');
  },
  myFileName() {
    try {
      return decodeURIComponent(location.pathname.split('/').pop()) || 'DARRIK.html';
    } catch (e) {
      return 'DARRIK.html';
    }
  },
  /* is there a newer copy of the app in the shared folder? (people run a Desktop copy) */
  async checkVersion() {
    try {
      if (!Store.root) return;
      let newest = '',
        newestName = 'DARRIK.html';
      for await (const [name, hnd] of Store.root.entries()) {
        if (hnd.kind !== 'file' || !/\.html?$/i.test(name)) continue;
        const f = await hnd.getFile();
        if (f.size > 20e6) continue;
        const m = /const APP_VERSION = '([\d.]+)'/.exec(await f.text());
        if (m && U.verCmp(m[1], newest) > 0) {
          newest = m[1];
          newestName = name;
        }
      }
      if (newest && U.verCmp(newest, APP_VERSION) > 0 && !document.querySelector('.updatebar') && App._dismissedVer !== newest) {
        const bar = document.createElement('div');
        bar.className = 'updatebar';
        bar.innerHTML = `<div><b>⬆ A new version of the app is available (${U.h(newest)}) — you are using ${U.h(APP_VERSION)}.</b><br>
          To update: <b>1.</b> press 💾 Save, then close this window &nbsp;·&nbsp; <b>2.</b> <b>delete</b> your old <b>${U.h(App.myFileName())}</b> (e.g. on your Desktop) &nbsp;·&nbsp;
          <b>3.</b> copy the new <b>${U.h(newestName)}</b> from the shared folder ${App.isSuper() ? App.pathHtml() : `<b>${U.h(Store.folderName || '')}</b>`} to the same place &nbsp;·&nbsp; <b>4.</b> open it.
          <span class="muted">Your work is safe — it is saved in the shared folder, not in this file.</span></div>
          <button class="btn xs" data-later>Remind me later</button>`;
        App.bindCopy(bar);
        bar.querySelector('[data-later]').onclick = () => {
          App._dismissedVer = newest;
          bar.remove();
        };
        document.body.prepend(bar);
      }
    } catch (e) {
      /* ignore */
    }
  },
  async poll() {
    Store.autoBackup();
    if (Date.now() - (App._verChecked || 0) > 15 * 60000) {
      App._verChecked = Date.now();
      App.checkVersion();
    }
    if (document.hidden && Date.now() - Store.lastSync < 120000) return;
    try {
      const before = App.others();
      const changed = await Store.sync(false);
      if (changed) {
        const after = App.others();
        const who = Object.keys(after)
          .filter(k => after[k] !== before[k])
          .map(k => Store.memberShort(k) || k);
        if (UI.$('#modal')) App.pendingRender = true;
        else App.render(true);
        if (who.length) UI.toast(`New changes from ${who.join(', ')}`, '');
      }
    } catch (e) {
      console.warn(e);
    }
    App.renderSync();
  },
  renderSync() {
    App.banners();
    App.navCounts();
    if (App.menuCounts) App.menuCounts();
    const el = UI.$('#syncst');
    const sb = UI.$('#savebtn');
    if (sb && !sb.disabled) {
      sb.classList.toggle('primary', !!(Store.dirty || Store.lastError));
      sb.textContent = Store.saving ? '💾 Saving…' : Store.dirty || Store.lastError ? '💾 Save now' : '✓ Saved';
    }
    if (!el) return;
    if (Store.saving) el.innerHTML = '<span class="dot warn"></span>Saving…';
    else if (Store.lastError)
      el.innerHTML = `<span class="dot bad"></span><span title="${U.h(Store.lastError)}">Not saved — retrying</span>`;
    else if (Store.dirty) el.innerHTML = '<span class="dot warn"></span>Unsaved changes';
    else el.innerHTML = `<span class="dot good"></span>${Store.lastSaved ? 'Saved ' + U.fmtTs(Store.lastSaved).slice(-5) : 'Up to date'}`;
  },
});
