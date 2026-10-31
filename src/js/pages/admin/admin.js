/* DARRIK — Admin (super admin only): tabs Home · People · Permissions · Teams · Leave · Months · Scoring · Data · Log.
 * Home / Months / Scoring / Data / Log are in admin-tools.js, Permissions in admin-perms.js, the person card in admin-person.js. */
'use strict';

const ADMIN_TABS = [
  ['home', 'Home'],
  ['people', 'People'],
  ['permissions', 'Permissions'],
  ['teams', 'Teams & departments'],
  ['custom', 'Customize'],
  ['workflows', 'Workflows'],
  ['lists', 'Lists & scoring'],
  ['scoring', 'Scoring'],
  ['feedback', 'Feedback'],
  ['data', 'Data'],
  ['log', 'Change log'],
];
/* what the search box finds besides people and teams */
const ADMIN_FIND = [
  ['Request types', 'teams'],
  ['Team function access', 'teams'],
  ['Add person', 'people'],
  ['Bulk edit people', 'people'],
  ['Bulk add people', 'people'],
  ['Onboarding checklist', 'people'],
  ['Permission matrix', 'permissions'],
  ['Permission templates', 'permissions'],
  ['Manager leave / delegation', 'leave'],
  ['Lock or unlock a month', 'months'],
  ['Scoring weights what-if', 'scoring'],
  ['Technician names (ManageEngine)', 'data'],
  ['Duplicates', 'data'],
  ['Test data', 'data'],
  ['Open work with retired people', 'data'],
  ['Export everything to Excel', 'data'],
  ['Backup settings', 'data'],
  ['Change log / undo', 'log'],
  ['Usage — who opens the app', 'home'],
  ['Reminders / message a team', 'home'],
  ['Dropdown lists, scoring rules, board columns, project categories', 'lists'],
  ['System Check, backups, ignored changes', '#/syscheck'],
  ['Announcements', '#/announcements'],
  ['Import old data', '#/importdata'],
];

function adminHead(tab) {
  return `<div class="adm-top"><div class="tabs">${ADMIN_TABS.map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/admin/${k}">${l}</a>`).join('')}</div>
    <div class="adm-search"><input id="adsearch" type="search" placeholder="🔎 Find a person, team or setting…" autocomplete="off"><div id="adresults" class="adm-results" hidden></div></div></div>`;
}
function bindAdminSearch(root) {
  const inp = root.querySelector('#adsearch'),
    out = root.querySelector('#adresults');
  if (!inp) return;
  const go = href => {
    location.hash = href;
  };
  inp.oninput = () => {
    const q = U.lc(inp.value);
    if (!q) {
      out.hidden = true;
      return;
    }
    const hits = [
      ...Store.members()
        .filter(m => [m.name, m.short, m.me, m.id, ...(m.aliases || [])].some(x => U.lc(x).includes(q)))
        .slice(0, 8)
        .map(m => [
          `👤 ${m.name}`,
          `${Store.roleLabel(m.role)}${Store.topRole(m.role) ? '' : ' · ' + Store.teamName(m.team || 'apps')}${m.active === false ? ' · retired' : ''}`,
          '#/adminperson/' + m.id,
        ]),
      ...Store.teams()
        .filter(t => U.lc(t.name).includes(q) || t.id.includes(q))
        .map(t => [`👥 ${t.name}`, 'team', '#/admin/teams']),
      ...ADMIN_FIND.filter(([l]) => U.lc(l).includes(q)).map(([l, t]) => [
        `⚙ ${l}`,
        t.startsWith('#') ? t.slice(2) : 'Admin → ' + (ADMIN_TABS.find(x => x[0] === t) || ['', t])[1],
        t.startsWith('#') ? t : '#/admin/' + t,
      ]),
    ];
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
      if (a) go(a.getAttribute('href'));
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
}

/* changes that deserve a second look before saving the people list */
function riskyChanges(before, after) {
  const old = new Map(before.map(m => [m.id, m]));
  const out = [];
  for (const m of after) {
    const o = old.get(m.id);
    if (!o) continue;
    if (o.superAdmin && !m.superAdmin) out.push(`${m.name} will no longer be super admin`);
    if (o.role === 'manager' && o.active !== false && m.active === false) {
      const w = Admin.workCount(Admin.openWork(m.id));
      out.push(
        `${m.name} (manager of ${Store.teamName(o.team)}) will be retired${w ? ` — ${w} open item(s) are still with them (use Offboard on their card to hand them over)` : ''}`
      );
    } else if (o.active !== false && m.active === false) {
      const w = Admin.workCount(Admin.openWork(m.id));
      if (w) out.push(`${m.name} will be retired with ${w} open item(s) still with them`);
    }
    if (o.role === 'manager' && m.role !== 'manager' && m.active !== false)
      out.push(`${m.name} will stop being manager of ${Store.teamName(o.team)}`);
    if (o.role === 'manager' && m.role === 'manager' && (o.team || 'apps') !== (m.team || 'apps'))
      out.push(`${m.name} moves from managing ${Store.teamName(o.team)} to ${Store.teamName(m.team)}`);
    if (Store.topRole(o.role) && !Store.topRole(m.role)) out.push(`${m.name} will no longer be ${Store.roleLabel(o.role)}`);
  }
  return out;
}
/* records of a person that belong to a team (this year): moved with them when they change team */
function teamRecordsOf(id, year) {
  const y = String(year || new Date().getFullYear());
  const inY = d => String(d || '').slice(0, 4) === y;
  const date = r => r.assigned || r.date || r.created || r.from || r.expected || '';
  return [...Store.TEAM_SCOPED]
    .filter(c => c !== 'scoresnap')
    .flatMap(c =>
      Store.all(c, '*').filter(
        r => (r.analyst === id || r.requester === id || (c === 'helpdesk' && Store.memberByMeName(r.technician) === id)) && inY(date(r))
      )
    );
}
function saveMembersChecked(list, msg, done) {
  if (!list.some(m => m.superAdmin)) return UI.toast('At least one super admin is needed', 'bad');
  const risky = riskyChanges(Store.members(), list);
  const old = new Map(Store.members().map(m => [m.id, m]));
  const moved = list.filter(m => {
    const o = old.get(m.id);
    return o && !Store.topRole(m.role) && !Store.topRole(o.role) && (o.team || 'apps') !== (m.team || 'apps');
  });
  const askMove = () => {
    if (!moved.length) return;
    const rows = moved
      .map(m => ({ m, recs: teamRecordsOf(m.id).filter(r => (r.team || 'apps') !== (m.team || 'apps')) }))
      .filter(x => x.recs.length);
    if (!rows.length) return;
    UI.modal({
      title: 'Move their records too?',
      body: `<p class="muted small">So the new team's dashboards and scores include this year's work. Earlier years stay with the old team.</p>${rows.map((x, i) => `<label class="check"><input type="checkbox" data-mv="${i}" checked> <span><b>${h(x.m.name)}</b> → ${h(Store.teamName(x.m.team))} <span class="muted small">${x.recs.length} record(s) this year (To Do, shadow work, help desk, attendance, quick wins, requests…)</span></span></label>`).join('')}`,
      actions: `<span class="grow"></span><button class="btn" data-c>Keep them in the old team</button><button class="btn primary" data-ok>Move</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const recs = rows
            .filter((x, i) => w.querySelector(`[data-mv="${i}"]`).checked)
            .flatMap(x => x.recs.map(r => Object.assign({}, r, { team: x.m.team || 'apps' })));
          if (recs.length) Store.saveMany(recs);
          UI.closeModal();
          UI.toast(`${recs.length} record(s) moved`, 'good');
          App.render();
        };
      },
    });
  };
  const go = () => {
    saveMembersAll(list, msg);
    if (done) done();
    askMove();
  };
  if (risky.length) UI.confirm('Please check before saving: ' + risky.join(' · '), go);
  else go();
}

