/* MAHAM — Settings — per-team lists and scoring (super admin only). */
'use strict';

P.settings = mode => {
  if (mode !== 'lists') {
    setTimeout(() => {
      location.hash = '#/admin/settings/lists';
    }, 0);
    return { title: 'Admin', html: '' };
  } // Settings now lives in Admin → Settings → Lists
  const lists = Store.lists();
  const S = Calc.scoring();
  const LISTS = [
    ['taskTypes', 'Shadow work task types (lines starting with >>> are group headings)'],
    ['sources', 'Shadow work sources'],
    ['modules', 'Modules'],
    ['qwTypes', 'Quick win types'],
    ['qwStatus', 'Quick win statuses'],
    ['centralStatus', 'Central statuses'],
    ['centralTypes', 'Central types'],
    ['leaveTypes', 'Leave types'],
    ['wards', 'Departments / wards'],
    ['facilities', 'Facilities'],
    ['urgency', 'Urgency levels'],
    ['courseStatus', 'Course statuses'],
    ['projectCategories', 'Project categories'],
    ['ptaskTypes', 'Project task types (Story, Task, Bug, …)'],
    ['boardColumns', 'Project board columns — first = new tasks, last = done (at least 2)'],
  ];
  const html = `<div class="insights"><div>Scoring rules and dropdown lists for <b>${h(Store.teamName(App.viewTeam))}</b> — switch team at the top to edit another team. Board columns and project categories are among the lists below.</div></div>
  ${card(
    `Scoring rules — ${h(Store.teamName(App.viewTeam))}`,
    `<p class="muted small">These rules apply to the ${h(Store.teamName(App.viewTeam))} team in ${App.year} (and later years until changed). Changing them never changes earlier years. Switch team at the top to edit another team.</p><div class="grid-form">${Object.entries(
      S.weights
    )
      .map(([k, v]) =>
        UI.field(
          {
            key: 'w_' + k,
            label: `Weight — ${{ todo: 'To Do on-time', helpdesk: 'IT help desk', attendance: 'Attendance', quickwins: 'Quick wins', shadow: 'Shadow work' }[k]} (%)`,
            type: 'number',
          },
          v
        )
      )
      .join('')}
    ${UI.field({ key: 's_closing', label: 'Help desk: closing-time share (%)', type: 'number' }, S.helpdeskSplit.closing)}${UI.field({ key: 's_target', label: 'Closing target (hours)', type: 'number' }, S.closingTargetHrs)}${UI.field({ key: 's_long', label: '"Long elapsed" threshold (hours)', type: 'number' }, S.longElapsedHrs)}
    ${UI.field({ key: 's_tiers', label: 'Tier tables (advanced, JSON)', type: 'textarea', span: 2, rows: 6 }, JSON.stringify(S.tiers))}</div>
    <div class="row-btns"><button class="btn ghost" id="resetscore">Reset to workbook rules</button><span class="grow"></span><button class="btn primary" id="savescore">Save scoring</button></div>`
  )}
  ${card(`Dropdown lists — ${h(Store.teamName(App.viewTeam))}`, `<p class="muted small">Lists for the ${h(Store.teamName(App.viewTeam))} team (task types, modules, wards…). Teams without their own lists use the default ones.</p><div class="cols2">${LISTS.map(([k, l]) => `<div class="fld"><label>${h(l)}</label><textarea data-list="${k}" rows="${k === 'taskTypes' || k === 'wards' ? 10 : 5}">${h((lists[k] || []).join('\n'))}</textarea></div>`).join('')}</div><div class="row-btns"><span class="grow"></span><button class="btn primary" id="savelists">Save lists</button></div>`)}
`;
  return {
    title: 'Settings',
    html,
    mount(root) {
      (root.querySelector('#switchme') || {}).onclick = () => {
        if (App.realSuper()) App.chooseMe(true);
      };
      (root.querySelector('#pickfolder') || {}).onclick = async () => {
        try {
          await Store.pick();
          await Store.sync(true);
          App.render();
          UI.toast('Folder connected', 'good');
        } catch (e) {
          if (e.name !== 'AbortError')
            UI.toast(e.message === 'NOT_APP_FOLDER' ? 'That folder has no "data" folder — pick the MAHAM app folder.' : e.message, 'bad');
        }
      };
      const ea = root.querySelector('#exportall');
      if (ea) ea.onclick = exportAll;
      const sp = root.querySelector('#setmypin');
      if (sp) sp.onclick = () => App.setPin();
      if (!App.can('manageTeam') && !AdminRole.any(App.me)) return;
      if (App.isSuper() || App.can('manageTeam')) bindPerms(root);
      (root.querySelector('#addmember') || {}).onclick = () => {
        UI.modal({
          title: 'Add team member',
          body: `<form class="grid-form" id="nm">${UI.field({ key: 'name', label: 'Full name (as you want it shown)', type: 'text', required: true })}${UI.field({ key: 'short', label: 'Short name', type: 'text', required: true })}${UI.field({ key: 'me', label: 'Name in ManageEngine (Technician)', type: 'text' })}${UI.field({ key: 'team', label: 'Team', type: 'select', options: (App.isDir() ? Store.teams() : Store.teams().filter(t => t.id === App.viewTeam)).map(t => [t.id, t.name]), blank: false }, App.viewTeam)}${App.isSuper() ? UI.field({ key: 'role', label: 'Role', type: 'select', options: Store.ROLES.filter(([v]) => v !== 'director'), blank: false }, 'analyst') : '<p class="muted small span2">New people are added as Analysts. The administrator sets roles and permissions.</p>'}${UI.field({ key: 'scored', label: 'Include in scoring (analysts)', type: 'bool' }, true)}</form>`,
          actions: `<span class="grow"></span><button class="btn primary" data-ok>Add</button>`,
          onMount: w =>
            (w.querySelector('[data-ok]').onclick = () => {
              const v = UI.readForm(w.querySelector('#nm'), [
                { key: 'name' },
                { key: 'short' },
                { key: 'me' },
                { key: 'scored', type: 'bool' },
                { key: 'team' },
                { key: 'role' },
              ]);
              if (!v.name || !v.short) return UI.toast('Name and short name needed', 'bad');
              let id = U.slug(v.short);
              while (Store.members().some(m => m.id === id)) id += '2';
              const t = Store.members().concat([
                {
                  id,
                  name: v.name,
                  short: v.short,
                  me: v.me || v.name,
                  scored: v.role === 'manager' ? false : v.scored,
                  active: true,
                  aliases: [],
                  team: v.team || App.viewTeam,
                  role: v.role || 'analyst',
                },
              ]);
              Store.save(Object.assign({}, Store.get('settings-team'), { id: 'settings-team', c: 'settings', members: t }));
              UI.closeModal();
              App.render();
            }),
        });
      };
      (root.querySelector('#saveteam') || {}).onclick = () => {
        const t = Store.members().map(m => Object.assign({}, m));
        root.querySelectorAll('#teamrows tr').forEach(tr => {
          const m = t.find(x => x.id === tr.dataset.id);
          if (!m) return;
          tr.querySelectorAll('[data-k]').forEach(inp => {
            const k = inp.dataset.k;
            m[k] =
              inp.type === 'checkbox'
                ? inp.checked
                : inp.tagName === 'SELECT'
                  ? inp.value
                  : k === 'aliases'
                    ? inp.value
                        .split(',')
                        .map(x => x.trim())
                        .filter(Boolean)
                    : inp.value.trim();
          });
        });
        Store.save(Object.assign({}, Store.get('settings-team'), { id: 'settings-team', c: 'settings', members: t }));
        UI.toast('Team saved', 'good');
        App.render();
      };
      (root.querySelector('#savelists') || {}).onclick = () => {
        const l = Object.assign({}, lists);
        root.querySelectorAll('[data-list]').forEach(ta => {
          l[ta.dataset.list] = ta.value
            .split('\n')
            .map(x => x.trim())
            .filter(Boolean);
        });
        Store.save({ id: 'settings-lists-' + App.viewTeam, c: 'settings', lists: l });
        UI.toast(`Lists saved for ${Store.teamName(App.viewTeam)}`, 'good');
      };
      (root.querySelector('#savescore') || {}).onclick = () => {
        const g = k => +root.querySelector(`[name="${k}"]`).value;
        let tiers;
        try {
          tiers = JSON.parse(root.querySelector('[name=s_tiers]').value);
        } catch (e) {
          return UI.toast('Tier tables are not valid JSON', 'bad');
        }
        const weights = {};
        for (const k of Object.keys(S.weights)) weights[k] = g('w_' + k);
        const tot = U.sum(Object.values(weights));
        if (Math.abs(tot - 100) > 0.01) return UI.toast(`Weights add up to ${tot}%, they must total 100%`, 'bad');
        const sc = {
          weights,
          helpdeskSplit: { closing: g('s_closing'), requests: 100 - g('s_closing') },
          closingTargetHrs: g('s_target'),
          longElapsedHrs: g('s_long'),
          tiers,
        };
        const doSave = () => {
          Calc.saveScoring(App.viewTeam, sc, App.year);
          UI.toast(`Scoring saved for ${Store.teamName(App.viewTeam)} — live scores recalculated`, 'good');
          App.render();
        };
        if (new Date().getMonth() > 0)
          UI.confirm(
            `Change the scoring rules for ${Store.teamName(App.viewTeam)} mid-year? Every month that is not locked will be recalculated with the new rules (try it first in Admin → Scoring).`,
            doSave
          );
        else doSave();
      };
      (root.querySelector('#resetscore') || {}).onclick = () =>
        UI.confirm(`Reset ${Store.teamName(App.viewTeam)} scoring to the original workbook rules?`, () => {
          Calc.saveScoring(App.viewTeam, null, App.year);
          App.render();
        });
    },
  };
};

