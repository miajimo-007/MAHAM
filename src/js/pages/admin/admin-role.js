/* MAHAM — Admin pages for the "Admin" role (access/adminrole.js):
 *  - the super admin gives the role on the person card (areas, own team / all teams, templates)
 *  - an Admin opens Admin and sees only their areas (people: a limited list; workflows: their team's)
 *  - the super admin's Admin home lists what Admins changed this week (and asks before an Admin raises their own score) */
'use strict';

const AdminUI = {
  TAB_AREA: {
    people: 'people',
    lists: 'lists',
    teams: 'teams',
    workflows: 'workflows',
    hdmonths: 'hdmonths',
    feedback: 'feedback',
    scoring: 'scoring',
    activity: 'activity',
    timerules: 'timerules',
  },
  /* ---------- person card: the role ---------- */
  roleCard(m) {
    if (m.superAdmin) return card('Admin role', '<p class="muted small">Super admin — has everything.</p>');
    const on = !!m.admin;
    const areas = new Set(m.adminAreas || []);
    const tpl = AdminRole.templates();
    return card(
      'Admin role',
      `<p class="muted small">An Admin keeps working as ${h(Store.roleLabel(m.role || 'analyst'))} and gets an <b>Admin</b> menu with only the areas ticked here. Only you can give it. Changes they make go live at once, are in the Activity and Change logs, and you can undo them.</p>
      <label class="check"><input type="checkbox" id="ar-on" ${on ? 'checked' : ''}> <b>Admin</b></label>
      <div id="ar-box" ${on ? '' : 'hidden'}>
        <div class="row-btns" style="margin:8px 0"><label class="small">Reach</label><select id="ar-reach"><option value="team" ${m.adminReach !== 'all' ? 'selected' : ''}>Own team only (${h(Store.teamName(m.team || 'apps'))})</option><option value="all" ${m.adminReach === 'all' ? 'selected' : ''}>All teams</option></select>
          ${tpl.length ? `<select id="ar-tpl"><option value="">Use a template…</option>${tpl.map(t => `<option value="${h(t.id)}">${h(t.name)}</option>`).join('')}</select>` : ''}</div>
        <div class="ar-areas">${AdminRole.AREAS.map(([k, l, d]) => `<label class="check" title="${h(d)}"><input type="checkbox" data-area="${k}" ${areas.has(k) ? 'checked' : ''}> ${h(l)} <span class="muted small">— ${h(d)}</span></label>`).join('')}</div>
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
    const read = () => ({
      areas: [...root.querySelectorAll('[data-area]')].filter(i => i.checked).map(i => i.dataset.area),
      reach: root.querySelector('#ar-reach').value,
    });
    const tsel = root.querySelector('#ar-tpl');
    if (tsel)
      tsel.onchange = () => {
        const t = AdminRole.templates().find(x => x.id === tsel.value);
        if (!t) return;
        root.querySelectorAll('[data-area]').forEach(i => (i.checked = (t.areas || []).includes(i.dataset.area)));
        root.querySelector('#ar-reach').value = t.reach === 'all' ? 'all' : 'team';
      };
    root.querySelector('#ar-savetpl').onclick = () => {
      const v = read();
      if (!v.areas.length) return UI.toast('Tick at least one area', 'bad');
      UI.modal({
        title: 'Save as a template',
        body: `<p class="muted small">${v.areas.map(a => h(AdminRole.label(a))).join(', ')} · ${v.reach === 'all' ? 'all teams' : 'own team'}</p><input id="ar-tname" placeholder="e.g. Manager-Admin" style="width:100%">`,
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
      if (isOn && v.areas.includes('teams') && v.reach !== 'all') return UI.toast('“Teams & departments” needs “All teams”', 'bad');
      saveMembersAll(
        Store.members().map(x => {
          if (x.id !== m.id) return x;
          const y = Object.assign({}, x);
          if (isOn) {
            y.admin = true;
            y.adminAreas = v.areas;
            y.adminReach = v.reach;
          } else {
            delete y.admin;
            delete y.adminAreas;
            delete y.adminReach;
          }
          return y;
        }),
        isOn ? `${m.name} is an Admin (${v.areas.length} area${v.areas.length > 1 ? 's' : ''})` : `${m.name} is no longer an Admin`
      );
    };
  },
  saveTemplate(name, v) {
    name = String(name || '').trim();
    if (!name) return;
    const list = AdminRole.templates()
      .filter(t => t.name !== name)
      .concat([{ id: U.uid('atpl'), name, areas: v.areas, reach: v.reach }]);
    Store.save(Object.assign({}, Store.get('settings-admintemplates') || { id: 'settings-admintemplates', c: 'settings' }, { list }));
    UI.toast(`Template “${name}” saved`, 'good');
  },

  /* ---------- the limited Admin's head (only their tabs) ---------- */
  head(tab, tabs) {
    return `<div class="adm-top"><div class="tabs adm-tabs">${tabs.map(([k, n]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/admin/${k}">${n}</a>`).join('')}</div></div>
      <div class="insights"><div>⛨ You are an <b>Admin</b> for ${
        AdminRole.of(App.me).reach === 'all'
          ? '<b>all teams</b>'
          : AdminRole.teamsOf(App.me)
              .map(t => `<b>${h(Store.teamName(t))}</b>`)
              .join(', ')
      }. What you change goes live at once and is in the Activity log.</div></div>`;
  },
  homeLite(tabs) {
    const mine = AdminRole.mine();
    return {
      html: card(
        'Your Admin areas',
        `<div class="li-list">${mine
          .map(a => {
            const t = Object.entries(AdminUI.TAB_AREA).find(([, x]) => x === a);
            const href = a === 'syscheck' ? '#/syscheck' : a === 'announcements' ? '#/announcements' : t ? '#/admin/' + t[0] : '';
            return `<div class="li"><span class="grow"><b>${h(AdminRole.label(a))}</b> <span class="muted small">${h((AdminRole.AREAS.find(x => x[0] === a) || [])[2] || '')}</span></span>${href ? `<a class="btn xs" href="${href}">Open</a>` : ''}</div>`;
          })
          .join('')}</div>`
      ),
    };
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
              .join(
                ''
              )}</div><p class="small"><a class="link" href="#/admin/log">Change log — undo</a> · <a class="link" href="#/admin/activity">Activity log</a></p>`
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

/* ---------- wiring ---------- */
(function () {
  const rules = ADMIN_GROUPS.find(g => g[0] === 'Rules');
  if (rules && !rules[1].some(t => t[0] === 'timerules')) {
    rules[1].unshift(['timerules', 'Time rules & holidays']);
    ADMIN_TABS.push(['timerules', 'Time rules & holidays']);
  }
  ADMIN_FIND.push(
    ['Time rules — when work is late, working days, holidays, escalation', 'timerules'],
    ['Admin role — give someone some admin areas', 'people'],
    ['Admin templates', 'people']
  );
  const base = P.admin;
  P.admin = sub => {
    const timeRules = () => (typeof TimeRulesUI !== 'undefined' ? TimeRulesUI.page() : { html: empty('Time rules are not available.') });
    if (App.isSuper()) {
      if (sub === 'timerules') {
        const pg = timeRules();
        return {
          title: 'Admin',
          html: adminHead('timerules') + pg.html,
          mount(root) {
            bindAdminSearch(root);
            if (pg.mount) pg.mount(root);
          },
        };
      }
      const out = base(sub);
      if (!sub || sub === 'home') {
        const ch = AdminUI.changesCard();
        if (ch) {
          out.html = out.html.replace(/(<\/div><\/div>)/, '$1' + ch);
          const m0 = out.mount;
          out.mount = root => {
            if (m0) m0(root);
            AdminUI.bindChanges(root);
          };
        }
      }
      return out;
    }
    if (!AdminRole.any(App.me)) return base(sub);
    // a limited Admin: only their areas, only their teams
    const mine = AdminRole.mine();
    const teams = AdminRole.teamsOf(App.me);
    if (teams.length && !teams.includes(App.viewTeam)) App.setViewTeam(teams[0]);
    const tabs = [['home', 'Home']].concat(
      ADMIN_TABS.filter(([k]) => AdminUI.TAB_AREA[k] && mine.includes(AdminUI.TAB_AREA[k])).map(([k, n]) => [
        k,
        k === 'scoring' ? 'Scoring' : n,
      ])
    );
    const tab = tabs.some(t => t[0] === sub) ? sub : 'home';
    if (tab !== 'workflows' && typeof WF !== 'undefined') {
      WF.draft = null;
      WF.maps = {};
    }
    const settingsPart = keep => {
      const x = P.settings('lists');
      return {
        html: x.html,
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
        },
      };
    };
    const pg = {
      home: () => AdminUI.homeLite(tabs),
      people: AdminUI.peopleLite,
      lists: () => settingsPart(['lists']),
      scoring: () => adminJoin(adminScoring(), settingsPart(['scoring'])),
      teams: adminTeams,
      workflows: () => (WF.draft ? adminFlows() : adminJoin(adminTodoFlows(), adminFlows())),
      hdmonths: adminHdMonths,
      feedback: adminFeedback,
      activity: adminActivity,
      timerules: timeRules,
    }[tab]();
    return {
      title: 'Admin',
      html: AdminUI.head(tab, tabs) + pg.html,
      mount(root) {
        if (pg.mount) pg.mount(root);
      },
    };
  };
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
    out.html += AdminUI.roleCard(m);
    const m0 = out.mount;
    out.mount = root => {
      if (m0) m0(root);
      AdminUI.bindRoleCard(root, m);
    };
    return out;
  };
})();
