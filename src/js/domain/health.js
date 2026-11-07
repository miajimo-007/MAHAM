/* MAHAM — Data health checks and the activity log (super admin).
 *  Health.checks()  → groups of records that look wrong: no owner, impossible dates, broken links, open work held by
 *                     retired or unknown people. Each item opens the record (or its project) so it can be fixed.
 *  ActLog           → every save is noted in the person's own monthly record 'actlog-<id>-YYYY-MM' (their own file):
 *                     [time, collection, record id, 'add' | 'edit' | 'del', short label, changed fields].
 *                     Only the owner can write their log; Admin → Activity log reads everyone's. */
'use strict';

const Health = {
  LABEL: {
    todo: 'To Do',
    shadow: 'Shadow work',
    quickwin: 'Quick win',
    central: 'Central FU',
    mgrtask: 'Director task',
    project: 'Project',
    ptask: 'Project task',
    pphase: 'Project phase',
    praid: 'Project RAID',
    pstatus: 'Project update',
    pcomment: 'Task comment',
    preq: 'Project request',
    request: 'Request',
    gcatch: 'Good catch',
    gcupdate: 'Good catch update',
    mytask: 'Personal task',
    meeting: 'Meeting',
    attendance: 'Attendance',
    course: 'Course',
    helpdesk: 'Help desk',
    action: 'Meeting action',
    settings: 'Settings',
  },
  what(r) {
    return String(
      r.task ||
        r.subject ||
        r.title ||
        r.name ||
        r.course ||
        r.text ||
        r.description ||
        (r.c === 'attendance' ? `${U.fmtDate(r.date)} ${r.status || ''}` : '') ||
        r.id
    ).slice(0, 90);
  },
  /* where a record opens: its own form, or its project */
  open(r) {
    if (['pphase', 'praid', 'pstatus', 'pcomment', 'preq'].includes(r.c) && r.project) return { href: `#/project/${r.project}` };
    if (r.c === 'ptask' && r.project && Store.get(r.project)) return { href: `#/project/${r.project}` };
    if (r.c === 'gcupdate') return { href: '#/oncall/catch' };
    if (r.c === 'request') return { href: '#/requests' };
    return Schemas[r.c] ? { edit: `${r.c}|${r.id}` } : {};
  },
  checks() {
    const today = U.todayStr();
    const ids = new Set(Store.members().map(m => m.id));
    const gone = new Set(
      Store.members()
        .filter(m => m.active === false)
        .map(m => m.id)
    );
    const all = c => Store.all(c, '*');
    const far = d => d && (d < '2015-01-01' || d > U.addDays(today, 730)); // typo years such as 2062 or 1926
    const out = [];
    const add = (key, title, help, list) => {
      if (list.length) out.push({ key, title, help, list });
    };
    /* 1. no owner, or an owner who is not in the People list */
    add(
      'noowner',
      'No owner, or the owner is not in People',
      'Nobody will see these on their Analyst Desk. Give each one to a person.',
      [
        ...all('todo').filter(r => r.status === 'In Progress' && (!r.analyst || !ids.has(r.analyst))),
        ...all('quickwin').filter(r => !qwHistory(r) && (!r.analyst || !ids.has(r.analyst))),
        ...all('ptask').filter(r => !Scrum.isDone(r) && r.assignee && !ids.has(r.assignee)),
        ...all('gcatch').filter(r => GC.isOpen(r) && r.taker && !ids.has(r.taker)),
      ].map(r => ({
        r,
        why: r.analyst || r.assignee || r.taker ? `owner "${r.analyst || r.assignee || r.taker}" is not in People` : 'no owner',
      }))
    );
    /* 2. open items still with retired people (besides To Dos and projects, which Admin → People → Hand over moves) */
    add(
      'retired',
      'Still with retired people',
      'Open good catches and quick wins held by someone who left. Open each one and give it to someone else.',
      [
        ...all('gcatch')
          .filter(r => GC.isOpen(r) && gone.has(r.taker))
          .map(r => ({ r, why: `taken by ${Store.memberShort(r.taker)} (retired)` })),
        ...all('quickwin')
          .filter(r => !qwHistory(r) && U.lc(r.status) !== 'completed' && gone.has(r.analyst))
          .map(r => ({ r, why: `${Store.memberShort(r.analyst)} (retired)` })),
      ]
    );
    /* 3. dates that cannot be right */
    const bad = [];
    for (const r of all('todo')) {
      if (r.finish && r.assigned && r.finish < r.assigned)
        bad.push({ r, why: `finished ${U.fmtDate(r.finish)} before it was assigned (${U.fmtDate(r.assigned)})` });
      else if (far(r.assigned) || far(r.finish)) bad.push({ r, why: `odd date: ${U.fmtDate(far(r.assigned) ? r.assigned : r.finish)}` });
    }
    for (const r of all('quickwin'))
      if (far(r.date) || far(r.expected)) bad.push({ r, why: `odd date: ${U.fmtDate(far(r.date) ? r.date : r.expected)}` });
    for (const r of all('shadow'))
      if (r.date && r.date > today) bad.push({ r, why: `logged for a future day (${U.fmtDate(r.date)})` });
      else if (far(r.date)) bad.push({ r, why: `odd date: ${U.fmtDate(r.date)}` });
    for (const r of [...all('project'), ...all('mgrtask'), ...all('ptask'), ...all('pphase')]) {
      const a = r.start,
        b = r.due || r.end;
      if (a && b && b < a) bad.push({ r, why: `ends ${U.fmtDate(b)} before it starts (${U.fmtDate(a)})` });
      else if (far(a) || far(b)) bad.push({ r, why: `odd date: ${U.fmtDate(far(a) ? a : b)}` });
    }
    for (const r of all('request'))
      if (r.from && r.to && r.to < r.from) bad.push({ r, why: `to ${U.fmtDate(r.to)} is before from ${U.fmtDate(r.from)}` });
    add(
      'dates',
      'Dates that cannot be right',
      'Finished before assigned, ending before starting, future shadow work, or a year far from today (usually a typing slip).',
      bad
    );
    /* 4. broken links: an item that points to something deleted */
    const gonePj = r => r.project && !Store.get(r.project);
    add(
      'links',
      'Pointing to something that was deleted',
      'These belong to a project, good catch or director task that no longer exists. Usually safe to delete.',
      [
        ...['ptask', 'pphase', 'praid', 'pstatus', 'pcomment']
          .flatMap(c => all(c).filter(gonePj))
          .map(r => ({ r, why: 'its project was deleted' })),
        ...all('gcupdate')
          .filter(r => r.catch && !Store.get(r.catch))
          .map(r => ({ r, why: 'its good catch was deleted' })),
        ...all('todo')
          .filter(r => r.fromTask && r.status === 'In Progress' && !Store.get(r.fromTask))
          .map(r => ({ r, why: 'forwarded from a director task that was deleted' })),
        ...all('ptask')
          .filter(r => r.after && !Store.get(r.after))
          .map(r => ({ r, why: 'depends on a task that was deleted' })),
      ]
    );
    return out;
  },
  count() {
    try {
      return Health.checks().reduce((a, g) => a + g.list.length, 0);
    } catch (e) {
      return 0;
    }
  },
  card() {
    const g = Health.checks();
    const n = g.reduce((a, x) => a + x.list.length, 0);
    const item = x => {
      const o = Health.open(x.r);
      return `<div class="li ${o.edit || o.href ? 'click' : ''}" ${o.edit ? `data-edit="${h(o.edit)}"` : o.href ? `data-href="${h(o.href)}"` : ''}><span class="grow"><b>${h(Health.LABEL[x.r.c] || x.r.c)}</b> · ${h(Health.what(x.r))}<div class="muted small">${h(x.why)}${x.r.team ? ' · ' + h(Store.teamName(x.r.team)) : ''}</div></span><span class="muted small">open →</span></div>`;
    };
    return card(
      `Data health <span class="count">${n}</span>`,
      n
        ? g
            .map(
              x =>
                `<details class="hl-grp" ${g.length === 1 ? 'open' : ''}><summary><b>${h(x.title)}</b> <span class="count">${x.list.length}</span><div class="muted small">${h(x.help)}</div></summary><div class="scroll-list">${x.list.slice(0, 80).map(item).join('')}${x.list.length > 80 ? `<p class="muted small">…and ${x.list.length - 80} more</p>` : ''}</div></details>`
            )
            .join('')
        : empty('✓ No problems found: every open item has an owner, dates look right and nothing points to deleted records.')
    );
  },
  bind(root) {
    root.querySelectorAll('[data-href]').forEach(
      el =>
        (el.onclick = () => {
          location.hash = el.dataset.href;
        })
    );
  },
};

