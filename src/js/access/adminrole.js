/* MAHAM — The "Admin" role: a person (analyst, team leader, manager…) the super admin gives some admin areas.
 * They stay in their normal mode; an Admin menu shows only their areas. Only the super admin gives or takes the role.
 * Member fields (people list, settings-team — changed only by the super admin):
 *   admin: true, adminAreas: ['scoring', 'workflows', …], adminReach: 'team' (own team) | 'all' (every team)
 * Someone acting for a manager on leave (delegation) has that manager's areas too, for the manager's team, while acting.
 * The trust check (access/trust.js) asks AdminRole.settingOk / peopleOk with the people list as it was at the time,
 * so editing one's own file can never widen what was given. */
'use strict';

const AdminRole = {
  AREAS: [
    ['scoring', 'Scoring', 'Weights, tiers and targets (Projects included) — from now on; past and locked months never change'],
    ['timerules', 'Time rules & holidays', 'When work counts as late, working days, holidays, escalation'],
    ['workflows', 'Workflows', 'To Do workflows and project workflows'],
    [
      'people',
      'People (limited)',
      'Add people, edit names / team / role up to Team Leader, retire, reset PINs — never admins or permissions',
    ],
    ['lists', 'Lists', 'Dropdown lists (task types, modules, wards …)'],
    ['teams', 'Teams & departments', 'Teams, departments, request types — needs “All teams”'],
    ['hdmonths', 'Help desk months', 'Lock or unlock help desk months'],
    ['announcements', 'Announcements', 'Post and manage announcements'],
    ['feedback', 'Feedback', 'Read and answer feedback'],
    ['syscheck', 'System Check (view)', 'See problems and ignored changes'],
    ['activity', 'Activity log (view)', 'See who changed what'],
  ],
  ALL_ONLY: ['teams'],
  PEOPLE_ROLES: ['analyst', 'teamleader'],
  PEOPLE_FIELDS: ['name', 'short', 'me', 'empId', 'team', 'role', 'active', 'scored', 'aliases', 'pin', 'title'],
  /* equal, counting missing / empty list / empty text as the same */
  same(a, b) {
    const n = v => (v == null || v === '' || (Array.isArray(v) && !v.length) ? null : v);
    return JSON.stringify(n(a)) === JSON.stringify(n(b));
  },
  label(a) {
    return (AdminRole.AREAS.find(x => x[0] === a) || [a, a])[1];
  },

  /* ---------- who has what (members / day can be given: the trust check uses the list as it was then) ---------- */
  memberIn(members, id) {
    return (members || Store.members()).find(m => m.id === id) || null;
  },
  own(m) {
    return m && m.admin && !m.superAdmin && Array.isArray(m.adminAreas) && m.adminAreas.length
      ? { areas: m.adminAreas.slice(), reach: m.adminReach === 'all' ? 'all' : 'team', teams: [m.team || 'apps'] }
      : null;
  },
  of(id, members, day) {
    const list = members || Store.members();
    const m = AdminRole.memberIn(list, id);
    if (!m || m.active === false) return null;
    const g = AdminRole.own(m);
    const out = { areas: new Set(g ? g.areas : []), reach: g ? g.reach : 'team', teams: new Set(g ? g.teams : []) };
    // acting for a manager on leave: that manager's areas, for that manager's team
    try {
      const d0 = day || U.todayStr();
      for (const d of Store.delegations ? Store.delegations() : []) {
        if (d.to !== id || !Store.delegationActive(d, d0)) continue;
        const fg = AdminRole.own(AdminRole.memberIn(list, d.from));
        if (!fg) continue;
        fg.areas.forEach(a => out.areas.add(a));
        const fm = AdminRole.memberIn(list, d.from);
        out.teams.add((fm && fm.team) || 'apps');
        if (fg.reach === 'all') out.reach = 'all';
      }
    } catch (e) {
      /* delegations not readable yet */
    }
    return out.areas.size ? out : null;
  },
  any(id) {
    return !!AdminRole.of(id || App.me);
  },
  limited(id) {
    id = id || App.me;
    return !App.realSuper(id) && AdminRole.any(id);
  },
  teamsOf(id) {
    const g = AdminRole.of(id || App.me);
    if (!g) return [];
    return g.reach === 'all' ? Store.teams().map(t => t.id) : [...g.teams];
  },
  /* may this person use an area, for a team ('*' = something that covers every team) */
  can(id, area, team, members, day) {
    const m = AdminRole.memberIn(members, id);
    if (m && m.superAdmin) return true;
    const g = AdminRole.of(id, members, day);
    if (!g || !g.areas.has(area)) return false;
    if (AdminRole.ALL_ONLY.includes(area) && g.reach !== 'all') return false;
    if (!team || g.reach === 'all') return true;
    return team !== '*' && g.teams.has(team);
  },
  /* the Admin areas the current person sees (super admin: all) */
  mine() {
    if (App.realSuper()) return AdminRole.AREAS.map(a => a[0]);
    const g = AdminRole.of(App.me);
    return g ? [...g.areas].filter(a => !AdminRole.ALL_ONLY.includes(a) || g.reach === 'all') : [];
  },

  /* ---------- which area a settings record belongs to: [area, team | '*'] or null (= super admin only) ---------- */
  areaOfSetting(id) {
    const m = String(id || '').match(/^settings-(scoring|timerules|lists)(?:-(.+))?$/);
    if (m) return [m[1] === 'scoring' ? 'scoring' : m[1] === 'timerules' ? 'timerules' : 'lists', m[2] || '*'];
    {
      const t = String(id || '').match(/^settings-task(?:flow|fields)(?:-(.+))?$/);
      if (t) return ['workflows', t[1] || '*'];
    }
    if (id === 'settings-fuflow') return ['workflows', '*'];
    if (id === 'settings-holidays') return ['timerules', '*'];
    if (id === 'settings-projectlists') return ['lists', '*'];
    if (['settings-teams', 'settings-depts', 'settings-requests', 'settings-userdepts'].includes(id)) return ['teams', '*'];
    if (id === 'settings-workflows' || id === 'settings-todoflows') return ['workflows', 'flows'];
    if (id === 'settings-custom') return ['hdmonths', 'custom'];
    return null;
  },
  /* a settings version written by a non-super-admin: allowed by their Admin areas at that time? (prev = version before it) */
  settingOk(r, prev, by, members, day) {
    if (!r || r._del) return false;
    const a = AdminRole.areaOfSetting(r.id);
    if (!a) return false;
    const [area, team] = a;
    if (team === 'flows') return AdminRole.flowsOk(r, prev, by, members, day);
    if (team === 'custom') return AdminRole.customOk(r, prev, by, members, day);
    return AdminRole.can(by, area, team, members, day);
  },
  /* workflows: one record for every team — with "own team" only entries of that team may change; the To Do types list needs "All teams" */
  flowsOk(r, prev, by, members, day) {
    if (!AdminRole.can(by, 'workflows', null, members, day)) return false;
    const g = AdminRole.of(by, members, day);
    if (g.reach === 'all') return true;
    const p = prev || {};
    const keys = new Set([...Object.keys(r), ...Object.keys(p)].filter(k => !k.startsWith('_') && k !== 'id' && k !== 'c' && k !== 'list'));
    for (const k of keys) if (AdminRole.same(r[k], p[k]) === false) return false;
    const was = new Map((p.list || []).map(w => [w.id, w]));
    const now = new Map((r.list || []).map(w => [w.id, w]));
    for (const id of new Set([...was.keys(), ...now.keys()])) {
      const a = was.get(id),
        b = now.get(id);
      if (JSON.stringify(a || null) === JSON.stringify(b || null)) continue;
      if ((a && !g.teams.has(a.team)) || (b && !g.teams.has(b.team))) return false; // "every team" ('') counts as another team
    }
    return true;
  },
  /* settings-custom holds many things; an Admin with Help desk months may change only the help desk month locks */
  customOk(r, prev, by, members, day) {
    if (!AdminRole.can(by, 'hdmonths', '*', members, day) && !AdminRole.can(by, 'hdmonths', null, members, day)) return false;
    const p = prev || {};
    const keys = new Set([...Object.keys(r), ...Object.keys(p)].filter(k => !k.startsWith('_') && k !== 'id' && k !== 'c'));
    for (const k of keys) if (!['hdUnlocked', 'hdOpen', 'hdLocked'].includes(k) && !AdminRole.same(r[k], p[k])) return false;
    return true;
  },
  /* a people-list version written by an Admin with "People": only plain people of their teams, only plain fields */
  peopleOk(prevList, nextList, by, day) {
    if (!AdminRole.can(by, 'people', null, prevList, day)) return false;
    const g = AdminRole.of(by, prevList, day);
    const inReach = t => g.reach === 'all' || g.teams.has(t || 'apps');
    const plain = m =>
      m && !m.superAdmin && !m.admin && !(m.adminAreas || []).length && AdminRole.PEOPLE_ROLES.includes(m.role || 'analyst');
    const was = new Map((prevList || []).map(m => [m.id, m]));
    const now = new Map((nextList || []).map(m => [m.id, m]));
    for (const id of was.keys()) if (!now.has(id)) return false; // nobody is removed (retire instead)
    for (const [id, b] of now) {
      const a = was.get(id);
      if (JSON.stringify(a || null) === JSON.stringify(b)) continue;
      if (id === by && a) {
        const x = Object.assign({}, a),
          y = Object.assign({}, b);
        delete x.pin;
        delete y.pin;
        if (JSON.stringify(x) === JSON.stringify(y)) continue;
      } // own PIN
      if (!plain(b) || !inReach(b.team)) return false;
      if (!a) {
        if (b.perms || b.pages || b.dirTeams || b.hidden) return false;
        continue;
      } // a new plain person in my team
      if (!plain(a) || !inReach(a.team)) return false;
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
        if (!AdminRole.PEOPLE_FIELDS.includes(k) && JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) return false;
    }
    return true;
  },
  /* resetting someone's PIN (userpin record) */
  pinOk(r, by, members, day) {
    const t = AdminRole.memberIn(members, r.member);
    return !!t && !t.superAdmin && !t.admin && AdminRole.can(by, 'people', t.team || 'apps', members, day);
  },

  /* ---------- templates (super admin): settings-admintemplates { list: [{ id, name, areas, reach }] } ---------- */
  templates() {
    return Store.setting('settings-admintemplates', 'list', []) || [];
  },
};
