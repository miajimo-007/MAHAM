/* DARRIK — Meetings & minutes, follow-up of actions, decision log, personal tasks, 1:1 preparation. */
'use strict';

const actStatusBadge = t => {
  const s = Meetings.status(t);
  return UI.badge(
    UI.statusLabel(s),
    s === 'Done' || s === 'Ready for review'
      ? 'good'
      : s === 'Dropped'
        ? ''
        : Meetings.due(t) && Meetings.due(t) < U.todayStr()
          ? 'bad'
          : 'warn'
  );
};
const kindLabel = t => (t.c === 'mgrtask' ? 'director task' : t.c === 'todo' ? 'To Do' : t.c === 'action' ? 'meeting action' : 'personal');

function actionRow(t, m, opts = {}) {
  const due = Meetings.due(t);
  const late = Meetings.isOpen(t) && due && due < U.todayStr();
  const fu = m && (m.followups || {})[t.id];
  const p = t.project ? Store.get(t.project) : null;
  return `<div class="li act-row"><div class="grow"><b>${h(Meetings.title(t))}</b>${t.milestone ? ' <span class="tag-ms" title="Milestone">⭐</span>' : ''} <span class="muted small">· ${h(Store.memberShort(Meetings.who(t)))} · ${kindLabel(t)}${due ? ` · <span class="${late ? 't-bad strong' : ''}">due ${U.fmtDate(due)}</span>` : ''}${p ? ` · <a class="link" href="#/project/${h(p.id)}">${h(p.name)}</a>` : ''}</span>
      ${Meetings.detail(t) ? `<div class="small muted">${h(Meetings.detail(t))}</div>` : ''}${opts.from && t.fromMeeting && Store.get(t.fromMeeting) ? `<div class="small muted">From: <a class="link" href="#/meeting/${h(t.fromMeeting)}">${h(Store.get(t.fromMeeting).title)} · ${U.fmtDate(Store.get(t.fromMeeting).date)}</a></div>` : ''}</div>
    ${actStatusBadge(t)}${fu && (fu.outcome === 'open' || fu.outcome === 'due') ? ` ${UI.badge({ done: 'marked done', drop: 'dropped', due: 'new date ' + U.fmtDate(fu.due), open: 'still open' }[fu.outcome] || fu.outcome, '')}` : ''}
    ${App.forMe(Meetings.who(t)) && Meetings.isOpen(t) ? `<span class="nw">${t.c === 'mgrtask' ? `<button class="btn xs" data-edit="mgrtask|${h(t.id)}">Open</button>` : `<button class="btn xs" data-mineok="${h(t.id)}">✓ Done</button>`} <button class="btn xs ghost" data-mineupd="${h(t.id)}">Update</button></span>` : ''}
    ${opts.follow && Meetings.canEdit(m) && Meetings.isOpen(t) ? `<span class="nw"><button class="btn xs" data-fu="${h(t.id)}|done" title="Done">✓ Done</button> <button class="btn xs ghost" data-fu="${h(t.id)}|open">Still open</button> <button class="btn xs ghost" data-fu="${h(t.id)}|due">New date</button> <button class="btn xs ghost" data-fu="${h(t.id)}|drop">Drop</button></span>` : ''}</div>`;
}