const ActLog = {
  SKIP: new Set(['actlog', 'usage', 'ping', 'annread', 'adminlog', 'scoresnap', 'userpin']),
  MAX: 2500, // entries kept per person per month (its own small file: users/<id>.log-YYYY-MM.json)
  id(me, ym) {
    return `actlog-${me}-${ym}`;
  },
  /* called by Store.saveMany with the records about to be saved (already checked) → the log record to save with them, or null */
  forSave(list) {
    if (!App.me || App.preview) return null;
    const me = App.me;
    const now = Date.now();
    const ym = U.todayStr().slice(0, 7);
    const rows = [];
    const hd = list.filter(r => r && r.c === 'helpdesk');
    for (const r of list) {
      if (!r || !r.c || ActLog.SKIP.has(r.c) || (r.c === 'helpdesk' && hd.length > 5)) continue;
      const prev = r.id ? Store.db.get(r.id) : null;
      const act = r._del ? 'del' : prev && !prev._del ? 'edit' : 'add';
      const fields =
        act === 'edit'
          ? Object.keys(Object.assign({}, prev, r))
              .filter(k => !k.startsWith('_') && JSON.stringify(prev[k] ?? '') !== JSON.stringify(r[k] ?? ''))
              .slice(0, 8)
          : [];
      if (act === 'edit' && !fields.length) continue; // saved without a real change
      rows.push([now, r.c, r.id || '', act, Health.what(r), fields]);
    }
    if (hd.length > 5) rows.push([now, 'helpdesk', '', 'import', `${hd.length} help desk rows imported or updated`, []]);
    if (!rows.length) return null;
    const cur = Store.get(ActLog.id(me, ym)) || { id: ActLog.id(me, ym), c: 'actlog', who: me, month: ym, e: [] };
    const e = [...(cur.e || []), ...rows];
    return Object.assign({}, cur, { e: e.length > ActLog.MAX ? e.slice(-ActLog.MAX) : e });
  },
  /* everyone's entries in a date range, newest first */
  entries(from, to) {
    const out = [];
    for (const r of Store.all('actlog', '*')) {
      if (!r.month || r.month < from.slice(0, 7) || r.month > to.slice(0, 7)) continue;
      for (const x of r.e || []) {
        const d = U.ds(new Date(x[0]));
        if (d >= from && d <= to) out.push({ at: x[0], who: r.who, c: x[1], id: x[2], act: x[3], what: x[4], fields: x[5] || [] });
      }
    }
    return out.sort((a, b) => b.at - a.at);
  },
};
