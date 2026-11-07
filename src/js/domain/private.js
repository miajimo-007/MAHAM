/* MAHAM — Hidden projects: the super admin can hide a project so only the people he chooses see it
 * (project.restricted = true, project.viewers = [ids]). Hidden projects, their tasks and sprints are left out of every
 * list for everyone else (Store.all is filtered here), and their page says "not found". Only the super admin can
 * change who sees a project. Note: this hides it inside the app; the data is still in the shared folder files. */
'use strict';

(() => {
  const PRIV = new Set(['project', 'ptask', 'sprint']);
  let cache = { key: null, map: {} };
  const all = Store.all;
  Store.all = function (c, team) {
    const list = all.call(Store, c, team);
    if (!PRIV.has(c) || Store._real || !App.me) return list;
    const hidden = Store.hiddenProjects();
    if (!hidden.size) return list;
    const key = App.me + '|' + App.mode + '|' + (App.preview ? 1 : 0) + '|' + [...hidden].join(',');
    if (cache.key !== key || cache.v !== Store.ver) cache = { key, v: Store.ver, map: {} };
    const k = c + '|' + (team || App.viewTeam);
    return cache.map[k] || (cache.map[k] = list.filter(r => !hidden.has(c === 'project' ? r.id : r.project)));
  };
})();

Object.assign(Store, {
  /* may this person see the project? */
  seesProject(p, id) {
    const me = id || App.me;
    return !p || !p.restricted || App.realSuper(me) || (p.viewers || []).includes(me);
  },
  /* ids of projects hidden from the signed-in person */
  hiddenProjects() {
    const out = new Set();
    for (const p of Store.byC.project || []) if (p && p.restricted && !Store.seesProject(p)) out.add(p.id);
    return out;
  },
  /* the extra save rules, with the message to show */
  extraBlock(r) {
    if (
      r.c === 'itdir' &&
      !r._del &&
      r.reportsTo &&
      typeof DirX !== 'undefined' &&
      (r.reportsTo === r.id || (r.id && DirX.loops(r.id, r.reportsTo)))
    )
      return 'That would make a loop: this person is already above their new manager';
    if (!Store.privacyAllowed(r)) return 'Only the administrator can hide a project or change who sees it';
    if (!Store.hdAllowed(r))
      return r._del
        ? 'Only the administrator can delete a help desk request'
        : 'Only the administrator can add a help desk request by hand — use the daily import';
    if (r.c === 'qwjoin' && !Store.isSuper(App.me)) {
      const p = r.id && Store.db.get(r.id);
      if ((p ? p.by : r.by) !== App.me) return 'Only that person can confirm or leave a shared quick win';
    }
    if (typeof FB !== 'undefined' && !FB.allowed(r))
      return 'Only the administrator can change the status or reply — you can edit your feedback while it is New';
    return '';
  },
  /* help desk: only the super admin (or someone given "Add, delete and fix help desk requests by hand") adds one by hand or deletes one (the import adds and updates) */
  hdAllowed(r) {
    if (!r || r.c !== 'helpdesk' || Store.isSuper(App.me) || Store.can(App.me, 'editHelpdeskByHand')) return true;
    if (r._del) return !!(Store._importing && r.goneOn);
    const isNew = !r.id || !Store.db.get(r.id);
    return !(isNew && !Store._importing);
  },
  /* only the super admin may hide a project or change who sees it */
  privacyAllowed(r) {
    if (!r || r.c !== 'project' || Store.isSuper(App.me)) return true;
    const p = r.id ? Store.db.get(r.id) : null;
    const eq = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
    return eq(!!r.restricted, !!(p && p.restricted)) && eq((r.viewers || []).slice().sort(), ((p && p.viewers) || []).slice().sort());
  },
});

/* the dialog (project page → 🔒 Who can see it) */
function projectVisibility(p) {
  const people = Store.members().filter(m => m.active !== false);
  const on = !!p.restricted;
  const cur = new Set(on ? p.viewers || [] : [p.manager, ...(p.members || []), ...Scrum.items(p.id).map(t => t.assignee)].filter(Boolean));
  const groups = [['_top', Store.orgName() + ' — directors / AED'], ...Store.teams().map(t => [t.id, t.name])];
  UI.modal({
    title: '🔒 Who can see “' + p.name + '”',
    wide: true,
    body: `<label class="check"><input type="checkbox" id="pvon" ${on ? 'checked' : ''}> <b>Hidden project</b> — only the people ticked below (and you) can see it</label>
    <p class="muted small">Everyone else will not see it anywhere: not in Projects, My work, the Director Desk, the overview or Performance. Owner, members and people with tasks are ticked for you the first time.</p>
    <div class="pv-groups">${groups
      .map(([g, l]) => {
        const ms = people.filter(m => (g === '_top' ? Store.topRole(m.role) : !Store.topRole(m.role) && (m.team || 'apps') === g));
        return ms.length
          ? `<div class="pv-g"><div class="nav-g">${h(l)} <button class="btn xs ghost" data-pvall="${h(g)}">all</button></div>${ms.map(m => `<label class="check"><input type="checkbox" name="pv" data-g="${h(g)}" value="${h(m.id)}" ${cur.has(m.id) ? 'checked' : ''}> ${h(m.short || m.name)} <span class="muted small">${h(Store.titleOf(m))}</span></label>`).join('')}</div>`
          : '';
      })
      .join('')}</div>`,
    actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>`,
    onMount: w => {
      w.querySelectorAll('[data-pvall]').forEach(
        b =>
          (b.onclick = e => {
            e.preventDefault();
            const bx = [...w.querySelectorAll(`[name=pv][data-g="${b.dataset.pvall}"]`)];
            const all = bx.every(x => x.checked);
            bx.forEach(x => {
              x.checked = !all;
            });
          })
      );
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelector('[data-ok]').onclick = () => {
        const hide = w.querySelector('#pvon').checked;
        const viewers = [...w.querySelectorAll('[name=pv]:checked')].map(c => c.value);
        if (hide && !viewers.length) return UI.toast('Tick at least one person — or untick "Hidden project"', 'bad');
        const r = Object.assign({}, Store.get(p.id), { restricted: hide, viewers: hide ? viewers : [] });
        Store.save(r);
        UI.closeModal();
        UI.toast(hide ? `Hidden — ${viewers.length} person(s) can see it` : 'Visible to the team again', 'good');
        App.render();
      };
    },
  });
}
