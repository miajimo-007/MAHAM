/* MAHAM — Admin → Time rules & holidays (super admin, or an Admin with "Time rules" — own team or all teams),
 * and where late work shows: Manager Desk (N working days late) and Director Desk (M days). Rules: domain/timerules.js */
'use strict';

const TimeRulesUI = {
  scope: '', // '' = department default, else a team id
  canDept() {
    return App.realSuper() || AdminRole.can(App.me, 'timerules', '*');
  },
  scopes() {
    const teams = App.realSuper() ? Store.teams().map(t => t.id) : AdminRole.teamsOf(App.me);
    return (TimeRulesUI.canDept() ? [['', 'Department default (every team)']] : []).concat(teams.map(t => [t, Store.teamName(t)]));
  },
  current(scope) {
    const rec = Store.get(scope ? 'settings-timerules-' + scope : 'settings-timerules');
    return TimeRules.merge(scope ? TimeRules.pickAt(Store.get('settings-timerules'), U.todayStr()) : null, rec && rec.rules);
  },
  lines(obj) {
    return Object.entries(obj || {})
      .map(([k, v]) => `${k} = ${v}`)
      .join('\n');
  },
  parseLines(txt) {
    const o = {};
    for (const l of String(txt || '').split('\n')) {
      const m = l.split('=');
      if (m.length >= 2 && m[0].trim() && m.slice(1).join('=').trim() !== '' && !isNaN(+m.slice(1).join('=')))
        o[m[0].trim()] = +m.slice(1).join('=');
    }
    return o;
  },
  page() {
    const sc = TimeRulesUI.scopes();
    if (!sc.length) return { html: empty('You have no team to set time rules for.') };
    if (!sc.some(x => x[0] === TimeRulesUI.scope)) TimeRulesUI.scope = sc.some(x => x[0] === App.viewTeam) ? App.viewTeam : sc[0][0];
    const s = TimeRulesUI.scope;
    const R = TimeRulesUI.current(s);
    const rec = Store.get(s ? 'settings-timerules-' + s : 'settings-timerules');
    const n = (k, l, v, hint) =>
      UI.field({ key: k, label: l, type: 'number', min: 0, step: k.includes('Hrs') || k.includes('Pct') ? 0.5 : 1, hint }, v);
    const types = typeof TodoFlow !== 'undefined' ? TodoFlow.types() : [];
    const hol = Store.get('settings-holidays') || {};
    const rm = hol.ramadan || {};
    const html = `<div class="page-actions"><label class="flt"><span>Rules for</span><select id="trscope">${sc.map(([v, l]) => `<option value="${h(v)}" ${v === s ? 'selected' : ''}>${h(l)}</option>`).join('')}</select></label><span class="grow"></span>
        <span class="muted small">${rec && rec.from ? `In force since ${U.fmtDate(rec.from)} · ${(rec.history || []).length} earlier version(s) still apply to older work` : s ? 'Uses the department default until saved' : 'Built-in defaults until saved'}</span></div>
      <div class="insights"><div>A change applies from <b>today</b>: work given before keeps the rule it had, so past scores never move. ${R.workingDays ? "Days are <b>working days</b> — the weekend, public holidays, the person's approved leave and confirmed holds are not counted." : 'Days are calendar days (leave and holds still pause the clock).'}</div></div>
      <form id="trf"><div class="cols2"><div>
      ${card(
        'To Do',
        `<div class="grid-form">${UI.field({ key: 'workingDays', label: 'Count working days only', type: 'bool', checkLabel: 'Working days (skip weekend and holidays)' }, R.workingDays)}<div></div>
        ${TimeRules.PRIORITIES.map(p => n('p_' + p, `Due in — ${p} priority`, (R.todo.byPriority || {})[p] ?? '')).join('')}
        ${n('t_grace', 'Grace days before “Delayed”', R.todo.grace)}${n('t_soon', '“Due soon” warning (days before)', R.todo.dueSoon)}
        ${UI.field(
          {
            key: 't_types',
            label: 'Due in by To Do type (optional) — one per line: Type = days',
            type: 'textarea',
            span: 2,
            rows: 3,
            placeholder: types.length
              ? types
                  .slice(0, 2)
                  .map(t => t + ' = 3')
                  .join('\n')
              : 'Access request = 2',
          },
          TimeRulesUI.lines(R.todo.byType)
        )}</div>
        <p class="muted small">Used as the starting “Due in (days)” when a manager gives a To Do — they can still change it (with a reason, kept in its history).</p>`
      )}
      ${card(
        'Help desk',
        `<div class="grid-form">${n('h_closeHrs', 'Closing target (hours)', R.helpdesk.closingHrs, 'Shown as the target; scoring tiers stay in Scoring')}${n('h_longHrs', 'Late after (hours open)', R.helpdesk.longHrs)}
        ${UI.field({ key: 'h_cats', label: 'Late after, by category (optional) — Category = hours', type: 'textarea', span: 2, rows: 3, placeholder: 'Network = 4' }, TimeRulesUI.lines(R.helpdesk.byCategory))}</div>`
      )}
      ${card('Requests (leave, permission …)', `<div class="grid-form">${n('r_days', 'Days to decide', R.requests.approveDays)}</div>`)}
      </div><div>
      ${card('Project tasks', `<div class="grid-form">${n('k_grace', 'Grace days after the due date', R.ptask.grace)}<div></div>${n('k_pct', 'Project at risk: % of tasks late', R.ptask.riskLatePct)}${n('k_left', '…or working days to its due date (with work left)', R.ptask.riskDaysLeft)}</div>`)}
      ${card('Follow-ups and quick wins', `<div class="grid-form">${n('s_fu', 'Follow-up stuck after (days)', R.stuck.followup)}${n('s_qw', 'Quick win stuck after (days)', R.stuck.quickwin)}</div><p class="muted small">External follow-ups — working days since the last chase or move:</p><div class="grid-form">${n('ry_a', 'Need analyst follow-up after', R.central.analyst)}${n('ry_l', 'Need team leader follow-up after', R.central.leader)}${n('ry_m', 'Need manager follow-up after', R.central.manager)}${n('ry_c', 'Next chase after (working days)', R.central.chase)}</div>`)}
      ${card(
        'Escalation',
        `<div class="grid-form">${n('e_mgr', 'On the Manager Desk at (days late)', R.escalate.manager)}${n('e_dir', 'On the Director Desk at (days late)', R.escalate.director)}</div><p class="muted small">Counted after the grace days, in working days, from the item's <b>last update</b> (any note, status change or edit restarts the clock). Only work opened after the time rules started counts.</p>
        <div class="fld"><label>Show on the desks</label><div class="row-btns wrap">${TimeRules.KINDS.map(([k, l]) => `<label class="check chip-check"><input type="checkbox" data-show="${k}" ${!R.show || R.show[k] !== false ? 'checked' : ''}> ${h(l)}</label>`).join('')}</div><p class="muted small">Untick what your team cannot act on (e.g. follow-ups waiting on another party).</p></div>`
      )}
      </div></div>
      <div class="row-btns"><button type="button" class="btn" id="trprev">Preview the effect</button><span class="grow"></span><button type="button" class="btn primary" id="trsave">Save time rules${s ? ' for ' + h(Store.teamName(s)) : ' (department default)'}</button></div><div id="trout"></div></form>
      ${
        App.realSuper() || AdminRole.sees('holidays')
          ? card(
              `Public holidays and Ramadan <span class="count">${(hol.list || []).length}</span>`,
              `<p class="muted small">Holidays are days off for everyone (with the weekend: ${h(Custom.weekendName())}). During Ramadan the help desk hour targets stretch by normal ÷ Ramadan hours.</p>
        <textarea id="trhol" rows="6" style="width:100%" placeholder="2026-12-18 = National Day&#10;2027-03-20 to 2027-03-23 = Eid al-Fitr">${h((hol.list || []).map(x => `${x.from}${x.to && x.to !== x.from ? ' to ' + x.to : ''} = ${x.name || 'Holiday'}`).join('\n'))}</textarea>
        <div class="grid-form">${UI.field({ key: 'rm_from', label: 'Ramadan from', type: 'date' }, rm.from || '')}${UI.field({ key: 'rm_to', label: 'Ramadan to', type: 'date' }, rm.to || '')}${UI.field({ key: 'rm_norm', label: 'Normal working hours / day', type: 'number', step: 0.5 }, rm.normal || 8)}${UI.field({ key: 'rm_hrs', label: 'Ramadan working hours / day', type: 'number', step: 0.5 }, rm.hours || 6)}</div>
        <div class="row-btns"><span class="grow"></span><button class="btn primary" id="trholsave">Save holidays and Ramadan</button></div>`
            )
          : ''
      }`;
    return {
      html,
      mount(root) {
        root.querySelector('#trscope').onchange = e => {
          TimeRulesUI.scope = e.target.value;
          App.render(true);
        };
        const read = () => {
          const f = root.querySelector('#trf');
          const v = k => {
            const i = f.querySelector(`[name=${k}]`);
            return i ? (i.type === 'checkbox' ? i.checked : i.value) : '';
          };
          const num = k => +v(k) || 0;
          const byP = {};
          for (const p of TimeRules.PRIORITIES) byP[p] = num('p_' + p);
          return {
            workingDays: !!v('workingDays'),
            todo: { byPriority: byP, byType: TimeRulesUI.parseLines(v('t_types')), grace: num('t_grace'), dueSoon: num('t_soon') },
            helpdesk: { closingHrs: num('h_closeHrs'), longHrs: num('h_longHrs'), byCategory: TimeRulesUI.parseLines(v('h_cats')) },
            requests: { approveDays: num('r_days') },
            ptask: { grace: num('k_grace'), riskLatePct: num('k_pct'), riskDaysLeft: num('k_left') },
            stuck: { followup: num('s_fu'), quickwin: num('s_qw') },
            central: {
              analyst: num('ry_a'),
              leader: Math.max(num('ry_l'), num('ry_a')),
              manager: Math.max(num('ry_m'), num('ry_l'), num('ry_a')),
              chase: Math.max(1, num('ry_c')),
            },
            escalate: { manager: num('e_mgr'), director: Math.max(num('e_dir'), num('e_mgr')) },
            show: Object.fromEntries([...root.querySelectorAll('[data-show]')].map(i => [i.dataset.show, i.checked])),
          };
        };
        root.querySelector('#trsave').onclick = () => {
          const rec = TimeRules.recordFor(s, read());
          Store.save(rec);
          UI.toast(`Time rules saved${s ? ' for ' + Store.teamName(s) : ''} — they apply from today`, 'good');
          App.render(true);
        };
        root.querySelector('#trprev').onclick = () => {
          root.querySelector('#trout').innerHTML = TimeRulesUI.preview(s, read());
        };
        const hs = root.querySelector('#trholsave');
        if (hs)
          hs.onclick = () => {
            const list = [];
            for (const l of root.querySelector('#trhol').value.split('\n')) {
              const m = l.match(/^\s*(\d{4}-\d{2}-\d{2})(?:\s*(?:to|-|→)\s*(\d{4}-\d{2}-\d{2}))?\s*(?:=\s*(.*))?$/);
              if (m) list.push({ from: m[1], to: m[2] || m[1], name: (m[3] || 'Holiday').trim() });
            }
            const g = k => root.querySelector(`[name=${k}]`).value;
            Store.save(
              Object.assign({}, Store.get('settings-holidays') || { id: 'settings-holidays', c: 'settings' }, {
                list,
                ramadan: g('rm_from')
                  ? { from: g('rm_from'), to: g('rm_to') || g('rm_from'), normal: +g('rm_norm') || 8, hours: +g('rm_hrs') || 6 }
                  : null,
              })
            );
            UI.toast(`${list.length} holiday(s) saved`, 'good');
            App.render(true);
          };
      },
    };
  },
  /* what would change this month: To Dos given today onwards follow the new rule; the preview shows this month's work under it */
  preview(scope, rules) {
    const teams = scope ? [scope] : Store.teams().map(t => t.id);
    const ym = U.todayStr().slice(0, 7);
    const todos = Store.all('todo', '*').filter(
      t => !t.virtual && t.status !== 'Canceled' && t.task && (t.assigned || '').slice(0, 7) === ym && teams.includes(TodoTime.team(t))
    );
    const count = () => {
      let late = 0;
      for (const t of todos) {
        const d = Calc.todoDerive(Object.assign({}, t, { assigned: t.assigned < TimeRules.START ? TimeRules.START : t.assigned }));
        if (d.timing === 'Delayed') late++;
      }
      return late;
    };
    const id = scope ? 'settings-timerules-' + scope : 'settings-timerules';
    const keep = Store.db.get(id);
    const before = count();
    Store.db.set(id, Object.assign({ id, c: 'settings' }, keep || {}, { rules: rules, from: TimeRules.START, history: [] }));
    Store.ver = (Store.ver || 0) + 1;
    Calc.invalidate();
    const after = count();
    if (keep) Store.db.set(id, keep);
    else Store.db.delete(id);
    Store.ver++;
    Calc.invalidate();
    const lateNow = TimeRules.lateItems(teams).length;
    return `<div class="insights ${after > before ? 'warnbox' : 'goodbox'}"><div>This month's To Dos (${todos.length}): <b>${before}</b> late with the current rules → <b>${after}</b> with these. ${after > before ? `${after - before} more would count as delayed.` : after < before ? `${before - after} fewer would count as delayed.` : 'No change.'} · Late work on desks right now: ${lateNow}.</div></div>`;
  },
  /* ---------- where late work shows ---------- */
  deskTeams(level) {
    return App.isSuper()
      ? Store.teams().map(t => t.id)
      : level === 'director'
        ? (Store.teamsFor(App.me) || []).map(t => t.id)
        : (Store.teamsFor(App.me) || []).map(t => t.id).filter(t => t === App.viewTeam || !App.viewTeam);
  },
  /* late work, grouped by kind and folded; "Seen — remind me in 7 days" hides an item for you for a week */
  deskCard(level) {
    const items = TimeRules.lateItems(TimeRulesUI.deskTeams(level)).filter(x => (level === 'director' ? x.level === 'director' : true));
    if (!items.length) return '';
    const kinds = [...new Set(items.map(x => x.kind))];
    const byTeam = {};
    for (const x of items) byTeam[x.team] = (byTeam[x.team] || 0) + 1;
    const row = x =>
      `<div class="li ${x.edit || x.proj ? 'click' : ''}" ${x.edit ? `data-edit="${h(x.edit)}"` : x.proj ? `data-proj="${h(x.proj)}"` : ''}><div class="grow"><b>${h(x.title)}</b><div class="muted small">${h(Store.memberShort(x.who) || '')} · ${x.days} working day${x.days > 1 ? 's' : ''} without a move${level === 'director' ? ' · ' + h(Store.teamName(x.team)) : ''}</div></div>${x.level === 'director' ? UI.badge('escalated', 'bad') : ''}<button class="btn xs ghost" data-lseen="${h(x.id)}" title="Hide it from your desk for 7 days">Seen · 7 days</button></div>`;
    return card(
      `⏰ Late work <span class="count">${items.length}</span>`,
      `<p class="small">${kinds.map(k => `<b>${h(k)}</b> ${items.filter(x => x.kind === k).length}`).join(' · ')}${
        level === 'director'
          ? ` <span class="muted">— ${Object.entries(byTeam)
              .map(([t, n]) => `${h(Store.teamName(t))} ${n}`)
              .join(', ')}</span>`
          : ''
      }</p>
      ${kinds
        .map(k => {
          const l = items.filter(x => x.kind === k);
          return `<details class="late-grp"><summary><b>${h(k)}</b> <span class="count">${l.length}</span></summary>${l.slice(0, 25).map(row).join('')}${l.length > 25 ? `<p class="muted small">…and ${l.length - 25} more</p>` : ''}</details>`;
        })
        .join('')}`
    );
  },
  /* projects at risk (time rules: share of late tasks, or close to the due date with work left) */
  riskCard() {
    if (typeof Scrum === 'undefined') return '';
    const mine = new Set((Store.teamsFor(App.me) || []).map(t => t.id).filter(t => t === App.viewTeam || !App.viewTeam));
    const l = Store.all('project', '*')
      .filter(p => mine.has(p.team || 'apps') && !['Done', 'Canceled'].includes(p.status))
      .map(p => ({ p, why: TimeRules.projectRisk(p) }))
      .filter(x => x.why.length);
    return l.length
      ? card(
          `⚠ Projects at risk <span class="count">${l.length}</span>`,
          l
            .map(
              x =>
                `<div class="li click" data-proj="${h(x.p.id)}"><div class="grow"><b>${h(x.p.name)}</b><div class="muted small">${h(x.why.join(' · '))}</div></div>${UI.badge('at risk', 'warn')}</div>`
            )
            .join('')
        )
      : '';
  },
  /* project tasks in my team's projects that cannot be scored (no due date or no story points) */
  missingPts() {
    if (typeof Scrum === 'undefined') return [];
    const mine = new Set((Store.teamsFor(App.me) || []).map(t => t.id).filter(t => t === App.viewTeam || !App.viewTeam));
    return Store.all('ptask', '*').filter(
      t =>
        !Scrum.isDone(t) &&
        t.status !== 'Canceled' &&
        t.assignee &&
        (!t.due || !(+t.points > 0)) &&
        (p => p && mine.has(p.team || 'apps'))(Scrum.proj(t.project))
    );
  },
  waitingCard() {
    const w = TodoTime.waiting();
    const n = w.holds.length + w.asks.length;
    if (!n) return '';
    return card(
      `⏸ Holds and time asks <span class="count">${n}</span>`,
      w.holds
        .map(x => {
          const t = Store.get(x.todo) || {};
          return `<div class="li"><div class="grow click" data-edit="todo|${h(x.todo)}"><b>${h(t.task || '')}</b><div class="muted small">${h(Store.memberShort(x.by))} — on hold: “${h(x.reason || '')}”</div></div><button class="btn xs primary" data-dhok="${h(x.id)}">Confirm hold</button> <button class="btn xs ghost" data-dhno="${h(x.id)}">Decline</button></div>`;
        })
        .join('') +
        w.asks
          .map(x => {
            const t = Store.get(x.todo) || {};
            return `<div class="li"><div class="grow click" data-edit="todo|${h(x.todo)}"><b>${h(t.task || '')}</b><div class="muted small">${h(Store.memberShort(x.by))} — ${x.days} more day(s): “${h(x.reason || '')}”</div></div><button class="btn xs primary" data-dxok="${h(x.id)}">Approve</button> <button class="btn xs ghost" data-dxno="${h(x.id)}">Decline</button></div>`;
          })
          .join('')
    );
  },
  bindDesk(root) {
    const go = (sel, fn) =>
      root.querySelectorAll(sel).forEach(
        b =>
          (b.onclick = e => {
            e.stopPropagation();
            fn(b);
            App.render(true);
          })
      );
    go('[data-lseen]', b => {
      TimeRules.snooze(b.dataset.lseen, 7);
      UI.toast('Hidden for 7 days', 'good');
    });
    go('[data-dhok]', b => TodoTime.decideHold(Store.get(b.dataset.dhok), true));
    go('[data-dhno]', b => TodoTime.decideHold(Store.get(b.dataset.dhno), false));
    go('[data-dxok]', b => TodoTime.decideAsk(Store.get(b.dataset.dxok), true));
    go('[data-dxno]', b => TodoTime.decideAsk(Store.get(b.dataset.dxno), false));
  },
};

