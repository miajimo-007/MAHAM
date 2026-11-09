/* MAHAM — Admin → Task workflows: build workflows (statuses, categories, transitions, rules, screens),
 * pick each team's default and per-project overrides, the resolutions list, "Test as…", and moving tasks whose
 * status disappears. Super admin: every team + shared; an Admin with "Workflows": their own team(s). */
'use strict';

const TFE = { scope: null, draft: null };

const TaskFlowAdmin = {
  scopes() {
    const all = App.isSuper() || AdminRole.can(App.me, 'workflows', '*');
    const teams = Store.teams().filter(t => all || AdminRole.teamsOf(App.me).includes(t.id));
    return (all ? [['', 'Shared (every team can use)']] : []).concat(teams.map(t => [t.id, t.name]));
  },
  can(scope) {
    return App.isSuper() || AdminRole.can(App.me, 'workflows', scope || '*');
  },
  recId(scope) {
    return scope ? 'settings-taskflow-' + scope : 'settings-taskflow';
  },
  rec(scope) {
    return Store.get(TaskFlowAdmin.recId(scope)) || { id: TaskFlowAdmin.recId(scope), c: 'settings' };
  },
  save(scope, patch) {
    Store.save(Object.assign({}, TaskFlowAdmin.rec(scope), patch));
  },
  /* projects whose tasks follow this workflow */
  users(wfId) {
    return Store.all('project', '*').filter(p => p.status !== 'Canceled' && TaskFlow.allOf(p).some(w => w.id === wfId));
  },
  /* work out something as if the team's record were already `next` */
  asIf(team, next, fn) {
    const o = TaskFlow.teamRec;
    TaskFlow.teamRec = tm => ((tm || 'apps') === team ? next : o(tm));
    TaskFlow._cache = null;
    try {
      return fn();
    } finally {
      TaskFlow.teamRec = o;
      TaskFlow._cache = null;
    }
  },

  page() {
    const scopes = TaskFlowAdmin.scopes();
    if (!scopes.length) return { html: empty('No teams to manage.') };
    if (TFE.scope == null || !scopes.some(s => s[0] === TFE.scope))
      TFE.scope = scopes.some(s => s[0] === App.viewTeam) ? App.viewTeam : scopes[0][0];
    if (TFE.draft) return TaskFlowAdmin.editor();
    const sc = TFE.scope;
    const rec = TaskFlowAdmin.rec(sc);
    const flows = rec.flows || [];
    const opt = (v, l, sel) => `<option value="${h(v)}" ${v === sel ? 'selected' : ''}>${h(l)}</option>`;
    const chips = w =>
      `<div class="fl-chips">${TaskFlow.norm(w)
        .statuses.map(s => `<span class="tf-st" style="--c:${h(s.color || TaskFlow.CAT_COLOR[s.cat || 'todo'])}">${h(s.name)}</span>`)
        .join(' → ')}</div>`;
    let html = `<div class="page-actions"><span class="muted small">How project <b>tasks</b> move: statuses (each <b>To Do</b>, <b>In Progress</b> or <b>Done</b>), the moves allowed between them, who may make each move, what must be filled first and what happens after. Scoring, late work and progress read the category, not the column name. (Project <i>stages</i> are in Workflows.)</span></div>
      <div class="filters"><label>For <select id="tfscope">${scopes.map(([v, l]) => opt(v, l, sc)).join('')}</select></label></div>`;
    if (sc) {
      const tr = TaskFlow.teamRec(sc);
      const all = TaskFlow.listFor(sc);
      const ps = Store.all('project', '*').filter(p => Scrum.teamOf(p) === sc && !['Done', 'Canceled'].includes(p.status));
      const wopts = sel => opt('', 'Team default', sel) + all.map(w => opt(w.id, w.name + (w.shared ? ' (shared)' : ''), sel)).join('');
      const types = Store.lists(sc).ptaskTypes || ['Story', 'Task', 'Bug'];
      html += card(
        `Which workflow ${h(Store.teamName(sc))} uses`,
        `<form class="grid-form" id="tfuse"><label class="fld"><span>Team default</span><select name="use">${opt('', 'Board columns (simple — any move)', tr.use || '')}${all.map(w => opt(w.id, w.name + (w.shared ? ' (shared)' : ''), tr.use || '')).join('')}</select></label>${types.map(ty => `<label class="fld"><span>${h(ty)} tasks</span><select data-tftype="${h(ty)}">${wopts((tr.types || {})[ty] || '')}</select></label>`).join('')}</form>
        <p class="muted small">Each task type can follow its own workflow. When a project mixes workflows, its board shows one column per category (To Do · Waiting · In Progress · Done) and each card shows its own status.</p>
        ${ps.length ? `<details ${Object.keys(tr.projects || {}).length ? 'open' : ''}><summary class="small"><b>Projects with their own workflow</b> (${Object.keys(tr.projects || {}).filter(id => ps.some(p => p.id === id)).length})</summary><table class="tbl"><tbody>${ps.map(p => `<tr><td>${h(p.name)}</td><td><select data-tfproj="${h(p.id)}">${wopts((tr.projects || {})[p.id] || '')}</select></td></tr>`).join('')}</tbody></table></details>` : ''}
        <div class="row-btns"><button class="btn primary" id="tfusesave">Save</button></div>`
      );
    }
    html += card(
      `Workflows ${sc ? 'of ' + h(Store.teamName(sc)) : '(shared)'}`,
      `<div class="row-btns"><button class="btn" id="tfnew">＋ New from the standard example</button><button class="btn ghost" id="tfnewb">＋ New from the board columns</button><button class="btn ghost" id="tfset" title="New → To Do → In Progress → Completed; Story: Analysis → In Testing; Bug: Troubleshooting → Waiting → UAT → Deployed; On hold / Waiting approval / Feedback / Waiting access / Rejected / Canceled from any status">＋ Task, Story and Bug set</button></div>
      ${
        flows.length
          ? flows
              .map(w => {
                const n = TaskFlowAdmin.users(w.id).length;
                return `<div class="tf-tr"><b>${h(w.name)}</b> <span class="muted small">· ${(w.trs || []).length} move(s) · ${n} project(s)</span>${chips(w)}<span class="row-btns tight"><button class="btn xs" data-tfedit="${h(w.id)}">Edit</button><button class="btn xs ghost" data-tfcopy="${h(w.id)}">Copy</button>${n ? '' : `<button class="btn xs ghost" data-tfdel="${h(w.id)}">Delete</button>`}</span></div>`;
              })
              .join('')
          : empty(
              'No workflows here yet — tasks use the board columns. Start from the standard example (To Do → In Progress → In Review → Done, with Reopen).'
            )
      }`
    );
    if (TaskFlowAdmin.can(''))
      html += card(
        'Resolutions (every team)',
        `<p class="muted small">Why a task was closed. One per line — the first is used when nobody picks one.</p><textarea id="tfres" rows="5" style="width:100%">${h(TaskFlow.resolutions().join('\n'))}</textarea><div class="row-btns"><button class="btn primary" id="tfressave">Save resolutions</button></div>`
      );
    return {
      html,
      mount(root) {
        root.querySelector('#tfscope').onchange = e => {
          TFE.scope = e.target.value;
          App.render();
        };
        const us = root.querySelector('#tfusesave');
        if (us)
          us.onclick = () => {
            const projects = {};
            root.querySelectorAll('[data-tfproj]').forEach(s => {
              if (s.value) projects[s.dataset.tfproj] = s.value;
            });
            const keep = Object.assign({}, TaskFlow.teamRec(sc).projects || {});
            root.querySelectorAll('[data-tfproj]').forEach(s => delete keep[s.dataset.tfproj]);
            const types = {};
            root.querySelectorAll('[data-tftype]').forEach(s => {
              if (s.value) types[s.dataset.tftype] = s.value;
            });
            TaskFlowAdmin.switchTo(sc, {
              use: root.querySelector('#tfuse [name=use]').value,
              types,
              projects: Object.assign(keep, projects),
            });
          };
        const open = w => {
          TFE.draft = JSON.parse(JSON.stringify(w));
          App.render();
        };
        root.querySelector('#tfnew').onclick = () => open(Object.assign(TaskFlow.example(), { _new: true }));
        root.querySelector('#tfnewb').onclick = () =>
          open(Object.assign(TaskFlow.seed(sc || 'apps'), { id: U.uid('tf'), name: 'Board columns', simple: false, _new: true }));
        root.querySelector('#tfset').onclick = () => {
          const ex = TaskFlow.examples();
          TaskFlowAdmin.save(sc, { flows: flows.concat(ex) });
          UI.toast(sc ? 'Added Task, Story and Bug — pick them per type above' : 'Added', 'good');
          App.render();
        };
        root.querySelectorAll('[data-tfedit]').forEach(b => (b.onclick = () => open(flows.find(w => w.id === b.dataset.tfedit))));
        root.querySelectorAll('[data-tfcopy]').forEach(
          b =>
            (b.onclick = () => {
              const w = flows.find(x => x.id === b.dataset.tfcopy);
              open(Object.assign(JSON.parse(JSON.stringify(w)), { id: U.uid('tf'), name: w.name + ' (copy)', _new: true }));
            })
        );
        root.querySelectorAll('[data-tfdel]').forEach(
          b =>
            (b.onclick = () =>
              UI.confirm('Delete this workflow?', () => {
                TaskFlowAdmin.save(sc, { flows: flows.filter(w => w.id !== b.dataset.tfdel) });
                UI.toast('Deleted', 'good');
                App.render();
              }))
        );
        const rs = root.querySelector('#tfressave');
        if (rs)
          rs.onclick = () => {
            const l = [
              ...new Set(
                root
                  .querySelector('#tfres')
                  .value.split('\n')
                  .map(x => x.trim())
                  .filter(Boolean)
              ),
            ];
            if (!l.length) return UI.toast('Keep at least one', 'bad');
            TaskFlowAdmin.save('', { resolutions: l });
            UI.toast('Resolutions saved', 'good');
            App.render();
          };
      },
    };
  },

  /* changing which workflow projects use: tasks whose status is not in the new one are moved (asked first) */
  switchTo(team, patch) {
    const cur = TaskFlow.teamRec(team);
    const next = Object.assign({ id: 'settings-taskflow-' + team, c: 'settings' }, cur, patch);
    const ps = Store.all('project', '*').filter(p => Scrum.teamOf(p) === team);
    const plan = TaskFlowAdmin.asIf(team, next, () => ps.flatMap(p => TaskFlow.mapping(p)));
    const go = map => {
      const recs = [next];
      for (const x of plan) {
        const to = map ? map[x.t.status + '|' + x.w.id] || x.to : x.to;
        recs.push(
          Object.assign({}, x.t, {
            status: to,
            hist: [...(x.t.hist || []), { at: Date.now(), by: App.me, from: x.t.status, to, tr: 'Workflow changed' }].slice(-60),
          })
        );
      }
      Store.saveMany(recs);
      UI.closeModal();
      UI.toast(`Saved${plan.length ? ` · ${plan.length} task(s) moved` : ''}`, 'good');
      App.render();
    };
    if (!plan.length) return go(null);
    TaskFlowAdmin.mapDialog(plan, go);
  },
  /* the mapping step: each old status → a status of the new workflow */
  mapDialog(plan, go) {
    const keys = new Map();
    for (const x of plan) {
      const k = x.t.status + '|' + x.w.id;
      if (!keys.has(k)) keys.set(k, { from: x.t.status, w: x.w, to: x.to, n: 0 });
      keys.get(k).n++;
    }
    UI.modal({
      title: 'Move tasks to the new statuses',
      wide: true,
      body: `<p class="muted small">${plan.length} open or finished task(s) have a status the new workflow does not have. Pick where each goes.</p><div class="tf-map">${[...keys].map(([k, x]) => `<div><b>${h(x.from || '—')}</b> <span class="muted small">(${x.n} · ${h(x.w.name)})</span></div><select data-tfmap="${h(k)}">${x.w.statuses.map(s => `<option ${s.name === x.to ? 'selected' : ''}>${h(s.name)}</option>`).join('')}</select>`).join('')}</div>`,
      actions: '<button class="btn primary" id="tfmapgo">Move and save</button>',
      onMount(w) {
        w.querySelector('#tfmapgo').onclick = () => {
          const m = {};
          w.querySelectorAll('[data-tfmap]').forEach(s => (m[s.dataset.tfmap] = s.value));
          go(m);
        };
      },
    });
  },

  /* ---------- the editor ---------- */
  ruleRow(kind, r, ti, ri, names) {
    const lib = kind === 'cond' ? TaskFlow.CONDS : kind === 'valid' ? TaskFlow.VALIDS : TaskFlow.POSTS;
    const sel = (cls, list, v) =>
      `<select class="${cls}">${list.map(([a, b]) => `<option value="${h(a)}" ${a === v ? 'selected' : ''}>${h(b)}</option>`).join('')}</select>`;
    const ppl = Store.visible()
      .filter(m => m.active !== false && (!TFE.scope || (m.team || 'apps') === TFE.scope || Store.topRole(m.role)))
      .map(m => [m.id, Store.memberName(m.id)]);
    let cfg = '';
    if (r.k === 'roles')
      cfg = Config.ROLES.concat([['admin', 'Admin']])
        .map(
          ([v, l]) =>
            `<label class="chk small"><input type="checkbox" class="rk-roles" value="${h(v)}" ${(r.roles || []).includes(v) ? 'checked' : ''}> ${h(l)}</label>`
        )
        .join('');
    else if (r.k === 'people')
      cfg = `<select class="rk-ids" multiple size="3">${ppl.map(([v, l]) => `<option value="${h(v)}" ${(r.ids || []).includes(v) ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>`;
    else if (r.k === 'stage')
      cfg = `<input class="rk-stages" placeholder="e.g. In Progress, UAT" value="${h((r.stages || []).join(', '))}">`;
    else if (r.k === 'field') cfg = sel('rk-field', TaskFlow.FIELDS, r.field);
    else if (r.k === 'resolution')
      cfg = sel(
        'rk-value',
        TaskFlow.resolutions().map(x => [x, x]),
        r.value
      );
    else if (r.k === 'assign')
      cfg = sel(
        'rk-who',
        [
          ['reporter', 'the person who created it'],
          ['owner', 'the project owner'],
          ['me', 'the person making the move'],
          ['none', 'nobody (unassign)'],
        ].concat(ppl),
        r.who
      );
    else if (r.k === 'notify')
      cfg = sel(
        'rk-who',
        [
          ['assignee', 'the person assigned'],
          ['reporter', 'the person who created it'],
          ['owner', 'the project owner'],
        ].concat(ppl),
        r.who
      );
    else if (r.k === 'set')
      cfg =
        sel(
          'rk-field',
          TaskFlow.FIELDS.filter(f => f[0] !== 'resolution' && f[0] !== 'assignee'),
          r.field
        ) + `<input class="rk-value" placeholder="value · @today · @me" value="${h(r.value || '')}">`;
    return `<div class="tf-rule" data-r="${ti}|${kind}|${ri}" data-k="${h(r.k)}"><span class="small">${h(lib[r.k] || r.k)}</span>${cfg}<button type="button" class="btn xs ghost" data-rdel="${ti}|${kind}|${ri}">✕</button></div>`;
  },
  editor() {
    const w = TFE.draft;
    const names = w.statuses.map(s => s.name).filter(Boolean);
    const sc = TFE.scope;
    const opt = (v, l, sel) => `<option value="${h(v)}" ${v === sel ? 'selected' : ''}>${h(l)}</option>`;
    const addSel = (kind, ti) => {
      const lib = kind === 'cond' ? TaskFlow.CONDS : kind === 'valid' ? TaskFlow.VALIDS : TaskFlow.POSTS;
      return `<select data-addr="${ti}|${kind}"><option value="">＋ add…</option>${Object.entries(lib)
        .map(([k, l]) => `<option value="${h(k)}">${h(l)}</option>`)
        .join('')}</select>`;
    };
    const diagram = `<div class="tf-diag">${w.statuses
      .map(s => {
        const out = (w.trs || [])
          .filter(t => (t.from || ['*']).includes(s.name) || (t.from || ['*']).includes('*'))
          .filter(t => t.to !== s.name);
        return `<div class="tf-node"><span class="tf-st" style="--c:${h(s.color || TaskFlow.CAT_COLOR[s.cat || 'todo'])}">${h(s.name)}</span>${s.name === w.start ? ' <span class="muted small">start</span>' : ''}${out.map(t => `<div class="small">→ ${h(t.to)} <span class="muted">${h(t.name || '')}${(t.cond || []).length ? ' 🔒' : ''}${(t.valid || []).length ? ' ✔' : ''}${(t.post || []).length ? ' ⚙' : ''}</span></div>`).join('') || '<div class="small muted">no way out</div>'}</div>`;
      })
      .join('')}</div>`;
    const html = `<div class="page-actions"><button class="btn ghost" id="tfback">← Task workflows</button><span class="grow"></span><button class="btn" id="tfcancel">Cancel</button><button class="btn primary" id="tfsave">Save workflow</button></div>
      ${card('Workflow', `<div class="grid-form"><label class="fld"><span>Name</span><input id="tfname" value="${h(w.name || '')}" placeholder="e.g. Development"></label><label class="fld"><span>New tasks start in</span><select id="tfstart">${names.map(n => opt(n, n, w.start)).join('')}</select></label><label class="chk"><input type="checkbox" id="tfbcat" ${w.boardCats ? 'checked' : ''}> Board: one column per category (good for many statuses)</label></div>`)}
      ${card('Picture', diagram + '<p class="muted small">🔒 who may · ✔ must be true · ⚙ then</p>')}
      ${card('Statuses', `<p class="muted small">The category is what counts: <b>Done</b> = finished (scoring, progress, late work); <b>In Progress</b> = started.</p>${w.statuses.map((s, i) => `<div class="tf-ed-st" data-si="${i}"><input class="tfs-n" value="${h(s.name)}" placeholder="Status name"><select class="tfs-c">${TaskFlow.CATS.map(([v, l]) => opt(v, l, s.cat || 'todo')).join('')}</select><input type="color" class="tfs-col" value="${h(s.color || TaskFlow.CAT_COLOR[s.cat || 'todo'])}"><button class="btn xs ghost" data-sdel="${i}" title="Remove">✕</button></div>`).join('')}<button class="btn xs" id="tfsadd">＋ Status</button>`)}
      ${card(
        'Moves (transitions)',
        `${(w.trs || [])
          .map(
            (
              t,
              ti
            ) => `<div class="tf-tr" data-ti="${ti}"><div class="tf-rule"><input class="tft-n" value="${h(t.name || '')}" placeholder="Button name, e.g. Start"> <span class="small">to</span> <select class="tft-to">${names.map(n => opt(n, n, t.to)).join('')}</select><span class="grow"></span><button class="btn xs ghost" data-tdel="${ti}">Remove move</button></div>
          <div class="tf-rule small"><b>From:</b> <label class="chk"><input type="checkbox" class="tft-from" value="*" ${(t.from || ['*']).includes('*') ? 'checked' : ''}> any status</label>${names.map(n => `<label class="chk"><input type="checkbox" class="tft-from" value="${h(n)}" ${(t.from || []).includes(n) ? 'checked' : ''}> ${h(n)}</label>`).join('')}</div>
          <div class="tf-rule small"><b>Ask on screen:</b> ${TaskFlow.SCREEN.map(([k, l]) => `<label class="chk"><input type="checkbox" class="tft-sc" value="${k}" ${(t.screen || []).includes(k) ? 'checked' : ''}> ${h(l)}</label>`).join('')}</div>
          <div class="tf-rules">${[
            ['cond', '🔒 Who may'],
            ['valid', '✔ Must be true'],
            ['post', '⚙ Then'],
          ]
            .map(
              ([kind, lab]) =>
                `<div class="tf-kind"><b class="small">${lab}</b>${(t[kind] || []).map((r, ri) => TaskFlowAdmin.ruleRow(kind, r, ti, ri, names)).join('')}${addSel(kind, ti)}</div>`
            )
            .join('')}</div></div>`
          )
          .join('')}<button class="btn xs" id="tftadd">＋ Move</button>`
      )}
      ${card(
        'Test as…',
        `<div class="filters"><label>Person <select id="tftwho">${Store.visible()
          .filter(m => m.active !== false && (!sc || (m.team || 'apps') === sc))
          .map(m => opt(m.id, Store.memberName(m.id), App.me))
          .join(
            ''
          )}</select></label><label>Task in <select id="tftst">${names.map(n => opt(n, n, w.start)).join('')}</select></label><label class="chk"><input type="checkbox" id="tftmine" checked> assigned to them</label><button class="btn" id="tftgo">Show their moves</button></div><div id="tftout"></div>`
      )}`;
    return {
      html,
      mount(root) {
        const keep = () => {
          TFE.draft = TaskFlowAdmin.collect(root, w);
        };
        const redo = () => {
          keep();
          App.render();
        };
        root.querySelector('#tfback').onclick = root.querySelector('#tfcancel').onclick = () => {
          TFE.draft = null;
          App.render();
        };
        root.querySelector('#tfsadd').onclick = () => {
          keep();
          TFE.draft.statuses.push({ name: '', cat: 'doing' });
          App.render();
        };
        root.querySelectorAll('[data-sdel]').forEach(
          b =>
            (b.onclick = () => {
              keep();
              TFE.draft.statuses.splice(+b.dataset.sdel, 1);
              App.render();
            })
        );
        root.querySelector('#tftadd').onclick = () => {
          keep();
          TFE.draft.trs.push({ id: U.uid('t'), name: '', from: ['*'], to: names[0] });
          App.render();
        };
        root.querySelectorAll('[data-tdel]').forEach(
          b =>
            (b.onclick = () => {
              keep();
              TFE.draft.trs.splice(+b.dataset.tdel, 1);
              App.render();
            })
        );
        root.querySelectorAll('[data-rdel]').forEach(
          b =>
            (b.onclick = () => {
              keep();
              const [ti, kind, ri] = b.dataset.rdel.split('|');
              TFE.draft.trs[+ti][kind].splice(+ri, 1);
              App.render();
            })
        );
        root.querySelectorAll('[data-addr]').forEach(
          s =>
            (s.onchange = () => {
              if (!s.value) return;
              keep();
              const [ti, kind] = s.dataset.addr.split('|');
              const t = TFE.draft.trs[+ti];
              (t[kind] = t[kind] || []).push({ k: s.value });
              App.render();
            })
        );
        root.querySelectorAll('.tfs-n, .tfs-c, .tft-to, .tft-from').forEach(x => x.addEventListener('change', redo));
        root.querySelector('#tftgo').onclick = () => {
          keep();
          root.querySelector('#tftout').innerHTML = TaskFlowAdmin.test(
            TFE.draft,
            root.querySelector('#tftwho').value,
            root.querySelector('#tftst').value,
            root.querySelector('#tftmine').checked
          );
        };
        root.querySelector('#tfsave').onclick = () => {
          keep();
          TaskFlowAdmin.saveDraft();
        };
      },
    };
  },
  /* read the editor back into the draft */
  collect(root, w) {
    const d = JSON.parse(JSON.stringify(w));
    const old = d.statuses.map(s => s.name);
    d.name = root.querySelector('#tfname').value.trim();
    d.start = root.querySelector('#tfstart').value;
    d.boardCats = root.querySelector('#tfbcat').checked;
    d.statuses = [...root.querySelectorAll('[data-si]')].map(r => ({
      name: r.querySelector('.tfs-n').value.trim(),
      cat: r.querySelector('.tfs-c').value,
      color: r.querySelector('.tfs-col').value,
    }));
    const ren = {};
    d.statuses.forEach((s, i) => {
      if (old[i] && s.name && old[i] !== s.name) ren[old[i]] = s.name;
    }); // a renamed status keeps its moves
    const rn = n => ren[n] || n;
    d.trs = [...root.querySelectorAll('[data-ti]')].map(r => {
      const ti = +r.dataset.ti;
      const o = w.trs[ti] || {};
      const rule = (kind, el) => {
        const k = el.dataset.k;
        const x = { k };
        const q = s => el.querySelector(s);
        if (k === 'roles') x.roles = [...el.querySelectorAll('.rk-roles:checked')].map(c => c.value);
        if (k === 'people') x.ids = [...q('.rk-ids').selectedOptions].map(o2 => o2.value);
        if (k === 'stage')
          x.stages = q('.rk-stages')
            .value.split(',')
            .map(s => s.trim())
            .filter(Boolean);
        if (q('.rk-field')) x.field = q('.rk-field').value;
        if (q('.rk-value')) x.value = q('.rk-value').value;
        if (q('.rk-who')) x.who = q('.rk-who').value;
        return x;
      };
      const by = kind => [...r.querySelectorAll(`[data-r^="${ti}|${kind}|"]`)].map(el => rule(kind, el));
      const from = [...r.querySelectorAll('.tft-from:checked')].map(c => c.value);
      return {
        id: o.id || U.uid('t'),
        name: r.querySelector('.tft-n').value.trim(),
        from: from.includes('*') ? ['*'] : from.map(rn),
        to: rn(r.querySelector('.tft-to').value),
        screen: [...r.querySelectorAll('.tft-sc:checked')].map(c => c.value),
        cond: by('cond'),
        valid: by('valid'),
        post: by('post'),
      };
    });
    d._ren = Object.assign({}, w._ren || {}, ren);
    d.start = rn(d.start);
    return d;
  },
  /* "Test as…": the moves a person would see on a task in a status */
  test(w, who, status, mine) {
    const p = Store.all('project').find(x => Scrum.teamOf(x) === (TFE.scope || x.team)) || {
      id: '_tf',
      team: TFE.scope || 'apps',
      manager: '',
    };
    const t = { id: '_tftest', c: 'ptask', project: p.id, status, assignee: mine ? who : '_nobody', checklist: [] };
    const o = TaskFlow.of;
    TaskFlow.of = () => TaskFlow.norm(w);
    try {
      const ms = TaskFlow.moves(t, who);
      return ms.length
        ? `<div class="li-list">${ms.map(m => `<div class="li"><span>${m.ok ? '✓' : '🔒'} <b>${h(m.tr.name || m.tr.to)}</b> → ${h(m.tr.to)}</span><span class="muted small">${h(m.ok ? [(m.tr.valid || []).length ? 'then checks: ' + m.tr.valid.map(v => TaskFlow.VALIDS[v.k]).join(', ') : '', (m.tr.screen || []).length ? 'asks: ' + m.tr.screen.join(', ') : ''].filter(Boolean).join(' · ') : m.why.join(', '))}</span></div>`).join('')}</div>`
        : empty(`No way out of “${status}”.`);
    } finally {
      TaskFlow.of = o;
    }
  },
  saveDraft() {
    const w = TFE.draft;
    const sc = TFE.scope;
    const names = w.statuses.map(s => s.name);
    const err = !w.name
      ? 'Give the workflow a name'
      : names.some(n => !n)
        ? 'Every status needs a name'
        : new Set(names).size !== names.length
          ? 'Two statuses have the same name'
          : names.length < 2
            ? 'At least two statuses'
            : !w.statuses.some(s => s.cat === 'done')
              ? 'At least one status must be in the Done category'
              : !(w.trs || []).length
                ? 'Add at least one move'
                : (w.trs || []).some(t => !t.from.length)
                  ? 'Every move needs a From'
                  : '';
    if (err) return UI.toast(err, 'bad');
    const clean = Object.assign({}, w);
    delete clean._new;
    delete clean._ren;
    delete clean.simple;
    delete clean.shared;
    clean.trs = clean.trs.map(t => Object.assign({}, t, { name: t.name || t.to }));
    const flows = (TaskFlowAdmin.rec(sc).flows || []).filter(x => x.id !== w.id).concat([clean]);
    // tasks of projects that use it, in a status that is gone → renamed ones follow, the rest are asked
    const plan = [];
    const ren = w._ren || {};
    for (const p of TaskFlowAdmin.users(w.id))
      for (const t of Scrum.items(p.id)) {
        if (TaskFlow.forTask(t).id !== w.id || names.includes(t.status)) continue;
        const to = ren[t.status] && names.includes(ren[t.status]) ? ren[t.status] : null;
        plan.push({
          t,
          to:
            to || TaskFlow.mapping(p, x2 => (x2.id === t.id ? clean : TaskFlow.forTask(x2))).find(x => x.t.id === t.id)?.to || clean.start,
          w: TaskFlow.norm(clean),
          auto: !!to,
        });
      }
    const go = map => {
      const recs = [Object.assign({}, TaskFlowAdmin.rec(sc), { flows })];
      for (const x of plan) {
        const to = !x.auto && map ? map[x.t.status + '|' + x.w.id] || x.to : x.to;
        recs.push(
          Object.assign({}, x.t, {
            status: to,
            hist: [...(x.t.hist || []), { at: Date.now(), by: App.me, from: x.t.status, to, tr: 'Workflow changed' }].slice(-60),
          })
        );
      }
      Store.saveMany(recs);
      TFE.draft = null;
      UI.closeModal();
      UI.toast(`Workflow saved${plan.length ? ` · ${plan.length} task(s) moved` : ''}`, 'good');
      App.render();
    };
    if (!plan.some(x => !x.auto)) return go(null);
    TaskFlowAdmin.mapDialog(
      plan.filter(x => !x.auto),
      m => {
        go(m);
      }
    );
  },
};

/* the tab: Admin → Task workflows (Organisation) — area "Workflows" */
(function wireAdmin() {
  const g = ADMIN_GROUPS.find(x => x[0] === 'Organisation');
  const i = g[1].findIndex(t => t[0] === 'workflows');
  g[1].splice(i + 1, 0, ['taskflows', 'Task workflows']);
  ADMIN_TABS.splice(ADMIN_TABS.findIndex(t => t[0] === 'workflows') + 1, 0, ['taskflows', 'Task workflows']);
  AdminUI.TAB_AREA.taskflows = 'workflows';
  ADMIN_FIND.push(['Task workflows — statuses, moves, resolutions', 'taskflows']);
  const base = P.admin;
  P.admin = sub => {
    if (sub !== 'taskflows') {
      if (TFE.draft && sub !== 'taskflows') TFE.draft = null;
      return base(sub);
    }
    const ok = App.isSuper() || AdminRole.mine().includes('workflows');
    if (!ok) return base(sub);
    const pg = TaskFlowAdmin.page();
    let head;
    if (App.isSuper()) head = adminHead('taskflows');
    else {
      const mine = AdminRole.mine();
      const tabs = [['home', 'Home']].concat(
        ADMIN_TABS.filter(([k]) => AdminUI.TAB_AREA[k] && mine.includes(AdminUI.TAB_AREA[k])).map(([k, n]) => [
          k,
          k === 'scoring' ? 'Scoring' : n,
        ])
      );
      head = AdminUI.head('taskflows', tabs);
    }
    return {
      title: 'Admin',
      html: head + pg.html,
      mount(root) {
        if (App.isSuper()) bindAdminSearch(root);
        if (pg.mount) pg.mount(root);
      },
    };
  };
})();
