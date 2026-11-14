/* MAHAM — Workplace: 🧰 assets & maintenance, 📅 bookings, 📑 documents & policies, 🧑‍💼 HR (onboarding, reviews),
 * 🎓 learning paths, 💳 expenses & budgets. Each is a function in Admin → Functions. Records (writer's own data):
 *   asset     { no AS-n, name, kind, serial, location, owner, status In use|In stock|Repair|Retired, bought, warranty, value, every (days), lastService }
 *   workorder { no WO-n, asset, title, kind Repair|Preventive, assignee, due, status Open|Done, plan (asset|due for a planned one) }
 *   resource  { name, kind Room|Car|Equipment, place, capacity }      booking { resource, date, from, to, title, by }
 *   doc       { title, category, version, body, mustRead, publishedAt, by }     docread { doc, version, by, at }
 *   onboard   { person, kind Onboarding|Offboarding, start, items [{ text, done, doneBy }] }   settings-hr { onboarding [..], offboarding [..] }
 *   review    { person, reviewer, period, score, strengths, improve, goals, status Draft|Shared|Acknowledged }
 *   lpath     { name, courses [names], mandatory, due (date), team }   (progress = the person's Completed course records)
 *   expense   { no EX-n, date, amount, category, desc, by, approver, status Submitted|Approved|Rejected|Paid, comment }
 *   budget    { name, amount, from, to, match (category or project text) } */
'use strict';

