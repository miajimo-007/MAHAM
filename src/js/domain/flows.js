/* DARRIK — Project workflows (set up by the super admin in Admin → Workflows).
 *   settings-workflows.list = [{ id, name, team ('' = every team), start, statuses: [{ id, name, color, group, alert }],
 *                                moves: [{ from, to, who: [roles], approver: '' | role | 'm:<id>', conds: [keys] }] }]
 * A project that uses a workflow keeps:  workflow, stage (status id), stageSince (ms), history [{ from, to, by, at, note,
 * approvedBy, rejected, override }], pending { to, by, at, note, approver } while a move waits for approval.
 * Its normal `status` is always the stage's group (Not Started / In Progress / On Hold / Done / Canceled), so every
 * other page (Director Desk, Performance, overview) keeps working whatever the stages are called. */
'use strict';

const Flow = {
  GROUPS: ['Not Started', 'In Progress', 'On Hold', 'Done', 'Canceled'],
  ROLES: [
    ['owner', 'Project owner'],
    ['member', 'Project members'],
    ['manager', 'Team manager'],
    ['director', 'Director'],
  ],
  /* approvals go by title only — the person is found from the project when the move is asked */
  APPROVERS: [
    ['owner', 'Project owner'],
    ['teamleader', 'Team leader'],
    ['manager', 'Team manager'],
    ['director', 'Director'],
    ['aed', 'AED'],
  ],
  CONDS: [
    ['owner', 'An owner is set'],
    ['due', 'A target date is set'],
    ['description', 'Description / scope is written'],
    ['update', 'A latest update is written'],
    ['tasksDone', 'Every project task is done'],
    ['note', 'A comment is written with the move'],
  ],
  list() {
    return Store.setting('settings-workflows', 'list', []) || [];
  },
  get(id) {
    return Flow.list().find(w => w.id === id) || null;
  },
  forTeam(team) {
    return Flow.list().filter(w => !w.team || w.team === team);
  },
  of(p) {
    return p && p.workflow ? Flow.get(p.workflow) : null;
  },
  startOf(w) {
    return (w.statuses || []).find(s => s.id === w.start) || (w.statuses || [])[0];
  },
  stageOf(p) {
    const w = Flow.of(p);
    if (!w) return null;
    return w.statuses.find(s => s.id === p.stage) || Flow.startOf(w);
  },
  status(w, id) {
    return ((w && w.statuses) || []).find(s => s.id === id) || null;
  },
  name(w, id) {
    const s = Flow.status(w, id);
    return s ? s.name : '?';
  },
  inUse(wid, sid) {
    return Store.all('project', '*').filter(p => p.workflow === wid && (!sid || p.stage === sid));
  },

  /* who I am for this project */
  rolesOf(p, id) {
    const me = id || App.me;
    const r = new Set();
    if (App.forMe(p.manager) || p.manager === me) r.add('owner');
    if (Scrum.onProject(p, me)) r.add('member');
    const tm = Scrum.teamManagerOf(p);
    if (tm && (tm === me || App.forMe(tm))) r.add('manager');
    if ((Store.isDirector(me) || Store.isAED(me)) && Store.teamsFor(me).some(t => t.id === Scrum.teamOf(p))) r.add('director');
    return r;
  },
  /* the person who approves a move */
  approverOf(p, mv) {
    const a = mv && mv.approver;
    if (!a) return '';
    if (a.startsWith('m:')) return a.slice(2);
    if (a === 'owner') return p.manager || '';
    if (a === 'manager') return Scrum.teamManagerOf(p) || '';
    if (a === 'teamleader') {
      const tl = Store.members().find(m => m.role === 'teamleader' && m.active !== false && (m.team || 'apps') === Scrum.teamOf(p));
      return tl ? tl.id : '';
    }
    if (a === 'aed') {
      const x = Store.members().find(m => m.role === 'aed' && m.active !== false);
      return x ? x.id : '';
    }
    if (a === 'director') {
      if (p.givenBy && Store.isDirector(p.givenBy)) return p.givenBy;
      const d = Store.members().find(
        m => m.role === 'director' && m.active !== false && Store.deptsOf(m.id).some(x => (x.teams || []).includes(Scrum.teamOf(p)))
      );
      return d ? d.id : '';
    }
    return '';
  },
  approverLabel(a) {
    if (!a) return 'No approval';
    if (a.startsWith('m:')) return Store.memberShort(a.slice(2));
    return (Flow.APPROVERS.find(r => r[0] === a) || [a, a])[1];
  },
  /* moves out of the current stage */
  movesFrom(p) {
    const w = Flow.of(p);
    const st = Flow.stageOf(p);
    return w && st ? (w.moves || []).filter(m => m.from === st.id && Flow.status(w, m.to)) : [];
  },
  canMove(p, mv) {
    if (App.isSuper()) return true;
    const who = mv.who && mv.who.length ? mv.who : ['owner', 'manager'];
    const mine = Flow.rolesOf(p);
    return who.some(r => mine.has(r));
  },
  /* what is still missing before this move is allowed (the comment is checked in the dialog) */
  missing(p, mv) {
    const out = [];
    for (const k of mv.conds || []) {
      if (k === 'owner' && !p.manager) out.push('Set an owner');
      if (k === 'due' && !p.due) out.push('Set a target date');
      if (k === 'description' && !String(p.description || '').trim()) out.push('Write the description / scope');
      if (k === 'update' && !String(p.update || '').trim()) out.push('Write a latest update');
      if (k === 'tasksDone') {
        const open = Scrum.items(p.id).filter(t => !Scrum.isDone(t));
        if (open.length) out.push(`Finish every project task (${open.length} still open)`);
      }
    }
    return out;
  },
  /* the record after moving to a stage */
  applied(p, to, extra) {
    const w = Flow.of(p);
    const st = Flow.status(w, to);
    const now = Date.now();
    const out = Object.assign({}, p, {
      stage: to,
      stageSince: now,
      status: st.group,
      pending: null,
      updatedOn: U.todayStr(),
      history: [...(p.history || []), Object.assign({ from: p.stage, to, by: App.me, at: now }, extra || {})],
    });
    if (st.group === 'Done') {
      out.progress = 100;
      out.doneDate = p.doneDate || U.todayStr();
    } else out.doneDate = '';
    return out;
  },
  /* the project form: setting / changing a workflow puts the project in its first stage */
  onSave(r, prev) {
    if (!r.workflow) {
      if (prev && prev.workflow) {
        r.stage = '';
        r.pending = null;
      }
      return;
    }
    const w = Flow.get(r.workflow);
    if (!w) return;
    if (!prev || prev.workflow !== r.workflow || !Flow.status(w, r.stage)) {
      const st = Flow.startOf(w);
      r.stage = st.id;
      r.stageSince = Date.now();
      r.pending = null;
      r.history = [
        ...(r.history || []),
        {
          to: st.id,
          by: App.me,
          at: Date.now(),
          note: prev && prev.workflow && prev.workflow !== r.workflow ? 'workflow changed to ' + w.name : 'workflow: ' + w.name,
        },
      ];
    }
    r.status = Flow.stageOf(r).group;
  },
  daysIn(p) {
    return p.stageSince ? Math.floor((Date.now() - p.stageSince) / 864e5) : 0;
  },
  /* in a stage longer than its alert limit */
  stuck(p) {
    const st = Flow.stageOf(p);
    return !!(st && +st.alert > 0 && !['Done', 'Canceled'].includes(st.group) && Flow.daysIn(p) > +st.alert);
  },
  /* days spent in each stage, from the history */
  timeIn(p) {
    const w = Flow.of(p);
    if (!w) return [];
    const moves = (p.history || []).filter(x => !x.rejected && x.to);
    const d = {};
    for (let i = 0; i < moves.length; i++) {
      const end = i + 1 < moves.length ? moves[i + 1].at : Date.now();
      d[moves[i].to] = (d[moves[i].to] || 0) + Math.max(0, end - moves[i].at) / 864e5;
    }
    return w.statuses.filter(s => d[s.id] != null).map(s => ({ s, days: d[s.id] }));
  },
  pendingForMe() {
    return Store.all('project', '*').filter(p => p.pending && p.pending.approver && App.forMe(p.pending.approver));
  },

  /* ---------- the actions ---------- */
  ask(p, to, force) {
    const w = Flow.of(p);
    const mv = force && App.isSuper() ? null : (w.moves || []).find(m => m.from === p.stage && m.to === to); // force = admin: any stage, no approval
    if (!mv && !App.isSuper()) return UI.toast('That move is not allowed in this workflow', 'bad');
    if (mv && !Flow.canMove(p, mv)) return UI.toast('You are not allowed to make this move', 'bad');
    const miss = mv ? Flow.missing(p, mv) : [];
    const needNote = !!(mv && (mv.conds || []).includes('note'));
    const appr = mv ? Flow.approverOf(p, mv) : '';
    const selfOk = !appr || App.forMe(appr);
    const adminOnly = !mv; // admin override: any stage
    UI.modal({
      title: `Move “${p.name}” to ${Flow.name(w, to)}`,
      body: `<p class="muted small">${h(Flow.name(w, p.stage))} → <b>${h(Flow.name(w, to))}</b>${adminOnly ? ' · <b>admin override</b> (recorded in the history)' : ''}</p>
      ${miss.length ? `<div class="insights warnbox"><div><b>Before this move:</b><ul>${miss.map(x => `<li>${h(x)}</li>`).join('')}</ul></div></div>` : ''}
      <form class="grid-form" id="mvf">${UI.field({ key: 'note', label: needNote ? 'Comment (required)' : 'Comment (optional)', type: 'textarea', span: 2, rows: 2 }, '')}</form>
      ${appr && !selfOk ? `<p class="note">This move needs <b>${h(Store.memberShort(appr))}</b>'s approval — the project stays in ${h(Flow.name(w, p.stage))} until they approve.</p>` : mv && mv.approver && !appr ? '<p class="note">Nobody fills the approver role for this project — ask the administrator.</p>' : ''}`,
      actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok ${miss.length && !App.isSuper() ? 'disabled' : ''}>${appr && !selfOk ? 'Ask for approval' : 'Move'}</button>`,
      onMount: wd => {
        wd.querySelector('[data-c]').onclick = UI.closeModal;
        wd.querySelector('[data-ok]').onclick = () => {
          const note = wd.querySelector('[name=note]').value.trim();
          if (needNote && !note) return UI.toast('Write a comment for this move', 'bad');
          if (mv && mv.approver && !appr && !App.isSuper()) return UI.toast('No approver for this project — ask the administrator', 'bad');
          const cur = Store.get(p.id);
          if (appr && !selfOk && !adminOnly) {
            Store.save(Object.assign({}, cur, { pending: { to, by: App.me, at: Date.now(), note, approver: appr } }));
            UI.closeModal();
            UI.toast(`Sent to ${Store.memberShort(appr)} for approval`, 'good');
            App.render();
            return;
          }
          const extra = { note };
          if (adminOnly || (miss.length && App.isSuper())) extra.override = true;
          if (appr) extra.approvedBy = App.me;
          Store.save(Flow.applied(cur, to, extra));
          UI.closeModal();
          UI.toast('Moved to ' + Flow.name(w, to), 'good');
          App.render();
        };
      },
    });
  },
  approve(p) {
    const w = Flow.of(p);
    const q = p.pending;
    if (!q) return;
    Store.save(Flow.applied(p, q.to, { by: q.by, note: q.note, approvedBy: App.me }));
    UI.toast('Approved — moved to ' + Flow.name(w, q.to), 'good');
    App.render();
  },
  reject(p) {
    const w = Flow.of(p);
    const q = p.pending;
    if (!q) return;
    UI.modal({
      title: `Reject: ${p.name} → ${Flow.name(w, q.to)}`,
      body: `<form class="grid-form" id="rjf">${UI.field({ key: 'why', label: 'Why? (the person who asked sees this)', type: 'textarea', span: 2, rows: 2 }, '')}</form>`,
      actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn danger" data-ok>Reject</button>`,
      onMount: wd => {
        wd.querySelector('[data-c]').onclick = UI.closeModal;
        wd.querySelector('[data-ok]').onclick = () => {
          const why = wd.querySelector('[name=why]').value.trim();
          if (!why) return UI.toast('Write why', 'bad');
          Store.save(
            Object.assign({}, Store.get(p.id), {
              pending: null,
              history: [
                ...(p.history || []),
                { from: p.stage, to: q.to, by: q.by, at: Date.now(), note: why, rejected: true, rejectedBy: App.me },
              ],
            })
          );
          UI.closeModal();
          UI.toast('Rejected', 'good');
          App.render();
        };
      },
    });
  },
  cancelAsk(p) {
    Store.save(Object.assign({}, p, { pending: null }));
    UI.toast('Request withdrawn', 'good');
    App.render();
  },

  /* ---------- the stage bar on the project page ---------- */
  bar(p) {
    const w = Flow.of(p);
    if (!w) return '';
    const st = Flow.stageOf(p);
    const q = p.pending;
    const days = Flow.daysIn(p);
    const stuck = Flow.stuck(p);
    const moves = Flow.movesFrom(p).filter(m => Flow.canMove(p, m));
    const chip = s =>
      `<span class="fl-chip ${s.id === st.id ? 'on' : ''}" style="--c:${h(s.color || '#64748b')}">${h(s.name)}${s.id === st.id ? ` <small>${days}d</small>` : ''}</span>`;
    return `<div class="card fl-bar"><div class="fl-top"><span class="muted small">Workflow · ${h(w.name)}</span><span class="grow"></span>${stuck ? UI.badge(`${days} days in ${st.name} (limit ${st.alert})`, 'bad') : ''}</div>
      <div class="fl-chips">${w.statuses.map(chip).join('<span class="fl-arr">›</span>')}</div>
      ${
        q
          ? `<div class="insights warnbox"><div>⏳ <b>${h(Store.memberShort(q.by))}</b> asked to move it to <b>${h(Flow.name(w, q.to))}</b> — waiting for <b>${h(Store.memberShort(q.approver))}</b>${q.note ? ': “' + h(q.note) + '”' : ''} <span class="muted small">${U.fmtTs(q.at)}</span></div><div class="row-btns tight">${App.forMe(q.approver) || App.isSuper() ? `<button class="btn sm primary" data-flok>✓ Approve</button><button class="btn sm ghost" data-flno>✕ Reject</button>` : ''}${q.by === App.me ? '<button class="btn sm ghost" data-flcancel>Withdraw</button>' : ''}</div></div>`
          : `<div class="row-btns fl-moves">${moves.map(m => `<button class="btn sm ${Flow.status(w, m.to).group === 'Done' ? 'primary' : ''}" data-flto="${h(m.to)}">→ ${h(Flow.name(w, m.to))}${m.approver ? ' <small>(approval)</small>' : ''}</button>`).join('')}${!moves.length ? `<span class="muted small">${['Done', 'Canceled'].includes(st.group) ? 'Finished.' : 'You cannot move this project from here.'}</span>` : ''}${
              App.isSuper()
                ? `<span class="grow"></span><select id="flany" class="sm"><option value="">Admin: move to any stage…</option>${w.statuses
                    .filter(s => s.id !== st.id)
                    .map(s => `<option value="${h(s.id)}">${h(s.name)}</option>`)
                    .join('')}</select>`
                : ''
            }</div>`
      }
      ${(() => {
        const last = [...(p.history || [])].reverse().find(x => x.rejected);
        return last && !q && last.at > (p.stageSince || 0)
          ? `<p class="note">✕ ${h(Store.memberShort(last.rejectedBy))} rejected moving to ${h(Flow.name(w, last.to))}: “${h(last.note)}”</p>`
          : '';
      })()}
      <details class="fl-hist"><summary>History &amp; time in each stage</summary>
        <div class="cols2"><div>${
          (p.history || [])
            .slice()
            .reverse()
            .map(
              x =>
                `<div class="li"><span class="grow">${x.rejected ? '✕ ' : ''}${x.from ? h(Flow.name(w, x.from)) + ' → ' : ''}<b>${h(Flow.name(w, x.to))}</b>${x.rejected ? ' <span class="badge bad">rejected</span>' : ''}${x.override ? ' <span class="badge warn">admin</span>' : ''} <span class="muted small">· ${h(Store.memberShort(x.by))}${x.approvedBy ? ' · approved by ' + h(Store.memberShort(x.approvedBy)) : ''}${x.rejectedBy ? ' · by ' + h(Store.memberShort(x.rejectedBy)) : ''}${x.note ? ' · “' + h(x.note) + '”' : ''}</span></span><span class="muted small nw">${U.fmtTs(x.at)}</span></div>`
            )
            .join('') || empty('No moves yet.')
        }</div>
        <div>${Flow.timeIn(p)
          .map(
            x =>
              `<div class="li"><span class="grow">${h(x.s.name)}</span><b>${U.num(x.days, 1)}</b>&nbsp;<span class="muted small">days</span></div>`
          )
          .join('')}</div></div></details></div>`;
  },
  bind(root, p) {
    root.querySelectorAll('[data-flto]').forEach(b => (b.onclick = () => Flow.ask(Store.get(p.id), b.dataset.flto)));
    const any = root.querySelector('#flany');
    if (any)
      any.onchange = () => {
        if (any.value) Flow.ask(Store.get(p.id), any.value, true);
        any.value = '';
      };
    const ok = root.querySelector('[data-flok]');
    if (ok) ok.onclick = () => Flow.approve(Store.get(p.id));
    const no = root.querySelector('[data-flno]');
    if (no) no.onclick = () => Flow.reject(Store.get(p.id));
    const cc = root.querySelector('[data-flcancel]');
    if (cc) cc.onclick = () => Flow.cancelAsk(Store.get(p.id));
  },

  /* a starting example */
  example() {
    const S = (id, name, color, group, alert) => ({ id, name, color, group, alert: alert || 0 });
    const statuses = [
      S('todo', 'To Do', '#64748b', 'Not Started'),
      S('analysis', 'In Analysis', '#0ea5e9', 'In Progress', 10),
      S('dev', 'Dev', '#8b5cf6', 'In Progress', 20),
      S('uat', 'UAT', '#f59e0b', 'In Progress', 10),
      S('done', 'Done', '#16a34a', 'Done'),
      S('hold', 'On Hold', '#94a3b8', 'On Hold', 30),
      S('rej', 'Rejected', '#dc2626', 'Canceled'),
    ];
    const M = (from, to, o) => Object.assign({ from, to, who: ['owner', 'manager'], approver: '', conds: [] }, o || {});
    const moves = [
      M('todo', 'analysis', { conds: ['owner'] }),
      M('analysis', 'dev', { conds: ['description', 'due'] }),
      M('analysis', 'todo'),
      M('dev', 'uat', { who: ['owner', 'member', 'manager'] }),
      M('uat', 'dev', { who: ['owner', 'member', 'manager'], conds: ['note'] }),
      M('uat', 'done', { approver: 'manager', conds: ['tasksDone'] }),
      ...['todo', 'analysis', 'dev', 'uat'].map(f => M(f, 'hold', { conds: ['note'] })),
      ...['analysis', 'dev', 'uat'].map(t => M('hold', t)),
      ...['todo', 'analysis'].map(f => M(f, 'rej', { approver: 'manager', conds: ['note'] })),
    ];
    return { id: U.uid('wf'), name: 'Enhancement (SRS)', team: '', start: 'todo', statuses, moves };
  },
};
