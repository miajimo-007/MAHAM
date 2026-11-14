/* MAHAM — Convert a record between To Do, Shadow work and Quick win.
 * The new type's form opens filled in; on save the original is deleted from its area and the new record keeps
 * convertedFrom { c, id, title, date, by, at } ("Converted from To Do"). Undo within 15 minutes brings the original back.
 * Rules: analysts convert their own Shadow work ⇄ Quick win; anything to or from a To Do needs a manager / team leader;
 * an approved Quick win or a record in a locked month only the super admin.
 * Nothing written on the original is lost: its 📝 reference notes and links follow it (RefNotes / WorkLinks look up the
 * whole chain with Conv.family), and its text boxes the new type has no place for become notes on the new record. */
'use strict';

const Conv = {
  KINDS: { todo: 'To Do', shadow: 'Shadow work', quickwin: 'Quick win' },
  UNDO_MIN: 15,
  /* text boxes kept as a 📝 note when the new type has no place for them */
  CARRY: {
    todo: [
      ['instruction', 'Manager / Team Leader instruction'],
      ['dirNote', 'Director update'],
      ['comment', 'Analyst update / comment'],
      ['finishNote', 'Reason for an earlier finish date'],
    ],
    shadow: [['note', 'Note']],
    quickwin: [
      ['impact', 'Impact'],
      ['managerComment', 'Manager comment'],
    ],
  },
  /* old id → the record it was converted into (also deleted / undone ones) */
  kidsIndex() {
    return Calc.memo('convkids', () => {
      const m = new Map();
      for (const r of Store.db.values()) {
        const f = r && r.convertedFrom;
        if (f && f.id) {
          if (!m.has(f.id)) m.set(f.id, []);
          m.get(f.id).push(r);
        }
      }
      return m;
    });
  },
  /* the live record an id ends up as after conversions (null if deleted) */
  current(id) {
    const seen = new Set();
    while (id && !seen.has(id)) {
      seen.add(id);
      if (Store.get(id)) return Store.get(id);
      const k = (Conv.kidsIndex().get(id) || []).sort((a, b) => (b._ts || 0) - (a._ts || 0));
      const live = k.find(x => !x._del);
      id = live ? live.id : k[0] && k[0].id;
    }
    return null;
  },
  /* every id this item has had: itself, what it was converted from (and before that), and conversions that were undone */
  family(id) {
    const out = [id];
    const seen = new Set(out);
    for (let i = 0; i < out.length; i++) {
      const r = Store.db.get(out[i]);
      const f = r && r.convertedFrom;
      if (f && f.id && !seen.has(f.id)) {
        seen.add(f.id);
        out.push(f.id);
      }
      for (const k of Conv.kidsIndex().get(out[i]) || [])
        if (k._del && !seen.has(k.id)) {
          seen.add(k.id);
          out.push(k.id);
        }
    }
    return out;
  },
  title(r) {
    return r.task || r.subject || '';
  },
  date(r) {
    return r.c === 'todo' ? r.finish || r.assigned : r.c === 'quickwin' ? r.date || r.expected : r.date;
  },
  locked(r) {
    const ym = Store.recMonth(r);
    return !!(ym && Store.lockMap()[`${r.team || App.viewTeam || 'apps'}|${ym}`]);
  },
  /* '' = allowed, otherwise why not */
  why(r, to) {
    if (!r || !Conv.KINDS[r.c] || !Conv.KINDS[to] || r.c === to) return 'Not possible';
    if (App.isSuper()) return '';
    if (Conv.locked(r)) return 'This month is locked — only the administrator can convert it';
    if (r.c === 'quickwin' && r.approval) return 'An approved quick win can only be converted by the administrator';
    const mgr = Store.privileged(App.me, 'assignTodo', Date.now()); // includes someone acting for a manager on leave
    if ((r.c === 'todo' || to === 'todo') && !mgr) return 'Only your manager or team leader can convert to or from a To Do';
    if (!mgr && r.analyst !== App.me) return 'You can only convert your own records';
    // the same rules the save uses: may I add the new record AND remove the original? (both, or the conversion is not offered)
    if (!App.canEdit(to) || !App.canEdit(r.c)) return `You have view-only access to ${!App.canEdit(to) ? Conv.KINDS[to] : Conv.KINDS[r.c]}`;
    const neu = Object.assign(Conv.draft(r, to), { id: 'conv-check-' + to });
    const gone = Object.assign({}, r, { _del: true });
    return Store.whyNotFair(neu) || Store.whyNotFair(gone) || '';
  },
  /* the new record, filled in from the old one */
  draft(r, to) {
    const t = Conv.title(r);
    const d = Conv.date(r) || U.todayStr();
    const base = {
      c: to,
      analyst: r.analyst,
      team: r.team,
      convertedFrom: { c: r.c, id: r.id, title: t, date: Conv.date(r) || '', by: App.me, at: Date.now() },
    };
    const ref = r.ref || (r.c === 'quickwin' ? r.qwId : '') || '';
    if (ref) base.ref = ref; // the reference (and so the links by reference) stays
    if (to === 'shadow') return Object.assign(base, { subject: t, date: d, minutes: r.minutes || 30, ref: r.ref || r.qwId || '' });
    if (to === 'quickwin')
      return Object.assign(base, {
        subject: t,
        date: r.c === 'todo' ? r.assigned || d : d,
        expected: r.c === 'todo' ? r.finish || '' : d,
        status: (r.c === 'todo' ? r.finish : true) ? 'Completed' : 'In-Progress',
        type: 'Modification',
        impact: r.ref ? 'Ref: ' + r.ref : '',
      });
    if (to === 'todo') {
      const done = r.c === 'shadow' || U.lc(r.status) === 'completed';
      const fin = r.c === 'shadow' ? r.date : r.expected || '';
      return Object.assign(base, {
        task: t,
        assigned: r.date || d,
        duration: 0,
        fu: false,
        finish: done ? fin : '',
        status: done && fin ? 'Resolved' : 'In Progress',
        reviewedBy: done && fin ? App.me : '',
        reviewedOn: done && fin ? U.todayStr() : '',
      });
    }
    return base;
  },
  /* choose the new type, then the filled-in form */
  start(r) {
    const opts = Object.keys(Conv.KINDS)
      .filter(k => k !== r.c)
      .map(k => ({ k, why: Conv.why(r, k) }));
    UI.modal({
      title: '⇄ Convert “' + Conv.title(r).slice(0, 60) + '”',
      body: `<p class="muted small">From <b>${h(Conv.KINDS[r.c])}</b>. The new record opens filled in — check it and save. The ${h(Conv.KINDS[r.c]).toLowerCase()} is then removed and the new one shows “Converted from ${h(Conv.KINDS[r.c])}”.</p>
      ${Conv.keepOk(r) ? `<label class="check cv-keep"><input type="checkbox" id="cvkeep" checked> Keep the <b>${h(U.mins((+r.minutes || 0) / 60))}</b> as shadow work, linked to the new item (so the time still counts)</label>` : ''}
      <div class="row-btns">${opts.map(o => `<button class="btn ${o.why ? '' : 'primary'}" data-cvto="${o.k}" ${o.why ? `disabled title="${h(o.why)}"` : ''}>→ ${h(Conv.KINDS[o.k])}</button>`).join('')}</div>${opts.every(o => o.why) ? `<p class="note">${h(opts[0].why)}</p>` : ''}`,
      actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelectorAll('[data-cvto]').forEach(
          b =>
            (b.onclick = () => {
              const to = b.dataset.cvto;
              const k = w.querySelector('#cvkeep');
              const keep = !!(k && k.checked);
              UI.closeModal();
              setTimeout(() => Conv.open(r, to, { keep }), 0);
            })
        );
      },
    });
  },
  /* shadow work converted to something with no time: its minutes can stay as shadow work (a copy, linked to the new item) */
  keepOk(r) {
    return !!r && r.c === 'shadow' && +r.minutes > 0 && !Store.whyNotFair(Conv.keepCopy(r));
  },
  keepCopy(o) {
    const k = Object.assign({}, o, { id: 'shadow-' + (App.me || 'x') + '-kept' + Date.now().toString(36), keptFrom: o.id });
    for (const f of ['_ts', '_by', '_v', '_chg', '_del', 'convertedTo', 'convertedFrom']) delete k[f];
    return k;
  },
  open(r, to, opts) {
    const orig = Store.get(r.id);
    if (!orig) return;
    const keep = !!(opts && opts.keep) && to !== 'shadow' && Conv.keepOk(orig);
    UI.editRecord(to, Conv.draft(orig, to), {
      title: `Convert to ${Conv.KINDS[to]}`,
      savedMsg: `Converted to ${Conv.KINDS[to]}${keep ? ' — the time stays as shadow work' : ''}`,
      with: out => {
        if (!out.id) out.id = U.uid(to);
        const o = Store.get(orig.id) || orig;
        const kept = keep ? Conv.keepCopy(o) : null; // all or nothing with the conversion (Store.saveMany)
        return [
          Object.assign({}, o, { _del: true, convertedTo: to }),
          ...Conv.carried(o, out),
          ...(kept ? [kept, WorkLinks.rec(kept, out)] : []),
        ];
      },
    });
  },
  /* the original's text boxes the new type has no field for → 📝 notes on the new record */
  carried(o, out) {
    const has = new Set(((Schemas[out.c] || {}).fields || []).map(f => f.key));
    const t0 = Date.now();
    return (Conv.CARRY[o.c] || [])
      .filter(([k]) => !has.has(k) && String(o[k] || '').trim())
      .map(([k, l], i) => ({
        c: 'refnote',
        id: `refnote-${App.me}-${(t0 + i).toString(36)}cv${i}`,
        on: out.id,
        onC: out.c,
        team: out.team || o.team || '',
        by: App.me,
        at: t0 + i,
        text: `From the ${Conv.KINDS[o.c]} — ${l}: ${String(o[k]).trim()}`,
        carried: true,
      }));
  },
  canUndo(r) {
    const f = r && r.convertedFrom;
    return !!(f && f.by === App.me && Date.now() - (f.at || 0) < Conv.UNDO_MIN * 6e4 && Store.db.get(f.id));
  },
  undo(r) {
    const f = r.convertedFrom;
    const o = Store.db.get(f.id);
    if (!o) return;
    const back = Object.assign({}, o);
    delete back._del;
    delete back.convertedTo;
    const notes = (Store.byC.refnote || [])
      .filter(n => n && !n._del && n.on === r.id && n.carried && n.by === App.me)
      .map(n => Object.assign({}, n, { _del: true })); // the copies made when converting
    const kept = (Store.byC.shadow || []).filter(x => x && x.keptFrom === f.id && x._by === App.me); // the time kept as shadow work
    const kIds = new Set(kept.map(x => x.id));
    const kLinks = (Store.byC.worklink || []).filter(l => l && (kIds.has(l.a) || kIds.has(l.b)));
    Store.saveMany([
      back,
      Object.assign({}, r, { _del: true }),
      ...notes,
      ...kept.map(x => Object.assign({}, x, { _del: true })),
      ...kLinks.map(l => Object.assign({}, l, { _del: true })),
    ]);
    UI.closeModal();
    UI.toast('Undone — back to ' + Conv.KINDS[f.c], 'good');
    App.render();
  },
  /* shown in the form and the lists */
  note(r) {
    const f = r && r.convertedFrom;
    return f
      ? `<p class="note conv">⇄ Converted from <b>${h(Conv.KINDS[f.c] || f.c)}</b>${f.date ? ' (' + U.fmtDate(f.date) + ')' : ''} by ${h(Store.memberShort(f.by))} · ${U.fmtTs(f.at)}${Conv.canUndo(r) ? ` <button class="btn xs ghost" data-cvundo>Undo</button>` : ''}</p>`
      : '';
  },
  tag(r) {
    const f = r && r.convertedFrom;
    return f ? ` <span class="badge" title="Converted from ${h(Conv.KINDS[f.c] || f.c)}">⇄ ${h(Conv.KINDS[f.c] || f.c)}</span>` : '';
  },
};
