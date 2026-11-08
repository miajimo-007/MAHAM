/* MAHAM — Manager Desk. */
'use strict';

P.manager = () => {
  const y = App.year,
    today = U.todayStr(),
    team = Store.scoredTeam(),
    meta = Store.meta();
  const K = Calc.kpis(y);
  const updated = meta.helpdeskUpdated === today;
  const pendingQW = Store.all('quickwin')
    .filter(q => !q.approval)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const overdue = Calc.todos(null).filter(t => t.status === 'In Progress' && t.timing === 'Delayed');
  const open = Calc.todos(null).filter(t => t.status === 'In Progress');
  const riyMgr = Store.all('central').filter(r => Calc.centralComment(r) === 'Need Manager Follow Up');
  const att = Calc.attMap(y);
  const swToday = Calc.shadow(y).filter(s => s.r.date === today);
  const myMt = Store.all('mgrtask')
    .filter(r => App.forMe(r.manager))
    .map(mtDerive)
    .filter(x => x.open)
    .sort(
      (a, b) => (b.st === Chain.ST.REVIEW) - (a.st === Chain.ST.REVIEW) || b.late - a.late || (a.r.due || '9').localeCompare(b.r.due || '9')
    );
  const myPj = Store.all('project')
    .filter(r => App.forMe(r.manager))
    .map(projDerive)
    .filter(x => x.open);
  const actingNote = App.acting()
    .map(mid => {
      const d = Store.delegationOf(mid);
      return `<div class="insights"><div>🔁 <b>You are acting for ${h(Store.memberShort(mid))}</b>${d && d.end ? ' until ' + U.fmtDate(d.end) : ''} — their tasks from the director, projects and approvals are yours while they are on leave.${d && d.note ? ' <span class="muted">' + h(d.note) + '</span>' : ''}</div></div>`;
    })
    .join('');
  const myLeave = Store.delegationOf(App.me);
  const leaveNote = myLeave
    ? `<div class="insights warnbox"><div>🌴 You are marked as on leave${myLeave.end ? ' until ' + U.fmtDate(myLeave.end) : ''}. <b>${h(Store.memberShort(myLeave.to))}</b> is acting for you.</div></div>`
    : '';
  const dirCard = myMt.length
    ? card(
        `From the director <span class="count">${myMt.length}</span>${myMt.some(x => x.st === Chain.ST.REVIEW) ? ` ${UI.badge(myMt.filter(x => x.st === Chain.ST.REVIEW).length + ' ready for review', 'good')}` : ''}`,
        myMt
          .map(
            x =>
              `<div class="li click" data-edit="mgrtask|${h(x.r.id)}"><div class="grow"><b>${h(x.r.task)}</b><div class="muted small">${x.r.due ? 'Due ' + U.fmtDate(x.r.due) : 'No due date'}${x.r.comment ? ' · 📝 ' + h(x.r.comment) : ''}</div>${chainView(x.r, { empty: false })}</div><div class="row-btns tight col">${chainButtons(x.r)}${escBtn(x.r)}${x.late ? UI.badge('Overdue', 'bad') : ''}</div></div>`
          )
          .join(''),
        '<a href="#/mgrtasks" class="link">All →</a>'
      )
    : '';
  const pjCard = myPj.length
    ? card(
        `My projects <span class="count">${myPj.length}</span>`,
        myPj
          .map(
            x =>
              `<div class="li click" data-proj="${h(x.r.id)}"><div class="grow"><b>${h(x.r.name)}</b><div style="max-width:260px">${UI.bar(x.prog)}</div><div class="muted small">${x.prog}% · target ${U.fmtDate(x.r.due) || '—'}</div></div>${UI.badge(x.health, healthKind(x.health))}${escBtn(x.r)}</div>`
          )
          .join(''),
        '<a href="#/projects" class="link">All →</a>'
      )
    : '';
  const fromDir = App.isDir() ? '' : dirCard && pjCard ? `<div class="cols2">${dirCard}${pjCard}</div>` : dirCard + pjCard;
  const workCard = App.isMgr() ? myWorkCard({ hideEmpty: true }) : '';
  /* empty boxes become one small line */
  const quiet = [
    App.isMgr() && !workCard ? 'nothing assigned to you' : '',
    !App.isDir() && !dirCard ? 'nothing from the director' : '',
    !App.isDir() && !pjCard ? 'no active projects' : '',
    !pendingQW.length ? 'no quick wins to approve' : '',
  ].filter(Boolean);
  /* Team today: everyone counts as on duty unless marked — show only the exceptions */
  const offDay = U.isOff(today);
  const exc = team.map(m => ({ m, a: att[today + '|' + m.id] })).filter(x => x.a && (x.a.status === 'OFF' || +x.a.permHrs));
  const swH = U.sum(swToday.map(s => s.hrs));
  const teamToday = card(
    `Team today ${offDay ? `<span class="count">${h(Store.holidayOf(today) || 'Weekend')}</span>` : `<span class="count">${team.length - exc.filter(x => x.a.status === 'OFF').length}/${team.length} on duty</span>`}`,
    `${offDay ? '' : exc.length ? `<table class="tbl"><tbody>${exc.map(({ m, a }) => `<tr class="click" data-emp="${h(m.id)}"><td><b>${h(Store.memberShort(m.id))}</b></td><td>${a.status === 'OFF' ? UI.badge(a.leave || 'Off', 'warn') : UI.badge('On duty', 'good')}${+a.permHrs ? ' ' + UI.badge('Permission ' + a.permHrs + 'h') : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">✓ Everyone is on duty — nobody marked leave or permission.</p>'}<p class="muted small">Shadow work logged today: <b>${U.num(swH, 1)} h</b> · open To Dos: <b>${open.length}</b></p>`
  );
  /* "Needs you": one line of counts at the top — click one to jump to its box */
  const toConfirm = Store.all('todo').filter(t => Store.canConfirmTodo(t, App.me)).length;
  const nyItems = [
    [Requests.waitingForMe().length, 'requests to approve', 'Waiting for your approval'],
    [App.can('approveQW') ? pendingQW.length : 0, 'quick wins to approve', 'Quick wins waiting'],
    [toConfirm, 'To Dos to confirm', 'To Dos to confirm'],
    ...(typeof TodoFlow !== 'undefined'
      ? [
          [Store.all('todo').filter(t => TodoFlow.needsPick(t)).length, 'To Do steps to give to someone', '#/todo'],
          [TodoFlow.stuck().length, 'To Do steps over time', '#/todo'],
          [TodoFollow.openForMe().length, 'follow-up requests', '#/manager'],
        ]
      : []),
    [overdue.length, 'overdue To Dos', 'Overdue To Do'],
    [App.isDir() ? 0 : myMt.length, 'from the director', 'From the director'],
    [riyMgr.length, 'Central follow-ups', '#/central'],
  ].filter(x => x[0]);
  const needsYou = nyItems.length
    ? `<div class="needs-you"><b>Needs you</b>${nyItems.map(([n, l, to]) => `<a href="${to[0] === '#' ? to : '#'}" class="ny-chip" ${to[0] === '#' ? '' : `data-jump="${h(to)}"`}><span class="n">${n}</span> ${h(l)}</a>`).join('')}</div>`
    : '<div class="needs-you ok">✓ Nothing needs you right now.</div>';
  const html = `${annBanner()}${FB.banner()}${Dir.nudgeBanner()}${actingNote}${leaveNote}
  ${App.isSuper() && Store.all('todo').length + Store.all('shadow').length === 0 ? `<div class="insights warnbox"><div>📥 The app has no data yet. <a class="btn sm primary" href="#/importdata">Import the old Excel sheets</a></div></div>` : ''}
  <div class="hello slim"><div><p class="muted">${U.fmtDate(today)}${U.isOff(today) ? ' · ' + h(Store.holidayOf(today) || 'Weekend') : ''} · ${h(Store.teamName(App.viewTeam))}${App.isDir() ? ' team' : ''}</p></div><span class="grow"></span>${App.can('assignTodo') && App.canEdit('todo') ? '<button class="btn primary" data-assign>＋ Assign a To Do</button>' : ''}${App.pageAllowed('reports') ? '<a class="btn" href="#/reports" data-repweek>📄 Weekly report</a>' : ''}</div>
  ${needsYou}${(() => {
    if (typeof TodoFollow === 'undefined') return '';
    const l = TodoFollow.openForMe();
    if (!l.length) return '';
    return card(
      `🙋 Follow-up requests <span class="count">${l.length}</span>`,
      l
        .map(a => {
          const t = Store.get(a.on);
          return `<div class="li"><div class="grow click" data-edit="todo|${h(a.on)}"><b>${h(a.text)}</b><div class="muted small">${h(Store.memberShort(a.by))} · from “${h(t ? t.task : '')}”</div></div><button class="btn xs primary" data-tfacc="${h(a.id)}">Make it a To Do</button> <button class="btn xs ghost" data-tfdec="${h(a.id)}">Decline</button></div>`;
        })
        .join('')
    );
  })()}${(() => {
    if (typeof TodoFlow === 'undefined') return '';
    const l = TodoFlow.stuck();
    if (!l.length) return '';
    return card(
      `🔀 To Do steps over time <span class="count">${l.length}</span>`,
      l
        .slice(0, 8)
        .map(t => {
          const s = TodoFlow.state(t);
          const st = s.steps[s.cur];
          return `<div class="li click" data-edit="todo|${h(t.id)}"><div class="grow"><b>${h(t.task)}</b><div class="muted small">${h(st.name)} with ${h(Store.memberShort(s.with))} · ${s.stepLate} day${s.stepLate > 1 ? 's' : ''} over${s.backs ? ' · sent back ×' + s.backs : ''}</div></div></div>`;
        })
        .join('')
    );
  })()}
  ${approvalsCard()}
  ${workCard}
  ${(() => {
    const rv = Store.all('todo').filter(t => Store.canConfirmTodo(t, App.me));
    return rv.length
      ? card(
          `To Dos to confirm <span class="count">${rv.length}</span>`,
          UI.cap('mgr-confirm', rv, 5)
            .map(
              t =>
                `<div class="li"><span class="grow"><b>${h(t.task)}</b> <span class="muted small">· ${h(Store.memberShort(t.analyst))} · finished ${U.fmtDate(t.finish)}${t.comment ? ' · 💬 ' + h(t.comment) : ''}</span></span><button class="btn xs primary" data-tdok="${h(t.id)}">✓ Confirm</button> <button class="btn xs ghost" data-tdback="${h(t.id)}">↩ Send back</button></div>`
            )
            .join('') + UI.capMore('mgr-confirm', rv.length, 5)
        )
      : '';
  })()}
  ${(() => {
    const mine = Meetings.myTasks().filter(t => t.status === 'Open');
    return mine.length
      ? card(
          `My tasks <span class="count">${mine.length}</span>`,
          mine
            .slice(0, 6)
            .map(
              t =>
                `<div class="li click" data-edit="mytask|${h(t.id)}"><div class="grow"><b>${h(t.title)}</b><div class="muted small">${t.due ? 'Due ' + U.fmtDate(t.due) : 'No date'}${t.fromMeeting && Store.get(t.fromMeeting) ? ' · from ' + h(Store.get(t.fromMeeting).title) : ''}</div></div><button class="btn xs" data-mydone="${h(t.id)}">✓ Done</button></div>`
            )
            .join(''),
          '<a href="#/meetings/mine" class="link">All →</a>'
        )
      : '';
  })()}
  ${updated ? '' : `<div class="insights warnbox"><div>⚠ ManageEngine data has <b>not been imported today</b> (last: ${meta.helpdeskUpdated ? U.fmtDate(meta.helpdeskUpdated) : 'never'}). Dashboards use the last import. <a class="btn sm primary" href="#/helpdesk/import">Import now</a></div></div>`}
  <div class="kpis">
    ${UI.kpi('Team score', K.teamScore != null ? U.num(K.teamScore, 1) : '–', 'YTD average', UI.scoreClass(K.teamScore))}
    ${UI.kpi('Quick wins to approve', pendingQW.length, 'waiting for you', pendingQW.length ? 'sc-c' : '')}
    ${UI.kpi('To Do in progress', open.length, `<b class="${overdue.length ? 't-bad' : ''}">${overdue.length} overdue</b>`)}
    ${UI.kpi('Central — your follow-up', riyMgr.length, '> 90 days under review', riyMgr.length ? 'sc-e' : '')}
    ${UI.kpi('Help desk data', updated ? 'Today ✓' : 'Not today', updated ? 'imported' : 'import needed', updated ? 'sc-a' : 'sc-e')}
  </div>
  ${fromDir}
  ${GC.mgrCard()}
  ${UsageR.mgrLine()}
  ${quiet.length ? `<div class="oneline">✓ ${quiet.join(' · ').replace(/^./, c => c.toUpperCase())}</div>` : ''}
  ${(() => {
    // full rows only: Assign | Quick wins, Overdue | Team today + activity — a box with no partner moves up
    const A = '',
      Q = `${
        !pendingQW.length
          ? ''
          : card(
              `Quick wins waiting for approval <span class="count">${pendingQW.length}</span>`,
              pendingQW.length
                ? UI.cap('mgr-qw', pendingQW, 5)
                    .map(
                      q =>
                        `<div class="li"><div class="grow click" data-edit="quickwin|${h(q.id)}"><b>${h(q.subject)}</b><div class="muted small">${h(Store.memberShort(q.analyst))} · ${h(q.module || '')} · ${h(q.type || '')} · expected ${U.fmtDate(q.expected) || '—'}</div></div>${App.can('approveQW') ? `<button class="btn sm primary" data-qwa="${h(q.id)}">Approve</button><button class="btn sm ghost" data-qwr="${h(q.id)}">Reject</button>` : ''}</div>`
                    )
                    .join('') + UI.capMore('mgr-qw', pendingQW.length, 5)
                : empty('Nothing to approve.')
            )
      }`,
      O = overdue.length
        ? `${
            overdue.length
              ? card(
                  `Overdue To Do <span class="count">${overdue.length}</span>`,
                  `<table class="tbl"><thead><tr><th>Analyst</th><th>To Do</th><th>Due</th><th class="num">Days late</th><th></th></tr></thead><tbody>${overdue
                    .sort((a, b) => b.days - a.days)
                    .slice(0, Custom.target('overdueRows'))
                    .map(
                      t =>
                        `<tr class="click" data-edit="todo|${h(t.r.id)}"><td>${memberCell(t.r.analyst)}</td><td>${h(t.r.task)}${t.r.comment ? `<div class="muted small">💬 ${h(t.r.comment)}</div>` : ''}</td><td class="nw">${U.fmtDate(t.due)}</td><td class="num t-bad">${t.days}</td><td class="nw">${t.r.nudgedOn === today ? '<span class="muted small">asked ✓</span>' : `<button class="btn xs ghost" data-nudge="${h(t.r.id)}" title="Ask the analyst for an update — they see it on Analyst Desk">Ask for update</button>`}</td></tr>`
                    )
                    .join('')}</tbody></table>`,
                  `<a href="#/todo" class="link">${overdue.length > Custom.target('overdueRows') ? `All ${overdue.length} overdue →` : 'All To Do →'}</a>`
                )
              : '<div class="oneline">✓ Nothing overdue.</div>'
          }`
        : '';
    const side = teamToday + teamActivityCard(team);
    const row = (x, y) => (x && y ? `<div class="cols2"><div>${x}</div><div>${y}</div></div>` : x || y);
    const l = [A, Q, O, side].filter(Boolean);
    let out = '';
    for (let i = 0; i < l.length; i += 2) {
      out += row(l[i], l[i + 1] || '');
      if (!i) out += HD2T.card();
    }
    return (overdue.length ? '' : '<div class="oneline">✓ Nothing overdue.</div>') + out;
  })()}`;
  return {
    title: 'Manager Desk',
    html,
    mount(root) {
      root.querySelectorAll('[data-tfacc]').forEach(
        b =>
          (b.onclick = e => {
            e.stopPropagation();
            const a = Store.get(b.dataset.tfacc);
            if (a) TodoFollow.accept(a);
          })
      );
      root.querySelectorAll('[data-tfdec]').forEach(
        b =>
          (b.onclick = e => {
            e.stopPropagation();
            const a = Store.get(b.dataset.tfdec);
            if (a) TodoFollow.decline(a);
          })
      );
      bindRequests(root);
      bindMyTasks(root);
      bindAnn(root);
      bindTodoReview(root);
      Dir.bind(root);
      HD2T.bind(root);
      root.querySelectorAll('[data-nudge]').forEach(
        b =>
          (b.onclick = e => {
            e.stopPropagation();
            const r = Store.get(b.dataset.nudge);
            if (!r) return;
            Store.save(Object.assign({}, r, { nudgedOn: U.todayStr(), nudgedBy: App.me }));
            UI.toast('Asked ' + Store.memberShort(r.analyst) + ' for an update', 'good');
            App.render();
          })
      );
      const rw = root.querySelector('[data-repweek]');
      if (rw)
        rw.onclick = () => {
          const s = Rep.st();
          s.kind = 'week';
          s.anchor = U.todayStr();
        };
      bindForward(root);
      root.querySelectorAll('[data-jump]').forEach(
        a =>
          (a.onclick = e => {
            e.preventDefault();
            const sec = [...root.querySelectorAll('.card h3')].find(x => x.textContent.trim().startsWith(a.dataset.jump));
            if (sec) {
              const c = sec.closest('.card');
              c.scrollIntoView({ behavior: 'smooth', block: 'start' });
              c.classList.add('flash');
              setTimeout(() => c.classList.remove('flash'), 1400);
            }
          })
      );
      const ab = root.querySelector('[data-assign]');
      if (ab) ab.onclick = () => assignTodoDialog();
      root.querySelectorAll('[data-qwa]').forEach(b => (b.onclick = () => decideQW(b.dataset.qwa, true)));
      root.querySelectorAll('[data-qwr]').forEach(b => (b.onclick = () => decideQW(b.dataset.qwr, false)));
      root.querySelectorAll('[data-emp]').forEach(
        tr =>
          (tr.onclick = () => {
            ps('employee').emp = tr.dataset.emp;
            location.hash = '#/perf/employee';
          })
      );
    },
  };
};

/* "Needs the director's decision" — or its state once sent */
function escBtn(r) {
  const e = r.escalation;
  if (e && !e.answer) return `<span class="badge warn" title="${h(e.note)}">⚑ waiting for the director</span>`;
  if (e && e.answer) return `<span class="badge good" title="${h(e.answer.note)}">⚑ decided</span>`;
  return `<button class="btn xs ghost" data-escalate="${h(r.id)}" title="Ask the director to decide something">⚑ Needs decision</button>`;
}

/* Manager Desk: when each person opened the app (first and last time today, or the last day seen) */
function teamActivityCard(team) {
  const tm = d => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
  const rows = team.map(m => ({ m, s: Admin.seen(m.id) })).sort((a, b) => b.s.today - a.s.today || (b.s.last || 0) - (a.s.last || 0));
  const on = rows.filter(x => x.s.today).length;
  return card(
    `Team activity <span class="count">${on}/${rows.length} today</span>`,
    `<table class="tbl"><thead><tr><th>Person</th><th>Opened today</th><th>Last seen</th><th class="num" title="Days they opened the app this week">This week</th></tr></thead><tbody>${rows.map(({ m, s }) => `<tr><td><span class="dot ${s.today ? 'on' : ''}"></span> ${h(Store.memberShort(m.id))}</td><td>${s.today ? tm(s.first) : '<span class="muted">not yet</span>'}</td><td>${s.last ? (s.today ? tm(s.last) : U.fmtDate(s.lastDay) + ' ' + tm(s.last)) : s.lastDay ? U.fmtDate(s.lastDay) : '<span class="muted">never</span>'}</td><td class="num">${s.week || ''}</td></tr>`).join('')}</tbody></table><p class="muted small">Times are when the app was opened or a page was used (updated every few minutes).</p>`
  );
}

/* Manager Desk: "＋ Assign a To Do" opens this form (it used to take half the page) */
function assignTodoDialog() {
  const team = Store.scoredTeam(),
    today = U.todayStr();
  UI.modal({
    title: 'Assign a To Do',
    wide: true,
    body: `<form id="assign" class="grid-form">
      ${UI.field({ key: 'task', label: 'To Do', type: 'textarea', required: true, span: 2, rows: 2 }, '')}
      <div class="fld span2"><label>Assign to <i>*</i></label><div class="pick">${team.map(m => `<label class="check"><input type="checkbox" name="who" value="${h(m.id)}"> ${h(Store.memberShort(m.id))}</label>`).join('')}<button type="button" class="btn xs ghost" id="allwho">All</button></div></div>
      ${UI.field({ key: 'assigned', label: 'Assigned date', type: 'date' }, today)}
      ${UI.field({ key: 'duration', label: 'Due in (days)', type: 'number', min: 0, step: 1 }, 0)}
      ${UI.field({ key: 'instruction', label: 'Instruction for the analyst', type: 'textarea', span: 2, rows: 2 }, '')}
      <div class="fld span2 flag-row">${UI.field({ key: 'priority', label: 'Priority', type: 'select', options: ['High', 'Medium', 'Normal', 'Low'], blank: false }, 'Normal')}${UI.field({ key: 'fu', label: 'Follow-up (FU)', type: 'bool', checkLabel: 'Follow-up (FU)' }, false)}${UI.field({ key: 'milestone', label: 'Milestone', type: 'bool', checkLabel: '⭐ Milestone' }, false)}</div>
      <div class="fld" style="justify-content:flex-end"><button class="btn primary" type="submit">Assign</button></div></form>`,
    onMount(root) {
      const f = root.querySelector('#assign');
      if (f) {
        root.querySelector('#allwho').onclick = () => {
          const boxes = f.querySelectorAll('[name=who]');
          const all = [...boxes].every(b => b.checked);
          boxes.forEach(b => (b.checked = !all));
        };
        f.onsubmit = e => {
          e.preventDefault();
          const v = UI.readForm(f, [
            { key: 'task' },
            { key: 'assigned' },
            { key: 'duration', type: 'number' },
            { key: 'instruction' },
            { key: 'fu', type: 'bool' },
            { key: 'priority' },
            { key: 'milestone', type: 'bool' },
          ]);
          const who = [...f.querySelectorAll('[name=who]:checked')].map(b => b.value);
          if (!v.task) return UI.toast('Write the To Do first', 'bad');
          if (!who.length) return UI.toast('Pick at least one analyst', 'bad');
          Store.saveMany(
            who.map(a => ({
              c: 'todo',
              task: v.task,
              analyst: a,
              assigned: v.assigned || today,
              duration: +v.duration || 0,
              instruction: v.instruction,
              fu: v.fu,
              priority: v.priority || 'Normal',
              milestone: !!v.milestone,
              status: 'In Progress',
              finish: '',
              comment: '',
            }))
          );
          UI.closeModal();
          UI.toast(`Assigned to ${who.length} analyst${who.length > 1 ? 's' : ''}`, 'good');
          App.render();
        };
      }
    },
  });
}
