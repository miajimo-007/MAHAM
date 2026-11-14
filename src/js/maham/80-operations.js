/* MAHAM — Operations: 🛡 Quality & incidents, and 🧾 Procurement & vendors.
 * Quality:  incident { id, no (IN-n), title, desc, kind Incident|Near miss|Complaint|Audit finding, severity, area, date,
 *                      reportedBy, owner, status Reported|Investigating|Actions|Closed, rootCause, whys [..], audit }
 *           capa     { id, on (incident), kind Corrective|Preventive, text, owner, due, status Open|Done, verifiedBy, verifiedAt }
 *           qaudit   { id, name, date, area, by, items [{ q, result Pass|Fail|N/A, note }] } — every Fail becomes a finding
 * Procurement: vendor   { id, name, category, contact, email, phone }
 *              contract { id, vendor, title, start, end, value, notice (days before the end to start renewing), sla, owner }
 *              purchase { id, no (PR-n), title, vendor, lines [{ item, qty, price }], requester, approver, status
 *                         Submitted|Approved|Rejected|Ordered|Received, comment, decidedAt, rating (1–5 on receipt) }
 * An incident closes only when every action is done and checked by someone other than its owner. */
'use strict';

const OPS = {
  SEV: ['Low', 'Medium', 'High', 'Critical'],
  IKIND: ['Incident', 'Near miss', 'Complaint', 'Audit finding'],
  IST: ['Reported', 'Investigating', 'Actions', 'Closed'],
  all(c) {
    return Store.all(c, '*');
  },
  next(c) {
    OPS._t = OPS._t || {};
    const t = (OPS._t[c] = OPS._t[c] || []);
    const n = Math.max(0, ...OPS.all(c).map(x => +x.no || 0), ...t) + 1;
    t.push(n);
    return n;
  },
  key(r) {
    return r && r.no ? (r.c === 'incident' ? 'IN-' : 'PR-') + r.no : '';
  },
  caps(id) {
    return OPS.all('capa').filter(a => a.on === id);
  },
  canClose(i) {
    const a = OPS.caps(i.id);
    return a.every(x => x.status === 'Done' && x.verifiedBy);
  },
  money(n) {
    return typeof CRM !== 'undefined' ? CRM.money(n) : U.num(Math.round(+n || 0), 0);
  },
  prTotal(p) {
    return (p.lines || []).reduce((n, l) => n + (+l.qty || 0) * (+l.price || 0), 0);
  },
  mgrOf(id) {
    const m = Store.member(id);
    const mg = m && Store.teamManager && Store.teamManager(m.team || 'apps');
    return mg ? mg.id : '';
  },
  tabs(base, list, on) {
    return `<div class="tabs">${list.map(([k, l]) => `<a class="tab ${k === on ? 'on' : ''}" href="#/${base}/${k}">${l}</a>`).join('')}</div>`;
  },

  /* =================================================================== 🛡 Quality */
  quality(sub) {
    const tab = ['incidents', 'actions', 'audits', 'report'].includes(sub) ? sub : 'incidents';
    const nav = OPS.tabs(
      'quality',
      [
        ['incidents', 'Incidents'],
        ['actions', 'Actions (CAPA)'],
        ['audits', 'Audits'],
        ['report', 'Report'],
      ],
      tab
    );
    const v = OPS['q_' + tab]();
    return { title: 'Quality', html: nav + v.html, mount: v.mount };
  },
  q_incidents() {
    const f = ps('qinc');
    let rows = OPS.all('incident');
    if (f.st === 'open' || f.st == null) rows = rows.filter(i => i.status !== 'Closed');
    else if (f.st) rows = rows.filter(i => i.status === f.st);
    if (f.sev) rows = rows.filter(i => i.severity === f.sev);
    if (f.kind) rows = rows.filter(i => i.kind === f.kind);
    return {
      html: `<div class="page-actions">${filterBar('qinc', [
        { key: 'st', label: 'Status', options: [['open', 'Open'], ...OPS.IST.map(x => [x, x])], dflt: 'open' },
        { key: 'sev', label: 'Severity', options: OPS.SEV },
        { key: 'kind', label: 'Kind', options: OPS.IKIND },
      ])}<span class="grow"></span><button class="btn primary" id="qnew">＋ Report</button></div>
      ${UI.table({
        id: 'qinc',
        rows,
        exportName: 'Incidents',
        onRow: true,
        cols: [
          { key: 'no', label: 'ID', get: r => OPS.key(r), sortVal: r => +r.no || 0 },
          { key: 'title', label: 'What happened', get: r => r.title },
          { key: 'kind', label: 'Kind', get: r => r.kind },
          {
            key: 'severity',
            label: 'Severity',
            html: r =>
              `<span class="badge ${r.severity === 'Critical' || r.severity === 'High' ? 'bad' : r.severity === 'Medium' ? 'warn' : ''}">${h(r.severity || '')}</span>`,
            get: r => r.severity,
            sortVal: r => OPS.SEV.indexOf(r.severity),
          },
          { key: 'status', label: 'Step', get: r => r.status },
          {
            key: 'act',
            label: 'Actions',
            cls: 'num',
            get: r => {
              const a = OPS.caps(r.id);
              return a.length ? `${a.filter(x => x.status === 'Done').length}/${a.length}` : '—';
            },
          },
          { key: 'owner', label: 'Owner', get: r => Store.memberShort(r.owner) || '—' },
          { key: 'date', label: 'Date', get: r => U.fmtDate(r.date), sortVal: r => r.date || '' },
        ],
      })}`,
      mount(root) {
        UI.bindTables(root, { qinc: r => OPS.openInc(r) });
        root.querySelector('#qnew').onclick = () => OPS.reportInc({});
      },
    };
  },
  reportInc(pre) {
    UI.modal({
      title: 'Report an incident',
      wide: true,
      body: `<div class="grid-form">
        <label class="fld span2"><span>What happened</span><input id="qit" maxlength="200" value="${h(pre.title || '')}"></label>
        <label class="fld span2"><span>Details</span><textarea id="qid" rows="4">${h(pre.desc || '')}</textarea></label>
        <label class="fld"><span>Kind</span>${CRM.sel(
          'qik',
          OPS.IKIND.map(x => [x, x]),
          pre.kind || 'Incident'
        )}</label><label class="fld"><span>Severity</span>${CRM.sel(
          'qis',
          OPS.SEV.map(x => [x, x]),
          pre.severity || 'Medium'
        )}</label>
        <label class="fld"><span>Where (area / unit)</span><input id="qia" value="${h(pre.area || '')}"></label><label class="fld"><span>When</span><input id="qiw" type="date" value="${h(pre.date || U.todayStr())}"></label>
        <label class="fld"><span>Owner (investigates)</span>${CRM.sel(
          'qio',
          Maham.people().map(p => [p.id, p.name]),
          pre.owner || OPS.mgrOf(App.me) || App.me
        )}</label></div>
        <p class="muted small">No patient names or record numbers — describe what happened, not who it happened to.</p>`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Report</button>',
      onMount: w => {
        w.querySelectorAll('input,textarea').forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const g = id => w.querySelector('#' + id).value;
          if (!g('qit').trim()) return UI.toast('Say what happened', 'bad');
          const i = {
            c: 'incident',
            id: Maham.uid('incident'),
            no: OPS.next('incident'),
            title: g('qit').trim(),
            desc: g('qid').trim(),
            kind: g('qik'),
            severity: g('qis'),
            area: g('qia').trim(),
            date: g('qiw'),
            owner: g('qio'),
            reportedBy: App.me,
            status: 'Reported',
            audit: pre.audit || '',
          };
          Store.save(i);
          UI.closeModal();
          UI.toast(`${OPS.key(i)} reported`, 'good');
          App.render();
        };
      },
    });
  },
  openInc(i) {
    i = Store.get(i.id) || i;
    const acts = OPS.caps(i.id);
    const mine = i.owner === App.me || App.isSuper();
    const li =
      a => `<div class="li"><div class="grow"><b>${h(a.kind)}</b> ${h(a.text)} <span class="muted small">· ${h(Store.memberShort(a.owner) || '')} · due ${h(U.fmtDate(a.due))}${a.status === 'Done' ? ' · ✓ done' : a.due && a.due < U.todayStr() ? ' · <span class="t-bad">late</span>' : ''}${a.verifiedBy ? ' · checked by ' + h(Store.memberShort(a.verifiedBy)) : ''}</span></div>
      ${a.status !== 'Done' && (a.owner === App.me || mine) ? `<button class="btn xs" data-capdone="${h(a.id)}">✓ Done</button>` : ''}${a.status === 'Done' && !a.verifiedBy && a.owner !== App.me && mine ? `<button class="btn xs" data-capok="${h(a.id)}">Check it</button>` : ''}</div>`;
    UI.modal({
      title: `${OPS.key(i)} · ${i.title}`,
      wide: true,
      body: `<p><span class="badge ${i.severity === 'Critical' || i.severity === 'High' ? 'bad' : ''}">${h(i.severity)}</span> ${h(i.kind)} · ${h(i.area || '')} · ${h(U.fmtDate(i.date))} · reported by ${h(Store.memberShort(i.reportedBy) || '')} · owner ${h(Store.memberShort(i.owner) || '')}</p>
        <div class="tk-desc">${Maham.rich(i.desc || '')}</div>
        <div class="steps">${OPS.IST.map(s => `<span class="badge ${s === i.status ? 'good' : ''}">${h(s)}</span>`).join(' → ')}</div>
        <h4>Root cause</h4>${mine ? `<textarea id="qrc" rows="2" style="width:100%">${h(i.rootCause || '')}</textarea><div class="muted small">5 whys (one per line)</div><textarea id="qwy" rows="3" style="width:100%">${h((i.whys || []).join('\n'))}</textarea>` : `<p>${h(i.rootCause || '—')}</p>`}
        <h4>Actions (CAPA)</h4>${acts.map(li).join('') || '<p class="muted small">No actions yet.</p>'}
        ${
          mine
            ? `<div class="crm-act">${CRM.sel(
                'qak',
                [
                  ['Corrective', 'Corrective'],
                  ['Preventive', 'Preventive'],
                ],
                'Corrective'
              )} <input id="qat" placeholder="What will be done" style="flex:1"> ${CRM.sel(
                'qao',
                Maham.people().map(p => [p.id, p.name]),
                App.me
              )} <input id="qad" type="date" value="${U.addDays(U.todayStr(), 14)}"> <button class="btn sm" id="qago">Add</button></div>`
            : ''
        }
        ${Attach.box(i)}`,
      actions: `${mine && i.status !== 'Closed' ? `<button class="btn" data-qnext>${i.status === 'Actions' ? 'Close it' : 'Next step →'}</button>` : ''}${mine && i.status === 'Closed' ? '<button class="btn" data-qreopen>Reopen</button>' : ''}<span class="grow"></span>${mine ? '<button class="btn" data-qsave>Save</button>' : ''} <button class="btn primary" data-c>Close</button>`,
      onMount: w => {
        const again = () => {
          UI.closeModal();
          App.render();
          OPS.openInc(Store.get(i.id) || i);
        };
        w.querySelectorAll('input,textarea').forEach(x => x.addEventListener('keydown', e => e.stopPropagation()));
        w.querySelector('[data-c]').onclick = UI.closeModal;
        const fields = () =>
          w.querySelector('#qrc')
            ? {
                rootCause: w.querySelector('#qrc').value.trim(),
                whys: w
                  .querySelector('#qwy')
                  .value.split('\n')
                  .map(x => x.trim())
                  .filter(Boolean)
                  .slice(0, 5),
              }
            : {};
        const sv = w.querySelector('[data-qsave]');
        if (sv)
          sv.onclick = () => {
            Store.save(Object.assign({}, Store.get(i.id) || i, fields()));
            UI.toast('Saved', 'good');
            again();
          };
        const nx = w.querySelector('[data-qnext]');
        if (nx)
          nx.onclick = () => {
            const cur = Store.get(i.id) || i;
            const k = OPS.IST.indexOf(cur.status);
            const to = OPS.IST[Math.min(k + 1, 3)];
            if (to === 'Closed' && !OPS.canClose(cur))
              return UI.toast('Close it when every action is done and checked by someone other than its owner', 'bad');
            if (to === 'Actions' && !(fields().rootCause || cur.rootCause)) return UI.toast('Write the root cause first', 'bad');
            Store.save(Object.assign({}, cur, fields(), { status: to, ...(to === 'Closed' ? { closedAt: Date.now() } : {}) }));
            again();
          };
        const ro = w.querySelector('[data-qreopen]');
        if (ro)
          ro.onclick = () => {
            Store.save(Object.assign({}, Store.get(i.id) || i, { status: 'Actions', closedAt: null }));
            again();
          };
        const keep = () => {
          const f = fields();
          if (Object.keys(f).length) Store.save(Object.assign({}, Store.get(i.id) || i, f));
        }; // what was typed is kept when the window redraws
        const ad = w.querySelector('#qago');
        if (ad)
          ad.onclick = () => {
            const t = w.querySelector('#qat').value.trim();
            if (!t) return UI.toast('Say what will be done', 'bad');
            keep();
            Store.save({
              c: 'capa',
              id: Maham.uid('capa'),
              on: i.id,
              kind: w.querySelector('#qak').value,
              text: t,
              owner: w.querySelector('#qao').value,
              due: w.querySelector('#qad').value,
              status: 'Open',
              at: Date.now(),
              by: App.me,
            });
            again();
          };
        w.querySelectorAll('[data-capdone]').forEach(
          b =>
            (b.onclick = () => {
              keep();
              const a = Store.get(b.dataset.capdone);
              Store.save(Object.assign({}, a, { status: 'Done', doneAt: Date.now() }));
              again();
            })
        );
        w.querySelectorAll('[data-capok]').forEach(
          b =>
            (b.onclick = () => {
              keep();
              const a = Store.get(b.dataset.capok);
              Store.save(Object.assign({}, a, { verifiedBy: App.me, verifiedAt: Date.now() }));
              again();
            })
        );
        Attach.bind(w, i);
      },
    });
  },
  q_actions() {
    const today = U.todayStr();
    const rows = OPS.all('capa').filter(a => a.status !== 'Done' || !a.verifiedBy);
    return {
      html: UI.table({
        id: 'qcapa',
        rows,
        exportName: 'Actions',
        onRow: true,
        cols: [
          { key: 'inc', label: 'Incident', get: r => OPS.key(Store.get(r.on) || {}) },
          { key: 'kind', label: 'Kind', get: r => r.kind },
          { key: 'text', label: 'Action', get: r => r.text },
          { key: 'owner', label: 'Owner', get: r => Store.memberShort(r.owner) || '' },
          {
            key: 'due',
            label: 'Due',
            html: r =>
              r.due && r.due < today && r.status !== 'Done' ? `<span class="t-bad">${h(U.fmtDate(r.due))}</span>` : h(U.fmtDate(r.due)),
            get: r => r.due,
            sortVal: r => r.due || '',
          },
          { key: 'status', label: 'Status', get: r => (r.status === 'Done' ? 'Done — to be checked' : r.status) },
        ],
      }),
      mount(root) {
        UI.bindTables(root, {
          qcapa: r => {
            const i = Store.get(r.on);
            if (i) OPS.openInc(i);
          },
        });
      },
    };
  },
  q_audits() {
    const rows = OPS.all('qaudit');
    return {
      html: `<div class="page-actions"><span class="muted small">An audit is a checklist; every “Fail” becomes a finding (an incident of kind Audit finding).</span><span class="grow"></span><button class="btn primary" id="qanew">＋ New audit</button></div>
      ${UI.table({
        id: 'qaud',
        rows,
        exportName: 'Audits',
        onRow: true,
        cols: [
          { key: 'name', label: 'Audit', get: r => r.name },
          { key: 'area', label: 'Area', get: r => r.area || '' },
          { key: 'date', label: 'Date', get: r => U.fmtDate(r.date) },
          {
            key: 'res',
            label: 'Pass / Fail',
            get: r =>
              `${(r.items || []).filter(x => x.result === 'Pass').length} / ${(r.items || []).filter(x => x.result === 'Fail').length}`,
          },
          { key: 'by', label: 'By', get: r => Store.memberShort(r.by) || '' },
        ],
      })}`,
      mount(root) {
        UI.bindTables(root, { qaud: r => OPS.audit(r) });
        root.querySelector('#qanew').onclick = () =>
          OPS.audit({ c: 'qaudit', id: Maham.uid('qaudit'), date: U.todayStr(), by: App.me, items: [] });
      },
    };
  },
  audit(a) {
    const row = (it, k) =>
      `<tr data-q="${k}"><td><input class="qa-q" value="${h(it.q || '')}" placeholder="Check"></td><td>${CRM.sel(
        '',
        [
          ['', '—'],
          ['Pass', 'Pass'],
          ['Fail', 'Fail'],
          ['N/A', 'N/A'],
        ],
        it.result || ''
      ).replace(
        '<select id=""',
        '<select class="qa-r"'
      )}</td><td><input class="qa-n" value="${h(it.note || '')}" placeholder="Note"></td></tr>`;
    UI.modal({
      title: Store.get(a.id) ? 'Audit: ' + a.name : 'New audit',
      wide: true,
      body: `<div class="grid-form"><label class="fld"><span>Name</span><input id="qan" value="${h(a.name || '')}"></label><label class="fld"><span>Area</span><input id="qaa" value="${h(a.area || '')}"></label><label class="fld"><span>Date</span><input id="qadt" type="date" value="${h(a.date || '')}"></label></div>
        <table class="tbl"><thead><tr><th>Check</th><th>Result</th><th>Note</th></tr></thead><tbody id="qarows">${[...(a.items || []), {}].map(row).join('')}</tbody></table><button class="btn sm" id="qaadd">＋ Check</button>`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>',
      onMount: w => {
        const kd = () => w.querySelectorAll('input').forEach(x => x.addEventListener('keydown', e => e.stopPropagation()));
        kd();
        w.querySelector('#qaadd').onclick = () => {
          const tb = w.querySelector('#qarows');
          tb.insertAdjacentHTML('beforeend', row({}, tb.children.length));
          kd();
        };
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const name = w.querySelector('#qan').value.trim();
          if (!name) return UI.toast('Name the audit', 'bad');
          const items = [...w.querySelectorAll('#qarows tr')]
            .map(r => ({
              q: r.querySelector('.qa-q').value.trim(),
              result: r.querySelector('.qa-r').value,
              note: r.querySelector('.qa-n').value.trim(),
            }))
            .filter(x => x.q);
          const n = Object.assign({}, a, { name, area: w.querySelector('#qaa').value.trim(), date: w.querySelector('#qadt').value, items });
          Store.save(n);
          // every Fail becomes a finding (once per check)
          const have = new Set(
            OPS.all('incident')
              .filter(i => i.audit === n.id)
              .map(i => i.auditQ)
          );
          const finds = items
            .filter(x => x.result === 'Fail' && !have.has(x.q))
            .map(x => ({
              c: 'incident',
              id: Maham.uid('incident'),
              no: OPS.next('incident'),
              title: `${name}: ${x.q}`,
              desc: x.note,
              kind: 'Audit finding',
              severity: 'Medium',
              area: n.area,
              date: n.date,
              owner: OPS.mgrOf(App.me) || App.me,
              reportedBy: App.me,
              status: 'Reported',
              audit: n.id,
              auditQ: x.q,
            }));
          if (finds.length) Store.saveMany(finds);
          UI.closeModal();
          UI.toast(finds.length ? `Saved — ${finds.length} finding${finds.length === 1 ? '' : 's'} opened` : 'Saved', 'good');
          App.render();
        };
      },
    });
  },
  q_report() {
    const all = OPS.all('incident');
    const by = (l, f) => {
      const m = new Map();
      for (const x of l) {
        const k = f(x) || '—';
        m.set(k, (m.get(k) || 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const tbl = (t, rows) =>
      card(
        t,
        rows.length
          ? `<table class="tbl"><tbody>${rows.map(([k, n]) => `<tr><td>${h(k)}</td><td class="num">${n}</td></tr>`).join('')}</tbody></table>`
          : '<p class="muted small">Nothing yet.</p>'
      );
    const late = OPS.all('capa').filter(a => a.status !== 'Done' && a.due && a.due < U.todayStr()).length;
    const closed = all.filter(i => i.status === 'Closed');
    return {
      html: `<div class="totals-line"><b>${all.filter(i => i.status !== 'Closed').length}</b> open · <b>${closed.length}</b> closed · <b class="${late ? 't-bad' : ''}">${late}</b> actions late · <b>${all.filter(i => i.kind === 'Near miss').length}</b> near misses reported (a good sign)</div>
      <div class="cols3">${tbl(
        'Open by severity',
        by(
          all.filter(i => i.status !== 'Closed'),
          i => i.severity
        )
      )}${tbl(
        'By kind',
        by(all, i => i.kind)
      )}${tbl(
        'By area',
        by(all, i => i.area)
      )}</div>`,
      mount() {},
    };
  },

  /* =================================================================== 🧾 Procurement */
  proc(sub) {
    const tab = ['requests', 'approve', 'vendors', 'contracts'].includes(sub) ? sub : 'requests';
    const toApprove = OPS.all('purchase').filter(p => p.status === 'Submitted' && (p.approver === App.me || App.isSuper())).length;
    const nav = OPS.tabs(
      'procurement',
      [
        ['requests', 'Purchase requests'],
        ['approve', `To approve${toApprove ? ` <span class="count">${toApprove}</span>` : ''}`],
        ['vendors', 'Vendors'],
        ['contracts', 'Contracts'],
      ],
      tab
    );
    const v = OPS['p_' + tab]();
    return { title: 'Procurement', html: nav + v.html, mount: v.mount };
  },
  prCols() {
    return [
      { key: 'no', label: 'ID', get: r => OPS.key(r), sortVal: r => +r.no || 0 },
      { key: 'title', label: 'What', get: r => r.title },
      { key: 'vendor', label: 'Vendor', get: r => (Store.get(r.vendor) || {}).name || '' },
      { key: 'total', label: 'Total', cls: 'num', get: r => OPS.money(OPS.prTotal(r)), sortVal: r => OPS.prTotal(r) },
      { key: 'status', label: 'Status', get: r => r.status },
      { key: 'req', label: 'By', get: r => Store.memberShort(r.requester) || '' },
    ];
  },
  p_requests() {
    const rows = OPS.all('purchase').filter(p => App.isSuper() || App.can('viewOthers') || p.requester === App.me || p.approver === App.me);
    return {
      html: `<div class="page-actions"><span class="grow"></span><button class="btn primary" id="prnew">＋ New purchase request</button></div>${UI.table({ id: 'prs', rows, exportName: 'Purchase requests', onRow: true, cols: OPS.prCols() })}`,
      mount(root) {
        UI.bindTables(root, { prs: r => OPS.openPR(r) });
        root.querySelector('#prnew').onclick = () =>
          OPS.editPR({ c: 'purchase', id: Maham.uid('purchase'), lines: [{ item: '', qty: 1, price: 0 }], requester: App.me });
      },
    };
  },
  p_approve() {
    const rows = OPS.all('purchase').filter(p => p.status === 'Submitted' && (p.approver === App.me || App.isSuper()));
    return {
      html: rows.length
        ? UI.table({ id: 'prap', rows, exportName: 'To approve', onRow: true, cols: OPS.prCols() })
        : '<div class="oneline">✓ Nothing waiting for your approval.</div>',
      mount(root) {
        UI.bindTables(root, { prap: r => OPS.openPR(r) });
      },
    };
  },
  editPR(p) {
    const line = l =>
      `<tr><td><input class="pl-i" value="${h(l.item || '')}"></td><td><input class="pl-q" type="number" min="0" value="${+l.qty || 0}" style="width:70px"></td><td><input class="pl-p" type="number" min="0" step="0.01" value="${+l.price || 0}" style="width:110px"></td></tr>`;
    UI.modal({
      title: 'Purchase request',
      wide: true,
      body: `<div class="grid-form"><label class="fld span2"><span>What is it for</span><input id="prt" value="${h(p.title || '')}"></label>
        <label class="fld"><span>Vendor</span>${CRM.sel(
          'prv',
          OPS.all('vendor').map(v => [v.id, v.name]),
          p.vendor,
          '— not chosen —'
        )}</label></div>
        <table class="tbl"><thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead><tbody id="prl">${(p.lines || []).map(line).join('')}</tbody></table><button class="btn sm" id="pradd">＋ Line</button>
        <p class="muted small">It goes to your manager (${h(Store.memberShort(OPS.mgrOf(App.me)) || 'the admin')}) to approve.</p>`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Submit</button>',
      onMount: w => {
        const kd = () => w.querySelectorAll('input').forEach(x => x.addEventListener('keydown', e => e.stopPropagation()));
        kd();
        w.querySelector('#pradd').onclick = () => {
          w.querySelector('#prl').insertAdjacentHTML('beforeend', line({ qty: 1 }));
          kd();
        };
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const title = w.querySelector('#prt').value.trim();
          if (!title) return UI.toast('Say what it is for', 'bad');
          const lines = [...w.querySelectorAll('#prl tr')]
            .map(r => ({
              item: r.querySelector('.pl-i').value.trim(),
              qty: +r.querySelector('.pl-q').value || 0,
              price: +r.querySelector('.pl-p').value || 0,
            }))
            .filter(l => l.item);
          if (!lines.length) return UI.toast('Add at least one item', 'bad');
          const n = Object.assign({}, p, {
            no: p.no || OPS.next('purchase'),
            title,
            vendor: w.querySelector('#prv').value,
            lines,
            status: 'Submitted',
            approver: OPS.mgrOf(p.requester) || (Store.members().find(m => m.superAdmin) || {}).id || '',
            at: Date.now(),
          });
          Store.save(n);
          UI.closeModal();
          UI.toast(`${OPS.key(n)} sent for approval`, 'good');
          App.render();
        };
      },
    });
  },
  openPR(p) {
    p = Store.get(p.id) || p;
    const canDecide = p.status === 'Submitted' && (p.approver === App.me || App.isSuper()) && p.requester !== App.me;
    const mine = p.requester === App.me || App.isSuper();
    UI.modal({
      title: `${OPS.key(p)} · ${p.title}`,
      wide: true,
      body: `<p>${h(p.status)} · by ${h(Store.memberShort(p.requester) || '')} · approver ${h(Store.memberShort(p.approver) || '—')} · vendor ${h((Store.get(p.vendor) || {}).name || '—')}</p>
        <table class="tbl"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr></thead><tbody>${(p.lines || []).map(l => `<tr><td>${h(l.item)}</td><td class="num">${l.qty}</td><td class="num">${OPS.money(l.price)}</td><td class="num">${OPS.money(l.qty * l.price)}</td></tr>`).join('')}</tbody></table>
        <p class="num"><b>Total ${OPS.money(OPS.prTotal(p))}</b></p>${p.comment ? `<p>Comment: ${h(p.comment)}</p>` : ''}${p.rating ? `<p>Vendor rated ${'★'.repeat(p.rating)}</p>` : ''}
        ${canDecide ? '<input id="prc" placeholder="Comment (needed to reject)" style="width:100%">' : ''}${Attach.box(p)}`,
      actions: `${canDecide ? '<button class="btn" data-prno>Reject</button> <button class="btn primary" data-prok>Approve</button>' : ''}${mine && p.status === 'Approved' ? '<button class="btn" data-prord>Ordered</button>' : ''}${mine && p.status === 'Ordered' ? '<button class="btn" data-prrec>Received…</button>' : ''}<span class="grow"></span><button class="btn" data-c>Close</button>`,
      onMount: w => {
        const set = patch => {
          Store.save(Object.assign({}, Store.get(p.id) || p, patch));
          UI.closeModal();
          App.render();
        };
        const c = w.querySelector('#prc');
        if (c) c.addEventListener('keydown', e => e.stopPropagation());
        w.querySelector('[data-c]').onclick = UI.closeModal;
        const ok = w.querySelector('[data-prok]');
        if (ok) ok.onclick = () => set({ status: 'Approved', comment: c.value.trim(), decidedAt: Date.now(), decidedBy: App.me });
        const no = w.querySelector('[data-prno]');
        if (no)
          no.onclick = () => {
            if (!c.value.trim()) return UI.toast('Write why it is rejected', 'bad');
            set({ status: 'Rejected', comment: c.value.trim(), decidedAt: Date.now(), decidedBy: App.me });
          };
        const od = w.querySelector('[data-prord]');
        if (od) od.onclick = () => set({ status: 'Ordered', orderedAt: Date.now() });
        const rc = w.querySelector('[data-prrec]');
        if (rc)
          rc.onclick = () => {
            const r = Math.max(1, Math.min(5, +(prompt('Received. How was the vendor? 1 (bad) – 5 (great)', '4') || 4)));
            set({ status: 'Received', receivedAt: Date.now(), rating: r });
          };
        Attach.bind(w, p);
      },
    });
  },
  p_vendors() {
    const rows = OPS.all('vendor');
    const score = v => {
      const rs = OPS.all('purchase').filter(p => p.vendor === v.id && p.rating);
      return rs.length ? rs.reduce((n, p) => n + p.rating, 0) / rs.length : 0;
    };
    return {
      html: `<div class="page-actions"><span class="grow"></span><button class="btn primary" id="vnew">＋ New vendor</button></div>${UI.table(
        {
          id: 'vend',
          rows,
          exportName: 'Vendors',
          onRow: true,
          cols: [
            { key: 'name', label: 'Vendor', get: r => r.name },
            { key: 'category', label: 'Category', get: r => r.category || '' },
            { key: 'contact', label: 'Contact', get: r => [r.contact, r.email, r.phone].filter(Boolean).join(' · ') },
            { key: 'score', label: 'Rating', cls: 'num', get: r => (score(r) ? U.num(score(r), 1) + ' ★' : '—'), sortVal: r => score(r) },
            { key: 'contracts', label: 'Contracts', cls: 'num', get: r => OPS.all('contract').filter(x => x.vendor === r.id).length },
            {
              key: 'spend',
              label: 'Spent',
              cls: 'num',
              get: r =>
                OPS.money(
                  OPS.all('purchase')
                    .filter(p => p.vendor === r.id && ['Ordered', 'Received'].includes(p.status))
                    .reduce((n, p) => n + OPS.prTotal(p), 0)
                ),
            },
          ],
        }
      )}`,
      mount(root) {
        UI.bindTables(root, { vend: r => OPS.editSimple(r, 'vendor') });
        root.querySelector('#vnew').onclick = () => OPS.editSimple({ c: 'vendor', id: Maham.uid('vendor') }, 'vendor');
      },
    };
  },
  p_contracts() {
    const today = U.todayStr();
    const due = c => c.end && U.addDays(c.end, -(+c.notice || 60)) <= today && c.end >= today;
    const rows = OPS.all('contract');
    const soon = rows.filter(due);
    return {
      html: `${soon.length ? `<div class="insights warnbox"><div>⏰ <b>${soon.length}</b> contract${soon.length === 1 ? '' : 's'} to renew soon: ${soon.map(c => `${h(c.title)} (ends ${h(U.fmtDate(c.end))})`).join(', ')}</div></div>` : ''}
      <div class="page-actions"><span class="grow"></span><button class="btn primary" id="cnew">＋ New contract</button></div>${UI.table({
        id: 'cont',
        rows,
        exportName: 'Contracts',
        onRow: true,
        cols: [
          { key: 'title', label: 'Contract', get: r => r.title },
          { key: 'vendor', label: 'Vendor', get: r => (Store.get(r.vendor) || {}).name || '' },
          { key: 'value', label: 'Value', cls: 'num', get: r => OPS.money(r.value), sortVal: r => +r.value || 0 },
          { key: 'start', label: 'Start', get: r => U.fmtDate(r.start), sortVal: r => r.start || '' },
          {
            key: 'end',
            label: 'End',
            html: r =>
              due(r)
                ? `<span class="t-warn">${h(U.fmtDate(r.end))} — renew</span>`
                : r.end && r.end < today
                  ? `<span class="muted">${h(U.fmtDate(r.end))} ended</span>`
                  : h(U.fmtDate(r.end)),
            get: r => r.end,
            sortVal: r => r.end || '',
          },
          { key: 'owner', label: 'Owner', get: r => Store.memberShort(r.owner) || '' },
        ],
      })}`,
      mount(root) {
        UI.bindTables(root, { cont: r => OPS.editSimple(r, 'contract') });
        root.querySelector('#cnew').onclick = () =>
          OPS.editSimple({ c: 'contract', id: Maham.uid('contract'), owner: App.me, notice: 60, start: U.todayStr() }, 'contract');
      },
    };
  },
  editSimple(r, kind) {
    const F =
      kind === 'vendor'
        ? [
            ['name', 'Name'],
            ['category', 'Category'],
            ['contact', 'Contact person'],
            ['email', 'Email'],
            ['phone', 'Phone'],
          ]
        : [
            ['title', 'Contract'],
            ['start', 'Start', 'date'],
            ['end', 'End', 'date'],
            ['value', 'Value', 'number'],
            ['notice', 'Start renewing (days before the end)', 'number'],
            ['sla', 'SLA / terms'],
          ];
    UI.modal({
      title: (Store.get(r.id) ? 'Edit ' : 'New ') + kind,
      body: `<div class="grid-form">${F.map(([k, l, t]) => `<label class="fld"><span>${h(l)}</span><input data-sf="${k}" type="${t || 'text'}" value="${h(r[k] == null ? '' : r[k])}"></label>`).join('')}
        ${
          kind === 'contract'
            ? `<label class="fld"><span>Vendor</span>${CRM.sel(
                'sfv',
                OPS.all('vendor').map(v => [v.id, v.name]),
                r.vendor,
                '—'
              )}</label><label class="fld"><span>Owner</span>${CRM.sel(
                'sfo',
                Maham.people().map(p => [p.id, p.name]),
                r.owner
              )}</label>`
            : ''
        }</div>${Store.get(r.id) ? Attach.box(r) : ''}`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>',
      onMount: w => {
        w.querySelectorAll('input').forEach(x => x.addEventListener('keydown', e => e.stopPropagation()));
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const n = Object.assign({}, r);
          w.querySelectorAll('[data-sf]').forEach(i => {
            n[i.dataset.sf] = i.type === 'number' ? +i.value || 0 : i.value.trim();
          });
          if (kind === 'contract') {
            n.vendor = w.querySelector('#sfv').value;
            n.owner = w.querySelector('#sfo').value;
          }
          if (!(n.name || n.title)) return UI.toast('Give it a name', 'bad');
          Store.save(n);
          UI.closeModal();
          App.render();
        };
        if (Store.get(r.id)) Attach.bind(w, r);
      },
    });
  },
};

Maham.section(
  'Operations',
  '🛡',
  [
    ['quality', 'Quality', '🛡'],
    ['procurement', 'Procurement', '🧾'],
  ],
  'AI'
);
Maham.page('quality', 'Quality & incidents', ['incident', 'capa', 'qaudit']);
Maham.page('procurement', 'Procurement & vendors', ['vendor', 'contract', 'purchase']);
P.quality = sub => OPS.quality(sub);
P.procurement = sub => OPS.proc(sub);

/* 🔔 who is told */
Notify.rules.push((r, prev) => {
  if (r.c === 'incident' && r.owner && (!prev || prev.owner !== r.owner))
    return [{ to: r.owner, kind: 'quality', title: `asked you to look into ${OPS.key(r)}`, text: r.title, link: '#/quality/incidents' }];
  if (r.c === 'capa' && r.owner && (!prev || prev.owner !== r.owner)) {
    const i = Store.get(r.on);
    return [{ to: r.owner, kind: 'quality', title: `gave you an action for ${OPS.key(i || {})}`, text: r.text, link: '#/quality/actions' }];
  }
  if (r.c === 'purchase' && r.status === 'Submitted' && r.approver && (!prev || prev.status !== 'Submitted'))
    return [
      {
        to: r.approver,
        kind: 'approval',
        title: `asks you to approve ${OPS.key(r)}`,
        text: `${r.title} — ${OPS.money(OPS.prTotal(r))}`,
        link: '#/procurement/approve',
      },
    ];
  if (r.c === 'purchase' && prev && prev.status === 'Submitted' && ['Approved', 'Rejected'].includes(r.status))
    return [
      {
        to: r.requester,
        kind: 'approval',
        title: `${r.status.toLowerCase()} ${OPS.key(r)}`,
        text: r.comment || r.title,
        link: '#/procurement/requests',
      },
    ];
  return [];
});
['incident', 'purchase', 'contract'].forEach(c => Attach.extraColls.push(c));
