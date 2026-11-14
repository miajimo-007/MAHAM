/* MAHAM — Analyst Desk — personal start page for analysts. */
'use strict';

P.home = () => {
  if (App.isDir()) return P.director(App.sub);
  if (App.isMgr()) return P.manager();
  const me = App.me,
    y = App.year,
    now = new Date(),
    mo = now.getMonth() + 1,
    today = U.todayStr();
  const m = Store.member(me);
  const live = m && m.scored ? Calc.monthScore(y, me, mo) : null;
  const heat = Calc.heatmap(y).rows.find(r => r.m.id === me);
  const myTodos = Calc.todos(null)
    .filter(t => t.r.analyst === me && t.status === 'In Progress')
    .sort((a, b) => UI.PRI_RANK[a.r.priority || 'Normal'] - UI.PRI_RANK[b.r.priority || 'Normal'] || (a.due > b.due ? 1 : -1)); // High priority first
  const myOpen = Calc.helpdesk(null).filter(x => x.mid === me && !x.closed);
  const todaySW = Store.all('shadow').filter(r => r.analyst === me && r.date === today);
  const swMonth = Calc.shadow(y)
    .filter(s => s.r.analyst === me && s.month === mo)
    .reduce((a, s) => a + s.hrs, 0);
  const att = Calc.attMap(y)[today + '|' + me];
  const hour = now.getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const hdUpd = Store.meta().helpdeskUpdated;
  const tlNote =
    App.can('importME') && hdUpd !== today
      ? `<div class="insights warnbox"><div>⚠ ManageEngine data has not been imported today (last: ${hdUpd ? U.fmtDate(hdUpd) : 'never'}). <a class="btn sm primary" href="#/helpdesk/import">Import now</a></div></div>`
      : '';
  const off = U.isOff(today);
  const attBtns =
    !App.canEdit('attendance') || !App.pageAllowed('attendance')
      ? ''
      : `<span class="muted">Today:</span>${off ? ` <span class="muted off-note" title="Mark only if you worked today">(${h(Store.holidayOf(today) || 'weekend')} — only if you worked)</span>` : ''}
      <button class="btn sm ${(!att && !off) || (att && att.status !== 'OFF') ? 'primary' : ''}" data-att="ON" title="You count as on duty unless you mark otherwise">On duty</button>
      <button class="btn sm ${att && att.status === 'OFF' ? 'primary' : ''}" data-att="OFF">Off / leave</button>
      <button class="btn sm ${att && +att.permHrs ? 'primary' : ''}" data-att="PR">Permission${att && +att.permHrs ? ` (${U.mins(att.permHrs)})` : ''}</button>`;
  const rq = Requests.mine().filter(
    r => Requests.isPending(r) || (r.status !== Requests.ST.X && (r.mgrOn || r.dirOn || '') >= U.addDays(today, -14))
  );
  const html = `<div class="hello one"><h1>${greet}, ${h(m ? m.short : me)}</h1><span class="muted hl-date">${U.fmtDate(today)}${off ? ' · ' + h(Store.holidayOf(today) || 'Weekend') : ''} · ${U.MONTHS[mo - 1]} ${y}</span>
    <div class="att-today">${attBtns}</div></div>
  ${annBanner()}${FB.banner()}${QS.card()}${tlNote}
  ${(() => {
    const SH = Custom.target('shadowHrs');
    const tl = [
      [
        'score',
        UI.kpi(
          'My score this month',
          live ? U.num(live.score, 2) : '–',
          live ? 'live — updates as you work' : m && m.scored ? 'no activity yet' : 'not scored',
          live ? UI.scoreClass(live.score) : ''
        ),
      ],
      ['ytd', UI.kpi('My YTD average', heat && heat.avg != null ? U.num(heat.avg, 2) : '–', String(y))],
      [
        'todo',
        UI.kpi(
          'Pending To Do',
          myTodos.length,
          myTodos.filter(t => t.timing === 'Delayed').length
            ? `<b class="t-bad">${myTodos.filter(t => t.timing === 'Delayed').length} delayed</b>`
            : 'none delayed'
        ),
      ],
      ['hd', UI.kpi('Open help desk', myOpen.length, 'requests assigned to you')],
      ['shadow', UI.kpi('Shadow work', U.num(swMonth, 1) + ' h', `this month · target ≥ ${SH} h`, swMonth >= SH ? 'sc-a' : '')],
    ].filter(([k]) => Custom.tile(k)); // which tiles: Admin → Customize
    return tl.length ? `<div class="kpis k${tl.length}">${tl.map(x => x[1]).join('')}</div>` : '';
  })()}
  </div>
  <div class="cols2">
    <div>${GC.myDayCard()}${myWorkCard()}
    ${monthGlance(me, y, mo, live)}
    </div>
    <div>
    ${quickShadowCard(me, today, todaySW)}
    ${
      rq.length
        ? card(
            `My requests <span class="count">${rq.length}</span>`,
            rq
              .slice(0, 5)
              .map(r => reqRow(r, { cancel: true }))
              .join(''),
            '<a href="#/requests" class="link">All →</a>'
          )
        : ''
    }
    </div>
  </div>`;
  return {
    title: 'Analyst Desk',
    html,
    mount(root) {
      bindQuickShadow(root);
      root.querySelectorAll('[data-done]').forEach(
        b =>
          (b.onclick = e => {
            e.stopPropagation();
            todoDone(b.dataset.done);
          })
      );
      root.querySelectorAll('[data-att]').forEach(b => (b.onclick = () => editAttendance(U.todayStr(), App.me, b.dataset.att)));
      bindScrum(root);
      bindRequests(root);
      bindAnn(root);
      QS.bind(root);
      GC.bindMyDay(root);
    },
  };
};

