/* MAHAM — 💼 Sales (CRM): companies, contacts, deals on a pipeline, activities, quotes with VAT, forecast.
 * Records (each in the writer's own data; the newest version wins, as with every record):
 *   account  { id, name, industry, website, city, phone, owner, notes }
 *   contact  { id, name, email, phone, title, account, owner, tags [..], notes }
 *   deal     { id, no (DL-n), title, account, contact, value, stage, prob (from the stage unless set), expected (date),
 *              owner, source, status open|won|lost, wonAt, lostAt, lostReason, hist [{ at, by, from, to }] }
 *   crmact   { id, on (deal / contact / account id), kind call|meeting|email|note|followup, text, due (date), done, by, at }
 *   quote    { id, no (QT-n), deal, lines [{ item, qty, price }], vat (%), status Draft|Sent|Accepted|Rejected, valid (date), at, by }
 *   settings-crm { stages [{ name, prob }], currency, vat, seller { name, vatNo, address } } — the super admin's */
'use strict';

const CRM = {
  DEF: {
    stages: [
      { name: 'Lead', prob: 10 },
      { name: 'Qualified', prob: 25 },
      { name: 'Proposal', prob: 50 },
      { name: 'Negotiation', prob: 75 },
    ],
    currency: 'SAR',
    vat: 15,
    seller: { name: '', vatNo: '', address: '' },
  },
  KINDS: [
    ['call', '📞 Call'],
    ['meeting', '🤝 Meeting'],
    ['email', '✉ Email'],
    ['note', '📝 Note'],
    ['followup', '⏰ Follow-up'],
  ],
  cfg() {
    const s = Store.get('settings-crm') || {};
    return {
      stages: s.stages && s.stages.length ? s.stages : CRM.DEF.stages,
      currency: s.currency || CRM.DEF.currency,
      vat: s.vat != null ? +s.vat : CRM.DEF.vat,
      seller: Object.assign({}, CRM.DEF.seller, s.seller || {}),
    };
  },
  all(c) {
    return Store.all(c, '*');
  },
  mineOnly() {
    return !(App.isSuper() || App.can('viewOthers'));
  },
  visible(c) {
    const l = CRM.all(c);
    return CRM.mineOnly() ? l.filter(r => r.owner === App.me || r.by === App.me) : l;
  },
  money(n) {
    return `${U.num(Math.round(+n || 0), 0)} ${CRM.cfg().currency}`;
  },
  name(id) {
    const r = id && Store.get(id);
    return r ? r.name || r.title || '' : '';
  },
  key(d) {
    return d && d.no ? (d.c === 'quote' ? 'QT-' : 'DL-') + d.no : '';
  },
  next(c) {
    CRM._taken = CRM._taken || {};
    const t = (CRM._taken[c] = CRM._taken[c] || []);
    const n = Math.max(0, ...CRM.all(c).map(x => +x.no || 0), ...t) + 1;
    t.push(n);
    return n;
  },
  prob(d) {
    if (d.status === 'won') return 100;
    if (d.status === 'lost') return 0;
    if (d.prob != null && d.prob !== '') return +d.prob;
    const s = CRM.cfg().stages.find(x => x.name === d.stage);
    return s ? +s.prob : 0;
  },
  open(d) {
    return (d.status || 'open') === 'open';
  },
  /* ---------- changes ---------- */
  saveDeal(d, patch) {
    const n = Object.assign({}, d, patch);
    const now = Date.now();
    if (patch.stage && patch.stage !== d.stage)
      n.hist = [...(d.hist || []), { at: now, by: App.me, from: d.stage, to: patch.stage }].slice(-80);
    if (patch.status === 'won') n.wonAt = now;
    if (patch.status === 'lost') n.lostAt = now;
    if (patch.status === 'open') {
      n.wonAt = null;
      n.lostAt = null;
      n.lostReason = '';
    }
    Store.save(n);
    return n;
  },
  newDeal(pre) {
    return {
      c: 'deal',
      id: Maham.uid('deal'),
      no: CRM.next('deal'),
      status: 'open',
      stage: CRM.cfg().stages[0].name,
      owner: App.me,
      value: 0,
      expected: U.addDays(U.todayStr(), 30),
      ...pre,
    };
  },
  activity(on, kind, text, due) {
    const a = {
      c: 'crmact',
      id: Maham.uid('crmact'),
      on,
      kind,
      text: String(text || '').trim(),
      due: due || '',
      done: !due,
      by: App.me,
      at: Date.now(),
    };
    if (!a.text) return null;
    Store.save(a);
    return a;
  },
  acts(on) {
    return Store.all('crmact', '*')
      .filter(a => a.on === on)
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  },
  quoteTotals(q) {
    const sub = (q.lines || []).reduce((n, l) => n + (+l.qty || 0) * (+l.price || 0), 0);
    const vat = (sub * (+q.vat || 0)) / 100;
    return { sub, vat, total: sub + vat };
  },

  /* ---------- the pages ---------- */
  tabs(on) {
    const t = [
      ['pipeline', 'Pipeline'],
      ['deals', 'Deals'],
      ['accounts', 'Companies'],
      ['contacts', 'Contacts'],
      ['activities', 'Activities'],
      ['forecast', 'Forecast'],
      ...(App.isSuper() ? [['settings', 'Settings']] : []),
    ];
    return `<div class="tabs">${t.map(([k, l]) => `<a class="tab ${k === on ? 'on' : ''}" href="#/crm/${k}">${l}</a>`).join('')}</div>`;
  },
  page(sub) {
    const tab = ['pipeline', 'deals', 'accounts', 'contacts', 'activities', 'forecast', 'settings'].includes(sub) ? sub : 'pipeline';
    const v = CRM['v_' + tab]();
    return { title: 'Sales', html: CRM.tabs(tab) + v.html, mount: v.mount };
  },
  v_pipeline() {
    const st = CRM.cfg().stages;
    const deals = CRM.visible('deal').filter(CRM.open);
    const col = s => {
      const ds = deals.filter(d => (d.stage || st[0].name) === s.name);
      const sum = ds.reduce((n, d) => n + (+d.value || 0), 0);
      return `<div class="crm-col" data-stage="${h(s.name)}"><div class="crm-ch"><b>${h(s.name)}</b> <span class="count">${ds.length}</span><div class="muted small">${CRM.money(sum)} · ${s.prob}%</div></div>
        ${
          ds
            .sort((a, b) => (+b.value || 0) - (+a.value || 0))
            .map(
              d => `<div class="crm-card" draggable="true" data-deal="${h(d.id)}"><div class="muted small">${h(CRM.key(d))} · ${h(CRM.name(d.account))}</div><b>${h(d.title)}</b>
          <div class="crm-cm"><span>${CRM.money(d.value)}</span><span class="muted small">${h(Store.memberShort(d.owner) || '')}${d.expected ? ' · ' + h(U.fmtDate(d.expected)) : ''}</span></div></div>`
            )
            .join('') || '<div class="muted small crm-empty">—</div>'
        }</div>`;
    };
    const weighted = deals.reduce((n, d) => n + ((+d.value || 0) * CRM.prob(d)) / 100, 0);
    return {
      html: `<div class="page-actions"><span class="totals-line"><b>${deals.length}</b> open deals · <b>${CRM.money(deals.reduce((n, d) => n + (+d.value || 0), 0))}</b> in the pipeline · <b>${CRM.money(weighted)}</b> weighted</span><span class="grow"></span><button class="btn primary" id="crmnew">＋ New deal</button></div>
      <div class="crm-board">${st.map(col).join('')}</div><p class="muted small">Drag a deal to another stage · click it to open it.</p>`,
      mount(root) {
        root.querySelector('#crmnew').onclick = () => CRM.editDeal(CRM.newDeal({}));
        root.querySelectorAll('.crm-card').forEach(c => {
          c.onclick = () => CRM.openDeal(Store.get(c.dataset.deal));
          c.ondragstart = e => {
            e.dataTransfer.setData('text/plain', c.dataset.deal);
            c.classList.add('drag');
          };
          c.ondragend = () => c.classList.remove('drag');
        });
        root.querySelectorAll('.crm-col').forEach(col => {
          col.ondragover = e => {
            e.preventDefault();
            col.classList.add('over');
          };
          col.ondragleave = () => col.classList.remove('over');
          col.ondrop = e => {
            e.preventDefault();
            col.classList.remove('over');
            const d = Store.get(e.dataTransfer.getData('text/plain'));
            if (d && d.stage !== col.dataset.stage) {
              CRM.saveDeal(d, { stage: col.dataset.stage });
              App.render();
            }
          };
        });
      },
    };
  },
  v_deals() {
    const f = ps('crmdeals');
    let rows = CRM.visible('deal');
    if (f.st) rows = rows.filter(d => (d.status || 'open') === f.st);
    if (f.who) rows = rows.filter(d => d.owner === f.who);
    if (f.stage) rows = rows.filter(d => d.stage === f.stage);
    return {
      html: `<div class="page-actions">${filterBar('crmdeals', [
        {
          key: 'st',
          label: 'Status',
          options: [
            ['open', 'Open'],
            ['won', 'Won'],
            ['lost', 'Lost'],
          ],
        },
        { key: 'stage', label: 'Stage', options: CRM.cfg().stages.map(s => s.name) },
        { key: 'who', type: 'member', label: 'Owner' },
      ])}<span class="grow"></span><button class="btn primary" id="crmnew">＋ New deal</button></div>
      ${UI.table({
        id: 'crmdeals',
        rows,
        exportName: 'Deals',
        onRow: true,
        cols: [
          { key: 'no', label: 'ID', get: r => CRM.key(r), sortVal: r => +r.no || 0 },
          { key: 'title', label: 'Deal', get: r => r.title },
          { key: 'account', label: 'Company', get: r => CRM.name(r.account) },
          { key: 'value', label: 'Value', cls: 'num', get: r => CRM.money(r.value), sortVal: r => +r.value || 0 },
          { key: 'stage', label: 'Stage', get: r => (r.status === 'won' ? '✓ Won' : r.status === 'lost' ? '✕ Lost' : r.stage) },
          { key: 'prob', label: '%', cls: 'num', get: r => CRM.prob(r) },
          { key: 'expected', label: 'Expected', get: r => U.fmtDate(r.expected), sortVal: r => r.expected || '' },
          { key: 'owner', label: 'Owner', get: r => Store.memberShort(r.owner) || '' },
        ],
      })}`,
      mount(root) {
        UI.bindTables(root, { crmdeals: r => CRM.openDeal(r) });
        root.querySelector('#crmnew').onclick = () => CRM.editDeal(CRM.newDeal({}));
      },
    };
  },
  v_accounts() {
    const rows = CRM.visible('account');
    return {
      html: `<div class="page-actions"><span class="grow"></span><button class="btn primary" id="crmacc">＋ New company</button></div>
      ${UI.table({
        id: 'crmacc',
        rows,
        exportName: 'Companies',
        onRow: true,
        cols: [
          { key: 'name', label: 'Company', get: r => r.name },
          { key: 'industry', label: 'Industry', get: r => r.industry || '' },
          { key: 'city', label: 'City', get: r => r.city || '' },
          {
            key: 'deals',
            label: 'Open deals',
            cls: 'num',
            get: r => CRM.all('deal').filter(d => d.account === r.id && CRM.open(d)).length,
          },
          { key: 'owner', label: 'Owner', get: r => Store.memberShort(r.owner) || '' },
        ],
      })}`,
      mount(root) {
        UI.bindTables(root, { crmacc: r => CRM.openParty(r) });
        root.querySelector('#crmacc').onclick = () => CRM.editParty({ c: 'account', id: Maham.uid('account'), owner: App.me });
      },
    };
  },
  v_contacts() {
    const rows = CRM.visible('contact');
    return {
      html: `<div class="page-actions"><span class="grow"></span><button class="btn primary" id="crmcon">＋ New contact</button></div>
      ${UI.table({
        id: 'crmcon',
        rows,
        exportName: 'Contacts',
        onRow: true,
        cols: [
          { key: 'name', label: 'Name', get: r => r.name },
          { key: 'title', label: 'Title', get: r => r.title || '' },
          { key: 'account', label: 'Company', get: r => CRM.name(r.account) },
          { key: 'email', label: 'Email', get: r => r.email || '' },
          { key: 'phone', label: 'Phone', get: r => r.phone || '' },
          { key: 'owner', label: 'Owner', get: r => Store.memberShort(r.owner) || '' },
        ],
      })}`,
      mount(root) {
        UI.bindTables(root, { crmcon: r => CRM.openParty(r) });
        root.querySelector('#crmcon').onclick = () => CRM.editParty({ c: 'contact', id: Maham.uid('contact'), owner: App.me });
      },
    };
  },
  v_activities() {
    const today = U.todayStr();
    const mine = Store.all('crmact', '*').filter(a => a.by === App.me || App.isSuper() || (Store.get(a.on) || {}).owner === App.me); // also on what I own (e.g. a sign-up from a form)
    const due = mine.filter(a => a.due && !a.done).sort((a, b) => a.due.localeCompare(b.due));
    const li = a =>
      `<div class="li"><div class="grow"><b>${h((CRM.KINDS.find(k => k[0] === a.kind) || ['', a.kind])[1])}</b> ${h(a.text)} <span class="muted small">· ${h(CRM.name(a.on))} · ${a.due ? (a.due < today ? `<span class="t-bad">${h(U.fmtDate(a.due))}</span>` : h(U.fmtDate(a.due))) : h(Maham.when(a.at))}</span></div>${a.due && !a.done ? `<button class="btn xs" data-actdone="${h(a.id)}">✓ Done</button>` : ''}</div>`;
    return {
      html: `${card(`Follow-ups to do <span class="count">${due.length}</span>`, due.length ? due.map(li).join('') : '<p class="muted small">Nothing to follow up.</p>')}${card(
        'Recent',
        mine
          .filter(a => !a.due || a.done)
          .sort((a, b) => (b.at || 0) - (a.at || 0))
          .slice(0, 30)
          .map(li)
          .join('') || '<p class="muted small">No activities yet.</p>'
      )}`,
      mount(root) {
        root.querySelectorAll('[data-actdone]').forEach(
          b =>
            (b.onclick = () => {
              const a = Store.get(b.dataset.actdone);
              if (a) {
                Store.save(Object.assign({}, a, { done: true, doneAt: Date.now() }));
                App.render();
              }
            })
        );
      },
    };
  },
  v_forecast() {
    const deals = CRM.visible('deal');
    const months = [...Array(6)].map((_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() + i);
      return U.ds(d).slice(0, 7);
    });
    const row = m => {
      const ds = deals.filter(d => (d.expected || '').slice(0, 7) === m);
      const open = ds.filter(CRM.open);
      const won = deals.filter(d => d.status === 'won' && d.wonAt && U.ds(new Date(d.wonAt)).slice(0, 7) === m);
      return `<tr><td>${h(U.MONTHS[+m.slice(5) - 1])} ${m.slice(0, 4)}</td><td class="num">${open.length}</td><td class="num">${CRM.money(open.reduce((n, d) => n + (+d.value || 0), 0))}</td><td class="num"><b>${CRM.money(open.reduce((n, d) => n + ((+d.value || 0) * CRM.prob(d)) / 100, 0))}</b></td><td class="num">${CRM.money(won.reduce((n, d) => n + (+d.value || 0), 0))}</td></tr>`;
    };
    const closed = deals.filter(d => !CRM.open(d));
    const win = closed.length ? Math.round((closed.filter(d => d.status === 'won').length / closed.length) * 100) : 0;
    return {
      html: `<div class="totals-line">Win rate <b>${win}%</b> (${closed.length} closed)</div>${card('Next 6 months — by expected close date', `<table class="tbl"><thead><tr><th>Month</th><th class="num">Open deals</th><th class="num">Pipeline</th><th class="num">Weighted</th><th class="num">Won</th></tr></thead><tbody>${months.map(row).join('')}</tbody></table>`)}`,
      mount() {},
    };
  },
  v_settings() {
    const c = CRM.cfg();
    return {
      html: `${card('Pipeline stages', `<div id="crmst">${c.stages.map(s => `<div class="crm-st"><input class="crm-sn" value="${h(s.name)}"> <input class="crm-sp" type="number" min="0" max="100" value="${s.prob}" style="width:80px"> % <a href="#" class="link small" data-stdel>Remove</a></div>`).join('')}</div><button class="btn sm" id="crmstadd">＋ Stage</button><p class="muted small">Won and Lost are always there (100% and 0%).</p>`)}
      ${card(
        'Money and quotes',
        `<div class="grid-form"><label class="fld"><span>Currency</span><input id="crmcur" value="${h(c.currency)}"></label><label class="fld"><span>VAT %</span><input id="crmvat" type="number" min="0" max="100" value="${c.vat}"></label>
        <label class="fld"><span>Seller name (on quotes)</span><input id="crmsn" value="${h(c.seller.name)}"></label><label class="fld"><span>VAT number</span><input id="crmsv" value="${h(c.seller.vatNo)}"></label><label class="fld span2"><span>Address</span><input id="crmsa" value="${h(c.seller.address)}"></label></div>`
      )}
      <div class="row-btns"><span class="grow"></span><button class="btn primary" id="crmsave">Save settings</button></div>`,
      mount(root) {
        const box = root.querySelector('#crmst');
        const bind = () =>
          box.querySelectorAll('[data-stdel]').forEach(
            a =>
              (a.onclick = e => {
                e.preventDefault();
                a.closest('.crm-st').remove();
              })
          );
        bind();
        root.querySelector('#crmstadd').onclick = () => {
          box.insertAdjacentHTML(
            'beforeend',
            '<div class="crm-st"><input class="crm-sn" placeholder="Stage"> <input class="crm-sp" type="number" min="0" max="100" value="50" style="width:80px"> % <a href="#" class="link small" data-stdel>Remove</a></div>'
          );
          bind();
        };
        root.querySelector('#crmsave').onclick = () => {
          const stages = [...box.querySelectorAll('.crm-st')]
            .map(r => ({
              name: r.querySelector('.crm-sn').value.trim(),
              prob: Math.max(0, Math.min(100, +r.querySelector('.crm-sp').value || 0)),
            }))
            .filter(s => s.name);
          if (!stages.length) return UI.toast('Keep at least one stage', 'bad');
          Store.save(
            Object.assign({ id: 'settings-crm', c: 'settings' }, Store.get('settings-crm') || {}, {
              stages,
              currency: root.querySelector('#crmcur').value.trim() || 'SAR',
              vat: +root.querySelector('#crmvat').value || 0,
              seller: {
                name: root.querySelector('#crmsn').value.trim(),
                vatNo: root.querySelector('#crmsv').value.trim(),
                address: root.querySelector('#crmsa').value.trim(),
              },
            })
          );
          UI.toast('Sales settings saved', 'good');
          App.render();
        };
      },
    };
  },
  /* ---------- forms ---------- */
  sel(id, list, val, blank) {
    return `<select id="${id}">${blank ? `<option value="">${h(blank)}</option>` : ''}${list.map(([v, l]) => `<option value="${h(v)}" ${v === val ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>`;
  },
  editDeal(d) {
    const accs = CRM.all('account').map(a => [a.id, a.name]);
    const cons = CRM.all('contact').map(x => [x.id, x.name]);
    UI.modal({
      title: (Store.get(d.id) ? 'Edit ' : 'New ') + 'deal ' + CRM.key(d),
      wide: true,
      body: `<div class="grid-form">
        <label class="fld span2"><span>Deal</span><input id="dlt" value="${h(d.title || '')}" maxlength="200"></label>
        <label class="fld"><span>Company</span>${CRM.sel('dla', accs, d.account, '—')}</label><label class="fld"><span>Contact</span>${CRM.sel('dlc', cons, d.contact, '—')}</label>
        <label class="fld"><span>Value (${h(CRM.cfg().currency)})</span><input id="dlv" type="number" min="0" step="100" value="${+d.value || 0}"></label>
        <label class="fld"><span>Stage</span>${CRM.sel(
          'dls',
          CRM.cfg().stages.map(s => [s.name, `${s.name} (${s.prob}%)`]),
          d.stage
        )}</label>
        <label class="fld"><span>Expected close</span><input id="dle" type="date" value="${h(d.expected || '')}"></label>
        <label class="fld"><span>Owner</span>${CRM.sel(
          'dlo',
          Maham.people().map(p => [p.id, p.name]),
          d.owner
        )}</label>
        <label class="fld"><span>Source</span><input id="dlsrc" value="${h(d.source || '')}" placeholder="e.g. website, referral, event"></label></div>`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>',
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const v = id => w.querySelector('#' + id).value;
          if (!v('dlt').trim()) return UI.toast('Name the deal', 'bad');
          const n = CRM.saveDeal(Store.get(d.id) || d, {
            title: v('dlt').trim(),
            account: v('dla'),
            contact: v('dlc'),
            value: Math.max(0, +v('dlv') || 0),
            stage: v('dls'),
            expected: v('dle'),
            owner: v('dlo'),
            source: v('dlsrc').trim(),
          });
          UI.closeModal();
          App.render();
          CRM.openDeal(n);
        };
      },
    });
  },
  openDeal(d) {
    d = Store.get(d.id) || d;
    const acts = CRM.acts(d.id);
    const qs = CRM.all('quote').filter(q => q.deal === d.id);
    const actLi = a =>
      `<div class="li"><div class="grow"><b>${h((CRM.KINDS.find(k => k[0] === a.kind) || ['', a.kind])[1])}</b> ${h(a.text)} <span class="muted small">· ${h(Store.memberShort(a.by) || '')} · ${a.due ? 'due ' + h(U.fmtDate(a.due)) + (a.done ? ' ✓' : '') : h(Maham.when(a.at))}</span></div></div>`;
    UI.modal({
      title: `${CRM.key(d)} · ${d.title}`,
      wide: true,
      body: `<div class="crm-top"><b>${CRM.money(d.value)}</b> · ${d.status === 'won' ? '<span class="badge good">Won</span>' : d.status === 'lost' ? `<span class="badge bad">Lost</span>${d.lostReason ? ' — ' + h(d.lostReason) : ''}` : `${h(d.stage)} (${CRM.prob(d)}%)`}
        · ${h(CRM.name(d.account) || 'no company')}${d.contact ? ' · ' + h(CRM.name(d.contact)) : ''} · owner ${h(Store.memberShort(d.owner) || '')}${d.expected ? ' · expected ' + h(U.fmtDate(d.expected)) : ''}</div>
      <h4>Activity</h4><div class="crm-act">${CRM.sel('aak', CRM.KINDS, 'note')} <input id="aat" placeholder="What happened / what to do" style="flex:1"> <input id="aad" type="date" title="Due (for a follow-up)"> <button class="btn sm" id="aago">Add</button></div>
      <div>${acts.map(actLi).join('') || '<p class="muted small">Nothing yet.</p>'}</div>
      <h4>Quotes</h4><div>${
        qs
          .map(q => {
            const t = CRM.quoteTotals(q);
            return `<div class="li"><div class="grow"><b>${h(CRM.key(q))}</b> ${UI.sbadge(q.status || 'Draft')} ${CRM.money(t.total)} <span class="muted small">incl. VAT ${q.vat}%</span></div><a href="#" class="link small" data-qopen="${h(q.id)}">Open</a></div>`;
          })
          .join('') || '<p class="muted small">No quotes yet.</p>'
      }<button class="btn sm" id="qnew">＋ Quote</button></div>
      ${Attach.box(d)}`,
      actions: `${CRM.open(d) ? '<button class="btn" data-won>✓ Won</button> <button class="btn" data-lost>✕ Lost</button>' : '<button class="btn" data-reopen>Reopen</button>'} <button class="btn ghost" data-edit>Edit</button>${typeof Chat !== 'undefined' && Store.pageOn(App.me, 'chat', App.viewTeam) ? ' <button class="btn ghost" data-disc>💬 Discuss</button>' : ''}<span class="grow"></span><button class="btn primary" data-c>Close</button>`,
      onMount: w => {
        const again = () => {
          UI.closeModal();
          App.render();
          CRM.openDeal(Store.get(d.id) || d);
        };
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('#aat').addEventListener('keydown', e => e.stopPropagation());
        w.querySelector('#aago').onclick = () => {
          const a = CRM.activity(d.id, w.querySelector('#aak').value, w.querySelector('#aat').value, w.querySelector('#aad').value);
          if (!a) return UI.toast('Write what happened', 'bad');
          again();
        };
        const won = w.querySelector('[data-won]');
        if (won)
          won.onclick = () => {
            CRM.saveDeal(d, { status: 'won' });
            UI.toast('🎉 Won', 'good');
            again();
          };
        const lost = w.querySelector('[data-lost]');
        if (lost)
          lost.onclick = () => {
            const why = prompt('Why was it lost? (price, timing, competitor …)') || '';
            CRM.saveDeal(d, { status: 'lost', lostReason: why.trim() });
            again();
          };
        const re = w.querySelector('[data-reopen]');
        if (re)
          re.onclick = () => {
            CRM.saveDeal(d, { status: 'open' });
            again();
          };
        w.querySelector('[data-edit]').onclick = () => {
          UI.closeModal();
          CRM.editDeal(d);
        };
        const di = w.querySelector('[data-disc]');
        if (di) di.onclick = () => Chat.discuss(d);
        w.querySelector('#qnew').onclick = () => {
          UI.closeModal();
          CRM.editQuote({
            c: 'quote',
            id: Maham.uid('quote'),
            no: CRM.next('quote'),
            deal: d.id,
            lines: [{ item: d.title, qty: 1, price: +d.value || 0 }],
            vat: CRM.cfg().vat,
            status: 'Draft',
            valid: U.addDays(U.todayStr(), 30),
            at: Date.now(),
            by: App.me,
          });
        };
        w.querySelectorAll('[data-qopen]').forEach(
          a =>
            (a.onclick = e => {
              e.preventDefault();
              UI.closeModal();
              CRM.editQuote(Store.get(a.dataset.qopen));
            })
        );
        Attach.bind(w, d);
      },
    });
  },
  editQuote(q) {
    const line = (l, i) =>
      `<tr data-l="${i}"><td><input class="ql-i" value="${h(l.item || '')}"></td><td><input class="ql-q" type="number" min="0" step="1" value="${+l.qty || 0}" style="width:70px"></td><td><input class="ql-p" type="number" min="0" step="0.01" value="${+l.price || 0}" style="width:110px"></td><td class="num ql-t"></td><td><a href="#" class="link small" data-ldel>✕</a></td></tr>`;
    UI.modal({
      title: `Quote ${CRM.key(q)}`,
      wide: true,
      body: `<table class="tbl"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th class="num">Total</th><th></th></tr></thead><tbody id="qlines">${(q.lines || []).map(line).join('')}</tbody></table>
        <button class="btn sm" id="qladd">＋ Line</button>
        <div class="grid-form"><label class="fld"><span>VAT %</span><input id="qvat" type="number" min="0" max="100" value="${+q.vat || 0}"></label><label class="fld"><span>Valid until</span><input id="qval" type="date" value="${h(q.valid || '')}"></label>
        <label class="fld"><span>Status</span>${CRM.sel(
          'qst',
          ['Draft', 'Sent', 'Accepted', 'Rejected'].map(x => [x, x]),
          q.status || 'Draft'
        )}</label></div><div id="qtot" class="totals-line"></div>`,
      actions:
        '<button class="btn ghost" data-qprint>🖨 Print</button><span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>',
      onMount: w => {
        const read = () => ({
          lines: [...w.querySelectorAll('#qlines tr')]
            .map(r => ({
              item: r.querySelector('.ql-i').value.trim(),
              qty: +r.querySelector('.ql-q').value || 0,
              price: +r.querySelector('.ql-p').value || 0,
            }))
            .filter(l => l.item || l.price),
          vat: +w.querySelector('#qvat').value || 0,
          valid: w.querySelector('#qval').value,
          status: w.querySelector('#qst').value,
        });
        const calc = () => {
          w.querySelectorAll('#qlines tr').forEach(r => {
            r.querySelector('.ql-t').textContent = CRM.money(
              (+r.querySelector('.ql-q').value || 0) * (+r.querySelector('.ql-p').value || 0)
            );
          });
          const t = CRM.quoteTotals(read());
          w.querySelector('#qtot').innerHTML =
            `Subtotal <b>${CRM.money(t.sub)}</b> · VAT <b>${CRM.money(t.vat)}</b> · Total <b>${CRM.money(t.total)}</b>`;
        };
        const bind = () => {
          w.querySelectorAll('#qlines input').forEach(i => {
            i.oninput = calc;
            i.addEventListener('keydown', e => e.stopPropagation());
          });
          w.querySelectorAll('[data-ldel]').forEach(
            a =>
              (a.onclick = e => {
                e.preventDefault();
                a.closest('tr').remove();
                calc();
              })
          );
        };
        w.querySelector('#qladd').onclick = () => {
          const tb = w.querySelector('#qlines');
          tb.insertAdjacentHTML('beforeend', line({ qty: 1, price: 0 }, tb.children.length));
          bind();
          calc();
        };
        w.querySelector('#qvat').oninput = calc;
        bind();
        calc();
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const n = Object.assign({}, q, read());
          Store.save(n);
          UI.closeModal();
          UI.toast(`${CRM.key(n)} saved`, 'good');
          App.render();
        };
        w.querySelector('[data-qprint]').onclick = () => CRM.printQuote(Object.assign({}, q, read()));
      },
    });
  },
  printQuote(q) {
    const c = CRM.cfg();
    const d = Store.get(q.deal) || {};
    const acc = Store.get(d.account) || {};
    const t = CRM.quoteTotals(q);
    const w = window.open('', '_blank');
    if (!w) return UI.toast('Allow pop-ups to print', 'warn');
    w.document
      .write(`<!doctype html><html><head><meta charset="utf-8"><title>${h(CRM.key(q))}</title><style>body{font:14px system-ui,sans-serif;margin:32px;color:#111}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}.n{text-align:right}h1{margin:0}</style></head><body>
      <h1>Quotation ${h(CRM.key(q))}</h1><p>${h(c.seller.name)}${c.seller.vatNo ? ' · VAT no. ' + h(c.seller.vatNo) : ''}<br>${h(c.seller.address)}</p>
      <p><b>For:</b> ${h(acc.name || '')}${d.title ? ' — ' + h(d.title) : ''}<br><b>Date:</b> ${h(U.fmtDate(U.ds(new Date(q.at || Date.now()))))} · <b>Valid until:</b> ${h(U.fmtDate(q.valid))}</p>
      <table><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Total</th></tr></thead><tbody>${(q.lines || []).map(l => `<tr><td>${h(l.item)}</td><td class="n">${l.qty}</td><td class="n">${CRM.money(l.price)}</td><td class="n">${CRM.money(l.qty * l.price)}</td></tr>`).join('')}</tbody></table>
      <p class="n">Subtotal ${CRM.money(t.sub)}<br>VAT ${q.vat}% ${CRM.money(t.vat)}<br><b>Total ${CRM.money(t.total)}</b></p><scr${''}ipt>window.print()</scr${''}ipt></body></html>`);
    w.document.close();
  },
  editParty(r) {
    const isAcc = r.c === 'account';
    const f = isAcc
      ? [
          ['name', 'Company name'],
          ['industry', 'Industry'],
          ['website', 'Website'],
          ['city', 'City'],
          ['phone', 'Phone'],
        ]
      : [
          ['name', 'Name'],
          ['title', 'Job title'],
          ['email', 'Email'],
          ['phone', 'Phone'],
        ];
    UI.modal({
      title: (Store.get(r.id) ? 'Edit ' : 'New ') + (isAcc ? 'company' : 'contact'),
      body: `<div class="grid-form">${f.map(([k, l]) => `<label class="fld"><span>${h(l)}</span><input data-pf="${k}" value="${h(r[k] || '')}"></label>`).join('')}
        ${
          isAcc
            ? ''
            : `<label class="fld"><span>Company</span>${CRM.sel(
                'pfa',
                CRM.all('account').map(a => [a.id, a.name]),
                r.account,
                '—'
              )}</label>`
        }
        <label class="fld span2"><span>Notes</span><textarea data-pf="notes" rows="3">${h(r.notes || '')}</textarea></label></div>`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>',
      onMount: w => {
        w.querySelectorAll('input,textarea').forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const n = Object.assign({}, r);
          w.querySelectorAll('[data-pf]').forEach(i => {
            n[i.dataset.pf] = i.value.trim();
          });
          if (!isAcc) n.account = w.querySelector('#pfa').value;
          if (!n.name) return UI.toast('Write a name', 'bad');
          Store.save(n);
          UI.closeModal();
          App.render();
        };
      },
    });
  },
  openParty(r) {
    const deals = CRM.all('deal').filter(d => d.account === r.id || d.contact === r.id);
    const acts = CRM.acts(r.id);
    UI.modal({
      title: r.name,
      wide: true,
      body: `<p class="muted">${h([r.title, r.industry, r.email, r.phone, r.city, r.c === 'contact' ? CRM.name(r.account) : ''].filter(Boolean).join(' · '))}</p>${r.notes ? `<p>${Maham.rich(r.notes)}</p>` : ''}
        <h4>Deals</h4>${deals.map(d => `<div class="li"><div class="grow"><b>${h(CRM.key(d))}</b> ${h(d.title)} · ${CRM.money(d.value)} · ${h(d.status === 'open' || !d.status ? d.stage : d.status)}</div></div>`).join('') || '<p class="muted small">None.</p>'}
        <h4>Activity</h4><div class="crm-act">${CRM.sel('pak', CRM.KINDS, 'note')} <input id="pat" style="flex:1" placeholder="What happened / what to do"> <input id="pad" type="date"> <button class="btn sm" id="pago">Add</button></div>${acts.map(a => `<div class="li"><div class="grow">${h(a.text)} <span class="muted small">· ${h(Maham.when(a.at))}</span></div></div>`).join('')}`,
      actions: `<button class="btn ghost" data-edit>Edit</button>${r.c === 'account' ? ' <button class="btn ghost" data-ndeal>＋ Deal</button>' : ''}<span class="grow"></span><button class="btn primary" data-c>Close</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('#pat').addEventListener('keydown', e => e.stopPropagation());
        w.querySelector('[data-edit]').onclick = () => {
          UI.closeModal();
          CRM.editParty(r);
        };
        const nd = w.querySelector('[data-ndeal]');
        if (nd)
          nd.onclick = () => {
            UI.closeModal();
            CRM.editDeal(CRM.newDeal({ account: r.id }));
          };
        w.querySelector('#pago').onclick = () => {
          if (!CRM.activity(r.id, w.querySelector('#pak').value, w.querySelector('#pat').value, w.querySelector('#pad').value))
            return UI.toast('Write what happened', 'bad');
          UI.closeModal();
          CRM.openParty(r);
        };
      },
    });
  },
};