/* new meeting (or the next one of a series) */
function meetingDialog(m, next) {
  const isNew = !m || next;
  const src = m || {};
  const people = Meetings.invitable()
    .filter(x => Store.visible().includes(x))
    .concat((src.attendees || []).map(id => Store.member(id)).filter(x => x && x.id !== App.me && !Meetings.invitable().includes(x)));
  const prevs = isNew && !next ? Meetings.continuable(src.type || Meetings.TYPES[0]) : [];
  const cur = new Set(src.attendees || []);
  const nextDate = src.date ? U.addDays(src.date, src.type === '1:1' ? 14 : 7) : U.todayStr();
  UI.modal({
    title: next ? 'Next meeting in this series' : isNew ? 'New meeting' : 'Edit meeting',
    wide: true,
    body: `<form class="grid-form" id="mtf">
      ${UI.field({ key: 'title', label: 'Title', type: 'text', required: true, span: 2 }, src.title || '')}
      ${UI.field({ key: 'type', label: 'Type', type: 'select', options: Meetings.TYPES, blank: false }, src.type || Meetings.TYPES[0])}
      ${UI.field({ key: 'date', label: 'Date', type: 'date', required: true }, next ? nextDate : src.date || U.todayStr())}
      <div class="fld span2"><label>Attendees</label><div class="pick">${people.map(x => `<label class="check"><input type="checkbox" name="att" value="${h(x.id)}" ${cur.has(x.id) ? 'checked' : ''}> ${h(Store.memberShort(x.id))} <span class="muted small">${h(Store.topRole(x.role) ? Store.titleOf(x) : Store.teamName(x.team) + ' · ' + Store.titleOf(x))}</span></label>`).join('')}</div></div>
      ${prevs.length ? UI.field({ key: 'contFrom', label: 'Continues from (its open actions come back for follow-up)', type: 'select', options: prevs.slice(0, 20).map(x => [x.id, `${x.title} · ${U.fmtDate(x.date)}`]), blank: '— a new series —', span: 2 }, prevs[0] && prevs[0].type === (src.type || Meetings.TYPES[0]) ? prevs[0].id : '') : ''}
      ${UI.field({ key: 'scribe', label: 'Minute-taker (optional) — can also write the minutes', type: 'select', options: people.map(x => [x.id, Store.memberShort(x.id)]), blank: '— only me —', span: 2 }, src.scribe || '')}
      ${isNew ? UI.field({ key: 'agenda', label: 'Agenda items (one per line)', type: 'textarea', span: 2, rows: 4 }, (src.items || []).map(i => i.title).join('\n') || 'Follow-up\nUpdates from teams\nProjects\nAny other business') : ''}
    </form>${next ? '<p class="muted small">Open actions from earlier meetings in this series appear automatically under "Follow-up from earlier meetings".</p>' : ''}`,
    actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>${isNew ? 'Create' : 'Save'}</button>`,
    onMount: w => {
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelector('[data-ok]').onclick = () => {
        const f = w.querySelector('#mtf');
        const v = UI.readForm(f, [
          { key: 'title' },
          { key: 'type' },
          { key: 'date' },
          { key: 'agenda' },
          { key: 'scribe' },
          { key: 'contFrom' },
        ]);
        if (!v.title || !v.date) return UI.toast('Title and date are needed', 'bad');
        const attendees = [...f.querySelectorAll('[name=att]:checked')].map(b => b.value);
        if (v.scribe && !attendees.includes(v.scribe)) attendees.push(v.scribe);
        let rec;
        if (isNew) {
          const items = String(v.agenda || '')
            .split('\n')
            .map(x => x.trim())
            .filter(Boolean)
            .map((t, i) => ({ id: 'i' + Date.now().toString(36) + i, title: t, notes: '', decision: '' }));
          rec = {
            id: U.uid('meeting'),
            c: 'meeting',
            owner: App.me,
            title: v.title,
            type: v.type,
            date: v.date,
            attendees,
            items,
            followups: {},
            privateNotes: '',
            scribe: v.scribe || '',
          };
          const cf = v.contFrom && Store.get(v.contFrom);
          rec.series = next ? src.series || src.id : cf ? cf.series || cf.id : rec.id;
        } else
          rec = Object.assign({}, Store.get(src.id), { title: v.title, type: v.type, date: v.date, attendees, scribe: v.scribe || '' });
        Store.save(rec);
        UI.closeModal();
        UI.toast(isNew ? 'Meeting created' : 'Saved', 'good');
        location.hash = '#/meeting/' + rec.id;
        App.render();
      };
    },
  });
}

/* add an action under an agenda item → creates the real task */
function actionDialog(m, item) {
  return assignDialog({ meeting: m, item }); // the one assign dialog, in meeting mode (anyone at the meeting)
}

function myTaskDialog(t) {
  UI.editRecord('mytask', t || { owner: App.me, status: 'Open', due: U.addDays(U.todayStr(), 7) });
}

P.meetings = sub => {
  if (!App.pageAllowed('meetings')) return { title: 'Meetings', html: empty('Not available.') };
  const tab = ['list', 'follow', 'decisions', 'mine'].includes(sub) ? sub : 'list';
  const ms = Meetings.all();
  const today = U.todayStr();
  let body;
  if (tab === 'list') {
    const row = m => {
      const acts = Meetings.actionsOf(m.id);
      const open = acts.filter(Meetings.isOpen).length;
      const fu = Meetings.followUps(m).filter(Meetings.isOpen).length;
      return `<tr class="click" data-meet="${h(m.id)}"><td class="nw">${U.fmtDate(m.date)}</td><td><b>${h(m.title)}</b>${m.date >= today ? ' ' + UI.badge(m.date === today ? 'today' : 'upcoming', 'warn') : ''}</td><td>${h(m.type || '')}</td><td>${h(Store.memberShort(m.owner))}</td><td class="num">${(m.attendees || []).length}</td><td class="num">${acts.length}${open ? ` <span class="t-warn">(${open} open)</span>` : ''}</td><td class="num">${fu || ''}</td></tr>`;
    };
    body = `<div class="page-actions"><span class="muted small">Write the minutes, give actions, and follow them up at the next meeting.</span><span class="grow"></span>${Meetings.canRun() ? '<button class="btn primary" id="newmeet">＋ New meeting</button>' : ''}</div>
      ${ms.length ? `<div class="card"><div class="tbl-scroll"><table class="tbl"><thead><tr><th>Date</th><th>Meeting</th><th>Type</th><th>Owner</th><th class="num">People</th><th class="num">Actions</th><th class="num">Follow-ups</th></tr></thead><tbody>${ms.map(row).join('')}</tbody></table></div></div>` : empty('No meetings yet.')}`;
  } else if (tab === 'follow') {
    const mine = ms.filter(m => m.owner === App.me);
    const acts = mine
      .flatMap(m => Meetings.actionsOf(m.id))
      .filter(Meetings.isOpen)
      .sort((a, b) => (Meetings.due(a) || '9').localeCompare(Meetings.due(b) || '9'));
    const groups = U.groupBy(acts, t => Meetings.who(t));
    body = `<p class="muted small">Every open action from meetings you run, by person.</p>${[...groups].map(([who, l]) => card(`${h(Store.memberShort(who))} <span class="count">${l.length}</span>`, l.map(t => actionRow(t, null, { from: true })).join(''))).join('') || empty('No open actions.')}`;
  } else if (tab === 'decisions') {
    const rows = Meetings.decisions().map(x => ({ m: x.m, i: x.i }));
    body = UI.table({
      id: 'decisions',
      rows,
      exportName: 'Decisions',
      onRow: true,
      cols: [
        { key: 'date', label: 'Date', get: x => U.fmtDate(x.m.date), sortVal: x => x.m.date || '' },
        { key: 'meeting', label: 'Meeting', get: x => x.m.title },
        { key: 'item', label: 'Topic', get: x => x.i.title },
        { key: 'decision', label: 'Decision', get: x => x.i.decision },
        { key: 'by', label: 'Chaired by', get: x => Store.memberShort(x.m.owner) },
      ],
      defaultSort: 'date',
    });
  } else {
    const list = Meetings.myTasks().sort(
      (a, b) => (a.status === 'Open' ? 0 : 1) - (b.status === 'Open' ? 0 : 1) || (a.due || '9').localeCompare(b.due || '9')
    );
    body = `<div class="page-actions"><span class="muted small">Your personal tasks — only you can see them.</span><span class="grow"></span><button class="btn primary" id="newmytask">＋ Task</button></div>
      ${card(
        'Open',
        list
          .filter(t => t.status === 'Open')
          .map(
            t =>
              `<div class="li click" data-edit="mytask|${h(t.id)}"><div class="grow"><b>${h(t.title)}</b><div class="muted small">${t.due ? 'Due ' + U.fmtDate(t.due) : 'No date'}${t.fromMeeting && Store.get(t.fromMeeting) ? ' · from ' + h(Store.get(t.fromMeeting).title) : ''}${t.note ? ' · ' + h(t.note) : ''}</div></div>${t.due && t.due < today ? UI.badge('Overdue', 'bad') : ''}<button class="btn xs" data-mydone="${h(t.id)}">✓ Done</button></div>`
          )
          .join('') || empty('Nothing open.')
      )}
      ${card(
        'Done',
        list
          .filter(t => t.status !== 'Open')
          .slice(0, 30)
          .map(
            t =>
              `<div class="li click" data-edit="mytask|${h(t.id)}"><span class="grow">${h(t.title)}</span>${UI.sbadge(t.status === 'Done' ? 'Done' : 'Canceled')}</div>`
          )
          .join('') || empty('—')
      )}`;
  }
  const tabs = [
    ['list', 'Meetings'],
    ...(Meetings.canRun()
      ? [
          ['follow', 'Open actions'],
          ['mine', 'My tasks'],
        ]
      : []),
    ['decisions', 'Decision log'],
  ];
  return {
    title: 'Meetings',
    html: `<div class="tabs">${tabs.map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/meetings/${k}">${l}</a>`).join('')}</div>${body}`,
    mount(root) {
      root.querySelectorAll('[data-meet]').forEach(
        r =>
          (r.onclick = () => {
            location.hash = '#/meeting/' + r.dataset.meet;
          })
      );
      const nm = root.querySelector('#newmeet');
      if (nm) nm.onclick = () => meetingDialog(null);
      const nt = root.querySelector('#newmytask');
      if (nt) nt.onclick = () => myTaskDialog();
      bindMyTasks(root);
      UI.bindTables(root, {
        decisions: x => {
          location.hash = '#/meeting/' + x.m.id;
        },
      });
    },
  };
};
function bindMyTasks(root) {
  root.querySelectorAll('[data-mydone]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        const t = Store.get(b.dataset.mydone);
        Store.save(Object.assign({}, t, { status: 'Done', doneDate: U.todayStr() }));
        UI.toast('Done ✓', 'good');
        App.render();
      })
  );
}

