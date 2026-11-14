/* MAHAM — Knowledge base articles can be "Public": everyone in the company reads them (like "Everyone"), and online
 * customers see them in the help centre of the customer portal (portal.html, function portal_articles). */
'use strict';

(() => {
  if (typeof KB === 'undefined') return;
  if (Array.isArray(KB.VIS) && !KB.VIS.some(v => v[0] === 'public')) KB.VIS.push(['public', 'Public — also customers in the help centre']);
  const read0 = KB.canRead;
  KB.canRead = function (a) {
    return !!a && (a.vis === 'public' || read0.apply(this, arguments));
  };
  /* the work version's save keeps only "team" / "all": a public article keeps "public" */
  const save0 = KB.save;
  KB.save = function (a) {
    if (!a || a.vis !== 'public') return save0.apply(this, arguments);
    const s0 = Store.save;
    Store.save = r => s0.call(Store, r && r.c === 'kbarticle' ? Object.assign(r, { vis: 'public' }) : r);
    try {
      return save0.apply(this, arguments);
    } finally {
      Store.save = s0;
    }
  };
  /* its badge says Public */
  if (typeof KBUI !== 'undefined' && KBUI.badges) {
    const b0 = KBUI.badges;
    KBUI.badges = function (x) {
      const out = b0.apply(this, arguments);
      return x && x.vis === 'public' ? out.replace(/(<span class="badge" title="Who can read it">)[^<]*(<\/span>)/, '$1🌐 Public$2') : out;
    };
  }
})();
