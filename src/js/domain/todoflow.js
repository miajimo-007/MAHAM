/* MAHAM — To Do chains: a finished To Do is handed on as a NEW To Do for the next person (testing, go-live …).
 *
 *   Yousef: Build the order set  ──➜  Layla: Testing: Build the order set  ──➜  Nora: Go-live: …  ──➜ manager confirms
 *
 * Each step is a real To Do of its person — own text, due days, instructions, comments, notes; on My Day; scored like
 * any To Do. It carries: prevStep (the To Do before it), chainRoot (the first), stepNo (1, 2 …), stepName, chainTask
 * (the first To Do's text), wf (workflow, if any).
 *  - Manager hands on by hand: "➜ Send on" opens a new To Do form, filled in (they choose who, text, days).
 *  - A workflow built by the super admin (Admin → Workflows → To Do workflows) hands on by itself: when someone finishes
 *    a step, their MAHAM makes the next one — id todo-step-<previous id>-a — for the person the workflow names (or the
 *    one they pick). The trust check (access/trust.js, second pass) accepts it only when it matches the workflow.
 *  - The person before counts as done once their To Do is handed on (the manager does not confirm it separately).
 *  - Something wrong? The next person clicks "↩ Send back" with a reason: the To Do before reopens for its person
 *    (scored as not done until "✓ Fixed"), then it is back with the sender. These two actions are small records in the
 *    actor's own file:  { c: 'todostep', id: 'todostep-<by>-<time>', on: <To Do sent back>, from: <sender's To Do>,
 *    act: 'back' | 'done', note, by, at } — an action by anyone who is not the right person is ignored.
 *  - The last step's To Do goes to the manager to confirm (or to be sent on again). */
'use strict';

