/* MAHAM — Task workflows on screen: the allowed moves on a task, transition screens, board drag that
 * follows the workflow (snaps back with the reason), the history on the task, notices to the person told. */
'use strict';

const TaskFlowUI = {
  /* move a task to a status (board drag / ◀ ▶): pick the transition, ask on a screen when it needs input */
  go(id, to) {
    const t = Store.get(id);
    if (!t) return;
    if (!Scrum.canWork(t) && !(Scrum.member(Scrum.proj(t.project)) && !t.assignee)) {
      UI.toast('Only the person assigned (or the manager) can move this', 'bad');
      return App.render();
    }
    const b = TaskFlow.board(Scrum.proj(t.project));
    const cat = b.byCat ? b.keys[b.cols.indexOf(to)] : null;
    if (cat && TaskFlow.cat(t) === cat) return App.render(); // dropped back in its own column
    const ms = cat ? TaskFlow.moves(t).filter(m => TaskFlow.catOf(t, m.tr.to) === cat) : TaskFlow.movesTo(t, to);
    if (!ms.length) {
      UI.toast(`Not allowed: no move from “${t.status}” to ${cat ? 'any ' + to + ' status' : '“' + to + '”'} in this workflow`, 'bad');
      return App.render();
    }
    const ok = ms.filter(m => m.ok);
    if (!ok.length) {
      UI.toast(`${ms[0].tr.name || to}: ${ms[0].why.join(', ')}`, 'bad');
      return App.render();
    }
    if (ok.length > 1) return TaskFlowUI.pick(t, ok);
    TaskFlowUI.start(t, ok[0].tr);
  },
  /* several transitions reach the same status → ask which */
  pick(t, ok) {
    UI.modal({
      title: `${ptKey(t)} — which move?`,
      body: `<div class="li-list">${ok.map(m => `<button class="btn" data-tfp="${h(m.tr.id)}">${h(m.tr.name || m.tr.to)} → ${h(m.tr.to)}</button>`).join(' ')}</div>`,
      onMount(w) {
        w.querySelectorAll('[data-tfp]').forEach(
          b =>
            (b.onclick = () => {
              UI.closeModal();
              TaskFlowUI.start(t, ok.find(m => m.tr.id === b.dataset.tfp).tr);
            })
        );
      },
    });
    App.render();
  },
  /* needs a screen? (fields to ask, or a validator the person can fix there) */
  needsScreen(t, tr) {
    return (
      (tr.screen || []).length > 0 ||
      (tr.valid || []).some(
        v =>
          v.k === 'comment' ||
          (v.k === 'field' &&
            (['due', 'points', 'assignee', 'actual', 'resolution'].includes(v.field) || /^cf_/.test(v.field)) &&
            TaskFlow.validFail(v, t, {}))
      )
    );
  },
  start(t, tr) {
    if (TaskFlowUI.needsScreen(t, tr)) return TaskFlowUI.screen(t, tr);
    const err = TaskFlow.run(t, tr.id, {});
    if (err === 'pending') UI.toast(`Sent for approval — ${tr.name || tr.to}`, 'good');
    else if (err) UI.toast(err, 'bad');
    else TaskFlowUI.done(t, tr);
    App.render();
  },
  done(t, tr) {
    UI.toast(`${ptKey(t)} → ${tr.to}${Scrum.isDone(Store.get(t.id)) ? ' ✓' : ''}`, 'good');
  },
  /* the transition screen */
  screen(t, tr) {
    const p = Scrum.proj(t.project);
    const sc = new Set(tr.screen || []);
    for (const v of tr.valid || []) {
      if (v.k === 'comment') sc.add('comment');
      if (v.k === 'field' && TaskFlow.SCREEN.some(x => x[0] === v.field)) sc.add(v.field);
    }
    if (TaskFlow.catOf(t, tr.to) === 'done' && !(tr.post || []).some(a => a.k === 'resolution')) sc.add('resolution');
    const F = {
      resolution: { key: 'resolution', label: 'Resolution', type: 'select', options: TaskFlow.resolutions(), blank: false },
      comment: {
        key: 'comment',
        label: 'Comment',
        type: 'textarea',
        rows: 3,
        span: 2,
        required: (tr.valid || []).some(v => v.k === 'comment'),
      },
      assignee: {
        key: 'assignee',
        label: 'Assigned to',
        type: 'select',
        options: p ? Scrum.people(p).map(id => [id, Store.memberName(id)]) : [],
        blank: 'Unassigned',
      },
      due: { key: 'due', label: 'Due date', type: 'date' },
      points: { key: 'points', label: 'Story points', type: 'select', options: Scrum.POINTS.map(String), blank: false },
      actual: { key: 'actual', label: 'Actual hours', type: 'number', min: 0, step: 0.5 },
    };
    for (const k of sc)
      if (!F[k] && /^cf_/.test(k)) {
        const d = Work.def(k, p ? Scrum.teamOf(p) : undefined);
        if (d) F[k] = Work.ui(d, { required: (tr.valid || []).some(v => v.k === 'field' && v.field === k) });
      }
    const order = TaskFlow.SCREEN.map(x => x[0]).filter(k => sc.has(k) && F[k]);
    const rules = (tr.valid || [])
      .map(v =>
        TaskFlow.validFail(v, t, {}) && v.k !== 'comment' && !(v.k === 'field' && sc.has(v.field))
          ? `<li>${h(TaskFlow.validFail(v, t, {}))}</li>`
          : ''
      )
      .join('');
    UI.modal({
      title: `${tr.name || tr.to} — ${ptKey(t)} ${t.title}`,
      body: `<p class="muted small">${h(t.status || '—')} → <b>${h(tr.to)}</b></p>${rules ? `<div class="insights warnbox"><div>Before this move:<ul>${rules}</ul></div></div>` : ''}<form class="grid-form" id="tfscr">${order.map(k => UI.field(F[k], k === 'comment' ? '' : k === 'resolution' ? t.resolution || TaskFlow.resolutions()[0] : t[k])).join('')}</form><div id="tferr" class="t-bad small"></div>`,
      actions: `<button class="btn" data-close2>Cancel</button><button class="btn primary" id="tfgo">${h(tr.name || tr.to)}</button>`,
      onMount(w) {
        w.querySelector('[data-close2]').onclick = () => {
          UI.closeModal();
          App.render();
        };
        w.querySelector('#tfgo').onclick = () => {
          const form = Object.fromEntries(new FormData(w.querySelector('#tfscr')));
          const err = TaskFlow.run(Store.get(t.id), tr.id, form);
          if (err && err !== 'pending') {
            w.querySelector('#tferr').textContent = err;
            return;
          }
          UI.closeModal();
          if (err === 'pending') UI.toast(`Sent for approval — ${tr.name || tr.to}`, 'good');
          else TaskFlowUI.done(t, tr);
          App.render();
        };
      },
    });
  },
  /* the buttons on a task: allowed moves (planners and the assignee); blocked ones show why on hover */
  buttons(t, max) {
    if (t.pending) return '';
    const ms = TaskFlow.moves(t);
    const ok = ms.filter(m => m.ok);
    return ok
      .slice(0, max || 9)
      .map(
        m =>
          `<button class="btn xs ${TaskFlow.catOf(t, m.tr.to) === 'done' ? 'primary' : ''}" data-tfrun="${h(t.id)}|${h(m.tr.id)}" title="→ ${h(m.tr.to)}">${h(m.tr.name || m.tr.to)}</button>`
      )
      .join('');
  },
  bind(root) {
    root.querySelectorAll('[data-tfrun]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          e.preventDefault();
          const [id, trId] = b.dataset.tfrun.split('|');
          const t = Store.get(id);
          const m = t && TaskFlow.moves(t).find(x => x.tr.id === trId);
          if (!m) return;
          if (!m.ok) return UI.toast(m.why.join(', '), 'bad');
          const keep = document.querySelector('#modal .ptx') ? null : 1;
          if (!keep) UI.closeModal();
          TaskFlowUI.start(t, m.tr);
        })
    );
  },
  /* on the open task form: the moves + history */
  panel(t) {
    if (!t || !t.id) return '';
    const ms = TaskFlow.moves(t);
    const w = TaskFlow.forTask(t);
    const can = Scrum.canWork(t) || (Scrum.member(Scrum.proj(t.project)) && !t.assignee);
    const hist = (t.hist || []).slice(-8).reverse();
    return `<h4 class="act-h">Workflow <span class="muted small">· ${h(w.name)}</span></h4>
      <p class="small"><span class="tf-st" style="--c:${h(TaskFlow.color(t))}">${h(t.status || '—')}</span>${t.resolution ? ` <span class="muted">· Resolution: <b>${h(t.resolution)}</b></span>` : ''}</p>
      ${can && ms.length ? `<div class="row-btns tight">${ms.map(m => (m.ok ? `<button class="btn xs ${TaskFlow.catOf(t, m.tr.to) === 'done' ? 'primary' : ''}" data-tfrun="${h(t.id)}|${h(m.tr.id)}">${h(m.tr.name || m.tr.to)} → ${h(m.tr.to)}</button>` : `<button class="btn xs ghost" disabled title="${h(m.why.join(', '))}">${h(m.tr.name || m.tr.to)} 🔒</button>`)).join('')}</div>` : ''}
      ${hist.length ? `<div class="tf-hist small">${hist.map(x => `<div><span class="muted">${h(U.fmtDate(U.ds(new Date(x.at))))}</span> ${h(Store.memberShort(x.by))}: ${h(x.from || '—')} → <b>${h(x.to)}</b>${x.tr && x.tr !== x.to ? ` <span class="muted">(${h(x.tr)})</span>` : ''}${x.note ? ` — <i>${h(x.note)}</i>` : ''}</div>`).join('')}</div>` : ''}`;
  },
  /* notices for me: someone moved a task and the workflow said to tell me */
  mine() {
    return Store.all('nudge')
      .filter(n => n.kind === 'flow' && App.forMe(n.to) && !LS.get('bct.nudgeok.' + n.id, false))
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  },
  noticeCard() {
    const l = TaskFlowUI.mine();
    if (!l.length) return '';
    return `<div class="insights" id="tfnotes"><div>⇄ <b>Task updates for you</b>${l
      .slice(0, 6)
      .map(n => {
        const t = Store.get(n.about);
        return `<div class="small">${h(Store.memberShort(n.from))}: ${t ? `<a href="#" data-edit="ptask|${h(t.id)}">${h(n.text)}</a>` : h(n.text)} <button class="btn xs ghost" data-tfok="${h(n.id)}">OK</button></div>`;
      })
      .join('')}</div></div>`;
  },
  bindNotes(root) {
    root.querySelectorAll('[data-tfok]').forEach(
      b =>
        (b.onclick = e => {
          e.preventDefault();
          LS.set('bct.nudgeok.' + b.dataset.tfok, true);
          App.render();
        })
    );
  },
};

