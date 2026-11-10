/* MAHAM — Admin: 6 main tabs with sub-tabs (#/admin/<tab>/<sub>). Every screen is an existing one, moved here.
 *   Home · People · Work & workflows · Scoring · Settings · System
 * Each sub-tab is made of parts; each part (and, inside a shared page, each card) belongs to an Admin area
 * (access/adminrole.js). The super admin sees everything. An Admin sees only the tabs, sub-tabs, cards and search
 * results of their areas, only for their teams; at "view" level the screens are read-only (no save buttons) —
 * and the trust check rejects such changes anyway. Old links (#/admin/lists, #/admin/taskflows …) still work.
 * Other files add a sub-tab with AdminNav.addSub(tab, sub) (e.g. the hosted copy's Company & accounts). */
'use strict';

const AdminNav = {
  /* a part: { title, area (null = super admin only), areas (any of them shows the part), render() → { html, mount },
     cards: [[selector or card title, area, { all: true } (needs "All teams" to change)]], drop: [cards removed for everyone],
     keep: [only these cards stay], all: true (the whole part needs "All teams" to change) } */
  TABS: [
    { key: 'home', label: 'Home', subs: [{ key: 'home', label: 'Home', parts: [] }] },
    {
      key: 'people',
      label: 'People',
      subs: [
        {
          key: 'people',
          label: 'People',
          find: [
            'Add person',
            'Bulk edit people',
            'Bulk add people',
            'Onboarding checklist',
            'Reset a PIN',
            'Manager leave / delegation',
            'Acting manager',
          ],
          parts: [
            {
              title: 'People',
              area: 'people',
              render: () => (App.realSuper() ? AdminUI.withRoleButtons(adminPeople()) : AdminUI.peopleLite()),
            },
            { title: 'Manager leave & delegation', area: 'acting-leave', render: () => adminLeave() },
          ],
        },
        {
          key: 'access',
          label: 'Roles & access',
          find: [
            'Permission matrix',
            'Permission templates',
            'Who can post announcements',
            'Add help desk requests by hand',
            'Team rules — what each role can do per team',
            'Team targets',
            'Admin role — give someone some admin areas',
            'Admin templates',
          ],
          parts: [
            { title: 'Permissions', area: null, render: () => adminPerms() },
            { title: 'Team rules', area: null, render: () => adminTeamRules() },
            { title: 'Admin roles', area: null, render: () => AdminUI.rolesCard() },
          ],
        },
        {
          key: 'teams',
          label: 'Teams & departments',
          find: ['Teams', 'Departments', 'Request types', 'Team function access'],
          parts: [{ title: 'Teams & departments', area: 'teams', render: () => adminTeams(), drop: ['#savehol', '#mvsave', '#savesp'] }],
        },
      ],
    },
    {
      key: 'work',
      label: 'Work & workflows',
      subs: [
        {
          key: 'todo',
          label: 'To Do',
          find: ['To Do workflows', 'To Do types', 'Hand-on chains'],
          parts: [{ title: 'To Do workflows', area: 'todo-workflows', render: () => adminTodoFlows() }],
        },
        {
          key: 'projects',
          label: 'Projects',
          find: ['Project stages (project workflows)', 'Project categories', 'Project task types', 'Project board columns', 'Task sets'],
          parts: [
            { title: 'Project stages', area: 'project-stages', render: () => adminFlows() },
            { title: 'Project lists & categories', area: 'project-stages', render: () => AdminNav.lists(true), only: () => !WF.draft },
            {
              title: 'Task sets',
              area: 'task-sets',
              render: () => ({ html: TaskSets.card(), mount: root => TaskSets.bindCard(root) }),
              only: () => !WF.draft,
            },
          ],
        },
        {
          key: 'tasks',
          label: 'Project tasks',
          find: [
            'Task workflows — statuses, moves, resolutions',
            'Workflow per task type',
            'Projects with their own workflow',
            'Work item fields',
            'Automation rules',
            'Resolutions',
          ],
          parts: [
            {
              title: 'Project tasks',
              area: 'task-workflows',
              areas: ['task-workflows', 'workitem-fields', 'automation'],
              render: () => {
                if (TFE.scope === 'fu') TFE.scope = null;
                return TaskFlowAdmin.page();
              },
              cards: [
                ['#cfsave', 'workitem-fields'],
                ['#ausave', 'automation'],
                ['#tfressave', 'task-workflows', { all: true }],
              ],
            },
          ],
        },
        {
          key: 'followups',
          label: 'Follow-ups',
          find: ['Follow-up parties (vendors)', 'Follow-up workflows', 'Follow-up fields'],
          parts: [
            {
              title: 'Follow-ups',
              area: 'followups',
              all: true,
              render: () => {
                TFE.scope = 'fu';
                return TaskFlowAdmin.page();
              },
            },
          ],
        },
        {
          key: 'time',
          label: 'Time rules',
          find: ['Time rules — when work is late, working days, escalation', 'Public holidays', 'Ramadan hours'],
          parts: [
            {
              title: 'Time rules',
              area: 'timerules',
              areas: ['timerules', 'holidays'],
              render: () => TimeRulesUI.page(),
              cards: [['#trholsave', 'holidays', { all: true }]],
            },
          ],
        },
      ],
    },
    {
      key: 'scoring',
      label: 'Scoring',
      subs: [
        {
          key: 'rules',
          label: 'Rules',
          find: ['Scoring weights and parts', 'Tiers', 'Project score', 'Scoring weights what-if'],
          parts: [{ title: 'Scoring rules', area: 'scoring-rules', render: () => AdminUI.scoringPage(), drop: ['Bonus / penalty points'] }],
        },
        {
          key: 'months',
          label: 'Months',
          find: ['Lock or unlock a month', 'Help desk months — lock / unlock', 'Months not counted'],
          parts: [
            { title: 'Month locks', area: 'score-months', render: () => adminMonths() },
            { title: 'Months', area: 'score-months', render: () => adminScoreMonths() },
            { title: 'Help desk months', area: 'score-months', render: () => adminHdMonths() },
          ],
        },
        {
          key: 'adjust',
          label: 'Adjustments',
          find: ['Bonus / penalty points', 'Ratings', 'Scoring changes waiting for approval'],
          parts: [
            { title: 'Waiting for your approval', area: null, render: () => AdminNav.asksPart(), only: () => AdminUI.asks().length > 0 },
            {
              title: 'Bonus / penalty and ratings',
              area: 'adjustments',
              render: () => {
                const t = App.viewTeam || 'apps';
                return {
                  html: ScorePartsUI.adjCard(t) + (ScorePartsUI.ratingCard() || ''),
                  mount: root => {
                    ScorePartsUI.bindAdj(root, t);
                    ScorePartsUI.bindRating(root);
                  },
                };
              },
            },
          ],
        },
        {
          key: 'print',
          label: 'Printable rules',
          find: ['Printable rules'],
          parts: [
            {
              title: 'Printable rules',
              area: 'scoring-rules',
              render: () => ({
                html: card(
                  'Printable rules',
                  `<p class="muted small">Every team's scoring weights, tiers and time rules, with the date each one started — one page to print or save as PDF.</p><div class="row-btns"><button class="btn primary" id="rulesprint2" data-keep>🖨 Open the printable rules</button></div>`
                ),
                mount: root => {
                  const b = root.querySelector('#rulesprint2');
                  if (b) b.onclick = () => RulesPrint.open();
                },
              }),
            },
          ],
        },
      ],
    },
    {
      key: 'settings',
      label: 'Settings',
      subs: [
        {
          key: 'lists',
          label: 'Lists',
          find: ['Dropdown lists (task types, modules, wards …)', 'User departments'],
          parts: [
            { title: 'Dropdown lists', area: 'lists', render: () => AdminNav.lists(false) },
            { title: 'User departments', area: 'lists', all: true, render: () => adminUserDepts() },
          ],
        },
        {
          key: 'look',
          label: 'Look & home pages',
          find: [
            'Customize — name, logo, colours',
            'Menu',
            'Words used in the app',
            'Targets and limits',
            'Weekend',
            'Start page',
            'Analyst Desk tiles',
          ],
          parts: [{ title: 'Look & home pages', area: 'look', render: () => adminCustom() }],
        },
        {
          key: 'announcements',
          label: 'Announcements',
          find: ['Announcements'],
          parts: [{ title: 'Announcements', area: 'announcements', render: () => P.announcements() }],
        },
      ],
    },
    {
      key: 'system',
      label: 'System',
      subs: [
        {
          key: 'data',
          label: 'Data',
          find: [
            'Export everything to Excel',
            'Backup settings',
            'Technician names (ManageEngine)',
            'Test data',
            'Open work with retired people',
            'Findings from MAHAM Lab',
            'Import old data',
            'Minimum app version',
            'Shared folder path',
          ],
          parts: [
            { title: 'Data', area: null, render: () => adminData(), drop: ['Possible duplicates'] },
            { title: 'Export', area: 'data', only: () => !App.realSuper(), render: () => AdminNav.exportPart() },
            { title: 'App version and folder', area: null, render: () => adminTeams(), keep: ['#mvsave', '#savesp'] },
            { title: 'Import old data', area: null, render: () => P.importdata() },
          ],
        },
        {
          key: 'check',
          label: 'Check',
          find: ['System Check, backups, ignored changes', 'Duplicates', 'Data health — impossible dates, no owner, broken links'],
          parts: [
            { title: 'System Check', area: 'syscheck', render: () => P.syscheck() },
            { title: 'Possible duplicates', area: 'syscheck', render: () => adminData(), keep: ['Possible duplicates'] },
          ],
        },
        {
          key: 'logs',
          label: 'Logs',
          find: ['Change log / undo', 'Activity log — who changed what', 'Usage — who opens the app'],
          parts: [
            { title: 'Change log', area: 'logs', render: () => adminLog() },
            { title: 'Activity log', area: 'logs', render: () => adminActivity() },
            { title: 'Usage', area: 'logs', render: () => P.usage() },
          ],
        },
        {
          key: 'feedback',
          label: 'Feedback',
          find: ['Feedback'],
          parts: [{ title: 'Feedback', area: 'feedback', render: () => adminFeedback() }],
        },
      ],
    },
  ],
  /* old #/admin/<tab> links → [tab, sub] */
  REDIRECT: {
    home: ['home', 'home'],
    people: ['people', 'people'],
    leave: ['people', 'people'],
    permissions: ['people', 'access'],
    teamrules: ['people', 'access'],
    teams: ['people', 'teams'],
    workflows: ['work', 'projects'],
    taskflows: ['work', 'tasks'],
    timerules: ['work', 'time'],
    lists: ['settings', 'lists'],
    scoring: ['scoring', 'rules'],
    months: ['scoring', 'months'],
    hdmonths: ['scoring', 'months'],
    custom: ['settings', 'look'],
    data: ['system', 'data'],
    feedback: ['system', 'feedback'],
    log: ['system', 'logs'],
    activity: ['system', 'logs'],
    company: ['people', 'company'],
  },
  /* pages that were outside Admin → their place in it (for the search) */
  PAGES: {
    '#/syscheck': ['system', 'check'],
    '#/announcements': ['settings', 'announcements'],
    '#/importdata': ['system', 'data'],
    '#/usage': ['system', 'logs'],
  },
  /* inputs and buttons that stay usable on a read-only screen: filters, searches, the team / scope pickers */
  KEEP: '[data-keep], [data-al], #logq, #tfscope, #trscope, #uper, #uwho, #ufrom, #uto, .filters select, .filters input, .tbl-tools input, .tbl-tools button, input[type=search], [data-tsearch]',
  hooks: [],

  addSub(tab, sub, at) {
    const t = AdminNav.TABS.find(x => x.key === tab);
    if (!t) return;
    t.subs = t.subs.filter(s => s.key !== sub.key);
    if (at == null) t.subs.push(sub);
    else t.subs.splice(at, 0, sub);
  },
  onMount(fn) {
    AdminNav.hooks.push(fn);
  },
  sup() {
    return App.realSuper();
  },
  /* may the person see this part (and at which level)? */
  partLevel(p) {
    if (p.only && !p.only()) return '';
    if (AdminNav.sup()) return 'edit';
    if (!p.area && !p.areas) return '';
    const lvs = (p.areas || [p.area]).map(a => AdminRole.level(a)).filter(Boolean);
    return lvs.includes('edit') ? 'edit' : lvs.length ? 'view' : '';
  },
  subVisible(s) {
    return s.key === 'home' ? AdminNav.sup() || AdminRole.any(App.me) : s.parts.some(p => AdminNav.partLevel(p));
  },
  tabs() {
    return AdminNav.TABS.map(t => Object.assign({}, t, { subs: t.subs.filter(AdminNav.subVisible) })).filter(t => t.subs.length);
  },
  /* where #/admin/… points: [tab, sub] (old links translated) */
  where() {
    const p = location.hash.replace(/^#\/?/, '').split('/');
    let tab = p[1] || 'home',
      sub = p[2] || '';
    if (!AdminNav.TABS.some(t => t.key === tab) && AdminNav.REDIRECT[tab]) [tab, sub] = AdminNav.REDIRECT[tab];
    const tabs = AdminNav.tabs();
    const t = tabs.find(x => x.key === tab) || tabs[0];
    if (!t) return null;
    const s = t.subs.find(x => x.key === sub) || t.subs[0];
    return { t, s, moved: p[1] !== t.key || p[2] !== s.key };
  },
  href(tab, sub) {
    return `#/admin/${tab}/${sub}`;
  },

  /* ---------- the head: main tabs, sub-tabs, search ---------- */
  head(t, s) {
    const tabs = AdminNav.tabs();
    const g = !AdminNav.sup() && AdminRole.of(App.me);
    return `<div class="adm-top"><div class="tabs adm-tabs adm-main">${tabs.map(x => `<a class="tab ${x.key === t.key ? 'on' : ''}" href="${AdminNav.href(x.key, x.subs[0].key)}" data-admtab="${x.key}">${h(x.label)}</a>`).join('')}</div>
      <div class="adm-search"><input id="adsearch" type="search" placeholder="🔎 Find a person, team or setting…" autocomplete="off"><div id="adresults" class="adm-results" hidden></div></div></div>
      ${t.subs.length > 1 ? `<div class="tabs adm-sub">${t.subs.map(x => `<a class="tab ${x.key === s.key ? 'on' : ''}" href="${AdminNav.href(t.key, x.key)}" data-admsub="${x.key}">${h(x.label)}</a>`).join('')}</div>` : ''}
      ${
        g
          ? `<div class="insights"><div>⛨ You are an <b>Admin</b> for ${
              g.reach === 'all'
                ? '<b>all teams</b>'
                : AdminRole.teamsOf(App.me)
                    .map(x => `<b>${h(Store.teamName(x))}</b>`)
                    .join(', ')
            }. You see only your areas; what you change goes live at once, is in the Activity log, and the super admin can undo it.</div></div>`
          : ''
      }`;
  },
  /* ---------- search: people, teams and settings — only where the person may go ---------- */
  search(q) {
    q = U.lc(q);
    const out = [];
    const ok = (tab, sub) => AdminNav.tabs().some(x => x.key === tab && x.subs.some(y => y.key === sub));
    if (AdminNav.sup())
      out.push(
        ...Store.members()
          .filter(m => [m.name, m.short, m.me, m.id, ...(m.aliases || [])].some(x => U.lc(x).includes(q)))
          .slice(0, 8)
          .map(m => [
            `👤 ${m.name}`,
            `${Store.roleLabel(m.role)}${Store.topRole(m.role) ? '' : ' · ' + Store.teamName(m.team || 'apps')}${m.active === false ? ' · retired' : ''}`,
            '#/adminperson/' + m.id,
          ])
      );
    else if (ok('people', 'people')) {
      const ts = AdminRole.teamsOf(App.me);
      out.push(
        ...Store.members()
          .filter(m => ts.includes(m.team || 'apps') && [m.name, m.short, m.id].some(x => U.lc(x).includes(q)))
          .slice(0, 8)
          .map(m => [`👤 ${m.name}`, 'People', AdminNav.href('people', 'people')])
      );
    }
    if (ok('people', 'teams'))
      out.push(
        ...Store.teams()
          .filter(t => U.lc(t.name).includes(q) || t.id.includes(q))
          .map(t => [`👥 ${t.name}`, 'Teams & departments', AdminNav.href('people', 'teams')])
      );
    const seen = new Set();
    for (const t of AdminNav.TABS)
      for (const s of t.subs) {
        if (!ok(t.key, s.key)) continue;
        for (const l of [s.label, ...(s.find || []), ...s.parts.filter(p => AdminNav.partLevel(p)).map(p => p.title)])
          if (U.lc(l).includes(q) && !seen.has(l + s.key)) {
            seen.add(l + s.key);
            out.push([`⚙ ${l}`, `${t.label} → ${s.label}`, AdminNav.href(t.key, s.key)]);
          }
      }
    for (const [l, to] of typeof ADMIN_FIND !== 'undefined' ? ADMIN_FIND : []) {
      // words other files add
      const w = to.startsWith('#') ? AdminNav.PAGES[to] : AdminNav.REDIRECT[to];
      if (!w || !ok(w[0], w[1]) || !U.lc(l).includes(q) || seen.has(l + w[1])) continue;
      seen.add(l + w[1]);
      const t = AdminNav.TABS.find(x => x.key === w[0]);
      const s = t.subs.find(x => x.key === w[1]);
      out.push([`⚙ ${l}`, `${t.label} → ${s.label}`, AdminNav.href(w[0], w[1])]);
    }
    return out.slice(0, 30);
  },
  bindSearch(root) {
    const inp = root.querySelector('#adsearch'),
      out = root.querySelector('#adresults');
    if (!inp) return;
    inp.oninput = () => {
      const q = inp.value.trim();
      if (!q) {
        out.hidden = true;
        return;
      }
      const hits = AdminNav.search(q);
      out.innerHTML = hits.length
        ? hits
            .map(([a, b, href]) => `<a class="adm-hit" href="${h(href)}"><b>${h(a)}</b><span class="muted small">${h(b)}</span></a>`)
            .join('')
        : '<div class="muted small adm-hit">Nothing found</div>';
      out.hidden = false;
    };
    inp.onkeydown = e => {
      if (e.key === 'Enter') {
        const a = out.querySelector('a.adm-hit');
        if (a) location.hash = a.getAttribute('href');
      }
      if (e.key === 'Escape') {
        inp.value = '';
        out.hidden = true;
      }
    };
    inp.onblur = () =>
      setTimeout(() => {
        out.hidden = true;
      }, 200);
  },

  /* ---------- read-only screens ---------- */
  lock(el, why) {
    if (!el || el.dataset.locked) return;
    el.dataset.locked = '1';
    el.classList.add('adm-view');
    el.querySelectorAll('input, select, textarea').forEach(x => {
      if (!x.matches(AdminNav.KEEP)) x.disabled = true;
    });
    el.querySelectorAll('button').forEach(b => {
      if (!b.matches(AdminNav.KEEP)) b.remove();
    });
    el.querySelectorAll('[contenteditable="true"]').forEach(x => (x.contentEditable = 'false'));
    el.insertAdjacentHTML(
      'afterbegin',
      `<div class="adm-viewnote small">👁 ${h(why || 'View only — you can look but not change this.')}</div>`
    );
  },
  /* the card a selector or a card title points to */
  cardOf(sec, k) {
    if (/^[#.[]/.test(k)) {
      const e = sec.querySelector(k);
      return e ? e.closest('section.card') : null;
    }
    return (
      [...sec.querySelectorAll('section.card')].find(c => {
        const t = c.querySelector('.card-head h3');
        return t && t.textContent.trim().startsWith(k);
      }) || null
    );
  },

  /* ---------- small parts made here ---------- */
  lists(project) {
    const x = AdminUI.settingsPart(['lists']);
    return {
      html: x.html,
      mount(root) {
        x.mount(root);
        root.querySelectorAll('[data-list]').forEach(t => {
          if (AdminRole.PROJECT_LISTS.includes(t.dataset.list) !== project) {
            const f = t.closest('.fld');
            if (f) f.remove();
          }
        });
        const c = root.querySelector('[data-list]');
        const cd = c && c.closest('section.card');
        const h3 = cd && cd.querySelector('.card-head h3');
        if (h3 && project) h3.textContent = h3.textContent.replace('Dropdown lists', 'Project lists & categories');
      },
    };
  },
  exportPart() {
    return {
      html: card(
        'Export everything',
        `<p class="muted small">One Excel file with every kind of record (one sheet each), for audit or reporting. Nothing leaves this PC.</p><div class="row-btns"><button class="btn primary" id="exportall3" data-keep>⬇ Download Excel</button></div>`
      ),
      mount(root) {
        const b = root.querySelector('#exportall3');
        if (b) b.onclick = () => exportAll();
      },
    };
  },
  asksPart() {
    const asks = AdminUI.asks();
    return {
      html: card(
        `Scoring changes waiting for you <span class="count">${asks.length}</span>`,
        `<p class="muted small">An Admin's scoring change that would raise their own score waits here for you.</p>${asks.map(a => `<div class="li"><span class="grow"><b>${h(Store.memberName(a.by))}</b> · scoring for ${h(Store.teamName(a.team))} · their score ${a.before} → ${a.after} <span class="muted small">${U.fmtDate(U.ds(new Date(a._ts)))}</span></span><button class="btn xs primary" data-askok="${h(a.id)}">Approve</button> <button class="btn xs ghost" data-askno="${h(a.id)}">Reject</button></div>`).join('')}`
      ),
      mount: root => AdminUI.bindChanges(root),
    };
  },
  /* ---------- Home: what needs action, recent Admin changes, quick links ---------- */
  needs() {
    const sup = AdminNav.sup();
    const out = [];
    const safe = f => {
      try {
        return f();
      } catch (e) {
        return 0;
      }
    };
    const add = (n, label, href, bad) => {
      if (n) out.push({ n, label, href, bad });
    };
    if (sup)
      add(
        safe(() => AdminUI.asks().length),
        'scoring change(s) waiting for your approval',
        AdminNav.href('scoring', 'adjust'),
        true
      );
    if (sup)
      add(
        safe(() => Admin.stuckTodos().length),
        'finished To Do(s) waiting 3+ days for confirmation',
        '#/todo',
        false
      );
    if (sup || AdminRole.sees('followups'))
      add(
        safe(() => Store.all('central', '*').filter(r => FollowUp.level(FollowUp.norm(r)) === 'manager').length),
        'follow-up(s) escalated to the manager',
        '#/central',
        true
      );
    if (sup)
      add(
        safe(() => FollowUp.upgradePlan().length),
        'old follow-up(s) to upgrade to the new steps',
        '#/central',
        false
      );
    if (sup || AdminRole.sees('syscheck'))
      add(
        safe(() => Health.count()),
        'System Check warning(s)',
        AdminNav.href('system', 'check'),
        false
      );
    return out;
  },
  home() {
    const sup = AdminNav.sup();
    const n = AdminNav.needs();
    const need = card(
      `Needs action <span class="count">${n.length}</span>`,
      n.length
        ? `<div class="li-list">${n.map(x => `<a class="li" href="${h(x.href)}"><b class="${x.bad ? 't-bad' : 't-warn'}">${x.n}</b>&nbsp;<span class="grow">${h(x.label)}</span><span class="muted small">Open →</span></a>`).join('')}</div>`
        : empty('Nothing needs you right now.')
    );
    const links = card(
      'Quick links',
      `<div class="li-list">${AdminNav.tabs()
        .filter(t => t.key !== 'home')
        .map(
          t =>
            `<div class="li"><b style="min-width:150px">${h(t.label)}</b><span class="grow">${t.subs.map(s => `<a class="link" href="${AdminNav.href(t.key, s.key)}">${h(s.label)}</a>`).join(' · ')}</span></div>`
        )
        .join('')}</div>`
    );
    if (!sup) return { html: `<div class="cols2">${need}${links}</div>` };
    const base = adminHome();
    const ch = AdminUI.changesCard();
    return {
      html: `<div class="cols2">${need}${ch || card('Changes by Admins — last 7 days', '<p class="muted small">No Admins yet.</p>')}</div>${base.html}${links}`,
      mount(root) {
        if (base.mount) base.mount(root);
        if (ch) AdminUI.bindChanges(root);
      },
    };
  },

  /* ---------- the page ---------- */
  page() {
    const sup = AdminNav.sup();
    if (!sup && !AdminRole.any(App.me))
      return { title: 'Not available', html: '<div class="card"><p>You don\'t have permission to see this page.</p></div>' };
    if (!sup) {
      const teams = AdminRole.teamsOf(App.me);
      if (teams.length && !teams.includes(App.viewTeam)) App.setViewTeam(teams[0]);
    }
    const w = AdminNav.where();
    if (!w) return { title: 'Admin', html: empty('Nothing here for you.') };
    const { t, s } = w;
    if (w.moved)
      try {
        history.replaceState(null, '', AdminNav.href(t.key, s.key));
      } catch (e) {
        /* file:// in some browsers */
      }
    // editors that belong to one sub-tab are closed when you leave it
    if (!(t.key === 'work' && s.key === 'projects') && typeof WF !== 'undefined') {
      WF.draft = null;
      WF.maps = {};
    }
    if (!(t.key === 'work' && (s.key === 'tasks' || s.key === 'followups')) && typeof TFE !== 'undefined') {
      TFE.draft = null;
      if (TFE.scope === 'fu') TFE.scope = null;
    }
    if (
      typeof TFE !== 'undefined' &&
      t.key === 'work' &&
      TFE.draft &&
      ((s.key === 'tasks' && TFE.scope === 'fu') || (s.key === 'followups' && TFE.scope !== 'fu'))
    )
      TFE.draft = null;
    const parts =
      t.key === 'home'
        ? [{ title: 'Home', render: AdminNav.home, lv: 'edit' }]
        : s.parts.map(p => Object.assign({}, p, { lv: AdminNav.partLevel(p) })).filter(p => p.lv);
    const built = parts.map(p => {
      try {
        return Object.assign({ p }, p.render() || {});
      } catch (e) {
        console.error(e);
        return { p, html: card(h(p.title), `<p class="t-bad small">Could not show this part: ${h(e.message)}</p>`) };
      }
    });
    const fold = built.length >= 3; // long sub-tabs: each part can be folded (remembered on this PC)
    const isOpen = i => {
      try {
        return LS.get(`bct.adm.sec.${t.key}.${s.key}.${i}`, '1') !== '0';
      } catch (e) {
        return true;
      }
    };
    const html =
      AdminNav.head(t, s) +
      built
        .map((b, i) =>
          fold
            ? `<details class="adm-sec" data-pi="${i}" ${isOpen(i) ? 'open' : ''}><summary>${h(b.p.title)}</summary><div class="adm-part" data-pi="${i}">${b.html || ''}</div></details>`
            : `<div class="adm-part" data-pi="${i}">${b.html || ''}</div>`
        )
        .join('');
    return {
      title: 'Admin',
      html,
      mount(root) {
        AdminNav.bindSearch(root);
        for (const [i, b] of built.entries()) {
          try {
            if (b.mount) b.mount(root);
          } catch (e) {
            console.error(e);
          }
          AdminNav.fit(root.querySelector(`.adm-part[data-pi="${i}"]`), b.p);
        }
        root.querySelectorAll('details.adm-sec').forEach(
          d =>
            (d.ontoggle = () => {
              try {
                LS.set(`bct.adm.sec.${t.key}.${s.key}.${d.dataset.pi}`, d.open ? '1' : '0');
              } catch (e) {
                /* not kept */
              }
            })
        );
        for (const f of AdminNav.hooks)
          try {
            f(root, t.key, s.key);
          } catch (e) {
            console.error(e);
          }
      },
    };
  },
  /* after a part is mounted: drop / keep cards, hide the cards of areas the Admin doesn't have, lock view-only ones */
  fit(sec, p) {
    if (!sec) return;
    for (const k of p.drop || []) {
      const c = AdminNav.cardOf(sec, k);
      if (c) c.remove();
    }
    if (p.keep) {
      const keep = p.keep.map(k => AdminNav.cardOf(sec, k)).filter(Boolean);
      sec.querySelectorAll('section.card').forEach(c => {
        if (!keep.includes(c)) c.remove();
      });
    }
    if (AdminNav.sup()) return;
    const g = AdminRole.of(App.me);
    const allOk = !!g && g.reach === 'all';
    const mapped = new Map();
    for (const [k, area, o] of p.cards || []) {
      const c = AdminNav.cardOf(sec, k);
      if (c) mapped.set(c, [area, o || {}]);
    }
    const base = p.area;
    sec.querySelectorAll('section.card').forEach(c => {
      const [area, o] = mapped.get(c) || [base, { all: p.all }];
      const lv = area ? AdminRole.level(area) : '';
      if (!lv) {
        c.remove();
        return;
      }
      if (AdminRole.VIEW_ONLY.includes(area)) AdminNav.lock(c, 'View only.');
      else if (lv === 'view') AdminNav.lock(c);
      else if (o.all && !allOk) AdminNav.lock(c, 'View only — changing this needs an Admin for all teams.');
    });
  },
};

/* the Admin page */
P.admin = () => AdminNav.page();
/* older callers (the person card): the Admin head and its search */
function adminHead(tab) {
  const w = AdminNav.REDIRECT[tab] || ['people', 'people'];
  const t = AdminNav.tabs().find(x => x.key === w[0]) || AdminNav.tabs()[0];
  return t ? AdminNav.head(t, t.subs.find(x => x.key === w[1]) || t.subs[0]) : '';
}
function bindAdminSearch(root) {
  AdminNav.bindSearch(root);
}
