/* MAHAM — People and teams (from the settings-team / settings-teams records), plus anonymised names. */
'use strict';

Object.assign(Store, {
  members() {
    return Store.setting('settings-team', 'members', []);
  },
  teams() {
    return Store.setting('settings-teams', 'teams', [
      { id: 'apps', name: 'APPS' },
      { id: 'lab', name: 'LAB' },
      { id: 'bi', name: 'BI' },
      { id: 'ops', name: 'OPS' },
    ]);
  },
  /* departments: AED → directors → each director runs a department (e.g. IT) with teams under it.
   * settings-depts { list: [{ id, name, director, teams: [teamId] }] } (Admin → Teams & departments). Until it is set up there is
   * one department (named in settings-features.orgName, default IT) with every team and the first director. */
  /* public holidays: settings-holidays { list: [{ from, to, name }] } */
  /* when a person last saved real work (not usage / read receipts / save tests) */
  lastWork(id) {
    const src = Store.sources['u:' + id + '.json'];
    let t = 0;
    for (const r of Object.values((src && src.records) || {}))
      if (r && r._ts > t && !['usage', 'annread', 'ping', 'userpin'].includes(r.c)) t = r._ts;
    return t;
  },
  /* the oldest app version allowed to save (Admin → Teams & departments → App version) */
  minVersion() {
    return Store.setting('settings-features', 'minVersion', '');
  },
  /* To Do review (Admin → Teams & departments → Teams, per team): a finished To Do waits for the manager to confirm */
  /* every finished To Do waits for the manager / team leader to confirm it (no team switch any more) */
  todoReview() {
    return true;
  },
  /* who may press Done: the person it is assigned to, or a manager / team leader */
  canFinishTodo(r, me) {
    me = me || App.me;
    return (
      !!r &&
      !r.virtual &&
      r.status !== 'Canceled' &&
      !r.finish &&
      (r.analyst === me || (Store.can(me, 'assignTodo') && Store.inMyTeam(r, me)))
    );
  },
  /* the To Do belongs to one of the teams this person manages (own team, acting-for team; all teams for the super admin) */
  inMyTeam(r, me) {
    const a = Store.member(r.analyst);
    const team = r.team || (a && a.team) || 'apps';
    return Store.teamsFor(me || App.me).some(t => t.id === team);
  },
  /* who may confirm or send back: a manager / team leader — never the person who did it */
  /* only a manager / team leader of the To Do's own team (or an acting manager of it, or the super admin) confirms it */
  canConfirmTodo(r, me) {
    me = me || App.me;
    if (!r || r.virtual || r.status !== 'Ready for review' || r.analyst === me || !Store.can(me, 'assignTodo')) return false;
    if (typeof TodoFlow !== 'undefined' && TodoFlow.has(r) && TodoFlow.phase(r) !== 'manager') return false; // still going through its steps
    return Store.inMyTeam(r, me);
  },
  /* confirming: with steps, the finish date is when the person's own part was last done (that is what is scored) */
  confirmedTodo(r) {
    const f = typeof TodoFlow !== 'undefined' && TodoFlow.has(r) ? TodoFlow.effFinish(r) || r.finish : r.finish;
    return Object.assign({}, r, { finish: f, status: 'Resolved', reviewedBy: App.me, reviewedOn: U.todayStr() });
  },
  /* a manager closing someone else's To Do (or one they gave themselves) confirms it at the same time */
  selfConfirms(r, by) {
    by = by || App.me;
    return Store.can(by, 'assignTodo') && (r.analyst !== by || r.givenBy === by);
  },
  finishStatus(r, by) {
    if (!r.finish) return 'In Progress';
    if (r.reviewedBy) return 'Resolved';
    return Store.selfConfirms(r, by) ? 'Resolved' : 'Ready for review';
  },
  /* app name and logo (settings-features.appName / .logo = small PNG data URL) */
  appName() {
    const r = Store.get && Store.get('settings-features');
    if (r) return r.appName || 'MAHAM';
    return LS.get('bct.brand', {}).name || 'MAHAM';
  }, // the shared setting wins; this computer's copy only before the folder is open
  appLogo() {
    return (
      (Store.get && Store.get('settings-features') ? Store.setting('settings-features', 'logo', '') : LS.get('bct.brand', {}).logo) || ''
    );
  },
  logoHtml(letter, cls) {
    const l = Store.appLogo();
    return l
      ? `<span class="logo img ${cls || ''}" id="brandlogo"><img src="${U.h(l)}" alt=""></span>`
      : `<span class="logo mark ${cls || ''}" id="brandlogo" aria-hidden="true">${U.h(letter || APP_MARK)}</span>`;
  },
  /* run fn as if this super admin were in analyst mode (Admin pages show what they can do there) */
  asAnalyst(id, fn) {
    const was = Store._asAnalyst;
    Store._asAnalyst = id;
    try {
      return fn();
    } finally {
      Store._asAnalyst = was;
    }
  },
  canA(id, key, d) {
    const m = Store.members().find(x => x.id === id);
    return m && m.superAdmin ? Store.asAnalyst(id, () => Store.can(id, key, d)) : Store.can(id, key, d);
  },
  holidays() {
    return Store.setting('settings-holidays', 'list', []);
  },
  holidayOf(s) {
    if (!s) return '';
    const d = String(s).slice(0, 10);
    const h = Store.holidays().find(x => x.from && d >= x.from && d <= (x.to || x.from));
    return h ? h.name || 'Holiday' : '';
  },
  depts() {
    if (Store._deptV === Store.ver && Store._depts) return Store._depts;
    const ids = Store.teams().map(t => t.id);
    const saved = Store.setting('settings-depts', 'list', null);
    const list =
      saved && saved.length
        ? saved.map(d => Object.assign({}, d, { teams: (d.teams || []).filter(t => ids.includes(t)) }))
        : [
            {
              id: 'cis',
              name: Store.setting('settings-features', 'orgName', '') || 'IT',
              director: (Store.members().find(m => m.role === 'director' && m.active !== false) || {}).id || '',
              teams: ids,
            },
          ];
    const placed = new Set(list.flatMap(d => d.teams));
    const loose = ids.filter(t => !placed.has(t));
    if (loose.length) list[0] = Object.assign({}, list[0], { teams: list[0].teams.concat(loose) }); // a new team joins the first department
    Store._depts = list;
    Store._deptV = Store.ver;
    return list;
  },
  deptOfTeam(t) {
    return Store.depts().find(d => d.teams.includes(t)) || Store.depts()[0];
  },
  /* departments a person belongs to / runs (AED and super admin: all) */
  deptsOf(id) {
    const m = Store.member(id);
    const all = Store.depts();
    if (!m) return [];
    if (m.superAdmin || m.role === 'aed') return all;
    if (m.role === 'director') {
      const mine = all.filter(d => d.director === id);
      if (mine.length) return mine;
      const free = all.filter(d => !d.director || !Store.member(d.director));
      return free.length ? free : all;
    }
    return [Store.deptOfTeam(m.team || 'apps')];
  },
  deptOfMember(id) {
    const m = Store.member(id);
    if (!m) return Store.depts()[0];
    if (m.role === 'director') return Store.deptsOf(id)[0];
    if (m.role === 'aed' || (m.superAdmin && Store.topRole(m.role))) return null;
    return Store.deptOfTeam(m.team || 'apps');
  },
  /* the name to show for "my department" (one department) or the whole organisation */
  orgName(id) {
    const ds = Store.deptsOf(id || App.me);
    return ds.length === 1 ? ds[0].name : ds.length ? 'All departments' : (Store.depts()[0] || {}).name || 'IT';
  },
  /* the title shown next to a person's name: their own title (Admin → person card), "Admin" for the super admin, else the role */
  titleOf(m) {
    if (typeof m === 'string') m = Store.member(m);
    if (!m) return '';
    return (m.title || '').trim() || (m.superAdmin || m._admin ? 'Admin' : Store.roleLabel(m.role));
  },
  teamName(id) {
    if (id === '_top') return 'Director level';
    const t = Store.teams().find(x => x.id === id);
    return t ? t.name : id || '';
  },
  /* members of the team being viewed (the director is not part of any team) */
  team(t) {
    const tm = t || App.viewTeam;
    return Store.visible().filter(m => !Store.topRole(m.role) && (!tm || tm === '*' || (m.team || 'apps') === tm));
  },
  teamManager(t) {
    return Store.members().find(m => m.role === 'manager' && (m.team || 'apps') === t && m.active !== false);
  },
  managers() {
    return Store.visible().filter(m => m.role === 'manager' && m.active !== false);
  },
  member(id) {
    const m = Store.members().find(x => x.id === id);
    // the super admin working in analyst mode: on this screen they are a normal analyst (app/mode.js)
    if (
      m &&
      m.superAdmin &&
      !Store._real &&
      (Store._asAnalyst === id || (typeof App !== 'undefined' && App.mode === 'analyst' && id === App.me && !App.preview))
    )
      return Object.assign({}, m, { superAdmin: false, _admin: true }); // their own permissions / functions apply
    return m;
  },
  /* hidden people are invisible to everyone except the super admin */
  visible() {
    const all = Store.members();
    return Store.isSuper(App.me) ? all : all.filter(m => !m.hidden || m.id === App.me);
  },
  activeTeam() {
    return Store.team().filter(m => m.active !== false);
  },
  scoredTeam() {
    return Store.team().filter(m => m.active !== false && m.scored);
  },
  /* "See names" off -> other people appear as Member 1, 2, ... (stable numbering) */
  anon(id) {
    if (!App.me || id === App.me || Store.can(App.me, 'seeNames')) return null;
    const i = Store.members().findIndex(m => m.id === id);
    return i < 0 ? null : 'Member ' + (i + 1);
  },
  /* a person's PIN (hashed): its own record userpin-<id> (written by that person); older PINs lived in the people list */
  pinOf(id) {
    const r = Store.get('userpin-' + id);
    if (r) return r.pin || '';
    const m = Store.member(id);
    return (m && m.pin) || '';
  },
  memberName(id) {
    const a = Store.anon(id);
    if (a) return a;
    const m = Store.member(id);
    return m ? m.name : id || '';
  },
  memberShort(id) {
    const a = Store.anon(id);
    if (a) return a;
    const m = Store.member(id);
    return m ? m.short || m.name : id || '';
  },
  memberByMeName(name) {
    const nk = x => U.lc(x).replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
    const k = nk(name);
    if (!k) return null;
    if (!Store._meIdx || Store._meIdxV !== Store.ver) {
      Store._meIdx = {};
      Store._meIdxV = Store.ver;
      for (const m of Store.members()) for (const a of [m.me, m.name, m.short, ...(m.aliases || [])]) if (a) Store._meIdx[nk(a)] = m.id;
    }
    return Store._meIdx[k] || null;
  },
});
