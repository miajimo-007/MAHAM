/* DARRIK — My Day — personal start page for analysts. */
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
  const riy = Store.all('central')
    .filter(r => r.analyst === me)
    .map(r => ({ r, c: Calc.centralComment(r) }))
    .filter(x => x.c && !['Request closed', 'New', 'Waiting deployment'].includes(x.c));
  const qw = Store.all('quickwin')
    .filter(r => r.analyst === me && !qwHistory(r))
    .map(r => ({ r, c: Calc.qwComment(r) }))
    .filter(x => /Overdue|Due|Insert|Read Comment|Follow/.test(x.c));
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
    !App.canEdit('attendance') || !App.pageAllowed('attendance') || off
      ? ''
      : `<span class="muted">Today:</span>
      <button class="btn sm ${!att || att.status !== 'OFF' ? 'primary' : ''}" data-att="ON" title="You count as on duty unless you mark otherwise">On duty</button>
      <button class="btn sm ${att && att.status === 'OFF' ? 'primary' : ''}" data-att="OFF">Off / leave</button>
      <button class="btn sm ${att && +att.permHrs ? 'primary' : ''}" data-att="PR">Permission${att && +att.permHrs ? ` (${att.permHrs}h)` : ''}</button>`;
  const nAct = riy.length + qw.length + myOpen.length;
  const rq = Requests.mine().filter(
    r => Requests.isPending(r) || (r.status !== Requests.ST.X && (r.mgrOn || r.dirOn || '') >= U.addDays(today, -14))
  );
  const html = `<div class="hello"><div><h1>${greet}, ${h(m ? m.short : me)}</h1><p class="muted">${U.fmtDate(today)}${off ? ' · ' + h(Store.holidayOf(today) || 'Weekend') : ''} · ${U.MONTHS[mo - 1]} ${y}</p></div>
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
    <div>${myWorkCard()}
    ${
      nAct
        ? card(
            `Needs your action <span class="count">${nAct}</span>`,
            [
              ...myOpen
                .slice(0, 8)
                .map(
                  x =>
                    `<div class="li"><span class="grow">Help desk #${h(x.r.reqId)} — ${h(x.r.subject)}</span>${UI.sbadge(x.r.status)}</div>`
                ),
              ...riy.map(
                x =>
                  `<div class="li click" data-edit="central|${h(x.r.id)}"><span class="grow">Central: ${h(x.r.subject)}</span>${UI.sbadge(x.c)}</div>`
              ),
              ...qw.map(
                x =>
                  `<div class="li click" data-edit="quickwin|${h(x.r.id)}"><span class="grow">Quick win: ${h(x.r.subject)}</span>${UI.sbadge(x.c)}</div>`
              ),
            ].join('')
          )
        : ''
    }
    </div>
    <div>
    ${
      !App.pageAllowed('shadow') || !App.canEdit('shadow')
        ? ''
        : card(
            'Log shadow work',
            `<form id="quicksw" class="quick">
      <div class="q-row">${UI.field({ key: 'date', label: 'Date', type: 'date' }, today)}${UI.field({ key: 'taskType', label: 'Task type', type: 'tasktype', required: true }, ps('home').lastType || '')}${UI.field({ key: 'source', label: 'Source', type: 'select', options: Store.list('sources'), required: true }, ps('home').lastSource || '')}</div>
      <div class="q-row">${UI.field({ key: 'subject', label: 'Subject', type: 'text', required: true, placeholder: 'What did you work on?' }, '')}${UI.field({ key: 'ref', label: 'Reference', type: 'text', placeholder: 'Req ID / caller / SRS…' }, '')}</div>
      <div class="q-row end">${UI.field({ key: 'minutes', label: 'Duration (minutes)', type: 'minutes', required: true }, 30)}<button class="btn primary" type="submit">Add entry</button></div>
    </form>
    <div class="today-list">${todaySW.length ? `<h4>Today · ${U.num(U.sum(todaySW.map(r => r.minutes)) / 60, 2)} h</h4>` + todaySW.map(r => `<div class="li click" data-edit="shadow|${h(r.id)}"><span>${h(r.subject)}</span><span class="muted">${h(r.taskType)} · ${r.minutes} min</span></div>`).join('') : '<p class="muted">Nothing logged today yet.</p>'}</div>`
          )
    }
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
    ${!nAct ? '<div class="oneline">✓ Nothing waiting on you from help desk, Central or quick wins.</div>' : ''}
    </div>
  </div>`;
  return {
    title: 'My Day',
    html,
    mount(root) {
      const f = root.querySelector('#quicksw');
      if (f) {
        f.querySelectorAll('[data-min]').forEach(
          b =>
            (b.onclick = () => {
              f.querySelector('[name=minutes]').value = b.dataset.min;
            })
        );
        f.onsubmit = e => {
          e.preventDefault();
          const v = UI.readForm(f, [
            { key: 'date' },
            { key: 'taskType' },
            { key: 'source' },
            { key: 'subject' },
            { key: 'ref' },
            { key: 'minutes', type: 'minutes' },
          ]);
          if (!v.taskType || !v.source || !v.subject || !v.minutes) {
            UI.toast('Task type, source, subject and duration are needed', 'bad');
            return;
          }
          ps('home').lastType = v.taskType;
          ps('home').lastSource = v.source;
          Store.save(Object.assign({ c: 'shadow', analyst: App.me }, v));
          UI.toast('Shadow work added', 'good');
          App.render();
        };
      }
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
    },
  };
};
