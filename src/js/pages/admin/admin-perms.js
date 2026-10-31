/* DARRIK — Admin → Permissions: one matrix of people × permissions, and permission templates. */
'use strict';

function adminPerms() {
  const PS = Store.PERMS;
  const teams = Store.teams();
  const ft = LS.get('bct.adm.pteam', '');
  const rows = Store.members()
    .filter(
      m => m.active !== false && (!ft || (ft === '_top' ? Store.topRole(m.role) : !Store.topRole(m.role) && (m.team || 'apps') === ft))
    )
    .sort(
      (a, b) =>
        Store.topRole(b.role) - Store.topRole(a.role) ||
        String(a.team || '').localeCompare(String(b.team || '')) ||
        (b.role === 'manager') - (a.role === 'manager') ||
        a.name.localeCompare(b.name)
    );
  const tpls = Admin.templates();
  const html = `${card(
    'Permission matrix',
    `<div class="page-actions"><span class="muted small">Ticked = allowed. A highlighted box was changed from the role's default. Hover a column title for what it means.</span><span class="grow"></span>
      <label class="small">Show <select id="pteam"><option value="">Everyone</option><option value="_top" ${ft === '_top' ? 'selected' : ''}>${h(Store.orgName())} — directors / AED</option>${teams.map(t => `<option value="${h(t.id)}" ${ft === t.id ? 'selected' : ''}>${h(t.name)}</option>`).join('')}</select></label></div>
    <div class="tbl-scroll"><table class="tbl perm"><thead><tr><th class="ctr"><input type="checkbox" id="pselall" aria-label="Select all"></th><th>Person</th><th>Team</th><th>Role</th>${PS.map(([k, l, d]) => `<th class="ctr" title="${h(d)}">${h(l)}<br><input type="checkbox" data-col="${k}" title="Tick / untick the whole column" aria-label="Whole column ${h(l)}"></th>`).join('')}<th class="num">Changed</th></tr></thead><tbody id="pmrows">
    ${
      rows
        .map(
          m =>
            `<tr data-id="${h(m.id)}"><td class="ctr"><input type="checkbox" data-psel aria-label="Select ${h(m.name)}"></td><td class="nw"><a class="link" href="#/adminperson/${h(m.id)}"><b>${h(m.name)}</b></a></td><td>${h(Store.topRole(m.role) ? '—' : Store.teamName(m.team || 'apps'))}</td><td>${h(Store.roleLabel(m.role))}${m.superAdmin ? ' <span class="badge warn" title="What you can do in analyst mode. In Admin mode you have everything.">analyst mode</span>' : ''}</td>${PS.map(
              ([k]) => {
                const custom = m.perms && typeof m.perms[k] === 'boolean';
                return `<td class="ctr ${custom ? 'custom' : ''}"><input type="checkbox" data-p="${k}" ${Store.canA(m.id, k, 1) ? 'checked' : ''} aria-label="${h(k)}"></td>`;
              }
            ).join('')}<td class="num">${Object.keys(m.perms || {}).length || ''}</td></tr>`
        )
        .join('') || `<tr><td colspan="${PS.length + 5}">${empty('Nobody here.')}</td></tr>`
    }
    </tbody></table></div>
    <div class="row-btns"><button class="btn ghost" id="pmdefault">Selected → role defaults</button><select id="tplapply"><option value="">Apply a template to selected…</option>${tpls.map((t, i) => `<option value="${i}">${h(t.name)}</option>`).join('')}</select><span class="grow"></span><button class="btn primary" id="pmsave">Save permissions</button></div>
    <p class="muted small">Your own row is what you can do in <b>analyst mode</b> — in Admin mode you have everything. Directors start with every permission — untick to restrict.</p>`
  )}
  ${card(
    `Permission templates <span class="count">${tpls.length}</span>`,
    `<p class="muted small">A named set of permissions, e.g. "Senior analyst". Apply it to people in the matrix above (tick them, then choose the template).</p>
    ${
      tpls.length
        ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Template</th><th>Allows</th><th></th></tr></thead><tbody>${tpls
            .map(
              (t, i) =>
                `<tr><td><b>${h(t.name)}</b></td><td class="small">${h(
                  PS.filter(([k]) => t.perms[k])
                    .map(([, l]) => l)
                    .join(', ') || 'nothing'
                )}</td><td class="nw"><button class="btn xs" data-tpledit="${i}">Edit</button> <button class="btn xs ghost" data-tpldel="${i}">Delete</button></td></tr>`
            )
            .join('')}</tbody></table></div>`
        : empty('No templates yet.')
    }
    <div class="row-btns"><button class="btn" id="tplnew">＋ New template</button><select id="tplfrom"><option value="">＋ Copy from a person…</option>${rows.map(m => `<option value="${h(m.id)}">${h(m.name)}</option>`).join('')}</select></div>`
  )}`;
  return {
    html,
    mount(root) {
      root.querySelector('#pteam').onchange = e => {
        LS.set('bct.adm.pteam', e.target.value);
        App.render();
      };
      const sel = () => [...root.querySelectorAll('[data-psel]:checked')].map(c => c.closest('tr').dataset.id);
      root.querySelector('#pselall').onchange = e =>
        root.querySelectorAll('[data-psel]').forEach(c => {
          c.checked = e.target.checked;
        });
      root.querySelectorAll('[data-col]').forEach(
        c =>
          (c.onchange = () =>
            root.querySelectorAll(`#pmrows [data-p="${c.dataset.col}"]`).forEach(x => {
              x.checked = c.checked;
              x.closest('td').classList.add('custom');
            }))
      );
      root.querySelectorAll('#pmrows [data-p]').forEach(x => (x.onchange = () => x.closest('td').classList.add('custom')));
      root.querySelector('#pmsave').onclick = () => {
        const edits = {};
        root.querySelectorAll('#pmrows tr[data-id]').forEach(tr => {
          const e = (edits[tr.dataset.id] = {});
          tr.querySelectorAll('[data-p]').forEach(cb => {
            e[cb.dataset.p] = cb.checked;
          });
        });
        saveMembersAll(
          Store.members().map(m => {
            const e = edits[m.id];
            if (!e) return m;
            const perms = {};
            for (const [k, v] of Object.entries(e)) if (v !== Store.roleDefault(m.role || 'analyst', k)) perms[k] = v;
            return Object.assign({}, m, { perms });
          }),
          'Permissions saved'
        );
      };
      root.querySelector('#pmdefault').onclick = () => {
        const ids = sel();
        if (!ids.length) return UI.toast('Tick people first', 'bad');
        UI.confirm(`Put ${ids.length} person(s) back to their role's default permissions?`, () =>
          saveMembersAll(
            Store.members().map(m => (ids.includes(m.id) ? Object.assign({}, m, { perms: {} }) : m)),
            'Back to role defaults'
          )
        );
      };
      root.querySelector('#tplapply').onchange = e => {
        const t = tpls[+e.target.value];
        e.target.value = '';
        if (!t) return;
        const ids = sel();
        if (!ids.length) return UI.toast('Tick people first', 'bad');
        UI.confirm(`Apply "${t.name}" to ${ids.length} person(s)? Their current permissions are replaced.`, () =>
          saveMembersAll(Admin.applyTemplate(Store.members(), ids, t), `"${t.name}" applied`)
        );
      };
      const saveTpls = (list, msg) => {
        Store.save(Object.assign({}, Store.get('settings-permtemplates') || { id: 'settings-permtemplates', c: 'settings' }, { list }));
        UI.toast(msg, 'good');
        App.render();
      };
      const tplDialog = (i, seed) => {
        const t = i == null ? { name: '', perms: seed || {} } : tpls[i];
        UI.modal({
          title: i == null ? 'New permission template' : 'Edit template',
          body: `<form class="grid-form" id="tplf">${UI.field({ key: 'name', label: 'Template name', type: 'text', required: true, span: 2 }, t.name)}</form>
        <div class="permlist">${PS.map(([k, l, d]) => `<label class="check"><input type="checkbox" data-tp="${k}" ${t.perms[k] ? 'checked' : ''}> <span><b>${h(l)}</b>${d ? `<br><span class="muted small">${h(d)}</span>` : ''}</span></label>`).join('')}</div>`,
          actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>`,
          onMount: w => {
            w.querySelector('[data-c]').onclick = UI.closeModal;
            w.querySelector('[data-ok]').onclick = () => {
              const name = w.querySelector('[name=name]').value.trim();
              if (!name) return UI.toast('Name the template', 'bad');
              const perms = {};
              w.querySelectorAll('[data-tp]').forEach(c => {
                perms[c.dataset.tp] = c.checked;
              });
              const list = tpls.slice();
              const x = { name, perms };
              if (i == null) list.push(x);
              else list[i] = x;
              UI.closeModal();
              saveTpls(list, 'Template saved');
            };
          },
        });
      };
      root.querySelector('#tplnew').onclick = () => tplDialog(null);
      root.querySelector('#tplfrom').onchange = e => {
        const id = e.target.value;
        e.target.value = '';
        if (!id) return;
        const perms = {};
        for (const [k] of PS) perms[k] = Store.canA(id, k, 1);
        tplDialog(null, perms);
      };
      root.querySelectorAll('[data-tpledit]').forEach(b => (b.onclick = () => tplDialog(+b.dataset.tpledit)));
      root.querySelectorAll('[data-tpldel]').forEach(
        b =>
          (b.onclick = () =>
            UI.confirm('Delete this template? People keep their permissions.', () =>
              saveTpls(
                tpls.filter((_, i) => i !== +b.dataset.tpldel),
                'Template deleted'
              )
            ))
      );
    },
  };
}