/* Analyst Desk: this month at a glance — where my score comes from, lazy days so far, and what is due in the next 7 days */
function monthGlance(me, y, mo, live) {
  const today = U.todayStr(),
    wk = U.addDays(today, 7);
  const S = Calc.scoring(y);
  const W = S.weights;
  const parts = live
    ? [
        ['To Do on time', live.todo, W.todo],
        ['Help desk', live.helpdesk, W.helpdesk],
        ['Shadow work', live.shadow, W.shadow],
        ['Quick wins', live.quickwins, W.quickwins],
        ['Attendance', live.attendance, W.attendance],
      ]
    : [];
  const lz = (() => {
    try {
      const r = Calc.lazy(y).res[me];
      return r && r[mo];
    } catch (e) {
      return null;
    }
  })();
  const inWork = new Set(
    (() => {
      try {
        return myWork(me).map(x => x.r && x.r.id);
      } catch (e) {
        return [];
      }
    })()
  );
  const due = [
    ...Calc.todos(null)
      .filter(t => t.r.analyst === me && t.status === 'In Progress' && t.due && t.due <= wk)
      .map(t => ({ id: t.r.id, d: t.due, t: 'To Do', s: t.r.task, e: `todo|${t.r.id}` })),
    ...Store.all('quickwin')
      .filter(q => q.analyst === me && U.lc(q.status) === 'in-progress' && q.expected && q.expected <= wk)
      .map(q => ({ id: q.id, d: q.expected, t: 'Quick win', s: q.subject, e: `quickwin|${q.id}` })),
    ...Store.all('ptask')
      .filter(t => t.assignee === me && t.status !== 'Done' && t.due && t.due <= wk)
      .map(t => ({ id: t.id, d: t.due, t: 'Project task', s: t.title, href: `#/project/${t.project}` })),
  ]
    .filter(x => !inWork.has(x.id))
    .sort((a, b) => a.d.localeCompare(b.d))
    .slice(0, 8); // what My work already lists is not repeated here
  if (!parts.length && !due.length && !(lz && lz.work)) return '';
  const row = x =>
    `<div class="li ${x.e ? 'click' : ''}" ${x.e ? `data-edit="${h(x.e)}"` : ''}><span class="grow">${x.href ? `<a href="${x.href}">${h(x.s)}</a>` : h(x.s)}<div class="muted small">${x.t}</div></span><span class="nw ${x.d < today ? 't-bad' : x.d === today ? 't-warn' : 'muted'}">${x.d < today ? 'late · ' : x.d === today ? 'today · ' : ''}${U.fmtDate(x.d)}</span></div>`;
  return card(
    `This month at a glance`,
    `${parts.length ? `<div class="glance">${parts.map(([l, v, w]) => `<div class="gl-row"><span>${l}</span><div class="pbar"><span style="width:${w ? Math.round((v / w) * 100) : 0}%"></span></div><b>${U.num(v, 1)}<span class="muted">/${w}</span></b></div>`).join('')}</div>` : ''}
    ${lz && lz.work ? `<p class="small ${lz.lazy ? '' : 'muted'}" style="margin:8px 0">${lz.lazy ? `⚠ <b>${lz.lazy}</b> of ${lz.work} working day${lz.work > 1 ? 's' : ''} this month have no recorded work.` : `✓ Work recorded on all ${lz.work} working days so far.`}</p>` : ''}
    ${due.length ? `<h4 class="glance-h">Also due in the next 7 days</h4>${due.map(row).join('')}` : ''}`
  );
}

