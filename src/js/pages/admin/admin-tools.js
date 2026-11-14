/* MAHAM — Admin tabs: Home (health tiles, reminders, usage), Month locks, Scoring what-if, Data (technician
 * names, clean-up, export, backup settings) and Change log (with undo). */
'use strict';

/* ---------------- Home ---------------- */
function adminHome() {
  const tiles = Admin.health();
  const today = U.todayStr();
  const notImported = Store.teams().filter(t => Store.meta(t.id).helpdeskUpdated !== today);
  const importers = ids =>
    Store.members().filter(
      m =>
        m.active !== false &&
        !Store.topRole(m.role) &&
        ids.includes(m.team || 'apps') &&
        (m.role === 'manager' || Store.can(m.id, 'importME', 1))
    );
  const use = Admin.usage(U.addDays(today, -6)).sort(
    (a, b) => (b.last || '').localeCompare(a.last || '') || a.m.name.localeCompare(b.m.name)
  );
  const used30 = {};
  for (const u of Admin.usage(U.addDays(today, -29))) for (const [p, n] of Object.entries(u.pages)) used30[p] = (used30[p] || 0) + n;
  const never = Store.PAGES.filter(([k]) => !used30[k]).map(([, l]) => l);
  const tracked = use.some(u => u.last);
  const html = `<div class="adm-tiles">${tiles.map(t => `<a class="adm-tile ${t.n && t.n !== '—' ? (t.bad ? 'bad' : 'warn') : 'ok'} ${t.warn ? 'warn' : ''}" href="${h(t.href)}" data-tile="${t.k}"><div class="kpi-label">${h(t.label)}</div><div class="kpi-val">${t.n === 0 ? '✓' : h(String(t.n))}${t.unit ? ` <small>${h(t.unit)}</small>` : ''}</div><div class="kpi-sub">${h(t.sub || '')}</div>${t.act || ''}</a>`).join('')}
    <a class="adm-tile" href="#/syscheck" id="bktile"><div class="kpi-label">Last automatic backup</div><div class="kpi-val">…</div><div class="kpi-sub">checking</div></a></div>
  <div class="cols2">
    ${App.recoveryOf(App.me) ? '' : card('🔑 Make a recovery code', `<p class="muted small">If you forget your PIN, a recovery code lets you set a new one from the login page. Without one, only another super admin could reset it.</p><div class="row-btns"><button class="btn primary" id="rcmake">Make my recovery code</button></div>`)}
    ${card(
      'Daily checklist',
      Admin.checklist()
        .map(
          x =>
            `<a class="li ck ${x.ok ? 'ok' : 'bad'}" href="${h(x.href)}"><span class="ckm">${x.ok ? '✓' : x.soon ? '⏰' : '⚠'}</span><span class="grow">${h(x.ok ? x.label : x.bad)}</span></a>`
        )
        .join('')
    )}
    ${(() => {
      const st = Admin.stuckTodos();
      if (!st.length) return card('To Dos waiting too long', empty('No finished To Do has waited more than 3 days for confirmation.'));
      const by = {};
      for (const t of st) {
        const m = Store.teamManager(t.team || 'apps');
        const k = m ? m.id : '_';
        (by[k] = by[k] || []).push(t);
      }
      return card(
        `To Dos waiting too long <span class="count">${st.length}</span>`,
        `<p class="muted small">Finished by the analyst, waiting 3+ days for the manager / team leader to confirm.</p>${Object.entries(by)
          .map(
            ([mid, l]) =>
              `<div class="stuck"><div class="li"><span class="grow"><b>${h(mid === '_' ? 'No manager' : Store.memberName(mid))}</b> <span class="muted small">${l.length} waiting${Dir.asked && Store.all('nudge', '*').some(n => n.kind === 'confirm' && n.to === mid && !Dir.answered(n)) ? ' · already asked' : ''}</span></span>${mid !== '_' ? `<button class="btn xs" data-askconfirm="${h(mid)}">Ask to confirm</button>` : ''}</div>${l.map(t => `<div class="li sub"><span class="grow">${h(t.task)} <span class="muted small">· ${h(Store.memberShort(t.analyst))} · finished ${U.fmtDate(t.finish)} (${U.diffDays(t.finish, U.todayStr())} days)</span></span></div>`).join('')}</div>`
          )
          .join('')}`
      );
    })()}
  </div>
  <div class="cols2">
    ${card(
      'Reminders & messages',
      `<p class="muted small">A reminder is an announcement only the chosen people see (for 7 days); you can see who has read it in <a class="link" href="#/announcements">Announcements</a>.</p>
      <div class="li"><span class="grow"><b>People with no PIN</b> <span class="muted small">${Store.members().filter(m => m.active !== false && !Store.pinOf(m.id)).length} person(s)</span></span><button class="btn xs" data-remind="pin">Remind them</button></div>
      <div class="li"><span class="grow"><b>ManageEngine not imported today</b> <span class="muted small">${h(notImported.map(t => t.name).join(', ') || 'all imported')}</span></span>${notImported.length ? '<button class="btn xs" data-remind="me">Remind managers / team leaders</button>' : ''}</div>
      <div class="li"><span class="grow"><b>Message a team or everyone</b></span><button class="btn xs" id="msgteam">New announcement</button></div>
      <div class="li"><span class="grow"><b>Message chosen people</b></span><button class="btn xs" id="msgpeople">Choose people…</button></div>`
    )}
    ${card(
      'Usage — last 7 days',
      tracked
        ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Person</th><th>Last opened</th><th class="num">Days</th><th class="num">Pages viewed</th></tr></thead><tbody>${use.map(u => `<tr><td><a class="link" href="#/adminperson/${h(u.m.id)}">${h(u.m.name)}</a></td><td>${u.last ? (u.last === today ? UI.badge('Today', 'good') : U.fmtDate(u.last)) : '<span class="muted">not this version yet</span>'}</td><td class="num">${u.days || ''}</td><td class="num">${u.views || ''}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">${never.length ? `Not used by anyone in the last 30 days: ${h(never.join(', '))}.` : 'Every function was used in the last 30 days.'}</p>`
        : empty('Usage is recorded from this version on — check back in a few days.')
    )}
  </div>`;
  return {
    html,
    mount(root) {
      {
        const rcm = root.querySelector('#rcmake');
        if (rcm) rcm.onclick = () => App.recoveryDialog();
      }
      const remind = k => {
        if (k === 'pin')
          sendReminder(
            Store.members()
              .filter(m => m.active !== false && !Store.pinOf(m.id) && m.id !== App.me)
              .map(m => m.id),
            'Please set your PIN',
            'Click your name at the bottom-left of the app and choose "Set my PIN". Until you do, anyone on a shared PC can sign in as you.'
          );
        if (k === 'me')
          sendReminder(
            importers(notImported.map(t => t.id)).map(m => m.id),
            "Please import today's ManageEngine report",
            'IT Help Desk → Import → choose today\'s "daily details report". Scores use it for help-desk requests and closing time.'
          );
      };
      root.querySelectorAll('[data-askconfirm]').forEach(
        b =>
          (b.onclick = e => {
            e.preventDefault();
            const mid = b.dataset.askconfirm;
            const ids = Admin.stuckTodos()
              .filter(t => {
                const m = Store.teamManager(t.team || 'apps');
                return m && m.id === mid;
              })
              .map(t => t.id);
            Store.save({
              id: U.uid('nudge'),
              c: 'nudge',
              to: mid,
              from: App.me,
              kind: 'confirm',
              about: '',
              ids,
              text: `${ids.length} finished To Do(s) have waited 3+ days — please Confirm or Send back`,
              at: Date.now(),
            });
            UI.toast(`Asked ${Store.memberShort(mid)} to confirm`, 'good');
            App.render();
          })
      );
      root.querySelectorAll('[data-remind]').forEach(
        b =>
          (b.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            remind(b.dataset.remind);
          })
      );
      root.querySelector('#msgteam').onclick = () => annDialog();
      root.querySelector('#msgpeople').onclick = () =>
        UI.modal({
          title: 'Message chosen people',
          wide: true,
          body: `<form class="grid-form" id="mpf">${UI.field({ key: 'title', label: 'Title', type: 'text', required: true, span: 2 }, '')}${UI.field({ key: 'body', label: 'Message', type: 'textarea', span: 2, rows: 4 }, '')}
        <div class="fld span2"><label>Who</label><div class="pick">${Store.members()
          .filter(m => m.active !== false && m.id !== App.me)
          .map(
            m =>
              `<label class="check"><input type="checkbox" name="who" value="${h(m.id)}"> ${h(m.short || m.name)} <span class="muted small">${h(Store.topRole(m.role) ? Store.roleLabel(m.role) : Store.teamName(m.team))}</span></label>`
          )
          .join('')}</div></div></form>`,
          actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Send</button>`,
          onMount: w => {
            w.querySelector('[data-c]').onclick = UI.closeModal;
            w.querySelector('[data-ok]').onclick = () => {
              const f = w.querySelector('#mpf');
              const v = UI.readForm(f, [{ key: 'title' }, { key: 'body' }]);
              const ids = [...f.querySelectorAll('[name=who]:checked')].map(c => c.value);
              if (!v.title || !ids.length) return UI.toast('Write a title and pick people', 'bad');
              UI.closeModal();
              sendReminder(ids, v.title, v.body);
            };
          },
        });
      Store.listBackups()
        .then(l => {
          const el = root.querySelector('#bktile');
          if (!el) return;
          const last = l.filter(b => !b.tag).sort((a, b) => b.mtime - a.mtime)[0];
          const old = !last || U.ds(new Date(last.mtime)) < U.addDays(U.todayStr(), -1);
          el.classList.add(old ? 'bad' : 'ok');
          el.querySelector('.kpi-val').textContent = last ? U.fmtDate(U.ds(new Date(last.mtime))) : 'none';
          el.querySelector('.kpi-sub').textContent = `${l.length} backup file(s) kept · keep ${Store.backupKeep()} days`;
        })
        .catch(() => {});
    },
  };
}

