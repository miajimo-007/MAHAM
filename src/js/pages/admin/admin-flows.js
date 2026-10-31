/* DARRIK — Admin → Workflows: statuses, allowed moves, who may move, one approver, conditions, stuck alerts.
 * Only the super admin can change them (they are settings). Rules live in domain/flows.js. */
'use strict';

const WF = { draft: null, maps: {} };

function adminFlows() {
  if (WF.draft) return flowEditor();
  const list = Flow.list();
  const html = `<div class="page-actions"><span class="muted small">A workflow is the path a project follows — its stages, which moves are allowed, who may make them, which need an approval and what must be done first. Pick it in the project form.</span><span class="grow"></span><button class="btn" id="wfex">Start from example</button><button class="btn primary" id="wfnew">＋ New workflow</button></div>
  ${
    list.length
      ? list
          .map(w => {
            const n = Flow.inUse(w.id).length;
            return card(
              `${h(w.name)} <span class="muted small">· ${w.team ? h(Store.teamName(w.team)) : 'every team'} · ${n} project(s)</span>`,
              `<div class="fl-chips">${w.statuses.map(s => `<span class="fl-chip" style="--c:${h(s.color || '#64748b')}">${h(s.name)}${s.id === w.start ? ' <small>start</small>' : ''}${+s.alert ? ` <small>⏰${+s.alert}d</small>` : ''}</span>`).join('<span class="fl-arr">›</span>')}</div>
      <p class="muted small">${(w.moves || []).length} allowed move(s) · ${(w.moves || []).filter(m => m.approver).length} need approval</p>`,
              `<span class="row-btns tight"><button class="btn xs" data-wfedit="${h(w.id)}">Edit</button><button class="btn xs ghost" data-wfcopy="${h(w.id)}">Duplicate</button>${n ? '' : `<button class="btn xs ghost danger" data-wfdel="${h(w.id)}">Delete</button>`}</span>`
            );
          })
          .join('')
      : empty(
          'No workflows yet — projects use the simple status list. Start from the example (To Do → In Analysis → Dev → UAT → Done) or build your own.'
        )
  }`;
  return {
    html,
    mount(root) {
      const open = w => {
        WF.draft = JSON.parse(JSON.stringify(w));
        WF.maps = {};
        App.render();
      };
      root.querySelector('#wfnew').onclick = () =>
        open({
          id: U.uid('wf'),
          name: '',
          team: '',
          start: 's1',
          statuses: [
            { id: 's1', name: 'To Do', color: '#64748b', group: 'Not Started', alert: 0 },
            { id: 's2', name: 'In Progress', color: '#0ea5e9', group: 'In Progress', alert: 0 },
            { id: 's3', name: 'Done', color: '#16a34a', group: 'Done', alert: 0 },
          ],
          moves: [
            { from: 's1', to: 's2', who: ['owner', 'manager'], approver: '', conds: [] },
            { from: 's2', to: 's3', who: ['owner', 'manager'], approver: '', conds: [] },
          ],
          _new: true,
        });
      root.querySelector('#wfex').onclick = () => open(Object.assign(Flow.example(), { _new: true }));
      root.querySelectorAll('[data-wfedit]').forEach(b => (b.onclick = () => open(Flow.get(b.dataset.wfedit))));
      root
        .querySelectorAll('[data-wfcopy]')
        .forEach(
          b =>
            (b.onclick = () =>
              open(
                Object.assign(JSON.parse(JSON.stringify(Flow.get(b.dataset.wfcopy))), {
                  id: U.uid('wf'),
                  name: Flow.get(b.dataset.wfcopy).name + ' (copy)',
                  _new: true,
                })
              ))
        );
      root.querySelectorAll('[data-wfdel]').forEach(
        b =>
          (b.onclick = () =>
            UI.confirm(`Delete the workflow “${Flow.get(b.dataset.wfdel).name}”?`, () => {
              flowSaveList(Flow.list().filter(w => w.id !== b.dataset.wfdel));
              UI.toast('Deleted', 'good');
              App.render();
            }))
      );
    },
  };
}

