/* MAHAM — Scrum board pieces: task cards, moving tasks, drag & drop, burndown chart. */
'use strict';

const ptKey = t => (typeof Work !== 'undefined' ? Work.key(t) : '#' + (t.n || ''));

const typeIcon = t => ({ Story: '◆', Bug: '✱', Task: '▪' })[t] || '▪';

function ptCard(t, p, opts = {}) {
  const cols = Scrum.columns(p),
    last = cols.length - 1,
    i = Scrum.colIndex(t);
  const work = Scrum.canWork(t);
  const late = t.due && !Scrum.isDone(t) && t.due < U.todayStr();
  const take = !t.assignee && Scrum.member(p) && !Scrum.planner(p);
  return `<div class="pcard pr-${U.lc(t.priority || 'normal')}" ${work ? `draggable="true" data-drag="${h(t.id)}"` : ''} data-edit="ptask|${h(t.id)}">
    <div class="pc-top"><span class="pc-type t-${['story', 'task', 'bug'].includes(U.lc(t.type || 'task')) ? U.lc(t.type || 'task') : 'other'}" title="${h(t.type || 'Task')}">${typeIcon(t.type)}</span><span class="muted small mono">${h(ptKey(t))}</span>${opts.project ? `<span class="muted small">· ${h(p.name)}</span>` : ''}<span class="grow"></span>${t.points ? `<span class="pts" title="Story points">${h(t.points)}</span>` : ''}</div>
    <div class="pc-title">${h(t.title)}${t.milestone ? ' <span class="tag-ms" title="Milestone">⭐</span>' : ''}</div>${typeof PM2 !== 'undefined' ? PM2.badges(t) : ''}
    <div class="pc-foot">${t.assignee ? `<span class="av sm" title="${h(Store.memberName(t.assignee))}">${h((Store.memberShort(t.assignee) || '?').slice(0, 1))}</span><span class="small">${h(Store.memberShort(t.assignee))}</span>` : '<span class="muted small">Unassigned</span>'}${t.due ? `<span class="small ${late ? 't-bad strong' : 'muted'}">· ${U.fmtDate(t.due)}</span>` : ''}<span class="grow"></span>
      ${take ? `<button class="btn xs" data-take="${h(t.id)}">Take it</button>` : ''}
      ${work && i > 0 ? `<button class="btn xs ghost" data-mv="${h(t.id)}|-1" title="Move back">◀</button>` : ''}${work && i < last ? `<button class="btn xs ${i === last - 1 ? 'primary' : ''}" data-mv="${h(t.id)}|1" title="Move to ${h(cols[i + 1])}">${i === last - 1 ? '✓ ' + h(cols[last]) : '▶'}</button>` : ''}</div></div>`;
}

function moveItem(id, to) {
  const t = Store.get(id);
  if (!t || !Scrum.canWork(t)) return UI.toast('Only the person assigned (or the manager) can move this', 'bad');
  const r = Object.assign({}, t, { status: to });
  Schemas.ptask.beforeSave(r, t);
  Store.save(r);
  App.render();
  if (to === Scrum.doneCol(Scrum.proj(t.project))) UI.toast(`${ptKey(t)} ${to.toLowerCase()} ✓`, 'good');
}

function bindScrum(root) {
  root.querySelectorAll('[data-mv]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        const [id, d] = b.dataset.mv.split('|');
        const t = Store.get(id);
        const cols = Scrum.columns(Scrum.proj(t.project));
        const i = Scrum.colIndex(t) + +d;
        moveItem(id, cols[Math.max(0, Math.min(cols.length - 1, i))]);
      })
  );
  root.querySelectorAll('[data-take]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        const t = Store.get(b.dataset.take);
        if (!t || t.assignee) return;
        Store.save(Object.assign({}, t, { assignee: App.me }));
        UI.toast('Assigned to you', 'good');
        App.render();
      })
  );
  root.querySelectorAll('[data-drag]').forEach(c =>
    c.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', c.dataset.drag);
      c.classList.add('dragging');
    })
  );
  root.querySelectorAll('[data-col]').forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      col.classList.add('over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', e => {
      e.preventDefault();
      col.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      const t = Store.get(id);
      if (t && t.status !== col.dataset.col) moveItem(id, col.dataset.col);
    });
  });
}

function burndown(sp, items) {
  if (!sp || !sp.start || !sp.end) return empty('Set the sprint start and end dates to see the burndown.');
  const days = [];
  for (let d = sp.start; d <= sp.end && days.length < 120; d = U.addDays(d, 1)) days.push(d);
  if (days.length < 2) return empty('Sprint is too short for a chart.');
  const tot = Scrum.pts(items) || 0;
  if (!tot) return empty('Give the sprint items story points to see the burndown.');
  const today = U.todayStr();
  const rem = days.map(d => (d > today ? null : tot - Scrum.pts(items.filter(t => Scrum.isDone(t) && t.doneDate && t.doneDate <= d))));
  const W = 640,
    H = 200,
    L = 34,
    B = 24,
    x = i => L + ((W - L - 10) * i) / (days.length - 1),
    y = v => 10 + (H - B - 10) * (1 - v / tot);
  const actual = rem
    .map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');
  const ticks = [0, Math.round(tot / 2), tot];
  const lab = i => i === 0 || i === days.length - 1 || i % Math.ceil(days.length / 6) === 0;
  return `<svg class="burn" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sprint burndown">
    ${ticks.map(v => `<line x1="${L}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
    ${days.map((d, i) => (lab(i) ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${h(U.fmtDate(d).slice(0, 6))}</text>` : '')).join('')}
    <line x1="${x(0)}" y1="${y(tot)}" x2="${x(days.length - 1)}" y2="${y(0)}" class="ideal"/>
    ${actual ? `<polyline points="${actual}" class="act"/>` : ''}
    ${rem.map((v, i) => (v == null ? '' : `<circle cx="${x(i)}" cy="${y(v)}" r="2.6" class="act-d"><title>${U.fmtDate(days[i])}: ${v} points left</title></circle>`)).join('')}
  </svg><div class="legend small"><span class="lg ideal"></span>Ideal <span class="lg act"></span>Remaining points</div>`;
}
