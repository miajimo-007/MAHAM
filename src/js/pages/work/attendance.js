/* DARRIK — Attendance — monthly grid and day editor. */
'use strict';

function editAttendance(date, mid, preset) {
  if (!App.canEdit('attendance')) {
    UI.toast('You have view-only access to Attendance', 'bad');
    return;
  }
  if (mid !== App.me && !App.can('editAttendanceOthers')) {
    UI.toast('You can only mark your own attendance', 'bad');
    return;
  }
  const id = `att-${date}-${mid}`;
  const cur = Store.get(id) || { id, c: 'attendance', date, analyst: mid, status: 'ON', leave: '', permHrs: 0 };
  const rec = Object.assign({}, cur);
  if (preset === 'ON') {
    Object.assign(rec, { status: 'ON', leave: '' });
    Store.save(rec);
    UI.toast('Marked on duty', 'good');
    App.render();
    return;
  }
  if (preset === 'OFF') rec.status = 'OFF';
  UI.modal({
    title: `${Store.memberShort(mid)} · ${U.fmtDate(date)}`,
    body: `<form id="attf" class="grid-form">
      ${UI.field({ key: 'status', label: 'Status', type: 'select', options: [['ON'], ['OFF']].map(x => x[0]), blank: false }, rec.status || 'ON')}
      ${UI.field({ key: 'leave', label: 'Leave type (when OFF)', type: 'select', options: Store.list('leaveTypes') }, rec.leave)}
      ${UI.field({ key: 'permHrs', label: 'Permission hours (PR)', type: 'number', min: 0, step: 0.25, hint: 'Hours away during an on-duty day' }, rec.permHrs || '')}
    </form><p class="note">ON = on duty · OFF = day off / leave · Permission = left early or came late (hours).</p>`,
    actions: `${Store.get(id) ? '<button class="btn danger ghost" data-clear>Clear day</button>' : ''}<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-s>Save</button>`,
    onMount: w => {
      const f = w.querySelector('#attf');
      if (preset === 'PR') setTimeout(() => f.querySelector('[name=permHrs]').focus(), 50);
      w.querySelector('[data-c]').onclick = UI.closeModal;
      const cl = w.querySelector('[data-clear]');
      if (cl)
        cl.onclick = () => {
          Store.remove(id);
          UI.closeModal();
          App.render();
        };
      w.querySelector('[data-s]').onclick = () => {
        const v = UI.readForm(f, [{ key: 'status' }, { key: 'leave' }, { key: 'permHrs', type: 'number' }]);
        if (v.status === 'ON') v.leave = '';
        v.permHrs = +v.permHrs || 0;
        if (v.status === 'OFF' && !v.leave) {
          UI.toast('Pick the leave type', 'bad');
          return;
        }
        Store.save(Object.assign(rec, v));
        UI.closeModal();
        UI.toast('Saved', 'good');
        App.render();
      };
    },
  });
}

