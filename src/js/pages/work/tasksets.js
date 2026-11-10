/* MAHAM — Task sets: groups of project tasks that repeat in many projects ("Go-live checklist", "Report request").
 *   ptaskset { name, team ('' = every team), tasks: [{ key, title, type, priority, points, est, startOff, dueOff, parent,
 *              after, description, checklist }] } — dates are days after the day the set is added
 * Made by the super admin, people with "Manage project templates", or an Admin with "Lists" (their team's sets).
 * Added to a project by whoever plans it (owner, team manager, super admin): every task is created at once, then editable. */
'use strict';

const TaskSets = {
  all() {
    return (Store.byC.ptaskset || []).filter(r => r && !r._del).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  },
  forTeam(team) {
    return TaskSets.all().filter(s => !s.team || s.team === team);
  },
  canManage(team) {
    return App.realSuper() || App.can('manageTemplates') || AdminRole.can(App.me, 'task-sets', team || App.viewTeam);
  },
  canAdd(p) {
    return !!p && Scrum.planner(p);
  },
  /* chosen tasks of a project → a set (dates counted from the earliest start / due among them) */
  fromTasks(name, team, tasks) {
    const days = tasks
      .flatMap(t => [t.start, t.due])
      .filter(Boolean)
      .sort();
    const s = days[0] || U.todayStr();
    const off = d => (d ? U.diffDays(s, d) : null);
    const key = new Map(tasks.map((t, i) => [t.id, 'k' + i]));
    return {
      c: 'ptaskset',
      id: U.uid('tset'),
      name,
      team,
      by: App.me,
      tasks: tasks.map(t => ({
        key: key.get(t.id),
        title: t.title,
        type: t.type || 'Task',
        priority: t.priority || 'Normal',
        points: t.points || 1,
        est: t.est || '',
        startOff: off(t.start),
        dueOff: off(t.due),
        parent: key.get(t.parent) || '',
        after: key.get(t.after) || '',
        description: t.description || '',
        checklist: PM2.checklist(t).map(x => ({ t: x.t, done: false })),
      })),
    };
  },
  /* a set → new task records in a project, starting on `start` */
  toTasks(set, p, start, sprint, who) {
    const at = o => (o === null || o === undefined || o === '' ? '' : U.addDays(start, +o));
    const ids = new Map((set.tasks || []).map(t => [t.key, U.uid('ptask')]));
    const col0 = Scrum.columns(p)[0];
    let n = Math.max(0, ...Scrum.items(p.id).map(t => +t.n || 0));
    return (set.tasks || []).map(t => ({
      id: ids.get(t.key),
      c: 'ptask',
      project: p.id,
      team: p.team,
      n: ++n,
      title: t.title,
      type: t.type,
      priority: t.priority,
      points: t.points,
      est: t.est,
      start: at(t.startOff),
      due: at(t.dueOff),
      parent: ids.get(t.parent) || '',
      after: ids.get(t.after) || '',
      description: t.description || '',
      checklist: (t.checklist || []).map(x => ({ t: x.t, done: false })),
      status: Scrum.startOf ? Scrum.startOf(p, t.type || 'Task') : col0,
      sprint: sprint || '',
      assignee: who || '',
      createdOn: U.todayStr(),
      fromSet: set.id,
    }));
  },
  /* ---------- dialogs ---------- */
  addDialog(p) {
    const sets = TaskSets.forTeam(p.team || 'apps');
    if (!sets.length)
      return UI.toast(
        TaskSets.canManage(p.team)
          ? 'No task sets yet — tick tasks in a project and press "Save as task set", or make one in Admin → Lists'
          : 'No task sets yet',
        'warn'
      );
    const sprints = Scrum.sprints(p.id).filter(s => s.status !== 'Completed');
    const ppl = [...new Set([p.manager, ...(p.members || [])])].filter(Boolean);
    UI.modal({
      title: `Add a task set — ${p.name}`,
      wide: true,
      body: `<form class="grid-form" id="tsf">${UI.field({ key: 'set', label: 'Task set', type: 'select', options: sets.map(s => [s.id, `${s.name} (${(s.tasks || []).length} tasks)`]), blank: false }, sets[0].id)}${UI.field({ key: 'start', label: 'Start (due dates count from here)', type: 'date' }, U.todayStr())}
        ${UI.field({ key: 'sprint', label: 'Sprint (optional)', type: 'select', options: [['', '— none —']].concat(sprints.map(s => [s.id, s.name || 'Sprint ' + (s.n || '')])), blank: false }, '')}${UI.field({ key: 'who', label: 'Give all to (optional)', type: 'select', options: [['', '— nobody yet —']].concat(ppl.map(id => [id, Store.memberShort(id)])), blank: false }, '')}</form>
        <div id="tsprev" class="small"></div>`,
      actions: '<span class="grow"></span><button class="btn primary" data-ok>Add the tasks</button>',
      onMount: w => {
        const f = w.querySelector('#tsf');
        const prev = () => {
          const s = Store.get(f.querySelector('[name=set]').value);
          const st = f.querySelector('[name=start]').value || U.todayStr();
          w.querySelector('#tsprev').innerHTML = s
            ? `<ol class="small">${(s.tasks || []).map(t => `<li>${h(t.title)}${t.dueOff != null && t.dueOff !== '' ? ` <span class="muted">· due ${U.fmtDate(U.addDays(st, +t.dueOff))}</span>` : ''}${+t.points ? ` <span class="muted">· ${t.points} pt</span>` : ''}</li>`).join('')}</ol>`
            : '';
        };
        f.querySelectorAll('select, input').forEach(i => (i.onchange = prev));
        prev();
        w.querySelector('[data-ok]').onclick = () => {
          const v = UI.readForm(f, [{ key: 'set' }, { key: 'start' }, { key: 'sprint' }, { key: 'who' }]);
          const s = Store.get(v.set);
          if (!s) return;
          const recs = TaskSets.toTasks(s, p, v.start || U.todayStr(), v.sprint, v.who);
          Store.saveMany(recs);
          UI.closeModal();
          UI.toast(`${recs.length} task(s) added from “${s.name}”`, 'good');
          App.render(true);
        };
      },
    });
  },
  saveDialog(p) {
    const tasks = Scrum.items(p.id)
      .filter(t => t.status !== 'Canceled')
      .sort((a, b) => (a.n || 0) - (b.n || 0));
    if (!tasks.length) return UI.toast('This project has no tasks yet', 'warn');
    UI.modal({
      title: 'Save tasks as a task set',
      wide: true,
      body: `<form class="grid-form" id="tss">${UI.field({ key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Go-live checklist' }, '')}${UI.field(
        {
          key: 'team',
          label: 'For',
          type: 'select',
          options: (App.realSuper() || App.can('manageTemplates') ? [['', 'Every team']] : []).concat(
            Store.teams()
              .filter(t => TaskSets.canManage(t.id))
              .map(t => [t.id, t.name])
          ),
          blank: false,
        },
        p.team || ''
      )}</form>
        <p class="small">Tick the tasks to keep (titles, types, points, estimates, checklists, order and the gaps between their dates — not the people or the status).</p>
        <div class="tbl-scroll" style="max-height:340px"><table class="tbl"><tbody>${tasks.map(t => `<tr><td class="ctr"><input type="checkbox" data-tsk="${h(t.id)}" checked></td><td>${h(t.title)}</td><td class="muted small">${h(t.type || 'Task')}${+t.points ? ' · ' + t.points + ' pt' : ''}${t.due ? ' · due ' + U.fmtDate(t.due) : ''}</td></tr>`).join('')}</tbody></table></div>`,
      actions: '<span class="grow"></span><button class="btn primary" data-ok>Save task set</button>',
      onMount: w =>
        (w.querySelector('[data-ok]').onclick = () => {
          const v = UI.readForm(w.querySelector('#tss'), [{ key: 'name' }, { key: 'team' }]);
          if (!v.name) return UI.toast('Give it a name', 'bad');
          const pick = [...w.querySelectorAll('[data-tsk]:checked')].map(i => Store.get(i.dataset.tsk)).filter(Boolean);
          if (!pick.length) return UI.toast('Tick at least one task', 'bad');
          Store.save(TaskSets.fromTasks(v.name, v.team, pick));
          UI.closeModal();
          UI.toast(`Task set “${v.name}” saved (${pick.length} tasks)`, 'good');
        }),
    });
  },
  /* edit a set: name, team, tasks (title, type, points, estimate, due in days), add / remove / reorder */
  editDialog(set) {
    const s = JSON.parse(JSON.stringify(set));
    const types = ['Task', 'Story', 'Bug', 'Subtask'];
    const row = (t, i) =>
      `<tr data-i="${i}"><td><input data-f="title" value="${h(t.title || '')}" style="width:100%"></td><td><select data-f="type">${types.map(x => `<option ${t.type === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td><td><input type="number" min="0" step="1" data-f="points" value="${t.points ?? 1}" style="width:60px"></td><td><input type="number" min="0" step="0.5" data-f="est" value="${t.est ?? ''}" style="width:70px"></td><td><input type="number" step="1" data-f="dueOff" value="${t.dueOff ?? ''}" style="width:70px"></td><td class="nw"><button type="button" class="btn xs ghost" data-up="${i}">↑</button><button type="button" class="btn xs ghost" data-rm="${i}">✕</button></td></tr>`;
    const body =
      () => `<form class="grid-form" id="tse">${UI.field({ key: 'name', label: 'Name', type: 'text', required: true }, s.name)}${UI.field(
        {
          key: 'team',
          label: 'For',
          type: 'select',
          options: (App.realSuper() || App.can('manageTemplates') ? [['', 'Every team']] : []).concat(
            Store.teams()
              .filter(t => TaskSets.canManage(t.id))
              .map(t => [t.id, t.name])
          ),
          blank: false,
        },
        s.team || ''
      )}</form>
      <div class="tbl-scroll"><table class="tbl"><thead><tr><th>Task</th><th>Type</th><th>Points</th><th>Estimate (h)</th><th>Due after (days)</th><th></th></tr></thead><tbody id="tserows">${(s.tasks || []).map(row).join('')}</tbody></table></div><button type="button" class="btn sm" id="tseadd">＋ Task</button>`;
    const readRows = w => {
      w.querySelectorAll('#tserows tr').forEach(tr => {
        const t = s.tasks[+tr.dataset.i];
        tr.querySelectorAll('[data-f]').forEach(i => {
          const k = i.dataset.f;
          t[k] = ['points', 'est', 'dueOff'].includes(k) ? (i.value === '' ? '' : +i.value) : i.value.trim();
        });
      });
      const f = w.querySelector('#tse');
      s.name = f.querySelector('[name=name]').value.trim();
      s.team = f.querySelector('[name=team]').value;
    };
    const open = () =>
      UI.modal({
        title: 'Task set',
        wide: true,
        body: body(),
        actions:
          '<button class="btn danger ghost" data-del>Delete set</button><span class="grow"></span><button class="btn primary" data-ok>Save</button>',
        onMount: w => {
          w.querySelector('#tseadd').onclick = () => {
            readRows(w);
            s.tasks.push({
              key: 'k' + Date.now(),
              title: '',
              type: 'Task',
              priority: 'Normal',
              points: 1,
              est: '',
              startOff: null,
              dueOff: '',
              parent: '',
              after: '',
              description: '',
              checklist: [],
            });
            UI.closeModal();
            open();
          };
          w.querySelectorAll('[data-rm]').forEach(
            b =>
              (b.onclick = () => {
                readRows(w);
                const k = s.tasks[+b.dataset.rm].key;
                s.tasks.splice(+b.dataset.rm, 1);
                s.tasks.forEach(t => {
                  if (t.parent === k) t.parent = '';
                  if (t.after === k) t.after = '';
                });
                UI.closeModal();
                open();
              })
          );
          w.querySelectorAll('[data-up]').forEach(
            b =>
              (b.onclick = () => {
                readRows(w);
                const i = +b.dataset.up;
                if (i > 0) [s.tasks[i - 1], s.tasks[i]] = [s.tasks[i], s.tasks[i - 1]];
                UI.closeModal();
                open();
              })
          );
          w.querySelector('[data-del]').onclick = () =>
            UI.confirm(`Delete the task set “${s.name}”? Tasks already added to projects stay.`, () => {
              Store.save(Object.assign({}, set, { _del: true }));
              UI.toast('Task set deleted', 'good');
              App.render(true);
            });
          w.querySelector('[data-ok]').onclick = () => {
            readRows(w);
            if (!s.name) return UI.toast('Give it a name', 'bad');
            s.tasks = s.tasks.filter(t => t.title);
            Store.save(s);
            UI.closeModal();
            UI.toast('Task set saved', 'good');
            App.render(true);
          };
        },
      });
    open();
  },
  /* the card in Admin → Lists */
  card() {
    const l = TaskSets.all().filter(
      s =>
        TaskSets.canManage(s.team || App.viewTeam) &&
        (App.realSuper() || !s.team || AdminRole.teamsOf(App.me).includes(s.team) || App.can('manageTemplates'))
    );
    return card(
      `Project task sets <span class="count">${l.length}</span>`,
      `<p class="muted small">Groups of tasks that repeat in many projects. In a project: <b>＋ Add task set</b> adds them all at once (due dates count from the day you pick); <b>Save as task set</b> makes one from ticked tasks.</p>
      ${
        l.length
          ? l
              .map(
                s =>
                  `<div class="li"><span class="grow"><b>${h(s.name)}</b> <span class="muted small">· ${s.team ? h(Store.teamName(s.team)) : 'every team'} · ${(s.tasks || []).length} task(s) · used in ${
                    Store.all('ptask', '*').filter(t => t.fromSet === s.id).length
                      ? new Set(
                          Store.all('ptask', '*')
                            .filter(t => t.fromSet === s.id)
                            .map(t => t.project)
                        ).size
                      : 0
                  } project(s)</span></span><button class="btn xs" data-tsedit="${h(s.id)}">Edit</button></div>`
              )
              .join('')
          : '<p class="muted small">No task sets yet.</p>'
      }
      <div class="row-btns"><button class="btn sm" id="tsnew">＋ New task set</button></div>`
    );
  },
  bindCard(root) {
    root.querySelectorAll('[data-tsedit]').forEach(b => (b.onclick = () => TaskSets.editDialog(Store.get(b.dataset.tsedit))));
    const n = root.querySelector('#tsnew');
    if (n)
      n.onclick = () =>
        TaskSets.editDialog({
          c: 'ptaskset',
          id: U.uid('tset'),
          name: '',
          team: App.realSuper() ? '' : App.viewTeam,
          by: App.me,
          tasks: [
            {
              key: 'k0',
              title: '',
              type: 'Task',
              priority: 'Normal',
              points: 1,
              est: '',
              startOff: null,
              dueOff: '',
              parent: '',
              after: '',
              description: '',
              checklist: [],
            },
          ],
        });
  },
};

(function () {
  // project page: "＋ Add task set" and "Save as task set" next to the tabs
  if (P.project) {
    const base = P.project;
    P.project = function (pid) {
      const out = base.apply(this, arguments);
      const p = Store.get(pid);
      if (!out || !out.html || !p || p.c !== 'project') return out;
      const btns =
        (TaskSets.canAdd(p) ? '<button class="btn sm" id="tsadd">＋ Add task set</button>' : '') +
        (TaskSets.canAdd(p) && TaskSets.canManage(p.team) ? '<button class="btn sm ghost" id="tssave">Save as task set</button>' : '');
      if (!btns) return out;
      const at = out.html.indexOf('<div class="tabs">');
      if (at < 0) return out;
      out.html =
        out.html.slice(0, at) + `<div class="row-btns" style="justify-content:flex-end;margin:0 0 6px">${btns}</div>` + out.html.slice(at);
      const m0 = out.mount;
      out.mount = root => {
        if (m0) m0(root);
        const a = root.querySelector('#tsadd');
        if (a) a.onclick = () => TaskSets.addDialog(Store.get(pid));
        const s = root.querySelector('#tssave');
        if (s) s.onclick = () => TaskSets.saveDialog(Store.get(pid));
      };
      return out;
    };
  }
  // the task sets card: Admin → Work & workflows → Projects (pages/admin-nav.js)
})();