/* several admin sections on one tab */
function adminJoin(...parts) {
  return {
    html: parts.map(p => p.html).join(''),
    mount(root) {
      for (const p of parts) if (p.mount) p.mount(root);
    },
  };
}

P.admin = sub => {
  if (!App.isSuper())
    return { title: 'Not available', html: '<div class="card"><p>You don\'t have permission to see this page.</p></div>' };
  if (sub === 'leave') sub = 'people';
  if (sub === 'months') sub = 'scoring'; // folded into People / Scoring
  const tab = ADMIN_TABS.some(t => t[0] === sub) ? sub : 'home';
  if (tab !== 'workflows' && typeof WF !== 'undefined') {
    WF.draft = null;
    WF.maps = {};
  }
  const pg = {
    lists: () => {
      const x = P.settings('lists');
      return adminJoin({ html: x.html, mount: x.mount }, adminUserDepts());
    },
    home: adminHome,
    people: () => adminJoin(adminPeople(), adminLeave()),
    permissions: adminPerms,
    teams: adminTeams,
    custom: adminCustom,
    workflows: adminFlows,
    feedback: adminFeedback,
    scoring: () => adminJoin(adminMonths(), adminScoreMonths(), adminScoring()),
    data: adminData,
    log: adminLog,
  }[tab]();
  return {
    title: 'Admin',
    html: adminHead(tab) + pg.html,
    mount(root) {
      bindAdminSearch(root);
      if (pg.mount) pg.mount(root);
    },
  };
};