P.meeting = id => {
  const m = Store.get(id);
  if (!m || m.c !== 'meeting' || !Meetings.canSee(m))
    return {
      title: 'Meeting',
      html: empty('Meeting not found, or you did not attend it.') + '<p><a class="link" href="#/meetings">← Meetings</a></p>',
    };
  const ed = Meetings.canEdit(m);
  const fus = Meetings.followUps(m);
  const ser = Meetings.series(m);
  const items = m.items || [];
  const html = `<p><a class="link" href="#/meetings">← Meetings</a></p>
  <div class="card phead"><div class="ph-main"><h2>${h(m.title)}</h2><div class="muted small">${h(m.type || '')} · ${U.fmtDate(m.date)} · chaired by ${h(Store.memberShort(m.owner))}${ser.length > 1 ? ` · meeting ${ser.findIndex(x => x.id === m.id) + 1} of ${ser.length} in this series` : ''}</div>
      <div class="small" style="margin-top:6px">${(m.attendees || []).map(a => `<span class="chip">${h(Store.memberShort(a))}</span>`).join(' ') || '<span class="muted">No attendees listed</span>'}</div></div>
    <div class="ph-side">${ed ? '<button class="btn sm" id="editmeet">Edit details</button><button class="btn sm primary" id="nextmeet">＋ Next meeting</button>' : ''}</div></div>
  ${fus.length ? card(`Follow-up from earlier meetings <span class="count">${fus.filter(Meetings.isOpen).length} open</span>`, fus.map(t => actionRow(t, m, { follow: true, from: true })).join('')) : ''}
  ${items
    .map(it => {
      const acts = Meetings.actionsOf(m.id).filter(t => t.fromItem === it.id);
      return `<section class="card agenda"><div class="card-head"><h3>${ed ? `<input class="ag-title" value="${h(it.title)}" data-mf="${h(it.id)}|title">` : h(it.title)}</h3>${ed && !acts.length ? `<button class="btn xs ghost" data-delitem="${h(it.id)}" title="Remove this item">✕</button>` : ''}</div>
      <div class="grid-form">
        <div class="fld span2"><label>Notes</label>${ed ? `<textarea rows="3" data-mf="${h(it.id)}|notes" placeholder="What was discussed">${h(it.notes || '')}</textarea>` : `<div class="ro">${h(it.notes || '—')}</div>`}</div>
        <div class="fld span2"><label>Decision</label>${ed ? `<textarea rows="2" data-mf="${h(it.id)}|decision" placeholder="What was agreed (goes to the decision log)">${h(it.decision || '')}</textarea>` : `<div class="ro">${h(it.decision || '—')}</div>`}</div>
      </div>
      <h4 class="act-h">Actions ${acts.length ? `<span class="count">${acts.length}</span>` : ''}</h4>${acts.map(t => actionRow(t, m)).join('') || '<p class="muted small">No actions.</p>'}
      ${ed ? `<div class="row-btns tight"><button class="btn xs" data-addact="${h(it.id)}">＋ Action</button></div>` : ''}</section>`;
    })
    .join('')}
  ${ed ? `<div class="row-btns"><button class="btn" id="additem">＋ Agenda item</button><span class="grow"></span><span class="muted small" id="mtsaved"></span></div>` : ''}
  ${ed && m.owner === App.me ? card('Private notes <span class="muted small">— only you can see these</span>', `<textarea rows="3" style="width:100%" data-mf="_|privateNotes" placeholder="Your own notes">${h(m.privateNotes || '')}</textarea>`) : ''}`;
  return {
    title: 'Meeting',
    html,
    mount(root) {
      // minutes save as you type (when you leave a box)
      root.querySelectorAll('[data-mf]').forEach(el =>
        el.addEventListener('change', () => {
          const cur = Store.get(m.id);
          if (!cur) return;
          const [iid, f] = el.dataset.mf.split('|');
          const val = el.value;
          const out =
            iid === '_'
              ? Object.assign({}, cur, { [f]: val })
              : Object.assign({}, cur, { items: (cur.items || []).map(i => (i.id === iid ? Object.assign({}, i, { [f]: val }) : i)) });
          Store.save(out);
          const s = root.querySelector('#mtsaved');
          if (s) s.textContent = 'Saved ' + U.fmtTs(Date.now()).slice(-5);
        })
      );
      const em = root.querySelector('#editmeet');
      if (em) em.onclick = () => meetingDialog(m);
      const nx = root.querySelector('#nextmeet');
      if (nx) nx.onclick = () => meetingDialog(m, true);
      const ai = root.querySelector('#additem');
      if (ai)
        ai.onclick = () =>
          UI.modal({
            title: 'Agenda item',
            body: `<form class="grid-form" id="aif">${UI.field({ key: 't', label: 'Topic', type: 'text', required: true, span: 2 }, '')}</form>`,
            actions: `<span class="grow"></span><button class="btn primary" data-ok>Add</button>`,
            onMount: w => {
              w.querySelector('[data-ok]').onclick = () => {
                const t = w.querySelector('[name=t]').value.trim();
                if (!t) return;
                const cur = Store.get(m.id);
                Store.save(
                  Object.assign({}, cur, {
                    items: (cur.items || []).concat([{ id: 'i' + Date.now().toString(36), title: t, notes: '', decision: '' }]),
                  })
                );
                UI.closeModal();
                App.render();
              };
            },
          });
      root.querySelectorAll('[data-delitem]').forEach(
        b =>
          (b.onclick = () =>
            UI.confirm('Remove this agenda item?', () => {
              const cur = Store.get(m.id);
              Store.save(Object.assign({}, cur, { items: cur.items.filter(i => i.id !== b.dataset.delitem) }));
              App.render();
            }))
      );
      root.querySelectorAll('[data-addact]').forEach(
        b =>
          (b.onclick = () =>
            actionDialog(
              Store.get(m.id),
              (Store.get(m.id).items || []).find(i => i.id === b.dataset.addact)
            ))
      );
      bindMineActions(root);
      root.querySelectorAll('[data-fu]').forEach(
        b =>
          (b.onclick = () => {
            const [tid, what] = b.dataset.fu.split('|');
            const t = Store.get(tid);
            if (!t) return;
            if (what === 'due')
              return UI.modal({
                title: 'New due date',
                body: `<form class="grid-form" id="ndf">${UI.field({ key: 'd', label: 'New due date', type: 'date', required: true }, U.addDays(U.todayStr(), 7))}</form>`,
                actions: `<span class="grow"></span><button class="btn primary" data-ok>Save</button>`,
                onMount: w => {
                  w.querySelector('[data-ok]').onclick = () => {
                    const d = w.querySelector('[name=d]').value;
                    if (!d) return;
                    Meetings.outcome(Store.get(m.id), t, 'due', d);
                    UI.closeModal();
                    UI.toast('New date set', 'good');
                    App.render();
                  };
                },
              });
            if (what === 'drop')
              return UI.confirm(`Drop "${Meetings.title(t)}"?${t.c === 'mgrtask' ? ' Forwarded To Dos are canceled too.' : ''}`, () => {
                Meetings.outcome(Store.get(m.id), t, 'drop');
                UI.toast('Dropped');
                App.render();
              });
            Meetings.outcome(Store.get(m.id), t, what);
            UI.toast(what === 'done' ? 'Marked done ✓' : 'Kept open', 'good');
            App.render();
          })
      );
    },
  };
};