/* ---------------- Month locks ---------------- */
function adminMonths() {
  const y = App.year;
  const now = new Date();
  const cur = y < now.getFullYear() ? 12 : y > now.getFullYear() ? 0 : now.getMonth() + 1;
  const info = (t, mo) => {
    const s = Store.all('scoresnap', t).filter(r => +r.year === y && +r.month === mo);
    if (!s.length) return null;
    const first = s.reduce((a, b) => ((a._ts || 0) <= (b._ts || 0) ? a : b));
    return { n: s.length, by: first._by, at: first._ts };
  };
  const teams = Store.teams();
  const html = card(
    `Month locks — ${y}`,
    `<p class="muted small">A locked month keeps its scores fixed; analysts can no longer change its To Dos, shadow work, quick wins or attendance. Unlocking recalculates live. Change the year at the top.</p>
    <div class="tbl-scroll"><table class="tbl locks"><thead><tr><th>Team</th>${U.MONTHS.map((l, i) => `<th class="ctr">${l.slice(0, 3)}</th>`).join('')}</tr></thead><tbody>
    ${teams
      .map(
        t =>
          `<tr><td><b>${h(t.name)}</b></td>${U.MONTHS.map((l, i) => {
            const mo = i + 1;
            const s = info(t.id, mo);
            if (mo > cur) return '<td class="ctr muted">·</td>';
            return s
              ? `<td class="ctr locked" title="Locked ${U.fmtTs(s.at)} by ${h(Store.memberName(s.by))} · ${s.n} score(s)"><button class="btn xs ghost" data-unlock="${h(t.id)}|${mo}">🔒</button><div class="tiny muted">${h(Store.memberShort(s.by))}</div></td>`
              : `<td class="ctr"><button class="btn xs" data-lockm="${h(t.id)}|${mo}" title="Lock ${l} for ${h(t.name)}">Lock</button></td>`;
          }).join('')}</tr>`
      )
      .join('')}
    </tbody></table></div>
    ${cur > 1 ? `<div class="row-btns"><button class="btn primary" id="lockprev">Lock ${U.MONTHS[cur >= 2 ? cur - 2 : 0]} for every team</button></div>` : ''}`
  );
  const inTeam = (t, fn) => {
    const keep = App.viewTeam;
    App.viewTeam = t;
    try {
      return fn();
    } finally {
      App.viewTeam = keep;
    }
  };
  const lockRecs = (t, mo) =>
    inTeam(t, () => {
      const recs = [];
      for (const m of Store.scoredTeam()) {
        if (Calc.snapshot(y, m.id, mo) != null) continue;
        const c = Calc.monthScore(y, m.id, mo);
        if (c)
          recs.push({ id: `snap-${y}-${U.pad(mo)}-${m.id}`, c: 'scoresnap', analyst: m.id, year: y, month: mo, score: c.score, team: t });
      }
      return recs;
    });
  return {
    html,
    mount(root) {
      root.querySelectorAll('[data-lockm]').forEach(
        b =>
          (b.onclick = () => {
            const [t, mo] = b.dataset.lockm.split('|');
            UI.confirm(`Lock ${U.MONTHS[mo - 1]} ${y} for ${Store.teamName(t)} at the current scores?`, () => {
              const r = lockRecs(t, +mo);
              if (!r.length) return UI.toast('No scores to lock for that month (nobody was active)', 'warn');
              Store.saveMany(r);
              UI.toast(`${U.MONTHS[mo - 1]} locked for ${Store.teamName(t)}`, 'good');
              App.render();
            });
          })
      );
      root.querySelectorAll('[data-unlock]').forEach(
        b =>
          (b.onclick = () => {
            const [t, mo] = b.dataset.unlock.split('|');
            UI.confirm(
              `Unlock ${U.MONTHS[mo - 1]} ${y} for ${Store.teamName(t)}? Scores will be recalculated live, and analysts can edit that month again.`,
              () => {
                const recs = Store.all('scoresnap', t)
                  .filter(r => +r.year === y && +r.month === +mo)
                  .map(r => Object.assign({}, r, { _del: true }));
                Store.saveMany(recs);
                UI.toast(`${U.MONTHS[mo - 1]} unlocked for ${Store.teamName(t)}`, 'good');
                App.render();
              }
            );
          })
      );
      const lp = root.querySelector('#lockprev');
      if (lp)
        lp.onclick = () => {
          const mo = cur - 1;
          UI.confirm(`Lock ${U.MONTHS[mo - 1]} ${y} for every team that hasn't locked it?`, () => {
            const recs = teams.flatMap(t => lockRecs(t.id, mo));
            Store.saveMany(recs);
            UI.toast(`${recs.length} score(s) locked`, 'good');
            App.render();
          });
        };
    },
  };
}