/* ---------------- People ---------------- */
function adminPeople() {
  const teams = Store.teams();
  const all = Store.members();
  const roleSel = m =>
    `<select data-k="role">${Store.rolesFor(m.role || 'analyst')
      .map(([v, l]) => `<option value="${v}" ${(m.role || 'analyst') === v ? 'selected' : ''}>${l}</option>`)
      .join('')}</select>`;
  const teamSel = m =>
    Store.topRole(m.role)
      ? '<span class="muted small">All teams</span>'
      : `<select data-k="team"><option value="">— (director / AED)</option>${teams.map(t => `<option value="${h(t.id)}" ${(m.team || 'apps') === t.id ? 'selected' : ''}>${h(t.name)}</option>`).join('')}</select>`;
  const sorted = [...all].sort(
    (a, b) =>
      (Store.topRole(a.role) ? 0 : 1) - (Store.topRole(b.role) ? 0 : 1) ||
      String(a.team || '').localeCompare(String(b.team || '')) ||
      (b.role === 'manager') - (a.role === 'manager') ||
      a.name.localeCompare(b.name)
  );
  const onb = Admin.notOnboarded();
  const html = `<div class="insights"><div>⛨ <b>Super admin</b> — only you can see this page. Nobody else can see that you are super admin. Hidden people are invisible to everyone but you; their data is kept and they sign in with “Not listed? Sign in by name” + PIN. Click a name for the person's card (open work, onboarding, offboarding, view as).</div></div>
  ${
    onb.length
      ? card(
          `Onboarding not finished <span class="count">${onb.length}</span>`,
          onb
            .map(
              m =>
                `<div class="li click" data-goperson="${h(m.id)}"><b class="grow">${h(m.name)}</b>${Admin.onboarding(m)
                  .map(
                    ([l, ok, info]) =>
                      `<span class="chk ${ok ? 'ok' : info ? 'info' : 'no'}" title="${h(l)}">${ok ? '✓' : info ? '–' : '✗'} ${h(l)}</span>`
                  )
                  .join('')}</div>`
            )
            .join('')
        )
      : ''
  }
  ${card(
    `People <span class="count">${all.length}</span>`,
    `<div class="bulkbar" id="bulkbar"><b id="bulkn">0 selected</b>
      <select id="bulkop"><option value="">With selected…</option><optgroup label="Team">${teams.map(t => `<option value="team:${h(t.id)}">Move to ${h(t.name)}</option>`).join('')}</optgroup><optgroup label="Role">${Store.rolesFor(
        'analyst'
      )
        .filter(([v]) => !Store.topRole(v))
        .map(([v, l]) => `<option value="role:${v}">Make ${h(l)}</option>`)
        .join('')}</optgroup>
        <optgroup label="Switches"><option value="active:1">Active</option><option value="active:0">Retire (not active)</option><option value="scored:1">Scored</option><option value="scored:0">Not scored</option><option value="hidden:1">Hidden</option><option value="hidden:0">Not hidden</option></optgroup></select>
      <button class="btn sm" id="bulkapply">Apply</button><span class="muted small">Changes the rows below — then press <b>Save people</b>.</span></div>
    <div class="tbl-scroll"><table class="tbl admin"><thead><tr><th class="ctr"><input type="checkbox" id="selall" aria-label="Select all"></th><th>Full name</th><th>Short</th><th>Name in ManageEngine</th><th>Team</th><th>Role</th><th class="ctr">Scored</th><th class="ctr">Active</th><th class="ctr">Hidden</th><th class="ctr">Super admin</th><th>PIN</th><th>Access</th></tr></thead><tbody id="adminrows">
    ${sorted
      .map(
        m => `<tr data-id="${h(m.id)}" class="${m.hidden ? 'hid' : ''}"><td class="ctr"><input type="checkbox" data-sel aria-label="Select ${h(m.name)}"></td><td class="nw"><input value="${h(m.name)}" data-k="name"> <a class="link small" href="#/adminperson/${h(m.id)}" title="Open card">card →</a></td><td><input value="${h(m.short || '')}" data-k="short"></td><td><input value="${h(m.me || '')}" data-k="me"></td><td>${teamSel(m)}</td><td>${roleSel(m)}</td>
      <td class="ctr"><input type="checkbox" data-k="scored" ${m.scored ? 'checked' : ''}></td><td class="ctr"><input type="checkbox" data-k="active" ${m.active !== false ? 'checked' : ''}></td><td class="ctr"><input type="checkbox" data-k="hidden" ${m.hidden ? 'checked' : ''}></td>
      <td class="ctr"><input type="checkbox" data-k="superAdmin" ${m.superAdmin ? 'checked' : ''} ${m.id === App.me ? 'disabled title="You cannot remove your own super admin"' : ''}></td>
      <td>${Store.pinOf(m.id) ? `<button class="btn xs ghost" data-rpin="${h(m.id)}">reset</button>` : '<span class="muted small">none</span>'}</td><td class="nw"><button class="btn xs" data-perm="${h(m.id)}">Permissions</button> <button class="btn xs ${m.pages && Object.keys(m.pages).length ? 'primary' : ''}" data-pfun="${h(m.id)}">Functions</button></td></tr>`
      )
      .join('')}
    </tbody></table></div>
    <div class="row-btns"><button class="btn" id="addperson">＋ Add person</button><button class="btn" id="bulkadd">＋ Add several</button><span class="grow"></span><button class="btn primary" id="savepeople">Save people</button></div>
    <p class="muted small">Untick <b>Active</b> to retire someone (their past data stays) — better: use <b>Offboard</b> on their card to hand over their open work first. Directors see all teams and only the tasks they gave. "Scored" = included in team scores. A highlighted Functions button = this person has exceptions.</p>`
  )}`;
  return {
    html,
    mount(root) {
      root.querySelectorAll('[data-goperson]').forEach(
        el =>
          (el.onclick = () => {
            location.hash = '#/adminperson/' + el.dataset.goperson;
          })
      );
      const sels = () => [...root.querySelectorAll('[data-sel]:checked')].map(c => c.closest('tr'));
      const upd = () => {
        root.querySelector('#bulkn').textContent = sels().length + ' selected';
        root.querySelector('#bulkbar').classList.toggle('on', sels().length > 0);
      };
      root.querySelectorAll('[data-sel]').forEach(c => (c.onchange = upd));
      root.querySelector('#selall').onchange = e => {
        root.querySelectorAll('[data-sel]').forEach(c => {
          c.checked = e.target.checked;
        });
        upd();
      };
      root.querySelector('#bulkapply').onclick = () => {
        const op = root.querySelector('#bulkop').value;
        const rows = sels();
        if (!op || !rows.length) return UI.toast('Select people and an action', 'bad');
        const [k, v] = op.split(':');
        for (const tr of rows) {
          const el = tr.querySelector(`[data-k="${k}"]`);
          if (!el) continue;
          if (el.type === 'checkbox') {
            if (!el.disabled) el.checked = v === '1';
          } else el.value = v;
          tr.classList.add('changed');
        }
        UI.toast(`Applied to ${rows.length} row(s) — press Save people`, 'good');
      };
      root.querySelector('#savepeople').onclick = () => {
        const edits = {};
        root.querySelectorAll('#adminrows tr').forEach(tr => {
          const e = (edits[tr.dataset.id] = {});
          tr.querySelectorAll('[data-k]').forEach(inp => {
            e[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : inp.value.trim();
          });
        });
        const list = Store.members().map(m => {
          const e = edits[m.id];
          if (!e) return m;
          const x = Object.assign({}, m, e);
          if (m.id === App.me) x.superAdmin = true;
          if (Store.topRole(x.role)) {
            x.team = '';
            x.scored = false;
          } else if (!x.team) x.team = m.team || 'apps';
          if (!x.name) x.name = m.name;
          return x;
        });
        saveMembersChecked(list, 'People saved');
      };
      root.querySelector('#addperson').onclick = () => addPersonDialog();
      root.querySelector('#bulkadd').onclick = () => bulkAddDialog();
      root.querySelectorAll('[data-perm]').forEach(b => (b.onclick = () => editPerms(b.dataset.perm)));
      root.querySelectorAll('[data-pfun]').forEach(b => (b.onclick = () => editPersonFunctions(b.dataset.pfun)));
      root.querySelectorAll('[data-rpin]').forEach(b => (b.onclick = () => resetPin(b.dataset.rpin)));
    },
  };
}
function resetPin(id) {
  UI.confirm(`Remove the PIN for ${Store.memberName(id)}?`, () => {
    Store.save({ id: 'userpin-' + id, c: 'userpin', member: id, pin: '' });
    if ((Store.member(id) || {}).pin)
      saveMembersAll(
        Store.members().map(x => {
          if (x.id === id) {
            x = Object.assign({}, x);
            delete x.pin;
          }
          return x;
        }),
        'PIN removed'
      );
    else {
      UI.toast('PIN removed', 'good');
      App.render();
    }
  });
}
function newPerson(v) {
  let id = U.slug(v.short || v.name);
  while (Store.members().some(m => m.id === id)) id += '2';
  const role = v.role || 'analyst';
  return {
    id,
    name: v.name,
    short: v.short || v.name.split(' ')[0],
    me: v.me || v.name,
    role,
    team: Store.topRole(role) ? '' : v.team || 'apps',
    scored: (role === 'analyst' || role === 'teamleader') && v.scored !== false,
    active: true,
    hidden: !!v.hidden,
    aliases: [],
  };
}
function addPersonDialog() {
  UI.modal({
    title: 'Add person',
    body: `<form class="grid-form" id="npf">
      ${UI.field({ key: 'name', label: 'Full name', type: 'text', required: true }, '')}${UI.field({ key: 'short', label: 'Short name', type: 'text', required: true }, '')}
      ${UI.field({ key: 'me', label: 'Name in ManageEngine (Technician)', type: 'text' }, '')}
      ${UI.field({ key: 'role', label: 'Role', type: 'select', options: Store.rolesFor('analyst'), blank: false }, 'analyst')}
      ${UI.field({ key: 'team', label: 'Team (not for directors)', type: 'select', options: Store.teams().map(t => [t.id, t.name]), blank: false }, App.viewTeam)}
      ${UI.field({ key: 'scored', label: 'Include in scoring (analysts)', type: 'bool' }, true)}${UI.field({ key: 'hidden', label: 'Hidden from others', type: 'bool' }, false)}</form>
      <p class="muted small">Next: they open the app, pick their name and set a PIN. Their card shows what is still missing.</p>`,
    actions: `<span class="grow"></span><button class="btn primary" data-ok>Add</button>`,
    onMount: w =>
      (w.querySelector('[data-ok]').onclick = () => {
        const v = UI.readForm(w.querySelector('#npf'), [
          { key: 'name' },
          { key: 'short' },
          { key: 'me' },
          { key: 'role' },
          { key: 'team' },
          { key: 'scored', type: 'bool' },
          { key: 'hidden', type: 'bool' },
        ]);
        if (!v.name || !v.short) return UI.toast('Full name and short name are needed', 'bad');
        const p = newPerson(v);
        UI.closeModal();
        saveMembersAll(Store.members().concat([p]), `${v.name} added`);
        location.hash = '#/adminperson/' + p.id;
      }),
  });
}
/* paste lines: Full name ; Short name ; Team ; Role ; Name in ManageEngine */
function bulkAddDialog() {
  const tByName = s => {
    const k = U.lc(s);
    const t = Store.teams().find(x => U.lc(x.name) === k || x.id === k);
    return t ? t.id : '';
  };
  const rByName = s => {
    const k = U.lc(s).replace(/\s/g, '');
    const r = Store.ROLES.find(([v, l]) => v === k || U.lc(l).replace(/\s/g, '') === k);
    return r ? r[0] : '';
  };
  const parse = txt =>
    txt
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => {
        const p = l.split(/[;\t]/).map(x => x.trim());
        return {
          name: p[0],
          short: p[1] || '',
          teamIn: p[2] || '',
          team: tByName(p[2] || '') || App.viewTeam,
          roleIn: p[3] || '',
          role: rByName(p[3] || 'analyst') || 'analyst',
          me: p[4] || '',
        };
      });
  UI.modal({
    title: 'Add several people',
    wide: true,
    body: `<p class="muted small">One person per line: <b>Full name ; Short name ; Team ; Role ; Name in ManageEngine</b> (only the full name is needed; you can paste columns from Excel). Teams: ${h(
      Store.teams()
        .map(t => t.name)
        .join(', ')
    )}. Roles: Analyst, Team Leader, Manager.</p>
    <textarea id="bulktxt" rows="8" style="width:100%" placeholder="Sara Ahmed Alharbi ; Sara ; LAB ; Analyst ; Alharbi, Sara"></textarea><div id="bulkprev"></div>`,
    actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Add</button>`,
    onMount: w => {
      const ta = w.querySelector('#bulktxt');
      const prev = w.querySelector('#bulkprev');
      const show = () => {
        const rows = parse(ta.value);
        prev.innerHTML = rows.length
          ? `<table class="tbl"><thead><tr><th>Full name</th><th>Short</th><th>Team</th><th>Role</th><th></th></tr></thead><tbody>${rows
              .map(r => {
                const dup = Store.members().some(m => U.lc(m.name) === U.lc(r.name));
                return `<tr><td>${h(r.name)}</td><td>${h(r.short || r.name.split(' ')[0])}</td><td>${h(Store.teamName(r.team))}${r.teamIn && !tByName(r.teamIn) ? ' <span class="t-warn small">(“' + h(r.teamIn) + '” not found)</span>' : ''}</td><td>${h(Store.roleLabel(r.role))}</td><td>${dup ? '<span class="t-warn small">already exists — skipped</span>' : ''}</td></tr>`;
              })
              .join('')}</tbody></table>`
          : '';
      };
      ta.oninput = show;
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelector('[data-ok]').onclick = () => {
        const list = Store.members().slice();
        let n = 0;
        for (const r of parse(ta.value)) {
          if (list.some(m => U.lc(m.name) === U.lc(r.name))) continue;
          let id = U.slug(r.short || r.name);
          while (list.some(m => m.id === id)) id += '2';
          list.push(Object.assign(newPerson(r), { id }));
          n++;
        }
        if (!n) return UI.toast('Nobody new to add', 'bad');
        UI.closeModal();
        saveMembersAll(list, `${n} people added`);
      };
    },
  });
}

/* ---------------- Teams, request types, organisation levels ---------------- */
function adminTeams() {
  const teams = Store.teams();
  const all = Store.members();
  const depts = Store.depts();
  const dirs = all.filter(m => m.role === 'director' && m.active !== false);
  const html = `${card(
    'Teams',
    `<table class="tbl"><thead><tr><th>Team ID</th><th>Name</th><th>Department</th><th>Manager</th><th class="num">People</th><th>Function access</th><th></th></tr></thead><tbody id="teamlist">${teams
      .map(
        t =>
          `<tr data-t="${h(t.id)}"><td class="mono">${h(t.id)}</td><td><input value="${h(t.name)}" data-tn></td><td><select data-tdept>${depts.map(d => `<option value="${h(d.id)}" ${Store.deptOfTeam(t.id).id === d.id ? 'selected' : ''}>${h(d.name)}</option>`).join('')}</select></td><td>${Store.teamManager(t.id) ? h(Store.teamManager(t.id).name) : '<span class="t-warn">none — set a manager in People</span>'}</td><td class="num">${all.filter(m => !Store.topRole(m.role) && (m.team || 'apps') === t.id && m.active !== false).length}</td><td class="small">${(() => {
            const v = Store.PAGES.filter(([k]) => Store.teamLevel(t.id, k) !== 'edit').map(
              ([k, l]) => `${l}: ${Store.teamLevel(t.id, k) === 'hide' ? 'hidden' : 'view only'}`
            );
            return v.length ? h(v.join(' · ')) : '<span class="muted">all Edit</span>';
          })()}</td><td><button class="btn xs" data-tfun="${h(t.id)}">Functions</button></td></tr>`
      )
      .join('')}</tbody></table>
    <div class="row-btns"><button class="btn" id="addteam">＋ Add team</button><span class="grow"></span><button class="btn primary" id="saveteams">Save teams</button></div><p class="muted small">Dropdown lists, scoring rules and board columns per team are in <a class="link" href="#/admin/lists">Lists &amp; scoring</a>.</p>`
  )}
  ${card(
    'Request types',
    `<p class="muted small">What people can ask for in <b>Requests</b>. "Director" = needs the director's final approval after the manager. "Attendance" = when approved, days are marked OFF (or permission hours added).</p>
    <table class="tbl"><thead><tr><th>Name</th><th>Asks for</th><th class="ctr">Director</th><th class="ctr">Attendance</th><th></th></tr></thead><tbody id="rqtypes">${Requests.types()
      .map(
        t =>
          `<tr data-rt="${h(t.id)}"><td><input value="${h(t.label)}" data-k="label"></td><td><select data-k="kind">${[
            ['days', 'Dates (days)'],
            ['hours', 'Date + hours'],
            ['other', 'Just a request'],
          ]
            .map(([v, l]) => `<option value="${v}" ${t.kind === v ? 'selected' : ''}>${l}</option>`)
            .join(
              ''
            )}</select></td><td class="ctr"><input type="checkbox" data-k="director" ${t.director ? 'checked' : ''}></td><td class="ctr"><input type="checkbox" data-k="attendance" ${t.attendance ? 'checked' : ''}></td><td><button class="btn xs ghost" data-rtdel="${h(t.id)}">Remove</button></td></tr>`
      )
      .join('')}</tbody></table>
    <div class="row-btns"><button class="btn" id="addrt">＋ Add type</button><span class="grow"></span><button class="btn primary" id="savert">Save request types</button></div>`
  )}
  ${card(
    `Departments <span class="count">${depts.length}</span>`,
    `<p class="muted small">The AED is over every department; each director runs a department and sees only its teams (pick each team's department in the table above). To add another director, add the person in People with the role Director, then choose him here.</p>
    <table class="tbl"><thead><tr><th>Department</th><th>Director</th><th>Teams</th><th></th></tr></thead><tbody id="deptlist">${depts.map(d => `<tr data-dept="${h(d.id)}"><td><input value="${h(d.name)}" data-dn></td><td><select data-dd><option value="">— none —</option>${dirs.map(m => `<option value="${h(m.id)}" ${d.director === m.id ? 'selected' : ''}>${h(m.name)}</option>`).join('')}</select></td><td class="small">${h(d.teams.map(Store.teamName).join(', ') || '—')}</td><td>${depts.length > 1 && !d.teams.length ? `<button class="btn xs ghost" data-deptdel="${h(d.id)}">Remove</button>` : ''}</td></tr>`).join('')}</tbody></table>
    <div class="row-btns"><button class="btn" id="adddept">＋ Add department</button><span class="grow"></span><button class="btn primary" id="savedepts">Save departments</button></div>`
  )}
  <div class="oneline">The app name, logo, colours, menu, words and targets are in <a class="link" href="#/admin/custom">Admin → Customize</a>.</div>
  ${card(
    'App version',
    `<p class="muted small">You are using <b>${h(APP_VERSION)}</b>. Require a minimum version so that out-of-date copies stop saving: they show a red bar asking the person to copy the new file, and anything they still manage to save is ignored (listed in System Check). Copy the new DARRIK.html into the shared folder first.</p>
    <form class="grid-form" id="mvf">${UI.field({ key: 'minVersion', label: 'Minimum version allowed to save', type: 'text', placeholder: 'none' }, Store.minVersion())}</form>
    <div class="row-btns"><button class="btn ghost" id="mvnow">Require ${h(APP_VERSION)}</button><button class="btn ghost" id="mvoff">No minimum</button><span class="grow"></span><button class="btn primary" id="mvsave">Save</button></div>`
  )}
  ${card(
    `Public holidays <span class="count">${Store.holidays().length}</span>`,
    `<p class="muted small">Days off for everyone (besides the weekend — ${h(Custom.weekendName())}, set in Customize): not counted as lazy days or leave days, shown in Attendance. Add Eid, National Day, Founding Day…</p>
    <table class="tbl"><thead><tr><th>From</th><th>To</th><th>Name</th><th></th></tr></thead><tbody id="hollist">${Store.holidays()
      .slice()
      .sort((a, b) => (b.from || '').localeCompare(a.from || ''))
      .map(
        x =>
          `<tr><td><input type="date" value="${h(x.from || '')}" data-hf></td><td><input type="date" value="${h(x.to || '')}" data-ht></td><td><input value="${h(x.name || '')}" data-hn></td><td><button class="btn xs ghost" data-holdel>Remove</button></td></tr>`
      )
      .join('')}</tbody></table>
    <div class="row-btns"><button class="btn" id="addhol">＋ Add holiday</button><span class="grow"></span><button class="btn primary" id="savehol">Save holidays</button></div>`
  )}
  ${card('Shared folder path', `<p class="muted small">Shown to everyone (Settings, the update notice and the connect screen) so they can find the folder. Browsers can't read the full path of a folder by themselves.${Store.detectedPath() ? ` Detected from where you opened the app: <b>${h(Store.detectedPath())}</b>.` : ''}</p><form class="grid-form" id="spf">${UI.field({ key: 'sharedPath', label: 'Path of the shared folder', type: 'text', span: 2, placeholder: 'e.g. S:\\DARRIK  or  \\\\server\\share\\DARRIK' }, Store.setting('settings-features', 'sharedPath', '') || Store.detectedPath())}</form><div class="row-btns"><span class="grow"></span><button class="btn primary" id="savesp">Save path</button></div>`)}`;
  return {
    html,
    mount(root) {
      const readRt = () =>
        [...root.querySelectorAll('#rqtypes tr')].map(tr => {
          const o = { id: tr.dataset.rt };
          tr.querySelectorAll('[data-k]').forEach(i => {
            o[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value.trim();
          });
          if (!o.label) o.label = o.id;
          return o;
        });
      const saveRt = (types, msg) => {
        Store.save({ id: 'settings-requests', c: 'settings', types });
        UI.toast(msg, 'good');
        App.render();
      };
      root.querySelector('#savert').onclick = () => saveRt(readRt(), 'Request types saved');
      root.querySelector('#addrt').onclick = () => {
        const types = readRt();
        const id = 'type';
        let n = 1;
        while (types.some(t => t.id === id + n)) n++;
        saveRt(
          types.concat([{ id: id + n, label: 'New request type', kind: 'other', director: false, attendance: false }]),
          'Type added — rename it and save'
        );
      };
      root.querySelectorAll('[data-rtdel]').forEach(
        b =>
          (b.onclick = () =>
            UI.confirm('Remove this request type? Existing requests of this type are kept.', () =>
              saveRt(
                readRt().filter(t => t.id !== b.dataset.rtdel),
                'Type removed'
              )
            ))
      );
      const readDepts = () =>
        [...root.querySelectorAll('#deptlist tr')].map(tr =>
          Object.assign({}, depts.find(d => d.id === tr.dataset.dept) || { teams: [] }, {
            id: tr.dataset.dept,
            name: tr.querySelector('[data-dn]').value.trim() || tr.dataset.dept.toUpperCase(),
            director: tr.querySelector('[data-dd]').value,
          })
        );
      const saveDepts = (list, msg) => {
        const used = new Map();
        for (const d of list)
          if (d.director) {
            if (used.has(d.director))
              return UI.toast(`${Store.memberName(d.director)} already runs ${used.get(d.director)} — one department per director`, 'bad');
            used.set(d.director, d.name);
          }
        Store.save({ id: 'settings-depts', c: 'settings', list });
        UI.toast(msg, 'good');
        App.render();
      };
      root.querySelector('#savedepts').onclick = () => saveDepts(readDepts(), 'Departments saved');
      root.querySelector('#adddept').onclick = () =>
        UI.modal({
          title: 'Add department',
          body: `<form class="grid-form" id="ndf">${UI.field({ key: 'name', label: 'Department name', type: 'text', required: true }, '')}</form>`,
          actions: `<span class="grow"></span><button class="btn primary" data-ok>Add</button>`,
          onMount: w =>
            (w.querySelector('[data-ok]').onclick = () => {
              const n = w.querySelector('[name=name]').value.trim();
              if (!n) return;
              let id = U.slug(n);
              while (depts.some(d => d.id === id)) id += '2';
              UI.closeModal();
              saveDepts(
                readDepts().concat([{ id, name: n, director: '', teams: [] }]),
                'Department added — now move its teams to it in the Teams table'
              );
            }),
        });
      root.querySelectorAll('[data-deptdel]').forEach(
        b =>
          (b.onclick = () =>
            saveDepts(
              readDepts().filter(d => d.id !== b.dataset.deptdel),
              'Department removed'
            ))
      );
      const saveMv = v => {
        if (v && U.verCmp(APP_VERSION, v) < 0) return UI.toast('That is newer than your own copy', 'bad');
        Store.save(
          Object.assign({}, Store.get('settings-features') || { id: 'settings-features', c: 'settings' }, {
            minVersion: v,
            minSince: v ? Date.now() : 0,
          })
        );
        UI.toast(v ? `Copies older than ${v} can no longer save` : 'No minimum version', 'good');
        App.render();
      };
      root.querySelector('#mvsave').onclick = () => saveMv(root.querySelector('#mvf [name=minVersion]').value.trim());
      root.querySelector('#mvnow').onclick = () =>
        UI.confirm(`Require version ${APP_VERSION}? Everyone still on an older copy must update before they can save.`, () =>
          saveMv(APP_VERSION)
        );
      root.querySelector('#mvoff').onclick = () => saveMv('');
      const readHol = () =>
        [...root.querySelectorAll('#hollist tr')]
          .map(tr => ({
            from: tr.querySelector('[data-hf]').value,
            to: tr.querySelector('[data-ht]').value,
            name: tr.querySelector('[data-hn]').value.trim(),
          }))
          .filter(x => x.from)
          .map(x => Object.assign(x, { to: x.to && x.to >= x.from ? x.to : x.from }));
      const saveHol = (list, msg) => {
        Store.save({ id: 'settings-holidays', c: 'settings', list });
        UI.toast(msg, 'good');
        App.render();
      };
      root.querySelector('#savehol').onclick = () => saveHol(readHol(), 'Holidays saved');
      root.querySelector('#addhol').onclick = () => {
        const tb = root.querySelector('#hollist');
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><input type="date" data-hf value="${U.todayStr()}"></td><td><input type="date" data-ht></td><td><input data-hn placeholder="e.g. Eid Al-Fitr"></td><td><button class="btn xs ghost" data-holdel>Remove</button></td>`;
        tb.prepend(tr);
        tr.querySelector('[data-holdel]').onclick = () => tr.remove();
      };
      root.querySelectorAll('[data-holdel]').forEach(b => (b.onclick = () => b.closest('tr').remove()));
      root.querySelector('#savesp').onclick = () => {
        const v = root.querySelector('#spf [name=sharedPath]').value.trim();
        Store.save(Object.assign({}, Store.get('settings-features') || { id: 'settings-features', c: 'settings' }, { sharedPath: v }));
        if (v) LS.set('bct.sharedPath', v);
        UI.toast(v ? 'Path saved — everyone will see it' : 'Path cleared', 'good');
        App.render();
      };
      root.querySelector('#saveteams').onclick = () => {
        const t = [...root.querySelectorAll('#teamlist tr')].map(tr =>
          Object.assign({}, Store.teams().find(x => x.id === tr.dataset.t) || {}, {
            id: tr.dataset.t,
            name: tr.querySelector('[data-tn]').value.trim() || tr.dataset.t.toUpperCase(),
          })
        );
        const where = Object.fromEntries(
          [...root.querySelectorAll('#teamlist tr')].map(tr => [tr.dataset.t, tr.querySelector('[data-tdept]').value])
        );
        const dl = depts.map(d => Object.assign({}, d, { teams: t.map(x => x.id).filter(id => (where[id] || depts[0].id) === d.id) }));
        Store.saveMany([
          { id: 'settings-teams', c: 'settings', teams: t },
          { id: 'settings-depts', c: 'settings', list: dl },
        ]);
        UI.toast('Teams saved', 'good');
        App.render();
      };
      root.querySelector('#addteam').onclick = () =>
        UI.modal({
          title: 'Add team',
          body: `<form class="grid-form" id="ntf">${UI.field({ key: 'name', label: 'Team name', type: 'text', required: true }, '')}</form>`,
          actions: `<span class="grow"></span><button class="btn primary" data-ok>Add</button>`,
          onMount: w =>
            (w.querySelector('[data-ok]').onclick = () => {
              const n = w.querySelector('[name=name]').value.trim();
              if (!n) return;
              let id = U.slug(n);
              while (Store.teams().some(t => t.id === id)) id += '2';
              Store.save({ id: 'settings-teams', c: 'settings', teams: Store.teams().concat([{ id, name: n }]) });
              UI.closeModal();
              UI.toast('Team added — now add its manager in People', 'good');
              App.render();
            }),
        });
      root.querySelectorAll('[data-tfun]').forEach(b => (b.onclick = () => editTeamFunctions(b.dataset.tfun)));
    },
  };
}

