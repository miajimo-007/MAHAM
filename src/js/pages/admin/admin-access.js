/* MAHAM — Admin dialogs: permissions and function access per person / team. */
'use strict';

/* ---------- permissions editor ---------- */
function permScope() {
  // whose permissions I may edit
  return Store.visible().filter(
    m =>
      !Store.topRole(m.role) &&
      (m.id !== App.me || m.superAdmin) &&
      (App.isDir() || ((m.team || 'apps') === App.viewTeam && m.role !== 'manager'))
  );
}

function permCard() {
  if (!App.isSuper())
    return card(
      'Permissions & roles',
      '<p class="muted">Permissions and roles are set by the administrator. Ask them if someone needs more (or less) access.</p>'
    );
  const rows = permScope();
  const PS = Store.PERMS;
  if (!rows.length) return '';
  return card(
    'Permissions',
    `<p class="muted small">Ticked = allowed. Each role starts with default permissions; a highlighted box means it was changed from the role default. ${App.isDir() ? 'You can edit managers and analysts in every team.' : "You can edit the analysts in your team; the director sets managers' permissions."}</p>
    <div class="tbl-scroll"><table class="tbl perm"><thead><tr><th>Person</th>${App.isDir() ? '<th>Team</th>' : ''}<th>Role</th>${PS.map(([k, l, d]) => `<th class="ctr" title="${h(d)}">${h(l)}</th>`).join('')}<th>PIN</th><th></th></tr></thead><tbody id="permrows">
    ${rows
      .map(
        m => `<tr data-id="${h(m.id)}"><td><b>${h(Store.memberName(m.id))}</b></td>${App.isDir() ? `<td>${h(Store.teamName(m.team || 'apps'))}</td>` : ''}<td>${Store.roleLabel(m.role)}</td>${PS.map(
          ([k]) => {
            const custom = m.perms && typeof m.perms[k] === 'boolean';
            const locked = Store.SUPER_ONLY.includes(k) && !App.isSuper();
            return `<td class="ctr ${custom ? 'custom' : ''}"><input type="checkbox" data-p="${k}" ${Store.canA(m.id, k) ? 'checked' : ''} ${locked ? 'disabled title="Only the super admin can change this"' : ''} aria-label="${h(k)}">${locked ? '<span class="lockmark">🔒</span>' : ''}</td>`;
          }
        ).join('')}
      <td>${Store.pinOf(m.id) ? `<button class="btn xs ghost" data-resetpin="${h(m.id)}" title="Remove this person's PIN (if they forgot it)">reset</button>` : '<span class="muted small">none</span>'}</td><td><button class="btn xs ghost" data-defperm="${h(m.id)}">defaults</button></td></tr>`
      )
      .join('')}
    </tbody></table></div><div class="row-btns"><span class="grow"></span><button class="btn primary" id="saveperms">Save permissions</button></div>`
  );
}

function bindPerms(root) {
  const saveMembers = (fn, msg) => {
    const members = Store.members().map(m => fn(Object.assign({}, m)) || m);
    Store.save(Object.assign({}, Store.get('settings-team'), { id: 'settings-team', c: 'settings', members }));
    UI.toast(msg, 'good');
    App.render();
  };
  const sv = root.querySelector('#saveperms');
  if (sv)
    sv.onclick = () => {
      const edits = {};
      root.querySelectorAll('#permrows tr').forEach(tr => {
        const e = (edits[tr.dataset.id] = {});
        tr.querySelectorAll('[data-p]').forEach(cb => {
          e[cb.dataset.p] = cb.checked;
        });
      });
      saveMembers(m => {
        const e = edits[m.id];
        if (!e) return m;
        const perms = {};
        for (const [k, v] of Object.entries(e)) if (v !== Store.teamRoleDefault(m, k)) perms[k] = v;
        if (!App.isSuper())
          for (const k of Store.SUPER_ONLY) {
            delete perms[k];
            if (m.perms && typeof m.perms[k] === 'boolean') perms[k] = m.perms[k];
          } // keep what the super admin set
        m.perms = perms;
        return m;
      }, 'Permissions saved');
    };
  root.querySelectorAll('[data-defperm]').forEach(
    b =>
      (b.onclick = () =>
        saveMembers(m => {
          if (m.id === b.dataset.defperm) {
            const keep = {};
            if (!App.isSuper() && m.perms) for (const k of Store.SUPER_ONLY) if (typeof m.perms[k] === 'boolean') keep[k] = m.perms[k];
            m.perms = keep;
          }
          return m;
        }, 'Back to role defaults'))
  );
  root.querySelectorAll('[data-resetpin]').forEach(
    b =>
      (b.onclick = () =>
        UI.confirm(`Remove the PIN for ${Store.memberName(b.dataset.resetpin)}? They can set a new one in Settings.`, () => {
          Store.save({ id: 'userpin-' + b.dataset.resetpin, c: 'userpin', member: b.dataset.resetpin, pin: '' });
          saveMembers(m => {
            if (m.id === b.dataset.resetpin) delete m.pin;
            return m;
          }, 'PIN removed');
        }))
  );
}

function saveMembersAll(list, msg) {
  Store.save(Object.assign({}, Store.get('settings-team'), { id: 'settings-team', c: 'settings', members: list }));
  if (msg) UI.toast(msg, 'good');
  App.render();
}

