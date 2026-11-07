/* MAHAM — Project management views: overview (charter, health, phases & milestones), timeline (Gantt,
 * drag to reschedule), risks / issues / decisions / actions, weekly status updates with a printable report. */
'use strict';

const PMV = {
  /* ---------- Overview ---------- */
  overview(p, ctx) {
    const { plan, canAdd, items, prog } = ctx;
    const today = U.todayStr();
    const hl = PM.health(p);
    const [ic, txt] = PM.RAG[hl.k];
    const nm = PM.nextMilestone(p.id);
    const hi = PM.openHigh(p.id);
    const openR = PM.raid(p.id).filter(r => r.status !== 'Closed' && (r.kind === 'Risk' || r.kind === 'Issue'));
    const late = items.filter(t => t.due && !Scrum.isDone(t) && t.due < today).length;
    const u = PM.latest(p.id);
    const ch = (lab, v) =>
      v
        ? `<div class="pm-ch"><div class="muted small">${lab}</div><div class="info-val">${h(Array.isArray(v) ? v.join(', ') : v)}</div></div>`
        : '';
    const charter = [
      ch('Goal', p.goal),
      ch('Scope', p.description),
      ch('Out of scope', p.outScope),
      ch('Success criteria', p.success),
      ch('Sponsor', p.sponsor),
    ].join('');
    return `<div class="kpis k4">${UI.kpi('Health', `${ic} ${txt}`, h(hl.from), { green: 'sc-a', amber: 'sc-c', red: 'sc-e' }[hl.k])}${UI.kpi('Progress', prog + '%', `${items.filter(t => Scrum.isDone(t)).length} of ${items.length} tasks done`)}${UI.kpi('Next milestone', nm ? h(nm.name) : '–', nm ? (PM.late(nm) ? '<b class="t-bad">late</b> · ' : '') + U.fmtDate(nm.end) : '')}${UI.kpi('Open risks & issues', openR.length, `${hi.length} high${late ? ` · ${late} task${late === 1 ? '' : 's'} overdue` : ''}`, hi.length ? 'sc-e' : '')}</div>
    <div class="cols2"><div>
      ${PM2V.closeoutCard(p)}
      ${card('Charter', charter || empty(plan ? 'No charter yet — click "Edit project" and fill in the goal, scope, success criteria and sponsor.' : 'No charter yet.'))}
      ${card(`Latest status update${u ? ' · ' + U.fmtDate(u.date) : ''}`, u ? PMV.updateBody(u) : empty('No status update yet.'), canAdd ? '<a href="#" class="link" data-pmupd>＋ Weekly update</a>' : '')}
    </div><div>
      ${card('Phases & milestones', PMV.phaseList(p, plan), plan ? '<a href="#" class="link" data-pmph="phase">＋ Phase</a> · <a href="#" class="link" data-pmph="milestone">＋ Milestone</a>' : '')}
      ${PM2V.slipCard(p)}
      ${PM2V.lessonsCard(p)}
      ${hi.length ? card(`High risks & issues <span class="count">${hi.length}</span>`, hi.map(PMV.raidRow).join('')) : ''}
    </div></div>`;
  },
  phaseList(p, plan) {
    const ph = PM.phases(p.id);
    if (!ph.length)
      return empty(
        plan
          ? 'No phases yet. Split the work into phases (e.g. Design, Build, Test, Go-live) and add the key dates as milestones.'
          : 'No phases yet.'
      );
    return ph
      .map(x => {
        const late = PM.late(x);
        const st = x.status === 'Done' ? 'good' : late ? 'bad' : x.status === 'In progress' ? 'warn' : '';
        return `<div class="li click" data-edit="pphase|${h(x.id)}"><span class="pm-ic">${x.kind === 'milestone' ? '◆' : '▬'}</span><div class="grow"><b>${h(x.name)}</b><div class="muted small">${x.kind === 'milestone' ? U.fmtDate(x.end) : `${x.start ? U.fmtDate(x.start) : '?'} → ${U.fmtDate(x.end)}`}${x.doneOn ? ' · finished ' + U.fmtDate(x.doneOn) : ''}${(d => (d > 0 ? ` · <span class="t-bad">+${d} days vs baseline</span>` : ''))(PM2.slip(p, x))}</div></div>${UI.badge(late ? 'Late' : x.status, st)}</div>`;
      })
      .join('');
  },
  /* ---------- Timeline (Gantt) ---------- */
  timeline(p, ctx) {
    const { plan, items } = ctx;
    const sp = PM.span(p);
    const today = U.todayStr();
    const pos = d => ((100 * U.diffDays(sp.from, d)) / sp.days).toFixed(3) + '%';
    const wid = (a, b) => ((100 * Math.max(1, U.diffDays(a, b) + 1)) / sp.days).toFixed(3) + '%';
    const months = [];
    {
      let d = U.pd(sp.from);
      d = new Date(d.getFullYear(), d.getMonth(), 1);
      while (U.ds(d) <= sp.to) {
        const s = U.ds(d);
        months.push(s < sp.from ? sp.from : s);
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      }
    }
    const weeks = [];
    {
      let d = sp.from;
      while (d <= sp.to) {
        if (U.pd(d).getDay() === 0) weeks.push(d);
        d = U.addDays(d, 1);
      }
    }
    const head = `<div class="g-row g-head"><div class="g-lab"></div><div class="g-track">${months.map(m => `<span class="g-mon" style="left:${pos(m)}">${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][U.pd(m).getMonth()]} ${m.slice(2, 4)}</span>`).join('')}</div></div>`;
    const grid = `${weeks.map(w => `<span class="g-wk" style="left:${pos(w)}"></span>`).join('')}${today >= sp.from && today <= sp.to ? `<span class="g-today" style="left:${pos(today)}" title="Today"></span>` : ''}`;
    const bl = PM2.baseline(p);
    const ghost = r => {
      const x = bl && bl.items[r.id];
      if (!x || !x.e) return '';
      const a = x.s || x.e;
      return r.kind === 'milestone'
        ? `<span class="g-ms base" style="left:${pos(x.e)}" title="Baseline ${U.fmtDate(x.e)}"></span>`
        : `<div class="g-base" style="left:${pos(a)};width:${wid(a, x.e)}" title="Baseline ${U.fmtDate(a)} → ${U.fmtDate(x.e)}"></div>`;
    };
    const bar = (coll, r, a, b, cls, label, can) =>
      ghost(r) +
      `<div class="g-bar ${cls}" style="left:${pos(a)};width:${wid(a, b)}" title="${h(label)} · ${U.fmtDate(a)} → ${U.fmtDate(b)}" ${can ? `data-gbar="${coll}|${h(r.id)}"` : ''}>${can ? '<i class="g-grip"></i>' : ''}</div>`;
    const rows = [];
    for (const x of PM.phases(p.id)) {
      if (x.kind === 'milestone')
        rows.push(
          `<div class="g-row"><div class="g-lab click" data-edit="pphase|${h(x.id)}">◆ <b>${h(x.name)}</b></div><div class="g-track">${grid}${ghost(x)}${x.end ? `<span class="g-ms ${x.status === 'Done' ? 'done' : PM.late(x) ? 'late' : ''}" style="left:${pos(x.end)}" title="${h(x.name)} · ${U.fmtDate(x.end)}" ${plan ? `data-gbar="pphase|${h(x.id)}" data-ms="1"` : ''}></span>` : ''}</div></div>`
        );
      else
        rows.push(
          `<div class="g-row"><div class="g-lab click" data-edit="pphase|${h(x.id)}">▬ <b>${h(x.name)}</b></div><div class="g-track">${grid}${x.end ? bar('pphase', x, x.start || x.end, x.end, 'phase ' + (x.status === 'Done' ? 'done' : PM.late(x) ? 'late' : ''), x.name, plan) : ''}</div></div>`
        );
    }
    const tasks = items.filter(t => t.start || t.due).sort((a, b) => (a.start || a.due).localeCompare(b.start || b.due));
    for (const t of tasks) {
      const a = t.start || t.due,
        b = t.due && t.due >= a ? t.due : a;
      const pre = t.after && Store.get(t.after);
      const clash = PM.clash(t);
      const late = t.due && !Scrum.isDone(t) && t.due < today;
      rows.push(
        `<div class="g-row"><div class="g-lab click" data-edit="ptask|${h(t.id)}"><span class="muted small mono">${h(ptKey(t))}</span> ${h(t.title)}${pre ? ` <span class="small ${clash ? 't-bad strong' : 'muted'}" title="Starts after ${h(ptKey(pre) + ' ' + pre.title)}">⤷ ${h(ptKey(pre))}</span>` : ''}<span class="muted small"> · ${h(Store.memberShort(t.assignee) || '—')}</span></div><div class="g-track">${grid}${bar('ptask', t, a, b, (Scrum.isDone(t) ? 'done' : late ? 'late' : '') + (clash ? ' clash' : ''), t.title, plan)}</div></div>`
      );
    }
    const undated = items.filter(t => !t.start && !t.due && !Scrum.isDone(t)).length;
    const clashes = tasks.filter(PM.clash);
    return `<div class="page-actions"><span class="muted small">${plan ? 'Drag a bar to move it; drag its right end to change how long it takes. ' : ''}◆ milestone · ▬ phase · ⤷ starts after · red = late</span><span class="grow"></span>${bl ? `<span class="muted small">▭ grey = baseline of ${U.fmtDate(bl.on)}</span>` : ''}${plan ? `${bl ? '<button class="btn ghost" data-blset="1">Reset baseline…</button>' : '<button class="btn" data-blset="" title="Freeze today\'s dates as the plan, to see slipping later">📌 Set baseline</button>'} <button class="btn" data-pmph="phase">＋ Phase</button> <button class="btn" data-pmph="milestone">＋ Milestone</button>` : ''}</div>
      ${clashes.length ? `<div class="insights"><div>⚠ ${clashes.map(t => `<b>${h(ptKey(t))}</b> starts before <b>${h(ptKey(Store.get(t.after)))}</b> is due`).join(' · ')}</div></div>` : ''}
      ${rows.length ? `<div class="gantt" data-gfrom="${sp.from}" data-gdays="${sp.days}">${head}${rows.join('')}</div>` : empty(plan ? 'Nothing on the timeline yet. Add phases and milestones, and give tasks a start and due date.' : 'Nothing on the timeline yet.')}
      ${undated ? `<p class="muted small">${undated} open task${undated === 1 ? ' has' : 's have'} no dates and ${undated === 1 ? 'is' : 'are'} not shown.</p>` : ''}`;
  },
  /* drag to reschedule: the whole bar moves both dates; the grip (right end) moves only the end */
  bindGantt(root) {
    const g = root.querySelector('.gantt');
    if (!g) return;
    const days = +g.dataset.gdays;
    g.querySelectorAll('[data-gbar]').forEach(el => {
      el.addEventListener('click', e => e.stopPropagation());
      el.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        const track = el.parentElement;
        const px = track.getBoundingClientRect().width / days;
        const x0 = e.clientX;
        const endOnly = e.target.classList.contains('g-grip');
        let moved = 0;
        const l0 = el.offsetLeft,
          w0 = el.offsetWidth;
        el.setPointerCapture(e.pointerId);
        el.classList.add('dragging');
        el.onpointermove = ev => {
          moved = Math.round((ev.clientX - x0) / px);
          if (endOnly) el.style.width = Math.max(px, w0 + moved * px) + 'px';
          else el.style.left = l0 + moved * px + 'px';
        };
        el.onpointerup = () => {
          el.onpointermove = el.onpointerup = null;
          el.classList.remove('dragging');
          const [coll, id] = el.dataset.gbar.split('|');
          const r = Store.get(id);
          if (!moved || !r) {
            if (!moved && r) UI.editRecord(coll, r);
            return;
          }
          const o = Object.assign({}, r);
          const sh = d => (d ? U.addDays(d, moved) : d);
          if (coll === 'pphase') {
            if (!endOnly && o.start) o.start = sh(o.start);
            o.end = sh(o.end);
            if (o.start && o.end < o.start) o.end = o.start;
          } else {
            if (endOnly) {
              o.due = sh(o.due || o.start);
              if (o.start && o.due < o.start) o.due = o.start;
            } else {
              o.start = sh(o.start);
              o.due = sh(o.due);
            }
          }
          Store.save(o);
          UI.toast(
            `${coll === 'pphase' ? r.name : ptKey(r)} ${endOnly ? 'now ends' : 'moved to'} ${U.fmtDate(coll === 'pphase' ? (endOnly ? o.end : o.start || o.end) : endOnly ? o.due : o.start || o.due)}`,
            'good'
          );
          App.render();
        };
      });
    });
  },
  /* ---------- Risks, issues, decisions, actions ---------- */
  raidRow(r) {
    const sc = PM.score(r);
    const late = r.status !== 'Closed' && r.due && r.due < U.todayStr();
    return `<div class="li click ${r.status === 'Closed' ? 'waiting' : ''}" data-edit="praid|${h(r.id)}"><span class="badge raid-${U.lc(r.kind)}">${h(r.kind)}</span><div class="grow"><b>${h(r.title)}</b><div class="muted small">${[r.owner && r.owner.length ? 'owner ' + h([].concat(r.owner).join(', ')) : '', r.due ? (late ? '<b class="t-bad">overdue</b> · ' : '') + U.fmtDate(r.due) : '', r.notes ? '📝 ' + h(r.notes.split('\n')[0]) : ''].filter(Boolean).join(' · ')}</div></div>${sc ? `<span class="badge ${PM.scoreKind(sc)}" title="Impact × likelihood">${sc}</span>` : ''}${r.status === 'Closed' ? UI.badge('Closed', '') : ''}</div>`;
  },
  raid(p, ctx) {
    const s = ps('prj');
    const k = s.raidk || '';
    const all = PM.raid(p.id);
    const l = all.filter(r => (!k || r.kind === k) && (s.raidc || r.status !== 'Closed'));
    l.sort(
      (a, b) => (a.status === 'Closed') - (b.status === 'Closed') || PM.score(b) - PM.score(a) || (a.due || '9').localeCompare(b.due || '9')
    );
    const cnt = kk => all.filter(r => r.kind === kk && r.status !== 'Closed').length;
    return `<div class="page-actions"><div class="pm-seg">${[
      ['', 'All'],
      ['Risk', 'Risks'],
      ['Issue', 'Issues'],
      ['Decision', 'Decisions'],
      ['Action', 'Actions'],
    ]
      .map(
        ([v, lab]) =>
          `<button class="btn sm ${k === v ? 'primary' : 'ghost'}" data-raidk="${v}">${lab}${v ? ` <span class="count">${cnt(v)}</span>` : ''}</button>`
      )
      .join('')}</div>
      <label class="flt tog"><input type="checkbox" id="raidc" ${s.raidc ? 'checked' : ''}> Show closed</label><span class="grow"></span>${ctx.canAdd ? '<button class="btn primary" data-pmraid>＋ Add</button>' : ''}</div>
      <p class="muted small">A <b>risk</b> might happen (score = impact × likelihood, 6 or more is high) · an <b>issue</b> is happening now · a <b>decision</b> is recorded so nobody asks again · an <b>action</b> is a follow-up with an owner.</p>
      ${card('', l.length ? l.map(PMV.raidRow).join('') : empty('Nothing here.'))}`;
  },
  /* ---------- Weekly status updates ---------- */
  updateBody(u) {
    const [ic, txt] = PM.RAG[u.health || 'green'];
    const sec = (lab, v) => (v ? `<div class="pm-ch"><div class="muted small">${lab}</div><div class="info-val">${h(v)}</div></div>` : '');
    return `<div class="small">${ic} <b>${txt}</b> · by ${h(Store.memberShort(u.by))}</div>${sec('Done this week', u.done)}${sec('Next week', u.next)}${sec('Blockers / help needed', u.blockers)}`;
  },
  status(p, ctx) {
    const ups = PM.updates(p.id);
    const mine = ups.find(u => u.by === App.me && U.diffDays(u.date, U.todayStr()) < 7);
    return `<div class="page-actions"><span class="muted small">Once a week the owner (or a member) writes what was done, what is next and what is blocking. The latest one sets the project's health light.</span><span class="grow"></span><button class="btn" data-pmprint>🖨 Status report</button>${ctx.canAdd ? `<button class="btn primary" data-pmupd>${mine ? "Edit this week's update" : '＋ Weekly update'}</button>` : ''}</div>
      ${
        ups.length
          ? ups
              .slice(0, 26)
              .map(u =>
                card(
                  `Week of ${U.fmtDate(u.date)}`,
                  PMV.updateBody(u),
                  u.by === App.me ? `<a href="#" class="link" data-edit="pstatus|${h(u.id)}">Edit</a>` : ''
                )
              )
              .join('')
          : empty('No status updates yet.')
      }`;
  },
  /* a one-page report to print or save as PDF */
  report(p) {
    const items = Scrum.items(p.id).filter(t => t.status !== 'Canceled');
    const u = PM.latest(p.id);
    const hl = PM.health(p);
    const [ic, txt] = PM.RAG[hl.k];
    const today = U.todayStr();
    const late = items.filter(t => t.due && !Scrum.isDone(t) && t.due < today);
    const raid = PM.raid(p.id)
      .filter(r => r.status !== 'Closed')
      .sort((a, b) => PM.score(b) - PM.score(a));
    const tr = l => l.join('');
    return `<div class="pm-print"><h1>${h(p.name)} — status report</h1>
      <p>${U.fmtDate(today)} · ${h(Store.teamName(p.team))} · Owner ${h(Store.memberName(p.manager))}${p.sponsor && p.sponsor.length ? ' · Sponsor ' + h([].concat(p.sponsor).join(', ')) : ''}${p.due ? ' · Target ' + U.fmtDate(p.due) : ''}</p>
      <p class="pm-big">${ic} <b>${txt}</b> · ${Scrum.progress(p)}% done · ${items.filter(t => Scrum.isDone(t)).length}/${items.length} tasks${late.length ? ` · ${late.length} overdue` : ''}</p>
      ${p.goal ? `<h3>Goal</h3><p>${h(p.goal)}</p>` : ''}
      ${u ? `<h3>This week (${U.fmtDate(u.date)})</h3>${u.done ? `<p><b>Done:</b> ${h(u.done)}</p>` : ''}${u.next ? `<p><b>Next:</b> ${h(u.next)}</p>` : ''}${u.blockers ? `<p><b>Blockers:</b> ${h(u.blockers)}</p>` : ''}` : ''}
      ${PM.phases(p.id).length ? `<h3>Phases & milestones</h3><table><tr><th></th><th>Name</th><th>Dates</th><th>Status</th></tr>${tr(PM.phases(p.id).map(x => `<tr><td>${x.kind === 'milestone' ? '◆' : '▬'}</td><td>${h(x.name)}</td><td>${x.start ? U.fmtDate(x.start) + ' → ' : ''}${U.fmtDate(x.end)}</td><td>${PM.late(x) ? 'Late' : h(x.status)}</td></tr>`))}</table>` : ''}
      ${raid.length ? `<h3>Open risks, issues & actions</h3><table><tr><th>Type</th><th>What</th><th>Score</th><th>Owner</th><th>Due</th></tr>${tr(raid.map(r => `<tr><td>${h(r.kind)}</td><td>${h(r.title)}</td><td>${PM.score(r) || ''}</td><td>${h([].concat(r.owner || []).join(', '))}</td><td>${U.fmtDate(r.due)}</td></tr>`))}</table>` : ''}
      ${late.length ? `<h3>Overdue tasks</h3><table><tr><th>#</th><th>Task</th><th>Who</th><th>Due</th></tr>${tr(late.map(t => `<tr><td>${h(ptKey(t))}</td><td>${h(t.title)}</td><td>${h(Store.memberShort(t.assignee))}</td><td>${U.fmtDate(t.due)}</td></tr>`))}</table>` : ''}
    </div>`;
  },
  print(p) {
    let box = document.getElementById('pm-print-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'pm-print-box';
      document.body.appendChild(box);
    }
    box.innerHTML = PMV.report(p);
    document.body.classList.add('printing-pm');
    setTimeout(() => {
      window.print();
      document.body.classList.remove('printing-pm');
      box.innerHTML = '';
    }, 50);
  },
  bind(root, p, ctx) {
    PMV.bindGantt(root);
    const pd = e => {
      e.preventDefault();
      e.stopPropagation();
    };
    root.querySelectorAll('[data-pmph]').forEach(
      b =>
        (b.onclick = e => {
          pd(e);
          UI.editRecord('pphase', { project: p.id, kind: b.dataset.pmph, status: 'Planned' });
        })
    );
    root.querySelectorAll('[data-pmupd]').forEach(
      b =>
        (b.onclick = e => {
          pd(e);
          const cur = PM.updates(p.id).find(u => u.by === App.me && U.diffDays(u.date, U.todayStr()) < 7);
          UI.editRecord(
            'pstatus',
            cur || { project: p.id, date: U.todayStr(), health: (PM.latest(p.id) || {}).health || 'green', by: App.me }
          );
        })
    );
    root.querySelectorAll('[data-pmraid]').forEach(
      b =>
        (b.onclick = e => {
          pd(e);
          UI.editRecord('praid', { project: p.id, kind: ps('prj').raidk || 'Risk', status: 'Open', impact: '2', likelihood: '2' });
        })
    );
    root.querySelectorAll('[data-raidk]').forEach(
      b =>
        (b.onclick = () => {
          ps('prj').raidk = b.dataset.raidk;
          App.render();
        })
    );
    const rc = root.querySelector('#raidc');
    if (rc)
      rc.onchange = () => {
        ps('prj').raidc = rc.checked;
        App.render();
      };
    root.querySelectorAll('[data-blset]').forEach(
      b =>
        (b.onclick = e => {
          pd(e);
          PM2V.setBaseline(Store.get(p.id), !!b.dataset.blset);
        })
    );
    root.querySelectorAll('[data-coedit]').forEach(
      b =>
        (b.onclick = e => {
          pd(e);
          PM2V.closeOut(p);
        })
    );
    root.querySelectorAll('[data-pmprint]').forEach(
      b =>
        (b.onclick = e => {
          pd(e);
          PMV.print(p);
        })
    );
  },
};
