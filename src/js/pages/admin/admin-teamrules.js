/* MAHAM — Admin → Team rules: per team, what each role may do by default (people can still be changed one by one
 * in Permissions) and the team's own targets. Admin → Help desk months: which months the import may change. */
'use strict';

const TeamRules = {
  ROLES: [
    ['analyst', 'Analyst'],
    ['teamleader', 'Team leader'],
    ['manager', 'Manager'],
  ],
  team(id) {
    return Store.teams().find(t => t.id === id) || null;
  },
  patch(id, patch, msg) {
    const list = Store.teams().map(t => (t.id === id ? Object.assign({}, t, patch) : t));
    Store.save(Object.assign({}, Store.get('settings-teams') || { id: 'settings-teams', c: 'settings' }, { teams: list }));
    if (msg) UI.toast(msg, 'good');
  },
  /* default for a role in a team (team rule, else built-in) */
  dflt(teamId, role, k) {
    return Store.teamRoleDefault({ role, team: teamId }, k);
  },
  changed(teamId) {
    const t = TeamRules.team(teamId) || {};
    const rd = t.roleDefaults || {};
    return Object.values(rd).reduce((n, o) => n + Object.keys(o || {}).length, 0) + Object.keys(t.targets || {}).length;
  },
};

function adminTeamRules() {
  const teams = Store.teams();
  const cur = teams.some(t => t.id === LS.get('bct.adm.trteam', '')) ? LS.get('bct.adm.trteam', '') : (teams[0] || {}).id;
  const t = TeamRules.team(cur) || {};
  const rd = t.roleDefaults || {};
  const tg = t.targets || {};
  const people = Store.members().filter(m => m.active !== false && !Store.topRole(m.role) && (m.team || 'apps') === cur);
  const html = `<div class="insights"><div>Rules for one team at a time. <b>Permissions</b> below are the starting point for everyone with that role in the team — a person changed one by one in <b>Permissions</b> keeps their own setting. Which pages a team sees is under <a class="link" href="#/admin/teams">Teams & departments → Functions</a>.</div></div>
    <div class="page-actions"><label class="flt"><span>Team</span><select id="trteam">${teams.map(x => `<option value="${h(x.id)}" ${x.id === cur ? 'selected' : ''}>${h(x.name)}${TeamRules.changed(x.id) ? ' •' : ''}</option>`).join('')}</select></label><span class="muted small">${people.length} active people · ${TeamRules.ROLES.map(([r, l]) => `${people.filter(m => (m.role || 'analyst') === r).length} ${l.toLowerCase()}${people.filter(m => (m.role || 'analyst') === r).length === 1 ? '' : 's'}`).join(' · ')}</span></div>
    ${card(
      `What each role can do in ${h(t.name || cur)}`,
      `<div class="tbl-scroll"><table class="tbl perm tr-t"><thead><tr><th>Permission</th>${TeamRules.ROLES.map(([, l]) => `<th class="ctr">${l}</th>`).join('')}</tr></thead><tbody id="trrows">
      ${Store.PERMS.filter(([k]) => k !== 'assignToManagers')
        .map(
          ([k, l, d]) =>
            `<tr><td><b>${h(l)}</b>${d ? `<div class="muted small">${h(d)}</div>` : ''}</td>${TeamRules.ROLES.map(([r]) => {
              const v = TeamRules.dflt(cur, r, k);
              const own = rd[r] && typeof rd[r][k] === 'boolean';
              return `<td class="ctr ${own ? 'custom' : ''}"><input type="checkbox" data-tr="${r}|${k}" ${v ? 'checked' : ''} title="${own ? 'Changed for this team' : 'App default'}"></td>`;
            }).join('')}</tr>`
        )
        .join('')}
      </tbody></table></div>
      <div class="row-btns"><button class="btn ghost" id="trreset">Back to the app defaults</button><span class="grow"></span><button class="btn primary" id="trsave">Save for ${h(t.name || cur)}</button></div>
      <p class="muted small">A highlighted box differs from the app default. Directors and the AED are not affected (they follow their own permissions).</p>`
    )}
    ${card(
      `Targets for ${h(t.name || cur)}`,
      `<p class="muted small">Leave empty to use the app-wide value from Customize.</p><form class="grid-form" id="trtg">${Object.entries(
        Custom.TARGETS
      )
        .map(([k, x]) =>
          UI.field(
            {
              key: k,
              label: x.label + (x.unit ? ` (${x.unit})` : ''),
              type: 'number',
              min: 1,
              step: 1,
              placeholder: String(Custom.target(k, '_all_')),
              hint: x.hint,
            },
            tg[k] || ''
          )
        )
        .join('')}</form>
      <div class="row-btns"><span class="grow"></span><button class="btn primary" id="trtgsave">Save targets</button></div>`
    )}`;
  return {
    html,
    mount(root) {
      root.querySelector('#trteam').onchange = e => {
        LS.set('bct.adm.trteam', e.target.value);
        App.render();
      };
      root.querySelectorAll('[data-tr]').forEach(c => (c.onchange = () => c.closest('td').classList.add('custom')));
      root.querySelector('#trsave').onclick = () => {
        const out = {};
        root.querySelectorAll('[data-tr]').forEach(c => {
          const [r, k] = c.dataset.tr.split('|');
          if (c.checked !== Store.roleDefault(r, k)) (out[r] = out[r] || {})[k] = c.checked;
        });
        TeamRules.patch(cur, { roleDefaults: out }, `Rules saved for ${t.name || cur}`);
        App.render();
      };
      root.querySelector('#trreset').onclick = () =>
        UI.confirm(
          `Put ${t.name || cur} back to the app's default permissions per role? People changed one by one keep their own settings.`,
          () => {
            TeamRules.patch(cur, { roleDefaults: {} }, 'Back to the app defaults');
            App.render();
          }
        );
      root.querySelector('#trtgsave').onclick = () => {
        const f = root.querySelector('#trtg');
        const out = {};
        for (const k of Object.keys(Custom.TARGETS)) {
          const v = +f.querySelector(`[name=${k}]`).value;
          if (v > 0) out[k] = v;
        }
        TeamRules.patch(cur, { targets: out }, 'Targets saved');
        App.render();
      };
    },
  };
}

function adminHdMonths() {
  return {
    html: card('Help desk months — open or locked', HDLock.adminBox()),
    mount(root) {
      HDLock.bindAdmin(root);
    },
  };
}
