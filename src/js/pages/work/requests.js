/* DARRIK — Requests & Approvals: raise a request, approve / reject, team leave. */
'use strict';

const reqBadge = r =>
  UI.badge(
    Requests.isDone(r) ? Requests.ST.OK : r.status,
    Requests.isDone(r) ? 'good' : r.status === Requests.ST.NO ? 'bad' : r.status === Requests.ST.X ? '' : 'warn'
  );
function reqTrail(r) {
  const s = [];
  if (r.mgrBy)
    s.push(
      `${r.mgrOk === false ? '✗' : '✓'} ${h(Store.memberShort(r.mgrBy))} ${U.fmtDate(r.mgrOn)}${r.mgrComment ? ' — ' + h(r.mgrComment) : ''}`
    );
  if (r.dirBy)
    s.push(
      `${r.dirOk === false ? '✗' : '✓'} ${h(Store.memberShort(r.dirBy))} ${U.fmtDate(r.dirOn)}${r.dirComment ? ' — ' + h(r.dirComment) : ''}`
    );
  return s.length ? `<div class="muted small">${s.join('<br>')}</div>` : '';
}
function reqRow(r, opts = {}) {
  const rel = Requests.relatedLabel(r);
  return `<div class="li"><div class="grow"><b>${h(Requests.type(r.type).label)}</b>${r.title ? ` — ${h(r.title)}` : ''}${opts.who ? ` · ${h(Store.memberShort(r.requester))} <span class="muted small">${h(Store.teamName(r.team))}</span>` : ''}
    <div class="small">${Requests.when(r)}${r.leaveType && Requests.type(r.type).kind === 'days' ? ' · ' + h(r.leaveType) : ''}</div>${rel ? `<div class="small">🔗 <a class="link" href="${Requests.relatedLink(r)}">${h(rel)}</a></div>` : ''}${r.reason ? `<div class="muted small">“${h(r.reason)}”</div>` : ''}${r.escalated ? '<div class="small t-warn">↑ sent to the director by the manager</div>' : ''}${reqTrail(r)}</div>
    ${reqBadge(r)}${r.status === Requests.ST.CR && Requests.canCancelLeave(r) ? ` <button class="btn xs danger" data-rqcok="${h(r.id)}">Cancel the leave</button> <button class="btn xs ghost" data-rqcno="${h(r.id)}">Keep it</button>` : r.status !== Requests.ST.CR && Requests.canDecide(r) ? ` <button class="btn xs primary" data-rqok="${h(r.id)}">Approve</button> <button class="btn xs ghost" data-rqno="${h(r.id)}">Reject</button>` : ''}${opts.cancel && r.requester === App.me && Requests.isPending(r) && r.status !== Requests.ST.CR ? ` <button class="btn xs ghost" data-rqx="${h(r.id)}">Cancel</button>` : ''}${Requests.canAskCancel(r) ? ` <button class="btn xs ghost" data-rqask="${h(r.id)}">Ask to cancel</button>` : ''}${opts.who && Requests.isDone(r) && Requests.canCancelLeave(r) ? ` <button class="btn xs ghost" data-rqcok="${h(r.id)}">Cancel leave</button>` : ''}${r.cancelNote ? `<div class="muted small">Canceled by ${h(Store.memberShort(r.canceledBy))} ${U.fmtDate(r.canceledOn)} — ${h(r.cancelNote)}</div>` : ''}</div>`;
}
/* card used on the Manager and Director desks */
function approvalsCard() {
  const w = Requests.waitingForMe();
  if (!w.length) return ''; // the desks show it only when something is waiting
  return card(
    `Waiting for your approval <span class="count">${w.length}</span>`,
    w.length ? w.map(r => reqRow(r, { who: true })).join('') : empty('Nothing waiting.'),
    '<a href="#/requests/approve" class="link">All requests →</a>'
  );
}
function newRequest() {
  const types = Requests.types();
  const today = U.todayStr();
  UI.modal({
    title: 'New request',
    body: `<form class="grid-form" id="rqf">
      ${UI.field({ key: 'type', label: 'Type', type: 'select', options: types.map(t => [t.id, t.label]), blank: false }, types[0] && types[0].id)}
      ${UI.field({ key: 'title', label: 'Subject — what needs approval', type: 'text', placeholder: 'e.g. Access to the OR module, overtime for go-live…', cls: 'rq-title' }, '')}
      ${UI.field({ key: 'related', label: 'Related to (optional)', type: 'select', options: Requests.relatedOptions(), blank: '— nothing —', span: 2 }, '')}
      ${UI.field({ key: 'leaveType', label: 'Leave type', type: 'select', options: Store.list('leaveTypes'), blank: false, cls: 'rq-days' }, 'Annual')}
      ${UI.field({ key: 'from', label: 'From / date', type: 'date', required: true }, today)}
      ${UI.field({ key: 'to', label: 'To (last day)', type: 'date', cls: 'rq-to' }, '')}
      ${UI.field({ key: 'hours', label: 'Hours', type: 'number', min: 0.25, step: 0.25, cls: 'rq-hours' }, '')}
      ${UI.field({ key: 'reason', label: 'Reason / details', type: 'textarea', span: 2, rows: 2 }, '')}
    </form><p class="muted small" id="rqflow"></p>`,
    actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Send request</button>`,
    onMount: w => {
      const f = w.querySelector('#rqf');
      const sync = () => {
        const t = Requests.type(f.querySelector('[name=type]').value);
        f.querySelector('.rq-days').style.display = t.kind === 'days' && t.attendance ? '' : 'none';
        f.querySelector('.rq-to').style.display = t.kind === 'hours' ? 'none' : '';
        f.querySelector('.rq-hours').style.display = t.kind === 'hours' ? '' : 'none';
        f.querySelector('.rq-title label').innerHTML = t.kind === 'other' ? 'Subject — what needs approval <i>*</i>' : 'Subject (optional)';
        const probe = { type: t.id, requester: App.me };
        w.querySelector('#rqflow').textContent =
          'Goes to: ' +
          (Requests.firstStatus(probe) === Requests.ST.DIR
            ? 'director'
            : 'your manager' + (Requests.needsDirector(probe) ? ', then the director' : '')) +
          (t.attendance ? ' · once approved it is added to Attendance' : '');
      };
      f.querySelector('[name=type]').onchange = sync;
      sync();
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelector('[data-ok]').onclick = () => {
        const v = UI.readForm(f, [
          { key: 'type' },
          { key: 'title' },
          { key: 'related' },
          { key: 'leaveType' },
          { key: 'from' },
          { key: 'to' },
          { key: 'hours', type: 'number' },
          { key: 'reason' },
        ]);
        const t = Requests.type(v.type);
        if (t.kind === 'other' && !v.title) return UI.toast('Write what needs approval', 'bad');
        if (!v.from) return UI.toast('Pick the date', 'bad');
        if (v.to && v.to < v.from) return UI.toast('"To" is before "From"', 'bad');
        if (t.kind === 'hours' && !(+v.hours > 0)) return UI.toast('Enter the hours', 'bad');
        if (t.kind === 'days' && !Requests.days(v).length) return UI.toast('Those dates are all weekend days', 'bad');
        const me = Store.member(App.me) || {};
        const r = {
          c: 'request',
          type: v.type,
          requester: App.me,
          team: Store.topRole(me.role) ? '_top' : me.team || Config.DEFAULT_TEAM,
          title: v.title,
          related: v.related,
          from: v.from,
          to: t.kind === 'hours' ? '' : v.to || v.from,
          hours: t.kind === 'hours' ? +v.hours : 0,
          leaveType: t.kind === 'days' && t.attendance ? v.leaveType : '',
          reason: v.reason,
          created: today,
        };
        const clash = t.attendance && Requests.clash(r);
        if (clash)
          return UI.toast(
            `That overlaps your ${Requests.type(clash.type).label.toLowerCase()} (${Requests.when(clash).replace(/<[^>]+>/g, '')}, ${clash.status.toLowerCase()})`,
            'bad'
          );
        r.status = Requests.firstStatus(r);
        Store.save(r);
        UI.closeModal();
        UI.toast('Request sent', 'good');
        App.render();
      };
    },
  });
}
function decideRequest(id, approve) {
  const r = Store.get(id);
  if (!r || !Requests.canDecide(r)) return UI.toast('You cannot decide this request', 'bad');
  const step = r.status === Requests.ST.MGR ? 'mgr' : 'dir';
  const next = approve ? Requests.nextStatus(r) : Requests.ST.NO;
  UI.modal({
    title: `${approve ? 'Approve' : 'Reject'} — ${Requests.type(r.type).label}`,
    body: `<p><b>${h(Store.memberShort(r.requester))}</b><br>${Requests.when(r)}${r.reason ? `<br><span class="muted">“${h(r.reason)}”</span>` : ''}</p>
      <form class="grid-form" id="rqd">${UI.field({ key: 'comment', label: approve ? 'Comment (optional)' : 'Reason for rejecting', type: 'textarea', span: 2, rows: 2 }, '')}${approve && next === Requests.ST.OK && step === 'mgr' && !App.isDir() ? UI.field({ key: 'escalate', label: 'Director', type: 'bool', checkLabel: "Also needs the director's approval — send it on", span: 2 }, false) : ''}</form>
      <p class="muted small">${approve ? (next === Requests.ST.DIR ? 'It will go to the director for final approval.' : 'This is the final approval.' + (Requests.type(r.type).attendance ? ' The days are added to Attendance.' : '')) : ''}</p>`,
    actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn ${approve ? 'primary' : 'danger'}" data-ok>${approve ? 'Approve' : 'Reject'}</button>`,
    onMount: w => {
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelector('[data-ok]').onclick = () => {
        const comment = w.querySelector('[name=comment]').value.trim();
        if (!approve && !comment) return UI.toast('Write the reason for rejecting', 'bad');
        const esc = approve && !!(w.querySelector('[name=escalate]') || {}).checked;
        const out = Object.assign({}, r, {
          status: esc ? Requests.ST.DIR : next,
          escalated: esc || r.escalated || false,
          [step + 'By']: App.me,
          [step + 'On']: U.todayStr(),
          [step + 'Ok']: approve,
          [step + 'Comment']: comment,
        });
        const recs = [out];
        if (out.status === Requests.ST.OK) recs.push(...Requests.attendanceFor(out));
        Store.saveMany(recs);
        UI.closeModal();
        UI.toast(
          approve ? (out.status === Requests.ST.OK ? 'Approved — request completed' : 'Approved — sent to the director') : 'Rejected',
          'good'
        );
        App.render();
      };
    },
  });
}
function bindRequests(root) {
  root.querySelectorAll('[data-rqok]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        decideRequest(b.dataset.rqok, true);
      })
  );
  root.querySelectorAll('[data-rqno]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        decideRequest(b.dataset.rqno, false);
      })
  );
  root.querySelectorAll('[data-rqx]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        const r = Store.get(b.dataset.rqx);
        UI.confirm('Cancel this request?', () => {
          Store.save(Object.assign({}, r, { status: Requests.ST.X }));
          UI.toast('Request canceled');
          App.render();
        });
      })
  );
  root.querySelectorAll('[data-rqask]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        const r = Store.get(b.dataset.rqask);
        UI.confirm('Ask your manager to cancel this approved leave? Until they confirm, the days stay OFF.', () => {
          Store.save(Object.assign({}, r, { status: Requests.ST.CR, cancelAsked: U.todayStr() }));
          UI.toast('Sent to your manager', 'good');
          App.render();
        });
      })
  );
  root.querySelectorAll('[data-rqcok]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        const r = Store.get(b.dataset.rqcok);
        UI.modal({
          title: 'Cancel approved leave',
          body: `<p><b>${h(Store.memberShort(r.requester))}</b> · ${Requests.when(r)}</p><p class="muted small">The request becomes Canceled and its OFF days are removed from Attendance.</p><form class="grid-form" id="clf">${UI.field({ key: 'note', label: 'Note (optional)', type: 'text', span: 2 }, '')}</form>`,
          actions: `<span class="grow"></span><button class="btn" data-c>Back</button><button class="btn danger" data-ok>Cancel the leave</button>`,
          onMount: w => {
            w.querySelector('[data-c]').onclick = UI.closeModal;
            w.querySelector('[data-ok]').onclick = () => {
              Store.saveMany(Requests.cancelLeaveRecs(r, w.querySelector('[name=note]').value.trim()));
              UI.closeModal();
              UI.toast('Leave canceled — Attendance updated', 'good');
              App.render();
            };
          },
        });
      })
  );
  root.querySelectorAll('[data-rqcno]').forEach(
    b =>
      (b.onclick = e => {
        e.stopPropagation();
        const r = Store.get(b.dataset.rqcno);
        Store.save(Object.assign({}, r, { status: Requests.ST.OK }));
        UI.toast('Leave kept');
        App.render();
      })
  );
  const nb = root.querySelector('#newreq');
  if (nb) nb.onclick = newRequest;
}
P.requests = sub => {
  const approver = App.can('approveRequests') || App.isDir() || App.isSuper();
  const tabs = [
    ...(Requests.canRaise() ? [['mine', 'My requests']] : []),
    ...(approver ? [['approve', `To approve${Requests.waitingForMe().length ? ` (${Requests.waitingForMe().length})` : ''}`]] : []),
    ['leave', 'Team leave'],
  ];
  const tab = tabs.some(t => t[0] === sub) ? sub : tabs[0][0];
  const today = U.todayStr();
  let body;
  if (tab === 'mine') {
    const mine = Requests.mine().sort((a, b) => (b.created || '').localeCompare(a.created || '') || (b._ts || 0) - (a._ts || 0));
    body = `<div class="page-actions"><span class="muted small">Ask for vacation, permission hours, training, overtime or any other approval.</span><span class="grow"></span>${App.canEdit('request') && Requests.canRaise() ? '<button class="btn primary" id="newreq">＋ New request</button>' : ''}</div>
      ${
        !mine.length
          ? '<div class="oneline">No requests yet — use ＋ New request above to ask for leave, permission or anything else.</div>'
          : `${
              mine.some(Requests.isPending)
                ? card(
                    'Pending',
                    mine
                      .filter(Requests.isPending)
                      .map(r => reqRow(r, { cancel: true }))
                      .join('')
                  )
                : '<div class="oneline">✓ Nothing pending.</div>'
            }
      ${
        mine.some(r => !Requests.isPending(r))
          ? card(
              'History',
              mine
                .filter(r => !Requests.isPending(r))
                .map(r => reqRow(r))
                .join('')
            )
          : ''
      }`
      }`;
  } else if (tab === 'approve') {
    const s = ps('rq');
    let rows = Requests.visible().filter(r => r.requester !== App.me || App.isSuper());
    if (s.st) rows = rows.filter(r => r.status === s.st);
    if (s.type) rows = rows.filter(r => r.type === s.type);
    rows.sort((a, b) => Requests.isPending(b) - Requests.isPending(a) || (b.from || '').localeCompare(a.from || ''));
    body = `${card(
      `Waiting for you <span class="count">${Requests.waitingForMe().length}</span>`,
      Requests.waitingForMe()
        .map(r => reqRow(r, { who: true }))
        .join('') || empty('Nothing waiting for your decision.')
    )}
      <div class="page-actions">${filterBar('rq', [
        { key: 'st', label: 'Status', options: Object.values(Requests.ST) },
        { key: 'type', label: 'Type', options: Requests.types().map(t => [t.id, t.label]) },
      ])}</div>
      ${UI.table({
        id: 'rqall',
        rows,
        exportName: 'Requests',
        cols: [
          { key: 'requester', label: 'Person', get: r => Store.memberShort(r.requester) },
          { key: 'type', label: 'Type', get: r => Requests.type(r.type).label },
          { key: 'title', label: 'Subject', get: r => r.title || '' },
          { key: 'when', label: 'When', get: r => Requests.when(r).replace(/<[^>]+>/g, ''), sortVal: r => r.from || '' },
          { key: 'reason', label: 'Reason', get: r => r.reason || '' },
          { key: 'status', label: 'Status', html: r => reqBadge(r), get: r => r.status },
          {
            key: 'by',
            label: 'Decided by',
            get: r =>
              [r.mgrBy, r.dirBy]
                .filter(Boolean)
                .map(x => Store.memberShort(x))
                .join(' → '),
          },
          {
            key: 'act',
            label: '',
            html: r =>
              Requests.isDone(r) && Requests.canCancelLeave(r) && (r.to || r.from || '') >= today
                ? `<button class="btn xs ghost" data-rqcok="${h(r.id)}">Cancel leave</button>`
                : '',
            get: () => '',
          },
        ],
      })}`;
  } else {
    const lv = Requests.teamLeave()
      .filter(r => (r.to || r.from) >= U.addDays(today, -7))
      .sort((a, b) => a.from.localeCompare(b.from));
    const now = lv.filter(r => r.from <= today && (r.to || r.from) >= today);
    body = `${card(`Away today <span class="count">${now.length}</span>`, now.map(r => `<div class="li"><span class="grow"><b>${h(Store.memberShort(r.requester))}</b></span><span class="small">${Requests.when(r)}</span></div>`).join('') || empty('Everyone is in today.'))}
      ${card(
        'Approved leave — coming up',
        lv
          .filter(r => r.from > today)
          .map(
            r =>
              `<div class="li"><span class="grow"><b>${h(Store.memberShort(r.requester))}</b></span><span class="small">${Requests.when(r)}</span></div>`
          )
          .join('') || empty('No upcoming leave.')
      )}
      <p class="muted small">Only approved leave is shown here — never the reason, and never pending or rejected requests.</p>`;
  }
  return {
    title: 'Requests & Approvals',
    html: `<div class="tabs">${tabs.map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/requests/${k}">${h(l)}</a>`).join('')}</div>${body}`,
    mount: bindRequests,
  };
};