/* ---------------- Scoring what-if ---------------- */
function adminScoring() {
  const t = App.viewTeam;
  const S = Calc.scoring();
  const y = App.year;
  const now = new Date();
  const last = y < now.getFullYear() ? 12 : now.getMonth() + 1;
  const html = card(
    `Scoring what-if — ${h(Store.teamName(t))} ${y}`,
    `<p class="muted small">Try other weights and see how each person's score would change before you save. Switch team at the top. Locked months keep their locked score either way.</p>
    <div class="grid-form wif">${Object.entries(S.weights)
      .map(([k, v]) => UI.field({ key: 'w_' + k, label: k + ' (%)', type: 'number', min: 0, step: 5 }, v))
      .join('')}</div>
    <p id="wiftot" class="small"></p><div id="wiftbl"></div>
    <div class="row-btns"><button class="btn ghost" id="wifreset">Back to current</button><span class="grow"></span><a class="link small" href="#/admin/lists">Tiers and other rules: Lists &amp; scoring</a><button class="btn primary" id="wifsave">Save these weights for ${h(Store.teamName(t))}</button></div>`
  );
  const weights = root => {
    const w = {};
    for (const k of Object.keys(S.weights)) w[k] = +root.querySelector(`[name="w_${k}"]`).value || 0;
    return w;
  };
  const table = W => {
    const alt = Object.assign({}, S, { weights: W });
    const rows = [];
    for (const m of Store.scoredTeam()) {
      const a = [],
        b = [];
      for (let mo = 1; mo <= last; mo++) {
        const c = Calc.monthScore(y, m.id, mo);
        if (!c) continue;
        a.push(c.score);
        Calc._whatIf = alt;
        try {
          b.push(Calc.monthScore(y, m.id, mo).score);
        } finally {
          Calc._whatIf = null;
        }
      }
      rows.push({ m, now: a.length ? U.avg(a) : null, alt: b.length ? U.avg(b) : null, mnow: a[a.length - 1], malt: b[b.length - 1] });
    }
    const d = (x, y2) =>
      x == null || y2 == null
        ? ''
        : (() => {
            const v = U.r2(y2 - x);
            return `<span class="${v > 0 ? 't-good' : v < 0 ? 't-bad' : 'muted'}">${v > 0 ? '+' : ''}${U.num(v, 1)}</span>`;
          })();
    return rows.length
      ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Person</th><th class="num">Year average now</th><th class="num">With new weights</th><th class="num">Change</th><th class="num">Latest month now</th><th class="num">New</th><th class="num">Change</th></tr></thead><tbody>${rows.map(r => `<tr><td>${h(r.m.name)}</td><td class="num">${r.now == null ? '–' : U.num(r.now, 1)}</td><td class="num"><b>${r.alt == null ? '–' : U.num(r.alt, 1)}</b></td><td class="num">${d(r.now, r.alt)}</td><td class="num">${r.mnow == null ? '–' : U.num(r.mnow, 1)}</td><td class="num">${r.malt == null ? '–' : U.num(r.malt, 1)}</td><td class="num">${d(r.mnow, r.malt)}</td></tr>`).join('')}</tbody></table></div>`
      : empty('No scored people with data in this team yet.');
  };
  return {
    html,
    mount(root) {
      const upd = () => {
        const W = weights(root);
        const tot = U.sum(Object.values(W));
        const ok = Math.abs(tot - 100) < 0.01;
        root.querySelector('#wiftot').innerHTML =
          `Total <b class="${ok ? 't-good' : 't-bad'}">${tot}%</b>${ok ? '' : ' — weights must add up to 100% to save'}`;
        root.querySelector('#wiftbl').innerHTML = table(W);
        root.querySelector('#wifsave').disabled = !ok;
      };
      root.querySelectorAll('.wif input').forEach(i => (i.oninput = U.debounce(upd, 250)));
      upd();
      root.querySelector('#wifreset').onclick = () => App.render();
      root.querySelector('#wifsave').onclick = () => {
        const W = weights(root);
        const midYear = new Date().getMonth() > 0;
        UI.confirm(
          `Save the new weights for ${Store.teamName(t)}?${midYear ? ' This is mid-year: every month that is not locked will be recalculated with them.' : ''}`,
          () => {
            const sc = Object.assign({}, Store.tset('settings-scoring', 'scoring', null) || {}, { weights: W });
            Calc.saveScoring(t, Object.assign({}, S, sc), App.year);
            UI.toast('Weights saved', 'good');
            App.render();
          }
        );
      };
    },
  };
}

/* ---------------- Data ---------------- */
function adminData() {
  const un = Admin.unmatched();
  const ign = Admin.ignoredTech();
  const ret = Admin.retiredRefs();
  const dups = Admin.duplicates();
  const tests = Admin.testRecords();
  const people = Store.members()
    .filter(m => m.active !== false && !Store.topRole(m.role))
    .sort((a, b) => a.name.localeCompare(b.name));
  const label = c => (typeof COLL_LABEL !== 'undefined' && COLL_LABEL[c]) || c;
  const what = r => r.task || r.subject || r.title || r.name || r.course || r.description || r.id;
  const html = `${Health.card()}${card(
    `Technician names in ManageEngine <span class="count">${un.length}</span>`,
    `<p class="muted small">Help-desk rows whose technician doesn't match anyone are not counted in scores. Match a name to a person (it is added to their "Other names"), or ignore it if it isn't one of your people.</p>
    ${un.length ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Name in ManageEngine</th><th class="num">Rows</th><th>Teams</th><th>Is this…</th><th></th></tr></thead><tbody>${un.map((x, i) => `<tr><td><b>${h(x.name)}</b></td><td class="num">${x.n}</td><td>${h([...x.teams].map(Store.teamName).join(', '))}</td><td><select data-tm="${i}"><option value="">— pick a person —</option>${people.map(m => `<option value="${h(m.id)}">${h(m.name)} (${h(Store.teamName(m.team))})</option>`).join('')}</select></td><td class="nw"><button class="btn xs" data-tmatch="${i}">Match</button> <button class="btn xs ghost" data-tign="${i}">Ignore</button></td></tr>`).join('')}</tbody></table></div>` : empty('Every technician name matches someone.')}
    ${ign.length ? `<p class="muted small">Ignored: ${ign.map((n, i) => `${h(n)} <a class="link" href="#" data-tunign="${i}">undo</a>`).join(' · ')}</p>` : ''}`
  )}
  ${card(`Open work with retired people <span class="count">${ret.length}</span>`, ret.length ? ret.map(x => `<div class="li click" data-goperson="${h(x.m.id)}"><b class="grow">${h(x.m.name)}</b><span class="muted small">${Admin.workCount(x.w)} open item(s)</span><button class="btn xs">Hand over →</button></div>`).join('') : empty('Nothing is left with retired people.'))}
  <div class="cols2">
    ${card(
      `Possible duplicates <span class="count">${dups.length}</span>`,
      dups.length
        ? `<div class="scroll-list">${dups
            .slice(0, 60)
            .map(
              (g, i) =>
                `<div class="li"><span class="grow"><b>${h(label(g.c))}</b> · ${h(String(what(g.list[0])).slice(0, 70))} <span class="muted small">${h(Store.memberShort(g.list[0].analyst) || '')} · ${g.list.length} copies</span></span><button class="btn xs" data-dup="${i}">Keep newest</button></div>`
            )
            .join('')}</div><div class="row-btns"><button class="btn" id="dupall">Keep the newest of every group</button></div>`
        : empty('No duplicates found.')
    )}
    ${card(
      `Possible test data <span class="count">${tests.length}</span>`,
      tests.length
        ? `<div class="scroll-list">${tests
            .slice(0, 100)
            .map(
              (x, i) =>
                `<label class="li check"><input type="checkbox" data-test="${i}"> <span class="grow"><b>${h(label(x.r.c))}</b> · ${h(String(x.what).slice(0, 80))} <span class="muted small">${h(Store.memberShort(x.r._by) || '')} ${x.r._ts ? U.fmtDate(U.ds(new Date(x.r._ts))) : ''}</span></span></label>`
            )
            .join('')}</div><div class="row-btns"><button class="btn danger" id="testdel">Delete ticked</button></div>`
        : empty('Nothing that looks like test data (words like "test", "dummy", "asdf").')
    )}
  </div>
  <div class="cols2">
    ${card('Folders & connection', `${App.pathsHtml()}<p class="muted small">Only you see these paths. ${Store.filePath() ? `You opened the app from: ${h(Store.filePath())}.` : ''} Test saving and re-read all files in <a class="link" href="#/syscheck">System Check</a>.</p>`)}
    ${card(
      'Who gave older tasks',
      (() => {
        const old = [...Store.all('mgrtask'), ...Store.all('project')].filter(r => !r.givenBy && !r._del);
        const dirs = Store.members().filter(m => Store.topRole(m.role) && m.active !== false);
        return `<p class="muted small">Director tasks and projects from before the app recorded who gave them are visible to every director. Say who gave them, so each director sees only his own.</p><div class="li"><span class="grow">Without "given by"</span><b>${old.length}</b></div>${old.length ? `<form class="grid-form" id="gbf">${UI.field({ key: 'who', label: 'They were all given by', type: 'select', options: dirs.map(m => [m.id, m.name]), blank: false }, (dirs[0] || {}).id)}</form><div class="row-btns"><button class="btn" id="gbset">Set on all ${old.length}</button></div>` : ''}`;
      })()
    )}
    ${card(
      'Clean up deleted records',
      (() => {
        const n = Store.purgeable(30).size;
        return `<p class="muted small">Deleting something only marks it as deleted, so the data files keep growing. This removes, from every file, records deleted more than 30 days ago, admin-log entries older than 6 months and read receipts of finished announcements. A backup is made first.</p><div class="li"><span class="grow">Can be removed now</span><b>${n.toLocaleString()}</b></div>${n ? '<div class="row-btns"><button class="btn" id="purgedel">🧹 Remove them</button></div>' : ''}`;
      })()
    )}
    ${card(
      'Help-desk storage',
      (() => {
        const st = Store.staleHelpdesk();
        const files = new Set(st.map(x => x.file)).size;
        return `<p class="muted small">Each request is stored once by its Request ID; a daily import only saves new and changed requests. When different people import, an older copy can stay in someone else's file.</p>
      <div class="li"><span class="grow">Help-desk requests in use</span><b>${Store.all('helpdesk', '*').length.toLocaleString()}</b></div>
      <div class="li"><span class="grow">Older copies in other files</span><b>${st.length.toLocaleString()}${files ? ` <span class="muted small">in ${files} file(s)</span>` : ''}</b></div>
      ${st.length ? '<div class="row-btns"><button class="btn" id="hdcompact">🧹 Remove older copies</button></div>' : ''}`;
      })()
    )}
    ${LabFind.card()}
    ${card('Export everything', `<p class="muted small">One Excel file with every kind of record (one sheet each), for audit or reporting. Nothing leaves this PC.</p><div class="row-btns"><button class="btn primary" id="exportall2">⬇ Download Excel</button></div>`)}
    ${card(
      'Backups',
      `<form class="grid-form" id="bkf">${UI.field({ key: 'keep', label: 'Keep daily backups for (days)', type: 'number', min: 7, step: 1 }, Store.backupKeep())}${UI.field({ key: 'remindDays', label: 'Remind me to copy one elsewhere every (days)', type: 'number', min: 7, step: 1 }, Store.setting('settings-backup', 'remindDays', 30))}</form>
      <p class="muted small">Last copy kept elsewhere: <b>${Store.setting('settings-backup', 'lastCopy', '') ? U.fmtDate(Store.setting('settings-backup', 'lastCopy', '')) : 'never'}</b>. Download a full backup here (or in <a class="link" href="#/syscheck">System Check</a>, where you can also restore one from a file) and put it somewhere safe (it's counted automatically).</p>
      <div class="row-btns"><button class="btn primary" id="bkfull2" title="Every team's work, settings, workflows, people and permissions in one zip">⬇ Download full backup</button><button class="btn ghost" id="bkcopied">I copied one today</button><span class="grow"></span><button class="btn primary" id="bksave">Save</button></div>`
    )}
  </div>`;
  return {
    html,
    mount(root) {
      root.querySelectorAll('[data-goperson]').forEach(
        el =>
          (el.onclick = () => {
            location.hash = '#/adminperson/' + el.dataset.goperson;
          })
      );
      Health.bind(root);
      root.querySelectorAll('[data-tmatch]').forEach(
        b =>
          (b.onclick = () => {
            const x = un[+b.dataset.tmatch];
            const mid = root.querySelector(`[data-tm="${b.dataset.tmatch}"]`).value;
            if (!mid) return UI.toast('Pick the person first', 'bad');
            saveMembersAll(
              Store.members().map(m =>
                m.id === mid ? Object.assign({}, m, { aliases: [...new Set([...(m.aliases || []), x.name])] }) : m
              ),
              `"${x.name}" is now ${Store.memberName(mid)} — their rows count from now`
            );
          })
      );
      const saveIgn = names => {
        Store.save({ id: 'settings-techignore', c: 'settings', names });
        App.render();
      };
      root.querySelectorAll('[data-tign]').forEach(b => (b.onclick = () => saveIgn([...ign, un[+b.dataset.tign].name])));
      root.querySelectorAll('[data-tunign]').forEach(
        a =>
          (a.onclick = e => {
            e.preventDefault();
            saveIgn(ign.filter((_, i) => i !== +a.dataset.tunign));
          })
      );
      const killDups = gs => {
        const recs = gs.flatMap(g => g.list.slice(1).map(r => Object.assign({}, r, { _del: true })));
        Store.saveMany(recs);
        UI.toast(`${recs.length} duplicate(s) removed`, 'good');
        App.render();
      };
      root.querySelectorAll('[data-dup]').forEach(b => (b.onclick = () => killDups([dups[+b.dataset.dup]])));
      const da = root.querySelector('#dupall');
      if (da)
        da.onclick = () =>
          UI.confirm(
            `Remove ${U.sum(dups.map(g => g.list.length - 1))} duplicate record(s), keeping the newest of each group? A daily backup exists if you need one back.`,
            () => killDups(dups)
          );
      const td = root.querySelector('#testdel');
      if (td)
        td.onclick = () => {
          const sel = [...root.querySelectorAll('[data-test]:checked')].map(c => tests[+c.dataset.test].r);
          if (!sel.length) return UI.toast('Tick the records to delete', 'bad');
          UI.confirm(`Delete ${sel.length} record(s)?`, () => {
            Store.saveMany(sel.map(r => Object.assign({}, r, { _del: true })));
            UI.toast(`${sel.length} deleted`, 'good');
            App.render();
          });
        };
      const gb = root.querySelector('#gbset');
      if (gb)
        gb.onclick = () => {
          const who = root.querySelector('#gbf [name=who]').value;
          const recs = [...Store.all('mgrtask'), ...Store.all('project')]
            .filter(r => !r.givenBy && !r._del)
            .map(r => Object.assign({}, r, { givenBy: who }));
          UI.confirm(`Record ${Store.memberName(who)} as the giver of ${recs.length} older task(s) / project(s)?`, () => {
            Store.saveMany(recs);
            UI.toast('Done', 'good');
            App.render();
          });
        };
      const pd = root.querySelector('#purgedel');
      if (pd)
        pd.onclick = () =>
          UI.confirm(
            'Remove records deleted more than 30 days ago (and old log entries) from every data file? A backup is saved first.',
            async () => {
              try {
                const n = await Store.purgeDeleted(30);
                UI.toast(`${n} old record(s) removed`, 'good');
                App.render();
              } catch (e) {
                UI.toast('Could not clean up: ' + e.message, 'bad');
              }
            }
          );
      const hc = root.querySelector('#hdcompact');
      if (hc)
        hc.onclick = () =>
          UI.confirm(
            'Remove older copies of help-desk requests from the data files? A backup is saved first; the requests in use do not change.',
            async () => {
              try {
                const n = await Store.compactHelpdesk();
                UI.toast(`${n} older cop${n === 1 ? 'y' : 'ies'} removed`, 'good');
                App.render();
              } catch (e) {
                UI.toast('Could not clean up: ' + e.message, 'bad');
              }
            }
          );
      root.querySelector('#exportall2').onclick = () => {
        exportAll();
        Store.noteCopied();
      };
      LabFind.bind(root);
      const bkSave = patch => {
        Store.save(Object.assign({}, Store.get('settings-backup') || { id: 'settings-backup', c: 'settings' }, patch));
        UI.toast('Saved', 'good');
        App.render();
      };
      root.querySelector('#bksave').onclick = () => {
        const v = UI.readForm(root.querySelector('#bkf'), [
          { key: 'keep', type: 'number' },
          { key: 'remindDays', type: 'number' },
        ]);
        bkSave({ keep: Math.max(7, Math.min(365, +v.keep || 30)), remindDays: Math.max(7, +v.remindDays || 30) });
      };
      root.querySelector('#bkcopied').onclick = () => bkSave({ lastCopy: U.todayStr() });
      root.querySelector('#bkfull2').onclick = async e => {
        const b = e.currentTarget;
        b.disabled = true;
        try {
          const n = await Store.downloadFullBackup();
          UI.toast(n + ' downloaded — keep it somewhere safe', 'good');
          App.render();
        } catch (er) {
          UI.toast('Backup failed: ' + er.message, 'bad');
          b.disabled = false;
        }
      };
    },
  };
}

/* ---------------- Change log ---------------- */
function adminLog() {
  const q = U.lc(LS.get('bct.adm.logq', ''));
  const all = Admin.entries();
  const list = all.filter(e => !q || U.lc([e.what, ...(e.lines || [])].join(' ')).includes(q)).slice(0, 300);
  const html = card(
    `Change log <span class="count">${all.length}</span>`,
    `<div class="page-actions"><span class="muted small">Every change you make in Admin, Settings and people's PINs. The latest change of a setting can be undone for ${Admin.UNDO_MIN} minutes (if nobody changed it since).</span><span class="grow"></span><input id="logq" type="search" placeholder="Filter…" value="${h(LS.get('bct.adm.logq', ''))}"></div>
    ${
      list.length
        ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>When</th><th>Area</th><th>What changed</th><th></th></tr></thead><tbody>${list
            .map(
              e =>
                `<tr class="${e.undone ? 'muted' : ''}"><td class="nw">${U.fmtTs(e.at)}</td><td class="nw">${h(e.what)}${e.undoOf ? ' <span class="badge">undo</span>' : ''}${e.mode ? ` <span class="badge ${e.mode === 'admin' ? 'warn' : ''}">as ${e.mode === 'admin' ? 'Admin' : 'analyst'}</span>` : ''}</td><td class="small">${(
                  e.lines || []
                )
                  .slice(0, 12)
                  .map(l => h(l))
                  .join(
                    '<br>'
                  )}${(e.lines || []).length > 12 ? `<br>…and ${(e.lines || []).length - 12} more` : ''}</td><td class="nw">${e.undone ? '<span class="muted small">undone</span>' : Admin.canUndo(e) ? `<button class="btn xs" data-undo="${h(e.id)}">↶ Undo</button>` : ''}</td></tr>`
            )
            .join('')}</tbody></table></div>`
        : empty(all.length ? 'Nothing matches.' : 'No admin changes recorded yet (they are recorded from this version on).')
    }`
  );
  return {
    html,
    mount(root) {
      root.querySelector('#logq').oninput = U.debounce(e => {
        LS.set('bct.adm.logq', root.querySelector('#logq').value);
        App.render();
      }, 400);
      root.querySelectorAll('[data-undo]').forEach(
        b =>
          (b.onclick = () => {
            const e = Store.get(b.dataset.undo);
            UI.confirm(
              `Undo "${(e.lines || [])[0] || e.what}"${(e.lines || []).length > 1 ? ` and ${(e.lines || []).length - 1} more change(s)` : ''}?`,
              () => {
                if (Admin.undo(e)) UI.toast('Undone', 'good');
                else UI.toast('It can no longer be undone (it was changed again or is too old)', 'bad');
                App.render();
              }
            );
          })
      );
    },
  };
}

/* ---------------- Scoring → Months: "Not counted" / "Set score" (whole team or one person) ---------------- */
function adminScoreMonths() {
  const t = App.viewTeam || 'apps';
  const y = App.year;
  const id = 'settings-scoremonths-' + t;
  const rec = Store.get(id) || { id, c: 'settings', months: {}, people: {} };
  const key = mo => `${y}-${U.pad(mo)}`;
  const team = Store.scoredTeam();
  const tm = mo => (rec.months || {})[key(mo)];
  const pm = (mid, mo) => (rec.people || {})[mid + '|' + key(mo)];
  const cell = (m, mo) => {
    const own = pm(m.id, mo);
    const mk = Calc.monthMark(y, m.id, mo);
    const sc = Calc.score(y, m.id, mo);
    const txt = mk && mk.kind === 'skip' ? '⊘' : sc ? U.num(sc.score, 1) + (sc.set ? '✎' : '') : '·';
    return `<td class="ctr sm-cell ${mk ? 'sm-' + mk.kind : ''} ${own ? 'own' : ''}"><button class="btn xs ghost" data-smc="${h(m.id)}|${mo}" title="${mk ? h((mk.kind === 'set' ? 'Set score' : 'Not counted') + (own ? '' : ' (whole team)') + (mk.note ? ': ' + mk.note : '') + ' — ' + Store.memberShort(mk.by)) : 'Normal (calculated)'}">${txt}</button></td>`;
  };
  const html = card(
    `Months — ${h(Store.teamName(t))} ${y}`,
    `<p class="muted small">Click a <b>month</b> to set it for the whole team, or a <b>cell</b> for one person. <b>⊘ Not counted</b> = no score that month and it is left out of the yearly average. <b>✎ Set score</b> = the number you type is used instead of the calculated one. Every change is in the Change log.</p>
    <div class="tbl-scroll"><table class="tbl smonths"><thead><tr><th>Person</th>${U.MONTHS.map((l, i) => {
      const m = tm(i + 1);
      return `<th class="ctr"><button class="btn xs ${m && m.kind !== 'normal' ? 'sm-' + m.kind : 'ghost'}" data-smm="${i + 1}" title="${m && m.kind !== 'normal' ? h((m.kind === 'skip' ? 'Not counted' : 'Set score ' + m.score) + (m.note ? ': ' + m.note : '')) : 'Whole team: normal'}">${l.slice(0, 3)}${m && m.kind === 'skip' ? ' ⊘' : m && m.kind === 'set' ? ' ✎' : ''}</button></th>`;
    }).join('')}<th class="num">Year</th></tr></thead>
    <tbody>${
      team
        .map(m => {
          const hr = Calc.heatmap(y).rows.find(r => r.m.id === m.id);
          return `<tr><td class="nw"><b>${h(m.short || m.name)}</b></td>${U.MONTHS.map((l, i) => cell(m, i + 1)).join('')}<td class="num strong">${hr && hr.avg != null ? U.num(hr.avg, 2) : ''}</td></tr>`;
        })
        .join('') || `<tr><td colspan="14">${empty('Nobody is scored in this team.')}</td></tr>`
    }</tbody></table></div>`
  );
  const dialog = (title, cur, forPerson, done) =>
    UI.modal({
      title,
      body: `<form class="grid-form" id="smf"><div class="fld span2"><label>This month</label><div class="seg-pick">${[
        ['normal', forPerson ? 'Normal (follow the team)' : 'Normal (calculated)'],
        ['skip', '⊘ Not counted'],
        ['set', '✎ Set score'],
      ]
        .map(
          ([k, l]) =>
            `<label class="check"><input type="radio" name="kind" value="${k}" ${(cur ? cur.kind : 'normal') === k ? 'checked' : ''}> ${l}</label>`
        )
        .join('')}</div></div>
      ${UI.field({ key: 'score', label: 'Score (0–100)', type: 'number', min: 0, step: 0.5 }, cur && cur.kind === 'set' ? cur.score : '')}${UI.field({ key: 'note', label: 'Reason', type: 'text', span: 2, placeholder: 'e.g. Peak season · 6 weeks leave · new site activation' }, cur ? cur.note || '' : '')}</form>`,
      actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const kind = w.querySelector('[name=kind]:checked').value;
          const score = w.querySelector('[name=score]').value;
          const note = w.querySelector('[name=note]').value.trim();
          if (kind === 'set' && (score === '' || +score < 0 || +score > 100)) return UI.toast('Type a score from 0 to 100', 'bad');
          if (kind !== 'normal' && !note) return UI.toast('Write the reason', 'bad');
          done(kind === 'normal' ? null : { kind, score: kind === 'set' ? +score : undefined, note, by: App.me, at: Date.now() });
          UI.closeModal();
        };
      },
    });
  const save = (fn, msg) => {
    const r = JSON.parse(JSON.stringify(Store.get(id) || rec));
    r.months = r.months || {};
    r.people = r.people || {};
    fn(r);
    Store.save(r);
    Calc.invalidate();
    UI.toast(msg, 'good');
    App.render();
  };
  return {
    html,
    mount(root) {
      root.querySelectorAll('[data-smm]').forEach(
        b =>
          (b.onclick = () => {
            const mo = +b.dataset.smm;
            dialog(`${U.MONTHS[mo - 1]} ${y} — whole ${Store.teamName(t)} team`, tm(mo), false, mk =>
              save(
                r => {
                  if (mk) r.months[key(mo)] = mk;
                  else delete r.months[key(mo)];
                },
                mk ? (mk.kind === 'skip' ? 'Month not counted for the team' : 'Score set for the team') : 'Month back to normal'
              )
            );
          })
      );
      root.querySelectorAll('[data-smc]').forEach(
        b =>
          (b.onclick = () => {
            const [mid, mo] = b.dataset.smc.split('|');
            dialog(`${U.MONTHS[mo - 1]} ${y} — ${Store.memberName(mid)}`, pm(mid, +mo), true, mk =>
              save(
                r => {
                  const k = mid + '|' + key(+mo);
                  if (mk) r.people[k] = mk;
                  else delete r.people[k];
                },
                mk ? 'Saved' : 'Back to the team setting'
              )
            );
          })
      );
    },
  };
}

/* ---------------- Findings from MAHAM Lab: an analyst's findings file → info items or To Dos ---------------- */
const LabFind = {
  file: null,
  card() {
    return card(
      'Findings from MAHAM Lab',
      `<p class="muted small">An analyst's findings file from MAHAM Lab (📌 Findings → Send to MAHAM). It has titles and notes only — no rows and no pictures. Each finding becomes an info item or a To Do.</p><label class="btn"><input type="file" id="labfind" accept=".json" hidden>📂 Load a findings file…</label><div id="labfindbox"></div>`
    );
  },
  ref: (f, i) => `lab:${f.at}#${i}`,
  bind(root) {
    const inp = root.querySelector('#labfind');
    if (!inp) return;
    const box = root.querySelector('#labfindbox');
    inp.onchange = async () => {
      const file = inp.files[0];
      inp.value = '';
      box.innerHTML = '';
      if (!file) return; // cleared so the same file can be picked again
      let f;
      try {
        f = JSON.parse(await file.text());
      } catch (e) {
        return UI.toast('This is not a findings file', 'bad');
      }
      if (!f || f.kind !== 'maham-lab-findings' || !Array.isArray(f.items)) return UI.toast('This is not a MAHAM Lab findings file', 'bad');
      f.items = f.items
        .slice(0, 200)
        .map(x => ({
          title: String(x.title || '').slice(0, 300),
          note: String(x.note || '').slice(0, 4000),
          at: String(x.at || '').slice(0, 10),
        }))
        .filter(x => x.title);
      LabFind.file = f;
      const done = new Set([...Store.all('info', '*'), ...Store.all('todo', '*')].map(r => r.labRef).filter(Boolean));
      box.innerHTML = `<p class="small">From <b>${h(f.by || '?')}</b> · dataset <b>${h(f.dataset || '?')}</b> (${h(f.label || '')}) · ${h(U.fmtDate(String(f.at).slice(0, 10)))}</p>
        <div class="scroll-list">${f.items
          .map((x, i) => {
            const was = done.has(LabFind.ref(f, i));
            return `<label class="li check"><input type="checkbox" data-lf="${i}" ${was ? 'disabled' : 'checked'}> <span class="grow"><b>${h(x.title)}</b>${x.note ? `<div class="muted small">${h(x.note.slice(0, 220))}${x.note.length > 220 ? '…' : ''}</div>` : ''}</span>${was ? '<span class="badge">already added</span>' : ''}</label>`;
          })
          .join('')}</div>
        <form class="grid-form" id="lff">${UI.field(
          {
            key: 'as',
            label: 'Add them as',
            type: 'select',
            options: [
              ['info', 'Info items (Reference)'],
              ['todo', 'To Do tasks'],
            ],
            blank: false,
          },
          'info'
        )}${UI.field({ key: 'who', label: 'To Do for', type: 'member' }, App.me)}${UI.field({ key: 'days', label: 'Due in (days)', type: 'number', min: 0, step: 1 }, 7)}</form>
        <div class="row-btns"><span class="grow"></span><button class="btn primary" id="lfadd">Add</button></div>`;
      const sync = () => {
        const todo = box.querySelector('[name=as]').value === 'todo';
        box.querySelector('[name=who]').closest('.fld').style.display = todo ? '' : 'none';
        box.querySelector('[name=days]').closest('.fld').style.display = todo ? '' : 'none';
      };
      box.querySelector('[name=as]').onchange = sync;
      sync();
      box.querySelector('#lfadd').onclick = () => {
        const pick = [...box.querySelectorAll('[data-lf]:checked')].map(c => +c.dataset.lf);
        if (!pick.length) return UI.toast('Tick at least one finding', 'bad');
        const as = box.querySelector('[name=as]').value,
          who = box.querySelector('[name=who]').value,
          days = Math.max(0, +box.querySelector('[name=days]').value || 0);
        if (as === 'todo' && !who) return UI.toast('Pick who the To Dos are for', 'bad');
        const src = `MAHAM Lab · ${f.dataset || 'dataset'} · ${f.by || ''} · ${U.fmtDate(String(f.at).slice(0, 10))}`;
        const recs = pick.map(i => {
          const x = f.items[i];
          const labRef = LabFind.ref(f, i);
          if (as === 'info')
            return {
              id: U.uid('info'),
              c: 'info',
              category: 'MAHAM Lab findings',
              title: x.title,
              value: `${x.note ? x.note + '\n\n' : ''}— ${src}`,
              labRef,
            };
          const r = {
            id: U.uid('todo'),
            c: 'todo',
            task: `${x.title}${x.note ? '\n' + x.note : ''}`.slice(0, 2000),
            analyst: who,
            assigned: U.todayStr(),
            duration: days,
            priority: 'Normal',
            fu: false,
            status: 'In Progress',
            instruction: `From a MAHAM Lab finding (${src})`,
            labRef,
          };
          if (Schemas.todo && Schemas.todo.beforeSave) Schemas.todo.beforeSave(r);
          return r;
        });
        Store.saveMany(recs);
        UI.toast(`${recs.length} finding${recs.length > 1 ? 's' : ''} added as ${as === 'info' ? 'info items' : 'To Dos'}`, 'good');
        LabFind.file = null;
        App.render();
      };
    };
  },
};
