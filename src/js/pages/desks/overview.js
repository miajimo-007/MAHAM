/* MAHAM — All-teams overview (directors, AED, super admin): what the director needs to see in every team,
 * as an agenda — tasks between director and managers (whoever gave them, incl. actions from meetings), team and
 * director projects, requests waiting for the director, and upcoming meetings — grouped Overdue · each day of the
 * next two weeks · Later · No date. Not the teams' daily work (manager → analyst To Dos, project tasks).
 * Read-only overview: clicking an item opens it (editing still follows the normal rules). Route: #/overview */
'use strict';

const Overview = {
  KINDS: [
    ['mgrtask', 'Manager tasks', 'Manager task'],
    ['meeting', 'From meetings', 'Meeting action'],
    ['project', 'Projects', 'Project'],
    ['request', 'Waiting for director', 'Request'],
    ['meet', 'Meetings', 'Meeting'],
  ],
  /* every item, in one shape */
  items(withDone) {
    const today = U.todayStr();
    const since = U.addDays(today, -7);
    const out = [];
    const keep = (open, doneOn) => open || (withDone && doneOn && doneOn >= since);
    for (const r of Store.all('mgrtask')) {
      const st = Chain.status(r);
      const open = st !== Chain.ST.DONE && st !== Chain.ST.X;
      if (!keep(open, r.doneDate)) continue;
      out.push({
        r,
        kind: r.fromMeeting ? 'meeting' : 'mgrtask',
        title: r.task,
        due: r.due || '',
        team: r.team,
        who: r.manager,
        by: r.givenBy || (r.fromMeeting ? (Store.get(r.fromMeeting) || {}).owner : '') || '',
        status: st,
        open,
        late: open && r.due && r.due < today,
        detail: Meetings.detail(r),
        from: r.fromMeeting,
        edit: `mgrtask|${r.id}`,
      });
    }
    for (const p of Store.all('project')) {
      const d = projDerive(p);
      if (!keep(d.open, p.status === 'Done' ? p.updatedOn : '')) continue;
      out.push({
        r: p,
        kind: 'project',
        title: p.name,
        due: p.due || '',
        team: p.team,
        who: p.manager,
        by: p.givenBy || '',
        status: d.health,
        open: d.open,
        late: d.health === 'Overdue',
        detail: `${d.prog}% done${p.update ? ' · 💬 ' + p.update : ''}`,
        proj: p.id,
      });
    }
    // manager → director: requests that need the director's decision
    for (const r of Store.all('request', '*').filter(
      x => x.status === Requests.ST.DIR || (withDone && x.dirBy && (x.dirOn || '') >= since)
    )) {
      const open = x => x.status === Requests.ST.DIR;
      const t = Requests.type(r.type);
      out.push({
        r,
        kind: 'request',
        title: `${t.label}${r.title ? ': ' + r.title : ''}`,
        due: r.from || r.created || '',
        team: r.team,
        who: r.requester,
        by: r.mgrBy || r.requester,
        status: open(r) ? 'Waiting for director' : r.status,
        open: open(r),
        late: false,
        detail: [
          r.from ? `${U.fmtDate(r.from)}${r.to && r.to !== r.from ? ' – ' + U.fmtDate(r.to) : ''}` : '',
          r.escalated ? 'escalated by the manager' : '',
          r.mgrComment ? '💬 ' + r.mgrComment : '',
        ]
          .filter(Boolean)
          .join(' · '),
        href: '#/requests/approve',
      });
    }
    for (const m of Store.all('meeting').filter(x => Meetings.canSee(x) && x.date >= today)) {
      out.push({
        r: m,
        kind: 'meet',
        title: m.title,
        due: m.date,
        team: '_meet',
        who: m.owner,
        by: m.owner,
        status: m.type || 'Meeting',
        open: true,
        late: false,
        detail: `${(m.attendees || []).length} attendee(s)${Meetings.followUps(m).filter(Meetings.isOpen).length ? ` · ${Meetings.followUps(m).filter(Meetings.isOpen).length} open follow-up(s)` : ''}`,
        meet: m.id,
      });
    }
    // director-level items belong to the department of the director they are with
    for (const x of out)
      if (x.team === '_top') {
        const d = Store.deptOfMember(x.kind === 'request' ? x.who : x.who) || null;
        x.team = '_top:' + (d ? d.id : 'aed');
      }
    return out;
  },
  teamName(t) {
    if (String(t).startsWith('_top:')) {
      const d = Store.depts().find(x => '_top:' + x.id === t);
      return (d ? d.name : 'AED') + ' — director level';
    }
    return t === '_top' ? 'Director level' : t === '_meet' ? 'Meetings' : Store.teamName(t || 'apps');
  },
  /* agenda buckets */
  buckets(list) {
    const today = U.todayStr();
    const end = U.addDays(today, 13);
    const b = new Map([['overdue', []]]);
    for (let d = today; d <= end; d = U.addDays(d, 1)) b.set(d, []);
    b.set('later', []);
    b.set('nodate', []);
    for (const x of list) {
      const k = !x.due ? 'nodate' : x.open && x.due < today ? 'overdue' : x.due < today ? today : x.due > end ? 'later' : x.due;
      b.get(k).push(x);
    }
    for (const l of b.values())
      l.sort(
        (a, c) =>
          (a.due || '').localeCompare(c.due || '') ||
          (a.kind === 'meet' ? -1 : 0) - (c.kind === 'meet' ? -1 : 0) ||
          String(a.title).localeCompare(String(c.title))
      );
    return b;
  },
};

