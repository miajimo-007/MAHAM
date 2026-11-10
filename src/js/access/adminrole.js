/* MAHAM — The "Admin" role: a person (analyst, team leader, manager…) the super admin gives some admin areas.
 * They stay in their normal mode; an Admin menu shows only their areas. Only the super admin gives or takes the role.
 * Member fields (people list, settings-team — changed only by the super admin):
 *   admin: true, adminV: 2, adminAreas: ['people', 'task-workflows', …], adminLevels: { area: 'view' } (missing = edit),
 *   adminReach: 'team' (own team) | 'teams' (adminTeams: the chosen teams) | 'all' (every team)
 * Older entries (no adminV) used broader areas (workflows, scoring, hdmonths, lists, people, activity, timerules): they are
 * read as the new areas below (MIGRATE), all at edit level, same reach — the people list itself is not rewritten.
 * One area per Admin section (pages/admin-nav.js shows where each one lives). Super admin only: roles & access, team rules,
 * giving Admin roles, import / restore, undo, fixing in System Check, the minimum app version, folder paths.
 * Someone acting for a manager on leave (delegation) has that manager's areas too, for the manager's team, while acting.
 * The trust check (access/trust.js) asks AdminRole.settingOk / peopleOk with the people list as it was at the time,
 * so editing one's own file can never widen what was given. */
'use strict';

