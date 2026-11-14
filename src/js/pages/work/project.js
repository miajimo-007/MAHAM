/* MAHAM — One project: overview, timeline, board, backlog / list, sprints (scrum), risks & issues, status, team, reports. */
'use strict';

function editMembers(p) {
  const people = Scrum.teamPeople(p);
  const cur = new Set(p.members || []);
  UI.modal({
    title: 'Project team — ' + p.name,
    body: `<p class="muted small">Pick the ${h(Store.teamName(p.team))} people working on this project. Members see it in their menu and can complete the tasks assigned to them.</p><div class="pick">${people.map(m => `<label class="check"><input type="checkbox" name="pm" value="${h(m.id)}" ${cur.has(m.id) ? 'checked' : ''}> ${h(Store.memberShort(m.id))} <span class="muted small">${h(Store.titleOf(m))}</span></label>`).join('') || empty('No people in this team')}</div>`,
    actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save team</button>`,
    onMount: w => {
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelector('[data-ok]').onclick = () => {
        const members = [...w.querySelectorAll('[name=pm]:checked')].map(b => b.value);
        Store.save(Object.assign({}, Store.get(p.id), { members }));
        UI.closeModal();
        UI.toast('Project team saved', 'good');
        App.render();
      };
    },
  });
}

function startSprint(sp) {
  const act = Scrum.active(sp.project);
  if (act) return UI.toast(`Complete ${act.name} first — only one sprint can be active`, 'bad');
  const pr = Store.get(sp.project);
  const recs = [Object.assign({}, sp, { status: 'Active', start: sp.start || U.todayStr() })];
  if (pr && pr.status === 'Not Started' && !pr.workflow)
    recs.push(Object.assign({}, pr, { status: 'In Progress', updatedOn: U.todayStr() }));
  Store.saveMany(recs);
  UI.toast(sp.name + ' started', 'good');
  App.render();
}

function completeSprint(sp) {
  const open = Scrum.items(sp.project).filter(t => t.sprint === sp.id && !Scrum.isDone(t));
  const next = Scrum.sprints(sp.project).filter(s => s.status === 'Planned' && s.id !== sp.id);
  const done = Scrum.items(sp.project).filter(t => t.sprint === sp.id && Scrum.isDone(t));
  UI.modal({
    title: 'Complete ' + sp.name,
    body: `<p><b>${done.length}</b> item${done.length === 1 ? '' : 's'} done (${Scrum.pts(done)} points). <b>${open.length}</b> not finished.</p>${open.length ? `<form class="grid-form" id="csf">${UI.field({ key: 'to', label: 'Move unfinished items to', type: 'select', options: [['', 'Backlog'], ...next.map(s => [s.id, s.name])], blank: false }, next[0] ? next[0].id : '')}</form>` : ''}<form class="grid-form" id="retf">${ScrumUI.retroFields(sp)}</form>`,
    wide: true,
    actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Complete sprint</button>`,
    onMount: w => {
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelector('[data-ok]').onclick = () => {
        const to = open.length ? w.querySelector('[name=to]').value : '';
        const rx = ScrumUI.readRetro(w); // the sprint review + retrospective (pages/scrumguide.js)
        Store.saveMany([
          Object.assign({}, sp, {
            status: 'Completed',
            donePoints: Scrum.pts(done),
            committed: Scrum.pts(done) + Scrum.pts(open),
            completedOn: U.todayStr(),
            review: rx.review,
            retro: rx.retro,
          }),
          ...open.map(t => Object.assign({}, t, { sprint: to, carried: (t.carried || 0) + 1 })),
          ...ScrumUI.retroRecs(sp, rx),
        ]);
        UI.closeModal();
        UI.toast(sp.name + ' completed', 'good');
        App.render();
      };
    },
  });
}