const WP = {
  all(c) {
    return Store.all(c, '*');
  },
  next(c) {
    WP._t = WP._t || {};
    const t = (WP._t[c] = WP._t[c] || []);
    const n = Math.max(0, ...WP.all(c).map(x => +x.no || 0), ...t) + 1;
    t.push(n);
    return n;
  },
  key(r) {
    return r && r.no ? ({ asset: 'AS-', workorder: 'WO-', expense: 'EX-' }[r.c] || '') + r.no : '';
  },
  tabs(base, list, on) {
    return OPS.tabs(base, list, on);
  },
  money(n) {
    return OPS.money(n);
  },
  /* one simple form for many kinds: fields [key, label, type, options] */
  edit(r, fields, title, after) {
    const inp = ([k, l, t, o]) => {
      const v = r[k] == null ? '' : r[k];
      if (t === 'select')
        return `<label class="fld"><span>${h(l)}</span>${CRM.sel(
          'wp_' + k,
          (typeof o === 'function' ? o() : o).map(x => (Array.isArray(x) ? x : [x, x])),
          v,
          '—'
        )}</label>`;
      if (t === 'member')
        return `<label class="fld"><span>${h(l)}</span>${CRM.sel(
          'wp_' + k,
          Maham.people().map(p => [p.id, p.name]),
          v || App.me
        )}</label>`;
      if (t === 'bool')
        return `<label class="fld span2"><span><input type="checkbox" id="wp_${k}" ${v ? 'checked' : ''}> ${h(l)}</span></label>`;
      if (t === 'long') return `<label class="fld span2"><span>${h(l)}</span><textarea id="wp_${k}" rows="5">${h(v)}</textarea></label>`;
      return `<label class="fld${t === 'wide' ? ' span2' : ''}"><span>${h(l)}</span><input id="wp_${k}" type="${t === 'wide' ? 'text' : t || 'text'}" value="${h(v)}"></label>`;
    };
    UI.modal({
      title,
      wide: fields.length > 5,
      body: `<div class="grid-form">${fields.map(inp).join('')}</div>${Store.get(r.id) ? Attach.box(r) : ''}`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>',
      onMount: w => {
        w.querySelectorAll('input,textarea').forEach(x => x.addEventListener('keydown', e => e.stopPropagation()));
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const n = Object.assign({}, r);
          for (const [k, , t] of fields) {
            const el = w.querySelector('#wp_' + k);
            n[k] = t === 'bool' ? el.checked : t === 'number' ? +el.value || 0 : el.value.trim();
          }
          const first = fields[0][0];
          if (!n[first]) return UI.toast(`Fill in ${fields[0][1]}`, 'bad');
          const why = after ? after(n) : '';
          if (why) return UI.toast(why, 'bad');
          Store.save(n);
          UI.closeModal();
          App.render();
        };
        if (Store.get(r.id)) Attach.bind(w, r);
      },
    });
  },

  /* ================================================================= 🧰 Assets & maintenance */
  assets(sub) {
    const tab = ['register', 'orders'].includes(sub) ? sub : 'register';
    WP.planOrders();
    const nav = WP.tabs(
      'assets',
      [
        ['register', 'Assets'],
        ['orders', 'Work orders'],
      ],
      tab
    );
    if (tab === 'orders') {
      const today = U.todayStr();
      const rows = WP.all('workorder').filter(o => o.status !== 'Done' || (o.doneAt || 0) > Date.now() - 30 * 864e5);
      return {
        title: 'Assets',
        html: `${nav}<div class="page-actions"><span class="grow"></span><button class="btn primary" id="wonew">＋ Work order</button></div>${UI.table(
          {
            id: 'wo',
            rows,
            exportName: 'Work orders',
            onRow: true,
            cols: [
              { key: 'no', label: 'ID', get: r => WP.key(r), sortVal: r => +r.no || 0 },
              { key: 'title', label: 'Work', get: r => r.title },
              { key: 'asset', label: 'Asset', get: r => (Store.get(r.asset) || {}).name || '' },
              { key: 'kind', label: 'Kind', get: r => r.kind },
              { key: 'who', label: 'Assigned to', get: r => Store.memberShort(r.assignee) || '—' },
              {
                key: 'due',
                label: 'Due',
                html: r =>
                  r.status !== 'Done' && r.due && r.due < today ? `<span class="t-bad">${h(U.fmtDate(r.due))}</span>` : h(U.fmtDate(r.due)),
                get: r => r.due,
                sortVal: r => r.due || '',
              },
              { key: 'status', label: 'Status', get: r => r.status },
            ],
          }
        )}`,
        mount(root) {
          UI.bindTables(root, { wo: r => WP.openWO(r) });
          root.querySelector('#wonew').onclick = () =>
            WP.editWO({ c: 'workorder', id: Maham.uid('workorder'), kind: 'Repair', status: 'Open', due: U.addDays(U.todayStr(), 3) });
        },
      };
    }
    const rows = WP.all('asset');
    return {
      title: 'Assets',
      html: `${nav}<div class="page-actions"><span class="grow"></span><button class="btn primary" id="asnew">＋ New asset</button></div>${UI.table(
        {
          id: 'as',
          rows,
          exportName: 'Assets',
          onRow: true,
          cols: [
            { key: 'no', label: 'Tag', get: r => WP.key(r), sortVal: r => +r.no || 0 },
            { key: 'name', label: 'Asset', get: r => r.name },
            { key: 'kind', label: 'Kind', get: r => r.kind || '' },
            { key: 'location', label: 'Where', get: r => r.location || '' },
            { key: 'owner', label: 'Owner', get: r => Store.memberShort(r.owner) || '' },
            { key: 'status', label: 'Status', get: r => r.status || 'In use' },
            {
              key: 'warranty',
              label: 'Warranty',
              html: r =>
                r.warranty && r.warranty < U.todayStr()
                  ? `<span class="muted">${h(U.fmtDate(r.warranty))} (ended)</span>`
                  : h(U.fmtDate(r.warranty)),
              get: r => r.warranty,
            },
            {
              key: 'next',
              label: 'Next service',
              get: r => (r.every ? U.fmtDate(U.addDays(r.lastService || r.bought || U.todayStr(), +r.every)) : ''),
            },
          ],
        }
      )}`,
      mount(root) {
        UI.bindTables(root, { as: r => WP.editAsset(r) });
        root.querySelector('#asnew').onclick = () =>
          WP.editAsset({ c: 'asset', id: Maham.uid('asset'), no: WP.next('asset'), status: 'In use', owner: App.me });
      },
    };
  },
  editAsset(r) {
    WP.edit(
      r,
      [
        ['name', 'Asset'],
        ['kind', 'Kind (laptop, printer, vehicle …)'],
        ['serial', 'Serial no.'],
        ['location', 'Where'],
        ['owner', 'Owner', 'member'],
        ['status', 'Status', 'select', ['In use', 'In stock', 'Repair', 'Retired']],
        ['bought', 'Bought', 'date'],
        ['warranty', 'Warranty until', 'date'],
        ['value', 'Value', 'number'],
        ['every', 'Service every (days, 0 = none)', 'number'],
        ['lastService', 'Last service', 'date'],
      ],
      `${WP.key(r)} asset`
    );
  },
  editWO(r) {
    WP.edit(
      r,
      [
        ['title', 'Work'],
        ['asset', 'Asset', 'select', () => WP.all('asset').map(a => [a.id, `${WP.key(a)} ${a.name}`])],
        ['kind', 'Kind', 'select', ['Repair', 'Preventive']],
        ['assignee', 'Assigned to', 'member'],
        ['due', 'Due', 'date'],
        ['notes', 'Notes', 'long'],
      ],
      'Work order',
      n => {
        if (!n.no) n.no = WP.next('workorder');
        return '';
      }
    );
  },
  openWO(o) {
    UI.modal({
      title: `${WP.key(o)} · ${o.title}`,
      body: `<p>${h(o.kind)} · ${h((Store.get(o.asset) || {}).name || '')} · ${h(Store.memberShort(o.assignee) || '—')} · due ${h(U.fmtDate(o.due))} · ${h(o.status)}</p>${o.notes ? `<p>${Maham.rich(o.notes)}</p>` : ''}${Attach.box(o)}`,
      actions: `${o.status !== 'Done' ? '<button class="btn primary" data-wodone>✓ Done</button>' : ''} <button class="btn ghost" data-woedit>Edit</button><span class="grow"></span><button class="btn" data-c>Close</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-woedit]').onclick = () => {
          UI.closeModal();
          WP.editWO(o);
        };
        const d = w.querySelector('[data-wodone]');
        if (d)
          d.onclick = () => {
            Store.save(Object.assign({}, o, { status: 'Done', doneAt: Date.now(), doneBy: App.me }));
            const a = Store.get(o.asset);
            if (a && o.kind === 'Preventive') Store.save(Object.assign({}, a, { lastService: U.todayStr() }));
            UI.closeModal();
            App.render();
          };
        Attach.bind(w, o);
      },
    });
  },
  /* preventive maintenance: a work order when a service is due (one per asset and due date, whoever opens the page first) */
  planOrders() {
    if (App.preview || !App.me) return;
    const today = U.todayStr();
    const soon = U.addDays(today, 7);
    const out = [];
    for (const a of WP.all('asset')) {
      if (!(+a.every > 0) || a.status === 'Retired') continue;
      const due = U.addDays(a.lastService || a.bought || today, +a.every);
      if (due > soon) continue;
      const id = `workorder-plan-${a.id}-${due}`;
      if (Store.get(id) || Store.db.get(id)) continue;
      out.push({
        c: 'workorder',
        id,
        no: WP.next('workorder'),
        asset: a.id,
        title: `Service: ${a.name}`,
        kind: 'Preventive',
        assignee: a.owner || App.me,
        due,
        status: 'Open',
        plan: a.id + '|' + due,
      });
    }
    if (out.length) Store.saveMany(out);
  },

  /* ================================================================= 📅 Bookings */
  bookings() {
    const f = ps('book');
    const day = f.day || U.todayStr();
    const res = WP.all('resource');
    const bk = WP.all('booking').filter(b => b.date === day);
    const hours = [...Array(12)].map((_, i) => String(7 + i).padStart(2, '0') + ':00');
    const cell = (r, hh) => {
      const b = bk.find(x => x.resource === r.id && x.from <= hh && x.to > hh);
      return b
        ? `<td class="bk-on" title="${h(b.title)} · ${h(Store.memberShort(b.by))} ${h(b.from)}–${h(b.to)}">${b.from === hh || hh === hours[0] ? h(b.title || '') : ''}</td>`
        : '<td></td>';
    };
    return {
      title: 'Bookings',
      html: `<div class="page-actions"><a href="#" class="btn sm" data-bkd="-1">‹</a> <input type="date" id="bkday" value="${h(day)}"> <a href="#" class="btn sm" data-bkd="1">›</a><span class="grow"></span>${App.isSuper() ? '<button class="btn" id="resnew">＋ Room / car / equipment</button> ' : ''}<button class="btn primary" id="bknew">＋ Book</button></div>
      ${res.length ? `<div class="tbl-wrap"><table class="tbl bk-grid"><thead><tr><th>What</th>${hours.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${res.map(r => `<tr><td class="nw"><b>${h(r.name)}</b> <span class="muted small">${h(r.kind || '')}${r.capacity ? ' · ' + r.capacity : ''}</span></td>${hours.map(hh => cell(r, hh)).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="oneline">Nothing to book yet — the admin adds rooms, cars and equipment.</div>'}
      ${card(
        'My bookings',
        WP.all('booking')
          .filter(b => b.by === App.me && b.date >= U.todayStr())
          .sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from))
          .map(
            b =>
              `<div class="li"><div class="grow"><b>${h((Store.get(b.resource) || {}).name || '')}</b> ${h(U.fmtDate(b.date))} ${h(b.from)}–${h(b.to)} · ${h(b.title || '')}</div><a href="#" class="link small" data-bkdel="${h(b.id)}">Cancel</a></div>`
          )
          .join('') || '<p class="muted small">None.</p>'
      )}`,
      mount(root) {
        root.querySelector('#bkday').onchange = e => {
          ps('book').day = e.target.value;
          App.render();
        };
        root.querySelectorAll('[data-bkd]').forEach(
          a =>
            (a.onclick = e => {
              e.preventDefault();
              ps('book').day = U.addDays(day, +a.dataset.bkd);
              App.render();
            })
        );
        const rn = root.querySelector('#resnew');
        if (rn)
          rn.onclick = () =>
            WP.edit(
              { c: 'resource', id: Maham.uid('resource') },
              [
                ['name', 'Name'],
                ['kind', 'Kind', 'select', ['Room', 'Car', 'Equipment']],
                ['place', 'Where'],
                ['capacity', 'Capacity', 'number'],
              ],
              'Something to book'
            );
        root.querySelector('#bknew').onclick = () =>
          WP.edit(
            { c: 'booking', id: Maham.uid('booking'), date: day, from: '09:00', to: '10:00', by: App.me },
            [
              ['title', 'What for'],
              ['resource', 'Room / car / equipment', 'select', () => WP.all('resource').map(r => [r.id, r.name])],
              ['date', 'Date', 'date'],
              ['from', 'From', 'time'],
              ['to', 'To', 'time'],
            ],
            'Book',
            WP.clash
          );
        root.querySelectorAll('[data-bkdel]').forEach(
          a =>
            (a.onclick = e => {
              e.preventDefault();
              const b = Store.get(a.dataset.bkdel);
              if (b) {
                Store.save(Object.assign({}, b, { _del: true }));
                App.render();
              }
            })
        );
      },
    };
  },
  clash(n) {
    if (!n.resource) return 'Choose what to book';
    if (!(n.from < n.to)) return 'The end must be after the start';
    const c = WP.all('booking').find(
      b => b.id !== n.id && b.resource === n.resource && b.date === n.date && b.from < n.to && n.from < b.to
    );
    return c ? `Already booked ${c.from}–${c.to} by ${Store.memberShort(c.by)}` : '';
  },

  /* ================================================================= 📑 Documents & policies */
  docs() {
    const rows = WP.all('doc');
    const reads = WP.all('docread');
    const confirmed = (d, who) => reads.some(r => r.doc === d.id && r.version === d.version && r.by === who);
    const toRead = rows.filter(d => d.mustRead && !confirmed(d, App.me));
    return {
      title: 'Documents',
      html: `${toRead.length ? `<div class="insights warnbox"><div>📑 <b>${toRead.length}</b> document${toRead.length === 1 ? '' : 's'} to read and confirm: ${toRead.map(d => `<a href="#" class="link" data-dopen="${h(d.id)}">${h(d.title)}</a>`).join(', ')}</div></div>` : ''}
      <div class="page-actions"><span class="grow"></span>${App.isSuper() || App.isMgr() ? '<button class="btn primary" id="docnew">＋ New document</button>' : ''}</div>
      ${UI.table({
        id: 'docs',
        rows,
        exportName: 'Documents',
        onRow: true,
        cols: [
          { key: 'title', label: 'Document', get: r => r.title },
          { key: 'category', label: 'Category', get: r => r.category || '' },
          { key: 'version', label: 'Version', get: r => r.version || '1' },
          {
            key: 'must',
            label: 'Must read',
            html: r =>
              r.mustRead
                ? confirmed(r, App.me)
                  ? '<span class="t-good">✓ confirmed</span>'
                  : '<span class="t-warn">to confirm</span>'
                : '',
            get: r => (r.mustRead ? 'yes' : ''),
          },
          {
            key: 'who',
            label: 'Confirmed',
            cls: 'num',
            get: r =>
              r.mustRead
                ? `${new Set(reads.filter(x => x.doc === r.id && x.version === r.version).map(x => x.by)).size} / ${Maham.people().length}`
                : '',
          },
        ],
      })}`,
      mount(root) {
        UI.bindTables(root, { docs: r => WP.openDoc(r) });
        root.querySelectorAll('[data-dopen]').forEach(
          a =>
            (a.onclick = e => {
              e.preventDefault();
              WP.openDoc(Store.get(a.dataset.dopen));
            })
        );
        const n = root.querySelector('#docnew');
        if (n) n.onclick = () => WP.editDoc({ c: 'doc', id: Maham.uid('doc'), version: '1', by: App.me });
      },
    };
  },
  editDoc(r) {
    const v0 = r.version;
    WP.edit(
      r,
      [
        ['title', 'Title'],
        ['category', 'Category (policy, procedure, form …)'],
        ['version', 'Version'],
        ['mustRead', 'Everyone must read and confirm it', 'bool'],
        ['body', 'Text (or attach the file after saving)', 'long'],
      ],
      'Document',
      n => {
        n.publishedAt = Date.now();
        if (Store.get(n.id) && n.version === v0 && n.body !== (Store.get(n.id) || {}).body && n.mustRead)
          return 'The text changed: give it a new version so everyone confirms it again';
        return '';
      }
    );
  },
  openDoc(d) {
    const done = WP.all('docread').some(r => r.doc === d.id && r.version === d.version && r.by === App.me);
    const who =
      App.isSuper() || App.isMgr()
        ? Maham.people()
            .filter(p => !WP.all('docread').some(r => r.doc === d.id && r.version === d.version && r.by === p.id))
            .map(p => p.name)
        : [];
    UI.modal({
      title: `${d.title} · v${d.version || 1}`,
      wide: true,
      body: `<div class="tk-desc">${Maham.rich(d.body || '')}</div>${Attach.box(d)}${d.mustRead && who.length ? `<p class="muted small">Not confirmed yet: ${h(who.join(', '))}</p>` : ''}`,
      actions: `${d.mustRead && !done ? '<button class="btn primary" data-dok>✓ I have read and understood it</button>' : d.mustRead ? '<span class="t-good">✓ You confirmed this version</span>' : ''}${App.isSuper() || d.by === App.me ? ' <button class="btn ghost" data-dedit>Edit</button>' : ''}<span class="grow"></span><button class="btn" data-c>Close</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        const ok = w.querySelector('[data-dok]');
        if (ok)
          ok.onclick = () => {
            Store.save({
              c: 'docread',
              id: `docread-${App.me}-${d.id}-${d.version}`,
              doc: d.id,
              version: d.version,
              by: App.me,
              at: Date.now(),
            });
            UI.closeModal();
            UI.toast('Confirmed', 'good');
            App.render();
          };
        const ed = w.querySelector('[data-dedit]');
        if (ed)
          ed.onclick = () => {
            UI.closeModal();
            WP.editDoc(d);
          };
        Attach.bind(w, d);
      },
    });
  },

  /* ================================================================= 🧑‍💼 HR: onboarding / offboarding, reviews */
  hr(sub) {
    const tab = ['onboarding', 'reviews'].includes(sub) ? sub : 'onboarding';
    const nav = WP.tabs(
      'hr',
      [
        ['onboarding', 'On- & offboarding'],
        ['reviews', 'Reviews'],
      ],
      tab
    );
    const mgr = App.isSuper() || App.isMgr();
    if (tab === 'reviews') {
      const rows = WP.all('review').filter(r => mgr || r.person === App.me);
      return {
        title: 'HR',
        html: `${nav}<div class="page-actions"><span class="grow"></span>${mgr ? '<button class="btn primary" id="rvnew">＋ Review</button>' : ''}</div>${UI.table(
          {
            id: 'rv',
            rows,
            exportName: 'Reviews',
            onRow: true,
            cols: [
              { key: 'person', label: 'Person', get: r => Store.memberShort(r.person) || '' },
              { key: 'period', label: 'Period', get: r => r.period || '' },
              { key: 'score', label: 'Score (MAHAM)', cls: 'num', get: r => (r.score != null ? U.num(r.score, 1) : '—') },
              { key: 'status', label: 'Status', get: r => r.status },
              { key: 'reviewer', label: 'Reviewer', get: r => Store.memberShort(r.reviewer) || '' },
            ],
          }
        )}`,
        mount(root) {
          UI.bindTables(root, { rv: r => WP.openReview(r) });
          const n = root.querySelector('#rvnew');
          if (n) n.onclick = () => WP.newReview();
        },
      };
    }
    const rows = WP.all('onboard').filter(o => mgr || o.person === App.me);
    return {
      title: 'HR',
      html: `${nav}<div class="page-actions"><span class="grow"></span>${mgr ? '<button class="btn" id="obtpl">Checklists</button> <button class="btn primary" id="obnew">＋ Start a checklist</button>' : ''}</div>${UI.table(
        {
          id: 'ob',
          rows,
          exportName: 'Onboarding',
          onRow: true,
          cols: [
            { key: 'person', label: 'Person', get: r => Store.memberShort(r.person) || r.person },
            { key: 'kind', label: 'Kind', get: r => r.kind },
            { key: 'start', label: 'From', get: r => U.fmtDate(r.start) },
            {
              key: 'done',
              label: 'Done',
              cls: 'num',
              get: r => `${(r.items || []).filter(i => i.done).length} / ${(r.items || []).length}`,
            },
          ],
        }
      )}`,
      mount(root) {
        UI.bindTables(root, { ob: r => WP.openOnboard(r) });
        const n = root.querySelector('#obnew');
        if (n) n.onclick = () => WP.newOnboard();
        const t = root.querySelector('#obtpl');
        if (t) t.onclick = () => WP.hrTemplates();
      },
    };
  },
  hrTpl() {
    const s = Store.get('settings-hr') || {};
    return {
      onboarding: s.onboarding || [
        'Account and email',
        'Laptop and access card',
        'Meet the team',
        'Read the must-read documents',
        'First 1:1 with the manager',
      ],
      offboarding: s.offboarding || ['Hand over open work (🤝 Hand over)', 'Return laptop and card', 'Close accounts', 'Exit interview'],
    };
  },
  hrTemplates() {
    const t = WP.hrTpl();
    UI.modal({
      title: 'Checklists',
      body: `<label class="fld"><span>Onboarding (one step per line)</span><textarea id="hron" rows="6" style="width:100%">${h(t.onboarding.join('\n'))}</textarea></label><label class="fld"><span>Offboarding</span><textarea id="hroff" rows="5" style="width:100%">${h(t.offboarding.join('\n'))}</textarea></label>`,
      actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button>${App.isSuper() ? '<button class="btn primary" data-ok>Save</button>' : ''}`,
      onMount: w => {
        w.querySelectorAll('textarea').forEach(x => x.addEventListener('keydown', e => e.stopPropagation()));
        w.querySelector('[data-c]').onclick = UI.closeModal;
        const ok = w.querySelector('[data-ok]');
        if (ok)
          ok.onclick = () => {
            const L = id =>
              w
                .querySelector(id)
                .value.split('\n')
                .map(x => x.trim())
                .filter(Boolean);
            Store.save(
              Object.assign({ id: 'settings-hr', c: 'settings' }, Store.get('settings-hr') || {}, {
                onboarding: L('#hron'),
                offboarding: L('#hroff'),
              })
            );
            UI.closeModal();
          };
      },
    });
  },
  newOnboard() {
    WP.edit(
      { c: 'onboard', id: Maham.uid('onboard'), kind: 'Onboarding', start: U.todayStr() },
      [
        ['person', 'Person', 'member'],
        ['kind', 'Kind', 'select', ['Onboarding', 'Offboarding']],
        ['start', 'From', 'date'],
      ],
      'Start a checklist',
      n => {
        n.items = (n.kind === 'Offboarding' ? WP.hrTpl().offboarding : WP.hrTpl().onboarding).map(text => ({ text, done: false }));
        return '';
      }
    );
  },
  openOnboard(o) {
    o = Store.get(o.id) || o;
    const can = App.isSuper() || App.isMgr() || o.person === App.me;
    UI.modal({
      title: `${o.kind}: ${Store.memberShort(o.person) || o.person}`,
      body: (o.items || [])
        .map(
          (it, k) =>
            `<label class="check"><input type="checkbox" data-obi="${k}" ${it.done ? 'checked' : ''} ${can ? '' : 'disabled'}> ${h(it.text)}${it.doneBy ? ` <span class="muted small">— ${h(Store.memberShort(it.doneBy))}</span>` : ''}</label>`
        )
        .join('<br>'),
      actions: '<span class="grow"></span><button class="btn primary" data-c>Close</button>',
      onMount: w => {
        w.querySelector('[data-c]').onclick = () => {
          UI.closeModal();
          App.render();
        };
        w.querySelectorAll('[data-obi]').forEach(
          b =>
            (b.onchange = () => {
              const cur = Store.get(o.id) || o;
              const items = (cur.items || []).map((x, k) =>
                k === +b.dataset.obi ? Object.assign({}, x, { done: b.checked, doneBy: b.checked ? App.me : '' }) : x
              );
              Store.save(Object.assign({}, cur, { items }));
            })
        );
      },
    });
  },
  /* a review starts from the person's real monthly scores (the average of the period's months that have a score) */
  scoreFor(person, from, to) {
    try {
      const out = [];
      let d = from.slice(0, 7);
      while (d <= to.slice(0, 7)) {
        const [y, m] = d.split('-').map(Number);
        const sc = Calc.monthScore(y, person, m);
        if (sc && sc.score != null) out.push(sc.score);
        d = U.addDays(d + '-01', 32).slice(0, 7);
      }
      return out.length ? out.reduce((a, b) => a + b, 0) / out.length : null;
    } catch (e) {
      return null;
    }
  },
  newReview() {
    const y = new Date().getFullYear();
    WP.edit(
      { c: 'review', id: Maham.uid('review'), reviewer: App.me, period: `${y}`, status: 'Draft' },
      [
        ['person', 'Person', 'member'],
        ['period', 'Period (e.g. 2026, or 2026-H2)'],
        ['strengths', 'Strengths', 'long'],
        ['improve', 'To improve', 'long'],
        ['goals', 'Goals for next period', 'long'],
      ],
      'Review',
      n => {
        const y0 = String(n.period).slice(0, 4);
        const half = /H2/i.test(n.period) ? ['07', '12'] : /H1/i.test(n.period) ? ['01', '06'] : ['01', '12'];
        n.score = WP.scoreFor(n.person, `${y0}-${half[0]}-01`, `${y0}-${half[1]}-28`);
        return '';
      }
    );
  },
  openReview(r) {
    const mine = r.person === App.me;
    const mgr = r.reviewer === App.me || App.isSuper();
    UI.modal({
      title: `Review · ${Store.memberShort(r.person)} · ${r.period}`,
      wide: true,
      body: `<p>Score from MAHAM for the period: <b>${r.score != null ? U.num(r.score, 1) : '—'}</b> · ${h(r.status)}</p>
        <h4>Strengths</h4><p>${Maham.rich(r.strengths || '—')}</p><h4>To improve</h4><p>${Maham.rich(r.improve || '—')}</p><h4>Goals</h4><p>${Maham.rich(r.goals || '—')}</p>${r.reply ? `<h4>${h(Store.memberShort(r.person))}'s comment</h4><p>${Maham.rich(r.reply)}</p>` : ''}
        ${mine && r.status === 'Shared' ? '<textarea id="rvrep" rows="2" style="width:100%" placeholder="Your comment (optional)"></textarea>' : ''}`,
      actions: `${mgr && r.status === 'Draft' ? '<button class="btn" data-rvshare>Share with them</button>' : ''}${mine && r.status === 'Shared' ? '<button class="btn primary" data-rvack>✓ Acknowledge</button>' : ''}<span class="grow"></span><button class="btn" data-c>Close</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        const sh = w.querySelector('[data-rvshare]');
        if (sh)
          sh.onclick = () => {
            Store.save(Object.assign({}, r, { status: 'Shared', sharedAt: Date.now() }));
            UI.closeModal();
            App.render();
          };
        const ak = w.querySelector('[data-rvack]');
        if (ak)
          ak.onclick = () => {
            Store.save(
              Object.assign({}, r, { status: 'Acknowledged', reply: (w.querySelector('#rvrep') || {}).value || '', ackAt: Date.now() })
            );
            UI.closeModal();
            App.render();
          };
      },
    });
  },

  /* ================================================================= 🎓 Learning paths (on the Courses records) */
  learning() {
    const paths = WP.all('lpath');
    const people = App.can('viewOthers') ? Maham.people() : Maham.people().filter(p => p.id === App.me);
    const doneBy = (who, name) =>
      Store.all('course', '*').some(c => c.analyst === who && U.lc(c.course) === U.lc(name) && (c.status === 'Completed' || c.completed));
    const prog = (p, who) => {
      const n = (p.courses || []).filter(x => doneBy(who, x)).length;
      return [n, (p.courses || []).length];
    };
    const today = U.todayStr();
    return {
      title: 'Learning',
      html: `<div class="page-actions"><span class="muted small">A path is a set of courses; finishing them is the Courses page (status Completed).</span><span class="grow"></span>${App.isSuper() || App.isMgr() ? '<button class="btn primary" id="lpnew">＋ Learning path</button>' : ''}</div>
      ${
        paths
          .map(p =>
            card(
              `${h(p.name)}${p.mandatory ? ' <span class="badge warn">mandatory</span>' : ''}${p.due ? ` <span class="muted small">by ${h(U.fmtDate(p.due))}</span>` : ''}`,
              `<p class="muted small">${h((p.courses || []).join(' · '))}</p><table class="tbl"><tbody>${people
                .map(m => {
                  const [n, t] = prog(p, m.id);
                  const late = p.mandatory && p.due && p.due < today && n < t;
                  return `<tr><td>${h(m.name)}</td><td class="num">${n} / ${t}</td><td>${n === t && t ? '<span class="t-good">✓ done</span>' : late ? '<span class="t-bad">overdue</span>' : ''}</td></tr>`;
                })
                .join('')}</tbody></table>`,
              App.isSuper() || App.isMgr() ? `<a href="#" class="link small" data-lpedit="${h(p.id)}">Edit</a>` : ''
            )
          )
          .join('') || '<div class="oneline">No learning paths yet.</div>'
      }`,
      mount(root) {
        const n = root.querySelector('#lpnew');
        if (n) n.onclick = () => WP.editPath({ c: 'lpath', id: Maham.uid('lpath'), courses: [] });
        root.querySelectorAll('[data-lpedit]').forEach(
          a =>
            (a.onclick = e => {
              e.preventDefault();
              WP.editPath(Store.get(a.dataset.lpedit));
            })
        );
      },
    };
  },
  editPath(p) {
    const r = Object.assign({}, p, { list: (p.courses || []).join('\n') });
    WP.edit(
      r,
      [
        ['name', 'Name'],
        ['list', 'Courses (one per line, as named in Courses)', 'long'],
        ['mandatory', 'Mandatory for everyone', 'bool'],
        ['due', 'Finish by', 'date'],
      ],
      'Learning path',
      n => {
        n.courses = n.list
          .split('\n')
          .map(x => x.trim())
          .filter(Boolean);
        delete n.list;
        return n.courses.length ? '' : 'List at least one course';
      }
    );
  },

  /* ================================================================= 💳 Expenses & budgets */
  expenses(sub) {
    const tab = ['claims', 'approve', 'budgets'].includes(sub) ? sub : 'claims';
    const mineAppr = WP.all('expense').filter(x => x.status === 'Submitted' && (x.approver === App.me || App.isSuper()) && x.by !== App.me);
    const nav = WP.tabs(
      'expenses',
      [
        ['claims', 'My claims'],
        ['approve', `To approve${mineAppr.length ? ` <span class="count">${mineAppr.length}</span>` : ''}`],
        ['budgets', 'Budgets'],
      ],
      tab
    );
    const cols = [
      { key: 'no', label: 'ID', get: r => WP.key(r), sortVal: r => +r.no || 0 },
      { key: 'date', label: 'Date', get: r => U.fmtDate(r.date), sortVal: r => r.date || '' },
      { key: 'desc', label: 'What', get: r => r.desc },
      { key: 'category', label: 'Category', get: r => r.category || '' },
      { key: 'amount', label: 'Amount', cls: 'num', get: r => WP.money(r.amount), sortVal: r => +r.amount || 0 },
      { key: 'by', label: 'By', get: r => Store.memberShort(r.by) || '' },
      { key: 'status', label: 'Status', get: r => r.status },
    ];
    if (tab === 'budgets') {
      const spent = b =>
        WP.all('expense')
          .filter(
            x =>
              ['Approved', 'Paid'].includes(x.status) &&
              (!b.from || x.date >= b.from) &&
              (!b.to || x.date <= b.to) &&
              (!b.match || U.lc([x.category, x.desc].join(' ')).includes(U.lc(b.match)))
          )
          .reduce((n, x) => n + (+x.amount || 0), 0) +
        OPS.all('purchase')
          .filter(p => ['Approved', 'Ordered', 'Received'].includes(p.status) && (!b.match || U.lc(p.title).includes(U.lc(b.match))))
          .reduce((n, p) => n + OPS.prTotal(p), 0);
      return {
        title: 'Expenses',
        html: `${nav}<div class="page-actions"><span class="grow"></span>${App.isSuper() ? '<button class="btn primary" id="bgnew">＋ Budget</button>' : ''}</div>${UI.table(
          {
            id: 'bg',
            rows: WP.all('budget'),
            exportName: 'Budgets',
            onRow: true,
            cols: [
              { key: 'name', label: 'Budget', get: r => r.name },
              { key: 'amount', label: 'Budget', cls: 'num', get: r => WP.money(r.amount) },
              { key: 'spent', label: 'Spent', cls: 'num', get: r => WP.money(spent(r)) },
              {
                key: 'left',
                label: 'Left',
                cls: 'num',
                html: r => {
                  const l = (+r.amount || 0) - spent(r);
                  return `<span class="${l < 0 ? 't-bad' : ''}">${h(WP.money(l))}</span>`;
                },
                get: r => (+r.amount || 0) - spent(r),
              },
              { key: 'pct', label: 'Used', cls: 'num', get: r => (+r.amount ? Math.round((spent(r) / r.amount) * 100) + '%' : '') },
            ],
          }
        )}
        <p class="muted small">Spent = approved expenses and approved purchases whose category, description or title contains the budget's “matches” text, within its dates.</p>`,
        mount(root) {
          UI.bindTables(root, { bg: r => (App.isSuper() ? WP.editBudget(r) : null) });
          const n = root.querySelector('#bgnew');
          if (n)
            n.onclick = () =>
              WP.editBudget({
                c: 'budget',
                id: Maham.uid('budget'),
                from: U.todayStr().slice(0, 4) + '-01-01',
                to: U.todayStr().slice(0, 4) + '-12-31',
              });
        },
      };
    }
    const rows = tab === 'approve' ? mineAppr : WP.all('expense').filter(x => x.by === App.me);
    return {
      title: 'Expenses',
      html: `${nav}<div class="page-actions"><span class="grow"></span>${tab === 'claims' ? '<button class="btn primary" id="exnew">＋ New claim</button>' : ''}</div>${rows.length ? UI.table({ id: 'ex' + tab, rows, exportName: 'Expenses', onRow: true, cols }) : '<div class="oneline">Nothing here.</div>'}`,
      mount(root) {
        UI.bindTables(root, { ['ex' + tab]: r => WP.openExpense(r) });
        const n = root.querySelector('#exnew');
        if (n)
          n.onclick = () =>
            WP.edit(
              { c: 'expense', id: Maham.uid('expense'), date: U.todayStr(), by: App.me },
              [
                ['desc', 'What for'],
                ['date', 'Date', 'date'],
                ['amount', 'Amount', 'number'],
                ['category', 'Category', 'select', ['Travel', 'Meals', 'Supplies', 'Training', 'Other']],
              ],
              'Expense claim',
              x => {
                if (!(x.amount > 0)) return 'Write the amount';
                x.no = x.no || WP.next('expense');
                x.status = 'Submitted';
                x.approver = OPS.mgrOf(App.me) || (Store.members().find(m => m.superAdmin) || {}).id || '';
                return '';
              }
            );
      },
    };
  },
  editBudget(b) {
    WP.edit(
      b,
      [
        ['name', 'Budget'],
        ['amount', 'Amount', 'number'],
        ['from', 'From', 'date'],
        ['to', 'To', 'date'],
        ['match', 'Matches (category or words)'],
      ],
      'Budget'
    );
  },
  openExpense(x) {
    x = Store.get(x.id) || x;
    const can = x.status === 'Submitted' && (x.approver === App.me || App.isSuper()) && x.by !== App.me;
    UI.modal({
      title: `${WP.key(x)} · ${x.desc}`,
      body: `<p>${h(U.fmtDate(x.date))} · <b>${h(WP.money(x.amount))}</b> · ${h(x.category || '')} · by ${h(Store.memberShort(x.by))} · ${h(x.status)}${x.comment ? ' — ' + h(x.comment) : ''}</p>${Attach.box(x)}${can ? '<input id="exc" placeholder="Comment (needed to reject)" style="width:100%">' : ''}`,
      actions: `${can ? '<button class="btn" data-exno>Reject</button> <button class="btn primary" data-exok>Approve</button>' : ''}${App.isSuper() && x.status === 'Approved' ? '<button class="btn" data-expaid>Mark paid</button>' : ''}<span class="grow"></span><button class="btn" data-c>Close</button>`,
      onMount: w => {
        const set = p => {
          Store.save(Object.assign({}, x, p));
          UI.closeModal();
          App.render();
        };
        const c = w.querySelector('#exc');
        if (c) c.addEventListener('keydown', e => e.stopPropagation());
        w.querySelector('[data-c]').onclick = UI.closeModal;
        const ok = w.querySelector('[data-exok]');
        if (ok) ok.onclick = () => set({ status: 'Approved', comment: c.value.trim(), decidedBy: App.me, decidedAt: Date.now() });
        const no = w.querySelector('[data-exno]');
        if (no)
          no.onclick = () => {
            if (!c.value.trim()) return UI.toast('Write why it is rejected', 'bad');
            set({ status: 'Rejected', comment: c.value.trim(), decidedBy: App.me, decidedAt: Date.now() });
          };
        const pd = w.querySelector('[data-expaid]');
        if (pd) pd.onclick = () => set({ status: 'Paid', paidAt: Date.now() });
        Attach.bind(w, x);
      },
    });
  },
};

