/* MAHAM — Admin → Workflows → To Do workflows (super admin only — they are settings).
 * The steps a To Do goes through after the person finishes it (Validation → Testing …), who does each step, the days
 * it has, a needed note, "a different person", where "Send back" goes, and the To Do types that use it by themselves.
 * Rules live in domain/todoflow.js. */
'use strict';

function adminTodoFlows() {
  const set = TodoFlow.set();
  const list = set.list || [];
  const types = set.types || [];
  const inUse = id =>
    (Store.byC.todo || []).filter(t => t && !t._del && t.wf === id && t.status !== 'Resolved' && t.status !== 'Canceled').length;
  const save = (patch, msg) => {
    Store.save(Object.assign({ id: 'settings-todoflows', c: 'settings', list: [], types: [] }, TodoFlow.set(), patch));
    if (msg) UI.toast(msg, 'good');
    App.render(true);
  };
  const html = card(
    `🔀 To Do workflows <span class="count">${list.length}</span>`,
    `<p class="muted small">The people a To Do is handed on to after the first person finishes it — e.g. <b>Testing → Go-live</b>. Each step is a <b>new To Do</b> for its person (own due days, scored like any To Do); finishing it hands on to the next step by itself, and the last one goes to the manager to confirm. The person before counts as done once handed on; the next person can <b>↩ Send back</b> with a reason, which reopens it until fixed. Managers pick a workflow in the To Do form — or it is chosen by itself from the To Do's <b>Type</b>.</p>
    ${
      list.length
        ? list
            .map(
              w => `<div class="li tfw"><div class="grow"><b>${h(w.name)}</b> <span class="muted small">· ${w.team ? h(Store.teamName(w.team)) : 'every team'}${(w.types || []).length ? ' · used by itself for: ' + w.types.map(h).join(', ') : ''} · ${inUse(w.id)} open To Do(s)</span>
      <div class="fl-chips">${['<span class="fl-chip" style="--c:#64748b">The work</span>'].concat((w.steps || []).map(s => `<span class="fl-chip" style="--c:#0e7c86">${h(s.name)} <small>${h(TodoFlow.whoLabel(s.who))}${+s.days ? ' · ' + +s.days + 'd' : ''}</small></span>`)).join('<span class="fl-arr">›</span>')}<span class="fl-arr">›</span><span class="fl-chip" style="--c:#16a34a">Manager confirms</span></div></div>
      <span class="row-btns tight"><button class="btn xs" data-tfwedit="${h(w.id)}">Edit</button>${inUse(w.id) ? '' : `<button class="btn xs ghost danger" data-tfwdel="${h(w.id)}">Delete</button>`}</span></div>`
            )
            .join('')
        : '<div class="muted small">No To Do workflows yet. Without one, a manager can still use <b>➜ Send on</b> on any finished To Do — a new To Do for the next person.</div>'
    }
    <div class="row-btns" style="margin-top:10px"><button class="btn primary sm" id="tfwnew">＋ New To Do workflow</button><button class="btn sm ghost" id="tfwex">Start from example</button></div>
    <div class="tfw-types"><b class="small">To Do types</b> <span class="muted small">(shown as “Type” in the To Do form; a workflow can be used by itself for some types)</span>
      <div class="row-btns" style="margin-top:6px"><input id="tfwtypes" value="${h(types.join(', '))}" placeholder="e.g. Order set change, Report request, Access request" style="flex:1"><button class="btn sm" id="tfwtsave">Save types</button></div></div>`
  );
  return {
    html,
    mount(root) {
      const ts = root.querySelector('#tfwtsave');
      if (ts)
        ts.onclick = () => {
          const v = root
            .querySelector('#tfwtypes')
            .value.split(',')
            .map(x => x.trim())
            .filter(Boolean);
          save({ types: [...new Set(v)] }, 'To Do types saved');
        };
      root.querySelector('#tfwnew').onclick = () =>
        tfwEdit(
          {
            id: U.uid('tfw'),
            name: '',
            team: '',
            types: [],
            steps: [{ name: 'Validation', who: 'pick', days: 2, needNote: false, notSame: true, backTo: '' }],
          },
          true
        );
      root.querySelector('#tfwex').onclick = () =>
        tfwEdit(
          {
            id: U.uid('tfw'),
            name: 'Validate and test',
            team: '',
            types: [],
            steps: [
              { name: 'Validation', who: 'teamleader', days: 2, needNote: false, notSame: true, backTo: '' },
              { name: 'Testing', who: 'pick', days: 2, needNote: true, notSame: true, backTo: '0' },
            ],
          },
          true
        );
      root.querySelectorAll('[data-tfwedit]').forEach(
        b =>
          (b.onclick = () => {
            const w = (TodoFlow.set().list || []).find(x => x.id === b.dataset.tfwedit);
            if (w) tfwEdit(JSON.parse(JSON.stringify(w)), false);
          })
      );
      root
        .querySelectorAll('[data-tfwdel]')
        .forEach(
          b =>
            (b.onclick = () =>
              UI.confirm('Delete this To Do workflow?', () =>
                save({ list: (TodoFlow.set().list || []).filter(x => x.id !== b.dataset.tfwdel) }, 'Deleted')
              ))
        );
    },
  };
}