Maham.section('Sales', '💼', [['crm', 'Sales', '💼']], 'Service');
Maham.page('crm', 'Sales (CRM)', ['account', 'contact', 'deal', 'crmact', 'quote']);
P.crm = sub => CRM.page(sub);
Attach.extraColls.push('deal');

/* 🔔 a deal given to someone, a follow-up due */
Notify.rules.push((r, prev) =>
  r.c === 'deal' && r.owner && (!prev || prev.owner !== r.owner)
    ? [{ to: r.owner, kind: 'deal', title: `gave you deal ${CRM.key(r)}`, text: r.title || '', link: '#/crm/pipeline' }]
    : []
);
/* 🔎 search finds deals, companies and contacts */
(() => {
  if (typeof Find === 'undefined' || !Find.items) return;
  for (const k of ['Deal', 'Company', 'Contact']) if (!Find.KIND_ORDER.includes(k)) Find.KIND_ORDER.push(k);
  const items0 = Find.items;
  Find.items = function () {
    const out = items0.apply(this, arguments);
    try {
      if (!App.pageAllowed('crm')) return out;
      for (const d of CRM.visible('deal'))
        out.push({
          kind: 'Deal',
          key: CRM.key(d),
          title: String(d.title || ''),
          sub: `${CRM.name(d.account)} · ${CRM.money(d.value)}`,
          open: () => CRM.openDeal(d),
          hay: U.lc([CRM.key(d), d.title, CRM.name(d.account)].join(' ')),
        });
      for (const a of CRM.visible('account'))
        out.push({
          kind: 'Company',
          key: '',
          title: String(a.name || ''),
          sub: a.industry || '',
          open: () => CRM.openParty(a),
          hay: U.lc([a.name, a.industry, a.city].join(' ')),
        });
      for (const c of CRM.visible('contact'))
        out.push({
          kind: 'Contact',
          key: '',
          title: String(c.name || ''),
          sub: [c.email, CRM.name(c.account)].filter(Boolean).join(' · '),
          open: () => CRM.openParty(c),
          hay: U.lc([c.name, c.email, c.phone, CRM.name(c.account)].join(' ')),
        });
    } catch (e) {
      /* never break the search */
    }
    return out;
  };
})();
