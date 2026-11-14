/* MAHAM — 🎫 Service desk: tickets with SLAs, queues, a conversation, satisfaction, a customer portal and email in.
 * Records (each saved in the writer's own data; the newest version of a ticket wins, as with every record):
 *   ticket   { id, no (TK-n), subject, desc, requester (a person in the company) | cust { name, email }, priority,
 *              category, status, queue, assignee, team, created (ms), firstReply (ms), resolvedAt (ms), closedAt,
 *              pausedMs, pausedAt (the SLA clock stops while waiting on the customer), channel (app|portal|email|phone),
 *              token (the customer's private link), csat { score 1–5, comment, at }, tags }
 *   tkreply  { id, on (ticket), by | cust, at, text, internal (a note only staff see), minutes (time spent) }
 *   settings-service { sla: { Urgent: [respond h, resolve h], High: …, Normal: …, Low: … }, queues: [{ id, name,
 *              members [ids], categories [..] }], categories [..], portal: { on, title, intro } }
 * Online, customers write through the database functions portal_submit / portal_reply (supabase/schema.sql), which save
 * into the file users/_portal.json as "_portal"; incoming emails go the same way (supabase/functions/inbound-email). */
'use strict';

const TK = {
  ST: ['New', 'Open', 'Waiting on customer', 'Waiting on third party', 'Resolved', 'Closed'],
  OPEN: new Set(['New', 'Open', 'Waiting on customer', 'Waiting on third party']),
  PRI: ['Urgent', 'High', 'Normal', 'Low'],
  DEF: {
    sla: { Urgent: [1, 8], High: [4, 24], Normal: [8, 72], Low: [24, 168] },
    queues: [],
    categories: ['Question', 'Problem', 'Request', 'Access', 'Hardware', 'Software', 'Other'],
    portal: { on: false, title: 'Help centre', intro: 'Tell us what you need — we will get back to you.' },
  },
  cfg() {
    const s = Store.get('settings-service') || {};
    return {
      sla: Object.assign({}, TK.DEF.sla, s.sla || {}),
      queues: s.queues || [],
      categories: s.categories && s.categories.length ? s.categories : TK.DEF.categories,
      portal: Object.assign({}, TK.DEF.portal, s.portal || {}),
    };
  },
  canAdmin() {
    return App.isSuper();
  }, // settings records are the super admin's (the trust check ignores anyone else's)
  /* the tickets this person may see: their own requests, the ones assigned to them, their queues; everything with "See other people's records" */
  visible() {
    const all = TK.all();
    if (App.isSuper() || App.can('viewOthers')) return all;
    const qs = new Set(
      TK.cfg()
        .queues.filter(q => (q.members || []).includes(App.me))
        .map(q => q.id)
    );
    return all.filter(t => t.requester === App.me || t.assignee === App.me || qs.has(t.queue));
  },
  all() {
    return Store.all('ticket', '*');
  },
  get(id) {
    return Store.get(id);
  },
  key(t) {
    return t && t.no ? 'TK-' + t.no : '';
  },
  nextNo() {
    const used = TK.all().map(t => +t.no || 0);
    TK._taken = TK._taken || [];
    const n = Math.max(0, ...used, ...TK._taken) + 1;
    TK._taken.push(n);
    return n;
  },
  replies(id) {
    return Store.all('tkreply', '*')
      .filter(r => r.on === id)
      .sort((a, b) => (a.at || 0) - (b.at || 0));
  },
  who(t) {
    return t.requester ? Store.memberShort(t.requester) || t.requester : (t.cust && (t.cust.name || t.cust.email)) || 'Customer';
  },
  isOpen(t) {
    return TK.OPEN.has(t.status || 'New');
  },
  mine(t) {
    return t.assignee === App.me;
  },
  /* ---------- SLA: hours from the policy for the priority; the clock stops while waiting on the customer ---------- */
  hrs: h => h * 3600e3,
  paused(t, now) {
    return (t.pausedMs || 0) + (t.status === 'Waiting on customer' && t.pausedAt ? (now || Date.now()) - t.pausedAt : 0);
  },
  sla(t, now) {
    now = now || Date.now();
    const [r, f] = TK.cfg().sla[t.priority || 'Normal'] || TK.DEF.sla.Normal;
    const start = t.created || now;
    const p = TK.paused(t, now);
    const respDue = start + TK.hrs(r);
    const resDue = start + TK.hrs(f) + p;
    const responded = t.firstReply || null;
    const resolved = t.resolvedAt || null;
    const st = (due, doneAt, span) => {
      const at = doneAt || now;
      if (at > due) return 'breached';
      if (!doneAt && due - now < span * 0.25) return 'risk';
      return doneAt ? 'met' : 'ok';
    };
    return { respDue, resDue, resp: st(respDue, responded, TK.hrs(r)), res: st(resDue, resolved, TK.hrs(f)) };
  },
  slaBadge(t) {
    if (!TK.isOpen(t)) {
      const s = TK.sla(t);
      return s.res === 'breached' ? '<span class="badge bad">SLA missed</span>' : '<span class="badge good">SLA met</span>';
    }
    const s = TK.sla(t);
    const left = s.resDue - Date.now();
    const w = Math.abs(left) >= 864e5 ? Math.round(Math.abs(left) / 864e5) + ' d' : Math.max(1, Math.round(Math.abs(left) / 36e5)) + ' h';
    if (s.res === 'breached' || s.resp === 'breached')
      return `<span class="badge bad" title="Resolve by ${h(Maham.when(s.resDue))}">⏱ ${s.resp === 'breached' && !t.firstReply ? 'no reply yet' : w + ' over'}</span>`;
    if (t.status === 'Waiting on customer') return '<span class="badge">⏸ paused</span>';
    return `<span class="badge ${s.res === 'risk' || s.resp === 'risk' ? 'warn' : ''}" title="Resolve by ${h(Maham.when(s.resDue))}">⏱ ${w} left</span>`;
  },
  /* ---------- queues: the one for a category, and who in it has the fewest open tickets ---------- */
  queueFor(cat) {
    const q = TK.cfg().queues;
    return q.find(x => (x.categories || []).includes(cat)) || q[0] || null;
  },
  pick(q) {
    const mem = ((q && q.members) || []).filter(id => (Store.member(id) || {}).active !== false);
    if (!mem.length) return '';
    const load = id => TK.all().filter(t => t.assignee === id && TK.isOpen(t)).length;
    return mem.slice().sort((a, b) => load(a) - load(b) || String(a).localeCompare(String(b)))[0];
  },
  /* ---------- changes ---------- */
  save(t, patch) {
    const now = Date.now();
    const n = Object.assign({}, t, patch);
    if (patch.status && patch.status !== t.status) {
      if (t.status === 'Waiting on customer' && t.pausedAt) {
        n.pausedMs = (t.pausedMs || 0) + (now - t.pausedAt);
        n.pausedAt = null;
      }
      if (patch.status === 'Waiting on customer') n.pausedAt = now;
      if (patch.status === 'Resolved' && !t.resolvedAt) n.resolvedAt = now;
      if (TK.OPEN.has(patch.status)) {
        n.resolvedAt = null;
        n.closedAt = null;
      }
      if (patch.status === 'Closed') n.closedAt = now;
      n.hist = [...(t.hist || []), { at: now, by: App.me, from: t.status, to: patch.status }].slice(-60);
    }
    Store.save(n);
    return n;
  },
  create(d) {
    const q = d.queue ? TK.cfg().queues.find(x => x.id === d.queue) : TK.queueFor(d.category);
    const t = Object.assign(
      {
        c: 'ticket',
        id: Maham.uid('ticket'),
        no: TK.nextNo(),
        status: 'New',
        priority: 'Normal',
        channel: 'app',
        created: Date.now(),
        requester: App.me,
        token: Maham.uid('t').slice(-12) + Math.random().toString(36).slice(2, 10),
      },
      d
    );
    if (!t.queue && q) t.queue = q.id;
    if (!t.assignee && q) t.assignee = TK.pick(q);
    if (!t.team) t.team = (Store.member(App.me) || {}).team || Store.teams()[0].id;
    Store.save(t);
    return t;
  },
  reply(t, text, opt = {}) {
    text = String(text || '').trim();
    if (!text && !opt.minutes) return null;
    const r = { c: 'tkreply', id: Maham.uid('tkreply'), on: t.id, by: App.me, at: Date.now(), text, internal: !!opt.internal };
    if (opt.minutes) r.minutes = Math.max(0, Math.round(+opt.minutes));
    const patch = {};
    if (!opt.internal && t.requester !== App.me && !t.firstReply) patch.firstReply = r.at;
    if (opt.status) patch.status = opt.status;
    else if (!opt.internal && t.status === 'New' && t.requester !== App.me) patch.status = 'Open';
    Store.saveMany([r]);
    if (Object.keys(patch).length) TK.save(t, patch);
    return r;
  },
  rate(t, score, comment) {
    TK.save(t, {
      csat: { score: Math.max(1, Math.min(5, +score)), comment: String(comment || '').slice(0, 500), at: Date.now(), by: App.me },
    });
  },

  /* ---------- the list ---------- */
  page(sub) {
    const tabs = [
      ['list', 'Tickets'],
      ['mine', 'Assigned to me'],
      ['raised', 'My requests'],
      ['report', 'Reports'],
      ...(TK.canAdmin() ? [['settings', 'Settings']] : []),
    ];
    const tab = tabs.some(([k]) => k === sub) ? sub : 'list';
    const nav = `<div class="tabs">${tabs.map(([k, l]) => `<a class="tab ${k === tab ? 'on' : ''}" href="#/tickets/${k}">${l}</a>`).join('')}</div>`;
    if (tab === 'settings') return { title: 'Service desk', html: nav + TK.settingsHtml(), mount: TK.settingsMount };
    if (tab === 'report') return { title: 'Service desk', html: nav + TK.reportHtml(), mount() {} };
    const f = ps('tickets');
    let rows = TK.visible();
    if (tab === 'mine') rows = rows.filter(TK.mine);
    if (tab === 'raised') rows = rows.filter(t => t.requester === App.me);
    const open = rows.filter(TK.isOpen);
    if (f.st === 'open' || f.st == null) rows = rows.filter(TK.isOpen);
    else if (f.st) rows = rows.filter(t => (t.status || 'New') === f.st);
    if (f.pri) rows = rows.filter(t => (t.priority || 'Normal') === f.pri);
    if (f.queue) rows = rows.filter(t => t.queue === f.queue);
    if (f.who) rows = rows.filter(t => t.assignee === f.who);
    if (f.sla)
      rows = rows.filter(t => {
        const s = TK.sla(t);
        return f.sla === 'breached' ? s.res === 'breached' || s.resp === 'breached' : s.res === 'risk' || s.resp === 'risk';
      });
    const br = open.filter(t => {
      const s = TK.sla(t);
      return s.res === 'breached' || s.resp === 'breached';
    }).length;
    const risk = open.filter(t => {
      const s = TK.sla(t);
      return s.res === 'risk' || s.resp === 'risk';
    }).length;
    const unas = open.filter(t => !t.assignee).length;
    const totals = `<div class="totals-line"><b>${open.length}</b> open · <a href="#" data-sumf="tickets|sla|breached"><b class="${br ? 't-bad' : ''}">${br}</b> SLA missed</a> · <a href="#" data-sumf="tickets|sla|risk"><b>${risk}</b> at risk</a> · <b>${unas}</b> not assigned</div>`;
    const flt = filterBar('tickets', [
      { key: 'st', label: 'Status', options: [['open', 'Open (all)'], ...TK.ST.map(s => [s, s])], dflt: 'open' },
      { key: 'pri', label: 'Priority', options: TK.PRI },
      { key: 'queue', label: 'Queue', options: TK.cfg().queues.map(q => [q.id, q.name]) },
      { key: 'who', type: 'member', label: 'Assigned to' },
      {
        key: 'sla',
        label: 'SLA',
        options: [
          ['breached', 'Missed'],
          ['risk', 'At risk'],
        ],
      },
    ]);
    const html = `${nav}<div class="page-actions">${flt}<span class="grow"></span><button class="btn primary" id="tknew">＋ New ticket</button></div>${totals}
      ${UI.table({
        id: 'tickets',
        rows,
        exportName: 'Tickets',
        onRow: true,
        defaultSort: 'created',
        cols: [
          { key: 'no', label: 'ID', get: r => TK.key(r), sortVal: r => +r.no || 0 },
          {
            key: 'subject',
            label: 'Subject',
            html: r =>
              `<b>${h(r.subject || '')}</b>${r.channel && r.channel !== 'app' ? ` <span class="muted small">· ${h(r.channel)}</span>` : ''}${Attach.count(r.id) ? ` <span class="at-count">📎 ${Attach.count(r.id)}</span>` : ''}`,
            get: r => r.subject,
          },
          { key: 'who', label: 'From', get: r => TK.who(r) },
          {
            key: 'priority',
            label: 'Priority',
            html: r =>
              `<span class="badge ${r.priority === 'Urgent' ? 'bad' : r.priority === 'High' ? 'warn' : ''}">${h(r.priority || 'Normal')}</span>`,
            get: r => r.priority || 'Normal',
            sortVal: r => TK.PRI.indexOf(r.priority || 'Normal'),
          },
          { key: 'status', label: 'Status', html: r => UI.sbadge(r.status || 'New'), get: r => r.status || 'New' },
          { key: 'assignee', label: 'Assigned to', get: r => (r.assignee ? Store.memberShort(r.assignee) : '—') },
          { key: 'queue', label: 'Queue', get: r => (TK.cfg().queues.find(q => q.id === r.queue) || {}).name || '' },
          {
            key: 'sla',
            label: 'SLA',
            html: r => TK.slaBadge(r),
            get: r => {
              const s = TK.sla(r);
              return s.res;
            },
            sortVal: r => TK.sla(r).resDue,
          },
          { key: 'created', label: 'Opened', get: r => Maham.when(r.created), sortVal: r => r.created || 0 },
        ],
      })}`;
    return {
      title: 'Service desk',
      html,
      mount(root) {
        UI.bindTables(root, { tickets: r => TK.open(r) });
        root.querySelector('#tknew').onclick = () => TK.newDialog();
      },
    };
  },
  newDialog(pre) {
    const c = TK.cfg();
    UI.modal({
      title: 'New ticket',
      wide: true,
      body: `<div class="grid-form">
        <label class="fld span2"><span>Subject</span><input id="tks" maxlength="200" value="${h((pre && pre.subject) || '')}"></label>
        <label class="fld span2"><span>What is needed</span><textarea id="tkd" rows="5">${h((pre && pre.desc) || '')}</textarea></label>
        <label class="fld"><span>Category</span><select id="tkc">${c.categories.map(x => `<option>${h(x)}</option>`).join('')}</select></label>
        <label class="fld"><span>Priority</span><select id="tkp">${TK.PRI.map(x => `<option ${x === 'Normal' ? 'selected' : ''}>${h(x)}</option>`).join('')}</select></label>
        <label class="fld"><span>For (who needs it)</span><select id="tkr">${UI.memberOptions(App.me, {})}</select></label>
        <label class="fld"><span>Customer (not in the company) — name / email</span><input id="tkcust" placeholder="optional, e.g. Ali — ali@example.com"></label></div>
        <p class="muted small">The queue for the category gets it, and the person in it with the fewest open tickets is assigned. No patient names or MRNs.</p>`,
      actions:
        '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Create ticket</button>',
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const subject = w.querySelector('#tks').value.trim();
          if (!subject) return UI.toast('Write a subject', 'bad');
          const custTxt = w.querySelector('#tkcust').value.trim();
          const em = (custTxt.match(/[^\s<>]+@[^\s<>]+/) || [''])[0];
          const d = {
            subject,
            desc: w.querySelector('#tkd').value.trim(),
            category: w.querySelector('#tkc').value,
            priority: w.querySelector('#tkp').value,
            requester: custTxt ? '' : w.querySelector('#tkr').value || App.me,
            channel: custTxt ? 'phone' : 'app',
          };
          if (custTxt)
            d.cust = {
              name: custTxt
                .replace(em, '')
                .replace(/[—-]\s*$/, '')
                .trim(),
              email: em,
            };
          if (pre && pre.from) d.from = pre.from;
          const t = TK.create(d);
          UI.closeModal();
          UI.toast(`${TK.key(t)} created${t.assignee ? ' — assigned to ' + Store.memberShort(t.assignee) : ''}`, 'good');
          TK.open(t);
        };
      },
    });
  },
  /* ---------- one ticket ---------- */
  open(t) {
    t = Store.get(t.id) || t;
    const rs = TK.replies(t.id);
    const s = TK.sla(t);
    const canWork = !App.preview && (TK.canAdmin() || t.assignee === App.me || App.can('viewOthers') || t.requester === App.me);
    const staff = t.requester !== App.me || TK.canAdmin() || t.assignee === App.me;
    const li = r =>
      `<div class="tk-r${r.internal ? ' internal' : ''}${r.cust ? ' cust' : ''}"><div class="tk-rm"><b>${h(r.cust ? r.cust.name || r.cust.email || 'Customer' : Store.memberShort(r.by) || r.by)}</b> <span class="muted small">${h(Maham.when(r.at))}${r.internal ? ' · internal note' : ''}${r.minutes ? ` · ⏱ ${r.minutes} min` : ''}</span></div><div>${Maham.rich(r.text)}</div></div>`;
    const visible = rs.filter(r => !r.internal || staff);
    const body = `<div class="tk-top"><div><b>${h(TK.key(t))}</b> · from <b>${h(TK.who(t))}</b>${t.cust && t.cust.email ? ` <span class="muted small">${h(t.cust.email)}</span>` : ''} · ${h(t.category || '')} · opened ${h(Maham.when(t.created))}</div>
        <div class="tk-sla">${TK.slaBadge(t)} <span class="muted small">first reply by ${h(Maham.when(s.respDue))} (${s.resp}) · resolve by ${h(Maham.when(s.resDue))} (${s.res})</span></div></div>
      ${
        canWork && staff
          ? `<div class="tk-ctl"><label>Status <select id="tkst">${TK.ST.map(x => `<option ${x === (t.status || 'New') ? 'selected' : ''}>${h(x)}</option>`).join('')}</select></label>
        <label>Priority <select id="tkpr">${TK.PRI.map(x => `<option ${x === (t.priority || 'Normal') ? 'selected' : ''}>${h(x)}</option>`).join('')}</select></label>
        <label>Assigned to <select id="tkas"><option value="">— nobody —</option>${Maham.people()
          .map(p => `<option value="${h(p.id)}" ${p.id === t.assignee ? 'selected' : ''}>${h(p.name)}</option>`)
          .join('')}</select></label>
        <label>Queue <select id="tkq"><option value="">—</option>${TK.cfg()
          .queues.map(q => `<option value="${h(q.id)}" ${q.id === t.queue ? 'selected' : ''}>${h(q.name)}</option>`)
          .join('')}</select></label>
        ${t.assignee !== App.me ? '<button class="btn sm" id="tktake">Take it</button>' : ''}</div>`
          : ''
      }
      <div class="tk-desc">${Maham.rich(t.desc || '')}</div>
      <div class="tk-conv">${visible.length ? visible.map(li).join('') : '<div class="muted small">No replies yet.</div>'}</div>
      ${
        canWork
          ? `<div class="tk-reply"><textarea id="tkrt" rows="3" placeholder="${staff ? 'Reply to ' + h(TK.who(t)) + '…' : 'Add a reply…'}"></textarea>
        <div class="row-btns">${staff ? '<label class="small"><input type="checkbox" id="tkint"> Internal note (staff only)</label> <label class="small">⏱ <input id="tkmin" type="number" min="0" step="5" style="width:70px"> min</label>' : ''}<span class="grow"></span>
        ${staff ? '<button class="btn" data-tksend="Waiting on customer">Reply &amp; wait for them</button> <button class="btn" data-tksend="Resolved">Reply &amp; resolve</button>' : ''} <button class="btn primary" data-tksend="">Send</button></div></div>`
          : ''
      }
      ${!TK.isOpen(t) && t.requester === App.me && !t.csat ? `<div class="tk-csat"><b>How did we do?</b> ${[1, 2, 3, 4, 5].map(n => `<button class="btn sm" data-csat="${n}">${'★'.repeat(n)}</button>`).join(' ')} <input id="tkcc" placeholder="A comment (optional)"></div>` : ''}
      ${t.csat ? `<div class="tk-csat done">Rated <b>${'★'.repeat(t.csat.score)}</b>${t.csat.comment ? ' — ' + h(t.csat.comment) : ''}</div>` : ''}
      ${Attach.box(t)}
      ${t.token && t.channel !== 'app' && Store.storageMode === 'cloud' ? `<p class="muted small">The customer follows this ticket with their private link (sent with the first email).</p>` : ''}`;
    UI.modal({
      title: `${TK.key(t)} · ${t.subject || ''}`,
      wide: true,
      body,
      actions: `${Store.pageOn(App.me, 'chat', App.viewTeam) && typeof Chat !== 'undefined' ? '<button class="btn ghost" data-tkdisc>💬 Discuss</button>' : ''}<span class="grow"></span><button class="btn" data-c>Close</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        const again = () => {
          UI.closeModal();
          TK.open(Store.get(t.id) || t);
        };
        const set = (k, v) => {
          TK.save(Store.get(t.id) || t, { [k]: v });
          again();
        };
        const st = w.querySelector('#tkst');
        if (st) st.onchange = () => set('status', st.value);
        const pr = w.querySelector('#tkpr');
        if (pr) pr.onchange = () => set('priority', pr.value);
        const as = w.querySelector('#tkas');
        if (as) as.onchange = () => set('assignee', as.value);
        const q = w.querySelector('#tkq');
        if (q) q.onchange = () => set('queue', q.value);
        const tk = w.querySelector('#tktake');
        if (tk) tk.onclick = () => set('assignee', App.me);
        const ta = w.querySelector('#tkrt');
        if (ta) ta.addEventListener('keydown', e => e.stopPropagation());
        w.querySelectorAll('[data-tksend]').forEach(
          b =>
            (b.onclick = () => {
              const internal = !!(w.querySelector('#tkint') || {}).checked;
              const minutes = +((w.querySelector('#tkmin') || {}).value || 0);
              if (!ta.value.trim() && !minutes) {
                ta.focus();
                return UI.toast('Write a reply', 'bad');
              }
              TK.reply(Store.get(t.id) || t, ta.value, { internal, minutes, status: b.dataset.tksend || '' });
              again();
            })
        );
        w.querySelectorAll('[data-csat]').forEach(
          b =>
            (b.onclick = () => {
              TK.rate(Store.get(t.id) || t, b.dataset.csat, (w.querySelector('#tkcc') || {}).value);
              UI.toast('Thank you!', 'good');
              again();
            })
        );
        const d = w.querySelector('[data-tkdisc]');
        if (d) d.onclick = () => Chat.discuss(Store.get(t.id) || t);
        Attach.bind(w, t);
      },
    });
  },
  /* ---------- reports ---------- */
  reportHtml() {
    const all = TK.all();
    const since = Date.now() - 30 * 864e5;
    const recent = all.filter(t => (t.created || 0) > since);
    const resolved = recent.filter(t => t.resolvedAt);
    const met = resolved.filter(t => TK.sla(t).res === 'met').length;
    const fr = recent
      .filter(t => t.firstReply)
      .map(t => (t.firstReply - t.created) / 36e5)
      .sort((a, b) => a - b);
    const med = a => (a.length ? a[Math.floor(a.length / 2)] : 0);
    const res = resolved.map(t => (t.resolvedAt - t.created - (t.pausedMs || 0)) / 36e5).sort((a, b) => a - b);
    const cs = recent.filter(t => t.csat).map(t => t.csat.score);
    const by = (list, f) => {
      const m = new Map();
      for (const t of list) {
        const k = f(t) || '—';
        m.set(k, (m.get(k) || 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const tbl = (title, rows) =>
      card(
        title,
        rows.length
          ? `<table class="tbl"><tbody>${rows.map(([k, n]) => `<tr><td>${h(k)}</td><td class="num">${n}</td></tr>`).join('')}</tbody></table>`
          : '<p class="muted small">Nothing yet.</p>'
      );
    return `<div class="totals-line">Last 30 days: <b>${recent.length}</b> opened · <b>${resolved.length}</b> resolved · SLA met <b>${resolved.length ? Math.round((met / resolved.length) * 100) : 0}%</b> · first reply (median) <b>${U.num(med(fr), 1)} h</b> · time to resolve (median) <b>${U.num(med(res), 1)} h</b> · satisfaction <b>${cs.length ? U.num(cs.reduce((a, b) => a + b, 0) / cs.length, 1) + ' / 5' : '—'}</b> (${cs.length} ratings) · open now <b>${all.filter(TK.isOpen).length}</b></div>
      <div class="cols3">${tbl(
        'Open by assignee',
        by(all.filter(TK.isOpen), t => (t.assignee ? Store.memberShort(t.assignee) : 'Not assigned'))
      )}${tbl(
        'Opened by category (30 days)',
        by(recent, t => t.category)
      )}${tbl(
        'Opened by channel (30 days)',
        by(recent, t => t.channel || 'app')
      )}</div>`;
  },
  /* ---------- settings (admins): SLA per priority, categories, queues, portal ---------- */
  settingsHtml() {
    const c = TK.cfg();
    return `${card('SLA — hours per priority', `<table class="tbl"><thead><tr><th>Priority</th><th>First reply within (h)</th><th>Resolve within (h)</th></tr></thead><tbody>${TK.PRI.map(p => `<tr><td>${h(p)}</td><td><input type="number" min="0.25" step="0.25" data-sla="${p}|0" value="${c.sla[p][0]}"></td><td><input type="number" min="0.5" step="0.5" data-sla="${p}|1" value="${c.sla[p][1]}"></td></tr>`).join('')}</tbody></table><p class="muted small">The resolve clock stops while a ticket waits on the customer.</p>`)}
      ${card('Categories', `<textarea id="svcat" rows="3" style="width:100%">${h(c.categories.join(', '))}</textarea><p class="muted small">Separated by commas.</p>`)}
      ${card('Queues — who handles which categories', `<div id="svq">${c.queues.map((q, i) => TK.queueRow(q, i)).join('')}</div><button class="btn sm" id="svqadd">＋ Queue</button><p class="muted small">A new ticket goes to the first queue that lists its category (or the first queue), and to its member with the fewest open tickets.</p>`)}
      ${card('Customer portal', `<label class="check"><input type="checkbox" id="svpon" ${c.portal.on ? 'checked' : ''}> Customers can raise tickets on the portal (online companies: <code>portal.html</code>)</label><div class="grid-form"><label class="fld"><span>Title</span><input id="svpt" value="${h(c.portal.title)}"></label><label class="fld span2"><span>Intro</span><input id="svpi" value="${h(c.portal.intro)}"></label></div><p class="muted small">Knowledge base articles marked “Public” show there as the help centre.</p>`)}
      <div class="row-btns"><span class="grow"></span><button class="btn primary" id="svsave">Save settings</button></div>`;
  },
  queueRow(q, i) {
    return `<div class="sv-q" data-qi="${i}"><input class="sv-qn" placeholder="Queue name" value="${h(q.name || '')}"> <select class="sv-qm" multiple size="3" title="Members">${Maham.people()
      .map(p => `<option value="${h(p.id)}" ${(q.members || []).includes(p.id) ? 'selected' : ''}>${h(p.name)}</option>`)
      .join(
        ''
      )}</select> <input class="sv-qc" placeholder="Categories, separated by commas" value="${h((q.categories || []).join(', '))}"> <a href="#" class="link small" data-qdel>Remove</a><input type="hidden" class="sv-qid" value="${h(q.id || '')}"></div>`;
  },
  settingsMount(root) {
    const box = root.querySelector('#svq');
    if (!box) return;
    root.querySelector('#svqadd').onclick = () => {
      box.insertAdjacentHTML('beforeend', TK.queueRow({}, box.children.length));
      bindDel();
    };
    const bindDel = () =>
      box.querySelectorAll('[data-qdel]').forEach(
        a =>
          (a.onclick = e => {
            e.preventDefault();
            a.closest('.sv-q').remove();
          })
      );
    bindDel();
    root.querySelector('#svsave').onclick = () => {
      const sla = {};
      for (const p of TK.PRI)
        sla[p] = [
          +root.querySelector(`[data-sla="${p}|0"]`).value || TK.DEF.sla[p][0],
          +root.querySelector(`[data-sla="${p}|1"]`).value || TK.DEF.sla[p][1],
        ];
      const list = s =>
        s
          .split(',')
          .map(x => x.trim())
          .filter(Boolean);
      const queues = [...box.querySelectorAll('.sv-q')]
        .map(r => ({
          id: r.querySelector('.sv-qid').value || Maham.uid('q'),
          name: r.querySelector('.sv-qn').value.trim(),
          members: [...r.querySelector('.sv-qm').selectedOptions].map(o => o.value),
          categories: list(r.querySelector('.sv-qc').value),
        }))
        .filter(q => q.name);
      const rec = Object.assign({ id: 'settings-service', c: 'settings' }, Store.get('settings-service') || {}, {
        sla,
        categories: list(root.querySelector('#svcat').value),
        queues,
        portal: {
          on: root.querySelector('#svpon').checked,
          title: root.querySelector('#svpt').value.trim() || 'Help centre',
          intro: root.querySelector('#svpi').value.trim(),
        },
      });
      Store.save(rec);
      UI.toast('Service desk settings saved', 'good');
      App.render();
    };
  },
};

/* ---------- ⏱ Timesheet: shadow work and time on tickets, per person and day, for a week ---------- */
const Timesheet = {
  page() {
    const f = ps('timesheet');
    const wk = f.wk || U.todayStr();
    const d0 = new Date(wk);
    const mon = U.addDays(wk, -((d0.getDay() + 6) % 7));
    const days = [...Array(7)].map((_, i) => U.addDays(mon, i));
    const people = App.can('viewOthers') ? Store.activeTeam().map(m => m.id) : [App.me];
    const sh = Store.all('shadow').filter(s => s.date >= days[0] && s.date <= days[6]);
    const tr = Store.all('tkreply', '*').filter(r => r.minutes && U.ds(new Date(r.at)) >= days[0] && U.ds(new Date(r.at)) <= days[6]);
    const cell = (who, d) => {
      const m =
        sh.filter(s => s.analyst === who && s.date === d).reduce((n, s) => n + (+s.minutes || +s.duration * 60 || 0), 0) +
        tr.filter(r => r.by === who && U.ds(new Date(r.at)) === d).reduce((n, r) => n + r.minutes, 0);
      return m;
    };
    const fmt = m =>
      m ? (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : m + ' min') : '<span class="muted">—</span>';
    const rows = people
      .map(p => {
        const v = days.map(d => cell(p, d));
        return `<tr><td><b>${h(Store.memberShort(p))}</b></td>${v.map(x => `<td class="num">${fmt(x)}</td>`).join('')}<td class="num"><b>${fmt(v.reduce((a, b) => a + b, 0))}</b></td></tr>`;
      })
      .join('');
    const html = `<div class="page-actions"><a href="#" class="btn sm" data-tsw="-7">‹ Week before</a> <b>Week of ${h(U.fmtDate(mon))}</b> <a href="#" class="btn sm" data-tsw="7">Week after ›</a><span class="grow"></span></div>
      ${card('Time per person and day — shadow work + time logged on tickets', `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Person</th>${days.map(d => `<th class="num">${h(U.fmtDate(d))}</th>`).join('')}<th class="num">Week</th></tr></thead><tbody>${rows}</tbody></table></div>`)}`;
    return {
      title: 'Timesheet',
      html,
      mount(root) {
        root.querySelectorAll('[data-tsw]').forEach(
          a =>
            (a.onclick = e => {
              e.preventDefault();
              ps('timesheet').wk = U.addDays(mon, +a.dataset.tsw);
              App.render();
            })
        );
      },
    };
  },
};

/* the menu: a "Service" section, Tickets and Timesheet as functions */
Maham.section(
  'Service',
  '🎫',
  [
    ['tickets', 'Tickets', '🎫'],
    ['timesheet', 'Timesheet', '⏱'],
  ],
  'Connect'
);
Maham.page('tickets', 'Tickets (service desk)', ['ticket', 'tkreply']);
Maham.page('timesheet', 'Timesheet');
P.tickets = sub => TK.page(sub);
P.timesheet = () => Timesheet.page();

/* 🔔 who is told */
Notify.rules.push((r, prev) => {
  if (r.c !== 'ticket') return [];
  const out = [];
  if (r.assignee && (!prev || prev.assignee !== r.assignee))
    out.push({ to: r.assignee, kind: 'ticket', title: `assigned you ${TK.key(r)}`, text: r.subject || '', link: '#/tickets/mine' });
  if (prev && r.requester && prev.status !== r.status && (r.status === 'Resolved' || r.status === 'Waiting on customer'))
    out.push({
      to: r.requester,
      kind: 'ticket',
      title: `${TK.key(r)} is ${r.status.toLowerCase()}`,
      text: r.subject || '',
      link: '#/tickets/raised',
    });
  return out;
});
Notify.rules.push((r, prev) => {
  if (r.c !== 'tkreply' || prev || r.internal) return [];
  const t = Store.get(r.on);
  if (!t) return [];
  const to = r.by === t.requester ? t.assignee : t.requester;
  return to
    ? [
        {
          to,
          kind: 'ticket',
          title: `replied on ${TK.key(t)}`,
          text: r.text.slice(0, 160),
          link: to === t.requester ? '#/tickets/raised' : '#/tickets/mine',
        },
      ]
    : [];
});
/* 📎 on tickets; ⇄ make a ticket from a help-desk row or a To Do */
Attach.extraColls.push('ticket');
/* the search box (🔎) finds tickets by TK-12 or words */
(() => {
  if (typeof Find === 'undefined' || !Find.items) return;
  if (!Find.KIND_ORDER.includes('Ticket')) Find.KIND_ORDER.push('Ticket');
  const items0 = Find.items;
  Find.items = function () {
    const out = items0.apply(this, arguments);
    try {
      if (App.pageAllowed('tickets'))
        for (const t of TK.visible())
          out.push({
            kind: 'Ticket',
            key: TK.key(t),
            title: String(t.subject || ''),
            sub: `${TK.who(t)} · ${t.status || 'New'}${t.assignee ? ' · ' + Store.memberShort(t.assignee) : ''}`,
            open: () => TK.open(t),
            hay: U.lc([TK.key(t), t.subject, t.desc, TK.who(t), t.category].join(' ')),
          });
    } catch (e) {
      /* never break the search */
    }
    return out;
  };
})();
