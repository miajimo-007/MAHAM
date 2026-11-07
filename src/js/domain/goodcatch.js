/* MAHAM — Good Catch: anyone records an issue or an enhancement opportunity they noticed, what they did about
 * it, and someone (them or anyone else) takes it and resolves it. Seen by the whole department (all teams).
 *   finder (createdBy)  edits the details          taker  updates status / resolution
 *   "Change or delete other people's items"  changes anything      updates log (gcupdate): each person's own lines
 * Not scored — counted on Performance and the Manager Desk as recognition. The finder sees on Analyst Desk when it is resolved. */
'use strict';

const GC = {
  ST: { N: 'New', P: 'In progress', R: 'Resolved', X: 'Not an issue', W: "Won't fix" },
  OPEN: ['New', 'In progress'],
  KINDS: ['Issue', 'Enhancement opportunity'],
  all() {
    return Store.all('gcatch');
  },
  isOpen(g) {
    return GC.OPEN.includes(g.status || 'New');
  },
  finder(g) {
    return g.createdBy || g._by || '';
  },
  isFinder(g) {
    return !g || !g.id || GC.finder(g) === App.me;
  },
  isTaker(g) {
    return !!g && !!g.taker && App.forMe(g.taker);
  },
  canAll(g) {
    return App.isSuper() || GC.isFinder(g) || App.can('editOthers');
  },
  canWork(g) {
    return GC.canAll(g) || GC.isTaker(g);
  },
  canTake(g) {
    return !!g && GC.isOpen(g) && !g.taker && App.canEdit('gcatch');
  },
  updates(id) {
    return Store.all('gcupdate')
      .filter(u => u.catch === id)
      .sort((a, b) => (a.at || a._ts || 0) - (b.at || b._ts || 0));
  },
  days(g) {
    return U.diffDays(g.found || U.todayStr(), g.resolvedOn || U.todayStr());
  },
  note(g, text) {
    Store.save({ c: 'gcupdate', catch: g.id, text, at: Date.now() });
  },
  take(g) {
    const cur = Store.get(g.id) || g;
    if (!GC.canTake(cur)) return UI.toast('Someone has already taken it', 'bad');
    Store.saveMany([
      Object.assign({}, cur, { taker: App.me, status: GC.ST.P }),
      { c: 'gcupdate', catch: g.id, text: '🙋 Took it', at: Date.now() },
    ]);
    UI.toast("It's yours — add what you do in the updates", 'good');
    App.render();
  },
  release(g) {
    const cur = Store.get(g.id) || g;
    Store.saveMany([
      Object.assign({}, cur, { taker: '', status: GC.ST.N }),
      { c: 'gcupdate', catch: g.id, text: '↩ Let it go — open for anyone', at: Date.now() },
    ]);
    App.render();
  },
  resolve(g) {
    const cur = Store.get(g.id) || g;
    UI.modal({
      title: '✓ Resolve: ' + cur.title,
      body: `<form class="grid-form" id="gcr">${UI.field({ key: 'status', label: 'Outcome', type: 'select', options: [GC.ST.R, GC.ST.X, GC.ST.W], blank: false }, GC.ST.R)}${UI.field({ key: 'resolution', label: 'What fixed it / why', type: 'textarea', span: 2, rows: 3, required: true }, cur.resolution || '')}</form>`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>',
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const st = w.querySelector('[name=status]').value,
            res = w.querySelector('[name=resolution]').value.trim();
          if (!res) return UI.toast('Write what fixed it (or why not)', 'bad');
          Store.saveMany([
            Object.assign({}, cur, {
              status: st,
              resolution: res,
              resolvedOn: U.todayStr(),
              resolvedBy: App.me,
              taker: cur.taker || App.me,
            }),
            { c: 'gcupdate', catch: cur.id, text: `✓ ${st}: ${res}`, at: Date.now() },
          ]);
          UI.closeModal();
          UI.toast(
            st === GC.ST.R
              ? 'Resolved ✓ — ' + Store.memberShort(GC.finder(cur)) + ' will see it on Analyst Desk'
              : 'Closed: ' + st.toLowerCase(),
            'good'
          );
          App.render();
        };
      },
    });
  },
  toQuickWin(g) {
    const who = g.resolvedBy || g.taker || App.me;
    const mgr = App.can('manageTeam'); // an analyst adds quick wins for themselves; the one who fixed it is named as co-worker
    UI.editRecord(
      'quickwin',
      {
        analyst: mgr ? who : App.me,
        coWorkers: !mgr && who !== App.me ? [who] : [],
        subject: g.title,
        date: g.found || U.todayStr(),
        expected: g.resolvedOn || U.todayStr(),
        status: 'Completed',
        type: 'Modification',
        module: (Store.list('modules') || []).find(m => U.lc(m) === U.lc(g.system || '')) || '',
        impact: [g.details, g.resolution].filter(Boolean).join('\n'),
        fromCatch: g.id,
      },
      {
        title: 'Good catch → quick win',
        savedMsg: 'Quick win added from the good catch',
        with: () => [
          Object.assign({}, Store.get(g.id) || g, { convertedTo: 'quickwin' }),
          { c: 'gcupdate', catch: g.id, text: '⚡ Turned into a quick win', at: Date.now() },
        ],
      }
    );
  },
  toProject(g) {
    UI.editRecord(
      'preq',
      {
        title: g.title,
        problem: g.details || g.title,
        benefit: '',
        dept: g.where || '',
        urgency: g.impact === 'High' ? 'High' : 'Normal',
        status: 'Waiting',
        team: (Store.member(App.me) || {}).team || 'apps',
        at: Date.now(),
        fromCatch: g.id,
      },
      {
        title: 'Good catch → project suggestion',
        with: () => [
          Object.assign({}, Store.get(g.id) || g, { convertedTo: 'project' }),
          { c: 'gcupdate', catch: g.id, text: '◈ Suggested as a project', at: Date.now() },
        ],
      }
    );
  },
  /* the panel under the form: buttons and the updates log */
  panel(form, g) {
    if (!g.id) return;
    const box = document.createElement('div');
    box.className = 'ptx gc-panel';
    form.parentNode.insertBefore(box, form.nextSibling);
    const draw = () => {
      const cur = Store.get(g.id) || g;
      const ups = GC.updates(g.id);
      const can = GC.canWork(cur);
      box.innerHTML = `<div class="row-btns tight">${GC.canTake(cur) ? '<button type="button" class="btn sm primary" data-gct>🙋 I\'ll take it</button>' : ''}${GC.isOpen(cur) && can ? '<button type="button" class="btn sm" data-gcr>✓ Resolve…</button>' : ''}${GC.isOpen(cur) && cur.taker && GC.isTaker(cur) ? '<button type="button" class="btn sm ghost" data-gcl>Let it go</button>' : ''}<span class="grow"></span>${!GC.isOpen(cur) && can && !cur.convertedTo ? `${cur.kind !== 'Issue' && cur.status === GC.ST.R ? '<button type="button" class="btn sm" data-gcqw>⚡ → Quick win</button>' : ''}` : ''}${can && !cur.convertedTo && cur.status !== GC.ST.X ? ' <button type="button" class="btn sm ghost" data-gcpj>◈ → Project suggestion</button>' : ''}</div>
        <h4 class="act-h">Updates <span class="count">${ups.length}</span></h4>
        <div class="ptx-cm">${ups.map(u => `<div class="ptx-c"><div class="small"><b>${h(Store.memberShort(u.createdBy || u._by))}</b> <span class="muted">${U.fmtTs(u.at || u._ts)}</span></div><div class="info-val">${h(u.text)}</div></div>`).join('') || '<p class="muted small">No updates yet.</p>'}</div>
        ${App.canEdit('gcatch') ? '<div class="row-btns tight"><textarea id="gcnew" rows="2" placeholder="What did you do / find? (no patient names or MRNs)" style="flex:1"></textarea><button type="button" class="btn sm primary" id="gcadd">Add update</button></div>' : ''}`;
      const on = (sel, f) => {
        const b = box.querySelector(sel);
        if (b) b.onclick = f;
      };
      on('[data-gct]', () => {
        UI.closeModal();
        GC.take(cur);
      });
      on('[data-gcl]', () => {
        UI.closeModal();
        GC.release(cur);
      });
      on('[data-gcr]', () => {
        UI.closeModal();
        setTimeout(() => GC.resolve(cur), 0);
      });
      on('[data-gcqw]', () => {
        UI.closeModal();
        setTimeout(() => GC.toQuickWin(cur), 0);
      });
      on('[data-gcpj]', () => {
        UI.closeModal();
        setTimeout(() => GC.toProject(cur), 0);
      });
      on('#gcadd', () => {
        const v = box.querySelector('#gcnew').value.trim();
        if (!v) return;
        GC.note(cur, v);
        draw();
      });
    };
    draw();
  },
  /* Analyst Desk: my catches someone resolved in the last 14 days (until I press OK) */
  seenKey() {
    return 'bct.gcseen.' + App.me;
  },
  resolvedForMe() {
    let seen = [];
    try {
      seen = JSON.parse(localStorage.getItem(GC.seenKey()) || '[]');
    } catch (e) {
      seen = [];
    }
    const from = U.addDays(U.todayStr(), -14);
    return GC.all().filter(
      g =>
        GC.finder(g) === App.me &&
        g.status === GC.ST.R &&
        g.resolvedBy &&
        g.resolvedBy !== App.me &&
        (g.resolvedOn || '') >= from &&
        !seen.includes(g.id)
    );
  },
  myDayCard() {
    const l = GC.resolvedForMe();
    if (!l.length) return '';
    return card(
      `🎯 Your good catches were resolved <span class="count">${l.length}</span>`,
      l
        .map(
          g =>
            `<div class="li click" data-edit="gcatch|${h(g.id)}"><div class="grow"><b>${h(g.title)}</b><div class="muted small">by ${h(Store.memberShort(g.resolvedBy))} · ${U.fmtDate(g.resolvedOn)}${g.resolution ? ' — ' + h(g.resolution.split('\n')[0]) : ''}</div></div></div>`
        )
        .join(''),
      '<a href="#" class="link" data-gcseen>OK, seen</a>'
    );
  },
  bindMyDay(root) {
    const a = root.querySelector('[data-gcseen]');
    if (a)
      a.onclick = e => {
        e.preventDefault();
        try {
          const k = GC.seenKey();
          const s = JSON.parse(localStorage.getItem(k) || '[]');
          localStorage.setItem(k, JSON.stringify([...new Set([...s, ...GC.resolvedForMe().map(g => g.id)])].slice(-300)));
        } catch (err) {
          /* private window */
        }
        App.render();
      };
  },
  /* counts per person (recognition, not scored) */
  counts(id, y) {
    const inY = d => String(d || '').slice(0, 4) === String(y);
    const l = GC.all();
    return {
      found: l.filter(g => GC.finder(g) === id && inY(g.found)).length,
      resolved: l.filter(g => g.resolvedBy === id && g.status === GC.ST.R && inY(g.resolvedOn)).length,
    };
  },
  mgrCard() {
    const team = Store.team ? Store.team().filter(m => m.active !== false) : [];
    const ids = new Set(team.map(m => m.id));
    const mo = U.todayStr().slice(0, 7);
    const l = GC.all();
    const found = l.filter(g => ids.has(GC.finder(g)) && (g.found || '').startsWith(mo)).length;
    const res = l.filter(g => ids.has(g.resolvedBy) && g.status === GC.ST.R && (g.resolvedOn || '').startsWith(mo)).length;
    const free = l.filter(g => GC.isOpen(g) && !g.taker).length;
    if (!found && !res && !free) return '';
    return `<div class="oneline">🎯 Good catches this month: <b>${found}</b> found · <b>${res}</b> resolved by the team${free ? ` · <a class="link" href="#/oncall/goodcatch">${free} open with nobody on it →</a>` : ''}</div>`;
  },
};