/* 1:1 preparation for one manager */
P.oneonone = mid => {
  const mgr = Store.member(mid);
  if (!mgr || !(App.isDir() || App.isSuper())) return { title: '1:1', html: empty('Not available.') };
  const y = App.year,
    saved = App.viewTeam;
  App.viewTeam = mgr.team || 'apps';
  const K = Calc.kpis(y);
  App.viewTeam = saved;
  const tasks = mineOrAll(Store.all('mgrtask'))
    .filter(t => t.manager === mid)
    .map(mtDerive)
    .filter(x => x.open);
  const projs = Store.all('project')
    .filter(p => p.manager === mid)
    .map(projDerive)
    .filter(x => x.open);
  const ones = Store.all('meeting')
    .filter(m => m.type === '1:1' && m.owner === App.me && (m.attendees || []).includes(mid))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const last = ones[0];
  const html = `<p><a class="link" href="#/home">← Director Desk</a></p>
  <div class="hello"><div><h1>1:1 with ${h(mgr.name)}</h1><p class="muted">${h(Store.teamName(mgr.team))} team · ${Store.delegationOf(mid) ? '🌴 on leave now' : 'manager'}</p></div><div class="row-btns"><button class="btn primary" id="start11">${last && last.date >= U.todayStr() ? 'Open the planned 1:1' : '＋ Start a 1:1'}</button></div></div>
  <div class="kpis">${UI.kpi('Team score', K.teamScore != null ? U.num(K.teamScore, 1) : '–', 'YTD', UI.scoreClass(K.teamScore))}${UI.kpi('To Do on time', U.pct(K.onTime, 0), '')}${UI.kpi('Avg closing', K.avgClosing != null ? U.num(K.avgClosing, 2) + ' h' : '–', 'help desk')}${UI.kpi('Open tasks from you', tasks.length, `${tasks.filter(x => x.late).length} overdue`, tasks.some(x => x.late) ? 'sc-e' : '')}${UI.kpi('Active projects', projs.length, `${projs.filter(x => ['Behind', 'Overdue'].includes(x.health)).length} need attention`)}</div>
  <div class="cols2">
    ${card('Open tasks from you', tasks.map(x => actionRow(x.r, null, { from: true })).join('') || empty('None.'))}
    ${card('Their projects', projs.map(x => `<div class="li click" data-proj="${h(x.r.id)}"><div class="grow"><b>${h(x.r.name)}</b><div style="max-width:240px">${UI.bar(x.prog)}</div></div>${UI.badge(x.health, healthKind(x.health))}</div>`).join('') || empty('None.'))}
  </div>
  ${
    last
      ? card(
          `Last 1:1 — ${U.fmtDate(last.date)}`,
          `${
            (last.items || [])
              .filter(i => i.notes || i.decision)
              .map(
                i =>
                  `<div class="li"><div class="grow"><b>${h(i.title)}</b>${i.notes ? `<div class="small">${h(i.notes)}</div>` : ''}${i.decision ? `<div class="small">✔ ${h(i.decision)}</div>` : ''}</div></div>`
              )
              .join('') || '<p class="muted small">No notes.</p>'
          }
      <h4 class="act-h">Actions</h4>${
        Meetings.actionsOf(last.id)
          .map(t => actionRow(t, null))
          .join('') || '<p class="muted small">None.</p>'
      }
      <p><a class="link" href="#/meeting/${h(last.id)}">Open the minutes →</a></p>`
        )
      : ''
  }`;
  return {
    title: '1:1 preparation',
    html,
    mount(root) {
      root.querySelector('#start11').onclick = () => {
        if (last && last.date >= U.todayStr()) {
          location.hash = '#/meeting/' + last.id;
          return;
        }
        const rec = {
          id: U.uid('meeting'),
          c: 'meeting',
          owner: App.me,
          title: `1:1 — ${mgr.short || mgr.name}`,
          type: '1:1',
          date: U.todayStr(),
          attendees: [mid],
          followups: {},
          privateNotes: '',
          items: ['Follow-up', 'Team & workload', 'Projects', 'Support needed', 'Other'].map((t, i) => ({
            id: 'i' + Date.now().toString(36) + i,
            title: t,
            notes: '',
            decision: '',
          })),
        };
        rec.series = last ? last.series || last.id : rec.id;
        Store.save(rec);
        location.hash = '#/meeting/' + rec.id;
      };
    },
  };
};

