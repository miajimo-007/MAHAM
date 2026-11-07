/* MAHAM — Scrum rules for projects: planners, members, sprints, story points, progress. */
'use strict';

/* ---------- Scrum: who may do what in a project ---------- */
const Scrum = {
  /* board columns come from Settings (per team): the first is where new tasks start, the last means done */
  columns(p) {
    const team = p ? Scrum.teamOf(p) : undefined;
    const l = (Store.lists(team).boardColumns || []).filter(Boolean);
    return l.length >= 2 ? l : Config.DEFAULT_LISTS.boardColumns;
  },
  doneCol(p) {
    const c = Scrum.columns(p);
    return c[c.length - 1];
  },
  isDone(t) {
    return !!t && (t.status === 'Done' || t.status === Scrum.doneCol(Scrum.proj(t.project)));
  },
  /* which column a task sits in (a status no longer on the board → first column; old "Done" → last) */
  colIndex(t) {
    const c = Scrum.columns(Scrum.proj(t.project));
    const i = c.indexOf(t.status);
    return i >= 0 ? i : Scrum.isDone(t) ? c.length - 1 : 0;
  },
  POINTS: [1, 2, 3, 5, 8, 13],
  proj(pid) {
    return Store.get(pid);
  },
  /* ---- one kind of project: a Team, an Owner (anyone in that team), Members, Given by ----
   * owner + the team's manager (+ acting) → plan, sprints, assign, edit, close, delete
   * director → sees every project of his department; edits the ones he gave (and older ones nobody recorded)
   * members (and anyone with a task in it) → add tasks, move their own tasks, comment
   * everyone else in the team → can look (read-only) · super admin → everything */
  teamOf(p) {
    if (!p) return 'apps';
    if (p.team && p.team !== '_top') return p.team;
    const o = Store.member(p.manager);
    return (o && !Store.topRole(o.role) && o.team) || p.team || 'apps';
  },
  ownerOf(p) {
    return p ? p.manager : '';
  },
  hasTask(p, id) {
    return !!p && Store.all('ptask').some(t => t.project === p.id && t.assignee === (id || App.me));
  },
  /* on the project: owner, member or has a task in it */
  onProject(p, id) {
    const who = id || App.me;
    return !!p && (p.manager === who || (p.members || []).includes(who) || Scrum.hasTask(p, who));
  },
  teamManagerOf(p) {
    const m = Store.teamManager(Scrum.teamOf(p));
    return m ? m.id : '';
  },
  planner(p) {
    if (!p || !App.me) return false;
    if (App.isSuper()) return true;
    if (App.forMe(p.manager)) return true; // owner, or acting for the owner while on leave
    const tm = Scrum.teamManagerOf(p);
    if (tm && App.forMe(tm)) return true; // the team's manager (or acting manager)
    if (App.isDir() || App.isAED()) return App.myTeams().some(t => t.id === Scrum.teamOf(p)) && (p.givenBy === App.me || !p.givenBy);
    return false;
  },
  /* may create projects: managers (and acting), team leaders / analysts with the permission, directors, super admin */
  canCreate() {
    return App.isSuper() || App.can('createProjects');
  }, // managers and directors have it by default; Admin can take it away
  involved() {
    return Store.all('project').some(p => Scrum.onProject(p));
  },
  /* teams I can create a project for */
  teamOptions() {
    if (App.isSuper() || App.isDir() || App.isAED()) return App.myTeams();
    const own = (Store.member(App.me) || {}).team || 'apps';
    return App.myTeams().filter(t => t.id === own || App.isActing());
  },
  /* who can own a project: anyone active in the teams I create for (directors may also own one themselves) */
  ownerOptions() {
    const ts = new Set(Scrum.teamOptions().map(t => t.id));
    const list = Store.visible().filter(
      m => m.active !== false && ((!Store.topRole(m.role) && ts.has(m.team || 'apps')) || (m.id === App.me && Store.topRole(m.role)))
    );
    if (!(App.isSuper() || App.isDir() || App.isMgr() || App.isActing()))
      return list.filter(m => m.id === App.me).map(m => [m.id, Store.memberName(m.id)]); // a team leader / analyst creates projects they run themselves
    return list
      .sort((a, b) => String(a.team || '').localeCompare(String(b.team || '')) || a.name.localeCompare(b.name))
      .map(m => [
        m.id,
        `${Store.memberName(m.id)} (${Store.topRole(m.role) ? Store.titleOf(m) : Store.teamName(m.team) + ' · ' + Store.titleOf(m)})${Store.delegationOf(m.id) ? ' — on leave, acting: ' + Store.memberShort(Store.delegationOf(m.id).to) : ''}`,
      ]);
  },
  member(p) {
    return !!p && ((p.members || []).includes(App.me) || Scrum.hasTask(p));
  },
  /* can see: on it, plans it, or the project's team is one of mine (read-only for the rest of the team) */
  canSee(p) {
    return (
      !!p &&
      Store.seesProject(p) &&
      (App.isSuper() || Scrum.planner(p) || Scrum.onProject(p) || App.myTeams().some(t => t.id === Scrum.teamOf(p)))
    );
  },
  visible() {
    return Store.all('project').filter(Scrum.canSee);
  },
  /* can I move / complete this item? planners: any; people on the project: their own */
  canWork(it) {
    const p = Scrum.proj(it.project);
    return Scrum.planner(p) || (it.assignee === App.me && Scrum.onProject(p));
  },
  items(pid) {
    return Store.all('ptask').filter(t => t.project === pid);
  },
  sprints(pid) {
    return Store.all('sprint')
      .filter(s => s.project === pid)
      .sort((a, b) => (a.start || '').localeCompare(b.start || '') || (a.n || 0) - (b.n || 0));
  },
  active(pid) {
    return Scrum.sprints(pid).find(s => s.status === 'Active');
  },
  pts(list) {
    return list.reduce((a, t) => a + (+t.points || 0), 0);
  },
  /* progress = done points / all points (falls back to the manual % when the project has no items) */
  progress(p) {
    const it = Scrum.items(p.id).filter(t => t.status !== 'Canceled');
    if (!it.length) return +p.progress || 0;
    const tot = Scrum.pts(it) || it.length;
    const done = Scrum.pts(it.filter(t => Scrum.isDone(t))) || (Scrum.pts(it) ? 0 : it.filter(t => Scrum.isDone(t)).length);
    return Math.round((100 * done) / tot);
  },
  people(p) {
    return (p.members || []).filter(id => Store.member(id));
  },
  teamPeople(p) {
    return Store.visible().filter(m => m.active !== false && !Store.topRole(m.role) && (m.team || 'apps') === Scrum.teamOf(p));
  },
};