const TodoFlow = {
  WHO: [
    ['teamleader', 'Team leader'],
    ['manager', 'Team manager'],
    ['pick', 'Chosen by the person who finishes the step before'],
  ],
  set() {
    return Store.get('settings-todoflows') || { id: 'settings-todoflows', c: 'settings', list: [], types: [] };
  },
  defs() {
    return (TodoFlow.set().list || []).filter(d => d && d.id && (d.steps || []).length);
  },
  types() {
    return TodoFlow.set().types || [];
  },
  def(id) {
    return id ? TodoFlow.defs().find(d => d.id === id) || null : null;
  },
  defsFor(team) {
    return TodoFlow.defs().filter(d => !d.team || d.team === team);
  },
  autoFor(type, team) {
    return type ? TodoFlow.defsFor(team).find(d => (d.types || []).includes(type)) || null : null;
  },
  teamOf(r) {
    const a = Store.member(r.analyst);
    return r.team || (a && a.team) || 'apps';
  },
  whoLabel(w) {
    if (!w) return '';
    if (w.startsWith('m:')) return Store.memberShort(w.slice(2)) || w.slice(2);
    return (TodoFlow.WHO.find(x => x[0] === w) || [, w])[1];
  },
  resolve(who, team, not) {
    const no = new Set((not || []).filter(Boolean));
    const act = m => m && m.active !== false && !no.has(m.id);
    if (!who || who === 'pick') return '';
    if (who.startsWith('m:')) {
      const id = who.slice(2);
      const m = Store.member(id);
      return act(m) ? id : '';
    }
    if (who === 'manager') {
      const m = Store.teamManager(team);
      return act(m) ? m.id : '';
    }
    if (who === 'teamleader') {
      const m = Store.members().find(x => x.role === 'teamleader' && (x.team || 'apps') === team && act(x));
      return m ? m.id : '';
    }
    return '';
  },
  mayHandOn(by, r) {
    return Store.isSuper(by) || (Store.can(by, 'assignTodo') && Store.inMyTeam(r, by));
  },
  /* who may get a "picked" step: active people of the team (not the one before, when the step asks) */
  pickable(team, not) {
    return Store.members().filter(
      m => m.active !== false && !Store.topRole(m.role) && (m.team || 'apps') === team && !(not || []).includes(m.id)
    );
  },

  /* ---------- the chain ---------- */
  todos() {
    return Store.byC.todo || [];
  },
  live(t) {
    return !!t && !t._del && t.status !== 'Canceled';
  },
  /* the To Do this one was handed on to (the newest live one) */
  idx() {
    return Calc.memo('todochain', () => {
      const nx = new Map(),
        ev = new Set();
      for (const t of TodoFlow.todos())
        if (t && t.prevStep && TodoFlow.live(t)) {
          const n = nx.get(t.prevStep);
          if (!n || (t.assigned || '') >= (n.assigned || '')) nx.set(t.prevStep, t);
        }
      for (const e of Store.byC.todostep || []) if (e && !e._del) ev.add(e.on);
      return { nx, ev };
    });
  },
  nextOf(r) {
    return r && r.id ? TodoFlow.idx().nx.get(r.id) || null : null;
  },
  prevOf(r) {
    return r && r.prevStep ? Store.get(r.prevStep) : null;
  },
  chain(r) {
    if (!r) return [];
    let first = r;
    const seen = new Set([r.id]);
    for (let p = TodoFlow.prevOf(first); p && !seen.has(p.id); p = TodoFlow.prevOf(p)) {
      seen.add(p.id);
      first = p;
    }
    const out = [first];
    for (let n = TodoFlow.nextOf(first); n && !seen.has(n.id + '>') && out.length < 20; n = TodoFlow.nextOf(n)) {
      seen.add(n.id + '>');
      out.push(n);
    }
    return out;
  },
  /* the workflow step that comes after this To Do (or null) */
  nextDef(r) {
    const d = TodoFlow.def(r && r.wf);
    const k = (r && r.stepNo) || 0;
    return d && d.steps[k] ? Object.assign({ no: k + 1 }, d.steps[k]) : null;
  },
  /* the To Do a send-back from `from` goes to: the one before, or (workflow) the step it names */
  backTarget(from) {
    const prev = TodoFlow.prevOf(from);
    if (!prev) return null;
    const d = TodoFlow.def(from.wf);
    const st = d && from.stepNo ? d.steps[from.stepNo - 1] : null;
    if (st && st.backTo !== '' && st.backTo != null) {
      const want = +st.backTo;
      let t = prev;
      while (t && (t.stepNo || 0) > want) t = TodoFlow.prevOf(t);
      return t || prev;
    }
    return prev;
  },
  /* send-backs on this To Do, in order: { open: event|null, fixes: [dates], backs: n } */
  backs(r) {
    const memo = Calc.memo('todoback', () => {
      const m = new Map();
      for (const e of Store.byC.todostep || []) {
        if (!e || e._del || !e.on || !['back', 'done'].includes(e.act)) continue;
        if (!m.has(e.on)) m.set(e.on, []);
        m.get(e.on).push(e);
      }
      for (const l of m.values()) l.sort((a, b) => (a.at || 0) - (b.at || 0));
      return m;
    });
    const out = { open: null, fixes: [], backs: 0, list: [] };
    for (const e of memo.get(r.id) || []) {
      if (e.act === 'back') {
        if (out.open) continue;
        const from = Store.get(e.from);
        if (
          !from ||
          from.analyst !== e.by ||
          !TodoFlow.live(from) ||
          (from.finish && U.ds(new Date(e.at)) > from.finish) ||
          (TodoFlow.backTarget(from) || {}).id !== r.id ||
          (e.at || 0) < (r.flowFrom || 0)
        )
          continue;
        out.open = e;
        out.backs++;
        out.list.push(e);
      } else if (e.act === 'done' && out.open && e.by === r.analyst) {
        out.fixes.push(U.ds(new Date(e.at)));
        out.list.push(e);
        out.open = null;
      }
    }
    return out;
  },
  /* where this To Do stands, for lists, scoring and buttons */
  view(r) {
    if (!r || r.c !== 'todo' || r.virtual) return null;
    const next = TodoFlow.nextOf(r);
    const b = TodoFlow.backs(r);
    const nd = r.finish && !next ? TodoFlow.nextDef(r) : null;
    const waitBack = (() => {
      const p = TodoFlow.backTarget(r);
      return p && !r.finish ? TodoFlow.backs(p).open : null;
    })();
    const v = {
      next,
      b,
      waitBack,
      pickNeeded: !!(nd && nd.who === 'pick'),
      autoWaiting: !!(nd && nd.who !== 'pick'),
      finish: b.fixes.length ? b.fixes[b.fixes.length - 1] : r.finish,
      status: null,
    };
    if (r.status === 'Canceled') v.status = 'Canceled';
    else if (b.open) {
      v.status = 'In Progress';
      v.finish = '';
    } // sent back: open again until fixed
    else if (next && r.finish)
      v.status = 'Resolved'; // handed on: their part is done
    else if (b.fixes.length && r.finish && (r.status === 'Resolved' || next)) v.status = 'Resolved';
    return v;
  },
  has(r) {
    return !!r && r.c === 'todo' && !r.virtual && !!(r.prevStep || r.wf || TodoFlow.nextOf(r) || TodoFlow.idx().ev.has(r.id));
  },
  effFinish(r) {
    const v = TodoFlow.view(r);
    return v ? v.finish : r.finish;
  },
  /* 'manager' = waiting for the manager to confirm (or send on); anything else = still moving */
  phase(r) {
    const v = TodoFlow.view(r);
    if (!v) return '';
    if (r.status === 'Canceled') return 'canceled';
    if (v.b.open) return 'redo';
    if (v.next) return 'handed';
    if (v.pickNeeded) return 'pick';
    if (v.autoWaiting) return 'auto';
    if (r.status === 'Resolved') return 'done';
    return r.finish ? 'manager' : 'work';
  },
  label(r) {
    if (!TodoFlow.has(r)) return '';
    const v = TodoFlow.view(r);
    const nm = id => Store.memberShort(id) || id || '—';
    if (v.b.open) return `↩ Sent back by ${nm(v.b.open.by)}`;
    if (v.waitBack) return `Waiting for ${nm(TodoFlow.backTarget(r).analyst)}'s fix`;
    if (v.next) return `➜ Handed on to ${nm(v.next.analyst)}${v.next.stepName ? ' (' + v.next.stepName + ')' : ''}`;
    if (v.pickNeeded) return `Choose who does "${TodoFlow.nextDef(r).name}"`;
    if (r.stepName) return `Step ${r.stepNo}: ${r.stepName}${v.b.backs ? ' · sent back ×' + v.b.backs : ''}`;
    return v.b.backs ? `sent back ×${v.b.backs}` : '';
  },
  /* my To Dos sent back to me (to fix), and my finished ones where I must choose the next person */
  withMe(r, me) {
    me = me || App.me;
    if (!r || r.c !== 'todo' || r.virtual || r.analyst !== me || !TodoFlow.has(r)) return false;
    const v = TodoFlow.view(r);
    return !!v.b.open || (v.pickNeeded && TodoFlow.live(r));
  },
  mine(me) {
    return Store.all('todo', '*').filter(r => TodoFlow.withMe(r, me));
  },
  needsPick(r, me) {
    return r && r.analyst === (me || App.me) && TodoFlow.has(r) && TodoFlow.view(r).pickNeeded;
  },
  checkTodos() {
    return [];
  },
  stuck() {
    return [];
  },
  parentOf(r) {
    return r;
  },

  /* ---------- making the next step's To Do ---------- */
  stepId(prev, auto) {
    return `todo-step-${prev.id}-${auto ? 'a' : 'm' + Date.now().toString(36)}`;
  },
  /* the To Do a workflow makes after `prev` (also used by the trust check) */
  stepCopy(prev, who, assigned) {
    const nd = TodoFlow.nextDef(prev);
    if (!nd) return null;
    const root = prev.chainTask || prev.task;
    return {
      c: 'todo',
      id: TodoFlow.stepId(prev, true),
      analyst: who,
      team: prev.team || TodoFlow.teamOf(prev),
      task: `${nd.name}: ${root}`,
      chainTask: root,
      assigned: assigned || U.todayStr(),
      duration: +nd.days || 0,
      status: 'In Progress',
      priority: prev.priority || 'Normal',
      wf: prev.wf,
      prevStep: prev.id,
      chainRoot: prev.chainRoot || prev.id,
      stepNo: nd.no,
      stepName: nd.name,
      givenBy: prev.givenBy || '',
    };
  },
  /* trust check: is this To Do the workflow step a finished To Do leads to? → the canonical To Do, or null */
  validStep(t, by) {
    const m = /^todo-step-(.+)-a$/.exec((t && t.id) || '');
    if (!m) return null;
    const src = Store._verifyTodos || Store.db;
    const prev = src && src.get(m[1]);
    if (!prev || prev._del || prev.status === 'Canceled' || !prev.finish || !prev.wf) return null;
    const nd = TodoFlow.nextDef(prev);
    if (!nd) return null;
    const team = prev.team || TodoFlow.teamOf(prev);
    const not = nd.notSame ? [prev.analyst] : [];
    const ok =
      nd.who === 'pick' ? TodoFlow.pickable(team, not).some(x => x.id === t.analyst) : TodoFlow.resolve(nd.who, team, not) === t.analyst;
    if (!ok || ![prev.analyst, t.analyst].includes(by) || !t.assigned || t.assigned < prev.finish) return null;
    return TodoFlow.stepCopy(prev, t.analyst, t.assigned);
  },
  /* after my saves: a finished To Do of mine with a workflow step after it → make that step's To Do (unless it is "chosen") */
  autoNext(list) {
    if (!App.me || App.preview) return;
    const add = [];
    for (const r of list || []) {
      if (!r || r.c !== 'todo' || r._del || !r.wf || !r.finish || r.status === 'Canceled' || r.analyst !== App.me) continue;
      const cur = Store.get(r.id) || r;
      if (TodoFlow.nextOf(cur) || Store.db.has(TodoFlow.stepId(cur, true))) continue;
      const nd = TodoFlow.nextDef(cur);
      if (!nd || nd.who === 'pick') continue;
      const who = TodoFlow.resolve(nd.who, cur.team || TodoFlow.teamOf(cur), nd.notSame ? [cur.analyst] : []);
      if (!who) continue;
      add.push(TodoFlow.stepCopy(cur, who));
    }
    if (add.length) {
      Store.saveMany(add);
      for (const t of add) UI.toast(`➜ Handed on to ${Store.memberShort(t.analyst)} for ${t.stepName}`, 'good');
    }
  },
  pick(r) {
    const nd = TodoFlow.nextDef(r);
    if (!nd) return;
    const team = r.team || TodoFlow.teamOf(r);
    const ppl = TodoFlow.pickable(team, nd.notSame ? [r.analyst] : []).filter(m => m.id !== App.me || !nd.notSame);
    UI.modal({
      title: `➜ Who does "${nd.name}"?`,
      body: `<p><b>${h(r.task)}</b></p><form class="grid-form" id="tfk">${UI.field({ key: 'to', label: 'Hand it on to', type: 'select', options: ppl.map(m => [m.id, Store.memberShort(m.id)]), required: true, span: 2 }, '')}</form><p class="muted small">They get a new To Do: “${h(nd.name)}: ${h(r.chainTask || r.task)}”${+nd.days ? `, due in ${+nd.days} day${+nd.days > 1 ? 's' : ''}` : ''}.</p>`,
      actions: '<span class="grow"></span><button class="btn" data-c>Later</button><button class="btn primary" data-ok>➜ Hand on</button>',
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const to = w.querySelector('[name=to]').value;
          if (!to) return UI.toast('Choose who', 'bad');
          const cur = Store.get(r.id) || r;
          if (TodoFlow.nextOf(cur)) {
            UI.closeModal();
            return;
          }
          Store.save(TodoFlow.stepCopy(cur, to));
          UI.closeModal();
          UI.toast(`➜ Handed on to ${Store.memberShort(to)} for ${nd.name}`, 'good');
          App.render(true);
        };
      },
    });
  },
  /* manager: hand a finished To Do on by hand — a new To Do form, filled in */
  sendOn(r) {
    const root = r.chainTask || r.task;
    UI.closeModal();
    setTimeout(
      () =>
        UI.editRecord(
          'todo',
          {
            task: 'Testing: ' + root,
            chainTask: root,
            analyst: '',
            team: r.team || TodoFlow.teamOf(r),
            priority: r.priority || 'Normal',
            assigned: U.todayStr(),
            duration: 2,
            prevStep: r.id,
            chainRoot: r.chainRoot || r.id,
            stepNo: (r.stepNo || 0) + 1,
            stepName: '',
            wf: '',
            _sendOn: true,
          },
          { title: '➜ Send on — a new To Do for the next person', savedMsg: 'Handed on — a new To Do for them' }
        ),
      0
    );
  },
  /* the next person: something is wrong with the step before */
  back(r) {
    const t = TodoFlow.backTarget(r);
    if (!t) return;
    UI.modal({
      title: '↩ Send back to ' + Store.memberShort(t.analyst),
      body: `<p><b>${h(t.task)}</b></p><p class="small">${h(Store.memberShort(t.analyst))}'s To Do opens again until they fix it; then it comes back to you.</p><form class="grid-form" id="tfb">${UI.field({ key: 'note', label: 'What is wrong? (they will see it)', type: 'textarea', rows: 3, span: 2, required: true }, '')}</form>`,
      actions:
        '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn danger" data-ok>↩ Send back</button>',
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const note = w.querySelector('[name=note]').value.trim();
          if (!note) return UI.toast('Write what is wrong', 'bad');
          TodoFlow.act(t, 'back', { from: r.id, note });
          UI.closeModal();
          UI.toast('Sent back to ' + Store.memberShort(t.analyst), 'good');
          App.render(true);
        };
      },
    });
  },
  redo(r) {
    const o = TodoFlow.backs(r).open;
    const from = o && Store.get(o.from);
    UI.modal({
      title: '✓ Fixed',
      body: `<p><b>${h(r.task)}</b></p>${o ? `<p class="small">Sent back by <b>${h(Store.memberShort(o.by))}</b>: “${h(o.note)}”</p>` : ''}<form class="grid-form" id="tfr">${UI.field({ key: 'note', label: 'What did you change? (optional)', type: 'textarea', rows: 2, span: 2 }, '')}</form>`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>✓ Fixed</button>',
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          TodoFlow.act(r, 'done', { from: o ? o.from : '', note: w.querySelector('[name=note]').value.trim() });
          UI.closeModal();
          UI.toast('Fixed — back with ' + Store.memberShort(from ? from.analyst : ''), 'good');
          App.render(true);
        };
      },
    });
  },
  act(r, act, x) {
    const e = Object.assign(
      {
        c: 'todostep',
        id: `todostep-${App.me}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        on: r.id,
        team: TodoFlow.teamOf(r),
        by: App.me,
        at: Date.now(),
        act,
      },
      x || {}
    );
    Store.save(e);
    return e;
  },

  /* ---------- buttons, list words, the panel in the form ---------- */
  buttons(r, opts) {
    if (!r || r.c !== 'todo' || r.virtual || App.preview || !App.canEdit('todo')) return '';
    const v = TodoFlow.has(r) ? TodoFlow.view(r) : null;
    const b = (k, l, cls, t) => `<button class="btn sm ${cls || ''}" data-tf="${k}|${h(r.id)}"${t ? ` title="${h(t)}"` : ''}>${l}</button>`;
    if (v && v.b.open && r.analyst === App.me) return b('redo', '✓ Fixed', 'primary');
    if (v && v.pickNeeded && r.analyst === App.me && !v.next) return b('pick', '➜ Choose who', 'primary');
    if (r.prevStep && !r.finish && r.analyst === App.me && !(v && v.waitBack) && TodoFlow.backTarget(r))
      return (opts || {}).backOnly ? b('back', '↩ Send back', 'ghost', 'Something is wrong with the step before') : '';
    if (
      (opts || {}).sendOn &&
      r.finish &&
      !(v && (v.next || v.b.open || v.pickNeeded || v.autoWaiting)) &&
      r.status !== 'Resolved' &&
      TodoFlow.mayHandOn(App.me, r) &&
      r.analyst !== App.me
    )
      return b('send', '➜ Send on', 'ghost', 'A new To Do for the next person');
    return '';
  },
  bind(root) {
    root.querySelectorAll('[data-tfgo]').forEach(
      a =>
        (a.onclick = e => {
          e.preventDefault();
          const t = Store.get(a.dataset.tfgo);
          if (t) {
            UI.closeModal();
            setTimeout(() => UI.editRecord('todo', t), 0);
          }
        })
    );
    root.querySelectorAll('[data-tf]').forEach(
      btn =>
        (btn.onclick = e => {
          e.stopPropagation();
          const [k, id] = btn.dataset.tf.split('|');
          const r = Store.get(id);
          if (!r) return;
          if (UI.$('#modal') && k !== 'send') UI.closeModal();
          setTimeout(() => ({ redo: TodoFlow.redo, back: TodoFlow.back, send: TodoFlow.sendOn, pick: TodoFlow.pick })[k](r), 0);
        })
    );
  },
  panel(r) {
    if (!r || !r.id || r.c !== 'todo') return '';
    const has = TodoFlow.has(r);
    const btns = [
      TodoFlow.buttons(r, { sendOn: true }),
      r.prevStep && !r.finish && r.analyst === App.me ? TodoFlow.buttons(r, { backOnly: true }) : '',
    ]
      .filter(Boolean)
      .join(' ');
    if (!has && !btns) return '';
    const nm = id => h(Store.memberShort(id) || id || '—');
    const ch = TodoFlow.chain(r);
    const d = TodoFlow.def(r.wf);
    const st = t => {
      const l = Calc.todoDerive(t).status;
      return l === 'Resolved' ? '✓ done' : l === 'Ready for review' ? 'waiting for the manager' : l === 'Canceled' ? 'canceled' : 'open';
    };
    const row = t => {
      const v = TodoFlow.view(t);
      return `<div class="tf-ev ${t.id === r.id ? 'tf-me' : ''}"><span class="tf-d">${t.stepNo ? 'Step ' + t.stepNo : 'Start'}</span> <b>${nm(t.analyst)}</b> — ${t.id === r.id ? '<b>' : `<a href="#" class="link" data-tfgo="${h(t.id)}">`}${h(t.stepName || t.task)}${t.id === r.id ? '</b>' : '</a>'} · <span class="muted">${st(t)}${t.finish && !v.b.open ? ' ' + h(U.fmtDate(v.finish)) : ''}</span>${v.b.list.map(e => `<div class="tf-note">${e.act === 'back' ? `↩ sent back by ${nm(e.by)} ${h(U.fmtDate(U.ds(new Date(e.at))))}: “${h(e.note)}”` : `✓ fixed ${h(U.fmtDate(U.ds(new Date(e.at))))}${e.note ? ': “' + h(e.note) + '”' : ''}`}</div>`).join('')}</div>`;
    };
    const last = ch[ch.length - 1];
    const nd = last && last.finish ? TodoFlow.nextDef(last) : null;
    const v = TodoFlow.view(r);
    const back =
      v && v.b.open && r.analyst === App.me
        ? `<div class="tf-backnote">🔁 Sent back by <b>${nm(v.b.open.by)}</b>: “${h(v.b.open.note)}”</div>`
        : '';
    return `<div class="tflow" id="tflow"><div class="tf-head">🔀 <b>Hand-on chain</b>${has && TodoFlow.label(r) ? ` <span class="badge warn">${h(TodoFlow.label(r))}</span>` : ''}<span class="grow"></span>${btns}</div>${
      d
        ? `<div class="muted small">Workflow: <b>${h(d.name)}</b> — ${['The work']
            .concat(d.steps.map(x => x.name))
            .map(h)
            .join(' → ')} → manager confirms</div>`
        : ''
    }${back}${ch.length > 1 || has ? `<div class="tf-trail">${ch.map(row).join('')}${nd ? `<div class="tf-ev muted small">Next: ${h(nd.name)}${nd.who === 'pick' ? ' (chosen by ' + nm(last.analyst) + ')' : ' — ' + h(TodoFlow.whoLabel(nd.who))}</div>` : ''}</div>` : ''}</div>`;
  },
};

/* ---------- Follow-up To Dos: a new To Do started from a To Do, linked both ways ----------
 * Managers / team leaders create it directly (followOf = the To Do it follows). Analysts can add a personal follow-up
 * task, or ask their manager for a follow-up To Do:
 *   { c: 'todoask', id: 'todoask-<by>-<time>', on: <To Do id>, team, by, at, text }            the ask (in the asker's file)
 *   { c: 'todoask', id: 'todoask-<by>-<time>', reply: <ask id>, act: 'decline', note, by, at }  a manager's "no"
 * An ask is done when a To Do with fromAsk = its id exists, or a manager of that team declined it. */
const TodoFollow = {
  of(r) {
    return r && r.followOf ? Store.get(r.followOf) : null;
  },
  kids(r) {
    return r && r.id ? (Store.byC.todo || []).filter(t => t && !t._del && t.followOf === r.id) : [];
  },
  asks(r) {
    return (Store.byC.todoask || []).filter(a => a && !a._del && !a.reply && (!r || a.on === r.id));
  },
  replyOf(a) {
    const t = Store.get(a.on);
    return (Store.byC.todoask || []).find(x => x && !x._del && x.reply === a.id && t && TodoFlow.mayHandOn(x.by, t)) || null;
  },
  madeFrom(a) {
    return (Store.byC.todo || []).find(t => t && !t._del && t.fromAsk === a.id) || null;
  },
  stateOf(a) {
    const m = TodoFollow.madeFrom(a);
    if (m) return { st: 'made', todo: m };
    const rp = TodoFollow.replyOf(a);
    if (rp) return { st: 'declined', reply: rp };
    return { st: 'open' };
  },
  /* asks waiting for me (manager / team leader of that To Do's team) */
  openForMe() {
    return TodoFollow.asks().filter(a => {
      const t = Store.get(a.on);
      return t && TodoFlow.mayHandOn(App.me, t) && a.by !== App.me && TodoFollow.stateOf(a).st === 'open';
    });
  },
  canCreate(r) {
    return !App.preview && App.canEdit('todo') && TodoFlow.mayHandOn(App.me, r);
  },
  create(r, extra) {
    UI.closeModal();
    setTimeout(
      () =>
        UI.editRecord(
          'todo',
          Object.assign(
            {
              task: 'Follow-up: ' + r.task,
              analyst: r.analyst,
              team: r.team || TodoFlow.teamOf(r),
              priority: r.priority || 'Normal',
              followOf: r.id,
              assigned: U.todayStr(),
            },
            extra || {}
          ),
          { savedMsg: 'Follow-up To Do added' }
        ),
      0
    );
  },
  personal(r) {
    UI.closeModal();
    setTimeout(
      () =>
        UI.editRecord('mytask', {
          owner: App.me,
          status: 'Open',
          priority: 'Normal',
          title: 'Follow-up: ' + r.task,
          followOf: r.id,
          note: 'Follow-up of the To Do “' + r.task + '”',
        }),
      0
    );
  },
  ask(r) {
    UI.modal({
      title: '🙋 Ask for a follow-up To Do',
      body: `<p class="small">Your manager gets the request and can turn it into a To Do (or say why not).</p><form class="grid-form" id="tfa">${UI.field({ key: 'text', label: 'What should the follow-up be?', type: 'textarea', rows: 3, span: 2, required: true }, 'Follow-up: ' + r.task)}</form>`,
      actions:
        '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Send request</button>',
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const text = w.querySelector('[name=text]').value.trim();
          if (!text) return UI.toast('Write what the follow-up should be', 'bad');
          Store.save({
            c: 'todoask',
            id: `todoask-${App.me}-${Date.now().toString(36)}`,
            on: r.id,
            team: r.team || TodoFlow.teamOf(r),
            by: App.me,
            at: Date.now(),
            text,
          });
          UI.closeModal();
          UI.toast('Sent to your manager', 'good');
          App.render(true);
        };
      },
    });
  },
  accept(a) {
    const t = Store.get(a.on);
    if (!t) return;
    TodoFollow.create(t, { task: a.text, analyst: a.by, fromAsk: a.id });
  },
  decline(a) {
    UI.modal({
      title: 'Decline the follow-up request',
      body: `<p><b>${h(a.text)}</b></p><form class="grid-form" id="tfd">${UI.field({ key: 'note', label: `Why? (${h(Store.memberShort(a.by))} will see it)`, type: 'textarea', rows: 2, span: 2 }, '')}</form>`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn danger" data-ok>Decline</button>',
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          Store.save({
            c: 'todoask',
            id: `todoask-${App.me}-${Date.now().toString(36)}`,
            reply: a.id,
            act: 'decline',
            note: w.querySelector('[name=note]').value.trim(),
            by: App.me,
            at: Date.now(),
          });
          UI.closeModal();
          UI.toast('Declined', 'good');
          App.render(true);
        };
      },
    });
  },
  /* the links + buttons, in the To Do's form */
  box(r) {
    if (!r || !r.id || r.c !== 'todo' || r.virtual) return '';
    const link = t =>
      `<a href="#" class="link" data-tfgo="${h(t.id)}">${h(t.task)}</a> <span class="muted small">(${h(Store.memberShort(t.analyst))} · ${h(Calc.todoDerive(t).status)})</span>`;
    const up = TodoFollow.of(r);
    const kids = TodoFollow.kids(r);
    const mine = TodoFollow.asks(r).filter(a => a.by === App.me || TodoFlow.mayHandOn(App.me, r));
    const askLine = a => {
      const s = TodoFollow.stateOf(a);
      return `<div class="small">🙋 ${a.by === App.me ? 'You' : h(Store.memberShort(a.by))} asked for a follow-up: “${h(a.text)}” — ${s.st === 'made' ? '✓ made into a To Do' : s.st === 'declined' ? `✕ declined by ${h(Store.memberShort(s.reply.by))}${s.reply.note ? ': “' + h(s.reply.note) + '”' : ''}` : TodoFlow.mayHandOn(App.me, r) && a.by !== App.me ? `<button class="btn xs primary" data-tfacc="${h(a.id)}">Make it a To Do</button> <button class="btn xs ghost" data-tfdec="${h(a.id)}">Decline</button>` : 'waiting for the manager'}</div>`;
    };
    const can = TodoFollow.canCreate(r);
    const me = !App.preview && App.me;
    const btns = can
      ? '<button type="button" class="btn sm" data-tfnew>＋ Follow-up To Do</button>'
      : me
        ? `${App.pageAllowed('mytasks') ? '<button type="button" class="btn sm ghost" data-tfpers>＋ Personal follow-up</button> ' : ''}<button type="button" class="btn sm ghost" data-tfask>🙋 Ask for a follow-up To Do</button>`
        : '';
    if (!up && !kids.length && !mine.length && !btns) return '';
    return `<div class="tfollow" id="tfollow"><div class="tf-head">↪ <b>Follow-ups</b><span class="grow"></span>${btns}</div>${up ? `<div class="small">Follow-up of: ${link(up)}</div>` : ''}${kids.length ? `<div class="small">Follow-ups: ${kids.map(link).join(' · ')}</div>` : ''}${mine.map(askLine).join('')}</div>`;
  },
  bind(m, r) {
    const q = s => m.querySelector(s);
    if (!q('#tfollow')) return;
    const b = (s, f) => {
      const e = q(s);
      if (e)
        e.onclick = ev => {
          ev.preventDefault();
          f();
        };
    };
    b('[data-tfnew]', () => TodoFollow.create(r));
    b('[data-tfpers]', () => TodoFollow.personal(r));
    b('[data-tfask]', () => {
      UI.closeModal();
      setTimeout(() => TodoFollow.ask(r), 0);
    });
    m.querySelectorAll('[data-tfgo]').forEach(
      a =>
        (a.onclick = e => {
          e.preventDefault();
          const t = Store.get(a.dataset.tfgo);
          if (t) {
            UI.closeModal();
            setTimeout(() => UI.editRecord('todo', t), 0);
          }
        })
    );
    m.querySelectorAll('[data-tfacc]').forEach(
      a =>
        (a.onclick = () => {
          const x = Store.get(a.dataset.tfacc);
          if (x) TodoFollow.accept(x);
        })
    );
    m.querySelectorAll('[data-tfdec]').forEach(
      a =>
        (a.onclick = () => {
          const x = Store.get(a.dataset.tfdec);
          if (x) {
            UI.closeModal();
            setTimeout(() => TodoFollow.decline(x), 0);
          }
        })
    );
  },
};
