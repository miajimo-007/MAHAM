/* MAHAM — Work items on screen: the Epics tab, epic / approval badges on cards, approvals (on the task, on
 * Home and the desks), submitting a request to another team's project, and "My requests". */
'use strict';

const WorkUI = {
  /* ---------- the Epics tab ---------- */
  epics(p, ctx) {
    const es = Work.epics(p.id);
    const loose = Scrum.items(p.id).filter(t => !Work.isEpic(t) && !t.epic && !t.parent && t.status !== 'Canceled');
    const canAddEpic = ctx.plan && Work.typesFor(p).includes('Epic');
    const row = t =>
      `<div class="li click" data-edit="ptask|${h(t.id)}"><span class="mono small muted">${h(Work.key(t))}</span> <span class="pc-type">${typeIcon(t.type)}</span> ${h(t.title)}<span class="grow"></span><span class="tf-st sm" style="--c:${h(TaskFlow.color(t))}">${h(t.status)}</span>${t.assignee ? ` <span class="small muted">${h(Store.memberShort(t.assignee))}</span>` : ''}</div>`;
    return `<div class="page-actions"><span class="muted small">An <b>epic</b> is a large piece of work (e.g. "Pharmacy inventory dashboard"). Stories, tasks and bugs belong to it; its progress comes from them.</span><span class="grow"></span>${canAddEpic ? '<button class="btn primary" id="addepic">＋ Epic</button>' : ''}</div>
      ${
        es.length
          ? es
              .map(e => {
                const g = Work.epicProgress(e);
                const ch = Work.children(e).sort((a, b) => Scrum.colIndex(a) - Scrum.colIndex(b) || (a.n || 0) - (b.n || 0));
                return card(
                  `<span class="ep-key">◈ ${h(Work.key(e))}</span> ${h(e.title)} <span class="tf-st sm" style="--c:${h(TaskFlow.color(e))}">${h(e.status)}</span>`,
                  `<div class="ep-bar">${UI.bar(g.pct)}<span class="small muted">${g.pct}% · ${g.done}/${g.n} items${g.pts ? ` · ${g.donePts}/${g.pts} points` : ''}${e.due ? ' · target ' + U.fmtDate(e.due) : ''}</span></div>
          <div class="li-list">${ch.map(row).join('') || '<p class="muted small">Nothing in this epic yet.</p>'}</div>`,
                  ctx.canAdd
                    ? `<span class="row-btns tight"><button class="btn xs" data-epadd="${h(e.id)}">＋ Item</button><button class="btn xs ghost" data-edit="ptask|${h(e.id)}">Edit</button></span>`
                    : ''
                );
              })
              .join('')
          : empty(
              canAddEpic
                ? 'No epics yet. Add one, then link stories, tasks and bugs to it (the "Epic" field on each item).'
                : 'No epics in this project.'
            )
      }
      ${loose.length && es.length ? card(`Not in an epic <span class="count">${loose.length}</span>`, `<div class="li-list">${loose.slice(0, 40).map(row).join('')}</div>`) : ''}`;
  },
  bindEpics(root, p) {
    const a = root.querySelector('#addepic');
    if (a) a.onclick = () => UI.editRecord('ptask', { project: p.id, team: p.team, type: 'Epic', points: 0 });
    root.querySelectorAll('[data-epadd]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          UI.editRecord('ptask', {
            project: p.id,
            team: p.team,
            epic: b.dataset.epadd,
            type: Work.typesFor(p).find(x => x !== 'Epic') || 'Task',
            assignee: Scrum.planner(p) ? '' : App.me,
          });
        })
    );
  },

  /* ---------- approvals ---------- */
  pendingBox(t) {
    const pd = t.pending;
    const tr = pd && TaskFlow.forTask(t).trs.find(x => x.id === pd.tr);
    const hist = (t.approvals || []).slice(-5).reverse();
    if (!pd && !hist.length) return '';
    const mine = pd && tr && TaskFlow.approver(t, tr);
    return `<div class="tf-appr">${
      pd
        ? `<div class="insights warnbox"><div>⏳ <b>Waiting approval</b>: ${h(pd.trName)} → <b>${h(pd.to)}</b> · asked by ${h(Store.memberShort(pd.by))} ${h(U.fmtDate(U.ds(new Date(pd.at))))}${tr ? ` · approver: ${h(TaskFlow.approvers(t, tr).map(Store.memberShort).join(', ') || (tr.approve || []).map(c => TaskFlow.APPROVE[c.k]).join(' / '))}` : ''}
        ${mine ? `<div class="row-btns tight" style="margin-top:6px"><input id="apnote-${h(t.id)}" placeholder="note (optional)" style="min-width:200px"><button class="btn xs primary" data-apok="${h(t.id)}">✓ Approve</button><button class="btn xs" data-apno="${h(t.id)}">✕ Refuse</button></div>` : ''}</div></div>`
        : ''
    }
      ${hist.length ? `<div class="small muted">${hist.map(a => `${a.ok ? '✓ Approved' : '✕ Refused'} “${h(a.trName)}” by ${h(Store.memberShort(a.by))} · ${h(U.fmtDate(U.ds(new Date(a.at))))}${a.note ? ' — ' + h(a.note) : ''}`).join('<br>')}</div>` : ''}</div>`;
  },
  bindApprovals(root) {
    const go = (id, ok) => {
      const t = Store.get(id);
      const n = root.querySelector('#apnote-' + CSS.escape(id));
      const note = n ? n.value.trim() : '';
      if (!ok && !note) {
        UI.toast('Write why it is refused', 'bad');
        if (n) n.focus();
        return;
      }
      const err = TaskFlow.decide(t, ok, note);
      if (err) return UI.toast(err, 'bad');
      UI.toast(ok ? 'Approved — moved on' : 'Refused', 'good');
      if (document.querySelector('#modal')) UI.closeModal();
      App.render();
    };
    root.querySelectorAll('[data-apok]').forEach(
      b =>
        (b.onclick = e => {
          e.preventDefault();
          e.stopPropagation();
          go(b.dataset.apok, true);
        })
    );
    root.querySelectorAll('[data-apno]').forEach(
      b =>
        (b.onclick = e => {
          e.preventDefault();
          e.stopPropagation();
          go(b.dataset.apno, false);
        })
    );
  },
  approvalCard() {
    const l = TaskFlow.toApprove();
    if (!l.length) return '';
    return card(
      `⏳ Approvals for you <span class="count">${l.length}</span>`,
      l
        .slice(0, 10)
        .map(
          t =>
            `<div class="li"><span class="grow"><a href="#" data-edit="ptask|${h(t.id)}"><span class="mono small">${h(Work.key(t))}</span> ${h(t.title)}</a> <span class="muted small">· ${h((Scrum.proj(t.project) || {}).name || '')} · ${h(t.pending.trName)} → ${h(t.pending.to)} · asked by ${h(Store.memberShort(t.pending.by))}</span></span><button class="btn xs primary" data-apok="${h(t.id)}">✓ Approve</button><button class="btn xs" data-apno="${h(t.id)}">✕ Refuse</button><input id="apnote-${h(t.id)}" placeholder="note" style="width:120px"></div>`
        )
        .join('')
    );
  },

  /* ---------- requests to other teams ---------- */
  submitDialog(pid) {
    const ps = Work.intakeProjects();
    if (!ps.length) return UI.toast('No project takes requests yet — a project owner can turn it on in the project form', 'bad');
    const p0 = Store.get(pid) || ps[0];
    const draw =
      p => `<form class="grid-form" id="rqf">${UI.field({ key: 'project', label: 'To project', type: 'select', options: ps.map(x => [x.id, `${x.name} · ${Store.teamName(x.team)}`]), blank: false }, p.id)}${UI.field({ key: 'type', label: 'Type', type: 'select', options: Work.typesFor(p).filter(x => x !== 'Epic'), blank: false }, Work.typesFor(p).includes('Story') ? 'Story' : '')}
      ${UI.field({ key: 'title', label: 'What is needed', type: 'text', required: true, span: 2, placeholder: 'e.g. Medication scanning compliance report' })}${UI.field({ key: 'description', label: 'Details / why', type: 'textarea', span: 2, rows: 4 })}
      ${UI.field({ key: 'requester', label: 'Requested by (department / person)', type: 'text', placeholder: 'e.g. Pharmacy — Dr. …' })}${UI.field({ key: 'priority', label: 'Priority', type: 'select', options: ['High', 'Medium', 'Normal', 'Low'], blank: false }, 'Normal')}
      ${Work.custom(Scrum.teamOf(p))
        .filter(f => Work.appliesTo(f, 'Story') || Work.required(f, 'Story'))
        .map(f => UI.field(Work.ui(f, { required: Work.required(f, 'Story') })))
        .join('')}</form><p class="muted small">No patient names or MRNs — describe the need, not the patient.</p>`;
    UI.modal({
      title: '📨 Submit a request',
      wide: true,
      body: `<div id="rqbox">${draw(p0)}</div>`,
      actions: '<button class="btn primary" id="rqgo">Submit</button>',
      onMount(w) {
        const wire = () => {
          w.querySelector('#rqf [name=project]').onchange = e => {
            w.querySelector('#rqbox').innerHTML = draw(Store.get(e.target.value));
            wire();
          };
        };
        wire();
        w.querySelector('#rqgo').onclick = () => {
          const f = Object.fromEntries(new FormData(w.querySelector('#rqf')));
          const p = Store.get(f.project);
          if (!String(f.title || '').trim()) return UI.toast('Write what is needed', 'bad');
          const miss = Work.custom(Scrum.teamOf(p)).filter(c => Work.required(c, f.type) && !f[c.key]);
          if (miss.length) return UI.toast('Fill in ' + miss.map(c => c.label).join(', '), 'bad');
          const r = Work.submit(p, f);
          UI.closeModal();
          UI.toast(`Sent: ${Work.key(r)} in ${p.name}`, 'good');
          App.render();
        };
      },
    });
  },
  myRequestsCard() {
    const l = Work.myRequests();
    if (!l.length) return '';
    return card(
      `📨 My requests <span class="count">${l.filter(t => !Scrum.isDone(t)).length} open</span>`,
      `<table class="tbl"><thead><tr><th>Key</th><th>Request</th><th>Project</th><th>Status</th><th>With</th></tr></thead><tbody>${l
        .slice(0, 15)
        .map(
          t =>
            `<tr><td class="mono small">${h(Work.key(t))}</td><td>${h(t.title)}</td><td class="small">${h((Store.get(t.project) || {}).name || '')}</td><td><span class="tf-st sm" style="--c:${h(TaskFlow.color(t))}">${h(t.status)}</span>${t.resolution ? ` <span class="small muted">${h(t.resolution)}</span>` : ''}</td><td class="small">${h(t.assignee ? Store.memberShort(t.assignee) : '—')}</td></tr>`
        )
        .join('')}</tbody></table>`
    );
  },
};

