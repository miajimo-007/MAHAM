/* MAHAM — Score fairness rules (used when saving AND when files are read, so hand-edited files
 * cannot get around them):
 *   To Do       analysts may update / finish their own To Do, but not cancel it, not change the manager's
 *               fields, not finish in the future or before it was assigned; an earlier-than-today finish date
 *               needs a reason the manager can see
 *   Quick win   only for yourself; approval, QW ID and manager comment are the manager's; once approved,
 *               subject / dates / analyst are locked
 *   Shadow work only for yourself, dated today or up to Config.SELF_BACKDATE_DAYS days back
 *   Locked month To Do, shadow work, quick wins and attendance of a locked month are read-only for people
 *               without "Lock monthly scores" (changes made before the lock are fine)
 * Managers (assignTodo / approveQW / manageTeam / lockScores, an acting manager, the super admin) are not limited. */
'use strict';

Object.assign(Store, {
  FAIR_COLLS: new Set([
    'todo',
    'quickwin',
    'shadow',
    'attendance',
    'central',
    'oncall',
    'course',
    'info',
    'srs',
    'reccourse',
    'pcomment',
    'gcupdate',
    'gcatch',
  ]),
  /* items that belong to someone: their owner, or anyone with "Change or delete other people's items", may change them */
  OWNED: {
    central: 'analyst',
    oncall: 'analyst',
    course: 'analyst',
    attendance: 'analyst',
    info: 'createdBy',
    srs: 'createdBy',
    reccourse: 'createdBy',
    pcomment: 'createdBy',
    preq: 'createdBy',
    gcupdate: 'createdBy',
  },
  recOwner(r) {
    if (r && r.c === 'gcatch') return r.createdBy || r._by || '';
    const k = r && Store.OWNED[r.c];
    if (!k) return (r && (r.analyst || r.owner)) || '';
    return k === 'createdBy' ? r.createdBy || r._by || '' : r[k] || '';
  },
  TODO_MGR_FIELDS: [
    'task',
    'analyst',
    'fu',
    'assigned',
    'duration',
    'instruction',
    'dirNote',
    'fromTask',
    'team',
    'reviewedBy',
    'reviewedOn',
    'givenBy',
    'priority',
    'hdReq',
    'wf',
    'ttype',
    'fromRule',
    'followOf',
    'fromAsk',
    'prevStep',
    'chainRoot',
    'chainTask',
    'stepNo',
    'stepName',
  ],
  QW_MGR_FIELDS: ['approval', 'qwId', 'managerComment'],
  QW_LOCKED_FIELDS: ['subject', 'date', 'expected', 'module', 'type', 'impact', 'analyst', 'coWorkers'],

  /* allowed this power at that moment (incl. acting for a manager on leave) */
  privileged(id, key, ts) {
    if (!id) return false;
    if (Store.isSuper(id) || Store.can(id, key, 1)) return true;
    const day = ts > 1000 ? U.ds(new Date(ts)) : U.todayStr();
    return Store.delegations().some(d => d.to === id && Store.delegationActive(d, day) && Store.can(d.from, key, 1));
  },
  /* the month a record counts in, as 'YYYY-MM' */
  recMonth(r) {
    const d = r.c === 'todo' ? r.assigned : r.c === 'quickwin' ? r.expected || r.date : r.date;
    return d ? String(d).slice(0, 7) : '';
  },
  /* locked months: 'team|YYYY-MM' → when it was locked */
  lockMap(snaps) {
    const m = {};
    for (const s of snaps || Store.all('scoresnap', '*')) {
      if (!s || s._del) continue;
      const k = `${s.team || 'apps'}|${s.year}-${U.pad(s.month)}`;
      m[k] = Math.min(m[k] || Infinity, s._ts || 0);
    }
    return m;
  },
  monthLabel(ym) {
    const [y, mo] = ym.split('-');
    return `${U.MONTHS[+mo - 1]} ${y}`;
  },

  /* → { reject: reason or '', fixed: record to use, flag: reason worth showing in System Check or '' } */
  fairCheck(r, prev, by, ts, locks) {
    const out = { reject: '', fixed: r, flag: '' };
    if (!r || !Store.FAIR_COLLS.has(r.c)) return out;
    const p = prev && !prev._del ? prev : null;
    const day = ts > 1000 ? U.ds(new Date(ts)) : U.todayStr();
    const norm = v => (v === undefined || v === null || v === false ? '' : v);
    const eq = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
    const priv = key => Store.privileged(by, key, ts);
    const no = why => Object.assign(out, { reject: why });
    // locked months
    if (!priv('lockScores') && ['todo', 'quickwin', 'shadow', 'attendance'].includes(r.c))
      for (const x of [r, p]) {
        if (!x) continue;
        const ym = Store.recMonth(x);
        const t = ym && (locks || {})[`${x.team || r.team || 'apps'}|${ym}`];
        if (t && ts > t) return no(`${Store.monthLabel(ym)} is locked — only your manager can change it now`);
      }
    const ok = Store.OWNED[r.c];
    if (ok && !(ts && ts < Config.OWN_SINCE) && !(priv('editOthers') || (r.c === 'attendance' && priv('editAttendanceOthers')))) {
      const owner = p ? Store.recOwner(p) : ok === 'createdBy' ? by : r[ok];
      if (owner && owner !== by)
        return no(
          `This belongs to ${Store.memberShort(owner)} — only they, or someone given "Change or delete other people's items", can change it`
        );
      if (ok !== 'createdBy' && r[ok] && r[ok] !== by) return no('You can only add this for yourself');
      if (ok === 'createdBy' && p && !eq(r.createdBy, p.createdBy)) out.fixed = Object.assign({}, r, { createdBy: p.createdBy });
    }
    // good catch: the finder (and "Change or delete other people's items") changes anything; anyone may take an open one
    // nobody has; the person who took it may only change status, who has it and the resolution
    if (r.c === 'gcatch' && p && by !== (p.createdBy || p._by) && !priv('editOthers')) {
      if (r._del) return no('Only the person who found it can delete a good catch');
      const free = !p.taker && ['New', 'In progress'].includes(p.status || 'New');
      if (p.taker !== by && !(free && r.taker === by)) return no('Take it first — someone else is on it');
      const f = Object.assign({}, r);
      for (const k of Object.keys(Object.assign({}, p, r)))
        if (
          !['status', 'taker', 'resolution', 'resolvedOn', 'resolvedBy', 'convertedTo', '_ts', '_by', '_v', 'id', 'c'].includes(k) &&
          !eq(r[k], p[k])
        ) {
          if (p[k] === undefined) delete f[k];
          else f[k] = p[k];
        }
      out.fixed = f;
    }
    if (r.c === 'todo' && !priv('assignTodo')) {
      // a copy of a repeating To Do, made by the person's own MAHAM: checked against the rule a manager made
      if (!p && typeof TodoRules !== 'undefined' && !r._del && r.analyst === by) {
        const base = TodoRules.validCopy(r);
        if (base) return Store.fairCheck(r, Object.assign({}, base, { _by: base.givenBy, _ts: 1 }), by, ts, locks);
      }
      // the next step's To Do a workflow made (by the person who finished the step before, or the one it is for)
      if (!p && typeof TodoFlow !== 'undefined' && !r._del && /^todo-step-.+-a$/.test(r.id || '')) {
        const base = TodoFlow.validStep(r, by);
        if (base) {
          if (by === base.analyst) return Store.fairCheck(r, Object.assign({}, base, { _by: '', _ts: 1 }), by, ts, locks);
          return Object.assign(out, { fixed: Object.assign({}, r, base, { _ts: r._ts, _by: r._by, _v: r._v }) });
        }
      }
      if (!p) return no(r._del ? 'Only your manager can delete a To Do' : 'Only a manager or team leader can add To Dos');
      if (r._del) return no('Only your manager can delete a To Do');
      if (p.analyst !== by) return no('This To Do belongs to someone else');
      const f = Object.assign({}, r);
      for (const k of Store.TODO_MGR_FIELDS)
        if (!eq(r[k], p[k])) {
          if (p[k] === undefined) delete f[k];
          else f[k] = p[k];
        }
      if (r.status === 'Canceled' && p.status !== 'Canceled') {
        f.status = p.status;
        out.flag = 'only the manager can cancel a To Do';
      }
      if (p.status === 'Canceled' && r.status !== 'Canceled') {
        f.status = 'Canceled';
        f.finish = p.finish || '';
        out.flag = 'a canceled To Do cannot be reopened by the analyst';
      }
      if (f.finish && f.finish !== (p.finish || '')) {
        if (f.finish > day) {
          f.finish = p.finish || '';
          out.flag = 'finish date in the future';
        } else if (f.assigned && f.finish < f.assigned) {
          f.finish = p.finish || '';
          out.flag = 'finish date before the To Do was given';
        } else if (f.finish < day && !String(f.finishNote || '').trim()) {
          f.finish = day;
          out.flag = 'earlier finish date without a reason (set to the day it was saved)';
        }
      }
      if (f.status !== 'Canceled')
        f.status = !f.finish
          ? 'In Progress'
          : (p.reviewedBy || p.status === 'Resolved') && p.finish && p.finish === f.finish
            ? 'Resolved'
            : 'Ready for review';
      out.fixed = f;
      return out;
    }
    if (r.c === 'quickwin' && !priv('approveQW')) {
      const co = p && (p.coWorkers || []).includes(by) && !(typeof QS !== 'undefined' && Store.db && QS.ans(p, by) === 'no'); // a teammate on a shared quick win may edit it too (not after "Not me")
      if (p && p.analyst !== by && !co) return no('This quick win belongs to someone else');
      if (p && co && p.analyst !== by && (r._del || r.analyst !== p.analyst))
        return no(r._del ? 'Only the person who added it can delete it — use Remove me' : 'You cannot change who added this quick win');
      if (!p && r.analyst !== by) return no('You can only add quick wins for yourself');
      if (r._del) return p && p.approval ? no('An approved quick win can only be deleted by the manager') : out;
      const f = Object.assign({}, r);
      for (const k of Store.QW_MGR_FIELDS)
        if (!eq(r[k], p ? p[k] : '')) {
          if (p && p[k] !== undefined) f[k] = p[k];
          else delete f[k];
          out.flag = 'approval fields can only be set by the manager';
        }
      if (p && p.approval)
        for (const k of Store.QW_LOCKED_FIELDS)
          if (!eq(r[k], p[k])) {
            if (p[k] === undefined) delete f[k];
            else f[k] = p[k];
            out.flag = out.flag || 'details are locked once the quick win is approved';
          }
      out.fixed = f;
      return out;
    }
    if (r.c === 'shadow' && !priv('manageTeam') && !priv('editOthers')) {
      if (p && p.analyst !== by) return no('This shadow work entry belongs to someone else');
      if (r.analyst !== by) return no('You can only log shadow work for yourself');
      const oldest = U.addDays(day, -Config.SELF_BACKDATE_DAYS);
      if (
        p &&
        p.date < oldest &&
        !eq(JSON.stringify(Object.assign({}, r, { _ts: 0, _by: '' })), JSON.stringify(Object.assign({}, p, { _ts: 0, _by: '' })))
      )
        return no(`Entries older than ${Config.SELF_BACKDATE_DAYS} days can only be changed by your manager`);
      if (!r._del && (!p || r.date !== p.date)) {
        if (r.date > day) return no('Shadow work cannot be logged for a future date');
        if (r.date < oldest)
          return no(`Shadow work can be logged up to ${Config.SELF_BACKDATE_DAYS} days back — ask your manager for older days`);
      }
      return out;
    }
    return out;
  },

  /* may I change this record (as it is now)? — used to open other people's items read-only */
  mayChange(r) {
    if (!r || !r.id || !Store.FAIR_COLLS.has(r.c) || App.isSuper()) return true;
    const prev = Store.db.get(r.id);
    if (!prev) return true;
    return !Store.fairCheck(Object.assign({}, prev, { _ts: Date.now() }), prev, App.me, Date.now(), Store.lockMap()).reject;
  },
  /* save-time check for the person using the app: a message when something is not allowed */
  whyNotFair(r) {
    if (!r || !Store.FAIR_COLLS.has(r.c) || !App.me) return '';
    const prev = r.id ? Store.db.get(r.id) : null;
    const res = Store.fairCheck(r, prev, App.me, Date.now(), Store.lockMap());
    if (res.reject) return res.reject;
    if (res.fixed !== r) {
      const changed = Object.keys(Object.assign({}, r, res.fixed)).filter(
        k => !k.startsWith('_') && JSON.stringify(r[k] ?? '') !== JSON.stringify(res.fixed[k] ?? '')
      );
      if (changed.length) {
        if (r.c === 'todo' && changed.includes('status') && r.status === 'Canceled')
          return 'Only your manager or team leader can cancel a To Do';
        if (r.c === 'todo' && changed.includes('finish'))
          return r.finish > U.todayStr()
            ? 'The finish date cannot be in the future'
            : r.finish < (r.assigned || '')
              ? 'The finish date cannot be before the To Do was given'
              : 'Write why the finish date is earlier than today (in "Reason for an earlier finish date")';
        if (r.c === 'quickwin' && changed.some(k => Store.QW_MGR_FIELDS.includes(k)))
          return 'Only your manager can approve or give a QW ID';
        if (r.c === 'quickwin') return 'This quick win is approved — its details are locked. Ask your manager to change them';
        return 'Only your manager can change: ' + changed.join(', ');
      }
    }
    return '';
  },
});
