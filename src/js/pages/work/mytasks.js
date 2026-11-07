/* MAHAM — My Tasks: personal tasks (private), planned days, repeats, offers to and from teammates. */
'use strict';

P.mytasks = () => {
  const today = U.todayStr();
  const fmo = ps('mytasks').month;
  const mine = PT.mine().filter(t => !fmo || inMonth(t.plan || t.due || t.doneDate, fmo) || (t.status === 'Open' && !t.plan && !t.due));
  const pr = t => (UI.PRI_RANK || {})[t.priority || 'Normal'] ?? 2;
  const todayL = mine
    .filter(t => PT.isOpen(t) && !t.offer && (!t.plan || t.plan <= today)) // offered ones wait under "Given to others"
    .sort((a, b) => PT.late(b) - PT.late(a) || pr(a) - pr(b) || (a.due || '9').localeCompare(b.due || '9'));
  const planned = mine.filter(t => PT.planned(t, today) && !t.offer).sort((a, b) => a.plan.localeCompare(b.plan) || pr(a) - pr(b));
  const offers = PT.offersForMe();
  const giving = mine.filter(t => t.offer && t.status === 'Open' && PT.offerState(t) !== 'accepted');
  const given = mine
    .filter(t => PT.given(t))
    .slice(-10)
    .reverse();
  const done = mine
    .filter(t => t.status === 'Done')
    .sort((a, b) => (b.doneDate || '').localeCompare(a.doneDate || ''))
    .slice(0, 15);
  const pri = t => (t.priority && t.priority !== 'Normal' ? ` <span class="tag-pri ${h(t.priority)}">${h(t.priority)}</span>` : '');
  const row = (t, btns) =>
    `<div class="li click" data-edit="mytask|${h(t.id)}"><div class="grow"><b>${h(t.title)}</b>${pri(t)}<div class="muted small">${PT.meta(t) || 'no date'}${t.note ? ' · 📝 ' + h(t.note.split('\n')[0]) : ''}</div></div><span class="nw">${btns}</span></div>`;
  const openBtns = t =>
    `${t.offer && PT.offerState(t) === 'pending' ? `<span class="badge warn">offered to ${h(Store.memberShort(t.offer.to))}</span> <button class="btn xs ghost" data-ptback="${h(t.id)}">Take back</button>` : `<button class="btn xs ghost" data-ptgive="${h(t.id)}" title="Give it to a teammate">Give to…</button>`} <button class="btn sm" data-ptdone="${h(t.id)}">✓ Done</button>`;
  const byDay = U.groupBy(planned, t => t.plan);
  const html = `<div class="page-actions">${filterBar('mytasks', [{ key: 'month', type: 'month' }])}<span class="muted small">🔒 Only you see your personal tasks. They are not To Dos (those come from your manager) and they are not scored.</span><span class="grow"></span><button class="btn primary" data-ptnew="">＋ Personal task</button></div>
  ${offers.length ? card(`Offered to you <span class="count">${offers.length}</span>`, offers.map(t => `<div class="li"><div class="grow"><b>${h(t.title)}</b>${pri(t)}<div class="muted small">from <b>${h(Store.memberShort(t.owner))}</b>${t.offer.note ? ' · “' + h(t.offer.note) + '”' : ''}${PT.meta(t) ? ' · ' + PT.meta(t) : ''}</div></div><span class="nw"><button class="btn sm primary" data-ptacc="${h(t.id)}">Accept</button> <button class="btn sm ghost" data-ptdec="${h(t.id)}">Decline</button></span></div>`).join('')) : ''}
  <div class="cols2"><div>
    ${card(`Today <span class="count">${todayL.length}</span>`, todayL.length ? todayL.map(t => row(t, openBtns(t))).join('') : empty('Nothing for today. Plan something with ＋ Personal task.'))}
    ${
      giving.length
        ? card(
            `Given to others <span class="count">${giving.length}</span>`,
            giving
              .map(t => {
                const d = PT.declined(t);
                return (
                  row(
                    t,
                    d
                      ? `<span class="badge bad" title="${h(d.why || '')}">declined by ${h(Store.memberShort(t.offer.to))}</span> <button class="btn xs ghost" data-ptback="${h(t.id)}">Keep it</button> <button class="btn xs ghost" data-ptgive="${h(t.id)}">Give to…</button>`
                      : openBtns(t)
                  ) + (d && d.why ? `<div class="small t-bad" style="margin:-4px 0 6px">↩ “${h(d.why)}”</div>` : '')
                );
              })
              .join('')
          )
        : ''
    }
  </div><div>
    ${card(`Planned <span class="count">${planned.length}</span>`, planned.length ? [...byDay].map(([d, l]) => `<h4 class="act-h">${h(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][U.pd(d).getDay()])} ${U.fmtDate(d)}</h4>` + l.map(t => row(t, `<button class="btn xs ghost" data-pttoday="${h(t.id)}" title="Move it to today">Do today</button> ${openBtns(t)}`)).join('')).join('') : empty('Nothing planned ahead.'), '<a href="#" class="link" data-ptnew="' + U.addDays(today, 1) + '">＋ Plan for tomorrow</a>')}
    ${
      given.length
        ? card(
            'Handed over',
            given
              .map(t => {
                const c = PT.acceptedCopy(t);
                return `<div class="li waiting"><div class="grow"><b>${h(t.title)}</b><div class="muted small">✓ accepted by ${h(Store.memberShort(t.offer.to))}${c && c.status === 'Done' ? ' · done ' + U.fmtDate(c.doneDate) : ''}</div></div></div>`;
              })
              .join('')
          )
        : ''
    }
    ${card(`Done <span class="count">${done.length}</span>`, done.length ? done.map(t => `<div class="li click" data-edit="mytask|${h(t.id)}"><div class="grow"><b>${h(t.title)}</b><div class="muted small">done ${U.fmtDate(t.doneDate)}${t.loggedAs ? ' · logged as ' + (t.loggedAs === 'shadow' ? 'shadow work' : 'a quick win') : ''}${t.repeat ? ' · ↻ ' + PT.REPEAT_LABEL[t.repeat] : ''}</div></div>${t.loggedAs ? '' : `<button class="btn xs ghost" data-ptlog="${h(t.id)}" title="Log it as shadow work or a quick win">Log it…</button>`}</div>`).join('') : empty('Nothing done yet.'))}
  </div></div>`;
  return {
    title: 'Personal tasks',
    html,
    mount(root) {
      PT.bind(root);
    },
  };
};
