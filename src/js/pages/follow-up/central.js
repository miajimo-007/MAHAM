/* MAHAM — Central Follow-up (external follow-ups): steps from a workflow, chase log, next chase, escalation
 * from the last chase in working days, links to the work behind it, a manager summary, and the upgrade of old records. */
'use strict';

const FollowUpUI = {
  LEVEL_KIND: { analyst: 'sc-c', leader: 'sc-d', manager: 'sc-e' },
  rows() {
    return App.mine(Store.all('central'), r => r.analyst).map(r0 => {
      const r = FollowUp.norm(r0);
      return {
        r,
        raw: r0,
        open: FollowUp.isOpen(r),
        lvl: FollowUp.level(r),
        c: FollowUp.comment(r),
        days: FollowUp.daysOpen(r),
        since: FollowUp.sinceTouch(r),
        due: FollowUp.chaseDue(r),
      };
    });
  },
  stepChip(r) {
    return `<span class="tf-st sm" style="--c:${h(TaskFlow.color(r))}">${h(r.status || '—')}</span>`;
  },
  /* ---------- moves: screen ---------- */
  go(id, trId) {
    const r = FollowUp.norm(Store.get(id));
    const m = TaskFlow.moves(r).find(x => x.tr.id === trId);
    if (!m) return;
    if (!m.ok) return UI.toast(m.why.join(', '), 'bad');
    const tr = m.tr;
    const sc = new Set(tr.screen || []);
    for (const v of tr.valid || []) {
      if (v.k === 'comment') sc.add('comment');
      if (v.k === 'field' && TaskFlow.validFail(v, r, {})) sc.add(v.field);
    }
    if (!sc.size) {
      const err = FollowUp.run(r, tr.id, {});
      if (err && err !== 'pending') return UI.toast(err, 'bad');
      UI.toast(err === 'pending' ? 'Sent for approval' : `${FollowUp.key(r)} → ${tr.to}`, 'good');
      UI.closeModal();
      return App.render();
    }
    const pt = FollowUp.party(r.party);
    const F = {
      comment: {
        key: 'comment',
        label: 'Comment / reason',
        type: 'textarea',
        rows: 3,
        span: 2,
        required: (tr.valid || []).some(v => v.k === 'comment'),
      },
      redmine: { key: 'redmine', label: pt.ref || 'Reference no.', type: 'text' },
      expected: { key: 'expected', label: 'Expected date', type: 'date' },
      resolution: { key: 'resolution', label: 'Resolution', type: 'select', options: TaskFlow.resolutions(), blank: false },
    };
    for (const k of sc)
      if (!F[k] && /^cf_/.test(k)) {
        const d = Work.def(k, 'fu');
        if (d) F[k] = Work.ui(d);
      }
    const ks = [...sc].filter(k => F[k]);
    UI.modal({
      title: `${tr.name || tr.to} — ${FollowUp.key(r)}`,
      body: `<p class="muted small">${h(r.status)} → <b>${h(tr.to)}</b> · ${h(r.subject || '')}</p><form class="grid-form" id="fuscr">${ks.map(k => UI.field(F[k], k === 'comment' ? '' : r[k])).join('')}</form><div id="fuerr" class="t-bad small"></div>`,
      actions: `<button class="btn primary" id="fugo">${h(tr.name || tr.to)}</button>`,
      onMount(w) {
        w.querySelector('#fugo').onclick = () => {
          const form = Object.fromEntries(new FormData(w.querySelector('#fuscr')));
          const err = FollowUp.run(Store.get(id), tr.id, form);
          if (err && err !== 'pending') {
            w.querySelector('#fuerr').textContent = err;
            return;
          }
          UI.closeModal();
          UI.toast(err === 'pending' ? 'Sent for approval' : `${FollowUp.key(r)} → ${tr.to}`, 'good');
          App.render();
        };
      },
    });
  },
  /* ---------- chase ---------- */
  chaseDialog(id) {
    const r = FollowUp.norm(Store.get(id));
    if (!FollowUp.canEdit(r)) return UI.toast('Only the analyst (or a team leader / manager) can log a chase', 'bad');
    UI.modal({
      title: `Chased — ${FollowUp.key(r)}`,
      body: `<p class="muted small">${h(r.subject || '')} · ${h(r.status)}</p><form class="grid-form" id="chf">${UI.field({ key: 'on', label: 'When', type: 'date' }, U.todayStr())}${UI.field({ key: 'how', label: 'How', type: 'select', options: FollowUp.HOW, blank: false }, 'Email')}${UI.field({ key: 'reply', label: 'What they said', type: 'textarea', rows: 3, span: 2, placeholder: 'e.g. Under review with the Central team, answer next week' })}</form>`,
      actions: '<button class="btn primary" id="chgo">Save chase</button>',
      onMount(w) {
        w.querySelector('#chgo').onclick = () => {
          const f = Object.fromEntries(new FormData(w.querySelector('#chf')));
          const out = FollowUp.chase(Store.get(id), f);
          UI.closeModal();
          UI.toast(`Chase saved — next on ${U.fmtDate(out.next)}`, 'good');
          App.render();
        };
      },
    });
  },
  /* the box under the form: moves, chase log, history */
  panel(r) {
    const can = FollowUp.canEdit(r);
    const ms = TaskFlow.moves(r);
    const ch = (r.chases || []).slice().reverse();
    const hist = (r.hist || []).slice(-8).reverse();
    return `<h4 class="act-h">${h(FollowUp.key(r))} · ${FollowUpUI.stepChip(r)} <span class="muted small">open ${FollowUp.daysOpen(r) ?? '—'} d · last chase / move ${FollowUp.sinceTouch(r) ?? '—'} working d${r.next ? ' · next chase ' + U.fmtDate(r.next) : ''}</span></h4>
      ${r.flag ? `<p class="t-bad small">⚠ ${h(r.flag)}</p>` : ''}${r.link ? `<p class="small">🔗 ${h(FollowUp.linkLabel(r.link))}</p>` : ''}
      ${can && ms.length && !r.pending ? `<div class="row-btns tight">${ms.map(m => (m.ok ? `<button type="button" class="btn xs ${TaskFlow.catOf(r, m.tr.to) === 'done' ? 'primary' : ''}" data-fumv="${h(r.id)}|${h(m.tr.id)}">${h(m.tr.name || m.tr.to)} → ${h(m.tr.to)}</button>` : `<button type="button" class="btn xs ghost" disabled title="${h(m.why.join(', '))}">${h(m.tr.name || m.tr.to)} 🔒</button>`)).join('')}<button type="button" class="btn xs" data-fuch="${h(r.id)}">📞 Chased…</button></div>` : ''}
      ${typeof WorkUI !== 'undefined' ? WorkUI.pendingBox(r) : ''}
      <h4 class="act-h">Chase log <span class="count">${ch.length}</span></h4>${ch.length ? `<div class="tf-hist small">${ch.map(c => `<div><span class="muted">${h(U.fmtDate(c.on))} · ${h(c.how || '')}</span> ${h(Store.memberShort(c.by) || '')}${c.reply ? ': ' + h(c.reply) : ''}</div>`).join('')}</div>` : '<p class="muted small">No chases yet.</p>'}
      ${hist.length ? `<h4 class="act-h">Moves</h4><div class="tf-hist small">${hist.map(x => `<div><span class="muted">${h(U.fmtDate(U.ds(new Date(x.at))))}</span> ${h(Store.memberShort(x.by))}: ${h(x.from || '—')} → <b>${h(x.to)}</b>${x.note ? ` — <i>${h(x.note)}</i>` : ''}</div>`).join('')}</div>` : ''}`;
  },
  bind(root) {
    root.querySelectorAll('[data-fumv]').forEach(
      b =>
        (b.onclick = e => {
          e.preventDefault();
          e.stopPropagation();
          const [id, tr] = b.dataset.fumv.split('|');
          UI.closeModal();
          FollowUpUI.go(id, tr);
        })
    );
    root.querySelectorAll('[data-fuch]').forEach(
      b =>
        (b.onclick = e => {
          e.preventDefault();
          e.stopPropagation();
          UI.closeModal();
          FollowUpUI.chaseDialog(b.dataset.fuch);
        })
    );
    root.querySelectorAll('[data-fuqc]').forEach(
      b =>
        (b.onclick = e => {
          e.preventDefault();
          e.stopPropagation();
          const out = FollowUp.chase(Store.get(b.dataset.fuqc), { how: 'Email', reply: '' });
          UI.toast(`Chased today — next on ${U.fmtDate(out.next)}`, 'good');
          App.render();
        })
    );
  },
  /* ---------- the export for Central (no internal notes) ---------- */
  async exportFor(rows) {
    const pt = FollowUp.party('central');
    const l = rows.filter(x => x.open);
    const data = [[pt.ref || 'Reference', 'Request ID', 'Subject', 'Module', 'Step', 'Submitted', 'Days open', 'Expected']].concat(
      l.map(x => [
        x.r.redmine || '',
        x.r.reqId || '',
        x.r.subject || '',
        x.r.module || '',
        x.r.status,
        x.r.date || '',
        x.days == null ? '' : x.days,
        x.r.expected || '',
      ])
    );
    XL.download(await XL.write([{ name: 'Open follow-ups', rows: data }]), `Follow-ups for ${pt.name} ${U.todayStr()}.xlsx`);
  },
  /* ---------- summary ---------- */
  summary(all) {
    const open = all.filter(x => x.open);
    const by = (l, f) => {
      const m = {};
      for (const x of l) {
        const k = f(x) || '—';
        m[k] = (m[k] || 0) + 1;
      }
      return Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value }));
    };
    const at = (x, step) => {
      const e = (x.r.hist || []).find(hh => hh.to === step);
      return e ? U.ds(new Date(e.at)) : '';
    };
    const avg = l => {
      const v = l.filter(n => n != null && n >= 0);
      return v.length ? Math.round((10 * v.reduce((a, b) => a + b, 0)) / v.length) / 10 : null;
    };
    const acc = avg(
      all.map(x => {
        const d = at(x, 'Accepted');
        return d && x.r.date ? U.diffDays(x.r.date, d) : null;
      })
    );
    const dep = avg(
      all.map(x => {
        const a = at(x, 'Accepted'),
          d = at(x, 'Deployed') || (x.r.status === 'Deployed' ? x.r.doneDate : '');
        return a && d ? U.diffDays(a, d) : null;
      })
    );
    const closed = all.filter(x => !x.open);
    const rej = closed.filter(x => /reject/i.test(x.r.status)).length;
    const per = {};
    for (const x of open) {
      const p = (per[x.r.analyst] = per[x.r.analyst] || { open: 0, due: 0, esc: 0 });
      p.open++;
      if (x.due) p.due++;
      if (x.lvl) p.esc++;
    }
    return `<div class="kpis k4">${UI.kpi('Open', open.length)}${UI.kpi('Escalated now', open.filter(x => x.lvl === 'leader' || x.lvl === 'manager').length, 'team leader / manager level', 'sc-d')}${UI.kpi('Days to accept (avg)', acc == null ? '—' : acc, 'submitted → accepted')}${UI.kpi('Days accepted → deployed (avg)', dep == null ? '—' : dep)}</div>
      <div class="wd-grid">${card('Open by step', UI.hbars(by(open, x => x.r.status)))}${card('Open by module', open.length ? UI.hbars(by(open, x => x.r.module).slice(0, 12)) : empty('Nothing open.'))}
      ${card(
        'Oldest 10 open',
        `<div class="li-list">${
          open
            .sort((a, b) => (b.days || 0) - (a.days || 0))
            .slice(0, 10)
            .map(
              x =>
                `<div class="li click" data-edit="central|${h(x.r.id)}"><span class="mono small">${h(FollowUp.key(x.r))}</span> ${h(x.r.subject || '')} <span class="muted small">· ${x.days} d · ${h(x.r.status)} · ${h(Store.memberShort(x.r.analyst))}</span></div>`
            )
            .join('') || '<p class="muted small">Nothing open.</p>'
        }</div>`
      )}
      ${card('Closed', `<p>${closed.length} closed · <b>${closed.length ? Math.round((100 * (closed.length - rej)) / closed.length) : 0}%</b> accepted / deployed · ${rej} rejected</p>`)}
      ${card(
        'Per analyst',
        `<table class="tbl"><thead><tr><th>Analyst</th><th class="num">Open</th><th class="num">Chase due</th><th class="num">Escalated</th></tr></thead><tbody>${Object.entries(
          per
        )
          .sort((a, b) => b[1].open - a[1].open)
          .map(
            ([id, p]) =>
              `<tr><td>${h(Store.memberShort(id))}</td><td class="num">${p.open}</td><td class="num ${p.due ? 't-bad strong' : ''}">${p.due || ''}</td><td class="num">${p.esc || ''}</td></tr>`
          )
          .join('')}</tbody></table>`
      )}</div>`;
  },
  /* ---------- the upgrade card (super admin / Admin with Workflows for all teams) ---------- */
  upgradeCard() {
    if (!(App.isSuper() || AdminRole.can(App.me, 'workflows', '*'))) return '';
    const plan = FollowUp.upgradePlan();
    if (!plan.length) return '';
    const m = {};
    for (const x of plan) {
      const k = `${x.r.status || '(blank)'}${x.r.deployed === 'Yes' ? ' + Deployed' : ''} → ${x.to.status}${x.to.flag ? ' (flag: ' + x.to.flag + ')' : ''}`;
      m[k] = (m[k] || 0) + 1;
    }
    return `<div class="insights warnbox"><div>⇪ <b>${plan.length} follow-up(s) use the old status list.</b> They already show with the new steps; confirm to save them that way (notes become the first chase, scoring stays the same).<table class="tbl small" style="margin-top:6px"><tbody>${Object.entries(
      m
    )
      .map(([k, n]) => `<tr><td>${h(k)}</td><td class="num">${n}</td></tr>`)
      .join('')}</tbody></table><button class="btn sm primary" id="fuupg">Upgrade ${plan.length} follow-up(s)</button></div></div>`;
  },
};