const AdminRole = {
  /* [key, label, what it covers, main tab, sub-tab] */
  AREAS: [
    [
      'people',
      'People',
      'Add people, edit names / team / role up to Team Leader, retire, reset PINs — never admins or permissions',
      'people',
      'people',
    ],
    ['acting-leave', 'Acting & leave', 'Who acts for a manager on leave', 'people', 'people'],
    ['teams', 'Teams & departments', 'Teams, departments, request types, team function access — needs “All teams”', 'people', 'teams'],
    ['todo-workflows', 'To Do workflows', 'To Do workflows and To Do types', 'work', 'todo'],
    ['project-stages', 'Project stages', 'Project workflows (stages), project lists and categories', 'work', 'projects'],
    ['task-sets', 'Task sets', 'Ready-made sets of project tasks', 'work', 'projects'],
    ['task-workflows', 'Task workflows', 'Project task workflows, the scheme per type and project, resolutions', 'work', 'tasks'],
    ['workitem-fields', 'Work item fields', 'Custom fields on project tasks', 'work', 'tasks'],
    ['automation', 'Automation', 'Automation rules for project tasks', 'work', 'tasks'],
    ['followups', 'Follow-ups', 'Follow-up parties, workflows and fields — needs “All teams” to change', 'work', 'followups'],
    ['timerules', 'Time rules', 'When work counts as late, working days, escalation', 'work', 'time'],
    ['holidays', 'Holidays', 'Public holidays and Ramadan — needs “All teams”', 'work', 'time'],
    [
      'scoring-rules',
      'Scoring rules',
      'Weights, parts, tiers, targets, project score — from now on; past and locked months never change',
      'scoring',
      'rules',
    ],
    ['score-months', 'Score months', 'Month locks, help desk months, months not counted', 'scoring', 'months'],
    ['adjustments', 'Adjustments', 'Bonus / penalty points and ratings', 'scoring', 'adjust'],
    ['lists', 'Lists', 'Dropdown lists (task types, modules, wards …) and user departments', 'settings', 'lists'],
    ['look', 'Look & home pages', 'Name, logo, colours, menu, words, targets, start pages (Customize)', 'settings', 'look'],
    ['announcements', 'Announcements', 'Post and manage announcements', 'settings', 'announcements'],
    ['data', 'Data (export)', 'Export everything to Excel', 'system', 'data'],
    ['syscheck', 'System Check (view)', 'See problems, ignored changes and duplicates', 'system', 'check'],
    ['logs', 'Logs (view)', 'Change log, activity log, usage', 'system', 'logs'],
    ['feedback', 'Feedback', 'Read and answer feedback', 'system', 'feedback'],
  ],
  ALL_ONLY: ['teams', 'holidays'],
  VIEW_ONLY: ['data', 'syscheck', 'logs'], // these areas have nothing to save: always "view"
  /* older areas → the new ones (all at edit level, same reach) */
  MIGRATE: {
    workflows: ['todo-workflows', 'project-stages', 'task-workflows', 'workitem-fields', 'automation', 'followups'],
    scoring: ['scoring-rules', 'adjustments'],
    hdmonths: ['score-months'],
    lists: ['lists', 'task-sets'],
    people: ['people', 'acting-leave'],
    activity: ['logs'],
    timerules: ['timerules', 'holidays'],
  },
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
  isArea(a) {
    return AdminRole.AREAS.some(x => x[0] === a);
  },

  /* ---------- who has what (members / day can be given: the trust check uses the list as it was then) ---------- */
  memberIn(members, id) {
    return (members || Store.members()).find(m => m.id === id) || null;
  },
  /* a member's (or a template's) areas as { area → 'view' | 'edit' }, older entries translated */
  areasOf(x) {
    const out = new Map();
    if (!x || !Array.isArray(x.adminAreas || x.areas)) return out;
    const list = x.adminAreas || x.areas;
    const lv = x.adminLevels || x.levels || {};
    const v2 = x.adminV >= 2 || x.v >= 2;
    for (const a of list)
      for (const b of v2 ? [a] : AdminRole.MIGRATE[a] || [a]) {
        if (!AdminRole.isArea(b)) continue;
        out.set(b, AdminRole.VIEW_ONLY.includes(b) || (v2 && lv[b] === 'view') ? 'view' : 'edit'); // older entries: everything at edit level
      }
    return out;
  },
  reachOf(x) {
    const r = x.adminReach || x.reach;
    return r === 'all' ? 'all' : r === 'teams' ? 'teams' : 'team';
  },
  own(m) {
    if (!m || !m.admin || m.superAdmin) return null;
    const areas = AdminRole.areasOf(m);
    if (!areas.size) return null;
    const reach = AdminRole.reachOf(m);
    const teams = reach === 'teams' ? (m.adminTeams || []).filter(Boolean) : [m.team || 'apps'];
    return { areas, reach, teams: teams.length ? teams : [m.team || 'apps'] };
  },
  of(id, members, day) {
    const list = members || Store.members();
    const m = AdminRole.memberIn(list, id);
    if (!m || m.active === false) return null;
    const g = AdminRole.own(m);
    const out = { areas: new Map(g ? g.areas : []), reach: g ? g.reach : 'team', teams: new Set(g ? g.teams : []) };
    // acting for a manager on leave: that manager's areas, for that manager's team
    try {
      const d0 = day || U.todayStr();
      for (const d of Store.delegations ? Store.delegations() : []) {
        if (d.to !== id || !Store.delegationActive(d, d0)) continue;
        const fm = AdminRole.memberIn(list, d.from);
        const fg = AdminRole.own(fm);
        if (!fg) continue;
        fg.areas.forEach((lv, a) => {
          if (out.areas.get(a) !== 'edit') out.areas.set(a, lv);
        });
        fg.teams.forEach(t => out.teams.add(t));
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
  /* may this person use an area, for a team ('*' = something that covers every team); need 'edit' (default) or 'view' */
  can(id, area, team, members, day, need) {
    const m = AdminRole.memberIn(members, id);
    if (members ? m && m.superAdmin : Store.isSuper(id)) return true; // on screen: Store.isSuper knows analyst mode
    if (!members && m && m.superAdmin) return false; // the super admin in analyst mode: no Admin areas either
    const g = AdminRole.of(id, members, day);
    if (!g) return false;
    const lv = g.areas.get(area);
    if (!lv) return false;
    if ((need || 'edit') === 'edit' && lv !== 'edit') return false;
    if (AdminRole.ALL_ONLY.includes(area) && g.reach !== 'all') return false;
    if (!team || g.reach === 'all') return true;
    return team !== '*' && g.teams.has(team);
  },
  sees(area, id) {
    return AdminRole.can(id || App.me, area, null, null, null, 'view');
  },
  edits(area, team, id) {
    return AdminRole.can(id || App.me, area, team || null);
  },
  level(area, id) {
    if (App.realSuper(id)) return 'edit';
    const g = AdminRole.of(id || App.me);
    const lv = g && g.areas.get(area);
    if (!lv) return '';
    return AdminRole.ALL_ONLY.includes(area) && g.reach !== 'all' ? '' : lv;
  },
  /* the Admin areas the current person sees (super admin: all) */
  mine() {
    if (App.realSuper()) return AdminRole.AREAS.map(a => a[0]);
    return AdminRole.AREAS.map(a => a[0]).filter(a => AdminRole.level(a));
  },

  /* ---------- what a settings change needs: [area, team | '*' | null] per changed part, or 'super' ---------- */
  KEYS_SKIP: ['id', 'c', '_ts', '_by', '_v', '_del', '_nolog', '_undoOf'],
  changed(r, prev) {
    const p = prev || {};
    return [...new Set([...Object.keys(r || {}), ...Object.keys(p)])].filter(
      k => !AdminRole.KEYS_SKIP.includes(k) && !AdminRole.same((r || {})[k], p[k])
    );
  },
  LOOK_FEATURES: ['appName', 'logo', 'tagline'],
  PROJECT_LISTS: ['projectCategories', 'ptaskTypes', 'boardColumns'],
  needs(r, prev) {
    const id = String(r.id || '');
    const keys = AdminRole.changed(r, prev);
    let m;
    const one = (area, team) => [[area, team]];
    if ((m = id.match(/^settings-scoring(?:-(.+))?$/))) return one('scoring-rules', m[1] || '*');
    if ((m = id.match(/^settings-timerules(?:-(.+))?$/))) return one('timerules', m[1] || '*');
    if ((m = id.match(/^settings-lists(?:-(.+))?$/))) {
      // project categories, task types and board columns: Projects (project-stages); the rest: Lists
      const a = r.lists || {},
        b =
          (prev && prev.lists) ||
          (prev
            ? {}
            : (() => {
                try {
                  return Store.lists(m[1]);
                } catch (e) {
                  return {};
                }
              })());
      const inner = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => !AdminRole.same(a[k], b[k]));
      const proj = inner.filter(k => AdminRole.PROJECT_LISTS.includes(k)),
        rest = inner.filter(k => !AdminRole.PROJECT_LISTS.includes(k));
      const out = [];
      if (proj.length) out.push(['project-stages', m[1] || '*']);
      if (rest.length || !proj.length || keys.some(k => k !== 'lists')) out.push(['lists', m[1] || '*']);
      return out;
    }
    if ((m = id.match(/^settings-scoremonths-(.+)$/))) return one('score-months', m[1]);
    if (id === 'settings-taskfields-fu') return one('followups', '*');
    if ((m = id.match(/^settings-taskfields(?:-(.+))?$/))) return one('workitem-fields', m[1] || '*');
    if ((m = id.match(/^settings-taskflow-(.+)$/)))
      return (keys.length ? keys : ['flows']).map(k => [k === 'autos' ? 'automation' : 'task-workflows', m[1]]);
    if (id === 'settings-taskflow') return one('task-workflows', '*');
    if (id === 'settings-fuflow') return one('followups', '*');
    if (id === 'settings-holidays') return one('holidays', '*');
    if (id === 'settings-projectlists') return one('project-stages', '*');
    if (['settings-depts', 'settings-requests'].includes(id)) return one('teams', '*');
    if (id === 'settings-userdepts') return one('lists', '*');
    if (id === 'settings-teams') {
      // names and function access: Teams & departments; team rules (role defaults, targets): super admin
      const was = new Map(((prev || {}).teams || []).map(t => [t.id, t]));
      const now = new Map((r.teams || []).map(t => [t.id, t]));
      for (const tid of new Set([...was.keys(), ...now.keys()])) {
        const a = was.get(tid) || {},
          b = now.get(tid) || {};
        for (const k of ['roleDefaults', 'targets']) if (!AdminRole.same(a[k], b[k])) return 'super';
      }
      return keys.every(k => k === 'teams') ? one('teams', '*') : 'super';
    }
    if (id === 'settings-workflows') return [['project-stages', 'flows']];
    if (id === 'settings-todoflows') return [['todo-workflows', 'flows']];
    if (id === 'settings-custom')
      return keys.map(k => (['hdUnlocked', 'hdOpen', 'hdLocked'].includes(k) ? ['score-months', null] : ['look', null]));
    if (id === 'settings-about') return one('look', null);
    if (id === 'settings-features') return keys.every(k => AdminRole.LOOK_FEATURES.includes(k)) ? keys.map(() => ['look', null]) : 'super';
    if (id === 'settings-delegations') {
      // each changed leave entry: the manager on leave must be in the Admin's teams
      const key = d => JSON.stringify([d.from, d.to, d.start, d.end, d.note || '']);
      const was = new Set(((prev || {}).list || []).map(key));
      const now = new Set((r.list || []).map(key));
      const ch = [...((prev || {}).list || []).filter(d => !now.has(key(d))), ...(r.list || []).filter(d => !was.has(key(d)))];
      return (ch.length ? ch : [{}]).map(d => {
        const fm = d.from && AdminRole.memberIn(null, d.from);
        return ['acting-leave', fm ? (Store.topRole(fm.role) ? '*' : fm.team || 'apps') : '*'];
      });
    }
    return 'super'; // permission templates, Admin templates, backups, ignored names, minimum version, paths …
  },
  /* which area a settings record belongs to (the first one) — null = super admin only */
  areaOfSetting(id, r, prev) {
    const n = AdminRole.needs(Object.assign({ id }, r || {}), prev);
    return n === 'super' ? null : n[0];
  },
  /* a settings version written by a non-super-admin: allowed by their Admin areas, levels and teams at that time? */
  settingOk(r, prev, by, members, day) {
    if (!r || r._del) return false;
    const n = AdminRole.needs(r, prev);
    if (n === 'super') return false;
    return n.every(([area, team]) =>
      team === 'flows' ? AdminRole.flowsOk(area, r, prev, by, members, day) : AdminRole.can(by, area, team, members, day)
    );
  },
  /* workflows (project stages / To Do workflows): one record for every team — with "own team" or "chosen teams" only
     entries of those teams may change; anything else in the record (e.g. the To Do types) needs "All teams" */
  flowsOk(area, r, prev, by, members, day) {
    if (!AdminRole.can(by, area, null, members, day)) return false;
    const g = AdminRole.of(by, members, day);
    if (!g || g.reach === 'all') return true;
    const p = prev || {};
    const keys = new Set([...Object.keys(r), ...Object.keys(p)].filter(k => !AdminRole.KEYS_SKIP.includes(k) && k !== 'list'));
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

  /* ---------- templates (super admin): settings-admintemplates { list: [{ id, name, v: 2, areas, levels, reach }] } ---------- */
  templates() {
    return Store.setting('settings-admintemplates', 'list', []) || [];
  },
};
