/* MAHAM — External follow-ups (Central today; vendors later), on the task-workflow engine.
 *
 * A follow-up (collection 'central', kept for scoring / imports / history) has:
 *   party (Central HQ by default) · n → key RYD-12 · status = a step of the party's workflow · chases: [{ on, how, reply, by, at }]
 *   next (next chase on) · priority · requester · link ('c|id' of the To Do / quick win / project task it came from)
 *   redmine (the party's reference no.) · expected · hist (moves) · resolution · doneDate
 * Settings: settings-fuflow { parties: [{ id, name, prefix, ref, flow }], flows: [workflow…] } — Admin → Task workflows → "Follow-ups".
 * Records written before this version are read through FollowUp.norm() (old status → step, notes → first chase) until
 * the admin confirms the upgrade on the Central page; nothing is saved without that. */
'use strict';

const FollowUp = {
  HOW: ['Email', 'Call', 'Teams', 'Meeting', 'Other'],
  LEVELS: { analyst: 'Need Analyst Follow up', leader: 'Need Team Leader Follow up', manager: 'Need Manager Follow Up' },
  TARGETS: { analyst: 30, leader: 60, manager: 90, chase: 7 },
  PARTY_DEF: [{ id: 'central', name: 'Central HQ', prefix: 'RYD', ref: 'Redmine no.' }],

  /* ---------- parties and their workflows ---------- */
  rec() {
    return Store.get('settings-fuflow') || {};
  },
  parties() {
    const l = (FollowUp.rec().parties || []).filter(p => p && p.id && p.name);
    return l.length ? l : FollowUp.PARTY_DEF.slice();
  },
  party(id) {
    return FollowUp.parties().find(p => p.id === (id || 'central')) || FollowUp.parties()[0];
  },
  defaultFlow() {
    return {
      id: 'fu-central',
      name: 'Central follow-up',
      start: 'Under Review',
      statuses: [
        { name: 'Under Review', cat: 'wait' },
        { name: 'Accepted', cat: 'doing' },
        { name: 'In Development', cat: 'doing' },
        { name: 'Waiting deployment', cat: 'wait' },
        { name: 'Deployed', cat: 'done' },
        { name: 'Rejected', cat: 'done' },
        { name: 'Cancelled', cat: 'done' },
      ],
      trs: [
        {
          id: 'acc',
          name: 'Accepted',
          from: ['Under Review'],
          to: 'Accepted',
          screen: ['redmine'],
          valid: [{ k: 'field', field: 'redmine' }],
        },
        { id: 'dev', name: 'In development', from: ['Accepted'], to: 'In Development', screen: ['expected'] },
        {
          id: 'wd',
          name: 'Waiting deployment',
          from: ['Accepted', 'In Development'],
          to: 'Waiting deployment',
          screen: ['expected'],
          valid: [{ k: 'field', field: 'expected' }],
        },
        {
          id: 'dep',
          name: 'Deployed',
          from: ['Waiting deployment', 'In Development'],
          to: 'Deployed',
          post: [{ k: 'resolution', value: 'Done' }],
        },
        {
          id: 'rej',
          name: 'Rejected',
          from: ['*'],
          to: 'Rejected',
          screen: ['comment'],
          valid: [{ k: 'comment' }],
          post: [{ k: 'resolution', value: 'Rejected' }],
        },
        {
          id: 'can',
          name: 'Cancel',
          from: ['*'],
          to: 'Cancelled',
          screen: ['comment'],
          valid: [{ k: 'comment' }],
          post: [{ k: 'resolution', value: 'Canceled' }],
        },
        {
          id: 'reo',
          name: 'Reopen',
          from: ['Deployed'],
          to: 'In Development',
          screen: ['comment'],
          valid: [{ k: 'comment' }],
          post: [{ k: 'clearRes' }],
        },
        {
          id: 'back',
          name: 'Back to review',
          from: ['Rejected', 'Cancelled', 'Accepted'],
          to: 'Under Review',
          screen: ['comment'],
          post: [{ k: 'clearRes' }],
        },
      ],
    };
  },
  flows() {
    const l = (FollowUp.rec().flows || []).filter(Boolean);
    return l.length ? l : [FollowUp.defaultFlow()];
  },
  _fc: null,
  flowOf(r) {
    if (!FollowUp._fc || FollowUp._fc.v !== Store.ver) FollowUp._fc = { v: Store.ver, m: new Map() };
    const pt = FollowUp.party(r && r.party);
    const k = pt.id;
    if (FollowUp._fc.m.has(k)) return FollowUp._fc.m.get(k);
    const fl = FollowUp.flows();
    const w = TaskFlow.norm(fl.find(x => x.id === pt.flow) || fl[0]);
    FollowUp._fc.m.set(k, w);
    return w;
  },
  key(r) {
    const pt = FollowUp.party(r && r.party);
    return `${pt.prefix || 'FU'}-${(r && r.n) || '?'}`;
  },

  /* ---------- old records (before steps) ---------- */
  mapOld(r) {
    const st = U.lc(r.status || '');
    const names = FollowUp.flowOf(r).statuses.map(s => s.name);
    const has = n => (names.includes(n) ? n : null);
    if (st === 'solved') return has('Deployed') || names.find(n => FollowUp.flowOf(r).statuses.find(s => s.name === n).cat === 'done');
    if (st === 'rejected') return has('Rejected') || names[names.length - 1];
    if (st === 'accepted')
      return r.deployed === 'Yes'
        ? has('Deployed') || 'Accepted'
        : r.redmine && r.expected
          ? has('Waiting deployment') || 'Accepted'
          : has('Accepted') || names[0];
    if (!st || st === 'under review') return has('Under Review') || FollowUp.flowOf(r).start;
    return names.find(n => U.lc(n) === st) || FollowUp.flowOf(r).start;
  },
  old(r) {
    return !!r && r.c === 'central' && !r.fuv;
  },
  /* the record as the new page sees it (old ones converted in memory, not saved) */
  norm(r) {
    if (!FollowUp.old(r)) return r;
    const status = FollowUp.mapOld(r);
    const done = (FollowUp.flowOf(r).statuses.find(s => s.name === status) || {}).cat === 'done';
    const touched = r._ts > 1000 ? U.ds(new Date(r._ts)) : r.date;
    const chases = r.notes
      ? [{ on: touched || r.date || U.todayStr(), how: 'Other', reply: String(r.notes), by: r.analyst, at: r._ts || 0 }]
      : [];
    const out = Object.assign({}, r, {
      status,
      party: r.party || 'central',
      fuv: 2,
      chases: (r.chases || []).concat(chases),
      notes: '',
      lastTouch: touched || r.date,
      oldStatus: r.status || '',
    });
    if (done && !out.doneDate) out.doneDate = touched || r.date || '';
    if (done) out.resolution = out.resolution || (/reject/i.test(status) ? 'Rejected' : /cancel/i.test(status) ? 'Canceled' : 'Done');
    if (r.status === 'Accepted' && !r.redmine) out.flag = 'missing Redmine no.';
    delete out.deployed;
    return out;
  },
  /* ---------- state ---------- */
  cat(r) {
    const x = FollowUp.norm(r);
    const s = FollowUp.flowOf(x).statuses.find(s2 => s2.name === x.status);
    return s ? s.cat || 'todo' : 'todo';
  },
  isOpen(r) {
    return FollowUp.cat(r) !== 'done';
  },
  isSolved(r) {
    if (FollowUp.old(r)) return r.status === 'Solved' || (r.status === 'Accepted' && r.deployed === 'Yes');
    const x = FollowUp.norm(r);
    return FollowUp.cat(x) === 'done' && !/reject|cancel/i.test(x.status) && !/reject|cancel/i.test(x.resolution || '');
  },
  doneDay(r) {
    const x = FollowUp.norm(r);
    return x.doneDate || (r._ts > 1000 ? U.ds(new Date(r._ts)) : r.date);
  },
  lastTouch(r) {
    const x = FollowUp.norm(r);
    const d = [
      x.date || '',
      x.lastTouch || '',
      ...(x.chases || []).map(c => c.on || ''),
      ...(x.hist || []).map(hh => (hh.at ? U.ds(new Date(hh.at)) : '')),
    ]
      .filter(Boolean)
      .sort();
    return d.pop() || '';
  },
  targets(team) {
    return Object.assign({}, FollowUp.TARGETS, (typeof TimeRules !== 'undefined' && TimeRules.at(team || 'apps').central) || {});
  },
  off(r) {
    if (typeof TimeRules === 'undefined') return d => U.isOff(d);
    const R = TimeRules.at(r.team || 'apps');
    return TimeRules.offFn(R, r.analyst);
  },
  daysOpen(r) {
    return r.date ? U.diffDays(r.date, FollowUp.isOpen(r) ? U.todayStr() : FollowUp.doneDay(r)) : null;
  },
  sinceTouch(r) {
    const a = FollowUp.lastTouch(r);
    return a ? Math.max(0, TimeRules.workBetween(a, U.todayStr(), FollowUp.off(r))) : null;
  },
  level(r) {
    if (!FollowUp.isOpen(r)) return '';
    const n = FollowUp.sinceTouch(r) || 0;
    const T = FollowUp.targets(r.team);
    return n >= T.manager ? 'manager' : n >= T.leader ? 'leader' : n >= T.analyst ? 'analyst' : '';
  },
  /* the old "comment" column, worked out the new way (Home, Manager desk and the page use it) */
  comment(r) {
    const x = FollowUp.norm(r);
    if (!FollowUp.isOpen(x)) return 'Request closed';
    const ref = FollowUp.party(x.party).ref || 'reference no.';
    if (x.status === 'Accepted' && !x.redmine) return /redmine/i.test(ref) ? 'Insert Redmine No' : 'Insert ' + ref;
    if (['Accepted', 'In Development'].includes(x.status) && !x.expected) return 'Insert Expected date';
    if (x.status === 'Waiting deployment' && !FollowUp.level(x)) return 'Waiting deployment';
    const l = FollowUp.level(x);
    return l ? FollowUp.LEVELS[l] : 'New';
  },
  chaseDue(r) {
    const x = FollowUp.norm(r);
    return FollowUp.isOpen(x) && !!x.next && x.next <= U.todayStr();
  },
  nextFrom(r, day) {
    return TimeRules.addWork(day || U.todayStr(), FollowUp.targets(r.team).chase, FollowUp.off(r));
  },
  /* who may move / chase: the analyst, or a team leader / manager / anyone with "Change other people's items" */
  isLead(id) {
    const m = Store.member(id) || {};
    return Store.isSuper(id) || ['teamleader', 'manager', 'director', 'aed'].includes(m.role) || Store.privileged(id, 'editOthers');
  },
  canEdit(r) {
    return !!r && (r.analyst === App.me || App.forMe(r.analyst) || FollowUp.isLead(App.me) || App.isActing());
  },

  /* ---------- actions ---------- */
  chase(r, e) {
    const x = FollowUp.norm(r);
    const on = e.on || U.todayStr();
    const out = Object.assign({}, x, {
      chases: [...(x.chases || []), { on, how: e.how || 'Email', reply: String(e.reply || '').trim(), by: App.me, at: Date.now() }].slice(
        -80
      ),
      next: FollowUp.nextFrom(x, on > U.todayStr() ? on : U.todayStr()),
    });
    Store.save(out);
    return out;
  },
  run(r, trId, form) {
    return TaskFlow.run(FollowUp.norm(r), trId, form);
  },
  /* things linked to a record (both ways) */
  linkedTo(id) {
    return Store.all('central').filter(r => r.link && r.link.split('|')[1] === id);
  },
  linkOptions(analyst) {
    const me = analyst || App.me;
    const out = [];
    for (const t of Store.all('todo')
      .filter(t => t.analyst === me && t.status !== 'Done')
      .slice(-40))
      out.push(['todo|' + t.id, `To Do · ${TodoId.key(t)} ${t.task || ''}`]);
    for (const q of Store.all('quickwin')
      .filter(q => q.analyst === me)
      .slice(-30))
      out.push(['quickwin|' + q.id, 'Quick win · ' + (q.subject || '')]);
    if (typeof Scrum !== 'undefined')
      for (const t of Store.all('ptask')
        .filter(t => t.assignee === me && !Scrum.isDone(t))
        .slice(-40))
        out.push(['ptask|' + t.id, `Project task · ${ptKey(t)} ${t.title}`]);
    return out;
  },
  linkLabel(link) {
    if (!link) return '';
    const [c, id] = link.split('|');
    const r = Store.get(id);
    if (!r) return '';
    return c === 'todo'
      ? `To Do ${TodoId.key(r)}: ${r.task}`
      : c === 'quickwin'
        ? 'Quick win: ' + r.subject
        : c === 'ptask'
          ? `Project task ${ptKey(r)}: ${r.title}`
          : '';
  },
  /* the upgrade: old records → steps (preview, then save) */
  upgradePlan() {
    return Store.all('central', '*')
      .filter(FollowUp.old)
      .map(r => ({ r, to: FollowUp.norm(r) }));
  },
  upgrade() {
    const plan = FollowUp.upgradePlan().sort((a, b) => String(a.r.date || '').localeCompare(String(b.r.date || '')));
    const top = {};
    for (const r of Store.all('central', '*'))
      if (r.n) {
        const k = r.party || 'central';
        top[k] = Math.max(top[k] || 0, +r.n);
      }
    const l = plan.map(x => {
      const o = Object.assign({}, x.to);
      delete o.oldStatus;
      if (!o.n) {
        const k = o.party || 'central';
        top[k] = (top[k] || 0) + 1;
        o.n = top[k];
      }
      return o;
    });
    if (l.length) Store.saveMany(l);
    return l.length;
  },
};