function editPerms(mid) {
  const m = Store.member(mid);
  if (!m) return;
  const role = m.role || 'analyst';
  UI.modal({
    title: `Permissions — ${m.name}`,
    body: `<p class="muted small">Role: <b>${h(role)}</b>${m.superAdmin ? ' · super admin (has everything)' : Store.topRole(role) ? ' · starts with every permission — untick to restrict' : ''}. Highlighted = changed from the role default.</p>
    <div class="permlist">${Store.PERMS.map(([k, l, d]) => {
      const custom = m.perms && typeof m.perms[k] === 'boolean';
      return `<label class="check ${custom ? 'custom' : ''}"><input type="checkbox" data-p="${k}" ${Store.canA(m.id, k) ? 'checked' : ''} ${m.superAdmin ? 'disabled' : ''}> <span><b>${h(l)}</b>${Store.SUPER_ONLY.includes(k) ? ' <span class="badge">super admin only</span>' : ''}${d ? `<br><span class="muted small">${h(d)}</span>` : ''}</span></label>`;
    }).join('')}</div>`,
    actions: `<button class="btn ghost" data-def>Role defaults</button><span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>`,
    onMount: w => {
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelector('[data-def]').onclick = () => {
        UI.closeModal();
        saveMembersAll(
          Store.members().map(x => (x.id === mid ? Object.assign({}, x, { perms: {} }) : x)),
          'Back to role defaults'
        );
      };
      w.querySelector('[data-ok]').onclick = () => {
        const perms = {};
        w.querySelectorAll('[data-p]').forEach(cb => {
          if (cb.checked !== Store.teamRoleDefault(Store.member(mid), cb.dataset.p)) perms[cb.dataset.p] = cb.checked;
        });
        UI.closeModal();
        saveMembersAll(
          Store.members().map(x => (x.id === mid ? Object.assign({}, x, { perms }) : x)),
          'Permissions saved'
        );
      };
    },
  });
}

function editDirTeams(mid) {
  const m = Store.member(mid);
  const cur = new Set(m.teams && m.teams.length ? m.teams : Store.teams().map(t => t.id));
  UI.modal({
    title: `Teams for ${m.name}`,
    body: `<p class="muted small">The director sees only these teams (their dashboards, managers, tasks and projects).</p><div class="permlist">${Store.teams()
      .map(
        t =>
          `<label class="check"><input type="checkbox" data-t="${h(t.id)}" ${cur.has(t.id) ? 'checked' : ''}> <b>${h(t.name)}</b></label>`
      )
      .join('')}</div>`,
    actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>`,
    onMount: w => {
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelector('[data-ok]').onclick = () => {
        const sel = [...w.querySelectorAll('[data-t]:checked')].map(c => c.dataset.t);
        if (!sel.length) return UI.toast('Pick at least one team', 'bad');
        UI.closeModal();
        saveMembersAll(
          Store.members().map(x => (x.id === mid ? Object.assign({}, x, { teams: sel.length === Store.teams().length ? [] : sel }) : x)),
          'Director teams saved'
        );
      };
    },
  });
}

const levelSel = (k, cur, withDefault) =>
  `<select data-k="${k}">${withDefault ? '<option value="">Team setting</option>' : ''}${Store.LEVELS.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;

function editTeamFunctions(tid) {
  const t = Store.teams().find(x => x.id === tid);
  UI.modal({
    title: `Functions for ${t.name}`,
    wide: true,
    body: `<p class="muted small">Access for everyone in ${h(t.name)}. <b>Edit</b> = normal use · <b>View only</b> = can look, can't change · <b>Hidden</b> = page not shown. You can make exceptions per person.</p>
    <table class="tbl"><tbody>${Store.PAGES.map(([k, l]) => `<tr><td>${h(l)}</td><td>${levelSel(k, Store.teamLevel(tid, k), false)}</td></tr>`).join('')}</tbody></table>`,
    actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>`,
    onMount: w => {
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelector('[data-ok]').onclick = () => {
        const pageLevels = {};
        w.querySelectorAll('select[data-k]').forEach(sl => {
          if (sl.value !== 'edit') pageLevels[sl.dataset.k] = sl.value;
        });
        Store.save({
          id: 'settings-teams',
          c: 'settings',
          teams: Store.teams().map(x => (x.id === tid ? Object.assign({}, x, { pageLevels, hidePages: [] }) : x)),
        });
        UI.closeModal();
        UI.toast('Team functions saved', 'good');
        App.render();
      };
    },
  });
}

function editPersonFunctions(mid) {
  const m = Store.member(mid);
  const pg = m.pages || {};
  const tid = m.team || 'apps';
  const team = Store.teams().find(x => x.id === tid);
  const lab = v => (Store.LEVELS.find(x => x[0] === v) || ['', v])[1];
  UI.modal({
    title: `Functions for ${m.name}`,
    wide: true,
    body: `<p class="muted small">"Team setting" follows ${h(team ? team.name : 'the team')}. Pick a level to make an exception for ${h(m.short || m.name)}. Edit rights still depend on their permissions (e.g. assigning To Dos).</p>
    <table class="tbl"><thead><tr><th>Function</th><th>Team setting</th><th>${h(m.short || m.name)}</th></tr></thead><tbody>${Store.PAGES.map(([k, l]) => `<tr><td>${h(l)}</td><td class="muted small">${lab(Store.teamLevel(tid, k))}</td><td>${levelSel(k, Store.normLevel(pg[k]) || '', true)}</td></tr>`).join('')}</tbody></table>`,
    actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>`,
    onMount: w => {
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelector('[data-ok]').onclick = () => {
        const pages = {};
        w.querySelectorAll('select[data-k]').forEach(sl => {
          if (sl.value) pages[sl.dataset.k] = sl.value;
        });
        UI.closeModal();
        saveMembersAll(
          Store.members().map(x => (x.id === mid ? Object.assign({}, x, { pages }) : x)),
          'Functions saved'
        );
      };
    },
  });
}