P.central = () => {
  const s = ps('riy');
  const tab = s.tab === 'summary' ? 'summary' : 'list';
  const all = FollowUpUI.rows();
  let rows = all;
  if (s.analyst) rows = rows.filter(x => x.r.analyst === s.analyst);
  if (s.st) rows = rows.filter(x => x.r.status === s.st);
  if (s.mod) rows = rows.filter(x => x.r.module === s.mod);
  if (s.pri) rows = rows.filter(x => (x.r.priority || 'Normal') === s.pri);
  if (s.lvl) rows = rows.filter(x => (s.lvl === 'due' ? x.due : x.lvl === s.lvl));
  if (s.month) rows = rows.filter(x => inMonth(x.r.date, s.month));
  if (s.open) rows = rows.filter(x => x.open);
  const rank = x => (x.open ? 0 : 10) + (x.due ? 0 : 4) + ({ manager: 0, leader: 1, analyst: 2 }[x.lvl] ?? 3);
  rows.sort((a, b) => rank(a) - rank(b) || (b.days || 0) - (a.days || 0));
  const n = f => all.filter(f).length;
  const steps = [...new Set(FollowUp.flows().flatMap(w => TaskFlow.norm(w).statuses.map(x => x.name)))];
  const head = `<div class="tabs"><a class="tab ${tab === 'list' ? 'on' : ''}" href="javascript:void 0" data-rtab="list">Follow-ups</a><a class="tab ${tab === 'summary' ? 'on' : ''}" href="javascript:void 0" data-rtab="summary">Summary</a></div>`;
  let body;
  if (tab === 'summary') body = FollowUpUI.summary(all);
  else
    body = `<div class="kpis k5">${UI.kpi(
      'Chase due',
      n(x => x.due),
      'next chase today or before',
      n(x => x.due) ? 'sc-c' : ''
    )}${UI.kpi(
      'Need analyst follow-up',
      n(x => x.lvl === 'analyst'),
      `${FollowUp.targets().analyst}+ working days since last chase`,
      n(x => x.lvl === 'analyst') ? 'sc-c' : ''
    )}${UI.kpi(
      'Need team leader follow-up',
      n(x => x.lvl === 'leader'),
      `${FollowUp.targets().leader}+ days`,
      n(x => x.lvl === 'leader') ? 'sc-d' : ''
    )}${UI.kpi(
      'Need manager follow-up',
      n(x => x.lvl === 'manager'),
      `${FollowUp.targets().manager}+ days`,
      n(x => x.lvl === 'manager') ? 'sc-e' : ''
    )}${UI.kpi(
      'Waiting deployment',
      n(x => x.open && /deploy/i.test(x.r.status))
    )}</div>
    <div class="page-actions">${filterBar('riy', [
      { key: 'analyst', type: 'member' },
      { key: 'st', label: 'Step', options: steps },
      { key: 'mod', label: 'Module', options: [...new Set(all.map(x => x.r.module).filter(Boolean))].sort() },
      { key: 'pri', label: 'Priority', options: ['High', 'Normal', 'Low'] },
      {
        key: 'lvl',
        label: 'Needs',
        options: [
          ['due', 'Chase due'],
          ['analyst', 'Analyst follow-up'],
          ['leader', 'Team leader follow-up'],
          ['manager', 'Manager follow-up'],
        ],
      },
      { key: 'month', type: 'month' },
      { key: 'open', type: 'toggle', label: 'Open only', dflt: true },
    ])}${addBtn('central', 'New follow-up')}<button class="btn ghost" id="fuexp" title="Open follow-ups: reference no., subject, step, days open — no internal notes">⇩ List for Central</button></div>
    ${UI.table({
      id: 'riy',
      rows,
      exportName: 'Central FU',
      onRow: true,
      cols: [
        { key: 'key', label: 'Key', get: x => FollowUp.key(x.r), sortVal: x => +x.r.n || 0 },
        { key: 'date', label: 'Date', get: x => U.fmtDate(x.r.date), sortVal: x => x.r.date || '' },
        {
          key: 'subject',
          label: 'Subject',
          html: x =>
            h(x.r.subject || '') +
            (x.r.requester ? ` <span class="muted small">· ${h(x.r.requester)}</span>` : '') +
            (x.r.link ? ' <span title="Linked">🔗</span>' : '') +
            ((x.r.chases || []).length
              ? `<div class="muted small">📞 ${h(U.fmtDate(x.r.chases[x.r.chases.length - 1].on))}${x.r.chases[x.r.chases.length - 1].reply ? ': ' + h(x.r.chases[x.r.chases.length - 1].reply.slice(0, 80)) : ''}</div>`
              : ''),
          get: x => x.r.subject,
        },
        { key: 'module', label: 'Module', get: x => x.r.module },
        { key: 'analyst', label: 'Analyst', get: x => Store.memberShort(x.r.analyst) },
        {
          key: 'status',
          label: 'Step',
          html: x => FollowUpUI.stepChip(x.r) + (x.r.priority === 'High' ? ' <span class="t-bad small">High</span>' : ''),
          get: x => x.r.status,
        },
        { key: 'redmine', label: 'Redmine', get: x => x.r.redmine || '' },
        { key: 'days', label: 'Days open', cls: 'num', get: x => (x.days == null ? '' : x.days), sortVal: x => x.days || 0 },
        {
          key: 'since',
          label: 'Since chase',
          cls: 'num',
          get: x => (x.open && x.since != null ? x.since : ''),
          sortVal: x => x.since || 0,
        },
        {
          key: 'next',
          label: 'Next chase',
          html: x => (x.open && x.r.next ? `<span class="${x.due ? 't-bad strong' : 'muted'}">${h(U.fmtDate(x.r.next))}</span>` : ''),
          get: x => x.r.next || '',
        },
        { key: 'c', label: 'Needs', html: x => (x.open ? UI.sbadge(x.c) : '<span class="muted small">closed</span>'), get: x => x.c },
        {
          key: 'act',
          label: '',
          html: x =>
            x.open && FollowUp.canEdit(x.r)
              ? `<span class="row-btns tight"><button class="btn xs" data-fuqc="${h(x.r.id)}" title="Log a chase today (email) and set the next one">✓ Chased today</button><button class="btn xs ghost" data-fuch="${h(x.r.id)}" title="Chase with details">…</button></span>`
              : '',
          get: () => '',
        },
      ],
    })}`;
  const html = FollowUpUI.upgradeCard() + head + body;
  return {
    title: 'Central Follow-up',
    html,
    mount(root) {
      UI.bindTables(root, { riy: x => UI.editRecord('central', x.r) });
      root.querySelectorAll('[data-rtab]').forEach(
        a =>
          (a.onclick = () => {
            s.tab = a.dataset.rtab;
            App.render();
          })
      );
      FollowUpUI.bind(root);
      const ex = root.querySelector('#fuexp');
      if (ex) ex.onclick = () => FollowUpUI.exportFor(rows);
      const up = root.querySelector('#fuupg');
      if (up)
        up.onclick = () =>
          UI.confirm(`Save ${FollowUp.upgradePlan().length} follow-up(s) with the new steps?`, () => {
            const k = FollowUp.upgrade();
            UI.toast(`${k} follow-up(s) upgraded`, 'good');
            App.render();
          });
    },
  };
};