Maham.section(
  'Workplace',
  '🏢',
  [
    ['assets', 'Assets', '🧰'],
    ['bookings', 'Bookings', '📅'],
    ['documents', 'Documents', '📑'],
    ['hr', 'HR', '🧑‍💼'],
    ['learning', 'Learning', '🎓'],
    ['expenses', 'Expenses', '💳'],
  ],
  'Operations'
);
Maham.page('assets', 'Assets & maintenance', ['asset', 'workorder']);
Maham.page('bookings', 'Bookings', ['resource', 'booking']);
Maham.page('documents', 'Documents & policies', ['doc', 'docread']);
Maham.page('hr', 'HR (onboarding, reviews)', ['onboard', 'review']);
Maham.page('learning', 'Learning paths', ['lpath']);
Maham.page('expenses', 'Expenses & budgets', ['expense', 'budget']);
P.assets = sub => WP.assets(sub);
P.bookings = () => WP.bookings();
P.documents = () => WP.docs();
P.hr = sub => WP.hr(sub);
P.learning = () => WP.learning();
P.expenses = sub => WP.expenses(sub);

Notify.rules.push((r, prev) => {
  if (r.c === 'workorder' && r.assignee && (!prev || prev.assignee !== r.assignee))
    return [{ to: r.assignee, kind: 'asset', title: `gave you work order ${WP.key(r)}`, text: r.title, link: '#/assets/orders' }];
  if (r.c === 'expense' && r.status === 'Submitted' && r.approver && (!prev || prev.status !== 'Submitted'))
    return [
      {
        to: r.approver,
        kind: 'approval',
        title: `asks you to approve ${WP.key(r)}`,
        text: `${r.desc} — ${WP.money(r.amount)}`,
        link: '#/expenses/approve',
      },
    ];
  if (r.c === 'expense' && prev && prev.status === 'Submitted' && ['Approved', 'Rejected'].includes(r.status))
    return [
      {
        to: r.by,
        kind: 'approval',
        title: `${r.status.toLowerCase()} your claim ${WP.key(r)}`,
        text: r.comment || r.desc,
        link: '#/expenses/claims',
      },
    ];
  if (r.c === 'review' && r.status === 'Shared' && (!prev || prev.status !== 'Shared'))
    return [{ to: r.person, kind: 'hr', title: 'shared your review', text: r.period, link: '#/hr/reviews' }];
  if (r.c === 'onboard' && !prev)
    return [{ to: r.person, kind: 'hr', title: `started your ${r.kind.toLowerCase()} checklist`, text: '', link: '#/hr/onboarding' }];
  if (r.c === 'doc' && r.mustRead && (!prev || prev.version !== r.version))
    return Maham.people()
      .filter(p => p.id !== App.me)
      .slice(0, 200)
      .map(p => ({
        to: p.id,
        kind: 'doc',
        title: 'asks you to read and confirm',
        text: `${r.title} (v${r.version})`,
        link: '#/documents',
      }));
  return [];
});
['asset', 'workorder', 'doc', 'expense'].forEach(c => Attach.extraColls.push(c));
