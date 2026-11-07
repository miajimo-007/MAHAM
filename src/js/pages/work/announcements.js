/* MAHAM — Announcements board: only the super admin posts; everyone reads; the admin sees who has read each one.
 * announcement { title, body, audience: [] (empty = everyone) | [teamIds], pinned, until, posted }
 * annread      { ann, at }   — one per person per announcement (id annread-<person>-<announcement>) */
'use strict';

const Ann = {
  canPost() {
    return App.isSuper() || App.can('postAnnouncements');
  },
  forMe(m) {
    const me = Store.member(App.me) || {};
    const a = m.audience || [];
    if ((m.people || []).length) return App.isSuper() || m.people.includes(App.me);
    return !a.length || App.isSuper() || Store.topRole(me.role) || a.includes(me.team || 'apps');
  },
  live(a) {
    return !a.until || a.until >= U.todayStr();
  },
  list() {
    return Store.all('announcement')
      .filter(Ann.forMe)
      .sort(
        (x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0) || (y.posted || '').localeCompare(x.posted || '') || (y._ts || 0) - (x._ts || 0)
      );
  },
  readId(annId, who) {
    return `annread-${who || App.me}-${annId}`;
  },
  isRead(a, who) {
    return !!Store.get(Ann.readId(a.id, who));
  },
  unread() {
    return Ann.list().filter(a => Ann.live(a) && !Ann.isRead(a));
  },
  markRead(a) {
    if (!Ann.isRead(a)) Store.save({ id: Ann.readId(a.id), c: 'annread', ann: a.id, at: U.nowStr() });
  },
  audience(a) {
    if ((a.people || []).length) return Store.members().filter(m => a.people.includes(m.id) && m.active !== false);
    const ts = a.audience || [];
    return Store.members().filter(
      m => m.active !== false && m.id !== a._by && (!ts.length || Store.topRole(m.role) || ts.includes(m.team || 'apps'))
    );
  },
};

/* unread announcements at the top of Analyst Desk and the desks */
function annBanner() {
  const u = Ann.unread();
  if (!u.length) return '';
  return (
    u
      .slice(0, 3)
      .map(
        a =>
          `<div class="insights ann"><div><b>📢 ${h(a.title)}</b>${a.body ? `<div class="small" style="white-space:pre-wrap">${h(a.body)}</div>` : ''}<div class="muted small">${U.fmtDate(a.posted)}</div></div><div class="row-btns tight"><button class="btn sm primary" data-annread="${h(a.id)}">Got it</button></div></div>`
      )
      .join('') +
    (u.length > 3 ? `<p class="small"><a class="link" href="#/announcements">${u.length - 3} more announcement(s) →</a></p>` : '')
  );
}
function bindAnn(root) {
  root.querySelectorAll('[data-annread]').forEach(
    b =>
      (b.onclick = () => {
        const a = Store.get(b.dataset.annread);
        if (a) Ann.markRead(a);
        App.render();
      })
  );
}

function annDialog(a) {
  const isNew = !a;
  a = a || {};
  UI.modal({
    title: isNew ? 'New announcement' : 'Edit announcement',
    wide: true,
    body: `<form class="grid-form" id="anf">
      ${UI.field({ key: 'title', label: 'Title', type: 'text', required: true, span: 2 }, a.title || '')}
      ${UI.field({ key: 'body', label: 'Message', type: 'textarea', span: 2, rows: 5 }, a.body || '')}
      <div class="fld span2"><label>Who should see it</label><div class="pick"><label class="check"><input type="checkbox" name="aud" value="" ${!(a.audience || []).length ? 'checked' : ''}> <b>Everyone</b></label>${Store.teams()
        .map(
          t =>
            `<label class="check"><input type="checkbox" name="aud" value="${h(t.id)}" ${(a.audience || []).includes(t.id) ? 'checked' : ''}> ${h(t.name)}</label>`
        )
        .join('')}</div><small>Directors always see every announcement.</small></div>
      ${UI.field({ key: 'until', label: 'Show until (optional)', type: 'date' }, a.until || '')}
      ${UI.field({ key: 'pinned', label: 'Pinned', type: 'bool', checkLabel: 'Keep at the top' }, !!a.pinned)}
    </form>`,
    actions: `${!isNew ? '<button class="btn danger ghost" data-del>Delete</button>' : ''}<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>${isNew ? 'Post' : 'Save'}</button>`,
    onMount: w => {
      w.querySelector('[data-c]').onclick = UI.closeModal;
      const d = w.querySelector('[data-del]');
      if (d)
        d.onclick = () =>
          UI.confirm('Delete this announcement?', () => {
            Store.remove(a.id);
            UI.toast('Deleted');
            App.render();
          });
      w.querySelector('[data-ok]').onclick = () => {
        const f = w.querySelector('#anf');
        const v = UI.readForm(f, [{ key: 'title' }, { key: 'body' }, { key: 'until' }, { key: 'pinned', type: 'bool' }]);
        if (!v.title) return UI.toast('Write a title', 'bad');
        const aud = [...f.querySelectorAll('[name=aud]:checked')].map(b => b.value);
        const audience = aud.includes('') ? [] : aud;
        Store.save(
          Object.assign({}, isNew ? { id: U.uid('announcement'), c: 'announcement', posted: U.todayStr() } : Store.get(a.id), v, {
            audience,
          })
        );
        UI.closeModal();
        UI.toast(isNew ? 'Announcement posted' : 'Saved', 'good');
        App.render();
      };
    },
  });
}

