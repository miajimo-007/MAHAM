/* MAHAM — Scrum the Scrum Guide (2020) way, on top of MAHAM's Scrum projects:
 *   Roles          project.po (Product owner), project.sm (Scrum master) — optional, the owner by default
 *   Sprint length  project.sprintDays (7 / 14 / 21 / 28) — the next sprint is suggested with it
 *   Backlog order  ptask.rank — planners drag rows in the Backlog; the top is the most important
 *   Capacity       planned points of a sprint against the average velocity (Backlog → sprint header)
 *   Daily          "📅 Daily" on the sprint board: per person, what moved since the last working day, in progress, waiting
 *   Review & retro on Complete sprint: sprint.review, sprint.retro { well, improve, actions[] } (actions → my personal tasks)
 *   Definition of Done  project.dod (one line each): finishing a task asks to confirm it (ptask.dodOk); the task form has
 *                  "Definition of Done is met" and will not save a finished task without it. Reopening clears it. */
'use strict';

const ScrumUI = {
  dod(p) {
    return String((p && p.dod) || '')
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean);
  },
  avgVelocity(pid) {
    const items = Scrum.items(pid);
    const done = Scrum.sprints(pid).filter(s => s.status === 'Completed');
    const v = done.map(s => (s.donePoints != null ? s.donePoints : Scrum.pts(items.filter(t => t.sprint === s.id && Scrum.isDone(t)))));
    return v.length ? U.avg(v) : null;
  },
  /* the sprint group header in the Backlog: planned points vs capacity */
  capacity(pid, sprint, its) {
    if (!sprint || !sprint.id || sprint.id === '*' || sprint.status === 'Completed') return '';
    const avg = ScrumUI.avgVelocity(pid);
    if (avg == null) return '<span class="muted small">· capacity: complete a sprint to know your velocity</span>';
    const pts = Scrum.pts(its);
    const over = pts > avg * 1.1;
    return `<span class="small ${over ? 't-bad strong' : 'muted'}" title="Average points done per sprint">· ${pts} planned / capacity ≈ ${U.num(avg, 0)}${over ? ' — more than the team usually finishes' : ''}</span>`;
  },
  rank(t) {
    return t && t.rank != null ? +t.rank : 1e12 + (t.n || 0);
  },
  /* drag to reorder backlog rows (planners): the moved task gets a rank between its new neighbours */
  bindOrder(root, p) {
    if (!Scrum.planner(p)) return;
    let from = null;
    root.querySelectorAll('[data-bkrow]').forEach(r => {
      r.addEventListener('dragstart', e => {
        from = r.dataset.bkrow;
        e.dataTransfer.setData('text/plain', 'bk');
        r.classList.add('dragging');
      });
      r.addEventListener('dragover', e => {
        if (from) {
          e.preventDefault();
          r.classList.add('bk-over');
        }
      });
      r.addEventListener('dragleave', () => r.classList.remove('bk-over'));
      r.addEventListener('drop', e => {
        e.preventDefault();
        r.classList.remove('bk-over');
        const to = r.dataset.bkrow;
        if (!from || from === to) return;
        const list = [...r.parentNode.querySelectorAll('[data-bkrow]')].map(x => x.dataset.bkrow).filter(id => id !== from);
        const at = list.indexOf(to);
        const rk = id => ScrumUI.rank(Store.get(id));
        const before = at > 0 ? rk(list[at - 1]) : null,
          after = rk(to);
        const recs = [];
        let newRank;
        if (before == null) newRank = after - 1024;
        else if (after - before > 1e-6) newRank = (before + after) / 2;
        else {
          list.splice(at, 0, from);
          list.forEach((id, i) => {
            const t = Store.get(id);
            if (t) recs.push(Object.assign({}, t, { rank: (i + 1) * 1024 }));
          });
        }
        if (!recs.length) {
          const t = Store.get(from);
          recs.push(Object.assign({}, t, { rank: newRank }));
        }
        // ranks above 1e12 are "not ordered yet": give every row of this list a real rank the first time
        if (list.some(id => rk(id) >= 1e12) && recs.length === 1) {
          const all = list.slice();
          all.splice(at, 0, from);
          recs.length = 0;
          all.forEach((id, i) => {
            const t = Store.get(id);
            if (t) recs.push(Object.assign({}, t, { rank: (i + 1) * 1024 }));
          });
        }
        from = null;
        Store.saveMany(recs);
        App.render();
      });
    });
  },
  /* ---------- the Daily view ---------- */
  lastWorkday() {
    let d = U.addDays(U.todayStr(), -1);
    for (let i = 0; i < 10 && U.isOff(d); i++) d = U.addDays(d, -1);
    return d;
  },
  daily(p, items) {
    const since = Date.parse(ScrumUI.lastWorkday() + 'T00:00:00');
    const ppl = [...new Set([...Scrum.people(p), ...items.map(t => t.assignee).filter(Boolean)])];
    const row = t =>
      `<div class="li click" data-edit="ptask|${h(t.id)}"><span class="muted small mono">${h(ptKey(t))}</span><span class="grow">${h(t.title)}</span>${typeof LanesUI !== 'undefined' ? LanesUI.chip(t) : h(t.status)}</div>`;
    const blocks = ppl
      .map(id => {
        const mine = items.filter(t => t.assignee === id);
        const moved = mine.filter(t => (t.hist || []).some(x => x.at >= since && x.by === id && x.from !== x.to));
        const doing = mine.filter(t => !Scrum.isDone(t) && TaskFlow.cat(t) === 'doing' && !moved.includes(t));
        const waiting = mine.filter(t => !Scrum.isDone(t) && (TaskFlow.cat(t) === 'wait' || t.pending));
        if (!moved.length && !doing.length && !waiting.length) return '';
        return card(
          `${h(Store.memberShort(id))}`,
          `${moved.length ? `<div class="mw-h">Moved since ${h(U.fmtDate(ScrumUI.lastWorkday()))} <span class="count">${moved.length}</span></div>${moved.map(row).join('')}` : ''}${doing.length ? `<div class="mw-h">Working on <span class="count">${doing.length}</span></div>${doing.map(row).join('')}` : ''}${waiting.length ? `<div class="mw-h">⚠ Waiting / blocked <span class="count">${waiting.length}</span></div>${waiting.map(row).join('')}` : ''}`
        );
      })
      .join('');
    return `<p class="muted small">The Daily Scrum in 15 minutes: what each person moved since the last working day, what they work on now, and what waits.</p><div class="cols2">${blocks || empty('Nothing moved or in progress in this sprint.')}</div>`;
  },
  /* ---------- review + retrospective, kept with the sprint ---------- */
  retroFields(sp) {
    const r = (sp && sp.retro) || {};
    return `<h4 class="act-h">Sprint review</h4>${UI.field({ key: 'review', label: 'What was shown, and the feedback', type: 'textarea', rows: 2, span: 2 }, (sp && sp.review) || '')}
      <h4 class="act-h">Retrospective</h4>${UI.field({ key: 'well', label: 'What went well', type: 'textarea', rows: 2 }, r.well || '')}${UI.field({ key: 'improve', label: 'What to improve', type: 'textarea', rows: 2 }, r.improve || '')}
      ${UI.field({ key: 'actions', label: 'Actions for the next sprint (one per line)', type: 'textarea', rows: 2, span: 2 }, (r.actions || []).join('\n'))}
      ${UI.field({ key: 'mine', label: 'Also add the actions to my personal tasks', type: 'bool', checkLabel: 'Also add the actions to my personal tasks', span: 2 }, false)}`;
  },
  readRetro(w) {
    const v = n => ((w.querySelector(`[name=${n}]`) || {}).value || '').trim();
    const actions = v('actions')
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean);
    const mine = !!(w.querySelector('[name=mine]') || {}).checked;
    return { review: v('review'), retro: { well: v('well'), improve: v('improve'), actions }, mine };
  },
  retroRecs(sp, x) {
    if (!x.mine || !x.retro.actions.length) return [];
    return x.retro.actions.map((a, i) => ({
      c: 'mytask',
      id: `mytask-${App.me}-${Date.now().toString(36)}r${i}`,
      owner: App.me,
      title: a.slice(0, 200),
      plan: U.todayStr(),
      status: 'Open',
      priority: 'Normal',
      note: `From the retrospective of ${sp.name}`,
    }));
  },
  retroView(sp) {
    const r = sp.retro || {};
    if (!sp.review && !r.well && !r.improve && !(r.actions || []).length) return '';
    const p = (l, v) => (v ? `<div class="small"><b>${l}:</b> ${h(v)}</div>` : '');
    return `${p('Review', sp.review)}${p('Went well', r.well)}${p('To improve', r.improve)}${(r.actions || []).length ? `<div class="small"><b>Actions:</b> ${r.actions.map(h).join(' · ')}</div>` : ''}`;
  },
  /* ---------- Definition of Done ---------- */
  /* finishing a task (board / ◀ ▶ / move buttons): confirm the project's Definition of Done first → true when it asked */
  dodGate(t, tr, go) {
    const p = Scrum.proj(t.project);
    const dod = ScrumUI.dod(p);
    if (!dod.length || t.dodOk || TaskFlow.catOf(t, tr.to) !== 'done') return false;
    UI.modal({
      title: `Definition of Done — ${ptKey(t)}`,
      body: `<p class="muted small">${h(p.name)}: before a task counts as done, all of these must be true.</p><div class="li-list">${dod.map((d, i) => `<label class="li check"><input type="checkbox" data-dod="${i}"> <span class="grow">${h(d)}</span></label>`).join('')}</div><div id="doderr" class="t-bad small"></div>`,
      actions:
        '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-dodok>Done — all of these are met</button>',
      onMount: w => {
        w.querySelector('[data-c]').onclick = () => {
          UI.closeModal();
          App.render();
        };
        w.querySelector('[data-dodok]').onclick = () => {
          if ([...w.querySelectorAll('[data-dod]')].some(x => !x.checked)) {
            w.querySelector('#doderr').textContent = 'Tick every line — or leave the task where it is';
            return;
          }
          UI.closeModal();
          const fresh = Object.assign({}, Store.get(t.id), { dodOk: true });
          Store.save(fresh);
          go(fresh);
        };
      },
    });
    return true;
  },
};

