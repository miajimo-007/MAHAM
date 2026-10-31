/* DARRIK — Navigation: which pages a person may open, URL hash routing, rendering a page. */
'use strict';

Object.assign(App, {
  YEAR_PAGES: [
    'home',
    'todo',
    'shadow',
    'helpdesk',
    'attendance',
    'dashboard',
    'employee',
    'performance',
    'lazy',
    'quickwins',
    'oncall',
    'projperf',
    'perf',
    'director',
    'manager',
    'admin',
  ],
  pageAllowed(k) {
    if (['dashboard', 'performance', 'lazy', 'projperf'].includes(k) && !App.can('viewDashboards')) return false;
    if (k === 'admin' || k === 'adminperson' || k === 'settings' || k === 'syscheck' || k === 'importdata') return App.isSuper();
    if (k === 'director') return App.isDir() || App.isSuper();
    if (k === 'project') return Store.pageOn(App.me, 'projects', App.viewTeam);
    if (k === 'manager') return App.isMgr() || App.isSuper() || App.isActing();
    if (k === 'meetings' || k === 'meeting')
      return (
        Store.pageOn(App.me, 'meetings', App.viewTeam) &&
        (Meetings.canRun() || Store.all('meeting').some(m => (m.attendees || []).includes(App.me)))
      );
    if (k === 'about' || k === 'feedback') return true;
    if (k === 'perf') return PERF_TABS.some(([x]) => App.pageAllowed(x));
    if (k === 'oneonone' || k === 'overview') return App.isDir() || App.isSuper();
    if (Store.dirHidden(App.me, k)) return false;
    return Store.pageOn(App.me, k, App.viewTeam);
  },
  route() {
    const hsh = location.hash.replace(/^#\/?/, '').split('/');
    if (['home', 'manager', 'director'].includes(App.page) && App.me && !App.preview) markSeen(); // the desk I am leaving has been seen
    if (App.page && App.page !== 'feedback') App.lastPage = App.page;
    App.page = P[hsh[0]] ? hsh[0] : 'home';
    App.sub = hsh[1] || '';
    if (typeof Admin !== 'undefined')
      try {
        Admin.track(App.page);
      } catch (e) {
        console.error(e);
      } // usage (Admin → Home)
    UI.$$('[data-nav]').forEach(a =>
      a.classList.toggle(
        'on',
        a.dataset.nav ===
          ({
            project: 'projects',
            meeting: 'meetings',
            dashboard: 'perf',
            employee: 'perf',
            performance: 'perf',
            lazy: 'perf',
            projperf: 'perf',
          }[App.page] || App.page)
      )
    );
    App.render();
    UI.$('#main').scrollTop = 0;
    window.scrollTo(0, 0);
  },
  render(keepScroll) {
    const main = UI.$('#main');
    if (!main) return;
    const sy = window.scrollY,
      my = main.scrollTop;
    LS.set('bct.ps', App.ps);
    let pg;
    try {
      pg = App.pageAllowed(App.page)
        ? P[App.page](App.sub)
        : {
            title: 'Not available',
            html: '<div class="card"><p>You don\'t have permission to see this page. Ask your manager if you need it.</p></div>',
          };
    } catch (e) {
      console.error(e);
      pg = {
        title: 'Error',
        html: `<div class="card"><p class="t-bad">Something went wrong on this page.</p><pre>${U.h(e.stack || e)}</pre></div>`,
      };
    }
    UI.$('#ptitle').textContent = Custom.navLabel(App.page, pg.title);
    {
      const ys = UI.$('.yearsel #yearsel');
      if (ys) ys.closest('.yearsel').style.display = App.YEAR_PAGES.includes(App.page) ? '' : 'none';
    } // the year only changes these pages
    document.title = Custom.swap(Custom.navLabel(App.page, pg.title)) + ' · ' + Store.appName();
    const lvl = Store.PAGES.some(p => p[0] === App.page) ? App.level(App.page) : 'edit';
    main.innerHTML =
      (lvl === 'view'
        ? '<div class="insights viewonly"><div>👁 <b>View only</b> — you can look at this page but not change anything.</div></div>'
        : '') + pg.html;
    if (pg.mount) pg.mount(main);
    bindFilters(main);
    bindAdd(main);
    App.bindCopy(main);
    main.querySelectorAll('[data-href]').forEach(el =>
      el.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        location.hash = el.dataset.href;
      })
    );
    if (typeof bindMineActions === 'function') bindMineActions(main);
    main.querySelectorAll('[data-proj]').forEach(el =>
      el.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        location.hash = '#/project/' + el.dataset.proj;
      })
    );
    main.querySelectorAll('[data-edit]').forEach(el =>
      el.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        const [c, id] = el.dataset.edit.split('|');
        const r = Store.get(id);
        if (r) UI.editRecord(c, r);
      })
    );
    if (keepScroll !== false) {
      window.scrollTo(0, sy);
      main.scrollTop = my;
    }
    App.renderSync();
  },
  /* menu numbers, recounted after every change (they used to be counted only when the app opened) */
  menuCounts() {
    try {
      const set = (sel, n, title, href) =>
        UI.$$(sel).forEach(a => {
          let b = a.querySelector('.count');
          if (!n) {
            if (b) b.remove();
            if (a.dataset.home0) a.setAttribute('href', a.dataset.home0);
            return;
          }
          if (!b) {
            b = document.createElement('span');
            b.className = 'count';
            a.appendChild(b);
          }
          b.textContent = n;
          b.title = title;
          if (href) {
            if (!a.dataset.home0) a.dataset.home0 = a.getAttribute('href');
            a.setAttribute('href', href);
          }
        });
      set('nav a[data-nav="requests"]', Requests.waitingForMe().length, 'Requests waiting for your decision', '#/requests/approve');
      set(
        'nav a[data-nav="todo"]',
        Store.all('todo', '*').filter(t => Store.canConfirmTodo(t, App.me)).length,
        'Finished To Dos waiting for you to confirm'
      );
      set(
        'nav a[data-nav="projects"]',
        typeof Flow !== 'undefined' ? Flow.pendingForMe().length : 0,
        'Project moves waiting for your approval'
      );
      set(
        'nav a[data-nav="quickwins"]',
        typeof QS !== 'undefined' ? QS.pendingForMe().length : 0,
        'Shared quick wins waiting for you to confirm'
      );
      set('nav a[data-nav="feedback"]', App.isSuper() && typeof FB !== 'undefined' ? FB.newCount() : 0, 'New feedback');
    } catch (e) {
      /* never break the page */
    }
  },
});
