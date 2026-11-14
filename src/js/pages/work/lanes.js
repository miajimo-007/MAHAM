/* MAHAM — Lanes on screen (domain/lanes.js).
 *   Board: one column per lane (its colour), each card with a status box to change its status INSIDE its lane (the card
 *   stays in its lane), ＋ Add at the top of every lane, an optional limit of open tasks per lane (from the template),
 *   "Hide done"; a lane whose tasks are all done shows as Closed.
 *   The lanes come from an ADMIN TEMPLATE the project follows (Admin → Work & workflows → Project tasks → Lanes): lanes,
 *   colours, limits and each lane's statuses. Editing a template changes every project that uses it (tasks that lose their
 *   place are moved after asking, once). Project owners pick a template when creating a Lanes project; only an admin
 *   switches an existing project to another template. Task form: a Lane box; the Status list shows that lane's statuses. */
'use strict';

const LanesUI = {
  /* a task's status as a coloured chip ("Validation: Passed" on a Lanes project with several lanes) */
  chip(t) {
    if (!t || !t.status) return '';
    const p = Scrum.proj(t.project);
    const l = typeof Lanes !== 'undefined' && Lanes.is(p) ? Lanes.laneOf(t, p) : null;
    const txt = l && Lanes.of(p).length > 1 ? `${l.name}: ${t.status}` : t.status;
    return `<span class="tf-st sm" style="--c:${h(TaskFlow.color(t))}" title="${l ? h(l.name) + ' › ' : ''}${h(t.status)}">${h(txt)}</span>`;
  },

  /* ---------- the board ---------- */
  board(p, ctx) {
    const s = ps('prj');
    const mineOnly = s.mine;
    const hide = !!s.hideDone;
    const lanes = Lanes.of(p);
    const tpl = Lanes.tplOf(p);
    const rank = t => ({ High: 0, Normal: 1, Low: 2 })[t.priority || 'Normal'];
    const col = l => {
      let it = Lanes.tasksIn(p, l);
      if (mineOnly) it = it.filter(t => t.assignee === App.me);
      const done = it.filter(t => Scrum.isDone(t));
      const shown = (hide ? it.filter(t => !Scrum.isDone(t)) : it).sort(
        (a, b) =>
          Scrum.isDone(a) - Scrum.isDone(b) || rank(a) - rank(b) || (a.due || '9').localeCompare(b.due || '9') || (a.n || 0) - (b.n || 0)
      );
      const open = Lanes.openIn(p, l);
      const full = l.limit && open > l.limit;
      const closed = Lanes.closed(p, l);
      return `<div class="kcol lane ${full ? 'lane-full' : ''} ${closed ? 'lane-closed' : ''}" data-lane="${h(l.id)}" style="--lc:${h(l.color)}">
        <div class="kcol-h lane-h"><span class="lane-dot"></span><b>${h(l.name)}</b><span class="count" title="Open tasks${l.limit ? ' · limit ' + l.limit : ''}">${open}${l.limit ? ' / ' + l.limit : ''}</span>${closed ? '<span class="lane-closed-b" title="Every task in this lane is done">✓ Closed</span>' : full ? '<span class="lane-warn" title="More open tasks than the lane’s limit">over the limit</span>' : ''}</div>
        <div class="lane-sts">${l.statuses.map(st => `<span class="tf-st sm" style="--c:${h(st.color)}">${h(st.name)} ${it.filter(t => t.status === st.name).length}</span>`).join('')}</div>
        ${ctx.canAdd ? `<input class="lane-add" data-laneadd="${h(l.id)}" placeholder="＋ Add a task — type and press Enter" aria-label="Add a task to ${h(l.name)}">` : ''}
        ${shown.map(t => ptCard(t, p)).join('') || (hide && done.length ? '' : '<div class="kempty">—</div>')}
        ${hide && done.length ? `<button type="button" class="btn xs ghost lane-unfold" data-showdone>${done.length} done — show</button>` : ''}</div>`;
    };
    return `<div class="page-actions"><label class="flt tog"><input type="checkbox" id="mineonly" ${mineOnly ? 'checked' : ''}> Only my tasks</label><label class="flt tog"><input type="checkbox" id="hidedone" ${hide ? 'checked' : ''}> Hide done</label><span class="grow"></span><span class="muted small">Change a task’s status on its card — it stays in its lane.${tpl ? ` Lanes: <b>${h(tpl.name)}</b>` : ' Its own lanes.'}</span>${typeof BoardEdit !== 'undefined' ? BoardEdit.button(p) : ''}${ctx.canAdd ? '<button class="btn primary" id="additem">＋ Add task</button>' : ''}</div>
      <div class="kanban lanes" style="--cols: ${lanes.length}">${lanes.map(col).join('')}</div>`;
  },
  bind(root, p) {
    const hd = root.querySelector('#hidedone');
    if (hd)
      hd.onchange = () => {
        ps('prj').hideDone = hd.checked;
        App.render();
      };
    root.querySelectorAll('[data-showdone]').forEach(
      b =>
        (b.onclick = () => {
          ps('prj').hideDone = false;
          App.render();
        })
    );
    root.querySelectorAll('[data-lst]').forEach(sel => {
      sel.onclick = e => e.stopPropagation();
      sel.onchange = () => {
        const t = Store.get(sel.dataset.lst);
        if (t && sel.value && sel.value !== t.status) TaskFlowUI.go(t.id, sel.value);
      };
    });
    root.querySelectorAll('[data-laneadd]').forEach(inp =>
      inp.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const title = inp.value.trim();
        if (!title) return;
        const pr = Store.get(p.id);
        const lane = Lanes.of(pr).find(l => l.id === inp.dataset.laneadd) || Lanes.of(pr)[0];
        const r = {
          c: 'ptask',
          project: pr.id,
          team: pr.team,
          title,
          type: 'Task',
          priority: 'Normal',
          points: 1,
          lane: lane.id,
          status: lane.statuses[0].name,
          assignee: Scrum.planner(pr) ? '' : App.me,
        };
        Schemas.ptask.beforeSave(r, null);
        r.lane = lane.id;
        r.status = lane.statuses[0].name;
        r.hist = [{ at: Date.now(), by: App.me, from: '', to: r.status, tr: 'Created' }];
        Store.save(r);
        UI.toast(`${ptKey(r)} added to ${lane.name}`, 'good');
        App.render(true);
        setTimeout(() => {
          const n = UI.$(`[data-laneadd="${CSS.escape(lane.id)}"]`);
          if (n) n.focus();
        }, 30);
      })
    );
  },

  /* ---------- the editor: lanes, each with its statuses (used by ⚙ Lanes and Admin's default lanes) ---------- */
  laneHtml(l, i, n) {
    return `<div class="lane-blk" draggable="true" data-lrow="${i}" style="--lc:${h(l.color)}">
      <div class="lane-row"><span class="lane-grip" title="Drag to reorder the lanes">⠿</span>
        <input class="lr-name" value="${h(l.name)}" placeholder="Lane name, e.g. Validation" aria-label="Lane name" maxlength="40">
        <input class="lr-color" type="color" value="${h(l.color)}" aria-label="Lane colour" title="Lane colour">
        <input class="lr-limit" type="number" min="0" step="1" value="${l.limit || ''}" placeholder="no limit" aria-label="Limit" title="Most open tasks in this lane (a warning only)">
        <span class="row-btns tight"><button type="button" class="btn xs ghost" data-lup="${i}" title="Move the lane up" ${i ? '' : 'disabled'}>↑</button><button type="button" class="btn xs ghost" data-ldown="${i}" title="Move the lane down" ${i < n - 1 ? '' : 'disabled'}>↓</button><button type="button" class="btn xs ghost danger" data-ldel="${i}" title="Delete this lane">✕</button></span></div>
      <div class="lane-stl"><div class="small muted lane-stl-h">Statuses in this lane — the task's status changes inside the lane</div>
        ${l.statuses
          .map(
            (s, j) => `<div class="st-row" data-srow="${i}|${j}" style="--sc:${h(s.color)}"><span class="st-dot"></span>
          <input class="sr-name" value="${h(s.name)}" placeholder="Status, e.g. Passed" aria-label="Status name" maxlength="40">
          <input class="sr-color" type="color" value="${h(s.color)}" aria-label="Status colour" title="Status colour">
          <select class="sr-cat" aria-label="Counts as" title="Counts as">${Lanes.CATS.map(([k, nm]) => `<option value="${k}" ${s.cat === k ? 'selected' : ''}>${nm}</option>`).join('')}</select>
          <span class="row-btns tight"><button type="button" class="btn xs ghost" data-sup="${i}|${j}" title="Move up" ${j ? '' : 'disabled'}>↑</button><button type="button" class="btn xs ghost" data-sdown="${i}|${j}" title="Move down" ${j < l.statuses.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="btn xs ghost danger" data-sdel="${i}|${j}" title="Delete this status">✕</button></span></div>`
          )
          .join('')}
        <button type="button" class="btn xs ghost" data-sadd="${i}">＋ Add a status</button></div></div>`;
  },
  /* mounts an editor in `host` on `list` (kept up to date as people type); returns () => the current list */
  editor(host, list) {
    const read = () =>
      host.querySelectorAll('[data-lrow]').forEach(b => {
        const l = list[+b.dataset.lrow];
        if (!l) return;
        const r = b.querySelector('.lane-row');
        l.name = r.querySelector('.lr-name').value;
        l.color = r.querySelector('.lr-color').value;
        l.limit = +r.querySelector('.lr-limit').value || 0;
        b.querySelectorAll('[data-srow]').forEach(sr => {
          const s = l.statuses[+sr.dataset.srow.split('|')[1]];
          if (!s) return;
          s.name = sr.querySelector('.sr-name').value;
          s.color = sr.querySelector('.sr-color').value;
          s.cat = sr.querySelector('.sr-cat').value;
        });
      });
    const ij = v => v.split('|').map(Number);
    const draw = () => {
      host.innerHTML = `${list.map((l, i) => LanesUI.laneHtml(l, i, list.length)).join('')}<div class="row-btns"><button type="button" class="btn xs" data-ladd>＋ Add a lane</button><span class="muted small">Drag ⠿ to reorder the lanes. “Counts as” decides progress, late work and scoring (Done = finished, Waiting = waiting).</span></div>`;
      const on = (sel, fn) =>
        host.querySelectorAll(sel).forEach(
          b =>
            (b.onclick = () => {
              read();
              fn(b);
              draw();
            })
        );
      on('[data-lup]', b => {
        const i = +b.dataset.lup;
        [list[i - 1], list[i]] = [list[i], list[i - 1]];
      });
      on('[data-ldown]', b => {
        const i = +b.dataset.ldown;
        [list[i + 1], list[i]] = [list[i], list[i + 1]];
      });
      on('[data-ldel]', b => {
        if (list.length < 2) return UI.toast('Keep at least one lane', 'bad');
        list.splice(+b.dataset.ldel, 1);
      });
      on('[data-ladd]', () => {
        list.push({
          id: Lanes.uid('ln'),
          name: '',
          color: Lanes.COLORS[list.length % Lanes.COLORS.length],
          limit: 0,
          statuses: Lanes.STD_STATUSES().map(s => Object.assign({}, s, { id: Lanes.uid('s') })),
        });
      });
      on('[data-sup]', b => {
        const [i, j] = ij(b.dataset.sup);
        const a = list[i].statuses;
        [a[j - 1], a[j]] = [a[j], a[j - 1]];
      });
      on('[data-sdown]', b => {
        const [i, j] = ij(b.dataset.sdown);
        const a = list[i].statuses;
        [a[j + 1], a[j]] = [a[j], a[j + 1]];
      });
      on('[data-sdel]', b => {
        const [i, j] = ij(b.dataset.sdel);
        if (list[i].statuses.length < 2) return UI.toast('A lane needs at least one status', 'bad');
        list[i].statuses.splice(j, 1);
      });
      on('[data-sadd]', b => {
        const i = +b.dataset.sadd;
        const a = list[i].statuses;
        const at = a.length && a[a.length - 1].cat === 'done' ? a.findIndex(s => s.cat === 'done') : a.length;
        a.splice(at < 0 ? a.length : at, 0, { id: Lanes.uid('s'), name: '', color: Lanes.CAT_COLOR.doing, cat: 'doing' });
      });
      host.querySelectorAll('.lr-color').forEach(
        c =>
          (c.oninput = () => {
            c.closest('.lane-blk').style.setProperty('--lc', c.value);
          })
      );
      host.querySelectorAll('.sr-color').forEach(
        c =>
          (c.oninput = () => {
            c.closest('.st-row').style.setProperty('--sc', c.value);
          })
      );
      host.querySelectorAll('.sr-cat').forEach(
        c =>
          (c.onchange = () => {
            const r = c.closest('.st-row');
            const col = r.querySelector('.sr-color');
            if (Object.values(Lanes.CAT_COLOR).includes(col.value)) {
              col.value = Lanes.CAT_COLOR[c.value];
              r.style.setProperty('--sc', col.value);
            }
          })
      );
      // drag a lane to reorder
      let from = null;
      host.querySelectorAll('[data-lrow]').forEach(r => {
        r.addEventListener('dragstart', e => {
          if (e.target !== r) return;
          from = +r.dataset.lrow;
          e.dataTransfer.setData('text/plain', 'lane');
          r.classList.add('dragging');
        });
        r.addEventListener('dragover', e => {
          e.preventDefault();
          r.classList.add('over');
        });
        r.addEventListener('dragleave', () => r.classList.remove('over'));
        r.addEventListener('drop', e => {
          e.preventDefault();
          r.classList.remove('over');
          const to = +r.dataset.lrow;
          if (from == null || from === to) return;
          read();
          const [x] = list.splice(from, 1);
          list.splice(to, 0, x);
          from = null;
          draw();
        });
      });
      host.querySelectorAll('input, select').forEach(x => x.addEventListener('mousedown', e => e.stopPropagation()));
    };
    draw();
    return () => {
      read();
      return list;
    };
  },
  /* every lane and status named? → '' or what is missing */
  missing(list) {
    if (list.some(l => !String(l.name || '').trim())) return 'Every lane needs a name';
    if (list.some(l => l.statuses.some(s => !String(s.name || '').trim()))) return 'Every status needs a name';
    if (new Set(list.map(l => U.lc(l.name.trim()))).size !== list.length) return 'Two lanes have the same name';
    if (list.some(l => new Set(l.statuses.map(s => U.lc(s.name.trim()))).size !== l.statuses.length))
      return 'A lane has two statuses with the same name';
    return '';
  },
  /* where do tasks go that lose their place with new lanes? (one or several projects) → done(moves) */
  askMoves(lost, next, done) {
    if (!lost.length) return done(null);
    const targets = next.flatMap(l => l.statuses.map(s => ({ lane: l.id, status: s.name, name: Lanes.label(l, s.name), cat: s.cat })));
    const w2 = { id: 'lanes-new', name: 'the new lanes', statuses: targets.map(x => ({ name: x.name, cat: x.cat })) };
    const seen = new Set();
    const plan = [];
    for (const x of lost) {
      if (seen.has(x.from)) continue;
      seen.add(x.from);
      const parts = x.from.split(' › ');
      const lane = next.find(n => n.name === parts[0]);
      const same = lane && lane.statuses.find(s => s.name === parts[1]);
      plan.push({
        t: { status: x.from, id: x.t.id },
        w: w2,
        to: same ? Lanes.label(lane, same.name) : (targets.find(tg => tg.cat === x.cat) || targets[0]).name,
      });
    }
    TaskFlowAdmin.mapDialog(plan, map => {
      const moves = {};
      for (const x of plan) {
        const nm = (map && map[x.t.status + '|' + w2.id]) || x.to;
        const tg = targets.find(y => y.name === nm) || targets[0];
        moves[x.t.status] = { lane: tg.lane, status: tg.status };
      }
      done(moves);
    });
  },
  /* Admin: make or change a lane template. Saving changes every project that uses it (linked). */
  templateDialog(team, tpl) {
    const isNew = !tpl;
    const canShared = TaskFlowAdmin.can('', 'task-workflows');
    const list = Lanes.copy(tpl ? tpl.lanes : Lanes.STANDARD().map(l => Object.assign({}, l, { id: Lanes.uid('ln') })));
    const used = tpl ? Lanes.usedBy(tpl.id) : [];
    UI.modal({
      title: isNew ? 'New lane template' : `Lane template — ${tpl.name}`,
      wide: true,
      body: `<div class="grid-form"><label class="fld span2"><span>Template name</span><input id="lnname" value="${h(tpl ? tpl.name : '')}" maxlength="60" placeholder="e.g. Dashboard project"></label>
        ${isNew && canShared ? '<label class="fld span2 check"><input type="checkbox" id="lnshared"> Shared with every team</label>' : ''}</div>
        ${used.length ? `<div class="insights warnbox"><div>Used by ${used.length} project(s): ${used.map(p => h(p.name)).join(', ')}. Saving changes them all; tasks whose lane or status is removed are moved after asking.</div></div>` : ''}
        <div id="lneditor"></div>`,
      actions:
        '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-lnsave>Save template</button>',
      onMount: w => {
        w.querySelector('.modal').classList.add('lane-modal');
        const get = LanesUI.editor(w.querySelector('#lneditor'), list);
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-lnsave]').onclick = () => {
          const name = w.querySelector('#lnname').value.trim();
          if (!name) return UI.toast('Give the template a name', 'bad');
          const m = LanesUI.missing(get());
          if (m) return UI.toast(m, 'bad');
          const next = Lanes.clean(get());
          const scope = isNew ? ((w.querySelector('#lnshared') || {}).checked ? '' : team) : tpl.shared ? '' : tpl.scope;
          const rec = TaskFlowAdmin.rec(scope);
          const sets = (rec.laneSets || []).filter(x => !tpl || x.id !== tpl.id);
          const item = { id: tpl ? tpl.id : Lanes.uid('lt'), name, lanes: next };
          const lost = used.flatMap(p =>
            Lanes.homeless(p, next).map(x => Object.assign(x, { cat: (Lanes.statusOf(x.t, p) || {}).cat || 'todo' }))
          );
          LanesUI.askMoves(lost, next, moves => {
            const recs = [Object.assign({ id: TaskFlowAdmin.recId(scope), c: 'settings' }, rec, { laneSets: [...sets, item] })];
            for (const p of used) recs.push(...Lanes.taskMoves(p, next, moves));
            Store.saveMany(recs);
            UI.closeModal();
            UI.toast(`Template “${name}” saved${used.length ? ` — ${used.length} project(s) follow it` : ''}`, 'good');
            App.render();
          });
        };
      },
    });
  },
  /* Admin: turn what was made before templates (the team default, owner-saved templates, projects with their own lanes)
     into admin templates; the projects then follow theirs (same lanes, nothing moves) */
  convertLegacy(team) {
    const L = Lanes.legacy(team);
    const rec = TaskFlowAdmin.rec(team);
    const sets = (rec.laneSets || []).slice();
    const recs = [];
    const patch = {};
    if (L.teamDefault) {
      sets.push({ id: Lanes.uid('lt'), name: 'Team default lanes', lanes: L.teamDefault });
      patch.lanes = [];
    }
    for (const t of L.saved) {
      if (sets.some(x => x.from === t.id)) continue;
      sets.push({ id: Lanes.uid('lt'), name: t.name, lanes: Lanes.clean(t.lanes), from: t.id });
      if (App.isSuper() || t.by === App.me) recs.push(Object.assign({}, t, { _del: true }));
    }
    for (const p of L.projects) {
      const id = Lanes.uid('lt');
      sets.push({ id, name: p.name + ' — lanes', lanes: Lanes.of(p), from: p.id });
      recs.push(Object.assign({}, p, { laneSet: id }));
    }
    Store.saveMany([Object.assign({ id: TaskFlowAdmin.recId(team), c: 'settings' }, rec, patch, { laneSets: sets }), ...recs]);
    UI.toast('Turned into templates — the projects follow them', 'good');
    App.render();
  },

  /* ---------- Admin → Work & workflows → Project tasks: "Lanes" (team default + templates) ---------- */
  adminCard(sc) {
    const can = TaskFlowAdmin.can(sc, 'task-workflows');
    const sets = Lanes.sets(sc);
    const L = Lanes.legacy(sc);
    const savedLeft = L.saved.filter(t => !sets.some(x => x.from === t.id));
    const nLegacy = (L.teamDefault ? 1 : 0) + savedLeft.length + L.projects.length;
    const chips = l =>
      Lanes.clean(l)
        .map(
          x =>
            `<div class="small"><b style="color:${h(x.color)}">${h(x.name)}</b>${x.limit ? ` <span class="muted">(limit ${x.limit})</span>` : ''}: ${x.statuses.map(s => `<span class="tf-st sm" style="--c:${h(s.color)}">${h(s.name)}</span>`).join(' ')}</div>`
        )
        .join('');
    const uses = t =>
      t.builtin
        ? Store.all('project', '*').filter(p => Lanes.is(p) && Scrum.teamOf(p) === sc && p.laneSet === 'std').length
        : Lanes.usedBy(t.id).length;
    return card(
      `Lane templates — ${h(Store.teamName(sc))} <span class="count">${sets.length - 1}</span>`,
      `<p class="muted small">A project run as <b>Lanes</b> picks one of these templates and <b>follows it</b>: lanes (boards of their own, e.g. Build, Validation), each with its own statuses, colours and an optional limit of open tasks. Changing a template changes every project that uses it. A lane whose tasks are all done shows as Closed.</p>
      ${nLegacy && can ? `<div class="insights warnbox"><div>From before templates: ${[L.teamDefault ? 'the team’s default lanes' : '', savedLeft.length ? `${savedLeft.length} saved template(s)` : '', L.projects.length ? `${L.projects.length} project(s) with their own lanes` : ''].filter(Boolean).join(', ')}. <button class="btn sm primary" id="lnconv">Turn them into templates</button> <span class="muted small">(the projects then follow theirs — nothing moves)</span></div></div>` : ''}
      <div class="li-list">${sets
        .map(t => {
          const n = uses(t);
          const mayEdit = can && !t.builtin && (!t.shared || TaskFlowAdmin.can('', 'task-workflows'));
          return `<div class="li"><div class="grow"><b>${h(t.name)}</b> <span class="muted small">· ${t.builtin ? 'built in' : t.shared ? 'shared with every team' : h(Store.teamName(sc))} · used by ${n} project(s)</span>${chips(t.lanes)}</div>${mayEdit ? `<button class="btn xs" data-lnedit="${h(t.id)}">Edit</button>${n ? '' : ` <button class="btn xs ghost danger" data-lndel="${h(t.id)}">Delete</button>`}` : ''}</div>`;
        })
        .join('')}</div>
      ${can ? '<div class="row-btns"><button class="btn primary" id="lnnew">＋ New lane template</button></div>' : ''}`
    );
  },
  adminBind(root, sc) {
    const nw = root.querySelector('#lnnew');
    if (nw) nw.onclick = () => LanesUI.templateDialog(sc, null);
    const cv = root.querySelector('#lnconv');
    if (cv)
      cv.onclick = () =>
        UI.confirm(
          'Turn the lanes made before into admin templates? The projects keep the same lanes and follow their template from now on.',
          () => LanesUI.convertLegacy(sc)
        );
    root.querySelectorAll('[data-lnedit]').forEach(
      b =>
        (b.onclick = () => {
          const t = Lanes.sets(sc).find(x => x.id === b.dataset.lnedit);
          if (t) LanesUI.templateDialog(sc, t);
        })
    );
    root.querySelectorAll('[data-lndel]').forEach(
      b =>
        (b.onclick = () => {
          const t = Lanes.sets(sc).find(x => x.id === b.dataset.lndel);
          if (!t) return;
          UI.confirm(`Delete the lane template “${t.name}”?`, () => {
            const scope = t.shared ? '' : sc;
            const rec = TaskFlowAdmin.rec(scope);
            TaskFlowAdmin.save(scope, { laneSets: (rec.laneSets || []).filter(x => x.id !== t.id) });
            App.render();
          });
        })
    );
  },
};