/* ---------------- Manager leave ---------------- */
function adminLeave() {
  const ds = Store.delegations();
  const today = U.todayStr();
  const st = d =>
    Store.delegationActive(d)
      ? UI.badge('Active now', 'warn')
      : d.start && d.start > today
        ? UI.badge('Planned', '')
        : UI.badge('Ended', '');
  const html = card(
    'Manager leave & delegation',
    `<p class="muted small">When a manager is on leave, choose who acts for them. During those dates the acting person gets the manager's desk, permissions, tasks from the director and projects, and the director sees who is covering. Only you can set this.</p>
    ${ds.length ? `<table class="tbl"><thead><tr><th>Manager on leave</th><th>Acting</th><th>From</th><th>Until</th><th>Note</th><th>Status</th><th></th></tr></thead><tbody>${ds.map((d, i) => `<tr><td><b>${h(Store.memberName(d.from))}</b> <span class="muted small">${h(Store.teamName((Store.member(d.from) || {}).team))}</span></td><td>${h(Store.memberName(d.to))}</td><td>${U.fmtDate(d.start)}</td><td>${U.fmtDate(d.end) || '—'}</td><td class="small">${h(d.note || '')}</td><td>${st(d)}</td><td class="nw"><button class="btn xs" data-dlgedit="${i}">Edit</button> <button class="btn xs ghost" data-dlgdel="${i}">Remove</button></td></tr>`).join('')}</tbody></table>` : empty('No manager is on leave.')}
    <div class="row-btns"><button class="btn primary" id="adddlg">＋ Manager on leave</button></div>`
  );
  return {
    html,
    mount(root) {
      const saveDlg = (list, msg) => {
        Store.save({ id: 'settings-delegations', c: 'settings', list });
        UI.toast(msg, 'good');
        App.render();
      };
      const editDlg = i => {
        const all = Store.delegations();
        const d = i == null ? { start: U.todayStr(), end: '' } : all[i];
        const mgrs = Store.members().filter(m => m.active !== false && (m.role === 'manager' || Store.topRole(m.role)));
        const people = Store.members().filter(m => m.active !== false);
        UI.modal({
          title: i == null ? 'Manager on leave' : 'Edit delegation',
          body: `<form class="grid-form" id="dlgf">
          ${UI.field({ key: 'from', label: 'Manager on leave', type: 'select', required: true, options: mgrs.map(m => [m.id, `${m.name} (${Store.topRole(m.role) ? Store.roleLabel(m.role) : Store.teamName(m.team)})`]) }, d.from || '')}
          ${UI.field({ key: 'to', label: 'Acting person', type: 'select', required: true, options: people.map(m => [m.id, `${m.name} (${Store.roleLabel(m.role)}${Store.topRole(m.role) ? '' : ', ' + Store.teamName(m.team)})`]) }, d.to || '')}
          ${UI.field({ key: 'start', label: 'From', type: 'date', required: true }, d.start || '')}
          ${UI.field({ key: 'end', label: 'Until (last day of leave)', type: 'date' }, d.end || '')}
          ${UI.field({ key: 'note', label: 'Note (optional)', type: 'text', span: 2, placeholder: 'e.g. annual leave' }, d.note || '')}</form>`,
          actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>`,
          onMount: w => {
            w.querySelector('[data-c]').onclick = UI.closeModal;
            w.querySelector('[data-ok]').onclick = () => {
              const v = UI.readForm(w.querySelector('#dlgf'), [
                { key: 'from' },
                { key: 'to' },
                { key: 'start' },
                { key: 'end' },
                { key: 'note' },
              ]);
              if (!v.from || !v.to || !v.start) return UI.toast('Manager, acting person and start date are needed', 'bad');
              if (v.from === v.to) return UI.toast('The acting person must be someone else', 'bad');
              if (v.end && v.end < v.start) return UI.toast('"Until" is before "From"', 'bad');
              const list = all.slice();
              if (i == null) list.push(v);
              else list[i] = v;
              UI.closeModal();
              saveDlg(list, `${Store.memberShort(v.to)} acts for ${Store.memberShort(v.from)}${v.end ? ' until ' + U.fmtDate(v.end) : ''}`);
            };
          },
        });
      };
      root.querySelector('#adddlg').onclick = () => editDlg(null);
      root.querySelectorAll('[data-dlgedit]').forEach(b => (b.onclick = () => editDlg(+b.dataset.dlgedit)));
      root.querySelectorAll('[data-dlgdel]').forEach(
        b =>
          (b.onclick = () =>
            UI.confirm('Remove this delegation?', () =>
              saveDlg(
                Store.delegations().filter((_, i) => i !== +b.dataset.dlgdel),
                'Delegation removed'
              )
            ))
      );
    },
  };
}

/* a logo, resized to at most 256 px so it stays small in the shared data (PNG data URL; SVG kept as is when small) */
function shrinkLogo(file) {
  return new Promise((ok, fail) => {
    const rd = new FileReader();
    rd.onload = () => {
      const src = rd.result;
      if (file.type === 'image/svg+xml' && src.length < 60000) return ok(src);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 256 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        ok(c.toDataURL('image/png'));
      };
      img.onerror = fail;
      img.src = src;
    };
    rd.onerror = fail;
    rd.readAsDataURL(file);
  });
}