P.project = pid => {
  const p = Store.get(pid);
  if (!p || p.c !== 'project' || !Scrum.canSee(p))
    return {
      title: 'Project',
      html: empty('Project not found, or it belongs to another team.') + '<p><a class="link" href="#/projects">← Projects</a></p>',
    };
  const plan = Scrum.planner(p),
    mem = Scrum.member(p);
  const scrum = PM.mode(p) === 'scrum';
  const TABS = [
    ['overview', 'Overview'],
    ['timeline', 'Timeline'],
    ['board', 'Board'],
    ...(typeof WorkUI !== 'undefined' ? [['epics', 'Epics']] : []),
    ['backlog', scrum ? 'Backlog' : 'List'],
    ...(scrum ? [['sprints', 'Sprints']] : []),
    ['raid', 'Risks & issues'],
    ['status', 'Status'],
    ['team', 'Team'],
    ['reports', 'Reports'],
  ];
  const tab = TABS.some(t => t[0] === ps('prj').tab) ? ps('prj').tab : 'overview';
  const items = Scrum.items(pid),
    sprints = Scrum.sprints(pid),
    act = Scrum.active(pid);
  const d = projDerive(p),
    prog = Scrum.progress(p),
    today = U.todayStr();
  const canAdd = plan || mem || (typeof Work !== 'undefined' && Work.canAdd(p));
  const ctx = { plan, canAdd, items, prog };
  const sprintPts = s => {
    const it = items.filter(t => t.sprint === s.id);
    return { n: it.length, pts: Scrum.pts(it), done: Scrum.pts(it.filter(t => Scrum.isDone(t))) };
  };
  let body;
  if (tab === 'overview') body = PMV.overview(p, ctx);
  else if (tab === 'timeline') body = PMV.timeline(p, ctx);
  else if (tab === 'raid') body = PMV.raid(p, ctx);
  else if (tab === 'epics') body = WorkUI.epics(p, ctx);
  else if (tab === 'status') body = PMV.status(p, ctx);
  else if (tab === 'board' && typeof Lanes !== 'undefined' && Lanes.is(p))
    body = LanesUI.board(p, ctx); // Lanes: own statuses, colour coded (pages/lanes.js)
  else if (tab === 'board' && !scrum) {
    const mineOnly = ps('prj').mine;
    const old = U.addDays(today, -30);
    let it = items.filter(t => !Scrum.isDone(t) || !t.doneDate || t.doneDate >= old);
    if (mineOnly) it = it.filter(t => t.assignee === App.me);
    const hidden = items.filter(t => Scrum.isDone(t) && t.doneDate && t.doneDate < old).length;
    body = `<div class="page-actions"><label class="flt tog"><input type="checkbox" id="mineonly" ${mineOnly ? 'checked' : ''}> Only my tasks</label><span class="grow"></span>${hidden ? `<span class="muted small">${hidden} done more than 30 days ago not shown</span>` : ''}${KanbanUI.button(p)}${canAdd ? `<button class="btn primary" id="additem">＋ Add task</button>` : ''}</div>
      <div class="kanban" style="--cols: ${Scrum.columns(p).length}">${Scrum.columns(p)
        .map((st, ci) => {
          const col = it
            .filter(t => Scrum.colIndex(t) === ci)
            .sort(
              (a, b) =>
                ({ High: 0, Normal: 1, Low: 2 })[a.priority || 'Normal'] - { High: 0, Normal: 1, Low: 2 }[b.priority || 'Normal'] ||
                (a.due || '9').localeCompare(b.due || '9') ||
                (a.n || 0) - (b.n || 0)
            );
          return `<div class="kcol ${KanbanUI.over(p, st, col) ? 'wip-over' : ''}" data-col="${h(st)}"><div class="kcol-h"><b>${h(st)}</b><span class="count">${col.length}</span>${KanbanUI.head(p, st, col)}</div>${col.map(t => ptCard(t, p)).join('') || '<div class="kempty">—</div>'}</div>`;
        })
        .join('')}</div>`;
  } else if (tab === 'board') {
    const sel = ps('prj').sp && sprints.some(s => s.id === ps('prj').sp) ? ps('prj').sp : act ? act.id : '';
    const sp = sprints.find(s => s.id === sel);
    const mineOnly = ps('prj').mine;
    let it = items.filter(t => (sp ? t.sprint === sp.id : !t.sprint));
    if (mineOnly) it = it.filter(t => t.assignee === App.me);
    const sx = sp ? sprintPts(sp) : null;
    body = `<div class="page-actions"><label class="flt"><span>Sprint</span><select id="spsel"><option value="">Backlog (no sprint)</option>${sprints.map(s => `<option value="${h(s.id)}" ${s.id === sel ? 'selected' : ''}>${h(s.name)} · ${h(s.status)}</option>`).join('')}</select></label>
      <label class="flt tog"><input type="checkbox" id="mineonly" ${mineOnly ? 'checked' : ''}> Only my tasks</label><label class="flt tog" title="The Daily Scrum: what moved, what is in progress, what waits — per person"><input type="checkbox" id="dailyv" ${ps('prj').daily ? 'checked' : ''}> 📅 Daily</label><span class="grow"></span>
      ${sp ? `<span class="muted small">${U.fmtDate(sp.start)} → ${U.fmtDate(sp.end)}${sp.status === 'Active' && sp.end ? ` · <b>${Math.max(0, U.diffDays(today, sp.end))} days left</b>` : ''} · ${sx.done}/${sx.pts} points done</span>` : ''}
      ${KanbanUI.button(p)}${canAdd ? `<button class="btn primary" id="additem">＋ Add task</button>` : ''}</div>
      ${!sprints.length && plan ? `<div class="insights"><div>No sprints yet. Add items to the <b>Backlog</b>, then create a sprint (2 weeks is typical) on the <b>Sprints</b> tab and pull items into it.</div></div>` : ''}
      ${sp && sp.goal ? `<p class="sgoal">🎯 <b>Sprint goal:</b> ${h(sp.goal)}</p>` : ''}
      ${ps('prj').daily ? ScrumUI.daily(p, it) : ''}<div class="kanban" style="--cols: ${Scrum.columns(p).length};${ps('prj').daily ? 'display:none' : ''}">${Scrum.columns(
        p
      )
        .map((st, ci) => {
          const col = it
            .filter(t => Scrum.colIndex(t) === ci)
            .sort(
              (a, b) =>
                ({ High: 0, Normal: 1, Low: 2 })[a.priority || 'Normal'] - { High: 0, Normal: 1, Low: 2 }[b.priority || 'Normal'] ||
                (a.n || 0) - (b.n || 0)
            );
          return `<div class="kcol ${KanbanUI.over(p, st, col) ? 'wip-over' : ''}" data-col="${h(st)}"><div class="kcol-h"><b>${h(st)}</b><span class="count">${col.length}</span>${KanbanUI.head(p, st, col)}<span class="grow"></span><span class="muted small">${Scrum.pts(col)} pts</span></div>${col.map(t => ptCard(t, p)).join('') || '<div class="kempty">—</div>'}</div>`;
        })
        .join('')}</div>`;
  } else if (tab === 'backlog') {
    const groups = scrum
      ? [
          ...sprints.filter(s => s.status === 'Active'),
          ...sprints.filter(s => s.status === 'Planned'),
          { id: '', name: 'Backlog', status: '' },
        ]
      : [{ id: '*', name: 'Open tasks', status: '' }];
    const row = t =>
      `<div class="li click" data-edit="ptask|${h(t.id)}"${plan ? ` draggable="true" data-bkrow="${h(t.id)}" title="Drag to change the order"` : ''}><span class="pc-type t-${U.lc(t.type || 'task')}">${typeIcon(t.type)}</span><span class="muted small mono" style="width:34px">${h(ptKey(t))}</span><span class="grow">${h(t.title)}${t.carried ? ` <span class="muted small">(carried ×${t.carried})</span>` : ''}</span>${UI.sbadge(t.priority === 'Normal' ? '' : t.priority)}<span class="small">${h(Store.memberShort(t.assignee) || '—')}</span>${typeof LanesUI !== 'undefined' ? LanesUI.chip(t) : UI.schip(t.status)}<span class="pts">${h(t.points || 0)}</span>${
        plan && scrum
          ? `<select class="xs" data-tosp="${h(t.id)}" title="Move to sprint"><option value="">Backlog</option>${sprints
              .filter(s => s.status !== 'Completed')
              .map(s => `<option value="${h(s.id)}" ${t.sprint === s.id ? 'selected' : ''}>${h(s.name)}</option>`)
              .join('')}</select>`
          : ''
      }</div>`;
    body = `<div class="page-actions"><span class="muted small">${scrum ? 'Planning: put the most important work at the top of the backlog, give it points, then move it into a sprint.' : 'Every open task. Give tasks a start and due date to see them on the Timeline.'}</span><span class="grow"></span>${canAdd ? `<button class="btn primary" id="additem">＋ Add ${scrum ? 'to backlog' : 'task'}</button>` : ''}</div>
      ${groups
        .map(g => {
          const it = items
            .filter(t => (g.id === '*' ? !Scrum.isDone(t) : (t.sprint || '') === g.id && (g.id || !Scrum.isDone(t))))
            .sort(
              (a, b) =>
                ScrumUI.rank(a) - ScrumUI.rank(b) ||
                { High: 0, Normal: 1, Low: 2 }[a.priority || 'Normal'] - { High: 0, Normal: 1, Low: 2 }[b.priority || 'Normal'] ||
                (a.n || 0) - (b.n || 0)
            );
          return card(
            `${h(g.name)} ${g.status ? UI.sbadge(g.status === 'Active' ? 'In Progress' : g.status) : ''} <span class="count">${it.length}</span> <span class="muted small">${Scrum.pts(it)} points</span> ${ScrumUI.capacity(pid, g, it)}`,
            it.map(row).join('') || empty(g.id ? 'Nothing planned in this sprint yet.' : 'Backlog is empty.')
          );
        })
        .join('')}
      ${(() => {
        const ma = Meetings.forProject(pid).filter(t => t.c !== 'mytask' || t.owner === App.me);
        return ma.length
          ? card(
              `Actions from meetings <span class="count">${ma.filter(Meetings.isOpen).length} open</span>`,
              ma.map(t => actionRow(t, null, { from: true })).join('')
            )
          : '';
      })()}`;
  } else if (tab === 'sprints') {
    body = `<div class="page-actions"><span class="grow"></span>${plan ? '<button class="btn primary" id="addsprint">＋ New sprint</button>' : ''}</div>
    ${
      sprints.length
        ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Sprint</th><th>Dates</th><th>Goal</th><th class="num">Items</th><th class="num">Points done / planned</th><th>Status</th><th></th></tr></thead><tbody>${sprints
            .map(s => {
              const x = sprintPts(s);
              const dn = s.status === 'Completed' && s.donePoints != null ? s.donePoints : x.done;
              const cm = s.status === 'Completed' && s.committed != null ? s.committed : x.pts;
              return `<tr class="click" data-edit="sprint|${h(s.id)}"><td><b>${h(s.name)}</b></td><td class="nw">${U.fmtDate(s.start)} → ${U.fmtDate(s.end)}</td><td>${h(s.goal || '')}${ScrumUI.retroView(s)}</td><td class="num">${x.n}</td><td class="num">${dn} / ${cm}</td><td>${UI.sbadge(s.status === 'Active' ? 'In Progress' : s.status)}</td><td class="nw">${plan && s.status === 'Planned' ? `<button class="btn xs primary" data-spstart="${h(s.id)}">Start</button>` : ''}${plan && s.status === 'Active' ? `<button class="btn xs" data-spdone="${h(s.id)}">Complete</button>` : ''}</td></tr>`;
            })
            .join('')}</tbody></table></div>`
        : empty('No sprints yet.')
    }`;
  } else if (tab === 'team') {
    const ppl = Scrum.people(p);
    body = `<div class="page-actions"><span class="muted small">Owner: <b>${h(Store.memberShort(p.manager))}</b> (plans the work)</span><span class="grow"></span>${plan ? '<button class="btn primary" id="editmem">Edit project team</button>' : ''}</div>
    ${
      ppl.length
        ? `<table class="tbl"><thead><tr><th>Member</th><th class="num">Open tasks</th><th class="num">In current sprint (points)</th><th class="num">Done (points)</th><th class="num">Overdue</th></tr></thead><tbody>${ppl
            .map(id => {
              const mine = items.filter(t => t.assignee === id);
              return `<tr><td><b>${h(Store.memberShort(id))}</b></td><td class="num">${mine.filter(t => !Scrum.isDone(t)).length}</td><td class="num">${act ? Scrum.pts(mine.filter(t => t.sprint === act.id)) : '–'}</td><td class="num">${Scrum.pts(mine.filter(t => Scrum.isDone(t)))}</td><td class="num ${mine.some(t => t.due && !Scrum.isDone(t) && t.due < today) ? 't-bad strong' : ''}">${mine.filter(t => t.due && !Scrum.isDone(t) && t.due < today).length}</td></tr>`;
            })
            .join('')}</tbody></table>`
        : empty(plan ? 'No members yet — click "Edit project team".' : 'No members yet.')
    }`;
  } else {
    const done = sprints.filter(s => s.status === 'Completed');
    const vel = done.map(s => ({
      label: s.name.length > 10 ? s.name.slice(0, 10) + '…' : s.name,
      value: s.donePoints != null ? s.donePoints : Scrum.pts(items.filter(t => t.sprint === s.id && Scrum.isDone(t))),
    }));
    const avgVel = vel.length ? U.avg(vel.map(v => v.value)) : null;
    const remaining = Scrum.pts(items.filter(t => !Scrum.isDone(t)));
    body = `<div class="kpis k4">${UI.kpi('Progress', prog + '%', `${Scrum.pts(items.filter(t => Scrum.isDone(t)))} of ${Scrum.pts(items)} points`)}${scrum || sprints.length ? UI.kpi('Average velocity', avgVel != null ? U.num(avgVel, 1) : '–', 'points per sprint') : ''}${UI.kpi('Points left', remaining, avgVel ? `≈ ${Math.ceil(remaining / avgVel)} more sprint(s)` : '')}${UI.kpi('Bugs open', items.filter(t => t.type === 'Bug' && !Scrum.isDone(t)).length, '')}</div>
    ${
      scrum || sprints.length
        ? `<div class="cols2">${card(
            act ? `Burndown — ${h(act.name)}` : 'Burndown',
            act
              ? burndown(
                  act,
                  items.filter(t => t.sprint === act.id)
                )
              : empty('No active sprint.')
          )}${card('Velocity (points done per sprint)', vel.length ? UI.barChart(vel, { height: 170, fmt: v => U.num(v, 0) }) : empty('Complete a sprint to see velocity.'))}</div>`
        : ''
    }
    ${KanbanUI.flowCards(p, items)}
    ${PM2V.hoursCard(items)}
    ${card('Work per member (open points)', Scrum.people(p).length ? UI.hbars(Scrum.people(p).map(id => ({ label: Store.memberShort(id), value: Scrum.pts(items.filter(t => t.assignee === id && !Scrum.isDone(t))) }))) : empty('No members.'))}`;
  }
  const html = `<p><a class="link" href="#/projects">← Projects</a></p>
  <div class="card phead"><div class="ph-main"><h2>${p.restricted ? '🔒 ' : ''}${h(p.name)}</h2><div class="muted small">${p.category ? UI.badge(p.category, 'cat') + ' ' : ''}${h(Store.teamName(p.team))} · Owner ${h(Store.memberShort(p.manager))}${p.origin === 'team' ? '' : ' · from director'}${p.due ? ' · target ' + U.fmtDate(p.due) : ''} · ${Scrum.people(p).length} member${Scrum.people(p).length === 1 ? '' : 's'} · ${scrum ? 'Scrum' : typeof Lanes !== 'undefined' && Lanes.is(p) ? 'Lanes' : 'Kanban'}</div>${p.description ? `<p class="small">${h(p.description)}</p>` : ''}</div>
    <div class="ph-side"><div style="min-width:180px">${UI.bar(prog)}<span class="muted small">${prog}% · ${PM.light(p, true)} ${Flow.of(p) ? UI.badge(Flow.stageOf(p).name, Flow.stuck(p) ? 'bad' : '') : UI.sbadge(p.status)}</span></div>${App.isSuper() ? `<button class="btn sm ghost" id="projvis">${p.restricted ? '🔒 Hidden · ' + (p.viewers || []).length : '🔓 Who can see it'}</button>` : ''}${plan && PM2.canTemplate() ? '<button class="btn sm ghost" id="savetpl" title="Reuse this project\'s phases and tasks">Save as template</button>' : ''}${plan && !PM2.closed(p) && p.status !== 'Canceled' ? '<button class="btn sm ghost" id="closeout">🏁 Close out</button>' : ''}${plan || App.isDir() ? '<button class="btn sm" id="editproj">Edit project</button>' : ''}</div></div>
  ${Flow.bar(p)}
  <div class="tabs">${TABS.map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" href="javascript:void 0" data-ptab="${k}">${l}</a>`).join('')}</div>${body}`;
  return {
    title: p.name || 'Project',
    html,
    mount(root) {
      bindScrum(root);
      Flow.bind(root, p);
      PMV.bind(root, p, ctx);
      if (typeof LanesUI !== 'undefined' && Lanes.is(p)) LanesUI.bind(root, p);
      KanbanUI.bind(root, p);
      ScrumUI.bindOrder(root, p);
      const dv = root.querySelector('#dailyv');
      if (dv)
        dv.onchange = () => {
          ps('prj').daily = dv.checked;
          App.render();
        };
      root.querySelectorAll('[data-ptab]').forEach(
        a =>
          (a.onclick = () => {
            ps('prj').tab = a.dataset.ptab;
            App.render();
          })
      );
      const sps = root.querySelector('#spsel');
      if (sps)
        sps.onchange = () => {
          ps('prj').sp = sps.value;
          App.render();
        };
      const mo = root.querySelector('#mineonly');
      if (mo)
        mo.onchange = () => {
          ps('prj').mine = mo.checked;
          App.render();
        };
      const ai = root.querySelector('#additem');
      if (ai)
        ai.onclick = () => {
          const sp = tab === 'board' ? (root.querySelector('#spsel') || {}).value || '' : '';
          UI.editRecord('ptask', { project: pid, sprint: sp, assignee: plan ? '' : App.me, team: p.team });
        };
      const as = root.querySelector('#addsprint');
      if (as)
        as.onclick = () =>
          UI.editRecord('sprint', {
            project: pid,
            team: p.team,
            name: 'Sprint ' + (sprints.length + 1),
            start: sprints.length && sprints[sprints.length - 1].end ? U.addDays(sprints[sprints.length - 1].end, 1) : today,
            end: U.addDays(
              sprints.length && sprints[sprints.length - 1].end ? U.addDays(sprints[sprints.length - 1].end, 1) : today,
              (+p.sprintDays || 14) - 1
            ),
          });
      const em = root.querySelector('#editmem');
      if (em) em.onclick = () => editMembers(p);
      const pv = root.querySelector('#projvis');
      if (pv) pv.onclick = () => projectVisibility(Store.get(pid));
      const ep = root.querySelector('#editproj');
      if (ep)
        ep.onclick = () =>
          UI.editRecord('project', p, {
            after: out => {
              const cur = Store.get(pid);
              if (cur && cur.status === 'Done' && !PM2.closed(cur)) setTimeout(() => PM2V.closeOut(cur), 0);
            },
          });
      const st = root.querySelector('#savetpl');
      if (st) st.onclick = () => PM2V.saveTemplate(Store.get(pid));
      const co = root.querySelector('#closeout');
      if (co) co.onclick = () => PM2V.closeOut(Store.get(pid));
      root.querySelectorAll('[data-spstart]').forEach(
        b =>
          (b.onclick = e => {
            e.stopPropagation();
            startSprint(Store.get(b.dataset.spstart));
          })
      );
      root.querySelectorAll('[data-spdone]').forEach(
        b =>
          (b.onclick = e => {
            e.stopPropagation();
            completeSprint(Store.get(b.dataset.spdone));
          })
      );
      root.querySelectorAll('[data-tosp]').forEach(s => {
        s.onclick = e => e.stopPropagation();
        s.onchange = () => {
          const t = Store.get(s.dataset.tosp);
          Store.save(Object.assign({}, t, { sprint: s.value }));
          UI.toast(s.value ? 'Moved to ' + Store.get(s.value).name : 'Moved to backlog', 'good');
          App.render();
        };
      });
    },
  };
};