/* the person an action belongs to: Done / Update (meeting page, My work) */
function bindMineActions(root) {
  root.querySelectorAll('[data-mineok]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        const t = Store.get(b.dataset.mineok);
        if (!t) return;
        Meetings.mineDone(t);
        UI.toast(
          Store.get(t.id) && Store.get(t.id).status === 'Ready for review' ? 'Done — waiting for your manager to confirm' : 'Marked done ✓',
          'good'
        );
        App.render();
      })
  );
  root.querySelectorAll('[data-mineupd]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        const t = Store.get(b.dataset.mineupd);
        if (!t) return;
        UI.modal({
          title: 'Update: ' + Meetings.title(t),
          body: `<form class="grid-form" id="muf">${UI.field({ key: 'u', label: 'Where are you with it?', type: 'textarea', span: 2, rows: 3 }, t.update || t.comment || t.note || '')}</form>`,
          actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>`,
          onMount: w => {
            w.querySelector('[data-c]').onclick = UI.closeModal;
            w.querySelector('[data-ok]').onclick = () => {
              Meetings.mineUpdate(Store.get(t.id), w.querySelector('[name=u]').value.trim());
              UI.closeModal();
              UI.toast('Update saved', 'good');
              App.render();
            };
          },
        });
      })
  );
}