/* ---------- wiring: the form box, Home (chases due), Manager desk ---------- */
(function wire() {
  const S = Schemas.central;
  S.onFormMount = (form, base) => {
    if (!base || !base.id) return;
    const box = document.createElement('div');
    box.className = 'tfx';
    box.innerHTML = FollowUpUI.panel(FollowUp.norm(Store.get(base.id) || base));
    form.parentNode.insertBefore(box, form.nextSibling);
    FollowUpUI.bind(box);
    if (typeof WorkUI !== 'undefined') WorkUI.bindApprovals(box);
  };
  const hm = P.home;
  P.home = function (...a) {
    const pg = hm.apply(this, a);
    if (!pg || !pg.html) return pg;
    const l = Store.all('central').filter(r => r.analyst === App.me && FollowUp.chaseDue(r));
    if (!l.length) return pg;
    const c = card(
      `↗ Central chases due <span class="count">${l.length}</span>`,
      `<div class="li-list">${l
        .map(r0 => {
          const r = FollowUp.norm(r0);
          return `<div class="li"><span class="grow click" data-edit="central|${h(r.id)}"><span class="mono small">${h(FollowUp.key(r))}</span> ${h(r.subject || '')} <span class="muted small">· ${h(r.status)} · due ${h(U.fmtDate(r.next))}</span></span><button class="btn xs" data-fuqc="${h(r.id)}">✓ Chased today</button><button class="btn xs ghost" data-fuch="${h(r.id)}">…</button></div>`;
        })
        .join('')}</div>`
    );
    const m = pg.mount;
    return Object.assign({}, pg, {
      html: c + pg.html,
      mount(root) {
        if (m) m.call(this, root);
        FollowUpUI.bind(root);
      },
    });
  };
  const mg = P.manager;
  if (mg)
    P.manager = function (...a) {
      const pg = mg.apply(this, a);
      if (!pg || !pg.html) return pg;
      const rows = FollowUpUI.rows().filter(x => x.open);
      const esc = rows.filter(x => x.lvl === 'leader' || x.lvl === 'manager');
      if (!rows.length) return pg;
      const c = card(
        `↗ Central follow-ups <span class="count">${rows.length} open</span>`,
        `<p class="small">${esc.length} escalated (team leader / manager) · ${rows.filter(x => x.due).length} chase due · <a class="link" href="#/central" data-rsum>Summary →</a></p>${rows
          .sort((x, y) => (y.days || 0) - (x.days || 0))
          .slice(0, 5)
          .map(
            x =>
              `<div class="li click" data-edit="central|${h(x.r.id)}"><span class="mono small">${h(FollowUp.key(x.r))}</span> ${h(x.r.subject || '')} <span class="muted small">· ${x.days} d · ${h(x.r.status)} · ${h(Store.memberShort(x.r.analyst))}</span></div>`
          )
          .join('')}`
      );
      const m = pg.mount;
      return Object.assign({}, pg, {
        html: pg.html + c,
        mount(root) {
          if (m) m.call(this, root);
          const l = root.querySelector('[data-rsum]');
          if (l)
            l.onclick = () => {
              ps('riy').tab = 'summary';
            };
        },
      });
    };
})();
