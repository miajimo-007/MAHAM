/* MAHAM — Info & Dashboards (per team): info boxes (text wraps, links clickable) and Dashboards & Links
 * (name, clickable link, responsible, type). The old "SRS & E-CTS" entries show here: number → name, owner → responsible. */
'use strict';

/* links typed in by people: web addresses and \\server\share paths become clickable; everything else stays text */
const Links = {
  clean(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^\\\\/.test(u)) return u;
    if (/^[a-z][\w+.-]*:/i.test(u)) return u;
    if (/^www\.|^[\w-]+(\.[\w-]+)+(\/|$)/i.test(u)) return 'https://' + u;
    return u;
  },
  href(u) {
    u = Links.clean(u);
    if (!u) return '';
    if (/^\\\\/.test(u)) return 'file:' + u.replace(/\\/g, '/');
    return /^(https?|file|mailto|ftp):/i.test(u) ? u : '';
  },
  a(u, text) {
    const href = Links.href(u);
    return href ? `<a class="link" href="${h(href)}" target="_blank" rel="noopener">${h(text || u)}</a>` : h(text || u);
  },
  /* plain text with its web addresses turned into links */
  linkify(t) {
    return h(t || '').replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/g, m => {
      const clean = m.replace(/&amp;/g, '&');
      return `<a class="link" href="${h(Links.clean(clean))}" target="_blank" rel="noopener">${m}</a>`;
    });
  },
};

P.info = () => {
  const s = ps('info');
  const q = U.lc(s.q || '');
  const hit = (...xs) => !q || xs.some(x => U.lc(x || '').includes(q));
  const items = Store.all('info').filter(r => hit(r.title, r.value, r.category, r.url));
  const groups = U.groupBy(items, r => r.category || 'General');
  const links = Store.all('srs')
    .map(r =>
      Object.assign({}, r, { name: r.name || r.number || '', responsible: r.responsible || r.owner || '', category: r.category || '' })
    )
    .filter(r => hit(r.name, r.responsible, r.category, r.notes, r.url));
  const val = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? U.fmtDate(v) : Links.linkify(v));
  const html = `<div class="page-actions"><input class="search" type="search" placeholder="Search info and links…" value="${h(s.q || '')}" id="infoq" aria-label="Search"><span class="grow"></span>${addBtn('info', 'Add info item')} ${addBtn('srs', 'Add dashboard / link')}</div>
  ${items.length ? `<div class="cols3 info-grid">${[...groups].map(([k, v]) => card(h(k), v.map(r => `<div class="info-item click" data-edit="info|${h(r.id)}"><b>${h(r.title)}</b>${r.value ? `<div class="info-val">${val(r.value)}</div>` : ''}${r.url ? `<div class="info-link">${Links.a(r.url, 'Open ↗')}</div>` : ''}</div>`).join(''))).join('')}</div>` : `<div class="oneline">${q ? 'No info items match.' : 'No info items yet — ＋ Add info item.'}</div>`}
  <div class="page-actions"><h3 class="grow">Dashboards & Links</h3></div>
  ${
    links.length
      ? UI.table({
          id: 'links',
          rows: links,
          exportName: 'Dashboards and links',
          onRow: true,
          defaultSort: 'name',
          cols: [
            {
              key: 'name',
              label: 'Dashboard / link',
              html: r => (r.url ? `<b>${Links.a(r.url, r.name + ' ↗')}</b>` : `<b>${h(r.name)}</b>`),
              get: r => r.name,
            },
            { key: 'responsible', label: 'Responsible', get: r => r.responsible },
            { key: 'category', label: 'Type', get: r => r.category },
            {
              key: 'notes',
              label: 'Notes',
              html: r => `<div class="info-val small">${Links.linkify(r.notes || '')}</div>`,
              get: r => r.notes || '',
            },
            { key: 'url', label: 'Link', html: r => (r.url ? Links.a(r.url, 'Open ↗') : ''), get: r => r.url || '' },
          ],
        })
      : `<div class="oneline">${q ? 'No dashboards or links match.' : 'No dashboards or links yet — ＋ Add dashboard / link.'}</div>`
  }`;
  return {
    title: 'Info & Dashboards',
    html,
    mount(root) {
      const qi = root.querySelector('#infoq');
      if (qi)
        qi.oninput = U.debounce(() => {
          s.q = qi.value;
          App.render(true);
          const n = UI.$('#infoq');
          if (n) {
            n.focus();
            n.setSelectionRange(n.value.length, n.value.length);
          }
        }, 250);
      UI.bindTables(root, { links: r => UI.editRecord('srs', Store.get(r.id) || r) });
      root.querySelectorAll('.info-item a, #main table a').forEach(a => a.addEventListener('click', e => e.stopPropagation())); // a link opens the link, not the edit form
    },
  };
};