(function () {
  if (P.manager) {
    const base = P.manager;
    P.manager = function () {
      const out = base.apply(this, arguments);
      if (!out || !out.html) return out;
      const w = TodoTime.waiting();
      const late = TimeRulesUI.deskCard('manager') + TimeRulesUI.riskCard();
      const wait = TimeRulesUI.waitingCard();
      // Manager Desk sections (2026.11.13.3): holds / time asks are decisions; late work, projects at risk and project
      // tasks that cannot be scored go under Watch
      const miss = TimeRulesUI.missingPts().length;
      out.html = deskPut(out.html, 'need', wait);
      out.html = deskPut(
        out.html,
        'watch',
        late +
          (miss
            ? `<div class="oneline">⚠ <b>${miss}</b> project task${miss === 1 ? '' : 's'} missing a due date or story points — they cannot be scored. <a class="link" href="#/projects">Projects →</a></div>`
            : '')
      );
      const m0 = out.mount;
      out.mount = root => {
        if (m0) m0(root);
        TimeRulesUI.bindDesk(root);
      };
      return out;
    };
  }
  if (P.director) {
    const base = P.director;
    P.director = function () {
      const out = base.apply(this, arguments);
      if (!out || !out.html) return out;
      out.html = deskPut(out.html, 'watch', TimeRulesUI.deskCard('director')); // Director Desk → Watch (2026.11.13.4)
      const m0 = out.mount;
      out.mount = root => {
        if (m0) m0(root);
        TimeRulesUI.bindDesk(root);
      };
      return out;
    };
  }
})();
