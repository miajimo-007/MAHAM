/* MAHAM — Who may do what. Single place for authorisation rules:
 *  - roles give default permissions (roleDefault); the super admin may override per person (perms)
 *  - each function (page) has a level per team and per person: edit / view / hide
 *  - settings (roles, permissions, lists, scoring) are changed only by the super admin */
'use strict';

Object.assign(Store, {
  /* authority (roles, permissions, functions, teams, lists, scoring) = super admin only.
     Others may only: record the help-desk import date, lock scores (with permission), and change their OWN PIN. */
  /* announcements: only the super admin posts; a read receipt only for yourself */
  announceAllowed(r) {
    if (r.c === 'announcement')
      return Store.isSuper(App.me) || Store.can(App.me, 'postAnnouncements') || AdminRole.can(App.me, 'announcements');
    if (r.c === 'annread') return String(r.id || '').startsWith('annread-' + App.me + '-');
    if (r.c === 'nudge') return r.from === App.me;
    if (r.c === 'adminlog') return Store.isSuper(App.me) || AdminRole.any(App.me);
    if (r.c === 'usage') return r.id === 'usage-' + App.me;
    if (r.c === 'actlog') return String(r.id || '').startsWith('actlog-' + App.me + '-');
    if (r.c === 'userpin')
      return (
        Store.isSuper(App.me) || r.id === 'userpin-' + App.me || (r.id === 'userpin-' + r.member && !r.pin && AdminRole.pinOk(r, App.me))
      );
    return true;
  },
  /* requests: people raise their own; only the right approver may move a request to the next status */
  requestAllowed(r) {
    if (r.c !== 'request' || Store.isSuper(App.me)) return true;
    const prev = r.id && Store.db.get(r.id);
    if (!prev || prev._del) return r.requester === App.me && Requests.isPending(r) && Requests.canRaise();
    if (prev.requester === App.me && r.status === Requests.ST.X && Requests.isPending(prev)) return true;
    if (prev.requester === App.me && r.status === Requests.ST.CR && Requests.isDone(prev)) return true; // asking to cancel approved leave
    if (Requests.canCancelLeave(prev) && (r.status === Requests.ST.X || (prev.status === Requests.ST.CR && Requests.isDone(r))))
      return true; // approver cancels it / keeps it
    return Requests.canDecide(prev) && r.requester === prev.requester && r.type === prev.type && r.from === prev.from && r.to === prev.to;
  },
  /* a NEW record of a type with a canCreate rule (e.g. projects) needs that rule to pass */
  createAllowed(r) {
    const S = typeof Schemas !== 'undefined' && Schemas[r.c];
    if (!S || !S.canCreate || r._del || (r.id && Store.db.get(r.id))) return true;
    return !!S.canCreate();
  },
  settingAllowed(r) {
    if (r.c !== 'settings' || Store.isSuper(App.me)) return true;
    if (/^settings-meta(-|$)/.test(r.id)) return true;
    if (r.id === 'settings-team' && AdminRole.peopleOk(Store.members(), r.members, App.me)) return true;
    if (r.id !== 'settings-team' && AdminRole.settingOk(r, Store.get(r.id), App.me)) return true;
    if (r.id === 'settings-team') {
      const strip = (list, keepPinFor) =>
        JSON.stringify(
          (list || []).map(m => {
            const x = Object.assign({}, m);
            if (x.id === keepPinFor) delete x.pin;
            return x;
          })
        );
      return strip(r.members, App.me) === strip(Store.members(), App.me); // only my own PIN changed
    }
    return false;
  },
  DIR_HIDE: ['todo', 'shadow', 'helpdesk', 'attendance'],
  normLevel(v) {
    return v === true ? 'edit' : v === false ? 'hide' : ['hide', 'view', 'edit'].includes(v) ? v : null;
  },
  teamLevel(teamId, k) {
    const t = Store.teams().find(x => x.id === teamId);
    if (!t) return (Config.DEFAULT_HIDDEN || []).includes(k) ? 'hide' : 'edit';
    const l = Store.normLevel((t.pageLevels || {})[k]);
    if (l) return l;
    return (t.hidePages || []).includes(k)
      ? 'hide'
      : (Config.DEFAULT_HIDDEN || []).includes(k)
        ? 'hide'
        : Store.ADMIN_EDIT.includes(k)
          ? 'view'
          : 'edit';
  },
  pageLevel(id, k, team) {
    const m = Store.member(id);
    if (!m) return 'edit';
    if (m.superAdmin) return 'edit';
    const own = Store.normLevel((m.pages || {})[k]);
    if (own) return own;
    return Store.teamLevel(team || m.team || 'apps', k);
  },
  pageOn(id, k, team) {
    return Store.pageLevel(id, k, team) !== 'hide';
  },
  /* directors don't get the analysts' daily pages in their menu (a personal Functions setting can switch one back on);
   * they can still change those records where their work flows down (e.g. a director task's To Dos) */
  dirHidden(id, k) {
    const m = Store.member(id);
    return !!m && !m.superAdmin && Store.topRole(m.role) && Store.DIR_HIDE.includes(k) && !Store.normLevel((m.pages || {})[k]);
  },
  canEditColl(id, c, team) {
    const k = Store.COLL_PAGE[c];
    return !k || Store.pageLevel(id, k, team) === 'edit';
  }, // only the super admin may change these for a person
  /* powers nobody has until the administrator gives them (per person, or per team and role in Admin → Team rules) */
  ADMIN_GIVEN: ['editHelpdeskByHand', 'postAnnouncements', 'useLab'],
  roleDefault(role, key) {
    if (Store.ADMIN_GIVEN.includes(key)) return false;
    if (role === 'director' || role === 'aed') return true;
    if (key === 'seeNames') return true;
    if (key === 'assignToManagers') return false; // director / AED only (handled above)
    if (role === 'manager') return true;
    if (role === 'teamleader')
      return ['viewDashboards', 'viewOthers', 'export', 'importME', 'editAttendanceOthers', 'createProjects'].includes(key); // not approveRequests: manager + director only, unless granted
    return ['viewDashboards', 'viewOthers', 'export'].includes(key);
  },
  roleLabel(r) {
    return { analyst: 'Analyst', teamleader: 'Team Leader', manager: 'Manager', director: 'Director', aed: 'AED' }[r || 'analyst'] || r;
  },
  /* AED / extra directors can be switched off until needed */
  orgLevels() {
    return true;
  }, // AED and directors are always available; departments decide who runs what
  rolesFor(current) {
    const on = Store.orgLevels();
    return Store.ROLES.filter(([v]) => v === current || on || (v !== 'aed' && v !== 'director'));
  },
  topRole(r) {
    return r === 'director' || r === 'aed';
  },
  isAED(id) {
    const m = Store.member(id);
    return !!(m && m.role === 'aed');
  },
  /* teams a person may look at */
  teamsFor(id) {
    const m = Store.member(id);
    const all = Store.teams();
    if (!m) return [];
    if (m.superAdmin || m.role === 'aed') return all;
    if (m.role === 'director') {
      const ids = new Set(Store.deptsOf(id).flatMap(d => d.teams));
      return all.filter(t => ids.has(t.id));
    } // every team of their department (task lists show only the tasks they gave)
    const own = m.team || 'apps';
    const acting = new Set(Store.actingFor(id).map(mid => (Store.member(mid) || {}).team || 'apps'));
    return all.filter(t => t.id === own || acting.has(t.id));
  },
  isSuper(id) {
    const m = Store.member(id);
    return !!(m && m.superAdmin);
  },
  can(id, key, _depth) {
    const m = Store.member(id);
    if (!m) return false;
    if (m.superAdmin) return true; // only the super admin is unrestricted; directors follow their permissions
    if (Config.SUPER_ADMIN_ONLY.includes(key)) return false; // e.g. importing old data
    // acting for a manager on leave: also has that manager's permissions (never director-level ones)
    if (!_depth && key !== 'assignToManagers' && Store.actingFor(id).some(mid => Store.can(mid, key, 1))) return true;
    if (m.perms && typeof m.perms[key] === 'boolean') return m.perms[key];
    return Store.teamRoleDefault(m, key);
  },
  /* the default for a person's role in their team: Admin → Team rules, else the app's built-in role default */
  teamRoleDefault(m, key) {
    if (!m) return false;
    const role = m.role || 'analyst';
    if (!Store.topRole(role)) {
      const t = Store.teams().find(x => x.id === (m.team || 'apps'));
      const v = t && t.roleDefaults && t.roleDefaults[role] && t.roleDefaults[role][key];
      if (typeof v === 'boolean') return v;
    }
    return Store.roleDefault(role, key);
  },
  /* ---- manager leave: delegations (set by the super admin only; stored in settings-delegations) ---- */
  delegations() {
    return Store.setting('settings-delegations', 'list', []);
  },
  delegationActive(d, day) {
    const t = day || U.todayStr();
    return !!(d && d.from && d.to && (!d.start || d.start <= t) && (!d.end || t <= d.end));
  },
  /* managers this person is acting for today */
  actingFor(id, day) {
    return Store.delegations()
      .filter(d => d.to === id && Store.delegationActive(d, day))
      .map(d => d.from)
      .filter(mid => Store.member(mid));
  },
  /* today's delegation of a manager (who covers for them), if any */
  delegationOf(mid, day) {
    return Store.delegations().find(d => d.from === mid && Store.delegationActive(d, day)) || null;
  },
  isDirector(id) {
    const m = Store.member(id);
    return !!(m && Store.topRole(m.role));
  },
  isManager(id) {
    const m = Store.member(id);
    return !!(m && (m.role === 'manager' || Store.topRole(m.role)));
  },
});
