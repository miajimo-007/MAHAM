/* MAHAM — Project management, stage 2: workload across projects, project requests (ideas), task checklists,
 * subtasks, comments, estimated vs actual hours, templates, baseline & slippage, close-out and lessons learned. */
'use strict';

const PM2 = {
  /* ---------- tasks: checklist, subtasks, comments, hours ---------- */
  checklist(t) {
    return Array.isArray(t && t.checklist) ? t.checklist : [];
  },
  clDone(t) {
    return PM2.checklist(t).filter(x => x.done).length;
  },
  subtasks(t) {
    return t ? Store.all('ptask').filter(x => x.parent === t.id && x.status !== 'Canceled') : [];
  },
  comments(taskId) {
    return Store.all('pcomment')
      .filter(x => x.task === taskId)
      .sort((a, b) => (a.at || a._ts || 0) - (b.at || b._ts || 0));
  },
  hrs(v) {
    const n = +v;
    return n > 0 ? n : 0;
  },
  /* small badges on a board card */
  badges(t) {
    const out = [];
    const cl = PM2.checklist(t);
    const st = PM2.subtasks(t);
    const cm = PM2.comments(t.id).length;
    if (cl.length)
      out.push(`<span class="pc-b ${PM2.clDone(t) === cl.length ? 'ok' : ''}" title="Checklist">☑ ${PM2.clDone(t)}/${cl.length}</span>`);
    if (st.length) out.push(`<span class="pc-b" title="Subtasks done">⧉ ${st.filter(x => Scrum.isDone(x)).length}/${st.length}</span>`);
    if (t.parent && Store.get(t.parent))
      out.push(`<span class="pc-b" title="Subtask of ${h(Store.get(t.parent).title)}">↳ ${h(ptKey(Store.get(t.parent)))}</span>`);
    if (cm) out.push(`<span class="pc-b" title="Comments">💬 ${cm}</span>`);
    if (PM2.hrs(t.est) || PM2.hrs(t.actual))
      out.push(
        `<span class="pc-b" title="Estimated / actual hours">⏱ ${PM2.hrs(t.est) || '–'}${PM2.hrs(t.actual) ? ' / ' + PM2.hrs(t.actual) : ''}h</span>`
      );
    return out.length ? `<div class="pc-bs">${out.join('')}</div>` : '';
  },

  /* ---------- workload: open project tasks per person per week (6 weeks ahead) ---------- */
  weekStart(d) {
    const x = U.pd(d || U.todayStr());
    return U.addDays(U.ds(x), -x.getDay());
  }, // weeks start on Sunday
  weeks(n = 6) {
    const w0 = PM2.weekStart();
    return Array.from({ length: n }, (_, i) => U.addDays(w0, 7 * i));
  },
  inWeek(t, ws) {
    const a = t.start || t.due,
      b = t.due || t.start;
    if (!a) return false;
    const we = U.addDays(ws, 6);
    return a <= we && b >= ws;
  },
  load(list) {
    const hrs = list.reduce((s, t) => s + PM2.hrs(t.est), 0);
    return { n: list.length, hrs };
  },
  level(x, team) {
    const lt = Custom.target('wlTasks', team),
      lh = Custom.target('wlHours', team);
    const v = x.hrs ? x.hrs / lh : x.n / lt;
    return v >= 1 ? 'bad' : v >= 0.6 ? 'warn' : x.n ? 'good' : '';
  },
  canSeeWorkload() {
    return App.isSuper() || App.can('seeWorkload');
  },

  /* ---------- project requests (ideas) ---------- */
  REQ: { P: 'Waiting', A: 'Approved', R: 'Rejected', H: 'On hold', D: 'With the director' },
  reqs() {
    return Store.all('preq');
  },
  /* who decides: the manager of the requester's team (or acting), the director of that department, the super admin */
  canDecide(q) {
    if (!q || App.isSuper()) return true;
    if (!App.can('decideProjectRequests')) return false;
    const team = q.team || 'apps';
    const tm = Store.teamManager(team);
    if (tm && App.forMe(tm.id)) return true;
    if ((App.isDir() || App.isAED()) && App.myTeams().some(t => t.id === team)) return true;
    return false;
  },
  myReqs() {
    return PM2.reqs().filter(q => q.createdBy === App.me);
  },
  toDecide() {
    return PM2.reqs().filter(
      q =>
        (q.status === PM2.REQ.P || q.status === PM2.REQ.D || q.status === PM2.REQ.H) &&
        PM2.canDecide(q) &&
        !(q.status === PM2.REQ.D && !(App.isDir() || App.isAED() || App.isSuper()))
    );
  },

  /* ---------- templates ---------- */
  templates() {
    return Store.all('ptemplate').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  },
  canTemplate() {
    return App.isSuper() || App.can('manageTemplates');
  },
  /* a project → template (dates become days from the project start) */
  toTemplate(p, name) {
    const s = p.start || U.todayStr();
    const off = d => (d ? U.diffDays(s, d) : null);
    const tasks = Scrum.items(p.id).filter(t => t.status !== 'Canceled');
    const keyOf = new Map(tasks.map((t, i) => [t.id, 'k' + i]));
    return {
      c: 'ptemplate',
      name,
      team: p.team,
      mode: PM.mode(p),
      category: p.category || '',
      description: p.description || '',
      goal: p.goal || '',
      outScope: p.outScope || '',
      success: p.success || '',
      fromProject: p.id,
      phases: PM.phases(p.id).map(x => ({ kind: x.kind, name: x.name, startOff: off(x.start), endOff: off(x.end), notes: x.notes || '' })),
      tasks: tasks.map(t => ({
        key: keyOf.get(t.id),
        title: t.title,
        type: t.type || 'Task',
        priority: t.priority || 'Normal',
        points: t.points || 1,
        est: t.est || '',
        startOff: off(t.start),
        dueOff: off(t.due),
        parent: keyOf.get(t.parent) || '',
        after: keyOf.get(t.after) || '',
        description: t.description || '',
        checklist: PM2.checklist(t).map(x => ({ t: x.t, done: false })),
      })),
    };
  },
  /* template → records of a new project (phases, tasks) starting on `start` */
  fromTemplate(tp, pid, team, start) {
    const at = o => (o === null || o === undefined || o === '' ? '' : U.addDays(start, +o));
    const ph = (tp.phases || []).map(x => ({
      c: 'pphase',
      project: pid,
      team,
      kind: x.kind,
      name: x.name,
      start: x.kind === 'milestone' ? '' : at(x.startOff),
      end: at(x.endOff),
      status: 'Planned',
      notes: x.notes || '',
    }));
    const ids = new Map((tp.tasks || []).map(t => [t.key, U.uid('ptask')]));
    const col0 = Scrum.columns(Store.get(pid))[0];
    const tk = (tp.tasks || []).map((t, i) => ({
      id: ids.get(t.key),
      c: 'ptask',
      project: pid,
      team,
      n: i + 1,
      title: t.title,
      type: t.type,
      priority: t.priority,
      points: t.points,
      est: t.est,
      start: at(t.startOff),
      due: at(t.dueOff),
      parent: ids.get(t.parent) || '',
      after: ids.get(t.after) || '',
      description: t.description,
      checklist: t.checklist || [],
      status: Scrum.startOf ? Scrum.startOf(Store.get(pid), t.type || 'Task') : col0,
      sprint: '',
      createdOn: U.todayStr(),
    }));
    return [...ph, ...tk];
  },

  /* ---------- baseline & slippage ---------- */
  baseline(p) {
    return p && p.baseline && p.baseline.items ? p.baseline : null;
  },
  snap(p) {
    const items = {};
    for (const x of PM.phases(p.id)) items[x.id] = { s: x.start || '', e: x.end || '' };
    for (const t of Scrum.items(p.id)) if (t.start || t.due) items[t.id] = { s: t.start || '', e: t.due || '' };
    return items;
  },
  /* days late against the baseline (end date) — positive = later than planned */
  slip(p, r) {
    const b = PM2.baseline(p);
    const x = b && b.items[r.id];
    const now = r.c === 'pphase' ? r.end : r.due;
    return x && x.e && now ? U.diffDays(x.e, now) : null;
  },
  slipSummary(p) {
    if (!PM2.baseline(p)) return null;
    const ms = PM.milestones(p.id)
      .map(m => ({ m, d: PM2.slip(p, m) }))
      .filter(x => x.d);
    const tk = Scrum.items(p.id)
      .map(t => PM2.slip(p, t))
      .filter(d => d > 0);
    const end = (() => {
      const b = PM2.baseline(p);
      return b.due && p.due ? U.diffDays(b.due, p.due) : 0;
    })();
    return { ms, tasks: tk.length, avg: tk.length ? U.avg(tk) : 0, end };
  },

  /* ---------- close-out & lessons ---------- */
  closed(p) {
    return !!(p && p.closeout && p.closeout.on);
  },
  lessons() {
    return Store.all('project')
      .filter(p => PM2.closed(p) && Scrum.canSee(p) && (p.closeout.wentWell || p.closeout.doBetter))
      .sort((a, b) => (b.closeout.on || '').localeCompare(a.closeout.on || ''));
  },
  /* same category, same template, or the project the template was made from */
  similarLessons(p) {
    const tp = p.template && Store.get(p.template);
    return PM2.lessons()
      .filter(
        x =>
          x.id !== p.id &&
          ((p.category && x.category === p.category) || (p.template && x.template === p.template) || (tp && tp.fromProject === x.id))
      )
      .slice(0, 3);
  },
};