P.overview = () => {
  const F = Object.assign(
    { view: 'board', dept: '', team: '', kinds: Overview.KINDS.map(k => k[0]), by: '', q: '', done: false },
    LS.get('bct.ov', {})
  );
  const today = U.todayStr();
  const wk = U.addDays(today, 6);
  const depts = Store.deptsOf(App.me);
  const multi = depts.length > 1;
  const top = App.isAED() || App.isSuper();
  const inDept = (x, d) => d.teams.includes(x.team) || x.team === '_top:' + d.id;
  const all = Overview.items(F.done).filter(x => x.kind === 'meet' || depts.some(d => inDept(x, d)) || (top && x.team === '_top:aed'));
  const fd = multi && F.dept ? depts.find(d => d.id === F.dept) : null;
  const list = all.filter(
    x =>
      F.kinds.includes(x.kind) &&
      (!F.team || x.team === F.team || x.kind === 'meet') &&
      (!fd || x.kind === 'meet' || inDept(x, fd)) &&
      (!F.by || (F.by === 'me' ? x.by === App.me : x.by !== App.me)) &&
      (!F.q || U.lc([x.title, x.detail, Store.memberShort(x.who)].join(' ')).includes(U.lc(F.q)))
  );
  const B = Overview.buckets(list);
  const org = multi ? 'All departments' : (depts[0] || {}).name || 'IT';
  const teams = depts
    .filter(d => !fd || d === fd)
    .flatMap(d => [
      ...d.teams.map(id => ({ id, name: Store.teamName(id), dept: d })),
      { id: '_top:' + d.id, name: d.name + ' — director level', dept: d, top: true },
    ])
    .concat(top && all.some(x => x.team === '_top:aed') ? [{ id: '_top:aed', name: 'AED level', top: true }] : []);
  const sumOf = (t, l) => ({
    t,
    open: l.filter(x => x.kind !== 'request').length,
    late: l.filter(x => x.late).length,
    week: l.filter(x => x.due && x.due >= today && x.due <= wk && x.kind !== 'request').length,
    proj: l.filter(x => x.kind === 'project').length,
    req: l.filter(x => x.kind === 'request').length,
    mgr:
      t.dept && t.id.startsWith('_d:')
        ? Store.member(t.dept.director)
        : t.id === '_org'
          ? Store.members().find(m => m.role === (multi ? 'aed' : 'director') && m.active !== false)
          : Store.teamManager(t.id),
  });
  const total = sumOf(
    { id: '_org', name: org },
    all.filter(x => x.open && x.kind !== 'meet')
  );
  const deptSum = d =>
    sumOf(
      { id: '_d:' + d.id, name: d.name, dept: d },
      all.filter(x => x.open && x.kind !== 'meet' && inDept(x, d))
    );
  const sum = teams.map(t => {
    const l = all.filter(x => x.team === t.id && x.open);
    return {
      t,
      open: l.filter(x => x.kind !== 'request').length,
      late: l.filter(x => x.late).length,
      week: l.filter(x => x.due && x.due >= today && x.due <= wk && x.kind !== 'request').length,
      proj: l.filter(x => x.kind === 'project').length,
      req: l.filter(x => x.kind === 'request').length,
      mgr: Store.teamManager(t.id),
    };
  });
  const kindLabel = k => (Overview.KINDS.find(x => x[0] === k) || ['', '', k])[2];
  const kindCls = { mgrtask: 'k-task', meeting: 'k-meet', project: 'k-proj', request: 'k-req', meet: 'k-mtg' };
  const row =
    x => `<div class="ag-item ${x.late ? 'late' : ''} ${x.open ? '' : 'done'} click" ${x.edit ? `data-edit="${h(x.edit)}"` : x.proj ? `data-proj="${h(x.proj)}"` : x.href ? `data-ovhref="${h(x.href)}"` : `data-ovmeet="${h(x.meet)}"`}>
      <span class="ag-kind ${kindCls[x.kind]}">${h(kindLabel(x.kind))}</span>
      <div class="grow"><b>${h(x.title)}</b> <span class="muted small">· ${h(x.kind === 'meet' ? 'chaired by ' + Store.memberShort(x.who) : x.kind === 'project' ? `owner ${Store.memberShort(x.who) || '—'} (${Store.titleOf(Store.member(x.who) || {})})` : Store.memberShort(x.who) || 'unassigned')} · ${h(Overview.teamName(x.team))}${x.by && x.kind !== 'meet' ? ' · from ' + h(Store.memberShort(x.by)) : ''}${x.due ? ` · ${x.kind === 'meet' ? '' : x.kind === 'request' ? 'starts ' : 'due '}${U.fmtDate(x.due)}` : ''}</span>
        ${x.detail ? `<div class="small muted">${h(x.detail)}</div>` : ''}${x.from && Store.get(x.from) ? `<div class="small muted">From meeting: <a class="link" href="#/meeting/${h(x.from)}">${h(Store.get(x.from).title)} · ${U.fmtDate(Store.get(x.from).date)}</a></div>` : ''}</div>
      ${x.kind === 'meet' ? '' : UI.badge(x.late ? 'Overdue' : UI.statusLabel(x.status), x.late ? 'bad' : UI.statusKind ? UI.statusKind(x.status) : '')}</div>`;
  const dayHead = d => {
    const dt = U.pd(d);
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()];
    return d === today
      ? `Today · ${wd} ${U.fmtDate(d)}`
      : d === U.addDays(today, 1)
        ? `Tomorrow · ${wd} ${U.fmtDate(d)}`
        : `${wd} ${U.fmtDate(d)}`;
  };
  const sections = [...B]
    .filter(([, l]) => l.length)
    .map(
      ([k, l]) =>
        `<section class="ag-day ${k === 'overdue' ? 'od' : k === today ? 'today' : ''}"><h3>${k === 'overdue' ? '⚠ Overdue' : k === 'later' ? 'Later' : k === 'nodate' ? 'No due date' : dayHead(k)} <span class="count">${l.length}</span></h3>${l.map(row).join('')}</section>`
    )
    .join('');
  const dueChip = x =>
    !x.due
      ? '<span class="ov-due none">no date</span>'
      : `<span class="ov-due ${x.late ? 'late' : x.due === today ? 'today' : x.due <= wk ? 'soon' : ''}">${x.late ? 'overdue · ' : x.kind === 'request' ? 'starts ' : x.kind === 'meet' ? '' : ''}${x.due === today ? 'today' : U.fmtDate(x.due)}</span>`;
  const cardOf =
    x => `<div class="ov-card ${x.late ? 'late' : ''} ${x.open ? '' : 'done'} click" ${x.edit ? `data-edit="${h(x.edit)}"` : x.proj ? `data-proj="${h(x.proj)}"` : x.href ? `data-ovhref="${h(x.href)}"` : `data-ovmeet="${h(x.meet)}"`}>
      <div class="ov-card-top"><span class="ag-kind ${kindCls[x.kind]}">${h(kindLabel(x.kind))}</span>${dueChip(x)}</div>
      <b>${h(x.title)}</b>
      <div class="small muted">${h(x.kind === 'meet' ? 'chaired by ' + Store.memberShort(x.who) : x.kind === 'project' ? `owner ${Store.memberShort(x.who) || '—'} (${Store.titleOf(Store.member(x.who) || {})})` : Store.memberShort(x.who) || 'unassigned')}${x.by && x.kind !== 'meet' && x.by !== x.who ? ' · from ' + h(Store.memberShort(x.by)) : ''}</div>
      ${x.detail ? `<div class="small muted ov-det">${h(x.detail)}</div>` : ''}
      <div class="ov-card-foot">${x.kind === 'meet' ? '' : UI.badge(x.late ? 'Overdue' : UI.statusLabel(x.status), x.late ? 'bad' : UI.statusKind ? UI.statusKind(x.status) : '')}${x.from && Store.get(x.from) ? `<span class="small muted">🗓 ${h(Store.get(x.from).title)}</span>` : ''}</div></div>`;
  const ord = x => (x.late ? '0' : x.due ? '1' + x.due : '2') + (x.kind === 'meet' ? '0' : '1');
  const cols = [
    ...teams.map(t => ({ t, l: list.filter(x => x.team === t.id) })),
    { t: { id: '_meet', name: 'Meetings' }, l: list.filter(x => x.kind === 'meet') },
  ]
    .filter(c => !F.team || c.t.id === F.team || (c.t.id === '_meet' && c.l.length))
    .filter(c => !(c.t.top || c.t.id === '_meet') || c.l.length);
  const board = `<div class="ov-board">${cols
    .map(c => {
      const l = c.l.slice().sort((a, b) => ord(a).localeCompare(ord(b)));
      const late = l.filter(x => x.late).length;
      const mgr = c.t.id.startsWith('_') ? null : Store.teamManager(c.t.id);
      return `<div class="ov-col"><div class="ov-col-head">${multi && c.t.dept ? `<span class="ov-dept">${h(c.t.dept.name)}</span>` : ''}<b>${h(c.t.top && c.t.dept ? 'Director level' : c.t.name)}</b><span class="count">${l.length}</span>${late ? `<span class="badge bad">${late} overdue</span>` : ''}<div class="small muted">${
        mgr
          ? (() => {
              const w = Dir.workload(mgr.id);
              return `${h(mgr.name)}<div class="ov-load">From you: <b>${w.open}</b> open task${w.open === 1 ? '' : 's'}${w.late ? ` · <b class="t-bad">${w.late} overdue</b>` : ''} · <b>${w.projects}</b> project${w.projects === 1 ? '' : 's'} · <a class="link" href="#/manager" data-deskteam="${h(c.t.id)}">team desk →</a></div>`;
            })()
          : c.t.id === '_meet'
            ? 'upcoming'
            : c.t.top
              ? c.t.dept && Store.member(c.t.dept.director)
                ? h(Store.member(c.t.dept.director).name)
                : 'director level'
              : '<span class="t-warn">no manager</span>'
      }</div></div>
        <div class="ov-col-body">${l.map(cardOf).join('') || '<p class="muted small ctr">Nothing here.</p>'}</div></div>`;
    })
    .join('')}</div>`;
  const chip = ([k, l]) =>
    `<label class="chipcb ${F.kinds.includes(k) ? 'on' : ''}"><input type="checkbox" data-ovkind="${k}" ${F.kinds.includes(k) ? 'checked' : ''}> ${h(l)} <span class="muted small">${all.filter(x => x.kind === k && x.open).length}</span></label>`;
  const html = `<div class="hello"><div><h1>${multi ? 'All departments overview' : `${h(org)} — all teams overview`}</h1><p class="muted">${U.fmtDate(today)} · tasks between you and the managers, meeting actions, projects and requests waiting for you — every team, by date</p></div><div class="row-btns"><button class="btn" id="ovexport">⬇ Excel</button></div></div>
  <div class="card"><div class="tbl-scroll"><table class="tbl ovsum"><thead><tr><th>Team</th><th>Manager / director</th><th class="num">Open</th><th class="num">Overdue</th><th class="num">Due this week</th><th class="num">Active projects</th><th class="num">Waiting for you</th><th></th></tr></thead><tbody>
    ${multi ? [total].map(s => `<tr class="click org orgall ${!F.team && !F.dept ? 'sel' : ''}" data-ovteam=""><td><b>All departments</b></td><td>${s.mgr ? h(s.mgr.name) : '—'}</td><td class="num">${s.open}</td><td class="num ${s.late ? 't-bad strong' : ''}">${s.late}</td><td class="num">${s.week}</td><td class="num">${s.proj}</td><td class="num ${s.req ? 't-warn strong' : ''}">${s.req}</td><td class="small muted">${F.team || F.dept ? 'show all' : ''}</td></tr>`).join('') : ''}
    ${depts
      .map(
        d => `${[deptSum(d)].map(s => `<tr class="click org ${F.dept === d.id && !F.team ? 'sel' : ''}" data-ovdept="${h(d.id)}"><td><b>${h(s.t.name)}</b> <span class="muted small">department</span></td><td>${s.mgr ? h(s.mgr.name) : s.t.id === '_top' ? '—' : '<span class="t-warn">none</span>'}</td><td class="num">${s.open}</td><td class="num ${s.late ? 't-bad strong' : ''}">${s.late}</td><td class="num">${s.week}</td><td class="num">${s.proj}</td><td class="num ${s.req ? 't-warn strong' : ''}">${s.req}</td><td class="small muted">${F.dept === d.id ? 'showing ✕' : 'show only'}</td></tr>`).join('')}
    ${sum
      .filter(s => s.t.dept === d && (!s.t.top || s.open + s.req))
      .map(
        s =>
          `<tr class="click ${F.team === s.t.id ? 'sel' : ''}" data-ovteam="${h(s.t.id)}"><td class="sub">↳ ${h(s.t.name)}</td><td>${s.mgr ? h(s.mgr.name) : s.t.id === '_top' ? '—' : '<span class="t-warn">none</span>'}</td><td class="num">${s.open}</td><td class="num ${s.late ? 't-bad strong' : ''}">${s.late}</td><td class="num">${s.week}</td><td class="num">${s.proj}</td><td class="num ${s.req ? 't-warn strong' : ''}">${s.req}</td><td class="small link">${F.team === s.t.id ? 'showing ✕' : 'show only'}</td></tr>`
      )
      .join('')}`
      )
      .join('')}
  </tbody></table></div></div>
  <div class="page-actions ov-filters"><span class="seg"><button class="btn sm ${F.view !== 'agenda' ? 'primary' : ''}" data-ovview="board">▦ By team</button><button class="btn sm ${F.view === 'agenda' ? 'primary' : ''}" data-ovview="agenda">☰ By date</button></span>${Overview.KINDS.map(chip).join('')}
    <select id="ovteam"><option value="">${multi ? 'All teams' : `All of ${h(org)}`}</option>${depts
      .filter(d => !fd || d === fd)
      .map(
        d =>
          `<optgroup label="${h(d.name)}">${teams
            .filter(t => t.dept === d)
            .map(
              t =>
                `<option value="${h(t.id)}" ${F.team === t.id ? 'selected' : ''}>${h(t.top ? d.name + ' — director level' : t.name)}</option>`
            )
            .join('')}</optgroup>`
      )
      .join('')}</select>
    <select id="ovby"><option value="">Given by anyone</option><option value="me" ${F.by === 'me' ? 'selected' : ''}>Given by me</option><option value="others" ${F.by === 'others' ? 'selected' : ''}>Given by others</option></select>
    <label class="check small"><input type="checkbox" id="ovdone" ${F.done ? 'checked' : ''}> finished in the last 7 days</label>
    <input id="ovq" type="search" placeholder="Search…" value="${h(F.q)}"></div>
  ${F.view === 'agenda' ? `<div class="agenda">${sections || empty('Nothing matches.')}</div>` : board}`;
  return {
    title: 'All teams overview',
    html,
    mount(root) {
      const set = patch => {
        LS.set('bct.ov', Object.assign({}, F, patch));
        App.render();
      };
      root
        .querySelectorAll('[data-ovkind]')
        .forEach(c => (c.onchange = () => set({ kinds: [...root.querySelectorAll('[data-ovkind]:checked')].map(x => x.dataset.ovkind) })));
      root
        .querySelectorAll('[data-ovteam]')
        .forEach(
          tr =>
            (tr.onclick = () =>
              set(!tr.dataset.ovteam ? { team: '', dept: '' } : { team: F.team === tr.dataset.ovteam ? '' : tr.dataset.ovteam }))
        );
      root
        .querySelectorAll('[data-ovdept]')
        .forEach(tr => (tr.onclick = () => set({ team: '', dept: F.dept === tr.dataset.ovdept ? '' : tr.dataset.ovdept })));
      root.querySelector('#ovteam').onchange = e => set({ team: e.target.value });
      root.querySelector('#ovby').onchange = e => set({ by: e.target.value });
      root.querySelectorAll('[data-ovview]').forEach(b => (b.onclick = () => set({ view: b.dataset.ovview })));
      root.querySelector('#ovdone').onchange = e => set({ done: e.target.checked });
      root.querySelector('#ovq').oninput = U.debounce(e => set({ q: root.querySelector('#ovq').value }), 400);
      Dir.bind(root);
      root.querySelectorAll('[data-ovhref]').forEach(
        el =>
          (el.onclick = () => {
            location.hash = el.dataset.ovhref;
          })
      );
      root.querySelectorAll('[data-ovmeet]').forEach(
        el =>
          (el.onclick = () => {
            location.hash = '#/meeting/' + el.dataset.ovmeet;
          })
      );
      root.querySelector('#ovexport').onclick = async () => {
        const rows = [
          ['Due', 'Kind', 'Title', 'Team', 'Person', 'Given by', 'Status', 'Details', 'From meeting'],
          ...list
            .slice()
            .sort((a, b) => (a.due || '9').localeCompare(b.due || '9'))
            .map(x => [
              x.due,
              kindLabel(x.kind),
              x.title,
              Overview.teamName(x.team),
              Store.memberName(x.who),
              Store.memberName(x.by),
              x.late ? 'Overdue' : x.status,
              x.detail,
              x.from && Store.get(x.from) ? Store.get(x.from).title : '',
            ]),
        ];
        XL.download(await XL.write([{ name: 'Overview', rows }]), `All teams overview ${today}.xlsx`);
      };
    },
  };
};
