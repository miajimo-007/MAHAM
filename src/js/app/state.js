/* MAHAM — App — who is signed in, which team/year is shown, and shortcuts to permissions for the signed-in person. */
'use strict';

const App = {
  isMgr() {
    return Store.isManager(App.me);
  },
  isDir() {
    return Store.isDirector(App.me);
  },
  isAED() {
    return Store.isAED(App.me);
  },
  tooOld() {
    const mv = Store.minVersion();
    return !!mv && U.verCmp(APP_VERSION, mv) < 0;
  },
  myTeams() {
    return Store.teamsFor(App.me);
  },
  /* who I can assign director tasks / projects to */
  assignees() {
    const mine = new Set(App.myTeams().map(t => t.id));
    const mgrs = Store.managers().filter(m => mine.has(m.team || 'apps'));
    if (App.isAED() || App.isSuper())
      return Store.visible()
        .filter(m => m.role === 'director' && m.active !== false)
        .concat(mgrs);
    return mgrs;
  },
  /* managers I am covering for while they are on leave */
  acting() {
    return Store.actingFor(App.me);
  },
  isActing() {
    return !App.isMgr() && App.acting().length > 0;
  },
  /* is this record's manager me, or someone I am acting for? */
  forMe(mid) {
    return mid === App.me || App.acting().includes(mid);
  },
  can(key) {
    return Store.can(App.me, key);
  },
  canEdit(c) {
    return Store.canEditColl(App.me, c, App.viewTeam);
  },
  level(k) {
    return Store.pageLevel(App.me, k, App.viewTeam);
  },
  isSuper() {
    return Store.isSuper(App.me);
  },
  /* keep only my own rows when I may not see teammates' records */
  mine(rows, get) {
    return App.can('viewOthers') ? rows : rows.filter(r => get(r) === App.me);
  },
  viewTeam: 'apps',
  setViewTeam(t) {
    if (t !== '*' && !Store.teams().some(x => x.id === t) && !App.myTeams().some(x => x.id === t)) {
      console.warn('Not a team, view not changed:', t);
      return;
    }
    App.viewTeam = t;
    LS.set('bct.viewTeam', t);
    Calc.invalidate();
    const s = UI.$('#teamsel');
    if (s) s.value = t;
    for (const id of ['brandteam', 'navteam']) {
      const b = UI.$('#' + id);
      if (b) b.textContent = Store.teamName(t);
    }
  },
  me: null,
  year: new Date().getFullYear(),
  page: 'home',
  sub: '',
  ps: {},
  tableState: {},
  tableRows: {},
  pendingRender: false,
};
