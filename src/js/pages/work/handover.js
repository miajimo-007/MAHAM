/* MAHAM — Analyst handover: before leave (or a busy spell), an analyst lists their open work with a note for each
 * item and picks the colleague who covers. The colleague accepts it on their Analyst Desk; the manager moves the
 * To Dos / project tasks marked "hand on" in one click, and gives them back in one click when the analyst returns.
 *   handover { by, to, from, until, note, items: [{ c, id, title, note, move }], acceptedOn, movedBy, movedOn, backAsked, backBy, backOn }
 * Kept in the writer's own file; the colleague may only accept it; a manager / team leader may move work and give it back. */
'use strict';

const Handover = {
  all() {
    return (Store.byC.handover || []).filter(r => r && !r._del).sort((a, b) => (b._ts || 0) - (a._ts || 0));
  },
  active(r) {
    return !r.backOn;
  },
  mine() {
    return Handover.all().filter(r => r.by === App.me && Handover.active(r));
  },
  toMe() {
    return Handover.all().filter(r => r.to === App.me && Handover.active(r));
  },
  /* for a manager: handovers of my teams that need work moved or given back */
  forMgr(me) {
    me = me || App.me;
    if (!Store.can(me, 'assignTodo')) return [];
    const mine = new Set((Store.teamsFor(me) || []).map(t => t.id));
    return Handover.all().filter(
      r =>
        Handover.active(r) &&
        r.by !== me &&
        mine.has((Store.member(r.by) || {}).team || 'apps') &&
        ((!r.movedBy && r.items.some(i => i.move)) || (r.movedBy && (r.backAsked || (r.until && r.until < U.todayStr()))))
    );
  },
  openWork(id) {
    const todayY = new Date().getFullYear();
    const out = [];
    for (const r of Store.all('todo', '*').filter(r => r.analyst === id && r.status === 'In Progress' && !r.virtual))
      out.push({ c: 'todo', id: r.id, title: r.task, kind: 'To Do', canMove: true });
    if (typeof Scrum !== 'undefined')
      for (const r of Store.all('ptask', '*').filter(r => r.assignee === id && !Scrum.isDone(r) && r.status !== 'Canceled'))
        out.push({
          c: 'ptask',
          id: r.id,
          title: r.title + ' · ' + ((Scrum.proj(r.project) || {}).name || ''),
          kind: 'Project task',
          canMove: true,
        });
    for (const x of Calc.helpdesk(todayY).filter(x => x.mid === id && !x.closed))
      out.push({ c: 'helpdesk', id: x.r.id, title: (x.r.reqId ? '#' + x.r.reqId + ' ' : '') + (x.r.subject || ''), kind: 'Help desk' });
    for (const r of Store.all('quickwin', '*').filter(
      r => r.analyst === id && !qwHistory(r) && U.lc(r.status) !== 'completed' && U.lc(r.status) !== 'rejected'
    ))
      out.push({ c: 'quickwin', id: r.id, title: r.subject, kind: 'Quick win' });
    for (const r of Store.all('central', '*').filter(
      r =>
        r.analyst === id &&
        (typeof FollowUp !== 'undefined' ? FollowUp.isOpen(r) : ['Under Review', 'Accepted', ''].includes(r.status || ''))
    ))
      out.push({ c: 'central', id: r.id, title: r.subject || r.reqId || 'Follow-up', kind: 'Follow-up' });
    for (const r of Store.all('action', '*').filter(r => r.who === id && r.status !== 'Done'))
      out.push({ c: 'action', id: r.id, title: r.text || r.title || 'Meeting action', kind: 'Meeting action' });
    return out;
  },
  colleagues() {
    const me = Store.member(App.me) || {};
    return Store.members().filter(
      m => m.id !== App.me && m.active !== false && !Store.topRole(m.role) && (m.team || 'apps') === (me.team || 'apps')
    );
  },
  /* ---------- the analyst writes it ---------- */
  form(prev) {
    const work = Handover.openWork(App.me);
    const ppl = Handover.colleagues();
    if (!ppl.length) return UI.toast('Nobody else in your team to hand over to', 'bad');
    const lv = Store.all('request', '*').find(
      q => q.requester === App.me && Requests.isDone(q) && Requests.type(q.type).kind === 'days' && (q.to || q.from) >= U.todayStr()
    );
    const old = prev || {};
    const inOld = id => (old.items || []).find(i => i.id === id) || {};
    UI.modal({
      title: '🤝 Hand over my work',
      wide: true,
      body: `<form class="grid-form" id="hof">${UI.field({ key: 'to', label: 'Who covers for you', type: 'select', options: ppl.map(m => [m.id, m.name]), blank: false }, old.to || ppl[0].id)}<div></div>
        ${UI.field({ key: 'from', label: 'From', type: 'date' }, old.from || (lv && lv.from) || U.todayStr())}${UI.field({ key: 'until', label: 'Until (you are back)', type: 'date' }, old.until || (lv && (lv.to || lv.from)) || U.addDays(U.todayStr(), 7))}
        ${UI.field({ key: 'note', label: 'General note for them', type: 'textarea', span: 2, rows: 2, placeholder: 'Passwords are in the usual place · call me only if …' }, old.note || '')}</form>
        <p class="small"><b>${work.length}</b> open item(s). Write a note where it helps. Tick <b>Hand on</b> for To Dos and project tasks they should take over — your manager moves them in one click and gives them back when you return.</p>
        <div class="tbl-scroll"><table class="tbl"><thead><tr><th>Item</th><th>Note for them</th><th class="ctr">Hand on</th></tr></thead><tbody>
        ${work.map((w, i) => `<tr data-hoi="${i}"><td><span class="ag-kind">${h(w.kind)}</span> ${h(w.title)}</td><td><input data-hon value="${h(inOld(w.id).note || '')}" style="width:100%"></td><td class="ctr">${w.canMove ? `<input type="checkbox" data-hom ${inOld(w.id).move ? 'checked' : ''}>` : '<span class="muted small">watch</span>'}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No open work — the handover is just your note.</td></tr>'}
        </tbody></table></div>`,
      actions: '<span class="grow"></span><button class="btn primary" data-ok>Send handover</button>',
      onMount: wnd =>
        (wnd.querySelector('[data-ok]').onclick = () => {
          const v = UI.readForm(wnd.querySelector('#hof'), [{ key: 'to' }, { key: 'from' }, { key: 'until' }, { key: 'note' }]);
          if (v.until && v.from && v.until < v.from) return UI.toast('“Until” is before “From”', 'bad');
          const items = [...wnd.querySelectorAll('[data-hoi]')].map(tr => {
            const w = work[+tr.dataset.hoi];
            const m = tr.querySelector('[data-hom]');
            return {
              c: w.c,
              id: w.id,
              title: w.title,
              kind: w.kind,
              note: tr.querySelector('[data-hon]').value.trim(),
              move: !!(m && m.checked),
            };
          });
          Store.save(Object.assign({}, prev || { c: 'handover', id: `handover-${App.me}-${Date.now()}`, by: App.me }, v, { items }));
          UI.closeModal();
          UI.toast(`Handover sent to ${Store.memberShort(v.to)}`, 'good');
          App.render(true);
        }),
    });
  },
  /* ---------- cards ---------- */
  itemsHtml(r, withBack) {
    return (
      r.items
        .map(i => {
          const rec = Store.get(i.id);
          const open =
            i.c === 'todo' || i.c === 'quickwin' || i.c === 'central' || i.c === 'action'
              ? `data-edit="${h(i.c + '|' + i.id)}"`
              : i.c === 'ptask' && rec
                ? `data-proj="${h(rec.project)}"`
                : '';
          return `<div class="li ${open ? 'click' : ''}" ${open}><span class="ag-kind">${h(i.kind || i.c)}</span><div class="grow"><b>${h(i.title)}</b>${i.note ? `<div class="small">📝 ${h(i.note)}</div>` : ''}</div>${i.move ? UI.badge(r.movedBy && !r.backOn ? 'handed on' : 'to hand on', r.movedBy ? 'good' : 'warn') : ''}${withBack ? '' : ''}</div>`;
        })
        .join('') || '<p class="muted small">No items.</p>'
    );
  },
  homeCards() {
    const toMe = Handover.toMe();
    const mine = Handover.mine();
    let out = '';
    for (const r of toMe)
      out += card(
        `🤝 Handover from ${h(Store.memberShort(r.by))} <span class="count">${r.items.length}</span>`,
        `<p class="small">${U.fmtDate(r.from)} → ${U.fmtDate(r.until)}${r.acceptedOn ? ` · ✓ you accepted it on ${U.fmtDate(r.acceptedOn)}` : ''}</p>${r.note ? `<div class="insights"><div>📝 ${h(r.note)}</div></div>` : ''}${Handover.itemsHtml(r)}
      ${!r.acceptedOn ? `<div class="row-btns"><span class="grow"></span><button class="btn primary sm" data-hoacc="${h(r.id)}">Accept handover</button></div>` : ''}`
      );
    for (const r of mine)
      out += card(
        `🤝 Your handover to ${h(Store.memberShort(r.to))}`,
        `<p class="small">${U.fmtDate(r.from)} → ${U.fmtDate(r.until)} · ${r.acceptedOn ? '✓ accepted' : 'waiting for them to accept'}${r.items.some(i => i.move) ? (r.movedBy ? ` · work handed on by ${h(Store.memberShort(r.movedBy))}` : ' · waiting for your manager to hand on the ticked work') : ''}</p>
      <div class="row-btns"><button class="btn sm" data-hoedit="${h(r.id)}">Edit</button>${r.movedBy && !r.backAsked ? `<button class="btn sm primary" data-hoback="${h(r.id)}">I'm back — give my work back</button>` : ''}${!r.movedBy ? `<button class="btn sm ghost" data-hoend="${h(r.id)}">End handover</button>` : ''}${r.backAsked ? '<span class="muted small">asked your manager to give it back</span>' : ''}</div>`
      );
    return out;
  },
  mgrCard() {
    const l = Handover.forMgr();
    if (!l.length) return '';
    return card(
      `🤝 Handovers <span class="count">${l.length}</span>`,
      l
        .map(r => {
          const n = r.items.filter(i => i.move).length;
          const back = !!r.movedBy;
          return `<div class="li"><div class="grow"><b>${h(Store.memberShort(r.by))} → ${h(Store.memberShort(r.to))}</b> <span class="muted small">${U.fmtDate(r.from)} → ${U.fmtDate(r.until)}${r.acceptedOn ? ' · accepted' : ' · not accepted yet'}</span><div class="small">${back ? `${n} item(s) to give back to ${h(Store.memberShort(r.by))}` : `${n} To Do / task(s) to hand on`}</div></div>${back ? `<button class="btn xs primary" data-homback="${h(r.id)}">Give back</button>` : `<button class="btn xs primary" data-homove="${h(r.id)}">Hand on ${n}</button>`}</div>`;
        })
        .join('')
    );
  },
  /* ---------- actions ---------- */
  move(r, back) {
    const from = back ? r.to : r.by,
      to = back ? r.by : r.to;
    const recs = [];
    for (const i of r.items.filter(x => x.move)) {
      const rec = Store.get(i.id);
      if (!rec || rec._del) continue;
      if (i.c === 'todo' && rec.analyst === from && rec.status === 'In Progress')
        recs.push(Object.assign({}, rec, { analyst: to, handedFrom: back ? '' : from }));
      if (i.c === 'ptask' && rec.assignee === from && !Scrum.isDone(rec)) recs.push(Object.assign({}, rec, { assignee: to }));
    }
    recs.push(Object.assign({}, r, back ? { backBy: App.me, backOn: U.todayStr() } : { movedBy: App.me, movedOn: U.todayStr() }));
    Store.saveMany(recs);
    UI.toast(
      back
        ? `${recs.length - 1} item(s) given back to ${Store.memberShort(r.by)}`
        : `${recs.length - 1} item(s) handed on to ${Store.memberShort(r.to)}`,
      'good'
    );
  },
  bind(root) {
    const on = (sel, fn) =>
      root.querySelectorAll(sel).forEach(
        b =>
          (b.onclick = e => {
            e.stopPropagation();
            fn(Store.get(b.getAttribute(sel.slice(1, -1))));
          })
      );
    on('[data-hoacc]', r => {
      Store.save(Object.assign({}, r, { acceptedOn: U.todayStr() }));
      UI.toast('Handover accepted', 'good');
      App.render(true);
    });
    on('[data-hoedit]', r => Handover.form(r));
    on('[data-hoback]', r => {
      Store.save(Object.assign({}, r, { backAsked: U.todayStr() }));
      UI.toast('Asked your manager to give your work back', 'good');
      App.render(true);
    });
    on('[data-hoend]', r => {
      Store.save(Object.assign({}, r, { backOn: U.todayStr(), backBy: App.me }));
      UI.toast('Handover ended', 'good');
      App.render(true);
    });
    on('[data-homove]', r => {
      Handover.move(r, false);
      App.render(true);
    });
    on('[data-homback]', r => {
      Handover.move(r, true);
      App.render(true);
    });
    const nb = root.querySelector('#hoNew');
    if (nb) nb.onclick = () => Handover.form();
  },
};

(function () {
  if (P.home) {
    const base = P.home;
    P.home = function () {
      const out = base.apply(this, arguments);
      if (!out || !out.html || App.isDir() || App.isMgr()) return out;
      // the handover button sits with "Today: On duty / Off / Permission"; handover cards go above the desk
      const cards = Handover.homeCards();
      const btn = Handover.mine().length
        ? ''
        : '<button class="btn sm" id="hoNew" title="Before leave: pass your open work to a colleague">🤝 Hand over</button>';
      if (btn && /Today:/.test(out.html)) out.html = out.html.replace(/(<span[^>]*>Today:<\/span>)/, btn + ' $1');
      else if (btn) out.html = `<div class="row-btns" style="justify-content:flex-end;margin:0 0 6px">${btn}</div>` + out.html;
      out.html = cards + out.html;
      const m0 = out.mount;
      out.mount = root => {
        if (m0) m0(root);
        Handover.bind(root);
      };
      return out;
    };
  }
  if (P.manager) {
    const base = P.manager;
    P.manager = function () {
      const out = base.apply(this, arguments);
      if (!out || !out.html) return out;
      const c0 = Handover.mgrCard();
      if (c0) {
        const at = out.html.indexOf('<div class="needs-you');
        const end = at >= 0 ? out.html.indexOf('</div>', at) + 6 : -1;
        out.html = end > 5 ? out.html.slice(0, end) + c0 + out.html.slice(end) : out.html + c0;
      }
      const m0 = out.mount;
      out.mount = root => {
        if (m0) m0(root);
        Handover.bind(root);
      };
      return out;
    };
  }
})();
