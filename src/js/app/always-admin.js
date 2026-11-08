/* MAHAM (commercial copy) — an admin is always an admin: no "Switch to Admin" / "Back to analyst", and an admin is
 * not part of a team (not in team lists, not scored, sees every team) — yet has every function, and can pick themself
 * in any person list to try things out. Everyone else works as before.
 * Online companies only (storage 'cloud'); the shared-folder and this-device copies keep the two modes. */
'use strict';

(function () {
  const isAdmin = id => Store.storageMode === 'cloud' && !!(Store.members().find(m => m.id === id) || {}).superAdmin;
  // always admin mode for an admin (when the app opens, after switching person, after sign-in)
  const launch = App.launch;
  App.launch = function () {
    if (App.me && !App.preview && isAdmin(App.me)) App.mode = 'admin';
    return launch.apply(App, arguments);
  };
  const sw = App.switchMode;
  App.switchMode = function (to) {
    if (to === 'analyst' && isAdmin(App.me) && !App.preview) return; // there is no analyst mode for an admin
    return sw.apply(App, arguments);
  };
  // no switch button and no "admin mode" bar — a small note instead
  const modeUi = App.modeUi;
  App.modeUi = function () {
    if (Store.storageMode !== 'cloud') return modeUi.apply(App, arguments);
    ['#modebtn', '#modebar'].forEach(s => {
      const e = UI.$(s);
      if (e) e.remove();
    });
    if (App.preview || !isAdmin(App.me)) return;
    const foot = UI.$('.side-foot');
    if (foot && !UI.$('#adminnote')) foot.insertAdjacentHTML('afterbegin', '<div class="store-note" id="adminnote">⛨ Admin</div>');
  };
  // an admin belongs to no team
  const team = Store.team;
  Store.team = function () {
    const l = team.apply(Store, arguments);
    return Store.storageMode === 'cloud' ? l.filter(m => !m.superAdmin) : l;
  };
  const teamFor = App.teamFor;
  App.teamFor = function (id) {
    if (!isAdmin(id)) return teamFor.apply(App, arguments);
    const ts = Store.teamsFor(id).map(t => t.id);
    const last = LS.get('bct.viewTeam', '');
    return ts.includes(last) ? last : ts[0] || '';
  };
  // …but every function: the admin can still choose themself as the person (to test), shown last as "(admin)"
  const mo = UI.memberOptions;
  UI.memberOptions = function (sel) {
    const html = mo.apply(UI, arguments);
    if (!isAdmin(App.me) || html.includes(`value="${U.h(App.me)}"`)) return html;
    const me = Store.members().find(m => m.id === App.me) || { name: App.me };
    return html + `<option value="${U.h(App.me)}" ${sel === App.me ? 'selected' : ''}>${U.h(me.name)} (admin)</option>`;
  };
})();
