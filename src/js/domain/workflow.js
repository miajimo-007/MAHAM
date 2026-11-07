/* MAHAM — Work-flow rules shared by several pages: director tasks, forwarding, project health, quick-win history. */
'use strict';

function mineOrAll(list) {
  if (App.isAED() || App.isSuper()) return list;
  // a director sees every team, but only the tasks / projects they gave (or that were given to them);
  // records from before "givenBy" existed, and projects a team started itself, stay visible
  if (App.isDir())
    return list.filter(r => r.manager === App.me || (r.members || []).includes(App.me) || !r.givenBy || r.givenBy === App.me);
  return list.filter(r => App.forMe(r.manager) || (r.members || []).includes(App.me));
}

function mtDerive(r) {
  const today = U.todayStr();
  const st = Chain.status(r);
  const open = st !== Chain.ST.DONE && st !== Chain.ST.X;
  const late = open && r.due && r.due < today;
  return { r, st, open, late, prog: Chain.progress(r), days: open && r.date ? U.diffDays(r.date, today) : null };
}

/* ---------- My work: everything assigned to me, from every source, in one list ---------- */
function myWork(who) {
  const me = who || App.me;
  const today = U.todayStr();
  const out = [];
  const from = r => (r.fromMeeting && Store.get(r.fromMeeting) ? '🗓 ' + Store.get(r.fromMeeting).title : '');
  for (const t of Store.all('todo', '*'))
    if (t.analyst === me && (t.status === 'In Progress' || !t.status)) {
      const due = U.addDays(t.assigned, t.duration || 0);
      out.push({
        r: t,
        kind: 'To Do',
        title: t.task,
        due,
        src: from(t) || (t.fromTask ? 'from director' : 'from ' + Store.memberShort(t._by)),
        edit: 'todo|' + t.id,
      });
    }
  for (const t of Store.all('mgrtask')) {
    const st = Chain.status(t);
    if (App.forMe(t.manager) && me === App.me && st !== Chain.ST.DONE && st !== Chain.ST.X)
      out.push({
        r: t,
        kind: 'Director task',
        title: t.task,
        due: t.due || '',
        src: from(t) || 'from ' + (Store.memberShort(t.givenBy) || 'the director'),
        edit: 'mgrtask|' + t.id,
      });
  }
  for (const t of Store.all('ptask'))
    if (t.assignee === me && !Scrum.isDone(t)) {
      const p = Store.get(t.project);
      if (p && !['Done', 'Canceled'].includes(p.status))
        out.push({ r: t, kind: 'Project task', title: t.title, due: t.due || '', src: '◈ ' + p.name, proj: p.id });
    }
  if (typeof PT !== 'undefined') {
    for (const t of PT.today(me))
      out.push({
        r: t,
        kind: 'Personal',
        title: t.title,
        due: t.due || '',
        src:
          from(t) ||
          (t.fromWho ? 'personal · from ' + Store.memberShort(t.fromWho) : 'personal · only you see it') +
            (t.repeat ? ' · ↻ ' + PT.REPEAT_LABEL[t.repeat] : ''),
        edit: 'mytask|' + t.id,
      });
    if (me === App.me)
      for (const t of PT.offersForMe())
        out.push({
          r: t,
          kind: 'Offered',
          title: t.title,
          due: t.due || '',
          src: `offered by ${Store.memberShort(t.owner)}${t.offer.note ? ' · “' + t.offer.note + '”' : ''}`,
          href: '#/mytasks',
          offer: true,
        });
  }
  for (const t of Store.all('action'))
    if (t.who === me && t.status === 'Open')
      out.push({
        r: t,
        kind: 'Meeting action',
        title: t.title,
        due: t.due || '',
        src: from(t) || 'from ' + Store.memberShort(t.givenBy),
        edit: 'action|' + t.id,
      });
  if (me === App.me && typeof Flow !== 'undefined') {
    for (const p of Flow.pendingForMe())
      out.push({
        r: p,
        kind: 'Approval',
        title: `Approve: ${p.name} → ${Flow.name(Flow.of(p), p.pending.to)}`,
        due: '',
        src: `asked by ${Store.memberShort(p.pending.by)}${p.pending.note ? ' · “' + p.pending.note + '”' : ''}`,
        href: '#/project/' + p.id,
      });
    for (const p of Store.all('project', '*'))
      if (App.forMe(p.manager) && Flow.of(p) && Flow.stuck(p))
        out.push({
          r: p,
          kind: 'Stuck',
          title: `${p.name} — ${Flow.daysIn(p)} days in ${Flow.stageOf(p).name}`,
          due: '',
          src: `limit ${Flow.stageOf(p).alert} days · move it on or put it on hold`,
          href: '#/project/' + p.id,
        });
  }
  for (const x of out) {
    x.late = !!x.due && x.due < today;
  }
  if (me === App.me)
    for (const m of Meetings.upcoming(me))
      out.push({
        r: m,
        kind: 'Meeting',
        title: m.title,
        due: m.date,
        src: `${m.owner === me ? 'you chair it' : 'chaired by ' + Store.memberShort(m.owner)} · ${(m.attendees || []).length} attendee(s)`,
        href: '#/meeting/' + m.id,
        late: false,
      });
  const pr = x => (UI.PRI_RANK || {})[(x.r && x.r.priority) || 'Normal'] ?? 2;
  return out.sort((a, b) => b.late - a.late || pr(a) - pr(b) || (a.due || '9').localeCompare(b.due || '9')); // late first, then High priority
}
/* new or changed for me since I last opened my desk (not my own changes) */
function newForMe() {
  const seen = LS.get('bct.seen.' + App.me, 0);
  if (!seen) return [];
  return myWork().filter(x => (x.r._ts || 0) > seen && x.r._by !== App.me);
}
function markSeen() {
  LS.set('bct.seen.' + App.me, Date.now());
}
function myWorkCard() {
  const o = arguments[0] || {};
  const today = U.todayStr();
  const l = myWork();
  const nw = new Set(newForMe().map(x => x.r.id));
  if (!LS.get('bct.seen.' + App.me, 0)) markSeen();
  /* done today, waiting for the manager's confirm — stays on the list greyed until tomorrow */
  const wait = Store.all('todo', '*').filter(
    t => t.analyst === App.me && t.status === 'Ready for review' && t.finish && t.finish > U.addDays(today, -Custom.target('greyDays'))
  );
  if (!l.length && !wait.length && o.hideEmpty) return '';
  const kc = {
    Offered: 'k-mtg',
    Approval: 'k-req',
    Stuck: 'k-task',
    'To Do': 'k-task',
    'Director task': 'k-meet',
    'Project task': 'k-proj',
    Personal: 'k-mtg',
    'Meeting action': 'k-meet',
    Meeting: 'k-req',
  };
  const extra = x =>
    x.r.c !== 'todo'
      ? ''
      : `${x.r.priority === 'High' ? ' ' + UI.badge('High', 'bad') : ''}${x.r.dirUpdated && x.r.dirUpdated >= U.addDays(today, -7) ? ' ' + UI.badge('updated by director', 'warn') : ''}${x.r.nudgedOn && x.r.nudgedOn >= U.addDays(today, -3) ? ' ' + UI.badge('🔔 ' + Store.memberShort(x.r.nudgedBy) + ' asked for an update', 'warn') : ''}${x.r.dirNote ? `<div class="small">📝 Director: ${h(x.r.dirNote)}</div>` : ''}`;
  const row = x =>
    `<div class="li click" ${x.edit ? `data-edit="${h(x.edit)}"` : x.href ? `data-href="${h(x.href)}"` : `data-proj="${h(x.proj)}"`}><span class="ag-kind ${kc[x.kind]}">${h(x.kind)}</span><div class="grow"><b>${h(x.title)}</b>${nw.has(x.r.id) ? ' <span class="badge warn">new</span>' : ''}${extra(x)}<div class="muted small">${h(x.src)}</div></div>${x.due ? `<span class="ov-due ${x.late ? 'late' : x.due === today ? 'today' : ''}">${x.late ? 'overdue · ' : ''}${x.due === today ? 'today' : U.fmtDate(x.due)}</span>` : ''}${x.offer ? ` <button class="btn sm primary" data-ptacc="${h(x.r.id)}">Accept</button> <button class="btn sm ghost" data-ptdec="${h(x.r.id)}">Decline</button>` : x.r.c === 'action' || x.r.c === 'todo' || x.r.c === 'mytask' ? ` <button class="btn sm" data-mineok="${h(x.r.id)}" title="Mark as done today">✓ Done</button>` : ''}</div>`;
  const wrow = t =>
    `<div class="li click waiting" data-edit="todo|${h(t.id)}"><span class="ag-kind k-task">To Do</span><div class="grow"><b>${h(t.task)}</b><div class="muted small">✓ done ${t.finish === today ? 'today' : U.fmtDate(t.finish)} — waiting for your manager to confirm</div></div></div>`;
  return card(
    `My work <span class="count">${l.length}</span>${nw.size ? ` <span class="badge warn">${nw.size} new</span>` : ''}`,
    l.length || wait.length
      ? `<div class="scroll-list">${l.slice(0, 30).map(row).join('')}${wait.map(wrow).join('')}</div>`
      : empty('Nothing assigned to you right now. 🎉'),
    [
      App.pageAllowed('mytasks') ? '<a href="#" class="link" data-ptnew="">＋ Personal task</a>' : '',
      App.pageAllowed('todo') ? '<a href="#/todo" class="link">All To Dos →</a>' : '',
    ]
      .filter(Boolean)
      .join(' <span class="muted">·</span> ')
  );
}

