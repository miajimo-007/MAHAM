/* DARRIK — Meetings, minutes and follow-up.
 * meeting  { title, type, series, date, owner, scribe, attendees[], items[{ id, title, notes, decision }], privateNotes,
 *            followups{ taskId: { outcome, on, due } } }
 * Anyone can set up a meeting, with the people they work with:
 *   director / AED → managers and other directors · manager → the director(s) and his own team
 *   team leader / analyst → their manager and their own team · super admin → anyone
 * Actions can go to anyone at the meeting and become real work:
 *   for yourself (the chair)                 → personal task
 *   director → manager                       → director task (follows the chain to analysts)
 *   manager (or acting) → analyst / TL       → To Do
 *   anything else (e.g. manager → director)  → meeting action (its own small task, in the person's My work)
 * Actions are always recorded as given by the chair, also when the minute-taker writes them.
 * Follow-up: the next meeting of the same series ("＋ Next meeting", or "Continues from" when creating one) lists every
 * action still open from earlier ones, with live status, until it is Done, given a new date, or Dropped. */
'use strict';

const Meetings = {
  TYPES: ["Managers' weekly", 'Project steering', '1:1', 'Leadership', 'Team meeting', 'Other'],
  all() {
    return Store.all('meeting')
      .filter(m => Meetings.canSee(m))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  },
  owner(m) {
    return m.owner || (m.id || '').replace(/^meeting-/, '').replace(/-[a-z0-9]{8,}$/, '');
  },
  /* can open: chair, attendee, minute-taker, or anyone with an action from it */
  canSee(m) {
    return (
      !!m &&
      (App.isSuper() ||
        m.owner === App.me ||
        m.scribe === App.me ||
        (m.attendees || []).includes(App.me) ||
        Meetings.actionsOf(m.id).some(t => App.forMe(Meetings.who(t))))
    );
  },
  canEdit(m) {
    return !!m && (m.owner === App.me || App.isSuper() || (!!m.scribe && m.scribe === App.me));
  }, // the chair, or the minute-taker the chair chose
  canRun() {
    return !!Store.member(App.me);
  }, // everyone can set up a meeting (with the people they work with)
  /* who I can invite */
  invitable() {
    const me = Store.member(App.me) || {};
    const act = Store.members().filter(x => x.active !== false && x.id !== App.me);
    if (App.isSuper()) return act;
    const myTeams = new Set(App.myTeams().map(t => t.id));
    const team = me.team || 'apps';
    const dirsOf = t => {
      const d = Store.deptOfTeam(t);
      return act.filter(x => Store.topRole(x.role) && (x.role === 'aed' || !d || !d.director || d.director === x.id));
    };
    if (Store.topRole(me.role))
      return act.filter(
        x => Store.topRole(x.role) || (x.role === 'manager' && myTeams.has(x.team || 'apps')) || App.acting().includes(x.id)
      );
    if (App.isMgr() || App.isActing()) {
      const teams = new Set([team, ...App.acting().map(mid => (Store.member(mid) || {}).team || 'apps')]);
      return act.filter(x => (!Store.topRole(x.role) && teams.has(x.team || 'apps')) || dirsOf(team).includes(x));
    }
    return act.filter(x => !Store.topRole(x.role) && (x.team || 'apps') === team); // analyst / team leader: own manager and own team
  },
  series(m) {
    return Store.all('meeting')
      .filter(x => (x.series || x.id) === (m.series || m.id))
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a._ts || 0) - (b._ts || 0));
  },
  earlier(m) {
    return Meetings.series(m).filter(
      x => x.id !== m.id && ((x.date || '') < (m.date || '') || ((x.date || '') === (m.date || '') && (x._ts || 0) < (m._ts || 0)))
    );
  },
  /* earlier meetings a new one can continue from: same chair, newest first (same type first) */
  continuable(type) {
    return Store.all('meeting')
      .filter(x => x.owner === App.me && !x._del)
      .sort((a, b) => (b.type === type) - (a.type === type) || (b.date || '').localeCompare(a.date || ''));
  },

  /* who can receive an action: anyone at the meeting (and the chair) */
  assignees(m) {
    const ids = [...new Set([m.owner, ...(m.attendees || [])])];
    return ids.map(id => Store.member(id)).filter(x => x && x.active !== false);
  },
  /* every task created from a meeting (any kind) */
  actionsOf(mid) {
    return [
      ...Store.all('mgrtask').filter(t => t.fromMeeting === mid),
      ...Store.all('todo', '*').filter(t => t.fromMeeting === mid),
      ...Store.all('mytask').filter(t => t.fromMeeting === mid),
      ...Store.all('action').filter(t => t.fromMeeting === mid),
    ];
  },
  who(t) {
    return t.c === 'mgrtask' ? t.manager : t.c === 'todo' ? t.analyst : t.c === 'action' ? t.who : t.owner;
  },
  title(t) {
    return t.task || t.title || '';
  },
  due(t) {
    return t.c === 'todo' ? U.addDays(t.assigned, t.duration || 0) : t.due || '';
  },
  /* live status of an action, in one vocabulary */
  status(t) {
    if (t.c === 'mgrtask') {
      const s = Chain.status(t);
      return s === Chain.ST.DONE ? 'Done' : s === Chain.ST.X ? 'Dropped' : s;
    }
    if (t.c === 'todo')
      return t.status === 'Canceled'
        ? 'Dropped'
        : t.status === 'Ready for review'
          ? 'Ready for review'
          : t.finish || t.status === 'Resolved'
            ? 'Done'
            : 'In Progress';
    return t.status === 'Done' ? 'Done' : t.status === 'Canceled' ? 'Dropped' : 'Open';
  },
  isOpen(t) {
    const s = Meetings.status(t);
    return s !== 'Done' && s !== 'Dropped';
  },
  detail(t) {
    if (t.c === 'mgrtask') {
      const p = Chain.progress(t);
      const lt = Chain.latest(t);
      return [
        p.total ? `${p.done} of ${p.total} analysts done` : t.selfDo ? 'manager is doing it' : 'not forwarded yet',
        lt ? `💬 ${Store.memberShort(lt.who)}: ${lt.text}` : t.update ? '💬 ' + t.update : '',
      ]
        .filter(Boolean)
        .join(' · ');
    }
    if (t.c === 'todo') return t.comment ? '💬 ' + t.comment : '';
    if (t.c === 'action') return t.update ? '💬 ' + t.update : t.note || '';
    return t.note || '';
  },
  /* open actions from earlier meetings of this series (+ the ones already followed up in this meeting) */
  followUps(m) {
    const ids = new Set(Meetings.earlier(m).map(x => x.id));
    const all = [...ids].flatMap(Meetings.actionsOf);
    const touched = new Set(Object.keys(m.followups || {}));
    return all.filter(t => Meetings.isOpen(t) || touched.has(t.id));
  },
  /* what an action for this person becomes (see the top of the file) */
  kindFor(m, who) {
    const o = Store.member(m.owner) || {};
    const to = Store.member(who) || {};
    if (who === m.owner && App.me === m.owner) return 'mytask';
    if ((Store.topRole(o.role) || o.superAdmin) && to.role === 'manager') return 'mgrtask';
    const mgrOwner = o.role === 'manager' || Store.actingFor(o.id).length || o.superAdmin;
    if (
      mgrOwner &&
      !Store.topRole(to.role) &&
      to.role !== 'manager' &&
      Store.privileged(App.me, 'assignTodo', Date.now()) &&
      App.myTeams().some(t => t.id === (to.team || 'apps'))
    )
      return 'todo';
    return 'action';
  },
  kindLabel(k) {
    return { mytask: 'personal task', mgrtask: 'director task', todo: 'To Do', action: 'meeting action' }[k] || k;
  },
  /* create the real task for an action */
  makeAction(m, item, v) {
    const today = U.todayStr();
    const to = Store.member(v.who) || {};
    const k = Meetings.kindFor(m, v.who);
    const base = { fromMeeting: m.id, fromItem: item ? item.id : '', project: v.project || '', givenBy: m.owner };
    if (k === 'mytask')
      return Object.assign({ c: 'mytask', owner: m.owner, title: v.what, due: v.due || '', status: 'Open', note: v.note || '' }, base);
    if (k === 'mgrtask')
      return Object.assign(
        {
          c: 'mgrtask',
          task: v.what,
          manager: to.id,
          team: to.team || 'apps',
          urgency: v.urgency || 'Normal',
          date: today,
          due: v.due || '',
          comment: v.note || '',
          status: 'Open',
        },
        base
      );
    if (k === 'todo')
      return Object.assign(
        {
          c: 'todo',
          task: v.what,
          analyst: to.id,
          team: to.team || 'apps',
          assigned: today,
          duration: v.due ? Math.max(0, U.diffDays(today, v.due)) : 0,
          status: 'In Progress',
          instruction: v.note || '',
        },
        base
      );
    return Object.assign(
      { id: U.uid('action'), c: 'action', title: v.what, who: to.id, due: v.due || '', status: 'Open', note: v.note || '', update: '' },
      base
    );
  },
  /* follow-up outcome in a meeting: done / new date / dropped → updates the real task (and its chain) */
  outcome(m, t, what, newDue) {
    const today = U.todayStr();
    const recs = [];
    if (what === 'done') {
      if (t.c === 'mgrtask') {
        // closed in the meeting: open To Dos forwarded from it are no longer needed
        recs.push(
          Object.assign({}, t, {
            status: Chain.ST.DONE,
            doneDate: today,
            doneBy: App.me,
            closeNote: t.closeNote || 'Closed in ' + (m.title || 'meeting'),
          })
        );
        recs.push(
          ...Chain.active(t)
            .filter(x => !Chain.finished(x))
            .map(x =>
              Object.assign({}, x, { status: 'Canceled', cancelReason: `The director task was closed in ${m.title || 'a meeting'}` })
            )
        );
      } else if (t.c === 'todo') recs.push(Object.assign({}, t, { finish: today, status: 'Resolved' }));
      else recs.push(Object.assign({}, t, { status: 'Done', doneDate: today }));
    } else if (what === 'drop') {
      if (t.c === 'mgrtask') {
        const x = Object.assign({}, t, { status: Chain.ST.X });
        recs.push(x, ...Chain.cascade(x, t, false));
      } else recs.push(Object.assign({}, t, { status: 'Canceled', cancelReason: 'Dropped in ' + (m.title || 'meeting') }));
    } else if (what === 'due' && newDue) {
      if (t.c === 'mgrtask') {
        const x = Object.assign({}, t, { due: newDue });
        recs.push(x, ...Chain.cascade(x, t, false));
      } else if (t.c === 'todo') recs.push(Object.assign({}, t, { duration: Math.max(0, U.diffDays(t.assigned, newDue)) }));
      else recs.push(Object.assign({}, t, { due: newDue }));
    } else if (what === 'open') {
      /* still open, no change to the task */
    }
    const fu = Object.assign({}, m.followups || {}, { [t.id]: { outcome: what, on: today, due: newDue || '' } });
    recs.push(Object.assign({}, Store.get(m.id) || m, { followups: fu }));
    Store.saveMany(recs);
  },
  /* the person an action belongs to: mark it done / write an update, from the meeting page or My work */
  mineDone(t) {
    const today = U.todayStr();
    if (t.c === 'todo') {
      if (!Store.canFinishTodo(t, App.me)) return;
      const x = Object.assign({}, t, { finish: today });
      Schemas.todo.beforeSave(x);
      return Store.save(x);
    }
    if (t.c === 'mytask' || t.c === 'action') return Store.save(Object.assign({}, t, { status: 'Done', doneDate: today }));
  },
  mineUpdate(t, text) {
    if (t.c === 'todo') return Store.save(Object.assign({}, t, { comment: text }));
    if (t.c === 'mgrtask') return Store.save(Object.assign({}, t, { update: text }));
    if (t.c === 'action') return Store.save(Object.assign({}, t, { update: text }));
    return Store.save(Object.assign({}, t, { note: text }));
  },
  /* every decision recorded in meetings I can see */
  decisions() {
    return Meetings.all().flatMap(m => (m.items || []).filter(i => String(i.decision || '').trim()).map(i => ({ m, i })));
  },
  /* personal tasks (only their owner sees them) */
  myTasks(who) {
    return Store.all('mytask').filter(t => t.owner === (who || App.me));
  },
  /* upcoming meetings I am in */
  upcoming(who) {
    const me = who || App.me;
    const today = U.todayStr();
    return Store.all('meeting')
      .filter(m => (m.date || '') >= today && (m.owner === me || m.scribe === me || (m.attendees || []).includes(me)))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  },
  /* meeting actions linked to a project */
  forProject(pid) {
    return [
      ...Store.all('mgrtask').filter(t => t.project === pid && t.fromMeeting),
      ...Store.all('todo', '*').filter(t => t.project === pid && t.fromMeeting),
      ...Store.all('mytask').filter(t => t.project === pid),
      ...Store.all('action').filter(t => t.project === pid),
    ];
  },
};
