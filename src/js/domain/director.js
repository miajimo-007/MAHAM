/* MAHAM — Director helpers: "Needs your attention", ask-for-update nudges, escalations, workload, timeline.
 *   nudge { to, from, about (record id), kind: 'update' | 'import' | 'decision', text, at }  — written by the sender only
 *   escalation on a director task / project: { by, note, on, at, answer: { by, note, on } }   — "Needs the director's decision"
 * A nudge disappears by itself when it is answered: the task / project was updated by someone else after it was sent
 * (update), the team imported ManageEngine after it (import), or the manager pressed "Got it" (decision). */
'use strict';

const Dir = {
  /* ---------- nudges ---------- */
  nudge(to, kind, about, text) {
    return Store.save({ id: U.uid('nudge'), c: 'nudge', to, from: App.me, about: about || '', kind, text: text || '', at: Date.now() });
  },
  answered(n) {
    if (n.kind === 'update') {
      const r = Store.db.get(n.about);
      return !r || r._del || (r.updAt || 0) > n.at;
    }
    if (n.kind === 'confirm')
      return !(n.ids || []).some(id => {
        const r = Store.db.get(id);
        return r && !r._del && r.status === 'Ready for review';
      });
    if (n.kind === 'import') {
      const d = (Store.meta(n.about) || {}).helpdeskUpdated;
      return !!d && d >= U.ds(new Date(n.at));
    }
    return !!LS.get('bct.nudgeok.' + n.id, false);
  },
  /* open nudges sent to me (or to a manager I am acting for) */
  forMe() {
    return Store.all('nudge')
      .filter(n => App.forMe(n.to) && !Dir.answered(n))
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  },
  asked(id) {
    return Store.all('nudge').find(n => n.about === id && n.kind === 'update' && n.from === App.me && !Dir.answered(n));
  },
  askUpdate(r) {
    const to = r.manager;
    const what = r.task || r.name;
    UI.modal({
      title: 'Ask for an update',
      body: `<p><b>${h(what)}</b> · ${h(Store.memberShort(to))}</p><form class="grid-form" id="auf">${UI.field({ key: 'text', label: 'Message (optional)', type: 'text', span: 2, placeholder: 'e.g. Where are we with this?' }, '')}</form><p class="muted small">It stays at the top of their desk until they write an update.</p>`,
      actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Send</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          Dir.nudge(to, 'update', r.id, w.querySelector('[name=text]').value.trim());
          UI.closeModal();
          UI.toast(`Asked ${Store.memberShort(to)} for an update`, 'good');
          App.render();
        };
      },
    });
  },
  /* ---------- escalations ---------- */
  escalateDialog(r) {
    UI.modal({
      title: "Needs the director's decision",
      body: `<p><b>${h(r.task || r.name)}</b></p><form class="grid-form" id="esf">${UI.field({ key: 'note', label: 'What do you need decided?', type: 'textarea', span: 2, rows: 3, required: true }, '')}</form>`,
      actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Send to the director</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const note = w.querySelector('[name=note]').value.trim();
          if (!note) return UI.toast('Write what needs deciding', 'bad');
          Store.save(Object.assign({}, Store.get(r.id), { escalation: { by: App.me, note, on: U.todayStr(), at: Date.now() } }));
          UI.closeModal();
          UI.toast('Sent to the director', 'good');
          App.render();
        };
      },
    });
  },
  answerDialog(r) {
    const e = r.escalation || {};
    UI.modal({
      title: 'Decision',
      body: `<p><b>${h(r.task || r.name)}</b></p><p class="muted">${h(Store.memberShort(e.by))} asked (${U.fmtDate(e.on)}): “${h(e.note)}”</p><form class="grid-form" id="adf">${UI.field({ key: 'note', label: 'Your decision', type: 'textarea', span: 2, rows: 3, required: true }, '')}</form>`,
      actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Send decision</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const note = w.querySelector('[name=note]').value.trim();
          if (!note) return UI.toast('Write the decision', 'bad');
          const out = Object.assign({}, Store.get(r.id), {
            escalation: Object.assign({}, e, { answer: { by: App.me, note, on: U.todayStr() } }),
          });
          Store.saveMany([
            out,
            { id: U.uid('nudge'), c: 'nudge', to: e.by, from: App.me, about: r.id, kind: 'decision', text: note, at: Date.now() },
          ]);
          UI.closeModal();
          UI.toast('Decision sent', 'good');
          App.render();
        };
      },
    });
  },
  openEscalations() {
    return [...mineOrAll(Store.all('mgrtask')), ...Scrum.visible()].filter(r => r.escalation && !r.escalation.answer && !r._del);
  },
  /* ---------- workload of a manager: what they have from me ---------- */
  workload(mid) {
    const today = U.todayStr();
    const t = mineOrAll(Store.all('mgrtask'))
      .filter(r => r.manager === mid)
      .map(mtDerive)
      .filter(x => x.open);
    const p = Scrum.visible().filter(r => r.manager === mid && !['Done', 'Canceled'].includes(r.status));
    return { open: t.length, late: t.filter(x => x.r.due && x.r.due < today).length, projects: p.length };
  },
  /* ---------- "Needs your attention" ---------- */
  attention() {
    return Calc.memo('dirAtt|' + U.todayStr(), () => Dir._attention());
  },
  _attention() {
    const today = U.todayStr();
    const out = [];
    const myTeams = App.myTeams();
    const ids = new Set(myTeams.map(t => t.id));
    for (const r of Dir.openEscalations())
      out.push({
        rank: 0,
        icon: '⚑',
        kind: 'Decision needed',
        title: r.task || r.name,
        sub: `${Store.memberShort(r.escalation.by)}: “${r.escalation.note}” · ${U.fmtDate(r.escalation.on)}`,
        btn: `<button class="btn xs primary" data-answer="${h(r.id)}">Decide</button>`,
      });
    for (const p of Flow.pendingForMe())
      out.push({
        rank: 1,
        icon: '✋',
        kind: 'Project approval',
        title: `${p.name} → ${Flow.name(Flow.of(p), p.pending.to)}`,
        sub: `asked by ${Store.memberShort(p.pending.by)}${p.pending.note ? ' · “' + p.pending.note + '”' : ''}`,
        btn: `<a class="btn xs primary" href="#/project/${h(p.id)}">Review</a>`,
      });
    for (const r of Requests.waitingForMe())
      out.push({
        rank: 1,
        icon: '✋',
        kind: 'Approval',
        title: `${Requests.type(r.type).label}${r.title ? ': ' + r.title : ''}`,
        sub: `${Store.memberShort(r.requester)} · ${Requests.when(r).replace(/<[^>]+>/g, '')}${r.reason ? ' · “' + r.reason + '”' : ''}`,
        btn:
          r.status === Requests.ST.CR
            ? `<a class="btn xs primary" href="#/requests/approve">Review</a>`
            : `<button class="btn xs primary" data-rqok="${h(r.id)}">Approve</button> <button class="btn xs ghost" data-rqno="${h(r.id)}">Reject</button>`,
      });
    for (const x of mineOrAll(Store.all('mgrtask'))
      .filter(r => r.manager !== App.me)
      .map(mtDerive)
      .filter(x => x.open && x.late)) {
      const a = Dir.asked(x.r.id);
      out.push({
        rank: 2,
        icon: '⏰',
        kind: 'Overdue task',
        title: x.r.task,
        sub: `${Store.memberShort(x.r.manager)} · due ${U.fmtDate(x.r.due)}${a ? ' · update asked ' + U.fmtDate(U.ds(new Date(a.at))) : ''}`,
        btn: `${a ? '' : `<button class="btn xs" data-askup="${h(x.r.id)}">Ask for update</button> `}<button class="btn xs ghost" data-edit="mgrtask|${h(x.r.id)}">Open</button>`,
      });
    }
    for (const x of Scrum.visible()
      .map(projDerive)
      .filter(x => x.open && ['Overdue', 'Behind'].includes(x.health) && ids.has(Scrum.teamOf(x.r)))) {
      const a = Dir.asked(x.r.id);
      out.push({
        rank: 3,
        icon: '◈',
        kind: 'Project ' + x.health.toLowerCase(),
        title: x.r.name,
        sub: `${Store.memberShort(x.r.manager)} · ${Store.teamName(Scrum.teamOf(x.r))} · ${x.prog}%${x.r.due ? ' · target ' + U.fmtDate(x.r.due) : ''}${a ? ' · update asked' : ''}`,
        btn: `${a ? '' : `<button class="btn xs" data-askup="${h(x.r.id)}">Ask for update</button> `}<a class="btn xs ghost" href="#/project/${h(x.r.id)}">Open</a>`,
      });
    }
    for (const t of myTeams) {
      const mgr = Store.teamManager(t.id);
      if (!mgr) continue;
      const away = Store.all('request', '*').find(
        r =>
          r.requester === mgr.id &&
          Requests.isDone(r) &&
          Requests.type(r.type).attendance &&
          Requests.type(r.type).kind === 'days' &&
          r.from <= today &&
          (r.to || r.from) >= today
      );
      if (away && !Store.delegationOf(mgr.id))
        out.push({
          rank: 4,
          icon: '🌴',
          kind: 'Manager on leave',
          title: `${mgr.name} (${t.name}) — nobody acting`,
          sub: `on leave until ${U.fmtDate(away.to || away.from)} · ask the administrator to set an acting manager`,
          btn: `<a class="btn xs ghost" href="#/manager" data-deskteam="${h(t.id)}">Open team desk</a>`,
        });
      const d = Store.meta(t.id).helpdeskUpdated;
      const hasHd = Store.all('helpdesk', t.id).length > 0;
      if (hasHd && (!d || d < U.addDays(today, -2))) {
        const asked = Store.all('nudge').some(n => n.kind === 'import' && n.about === t.id && n.from === App.me && !Dir.answered(n));
        out.push({
          rank: 5,
          icon: '⇪',
          kind: 'ManageEngine',
          title: `${t.name} — not imported ${d ? 'since ' + U.fmtDate(d) : 'yet'}`,
          sub: `manager: ${mgr.name}`,
          btn: asked
            ? '<span class="muted small">reminder sent</span>'
            : `<button class="btn xs" data-askimport="${h(t.id)}">Remind</button>`,
        });
      }
    }
    return out.sort((a, b) => a.rank - b.rank);
  },
  attentionCard() {
    const l = Dir.attention();
    return card(
      `Needs your attention <span class="count">${l.length}</span>`,
      l.length
        ? l
            .map(
              x =>
                `<div class="li att-item"><span class="att-ic">${x.icon}</span><div class="grow"><span class="muted small">${h(x.kind)}</span><div><b>${h(x.title)}</b></div><div class="muted small">${h(x.sub)}</div></div><span class="nw">${x.btn}</span></div>`
            )
            .join('')
        : empty('Nothing needs you right now. ✓')
    );
  },
  bind(root) {
    root.querySelectorAll('[data-askup]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          const r = Store.get(b.dataset.askup);
          if (r) Dir.askUpdate(r);
        })
    );
    root.querySelectorAll('[data-answer]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          const r = Store.get(b.dataset.answer);
          if (r) Dir.answerDialog(r);
        })
    );
    root.querySelectorAll('[data-askimport]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          const t = b.dataset.askimport;
          const m = Store.teamManager(t);
          if (m) {
            Dir.nudge(m.id, 'import', t, `Please import today's ManageEngine report for ${Store.teamName(t)}`);
            UI.toast('Reminder sent', 'good');
            App.render();
          }
        })
    );
    root.querySelectorAll('[data-deskteam]').forEach(a => a.addEventListener('click', () => App.setViewTeam(a.dataset.deskteam)));
    root.querySelectorAll('[data-escalate]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          const r = Store.get(b.dataset.escalate);
          if (r) Dir.escalateDialog(r);
        })
    );
    root.querySelectorAll('[data-nudgeok]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          LS.set('bct.nudgeok.' + b.dataset.nudgeok, true);
          App.render();
        })
    );
  },
  /* banner on the manager's desk: what the director asked for */
  nudgeBanner() {
    const l = Dir.forMe();
    if (!l.length) return '';
    return l
      .map(n => {
        const r = Store.get(n.about);
        const what = r ? r.task || r.name || '' : Store.teamName(n.about);
        const btn =
          n.kind === 'update' && r
            ? r.c === 'project'
              ? `<a class="btn sm primary" href="#/project/${h(r.id)}">Write an update</a>`
              : `<button class="btn sm primary" data-edit="${h(r.c)}|${h(r.id)}">Write an update</button>`
            : n.kind === 'import'
              ? '<a class="btn sm primary" href="#/helpdesk/import">Import now</a>'
              : n.kind === 'confirm'
                ? '<a class="btn sm primary" href="#/home">Review now</a>'
                : `<button class="btn sm" data-nudgeok="${h(n.id)}">Got it</button>`;
        return `<div class="insights ${n.kind === 'decision' ? '' : 'warnbox'}"><div>${n.kind === 'decision' ? `⚑ <b>${h(Store.memberShort(n.from))} decided</b> on “${h(what)}”: ${h(n.text)}` : n.kind === 'import' ? `⇪ <b>${h(Store.memberShort(n.from))} asked you to import ManageEngine</b> for ${h(what)}` : n.kind === 'confirm' ? `✓ <b>${h(Store.memberShort(n.from))} asked you to confirm finished To Dos</b>${n.text ? ': ' + h(n.text) : ''}` : `💬 <b>${h(Store.memberShort(n.from))} asked for an update</b> on “${h(what)}”${n.text ? ': ' + h(n.text) : ''}`} <span class="muted small">${U.fmtTs(n.at)}</span></div><div class="row-btns tight">${btn}</div></div>`;
      })
      .join('');
  },
  /* ---------- project timeline ---------- */
  timeline() {
    const today = U.todayStr();
    const ps = Scrum.visible()
      .filter(p => p.status !== 'Canceled' && (p.status !== 'Done' || (p.doneDate || p.updatedOn || '') >= U.addDays(today, -30)))
      .map(projDerive);
    if (!ps.length) return empty('No projects.');
    const st = x => x.r.start || U.ds(new Date(x.r._ts || Date.now()));
    const en = x => x.r.due || U.addDays(st(x), 30);
    let lo = ps.map(st).sort()[0],
      hi = ps.map(en).sort().pop();
    lo = lo < U.addDays(today, -90) ? U.addDays(today, -90) : lo;
    if (lo > U.addDays(today, -14)) lo = U.addDays(today, -14);
    hi = hi > U.addDays(today, 365) ? U.addDays(today, 365) : hi;
    if (hi < U.addDays(today, 30)) hi = U.addDays(today, 30);
    const span = U.diffDays(lo, hi) || 1;
    const pos = d => Math.max(0, Math.min(100, (100 * U.diffDays(lo, d < lo ? lo : d > hi ? hi : d)) / span));
    const months = [];
    for (let d = lo.slice(0, 8) + '01'; d <= hi; d = U.addDays(d.slice(0, 8) + '28', 4).slice(0, 8) + '01') if (d >= lo) months.push(d);
    const col = hl => ({ Overdue: '#dc2626', Behind: '#d97706', 'On hold': '#94a3b8', Done: '#16a34a' })[hl] || '#0f766e';
    const groups = U.groupBy(
      ps.sort((a, b) => st(a).localeCompare(st(b))),
      x => Scrum.teamOf(x.r)
    );
    return `<div class="tl"><div class="tl-head"><div class="tl-lab"></div><div class="tl-track">${months.map(m => `<span class="tl-m" style="left:${pos(m)}%">${U.MONTHS[+m.slice(5, 7) - 1]}${m.slice(5, 7) === '01' ? ' ' + m.slice(0, 4) : ''}</span>`).join('')}<span class="tl-today" style="left:${pos(today)}%"><b>today</b></span></div></div>
      ${[...groups].map(([t, l]) => `<div class="tl-team">${h(Store.teamName(t))}</div>${l.map(x => `<div class="tl-row click" data-proj="${h(x.r.id)}"><div class="tl-lab"><b>${h(x.r.name)}</b><span class="muted small">${h(Store.memberShort(x.r.manager))} · ${x.prog}%</span></div><div class="tl-track"><span class="tl-today" style="left:${pos(today)}%"></span><span class="tl-bar" title="${h(U.fmtDate(st(x)) + ' → ' + (x.r.due ? U.fmtDate(x.r.due) : 'no target'))} · ${h(x.health)}" style="left:${pos(st(x))}%;width:${Math.max(1.5, pos(en(x)) - pos(st(x)))}%;background:${col(x.health)}${x.r.due ? '' : ';opacity:.45'}"><span class="tl-prog" style="width:${x.prog}%"></span></span></div></div>`).join('')}`).join('')}
      <p class="muted small">Bar = start → target date (faded = no target date), coloured by health; the darker part is progress. Click a project to open it.</p></div>`;
  },
};
