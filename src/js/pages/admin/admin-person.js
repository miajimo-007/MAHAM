/* MAHAM — Admin → person card: everything about one person on one screen, onboarding checklist,
 * offboarding (hand over open work, then retire) and "View as". Route: #/adminperson/<id> (super admin only). */
'use strict';

P.adminperson = id => {
  const m = Store.member(id);
  if (!App.isSuper() || !m) return { title: 'Admin', html: adminHead('people') + empty('Person not found.') };
  const today = U.todayStr();
  const file = Store.sources['u:' + id + '.json'];
  const w = Admin.openWork(id);
  const nWork = Admin.workCount(w);
  const leave = Store.delegations().filter(d => (d.from === id || d.to === id) && (!d.end || d.end >= today));
  const u = Admin.usage(U.addDays(today, -30)).find(x => x.m.id === id);
  const lbl = k =>
    (Store.PAGES.find(p => p[0] === k) || [
      k,
      {
        home: 'Analyst Desk',
        director: 'Director Desk',
        manager: 'Team Desk',
        admin: 'Admin',
        syscheck: 'System Check',
        project: 'Project',
        meeting: 'Meeting',
      }[k] || k,
    ])[1];
  const log = Admin.entries()
    .filter(e => (e.lines || []).some(l => l.includes(m.name)) || e.target === 'userpin-' + id)
    .slice(0, 12);
  const teams = Store.teams();
  const list = (l, f) =>
    l.length ? l.slice(0, 15).map(f).join('') + (l.length > 15 ? `<p class="muted small">…and ${l.length - 15} more</p>` : '') : '';
  const work = [
    [
      'To Dos',
      w.todo,
      r =>
        `<div class="li click" data-edit="todo|${h(r.id)}"><span class="grow">${h(r.task)}</span><span class="muted small">given ${U.fmtDate(r.assigned)}</span></div>`,
    ],
    [
      'Director tasks',
      w.mgrtask,
      r => `<div class="li click" data-edit="mgrtask|${h(r.id)}"><span class="grow">${h(r.task)}</span>${UI.sbadge(Chain.status(r))}</div>`,
    ],
    [
      'Projects they own',
      w.project,
      r => `<div class="li click" data-proj="${h(r.id)}"><span class="grow">${h(r.name)}</span>${UI.sbadge(r.status)}</div>`,
    ],
    ['Project member of', w.member, r => `<div class="li click" data-proj="${h(r.id)}"><span class="grow">${h(r.name)}</span></div>`],
    [
      'Project tasks',
      w.ptask,
      r =>
        `<div class="li"><span class="grow">${h(r.title)}</span><span class="muted small">${h((Scrum.proj(r.project) || {}).name || '')}</span></div>`,
    ],
  ].filter(x => x[1].length);
  const html = `${adminHead('people')}
  <div class="hello"><div><h1>${h(m.name)}</h1><p class="muted">${h(Store.titleOf(m))}${m.title || m.superAdmin ? ` <span class="small">(${h(Store.roleLabel(m.role))})</span>` : ''}${Store.topRole(m.role) ? ' · all teams' : ' · ' + h(Store.teamName(m.team || 'apps'))}
    ${m.superAdmin ? UI.badge('super admin', 'good') : ''}${m.active === false ? UI.badge('retired', 'bad') : ''}${m.hidden ? UI.badge('hidden', '') : ''}${leave.map(d => UI.badge(d.from === id ? `on leave → ${Store.memberShort(d.to)} acting` : `acting for ${Store.memberShort(d.from)}`, 'warn')).join('')}</p></div>
    <div class="row-btns"><a class="btn" href="#/admin/people">← People</a>${id !== App.me ? `<button class="btn" id="viewas">👁 View as ${h(m.short || m.name)}</button>` : ''}${m.active !== false && id !== App.me ? `<button class="btn danger" id="offboard">Offboard…</button>` : m.active === false ? `<button class="btn" id="reactivate">Make active again</button>` : ''}</div></div>
  <div class="cols2">
    ${card(
      'Details',
      `<form class="grid-form" id="pcf">
      ${UI.field({ key: 'name', label: 'Full name', type: 'text', required: true }, m.name)}${UI.field({ key: 'short', label: 'Short name', type: 'text' }, m.short || '')}
      ${UI.field({ key: 'empId', label: 'Employee ID (to sign in)', type: 'text', placeholder: m.id, hint: m.empId ? '' : `Until it is filled, they sign in with “${m.id}”` }, m.empId || '')}${UI.field({ key: 'me', label: 'Name in ManageEngine', type: 'text' }, m.me || '')}${UI.field({ key: 'aliases', label: 'Other names (comma separated)', type: 'text' }, (m.aliases || []).join(', '))}
      ${UI.field({ key: 'role', label: 'Role', type: 'select', options: Store.rolesFor(m.role || 'analyst'), blank: false }, m.role || 'analyst')}${UI.field({ key: 'title', label: 'Title shown to everyone (optional)', type: 'text', placeholder: m.superAdmin ? 'Admin' : Store.roleLabel(m.role), hint: 'Shown next to their name instead of the role — e.g. Admin, Senior Analyst' }, m.title || '')}
      ${Store.topRole(m.role) ? '' : UI.field({ key: 'team', label: 'Team', type: 'select', options: teams.map(t => [t.id, t.name]), blank: false }, m.team || 'apps')}
      ${UI.field({ key: 'scored', label: 'Scored', type: 'bool' }, !!m.scored)}${UI.field({ key: 'hidden', label: 'Hidden from others', type: 'bool' }, !!m.hidden)}</form>
      <div class="row-btns"><button class="btn" id="pcperm">Permissions</button><button class="btn" id="pcfun">Functions</button>${Store.pinOf(id) ? '<button class="btn ghost" id="pcpin">Reset PIN</button>' : ''}<span class="grow"></span><button class="btn primary" id="pcsave">Save</button></div>`
    )}
    <div>
      ${card(
        'Onboarding',
        Admin.onboarding(m)
          .map(
            ([l, ok, info]) =>
              `<div class="li"><span class="chk ${ok ? 'ok' : info ? 'info' : 'no'}">${ok ? '✓' : info ? '–' : '✗'}</span><span class="grow">${h(l)}${!ok && info ? ' <span class="muted small">— not set yet; optional (only needed to match help-desk tickets)</span>' : ''}</span></div>`
          )
          .join('') +
          (Admin.onboarding(m).some(s => !s[1] && !s[2]) && !Store.pinOf(id)
            ? '<div class="row-btns tight"><button class="btn xs" id="remindpin">Remind them to set a PIN</button></div>'
            : '')
      )}
      ${card(
        'Activity',
        `<div class="li"><span class="grow">Last saved work</span><b>${Store.lastWork(id) ? U.fmtTs(Store.lastWork(id)) : 'never'}</b></div>
        <div class="li"><span class="grow">Records in their file</span><b>${file ? Object.keys(file.records || {}).length : 0}</b></div>
        <div class="li"><span class="grow">Last opened the app</span><b>${u && u.last ? U.fmtDate(u.last) : '—'}</b></div>
        <div class="li"><span class="grow">Days active (last 30)</span><b>${u ? u.days : 0}</b></div>
        ${
          u && u.views
            ? `<p class="muted small">Most used: ${h(
                Object.entries(u.pages)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([k, n]) => `${lbl(k)} (${n})`)
                  .join(', ')
              )}</p>`
            : ''
        }`
      )}
    </div>
  </div>
  <div class="cols2">
    ${card(
      'Permissions',
      `<div class="permlist cols2">${Store.PERMS.map(([k, l]) => {
        const on = Store.canA(id, k, 1);
        const custom = m.perms && typeof m.perms[k] === 'boolean';
        return `<div class="check ${custom ? 'custom' : ''}"><span class="chk ${on ? 'ok' : 'no'}">${on ? '✓' : '—'}</span> ${h(l)}</div>`;
      }).join('')}</div>${
        m.pages && Object.keys(m.pages).length
          ? `<p class="muted small">Function exceptions: ${h(
              Object.entries(m.pages)
                .map(([k, v]) => `${lbl(k)}: ${v}`)
                .join(', ')
            )}</p>`
          : ''
      }`
    )}
    ${card(`Open work <span class="count">${nWork}</span>`, work.length ? work.map(([t, l, f]) => `<h4 class="act-h">${t} (${l.length})</h4>` + list(l, f)).join('') : empty('Nothing open.'))}
  </div>
  ${(() => {
    const E = Admin.explain(id);
    const row = x =>
      `<tr><td>${h(x.l)}</td><td>${UI.badge(x.v, x.v === 'Hidden' || x.v === 'No' ? '' : x.v === 'View only' ? 'warn' : 'good')}</td><td class="small muted">${h(x.why)}</td></tr>`;
    return `<details class="card guide"><summary><b>Explain access</b> — what ${h(m.short || m.name)} can see and do, and why</summary><div class="cols2"><div class="tbl-scroll"><table class="tbl"><thead><tr><th>Function</th><th>Access</th><th>Why</th></tr></thead><tbody>${E.pages.map(row).join('')}</tbody></table></div><div class="tbl-scroll"><table class="tbl"><thead><tr><th>Permission</th><th></th><th>Why</th></tr></thead><tbody>${E.perms.map(row).join('')}</tbody></table></div></div></details>`;
  })()}
  ${log.length ? card('Admin changes about this person', log.map(e => `<div class="li"><span class="nw muted small">${U.fmtTs(e.at)}</span><span class="grow small">${h((e.lines || []).filter(l => l.includes(m.name) || e.target === 'userpin-' + id).join(' · '))}</span></div>`).join('')) : ''}`;
  return {
    title: 'Admin — ' + m.name,
    html,
    mount(root) {
      bindAdminSearch(root);
      root.querySelector('#pcperm').onclick = () => editPerms(id);
      root.querySelector('#pcfun').onclick = () => editPersonFunctions(id);
      const pin = root.querySelector('#pcpin');
      if (pin) pin.onclick = () => resetPin(id);
      root.querySelector('#pcsave').onclick = () => {
        const v = UI.readForm(root.querySelector('#pcf'), [
          { key: 'name' },
          { key: 'short' },
          { key: 'empId' },
          { key: 'me' },
          { key: 'aliases' },
          { key: 'role' },
          { key: 'title' },
          { key: 'team' },
          { key: 'scored', type: 'bool' },
          { key: 'hidden', type: 'bool' },
        ]);
        if (!v.name) return UI.toast('Full name is needed', 'bad');
        {
          const o = v.empId && Store.members().find(x => x.id !== id && App.normId(x.empId) === App.normId(v.empId));
          if (o) return UI.toast(`Employee ID ${v.empId} already belongs to ${o.name}`, 'bad');
        }
        const x = Object.assign({}, m, v, {
          aliases: String(v.aliases || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
        });
        if (Store.topRole(x.role)) {
          x.team = '';
          x.scored = false;
        } else if (!x.team) x.team = m.team || 'apps';
        saveMembersChecked(
          Store.members().map(o => (o.id === id ? x : o)),
          'Saved'
        );
      };
      const va = root.querySelector('#viewas');
      if (va) va.onclick = () => App.viewAs(id);
      const re = root.querySelector('#reactivate');
      if (re)
        re.onclick = () =>
          saveMembersAll(
            Store.members().map(o => (o.id === id ? Object.assign({}, o, { active: true }) : o)),
            `${m.name} is active again`
          );
      const rp = root.querySelector('#remindpin');
      if (rp)
        rp.onclick = () =>
          sendReminder(
            [id],
            'Please set your PIN',
            'Click your name at the bottom-left of the app and choose "Set my PIN". Until you do, anyone on a shared PC can sign in as you.'
          );
      const ob = root.querySelector('#offboard');
      if (ob) ob.onclick = () => offboardDialog(id);
    },
  };
};

/* hand over open work, then retire */
function offboardDialog(id) {
  const m = Store.member(id);
  const w = Admin.openWork(id);
  const act = Store.members().filter(x => x.active !== false && x.id !== id);
  const sameTeam = x => !Store.topRole(x.role) && (x.team || 'apps') === (m.team || 'apps');
  const opt = (l, pref) => [
    ['', '— leave as is —'],
    ...l
      .sort((a, b) => pref(b) - pref(a) || a.name.localeCompare(b.name))
      .map(x => [x.id, `${x.name} (${Store.roleLabel(x.role)}${Store.topRole(x.role) ? '' : ', ' + Store.teamName(x.team)})`]),
  ];
  const mgrLike = act.filter(x => x.role === 'manager' || Store.topRole(x.role) || x.role === 'teamleader');
  const rows = [
    [
      'todo',
      `To Dos (${w.todo.length})`,
      w.todo.length,
      opt(
        act.filter(x => !Store.topRole(x.role)),
        sameTeam
      ),
    ],
    ['mgrtask', `Director tasks (${w.mgrtask.length})`, w.mgrtask.length, opt(mgrLike, sameTeam)],
    [
      'project',
      `Projects they own (${w.project.length})`,
      w.project.length,
      opt(mgrLike.concat(act.filter(x => x.role === 'analyst')), sameTeam),
    ],
    [
      'ptask',
      `Project tasks + project membership (${w.ptask.length + w.member.length})`,
      w.ptask.length + w.member.length,
      opt(
        act.filter(x => !Store.topRole(x.role)),
        sameTeam
      ),
    ],
  ];
  const mgrOf = m.role === 'manager' ? Store.teamName(m.team) : '';
  UI.modal({
    title: `Offboard ${m.name}`,
    wide: true,
    body: `<p class="muted small">Choose who takes over each kind of open work. Their past work and scores stay as they are.${mgrOf ? ` ${h(m.name)} manages <b>${h(mgrOf)}</b> — after this, make someone else manager of the team (Admin → People).` : ''}${w.mytask.length ? ` ${w.mytask.length} personal task(s) stay with them.` : ''}</p>
    <form class="grid-form" id="obf">${
      rows
        .filter(r => r[2])
        .map(([k, l, , o]) =>
          UI.field({ key: k, label: l, type: 'select', options: o.slice(1), blank: '— leave as is —' }, (o[1] || [''])[0])
        )
        .join('') || '<p class="span2">Nothing open — they can be retired straight away.</p>'
    }
    ${UI.field({ key: 'retire', label: 'Retire', type: 'bool', checkLabel: 'Untick "Active" (they no longer appear in lists; data is kept)', span: 2 }, true)}</form>`,
    actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn danger" data-ok>Hand over${' & retire'}</button>`,
    onMount: wd => {
      wd.querySelector('[data-c]').onclick = UI.closeModal;
      wd.querySelector('[data-ok]').onclick = () => {
        const v = UI.readForm(wd.querySelector('#obf'), [
          ...rows.filter(r => r[2]).map(r => ({ key: r[0] })),
          { key: 'retire', type: 'bool' },
        ]);
        const recs = Admin.reassign(id, v);
        if (recs.length) Store.saveMany(recs);
        if (v.retire) saveMembersAll(Store.members().map(o => (o.id === id ? Object.assign({}, o, { active: false }) : o)));
        UI.closeModal();
        UI.toast(`${recs.length} item(s) handed over${v.retire ? ` · ${m.name} retired` : ''}`, 'good');
        App.render();
      };
    },
  });
}

/* a reminder only some people see (an announcement with a people list) */
function sendReminder(ids, title, body) {
  if (!ids.length) return UI.toast('Nobody to remind', 'bad');
  Store.save({
    id: U.uid('announcement'),
    c: 'announcement',
    title,
    body,
    audience: [],
    people: ids,
    posted: U.todayStr(),
    until: U.addDays(U.todayStr(), 7),
    reminder: true,
  });
  UI.toast(`Reminder shown to ${ids.length} person(s) for 7 days`, 'good');
  App.render();
}
