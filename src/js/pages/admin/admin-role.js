/* MAHAM — Admin pages for the "Admin" role (access/adminrole.js):
 *  - the super admin gives the role on the person card (areas, own team / all teams, templates)
 *  - an Admin opens Admin and sees only their areas (people: a limited list; workflows: their team's)
 *  - the super admin's Admin home lists what Admins changed this week (and asks before an Admin raises their own score) */
'use strict';

const AdminUI = {
  /* ---------- person card: the role (areas grouped as in Admin, a level per area, reach) ---------- */
  roleCard(m) {
    if (m.superAdmin) return card('Admin role', '<p class="muted small">Super admin — has everything.</p>');
    const on = !!m.admin;
    const g = { areas: AdminRole.areasOf(m), reach: AdminRole.reachOf(m), teams: m.adminTeams || [] };
    const tpl = AdminRole.templates();
    const groups = typeof AdminNav !== 'undefined' ? AdminNav.TABS.filter(t => t.key !== 'home') : [];
    const row = ([k, l, d]) => {
      const lv = g.areas.get(k);
      const vo = AdminRole.VIEW_ONLY.includes(k);
      const all = AdminRole.ALL_ONLY.includes(k);
      return `<div class="ar-row"><label class="check" title="${h(d)}"><input type="checkbox" data-area="${k}" ${lv ? 'checked' : ''}> ${h(l)}${all ? ' <span class="muted small">(all teams)</span>' : ''} <span class="muted small">— ${h(d)}</span></label>${vo ? '<span class="muted small">view</span>' : `<select data-lv="${k}"><option value="edit" ${lv !== 'view' ? 'selected' : ''}>Edit</option><option value="view" ${lv === 'view' ? 'selected' : ''}>View only</option></select>`}</div>`;
    };
    const byTab =
      groups
        .map(t => {
          const l = AdminRole.AREAS.filter(a => a[3] === t.key);
          return l.length ? `<div class="ar-grp"><b class="small">${h(t.label)}</b>${l.map(row).join('')}</div>` : '';
        })
        .join('') || AdminRole.AREAS.map(row).join('');
    return card(
      'Admin role',
      `<p class="muted small">An Admin keeps working as ${h(Store.roleLabel(m.role || 'analyst'))} and gets an <b>Admin</b> menu with only the areas ticked here — <b>Edit</b> or <b>View only</b> (read-only screens, no save buttons). Only you can give it. Changes they make go live at once, are in the Activity and Change logs, show on your Admin home, and you can undo them. Roles &amp; access, team rules, giving Admin roles, import / restore, undo and fixing in System Check stay with you.</p>
      <label class="check"><input type="checkbox" id="ar-on" ${on ? 'checked' : ''}> <b>Admin</b></label>
      <div id="ar-box" ${on ? '' : 'hidden'}>
        <div class="row-btns" style="margin:8px 0"><label class="small">Reach</label><select id="ar-reach"><option value="team" ${g.reach === 'team' ? 'selected' : ''}>Own team only (${h(Store.teamName(m.team || 'apps'))})</option><option value="teams" ${g.reach === 'teams' ? 'selected' : ''}>Chosen teams</option><option value="all" ${g.reach === 'all' ? 'selected' : ''}>All teams</option></select>
          <span id="ar-teams" ${g.reach === 'teams' ? '' : 'hidden'}>${Store.teams()
            .map(
              t =>
                `<label class="check small"><input type="checkbox" data-arteam="${h(t.id)}" ${g.teams.includes(t.id) ? 'checked' : ''}> ${h(t.name)}</label>`
            )
            .join(' ')}</span>
          ${tpl.length ? `<select id="ar-tpl"><option value="">Use a template…</option>${tpl.map(t => `<option value="${h(t.id)}">${h(t.name)}</option>`).join('')}</select>` : ''}</div>
        <div class="ar-areas">${byTab}</div>
        <div class="row-btns"><button class="btn sm ghost" id="ar-savetpl">Save these as a template…</button><span class="grow"></span></div>
      </div>
      <div class="row-btns"><span class="grow"></span><button class="btn primary sm" id="ar-save">Save Admin role</button></div>`
    );
  },
  bindRoleCard(root, m) {
    const on = root.querySelector('#ar-on');
    if (!on) return;
    const box = root.querySelector('#ar-box');
    on.onchange = () => (box.hidden = !on.checked);
    const reach = root.querySelector('#ar-reach');
    const tbox = root.querySelector('#ar-teams');
    reach.onchange = () => (tbox.hidden = reach.value !== 'teams');
    const read = () => {
      const areas = [...root.querySelectorAll('[data-area]')].filter(i => i.checked).map(i => i.dataset.area);
      const levels = {};
      for (const a of areas) {
        const s = root.querySelector(`[data-lv="${a}"]`);
        if (s && s.value === 'view') levels[a] = 'view';
      }
      return {
        v: 2,
        areas,
        levels,
        reach: reach.value,
        teams: reach.value === 'teams' ? [...root.querySelectorAll('[data-arteam]')].filter(i => i.checked).map(i => i.dataset.arteam) : [],
      };
    };
    const tsel = root.querySelector('#ar-tpl');
    if (tsel)
      tsel.onchange = () => {
        const t = AdminRole.templates().find(x => x.id === tsel.value);
        if (!t) return;
        const ar = AdminRole.areasOf(t);
        root.querySelectorAll('[data-area]').forEach(i => (i.checked = ar.has(i.dataset.area)));
        root.querySelectorAll('[data-lv]').forEach(s => (s.value = ar.get(s.dataset.lv) === 'view' ? 'view' : 'edit'));
        reach.value = AdminRole.reachOf(t);
        tbox.hidden = reach.value !== 'teams';
        root.querySelectorAll('[data-arteam]').forEach(i => (i.checked = (t.teams || []).includes(i.dataset.arteam)));
      };
    root.querySelector('#ar-savetpl').onclick = () => {
      const v = read();
      if (!v.areas.length) return UI.toast('Tick at least one area', 'bad');
      UI.modal({
        title: 'Save as a template',
        body: `<p class="muted small">${v.areas.map(a => h(AdminRole.label(a)) + (v.levels[a] ? ' (view)' : '')).join(', ')} · ${v.reach === 'all' ? 'all teams' : v.reach === 'teams' ? 'chosen teams' : 'own team'}</p><input id="ar-tname" placeholder="e.g. Manager-Admin" style="width:100%">`,
        actions: '<span class="grow"></span><button class="btn primary" data-ok>Save template</button>',
        onMount: w =>
          (w.querySelector('[data-ok]').onclick = () => {
            const n = w.querySelector('#ar-tname').value;
            UI.closeModal();
            AdminUI.saveTemplate(n, v);
          }),
      });
    };
    root.querySelector('#ar-save').onclick = () => {
      const v = read();
      const isOn = on.checked && v.areas.length;
      if (on.checked && !v.areas.length) return UI.toast('Tick at least one area (or untick Admin)', 'bad');
      const all = v.areas.filter(a => AdminRole.ALL_ONLY.includes(a));
      if (isOn && all.length && v.reach !== 'all')
        return UI.toast(
          `${all.map(a => '“' + AdminRole.label(a) + '”').join(' and ')} need${all.length > 1 ? '' : 's'} “All teams”`,
          'bad'
        );
      if (isOn && v.reach === 'teams' && !v.teams.length) return UI.toast('Tick the teams (or pick another reach)', 'bad');
      if (document.querySelector('.modal #ar-on')) UI.closeModal();
      saveMembersAll(
        Store.members().map(x => {
          if (x.id !== m.id) return x;
          const y = Object.assign({}, x);
          for (const k of ['admin', 'adminV', 'adminAreas', 'adminLevels', 'adminReach', 'adminTeams']) delete y[k];
          if (isOn) {
            Object.assign(y, { admin: true, adminV: 2, adminAreas: v.areas, adminReach: v.reach });
            if (Object.keys(v.levels).length) y.adminLevels = v.levels;
            if (v.reach === 'teams') y.adminTeams = v.teams;
          }
          return y;
        }),
        isOn ? `${m.name} is an Admin (${v.areas.length} area${v.areas.length > 1 ? 's' : ''})` : `${m.name} is no longer an Admin`
      );
    };
  },
  reachText(g, m) {
    return g.reach === 'all' ? 'all teams' : g.teams.map(t => Store.teamName(t)).join(', ') || Store.teamName(m.team || 'apps');
  },
  summary(m) {
    const g = AdminRole.own(m);
    return g
      ? `Admin for ${AdminUI.reachText(g, m)}: ${[...g.areas].map(([a, lv]) => AdminRole.label(a) + (lv === 'view' && !AdminRole.VIEW_ONLY.includes(a) ? ' (view)' : '')).join(', ')}`
      : '';
  },
  /* People → Roles & access: who is an Admin, and the templates */
  rolesCard() {
    const admins = Store.members().filter(m => AdminRole.own(m));
    const tpl = AdminRole.templates();
    return {
      html: card(
        `Admin roles <span class="count">${admins.length}</span>`,
        `<p class="muted small">Give a person some admin areas on their card (People → ⛨ Admin). Their changes are logged, shown on your Admin home and you can undo them.</p>
      ${admins.length ? `<div class="li-list">${admins.map(m => `<div class="li"><span class="grow"><b>${h(m.name)}</b> <span class="muted small">${h(AdminUI.summary(m))}</span></span><button class="btn xs" data-adminrole="${h(m.id)}">Edit</button></div>`).join('')}</div>` : empty('Nobody has an Admin role yet.')}
      <h3 class="small" style="margin-top:12px">Templates <span class="count">${tpl.length}</span></h3>
      ${
        tpl.length
          ? `<div class="li-list">${tpl
              .map(t => {
                const ar = AdminRole.areasOf(t);
                return `<div class="li"><span class="grow"><b>${h(t.name)}</b> <span class="muted small">${[...ar].map(([a, lv]) => h(AdminRole.label(a)) + (lv === 'view' && !AdminRole.VIEW_ONLY.includes(a) ? ' (view)' : '')).join(', ')} · ${AdminRole.reachOf(t) === 'all' ? 'all teams' : AdminRole.reachOf(t) === 'teams' ? 'chosen teams' : 'own team'}</span></span><button class="btn xs ghost" data-tpldel="${h(t.id)}">Delete</button></div>`;
              })
              .join('')}</div>`
          : '<p class="muted small">No templates — save one from an Admin role.</p>'
      }`
      ),
      mount(root) {
        root.querySelectorAll('[data-adminrole]').forEach(
          b =>
            (b.onclick = e => {
              e.preventDefault();
              AdminUI.roleDialog(b.dataset.adminrole);
            })
        );
        root.querySelectorAll('[data-tpldel]').forEach(
          b =>
            (b.onclick = () =>
              UI.confirm('Delete this template? Admins given it keep their areas.', () => {
                Store.save(
                  Object.assign({}, Store.get('settings-admintemplates'), {
                    list: AdminRole.templates().filter(t => t.id !== b.dataset.tpldel),
                  })
                );
                UI.toast('Template deleted', 'good');
                App.render();
              }))
        );
      },
    };
  },
  /* the People table (super admin): a ⛨ Admin button next to Permissions */
  withRoleButtons(out) {
    out.html = out.html.replace(/<button class="btn xs[^"]*" data-perm="([^"]+)">Permissions<\/button>/g, (all, id) => {
      const m = Store.member(id);
      if (!m || m.superAdmin) return all;
      const on = !!AdminRole.own(m);
      return (
        `<button class="btn xs ${on ? 'primary' : ''}" data-adminrole="${h(id)}" title="${h(on ? AdminUI.summary(m) : 'Give some admin areas')}">⛨ Admin</button> ` +
        all
      );
    });
    const m1 = out.mount;
    out.mount = root => {
      if (m1) m1(root);
      root.querySelectorAll('[data-adminrole]').forEach(
        b =>
          (b.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            AdminUI.roleDialog(b.dataset.adminrole);
          })
      );
    };
    return out;
  },
  roleDialog(id) {
    const m = Store.member(id);
    if (!m) return;
    UI.modal({
      title: `Admin role — ${m.name}`,
      wide: true,
      body: AdminUI.roleCard(m),
      actions: '<span class="grow"></span><button class="btn" data-close>Close</button>',
      onMount: w => {
        AdminUI.bindRoleCard(w, m);
        const c = w.querySelector('[data-close]');
        if (c) c.onclick = () => UI.closeModal();
      },
    });
  },
  saveTemplate(name, v) {
    name = String(name || '').trim();
    if (!name) return;
    const list = AdminRole.templates()
      .filter(t => t.name !== name)
      .concat([{ id: U.uid('atpl'), name, v: 2, areas: v.areas, levels: v.levels || {}, reach: v.reach, teams: v.teams || [] }]);
    Store.save(Object.assign({}, Store.get('settings-admintemplates') || { id: 'settings-admintemplates', c: 'settings' }, { list }));
    UI.toast(`Template “${name}” saved`, 'good');
  },

  /* Scoring & months: weights and parts (+ bonus / penalty), the scoring rules (tiers as tables), the what-if */
  settingsPart(keep) {
    const x = P.settings('lists');
    return {
      html: x.html.replace(/<div class="insights"><div>Scoring rules and dropdown lists[\s\S]*?<\/div><\/div>/, ''),
      mount(root) {
        x.mount(root);
        const drop = id => {
          const b = root.querySelector(id);
          const c = b && b.closest('.card');
          if (c) c.remove();
        };
        if (!keep.includes('scoring')) drop('#savescore');
        if (!keep.includes('lists')) drop('#savelists');
        root.querySelectorAll('#saveteam, #addmember, #teamrows').forEach(e => {
          const c = e.closest('.card');
          if (c) c.remove();
        });
        if (keep.includes('scoring')) {
          // weights are set in "Weights and parts": keep the fields (the save reads them) but out of sight
          const sc = root.querySelector('#savescore');
          const cardEl = sc && sc.closest('.card');
          if (cardEl) {
            cardEl.querySelectorAll('[name^="w_"]').forEach(i => {
              const f = i.closest('.fld');
              if (f) f.style.display = 'none';
            });
            const g = cardEl.querySelector('.grid-form');
            if (g) g.insertAdjacentHTML('afterbegin', '<p class="muted small span2">Weights: in <b>Weights and parts</b> above.</p>');
          }
          TierEdit.mountSettings(root);
        }
      },
    };
  },
  scoringPage() {
    const sp = ScorePartsUI.page();
    const rules = AdminUI.settingsPart(['scoring']);
    const wif = adminScoring();
    wif.html = wif.html.replace(
      /<a class="link small" href="#\/admin\/lists">[^<]*<\/a>/,
      '<span class="muted small">Try weights here; save them in Weights and parts.</span>'
    );
    return adminJoin(sp, rules, wif);
  },
  /* ---------- People (limited): plain people of my teams ---------- */
  peopleLite() {
    const teams = AdminRole.teamsOf(App.me);
    const plain = m => !m.superAdmin && !m.admin && AdminRole.PEOPLE_ROLES.includes(m.role || 'analyst');
    const list = Store.members().filter(m => teams.includes(m.team || 'apps'));
    const roleSel = m =>
      `<select data-k="role">${AdminRole.PEOPLE_ROLES.map(r => `<option value="${r}" ${(m.role || 'analyst') === r ? 'selected' : ''}>${h(Store.roleLabel(r))}</option>`).join('')}</select>`;
    const teamSel = m =>
      `<select data-k="team">${teams.map(t => `<option value="${h(t)}" ${(m.team || 'apps') === t ? 'selected' : ''}>${h(Store.teamName(t))}</option>`).join('')}</select>`;
    const html = card(
      `People <span class="count">${list.length}</span>`,
      `<p class="muted small">People of ${teams.map(t => h(Store.teamName(t))).join(', ')}. You can add people, change names, team and role (up to Team Leader), retire and reset PINs. Managers, admins and permissions stay with the super admin.</p>
      <div class="tbl-scroll"><table class="tbl admin"><thead><tr><th>Full name</th><th>Short</th><th>Employee ID</th><th>Name in ManageEngine</th><th>Team</th><th>Role</th><th>Scored</th><th>Active</th><th>PIN</th></tr></thead><tbody id="plrows">
      ${list
        .map(m =>
          plain(m)
            ? `<tr data-id="${h(m.id)}"><td><input data-k="name" value="${h(m.name)}"></td><td><input data-k="short" value="${h(m.short || '')}"></td><td><input data-k="empId" value="${h(m.empId || '')}"></td><td><input data-k="me" value="${h(m.me || '')}"></td><td>${teamSel(m)}</td><td>${roleSel(m)}</td>
          <td class="ctr"><input type="checkbox" data-k="scored" ${m.scored ? 'checked' : ''}></td><td class="ctr"><input type="checkbox" data-k="active" ${m.active !== false ? 'checked' : ''}></td><td>${Store.pinOf && Store.pinOf(m.id) ? `<button class="btn xs ghost" data-plpin="${h(m.id)}">reset</button>` : '<span class="muted small">none</span>'}</td></tr>`
            : `<tr class="muted"><td>${h(m.name)}</td><td colspan="8" class="small">${h(Store.titleOf(m))} — managed by the super admin</td></tr>`
        )
        .join('')}
      </tbody></table></div><div class="row-btns"><button class="btn" id="pladd">＋ Add person</button><span class="grow"></span><button class="btn primary" id="plsave">Save people</button></div>`
    );
    return {
      html,
      mount(root) {
        root.querySelector('#plsave').onclick = () => {
          const next = Store.members().map(m => Object.assign({}, m));
          root.querySelectorAll('#plrows tr[data-id]').forEach(tr => {
            const m = next.find(x => x.id === tr.dataset.id);
            if (!m) return;
            tr.querySelectorAll('[data-k]').forEach(i => {
              m[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value.trim();
            });
          });
          if (!AdminRole.peopleOk(Store.members(), next, App.me)) return UI.toast('Some of these changes need the super admin', 'bad');
          saveMembersAll(next, 'People saved');
        };
        root.querySelectorAll('[data-plpin]').forEach(
          b =>
            (b.onclick = () =>
              UI.confirm(`Remove the PIN for ${Store.memberName(b.dataset.plpin)}? They choose a new one at their next sign-in.`, () => {
                const id = b.dataset.plpin;
                Store.save({ id: 'userpin-' + id, c: 'userpin', member: id, pin: '' });
                if ((Store.member(id) || {}).pin)
                  saveMembersAll(
                    Store.members().map(x => {
                      if (x.id !== id) return x;
                      x = Object.assign({}, x);
                      delete x.pin;
                      return x;
                    }),
                    'PIN removed'
                  );
                else UI.toast('PIN removed', 'good');
              }))
        );
        root.querySelector('#pladd').onclick = () =>
          UI.modal({
            title: 'Add person',
            body: `<form class="grid-form" id="plnew">${UI.field({ key: 'name', label: 'Full name', type: 'text', required: true }, '')}${UI.field({ key: 'short', label: 'Short name', type: 'text', required: true }, '')}${UI.field({ key: 'empId', label: 'Employee ID (to sign in)', type: 'text' }, '')}${UI.field({ key: 'me', label: 'Name in ManageEngine', type: 'text' }, '')}
          ${UI.field({ key: 'team', label: 'Team', type: 'select', options: teams.map(t => [t, Store.teamName(t)]), blank: false }, teams.includes(App.viewTeam) ? App.viewTeam : teams[0])}${UI.field({ key: 'role', label: 'Role', type: 'select', options: AdminRole.PEOPLE_ROLES.map(r => [r, Store.roleLabel(r)]), blank: false }, 'analyst')}${UI.field({ key: 'scored', label: 'Include in scoring', type: 'bool' }, true)}</form>`,
            actions: '<span class="grow"></span><button class="btn primary" data-ok>Add</button>',
            onMount: w =>
              (w.querySelector('[data-ok]').onclick = () => {
                const v = UI.readForm(w.querySelector('#plnew'), [
                  { key: 'name' },
                  { key: 'short' },
                  { key: 'empId' },
                  { key: 'me' },
                  { key: 'team' },
                  { key: 'role' },
                  { key: 'scored', type: 'bool' },
                ]);
                if (!v.name || !v.short) return UI.toast('Full name and short name are needed', 'bad');
                if (v.empId && Store.members().some(m => App.normId(m.empId) === App.normId(v.empId)))
                  return UI.toast(`Employee ID ${v.empId} already belongs to someone`, 'bad');
                let id = U.slug(v.short || v.name);
                while (Store.members().some(m => m.id === id)) id += '2';
                const p = {
                  id,
                  name: v.name,
                  short: v.short,
                  me: v.me || v.name,
                  empId: v.empId || '',
                  scored: !!v.scored,
                  active: true,
                  aliases: [],
                  role: v.role,
                  team: v.team,
                };
                UI.closeModal();
                saveMembersAll(Store.members().concat([p]), `${v.name} added`);
              }),
          });
      },
    };
  },
  /* ---------- the super admin's Admin home: what Admins changed this week ---------- */
  changesCard() {
    const from = U.addDays(U.todayStr(), -7);
    const admins = new Set(
      Store.members()
        .filter(m => AdminRole.own(m))
        .map(m => m.id)
    );
    if (!admins.size && !Store.delegations().length) return '';
    const rows = ActLog.entries(from, U.todayStr()).filter(e => e.c === 'settings' && !Store.isSuper(e.who) && AdminRole.of(e.who));
    const asks = AdminUI.asks();
    return card(
      `Changes by Admins — last 7 days <span class="count">${rows.length}</span>`,
      `${asks.length ? `<div class="insights warnbox"><div><b>${asks.length} scoring change${asks.length > 1 ? 's' : ''} waiting for you</b> — they would raise the Admin's own score.</div></div>${asks.map(a => `<div class="li"><span class="grow"><b>${h(Store.memberName(a.by))}</b> · scoring for ${h(Store.teamName(a.team))} · their score ${a.before} → ${a.after} <span class="muted small">${U.fmtDate(U.ds(new Date(a._ts)))}</span></span><button class="btn xs primary" data-askok="${h(a.id)}">Approve</button> <button class="btn xs ghost" data-askno="${h(a.id)}">Reject</button></div>`).join('')}` : ''}
      ${
        rows.length
          ? `<div class="li-list">${rows
              .slice(0, 25)
              .map(
                e =>
                  `<div class="li"><span class="grow"><b>${h(Store.memberShort(e.who))}</b> ${h(e.act === 'add' ? 'added' : e.act === 'del' ? 'deleted' : 'changed')} ${h(e.what || e.id)} ${e.fields && e.fields.length ? `<span class="muted small">(${h(e.fields.join(', '))})</span>` : ''}</span><span class="muted small">${U.fmtDate(U.ds(new Date(e.at)))}</span></div>`
              )
              .join('')}</div><p class="small"><a class="link" href="#/admin/system/logs">Change log — undo · Activity log</a></p>`
          : '<p class="muted small">No changes by Admins this week.</p>'
      }`
    );
  },
  /* ---------- workflows: an Admin with "own team" sees and edits only their team's ---------- */
  flowAll() {
    return App.realSuper() || (AdminRole.of(App.me) || {}).reach === 'all';
  },
  flowVisible(w) {
    return AdminUI.flowAll() || AdminRole.teamsOf(App.me).includes(w.team);
  },
  flowTeam() {
    return AdminUI.flowAll() ? '' : AdminRole.teamsOf(App.me)[0] || '';
  },
  flowTeamOpts(teams) {
    return AdminUI.flowAll()
      ? [['', 'Every team']].concat(teams.map(t => [t.id, t.name]))
      : teams.filter(t => AdminRole.teamsOf(App.me).includes(t.id)).map(t => [t.id, t.name]);
  },
  /* ---------- conflict of interest: a scored Admin raising their own score waits for the super admin ---------- */
  asks() {
    return (Store.byC.adminask || []).filter(r => r && !r._del && !r.decided).sort((a, b) => (b._ts || 0) - (a._ts || 0));
  },
  bindChanges(root) {
    root.querySelectorAll('[data-askok]').forEach(
      b =>
        (b.onclick = () => {
          const a = Store.get(b.dataset.askok);
          if (!a) return;
          Store.saveMany([Object.assign({}, a.rec), Object.assign({}, a, { decided: 'approved', decidedOn: U.todayStr() })]);
          UI.toast('Approved — the scoring change is live', 'good');
          App.render(true);
        })
    );
    root.querySelectorAll('[data-askno]').forEach(
      b =>
        (b.onclick = () => {
          const a = Store.get(b.dataset.askno);
          if (!a) return;
          Store.save(Object.assign({}, a, { decided: 'rejected', decidedOn: U.todayStr() }));
          UI.toast('Rejected', 'good');
          App.render(true);
        })
    );
  },
  /* before an Admin saves scoring for their own team: would it raise their own score this year? → ask the super admin instead */
  guardScoring(rec, team) {
    if (App.realSuper() || !AdminRole.any(App.me)) return false;
    const me = Store.members().find(m => m.id === App.me);
    if (!me || !me.scored || (me.team || 'apps') !== team) return false;
    const mo = new Date().getMonth() + 1;
    const y = new Date().getFullYear();
    const score = () => {
      try {
        const s = Calc.score(y, App.me, mo);
        return s && s.score != null ? Math.round(s.score * 10) / 10 : null;
      } catch (e) {
        return null;
      }
    };
    const before = score();
    if (before == null) return false;
    const keep = Store.db.get(rec.id);
    Store.db.set(rec.id, Object.assign({}, rec, { _ts: Date.now() }));
    Calc.invalidate();
    const after = score();
    if (keep) Store.db.set(rec.id, keep);
    else Store.db.delete(rec.id);
    Calc.invalidate();
    if (after == null || after <= before) return false;
    Store.save({ c: 'adminask', id: 'adminask-' + App.me + '-' + Date.now(), by: App.me, team, before, after, rec });
    UI.toast(`This change would raise your own score (${before} → ${after}) — sent to the super admin to approve`, 'warn');
    return true;
  },
};

/* ---------- wiring (the Admin page itself, with its tabs, is in pages/admin-nav.js) ---------- */
(function () {
  // scoring saved by an Admin who is scored in that team: ask the super admin first if it raises their own score
  const ss = Calc.saveScoring;
  Calc.saveScoring = function (team) {
    if (App.realSuper() || !AdminRole.any(App.me)) return ss.apply(Calc, arguments);
    const save = Store.save;
    let rec = null;
    Store.save = r => {
      rec = r;
    };
    try {
      ss.apply(Calc, arguments);
    } finally {
      Store.save = save;
    }
    if (!rec || AdminUI.guardScoring(rec, team)) return;
    return Store.save(rec);
  };
  // the person card: Admin role
  const pc = P.adminperson;
  P.adminperson = id => {
    const out = pc(id);
    const m = Store.member(id);
    if (!m || !App.isSuper()) return out;
    const sm = AdminUI.summary(m);
    if (sm) {
      out.html = out.html.replace('</h1>', `</h1><p>${UI.badge('⛨ Admin', 'good')} <span class="small">${h(sm)}</span></p>`);
      out.html = out.html.replace(
        /(<details class="card guide"><summary><b>Explain access<\/b>[^]*?<\/summary>)/,
        `$1<div class="insights goodbox"><div>⛨ <b>${h(sm)}</b> — an <b>Admin</b> menu with only these areas, on top of the access below.</div></div>`
      );
    }
    out.html += AdminUI.roleCard(m);
    const m0 = out.mount;
    out.mount = root => {
      if (m0) m0(root);
      AdminUI.bindRoleCard(root, m);
    };
    return out;
  };
})();