P.attendance = () => {
  const y = App.year,
    s = ps('attendance');
  const now = new Date();
  if (!s.month) s.month = y === now.getFullYear() ? now.getMonth() + 1 : 12;
  const mo = +s.month;
  const team = (App.can('viewOthers') ? Store.activeTeam() : Store.activeTeam().filter(m => m.id === App.me)).filter(
    m => !['manager', 'director', 'aed'].includes(m.role) || (m.id === App.me && !App.can('viewOthers'))
  );
  const att = Calc.attMap(y); // managers are not in the grid
  const today = U.todayStr();
  const days = [];
  for (let d = new Date(y, mo - 1, 1); d.getMonth() === mo - 1; d.setDate(d.getDate() + 1)) {
    const ds = U.ds(d);
    if (s.weekends || !U.isWeekend(ds)) days.push(ds);
  }
  const cell = (ds, m) => {
    const a = att[ds + '|' + m.id];
    let inner = '',
      cls = '';
    if (a) {
      if (a.status === 'OFF') {
        inner = h(a.leave || 'Off');
        cls = 'a-off a-' + U.slug(a.leave || 'off');
      } else if (a.status === 'ON') {
        inner = '✓';
        cls = 'a-on';
      }
      if (+a.permHrs) {
        inner += ` <span class="pr">PR ${a.permHrs}h</span>`;
        cls += ' a-pr';
      }
    } else if (!U.isOff(ds) && ds <= today) {
      inner = '✓';
      cls = 'a-on a-auto';
    } // on duty unless marked
    return `<td class="acell ${cls} ${ds === today ? 'today' : ''}" data-ac="${ds}|${h(m.id)}" title="${h(Store.memberName(m.id))} · ${U.fmtDate(ds)}">${inner}</td>`;
  };
  // YTD summary — every working day up to today counts as on duty unless it is marked as leave
  const workDays = [];
  for (let d = new Date(y, 0, 1); d.getFullYear() === y; d.setDate(d.getDate() + 1)) {
    const ds = U.ds(d);
    if (ds > today) break;
    if (!U.isOff(ds)) workDays.push(ds);
  }
  const sumRows = team.map(m => {
    const recs = Calc.attendance(y).filter(a => a.analyst === m.id);
    const lt = {};
    for (const a of recs) if (a.leave || a.status === 'OFF') lt[a.leave || 'Other'] = (lt[a.leave || 'Other'] || 0) + 1;
    const monthsPts = [];
    for (let i = 1; i <= 12; i++) {
      const hrs = U.sum(recs.filter(a => U.month(a.date) === i).map(a => +a.permHrs || 0));
      monthsPts.push(hrs);
    }
    return {
      m,
      on: workDays.filter(ds => {
        const a = att[ds + '|' + m.id];
        return !a || a.status !== 'OFF';
      }).length,
      off: recs.filter(a => a.status === 'OFF').length,
      pr: recs.filter(a => +a.permHrs).length,
      hrs: U.sum(recs.map(a => +a.permHrs || 0)),
      lt,
      monthHrs: monthsPts,
    };
  });
  const LT = Store.list('leaveTypes');
  const html = `<div class="page-actions"><div class="filters"><label class="flt"><span>Month</span><select data-flt="attendance|month">${U.MONTHS.map((x, i) => `<option value="${i + 1}" ${mo === i + 1 ? 'selected' : ''}>${x} ${y}</option>`).join('')}</select></label><label class="flt tog"><input type="checkbox" data-flt="attendance|weekends" ${s.weekends ? 'checked' : ''}> Show ${h(Custom.weekendName())}</label></div>
    <div class="legend"><span class="a-on">✓ On duty (unless marked)</span><span class="a-off">Leave</span><span class="a-pr"><span class="pr">PR</span> Permission</span></div></div>
  <div class="cols2 wide-left">
  ${card(
    `${U.MONTHS[mo - 1]} ${y}`,
    `<div class="tbl-scroll att-scroll"><table class="tbl att"><thead><tr><th>Day</th>${team.map(m => `<th>${h(Store.memberShort(m.id))}</th>`).join('')}</tr></thead><tbody>
    ${days
      .map(ds => {
        const d = U.pd(ds);
        return `<tr class="${U.isOff(ds) ? 'we' : ''}"><td class="day">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()}${Store.holidayOf(ds) ? ` <span class="muted small">🎉 ${h(Store.holidayOf(ds))}</span>` : ''}</td>${team.map(m => cell(ds, m)).join('')}</tr>`;
      })
      .join('')}
  </tbody></table></div><p class="muted small">Everyone counts as on duty on working days — click a cell only to mark leave or permission hours.</p>`
  )}
  ${card(`Permission hours — ${y}`, `<div class="tbl-scroll"><table class="tbl"><thead><tr><th></th>${team.map(m => `<th class="num">${h(Store.memberShort(m.id))}</th>`).join('')}</tr></thead><tbody>${U.MONTHS.map((x, i) => `<tr><td>${x}</td>${sumRows.map(r => `<td class="num ${r.monthHrs[i] > 4.5 ? 't-bad' : r.monthHrs[i] > 2 ? 't-warn' : ''}">${r.monthHrs[i] ? U.num(r.monthHrs[i], 2) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="muted small">Score: ≤2 h = full 15 pts · ≤4.5 h = 90% · more = 80%.</p>`)}
  </div>
  ${card(`Attendance summary — ${y}`, `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Analyst</th><th class="num">ON</th><th class="num">OFF</th><th class="num">PR</th>${LT.map(t => `<th class="num">${h(t)}</th>`).join('')}<th class="num">P hrs</th></tr></thead><tbody>${sumRows.map(r => `<tr><td>${h(Store.memberShort(r.m.id))}</td><td class="num">${r.on}</td><td class="num">${r.off}</td><td class="num">${r.pr}</td>${LT.map(t => `<td class="num">${r.lt[t] || 0}</td>`).join('')}<td class="num">${U.num(r.hrs, 2)}</td></tr>`).join('')}</tbody></table></div>`)}`;
  return {
    title: 'Attendance',
    html,
    mount(root) {
      root.querySelectorAll('[data-ac]').forEach(
        td =>
          (td.onclick = () => {
            const [ds, mid] = td.dataset.ac.split('|');
            editAttendance(ds, mid);
          })
      );
    },
  };
};
