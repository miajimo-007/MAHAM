/* MAHAM — Navigation: which pages a person may open, URL hash routing, rendering a page. */
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
    if (k === 'admin') return App.isSuper() || AdminRole.any(App.me);
    if (k === 'syscheck') return App.isSuper() || AdminRole.can(App.me, 'syscheck');
    if (k === 'adminperson' || k === 'settings' || k === 'importdata') return App.isSuper();
    if (k === 'director') return App.isDir() || App.isSuper();
    if (k === 'project' || k === 'workdash') return Store.pageOn(App.me, 'projects', App.viewTeam);
    if (k === 'manager') return App.isMgr() || App.isSuper() || App.isActing();
    if (k === 'meetings' || k === 'meeting')
      return (
        Store.pageOn(App.me, 'meetings', App.viewTeam) &&
        (Meetings.canRun() || Store.all('meeting').some(m => (m.attendees || []).includes(App.me)))
      );
    if (k === 'about' || k === 'feedback') return true;
    if (k === 'usage') return Admin.canSee(); // Admin decides (permission "See usage")
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
    const navKey =
      App.page === 'oncall'
        ? App.sub === 'goodcatch'
          ? 'goodcatch'
          : 'oncall'
        : App.page === 'helpdesk' && App.sub === 'import' && UI.$('nav [data-nav="hdimport"]')
          ? 'hdimport'
          : {
              project: 'projects',
              adminperson: 'admin',
              meeting: 'meetings',
              dashboard: 'perf',
              employee: 'perf',
              performance: 'perf',
              lazy: 'perf',
              projperf: 'perf',
            }[App.page] || App.page;
    UI.$$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === navKey));
    App.navSections();
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
    if (App.saveView) App.saveView();
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
    main.insertAdjacentHTML('afterbegin', App.secTabs()); // the section's pages as tabs
    if (pg.mount) pg.mount(main);
    if (typeof Admin !== 'undefined' && Admin.afterRender)
      try {
        Admin.afterRender(main);
      } catch (e) {
        /* usage only */
      }
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
    if (typeof PT !== 'undefined') PT.bind(main);
    main.querySelectorAll('[data-capmore]').forEach(
      a =>
        (a.onclick = e => {
          e.preventDefault();
          App.tableState['cap:' + a.dataset.capmore] = true;
          App.render(true);
        })
    ); // personal tasks: Done, Give to…, Accept / Decline, ＋ Personal task
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
        const r = Store.get(id) || (/^chk~/.test(id) ? Store.get(id.split('~')[1]) : null);
        if (r) UI.editRecord(c, r);
      })
    );
    if (keepScroll !== false) {
      window.scrollTo(0, sy);
      main.scrollTop = my;
    }
    App.pendingRender = false;
    // remember what every box holds right after drawing (incl. values set by the page itself), so "unsaved typing" can be told apart
    if (App.snapInputs) {
      App.snapInputs(main);
      setTimeout(() => {
        if (UI.$('#main') === main) App.snapInputs(main);
      }, 0);
    }
    if (!main._pendBound) {
      main._pendBound = true;
      main.addEventListener('focusout', () => setTimeout(() => App.applyPending && App.applyPending(), 250));
      main.addEventListener('input', () => {
        if (App.pendingRender) (clearTimeout(App._pendT), (App._pendT = setTimeout(() => App.applyPending(), 1500)));
      });
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
        Store.all('todo', '*').filter(
          t => Store.canConfirmTodo(t, App.me) || (typeof TodoFlow !== 'undefined' && (TodoFlow.withMe(t) || TodoFlow.needsPick(t)))
        ).length + (typeof TodoFollow !== 'undefined' ? TodoFollow.openForMe().length : 0),
        'To Dos waiting for you: to confirm, to check (validation…), sent back to you, or a step to give to someone'
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

/* Side menu = sections. The section of the open page is highlighted; each section link goes to the page last used in it
 * (remembered per person on this PC); a section's count is the sum of its pages' counts. */
App.secOf = function () {
  const on = document.querySelector('nav .nav-items a.on');
  return on ? on.closest('.nav-items').previousElementSibling : null;
};
App.navSections = function () {
  const nav = document.querySelector('aside nav') || document.querySelector('nav');
  if (!nav) return;
  const cur = App.secOf();
  const key = 'bct.seclast.' + (App.me || '');
  let last = {};
  try {
    last = JSON.parse(localStorage.getItem(key) || '{}');
  } catch (e) {
    last = {};
  }
  if (cur && location.hash) {
    last[cur.dataset.sec] = location.hash;
    try {
      localStorage.setItem(key, JSON.stringify(last));
    } catch (e) {
      /* private window */
    }
  }
  nav.querySelectorAll('a.sec').forEach(s => {
    s.classList.toggle('on', s === cur);
    if (s === cur) s.setAttribute('aria-current', 'page');
    else s.removeAttribute('aria-current');
    const box = s.nextElementSibling;
    const links = box ? [...box.querySelectorAll('a[href]')] : [];
    const want = last[s.dataset.sec];
    const ok = want && links.some(l => want.startsWith(l.getAttribute('href').split('/').slice(0, 2).join('/')));
    s.setAttribute('href', ok ? want : links[0] ? links[0].getAttribute('href') : '#/home');
    const n = links.reduce((t, l) => t + [...l.querySelectorAll('.count')].reduce((x, c) => x + (parseInt(c.textContent, 10) || 0), 0), 0);
    const b = s.querySelector('.sec-n');
    if (b) {
      b.hidden = !n;
      b.textContent = n || '';
    }
  });
  const host = document.querySelector('#main .sec-tabs');
  if (host) host.outerHTML = App.secTabs();
};
/* the tabs of the section at the top of the page (copies of the section's links, with their counts) */
App.secTabs = function () {
  const s = App.secOf();
  if (!s) return '';
  const links = [...s.nextElementSibling.querySelectorAll('a[href]')];
  if (links.length < 2) return '<div class="sec-tabs" hidden></div>';
  return `<div class="sec-tabs" role="tablist" aria-label="${U.h(s.querySelector('.sec-l').textContent)}">${links.map(l => `<a href="${l.getAttribute('href')}" class="sec-tab ${l.classList.contains('on') ? 'on' : ''}" data-tab="${U.h(l.dataset.nav)}">${l.innerHTML}</a>`).join('')}</div>`;
};
