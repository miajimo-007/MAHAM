/* DARRIK — Feedback: everyone reports issues and ideas (menu → Feedback); the super admin tracks them
 * (Admin → Feedback). feedback { type, title, details, page, urgency, ver, from, status, priority, reply, fixedIn,
 * dupOf, repliedAt } — written by the sender; only the administrator changes status / priority / reply / fixed in.
 * fbvote { fb, by } — "Me too", one record per person, in their own file. */
'use strict';

const FB = {
  TYPES: [
    ['issue', '🐞 Issue — something is broken'],
    ['idea', '💡 Enhancement — an idea'],
    ['question', '❓ Question'],
  ],
  TYPE: { issue: 'Issue', idea: 'Enhancement', question: 'Question' },
  URG: [
    ['low', 'Low'],
    ['normal', 'Normal'],
    ['blocking', 'Blocking my work'],
  ],
  ST: ['New', 'Under review', 'Planned', 'In progress', 'Done', 'Rejected', 'Duplicate'],
  PRI: ['', 'Low', 'Medium', 'High', 'Critical'],
  ADMIN_FIELDS: ['status', 'priority', 'reply', 'fixedIn', 'dupOf', 'repliedAt', 'repliedBy'],
  all() {
    return Store.all('feedback', '*')
      .map(r => (r.status === "Won't do" ? Object.assign({}, r, { status: 'Rejected' }) : r))
      .sort((a, b) => (b._created || b._ts || 0) - (a._created || a._ts || 0));
  },
  votes(id) {
    return Store.all('fbvote', '*').filter(v => v.fb === id);
  },
  voted(id) {
    return FB.votes(id).some(v => v.by === App.me);
  },
  num(r) {
    return '#' + (r.n || String(r.id).slice(-4));
  },
  open(r) {
    return !['Done', 'Rejected', 'Duplicate'].includes(r.status || 'New');
  },
  badge(st) {
    const s = st || 'New';
    return UI.badge(s, s === 'Done' ? 'good' : s === 'New' ? 'warn' : ['Rejected', 'Duplicate'].includes(s) ? '' : 'cat');
  },
  /* the sender: changes since they last looked */
  unseen() {
    return FB.all().filter(r => r.from === App.me && (r.repliedAt || 0) > LS.get('bct.fbseen.' + r.id, 0));
  },
  newCount() {
    return FB.all().filter(r => (r.status || 'New') === 'New').length;
  },
  /* save rule: only the sender writes their item (while New); only the administrator changes the admin fields */
  allowed(r) {
    if (!r || (r.c !== 'feedback' && r.c !== 'fbvote')) return true;
    if (r.c === 'fbvote') {
      const p = r.id && Store.db.get(r.id);
      return (p ? p.by : r.by) === App.me;
    }
    if (Store.isSuper(App.me)) return true;
    const p = r.id ? Store.db.get(r.id) : null;
    if (!p) return r.from === App.me && !FB.ADMIN_FIELDS.some(k => r[k] && k !== 'status') && (!r.status || r.status === 'New');
    if (p.from !== App.me || (p.status || 'New') !== 'New') return false;
    return FB.ADMIN_FIELDS.every(k => JSON.stringify(r[k] || '') === JSON.stringify(p[k] || ''));
  },
  form(r) {
    const isNew = !r || !r.id;
    r = r || { type: 'issue', urgency: 'normal', page: App.lastPage || '' };
    UI.modal({
      title: isNew ? 'Send feedback' : 'Edit ' + FB.num(r),
      wide: true,
      body: `<form class="grid-form" id="fbf">
      ${UI.field({ key: 'type', label: 'What is it?', type: 'select', options: FB.TYPES, blank: false }, r.type)}
      ${UI.field({ key: 'urgency', label: 'How urgent?', type: 'select', options: FB.URG, blank: false }, r.urgency)}
      ${UI.field({ key: 'title', label: 'Title', type: 'text', required: true, span: 2, placeholder: 'One line — e.g. "Attendance page does not save permission hours"' }, r.title || '')}
      ${UI.field({ key: 'details', label: 'Details', type: 'textarea', span: 2, rows: 5, placeholder: 'For an issue: what did you do? what happened? what did you expect?\nFor an idea: what would help and why?' }, r.details || '')}
      ${UI.field({ key: 'page', label: 'Which page?', type: 'select', options: [['', '— not about one page —'], ...Store.PAGES.map(([k, l]) => [k, l]), ['home', 'My Day / desk'], ['projects', 'Projects'], ['meetings', 'Meetings'], ['admin', 'Admin'], ['other', 'Other']], blank: false }, r.page || '')}
      </form><p class="note">Please don't write patient names, MRNs or anything that identifies a patient.</p>`,
      actions: `${!isNew ? '<button class="btn danger ghost" data-del>Withdraw</button>' : ''}<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>${isNew ? 'Send' : 'Save'}</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        const d = w.querySelector('[data-del]');
        if (d)
          d.onclick = () =>
            UI.confirm('Withdraw this feedback?', () => {
              Store.save(Object.assign({}, Store.get(r.id), { _del: true }));
              UI.closeModal();
              UI.toast('Withdrawn', 'good');
              App.render();
            });
        w.querySelector('[data-ok]').onclick = () => {
          const f = w.querySelector('#fbf');
          const v = UI.readForm(f, [{ key: 'type' }, { key: 'urgency' }, { key: 'title' }, { key: 'details' }, { key: 'page' }]);
          if (!v.title) return UI.toast('Write a title', 'bad');
          const out = isNew
            ? Object.assign(
                {
                  c: 'feedback',
                  from: App.me,
                  team: (Store.member(App.me) || {}).team || 'apps',
                  status: 'New',
                  ver: APP_VERSION,
                  _created: Date.now(),
                  n: FB.all().length + 1,
                },
                v
              )
            : Object.assign({}, Store.get(r.id), v);
          Store.save(out);
          UI.closeModal();
          UI.toast(isNew ? 'Thank you — sent to the administrator' : 'Saved', 'good');
          App.render();
        };
      },
    });
  },
  vote(id) {
    const v = FB.votes(id).find(x => x.by === App.me);
    if (v) Store.save(Object.assign({}, v, { _del: true }));
    else Store.save({ id: 'fbvote-' + id + '-' + App.me, c: 'fbvote', fb: id, by: App.me });
    App.render();
  },
  row(r, admin) {
    const nv = FB.votes(r.id).length;
    const mine = r.from === App.me;
    return `<div class="li fb-row ${admin ? 'click' : ''}" ${admin ? `data-fbadm="${h(r.id)}"` : ''}><span class="fb-n mono muted">${h(FB.num(r))}</span><div class="grow"><b>${h(r.title)}</b> ${FB.badge(r.status)} <span class="badge">${h(FB.TYPE[r.type] || r.type)}</span>${r.urgency === 'blocking' ? ' <span class="badge bad">blocking</span>' : ''}${r.priority ? ` <span class="badge warn">${h(r.priority)}</span>` : ''}
      <div class="muted small">${h(Store.memberShort(r.from))} · ${U.fmtTs(r._created || r._ts)}${r.page ? ' · ' + h((Store.PAGES.find(p => p[0] === r.page) || [r.page, r.page])[1]) : ''}${r.fixedIn ? ' · fixed in ' + h(r.fixedIn) : ''}</div>
      ${r.details && (admin || mine) ? `<div class="small fb-d">${h(r.details)}</div>` : ''}${r.reply ? `<div class="fb-reply">↳ <b>${h(Store.memberShort(r.repliedBy) || 'Admin')}:</b> ${h(r.reply)}</div>` : ''}</div>
      <div class="nw">${mine && (r.status || 'New') === 'New' && !admin ? `<button class="btn xs ghost" data-fbedit="${h(r.id)}">Edit</button> ` : ''}${!mine ? `<button class="btn xs ${FB.voted(r.id) ? 'primary' : 'ghost'}" data-fbvote="${h(r.id)}" title="Me too">👍 ${nv || ''}</button>` : nv ? `<span class="muted small">👍 ${nv}</span>` : ''}</div></div>`;
  },
  bind(root) {
    root.querySelectorAll('[data-fbvote]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          FB.vote(b.dataset.fbvote);
        })
    );
    root.querySelectorAll('[data-fbedit]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          FB.form(Store.get(b.dataset.fbedit));
        })
    );
  },
  /* notice for the sender (My Day / desk) */
  banner() {
    const l = FB.unseen();
    if (!l.length) return '';
    return `<div class="insights"><div>💡 <b>The administrator answered your feedback:</b> ${l
      .slice(0, 3)
      .map(r => `“${h(r.title)}” → ${h(r.status || 'New')}`)
      .join(' · ')}</div><div class="row-btns tight"><a class="btn sm primary" href="#/feedback">Open</a></div></div>`;
  },
};

P.feedback = () => {
  const tab = ps('fb').tab === 'all' ? 'all' : 'mine';
  const all = FB.all();
  const mine = all.filter(r => r.from === App.me);
  const list =
    tab === 'mine'
      ? mine
      : all
          .filter(r => FB.open(r) || r.from === App.me)
          .sort((a, b) => FB.votes(b.id).length - FB.votes(a.id).length || (b._created || 0) - (a._created || 0));
  const html = `<div class="page-actions"><span class="muted small">Found something broken, or have an idea to make the app better? Send it here — the administrator tracks every item and answers.</span><span class="grow"></span><button class="btn primary" id="fbnew">＋ Send feedback</button></div>
    <div class="tabs"><a class="tab ${tab === 'mine' ? 'on' : ''}" href="javascript:void 0" data-fbtab="mine">My feedback <span class="count">${mine.length}</span></a><a class="tab ${tab === 'all' ? 'on' : ''}" href="javascript:void 0" data-fbtab="all">Everyone's (open)</a></div>
    ${card(tab === 'mine' ? 'What I sent' : 'Open issues and ideas — press 👍 if it affects you too', list.length ? list.map(r => FB.row(r, false)).join('') : empty(tab === 'mine' ? 'Nothing yet.' : 'Nothing open.'))}`;
  return {
    title: 'Feedback',
    html,
    mount(root) {
      for (const r of mine) if (r.repliedAt) LS.set('bct.fbseen.' + r.id, r.repliedAt);
      root.querySelector('#fbnew').onclick = () => FB.form(null);
      root.querySelectorAll('[data-fbtab]').forEach(
        a =>
          (a.onclick = () => {
            ps('fb').tab = a.dataset.fbtab;
            App.render();
          })
      );
      FB.bind(root);
    },
  };
};

/* ---------- Admin → Feedback ---------- */
function adminFeedback() {
  const f = ps('fbadm');
  const all = FB.all();
  let rows = all.filter(
    r =>
      (!f.type || r.type === f.type) &&
      (!f.st || (f.st === '_open' ? FB.open(r) : (r.status || 'New') === f.st)) &&
      (!f.team || r.team === f.team)
  );
  const sort = f.sort || 'new';
  rows = rows
    .slice()
    .sort((a, b) =>
      sort === 'votes'
        ? FB.votes(b.id).length - FB.votes(a.id).length
        : sort === 'urgent'
          ? (b.urgency === 'blocking') - (a.urgency === 'blocking') || FB.PRI.indexOf(b.priority || '') - FB.PRI.indexOf(a.priority || '')
          : (b._created || b._ts || 0) - (a._created || a._ts || 0)
    );
  const cnt = s => all.filter(r => (r.status || 'New') === s).length;
  const sel = (k, opts, lbl) =>
    `<label class="flt"><span>${lbl}</span><select data-fbf="${k}">${opts.map(([v, l]) => `<option value="${h(v)}" ${(f[k] || '') === v ? 'selected' : ''}>${h(l)}</option>`).join('')}</select></label>`;
  const html = `<div class="kpis k4">${UI.kpi('New', cnt('New'), 'not looked at yet')}${UI.kpi('Blocking', all.filter(r => r.urgency === 'blocking' && FB.open(r)).length, 'open items blocking someone')}${UI.kpi('Open', all.filter(FB.open).length, 'not done / closed')}${UI.kpi('Done', cnt('Done'), 'fixed or delivered')}</div>
    <div class="page-actions">${sel(
      'type',
      [
        ['', 'All'],
        ['issue', 'Issues'],
        ['idea', 'Enhancements'],
        ['question', 'Questions'],
      ],
      'Type'
    )}${sel('st', [['', 'All'], ['_open', 'Open'], ...FB.ST.map(s => [s, s])], 'Status')}${sel('team', [['', 'All'], ...Store.teams().map(t => [t.id, t.name])], 'Team')}${sel(
      'sort',
      [
        ['new', 'Newest'],
        ['votes', 'Most 👍'],
        ['urgent', 'Most urgent'],
      ],
      'Sort'
    )}<span class="grow"></span><button class="btn ghost" id="fbxl">⇩ Excel</button></div>
    ${card(`Feedback <span class="count">${rows.length}</span>`, rows.length ? rows.map(r => FB.row(r, true)).join('') : empty('No feedback yet.'))}`;
  return {
    html,
    mount(root) {
      root.querySelectorAll('[data-fbf]').forEach(
        s =>
          (s.onchange = () => {
            f[s.dataset.fbf] = s.value;
            App.render();
          })
      );
      root.querySelectorAll('[data-fbadm]').forEach(el => (el.onclick = () => fbAdminEdit(Store.get(el.dataset.fbadm))));
      root.querySelector('#fbxl').onclick = async () => {
        const head = [
          'No.',
          'Type',
          'Title',
          'Details',
          'From',
          'Team',
          'Page',
          'Urgency',
          'Status',
          'Priority',
          'Reply',
          'Fixed in',
          'Me too',
          'Sent',
          'App version',
        ];
        const data = rows.map(r => [
          FB.num(r),
          FB.TYPE[r.type] || r.type,
          r.title,
          r.details || '',
          Store.memberName(r.from),
          Store.teamName(r.team),
          r.page || '',
          r.urgency || '',
          r.status || 'New',
          r.priority || '',
          r.reply || '',
          r.fixedIn || '',
          FB.votes(r.id).length,
          U.fmtTs(r._created || r._ts),
          r.ver || '',
        ]);
        XL.download(await XL.write([{ name: 'Feedback', rows: [head, ...data] }]), `Feedback ${U.todayStr()}.xlsx`);
      };
    },
  };
}

function fbAdminEdit(r) {
  const others = FB.all().filter(x => x.id !== r.id);
  UI.modal({
    title: `${FB.num(r)} · ${r.title}`,
    wide: true,
    body: `<p class="muted small">${h(FB.TYPE[r.type] || r.type)} from <b>${h(Store.memberShort(r.from))}</b> (${h(Store.teamName(r.team))}) · ${U.fmtTs(r._created || r._ts)} · app ${h(r.ver || '?')} · urgency ${h(r.urgency || 'normal')} · 👍 ${FB.votes(r.id).length}${
      FB.votes(r.id).length
        ? ' (' +
          h(
            FB.votes(r.id)
              .map(v => Store.memberShort(v.by))
              .join(', ')
          ) +
          ')'
        : ''
    }</p>
    ${r.details ? `<div class="fb-d card-sub">${h(r.details)}</div>` : ''}
    <form class="grid-form" id="fba">${UI.field({ key: 'status', label: 'Status', type: 'select', options: FB.ST, blank: false }, r.status === "Won't do" ? 'Rejected' : r.status || 'New')}${UI.field({ key: 'priority', label: 'Your priority', type: 'select', options: FB.PRI.map(p => [p, p || '—']), blank: false }, r.priority || '')}
      ${UI.field({ key: 'dupOf', label: 'Duplicate of', type: 'select', options: [['', '—'], ...others.map(x => [x.id, FB.num(x) + ' ' + x.title.slice(0, 50)])], blank: false }, r.dupOf || '')}${UI.field({ key: 'fixedIn', label: 'Fixed / delivered in version', type: 'text', placeholder: 'e.g. ' + APP_VERSION }, r.fixedIn || '')}
      ${UI.field({ key: 'reply', label: 'Reply (the sender sees it)', type: 'textarea', span: 2, rows: 3 }, r.reply || '')}</form>`,
    actions: `<button class="btn danger ghost" data-del>Delete</button><span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>`,
    onMount: w => {
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelector('[data-del]').onclick = () =>
        UI.confirm('Delete this feedback?', () => {
          Store.save(Object.assign({}, r, { _del: true }));
          UI.closeModal();
          App.render();
        });
      w.querySelector('[data-ok]').onclick = () => {
        const v = UI.readForm(w.querySelector('#fba'), [
          { key: 'status' },
          { key: 'priority' },
          { key: 'dupOf' },
          { key: 'fixedIn' },
          { key: 'reply' },
        ]);
        if (v.status === 'Duplicate' && !v.dupOf) return UI.toast('Choose which item it duplicates', 'bad');
        const cur = Store.get(r.id);
        const changed = v.status !== (cur.status || 'New') || v.reply !== (cur.reply || '') || v.fixedIn !== (cur.fixedIn || '');
        Store.save(Object.assign({}, cur, v, changed ? { repliedAt: Date.now(), repliedBy: App.me } : {}));
        UI.closeModal();
        UI.toast('Saved' + (changed ? ' — the sender will see it' : ''), 'good');
        App.render();
      };
    },
  });
}