/* one task sent to several managers = one group: "3 of 4 managers done" (mtDerive rows in, rows out) */
function mtGroup(rows) {
  const out = [];
  const byG = new Map();
  for (const x of rows) {
    if (!x.r.group) {
      out.push(x);
      continue;
    }
    if (!byG.has(x.r.group)) {
      const g = { group: true, r: x.r, items: [] };
      byG.set(x.r.group, g);
      out.push(g);
    }
    byG.get(x.r.group).items.push(x);
  }
  for (const g of byG.values()) {
    if (g.items.length === 1) {
      out[out.indexOf(g)] = g.items[0];
      continue;
    }
    const it = g.items;
    g.done = it.filter(x => !x.open).length;
    g.open = it.some(x => x.open);
    g.late = it.some(x => x.late);
    g.st = g.open ? `${g.done} of ${it.length} managers done` : Chain.ST.DONE;
    g.days = Math.max(...it.map(x => x.days || 0));
    g.prog = { done: g.done, total: it.length };
  }
  return out;
}

function projDerive(r) {
  const today = U.todayStr();
  const open = !['Done', 'Canceled'].includes(r.status);
  let health = 'On track';
  if (!open) health = r.status;
  else if (r.status === 'On Hold') health = 'On hold';
  else if (r.due && r.due < today) health = 'Overdue';
  else if (r.due && r.start && r.start < r.due) {
    const span = U.diffDays(r.start, r.due) || 1;
    const el = Math.max(0, U.diffDays(r.start, today));
    const expected = Math.min(100, (el / span) * 100);
    if (Scrum.progress(r) + 20 < expected) health = 'Behind';
  }
  return { r, open, health, prog: Scrum.progress(r) };
}

