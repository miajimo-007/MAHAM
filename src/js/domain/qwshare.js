/* MAHAM — Shared quick wins: the analyst who adds a quick win ticks "Worked on with"; each teammate confirms
 * (qwjoin-<qw>-<id> { qw, by, ans: 'yes' | 'no' }, saved in their own file). Everyone on it can edit it; one approval and
 * one QW ID; each confirmed analyst gets it in their own score, the team counts it once. The person who added it can
 * delete it (until approved); a teammate leaves with "Remove me". */
'use strict';

const QS = {
  invited(q) {
    return ((q && q.coWorkers) || []).filter(id => id && id !== q.analyst);
  },
  ans(q, id) {
    const j = Store.get('qwjoin-' + q.id + '-' + id);
    return j ? j.ans : '';
  },
  confirmed(q) {
    return QS.invited(q).filter(id => QS.ans(q, id) === 'yes');
  },
  waiting(q) {
    return QS.invited(q).filter(id => !QS.ans(q, id));
  },
  people(q) {
    return [q.analyst, ...QS.confirmed(q)];
  },
  /* is this person on the quick win (added it, or invited and not said "Not me")? */
  onIt(q, id) {
    const me = id || App.me;
    return q.analyst === me || (QS.invited(q).includes(me) && QS.ans(q, me) !== 'no');
  },
  shared(q) {
    return QS.invited(q).length > 0;
  },
  pendingForMe() {
    return Store.all('quickwin', '*').filter(q => QS.invited(q).includes(App.me) && !QS.ans(q, App.me) && !qwHistory(q, true));
  },
  answer(q, yes) {
    if (!yes && q.approval && !App.can('approveQW'))
      return UI.toast('This quick win is approved — ask your manager to take you off it', 'bad');
    Store.save({ id: 'qwjoin-' + q.id + '-' + App.me, c: 'qwjoin', qw: q.id, by: App.me, ans: yes ? 'yes' : 'no', at: Date.now() });
    UI.toast(yes ? 'Added to your quick wins' : 'Taken off this quick win', 'good');
    App.render();
  },
  tag(q) {
    if (!QS.shared(q)) return '';
    const who = [q.analyst, ...QS.invited(q).filter(id => QS.ans(q, id) !== 'no')]
      .map(id => Store.memberShort(id) + (id !== q.analyst && !QS.ans(q, id) ? ' (waiting)' : ''))
      .join(', ');
    return ` <span class="badge" title="Shared: ${h(who)}">🔗 ${QS.people(q).length}${QS.waiting(q).length ? '+' + QS.waiting(q).length : ''}</span>`;
  },
  /* in the quick win form */
  formNote(q) {
    if (!q || !q.id || !QS.shared(q)) return '';
    const st = id => (QS.ans(q, id) === 'yes' ? '✓' : QS.ans(q, id) === 'no' ? '✕ not me' : 'waiting');
    const mine = QS.invited(q).includes(App.me) && QS.ans(q, App.me) !== 'no' && !q.approval;
    return `<p class="note">🔗 <b>Shared quick win</b> — added by ${h(Store.memberShort(q.analyst))} · with ${QS.invited(q)
      .map(id => `${h(Store.memberShort(id))} (${st(id)})`)
      .join(', ')}${mine ? ' <button class="btn xs ghost" data-qwleave>Remove me</button>' : ''}</p>`;
  },
  /* Analyst Desk: quick wins I was added to */
  card() {
    const l = QS.pendingForMe();
    if (!l.length) return '';
    return card(
      `Quick wins you were added to <span class="count">${l.length}</span>`,
      l
        .map(
          q =>
            `<div class="li"><span class="grow">🔗 <b>${h(Store.memberShort(q.analyst))}</b> added you to <b>“${h(q.subject)}”</b> <span class="muted small">${h(q.module || '')}${q.date ? ' · ' + U.fmtDate(q.date) : ''}</span></span><button class="btn xs primary" data-qwyes="${h(q.id)}">✓ Yes, I worked on it</button> <button class="btn xs ghost" data-qwno="${h(q.id)}">✕ Not me</button></div>`
        )
        .join('')
    );
  },
  bind(root) {
    root.querySelectorAll('[data-qwyes]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          QS.answer(Store.get(b.dataset.qwyes), true);
        })
    );
    root.querySelectorAll('[data-qwno]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          QS.answer(Store.get(b.dataset.qwno), false);
        })
    );
  },
};