async function exportAll() {
  const defs = [
    ['To Do List', 'todo'],
    ['Shadow Works', 'shadow'],
    ['MEDataSource', 'helpdesk'],
    ['Attendance', 'attendance'],
    ['Quick Wins', 'quickwin'],
    ['Central FU', 'central'],
    ['Manager Tasks', 'mgrtask'],
    ['On-Call Sheet', 'oncall'],
    ['Courses', 'course'],
    ['Recommended Courses', 'reccourse'],
    ['IT Directory', 'itdir'],
    ['EMR Directory', 'emrdir'],
    ['SRS', 'srs'],
    ['Info', 'info'],
    ['Score History', 'scoresnap'],
  ];
  for (const c of Object.keys(Store.byC || {}))
    if (
      !defs.some(d => d[1] === c) &&
      !['settings', 'usage', 'adminlog', 'userpin', 'annread', 'ping'].includes(c) &&
      (Store.byC[c] || []).length
    )
      defs.push([c.charAt(0).toUpperCase() + c.slice(1), c]);
  const sheets = defs.map(([name, c]) => {
    const recs = Store.all(c, '*');
    const keys = [...new Set(recs.flatMap(r => Object.keys(r)))].filter(k => !['c', '_ts', '_by', '_del'].includes(k));
    const conv = (k, v) => (k === 'analyst' ? Store.memberName(v) : typeof v === 'boolean' ? (v ? 'Y' : '') : v);
    return {
      name,
      rows: [
        [...keys, 'Last edited by', 'Last edited'],
        ...recs.map(r => [...keys.map(k => conv(k, r[k])), Store.memberShort(r._by) || r._by, r._ts ? U.fmtTs(r._ts) : '']),
      ],
    };
  });
  XL.download(await XL.write(sheets), `MAHAM backup ${U.todayStr()}.xlsx`);
  UI.toast('Backup downloaded', 'good');
}
