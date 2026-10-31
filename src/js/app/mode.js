/* DARRIK — Two modes for the super admin: the app opens as a normal analyst; "⚡ Switch to Admin" turns
 * on full super admin at once, "Back to analyst" returns. Only this screen changes: other PCs, the trust checks on
 * read and the records themselves always use the real permissions (Store._real), and saves are still made as you.
 * While in analyst mode Store.member(me) is a copy with superAdmin off, role analyst and no personal permissions. */
'use strict';

/* reading the shared data always uses the real permissions */
(() => {
  const v = Store.verify;
  Store.verify = function () {
    Store._real = (Store._real || 0) + 1;
    try {
      return v.apply(Store, arguments);
    } finally {
      Store._real--;
    }
  };
})();

Object.assign(App, {
  mode: 'analyst',
  /* am I really the super admin (whatever the mode)? */
  realSuper(id) {
    Store._real = (Store._real || 0) + 1;
    try {
      return Store.isSuper(id || App.me);
    } finally {
      Store._real--;
    }
  },
  adminMode() {
    return App.mode === 'admin' && App.realSuper();
  },
  switchMode(to) {
    if (!App.realSuper() || App.preview || App.mode === to) return;
    LS.set(App.mode === 'admin' ? 'bct.place.admin' : 'bct.place.work', location.hash || '#/home'); // remember where I was
    App.mode = to;
    if (typeof Calc !== 'undefined' && Calc.invalidate) Calc.invalidate();
    App.setViewTeam(App.teamFor(App.me));
    const back = LS.get(to === 'admin' ? 'bct.place.admin' : 'bct.place.work', '') || (to === 'admin' ? '#/admin' : '#/home');
    history.replaceState(null, '', back);
    App.launch();
    UI.toast(to === 'admin' ? 'Admin mode — everything is unlocked' : 'Back to analyst', 'good');
  },
  /* what needs the admin — shown as a red dot on the switch button while working as an analyst */
  attention() {
    const out = [];
    const today = U.todayStr();
    Store._real = (Store._real || 0) + 1;
    try {
      if (Store.rejected.length) out.push(`${Store.rejected.length} ignored change(s) — System Check`);
      if (Store.lastError) out.push('A save error — System Check');
      const old = App.oldVersions();
      if (old.length) out.push(`On an old app version: ${old.map(Store.memberShort).join(', ')}`);
      const copied = Store.setting('settings-backup', 'lastCopy', '');
      const remind = Store.setting('settings-backup', 'remindDays', 30);
      if (!copied) out.push('Backup never copied elsewhere');
      else if (U.diffDays(copied, today) > remind) out.push(`Backup last copied ${U.diffDays(copied, today)} days ago`);
      const noMgr = Store.teams().filter(t => !Store.teamManager(t.id));
      if (noMgr.length) out.push(`No manager: ${noMgr.map(t => t.name).join(', ')}`);
      const fbn = FB.newCount();
      if (fbn) out.push(`${fbn} new feedback item(s)`);
      const st = Admin.stuckTodos();
      if (st.length) out.push(`${st.length} To Do(s) waiting 3+ days for a manager to confirm`);
    } catch (e) {
      /* never break the menu */
    } finally {
      Store._real--;
    }
    return out;
  },
  /* people whose latest save (in the last 7 days) came from an older copy of the app */
  oldVersions() {
    const since = Date.now() - 7 * 864e5;
    const out = [];
    for (const [k, s] of Object.entries(Store.sources)) {
      if (!k.startsWith('u:')) continue;
      const id = k.slice(2, -5);
      if (id === App.me || !Store.member(id)) continue;
      let last = null;
      for (const r of Object.values(s.records || {})) if (r && r._v && (!last || (r._ts || 0) > (last._ts || 0))) last = r;
      if (last && (last._ts || 0) > since && U.verCmp(last._v, APP_VERSION) < 0) out.push(id);
    }
    return out;
  },
  /* the switch (bottom-left) and the admin-mode bar (top) */
  modeUi() {
    if (!App.realSuper() || App.preview) return;
    const foot = UI.$('.side-foot');
    const old = UI.$('#modebtn');
    if (old) old.remove();
    const items = App.mode === 'admin' ? [] : App.attention();
    if (foot)
      foot.insertAdjacentHTML(
        'afterbegin',
        App.mode === 'admin'
          ? '<button class="btn sm modebtn back" id="modebtn">↩ Back to analyst</button>'
          : `<button class="btn sm modebtn" id="modebtn" title="${U.h(items.length ? 'Needs you:\n• ' + items.join('\n• ') : 'Nothing needs the admin right now')}">⚡ Switch to Admin${items.length ? `<span class="mdot" aria-label="${items.length} thing(s) need the admin">${items.length}</span>` : ''}</button>`
      );
    const b = UI.$('#modebtn');
    if (b) b.onclick = () => App.switchMode(App.mode === 'admin' ? 'analyst' : 'admin');
    const bar0 = UI.$('#modebar');
    if (bar0) bar0.remove();
    if (App.mode === 'admin') {
      const mw = UI.$('.mainwrap');
      if (!mw) return;
      mw.insertAdjacentHTML(
        'afterbegin',
        '<div class="mode-bar" id="modebar"><span>⛨ <b>Admin mode</b> — every page and permission is unlocked</span><button class="btn sm" id="modeback">↩ Back to analyst</button></div>'
      );
      UI.$('#modeback').onclick = () => App.switchMode('analyst');
    }
  },
});
