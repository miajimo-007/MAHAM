/* DARRIK — IT Help Desk — overview, requests, ManageEngine import screen. */
'use strict';

P.helpdesk = sub => {
  const tab = sub || ps('helpdesk').tab || 'overview';
  ps('helpdesk').tab = tab;
  const tabs = [
    ['overview', 'Overview'],
    ['requests', 'All requests'],
    ['import', 'Import from ManageEngine'],
  ];
  let body;
  const y = App.year,
    now = new Date(),
    mo = now.getFullYear() === y ? now.getMonth() + 1 : 12;
  const all = Calc.helpdesk(y);
  if (tab === 'overview') {
    const team = Store.scoredTeam();
    const meta = Store.meta();
    const openBC = Calc.helpdesk(null).filter(x => x.bc && !x.closed && !x.central);
    const unassigned = Calc.helpdesk(null).filter(x => x.unassigned && !x.closed && U.lc(x.r.group) !== 'ehr l2');
    const closedAvg = list => U.avg(list.filter(x => x.closed && x.hrs != null).map(x => x.hrs));
    body = `<div class="insights"><div>Help desk data last imported: <b class="${meta.helpdeskUpdated === U.todayStr() ? 't-good' : 't-warn'}">${meta.helpdeskUpdated ? U.fmtDate(meta.helpdeskUpdated) + (meta.helpdeskUpdated === U.todayStr() ? ' — updated today' : ' — not updated today') : 'never'}</b> <a href="#/helpdesk/import" class="link">Import latest →</a></div></div>
    <div class="cols2 hd-top">
    ${card(
      `IT help desk — ${U.MONTHS[mo - 1]} ${y}`,
      `<table class="tbl"><thead><tr><th>Analyst</th><th class="num">Pending</th><th class="num">Month</th><th class="num">Year</th><th class="num">Month avg h</th><th class="num">Year avg h</th></tr></thead><tbody>
      ${team
        .map(m => {
          const mine = all.filter(x => x.mid === m.id);
          const mm = mine.filter(x => x.month === mo);
          return `<tr><td>${h(Store.memberShort(m.id))}</td><td class="num ${openBC.filter(x => x.mid === m.id).length ? 't-warn strong' : ''}">${openBC.filter(x => x.mid === m.id).length}</td><td class="num">${mm.length}</td><td class="num">${mine.length}</td><td class="num">${mm.filter(x => x.closed).length ? U.num(closedAvg(mm), 2) : 'No requests'}</td><td class="num">${U.num(closedAvg(mine), 2)}</td></tr>`;
        })
        .join('')}
      <tr class="foot"><td>Total</td><td class="num">${openBC.length}</td><td class="num">${all.filter(x => x.bc && x.month === mo).length}</td><td class="num">${all.filter(x => x.bc).length}</td><td></td><td></td></tr></tbody></table>`
    )}
    ${card(`Unassigned <span class="count">${unassigned.length}</span>`, unassigned.length ? `<table class="tbl"><thead><tr><th>ID</th><th>Group</th><th>Subject</th></tr></thead><tbody>${unassigned.map(x => `<tr><td>${h(x.r.reqId)}</td><td>${h(x.r.group)}</td><td>${h(x.r.subject)}</td></tr>`).join('')}</tbody></table>` : empty('Nothing unassigned.'))}
    </div>
    ${HD2T.card()}
    ${card(
      `Open requests <span class="count">${openBC.length}</span>`,
      openBC.length
        ? `<table class="tbl"><thead><tr><th>ID</th><th>Subject</th><th>Analyst</th><th>Requester</th><th>Status</th><th class="num">Age</th></tr></thead><tbody>${openBC
            .sort((a, b) => a.r.created.localeCompare(b.r.created))
            .map(
              x =>
                `<tr><td>${h(x.r.reqId)}</td><td>${h(x.r.subject)}</td><td>${memberCell(x.mid)}</td><td>${h(x.r.requester)}</td><td>${UI.sbadge(x.r.status)}</td><td class="num">${U.diffDays(x.r.created, U.todayStr())}d</td></tr>`
            )
            .join('')}</tbody></table>`
        : empty('No open requests.')
    )}
    `;
  } else if (tab === 'requests') {
    const s = ps('hdreq');
    let rows = all;
    if (s.analyst) rows = rows.filter(x => x.mid === s.analyst);
    if (s.month) rows = rows.filter(x => x.month === +s.month);
    if (s.st === 'Open') rows = rows.filter(x => !x.closed);
    else if (s.st === 'Closed') rows = rows.filter(x => x.closed);
    if (s.same) rows = rows.filter(x => x.sameDay === s.same);
    rows = [...rows].sort((a, b) => b.r.created.localeCompare(a.r.created));
    body = `<div class="page-actions">${filterBar('hdreq', [
      { key: 'analyst', type: 'member', label: 'Technician' },
      { key: 'month', type: 'month' },
      { key: 'st', label: 'Status', options: ['Open', 'Closed'] },
      {
        key: 'same',
        label: 'Closed',
        options: [
          ['Same', 'Same day'],
          ['Next', 'Next day or later'],
          ['Open', 'Still open'],
        ],
      },
    ])}${App.isSuper() ? addBtn('helpdesk', 'Add manually') : ''}</div>
    ${UI.table({
      id: 'hd',
      rows,
      exportName: 'MEDataSource',
      onRow: true,
      cols: [
        { key: 'reqId', label: 'Request', get: x => x.r.reqId, sortVal: x => +x.r.reqId },
        { key: 'subject', label: 'Subject', get: x => x.r.subject },
        { key: 'tech', label: 'Technician', get: x => x.r.technician },
        { key: 'requester', label: 'Requester', get: x => x.r.requester },
        { key: 'group', label: 'Group', get: x => (x.r.group || '').replace(/^EHR /, '') },
        { key: 'status', label: 'Status', html: x => UI.sbadge(x.r.status), get: x => x.r.status },
        { key: 'created', label: 'Created', get: x => U.fmtDT(x.r.created), sortVal: x => x.r.created },
        { key: 'resolved', label: 'Resolved', get: x => U.fmtDT(x.r.resolved), sortVal: x => x.r.resolved || '' },
        {
          key: 'hrs',
          label: 'Elapsed h',
          cls: 'num',
          get: x => (x.hrs == null ? '' : U.num(x.hrs, 2)),
          sortVal: x => x.hrs || 0,
          xval: x => (x.hrs == null ? '' : U.r2(x.hrs)),
        },
        { key: 'same', label: 'Same day', get: x => x.sameDay },
      ],
    })}`;
  } else {
    body =
      App.can('importME') && App.canEdit('helpdesk')
        ? importView()
        : card(
            'Import from ManageEngine',
            `<p>The manager imports the ManageEngine data each day. Last import: <b>${Store.meta().helpdeskUpdated ? U.fmtDate(Store.meta().helpdeskUpdated) : 'never'}</b>.</p>`
          );
  }
  return {
    title: 'IT Help Desk',
    html: `<div class="tabs">${tabs.map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/helpdesk/${k}">${l}</a>`).join('')}</div>${body}`,
    mount(root) {
      HD2T.bind(root);
      UI.bindTables(root, { hd: x => UI.editRecord('helpdesk', x.r) });
      if (tab === 'import') bindImport(root);
    },
  };
};

function importView() {
  return `${card(
    'Import help desk requests',
    `<ol class="steps"><li>In ManageEngine ServiceDesk, open the request view you use for the team (same columns as the <b>MEDataSource</b> sheet) and export it as <b>Excel (.xlsx)</b> or <b>CSV</b>.</li><li>Choose the file below — or copy the rows in Excel and paste them into the box.</li><li>Check the preview, then press <b>Import</b>. Each request is kept once, by Request ID: new ones are added, changed ones are updated (status, technician, dates…), and unchanged ones are skipped so they don't take space. Nothing is deleted.</li></ol>
  <div class="imp"><label class="btn">📂 Choose file…<input type="file" id="impfile" accept=".xlsx,.csv,.txt" hidden></label><span class="muted">or paste below</span>
  <label class="flt"><span>Dates in file are</span><select id="impdmy"><option value="auto">Auto-detect</option><option value="dmy">day/month/year</option><option value="mdy">month/day/year</option></select></label></div>
  <textarea id="imppaste" rows="5" placeholder="Paste rows copied from Excel here (include the header row)…"></textarea>
  <div id="impprev"></div>`
  )}`;
}

function bindImport(root) {
  if (!root.querySelector('#impfile')) return; // import controls are not shown to people without the importME permission
  let grid = null;
  const prev = root.querySelector('#impprev');
  const show = () => {
    if (!grid || grid.length < 2) {
      prev.innerHTML = grid ? '<p class="t-bad">No data rows found.</p>' : '';
      return;
    }
    // find header row (first row containing "subject")
    let hi = grid.findIndex(r => r.some(c => U.lc(c) === 'subject'));
    if (hi < 0) hi = 0;
    const hdr = grid[hi].map(c => U.lc(c));
    const map = {};
    for (const c of HD_COLS) {
      const i = hdr.findIndex(x => c.names.includes(x));
      if (i >= 0) map[c.key] = i;
    }
    if (map.reqId == null) map.reqId = 0; // MEDataSource keeps the ID in column A
    const data = grid.slice(hi + 1).filter(r => r[map.reqId] != null && /^\d+$/.test(String(r[map.reqId]).trim()));
    let order = root.querySelector('#impdmy').value;
    if (order === 'auto') {
      order = 'dmy';
      for (const r of data) {
        const v = r[map.created];
        const m = typeof v === 'string' && /^(\d{1,2})[/.-](\d{1,2})/.exec(v);
        if (m && +m[2] > 12) {
          order = 'mdy';
          break;
        }
      }
    }
    const recs = data.map(r => {
      const g = k => (map[k] != null ? r[map[k]] : '');
      const res = parseDT(g('resolved'), order);
      return {
        id: 'hd-' + String(g('reqId')).trim(),
        c: 'helpdesk',
        reqId: +String(g('reqId')).trim(),
        requester: String(g('requester') || ''),
        subject: String(g('subject') || ''),
        department: String(g('department') || ''),
        status: String(g('status') || ''),
        group: String(g('group') || ''),
        technician: String(g('technician') || ''),
        created: parseDT(g('created'), order),
        resolved: res,
        elapsedHrs: parseElapsed(g('elapsedHrs')),
      };
    });
    let dupes;
    {
      const seen = new Map();
      for (const r of recs) seen.set(r.id, r);
      dupes = recs.length - seen.size;
      recs.length = 0;
      recs.push(...seen.values());
    }
    const missing = HD_COLS.filter(c => map[c.key] == null).map(c => c.label);
    // one record per request number: new → added; changed (status, technician, dates…) → updated; unchanged → skipped
    const withTeam = r => {
      const m = Store.member(Store.memberByMeName(r.technician));
      return Object.assign({}, Store.get(r.id) || {}, r, { team: (m && !Store.topRole(m.role) && m.team) || App.viewTeam });
    };
    const norm = v => (v === undefined || v === null || (typeof v === 'number' && isNaN(v)) ? '' : v);
    const same = (a, b) => !!b && Object.keys(a).every(k => k.startsWith('_') || JSON.stringify(norm(a[k])) === JSON.stringify(norm(b[k])));
    const plan = recs.map(r => {
      const cur = Store.get(r.id);
      const next = withTeam(r);
      return { next, kind: !cur ? 'new' : same(next, cur) ? 'same' : 'changed' };
    });
    // requests the app has (same teams, created within the file's dates) that are not in the file: deleted / merged in ManageEngine
    const teamsIn = new Set(plan.map(p => p.next.team || 'apps'));
    const cr = recs
      .map(r => r.created)
      .filter(Boolean)
      .sort();
    const fromD = cr[0],
      toD = cr[cr.length - 1];
    const inFile = new Set(recs.map(r => r.id));
    const gone = fromD
      ? Store.all('helpdesk', '*').filter(
          r => teamsIn.has(r.team || 'apps') && !inFile.has(r.id) && r.created && r.created >= fromD && r.created <= toD
        )
      : [];
    const isNew = plan.filter(p => p.kind === 'new').length,
      nChanged = plan.filter(p => p.kind === 'changed').length,
      nSame = plan.filter(p => p.kind === 'same').length;
    const unknownTech = [...new Set(recs.map(r => r.technician).filter(t => t && !Store.memberByMeName(t) && U.lc(t) !== 'not assigned'))];
    prev.innerHTML = `<div class="imp-sum">${UI.badge(recs.length + ' requests found', 'good')} ${UI.badge(isNew + ' new')} ${UI.badge(nChanged + ' changed — will be updated')} ${UI.badge(nSame + ' unchanged — skipped')} ${dupes ? UI.badge(dupes + ' duplicate rows merged') : ''} ${missing.length ? UI.badge('Missing columns: ' + missing.join(', '), 'warn') : ''}</div>
      ${unknownTech.length ? `<p class="muted small">Technicians not in the team (counted as "not team"): ${unknownTech.map(h).join(', ')}</p>` : ''}
      <div class="tbl-scroll"><table class="tbl"><thead><tr>${HD_COLS.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>${recs
        .slice(0, 6)
        .map(
          r =>
            `<tr>${HD_COLS.map(c => `<td>${h(c.key === 'created' || c.key === 'resolved' ? U.fmtDT(r[c.key]) : c.key === 'elapsedHrs' ? (r.elapsedHrs == null ? '' : U.num(r.elapsedHrs, 2) + ' h') : r[c.key])}</td>`).join('')}</tr>`
        )
        .join('')}</tbody></table></div>
      <p class="muted small">Showing the first ${Math.min(6, recs.length)} rows. Check that dates and elapsed hours look right.</p>
      ${
        gone.length && App.isSuper()
          ? `<label class="check imp-miss"><input type="checkbox" id="impdelmiss"> <span><b>Remove ${gone.length} request(s) that are in the app but not in this file</b> <span class="muted small">— created ${U.fmtDate(fromD)} – ${U.fmtDate(toD)}, probably deleted or merged in ManageEngine: ${h(
              gone
                .slice(0, 6)
                .map(r => '#' + r.reqId)
                .join(', ')
            )}${gone.length > 6 ? '…' : ''}. Only tick this if the file has <b>all</b> requests for that period.</span></span></label>`
          : ''
      }
      <button class="btn primary" id="impgo" ${recs.length ? '' : 'disabled'}>${isNew + nChanged ? `Import ${isNew + nChanged} new / changed request${isNew + nChanged === 1 ? '' : 's'}` : 'Nothing changed — mark today as imported'}</button>`;
    const go = prev.querySelector('#impgo');
    if (go)
      go.onclick = () => {
        const merged = plan.filter(p => p.kind !== 'same').map(p => p.next);
        const dm = prev.querySelector('#impdelmiss');
        if (dm && dm.checked) merged.push(...gone.map(r => Object.assign({}, r, { _del: true })));
        const meta = Object.assign({}, Store.meta(), { id: Store.metaId(), c: 'settings', helpdeskUpdated: U.todayStr() });
        Store._importing = true;
        try {
          Store.saveMany([...merged, meta]);
        } finally {
          Store._importing = false;
        }
        UI.toast(`${isNew} new · ${nChanged} updated · ${nSame} unchanged (not saved again)`, 'good');
        location.hash = '#/helpdesk/overview';
      };
  };
  root.querySelector('#impfile').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      if (/\.xlsx$/i.test(f.name)) {
        const sheets = await XL.read(f);
        const sh = sheets.find(s => s.rows.some(r => r.some(c => U.lc(c) === 'subject'))) || sheets[0];
        grid = sh.rows;
      } else grid = parseDelimited(await f.text());
      show();
    } catch (err) {
      console.error(err);
      UI.toast('Could not read that file. Export as .xlsx or .csv and try again.', 'bad');
    }
  };
  root.querySelector('#imppaste').oninput = U.debounce(e => {
    grid = parseDelimited(e.target.value);
    show();
  }, 300);
  root.querySelector('#impdmy').onchange = show;
}

/* Open help-desk requests older than 3 days → a To Do for the analyst (one by one or in bulk; managers / team leaders) */
const HD2T = {
  get DAYS() {
    return Custom.target('hdDays');
  }, // Admin → Customize
  age(x) {
    return x.r.created ? U.diffDays(x.r.created.slice(0, 10), U.todayStr()) : 0;
  },
  stale() {
    return Calc.helpdesk(null)
      .filter(x => x.bc && !x.closed && !x.central && x.mid && HD2T.age(x) > HD2T.DAYS)
      .sort((a, b) => HD2T.age(b) - HD2T.age(a));
  },
  todoOf(x) {
    return (
      Store.all('todo', '*').find(t => t.hdReq && String(t.hdReq) === String(x.r.reqId) && t.status !== 'Canceled' && !t.finish) || null
    );
  },
  can() {
    return App.can('assignTodo') && App.canEdit('todo');
  },
  send(list) {
    const today = U.todayStr();
    const recs = list
      .filter(x => !HD2T.todoOf(x))
      .map(x => ({
        c: 'todo',
        task: `Help desk #${x.r.reqId}: ${x.r.subject || ''}`.trim(),
        analyst: x.mid,
        team: x.r.team || App.viewTeam || 'apps',
        assigned: today,
        duration: 1,
        priority: 'High',
        status: 'In Progress',
        finish: '',
        instruction: `Open in ManageEngine for ${HD2T.age(x)} days — please close it or write an update.`,
        hdReq: x.r.reqId,
      }));
    if (!recs.length) return UI.toast('Already in their To Do lists', 'warn');
    Store.saveMany(recs);
    UI.toast(`${recs.length} sent to To Do`, 'good');
    App.render();
  },
  card() {
    if (!HD2T.can()) return '';
    const l = HD2T.stale();
    if (!l.length) return '';
    const waiting = l.filter(x => !HD2T.todoOf(x));
    return card(
      `Open requests older than ${HD2T.DAYS} days <span class="count">${l.length}</span>`,
      `<div class="row-btns tight"><label class="check"><input type="checkbox" data-h2all> Select all</label><span class="grow"></span><button class="btn sm primary" data-h2bulk ${waiting.length ? '' : 'disabled'}>→ Send selected to To Do</button></div>
      <div class="tbl-scroll"><table class="tbl"><thead><tr><th></th><th>ID</th><th>Subject</th><th>Analyst</th><th class="num">Days open</th><th></th></tr></thead><tbody>${l
        .map(x => {
          const t = HD2T.todoOf(x);
          return `<tr><td>${t ? '' : `<input type="checkbox" data-h2="${h(x.r.id)}">`}</td><td class="mono">${h(x.r.reqId)}</td><td>${h(x.r.subject || '')}</td><td>${h(Store.memberShort(x.mid))}</td><td class="num t-bad">${HD2T.age(x)}</td><td class="nw">${t ? '<span class="badge good">in To Do</span>' : `<button class="btn xs" data-h2one="${h(x.r.id)}">→ To Do</button>`}</td></tr>`;
        })
        .join('')}</tbody></table></div>
      <p class="muted small">Each becomes a To Do for that analyst: “Help desk #… : subject”, due tomorrow, High priority. Requests already in a To Do are marked.</p>`
    );
  },
  bind(root) {
    const all = root.querySelector('[data-h2all]');
    if (all)
      all.onchange = () =>
        root.querySelectorAll('[data-h2]').forEach(c => {
          c.checked = all.checked;
        });
    const get = id => Calc.helpdesk(null).find(x => x.r.id === id);
    root.querySelectorAll('[data-h2one]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          const x = get(b.dataset.h2one);
          if (x) HD2T.send([x]);
        })
    );
    const bk = root.querySelector('[data-h2bulk]');
    if (bk)
      bk.onclick = () => {
        const ids = [...root.querySelectorAll('[data-h2]:checked')].map(c => c.dataset.h2);
        if (!ids.length) return UI.toast('Tick the requests first', 'bad');
        HD2T.send(ids.map(get).filter(Boolean));
      };
  },
};