function flowSaveList(list) {
  const cur = Store.get('settings-workflows') || { id: 'settings-workflows', c: 'settings' };
  Store.save(Object.assign({}, cur, { list }));
}

function flowEditor() {
  const w = WF.draft;
  const S = w.statuses;
  const has = (f, t) => (w.moves || []).some(m => m.from === f && m.to === t);
  const sOpt = (sel, list) => list.map(([v, l]) => `<option value="${h(v)}" ${v === sel ? 'selected' : ''}>${h(l)}</option>`).join('');
  const html = `<div class="page-actions"><button class="btn ghost" id="wfback">← Workflows</button><span class="grow"></span><button class="btn" id="wfcancel">Cancel</button><button class="btn primary" id="wfsave">Save workflow</button></div>
  ${card('Workflow', `<form class="grid-form" id="wfh">${UI.field({ key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Enhancement (SRS)' }, w.name)}${UI.field({ key: 'team', label: 'For', type: 'select', options: [['', 'Every team'], ...Store.teams().map(t => [t.id, t.name])], blank: false }, w.team || '')}</form>`)}
  ${card(
    '1 · Stages',
    `<p class="muted small">In order. The <b>group</b> tells the rest of the app what the stage means (progress, Director Desk, Performance). <b>Alert after</b> = warn the project owner when a project stays longer than this many days (0 = never).</p>
    <div class="tbl-scroll"><table class="tbl wf-st"><thead><tr><th>Start</th><th>Stage name</th><th>Colour</th><th>Group</th><th class="num">Alert after (days)</th><th></th></tr></thead><tbody>${S.map(
      (s, i) =>
        `<tr data-si="${i}"><td class="ctr"><input type="radio" name="wfstart" value="${h(s.id)}" ${s.id === w.start ? 'checked' : ''}></td><td><input data-sn value="${h(s.name)}"></td><td><input type="color" data-sc value="${h(s.color || '#64748b')}"></td><td><select data-sg>${sOpt(
          s.group,
          Flow.GROUPS.map(g => [g, g])
        )}</select></td><td class="num"><input type="number" min="0" step="1" data-sa value="${+s.alert || 0}" style="width:80px"></td><td class="nw"><button class="btn xs ghost" data-sup="${i}" ${i ? '' : 'disabled'}>↑</button><button class="btn xs ghost" data-sdn="${i}" ${i < S.length - 1 ? '' : 'disabled'}>↓</button><button class="btn xs ghost danger" data-sdel="${i}">✕</button>${WF.maps[s.id] ? '' : ''}</td></tr>`
    ).join('')}</tbody></table></div>
    <button class="btn sm" id="wfadd">＋ Add stage</button>${
      Object.keys(WF.maps).length
        ? `<p class="note">Removed stages with projects in them: ${Object.entries(WF.maps)
            .map(([from, m]) => `${h(m.name)} → ${h((S.find(s => s.id === m.to) || {}).name || '?')} (${m.n} project(s))`)
            .join(' · ')}</p>`
        : ''
    }`
  )}
  ${card(
    '2 · Allowed moves',
    `<p class="muted small">Tick each move a project may make — row = from, column = to. Anything not ticked cannot happen (only you can move a project anywhere, in Admin mode).</p>
    <div class="row-btns tight"><button class="btn xs" data-wfq="step">Step by step (next + back one)</button><button class="btn xs" data-wfq="all">Allow every move</button><button class="btn xs ghost" data-wfq="none">Clear</button></div>
    <div class="tbl-scroll"><table class="tbl wf-grid"><thead><tr><th>From ↓ / To →</th>${S.map(s => `<th class="ctr">${h(s.name)}</th>`).join('')}</tr></thead><tbody>${S.map(f => `<tr><th>${h(f.name)}</th>${S.map(t => `<td class="ctr">${f.id === t.id ? '—' : `<input type="checkbox" data-mv="${h(f.id)}>${h(t.id)}" ${has(f.id, t.id) ? 'checked' : ''} aria-label="${h(f.name)} to ${h(t.name)}">`}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  )}
  ${card(
    '3 · Rules for each move',
    (w.moves || []).length
      ? `<p class="muted small">Who may make the move, whether it needs one approval by title (the app finds the person from the project — e.g. that team's manager; the project waits until they approve), and what must be true first.</p>
    <div class="tbl-scroll"><table class="tbl wf-rules"><thead><tr><th>Move</th><th>Who may move</th><th>Approval by</th><th>Before moving</th></tr></thead><tbody>${w.moves
      .map(
        (m, i) => `<tr data-mi="${i}"><td class="nw"><b>${h(Flow.name(w, m.from))}</b> → <b>${h(Flow.name(w, m.to))}</b></td>
      <td>${Flow.ROLES.map(([k, l]) => `<label class="check sm"><input type="checkbox" data-mw="${k}" ${(m.who || []).includes(k) ? 'checked' : ''}> ${h(l)}</label>`).join('')}</td>
      <td><select data-ma>${sOpt(m.approver || '', [['', 'No approval'], ...Flow.APPROVERS])}</select></td>
      <td>${Flow.CONDS.map(([k, l]) => `<label class="check sm"><input type="checkbox" data-mc="${k}" ${(m.conds || []).includes(k) ? 'checked' : ''}> ${h(l)}</label>`).join('')}</td></tr>`
      )
      .join('')}</tbody></table></div>`
      : empty('Tick some moves above first.')
  )}`;
  return {
    html,
    mount(root) {
      const sync = () => {
        const f = root.querySelector('#wfh');
        w.name = f.querySelector('[name=name]').value.trim();
        w.team = f.querySelector('[name=team]').value;
        root.querySelectorAll('.wf-st tr[data-si]').forEach(tr => {
          const s = S[+tr.dataset.si];
          s.name = tr.querySelector('[data-sn]').value.trim();
          s.color = tr.querySelector('[data-sc]').value;
          s.group = tr.querySelector('[data-sg]').value;
          s.alert = Math.max(0, +tr.querySelector('[data-sa]').value || 0);
        });
        const st = root.querySelector('[name=wfstart]:checked');
        if (st) w.start = st.value;
        root.querySelectorAll('.wf-rules tr[data-mi]').forEach(tr => {
          const m = w.moves[+tr.dataset.mi];
          m.who = [...tr.querySelectorAll('[data-mw]:checked')].map(c => c.dataset.mw);
          m.approver = tr.querySelector('[data-ma]').value;
          m.conds = [...tr.querySelectorAll('[data-mc]:checked')].map(c => c.dataset.mc);
        });
      };
      root.querySelector('#wfback').onclick = root.querySelector('#wfcancel').onclick = () => {
        WF.draft = null;
        WF.maps = {};
        App.render();
      };
      root.querySelector('#wfadd').onclick = () => {
        sync();
        S.push({ id: U.uid('st').slice(-8), name: 'New stage', color: '#64748b', group: 'In Progress', alert: 0 });
        App.render();
      };
      root.querySelectorAll('[data-sup]').forEach(
        b =>
          (b.onclick = () => {
            sync();
            const i = +b.dataset.sup;
            [S[i - 1], S[i]] = [S[i], S[i - 1]];
            App.render();
          })
      );
      root.querySelectorAll('[data-sdn]').forEach(
        b =>
          (b.onclick = () => {
            sync();
            const i = +b.dataset.sdn;
            [S[i + 1], S[i]] = [S[i], S[i + 1]];
            App.render();
          })
      );
      root.querySelectorAll('[data-sdel]').forEach(
        b =>
          (b.onclick = () => {
            sync();
            const i = +b.dataset.sdel;
            const s = S[i];
            if (S.length <= 2) return UI.toast('A workflow needs at least 2 stages', 'bad');
            const used = w._new ? [] : Flow.inUse(w.id, s.id);
            const rest = S.filter(x => x.id !== s.id);
            const drop = to => {
              S.splice(i, 1);
              w.moves = (w.moves || []).filter(m => m.from !== s.id && m.to !== s.id);
              if (w.start === s.id) w.start = rest[0].id;
              if (to) WF.maps[s.id] = { to, name: s.name, n: used.length };
              App.render();
            };
            if (!used.length) return drop('');
            UI.modal({
              title: `Remove “${s.name}”`,
              body: `<p>${used.length} project(s) are in this stage. Where should they go when you save?</p><form class="grid-form" id="mapf">${UI.field({ key: 'to', label: 'Move them to', type: 'select', options: rest.map(x => [x.id, x.name]), blank: false }, rest[0].id)}</form>`,
              actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn danger" data-ok>Remove stage</button>`,
              onMount: wd => {
                wd.querySelector('[data-c]').onclick = UI.closeModal;
                wd.querySelector('[data-ok]').onclick = () => {
                  const to = wd.querySelector('[name=to]').value;
                  UI.closeModal();
                  drop(to);
                };
              },
            });
          })
      );
      root.querySelectorAll('[data-mv]').forEach(
        c =>
          (c.onchange = () => {
            sync();
            const [f, t] = c.dataset.mv.split('>');
            if (c.checked) {
              if (!has(f, t)) w.moves.push({ from: f, to: t, who: ['owner', 'manager'], approver: '', conds: [] });
            } else w.moves = w.moves.filter(m => !(m.from === f && m.to === t));
            App.render();
          })
      );
      root.querySelectorAll('[data-wfq]').forEach(
        b =>
          (b.onclick = () => {
            sync();
            const q = b.dataset.wfq;
            const keep = (f, t) =>
              (w.moves || []).find(m => m.from === f && m.to === t) || {
                from: f,
                to: t,
                who: ['owner', 'manager'],
                approver: '',
                conds: [],
              };
            if (q === 'none') w.moves = [];
            if (q === 'all') w.moves = S.flatMap(f => S.filter(t => t.id !== f.id).map(t => keep(f.id, t.id)));
            if (q === 'step')
              w.moves = S.flatMap((f, i) => [S[i + 1] && keep(f.id, S[i + 1].id), S[i - 1] && keep(f.id, S[i - 1].id)].filter(Boolean));
            App.render();
          })
      );
      root.querySelector('#wfsave').onclick = () => {
        sync();
        const names = S.map(s => U.lc(s.name));
        if (!w.name) return UI.toast('Give the workflow a name', 'bad');
        if (names.some(n => !n)) return UI.toast('Every stage needs a name', 'bad');
        if (new Set(names).size !== names.length) return UI.toast('Two stages have the same name', 'bad');
        if (!S.some(s => s.group === 'Done')) return UI.toast('Add a stage in the Done group (where projects finish)', 'bad');
        if (!S.some(s => s.id === w.start)) w.start = S[0].id;
        if (!(w.moves || []).some(m => m.from === w.start)) return UI.toast('Tick at least one move out of the start stage', 'bad');
        const bad = (w.moves || []).find(m => m.approver && m.approver !== '' && !Flow.APPROVERS.some(r => r[0] === m.approver));
        if (bad) return UI.toast('An approver is not valid', 'bad');
        const out = Object.assign({}, w);
        delete out._new;
        const list = Flow.list();
        const i = list.findIndex(x => x.id === w.id);
        const next = i >= 0 ? list.map(x => (x.id === w.id ? out : x)) : [...list, out];
        const recs = [Object.assign({}, Store.get('settings-workflows') || { id: 'settings-workflows', c: 'settings' }, { list: next })];
        for (const [from, m] of Object.entries(WF.maps))
          for (const p of Flow.inUse(w.id, from))
            recs.push(
              Object.assign({}, p, {
                stage: m.to,
                stageSince: Date.now(),
                status: (S.find(s => s.id === m.to) || {}).group || p.status,
                pending: null,
                history: [
                  ...(p.history || []),
                  { from, to: m.to, by: App.me, at: Date.now(), note: `stage “${m.name}” removed from the workflow`, override: true },
                ],
              })
            );
        for (const p of Flow.inUse(w.id)) {
          const st = S.find(s => s.id === p.stage);
          if (st && st.group !== p.status && !WF.maps[p.stage]) recs.push(Object.assign({}, p, { status: st.group }));
        } // a stage's group changed
        Store.saveMany(recs);
        WF.draft = null;
        WF.maps = {};
        UI.toast('Workflow saved', 'good');
        App.render();
      };
    },
  };
}
