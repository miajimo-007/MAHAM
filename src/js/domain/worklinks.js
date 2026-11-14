/* MAHAM — 🔗 Linked work: Shadow work, To Dos and Quick wins that belong to the same thing.
 * Items are linked only when someone links them (since 2026.11.11.1 — before, the same Reference linked by itself):
 *   · same Reference — items with the same Reference (Request ID / SRS / E-CTS no. …; a quick win's QW ID and a To Do's
 *     own ID count too, when it looks like an ID: WorkLinks.refOk) are OFFERED with "🔗 Link" (WorkLinks.sameRef), not linked
 *   · a link — "🔗 Link", "🔗 Link to…" or "＋ Linked shadow work", saved as its own small record in the writer's own file
 *     (nobody else's record changes), shown both ways:
 *       { c: 'worklink', id: 'worklink-<by>-<time>', a: <item id>, b: <item id>, team, by, at }
 * Links follow an item when it is converted (Conv.family / Conv.current). The writer (or the super admin) can remove a link. */
'use strict';

const WorkLinks = {
  COLLS: new Set(['shadow', 'todo', 'quickwin']),
  refKey(v) {
    return String(v || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  },
  /* only references that look like an ID link by themselves: at least 3 characters with a number in them (not just zeros),
   * so fillers such as "N/A", "-", "phone", "email" or "0" never join unrelated work */
  refOk(k) {
    return k.length >= 3 && /[1-9]/.test(k);
  },
  refsOf(r) {
    return [
      ...new Set(
        [r.ref, r.c === 'quickwin' ? r.qwId : '', r.c === 'todo' && typeof TodoId !== 'undefined' ? TodoId.key(r) : '']
          .map(WorkLinks.refKey)
          .filter(WorkLinks.refOk)
      ),
    ];
  },
  canSee(r) {
    if (!r) return false;
    if (App.isSuper() || r.analyst === App.me) return true;
    return App.can('viewOthers') && (!App.viewTeam || App.viewTeam === '*' || Store.teamOf(r) === App.viewTeam);
  },
  /* reference → items · item id → hand-made links */
  refIndex() {
    return Calc.memo('wlref', () => {
      const m = new Map();
      for (const c of WorkLinks.COLLS)
        for (const r of Store.byC[c] || []) {
          if (!r || r._del || r.virtual) continue;
          for (const k of WorkLinks.refsOf(r)) {
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(r);
          }
        }
      return m;
    });
  },
  handIndex() {
    return Calc.memo('wlhand', () => {
      const m = new Map();
      const add = (k, l) => {
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(l);
      };
      for (const l of Store.byC.worklink || []) {
        if (!l || l._del || !l.a || !l.b) continue;
        add(l.a, l);
        add(l.b, l);
      }
      return m;
    });
  },
  /* everything linked to r: [{ r, how: 'hand', link }] newest first (links follow conversions: Conv.family / Conv.current) */
  of(r) {
    if (!r || !r.id || !WorkLinks.COLLS.has(r.c)) return [];
    const ids = new Set(typeof Conv !== 'undefined' ? Conv.family(r.id) : [r.id]);
    const out = new Map();
    for (const id of ids)
      for (const l of WorkLinks.handIndex().get(id) || []) {
        const other = typeof Conv !== 'undefined' ? Conv.current(ids.has(l.a) ? l.b : l.a) : Store.get(ids.has(l.a) ? l.b : l.a);
        if (other && !ids.has(other.id) && other.id !== r.id && !out.has(other.id)) out.set(other.id, { r: other, how: 'hand', link: l });
      }
    return [...out.values()]
      .filter(x => WorkLinks.canSee(x.r))
      .sort((a, b) => String(Conv.date(b.r) || '').localeCompare(String(Conv.date(a.r) || '')));
  },
  /* items with the same Reference that are not linked to r — offered, never linked by themselves */
  sameRef(r) {
    if (!r || !r.id || !WorkLinks.COLLS.has(r.c)) return [];
    const ids = new Set(typeof Conv !== 'undefined' ? Conv.family(r.id) : [r.id]);
    const linked = new Set(WorkLinks.of(r).map(x => x.r.id));
    const out = new Map();
    for (const k of WorkLinks.refsOf(r))
      for (const x of WorkLinks.refIndex().get(k) || [])
        if (!ids.has(x.id) && !linked.has(x.id) && !out.has(x.id) && WorkLinks.canSee(x)) out.set(x.id, x);
    return [...out.values()].sort((a, b) => String(Conv.date(b) || '').localeCompare(String(Conv.date(a) || '')));
  },
  /* the same, for a Reference typed in a form that is not saved yet */
  byRef(ref) {
    const k = WorkLinks.refKey(ref);
    return WorkLinks.refOk(k) ? (WorkLinks.refIndex().get(k) || []).filter(WorkLinks.canSee) : [];
  },
  count(r) {
    return WorkLinks.of(r).length;
  },
  tag(r) {
    const n = WorkLinks.count(r);
    return n ? ` <span class="badge" title="Linked to ${n} other item${n > 1 ? 's' : ''}">🔗 ${n}</span>` : '';
  },
  canLink() {
    return !App.preview && !!App.me;
  },
  canRemove(l) {
    return !!l && !App.preview && (l.by === App.me || App.isSuper());
  },
  rec(a, b) {
    if (!a || !b || a.id === b.id) return null;
    const t = Date.now();
    return {
      c: 'worklink',
      id: `worklink-${App.me}-${t.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      a: a.id,
      b: b.id,
      team: a.team || b.team || '',
      by: App.me,
      at: t,
    };
  },
  label(x) {
    return `${Conv.KINDS[x.c] || x.c}${x.c === 'todo' && typeof TodoId !== 'undefined' && TodoId.key(x) ? ' ' + TodoId.key(x) : ''}${x.c === 'quickwin' && x.qwId ? ' ' + x.qwId : ''}`;
  },
  line(x) {
    return [
      Conv.date(x) ? U.fmtDate(Conv.date(x)) : '',
      Store.memberShort(x.analyst),
      x.c === 'shadow' && x.minutes ? x.minutes + ' min' : '',
    ]
      .filter(Boolean)
      .join(' · ');
  },

  /* the section in the item's form */
  box(r) {
    if (!r || !r.id || !WorkLinks.COLLS.has(r.c) || r.virtual) return '';
    const list = WorkLinks.of(r);
    const can = WorkLinks.canLink();
    const same = can ? WorkLinks.sameRef(r) : [];
    if (!list.length && !can) return '';
    const mins = U.sum([r, ...list.map(x => x.r)].filter(x => x.c === 'shadow').map(x => +x.minutes || 0));
    const li = x =>
      `<div class="li"><span class="grow"><a href="#" class="link" data-wlgo="${h(x.r.id)}">${h(WorkLinks.label(x.r))}: ${h(Conv.title(x.r).slice(0, 90))}</a> <span class="muted small">${h(WorkLinks.line(x.r))} · linked by ${h(Store.memberShort(x.link.by) || x.link.by)}</span></span>${WorkLinks.canRemove(x.link) ? `<a href="#" class="link t-bad small" data-wldel="${h(x.link.id)}" title="Remove this link">✕</a>` : ''}</div>`;
    return `<div class="wlinks" id="wlinks"><div class="rn-head">🔗 <b>Linked work</b> <span class="count">${list.length}</span>${mins ? `<span class="muted small"> — shadow time on this: ${U.num(mins / 60, 1)} h</span>` : ''}<span class="grow"></span>${can && App.canEdit('shadow') ? '<button type="button" class="btn xs" data-wlnew>＋ Linked shadow work</button>' : ''}${can ? ' <button type="button" class="btn xs ghost" data-wlpick>🔗 Link to…</button>' : ''}</div>
      ${list.length ? `<div class="li-list">${list.map(li).join('')}</div>` : '<div class="muted small">Nothing linked yet.</div>'}
      ${same.length ? `<div class="wl-same"><div class="small"><b>Same reference — not linked</b> <span class="muted">· link only the ones that belong to the same thing</span>${same.length > 1 ? ' <button type="button" class="btn xs ghost" data-wlrefall>🔗 Link all</button>' : ''}</div><div class="li-list">${same.map(x => `<div class="li"><span class="grow"><a href="#" class="link" data-wlgo="${h(x.id)}">${h(WorkLinks.label(x))}: ${h(Conv.title(x).slice(0, 90))}</a> <span class="muted small">${h(WorkLinks.line(x))}</span></span><button type="button" class="btn xs" data-wlref="${h(x.id)}">🔗 Link</button></div>`).join('')}</div></div>` : ''}</div>`;
  },
  /* leave the form only when nothing typed would be lost */
  leave(w, fn) {
    if (UI.modalDirty(w)) return UI.toast('Save your changes first', 'warn');
    UI.closeModal();
    setTimeout(fn, 0);
  },
  bind(w, rec) {
    const host = w.querySelector('#wlinks');
    if (!host) return;
    host.querySelectorAll('[data-wlgo]').forEach(
      a =>
        (a.onclick = e => {
          e.preventDefault();
          const x = Store.get(a.dataset.wlgo);
          if (x) WorkLinks.leave(w, () => UI.editRecord(x.c, x));
        })
    );
    host.querySelectorAll('[data-wldel]').forEach(
      a =>
        (a.onclick = e => {
          e.preventDefault();
          const l = Store.get(a.dataset.wldel);
          if (!l || !WorkLinks.canRemove(l)) return;
          Store.save(Object.assign({}, l, { _del: true }));
          UI.toast('Link removed', 'good');
          host.outerHTML = WorkLinks.box(Store.get(rec.id) || rec);
          WorkLinks.bind(w, rec);
        })
    );
    const link = xs => {
      const cur = Store.get(rec.id) || rec;
      const l = xs.map(x => WorkLinks.rec(cur, x)).filter(Boolean);
      if (!l.length) return;
      Store.saveMany(l);
      UI.toast(`${l.length} linked`, 'good');
      host.outerHTML = WorkLinks.box(cur);
      WorkLinks.bind(w, rec);
    };
    host.querySelectorAll('[data-wlref]').forEach(
      b =>
        (b.onclick = e => {
          e.preventDefault();
          const x = Store.get(b.dataset.wlref);
          if (x) link([x]);
        })
    );
    const all = host.querySelector('[data-wlrefall]');
    if (all)
      all.onclick = e => {
        e.preventDefault();
        link(WorkLinks.sameRef(Store.get(rec.id) || rec));
      };
    const nw = host.querySelector('[data-wlnew]');
    if (nw) nw.onclick = () => WorkLinks.leave(w, () => WorkLinks.newShadow(Store.get(rec.id) || rec));
    const pk = host.querySelector('[data-wlpick]');
    if (pk) pk.onclick = () => WorkLinks.leave(w, () => WorkLinks.pick(Store.get(rec.id) || rec));
  },
  /* a new shadow work entry for the same thing (same reference), linked to it */
  newShadow(r) {
    const draft = {
      subject: r.c === 'shadow' ? r.subject : Conv.title(r),
      ref: r.ref || (r.c === 'quickwin' ? r.qwId : '') || '',
      analyst: App.me,
      date: U.todayStr(),
    };
    if (r.c === 'shadow') Object.assign(draft, { taskType: r.taskType, source: r.source });
    UI.editRecord('shadow', draft, {
      title: 'New linked shadow work',
      savedMsg: 'Linked shadow work added',
      with: out => {
        if (!out.id) out.id = U.uid('shadow');
        const t = Date.now();
        return [
          {
            c: 'worklink',
            id: `worklink-${App.me}-${t.toString(36)}nw`,
            a: out.id,
            b: r.id,
            team: out.team || r.team || '',
            by: App.me,
            at: t,
          },
        ];
      },
    });
  },
  /* choose items to link by hand: o = { title, exclude: Set of ids, first: ids shown first (same reference), picked: Set,
   * onOk(ids), onCancel() } — used by an item's form (pick) and by Analyst Desk → Log shadow work */
  choose(o) {
    const first = new Set(o.first || []);
    const picked = new Set(o.picked || []);
    const all = [...WorkLinks.COLLS]
      .flatMap(c => Store.byC[c] || [])
      .filter(x => x && !x._del && !x.virtual && !(o.exclude || new Set()).has(x.id) && WorkLinks.canSee(x))
      .sort(
        (a, b) =>
          first.has(b.id) - first.has(a.id) ||
          picked.has(b.id) - picked.has(a.id) ||
          String(Conv.date(b) || '').localeCompare(String(Conv.date(a) || ''))
      );
    const rows = q => {
      q = WorkLinks.refKey(q);
      const l = q
        ? all.filter(x =>
            WorkLinks.refKey(
              `${Conv.title(x)} ${x.ref || ''} ${x.qwId || ''} ${WorkLinks.label(x)} ${Store.memberShort(x.analyst)}`
            ).includes(q)
          )
        : all;
      return (
        l
          .slice(0, 60)
          .map(
            x =>
              `<label class="li check"><input type="checkbox" value="${h(x.id)}" ${picked.has(x.id) ? 'checked' : ''}> <span class="grow"><b>${h(WorkLinks.label(x))}</b>: ${h(Conv.title(x).slice(0, 90))} <span class="muted small">${h(WorkLinks.line(x))}${first.has(x.id) ? ' · <b>same reference</b>' : ''}</span></span></label>`
          )
          .join('') || '<p class="muted small">Nothing found.</p>'
      );
    };
    UI.modal({
      title: o.title || '🔗 Link to…',
      wide: true,
      body: `<p class="muted small">Tick the Shadow work, To Dos or Quick wins that belong to the same thing.${first.size ? ' Items with the same Reference are at the top — they are not linked unless you tick them.' : ''}</p><input type="search" id="wlq" placeholder="Search subject, reference, QW ID, person…" aria-label="Search" style="width:100%"><div class="li-list" id="wllist" style="max-height:50vh;overflow:auto;margin-top:8px">${rows('')}</div>`,
      actions:
        '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Link selected</button>',
      onMount: w => {
        const list = w.querySelector('#wllist');
        list.addEventListener('change', e => {
          if (e.target.type !== 'checkbox') return;
          if (e.target.checked) picked.add(e.target.value);
          else picked.delete(e.target.value);
        });
        w.querySelector('#wlq').addEventListener('input', e => {
          list.innerHTML = rows(e.target.value);
        });
        w.querySelector('[data-c]').onclick = () => {
          UI.closeModal();
          if (o.onCancel) o.onCancel();
        };
        w.querySelector('[data-ok]').onclick = () => {
          UI.closeModal();
          o.onOk([...picked]);
        };
      },
    });
  },
  pick(r) {
    const have = new Set(WorkLinks.of(r).map(x => x.r.id));
    for (const id of Conv.family(r.id)) have.add(id);
    const back = () =>
      setTimeout(() => {
        const x = Store.get(r.id);
        if (x) UI.editRecord(x.c, x);
      }, 0);
    WorkLinks.choose({
      title: '🔗 Link “' + Conv.title(r).slice(0, 50) + '” to…',
      exclude: have,
      first: WorkLinks.sameRef(r).map(x => x.id),
      onCancel: back,
      onOk: ids => {
        const l = ids.map(id => WorkLinks.rec(r, Store.get(id))).filter(Boolean);
        if (l.length) {
          Store.saveMany(l);
          UI.toast(`${l.length} linked`, 'good');
        }
        back();
      },
    });
  },
};