/* ---------- the engine: follow-ups use the task-workflow engine ---------- */
(function wire() {
  const ft = TaskFlow.forTask;
  TaskFlow.forTask = t => (t && t.c === 'central' ? FollowUp.flowOf(t) : ft(t));
  const vf = TaskFlow.validFail;
  TaskFlow.validFail = (v, t, form) => {
    const x = vf(v, t, form);
    if (x && t && t.c === 'central' && v.k === 'field') {
      if (v.field === 'redmine') return 'fill in the ' + (FollowUp.party(t.party).ref || 'reference no.');
      if (v.field === 'expected') return 'fill in the expected date';
    }
    return x;
  };
  const cf = TaskFlow.condFail;
  TaskFlow.condFail = (c, t, who) => {
    if (t && t.c === 'central') {
      if (c.k === 'assignee') return t.analyst === who || (who === App.me && App.forMe(t.analyst)) ? '' : 'only the analyst';
      if (c.k === 'planner') return FollowUp.isLead(who) ? '' : 'only a team leader / manager';
      if (c.k === 'subsDone' || c.k === 'stage') return '';
    }
    return cf(c, t, who);
  };
  TaskFlow.canMove = t =>
    t && t.c === 'central' ? FollowUp.canEdit(t) : Scrum.canWork(t) || (Scrum.member(Scrum.proj(t.project)) && !t.assignee);
  const ap = TaskFlow.apply;
  TaskFlow.apply = function (t, tr, form, who) {
    const o = ap.call(this, t, tr, form, who);
    if (t && t.c === 'central') {
      o.side = o.side.filter(x => x.c !== 'pcomment');
      for (const k of ['redmine', 'expected']) if (form && form[k]) o.r[k] = form[k];
    }
    return o;
  };
  const wk = Work.key;
  Work.key = t => (t && t.c === 'central' ? FollowUp.key(t) : wk(t));
  const ta = TaskFlow.toApprove;
  TaskFlow.toApprove = () =>
    ta().concat(
      Store.all('central')
        .filter(r => r.pending)
        .filter(r => {
          const tr = FollowUp.flowOf(r).trs.find(x => x.id === r.pending.tr);
          return tr && TaskFlow.approver(r, tr);
        })
    );
  const ab = TaskFlow.approvers;
  TaskFlow.approvers = (t, tr) => {
    if (!(t && t.c === 'central')) return ab(t, tr);
    const out = new Set();
    for (const c of tr.approve || []) {
      if (c.k === 'planner')
        Store.members()
          .filter(m => m.active !== false && (m.team || 'apps') === (t.team || 'apps') && ['teamleader', 'manager'].includes(m.role))
          .forEach(m => out.add(m.id));
      if (c.k === 'people') (c.ids || []).forEach(id => out.add(id));
      if (c.k === 'roles')
        Store.members()
          .filter(m => m.active !== false && (m.team || 'apps') === (t.team || 'apps') && (c.roles || []).includes(m.role || 'analyst'))
          .forEach(m => out.add(m.id));
    }
    return [...out];
  };
  // the old helpers now answer the new way
  Calc.centralComment = r => FollowUp.comment(r);
  Calc.centralDays = r => FollowUp.daysOpen(r);

  /* ---------- the form ---------- */
  const S = Schemas.central;
  S.defaults = () => ({
    analyst: App.me,
    date: U.todayStr(),
    type: 'Modification',
    priority: 'Normal',
    party: 'central',
    fuv: 2,
    status: FollowUp.flowOf({ party: 'central' }).start,
  });
  const keep = S.fields.filter(f => !['deployed', 'status', 'notes'].includes(f.key));
  const at = k => keep.findIndex(f => f.key === k);
  const red = keep[at('redmine')];
  if (red) {
    red.label = 'Reference no. (Redmine)';
  }
  keep.splice(
    at('subject') + 1,
    0,
    { key: 'priority', label: 'Priority', type: 'select', options: ['High', 'Normal', 'Low'], blank: false },
    { key: 'requester', label: 'Requested by (department / person)', type: 'text' }
  );
  keep.splice(at('type'), 0, {
    key: 'party',
    label: 'With',
    type: 'select',
    options: () => FollowUp.parties().map(p => [p.id, p.name]),
    blank: false,
    showIf: () => FollowUp.parties().length > 1,
  });
  keep.push(
    {
      key: 'status',
      label: 'Step',
      type: 'select',
      options: () => {
        const b = UI._recBase || {};
        return b.id ? [b.status] : [FollowUp.flowOf(b).start];
      },
      blank: false,
      hint: 'change it with the move buttons below',
    },
    { key: 'next', label: 'Next chase on', type: 'date' },
    {
      key: 'link',
      label: 'Linked to',
      type: 'select',
      options: () => {
        const b = UI._recBase || {};
        const o = FollowUp.linkOptions(b.analyst);
        if (b.link && !o.some(x => x[0] === b.link)) o.unshift([b.link, FollowUp.linkLabel(b.link) || b.link]);
        return o;
      },
      blank: '— nothing —',
      span: 2,
    },
    { key: 'notes', label: 'Notes (internal)', type: 'textarea', span: 2, rows: 2 }
  );
  S.fields = keep;
  const base = keep.slice();
  S.beforeSave = function (r, before) {
    if (!r.party) r.party = 'central';
    r.fuv = 2;
    if (!before || !before.id) {
      if (!r.status) r.status = FollowUp.flowOf(r).start;
      if (!r.next) r.next = FollowUp.nextFrom(r, r.date && r.date > U.todayStr() ? r.date : U.todayStr());
    }
    if (!r.n)
      r.n =
        Store.all('central', '*')
          .filter(x => (x.party || 'central') === r.party)
          .reduce((a, x) => Math.max(a, +x.n || 0), 0) + 1;
    const done = FollowUp.cat(r) === 'done';
    if (done && !r.doneDate) r.doneDate = U.todayStr();
    if (!done) {
      r.doneDate = '';
    }
    delete r.deployed;
  };
  S.validate = out => {
    const miss = Work.custom('fu').filter(
      f => Work.required(f, FollowUp.party(out.party).name) && (out[f.key] == null || out[f.key] === '' || out[f.key] === false)
    );
    return miss.length ? 'Fill in ' + miss.map(f => f.label).join(', ') : '';
  };
  S.readOnly = r => !!r.id && !FollowUp.canEdit(FollowUp.norm(r));
  const er = UI.editRecord;
  UI.editRecord = function (coll, rec, opts) {
    if (coll === 'central') {
      if (rec && rec.id) rec = FollowUp.norm(Store.get(rec.id) || rec);
      const pt = FollowUp.party(rec && rec.party);
      const red2 = base.find(f => f.key === 'redmine');
      if (red2) red2.label = pt.ref || 'Reference no.';
      S.fields = base.concat(
        Work.custom('fu')
          .filter(f => Work.appliesTo(f, pt.name))
          .map(f => Work.ui(f, { required: Work.required(f, pt.name) }))
      );
    }
    const out = er.call(this, coll, rec, opts);
    // a To Do / quick win / project task linked from a follow-up shows it
    if (['todo', 'quickwin', 'ptask'].includes(coll) && rec && rec.id) {
      const l = FollowUp.linkedTo(rec.id);
      const body = document.querySelector('#modal .modal-body');
      if (l.length && body)
        body.insertAdjacentHTML(
          'afterbegin',
          `<div class="insights warnbox"><div>↗ Waiting on ${l.map(r => `<a href="#" data-edit="central|${h(r.id)}"><b>${h(FollowUp.key(r))}</b></a> ${h(FollowUp.party(r.party).name)} · ${h(FollowUp.norm(r).status)}`).join(', ')}</div></div>`
        );
    }
    return out;
  };
})();
