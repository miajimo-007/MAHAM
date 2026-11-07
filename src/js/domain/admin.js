/* MAHAM — Admin helpers (super admin): change log + undo, usage, health tiles, onboarding,
 * offboarding / reassignment, permission templates, technician name matching, clean-up.
 *   adminlog { at, what, target, lines[], before (record before the change, or null), afterTs, undoOf }
 *   usage    { days: { 'YYYY-MM-DD': { n, pages: { page: n } } } }   — one per person (id usage-<person>), last 60 days */
'use strict';

const Admin = {
  UNDO_MIN: 15,
  /* ---------- change log ---------- */
  LOGGED: r => r && ((r.c === 'settings' && !/^settings-meta(-|$)/.test(r.id)) || (r.c === 'userpin' && r.member !== App.me)),
  /* called by Store.saveMany (before the records are stamped) → log records to save with them */
  logFor(list) {
    if (!App.me || App.preview || !Store.isSuper(App.me)) return [];
    const out = [];
    for (const r of list) {
      if (!Admin.LOGGED(r) || r._nolog) continue;
      const before = Store.db.get(r.id) || null;
      const lines = Admin.describe(r, before);
      if (!lines.length) continue;
      out.push({
        rec: r,
        log: {
          id: U.uid('adminlog'),
          c: 'adminlog',
          at: Date.now(),
          target: r.id,
          what: Admin.label(r),
          lines,
          before: before ? Object.assign({}, before) : null,
          undoOf: r._undoOf || '',
          mode: App.mode === 'analyst' ? 'analyst' : 'admin',
        },
      });
    }
    return out;
  },
  label(r) {
    const t = id => Store.teamName(id);
    if (r.c === 'userpin') return 'PIN';
    const m = r.id.match(/^settings-(scoring|lists|meta|scoremonths)-(.+)$/);
    if (m) return { scoring: 'Scoring', lists: 'Lists', meta: 'Meta', scoremonths: 'Score months' }[m[1]] + ' — ' + t(m[2]);
    return (
      {
        'settings-team': 'People',
        'settings-teams': 'Teams',
        'settings-delegations': 'Manager leave',
        'settings-requests': 'Request types',
        'settings-features': 'Organisation levels',
        'settings-permtemplates': 'Permission templates',
        'settings-techignore': 'Technician names',
        'settings-backup': 'Backups',
        'settings-depts': 'Departments',
        'settings-projectlists': 'Project lists',
      }[r.id] || r.id.replace(/^settings-/, '')
    );
  },
  /* human summary of what changed */
  describe(r, before) {
    const b = before || {};
    const L = [];
    const val = v =>
      v === undefined || v === null || v === ''
        ? '—'
        : typeof v === 'boolean'
          ? v
            ? 'yes'
            : 'no'
          : Array.isArray(v)
            ? v.join(', ') || '—'
            : typeof v === 'object'
              ? JSON.stringify(v)
              : String(v);
    if (r.c === 'userpin') return [`PIN ${r.pin ? 'set' : 'removed'} for ${Store.memberName(r.member)}`];
    if (r._del) return ['Deleted'];
    if (r.id === 'settings-team') {
      const old = new Map((b.members || []).map(m => [m.id, m]));
      const neu = new Map((r.members || []).map(m => [m.id, m]));
      const F = [
        ['name', 'Name'],
        ['short', 'Short name'],
        ['me', 'ManageEngine name'],
        ['team', 'Team'],
        ['role', 'Role'],
        ['scored', 'Scored'],
        ['active', 'Active'],
        ['hidden', 'Hidden'],
        ['superAdmin', 'Super admin'],
        ['aliases', 'Other names'],
      ];
      for (const [id, m] of neu) {
        const o = old.get(id);
        const who = m.name || id;
        if (!o) {
          L.push(`Added ${who} (${Store.roleLabel(m.role)}${m.team ? ', ' + Store.teamName(m.team) : ''})`);
          continue;
        }
        for (const [k, l] of F) {
          const a = k === 'active' ? o[k] !== false : o[k],
            c = k === 'active' ? m[k] !== false : m[k];
          if (JSON.stringify(a ?? '') === JSON.stringify(c ?? '')) continue;
          const f = k === 'role' ? Store.roleLabel : k === 'team' ? x => (x ? Store.teamName(x) : '—') : val;
          L.push(`${l} of ${who}: ${f(a)} → ${f(c)}`);
        }
        if (JSON.stringify(o.perms || {}) !== JSON.stringify(m.perms || {})) {
          const ks = [...new Set([...Object.keys(o.perms || {}), ...Object.keys(m.perms || {})])].filter(
            k => (o.perms || {})[k] !== (m.perms || {})[k]
          );
          L.push(
            `Permissions of ${who}: ${ks.map(k => `${Admin.permLabel(k)} ${Store.can(id, k) ? 'on' : 'off'}`).join(', ') || 'back to role defaults'}`
          );
        }
        if (JSON.stringify(o.pages || {}) !== JSON.stringify(m.pages || {})) L.push(`Function access of ${who} changed`);
        if (JSON.stringify(o.teams || []) !== JSON.stringify(m.teams || [])) L.push(`Teams of ${who} changed`);
      }
      for (const [id, o] of old) if (!neu.has(id)) L.push(`Removed ${o.name || id}`);
      return L;
    }
    const keys = [...new Set([...Object.keys(r), ...Object.keys(b)])].filter(k => !k.startsWith('_') && k !== 'id' && k !== 'c');
    for (const k of keys) {
      if (JSON.stringify(r[k] ?? '') === JSON.stringify(b[k] ?? '')) continue;
      if (k === 'scoring' && r[k] && b[k] && r[k].weights && b[k].weights) {
        for (const w of Object.keys(r[k].weights))
          if (r[k].weights[w] !== b[k].weights[w]) L.push(`Weight ${w}: ${b[k].weights[w]}% → ${r[k].weights[w]}%`);
        if (JSON.stringify(Object.assign({}, r[k], { weights: 0 })) !== JSON.stringify(Object.assign({}, b[k], { weights: 0 })))
          L.push('Other scoring rules changed');
        continue;
      }
      if (k === 'teams' && Array.isArray(r[k])) {
        const ob = new Map((b[k] || []).map(t => [t.id, t]));
        for (const t of r[k]) {
          const o = ob.get(t.id);
          if (!o) L.push(`Team added: ${t.name}`);
          else if (o.name !== t.name) L.push(`Team renamed: ${o.name} → ${t.name}`);
          else if (JSON.stringify(o) !== JSON.stringify(t)) L.push(`Function access of team ${t.name} changed`);
        }
        for (const [id, o] of ob) if (!r[k].some(t => t.id === id)) L.push(`Team removed: ${o.name}`);
        continue;
      }
      if (k === 'lists' && r[k] && typeof r[k] === 'object') {
        const ch = Object.keys(Object.assign({}, r[k], b[k] || {})).filter(
          x => JSON.stringify(r[k][x] ?? '') !== JSON.stringify((b[k] || {})[x] ?? '')
        );
        L.push(`Lists changed: ${ch.join(', ')}`);
        continue;
      }
      if (k === 'list' && r.id === 'settings-delegations') {
        L.push(
          ...(r.list || [])
            .filter(d => !(b.list || []).some(x => JSON.stringify(x) === JSON.stringify(d)))
            .map(
              d =>
                `${Store.memberName(d.to)} acts for ${Store.memberName(d.from)} ${U.fmtDate(d.start)}${d.end ? '–' + U.fmtDate(d.end) : ''}`
            )
        );
        if ((b.list || []).length > (r.list || []).length) L.push('A delegation was removed');
        continue;
      }
      L.push(`${k}: ${val(b[k]).slice(0, 60)} → ${val(r[k]).slice(0, 60)}`);
    }
    return L;
  },
  permLabel(k) {
    return ((Store.PERMS || []).find(p => p[0] === k) || [k, k])[1];
  },
  entries() {
    return Store.all('adminlog')
      .slice()
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  },
  /* undo: the latest change of a record, within a few minutes, if nobody changed it since */
  canUndo(e) {
    if (!e || e.undone || !e.target || Date.now() - (e.at || 0) > Admin.UNDO_MIN * 6e4) return false;
    const cur = Store.db.get(e.target);
    if (!cur || cur._ts !== e.afterTs) return false;
    return Admin.entries().find(x => x.target === e.target) === e;
  },
  undo(e) {
    if (!Admin.canUndo(e)) return false;
    const cur = Store.db.get(e.target);
    const back = e.before ? Object.assign({}, e.before, { _undoOf: e.id }) : Object.assign({}, cur, { _del: true, _undoOf: e.id });
    delete back._ts;
    delete back._by;
    Store.saveMany([back, Object.assign({}, e, { undone: true })]);
    return true;
  },

  /* ---------- usage (who opens the app, which pages) ---------- */
  _pend: null,
  _last: 0,
  track(page) {
    if (!App.me || App.preview || !Store.usersDir) return;
    const day = U.todayStr();
    const id = 'usage-' + App.me;
    if (Admin._pend && Admin._pend.id !== id) Admin._pend = null; // someone else was signed in on this PC
    const cur = Admin._pend || Store.get(id) || { id, c: 'usage', days: {} };
    const days = Object.assign({}, cur.days);
    const d = Object.assign({ n: 0, pages: {} }, days[day]);
    d.pages = Object.assign({}, d.pages);
    d.n++;
    d.pages[page] = (d.pages[page] || 0) + 1;
    const now = Date.now();
    if (!d.first) d.first = now;
    d.last = now;
    days[day] = d; // first / last time seen that day (Manager Desk → Team activity)
    const keepFrom = U.addDays(day, -60);
    for (const k of Object.keys(days)) if (k < keepFrom) delete days[k];
    Admin._pend = Object.assign({}, cur, { days });
    const first = !cur.days || !cur.days[day];
    if (first || Date.now() - Admin._last > 5 * 6e4) Admin.flushUsage();
  },
  /* when a person used the app: first and last time today, last day seen, days seen this week (Sun–Sat) */
  seen(id) {
    const u = Store.get('usage-' + id);
    const days = (u && u.days) || {};
    const today = U.todayStr();
    const t = days[today] || null;
    const lastDay = Object.keys(days).sort().pop() || '';
    const dow = new Date().getDay();
    const wk = U.addDays(today, -dow);
    return {
      first: t && t.first,
      last: t ? t.last : (days[lastDay] || {}).last,
      today: !!t,
      lastDay,
      week: Object.keys(days).filter(d => d >= wk).length,
      views: t ? t.n : 0,
    };
  },
  flushUsage() {
    if (!Admin._pend) return;
    const r = Admin._pend;
    Admin._pend = null;
    Admin._last = Date.now();
    Store.save(r);
  },
  usage(since) {
    return Store.members()
      .filter(m => m.active !== false)
      .map(m => {
        const u = Store.get('usage-' + m.id);
        const days = Object.entries((u && u.days) || {}).filter(([d]) => !since || d >= since);
        const pages = {};
        for (const [, d] of days) for (const [p, n] of Object.entries(d.pages || {})) pages[p] = (pages[p] || 0) + n;
        const last =
          Object.keys((u && u.days) || {})
            .sort()
            .pop() || '';
        return { m, days: days.length, views: U.sum(days.map(([, d]) => d.n || 0)), pages, last };
      });
  },

  /* ---------- onboarding: what is still missing for a person ---------- */
  onboarding(m) {
    const file = Store.sources['u:' + m.id + '.json'];
    const steps = [
      ['Added to the app', true],
      ['Team and role set', Store.topRole(m.role) || !!m.team],
      ['Employee ID', !!m.empId],
      ['PIN set', !!Store.pinOf(m.id)],
      ['Opened the app and saved', !!file],
    ];
    /* ManageEngine name: for information only — someone with no tickets yet (or a different spelling, see Unmatched technician names) is still onboarded */
    if (!Store.topRole(m.role) && m.role !== 'manager')
      steps.push([m.me ? 'ManageEngine name: ' + m.me : 'ManageEngine name', !!m.me || Admin.meMatched().has(m.id), true]);
    return steps;
  },
  meMatched() {
    return Calc.memo('meMatched', () => {
      const s = new Set();
      for (const r of Store.all('helpdesk', '*')) {
        const x = r.technician && Store.memberByMeName(r.technician);
        if (x) s.add(x);
      }
      return s;
    });
  },
  notOnboarded() {
    return Store.members()
      .filter(m => m.active !== false)
      .filter(m => Admin.onboarding(m).some(s => !s[1] && !s[2]));
  },

  /* ---------- offboarding: open work of a person ---------- */
  openWork(id) {
    const openMt = r => r.status !== Chain.ST.DONE && r.status !== Chain.ST.X && r.status !== 'Done' && r.status !== 'Canceled';
    return {
      todo: Store.all('todo', '*').filter(r => r.analyst === id && r.status === 'In Progress'),
      mgrtask: Store.all('mgrtask').filter(r => r.manager === id && openMt(r)),
      project: Store.all('project').filter(r => r.manager === id && !['Done', 'Canceled'].includes(r.status)),
      member: Store.all('project').filter(
        r => r.manager !== id && (r.members || []).includes(id) && !['Done', 'Canceled'].includes(r.status)
      ),
      ptask: Store.all('ptask').filter(r => r.assignee === id && !Scrum.isDone(r)),
      mytask: Store.all('mytask').filter(r => r.owner === id && r.status === 'Open'),
    };
  },
  workCount(w) {
    return Object.entries(w)
      .filter(([k]) => k !== 'mytask')
      .reduce((a, [, l]) => a + l.length, 0);
  },
  /* → records that move the open work to the chosen people (to = { todo, mgrtask, project, ptask }) */
  reassign(id, to) {
    const w = Admin.openWork(id);
    const recs = [];
    const team = x => {
      const m = Store.member(x);
      return m ? (Store.topRole(m.role) ? '_top' : m.team || 'apps') : undefined;
    };
    if (to.todo)
      for (const r of w.todo)
        recs.push(Object.assign({}, r, { analyst: to.todo, team: (Store.member(to.todo) || {}).team || r.team, reassignedFrom: id }));
    if (to.mgrtask)
      for (const r of w.mgrtask)
        recs.push(Object.assign({}, r, { manager: to.mgrtask, team: team(to.mgrtask) || r.team, reassignedFrom: id }));
    if (to.project)
      for (const r of w.project)
        recs.push(
          Object.assign({}, r, {
            manager: to.project,
            team: team(to.project) || r.team,
            members: (r.members || [])
              .filter(x => x !== to.project && x !== id)
              .concat(to.ptask && to.ptask !== to.project ? [to.ptask] : []),
            reassignedFrom: id,
          })
        );
    for (const r of w.member)
      recs.push(
        Object.assign({}, r, {
          members: (r.members || [])
            .filter(x => x !== id)
            .concat(to.ptask && !(r.members || []).includes(to.ptask) && r.manager !== to.ptask ? [to.ptask] : []),
        })
      );
    if (to.ptask) for (const r of w.ptask) recs.push(Object.assign({}, r, { assignee: to.ptask }));
    return recs;
  },

  /* ---------- why a person can / cannot use each function, and each permission ---------- */
  explain(id) {
    if (!Store._asAnalyst && (Store.members().find(x => x.id === id) || {}).superAdmin) {
      const r = Store.asAnalyst(id, () => Admin.explain(id));
      for (const x of [...r.pages, ...r.perms]) x.why += ' · analyst mode (Admin mode: everything)';
      return r;
    }
    const m = Store.member(id);
    if (!m) return { pages: [], perms: [] };
    const team = m.team || 'apps';
    const t = Store.teams().find(x => x.id === team) || {};
    const lvl = { edit: 'Edit', view: 'View only', hide: 'Hidden' };
    const pages = Store.PAGES.map(([k, l]) => {
      if (m.superAdmin) return { l, v: 'Edit', why: 'super admin — everything' };
      const own = Store.normLevel((m.pages || {})[k]);
      const tl = Store.normLevel((t.pageLevels || {})[k]) || ((t.hidePages || []).includes(k) ? 'hide' : null);
      const dh = !own && Store.topRole(m.role) && Store.DIR_HIDE.includes(k);
      const v = own || (dh ? 'hide' : tl) || (Store.ADMIN_EDIT.includes(k) ? 'view' : 'edit');
      let why = own
        ? 'personal exception (Admin → person → Functions)'
        : dh
          ? "directors do not get the analysts' daily pages (switch it on in Functions if needed)"
          : tl
            ? `${Store.teamName(team)} team setting (Admin → Teams & departments → Functions)`
            : Store.ADMIN_EDIT.includes(k)
              ? 'default: only the administrator edits it'
              : 'default';
      let out = lvl[v];
      if (v !== 'hide' && ['dashboard', 'performance', 'lazy', 'projperf'].includes(k) && !Store.can(id, 'viewDashboards')) {
        out = 'Hidden';
        why = 'needs the "See team dashboards" permission';
      }
      return { l, v: out, why };
    });
    const perms = Store.PERMS.map(([k, l]) => {
      const on = Store.can(id, k);
      const own = m.perms && typeof m.perms[k] === 'boolean';
      const acting = !own && !Store.can(id, k, 1) && on;
      return {
        l,
        v: on ? 'Yes' : 'No',
        why: m.superAdmin
          ? 'super admin'
          : acting
            ? `acting for ${Store.actingFor(id).map(Store.memberShort).join(', ')} (manager on leave)`
            : own
              ? 'personal setting (Admin → Permissions)'
              : `default for ${Store.roleLabel(m.role)}`,
      };
    });
    return { pages, perms };
  },
  /* ---------- permission templates ---------- */
  templates() {
    return Store.setting('settings-permtemplates', 'list', []);
  },
  applyTemplate(members, ids, tpl) {
    return members.map(m => {
      if (!ids.includes(m.id)) return m;
      const perms = {};
      for (const [k] of Store.PERMS) {
        const v = !!tpl.perms[k];
        if (v !== Store.teamRoleDefault(m, k)) perms[k] = v;
      }
      return Object.assign({}, m, { perms });
    });
  },

  /* ---------- technician names in ManageEngine data ---------- */
  ignoredTech() {
    return Store.setting('settings-techignore', 'names', []);
  },
  unmatched() {
    const ign = new Set(Admin.ignoredTech().map(U.lc));
    const out = new Map();
    for (const r of Store.all('helpdesk', '*')) {
      const x = r.technician;
      if (!x || U.lc(x) === 'not assigned' || ign.has(U.lc(x)) || Store.memberByMeName(x)) continue;
      const o = out.get(x) || { name: x, n: 0, teams: new Set() };
      o.n++;
      o.teams.add(r.team || 'apps');
      out.set(x, o);
    }
    return [...out.values()].sort((a, b) => b.n - a.n);
  },

  /* ---------- clean-up ---------- */
  DUP_KEYS: {
    todo: r => [r.analyst, U.lc(r.task).trim(), r.assigned],
    shadow: r => [r.analyst, r.date, U.lc(r.task || r.description || '').trim(), r.hours],
    quickwin: r => [r.analyst, U.lc(r.subject || '').trim()],
    course: r => [r.analyst, U.lc(r.course || '').trim()],
    central: r => [U.lc(r.subject || r.task || '').trim(), r.date],
  },
  duplicates() {
    const groups = [];
    for (const [c, key] of Object.entries(Admin.DUP_KEYS)) {
      const m = new Map();
      for (const r of Store.all(c, '*')) {
        const k = JSON.stringify(key(r));
        if (k.replace(/[["\],null]/g, '') === '') continue;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(r);
      }
      for (const l of m.values()) if (l.length > 1) groups.push({ c, list: l.sort((a, b) => (b._ts || 0) - (a._ts || 0)) });
    }
    return groups;
  },
  TEST_RX: /\b(test(ing)?|dummy|asdf|qwerty|xxx+|lorem)\b/i,
  testRecords() {
    const what = r => [r.task, r.subject, r.title, r.name, r.course, r.description].filter(Boolean).join(' ');
    return ['todo', 'shadow', 'quickwin', 'mgrtask', 'project', 'ptask', 'request', 'meeting', 'mytask', 'central', 'course', 'info', 'srs']
      .flatMap(c => Store.all(c, '*'))
      .filter(r => Admin.TEST_RX.test(what(r)))
      .map(r => ({ r, what: what(r) }));
  },
  retiredRefs() {
    const gone = Store.members().filter(m => m.active === false);
    return gone.map(m => ({ m, w: Admin.openWork(m.id) })).filter(x => Admin.workCount(x.w));
  },

  /* finished To Dos waiting 3+ days for a manager / team leader to confirm */
  stuckTodos(days) {
    const lim = U.addDays(U.todayStr(), -(days || 3));
    return Store.all('todo', '*').filter(t => t.status === 'Ready for review' && t.finish && t.finish <= lim);
  },
  /* the daily admin checklist */
  checklist() {
    const today = U.todayStr();
    const out = [];
    const quiet = Admin.usage().filter(u => u.m.id !== App.me && (!u.last || u.last < U.addDays(today, -7)));
    out.push({
      ok: !quiet.length,
      label: 'Everyone opened the app in the last 7 days',
      bad: `${quiet.length} not opened for 7+ days: ${quiet
        .slice(0, 8)
        .map(u => (u.m.short || u.m.name) + (u.last ? ' (' + U.fmtDate(u.last) + ')' : ' (never)'))
        .join(', ')}${quiet.length > 8 ? '…' : ''}`,
      href: '#/admin/home',
    });
    const end = U.addDays(today.slice(0, 8) + '01', 40).slice(0, 8) + '01';
    const left = U.diffDays(today, U.addDays(end, -1));
    const pm = U.addDays(today.slice(0, 8) + '01', -1).slice(0, 7);
    const [py, pmo] = pm.split('-').map(Number);
    const unlocked = Store.teams().filter(t => !Store.all('scoresnap', t.id).some(s => +s.year === py && +s.month === pmo));
    out.push({
      ok: !unlocked.length,
      label: `${U.MONTHS[pmo - 1]} is locked for every team`,
      bad: `${U.MONTHS[pmo - 1]} not locked yet: ${unlocked.map(t => t.name).join(', ')}`,
      href: '#/admin/months',
    });
    if (left <= 5)
      out.push({
        ok: false,
        label: '',
        bad: `This month ends in ${left} day(s) — lock ${U.MONTHS[+today.slice(5, 7) - 1]} after the last day`,
        href: '#/admin/months',
        soon: true,
      });
    const copied = Store.setting('settings-backup', 'lastCopy', '');
    const remind = Store.setting('settings-backup', 'remindDays', 30);
    out.push({
      ok: !!copied && U.diffDays(copied, today) <= remind,
      label: `Backup copied elsewhere ${copied ? U.fmtDate(copied) : ''}`,
      bad: copied ? `Backup last copied ${U.diffDays(copied, today)} days ago` : 'Backup never copied elsewhere — download one from Data',
      href: '#/admin/data',
    });
    const open = Store.all('nudge', '*').filter(n => ['update', 'import', 'confirm'].includes(n.kind) && !Dir.answered(n));
    out.push({
      ok: !open.length,
      label: 'No unanswered requests for an update',
      bad: `${open.length} unanswered request(s) for an update: ${[...new Set(open.map(n => Store.memberShort(n.to)))].join(', ')}`,
      href: '#/admin/home',
    });
    return out;
  },

  /* ---------- health tiles for the admin home ---------- */
  health() {
    const today = U.todayStr();
    const act = Store.members().filter(m => m.active !== false);
    const noPin = act.filter(m => !Store.pinOf(m.id));
    const noMgr = Store.teams().filter(t => !Store.teamManager(t.id));
    const oldReq = Store.all('request', '*').filter(
      r => Requests.isPending(r) && (r.created || U.ds(new Date(r._ts || Date.now()))) <= U.addDays(today, -3)
    );
    const un = Admin.unmatched();
    const retired = Admin.retiredRefs();
    const onb = Admin.notOnboarded();
    const pm = U.addDays(today.slice(0, 8) + '01', -1).slice(0, 7);
    const [py, pmo] = pm.split('-').map(Number);
    const unlocked = Store.teams().filter(
      t => Store.all('scoresnap', t.id).length && !Store.all('scoresnap', t.id).some(s => +s.year === py && +s.month === pmo)
    );
    const copied = Store.setting('settings-backup', 'lastCopy', '');
    const remind = Store.setting('settings-backup', 'remindDays', 30);
    return [
      {
        k: 'fb',
        label: 'New feedback',
        n: FB.newCount(),
        href: '#/admin/feedback',
        sub: (() => {
          const b = FB.all().filter(r => r.urgency === 'blocking' && FB.open(r)).length;
          return b ? b + ' blocking' : 'issues and ideas from users';
        })(),
      },
      {
        k: 'problems',
        label: 'System Check problems',
        n: Store.rejected.length + (Store.lastError ? 1 : 0),
        href: '#/syscheck',
        sub: 'ignored changes · save errors',
        bad: true,
      },
      {
        k: 'pin',
        label: 'People with no PIN',
        n: noPin.length,
        href: '#/admin/people',
        sub:
          noPin
            .slice(0, 4)
            .map(m => m.short || m.name)
            .join(', ') + (noPin.length > 4 ? '…' : ''),
        act: noPin.length ? '<button class="btn xs" data-remind="pin">Remind them</button>' : '',
      },
      {
        k: 'mgr',
        label: 'Teams with no manager',
        n: noMgr.length,
        href: '#/admin/people',
        sub: noMgr.map(t => t.name).join(', '),
        bad: true,
      },
      {
        k: 'req',
        label: 'Requests waiting 3+ days',
        n: oldReq.length,
        href: '#/requests/approve',
        sub: 'pending with a manager or director',
      },
      {
        k: 'tech',
        label: 'Unmatched technician names',
        n: un.length,
        href: '#/admin/data',
        sub: un
          .slice(0, 3)
          .map(x => x.name)
          .join(', '),
      },
      {
        k: 'health',
        label: 'Data health problems',
        n: typeof Health !== 'undefined' ? Health.count() : 0,
        href: '#/admin/data',
        sub: 'no owner · impossible dates · deleted links',
      },
      {
        k: 'retired',
        label: 'Open work with retired people',
        n: retired.length,
        href: '#/admin/data',
        sub: retired.map(x => x.m.short || x.m.name).join(', '),
        bad: true,
      },
      {
        k: 'onb',
        label: 'Onboarding not finished',
        n: onb.length,
        href: '#/admin/people',
        sub: onb
          .slice(0, 4)
          .map(m => m.short || m.name)
          .join(', '),
      },
      {
        k: 'lock',
        label: `${U.MONTHS[pmo - 1]} not locked`,
        n: unlocked.length,
        href: '#/admin/months',
        sub: unlocked.map(t => t.name).join(', '),
      },
      {
        k: 'copy',
        label: 'Backup copied elsewhere',
        n: copied ? U.diffDays(copied, today) : '—',
        unit: copied ? 'days ago' : '',
        href: '#/admin/data',
        sub: copied ? 'last copied ' + U.fmtDate(copied) : 'never — download one from Data',
        warn: !copied || U.diffDays(copied, today) > remind,
      },
    ];
  },
};
