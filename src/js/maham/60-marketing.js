/* MAHAM — 📣 Marketing: campaigns (budget, results, revenue they brought), segments of contacts (to export for a
 * WhatsApp broadcast or email in one go), and lead forms (online: form.html — each sign-up becomes a contact and a
 * follow-up for the campaign's owner).
 * Records: campaign { id, name, kind, status Planned|Running|Done, start, end, budget, spent, owner, goal, notes, form { on, title, intro, ask [fields] } }
 *          segment  { id, name, tags [..], city, industry, owner }
 * A deal's "source" can be a campaign id: its won value is the campaign's revenue. Sign-ups arrive as contacts with
 * source = the campaign id (supabase/schema.sql → form_submit). */
'use strict';

const MKT = {
  KINDS: ['Email', 'WhatsApp', 'Event', 'Social', 'Ads', 'Other'],
  ST: ['Planned', 'Running', 'Done'],
  all(c) {
    return Store.all(c, '*');
  },
  leads(cid) {
    return MKT.all('contact').filter(x => x.source === cid);
  },
  deals(cid) {
    return MKT.all('deal').filter(d => d.source === cid);
  },
  revenue(cid) {
    return MKT.deals(cid)
      .filter(d => d.status === 'won')
      .reduce((n, d) => n + (+d.value || 0), 0);
  },
  members(seg) {
    const tags = (seg.tags || []).map(t => U.lc(t));
    const l = MKT.all('contact');
    return l.filter(
      x =>
        (!tags.length || (x.tags || []).some(t => tags.includes(U.lc(t)))) &&
        (!seg.city || U.lc((Store.get(x.account) || {}).city || x.city || '') === U.lc(seg.city)) &&
        (!seg.industry || U.lc((Store.get(x.account) || {}).industry || '') === U.lc(seg.industry))
    );
  },
  page(sub) {
    const tab = ['campaigns', 'segments'].includes(sub) ? sub : 'campaigns';
    const nav = `<div class="tabs"><a class="tab ${tab === 'campaigns' ? 'on' : ''}" href="#/marketing/campaigns">Campaigns</a><a class="tab ${tab === 'segments' ? 'on' : ''}" href="#/marketing/segments">Segments</a></div>`;
    return tab === 'segments' ? MKT.segPage(nav) : MKT.campPage(nav);
  },
  campPage(nav) {
    const rows = MKT.all('campaign');
    const tot = rows.reduce((o, r) => ({ b: o.b + (+r.budget || 0), s: o.s + (+r.spent || 0), rev: o.rev + MKT.revenue(r.id) }), {
      b: 0,
      s: 0,
      rev: 0,
    });
    const html = `${nav}<div class="page-actions"><span class="totals-line"><b>${rows.filter(r => r.status === 'Running').length}</b> running · budget <b>${CRM.money(tot.b)}</b> · spent <b>${CRM.money(tot.s)}</b> · revenue won <b>${CRM.money(tot.rev)}</b></span><span class="grow"></span><button class="btn primary" id="mknew">＋ New campaign</button></div>
      ${UI.table({
        id: 'mkcamp',
        rows,
        exportName: 'Campaigns',
        onRow: true,
        cols: [
          { key: 'name', label: 'Campaign', get: r => r.name },
          { key: 'kind', label: 'Kind', get: r => r.kind || '' },
          {
            key: 'status',
            label: 'Status',
            html: r =>
              UI.sbadge(r.status === 'Running' ? 'In Progress' : r.status === 'Done' ? 'Done' : 'Open').replace(
                />[^<]*</,
                `>${h(r.status || 'Planned')}<`
              ),
            get: r => r.status,
          },
          { key: 'dates', label: 'Dates', get: r => [U.fmtDate(r.start), U.fmtDate(r.end)].filter(Boolean).join(' – ') },
          { key: 'leads', label: 'Leads', cls: 'num', get: r => MKT.leads(r.id).length },
          { key: 'deals', label: 'Deals', cls: 'num', get: r => MKT.deals(r.id).length },
          { key: 'rev', label: 'Won', cls: 'num', get: r => CRM.money(MKT.revenue(r.id)), sortVal: r => MKT.revenue(r.id) },
          {
            key: 'roi',
            label: 'Return',
            cls: 'num',
            get: r => (+r.spent ? Math.round((MKT.revenue(r.id) / +r.spent) * 100) / 100 + '×' : '—'),
          },
          { key: 'owner', label: 'Owner', get: r => Store.memberShort(r.owner) || '' },
        ],
      })}`;
    return {
      title: 'Marketing',
      html,
      mount(root) {
        UI.bindTables(root, { mkcamp: r => MKT.editCamp(r) });
        root.querySelector('#mknew').onclick = () =>
          MKT.editCamp({ c: 'campaign', id: Maham.uid('campaign'), status: 'Planned', kind: 'Email', owner: App.me, start: U.todayStr() });
      },
    };
  },
  editCamp(r) {
    const v = k => h(r[k] == null ? '' : r[k]);
    const f = r.form || {};
    const isNew = !Store.get(r.id);
    const link =
      Store.storageMode === 'cloud' && Store.cloudCompany && f.on && !isNew
        ? `${location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '')}form.html?c=${encodeURIComponent(Store.cloudCompany.company_id)}&f=${encodeURIComponent(r.id)}`
        : '';
    UI.modal({
      title: (isNew ? 'New' : 'Edit') + ' campaign',
      wide: true,
      body: `<div class="grid-form">
        <label class="fld span2"><span>Name</span><input id="mkn" value="${v('name')}"></label>
        <label class="fld"><span>Kind</span><select id="mkk">${MKT.KINDS.map(x => `<option ${x === r.kind ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="fld"><span>Status</span><select id="mks">${MKT.ST.map(x => `<option ${x === (r.status || 'Planned') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="fld"><span>Start</span><input id="mkst" type="date" value="${v('start')}"></label><label class="fld"><span>End</span><input id="mken" type="date" value="${v('end')}"></label>
        <label class="fld"><span>Budget</span><input id="mkb" type="number" min="0" value="${v('budget')}"></label><label class="fld"><span>Spent</span><input id="mksp" type="number" min="0" value="${v('spent')}"></label>
        <label class="fld"><span>Owner</span>${CRM.sel(
          'mko',
          Maham.people().map(p => [p.id, p.name]),
          r.owner
        )}</label>
        <label class="fld span2"><span>Goal</span><input id="mkg" value="${v('goal')}" placeholder="e.g. 40 sign-ups, 5 demos"></label>
        <label class="fld span2"><span><input type="checkbox" id="mkf" ${f.on ? 'checked' : ''}> A public sign-up form for this campaign (online)</span></label>
        <label class="fld"><span>Form title</span><input id="mkft" value="${h(f.title || r.name || '')}"></label><label class="fld"><span>Form intro</span><input id="mkfi" value="${h(f.intro || '')}"></label></div>
      ${link ? `<p class="small">Form address: <code class="mk-link">${h(link)}</code></p>` : ''}
      ${!isNew ? `<p class="muted small">${MKT.leads(r.id).length} sign-ups · ${MKT.deals(r.id).length} deals (pick this campaign as a deal's source) · won ${CRM.money(MKT.revenue(r.id))}</p>` : ''}`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>',
      onMount: w => {
        w.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const g = id => w.querySelector('#' + id).value;
          if (!g('mkn').trim()) return UI.toast('Name the campaign', 'bad');
          Store.save(
            Object.assign({}, r, {
              name: g('mkn').trim(),
              kind: g('mkk'),
              status: g('mks'),
              start: g('mkst'),
              end: g('mken'),
              budget: +g('mkb') || 0,
              spent: +g('mksp') || 0,
              owner: g('mko'),
              goal: g('mkg').trim(),
              form: { on: w.querySelector('#mkf').checked, title: g('mkft').trim(), intro: g('mkfi').trim() },
            })
          );
          UI.closeModal();
          App.render();
        };
      },
    });
  },
  segPage(nav) {
    const rows = MKT.all('segment');
    const html = `${nav}<div class="page-actions"><span class="muted small">A segment is a group of contacts (by tag, city, industry). Export it for a WhatsApp broadcast, or email them all at once.</span><span class="grow"></span><button class="btn primary" id="sgnew">＋ New segment</button></div>
      ${UI.table({
        id: 'mkseg',
        rows,
        exportName: 'Segments',
        onRow: true,
        cols: [
          { key: 'name', label: 'Segment', get: r => r.name },
          {
            key: 'rule',
            label: 'Who',
            get: r =>
              [
                (r.tags || []).length ? 'tags: ' + r.tags.join(', ') : '',
                r.city ? 'city: ' + r.city : '',
                r.industry ? 'industry: ' + r.industry : '',
              ]
                .filter(Boolean)
                .join(' · ') || 'all contacts',
          },
          { key: 'n', label: 'Contacts', cls: 'num', get: r => MKT.members(r).length },
        ],
      })}`;
    return {
      title: 'Marketing',
      html,
      mount(root) {
        UI.bindTables(root, { mkseg: r => MKT.editSeg(r) });
        root.querySelector('#sgnew').onclick = () => MKT.editSeg({ c: 'segment', id: Maham.uid('segment'), owner: App.me, tags: [] });
      },
    };
  },
  editSeg(r) {
    const n = MKT.members(r);
    UI.modal({
      title: Store.get(r.id) ? 'Segment: ' + r.name : 'New segment',
      body: `<div class="grid-form">
        <label class="fld span2"><span>Name</span><input id="sgn" value="${h(r.name || '')}"></label>
        <label class="fld span2"><span>Contacts with any of these tags (commas)</span><input id="sgt" value="${h((r.tags || []).join(', '))}"></label>
        <label class="fld"><span>City</span><input id="sgc" value="${h(r.city || '')}"></label><label class="fld"><span>Industry</span><input id="sgi" value="${h(r.industry || '')}"></label></div>
        ${Store.get(r.id) ? `<p><b>${n.length}</b> contacts · ${n.filter(x => x.email).length} with email · ${n.filter(x => x.phone).length} with a phone</p>` : ''}`,
      actions: `${Store.get(r.id) ? '<button class="btn ghost" data-sgcsv>⬇ For WhatsApp (CSV)</button> <button class="btn ghost" data-sgmail>✉ Email them (BCC)</button>' : ''}<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>`,
      onMount: w => {
        w.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const name = w.querySelector('#sgn').value.trim();
          if (!name) return UI.toast('Name the segment', 'bad');
          Store.save(
            Object.assign({}, r, {
              name,
              tags: w
                .querySelector('#sgt')
                .value.split(',')
                .map(x => x.trim())
                .filter(Boolean),
              city: w.querySelector('#sgc').value.trim(),
              industry: w.querySelector('#sgi').value.trim(),
            })
          );
          UI.closeModal();
          App.render();
        };
        const csv = w.querySelector('[data-sgcsv]');
        if (csv)
          csv.onclick = () => {
            const q = v => `"${String(v || '').replace(/"/g, '""')}"`;
            const text = ['Name,Phone,Email,Company']
              .concat(n.map(x => [x.name, x.phone, x.email, CRM.name(x.account)].map(q).join(',')))
              .join('\r\n');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }));
            a.download = `${r.name} contacts.csv`;
            a.click();
          };
        const ml = w.querySelector('[data-sgmail]');
        if (ml)
          ml.onclick = () => {
            const to = n.map(x => x.email).filter(Boolean);
            if (!to.length) return UI.toast('Nobody in it has an email', 'warn');
            location.href = 'mailto:?bcc=' + encodeURIComponent(to.join(','));
          };
      },
    });
  },
};

Maham.addTo('Sales', [['marketing', 'Marketing', '📣']]);
Maham.page('marketing', 'Marketing', ['campaign', 'segment']);
P.marketing = sub => MKT.page(sub);

/* a deal's Source can be one of the campaigns (its won value then counts as the campaign's revenue) */
(() => {
  const ed = CRM.editDeal;
  CRM.editDeal = function (d) {
    const out = ed.apply(this, arguments);
    try {
      const inp = document.querySelector('.modal #dlsrc');
      const camps = MKT.all('campaign');
      if (!inp || !camps.length) return out;
      const sel = document.createElement('select');
      sel.id = 'dlsrc';
      sel.innerHTML = `<option value="">—</option>${camps.map(c => `<option value="${h(c.id)}" ${c.id === d.source ? 'selected' : ''}>📣 ${h(c.name)}</option>`).join('')}${d.source && !camps.some(c => c.id === d.source) ? `<option selected>${h(d.source)}</option>` : ''}<option value="website">Website</option><option value="referral">Referral</option>`;
      inp.replaceWith(sel);
    } catch (e) {
      /* keep the plain box */
    }
    return out;
  };
})();
