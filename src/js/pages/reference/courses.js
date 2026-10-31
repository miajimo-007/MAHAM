/* DARRIK — Courses (per team). */
'use strict';

P.courses = () => {
  const team = App.can('viewOthers') ? Store.activeTeam() : Store.activeTeam().filter(m => m.id === App.me);
  const cs = App.mine(Store.all('course'), r => r.analyst);
  const today = U.todayStr();
  const sum = team.map(m => {
    const mine = cs.filter(c => c.analyst === m.id);
    const fin = mine.filter(c => c.completed || c.status === 'Completed');
    const prog = mine.filter(c => !(c.completed || c.status === 'Completed'));
    const next = mine
      .map(c => c.ppt)
      .filter(d => d && d >= today)
      .sort()[0];
    return { m, prog: prog.length, progH: U.sum(prog.map(c => c.hrs)), fin: fin.length, finH: U.sum(fin.map(c => c.hrs)), next };
  });
  const html = `<div class="cols2 wide-left">${card('Team learning summary', `<table class="tbl"><thead><tr><th>Name</th><th class="num">In progress</th><th class="num">Hours</th><th class="num">Finished</th><th class="num">Hours</th><th>Next presentation</th></tr></thead><tbody>${sum.map(r => `<tr><td>${h(Store.memberShort(r.m.id))}</td><td class="num">${r.prog}</td><td class="num">${U.num(r.progH, 1)}</td><td class="num">${r.fin}</td><td class="num">${U.num(r.finH, 1)}</td><td>${r.next ? U.fmtDate(r.next) : ''}</td></tr>`).join('')}</tbody></table>`)}
  ${card('Recommended courses', `<div class="rec">${[...U.groupBy(Store.all('reccourse'), r => r.category)].map(([k, v]) => `<h4>${h(k)}</h4>${v.map(r => `<div class="li click" data-edit="reccourse|${h(r.id)}"><span class="grow">${h(r.course)}</span><span class="muted">${U.num(r.hrs, 1)} h</span></div>`).join('')}`).join('')}</div>`, `<button class="btn sm" data-add="reccourse">＋</button>`)}</div>
  <div class="page-actions"><span class="grow"></span>${addBtn('course', 'Add course')}</div>
  ${UI.table({
    id: 'course',
    rows: cs,
    exportName: 'Courses',
    onRow: true,
    cols: [
      { key: 'analyst', label: 'Name', get: r => Store.memberShort(r.analyst) },
      { key: 'course', label: 'Course', get: r => r.course },
      { key: 'hrs', label: 'Hrs', cls: 'num', get: r => r.hrs },
      { key: 'start', label: 'Start', get: r => U.fmtDate(r.start), sortVal: r => r.start || '' },
      { key: 'end', label: 'End', get: r => U.fmtDate(r.end), sortVal: r => r.end || '' },
      { key: 'ppt', label: 'Presentation', get: r => U.fmtDate(r.ppt), sortVal: r => r.ppt || '' },
      { key: 'cp', label: 'C / P', get: r => `${r.completed ? '✓' : '·'} / ${r.presented ? '✓' : '·'}` },
      { key: 'status', label: 'Status', html: r => UI.sbadge(r.status), get: r => r.status },
    ],
  })}`;
  return {
    title: 'Courses',
    html,
    mount(root) {
      UI.bindTables(root, { course: r => UI.editRecord('course', r) });
      bindAdd(root);
    },
  };
};