P.announcements = () => {
  const fa = ps('ann');
  const list = Ann.list().filter(a => !fa.month || inMonth(a.posted, fa.month));
  const admin = Ann.canPost();
  const row = a => {
    const aud = admin ? Ann.audience(a) : [];
    const readers = aud.filter(m => Ann.isRead(a, m.id));
    return `<section class="card ann-card ${Ann.isRead(a) || admin ? '' : 'unread'}"><div class="card-head"><h3>${a.pinned ? '📌 ' : ''}${h(a.title)}</h3><span class="muted small">${U.fmtDate(a.posted)}${a.until ? ' · until ' + U.fmtDate(a.until) : ''}${!Ann.live(a) ? ' · ' + UI.badge('expired', '') : ''}</span></div>
      ${a.body ? `<p style="white-space:pre-wrap">${h(a.body)}</p>` : ''}
      <div class="row-btns tight">${(a.audience || []).length ? `<span class="muted small">For: ${h(a.audience.map(t => Store.teamName(t)).join(', '))}</span>` : '<span class="muted small">For everyone</span>'}<span class="grow"></span>
        ${admin ? `<span class="small">${readers.length} of ${aud.length} read</span> <button class="btn xs ghost" data-annwho="${h(a.id)}">Who</button> <button class="btn xs" data-annedit="${h(a.id)}">Edit</button>` : Ann.isRead(a) ? UI.badge('read', 'good') : `<button class="btn xs primary" data-annread="${h(a.id)}">Got it</button>`}</div></section>`;
  };
  const html = `<div class="page-actions">${filterBar('ann', [{ key: 'month', type: 'month' }])}<span class="muted small">${admin ? 'Only you and people given “Post announcements” can post. Everyone sees new announcements at the top of their start page until they press "Got it".' : 'News from the administrator.'}</span><span class="grow"></span>${admin ? '<button class="btn primary" id="newann">＋ New announcement</button>' : ''}</div>
    ${list.map(row).join('') || empty('No announcements yet.')}`;
  return {
    title: 'Announcements',
    html,
    mount(root) {
      bindAnn(root);
      const n = root.querySelector('#newann');
      if (n) n.onclick = () => annDialog(null);
      root.querySelectorAll('[data-annedit]').forEach(b => (b.onclick = () => annDialog(Store.get(b.dataset.annedit))));
      root.querySelectorAll('[data-annwho]').forEach(
        b =>
          (b.onclick = () => {
            const a = Store.get(b.dataset.annwho);
            const aud = Ann.audience(a);
            UI.modal({
              title: 'Who has read it',
              body: `<table class="tbl"><thead><tr><th>Person</th><th>Team</th><th>Read</th></tr></thead><tbody>${aud
                .map(m => {
                  const r = Store.get(Ann.readId(a.id, m.id));
                  return `<tr><td>${h(m.name)}</td><td>${h(Store.topRole(m.role) ? '—' : Store.teamName(m.team))}</td><td>${r ? '✓ ' + h(U.fmtDT(r.at)) : '<span class="t-warn">not yet</span>'}</td></tr>`;
                })
                .join('')}</tbody></table>`,
              actions: '<span class="grow"></span><button class="btn" data-c>Close</button>',
              onMount: w => {
                w.querySelector('[data-c]').onclick = UI.closeModal;
              },
            });
          })
      );
    },
  };
};
