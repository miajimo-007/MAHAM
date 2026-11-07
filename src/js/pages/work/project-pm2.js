/* MAHAM — Project management stage 2 screens: task checklist & comments (inside the task form), workload,
 * project requests, templates, baseline, close-out and lessons learned. */
'use strict';

const PM2V = {
  /* ---------- inside the project task form: checklist (saved with the task) and comments (saved at once) ---------- */
  draft: null, // { id, list } — the checklist being edited in the open form
  taskPanel(form, base) {
    const p = Scrum.proj(base.project);
    const can = !base.id || Scrum.canWork(base) || Scrum.planner(p) || (Scrum.member(p) && !base.assignee);
    PM2V.draft = { id: base.id || '', list: PM2.checklist(base).map(x => Object.assign({}, x)) };
    const box = document.createElement('div');
    box.className = 'ptx';
    form.parentNode.insertBefore(box, form.nextSibling); // (form.after is the "Starts after" field)
    const draw = () => {
      const l = PM2V.draft.list;
      const cm = base.id ? PM2.comments(base.id) : [];
      box.innerHTML = `<h4 class="act-h">Checklist ${l.length ? `<span class="count">${l.filter(x => x.done).length}/${l.length}</span>` : ''}</h4>
        <div class="ptx-cl">${l.map((x, i) => `<label class="check ptx-ci"><input type="checkbox" data-cli="${i}" ${x.done ? 'checked' : ''} ${can ? '' : 'disabled'}> <span class="${x.done ? 'ptx-done' : ''}">${h(x.t)}</span>${can ? `<button type="button" class="btn xs ghost" data-cldel="${i}" title="Remove">✕</button>` : ''}</label>`).join('') || '<p class="muted small">No steps yet.</p>'}</div>
        ${can ? '<div class="row-btns tight"><input id="clnew" placeholder="Add a step… (Enter)" style="flex:1"><button type="button" class="btn sm" id="cladd">Add</button></div>' : ''}
        ${
          base.id
            ? `<h4 class="act-h">Comments <span class="count">${cm.length}</span></h4>
        <div class="ptx-cm">${cm.map(c => `<div class="ptx-c"><div class="small"><b>${h(Store.memberShort(c.createdBy || c._by))}</b> <span class="muted">${U.fmtTs(c.at || c._ts)}</span>${(c.createdBy || c._by) === App.me || App.isSuper() ? ` <a href="#" class="link small" data-cmdel="${h(c.id)}">delete</a>` : ''}</div><div class="info-val">${h(c.text)}</div></div>`).join('') || '<p class="muted small">No comments yet.</p>'}</div>
        ${Scrum.canSee(p) && (Scrum.onProject(p) || Scrum.planner(p)) ? '<div class="row-btns tight"><textarea id="cmnew" rows="2" placeholder="Write a comment…" style="flex:1"></textarea><button type="button" class="btn sm primary" id="cmadd">Post</button></div>' : ''}`
            : '<p class="muted small">Comments can be added once the task is saved.</p>'
        }`;
      const keep = () => {
        if (base.id)
          Store.save(Object.assign({}, Store.get(base.id) || base, { checklist: PM2V.draft.list.map(x => Object.assign({}, x)) }));
      }; // ticks count at once
      box.querySelectorAll('[data-cli]').forEach(
        c =>
          (c.onchange = () => {
            PM2V.draft.list[+c.dataset.cli].done = c.checked;
            keep();
            draw();
          })
      );
      box.querySelectorAll('[data-cldel]').forEach(
        b =>
          (b.onclick = e => {
            e.preventDefault();
            PM2V.draft.list.splice(+b.dataset.cldel, 1);
            keep();
            draw();
          })
      );
      const add = () => {
        const i = box.querySelector('#clnew');
        const v = i.value.trim();
        if (!v) return;
        PM2V.draft.list.push({ t: v, done: false });
        keep();
        draw();
        const n = box.querySelector('#clnew');
        if (n) n.focus();
      };
      const ab = box.querySelector('#cladd');
      if (ab) ab.onclick = add;
      const ni = box.querySelector('#clnew');
      if (ni)
        ni.onkeydown = e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        };
      const cb = box.querySelector('#cmadd');
      if (cb)
        cb.onclick = () => {
          const v = box.querySelector('#cmnew').value.trim();
          if (!v) return;
          Store.save({ c: 'pcomment', project: base.project, task: base.id, team: p ? p.team : '', text: v, at: Date.now() });
          draw();
        };
      box.querySelectorAll('[data-cmdel]').forEach(
        a =>
          (a.onclick = e => {
            e.preventDefault();
            const c = Store.get(a.dataset.cmdel);
            if (c)
              UI.confirm('Delete this comment?', () => {
                Store.save(Object.assign({}, c, { _del: true }));
                setTimeout(() => {
                  const t = Store.get(base.id);
                  if (t) UI.editRecord('ptask', t);
                }, 0);
              });
          })
      );
    };
    draw();
  },

  /* ---------- Workload (Projects → Workload) ---------- */
  workload() {
    const s = ps('wl');
    const teams = App.myTeams();
    const team = teams.some(t => t.id === s.team)
      ? s.team
      : (Store.member(App.me) || {}).team && teams.some(t => t.id === Store.member(App.me).team)
        ? Store.member(App.me).team
        : (teams[0] || {}).id;
    const people = Store.visible()
      .filter(m => m.active !== false && !Store.topRole(m.role) && (m.team || 'apps') === team)
      .sort((a, b) => a.name.localeCompare(b.name));
    const open = Store.all('ptask').filter(
      t => !Scrum.isDone(t) && t.status !== 'Canceled' && t.assignee && Scrum.canSee(Scrum.proj(t.project))
    );
    const wk = PM2.weeks(6);
    const today = U.todayStr();
    const cell = (list, key) => {
      const x = PM2.load(list);
      return `<td class="num wl ${PM2.level(x, team)}" ${x.n ? `data-wl="${h(key)}"` : ''}>${x.n ? `<b>${x.n}</b>${x.hrs ? `<span class="small"> · ${U.num(x.hrs, 0)}h</span>` : ''}` : '<span class="muted">·</span>'}</td>`;
    };
    PM2V._wl = {};
    const rows = people.map(m => {
      const mine = open.filter(t => t.assignee === m.id);
      const late = mine.filter(t => t.due && t.due < today);
      const nod = mine.filter(t => !t.start && !t.due);
      PM2V._wl[m.id + '|late'] = late;
      PM2V._wl[m.id + '|nod'] = nod;
      const projs = new Set(mine.map(t => t.project)).size;
      return `<tr><td><b>${h(Store.memberShort(m.id))}</b><div class="muted small">${projs} project${projs === 1 ? '' : 's'}</div></td><td class="num ${late.length ? 't-bad strong' : 'muted'}" ${late.length ? `data-wl="${m.id}|late"` : ''}>${late.length || '·'}</td>${wk
        .map(w => {
          const l = mine.filter(t => PM2.inWeek(t, w));
          PM2V._wl[m.id + '|' + w] = l;
          return cell(l, m.id + '|' + w);
        })
        .join('')}<td class="num muted" ${nod.length ? `data-wl="${m.id}|nod"` : ''}>${nod.length || '·'}</td></tr>`;
    });
    return `<div class="page-actions">${teams.length > 1 ? `<label class="flt"><span>Team</span><select id="wlteam">${teams.map(t => `<option value="${h(t.id)}" ${t.id === team ? 'selected' : ''}>${h(t.name)}</option>`).join('')}</select></label>` : ''}<span class="muted small">Open project tasks per person and week, across all projects. Amber = busy, red = more than ${Custom.target('wlTasks', team)} tasks or ${Custom.target('wlHours', team)} estimated hours in a week (Admin → Customize). Click a number to see the tasks.</span></div>
      ${card('', people.length ? `<div class="tbl-scroll"><table class="tbl wl-t"><thead><tr><th>Person</th><th class="num">Overdue</th>${wk.map((w, i) => `<th class="num">${i === 0 ? 'This week' : 'Week of ' + U.fmtDate(w).slice(0, 6)}</th>`).join('')}<th class="num">No date</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : empty('No people in this team.'))}`;
  },
  bindWorkload(root) {
    const t = root.querySelector('#wlteam');
    if (t)
      t.onchange = () => {
        ps('wl').team = t.value;
        App.render();
      };
    root.querySelectorAll('[data-wl]').forEach(
      c =>
        (c.onclick = () => {
          const l = (PM2V._wl || {})[c.dataset.wl] || [];
          const [mid, w] = c.dataset.wl.split('|');
          UI.modal({
            title: `${Store.memberShort(mid)} — ${w === 'late' ? 'overdue' : w === 'nod' ? 'no dates' : 'week of ' + U.fmtDate(w)}`,
            wide: true,
            body: l
              .map(
                x =>
                  `<div class="li click" data-wlopen="${h(x.id)}"><span class="muted small mono">${h(ptKey(x))}</span><div class="grow"><b>${h(x.title)}</b><div class="muted small">${h((Store.get(x.project) || {}).name || '')} · ${x.start ? U.fmtDate(x.start) + ' → ' : ''}${U.fmtDate(x.due)}${PM2.hrs(x.est) ? ' · ' + PM2.hrs(x.est) + 'h' : ''}</div></div>${UI.sbadge(x.status)}</div>`
              )
              .join(''),
            actions: '<span class="grow"></span><button class="btn" data-c>Close</button>',
            onMount: w2 => {
              w2.querySelector('[data-c]').onclick = UI.closeModal;
              w2.querySelectorAll('[data-wlopen]').forEach(
                r =>
                  (r.onclick = () => {
                    UI.closeModal();
                    location.hash = '#/project/' + Store.get(r.dataset.wlopen).project;
                  })
              );
            },
          });
        })
    );
  },

  /* ---------- Project requests (Projects → Requests) ---------- */
  requests() {
    const mine = PM2.myReqs().sort((a, b) => (b._ts || 0) - (a._ts || 0));
    const dec = PM2.toDecide().sort(
      (a, b) =>
        ({ High: 0, Normal: 1, Low: 2 })[a.urgency || 'Normal'] - { High: 0, Normal: 1, Low: 2 }[b.urgency || 'Normal'] ||
        (a._ts || 0) - (b._ts || 0)
    );
    const all = App.isSuper() || App.isDir() || App.isAED() ? PM2.reqs().filter(q => !dec.includes(q) && !mine.includes(q)) : [];
    const kind = st => ({ Approved: 'good', Rejected: 'bad', 'On hold': 'warn', 'With the director': 'warn' })[st] || '';
    const row = (q, btns) =>
      `<div class="li click" data-edit="preq|${h(q.id)}"><div class="grow"><b>${h(q.title)}</b>${q.urgency && q.urgency !== 'Normal' ? ` <span class="tag-pri ${h(q.urgency)}">${h(q.urgency)}</span>` : ''}<div class="muted small">by ${h(Store.memberShort(q.createdBy))} · ${h(Store.teamName(q.team))}${q.dept ? ' · for ' + h(q.dept) : ''} · ${U.fmtTs(q.at || q._ts)}${q.note ? ` · <i>“${h(q.note)}”</i>` : ''}${q.project && Store.get(q.project) ? ` · <a class="link" href="#/project/${h(q.project)}">open project →</a>` : ''}</div></div>${UI.badge(q.status, kind(q.status))}${btns || ''}</div>`;
    const dbtn = q =>
      `<span class="nw" data-stop><button class="btn xs primary" data-rqok="${h(q.id)}">Approve → project</button> <button class="btn xs" data-rqhold="${h(q.id)}">On hold</button>${App.isMgr() && !(App.isDir() || App.isAED()) && q.status !== PM2.REQ.D ? ` <button class="btn xs" data-rqdir="${h(q.id)}" title="Ask the director to decide">To director</button>` : ''} <button class="btn xs ghost" data-rqno="${h(q.id)}">Reject</button></span>`;
    return `<div class="page-actions"><span class="muted small">Anyone can suggest a project. The team's manager (or the director) approves it — it becomes a project with the charter filled in — puts it on hold, or rejects it with a reason.</span><span class="grow"></span><button class="btn primary" data-rqnew>＋ Suggest a project</button></div>
      ${dec.length ? card(`To decide <span class="count">${dec.length}</span>`, dec.map(q => row(q, dbtn(q))).join('')) : ''}
      ${card(`My suggestions <span class="count">${mine.length}</span>`, mine.length ? mine.map(q => row(q)).join('') : empty('You have not suggested a project yet.'))}
      ${all.length ? card(`All other suggestions <span class="count">${all.length}</span>`, all.map(q => row(q)).join('')) : ''}`;
  },
  bindRequests(root) {
    root.querySelectorAll('[data-stop]').forEach(x => (x.onclick = e => e.stopPropagation()));
    const nw = root.querySelector('[data-rqnew]');
    if (nw)
      nw.onclick = () =>
        UI.editRecord('preq', {
          status: PM2.REQ.P,
          urgency: 'Normal',
          team: (Store.member(App.me) || {}).team || App.viewTeam || 'apps',
          at: Date.now(),
        });
    const decide = (id, status, ask) => {
      const q = Store.get(id);
      if (!q) return;
      const go = note => {
        Store.save(Object.assign({}, q, { status, note: note || q.note || '', decidedBy: App.me, decidedOn: U.todayStr() }));
        UI.toast(`${q.title}: ${status.toLowerCase()}`, 'good');
        App.render();
      };
      if (!ask) return go('');
      UI.modal({
        title: ask,
        body: `<form class="grid-form" id="rqn">${UI.field({ key: 'note', label: 'Reason (the person sees it)', type: 'text', span: 2 })}</form>`,
        actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>OK</button>',
        onMount: w => {
          w.querySelector('[data-c]').onclick = UI.closeModal;
          w.querySelector('[data-ok]').onclick = () => {
            const v = w.querySelector('[name=note]').value.trim();
            UI.closeModal();
            go(v);
          };
        },
      });
    };
    root.querySelectorAll('[data-rqno]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          decide(b.dataset.rqno, PM2.REQ.R, 'Reject the suggestion');
        })
    );
    root.querySelectorAll('[data-rqhold]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          decide(b.dataset.rqhold, PM2.REQ.H, 'Put on hold');
        })
    );
    root.querySelectorAll('[data-rqdir]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          decide(b.dataset.rqdir, PM2.REQ.D, '');
        })
    );
    root.querySelectorAll('[data-rqok]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          PM2V.approve(Store.get(b.dataset.rqok));
        })
    );
  },
  /* approve: open the new-project form filled from the request; when it is saved the request points to it */
  approve(q) {
    if (!Scrum.canCreate()) return UI.toast('You need "Create and lead team projects" to turn it into a project', 'bad');
    const seed = U.uid('seed');
    PM2V.newProject(
      {
        name: q.title,
        team: q.team,
        description: q.problem || '',
        goal: q.problem || '',
        success: q.benefit || '',
        priority: q.urgency === 'High' ? 'High' : 'Normal',
        fromReq: q.id,
        seedKey: seed,
      },
      p => {
        Store.save(Object.assign({}, Store.get(q.id), { status: PM2.REQ.A, project: p.id, decidedBy: App.me, decidedOn: U.todayStr() }));
      }
    );
  },
  /* the project form, then `then(project)` once it exists */
  newProject(pre, then) {
    const seed = pre.seedKey || U.uid('seed');
    UI.editRecord('project', Object.assign({}, pre, { seedKey: seed }), {
      after: () => {
        const p = Store.all('project').find(x => x.seedKey === seed);
        if (p && then) {
          then(p);
          App.render();
        }
      },
    });
  },

  /* ---------- templates ---------- */
  saveTemplate(p) {
    UI.modal({
      title: 'Save as template',
      body: `<p class="muted small">Phases, milestones, tasks (with checklists, points and estimates) and the charter headings are kept; dates become "days after the start". People and progress are not kept.</p><form class="grid-form" id="tpf">${UI.field({ key: 'name', label: 'Template name', type: 'text', required: true, span: 2 }, p.name)}</form>`,
      actions:
        '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save template</button>',
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const n = w.querySelector('[name=name]').value.trim();
          if (!n) return UI.toast('Give it a name', 'bad');
          Store.save(PM2.toTemplate(p, n));
          UI.closeModal();
          UI.toast(`Template "${n}" saved`, 'good');
        };
      },
    });
  },
  pickTemplate() {
    const l = PM2.templates();
    if (!l.length)
      return UI.toast(PM2.canTemplate() ? 'No templates yet — open a project and press "Save as template"' : 'No templates yet', 'warn');
    UI.modal({
      title: 'New project from a template',
      wide: true,
      body: l
        .map(
          t =>
            `<div class="li"><div class="grow"><b>${h(t.name)}</b><div class="muted small">${(t.phases || []).length} phases & milestones · ${(t.tasks || []).length} tasks · ${t.mode === 'scrum' ? 'Scrum' : 'Kanban'}${t.category ? ' · ' + h(t.category) : ''}</div></div><button class="btn sm primary" data-tpuse="${h(t.id)}">Use</button>${PM2.canTemplate() ? ` <button class="btn sm ghost" data-tpdel="${h(t.id)}" title="Delete the template">✕</button>` : ''}</div>`
        )
        .join(''),
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button>',
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelectorAll('[data-tpdel]').forEach(
          b =>
            (b.onclick = () => {
              const t = Store.get(b.dataset.tpdel);
              UI.confirm(`Delete the template "${t.name}"? Projects made from it are not touched.`, () => {
                Store.save(Object.assign({}, t, { _del: true }));
                UI.toast('Template deleted');
              });
            })
        );
        w.querySelectorAll('[data-tpuse]').forEach(
          b =>
            (b.onclick = () => {
              const t = Store.get(b.dataset.tpuse);
              UI.closeModal();
              setTimeout(
                () =>
                  PM2V.newProject(
                    {
                      name: t.name,
                      mode: t.mode,
                      category: t.category,
                      description: t.description,
                      goal: t.goal,
                      outScope: t.outScope,
                      success: t.success,
                      template: t.id,
                      start: U.todayStr(),
                    },
                    p => {
                      const recs = PM2.fromTemplate(t, p.id, p.team, p.start || U.todayStr());
                      Store.saveMany(recs);
                      UI.toast(`${recs.length} phases and tasks added from "${t.name}"`, 'good');
                      location.hash = '#/project/' + p.id;
                    }
                  ),
                0
              );
            })
        );
      },
    });
  },

  /* ---------- baseline ---------- */
  setBaseline(p, reset) {
    const go = why => {
      const b = PM2.baseline(p);
      const log = [...(p.baselineLog || []), { on: U.todayStr(), by: App.me, why: why || (b ? 'reset' : 'first baseline') }];
      Store.save(
        Object.assign({}, Store.get(p.id), {
          baseline: { on: U.todayStr(), by: App.me, due: p.due || '', items: PM2.snap(p) },
          baselineLog: log,
        })
      );
      UI.toast(reset ? 'Baseline reset' : 'Baseline set — slipping dates will now show', 'good');
      App.render();
    };
    if (!reset) return go('');
    UI.modal({
      title: 'Reset the baseline',
      body: `<p class="muted small">The current dates become the new plan. Do this after an approved change, not to hide a delay — the reason is kept.</p><form class="grid-form">${UI.field({ key: 'why', label: 'Why?', type: 'text', span: 2, required: true, placeholder: 'e.g. scope change approved by the director' })}</form>`,
      actions:
        '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Reset baseline</button>',
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const v = w.querySelector('[name=why]').value.trim();
          if (!v) return UI.toast('Write the reason', 'bad');
          UI.closeModal();
          go(v);
        };
      },
    });
  },
  slipCard(p) {
    const s = PM2.slipSummary(p);
    const b = PM2.baseline(p);
    if (!s) return '';
    const msl = s.ms
      .map(
        x =>
          `<div class="small">◆ <b>${h(x.m.name)}</b>: planned ${U.fmtDate(b.items[x.m.id].e)} → now ${U.fmtDate(x.m.end)} <b class="${x.d > 0 ? 't-bad' : 't-good'}">(${x.d > 0 ? '+' : ''}${x.d} day${Math.abs(x.d) === 1 ? '' : 's'})</b></div>`
      )
      .join('');
    return card(
      'Against the baseline',
      `<div class="muted small">Baseline of ${U.fmtDate(b.on)} by ${h(Store.memberShort(b.by))}${(p.baselineLog || []).length > 1 ? ` · reset ${(p.baselineLog || []).length - 1}× (last: “${h(p.baselineLog[p.baselineLog.length - 1].why)}”)` : ''}</div>
      ${s.end ? `<div class="small">Target date: ${s.end > 0 ? `<b class="t-bad">+${s.end} days</b>` : `<b class="t-good">${s.end} days</b>`}</div>` : ''}
      ${msl || '<div class="small t-good">All milestones on their planned dates.</div>'}
      <div class="small">${s.tasks ? `<b class="t-bad">${s.tasks} task${s.tasks === 1 ? '' : 's'} slipped</b>, on average +${U.num(s.avg, 1)} days` : 'No task has slipped.'}</div>`
    );
  },

  /* ---------- close-out ---------- */
  closeOut(p) {
    p = Store.get(p.id) || p;
    const co = p.closeout || {};
    const openR = PM.raid(p.id).filter(r => r.status !== 'Closed');
    const openT = Scrum.items(p.id).filter(t => !Scrum.isDone(t) && t.status !== 'Canceled');
    const est = Scrum.items(p.id).reduce((s, t) => s + PM2.hrs(t.est), 0),
      act = Scrum.items(p.id).reduce((s, t) => s + PM2.hrs(t.actual), 0);
    const ss = PM2.slipSummary(p);
    UI.modal({
      title: '🏁 Close out — ' + p.name,
      wide: true,
      body: `<div class="muted small">Planned target ${U.fmtDate((PM2.baseline(p) || {}).due || p.due) || '–'} · finished ${U.fmtDate(p.doneDate || U.todayStr())}${ss && ss.end ? ` (${ss.end > 0 ? '+' : ''}${ss.end} days)` : ''}${est || act ? ` · hours: estimated ${U.num(est, 0)}, actual ${U.num(act, 0)}` : ''}</div>
      <form class="grid-form" id="cof">
        ${UI.field({ key: 'delivered', label: 'What was delivered', type: 'textarea', span: 2, rows: 2 }, co.delivered || '')}
        ${UI.field(
          {
            key: 'met',
            label: 'Success criteria met?',
            type: 'select',
            options: [
              ['yes', 'Yes'],
              ['partly', 'Partly'],
              ['no', 'No'],
            ],
            blank: false,
            hint: p.success ? 'Criteria: ' + p.success : '',
          },
          co.met || 'yes'
        )}
        ${UI.field({ key: 'impact', label: 'Impact (numbers if you have them)', type: 'text', placeholder: 'e.g. lab results 40% faster' }, co.impact || '')}
        ${UI.field({ key: 'wentWell', label: 'Lessons — what went well', type: 'textarea', span: 2, rows: 2 }, co.wentWell || '')}
        ${UI.field({ key: 'doBetter', label: 'Lessons — what to do differently next time', type: 'textarea', span: 2, rows: 2 }, co.doBetter || '')}
      </form>
      ${openR.length || openT.length ? `<label class="check"><input type="checkbox" id="coclose" checked> Close the ${openR.length ? `${openR.length} open risk/issue/action${openR.length === 1 ? '' : 's'}` : ''}${openR.length && openT.length ? ' and cancel the ' : ''}${openT.length ? `${openT.length} unfinished task${openT.length === 1 ? '' : 's'}` : ''}</label>` : ''}`,
      actions: `<span class="grow"></span><button class="btn" data-c>Later</button><button class="btn primary" data-ok>Close out the project</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const f = w.querySelector('#cof');
          const v = k => f.querySelector(`[name=${k}]`).value.trim();
          const recs = [
            Object.assign({}, Store.get(p.id), {
              status: 'Done',
              progress: 100,
              doneDate: p.doneDate || U.todayStr(),
              closeout: {
                on: U.todayStr(),
                by: App.me,
                delivered: v('delivered'),
                met: v('met'),
                impact: v('impact'),
                wentWell: v('wentWell'),
                doBetter: v('doBetter'),
                est,
                act,
              },
            }),
          ];
          const cc = w.querySelector('#coclose');
          if (cc && cc.checked)
            recs.push(
              ...openR.map(r => Object.assign({}, r, { status: 'Closed', closedOn: U.todayStr() })),
              ...openT.map(t => Object.assign({}, t, { status: 'Canceled' }))
            );
          Store.saveMany(recs);
          UI.closeModal();
          UI.toast('Project closed out 🏁', 'good');
          App.render();
        };
      },
    });
  },
  closeoutCard(p) {
    const c = p.closeout;
    if (!c || !c.on) return '';
    const sec = (l, v) => (v ? `<div class="pm-ch"><div class="muted small">${l}</div><div class="info-val">${h(v)}</div></div>` : '');
    return card(
      `🏁 Closed out ${U.fmtDate(c.on)}`,
      `<div class="small">Success criteria met: <b>${{ yes: 'Yes', partly: 'Partly', no: 'No' }[c.met] || '–'}</b>${c.impact ? ' · Impact: <b>' + h(c.impact) + '</b>' : ''}</div>${sec('Delivered', c.delivered)}${sec('What went well', c.wentWell)}${sec('Do differently next time', c.doBetter)}`,
      Scrum.planner(p) ? '<a href="#" class="link" data-coedit>Edit</a>' : ''
    );
  },
  lessonsCard(p) {
    if (PM2.closed(p)) return '';
    const l = PM2.similarLessons(p);
    if (!l.length) return '';
    return card(
      '💡 Lessons from similar projects',
      l
        .map(
          x =>
            `<div class="li"><div class="grow"><a class="link" href="#/project/${h(x.id)}"><b>${h(x.name)}</b></a> <span class="muted small">closed ${U.fmtDate(x.closeout.on)}</span>${x.closeout.doBetter ? `<div class="small">↻ ${h(x.closeout.doBetter)}</div>` : ''}${x.closeout.wentWell ? `<div class="small muted">✓ ${h(x.closeout.wentWell)}</div>` : ''}</div></div>`
        )
        .join('')
    );
  },
  lessons() {
    const q = U.lc(ps('lessons').q || '');
    let l = PM2.lessons();
    if (q)
      l = l.filter(p =>
        U.lc([p.name, p.category, p.closeout.wentWell, p.closeout.doBetter, p.closeout.impact, p.closeout.delivered].join(' ')).includes(q)
      );
    return `<div class="page-actions"><input id="lsq" placeholder="Search lessons…" value="${h(ps('lessons').q || '')}" style="min-width:260px"><span class="muted small">What closed projects learned — read it before starting a similar one.</span></div>
      ${l.length ? l.map(p => card(`<a class="link" href="#/project/${h(p.id)}">${h(p.name)}</a> <span class="muted small">${h(Store.teamName(p.team))}${p.category ? ' · ' + h(p.category) : ''} · closed ${U.fmtDate(p.closeout.on)}</span>`, `${p.closeout.impact ? `<div class="small">Impact: <b>${h(p.closeout.impact)}</b></div>` : ''}${p.closeout.wentWell ? `<div class="small">✓ ${h(p.closeout.wentWell)}</div>` : ''}${p.closeout.doBetter ? `<div class="small">↻ ${h(p.closeout.doBetter)}</div>` : ''}`)).join('') : empty(q ? 'No lessons match.' : 'No lessons yet — they are written when a project is closed out.')}`;
  },
  bindLessons(root) {
    const i = root.querySelector('#lsq');
    if (i)
      i.oninput = U.debounce(() => {
        ps('lessons').q = i.value;
        App.render();
        const n = document.querySelector('#lsq');
        if (n) {
          n.focus();
          n.setSelectionRange(n.value.length, n.value.length);
        }
      }, 300);
  },

  /* ---------- estimated vs actual (project → Reports) ---------- */
  hoursCard(items) {
    const l = items.filter(t => Scrum.isDone(t) && PM2.hrs(t.est) && PM2.hrs(t.actual));
    const est = items.reduce((s, t) => s + PM2.hrs(t.est), 0);
    if (!est && !l.length) return '';
    const e = l.reduce((s, t) => s + PM2.hrs(t.est), 0),
      a = l.reduce((s, t) => s + PM2.hrs(t.actual), 0);
    return card(
      'Estimated vs actual hours',
      `<div class="kpis k4">${UI.kpi('Estimated (all tasks)', U.num(est, 0) + 'h', '')}${UI.kpi('Done tasks: estimated', U.num(e, 0) + 'h', l.length + ' tasks with both')}${UI.kpi('Done tasks: actual', U.num(a, 0) + 'h', '')}${UI.kpi('Accuracy', e ? Math.round((100 * a) / e) + '%' : '–', a > e ? 'took longer than planned' : 'within the estimate', e && a / e > 1.25 ? 'sc-e' : 'sc-a')}</div>
      ${
        l.length
          ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>#</th><th>Task</th><th>Who</th><th class="num">Est. h</th><th class="num">Actual h</th><th class="num">Difference</th></tr></thead><tbody>${l
              .sort((x, y) => PM2.hrs(y.actual) - PM2.hrs(y.est) - (PM2.hrs(x.actual) - PM2.hrs(x.est)))
              .slice(0, 30)
              .map(t => {
                const d = PM2.hrs(t.actual) - PM2.hrs(t.est);
                return `<tr class="click" data-edit="ptask|${h(t.id)}"><td class="mono">${h(ptKey(t))}</td><td>${h(t.title)}</td><td>${h(Store.memberShort(t.assignee))}</td><td class="num">${PM2.hrs(t.est)}</td><td class="num">${PM2.hrs(t.actual)}</td><td class="num ${d > 0 ? 't-bad' : 't-good'}">${d > 0 ? '+' : ''}${U.num(d, 1)}</td></tr>`;
              })
              .join('')}</tbody></table></div>`
          : ''
      }`
    );
  },
};
