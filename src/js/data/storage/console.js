/* MAHAM — online (many companies): the Owner Console for the platform owner, and Admin → Company & accounts for
 * each company's own admin, plus the first-time setup for a new company. Only used when storage is 'cloud'.
 * The database (supabase/schema.sql) checks every action again — these screens only ask. */
'use strict';

const CloudUI = {
  on: () => Store.storageMode === 'cloud' && !!Store.cloudCompany,
  rpc: (fn, args) => CloudBackend.rpc(fn, args),
  async get(path) {
    const r = await CloudBackend.req(path);
    if (!r.ok) throw new Error('Could not read (' + r.status + ')');
    return r.json();
  },
  when: t => (t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'),
  appLink: () => location.href.split('#')[0],
  err: e => UI.toast(e.message || String(e), 'bad'),
  /* the "tell them" text after an invitation (no email is sent by the app itself) */
  inviteNote:
    em => `<p class="small">Invitation saved for <b>${U.h(em)}</b>. Send them this link and ask them to choose <b>Create account</b> with that email:</p>
    <div class="row-btns"><input class="grow" readonly value="${U.h(CloudUI.appLink())}" id="cl-link"><button class="btn sm" id="cl-copy">Copy link</button></div>`,
  bindCopy(w) {
    const b = w.querySelector('#cl-copy');
    if (b)
      b.onclick = () => {
        const i = w.querySelector('#cl-link');
        i.select();
        try {
          navigator.clipboard.writeText(i.value);
        } catch (e) {
          document.execCommand('copy');
        }
        UI.toast('Link copied', 'good');
      };
  },
  async refreshPeople() {
    Store.trustedPeople = (await CloudBackend.people(Store.cloudCompany.company_id)).map(p =>
      Object.assign({ team: (Store.teams()[0] || {}).id || '' }, p)
    );
    Store.rebuild();
    App.render();
  },
};

/* ======================================================================= Owner Console (platform owner) */
const OwnerConsole = {
  async open(msg) {
    if (location.hash !== '#/owner') history.replaceState(null, '', location.pathname + location.search + '#/owner');
    let list = [];
    try {
      list = await CloudUI.rpc('owner_companies');
    } catch (e) {
      msg = e.message;
    }
    const mine = (MahamStorage.list || []).filter(m => m.active && m.status === 'active');
    const now = Date.now();
    App.screen(`<h1>Owner Console</h1><p class="muted small">Signed in as <b>${U.h(CloudBackend.email())}</b>. You see each company's name, seats and size — not its data. You can read a company's data only while its admin allows support access, and every visit is in their audit log.</p>
      ${msg ? `<div class="insights warnbox"><div>${U.h(msg)}</div></div>` : ''}
      <div class="row-btns"><button class="btn primary" id="oc-new">＋ New company</button>${mine.length ? '<button class="btn" id="oc-mine">Open my company</button>' : ''}<span class="grow"></span><button class="btn ghost" id="oc-out">Sign out</button></div>
      <div class="tbl-scroll"><table class="tbl oc-tbl"><thead><tr><th>Company</th><th>Status</th><th>People / seats</th><th>Admins</th><th>Open invitations</th><th>Data</th><th>Last saved</th><th>Support access</th><th></th></tr></thead><tbody>
      ${
        list.length
          ? list
              .map(
                (
                  c,
                  i
                ) => `<tr><td><b>${U.h(c.name)}</b><br><span class="muted small">since ${U.h(CloudUI.when(c.created_at).split(',')[0])}</span></td>
        <td>${c.status === 'active' ? UI.badge('active', 'good') : UI.badge('paused', 'warn')}</td><td class="ctr">${c.members} / ${c.seats}</td><td class="ctr">${c.admins}</td><td class="ctr">${c.invites}</td>
        <td class="nw">${c.data_kb >= 1024 ? (c.data_kb / 1024).toFixed(1) + ' MB' : c.data_kb + ' KB'}</td><td class="nw small">${U.h(CloudUI.when(c.last_save))}</td>
        <td class="small">${c.support_until && Date.parse(c.support_until) > now ? `until ${U.h(CloudUI.when(c.support_until))}<br><button class="btn xs" data-ocvisit="${i}">Open (read only)</button>` : '<span class="muted">not allowed</span>'}</td>
        <td class="nw"><button class="btn xs" data-ocedit="${i}">Status &amp; seats</button> <button class="btn xs" data-ocadmin="${i}">Invite an admin</button> <button class="btn xs ghost" data-ocdel="${i}">Delete</button></td></tr>`
              )
              .join('')
          : '<tr><td colspan="9" class="muted">No companies yet — press <b>New company</b>.</td></tr>'
      }
      </tbody></table></div>`);
    const card = UI.$('.connect-card');
    if (card) card.classList.add('wide');
    UI.$('#oc-out').onclick = () => {
      CloudBackend.signOut();
      history.replaceState(null, '', location.pathname);
      location.reload();
    };
    const mb = UI.$('#oc-mine');
    if (mb)
      mb.onclick = () => {
        history.replaceState(null, '', location.pathname);
        MahamStorage.afterSignIn(mine.length > 1);
      };
    UI.$('#oc-new').onclick = () => OwnerConsole.create();
    UI.$$('[data-ocedit]').forEach(b => (b.onclick = () => OwnerConsole.edit(list[+b.dataset.ocedit])));
    UI.$$('[data-ocadmin]').forEach(b => (b.onclick = () => OwnerConsole.invite(list[+b.dataset.ocadmin])));
    UI.$$('[data-ocdel]').forEach(b => (b.onclick = () => OwnerConsole.remove(list[+b.dataset.ocdel])));
    UI.$$('[data-ocvisit]').forEach(b => (b.onclick = () => OwnerConsole.visit(list[+b.dataset.ocvisit])));
  },
  create() {
    UI.modal({
      title: 'New company',
      body: `<form class="grid-form" id="ocf">${UI.field({ key: 'name', label: 'Company name', type: 'text', required: true }, '')}${UI.field({ key: 'email', label: "Their admin's email", type: 'text', required: true }, '')}
        ${UI.field({ key: 'member', label: "Admin's short id in the app (letters, no spaces)", type: 'text' }, 'admin')}${UI.field({ key: 'seats', label: 'Seats (people who can sign in)', type: 'number' }, 10)}</form>
        <p class="muted small">The company starts empty. Their admin creates an account with that email, sets the company up and invites their own people.</p>`,
      actions: '<span class="grow"></span><button class="btn primary" data-ok>Create</button>',
      onMount: w =>
        (w.querySelector('[data-ok]').onclick = async () => {
          const v = UI.readForm(w.querySelector('#ocf'), [
            { key: 'name' },
            { key: 'email' },
            { key: 'member' },
            { key: 'seats', type: 'number' },
          ]);
          try {
            await CloudUI.rpc('owner_create_company', {
              p_name: v.name,
              p_admin_email: v.email,
              p_admin_member: U.slug(v.member || 'admin') || 'admin',
              p_seats: +v.seats || 10,
            });
            w.querySelector('#ocf').insertAdjacentHTML('afterend', CloudUI.inviteNote(v.email));
            CloudUI.bindCopy(w);
            w.querySelector('[data-ok]').outerHTML = '<button class="btn primary" data-done>Done</button>';
            w.querySelector('[data-done]').onclick = () => {
              UI.closeModal();
              OwnerConsole.open();
            };
          } catch (e) {
            CloudUI.err(e);
          }
        }),
    });
  },
  edit(c) {
    UI.modal({
      title: `${c.name} — status and seats`,
      body: `<form class="grid-form" id="oce">${UI.field(
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          options: [
            ['active', 'Active'],
            ['paused', 'Paused — nobody can open or save'],
          ],
          blank: false,
        },
        c.status
      )}${UI.field({ key: 'seats', label: 'Seats', type: 'number' }, c.seats)}</form>`,
      actions: '<span class="grow"></span><button class="btn primary" data-ok>Save</button>',
      onMount: w =>
        (w.querySelector('[data-ok]').onclick = async () => {
          const v = UI.readForm(w.querySelector('#oce'), [{ key: 'status' }, { key: 'seats', type: 'number' }]);
          try {
            await CloudUI.rpc('owner_set_company', { c: c.id, p_status: v.status, p_seats: +v.seats || c.seats });
            UI.closeModal();
            OwnerConsole.open();
          } catch (e) {
            CloudUI.err(e);
          }
        }),
    });
  },
  invite(c) {
    UI.modal({
      title: `${c.name} — invite an admin`,
      body: `<form class="grid-form" id="oci">${UI.field({ key: 'email', label: 'Email', type: 'text', required: true }, '')}${UI.field({ key: 'member', label: 'Short id in the app', type: 'text' }, 'admin2')}</form><p class="muted small">For example when their only admin has left. Uses a seat.</p>`,
      actions: '<span class="grow"></span><button class="btn primary" data-ok>Invite</button>',
      onMount: w =>
        (w.querySelector('[data-ok]').onclick = async () => {
          const v = UI.readForm(w.querySelector('#oci'), [{ key: 'email' }, { key: 'member' }]);
          try {
            await CloudUI.rpc('owner_invite_admin', { c: c.id, p_email: v.email, p_member: U.slug(v.member || 'admin') || 'admin' });
            w.querySelector('form').insertAdjacentHTML('afterend', CloudUI.inviteNote(v.email));
            CloudUI.bindCopy(w);
            w.querySelector('[data-ok]').outerHTML = '<button class="btn primary" data-done>Done</button>';
            w.querySelector('[data-done]').onclick = () => {
              UI.closeModal();
              OwnerConsole.open();
            };
          } catch (e) {
            CloudUI.err(e);
          }
        }),
    });
  },
  remove(c) {
    UI.modal({
      title: `Delete ${c.name}?`,
      body: `<p>This deletes the company and <b>all of its data</b> for good. Type the company name to confirm.</p><input id="ocdn" class="grow" placeholder="${U.h(c.name)}" autocomplete="off">`,
      actions: '<span class="grow"></span><button class="btn danger" data-ok>Delete for good</button>',
      onMount: w =>
        (w.querySelector('[data-ok]').onclick = async () => {
          try {
            await CloudUI.rpc('owner_delete_company', { c: c.id, p_confirm: w.querySelector('#ocdn').value });
            UI.closeModal();
            OwnerConsole.open(`${c.name} was deleted.`);
          } catch (e) {
            CloudUI.err(e);
          }
        }),
    });
  },
  /* support visit: read only, as the company's first admin would see it; the database refuses any write anyway */
  async visit(c) {
    try {
      await CloudUI.rpc('owner_open_support', { c: c.id });
      const ms = await CloudUI.get(`/rest/v1/company_members?select=member_id,role,active&company_id=eq.${c.id}`);
      const a = ms.find(m => m.role === 'admin' && m.active) || ms[0];
      if (!a) return UI.toast('This company has nobody in it yet', 'bad');
      CloudBackend.supportVisit = true;
      CloudBackend.write = async (path, data) => ({ size: typeof data === 'string' ? data.length : 0, mtime: Date.now() }); // nothing is saved
      CloudBackend.remove = async () => {};
      CloudBackend.company = c.id;
      App.canEdit = () => false;
      history.replaceState(null, '', location.pathname + location.search);
      await MahamStorage.cloudStart({
        company_id: c.id,
        member_id: a.member_id,
        name: c.name,
        role: 'support',
        status: 'active',
        active: true,
      });
    } catch (e) {
      CloudUI.err(e);
    }
  },
};

/* ======================================================================= Admin → Company & accounts */
const CompanyAdmin = {
  page() {
    return {
      html: '<div id="coadm"><div class="card"><p class="muted">Loading the company…</p></div></div>',
      mount: root => CompanyAdmin.load(root),
    };
  },
  async load(root) {
    const box = root.querySelector('#coadm');
    const cid = Store.cloudCompany.company_id;
    let co, ms, inv, log;
    try {
      [[co], ms, inv, log] = await Promise.all([
        CloudUI.get(`/rest/v1/companies?select=id,name,status,seats,support_until,created_at&id=eq.${cid}`),
        CloudUI.get(`/rest/v1/company_members?select=member_id,role,active,email,user_id&company_id=eq.${cid}`),
        CloudUI.get(`/rest/v1/invites?select=email,member_id,role,created_at&accepted_at=is.null&company_id=eq.${cid}`),
        CloudUI.rpc('company_audit', { c: cid, n: 100 }).catch(() => []),
      ]);
    } catch (e) {
      box.innerHTML = `<div class="card"><p class="bad">${U.h(e.message)}</p></div>`;
      return;
    }
    if (!box.isConnected) return;
    const name = id => (Store.members().find(m => m.id === id) || {}).name || id;
    const used = ms.filter(m => m.active).length;
    const noAcc = Store.members().filter(
      m => m.active !== false && !ms.some(x => x.member_id === m.id) && !inv.some(i => i.member_id === m.id)
    );
    const byUser = new Map(ms.map(m => [m.user_id, name(m.member_id)]));
    const sup = co.support_until && Date.parse(co.support_until) > Date.now();
    const card = (t, b) => `<div class="card"><h3>${t}</h3>${b}</div>`;
    const what = a =>
      ({
        'company created': 'Company created',
        invited: 'Invited',
        joined: 'Joined',
        'joined again': 'Joined again',
        'invite canceled': 'Invitation cancelled',
        'member changed': 'Account changed',
        renamed: 'Company renamed',
        'company changed': 'Status / seats changed by the provider',
        'support granted': 'Support access allowed',
        'support ended': 'Support access ended',
        'support visit': 'Support visit (read only)',
      })[a] || a;
    box.innerHTML =
      card(
        'Company',
        `<div class="kv"><div><span class="muted small">Name</span><b>${U.h(co.name)}</b> <button class="btn xs" id="co-ren">Rename</button></div>
        <div><span class="muted small">Seats</span><b>${used} used${inv.length ? ` + ${inv.length} invited` : ''} of ${co.seats}</b></div><div><span class="muted small">Status</span>${co.status === 'active' ? UI.badge('active', 'good') : UI.badge('paused', 'warn')}</div></div>
        <p class="muted small">More seats or a paused company: ask your provider.</p>`
      ) +
      card(
        `Accounts <span class="count">${ms.length}</span>`,
        `<p class="muted small">Who can sign in, with which email. <b>Admin</b> = everything in this company (Admin pages included). People are added only by invitation.</p>
        <div class="tbl-scroll"><table class="tbl"><thead><tr><th>Person</th><th>Email</th><th>Access</th><th>Can sign in</th></tr></thead><tbody>
        ${ms
          .map(
            m => `<tr data-mem="${U.h(m.member_id)}"><td><b>${U.h(name(m.member_id))}</b></td><td class="small">${U.h(m.email || '')}</td>
          <td><select data-co-role ${m.member_id === App.me ? 'disabled title="Ask another admin to change your own access"' : ''}><option value="user" ${m.role === 'user' ? 'selected' : ''}>User</option><option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option></select></td>
          <td class="ctr"><input type="checkbox" data-co-act ${m.active ? 'checked' : ''} ${m.member_id === App.me ? 'disabled' : ''}></td></tr>`
          )
          .join('')}
        ${inv.map(i => `<tr class="muted"><td>${U.h(name(i.member_id))}</td><td class="small">${U.h(i.email)}</td><td>${i.role === 'admin' ? 'Admin' : 'User'} · invited ${U.h(CloudUI.when(i.created_at).split(',')[0])}</td><td><button class="btn xs ghost" data-co-cancel="${U.h(i.member_id)}">Cancel invitation</button></td></tr>`).join('')}
        </tbody></table></div><div class="row-btns"><button class="btn primary" id="co-inv">＋ Invite someone</button>${
          noAcc.length
            ? `<span class="muted small">${noAcc.length} ${noAcc.length > 1 ? 'people in the app have' : 'person in the app has'} no account yet: ${noAcc
                .slice(0, 6)
                .map(m => `<a href="#" class="link" data-co-invp="${U.h(m.id)}">${U.h(m.short || m.name)}</a>`)
                .join(', ')}</span>`
            : ''
        }</div>`
      ) +
      card(
        'Support access',
        `<p class="small">Your provider cannot see your data. If you need help, allow read-only access for a while — every visit is logged below.</p>
        <p>${sup ? `${UI.badge('allowed', 'warn')} until <b>${U.h(CloudUI.when(co.support_until))}</b>` : UI.badge('not allowed', 'good')}</p>
        <div class="row-btns"><button class="btn sm" data-co-sup="24">Allow 24 hours</button><button class="btn sm" data-co-sup="168">Allow 7 days</button>${sup ? '<button class="btn sm" data-co-sup="0">Stop now</button>' : ''}</div>`
      ) +
      card(
        'Audit log',
        `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>
        ${
          (log || [])
            .map(
              r =>
                `<tr><td class="nw small">${U.h(CloudUI.when(r.at))}</td><td class="small">${U.h(byUser.get(r.user_id) || (r.user_id ? 'provider' : 'system'))}</td><td>${U.h(what(r.action))}</td><td class="small muted">${U.h(
                  Object.entries(r.detail || {})
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ')
                )}</td></tr>`
            )
            .join('') || '<tr><td colspan="4" class="muted">Nothing yet</td></tr>'
        }
        </tbody></table></div>`
      ) +
      card(
        'Delete this company',
        `<p class="small">Deletes the company and <b>all of its data</b> for everyone, for good. Take a backup first (Admin → Data).</p><button class="btn danger" id="co-del">Delete the company…</button>`
      );
    const act = async (fn, args, ok) => {
      try {
        await CloudUI.rpc(fn, args);
        if (ok) UI.toast(ok, 'good');
        await CloudUI.refreshPeople();
      } catch (e) {
        CloudUI.err(e);
        App.render();
      }
    };
    box.querySelectorAll('[data-mem]').forEach(tr => {
      const id = tr.dataset.mem;
      const role = tr.querySelector('[data-co-role]');
      const on = tr.querySelector('[data-co-act]');
      const go = () => act('set_member', { c: cid, p_member: id, p_role: role.value, p_active: on.checked }, `${name(id)}: saved`);
      role.onchange = go;
      on.onchange = go;
    });
    box
      .querySelectorAll('[data-co-cancel]')
      .forEach(b => (b.onclick = () => act('cancel_invite', { c: cid, p_member: b.dataset.coCancel }, 'Invitation cancelled')));
    box
      .querySelectorAll('[data-co-sup]')
      .forEach(
        b =>
          (b.onclick = () =>
            act(
              'grant_support',
              { c: cid, hours: +b.dataset.coSup },
              +b.dataset.coSup ? 'Support access allowed' : 'Support access stopped'
            ))
      );
    box.querySelector('#co-inv').onclick = () => CompanyAdmin.invite(noAcc);
    box.querySelectorAll('[data-co-invp]').forEach(
      a =>
        (a.onclick = e => {
          e.preventDefault();
          CompanyAdmin.invite(noAcc, a.dataset.coInvp);
        })
    );
    box.querySelector('#co-ren').onclick = () =>
      UI.modal({
        title: 'Rename the company',
        body: `<input id="co-nn" class="grow" value="${U.h(co.name)}">`,
        actions: '<span class="grow"></span><button class="btn primary" data-ok>Save</button>',
        onMount: w =>
          (w.querySelector('[data-ok]').onclick = async () => {
            try {
              const n = w.querySelector('#co-nn').value.trim();
              await CloudUI.rpc('rename_company', { c: cid, p_name: n });
              Store.cloudCompany.name = n;
              UI.closeModal();
              App.render();
            } catch (e) {
              CloudUI.err(e);
            }
          }),
      });
    box.querySelector('#co-del').onclick = () =>
      UI.modal({
        title: `Delete ${co.name}?`,
        body: `<p>Everything is deleted for good, for everyone. Type <b>${U.h(co.name)}</b> to confirm.</p><input id="co-dn" class="grow" autocomplete="off">`,
        actions: '<span class="grow"></span><button class="btn danger" data-ok>Delete for good</button>',
        onMount: w =>
          (w.querySelector('[data-ok]').onclick = async () => {
            try {
              await CloudUI.rpc('delete_my_company', { c: cid, p_confirm: w.querySelector('#co-dn').value });
              LS.set('maham.cloud.company', '');
              CloudBackend.signOut();
              location.reload();
            } catch (e) {
              CloudUI.err(e);
            }
          }),
      });
  },
  /* invite: an existing person in the app, or a new one (added to People at the same time) */
  invite(noAcc, pre) {
    const opts = noAcc.map(m => [m.id, m.name]).concat([['__new', '＋ A new person…']]);
    UI.modal({
      title: 'Invite someone',
      body: `<form class="grid-form" id="coi">${UI.field({ key: 'email', label: 'Their email', type: 'text', required: true }, '')}
        ${UI.field({ key: 'who', label: 'Who is it in the app?', type: 'select', options: opts, blank: false }, pre || (noAcc[0] || { id: '__new' }).id)}
        <div data-newp>${UI.field({ key: 'name', label: 'Full name', type: 'text' }, '')}${UI.field({ key: 'short', label: 'Short name', type: 'text' }, '')}
        ${UI.field({ key: 'team', label: 'Team', type: 'select', options: Store.teams().map(t => [t.id, t.name]), blank: false }, App.viewTeam)}</div>
        ${UI.field(
          {
            key: 'role',
            label: 'Access',
            type: 'select',
            options: [
              ['user', 'User'],
              ['admin', 'Admin (everything in this company)'],
            ],
            blank: false,
          },
          'user'
        )}</form>`,
      actions: '<span class="grow"></span><button class="btn primary" data-ok>Invite</button>',
      onMount: w => {
        const f = w.querySelector('#coi');
        const em = f.querySelector('[name=email]');
        em.type = 'email';
        const sync = () => (w.querySelector('[data-newp]').hidden = f.querySelector('[name=who]').value !== '__new');
        f.querySelector('[name=who]').onchange = sync;
        sync();
        w.querySelector('[data-ok]').onclick = async () => {
          const v = UI.readForm(f, [{ key: 'email' }, { key: 'who' }, { key: 'name' }, { key: 'short' }, { key: 'team' }, { key: 'role' }]);
          let id = v.who;
          try {
            if (id === '__new') {
              if (!v.name) return UI.toast('Write their full name', 'bad');
              const p = newPerson({ name: v.name, short: v.short || v.name.split(' ')[0], role: 'analyst', team: v.team, scored: true });
              await CloudUI.rpc('invite_member', { c: Store.cloudCompany.company_id, p_email: v.email, p_member: p.id, p_role: v.role });
              saveMembersAll(Store.members().concat([p]));
              await Store.flush();
              id = p.id;
            } else await CloudUI.rpc('invite_member', { c: Store.cloudCompany.company_id, p_email: v.email, p_member: id, p_role: v.role });
            f.insertAdjacentHTML('afterend', CloudUI.inviteNote(v.email));
            f.hidden = true;
            CloudUI.bindCopy(w);
            w.querySelector('[data-ok]').outerHTML = '<button class="btn primary" data-done>Done</button>';
            w.querySelector('[data-done]').onclick = () => {
              UI.closeModal();
              App.render();
            };
          } catch (e) {
            CloudUI.err(e);
          }
        };
      },
    });
  },
};

/* ======================================================================= first open of a new company (its admin) */
const CompanySetup = {
  needed: () =>
    CloudUI.on() &&
    !!(Store.members().find(m => m.id === App.me) || {}).superAdmin &&
    [undefined, '', 'seed'].includes((Store.get('settings-team') || {})._by) &&
    !LS.get('maham.setup.skip.' + Store.cloudCompany.company_id, false),
  open() {
    const me = Store.member(App.me) || {};
    const teams = Store.teams();
    UI.modal({
      title: 'Set up your company',
      wide: true,
      body: `<p class="small">Three quick things — you can change all of it later in Admin.</p><form class="grid-form" id="cos">
        ${UI.field({ key: 'company', label: 'Company name', type: 'text' }, Store.cloudCompany.name || '')}
        ${UI.field({ key: 'name', label: 'Your full name', type: 'text', required: true }, me.name && me.name !== me.id ? me.name : '')}${UI.field({ key: 'short', label: 'Your short name', type: 'text' }, '')}
        ${UI.field({ key: 'teams', label: 'Your teams or departments (one per line)', type: 'textarea' }, teams.map(t => t.name).join('\n'))}</form>
        <p class="muted small">Next: invite your people in <b>Admin → Company &amp; accounts</b>.</p>`,
      actions:
        '<button class="btn ghost" data-later>Later</button><span class="grow"></span><button class="btn primary" data-ok>Save</button>',
      onMount: w => {
        w.querySelector('[data-later]').onclick = () => {
          LS.set('maham.setup.skip.' + Store.cloudCompany.company_id, true);
          UI.closeModal();
        };
        w.querySelector('[data-ok]').onclick = async () => {
          const v = UI.readForm(w.querySelector('#cos'), [{ key: 'company' }, { key: 'name' }, { key: 'short' }, { key: 'teams' }]);
          if (!v.name) return UI.toast('Write your full name', 'bad');
          if (App.mode !== 'admin') App.switchMode('admin'); // settings are saved in admin mode
          try {
            if (v.company && v.company !== Store.cloudCompany.name) {
              await CloudUI.rpc('rename_company', { c: Store.cloudCompany.company_id, p_name: v.company });
              Store.cloudCompany.name = v.company;
            }
            const names = String(v.teams || '')
              .split('\n')
              .map(s => s.trim())
              .filter(Boolean);
            if (names.length) {
              const used = new Set();
              const list = names.map((n, i) => {
                const old = teams[i];
                let id = old ? old.id : U.slug(n) || 'team';
                while (used.has(id)) id += '2';
                used.add(id);
                return Object.assign({}, old || {}, { id, name: n });
              });
              Store.save(Object.assign({}, Store.get('settings-teams') || { id: 'settings-teams', c: 'settings' }, { teams: list }));
            }
            const first = (Store.teams()[0] || {}).id || '';
            saveMembersAll(
              Store.members().map(m =>
                m.id === App.me
                  ? Object.assign({}, m, {
                      name: v.name,
                      short: v.short || v.name.split(' ')[0],
                      me: v.name,
                      team: m.team || first,
                      scored: false,
                    })
                  : m
              ),
              'Company set up'
            );
            await Store.flush();
            UI.closeModal();
            location.hash = '#/admin/company';
          } catch (e) {
            CloudUI.err(e);
          }
        };
      },
    });
  },
};

/* wire into the app: an Admin tab (online only), the People table's admin box follows the database, setup on first open */
(function () {
  if (typeof ADMIN_GROUPS === 'undefined' || typeof P === 'undefined' || !P.admin) return;
  const grp = ADMIN_GROUPS.find(g => g[0] === 'People & access');
  if (grp) grp[1].unshift(['company', 'Company & accounts']);
  const base = P.admin;
  P.admin = sub => {
    if (!CloudUI.on()) return base(sub === 'company' ? 'home' : sub);
    if (sub === 'company' && App.isSuper()) {
      const pg = CompanyAdmin.page();
      return {
        title: 'Admin',
        html: adminHead('company') + pg.html,
        mount: root => {
          bindAdminSearch(root);
          pg.mount(root);
        },
      };
    }
    const out = base(sub);
    const m = out.mount;
    out.mount = root => {
      if (m) m(root);
      root.querySelectorAll('[data-k=superAdmin]').forEach(i => {
        i.disabled = true;
        i.title = 'Set in Admin → Company & accounts';
      });
    };
    return out;
  };
  // the tab exists only online: hide it from the tab bar otherwise
  const head = adminHead;
  window.adminHead = tab => {
    const h0 = head(tab);
    return CloudUI.on() ? h0 : h0.replace(/<a class="tab[^"]*" href="#\/admin\/company">[^<]*<\/a>/, '');
  };
  ADMIN_FIND.push(['Company & accounts — invite people, admins, support access, audit log', 'company']);
})();