/* the editor: one dialog, steps added / moved / removed in place */
function tfwEdit(w, isNew) {
  const people = Store.members().filter(m => m.active !== false && !Store.topRole(m.role));
  const whoOpts = () =>
    TodoFlow.WHO.concat(people.filter(m => !w.team || (m.team || 'apps') === w.team).map(m => ['m:' + m.id, Store.memberShort(m.id)]));
  const teams = Store.teams();
  const body = () => `<form class="grid-form" id="tfwf">
      ${UI.field({ key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Validate and test' }, w.name)}
      ${UI.field({ key: 'team', label: 'For', type: 'select', options: [['', 'Every team']].concat(teams.map(t => [t.id, t.name])), blank: false }, w.team)}
      <div class="fld span2"><label>Used by itself for these To Do types <span class="muted small">(optional — managers can also pick it in the form)</span></label><div class="row-btns wrap">${
        TodoFlow.types().length
          ? TodoFlow.types()
              .map(
                t =>
                  `<label class="check chip-check"><input type="checkbox" data-tfwty="${h(t)}" ${(w.types || []).includes(t) ? 'checked' : ''}> ${h(t)}</label>`
              )
              .join('')
          : '<span class="muted small">Add To Do types first (under the list of workflows).</span>'
      }</div></div>
    </form>
    <div class="tfw-steps"><div class="tfw-st0"><span class="fl-chip" style="--c:#64748b">The work</span> <span class="muted small">— done by the person the To Do is given to</span></div>
    ${w.steps
      .map(
        (s, i) => `<div class="tfw-step" data-i="${i}"><div class="tfw-n">${i + 1}</div>
      <div class="grid-form tfw-g">
        ${UI.field({ key: 'sname' + i, label: 'Step', type: 'text', required: true }, s.name)}
        ${UI.field({ key: 'swho' + i, label: 'Done by', type: 'select', options: whoOpts(), blank: false }, s.who)}
        ${UI.field({ key: 'sdays' + i, label: 'Due in (days)', type: 'number', min: 0, step: 1 }, s.days || 0)}
        ${UI.field({ key: 'sback' + i, label: '↩ Send back goes to', type: 'select', options: [['', i ? 'The step before (' + w.steps[i - 1].name + ')' : 'The person who did the work']].concat(i ? [['0', 'The person who did the work']].concat(w.steps.slice(0, i - 1).map((x, j) => [String(j + 1), x.name])) : []), blank: false }, s.backTo || '')}
        <div class="fld span2 row-btns"><label class="check"><input type="checkbox" data-sneed="${i}" ${s.needNote ? 'checked' : ''}> A comment is needed to finish it</label><label class="check"><input type="checkbox" data-snot="${i}" ${s.notSame ? 'checked' : ''}> Must be a different person from the one before</label></div>
      </div>
      <div class="tfw-side"><button type="button" class="btn xs ghost" data-sup="${i}" ${i ? '' : 'disabled'} title="Move up">▲</button><button type="button" class="btn xs ghost" data-sdown="${i}" ${i < w.steps.length - 1 ? '' : 'disabled'} title="Move down">▼</button><button type="button" class="btn xs ghost danger" data-sdel="${i}" ${w.steps.length > 1 ? '' : 'disabled'} title="Remove">✕</button></div></div>`
      )
      .join('')}
    <button type="button" class="btn sm" id="tfwadd">＋ Add a step</button>
    <div class="tfw-st0"><span class="fl-chip" style="--c:#16a34a">The manager confirms</span> <span class="muted small">— after the last step passes</span></div></div>
    <p class="muted small">Each step = a new To Do for that person. “Done by” <b>Chosen by the person who finishes the step before</b>: they pick who, when they finish.</p>`;
  const read = m => {
    const v = k => (m.querySelector(`[name="${k}"]`) || {}).value;
    w.name = (v('name') || '').trim();
    w.team = v('team') || '';
    w.types = [...m.querySelectorAll('[data-tfwty]')].filter(c => c.checked).map(c => c.dataset.tfwty);
    w.steps = w.steps.map((s, i) => ({
      name: (v('sname' + i) || '').trim(),
      who: v('swho' + i) || 'pick',
      days: +v('sdays' + i) || 0,
      backTo: v('sback' + i) || '',
      needNote: !!(m.querySelector(`[data-sneed="${i}"]`) || {}).checked,
      notSame: !!(m.querySelector(`[data-snot="${i}"]`) || {}).checked,
    }));
  };
  const redraw = m => {
    m.querySelector('.modal-body').innerHTML = body();
    bind(m);
  };
  const bind = m => {
    m.querySelector('#tfwadd').onclick = () => {
      read(m);
      w.steps.push({ name: '', who: 'pick', days: 2, needNote: false, notSame: true, backTo: '' });
      redraw(m);
    };
    m.querySelectorAll('[data-sdel]').forEach(
      b =>
        (b.onclick = () => {
          read(m);
          w.steps.splice(+b.dataset.sdel, 1);
          w.steps.forEach(s => {
            if (+s.backTo >= w.steps.length) s.backTo = '';
          });
          redraw(m);
        })
    );
    m.querySelectorAll('[data-sup]').forEach(
      b =>
        (b.onclick = () => {
          read(m);
          const i = +b.dataset.sup;
          [w.steps[i - 1], w.steps[i]] = [w.steps[i], w.steps[i - 1]];
          w.steps.forEach(s => {
            s.backTo = '';
          });
          redraw(m);
        })
    );
    m.querySelectorAll('[data-sdown]').forEach(
      b =>
        (b.onclick = () => {
          read(m);
          const i = +b.dataset.sdown;
          [w.steps[i + 1], w.steps[i]] = [w.steps[i], w.steps[i + 1]];
          w.steps.forEach(s => {
            s.backTo = '';
          });
          redraw(m);
        })
    );
    const tm = m.querySelector('[name=team]');
    if (tm)
      tm.onchange = () => {
        read(m);
        redraw(m);
      };
  };
  UI.modal({
    title: (isNew ? 'New' : 'Edit') + ' To Do workflow',
    wide: true,
    body: body(),
    actions:
      '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save workflow</button>',
    onMount: m => {
      bind(m);
      m.querySelector('[data-c]').onclick = UI.closeModal;
      m.querySelector('[data-ok]').onclick = () => {
        read(m);
        if (!w.name) return UI.toast('Give the workflow a name', 'bad');
        if (w.steps.some(s => !s.name)) return UI.toast('Every step needs a name', 'bad');
        const set = TodoFlow.set();
        const list = (set.list || []).filter(x => x.id !== w.id).concat([w]);
        // a type is used by one workflow per team at most
        for (const o of list)
          if (o.id !== w.id && (!o.team || !w.team || o.team === w.team)) o.types = (o.types || []).filter(t => !w.types.includes(t));
        Store.save(Object.assign({ id: 'settings-todoflows', c: 'settings', list: [], types: [] }, set, { list }));
        UI.closeModal();
        UI.toast('Workflow saved', 'good');
        App.render(true);
      };
    },
  });
}