/* Analyst Desk: log shadow work in a few seconds — remembers the last task type and source, and "↻ again" fills the form
 * from a recent entry (pick the minutes, Add) */
/* Log shadow work on the desk: what is typed and the items picked to link (kept while a window is open over it) */
const QSW = { links: [], draft: null };
/* the links line under the Reference: picked items (✕ to drop), "🔗 Link to…", and items with the same Reference offered */
function qsLinksHtml(ref) {
  const picked = QSW.links.map(id => Store.get(id)).filter(Boolean);
  const same =
    typeof WorkLinks === 'undefined'
      ? []
      : WorkLinks.byRef(ref)
          .filter(x => !QSW.links.includes(x.id))
          .slice(0, 4);
  return `${picked.map(x => `<span class="chip on" title="${h(Conv.title(x))}">🔗 ${h(WorkLinks.label(x))}: ${h(Conv.title(x).slice(0, 28))} <a href="#" data-qsun="${h(x.id)}" title="Do not link">✕</a></span>`).join(' ')}
    <button type="button" class="btn xs ghost" data-qspick>🔗 Link to…</button>
    ${same.length ? `<span class="muted small">Same reference:</span> ${same.map(x => `<button type="button" class="chip" data-qsadd="${h(x.id)}" title="Link this entry to it">＋ ${h(WorkLinks.label(x))}: ${h(Conv.title(x).slice(0, 28))}</button>`).join(' ')}` : ''}`;
}
function quickShadowCard(me, today, todaySW) {
  if (!App.pageAllowed('shadow') || !App.canEdit('shadow')) return '';
  const last = ps('home');
  const recent = quickShadowRecent(me, today);
  const dv = QSW.draft || {};
  const field = (f, v) => UI.field(f, dv[f.key] != null && dv[f.key] !== '' ? dv[f.key] : v);
  const form = `<form id="quicksw" class="quick">
      ${recent.length ? `<div class="q-again"><span class="muted small">Again:</span> ${recent.map((r, i) => `<button type="button" class="chip" data-again="${i}" title="${h(r.taskType)} · ${h(r.source)}${r.ref ? ' · ' + h(r.ref) : ''}">↻ ${h(r.subject.slice(0, 32))}</button>`).join(' ')}</div>` : ''}
      <div class="q-row q-subj">${field({ key: 'subject', label: 'Subject', type: 'text', required: true, placeholder: 'What did you work on?' }, '')}${field({ key: 'ref', label: 'Reference', type: 'text', placeholder: 'Req ID / TD-12 / SRS…' }, '')}</div>
      ${typeof WorkLinks !== 'undefined' && WorkLinks.canLink() ? `<div class="q-links" id="qslinks">${qsLinksHtml(dv.ref || '')}</div>` : ''}
      <div class="q-row">${field({ key: 'date', label: 'Date', type: 'date' }, today)}${field({ key: 'taskType', label: 'Task type', type: 'tasktype', required: true }, Store.list('taskTypes').includes(last.lastType) ? last.lastType : '')}${field({ key: 'source', label: 'Source', type: 'select', options: Store.list('sources'), required: true }, last.lastSource || '')}</div>
      <div class="q-row end">${field({ key: 'minutes', label: 'Duration (minutes)', type: 'minutes', required: true }, 30)}<button class="btn primary" type="submit">Add entry</button></div>
    </form>`;
  const todayList = todaySW.length
    ? `<h4>Today · ${U.num(U.sum(todaySW.map(r => r.minutes)) / 60, 2)} h</h4>` +
      todaySW
        .map(
          r =>
            `<div class="li click" data-edit="shadow|${h(r.id)}"><span>${h(r.subject)}</span><span class="muted">${h(r.taskType)} · ${r.minutes} min</span></div>`
        )
        .join('')
    : '<p class="muted">Nothing logged today yet.</p>';
  return card('Log shadow work', `${form}<div class="today-list">${todayList}</div>`);
}
/* my recent different entries (last 3 weeks), newest first — for "↻ again" */
function quickShadowRecent(me, today) {
  const from = U.addDays(today, -21);
  const seen = new Set();
  return Store.all('shadow')
    .filter(r => r.analyst === me && r.date >= from && r.subject)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b._ts || 0) - (a._ts || 0))
    .filter(r => {
      const k = U.lc(r.subject + '|' + (r.ref || ''));
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 6);
}
function bindQuickShadow(root) {
  const f = root.querySelector('#quicksw');
  if (!f) return;
  const set = (k, v) => {
    const el = f.querySelector(`[name=${k}]`);
    if (el && v != null) el.value = v;
  };
  f.querySelectorAll('[data-min]').forEach(b => (b.onclick = () => set('minutes', b.dataset.min)));
  const recent = quickShadowRecent(App.me, U.todayStr());
  f.querySelectorAll('[data-again]').forEach(
    b =>
      (b.onclick = () => {
        const r = recent[+b.dataset.again];
        if (!r) return;
        for (const k of ['taskType', 'source', 'subject', 'ref', 'minutes']) set(k, r[k]);
        f.querySelector('[name=minutes]').focus();
      })
  );
  const KEYS = [
    { key: 'date' },
    { key: 'taskType' },
    { key: 'source' },
    { key: 'subject' },
    { key: 'ref' },
    { key: 'minutes', type: 'minutes' },
  ];
  // linking: nothing links by itself — the person picks (🔗 Link to…) or clicks an item with the same Reference
  const box = f.querySelector('#qslinks');
  const refresh = () => {
    if (!box) return;
    box.innerHTML = qsLinksHtml(f.querySelector('[name=ref]').value);
    bindLinks();
  };
  const bindLinks = () => {
    if (!box) return;
    box.querySelectorAll('[data-qsun]').forEach(
      a =>
        (a.onclick = e => {
          e.preventDefault();
          QSW.links = QSW.links.filter(x => x !== a.dataset.qsun);
          refresh();
        })
    );
    box.querySelectorAll('[data-qsadd]').forEach(
      b =>
        (b.onclick = () => {
          if (!QSW.links.includes(b.dataset.qsadd)) QSW.links.push(b.dataset.qsadd);
          refresh();
        })
    );
    const pk = box.querySelector('[data-qspick]');
    if (pk)
      pk.onclick = () => {
        QSW.draft = UI.readForm(f, KEYS);
        WorkLinks.choose({
          title: '🔗 Link this shadow work to…',
          first: WorkLinks.byRef(QSW.draft.ref).map(x => x.id),
          picked: new Set(QSW.links),
          onOk: ids => {
            QSW.links = ids;
            App.render(true);
          },
          onCancel: () => App.render(true),
        });
      };
  };
  bindLinks();
  const ref = f.querySelector('[name=ref]');
  if (ref) ref.addEventListener('input', U.debounce(refresh, 300));
  f.onsubmit = e => {
    e.preventDefault();
    const v = UI.readForm(f, KEYS);
    if (!v.taskType || !v.source || !v.subject || !v.minutes) {
      UI.toast('Task type, source, subject and duration are needed', 'bad');
      return;
    }
    ps('home').lastType = v.taskType;
    ps('home').lastSource = v.source;
    const sw = Object.assign({ c: 'shadow', id: U.uid('shadow'), analyst: App.me }, v);
    const links = QSW.links
      .map(id => Store.get(id))
      .filter(Boolean)
      .map(x => WorkLinks.rec(sw, x))
      .filter(Boolean);
    Store.saveMany([sw, ...links]);
    QSW.links = [];
    QSW.draft = null;
    UI.toast(
      links.length ? `Shadow work added and linked to ${links.length} item${links.length > 1 ? 's' : ''}` : 'Shadow work added',
      'good'
    );
    App.render();
  };
}