/* ---------- wiring ---------- */
(function wire() {
  // cards: epic + approval badges
  PT_CARD.decorate.push((html, t) => {
    const e = t.epic && Store.get(t.epic);
    const b = `${Work.isEpic(t) ? '<span class="pc-b ep">◈ Epic</span>' : ''}${e ? `<span class="pc-b ep" title="${h(e.title)}">◈ ${h(e.title.length > 18 ? e.title.slice(0, 18) + '…' : e.title)}</span>` : ''}${t.pending ? '<span class="pc-b warn" title="Waiting approval">⏳ approval</span>' : ''}${t.intake ? `<span class="pc-b" title="Request${t.requester ? ' from ' + h(t.requester) : ''}">📨</span>` : ''}`;
    return b ? html.replace('<div class="pc-foot">', `<div class="pc-badges">${b}</div><div class="pc-foot">`) : html;
  });
  PT_CARD.bind.push(root => WorkUI.bindApprovals(root));
  // the task form: approval box + custom field values are already fields
  Schemas.extend('ptask', {
    name: 'approval box',
    mount(form, base) {
      if (!base || !base.id) return;
      const x = WorkUI.pendingBox(Store.get(base.id) || base);
      if (!x) return;
      const box = document.createElement('div');
      box.innerHTML = x;
      const tf = form.parentNode.querySelector('.tfx') || form;
      tf.parentNode.insertBefore(box, tf);
      WorkUI.bindApprovals(box);
    },
  });
  // the project page: Epics tab buttons; overdue automation when the owner looks
  const pp = P.project;
  P.project = function (pid) {
    const pg = pp.apply(this, arguments);
    const p = Store.get(pid);
    if (!p || !pg || !pg.mount) return pg;
    try {
      Work.sweep();
    } catch (e) {
      /* */
    }
    const m = pg.mount;
    return Object.assign({}, pg, {
      mount(root) {
        m.call(this, root);
        WorkUI.bindEpics(root, p);
      },
    });
  };
  // Home and the Manager desk: approvals for me + my requests
  for (const k of ['home', 'manager']) {
    const o = P[k];
    if (!o) continue;
    P[k] = function (...a) {
      const pg = o.apply(this, a);
      if (!pg || !pg.html) return pg;
      try {
        if (k === 'home' || k === 'manager') Work.sweep();
      } catch (e) {
        /* */
      }
      const add = WorkUI.approvalCard();
      if (!add) return pg;
      const m = pg.mount;
      return Object.assign({}, pg, {
        html: add + pg.html,
        mount(root) {
          if (m) m.call(this, root);
          WorkUI.bindApprovals(root);
        },
      });
    };
  }
  // the Projects page: submit a request + my requests
  const pj = P.projects;
  if (pj)
    P.projects = function (...a) {
      const pg = pj.apply(this, a);
      if (!pg || !pg.html) return pg;
      const btn = `<div class="page-actions"><button class="btn" id="rqnew">📨 Submit a request</button><a class="btn ghost" href="#/workdash">📊 Work dashboard</a></div>`;
      const m = pg.mount;
      return Object.assign({}, pg, {
        html: btn + WorkUI.myRequestsCard() + pg.html,
        mount(root) {
          if (m) m.call(this, root);
          const b = root.querySelector('#rqnew');
          if (b) b.onclick = () => WorkUI.submitDialog();
        },
      });
    };
})();
