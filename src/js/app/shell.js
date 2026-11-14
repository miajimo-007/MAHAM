/* MAHAM — Main layout (menu, top bar) and keeping data fresh: save, refresh, polling, update notice. */
'use strict';

Object.assign(App, {
  launch() {
    if (typeof Theme !== 'undefined') Theme.apply(); // this person's Light / Dark (2026.11.13.7)
    try {
      if (typeof TodoRules !== 'undefined' && App.me && !App.preview) TodoRules.run();
    } catch (e) {
      console.warn(e);
    } // repeating To Dos due by today
    try {
      if (typeof TodoFlow !== 'undefined' && App.me && !App.preview)
        TodoFlow.autoNext(Store.all('todo', '*').filter(t => t.analyst === App.me && t.wf && t.finish));
    } catch (e) {
      console.warn(e);
    } // a workflow step not handed on yet
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
          ...Store.archiveYears,
        ].filter(Boolean)
      ),
    ].sort((a, b) => b - a); // + years kept in archive files
    UI.$('#app').innerHTML =
      `<aside class="side"><div class="brand">${Store.logoHtml()}<div><b id="brandapp">${U.h(Store.appName())}</b><small id="brandteam">${U.h(Store.teamName(App.viewTeam))}</small></div></div>
      ${App.navHtml()}
      <div class="side-foot"><button class="me" id="mebtn" title="My PIN · sign out"><span class="av">${U.h(Store.memberShort(App.me).slice(0, 1))}</span><span><b>${U.h(Store.memberShort(App.me))}</b><small>${U.h(Store.titleOf(App.me))} · PIN · sign out</small></span></button></div></aside>
      <div class="mainwrap"><header class="top"><button class="icon-btn menu" id="menubtn" aria-label="Menu">☰</button><h1 id="ptitle"></h1><span class="grow"></span>
        ${
          App.isDir() || App.isSuper() || App.myTeams().length > 1
            ? `<label class="yearsel">Team <select id="teamsel">${App.myTeams()
                .map(t => `<option value="${U.h(t.id)}" ${t.id === App.viewTeam ? 'selected' : ''}>${U.h(t.name)}</option>`)
                .join('')}</select></label>`
            : `<span class="badge">${U.h(Store.teamName(App.viewTeam))}</span>`
        }
        <label class="yearsel">Year <select id="yearsel">${years.map(y => `<option ${y === App.year ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
        ${typeof Find !== 'undefined' ? Find.buttons() : ''}${typeof Theme !== 'undefined' ? Theme.buttons() : ''}<span id="syncst" class="sync"></span><button class="btn sm" id="savebtn" title="Save your changes to the shared folder now">💾 Save</button><button class="btn sm" id="refresh" title="Get everyone's latest changes">⟳ Refresh</button></header>
        <main id="main"></main></div>`;
    UI.$('#mebtn').onclick = () =>
      UI.modal({
        title: Store.memberName(App.me),
        body: `<p class="muted small">${U.h(Store.titleOf(Store.member(App.me) || {}))} · ${U.h(Store.teamName(App.viewTeam))}</p><div class="row-btns">${App.realSuper() && !App.preview ? '<button class="btn" id="m_switch">Switch person</button>' : ''}<button class="btn" id="m_pin">${App.pinFor(App.me) ? 'Change my PIN' : 'Set my PIN'}</button>${App.realSuper() && !App.preview ? `<button class="btn" id="m_rc">🔑 Recovery code${App.recoveryOf(App.me) ? '' : ' ⚠'}</button>` : ''}<span class="grow"></span><button class="btn" id="m_out">⎋ Sign out</button></div><p class="muted small">You stay signed in on this PC until you sign out.</p>`,
        onMount: w => {
          App.bindCopy(w);
          const sw = w.querySelector('#m_switch');
          if (sw)
            sw.onclick = () => {
              UI.closeModal();
              App.chooseMe(true);
            };
          w.querySelector('#m_out').onclick = () => {
            UI.closeModal();
            App.signOut();
          };
          const rc = w.querySelector('#m_rc');
          if (rc)
            rc.onclick = () => {
              UI.closeModal();
              App.recoveryDialog();
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
    UI.$('#yearsel').onchange = async e => {
      App.year = +e.target.value;
      LS.set('bct.year', App.year);
      if (await Store.ensureYears([App.year])) UI.toast(`${App.year} loaded from the archive`, 'good');
      App.render();
    };
    UI.$('#refresh').onclick = () => App.refresh(true);
    UI.$('#savebtn').onclick = () => App.saveNow();
    App.modeUi();
    if (typeof Find !== 'undefined') Find.bind();
    Store.on(App.renderSync);
    Store.rescueStray()
      .then(n => {
        if (n) UI.toast(`${n} change${n > 1 ? 's' : ''} saved just before a sign-out were put back in your file`, 'good');
      })
      .catch(() => {
        /* */
      });
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
  /* Someone else's changes arrived. Redraw the page — but never under someone who is typing: a box on the page that has
   * focus or holds text not saved yet (My Day's shadow form, a comment, report notes …) would be wiped by the redraw.
   * Then the redraw waits and happens as soon as they finish (save, clear the box, leave it, or open another page). */
  _snap: new WeakMap(),
  snapInputs(root) {
    App._snap = new WeakMap();
    (root || document)
      .querySelectorAll('input, textarea, select')
      .forEach(e => App._snap.set(e, e.type === 'checkbox' || e.type === 'radio' ? e.checked : e.value));
  },
  typing() {
    const m = UI.$('#main');
    if (!m) return false;
    const a = document.activeElement;
    if (
      a &&
      m.contains(a) &&
      (a.matches('textarea, select, [contenteditable="true"]') ||
        (a.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'file'].includes(a.type)))
    )
      return true;
    return [...m.querySelectorAll('input, textarea, select')].some(e => {
      if (!App._snap.has(e) || ['button', 'submit', 'file'].includes(e.type)) return false;
      const v = e.type === 'checkbox' || e.type === 'radio' ? e.checked : e.value;
      return v !== App._snap.get(e);
    });
  },
  safeRender() {
    if (UI.$('#modal') || App.typing()) {
      App.pendingRender = true;
      return false;
    }
    App.pendingRender = false;
    App.render(true);
    return true;
  },
  /* apply a waiting redraw once the person has stopped typing */
  applyPending() {
    if (App.pendingRender && !UI.$('#modal') && !App.typing()) {
      App.pendingRender = false;
      App.render(true);
    }
  },
  /* who changed what since last look */
  others() {
    const o = {};
    for (const [k, v] of Object.entries(Store.sources))
      if (Store.isMainKey(k) && k !== 'u:' + App.me + '.json') o[k.slice(2, -5)] = v.mtime;
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
      if (manual || !App.safeRender) {
        if (UI.$('#modal')) App.pendingRender = true;
        else App.render(true);
      } else App.safeRender();
      if (manual) UI.toast(who.length ? `Updated — new changes from ${who.join(', ')}` : 'Up to date — no new changes', 'good'); // only when asked (no pop-up for other people's changes)
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
        `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='#0f766e'/><text x='16' y='23' font-size='19' text-anchor='middle'>${APP_MARK}</text></svg>`)}`;
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
        `⛔ <b>This copy of the app is out of date (${U.h(APP_VERSION)}) — it can't save any more.</b> Close it, delete it, and copy the new <b>MAHAM.html</b> from the shared folder (version ${U.h(Store.minVersion())} or newer).`,
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
      return decodeURIComponent(location.pathname.split('/').pop()) || 'MAHAM.html';
    } catch (e) {
      return 'MAHAM.html';
    }
  },
  /* is there a newer copy of the app in the shared folder? (people run a Desktop copy) */
  async checkVersion() {
    try {
      if (!Store.root) return;
      let newest = '',
        newestName = 'MAHAM.html';
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
    if (!App.me) return; // signed out: the login page needs nothing from the shared folder
    Store.autoBackup();
    try {
      if (typeof TodoRules !== 'undefined' && TodoRules.run()) App.pendingRender = true;
    } catch (e) {
      console.warn(e);
    }
    if (Date.now() - (App._verChecked || 0) > 15 * 60000) {
      App._verChecked = Date.now();
      App.checkVersion();
    }
    if (document.hidden && Date.now() - Store.lastSync < 120000) return;
    try {
      const changed = await Store.sync(false);
      if (changed) {
        App.safeRender(); // other people's changes show quietly — no pop-up
      } else App.applyPending();
    } catch (e) {
      console.warn(e);
    }
    App.renderSync();
  },
  renderSync() {
    if (Store._newYears) {
      Store._newYears = false;
      const ys = UI.$('#yearsel');
      if (ys) {
        const have = new Set([...ys.options].map(o => +o.value));
        for (const y of Store.archiveYears) if (!have.has(y)) ys.add(new Option(String(y), String(y)));
        [...ys.options].sort((a, b) => b.value - a.value).forEach(o => ys.appendChild(o));
        ys.value = String(App.year);
      }
    } // years found in archive files
    App.banners();
    App.navCounts();
    if (App.menuCounts) App.menuCounts();
    App.navSections();
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

/* ---------- the menu: Home, My Work, Follow-up, Projects, Team & Time, Performance, Reference; ⚙ Admin at the bottom ---------- */
App.navHtml = function () {
  const a = (href, key, icon, label, extra) =>
    `<a href="${href}" data-nav="${key}"${extra || ''}><span class="ni">${icon}</span>${label}</a>`;
  const role = (Store.member(App.me) || {}).role;
  const tl = role === 'teamleader';
  const deskName = App.isDir() ? (App.isAED() ? 'AED Desk' : 'Director Desk') : App.isMgr() ? 'Manager Desk' : null;
  const groups = Config.NAV.map(([g, all]) => {
    const meta = Object.fromEntries(all.map(x => [x[0], x[3] || {}]));
    const items = Custom.navItems(g, all)
      .filter(([k]) => {
        const m = meta[k] || {};
        if (m.superOnly && !App.isSuper()) return false;
        if (m.mgr && !(App.isMgr() || App.isSuper())) return false;
        return App.pageAllowed(m.page || k);
      })
      .map(([k, l, i]) => {
        const m = meta[k] || {};
        if (k === 'home') return a('#/home', 'home', deskName ? '★' : i, deskName && l === 'Analyst Desk' ? deskName : l);
        if (k === 'requests')
          return `<a href="#/requests${!Requests.canRaise() ? '/approve' : ''}" data-nav="requests"><span class="ni">${i}</span>${l}</a>`;
        return a(
          m.href || '#/' + k,
          k,
          i,
          l + (k === 'announcements' && Ann.unread().length ? ` <span class="count">${Ann.unread().length}</span>` : '')
        );
      });
    // extra links some people have
    if (g === 'Home') {
      if (App.isSuper() && !App.isDir())
        items.push(a('#/manager', 'manager', '★', 'Manager Desk'), a('#/director', 'director', '★', 'Director Desk'));
      if (App.isActing()) items.push(a('#/manager', 'manager', '★', 'Manager Desk (acting manager)', ' data-actmgr'));
    }
    if (g === 'Work' && (App.isSuper() || (tl && App.can('importME'))) && !App.isDir())
      items.push(a('#/helpdesk/import', 'hdimport', '⇪', 'ManageEngine Import'));
    if (g === 'Tracking' && App.isActing() && !App.isMgr() && !App.isSuper())
      items.push(a('#/mgrtasks', 'mgrtasks', '✦', 'Tasks from the director (acting)', ' data-actmgr'));
    if (g === 'Team' && tl && App.can('editAttendanceOthers')) items.push(a('#/attendance', 'attendance-tl', '▦', 'Team Attendance'));
    return { g, items };
  }).filter(x => x.items.length);
  /* each section is one link (it opens the page last used there); its pages show as tabs at the top of the page.
   * The pages' links stay in the menu, folded away, so counts and permissions work the same as before. */
  const sec = (g, label, icon, items) =>
    `<a class="sec" data-sec="${U.h(g)}" href="${items[0].match(/href="([^"]+)"/)[1]}"><span class="ni">${icon}</span><span class="sec-l">${U.h(label)}</span><span class="count sec-n" hidden></span></a><div class="nav-items" aria-hidden="true">${items.join('').replace(/<a /g, '<a tabindex="-1" ')}</div>`;
  const homeName = deskName || Custom.groupName('Home');
  const body = groups
    .map(x =>
      sec(x.g, x.g === 'Home' ? homeName : Custom.groupName(x.g), x.g === 'Home' && deskName ? '★' : Config.NAV_ICONS[x.g] || '•', x.items)
    )
    .join('');
  const admin =
    !App.isSuper() && AdminRole.any(App.me)
      ? sec('Admin', 'Admin', '⚙', [
          a('#/admin', 'admin', '⛨', 'Admin'),
          ...(AdminRole.sees('syscheck') ? [a('#/syscheck', 'syscheck', '✓', 'System Check')] : []),
        ])
      : App.isSuper()
        ? sec('Admin', 'Admin', '⚙', [
            a('#/admin', 'admin', '⛨', 'Admin'),
            a('#/syscheck', 'syscheck', '✓', 'System Check'),
            ...(App.isDir() ? [] : [a('#/importdata', 'importdata', '⇪', 'Import Old Data')]),
          ])
        : '';
  return `<nav>${body}<div class="nav-bottom">${admin}<div class="nav-mini">${a('#/feedback', 'feedback', '💡', 'Feedback')}${a('#/about', 'about', '✦', 'About ' + U.h(Store.appName()))}</div></div></nav>`;
};