/* ---------- wiring ---------- */
(function wire() {
  // cards on a Lanes board: the lane colour on the left edge, a status box (only the lane's statuses), no dragging between lanes
  PT_CARD.decorate.push((html, t, p) => {
    if (!Lanes.is(p)) return html;
    const l = Lanes.laneOf(t, p);
    const st = Lanes.statusOf(t, p);
    html = html
      .replace(/ draggable="true" data-drag="[^"]*"/, '')
      .replace(/<button class="btn xs[^"]*" data-(mv|tfrun)="[^"]*"[^>]*>.*?<\/button>/g, '')
      .replace(/<div class="pc-stat">.*?<\/div>/, '');
    const can = Scrum.canWork(t) || (Scrum.member(p) && !t.assignee);
    const box = can
      ? `<select class="lane-st" data-lst="${h(t.id)}" style="--sc:${h(st ? st.color : '#64748b')}" aria-label="Status" title="Change the status (the task stays in ${h(l.name)})">${l.statuses.map(s => `<option value="${h(s.name)}" ${s.name === t.status ? 'selected' : ''}>${h(s.name)}</option>`).join('')}</select>`
      : LanesUI.chip(t);
    html = html.replace('<div class="pc-title">', `<div class="pc-stat">${box}</div><div class="pc-title">`);
    return html.replace(
      '<div class="pcard ',
      `<div style="--lc:${h(l.color)}" class="lane-card ${Scrum.isDone(t) ? 'lane-done ' : ''}pcard `
    );
  });

  // the project form: "Lanes" as a third way, "Start from" for a new one, and switching asks where tasks go
  const S = Schemas.project;
  if (S) {
    const mode = S.fields.find(f => f.key === 'mode');
    if (mode)
      mode.options = [...mode.options.filter(o => o[0] !== 'lanes'), ['lanes', 'Lanes — your own boards and statuses, colour coded']];
    const at = S.fields.findIndex(f => f.key === 'mode');
    S.fields.splice(at + 1, 0, {
      dir: true,
      key: 'laneSet',
      label: 'Lane template',
      type: 'select',
      blank: false,
      hint: 'Made by the admin (Admin → Work & workflows → Project tasks → Lanes); the project follows it',
      options: r => {
        r = r || UI._recBase || {};
        const team = r.team || App.viewTeam || 'apps';
        const all = Lanes.sets(team).map(t => [t.id, t.name]);
        const saved = r.id ? Store.get(r.id) : null;
        const ownL = saved && Lanes.is(saved) && !saved.laneSet ? [['', 'Its own lanes (set with ⚙ Lanes on the board)']] : [];
        if (!saved || !Lanes.is(saved) || Lanes.canEdit(saved)) return [...ownL, ...all];
        const cur = saved.laneSet || '';
        const mine = all.filter(o => o[0] === cur);
        return mine.length ? mine : ownL;
      },
    });
    Schemas.extend('project', {
      name: 'lanes',
      mount(form) {
        const m = form.querySelector('[name=mode]'),
          ls = form.querySelector('[name=laneSet]');
        if (!m || !ls) return;
        const tog = () => {
          ls.closest('.fld').style.display = m.value === 'lanes' ? '' : 'none';
        };
        m.addEventListener('change', tog);
        tog();
      },
      before(r, prev) {
        delete r.laneStart;
        if (r.mode !== 'lanes') {
          if (!(prev && prev.laneSet)) delete r.laneSet;
          return;
        }
        const was = prev && prev.id ? Store.get(prev.id) || prev : null;
        // an existing Lanes project keeps its template unless an admin changes it
        if (was && Lanes.is(was) && !Lanes.canEdit(was)) {
          if (was.laneSet) r.laneSet = was.laneSet;
          else delete r.laneSet;
          return;
        }
        if (r.laneSet === '' && was && Lanes.is(was) && !was.laneSet) {
          delete r.laneSet;
          return;
        } // still on its own lanes (from before)
        if (!r.laneSet || !Lanes.sets(r.team || 'apps').some(t => t.id === r.laneSet)) r.laneSet = 'std';
      },
      // after saving a project whose way of working changed: tasks with a status the new way does not have → ask where they go
      saved(out, prev) {
        const was = (prev && prev.id && prev.mode) || 'kanban';
        if (!prev || !prev.id) return;
        // a Lanes project switched to another template (admin): tasks that lose their place → ask where they go
        if (was === 'lanes' && out.mode === 'lanes' && (prev.laneSet || '') !== (out.laneSet || '')) {
          setTimeout(() => {
            const p = Store.get(out.id);
            if (!p) return;
            const next = Lanes.of(p);
            const old = Object.assign({}, prev);
            const lost = Lanes.homeless(old, next).map(x => Object.assign(x, { cat: (Lanes.statusOf(x.t, old) || {}).cat || 'todo' }));
            LanesUI.askMoves(lost, next, moves => {
              const recs = Lanes.taskMoves(old, next, moves);
              if (recs.length) Store.saveMany(recs);
              UI.closeModal();
              UI.toast(
                `Now on “${(Lanes.tplOf(p) || {}).name || 'its lanes'}”${recs.length ? ` — ${recs.length} task(s) placed` : ''}`,
                'good'
              );
              App.render();
            });
          }, 50);
          return;
        }
        if ((out.mode || 'kanban') === was) return;
        setTimeout(() => {
          const p = Store.get(out.id);
          if (!p) return;
          const plan = TaskFlow.mapping(p).filter(x => x.t.status !== 'Canceled');
          const toLanes = Lanes.is(p);
          const first = toLanes ? Lanes.of(p)[0] : null;
          const fix = (t, to) =>
            Object.assign({}, t, toLanes ? { lane: (Lanes.laneOf(Object.assign({}, t, { status: to }), p) || first).id } : {}, {
              status: to,
              hist: [...(t.hist || []), { at: Date.now(), by: App.me, from: t.status, to, tr: 'Way of working changed' }].slice(-60),
            });
          if (!plan.length) {
            if (toLanes) {
              const l = Scrum.items(p.id)
                .filter(t => !t.lane && t.status !== 'Canceled')
                .map(t => Object.assign({}, t, { lane: (Lanes.laneOf(t, p) || first).id }));
              if (l.length) Store.saveMany(l);
            }
            return;
          }
          TaskFlowAdmin.mapDialog(plan, map => {
            const recs = plan.map(x => fix(x.t, (map && map[x.t.status + '|' + x.w.id]) || x.to));
            Store.saveMany(recs);
            UI.closeModal();
            UI.toast(`${recs.length} task(s) moved`, 'good');
            App.render();
          });
        }, 50);
      },
    });
  }
  // the task form: a Lane box on Lanes projects; the Status list follows the lane
  const T = Schemas.ptask;
  if (T) {
    const LANE = {
      key: 'lane',
      label: 'Lane',
      type: 'select',
      options: () => Lanes.of(Scrum.proj(UI._recProject)).map(l => [l.id, l.name]),
      blank: false,
      showIf: r => Lanes.is(Scrum.proj((r && r.project) || UI._recProject)),
    };
    const moved = new WeakMap(); // a task moved to another lane from its form (before → after)
    Schemas.extend('ptask', {
      name: 'lanes',
      // the Lane box, just before Status, on Lanes projects
      fields(list) {
        if (list.some(f => f.key === 'lane')) return list;
        const out = list.slice();
        const ix = out.findIndex(f => f.key === 'status');
        out.splice(ix < 0 ? out.length : ix, 0, LANE);
        return out;
      },
      mount(form, base) {
        const p = Scrum.proj((base && base.project) || UI._recProject);
        const ln = form.querySelector('[name=lane]'),
          st = form.querySelector('[name=status]');
        if (!Lanes.is(p) || !ln || !st) return;
        if (!base.id && !base.lane && !ln.value) ln.value = Lanes.of(p)[0].id;
        if (base.lane || base.id) ln.value = (Lanes.laneOf(base, p) || Lanes.of(p)[0]).id;
        const fill = keep => {
          const l = Lanes.of(p).find(x => x.id === ln.value) || Lanes.of(p)[0];
          const cur = keep ? st.value : '';
          st.innerHTML = l.statuses.map(s => `<option value="${h(s.name)}">${h(s.name)}</option>`).join('');
          st.value = l.statuses.some(s => s.name === cur) ? cur : l.statuses[0].name;
        };
        fill(true);
        ln.addEventListener('change', () => fill(false));
      },
      before(r, before) {
        const p = Scrum.proj(r.project);
        if (!Lanes.is(p)) return;
        const ls = Lanes.of(p);
        const lane = ls.find(l => l.id === r.lane) || Lanes.laneOf(r, p) || ls[0];
        r.lane = lane.id;
        if (!lane.statuses.some(s => s.name === r.status)) r.status = lane.statuses[0].name;
        if (before && before.id && (Lanes.laneOf(before, p) || ls[0]).id !== lane.id) moved.set(r, lane);
      },
      after(r, before) {
        const lane = moved.get(r);
        if (!lane) return;
        moved.delete(r);
        T._last = null;
        r.hist = [
          ...(before.hist || []),
          { at: Date.now(), by: App.me, from: before.status, to: r.status, tr: 'Moved to lane ' + lane.name },
        ].slice(-60); // a lane change from the form: not a workflow move
      },
    });
  }
  // Admin → Work & workflows → Project tasks: the Lanes section (next to the workflows)
  const page = TaskFlowAdmin.page;
  TaskFlowAdmin.page = function (...a) {
    const pg = page.apply(this, a);
    const sc = TFE.scope;
    if (!pg || !pg.html || TFE.draft || !sc || sc === 'fu') return pg;
    const m = pg.mount;
    return Object.assign({}, pg, {
      html: pg.html + LanesUI.adminCard(sc),
      mount(root) {
        if (m) m.call(this, root);
        LanesUI.adminBind(root, sc);
      },
    });
  };
})();