/* ---------- the project form: roles, sprint length, Definition of Done ---------- */
(function wire() {
  const people = () =>
    Store.visible()
      .filter(m => m.active !== false)
      .map(m => [m.id, Store.memberShort(m.id)]);
  const scrumish = r => !!r && (r.mode === 'scrum' || (r.id && Scrum.sprints(r.id).length > 0));
  const F = [
    {
      dir: true,
      key: 'po',
      label: 'Product owner',
      type: 'select',
      options: people,
      blank: '— the project owner —',
      showIf: scrumish,
      hint: 'Orders the backlog and decides what is built (Scrum)',
    },
    {
      dir: true,
      key: 'sm',
      label: 'Scrum master',
      type: 'select',
      options: people,
      blank: '— none —',
      showIf: scrumish,
      hint: 'Helps the team follow Scrum and removes blockers',
    },
    {
      dir: true,
      key: 'sprintDays',
      label: 'Sprint length',
      type: 'select',
      options: [
        ['7', '1 week'],
        ['14', '2 weeks'],
        ['21', '3 weeks'],
        ['28', '4 weeks'],
      ],
      blank: '— 2 weeks —',
      showIf: scrumish,
    },
    {
      dir: true,
      key: 'dod',
      label: 'Definition of Done (one per line)',
      type: 'textarea',
      rows: 3,
      span: 2,
      placeholder: 'e.g. Tested by someone else\nUser guide updated\nThe owner has seen it',
      hint: 'Asked each time a task is finished — leave empty for none',
    },
  ];
  Schemas.extend('project', {
    name: 'scrum guide',
    fields(list) {
      if (list.some(f => f.key === 'dod')) return list;
      const out = list.slice();
      const ix = out.findIndex(f => f.key === 'mode');
      out.splice(ix < 0 ? out.length : ix + 1, 0, ...F);
      return out;
    },
  });
  // the task form: "Definition of Done is met" — a finished task cannot be saved without it; reopening clears it
  const DOD = {
    key: 'dodOk',
    label: 'Definition of Done',
    type: 'bool',
    checkLabel: 'Definition of Done is met',
    span: 2,
    showIf: r => ScrumUI.dod(Scrum.proj((r && r.project) || UI._recProject)).length > 0,
    hint: '',
  };
  Schemas.extend('ptask', {
    name: 'definition of done',
    fields(list, rec) {
      if (list.some(f => f.key === 'dodOk')) return list;
      const p = Scrum.proj((rec && rec.project) || UI._recProject);
      const d = ScrumUI.dod(p);
      return list.concat([Object.assign({}, DOD, { hint: d.length ? d.join(' · ') : '' })]);
    },
    after(r, before) {
      if (!Scrum.isDone(r) && r.dodOk && before && before.id && Scrum.isDone(before)) r.dodOk = false;
    },
    validate(out) {
      const p = Scrum.proj(out.project);
      if (!ScrumUI.dod(p).length || !Scrum.isDone(out) || out.dodOk) return '';
      const b = out.id && Store.get(out.id);
      if (b && Scrum.isDone(b)) return '';
      return 'Tick "Definition of Done is met" before finishing this task (' + ScrumUI.dod(p).join(' · ') + ')';
    },
  });
})();