const healthKind = h2 => ({ 'On track': 'good', Done: 'good', Behind: 'warn', 'On hold': 'warn', Overdue: 'bad', Canceled: '' })[h2] || '';

/* quick wins that are finished business: rejected (and, for Analyst Desk, completed) = history only */
function qwHistory(r, rejectedOnly) {
  const ap = U.lc(r.approval),
    st = U.lc(r.status);
  if (ap === 'rejected' || st === 'rejected' || st === 'canceled' || st === 'cancelled') return true;
  return !rejectedOnly && st === 'completed';
}

/* ---- director task → manager → analysts: one chain ----
 * The director's task (mgrtask) is forwarded by the manager as To Dos (todo.fromTask = task id).
 * Its status is worked out from the chain: Open → In Progress (n of m done) → Ready for review → Done (closed by the manager). */
const Chain = {
  ST: { OPEN: 'Open', PROG: 'In Progress', REVIEW: 'Ready for review', DONE: 'Done', X: 'Canceled' },
  todos(mt) {
    return Store.all('todo', '*').filter(t => t.fromTask === mt.id);
  },
  active(mt) {
    return Chain.todos(mt).filter(t => t.status !== 'Canceled');
  },
  finished(t) {
    return !!t.finish || t.status === 'Resolved';
  },
  progress(mt) {
    const a = Chain.active(mt);
    return { done: a.filter(Chain.finished).length, total: a.length };
  },
  status(mt) {
    if (!mt) return '';
    if (mt.status === Chain.ST.DONE || mt.status === Chain.ST.X) return mt.status;
    const p = Chain.progress(mt);
    if (!p.total) return mt.selfDo ? Chain.ST.PROG : Chain.ST.OPEN;
    return p.done === p.total ? Chain.ST.REVIEW : Chain.ST.PROG;
  },
  /* latest analyst update rolled up to the director task */
  latest(mt) {
    const a = Chain.active(mt)
      .filter(t => t.comment)
      .sort((x, y) => (y._ts || 0) - (x._ts || 0))[0];
    return a ? { who: a.analyst, text: a.comment, ts: a._ts } : null;
  },
  canManage(mt) {
    return !!mt && mt.team !== '_top' && (App.forMe(mt.manager) || App.isSuper());
  },
  canForward(mt) {
    const st = Chain.status(mt);
    return Chain.canManage(mt) && st !== Chain.ST.DONE && st !== Chain.ST.X && App.canEdit('todo') && App.can('assignTodo');
  },
  /* the manager closes it once every analyst is done (or when doing it themselves) */
  canClose(mt) {
    const st = Chain.status(mt);
    return Chain.canManage(mt) && (st === Chain.ST.REVIEW || (st === Chain.ST.PROG && mt.selfDo && !Chain.progress(mt).total));
  },
  /* when the director edits, cancels or deletes the task, the analysts' open To Dos follow */
  cascade(mt, before, deleting) {
    if (!before || !before.id) return [];
    const open = Chain.active(before).filter(t => !Chain.finished(t));
    const today = U.todayStr();
    if (deleting || mt.status === Chain.ST.X)
      return open.map(t =>
        Object.assign({}, t, {
          status: 'Canceled',
          cancelReason: deleting ? 'The director removed this task' : 'The director canceled this task',
        })
      );
    if (mt.task === before.task && mt.comment === before.comment && mt.due === before.due) return [];
    return open.map(t => {
      const o = Object.assign({}, t, { dirUpdated: today });
      if (mt.task !== before.task) o.task = mt.task;
      if (mt.comment !== before.comment) o.dirNote = mt.comment;
      if (mt.due && mt.due !== before.due) {
        const tdue = U.addDays(t.assigned, t.duration || 0);
        if (!before.due || tdue === before.due || tdue > mt.due) o.duration = Math.max(0, U.diffDays(t.assigned, mt.due));
      }
      return o;
    });
  },
};
/* kept for older callers */
function fwdList(mt) {
  return Chain.todos(mt);
}
function canForward(mt) {
  return Chain.canForward(mt);
}

function nextQwId() {
  let n = 0;
  for (const q of [...Store.all('quickwin', '*'), ...(nextQwId.taken || [])]) {
    const m = /(\d+)/.exec(q.qwId || '');
    if (m) n = Math.max(n, +m[1]);
  }
  return 'QW-' + String(n + 1).padStart(3, '0');
}
