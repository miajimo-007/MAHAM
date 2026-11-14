/* MAHAM — 🔎 Search everything (Ctrl+K) and ＋ New, in the top bar.
 * Search looks through what the person can already see on the pages: To Dos (TD-12), shadow work, quick wins (QW ID),
 * follow-ups (RYD-702), projects and their tasks (PHX-3), personal tasks, Knowledge base articles and the menu's pages.
 * Each kind is shown only when its page is allowed, and only the records that page would list (own records only without
 * "See other people's records", the team being viewed, projects the person may see). Enter opens the item the usual way.
 * ＋ New lists only what the person may add (the same rules as each page's own add button) and opens the usual form. */
'use strict';

const Find = {
  q: '',
  sel: 0,
  hits: [],
  KIND_ORDER: ['Page', 'To Do', 'Project task', 'Project', 'Follow-up', 'Quick win', 'Shadow work', 'Personal task', 'Article'],
  /* everything this person can search, built when the window opens */
  items() {
    const out = [];
    const ok = p => {
      try {
        return App.pageAllowed(p);
      } catch (e) {
        return false;
      }
    };
    const add = (kind, key, title, sub, open, extra) =>
      out.push({
        kind,
        key: key || '',
        title: String(title || '')
          .replace(/\s+/g, ' ')
          .trim(),
        sub: sub || '',
        open,
        hay: U.lc([key, title, sub, extra].join(' ')),
      });
    const who = id => Store.memberShort(id);
    for (const a of document.querySelectorAll('nav a[data-nav][href^="#/"]')) {
      const l = (a.textContent || '')
        .replace(/\d+\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (l)
        add('Page', '', l, 'go to the page', () => {
          location.hash = a.getAttribute('href');
        });
    }
    if (ok('todo'))
      for (const r of App.mine(Store.all('todo'), x => x.analyst))
        add(
          'To Do',
          TodoId.key(r),
          r.task,
          `${who(r.analyst)} · ${UI.statusLabel(r.status || 'In Progress')}${r.assigned ? ' · ' + U.fmtDate(r.assigned) : ''}`,
          () => UI.editRecord('todo', Store.get(r.id) || r),
          r.ref
        );
    if (ok('shadow'))
      for (const r of App.mine(Store.all('shadow'), x => x.analyst))
        add(
          'Shadow work',
          r.ref || '',
          r.subject,
          `${who(r.analyst)} · ${U.fmtDate(r.date)} · ${r.minutes || 0} min`,
          () => UI.editRecord('shadow', Store.get(r.id) || r),
          r.taskType
        );
    if (ok('quickwins'))
      for (const r of App.mine(Store.all('quickwin'), x => x.analyst))
        add(
          'Quick win',
          r.qwId || '',
          r.subject,
          `${who(r.analyst)} · ${UI.statusLabel(r.status || '')}${r.module ? ' · ' + r.module : ''}`,
          () => UI.editRecord('quickwin', Store.get(r.id) || r),
          r.ref
        );
    if (ok('central') && typeof FollowUp !== 'undefined')
      for (const r of App.mine(Store.all('central'), x => x.analyst))
        add(
          'Follow-up',
          FollowUp.key(r),
          r.subject,
          `${who(r.analyst)}${r.redmine ? ' · ' + r.redmine : ''}`,
          () => UI.editRecord('central', Store.get(r.id) || r),
          [r.redmine, r.module].join(' ')
        );
    if (ok('projects')) {
      const ps = Store.all('project', '*').filter(p => Scrum.canSee(p));
      const seen = new Map(ps.map(p => [p.id, p]));
      for (const p of ps)
        add('Project', p.key || '', p.name, `${Store.teamName(p.team || 'apps')} · ${UI.statusLabel(p.status || '')}`, () => {
          location.hash = '#/project/' + p.id;
        });
      for (const t of Store.all('ptask', '*')) {
        const p = seen.get(t.project);
        if (p)
          add(
            'Project task',
            ptKey(t),
            t.title,
            `${p.name}${t.assignee ? ' · ' + who(t.assignee) : ''} · ${UI.statusLabel(t.status || '')}`,
            () => UI.editRecord('ptask', Store.get(t.id) || t)
          );
      }
    }
    if (ok('mytasks'))
      for (const t of Store.all('mytask', '*'))
        if (t.owner === App.me)
          add('Personal task', '', t.title, `${t.status || 'Open'}${t.due ? ' · due ' + U.fmtDate(t.due) : ''}`, () =>
            UI.editRecord('mytask', Store.get(t.id) || t)
          );
    if (ok('kb') && typeof KB !== 'undefined')
      for (const a of KB.list())
        add('Article', '', a.title, (a.tags || []).join(', '), () => KBUI.view(a), [a.problem, a.solution].join(' '));
    return out;
  },
  match(all, q) {
    const words = U.lc(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lq = U.lc(q.trim());
    const rank = x => (U.lc(x.key) === lq ? 0 : U.lc(x.key).startsWith(lq) ? 1 : U.lc(x.title).startsWith(lq) ? 2 : 3);
    const hits = all.filter(x => words.every(w => x.hay.includes(w)));
    const by = {};
    for (const x of hits) (by[x.kind] = by[x.kind] || []).push(x);
    return Find.KIND_ORDER.filter(k => by[k]).flatMap(k => by[k].sort((a, b) => rank(a) - rank(b)).slice(0, 6));
  },
  open() {
    if (UI.$('#modal')) return;
    const all = Find.items();
    Find.q = '';
    Find.sel = 0;
    Find.hits = [];
    UI.modal({
      title: '🔎 Search',
      wide: true,
      body: `<input type="search" id="fq" placeholder="Type a key (TD-12, RYD-702), a title, a reference or a page…" autocomplete="off" aria-label="Search everything">
        <div id="fres" class="find-res" role="listbox"><p class="muted small">Search To Dos, project tasks, projects, follow-ups, quick wins, shadow work, personal tasks, Knowledge base articles and pages. ↑ ↓ to move, Enter to open.</p></div>`,
      onMount: w => {
        const inp = w.querySelector('#fq');
        const res = w.querySelector('#fres');
        const draw = () => {
          Find.hits = Find.match(all, inp.value);
          if (Find.sel >= Find.hits.length) Find.sel = 0;
          if (!inp.value.trim()) return;
          if (!Find.hits.length) {
            res.innerHTML = '<p class="muted small">Nothing found.</p>';
            return;
          }
          let last = '';
          res.innerHTML = Find.hits
            .map((x, i) => {
              const head = x.kind !== last ? `<div class="find-kind">${h(x.kind)}</div>` : '';
              last = x.kind;
              return `${head}<a href="#" class="find-hit ${i === Find.sel ? 'on' : ''}" data-fi="${i}" role="option">${x.key ? `<span class="find-key nw">${h(x.key)}</span>` : ''}<span class="grow"><b>${h(x.title.length > 110 ? x.title.slice(0, 110) + '…' : x.title)}</b><span class="muted small"> · ${h(x.sub)}</span></span></a>`;
            })
            .join('');
          res.querySelectorAll('[data-fi]').forEach(
            a =>
              (a.onclick = e => {
                e.preventDefault();
                Find.go(+a.dataset.fi);
              })
          );
        };
        inp.addEventListener('input', () => {
          Find.sel = 0;
          draw();
        });
        inp.addEventListener('keydown', e => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!Find.hits.length) return;
            Find.sel = (Find.sel + (e.key === 'ArrowDown' ? 1 : -1) + Find.hits.length) % Find.hits.length;
            draw();
            const on = res.querySelector('.find-hit.on');
            if (on) on.scrollIntoView({ block: 'nearest' });
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            Find.go(Find.sel);
          }
        });
        setTimeout(() => inp.focus(), 40);
      },
    });
  },
  go(i) {
    const x = Find.hits[i];
    if (!x) return;
    UI.closeModal();
    setTimeout(() => x.open(), 0);
  },

  /* ＋ New: what this person may add, with the page's own rules */
  choices() {
    const ok = p => {
      try {
        return App.pageAllowed(p);
      } catch (e) {
        return false;
      }
    };
    const can = c => typeof addBtn === 'function' && !!addBtn(c, 'x');
    const out = [];
    if (ok('todo') && can('todo')) out.push(['☑', 'To Do', 'give work to someone in the team', () => UI.editRecord('todo', {})]);
    if (ok('shadow') && can('shadow')) out.push(['◐', 'Shadow work', 'log time you spent', () => UI.editRecord('shadow', {})]);
    if (ok('quickwins') && can('quickwin')) out.push(['⚡', 'Quick win', 'a small improvement', () => UI.editRecord('quickwin', {})]);
    if (ok('central') && can('central'))
      out.push(['↗', 'External follow-up', 'something waiting on an outside party', () => UI.editRecord('central', {})]);
    if (ok('projects')) {
      const ps = Find.taskProjects();
      if (ps.length) out.push(['◈', 'Project task', 'a task in one of your projects', () => Find.pickProject(ps)]);
    }
    if (ok('mytasks') && typeof PT !== 'undefined') out.push(['✔', 'Personal task', 'only you see it', () => PT.add('')]);
    if (
      ok('requests') &&
      App.canEdit('request') &&
      typeof Requests !== 'undefined' &&
      Requests.canRaise() &&
      typeof newRequest === 'function'
    )
      out.push(['✋', 'Request', 'leave, permission, training or another approval', () => newRequest()]);
    if (ok('kb') && typeof KBUI !== 'undefined')
      out.push([
        '📚',
        'Knowledge base article',
        'how a problem was solved',
        () => KBUI.editor({ vis: 'team', team: (Store.member(App.me) || {}).team || 'apps', tags: [] }, null),
      ]);
    return out;
  },
  /* open projects this person can add tasks to (the same rule as the project's "＋ Add task") */
  taskProjects() {
    return Store.all('project', '*')
      .filter(
        p =>
          Scrum.canSee(p) &&
          !['Done', 'Canceled', 'Closed'].includes(p.status) &&
          (Scrum.planner(p) || Scrum.member(p) || (typeof Work !== 'undefined' && Work.canAdd(p)))
      )
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  },
  pickProject(ps) {
    if (ps.length === 1) return Find.newTask(ps[0]);
    UI.modal({
      title: '＋ New project task — which project?',
      body: `<div class="find-res">${ps.map(p => `<a href="#" class="find-hit" data-np="${h(p.id)}">${p.key ? `<span class="find-key nw">${h(p.key)}</span>` : ''}<span class="grow"><b>${h(p.name)}</b><span class="muted small"> · ${h(Store.teamName(p.team || 'apps'))}</span></span></a>`).join('')}</div>`,
      onMount: w =>
        w.querySelectorAll('[data-np]').forEach(
          a =>
            (a.onclick = e => {
              e.preventDefault();
              const p = Store.get(a.dataset.np);
              UI.closeModal();
              if (p) setTimeout(() => Find.newTask(p), 0);
            })
        ),
    });
  },
  newTask(p) {
    UI.editRecord('ptask', { project: p.id, team: p.team, assignee: Scrum.planner(p) ? '' : App.me });
  },
  newMenu() {
    if (UI.$('#modal')) return;
    const list = Find.choices();
    if (!list.length) return UI.toast('There is nothing you can add here', '');
    UI.modal({
      title: '＋ New — what do you want to add?',
      body: `<div class="new-grid">${list.map((c, i) => `<button type="button" class="new-opt" data-nw="${i}"><span class="new-ic">${c[0]}</span><span><b>${h(c[1])}</b><small class="muted">${h(c[2])}</small></span></button>`).join('')}</div>`,
      onMount: w =>
        w.querySelectorAll('[data-nw]').forEach(
          b =>
            (b.onclick = () => {
              const c = list[+b.dataset.nw];
              UI.closeModal();
              setTimeout(c[3], 0);
            })
        ),
    });
  },

  /* the two top-bar buttons (app/shell.js) */
  buttons() {
    return `<button class="btn sm" id="gsearch" title="Search everything (Ctrl+K)">🔎 Search</button>${App.preview ? '' : '<button class="btn sm primary" id="gnew" title="Add something new">＋ New</button>'}`;
  },
  bind() {
    const s = UI.$('#gsearch');
    if (s) s.onclick = Find.open;
    const n = UI.$('#gnew');
    if (n) n.onclick = Find.newMenu;
    if (!Find._keys) {
      Find._keys = true;
      document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && U.lc(e.key) === 'k' && UI.$('#gsearch')) {
          e.preventDefault();
          Find.open();
        }
      });
    }
  },
};