/* the board: ◀ ▶ and drag follow the workflow */
moveItem = function (id, to) {
  TaskFlowUI.go(id, to);
};  

/* cards: with a real workflow, the ◀ ▶ buttons become the allowed moves */
(function wireCards() {
  const old = ptCard;
  ptCard = function (t, p, opts) {
     
    let html = old(t, p, opts);
    const w = TaskFlow.forTask(t);
    const b = TaskFlow.board(p);
    if (b.byCat)
      html = html.replace(
        '<div class="pc-title">',
        `<div class="pc-stat"><span class="tf-st sm" style="--c:${h(TaskFlow.color(t))}">${h(t.status || '—')}</span></div><div class="pc-title">`
      );
    if ((w.simple && !b.byCat) || !Scrum.canWork(t)) return html;
    return html
      .replace(/<button class="btn xs[^"]*" data-mv="[^"]*"[^>]*>.*?<\/button>/g, '')
      .replace(/<\/div><\/div>$/, `${TaskFlowUI.buttons(t, 2)}</div></div>`);
  };
  const ob = bindScrum;
  bindScrum = function (root) {
    ob(root);
    TaskFlowUI.bind(root);
  };  
})();

/* the task form: workflow box under the checklist / comments */
(function wireForm() {
  const S = Schemas.ptask;
  const om = S.onFormMount;
  S.onFormMount = (form, base) => {
    if (om) om(form, base);
    if (!base || !base.id) return;
    const box = document.createElement('div');
    box.className = 'tfx';
    box.innerHTML = TaskFlowUI.panel(base);
    const after = form.parentNode.querySelector('.ptx') || form;
    after.parentNode.insertBefore(box, after.nextSibling);
    TaskFlowUI.bind(box);
  };
})();

/* notices on Home and on the project page */
(function wireNotes() {
  for (const k of ['home', 'project']) {
    const o = P[k];
    if (!o) continue;
    P[k] = function (...a) {
      const pg = o.apply(this, a);
      const n = TaskFlowUI.noticeCard();
      if (!n || !pg || !pg.html) return pg;
      const m = pg.mount;
      return Object.assign({}, pg, {
        html: n + pg.html,
        mount(root) {
          if (m) m.call(this, root);
          TaskFlowUI.bindNotes(root);
        },
      });
    };
  }
})();
