/* MAHAM — Boards the Kanban Method way (Kanban and Scrum boards of projects):
 *   WIP limit per column  — the most open cards a column should hold; the header shows "3 / 4" and turns red when over
 *                           (a warning, never a block). project.wip = { '<status>': n }
 *   Policy per column     — "Done when…": what a card needs before it leaves the column, shown on the header (ⓘ).
 *                           project.policy = { '<status>': text }
 *   Set with ⚙ Columns on the board by the project owner, the team manager (or acting) or the super admin.
 *   Flow metrics (project → Reports): cycle time (started → done), throughput per week, cumulative flow by category —
 *   worked out from each task's started / done dates and its move history. */
'use strict';

const KanbanUI = {
  canEdit(p) {
    return !!p && !App.preview && (App.isSuper() || Scrum.planner(p));
  },
  wip(p, st) {
    return Math.max(0, +((p && p.wip) || {})[st] || 0);
  },
  policy(p, st) {
    return String(((p && p.policy) || {})[st] || '');
  },
  /* the column header add-on: "n / limit" (red when over) and the policy ⓘ */
  head(p, st, cards) {
    const lim = KanbanUI.wip(p, st);
    const open = cards.filter(t => !Scrum.isDone(t)).length;
    const pol = KanbanUI.policy(p, st);
    return `${lim ? `<span class="wip ${open > lim ? 'over' : ''}" title="Work-in-progress limit: ${lim}${open > lim ? ' — over the limit' : ''}">${open} / ${lim}</span>` : ''}${pol ? `<span class="kpol" title="Done when: ${h(pol)}" aria-label="Done when: ${h(pol)}">ⓘ</span>` : ''}`;
  },
  over(p, st, cards) {
    const lim = KanbanUI.wip(p, st);
    return !!lim && cards.filter(t => !Scrum.isDone(t)).length > lim;
  },
  button(p) {
    return KanbanUI.canEdit(p)
      ? '<button class="btn" id="kbcols" title="Work-in-progress limits and “Done when…” per column">⚙ Columns</button>'
      : '';
  },
  editDialog(p) {
    if (!KanbanUI.canEdit(p)) return UI.toast('Only the project owner or the team manager can set the columns', 'bad');
    const cols = Scrum.columns(p);
    UI.modal({
      title: `⚙ Columns — ${p.name}`,
      wide: true,
      body: `<p class="muted small">The Kanban way: a <b>work-in-progress limit</b> keeps a column from filling up (the header turns red when over — a warning, nothing is blocked), and a <b>“Done when…”</b> line says what a card needs before it moves on.</p>
        <table class="tbl kb-cols"><thead><tr><th>Column</th><th style="width:110px">WIP limit</th><th>Done when…</th></tr></thead><tbody>${cols.map((st, i) => `<tr><td><b>${h(st)}</b></td><td><input type="number" min="0" step="1" data-kbwip="${i}" value="${KanbanUI.wip(p, st) || ''}" placeholder="none" aria-label="WIP limit for ${h(st)}"></td><td><input data-kbpol="${i}" value="${h(KanbanUI.policy(p, st))}" maxlength="160" placeholder="e.g. tested by someone else" aria-label="Done when for ${h(st)}" style="width:100%"></td></tr>`).join('')}</tbody></table>`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-kbsave>Save</button>',
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-kbsave]').onclick = () => {
          const wip = {},
            policy = {};
          cols.forEach((st, i) => {
            const n = Math.max(0, Math.round(+w.querySelector(`[data-kbwip="${i}"]`).value || 0));
            if (n) wip[st] = n;
            const t = w.querySelector(`[data-kbpol="${i}"]`).value.trim();
            if (t) policy[st] = t;
          });
          Store.save(Object.assign({}, Store.get(p.id), { wip, policy }));
          UI.closeModal();
          UI.toast('Columns saved', 'good');
          App.render();
        };
      },
    });
  },
  bind(root, p) {
    const b = root.querySelector('#kbcols');
    if (b) b.onclick = () => KanbanUI.editDialog(Store.get(p.id));
  },

  /* ---------- flow metrics ---------- */
  /* a task's status at the end of a day, from its history (null = it did not exist yet) */
  statusOn(t, day) {
    if ((t.createdOn || '') > day) return null;
    const end = Date.parse(day + 'T23:59:59');
    const hist = (t.hist || []).filter(x => x && x.at && x.to && x.from !== x.to);
    let st = hist.length ? hist[0].from || t.status : t.status;
    for (const x of hist) {
      if (x.at <= end) st = x.to;
      else break;
    }
    return st;
  },
  flow(p, items, days) {
    const today = U.todayStr();
    const it = items.filter(t => t.status !== 'Canceled');
    // cycle time: started → done, tasks done in the last 90 days
    const from = U.addDays(today, -90);
    const ct = it
      .filter(t => Scrum.isDone(t) && t.doneDate && t.doneDate >= from && t.startedOn)
      .map(t => Math.max(0, U.diffDays(t.startedOn, t.doneDate)));
    const sorted = ct.slice().sort((a, b) => a - b);
    const med = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
    const p85 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.85) - 1)] : null;
    // throughput: done per week, last 12 weeks
    const weeks = [];
    for (let i = 11; i >= 0; i--) {
      const end = U.addDays(today, -7 * i);
      const start = U.addDays(end, -6);
      weeks.push({
        label: U.fmtDate(start).slice(0, 6),
        value: it.filter(t => Scrum.isDone(t) && t.doneDate && t.doneDate >= start && t.doneDate <= end).length,
      });
    }
    // cumulative flow: tasks per category at the end of each day
    const series = [];
    for (let i = (days || 30) - 1; i >= 0; i--) {
      const d = U.addDays(today, -i);
      const n = { todo: 0, wait: 0, doing: 0, done: 0 };
      for (const t of it) {
        const st = KanbanUI.statusOn(t, d);
        if (st == null) continue;
        n[TaskFlow.catOf(t, st)] = (n[TaskFlow.catOf(t, st)] || 0) + 1;
      }
      series.push({ d, n });
    }
    return { ct, med, p85, avg: ct.length ? U.avg(ct) : null, weeks, series };
  },
  cfdSvg(series) {
    const cats = ['done', 'doing', 'wait', 'todo'];
    const max = Math.max(1, ...series.map(x => cats.reduce((a, k) => a + (x.n[k] || 0), 0)));
    const W = 640,
      H = 180,
      L = 30,
      B = 22;
    const bw = (W - L - 6) / series.length;
    const bars = series
      .map((x, i) => {
        let y = H - B;
        return cats
          .map(k => {
            const v = x.n[k] || 0;
            if (!v) return '';
            const hgt = ((H - B - 8) * v) / max;
            y -= hgt;
            return `<rect x="${(L + i * bw + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${hgt.toFixed(1)}" fill="${TaskFlow.CAT_COLOR[k]}"><title>${h(U.fmtDate(x.d))} · ${h((TaskFlow.CATS.find(c => c[0] === k) || ['', k])[1])}: ${v}</title></rect>`;
          })
          .join('');
      })
      .join('');
    const lab = series
      .map((x, i) =>
        i % Math.ceil(series.length / 6) === 0 || i === series.length - 1
          ? `<text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${h(U.fmtDate(x.d).slice(0, 6))}</text>`
          : ''
      )
      .join('');
    return `<svg class="cfd" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative flow"><text x="${L - 6}" y="14" text-anchor="end">${max}</text><text x="${L - 6}" y="${H - B}" text-anchor="end">0</text>${bars}${lab}</svg>
      <div class="legend small">${cats
        .slice()
        .reverse()
        .map(
          k =>
            `<span class="lg-box" style="background:${TaskFlow.CAT_COLOR[k]}"></span>${h((TaskFlow.CATS.find(c => c[0] === k) || ['', k])[1])} `
        )
        .join('')}</div>`;
  },
  flowCards(p, items) {
    const f = KanbanUI.flow(p, items, 30);
    const n = v => (v == null ? '—' : U.num(v, 1) + ' d');
    return `<div class="kpis k4">${UI.kpi('Cycle time (median)', n(f.med), 'started → done, last 90 days')}${UI.kpi('85% done within', n(f.p85), `${f.ct.length} task(s)`)}${UI.kpi('Throughput', U.num(U.sum(f.weeks.slice(-4).map(w => w.value)) / 4, 1) + ' / week', 'done, last 4 weeks')}${UI.kpi('Work in progress', items.filter(t => !Scrum.isDone(t) && Scrum.colIndex(t) > 0 && t.status !== 'Canceled').length, 'started, not done')}</div>
      <div class="cols2">${card('Cumulative flow — last 30 days', KanbanUI.cfdSvg(f.series))}${card('Throughput — done per week', UI.barChart(f.weeks, { height: 170, fmt: v => U.num(v, 0), emptyText: 'Nothing done yet.' }))}</div>`;
  },
};
