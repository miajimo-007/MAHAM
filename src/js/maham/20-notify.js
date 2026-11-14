/* MAHAM — 🔔 Notifications: "For you" in the top bar.
 * When someone gives you work (a To Do, a project task, a ticket …), asks for your approval or @mentions you, a small
 * record is saved in THEIR own data (like a note), addressed to you:
 *   { c: 'notify', id: 'notify-<by>-<time>', to, by, at, kind, title, text, link (#/…), on (item id) }
 * Your 🔔 shows the ones you have not read; clicking one opens the item. What you have read is kept in your own data
 * (notifseen-<you>), so it follows you to any PC. While MAHAM is open, a new one can also pop up on the desktop (if you
 * allow it). Online, the database also queues an email for each one (supabase/schema.sql → notify_queue; sent by the
 * send-notifications function, see docs/HOSTING.md) — each person can switch emails off.
 * Other modules add their own rules: Notify.rules.push((rec, prev) => [{ to, title, text, link, kind }]). */
'use strict';

const Notify = {
  KEEP_DAYS: 60,
  rules: [],
  /* ---------- what is for me ---------- */
  seenRec() {
    return Store.get('notifseen-' + App.me) || { id: 'notifseen-' + App.me, c: 'notifseen', member: App.me, at: 0, read: [] };
  },
  mine() {
    if (!App.me) return [];
    const cut = Date.now() - Notify.KEEP_DAYS * 864e5;
    return (Store.byC.notify || [])
      .filter(n => n && !n._del && n.to === App.me && n.by !== App.me && (n.at || 0) > cut)
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  },
  isRead(n, seen) {
    seen = seen || Notify.seenRec();
    return (n.at || 0) <= (seen.at || 0) || (seen.read || []).includes(n.id);
  },
  unread() {
    const s = Notify.seenRec();
    return Notify.mine().filter(n => !Notify.isRead(n, s));
  },
  markRead(ids) {
    if (!App.me || App.preview) return;
    const s = Notify.seenRec();
    const keep = Date.now() - Notify.KEEP_DAYS * 864e5;
    const read = [...new Set([...(s.read || []), ...ids])]
      .filter(id => {
        const n = Store.get(id);
        return n && (n.at || 0) > keep;
      })
      .slice(-300);
    Store.save(Object.assign({}, s, { read, _nolog: true }));
  },
  markAll() {
    if (!App.me || App.preview) return;
    Store.save(Object.assign({}, Notify.seenRec(), { at: Date.now(), read: [], _nolog: true }));
  },
  prefs() {
    return (
      Store.get('notifprefs-' + App.me) || { id: 'notifprefs-' + App.me, c: 'notifprefs', member: App.me, email: true, desktop: false }
    );
  },
  setPref(k, v) {
    if (!App.me || App.preview) return;
    Store.save(Object.assign({}, Notify.prefs(), { [k]: v, _nolog: true }));
  },

  /* ---------- making them (rules run when records are saved) ---------- */
  make(list) {
    const out = [];
    const now = Date.now();
    let i = 0;
    for (const x of list) {
      if (!x || !x.to || x.to === App.me || !Store.member(x.to)) continue;
      out.push({
        c: 'notify',
        id: `notify-${App.me}-${(now + i++).toString(36)}`,
        to: x.to,
        by: App.me,
        at: now,
        kind: x.kind || 'info',
        title: String(x.title || '').slice(0, 200),
        text: String(x.text || '').slice(0, 500),
        link: x.link || '',
        on: x.on || '',
        _nolog: true,
      });
    }
    return out;
  },
  /* who should hear about this save */
  forSave(list) {
    const found = [];
    for (const rec of list) {
      if (!rec || !rec.c || rec.c === 'notify' || rec.c === 'notifseen' || rec.c === 'notifprefs' || rec._del) continue;
      const prev = Store.db.get(rec.id) || null;
      for (const rule of Notify.rules) {
        try {
          (rule(rec, prev) || []).forEach(x => found.push(Object.assign({ on: rec.id }, x)));
        } catch (e) {
          console.warn('notify rule', e);
        }
      }
    }
    // one per person and item in a save
    const seen = new Set();
    return Notify.make(
      found.filter(x => {
        const k = x.to + '|' + x.on + '|' + x.kind;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
    );
  },

  /* ---------- the bell ---------- */
  ago(t) {
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? 'now' : m < 60 ? m + ' min' : m < 1440 ? Math.round(m / 60) + ' h' : U.fmtDate(U.ds(new Date(t)));
  },
  bellHtml() {
    const n = Notify.unread().length;
    return `<button type="button" class="icon-btn nt-bell" id="ntbell" title="For you" aria-label="Notifications${n ? ', ' + n + ' new' : ''}">🔔${n ? `<span class="nt-n">${n > 99 ? '99+' : n}</span>` : ''}</button>`;
  },
  refreshBell() {
    const b = document.getElementById('ntbell');
    if (!b) return;
    const n = Notify.unread().length;
    b.innerHTML = '🔔' + (n ? `<span class="nt-n">${n > 99 ? '99+' : n}</span>` : '');
    b.setAttribute('aria-label', 'Notifications' + (n ? ', ' + n + ' new' : ''));
  },
  panel() {
    const s = Notify.seenRec();
    const list = Notify.mine().slice(0, 40);
    const p = Notify.prefs();
    const li = n =>
      `<a href="${h(n.link || '#/home')}" class="nt-item${Notify.isRead(n, s) ? '' : ' new'}" data-ntid="${h(n.id)}"><span class="nt-who">${h(n.by === '_portal' ? 'A customer' : Store.memberShort(n.by) || n.by)}</span> ${h(n.title)}${n.text ? `<span class="nt-text">${h(n.text)}</span>` : ''}<span class="nt-at">${h(Notify.ago(n.at))}</span></a>`;
    const desk =
      'Notification' in window
        ? Notification.permission === 'granted' && p.desktop
          ? '<a href="#" class="link small" data-ntdesk="off">Desktop pop-ups: on</a>'
          : '<a href="#" class="link small" data-ntdesk="on">Turn on desktop pop-ups</a>'
        : '';
    const mail =
      Store.storageMode === 'cloud'
        ? `<a href="#" class="link small" data-ntmail="${p.email === false ? 'on' : 'off'}">Emails: ${p.email === false ? 'off' : 'on'}</a>`
        : '';
    return `<div class="nt-panel" id="ntpanel" role="dialog" aria-label="For you"><div class="nt-head"><b>For you</b><span class="grow"></span>${list.some(n => !Notify.isRead(n, s)) ? '<a href="#" class="link small" id="ntall">Mark all read</a>' : ''}</div>
      <div class="nt-list">${list.length ? list.map(li).join('') : '<div class="muted small nt-empty">Nothing yet — when someone gives you work, asks for your approval or mentions you, it shows here.</div>'}</div>
      <div class="nt-foot">${[desk, mail].filter(Boolean).join(' · ')}</div></div>`;
  },
  toggle() {
    const old = document.getElementById('ntpanel');
    if (old) {
      old.remove();
      return;
    }
    const b = document.getElementById('ntbell');
    if (!b) return;
    b.insertAdjacentHTML('afterend', Notify.panel());
    const p = document.getElementById('ntpanel');
    p.querySelectorAll('[data-ntid]').forEach(a =>
      a.addEventListener('click', () => {
        Notify.markRead([a.dataset.ntid]);
        p.remove();
      })
    );
    const all = p.querySelector('#ntall');
    if (all)
      all.onclick = e => {
        e.preventDefault();
        Notify.markAll();
        p.remove();
        Notify.refreshBell();
      };
    const d = p.querySelector('[data-ntdesk]');
    if (d)
      d.onclick = async e => {
        e.preventDefault();
        if (d.dataset.ntdesk === 'on') {
          const r = await Notification.requestPermission();
          Notify.setPref('desktop', r === 'granted');
          UI.toast(r === 'granted' ? 'Desktop pop-ups on' : 'The browser did not allow pop-ups', r === 'granted' ? 'good' : 'warn');
        } else Notify.setPref('desktop', false);
        p.remove();
      };
    const m = p.querySelector('[data-ntmail]');
    if (m)
      m.onclick = e => {
        e.preventDefault();
        Notify.setPref('email', m.dataset.ntmail === 'on');
        UI.toast(m.dataset.ntmail === 'on' ? 'Emails on' : 'Emails off', 'good');
        p.remove();
      };
    setTimeout(
      () =>
        document.addEventListener('click', function close(e) {
          if (!e.target.closest('#ntpanel') && !e.target.closest('#ntbell')) {
            const x = document.getElementById('ntpanel');
            if (x) x.remove();
            document.removeEventListener('click', close);
          }
        }),
      0
    );
  },
  /* a desktop pop-up for ones that arrive while the app is open (not the ones already there at start) */
  _known: null,
  popNew() {
    const ids = new Set(Notify.unread().map(n => n.id));
    if (Notify._known === null) {
      Notify._known = ids;
      return;
    }
    const fresh = Notify.unread().filter(n => !Notify._known.has(n.id));
    Notify._known = ids;
    if (!fresh.length || !('Notification' in window) || Notification.permission !== 'granted' || !Notify.prefs().desktop) return;
    for (const n of fresh.slice(0, 3)) {
      try {
        const x = new Notification(`${n.by === '_portal' ? 'A customer' : Store.memberShort(n.by) || n.by}: ${n.title}`, {
          body: n.text || '',
          tag: n.id,
        });
        x.onclick = () => {
          window.focus();
          if (n.link) location.hash = n.link;
          Notify.markRead([n.id]);
          x.close();
        };
      } catch (e) {
        /* not allowed here */
      }
    }
  },
};

/* ---------- the rules that come with the app ---------- */
Notify.rules.push((r, prev) => {
  // a To Do given to someone (or moved to someone else)
  if (r.c !== 'todo' || !r.analyst || (prev && prev.analyst === r.analyst)) return [];
  return [{ to: r.analyst, kind: 'todo', title: `gave you a To Do${r.tdNo ? ' TD-' + r.tdNo : ''}`, text: r.task || '', link: '#/todo' }];
});
Notify.rules.push((r, prev) => {
  // a project task assigned
  if (r.c !== 'ptask' || !r.assignee || (prev && prev.assignee === r.assignee)) return [];
  return [
    {
      to: r.assignee,
      kind: 'ptask',
      title: 'assigned you a project task',
      text: r.title || '',
      link: r.project ? '#/project/' + r.project : '#/projects',
    },
  ];
});
Notify.rules.push((r, prev) => {
  // a personal task offered to someone
  const to = r.c === 'mytask' && r.offer && r.offer.to;
  if (!to || (prev && prev.offer && prev.offer.to === to && prev.offer.on === r.offer.on)) return [];
  return [{ to, kind: 'mytask', title: 'offered you a task', text: r.title || '', link: '#/mytasks' }];
});
Notify.rules.push((r, prev) => {
  // a request: its manager approver is told when it is raised
  if (r.c !== 'request' || prev) return [];
  const m = Store.member(r.requester || App.me);
  const mgr = m && Store.teamManager && Store.teamManager(m.team || 'apps');
  return mgr
    ? [
        {
          to: mgr.id,
          kind: 'approval',
          title: 'asks for your approval',
          text: r.title || (Requests.type ? Requests.type(r.type).label : '') || 'a request',
          link: '#/requests/approve',
        },
      ]
    : [];
});
Notify.rules.push((r, prev) => {
  // a quick win shared with teammates
  if (r.c !== 'quickwin' || !Array.isArray(r.coWorkers)) return [];
  const before = new Set((prev && prev.coWorkers) || []);
  return r.coWorkers
    .filter(x => x && x !== r.analyst && !before.has(x))
    .map(x => ({ to: x, kind: 'quickwin', title: 'added you to a quick win', text: r.subject || '', link: '#/quickwins' }));
});

/* every save: the notifications go with it (same save, the sender's own data) */
(() => {
  const save0 = Store.saveMany;
  Store.saveMany = function (list) {
    let extra = [];
    try {
      if (App.me && !App.preview && Array.isArray(list)) extra = Notify.forSave(list.filter(Boolean));
    } catch (e) {
      console.warn('notify', e);
    }
    return save0.call(Store, extra.length ? list.concat(extra) : list);
  };
})();

/* the bell in the top bar (after the person's name is known), kept up to date */
(() => {
  const launch = App.launch;
  App.launch = function () {
    const out = launch.apply(this, arguments);
    try {
      const top = document.querySelector('header.top');
      if (top && App.me && !document.getElementById('ntbell')) {
        const at = top.querySelector('.theme-sw');
        const html = Notify.bellHtml();
        if (at) at.insertAdjacentHTML('beforebegin', html);
        else top.insertAdjacentHTML('beforeend', html);
        document.getElementById('ntbell').onclick = e => {
          e.stopPropagation();
          Notify.toggle();
        };
      }
    } catch (e) {
      console.warn('bell', e);
    }
    return out;
  };
  Store.on(() => {
    try {
      Notify.refreshBell();
      Notify.popNew();
    } catch (e) {
      /* never break a refresh */
    }
  });
})();
