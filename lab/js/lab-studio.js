/* MAHAM Lab — Studio: load hospital data (Excel / CSV, a folder of exports, or MAHAM's own records), protect patient
 * identifiers, prepare it with recorded steps, and build multi-page dashboards from 51 chart types (lab-studio-charts*.js).
 * Datasets and dashboards are kept in THIS browser only (IndexedDB) — never in the shared folder. */
'use strict';

const Studio = {
  meta: null, ds: null, view: 'dash', filters: { slicers: {}, range: {}, cross: null }, drill: {}, drillOn: {}, hist: { u: [], r: [] }, menuOpen: '',
  async loadMeta() { if (!Studio.meta) Studio.meta = Object.assign({ datasets: [], boards: {}, current: '', keepDays: 90 }, await Lab.read('studio.json', {})); return Studio.meta; },
  async saveMeta() { await Lab.write('studio.json', Studio.meta); },
  board() {
    const id = Studio.ds && Studio.ds.id; if (!id) return null;
    const B = (Studio.meta.boards[id] = Studio.meta.boards[id] || { pages: [], slicers: [], rangeKey: '', views: [] });
    if (!B.pages || !B.pages.length) { B.pages = [{ id: 'p1', name: 'Overview', visuals: B.visuals || [] }]; delete B.visuals; }   // older boards had one page
    if (!B.views) B.views = []; if (B.page == null || !B.pages[B.page]) B.page = 0; return B;
  },
  page() { const B = Studio.board(); return B && B.pages[B.page]; },
  vis() { const p = Studio.page(); return p ? p.visuals : []; },
  findVis(id) { const B = Studio.board(); for (const p of B.pages) { const v = p.visuals.find(x => x.id === id); if (v) return v; } return null; },
  async open(id) {
    if (Studio.ds && Studio.ds.id === id) return Studio.ds;
    const d = await Lab.read('studio.ds.' + id, null); if (!d) return null;
    Studio.ds = d; Studio.meta.current = id; Studio.filters = { slicers: {}, range: {}, cross: null }; Studio.drill = {}; Studio.hist = { u: [], r: [] };
    const m = Studio.meta.datasets.find(x => x.id === id); if (m) m.lastOpened = U.todayStr(); await Studio.saveMeta(); return d;
  },
  async store(ds) {
    await Lab.write('studio.ds.' + ds.id, ds);
    const old = Studio.meta.datasets.find(x => x.id === ds.id) || {};
    const m = { id: ds.id, name: ds.name, source: ds.source, created: ds.created, rows: ds.rows.length, cols: ds.cols.length, patientLevel: !!ds.patientLevel, label: SG.label(ds), lastOpened: U.todayStr(), refreshed: ds.refreshed || old.refreshed || '' };
    Studio.meta.datasets = [m, ...Studio.meta.datasets.filter(x => x.id !== ds.id)]; Studio.meta.current = ds.id; await Studio.saveMeta();
  },
  async remove(id) { await IDB.set('maham.lab.studio.ds.' + id, null); await IDB.set('maham.lab.studio.f.' + id, null); await IDB.set('maham.lab.studio.h.' + id, null); Studio.meta.datasets = Studio.meta.datasets.filter(x => x.id !== id); delete Studio.meta.boards[id]; if (Studio.meta.current === id) Studio.meta.current = ''; if (Studio.ds && Studio.ds.id === id) Studio.ds = null; await Studio.saveMeta(); },
  col(k) { return Studio.ds && Studio.ds.cols.find(c => c.key === k); },
  label(k) { const c = Studio.col(k); return c ? c.label : k || ''; },
  rerender() { LabUI.go('studio'); },
  newId: p => (p || 'v') + Math.random().toString(36).slice(2, 8),
  dd: (id, label, items, cls, right) => `<div class="st-dd ${right ? 'right' : ''}"><button type="button" class="btn sm ${cls || ''}" data-dd="${id}" aria-haspopup="menu" aria-expanded="false">${label} ▾</button><div class="st-ddm" id="dd-${id}" role="menu" hidden>${items}</div></div>`,
  /* ---------- undo / redo: every dashboard change goes through change() ---------- */
  async change(fn, msg) {
    const B = Studio.board(); Studio.hist.u.push(JSON.stringify(B)); if (Studio.hist.u.length > 60) Studio.hist.u.shift(); Studio.hist.r = [];
    await fn(B); await Studio.saveMeta(); if (msg) UI.toast(msg, 'good'); Studio.rerender();
  },
  async undo() { const id = Studio.ds && Studio.ds.id; if (!id || !Studio.hist.u.length) return UI.toast('Nothing to undo', 'warn'); Studio.hist.r.push(JSON.stringify(Studio.board())); Studio.meta.boards[id] = JSON.parse(Studio.hist.u.pop()); await Studio.saveMeta(); UI.toast('Undone', 'good'); Studio.rerender(); },
  async redo() { const id = Studio.ds && Studio.ds.id; if (!id || !Studio.hist.r.length) return UI.toast('Nothing to redo', 'warn'); Studio.hist.u.push(JSON.stringify(Studio.board())); Studio.meta.boards[id] = JSON.parse(Studio.hist.r.pop()); await Studio.saveMeta(); UI.toast('Redone', 'good'); Studio.rerender(); },
  /* ---------- the rows a visual uses: page filters, its own "since" date, its drill path ---------- */
  rowsFor(v, opt = {}) {
    const ds = Studio.ds; let rows = SD.filter(ds, opt.noRange ? Object.assign({}, Studio.filters, { range: {} }) : Studio.filters, v.id);
    if (v.since && v.sinceKey) rows = rows.filter(r => String(r[v.sinceKey] || '').slice(0, 10) >= v.since);
    for (const d of Studio.drill[v.id] || []) rows = rows.filter(r => SD.bucket(r[d.key], d.grain) === d.value);
    return rows;
  },
  NEXT_GRAIN: { year: 'month', month: 'day', week: 'day' },
  drillVis(v) {
    const path = Studio.drill[v.id] || []; if (!path.length) return v; const last = path[path.length - 1]; const c = Studio.col(v.x);
    if (c && c.type === 'date') return Object.assign({}, v, { grain: Studio.NEXT_GRAIN[last.grain] || 'day' });
    if (v.drillTo && path.length === 1) return Object.assign({}, v, { x: v.drillTo });
    return v;
  },
};

LabPages.studio = async () => {
  await Studio.loadMeta();
  if (!Studio._expired) { Studio._expired = true; const gone = await SG.expire(Studio.meta); if (gone.length) UI.toast(`Removed from this PC (not opened for ${Studio.meta.keepDays} days): ${gone.join(', ')}`, 'warn'); }
  if (Studio.meta.current && (!Studio.ds || Studio.ds.id !== Studio.meta.current)) await Studio.open(Studio.meta.current);
  if (Studio.ds && !Studio.meta.datasets.some(x => x.id === Studio.ds.id)) Studio.ds = null;
  SD.cur = Studio.ds; if (Studio.ds) await Studio.loadFindings();
  const M = Studio.meta, ds = Studio.ds;
  const pickDs = M.datasets.length ? `<label class="flt"><span>Data</span><select id="st-ds">${M.datasets.map(d => `<option value="${h(d.id)}" ${ds && d.id === ds.id ? 'selected' : ''}>${h(d.name)} (${d.rows.toLocaleString()})</option>`).join('')}</select></label>` : '';
  const bar = `<div class="st-bar">${pickDs}<button class="btn sm" data-add>＋ Add data</button>${ds ? `<button class="btn sm" data-refresh title="Read the newest version of the file or folder and repeat every step">⟳ Refresh</button><div class="st-seg"><button class="${Studio.view === 'dash' ? 'on' : ''}" data-view="dash">📊 Dashboard</button><button class="${Studio.view === 'data' ? 'on' : ''}" data-view="data">▦ Data</button></div>` : ''}<span class="grow"></span>${ds && Studio.view === 'dash' ? `<button class="icon-btn" data-undo title="Undo (Ctrl+Z)" ${Studio.hist.u.length ? '' : 'disabled'}>↶</button><button class="icon-btn" data-redo title="Redo (Ctrl+Y)" ${Studio.hist.r.length ? '' : 'disabled'}>↷</button>${Studio.dd('add', '＋ Add', `<button data-newvis role="menuitem"><b>📊 Visual</b><span>one of 51 chart types</span></button><button data-newtext role="menuitem"><b>📝 Text</b><span>a heading or a note</span></button><button data-templates role="menuitem"><b>📋 From a template</b><span>ER, OR, beds, pharmacy, help desk</span></button><button data-suggest role="menuitem"><b>✨ Starter page</b><span>let Studio pick charts for this data</span></button>`, 'primary', true)}` : ''}</div>`;
  if (!ds) return { html: bar + Studio.welcome(), mount: Studio.mount };
  return { html: bar + (Studio.view === 'data' ? Studio.dataView() : Studio.dashView()), mount: Studio.mount };
};

/* ---------- empty state ---------- */
Studio.welcome = () => `<div class="st-welcome"><h2>Build a dashboard from your own data</h2><p class="muted">Load an Excel or CSV file — admissions, ER visits, OR cases, pharmacy orders, help desk exports. Patient identifiers are found and protected first. Everything stays on this PC.</p>
  <div class="st-starts">
    <label class="st-start"><input type="file" id="st-file" accept=".xlsx,.xlsm,.csv,.txt,.tsv" hidden><b>📂 Load a file</b><span>Excel (.xlsx) or CSV — the biggest sheet is used</span></label>
    <button class="st-start" data-folder><b>📁 Combine a folder</b><span>Every Excel / CSV file in a folder (e.g. one per month) becomes one dataset</span></button>
    <div class="st-start"><b>🗂 Use MAHAM data</b><span>${SD.MAHAM.map(([k, l]) => `<button class="btn xs" data-maham="${k}">${h(l)}</button>`).join(' ')}</span></div>
    <button class="st-start" data-sample><b>🧪 Try a sample</b><span>12,000 made-up ER visits (with fake MRNs and names, to see the privacy check)</span></button>
    <label class="st-start"><input type="file" id="st-restore" accept=".json" hidden><b>♻ Restore a backup</b><span>A MAHAM Studio backup file from this or another PC</span></label>
  </div></div>`;

/* ---------- dashboard ---------- */
Studio.dashView = () => {
  const ds = Studio.ds, B = Studio.board(), F = Studio.filters; const P = Studio.page();
  const rows = SD.filter(ds, F); const ins = SD.insights(ds, rows);
  const dcols = ds.cols.filter(c => c.type === 'date'); const rk = B.rangeKey || (dcols[0] && dcols[0].key) || '';
  const sl = B.slicers.filter(k => Studio.col(k));
  const vals = k => { const o = {}; for (const r of ds.rows) { const v = String(r[k] ?? ''); if (v) o[v] = (o[v] || 0) + 1; } const c = Studio.col(k); const e = Object.entries(o); return (c && c.order ? e.sort((a, b) => (c.order.indexOf(a[0]) + 1 || 999) - (c.order.indexOf(b[0]) + 1 || 999)) : e.sort((a, b) => b[1] - a[1])).slice(0, 300); };
  const side = `<aside class="st-side">
    <div class="st-h">Saved views</div>
    <div class="st-views"><select id="st-view"><option value="">${B.views.length ? 'Saved views…' : 'None saved yet'}</option>${B.views.map((v, i) => `<option value="${i}">${h(v.name)}</option>`).join('')}</select><button class="btn xs" data-saveview title="Save the current filters as a view">Save</button>${B.views.length ? '<button class="icon-btn sm" data-delview title="Delete the chosen view">🗑</button>' : ''}</div>
    <div class="st-h">Filters</div>
    ${dcols.length ? `<div class="st-slicer"><div class="st-sl-h">📅 <select id="st-rk">${dcols.map(c => `<option value="${h(c.key)}" ${c.key === rk ? 'selected' : ''}>${h(c.label)}</option>`).join('')}</select></div><div class="st-range"><input type="date" id="st-from" value="${h((F.range.key === rk && F.range.from) || '')}" aria-label="From"><input type="date" id="st-to" value="${h((F.range.key === rk && F.range.to) || '')}" aria-label="To"></div><div class="st-quick">${[['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '1 year']].map(([d, l]) => `<button class="btn xs ghost" data-qr="${d}">${l}</button>`).join('')}</div></div>` : ''}
    ${sl.map(k => { const cur = new Set(F.slicers[k] || []); const v = vals(k); return `<div class="st-slicer"><div class="st-sl-h">🏷 <b>${h(Studio.label(k))}</b>${cur.size ? ` <a href="#" class="link small" data-slclear="${h(k)}">clear</a>` : ''}<button class="icon-btn sm" data-sldel="${h(k)}" title="Remove this filter">✕</button></div><div class="st-sl-list">${v.map(([x, n]) => `<label class="check"><input type="checkbox" data-sl="${h(k)}" value="${h(x)}" ${cur.has(x) ? 'checked' : ''}> <span class="grow">${h(x)}</span><span class="muted small">${n.toLocaleString()}</span></label>`).join('')}</div></div>`; }).join('')}
    <select id="st-addsl" class="st-addsl"><option value="">＋ Add a filter…</option>${ds.cols.filter(c => c.type === 'category' && !sl.includes(c.key)).map(c => `<option value="${h(c.key)}">${h(c.label)}</option>`).join('')}</select>
    <div class="st-h">Fields <span class="muted small">click to chart</span></div>
    ${ds.cols.length > 10 ? '<input id="st-fsearch" class="st-fsearch" placeholder="Find a column…" aria-label="Find a column">' : ''}<div class="st-fields">${ds.cols.map(c => `<button class="st-field" data-field="${h(c.key)}" title="${h((SD.TYPES.find(t => t[0] === c.type) || [, ''])[1] + (c.desc ? ' — ' + c.desc : ''))}"><span class="st-ti">${SD.ICON[c.type]}</span>${h(c.label)}</button>`).join('')}</div>
  </aside>`;
  const chips = [];
  if (F.cross) chips.push(`<span class="st-chip">${h(Studio.label(F.cross.key))} = <b>${h(SC.short(F.cross.value, F.cross.grain))}</b> <button data-xclear title="Clear">✕</button></span>`);
  for (const [k, v] of Object.entries(F.slicers)) if (v && v.length) chips.push(`<span class="st-chip">${h(Studio.label(k))}: <b>${h(v.slice(0, 3).join(', '))}${v.length > 3 ? ` +${v.length - 3}` : ''}</b> <button data-slclear="${h(k)}" title="Clear">✕</button></span>`);
  if (F.range.key && (F.range.from || F.range.to)) chips.push(`<span class="st-chip">${h(Studio.label(F.range.key))}: <b>${F.range.from ? U.fmtDate(F.range.from) : '…'} – ${F.range.to ? U.fmtDate(F.range.to) : '…'}</b> <button data-rgclear title="Clear">✕</button></span>`);
  const lbl = SG.label(ds);
  const nF = (Studio.F.dsId === ds.id ? Studio.F.list.length : 0);
  const tools = `<div class="st-tools"><form id="st-ask" class="st-ask"><input id="st-askq" placeholder='Ask: "average ED LOS by triage level last 6 months"' aria-label="Ask a question about this data"><button class="btn sm primary" type="submit">Ask</button></form>
    ${Studio.dd('analyse', '🔬 Analyse', `<button data-summary role="menuitem"><b>📝 Summary</b><span>this page in a few sentences</span></button><button data-drivers role="menuitem"><b>🧩 What drives…</b><span>which columns go with a number</span></button><button data-beforeafter role="menuitem"><b>🚦 Before / after</b><span>did a go-live change things?</span></button><button data-season role="menuitem"><b>🌙 Patterns over time</b><span>weekdays, hours, Ramadan, unusual days</span></button><button data-whatif role="menuitem"><b>🎚 What if…</b><span>size an improvement before trying it</span></button><button data-compare role="menuitem"><b>⚖ Compare two groups</b><span>is the difference real?</span></button>`)}
    <button class="btn sm" data-notebook title="Your saved findings for this dataset">📌 Findings${nF ? ` <span class="count">${nF}</span>` : ''}</button>
    ${Studio.dd('share', '⇪ Share', `<button data-report role="menuitem"><b>🖨 Report</b><span>this page on A4, or as a PDF</span></button><button data-allpng role="menuitem"><b>🖼 All images</b><span>every chart as a picture (zip)</span></button><button data-notebook role="menuitem"><b>📌 Findings report</b><span>your findings with pictures</span></button><button data-design-out role="menuitem"><b>⬇ Design file</b><span>the dashboard without the data</span></button><label role="menuitem"><input type="file" id="st-design-in" accept=".json" hidden><b>⬆ Load a design</b><span>someone else's dashboard on this data</span></label>`)}</div>`;
  const pages = `<div class="st-pages" role="tablist">${B.pages.map((p, i) => `<button class="st-page ${i === B.page ? 'on' : ''}" data-page="${i}" role="tab" aria-selected="${i === B.page}" title="Double-click to rename">${h(p.name)}</button>`).join('')}<button class="st-page add" data-addpage title="Add a page">＋ Page</button>${B.pages.length > 1 ? `<button class="icon-btn sm" data-delpage title="Delete this page">🗑</button>` : ''}</div>`;
  const cardHtml = v => {
    const path = Studio.drill[v.id] || []; const canDrill = v.x && !['kpi', 'gauge', 'kpitrend', 'scatter', 'trendscatter', 'bubble', 'histogram', 'ecdf', 'corr', 'sankey', 'text'].includes(v.type);
    const timeish = v.x && (Studio.col(v.x) || {}).type === 'date' && !['calendar', 'sparkgrid', 'text'].includes(v.type);
    const crumbs = path.length ? `<span class="st-crumbs"><a href="#" data-dup1="${h(v.id)}" data-lvl="0">All</a>${path.map((d, i) => ` › <a href="#" data-dup1="${h(v.id)}" data-lvl="${i + 1}">${h(SC.short(d.value, d.grain))}</a>`).join('')}</span>` : '';
    const menu = Studio.menuOpen === v.id ? `<div class="st-menu" role="menu">${v.type === 'text' ? '' : `${canDrill ? `<button data-vdrill="${h(v.id)}">${Studio.drillOn[v.id] ? '✓ ' : ''}⤓ Drill down mode</button>` : ''}${timeish ? `<button data-vwhy="${h(v.id)}">🔍 Why did it change?</button>` : ''}<button data-vpin="${h(v.id)}">📌 Save as a finding</button><button data-vrows="${h(v.id)}">▤ Show rows behind it</button><button data-vcopy="${h(v.id)}">📋 Copy image</button><button data-vpng="${h(v.id)}">🖼 Save PNG</button><button data-vxl="${h(v.id)}">⬇ Numbers to Excel</button>`}<button data-vdup="${h(v.id)}">⧉ Duplicate</button>${Studio.board().pages.length > 1 ? `<button data-vmove="${h(v.id)}">➜ Move to another page</button>` : ''}<button data-vdel="${h(v.id)}" class="t-bad">✕ Remove</button></div>` : '';
    return `<div class="st-card w${v.w || 1} ${['kpi', 'gauge', 'kpitrend'].includes(v.type) ? 'kpi' : ''} h${v.h || 1} ${v.type === 'text' ? 'txt' : ''} ${Studio.drillOn[v.id] ? 'drilling' : ''}" data-vid="${h(v.id)}"><div class="st-card-h"><span class="st-grip" draggable="true" data-grip="${h(v.id)}" title="Drag to move">⠿</span><b>${h(v.title || (v.type === 'text' ? '' : 'Untitled'))}</b>${crumbs}<span class="st-card-b">${v.type === 'text' ? '' : `<button class="icon-btn sm" data-vfull="${h(v.id)}" title="Full screen">⤢</button>`}<button class="icon-btn sm" data-vedit="${h(v.id)}" title="Edit">✎</button><button class="icon-btn sm" data-vmenu="${h(v.id)}" title="More" aria-haspopup="menu">⋯</button></span>${menu}</div>${v.type === 'text' ? `<div class="st-text">${Studio.md(v.text || '')}</div>` : `<div class="st-chart" id="ch-${h(v.id)}"></div>`}<span class="st-resize" data-resize="${h(v.id)}" title="Drag to resize"></span></div>`;
  };
  const report = `<div class="st-report-head"><div><h1>${h(P.name)} — ${h(ds.name)}</h1><p>${h(SG.mark(ds))}${chips.length ? ' · filtered' : ''}</p></div><button class="btn" data-endreport>✕ Close report</button></div>`;
  const main = `<section class="st-dash">${report}
    <div class="st-status"><b>${h(ds.name)}</b> <span class="muted">· ${rows.length.toLocaleString()} of ${ds.rows.length.toLocaleString()} rows</span> <span class="badge ${lbl === 'Internal' ? '' : 'warn'}" title="Sensitivity label — shown on every export">${h(lbl)}</span>${ds.patientLevel ? ` <span class="badge good" title="Identifier columns were removed or coded when loaded; counts under 5 are hidden">🛡 protected</span>` : ''}${chips.length ? `<span class="st-chips">${chips.join('')}<button class="btn xs ghost" data-allclear>Clear all</button></span>` : ''}</div>
    ${tools}
    ${ins.length ? `<div class="st-ins">${ins.map(i => `<div class="st-in ${i.kind}">${i.kind === 'up' ? '▲' : i.kind === 'down' ? '▼' : i.kind === 'warn' ? '⚠' : '●'} ${h(i.text)}</div>`).join('')}</div>` : ''}
    ${pages}
    ${P.visuals.length ? `<div class="st-grid">${P.visuals.map(cardHtml).join('')}</div>` : `<div class="st-emptyboard"><p>This page is empty.</p><button class="btn primary" data-suggest>✨ Show me a starter page</button> <button class="btn" data-newvis>＋ Add a visual</button> <button class="btn" data-templates>📋 Use a template</button></div>`}
    <p class="muted small st-foot">Hover for details · click a mark to filter the others (Shift+click: show its rows) · drag across a time chart to zoom · drag ⠿ to move a card, its corner to resize · Ctrl+Z to undo · kept in this browser only.</p>
  </section>`;
  return `<div class="st-wrap">${side}${main}</div>`;
};
/* very small markdown for text cards: # heading, **bold**, - bullet */
Studio.md = s => h(s).split('\n').map(l => /^#\s+/.test(l) ? `<h3>${l.replace(/^#\s+/, '')}</h3>` : /^[-•]\s+/.test(l) ? `<li>${l.replace(/^[-•]\s+/, '')}</li>` : l.trim() ? `<p>${l}</p>` : '').join('').replace(/(<li>.*?<\/li>)+/g, m => `<ul>${m}</ul>`).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

/* draw the charts a few at a time, so a big file never freezes the screen */
Studio.drawAll = (root) => {
  const ds = Studio.ds; if (!ds || !Studio.board()) return; SD.cur = ds; const gen = (Studio._gen = (Studio._gen || 0) + 1); const t0 = performance.now();
  const list = Studio.vis().filter(v => v.type !== 'text').map(v => [v, (root || document).querySelector('#ch-' + CSS.escape(v.id))]).filter(x => x[1]);
  const done = () => { Studio.lastDrawMs = Math.round(performance.now() - t0); const f = document.querySelector('.st-foot'); if (f) { f.dataset.ms = Studio.lastDrawMs; f.title = `All charts drawn in ${Studio.lastDrawMs} ms`; } };
  const step = i => { if (gen !== Studio._gen) return; const end = i === 0 ? 6 : i + 3; for (let k = i; k < Math.min(end, list.length); k++) Studio.drawOne(list[k][0], list[k][1]); if (end < list.length) setTimeout(() => step(end), 0); else done(); };
  for (const [, el] of list) if (!el.innerHTML) el.innerHTML = '<div class="sv-empty"><span class="spin"></span></div>';
  step(0);
};
Studio.ctxFor = (v, el, extra) => {
  const ds = Studio.ds; SD.cur = ds; const vv = Studio.drillVis(v); const rows = Studio.rowsFor(v);
  const pickable = !['kpi', 'gauge', 'kpitrend', 'scatter', 'trendscatter', 'bubble', 'histogram', 'ecdf', 'sparkgrid', 'corr'].includes(v.type) && !!vv.x;
  return Object.assign({ ds, rows, allRows: vv.cmp ? Studio.rowsFor(v, { noRange: true }) : null, vis: vv, onPick: pickable ? (label, e) => Studio.pick(v, label, e) : null, redraw: () => Studio.drawOne(v, el, extra) }, extra || {});
};
Studio.drawOne = (v, el, extra) => {
  const ctx = Studio.ctxFor(v, el, extra);
  try { SC.draw(el, ctx.vis, ctx); } catch (e) { console.error(e); el.innerHTML = `<div class="sv-empty t-bad">Could not draw: ${h(e.message)}</div>`; }
  const card = el.closest('.st-card'); if (card) card.classList.toggle('picked', !!(Studio.filters.cross && Studio.filters.cross.vid === v.id));
};
Studio.full = v => UI.modal({ title: v.title || 'Chart', wide: true, body: `<div class="st-full" id="st-full"></div><p class="muted small">Hover for details · drag to zoom · click a legend entry to hide it.</p>`, onMount: w => { w.querySelector('.modal').classList.add('st-fullmodal'); requestAnimationFrame(() => Studio.drawOne(v, w.querySelector('#st-full'), { onPick: null })); } });
Studio.pick = (v, label, e) => {
  if (e && e.shiftKey) return Studio.showRows(v, label);
  const vv = Studio.drillVis(v); const c = Studio.col(vv.x); const grain = c && c.type === 'date' ? (v.type === 'calendar' ? 'day' : (vv.grain || 'month')) : '';
  if (Studio.drillOn[v.id]) {   // drill down instead of filtering
    const path = (Studio.drill[v.id] = Studio.drill[v.id] || []);
    if (c && c.type === 'date') { if (grain === 'day') return UI.toast('Already at days — Shift+click to see the rows', 'warn'); path.push({ key: vv.x, value: label, grain }); }
    else if (v.drillTo && path.length === 0) path.push({ key: v.x, value: label, grain: '' });
    else return UI.toast(v.drillTo ? 'This is the deepest level — Shift+click to see the rows' : 'Set "Drill down to" in ✎ Edit to go deeper', 'warn');
    return Studio.rerender();
  }
  if (label === 'Other') return UI.toast('"Other" groups many values — use a filter on the left instead', 'warn');
  const cur = Studio.filters.cross; Studio.filters.cross = cur && cur.vid === v.id && cur.value === label ? null : { key: vv.x, value: label, grain, vid: v.id };
  Studio.rerender();
};
/* ▤ the rows behind a visual (or one bar of it) */
Studio.showRows = (v, label) => {
  const ds = Studio.ds; const vv = Studio.drillVis(v); const c = Studio.col(vv.x); const grain = c && c.type === 'date' ? (vv.grain || 'month') : '';
  let rows = Studio.rowsFor(v); if (label != null && vv.x) rows = rows.filter(r => SD.bucket(r[vv.x], grain) === label);
  if (ds.smallCells && SD.small(ds, rows.length)) return UI.toast('Fewer than 5 rows — hidden to protect patients', 'warn');
  const cols = ds.cols.slice(0, 16); const show = rows.slice(0, 500);
  UI.modal({ title: `Rows behind “${v.title || ''}”${label != null ? ' · ' + SC.long(label, grain) : ''}`, wide: true, body: `<p class="small muted">${rows.length.toLocaleString()} row${rows.length === 1 ? '' : 's'}${rows.length > 500 ? ' — the first 500 shown; Excel has them all' : ''}.</p><div class="st-rows"><table class="tbl"><thead><tr>${cols.map(x => `<th>${h(x.label)}</th>`).join('')}</tr></thead><tbody>${show.map(r => `<tr>${cols.map(x => `<td>${h(r[x.key] == null ? '' : String(r[x.key]).slice(0, 60))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
    actions: '<span class="grow"></span><button class="btn" data-x>⬇ These rows to Excel</button><button class="btn primary" data-c>Close</button>',
    onMount: w => { w.querySelector('[data-c]').onclick = UI.closeModal; w.querySelector('[data-x]').onclick = () => Studio.excel(`${v.title || 'Rows'}${label != null ? ' - ' + label : ''}`, [ds.cols.map(x => x.label), ...rows.map(r => ds.cols.map(x => r[x.key]))]); } });
};
/* every Excel export carries an "About" sheet with the sensitivity label, who and when */
Studio.excel = async (name, rows) => {
  const ds = Studio.ds; const F = Studio.filters; const fl = [...Object.entries(F.slicers || {}).filter(([, v]) => v && v.length).map(([k, v]) => `${Studio.label(k)}: ${v.join(', ')}`), F.range && (F.range.from || F.range.to) ? `${Studio.label(F.range.key)} ${F.range.from || '…'} to ${F.range.to || '…'}` : '', F.cross ? `${Studio.label(F.cross.key)} = ${F.cross.value}` : ''].filter(Boolean);
  const about = [['MAHAM Studio export'], ['Sensitivity', SG.label(ds)], ['Dataset', ds.name], ['Exported by', SG.who()], ['Date', U.todayStr()], ['Filters', fl.join(' · ') || 'none'], ['Note', 'MEH internal use — do not share outside the hospital.']];
  XL.download(await XL.write([{ name: String(name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Data', rows }, { name: 'About', rows: about }]), `${name} ${U.todayStr()}.xlsx`);
};

/* ---------- data view: steps, columns, quality, measures, link, helpers ---------- */
Studio.dataView = () => {
  const ds = Studio.ds; const show = ds.rows.slice(0, 200); const dcols = ds.cols.filter(c => c.type === 'date'); const ncols = ds.cols.filter(c => c.type === 'number'); const ccols = ds.cols.filter(c => c.type === 'category');
  const opt = l => l.map(c => [c.key, c.label]); const fewCat = (ccols.find(c => !c.coded && new Set(ds.rows.slice(0, 5000).map(r => r[c.key])).size <= 40) || ccols[0] || {}).key; const others = Studio.meta.datasets.filter(d => d.id !== ds.id);
  const Q = SD.quality(ds); const issues = Q.cols.filter(x => x.issues.length);
  const left = `${card(`Columns <span class="count">${ds.cols.length}</span>`, `<table class="tbl"><thead><tr><th>Column</th><th>Type</th><th>Filled</th><th>Distinct</th><th></th></tr></thead><tbody>${ds.cols.map(c => { const d = new Set(ds.rows.slice(0, 20000).map(r => r[c.key])).size; const qq = Q.cols.find(x => x.c === c); return `<tr><td><input class="st-ren" data-ren="${h(c.key)}" value="${h(c.label)}" aria-label="Column name"><input class="st-desc" data-desc="${h(c.key)}" value="${h(c.desc || '')}" placeholder="Description — what it is, where it comes from" aria-label="Description of ${h(c.label)}">${c.derived ? ` <span class="badge" title="${h(c.formula || c.linked || '')}">${c.formula ? 'formula' : c.linked ? 'linked' : 'helper'}</span>` : ''}${c.coded ? ' <span class="badge good">coded</span>' : ''}</td><td><select data-type="${h(c.key)}">${SD.TYPES.map(([k, l]) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td><td class="num">${Math.round((1 - qq.blankPct) * 100)}%</td><td class="num">${d.toLocaleString()}</td><td class="nw">${c.type === 'category' ? `<button class="btn xs ghost" data-unify="${h(c.key)}" title="Same value written differently → one spelling">Tidy</button>` : ''}<button class="btn xs ghost" data-cdel="${h(c.key)}" title="Remove this column">✕</button></td></tr>`; }).join('')}</tbody></table>`)}
    ${card(`Data quality <span class="count">${issues.length + (Q.dup ? 1 : 0)}</span>`, issues.length || Q.dup ? `<table class="tbl"><tbody>${Q.dup ? `<tr><td><b>All columns</b></td><td>${Q.dup.toLocaleString()} duplicate row${Q.dup > 1 ? 's' : ''}</td><td><button class="btn xs" data-dedupe>Remove</button></td></tr>` : ''}${issues.flatMap(x => x.issues.map(([k, t]) => `<tr><td><b>${h(x.c.label)}</b></td><td>${h(t)}</td><td>${k === 'spell' ? `<button class="btn xs" data-unify="${h(x.c.key)}">Tidy</button>` : k === 'odd' ? `<button class="btn xs" data-clearodd="${h(x.c.key)}">Clear them</button>` : k === 'extreme' ? `<button class="btn xs ghost" data-qhist="${h(x.c.key)}">See spread</button>` : k === 'blank' ? `${x.c.type === 'category' || x.c.type === 'text' ? `<button class="btn xs" data-qfill="${h(x.c.key)}" title="Empty cells become a value you can count and filter">Fill as “Not recorded”</button> ` : ''}<button class="btn xs ghost" data-cdel="${h(x.c.key)}">Remove column</button>` : ''}</td></tr>`)).join('')}</tbody></table>` : '<p class="muted small">✓ No problems found: no duplicates, odd dates, extreme values or mixed spellings.</p>')}
    ${card('First 200 rows', `<div class="st-rows"><table class="tbl"><thead><tr>${ds.cols.map(c => `<th>${h(c.label)}</th>`).join('')}</tr></thead><tbody>${show.map(r => `<tr>${ds.cols.map(c => `<td>${h(r[c.key] == null ? '' : String(r[c.key]).slice(0, 60))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)}`;
  const right = `${card('This dataset', `<p class="small">${ds.rows.length.toLocaleString()} rows · ${ds.cols.length} columns · loaded ${U.fmtDate(ds.created)}${ds.refreshed ? ` · refreshed ${U.fmtDate(ds.refreshed)}` : ''} · ${ds.source === 'maham' ? 'from MAHAM' : ds.source === 'sample' ? 'sample' : ds.source === 'folder' ? `a folder of ${ds.fileCount || 'several'} files` : 'from a file'}${ds.fileName ? ` (<b>${h(ds.fileName)}</b>)` : ''}</p>
      <form class="grid-form" id="st-dsset">${UI.field({ key: 'about', label: 'About this data (source, owner, how often it is refreshed)', type: 'textarea', span: 2, rows: 2, placeholder: 'EHR ER report, exported monthly by …' }, ds.about || '')}${UI.field({ key: 'label', label: 'Sensitivity label (on every export)', type: 'select', options: SG.LABELS, blank: false }, SG.label(ds))}${UI.field({ key: 'keep', label: 'Delete datasets not opened for (days, this PC)', type: 'number', min: 0, step: 1, hint: '0 = never' }, Studio.meta.keepDays ?? 90)}</form>
      <div class="row-btns"><button class="btn" data-refresh>⟳ Refresh from file</button><button class="btn" data-dsxl>⬇ Rows to Excel</button><button class="btn" data-dict title="Every column with its type, description and how full it is">📖 Dictionary</button><button class="btn" data-dsren>Rename</button><button class="btn" data-backup>💾 Backup Studio</button><span class="grow"></span><button class="btn danger ghost" data-dsdel>Delete from this PC</button></div>`)}
    ${card(`Steps <span class="count">${(ds.steps || []).length}</span>`, `<p class="muted small">Every change is recorded. "Refresh" reads the new file and repeats them in order${ds.protected && ds.protected.length ? ', after the same privacy choices' : ''}.</p>${(ds.steps || []).length ? `<ol class="st-steps">${ds.steps.map((s, i) => `<li>${h(SD.stepText(s))} <button class="icon-btn sm" data-stepdel="${i}" title="Remove this step (the data is rebuilt on the next refresh)">✕</button></li>`).join('')}</ol>` : '<p class="muted small">No steps yet.</p>'}`)}
    ${card('Formula column', `<form class="grid-form" id="st-fx">${UI.field({ key: 'name', label: 'New column name', type: 'text', span: 2 }, '')}${UI.field({ key: 'expr', label: 'Formula', type: 'textarea', span: 2, rows: 2, placeholder: SF.EXAMPLES[0] }, '')}</form><p class="small muted">Use [Column name]. Functions: IF, AND, OR, ROUND, CONTAINS, LEFT, DAYS, HOURS, MINUTES, YEAR, MONTH, WEEKDAY, COALESCE… Examples: ${SF.EXAMPLES.slice(0, 3).map(e => `<code class="st-ex" data-ex="${h(e)}">${h(e)}</code>`).join(' · ')}</p><p class="small" id="st-fxprev"></p><div class="row-btns"><button class="btn" data-fxtest>Test</button><button class="btn primary" data-fxadd>Add column</button></div>`)}
    ${card('Group into ranges', ncols.length ? `<form class="grid-form" id="st-bins">${UI.field({ key: 'key', label: 'Number column', type: 'select', options: opt(ncols), blank: false }, ncols[0].key)}${UI.field({ key: 'edges', label: 'Break points', type: 'text', placeholder: '15, 30, 60' }, '')}${UI.field({ key: 'name', label: 'New column name', type: 'text', span: 2 }, '')}</form><div class="row-btns"><button class="btn" data-binsadd>Add column</button></div>` : '<p class="muted small">No number column.</p>')}
    ${card('Rename and merge values', ccols.length ? `<form class="grid-form" id="st-rec">${UI.field({ key: 'key', label: 'Column', type: 'select', options: opt(ccols), blank: false }, fewCat)}${UI.field({ key: 'name', label: 'Into a new column (empty = change this one)', type: 'text' }, '')}${UI.field({ key: 'map', label: 'One per line: old = new', type: 'textarea', span: 2, rows: 4, placeholder: 'ER = Emergency\nED = Emergency\nEmergency Dept = Emergency' }, '')}${UI.field({ key: 'other', label: 'Anything not listed', type: 'select', options: [['keep', 'Keep as it is'], ['other', 'Becomes "Other"']], blank: false }, 'keep')}</form><div class="row-btns"><button class="btn" data-recvals>Show current values</button><button class="btn primary" data-recadd>Apply</button></div>` : '<p class="muted small">No category column.</p>')}
    ${card('Hospital calendar columns', dcols.length ? `<form class="grid-form" id="st-cal">${UI.field({ key: 'key', label: 'From the date', type: 'select', options: opt(dcols), blank: false }, dcols[0].key)}${UI.field({ key: 'kind', label: 'Add', type: 'select', options: Object.entries(SD.CAL).map(([k, v]) => [k, `${v[0]} — ${v[1]}`]), blank: false }, 'shift')}${UI.field({ key: 'sm', label: 'Fiscal year starts in', type: 'select', options: U.MONTHS.map((m, i) => [String(i + 1), m]), blank: false }, '1')}</form><div class="row-btns"><button class="btn" data-caladd>Add column</button></div>` : '<p class="muted small">No date column.</p>')}
    ${card('Helper columns from dates', dcols.length ? `<form class="grid-form" id="st-der">${UI.field({ key: 'col', label: 'From the date', type: 'select', options: opt(dcols), blank: false }, dcols[0].key)}${UI.field({ key: 'part', label: 'Take', type: 'select', options: Object.entries(SD.DERIVE), blank: false }, 'month')}<div class="fld"><button class="btn" type="submit">Add column</button></div></form>${dcols.length > 1 ? `<hr><form class="grid-form" id="st-btw">${UI.field({ key: 'a', label: 'Time from', type: 'select', options: opt(dcols), blank: false }, dcols[0].key)}${UI.field({ key: 'b', label: 'to', type: 'select', options: opt(dcols), blank: false }, dcols[1].key)}${UI.field({ key: 'unit', label: 'In', type: 'select', options: [['hours', 'Hours'], ['minutes', 'Minutes'], ['days', 'Days']], blank: false }, 'hours')}<div class="fld"><button class="btn" type="submit">Add column</button></div></form>` : ''}` : '<p class="muted small">No date column.</p>')}
    ${card('Link another dataset', others.length ? `<form class="grid-form" id="st-link">${UI.field({ key: 'ds', label: 'Bring columns from', type: 'select', options: others.map(d => [d.id, d.name]), blank: false }, others[0].id)}${UI.field({ key: 'key', label: 'Match this column', type: 'select', options: opt(ds.cols.filter(c => c.type !== 'number' || true)), blank: false }, (ccols[0] || ds.cols[0]).key)}<div class="fld span2" id="st-linkmore"><p class="muted small">Pick the dataset, then its matching column and the columns to bring.</p></div></form><div class="row-btns"><button class="btn primary" data-linkadd>Link</button></div>` : '<p class="muted small">Load a second dataset first (e.g. a ward or department list), then link it here by a shared column.</p>')}
    ${card(`Saved measures <span class="count">${(ds.measures || []).length}</span>`, `${(ds.measures || []).map(m => `<div class="li"><span class="grow"><b>★ ${h(m.name)}</b><div class="muted small">${m.kind === 'pct' ? '% of rows' : h((SD.MEASURE_KINDS.find(k => k[0] === m.kind) || [, m.kind])[1])} ${m.field && m.kind !== 'pct' ? h(Studio.label(m.field)) : ''}${m.cond ? ' · where ' + h(m.cond) : ''}</div></span><button class="icon-btn sm" data-mdel="${h(m.id)}" title="Delete">✕</button></div>`).join('')}
      <form class="grid-form" id="st-meas">${UI.field({ key: 'name', label: 'Name', type: 'text', placeholder: '% seen within 30 min' }, '')}${UI.field({ key: 'kind', label: 'Measure', type: 'select', options: SD.MEASURE_KINDS, blank: false }, 'pct')}${UI.field({ key: 'field', label: 'Of column', type: 'select', options: opt(ds.cols) }, '')}${UI.field({ key: 'cond', label: 'Only rows where (formula, optional)', type: 'text', span: 2, placeholder: '[Door to Doctor (min)] <= 30' }, '')}</form><div class="row-btns"><button class="btn primary" data-madd>Save measure</button></div><p class="muted small">Saved measures appear as ★ in every chart's "Measure" list.</p>`)}
    ${card('Privacy', `${ds.patientLevel ? `<p>🛡 Protected when loaded: ${(ds.protected || []).map(p => `<b>${h(p.key)}</b> (${h(SD.ACTIONS[p.action] || p.action)})`).join(', ') || '—'}.</p>` : '<p class="muted small">No identifier columns were found in this data.</p>'}<label class="check"><input type="checkbox" id="st-small" ${ds.smallCells ? 'checked' : ''}> Hide counts under 5 on charts (so nobody can be recognised by filtering down)</label>`)}`;
  return `<div class="cols2 wide-left"><div>${left}</div><div>${right}</div></div>`;
};

/* ---------- visual editor ---------- */
Studio.editVisual = (v, isNew) => {
  if (v && v.type === 'text') return Studio.editText(v);
  const ds = Studio.ds; const x = Object.assign({ type: 'bar', fn: 'count', w: 1, h: 1, top: 12, sort: 'value', fmt: 'auto', palette: 'teal', cmp: '' }, v || {});
  const all = ds.cols.filter(c => c.type !== 'text' && c.type !== 'id').map(c => [c.key, `${SD.ICON[c.type]} ${c.label}`]);
  const nums = ds.cols.filter(c => c.type === 'number').map(c => [c.key, c.label]);
  const cats = ds.cols.filter(c => c.type === 'category' || c.type === 'date').map(c => [c.key, `${SD.ICON[c.type]} ${c.label}`]);
  const any = ds.cols.map(c => [c.key, `${SD.ICON[c.type]} ${c.label}`]);
  const FN = [...SD.FNS, ...SD.measureFns(ds)];
  const groups = [...new Set(SC.TYPES.map(t => t[2]))];
  const gallery = `<div class="st-gal" role="radiogroup" aria-label="Chart type">${groups.map(g => `<div class="st-gal-g"><div class="st-gal-h">${h(g)}</div><div class="st-gal-items">${SC.TYPES.filter(t => t[2] === g).map(([k, l]) => `<button type="button" class="st-gal-i ${k === x.type ? 'on' : ''}" data-gt="${k}" role="radio" aria-checked="${k === x.type}"><span class="st-gal-ic">${SC.ICONS[k] || '▦'}</span>${h(l)}</button>`).join('')}</div></div>`).join('')}</div>`;
  const dcols = ds.cols.filter(c => c.type === 'date');
  UI.modal({ title: isNew ? 'Add a visual' : 'Edit visual', wide: true, body: `<div class="st-ed"><div class="st-ed-l">${gallery}</div><div class="st-ed-r"><form class="grid-form" id="st-vf">
      <input type="hidden" name="type" value="${h(x.type)}">
      ${UI.field({ key: 'title', label: 'Title', type: 'text', span: 2, placeholder: 'Leave empty for an automatic title' }, x.autoTitle ? '' : x.title || '')}
      ${UI.field({ key: 'x', label: 'Group by (X axis)', type: 'select', options: all }, x.x || '')}
      ${UI.field({ key: 'grain', label: 'Dates by', type: 'select', options: [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']], blank: false }, x.grain || 'month')}
      ${UI.field({ key: 'fn', label: 'Measure', type: 'select', options: FN, blank: false }, x.fn)}
      ${UI.field({ key: 'field', label: 'Of column', type: 'select', options: any }, x.field || '')}
      ${UI.field({ key: 'split', label: 'Split by', type: 'select', options: cats }, x.split || '')}
      ${UI.field({ key: 'fn2', label: 'Second measure', type: 'select', options: FN.filter(f => f[0] !== 'top'), blank: false }, x.fn2 || 'avg')}
      ${UI.field({ key: 'field2', label: 'Second column', type: 'select', options: nums }, x.field2 || '')}
      ${UI.field({ key: 'target', label: 'Target (optional)', type: 'number', step: 'any' }, x.target ?? '')}
      ${UI.field({ key: 'win', label: 'Average over (periods)', type: 'number', min: 2, step: 1 }, x.win || 3)}
      ${UI.field({ key: 'bins', label: 'Number of bars (empty = automatic)', type: 'number', min: 3, step: 1 }, x.bins || '')}
      ${UI.field({ key: 'top', label: 'Show top', type: 'select', options: [['0', 'All'], ['5', '5'], ['8', '8'], ['10', '10'], ['12', '12'], ['20', '20'], ['30', '30'], ['50', '50']], blank: false }, String(x.top || 0))}
      ${UI.field({ key: 'sort', label: 'Order', type: 'select', options: [['value', 'Biggest first'], ['label', 'A → Z / time / range order']], blank: false }, x.sort || 'value')}
      ${UI.field({ key: 'cmp', label: 'Compare with', type: 'select', options: [['', 'Nothing'], ['prev', 'Previous period'], ['yoy', 'Same period last year']], blank: false }, x.cmp || '')}
      ${UI.field({ key: 'fc', label: 'Forecast', type: 'select', options: [['0', 'No'], ['3', 'Next 3 periods'], ['6', 'Next 6 periods'], ['12', 'Next 12 periods']], blank: false }, String(x.fc || 0))}
      ${UI.field({ key: 'markAt', label: 'Mark a date (e.g. a go-live)', type: 'date' }, x.markAt || '')}
      ${UI.field({ key: 'markLabel', label: 'Mark label', type: 'text', placeholder: 'Go-live' }, x.markLabel || '')}
      ${UI.field({ key: 'ruleHi', label: 'Red when above', type: 'number', step: 'any' }, x.ruleHi ?? '')}
      ${UI.field({ key: 'ruleLo', label: 'Green when below', type: 'number', step: 'any' }, x.ruleLo ?? '')}
      ${UI.field({ key: 'drillTo', label: 'Drill down to (click a bar in drill mode)', type: 'select', options: cats }, x.drillTo || '')}
      ${UI.field({ key: 'since', label: 'Only rows since (this chart)', type: 'date' }, x.since || '')}
      ${UI.field({ key: 'fmt', label: 'Number format', type: 'select', options: SC.FORMATS, blank: false }, x.fmt || 'auto')}
      ${UI.field({ key: 'palette', label: 'Colours', type: 'select', options: SC.PAL_NAMES, blank: false }, x.palette || 'teal')}
      ${UI.field({ key: 'w', label: 'Width', type: 'select', options: [['1', 'Small (⅓)'], ['2', 'Medium (⅔)'], ['3', 'Full width']], blank: false }, String(x.w || 1))}
      ${UI.field({ key: 'h', label: 'Height', type: 'select', options: [['1', 'Normal'], ['2', 'Tall']], blank: false }, String(x.h || 1))}
      <div class="fld span2 flag-row">${UI.field({ key: 'labels', label: 'Value labels', type: 'bool', checkLabel: 'Show values' }, !!x.labels)}${UI.field({ key: 'avgLine', label: 'Average line', type: 'bool', checkLabel: 'Average line' }, !!x.avgLine)}${UI.field({ key: 'anom', label: 'Unusual points', type: 'bool', checkLabel: '⚠ Flag unusual points' }, !!x.anom)}${UI.field({ key: 'lowerBetter', label: 'Lower is better', type: 'bool', checkLabel: 'Lower is better' }, !!x.lowerBetter)}</div>
    </form><p class="small st-hint" id="st-vhint"></p><div class="st-preview" id="st-vprev"></div></div></div>`,
    actions: `<span class="muted small" id="st-vdesc"></span><span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>${isNew ? 'Add' : 'Save'}</button>`,
    onMount: w => {
      w.querySelector('.modal').classList.add('st-edmodal');
      const f = w.querySelector('#st-vf'); const g = k => f.querySelector(`[name=${k}]`);
      const read = () => { const o = Object.assign({}, x); for (const k of ['title', 'type', 'x', 'grain', 'fn', 'field', 'split', 'sort', 'fn2', 'field2', 'fmt', 'palette', 'cmp', 'drillTo', 'since', 'markAt', 'markLabel']) o[k] = g(k).value; o.fc = +g('fc').value || 0; for (const k of ['w', 'h', 'top']) o[k] = +g(k).value; for (const k of ['target', 'ruleHi', 'ruleLo']) o[k] = g(k).value === '' ? '' : +g(k).value; o.win = +g('win').value || 3; o.bins = +g('bins').value || 0; for (const k of ['labels', 'avgLine', 'lowerBetter', 'anom']) o[k] = g(k).checked; o.sinceKey = o.since ? (Studio.col(o.x) && Studio.col(o.x).type === 'date' ? o.x : (dcols[0] || {}).key) : ''; o.autoTitle = !o.title; if (!o.title) o.title = Studio.autoTitle(o); return o; };
      const sync = () => {
        const o = read(); const t = o.type; const N = SC.need(t); const xc = Studio.col(o.x); const fc = Studio.col(o.field); const isDateX = !!xc && xc.type === 'date';
        const show = (k, on) => { const el = g(k).closest('.fld'); if (el) el.hidden = !on; };
        show('x', !!N.x); show('grain', !!N.x && isDateX && t !== 'calendar'); show('split', !!N.split); show('fn', !!N.fn); show('field', N.field === 'num' || (N.fn && o.fn !== 'count' && !o.fn.startsWith('m:'))); show('fn2', !!N.field2 && N.field2 !== 'num'); show('field2', !!N.field2); show('target', !!N.target || ['kpi', 'bar', 'hbar', 'line', 'area', 'smooth', 'grouped', 'lollipop'].includes(t)); show('win', !!N.win); show('bins', !!N.bins); show('top', !!N.x && !SC.TIME.has(t) && !['calendar', 'sparkgrid', 'histogram'].includes(t)); show('sort', !!N.x && !SC.TIME.has(t) && !['calendar', 'sparkgrid'].includes(t));
        show('cmp', isDateX && ['bar', 'grouped', 'line', 'smooth', 'step', 'area'].includes(t) && !(+g('fc').value > 0)); const lineT = isDateX && ['line', 'smooth', 'step', 'area'].includes(t); show('fc', lineT && !o.split && !o.cmp); show('markAt', lineT); show('markLabel', lineT && !!o.markAt); show('ruleHi', ['bar', 'grouped', 'hbar', 'lollipop', 'dot'].includes(t)); show('ruleLo', ['bar', 'grouped', 'hbar', 'lollipop', 'dot'].includes(t)); show('drillTo', !!N.x && !isDateX && !['scatter', 'trendscatter', 'bubble', 'sankey', 'corr'].includes(t)); show('since', !!dcols.length && t !== 'corr');
        f.querySelector('[name=anom]').closest('.fld').hidden = !(['bar', 'line', 'smooth', 'step', 'area', 'movavg'].includes(t));
        const lab = (k, txt) => { const l = g(k).closest('.fld').querySelector('label'); if (l) l.firstChild.textContent = txt; };
        lab('x', N.x === 'num' ? 'X axis (number)' : t === 'sankey' ? 'From (left)' : t === 'sunburst' ? 'Inner ring' : N.x === 'date' ? 'Date' : 'Group by (X axis)');
        lab('field', N.field === 'num' ? (N.x === 'num' ? 'Y axis (number)' : 'Number column') : 'Of column');
        lab('split', t === 'sankey' ? 'To (right)' : t === 'sunburst' ? 'Outer ring' : t === 'heat' || t === 'matrix' ? 'Rows / columns by' : t === 'sparkgrid' ? 'One small chart per' : t === 'dumbbell' ? 'Compare (first two values)' : 'Split by (colour)');
        lab('field2', t === 'bubble' ? 'Bubble size (number)' : 'Second column (line, right axis)');
        const need = (k, why) => !o[k] ? why : '';
        const hint = (N.x && need('x', N.x === 'num' ? 'Pick a number column for the X axis.' : N.x === 'date' ? 'Pick a date column.' : 'Pick what to group by.'))
          || (N.x === 'date' && xc && xc.type !== 'date' ? 'This chart needs a date column.' : '') || (N.x === 'num' && xc && xc.type !== 'number' ? 'The X axis must be a number column.' : '')
          || (SC.TIME.has(t) && xc && xc.type !== 'date' && !/month|week|year|hour|weekday/i.test(o.x) ? 'Tip: trend charts read best with a date on X.' : '')
          || (N.split === 'req' && !o.split ? 'This chart needs "' + (t === 'sankey' ? 'To (right)' : 'Split by') + '".' : '')
          || ((N.field === 'num' || ['sum', 'avg', 'median', 'min', 'max'].includes(o.fn)) && (!fc || fc.type !== 'number') && (N.field === 'num' || N.fn) ? 'Pick a number column.' : '')
          || (N.field2 && !o.field2 ? 'Pick the second column.' : '') || (o.fn === 'top' && t !== 'kpi' ? '"Most common value" works on a number card only.' : '') || (t === 'gauge' && o.fn === 'top' ? 'A gauge needs a number.' : '');
        const soft = /^Tip:/.test(hint); const he = w.querySelector('#st-vhint'); he.textContent = hint; he.className = 'small st-hint ' + (soft ? 'muted' : 't-bad'); w.querySelector('[data-ok]').disabled = !!hint && !soft;
        w.querySelector('#st-vdesc').textContent = SC.DESC[t] || '';
        w.querySelectorAll('[data-gt]').forEach(b => { b.classList.toggle('on', b.dataset.gt === t); b.setAttribute('aria-checked', b.dataset.gt === t); });
        const el = w.querySelector('#st-vprev'); if (!hint || soft) { el.style.height = (o.h === 2 ? 380 : 260) + 'px'; try { const rows = Studio.rowsFor(o); SC.draw(el, o, { ds: Studio.ds, rows, allRows: o.cmp ? Studio.rowsFor(o, { noRange: true }) : null, onPick: null, noAnim: true, redraw: sync }); } catch (e) { el.textContent = e.message; } } else el.innerHTML = '<div class="sv-empty">The preview appears when the chart has what it needs.</div>';
      };
      w.querySelectorAll('[data-gt]').forEach(b => b.onclick = () => { g('type').value = b.dataset.gt; const N = SC.need(b.dataset.gt); const cur = Studio.col(g('x').value);
        if (N.x === 'date' && (!cur || cur.type !== 'date')) { const d = ds.cols.find(c => c.type === 'date'); if (d) g('x').value = d.key; }
        if (N.x === 'num' && (!cur || cur.type !== 'number')) { const n = ds.cols.find(c => c.type === 'number'); if (n) g('x').value = n.key; }
        if (SC.TIME.has(b.dataset.gt) && (!cur || cur.type !== 'date')) { const d = ds.cols.find(c => c.type === 'date'); if (d) g('x').value = d.key; }
        if (N.field === 'num' && !(Studio.col(g('field').value) || {}).type?.match(/number/)) { const n = ds.cols.find(c => c.type === 'number' && c.key !== g('x').value); if (n) g('field').value = n.key; }
        if (N.field2 && !g('field2').value) { const n = ds.cols.filter(c => c.type === 'number' && c.key !== g('field').value)[0]; if (n) g('field2').value = n.key; }
        if (N.split === 'req' && !g('split').value) { const c2 = ds.cols.find(c => c.type === 'category' && !c.coded && c.key !== g('x').value && new Set(ds.rows.slice(0, 3000).map(r => r[c.key])).size <= 12); if (c2) g('split').value = c2.key; }
        if (b.dataset.gt === 'combo' && g('fn').value === 'top') g('fn').value = 'count';
        sync(); });
      f.addEventListener('change', sync); f.addEventListener('input', U.debounce(sync, 300)); sync();
      w.querySelector('[data-c]').onclick = UI.closeModal;
      w.querySelector('[data-ok]').onclick = async () => { const o = read(); if (!o.id) o.id = Studio.newId(); delete SC.zoom[o.id]; delete SC.hidden[o.id]; delete Studio.drill[o.id]; UI.closeModal();
        await Studio.change(B => { const P = B.pages[B.page]; const i = P.visuals.findIndex(z => z.id === o.id); if (i >= 0) P.visuals[i] = o; else P.visuals.push(o); }); };
    } });
};
Studio.autoTitle = o => { const m = o.fn === 'count' ? 'Count' : o.fn && o.fn.startsWith('m:') ? SD.measureName(o, Studio.ds) : `${(SD.FNS.find(f => f[0] === o.fn) || [, o.fn])[1]} ${Studio.label(o.field)}`; if (o.type === 'kpi' || o.type === 'gauge') return m; if (o.type === 'corr') return 'Correlation between number columns'; if (['scatter', 'trendscatter', 'bubble'].includes(o.type)) return `${Studio.label(o.field)} vs ${Studio.label(o.x)}`; if (o.type === 'histogram') return `Spread of ${Studio.label(o.field)}`; return `${m} by ${Studio.label(o.x)}${o.split ? ' and ' + Studio.label(o.split) : ''}`; };
Studio.editText = v => {
  const x = Object.assign({ type: 'text', w: 1, h: 1, title: '', text: '' }, v || {});
  UI.modal({ title: v && v.id ? 'Edit text' : 'Add text', wide: true, body: `<form class="grid-form" id="st-tf">${UI.field({ key: 'title', label: 'Heading (optional)', type: 'text', span: 2 }, x.title)}${UI.field({ key: 'text', label: 'Text', type: 'textarea', span: 2, rows: 7, hint: '# heading · **bold** · - bullet' }, x.text)}${UI.field({ key: 'w', label: 'Width', type: 'select', options: [['1', 'Small (⅓)'], ['2', 'Medium (⅔)'], ['3', 'Full width']], blank: false }, String(x.w))}</form>`,
    actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>',
    onMount: w => { w.querySelector('[data-c]').onclick = UI.closeModal; w.querySelector('[data-ok]').onclick = async () => { const o = Object.assign({}, x, { title: w.querySelector('[name=title]').value.trim(), text: w.querySelector('[name=text]').value, w: +w.querySelector('[name=w]').value }); if (!o.id) o.id = Studio.newId('t'); UI.closeModal(); await Studio.change(B => { const P = B.pages[B.page]; const i = P.visuals.findIndex(z => z.id === o.id); if (i >= 0) P.visuals[i] = o; else P.visuals.push(o); }); }; } });
};

/* ---------- loading data ---------- */
Studio.addData = () => UI.modal({ title: 'Add data', wide: true, body: Studio.welcome().replace('<h2>Build a dashboard from your own data</h2>', ''), onMount: w => Studio.bindStarts(w) });
Studio.bindStarts = root => {
  const f = root.querySelector('#st-file'); if (f) f.onchange = async () => { const file = f.files[0]; if (!file) return; UI.closeModal(); LabUI.busy(`Reading ${file.name}…`, 0.2); await new Promise(r => setTimeout(r, 30)); try { const ds = await SD.readFile(file); LabUI.busy('Checking columns and privacy…', 0.7); if (!ds.rows.length) throw new Error('No rows found under the header.'); ds.fileName = file.name; Studio.privacy(ds); } catch (e) { UI.toast(e.message || 'Could not read the file', 'bad'); Studio.rerender(); } };
  const fo = root.querySelector('[data-folder]'); if (fo) fo.onclick = async () => { let dir; try { dir = await window.showDirectoryPicker({ id: 'maham-studio', mode: 'read' }); } catch (e) { return; } UI.closeModal(); try { const ds = await SD.readFolder(dir, (p, m) => LabUI.busy(m, p)); ds.fileName = dir.name; ds._handle = dir; Studio.privacy(ds); } catch (e) { UI.toast(e.message, 'bad'); Studio.rerender(); } };
  root.querySelectorAll('[data-maham]').forEach(b => b.onclick = async () => { UI.closeModal(); const ds = SD.fromMaham(b.dataset.maham); if (!ds.rows.length) return UI.toast('No records of that kind', 'warn'); ds.maham = b.dataset.maham; await Studio.finish(ds); });
  const s = root.querySelector('[data-sample]'); if (s) s.onclick = () => { UI.closeModal(); const ds = SD.sample(); ds.source = 'sample'; Studio.privacy(ds); };
  const rs = root.querySelector('#st-restore'); if (rs) rs.onchange = async () => { const file = rs.files[0]; if (!file) return; UI.closeModal(); try { const n = await SG.restore(file); UI.toast(`${n} dataset${n === 1 ? '' : 's'} restored`, 'good'); Studio.ds = null; Studio.rerender(); } catch (e) { UI.toast(e.message, 'bad'); } };
};
/* step 2: identifier columns → remove / code / mask / age, before anything is kept */
Studio.privacy = ds => {
  const found = SD.scan(ds);
  if (!found.length) return Studio.finish(ds);
  UI.modal({ title: 'Protect patient identifiers', wide: true, body: `<p>These columns could identify a person. Choose what to do <b>before</b> the data is kept on this PC. Charts never need them — a code still lets you count distinct patients.</p>
    <table class="tbl"><thead><tr><th>Column</th><th>Looks like</th><th>Example</th><th>Do this</th></tr></thead><tbody>${found.map((x, i) => `<tr><td><b>${h(x.key)}</b></td><td>${h(x.why)}</td><td class="muted">${h(String((ds.rows.find(r => r[x.key]) || {})[x.key] || '').replace(/.(?=.{2})/g, '•'))}</td><td><select data-pv="${i}">${Object.entries(SD.ACTIONS).filter(([k]) => k !== 'age' || x.kind === 'birth').map(([k, l]) => `<option value="${k}" ${k === x.action ? 'selected' : ''}>${l}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>
    <p class="muted small">Counts under 5 will also be hidden on charts. The original file is not changed. The same choices are repeated on every refresh.</p>`,
    actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Protect and continue</button>`,
    onMount: w => { w.querySelector('[data-c]').onclick = () => { UI.closeModal(); Studio.rerender(); }; w.querySelector('[data-ok]').onclick = async () => {
      const ch = found.map((x, i) => ({ key: x.key, action: w.querySelector(`[data-pv="${i}"]`).value }));
      if (ch.some(c => c.action === 'keep') && !confirmKeep(w)) return;
      UI.closeModal(); SD.protect(ds, ch.filter(c => c.action !== 'keep')); ds.patientLevel = true; ds.smallCells = true; ds.protected = ch; ds.label = 'Patient-level'; await Studio.finish(ds); }; } });
  function confirmKeep(w) { const b = w.querySelector('[data-ok]'); if (b.dataset.sure) return true; b.dataset.sure = '1'; b.textContent = 'Keep identifiers — I am sure'; b.classList.add('danger'); UI.toast('You chose to keep an identifier column. Press again to confirm.', 'warn'); return false; }
};
Studio.finish = async ds => {
  LabUI.busy('Saving on this PC…', 0.9); await Studio.loadMeta();
  const handle = ds._handle; delete ds._handle; ds.steps = ds.steps || []; ds.measures = ds.measures || [];
  Studio.ds = ds; Studio.filters = { slicers: {}, range: {}, cross: null }; Studio.view = 'dash'; Studio.drill = {}; Studio.hist = { u: [], r: [] }; SD.cur = ds;
  const B = Studio.board(); B.pages = [{ id: 'p1', name: 'Overview', visuals: SD.suggest(ds) }]; B.page = 0; B.slicers = ds.cols.filter(c => c.type === 'category' && !c.coded).map(c => ({ c, n: new Set(ds.rows.slice(0, 5000).map(r => r[c.key])).size })).filter(x => x.n > 1 && x.n <= 12).slice(0, 2).map(x => x.c.key);
  // the starter page's helper columns become recorded steps, so a refresh rebuilds them
  for (const c of ds.cols) if (c.derived && !ds.steps.some(s => s.op === 'derive' && c.key.endsWith(SD.DERIVE[s.part]))) { const m = Object.entries(SD.DERIVE).find(([, l]) => c.key.endsWith(' · ' + l)); const src = m && ds.cols.find(z => c.key === `${z.label} · ${m[1]}`); if (m && src) ds.steps.push({ op: 'derive', key: src.key, part: m[0] }); }
  await Studio.store(ds); if (handle) await IDB.set('maham.lab.studio.h.' + ds.id, handle);
  UI.toast(`${ds.rows.length.toLocaleString()} rows loaded — a starter page was made`, 'good'); location.hash = 'studio'; Studio.rerender();
};
/* a recorded step: apply it now and keep it for refreshes */
Studio.step = async (s, opts = {}) => {
  const ds = Studio.ds; try { const msg = await SD.apply(ds, s); ds.steps = ds.steps || []; ds.steps.push(s); await Studio.store(ds); if (!opts.quiet) UI.toast(msg, 'good'); } catch (e) { UI.toast(e.message, 'bad'); }
  Studio.rerender();
};
/* ⟳ Refresh: read the newest file / folder / MAHAM data, repeat the privacy choices and every step */
Studio.refresh = async () => {
  const old = Studio.ds; let fresh = null;
  const replay = async nd => {
    LabUI.busy('Repeating the steps…', 0.6);
    if (old.protected && old.protected.length) { SD.protect(nd, old.protected.filter(c => c.action !== 'keep')); nd.patientLevel = true; nd.smallCells = old.smallCells; nd.protected = old.protected; }
    const fails = []; for (const s of old.steps || []) { try { const m = await SD.apply(nd, s); if (m === 'missing') fails.push(SD.stepText(s)); } catch (e) { fails.push(SD.stepText(s)); } }
    for (const c of old.cols) { const n = nd.cols.find(x => x.key === c.key); if (n) { n.label = c.label; if (c.order) n.order = c.order; if (c.desc) n.desc = c.desc; } }
    Object.assign(nd, { about: old.about || '', id: old.id, name: old.name, created: old.created, refreshed: U.todayStr(), steps: old.steps || [], measures: old.measures || [], label: old.label, fileName: nd.fileName || old.fileName, maham: old.maham });
    Studio.ds = nd; SD.cur = nd; await Studio.store(nd); Studio.filters = { slicers: {}, range: {}, cross: null };
    UI.toast(`Refreshed: ${nd.rows.length.toLocaleString()} rows (was ${old.rows.length.toLocaleString()})${fails.length ? ` — ${fails.length} step${fails.length > 1 ? 's' : ''} could not be repeated: ${fails.join(', ')}` : ''}`, fails.length ? 'warn' : 'good'); Studio.rerender();
  };
  try {
    if (old.source === 'maham' && old.maham) { fresh = SD.fromMaham(old.maham); return replay(fresh); }
    if (old.source === 'sample') { fresh = SD.sample(); return replay(fresh); }
    const hnd = await IDB.get('maham.lab.studio.h.' + old.id);
    if (hnd) { let p = 'granted'; try { p = await hnd.queryPermission({ mode: 'read' }); if (p !== 'granted') p = await hnd.requestPermission({ mode: 'read' }); } catch (e) { /* */ }
      if (p === 'granted') { fresh = hnd.kind === 'directory' ? await SD.readFolder(hnd, (q, m) => LabUI.busy(m, q)) : await SD.readFile(await hnd.getFile()); return replay(fresh); } }
    // no remembered file: ask for the new version
    UI.modal({ title: 'Refresh from file', body: `<p>Pick the newest version of <b>${h(old.fileName || old.name)}</b>${old.source === 'folder' ? ' (the folder)' : ''}. The same privacy choices and ${(old.steps || []).length} step${(old.steps || []).length === 1 ? '' : 's'} are repeated; the dashboards stay.</p>${old.source === 'folder' ? '<button class="btn primary" data-pf>Choose the folder…</button>' : '<label class="btn primary"><input type="file" id="st-refile" accept=".xlsx,.xlsm,.csv,.txt,.tsv" hidden>Choose the file…</label>'}`,
      onMount: w => { const fi = w.querySelector('#st-refile'); if (fi) fi.onchange = async () => { const file = fi.files[0]; if (!file) return; UI.closeModal(); LabUI.busy(`Reading ${file.name}…`, 0.2); try { const nd = await SD.readFile(file); nd.fileName = file.name; await replay(nd); } catch (e) { UI.toast(e.message, 'bad'); Studio.rerender(); } };
        const pf = w.querySelector('[data-pf]'); if (pf) pf.onclick = async () => { let dir; try { dir = await window.showDirectoryPicker({ id: 'maham-studio', mode: 'read' }); } catch (e) { return; } UI.closeModal(); try { const nd = await SD.readFolder(dir, (q, m) => LabUI.busy(m, q)); await IDB.set('maham.lab.studio.h.' + old.id, dir); await replay(nd); } catch (e) { UI.toast(e.message, 'bad'); Studio.rerender(); } }; } });
  } catch (e) { UI.toast('Could not refresh: ' + e.message, 'bad'); Studio.rerender(); }
};

/* ---------- smart tools ---------- */
Studio.why = v => {
  const r = SS.why(Studio.ds, Studio.rowsFor(v), Studio.drillVis(v)); if (r.error) return UI.toast(r.error, 'warn');
  const f = x => SC.f(x, v); const pct = r.tA ? Math.round((r.delta / Math.abs(r.tA)) * 100) : null;
  UI.modal({ title: `Why did “${v.title}” change?`, wide: true, body: `<p class="st-why-top">${h(SC.long(r.pb, r.grain))}: <b>${h(f(r.tB))}</b> vs ${h(SC.long(r.pa, r.grain))}: <b>${h(f(r.tA))}</b> — <b class="${r.delta >= 0 ? 't-bad' : 't-good'}">${r.delta >= 0 ? '▲ +' : '▼ '}${h(f(r.delta))}${pct != null ? ` (${pct >= 0 ? '+' : ''}${pct}%)` : ''}</b></p>
    ${r.cols.length ? `<div class="st-why">${r.cols.map(cc => { const mx = Math.max(1e-9, ...cc.top.map(o => Math.abs(o.eff))); return `<div class="st-why-c"><h4>By ${h(cc.c.label)}</h4>${cc.top.map(o => `<div class="st-why-r"><span class="grow">${h(o.k)}</span><span class="st-why-b"><i class="${o.eff >= 0 ? 'up' : 'down'}" style="width:${Math.round((Math.abs(o.eff) / mx) * 100)}%"></i></span><b>${o.eff >= 0 ? '+' : ''}${h(f(o.eff))}</b><span class="muted small">${SD.small(Studio.ds, o.na) ? '<5' : h(f(o.va))} → ${SD.small(Studio.ds, o.nb) ? '<5' : h(f(o.vb))}</span></div>`).join('')}</div>`; }).join('')}</div><p class="muted small">${r.add ? 'Each line is how much that group added to or took from the change.' : 'For averages, each line is how much that group\'s own change moved the overall figure (weighted by its share of rows).'} The current, unfinished period is left out.</p>` : '<p class="muted">No category column explains this change.</p>'}`,
    actions: `${Studio.pinBtn}<span class="grow"></span><button class="btn primary" data-c>Close</button>`, onMount: w => { w.querySelector('[data-c]').onclick = UI.closeModal;
      const note = [`${SC.long(r.pb, r.grain)}: ${f(r.tB)} vs ${SC.long(r.pa, r.grain)}: ${f(r.tA)} (${r.delta >= 0 ? '+' : ''}${f(r.delta)}${pct != null ? `, ${pct >= 0 ? '+' : ''}${pct}%` : ''}).`, ...r.cols.slice(0, 3).map(cc => `By ${cc.c.label}: ${cc.top.slice(0, 2).map(o => `${o.k} ${o.eff >= 0 ? '+' : ''}${f(o.eff)}`).join(', ')}`)].join('\n');
      w.querySelector('[data-pinf]').onclick = () => Studio.findDialog({ kind: 'why', title: `Why “${v.title}” changed in ${SC.long(r.pb, r.grain)}`, note }); } });
};
Studio.ask = q => {
  const r = SS.ask(Studio.ds, q); if (r.error) return UI.toast(r.error, 'warn');
  UI.modal({ title: 'Your question as a chart', wide: true, body: `<p class="small muted">I understood: <b>${h(r.how)}</b>. Not right? Add it and change it with ✎ Edit.</p><div class="st-full" id="st-askprev" style="height:340px"></div>`,
    actions: '<span class="grow"></span><button class="btn" data-c>Close</button><button class="btn primary" data-ok>＋ Add to the dashboard</button>',
    onMount: w => { w.querySelector('[data-c]').onclick = UI.closeModal; requestAnimationFrame(() => { const el = w.querySelector('#st-askprev'); SC.draw(el, r.vis, { ds: Studio.ds, rows: Studio.rowsFor(r.vis), onPick: null }); });
      w.querySelector('[data-ok]').onclick = async () => { UI.closeModal(); await Studio.change(B => { B.pages[B.page].visuals.unshift(r.vis); }, 'Added to the dashboard'); }; } });
};
Studio.summary = () => {
  const ds = Studio.ds; const lines = SS.summary(ds, SD.filter(ds, Studio.filters), Studio.vis()); const text = lines.join('\n');
  UI.modal({ title: 'Summary of this page', wide: true, body: `<div class="st-sum">${lines.map(l => `<p>${h(l)}</p>`).join('')}</div><p class="muted small">Written from the numbers on this page. Check it before you send it.</p>`,
    actions: `${Studio.pinBtn}<span class="grow"></span><button class="btn" data-copy2>📋 Copy text</button><button class="btn primary" data-addtxt>＋ Add as a text card</button>`,
    onMount: w => { w.querySelector('[data-pinf]').onclick = () => Studio.findDialog({ kind: 'summary', title: `Summary of ${Studio.page().name}`, note: text }); w.querySelector('[data-copy2]').onclick = () => { App.copyText(text); UI.toast('Copied', 'good'); }; w.querySelector('[data-addtxt]').onclick = async () => { UI.closeModal(); await Studio.change(B => { B.pages[B.page].visuals.unshift({ id: Studio.newId('t'), type: 'text', title: 'Summary', text: lines.map((l, i) => i ? '- ' + l : l).join('\n'), w: 3, h: 1 }); }, 'Summary added'); }; } });
};
Studio.compare = () => {
  const ds = Studio.ds; const nums = ds.cols.filter(c => c.type === 'number'); const cats = ds.cols.filter(c => c.type === 'category' && !c.coded); if (!nums.length || !cats.length) return UI.toast('Needs a number column and a category column', 'warn');
  UI.modal({ title: 'Is the difference real?', wide: true, body: `<form class="grid-form" id="st-cmpf">${UI.field({ key: 'num', label: 'Compare', type: 'select', options: nums.map(c => [c.key, c.label]), blank: false }, nums[0].key)}${UI.field({ key: 'grp', label: 'Between groups of', type: 'select', options: cats.map(c => [c.key, c.label]), blank: false }, cats[0].key)}${UI.field({ key: 'a', label: 'Group A', type: 'select', options: [], blank: false }, '')}${UI.field({ key: 'b', label: 'Group B', type: 'select', options: [], blank: false }, '')}</form><div id="st-cmpres"></div>`,
    actions: `${Studio.pinBtn}<span class="grow"></span><button class="btn primary" data-c>Close</button>`,
    onMount: w => {
      w.querySelector('[data-c]').onclick = UI.closeModal; const g = k => w.querySelector(`[name=${k}]`); const rows = SD.filter(ds, Studio.filters);
      const fill = () => { const o = {}; for (const r of rows) { const v = String(r[g('grp').value] ?? ''); if (v) o[v] = (o[v] || 0) + 1; } const vs = Object.entries(o).sort((p, q) => q[1] - p[1]).map(e => e[0]); for (const [k, i] of [['a', 0], ['b', 1]]) g(k).innerHTML = vs.map(v => `<option ${v === vs[i] ? 'selected' : ''}>${h(v)}</option>`).join(''); run(); };
      const run = () => { const k = g('num').value, gr = g('grp').value; const pick = val => rows.filter(r => String(r[gr] ?? '') === val).map(r => r[k]).filter(x => typeof x === 'number' && isFinite(x)); const A = pick(g('a').value), B = pick(g('b').value);
        const out = w.querySelector('#st-cmpres'); if (A.length < 5 || B.length < 5) { out.innerHTML = '<p class="muted">Each group needs at least 5 rows.</p>'; return; } const t = SS.tTest(A, B); const [vt, kind] = SS.verdict(t.p); const L = Studio.label(k);
        out.innerHTML = `<div class="st-verdict ${kind}"><b>${h(vt)}</b><span>p ${t.p < 0.001 ? '< 0.001' : '= ' + U.num(t.p, 3)}</span></div><table class="tbl"><thead><tr><th></th><th class="num">Rows</th><th class="num">Average</th><th class="num">Median</th></tr></thead><tbody><tr><td><b>${h(g('a').value)}</b></td><td class="num">${t.A.n.toLocaleString()}</td><td class="num">${U.num(t.A.m, 2)}</td><td class="num">${U.num(t.A.med, 2)}</td></tr><tr><td><b>${h(g('b').value)}</b></td><td class="num">${t.B.n.toLocaleString()}</td><td class="num">${U.num(t.B.m, 2)}</td><td class="num">${U.num(t.B.med, 2)}</td></tr></tbody></table>
          <p>${h(g('b').value)} is on average <b>${U.num(Math.abs(t.diff), 2)} ${t.diff >= 0 ? 'higher' : 'lower'}</b> in ${h(L)} than ${h(g('a').value)} (95% range of the true difference: ${U.num(t.lo, 2)} to ${U.num(t.hi, 2)}).</p><p class="muted small">Welch's t-test on the rows currently filtered. "p" is the chance of seeing a gap this big if there were no real difference — under 0.05 is usually taken as real. A real difference is not always a big one: look at the size too.</p>`; };
      g('grp').onchange = fill; for (const k of ['num', 'a', 'b']) g(k).onchange = run; fill();
      w.querySelector('[data-pinf]').onclick = () => { const t = w.querySelector('#st-cmpres'); Studio.findDialog({ kind: 'compare', title: `${Studio.label(g('num').value)}: ${g('b').value} vs ${g('a').value}`, note: [...t.querySelectorAll('.st-verdict b, p:not(.muted)')].map(x => x.textContent.trim()).join('\n') }); };
    } });
};
/* ---------- report mode: A4 landscape, controls hidden, header with label / who / date ---------- */
Studio.report = on => {
  document.body.classList.toggle('st-reporting', on !== false); setTimeout(() => { Studio.drawAll(); if (on !== false) setTimeout(() => { try { window.print(); } catch (e) { /* */ } }, 600); }, 50);
};
/* ---------- exports: all images (zip), copy image, design share ---------- */
Studio.allImages = async () => {
  const zip = new JSZip(); let n = 0; const foot = SG.mark(Studio.ds);
  for (const v of Studio.vis()) { const el = document.querySelector('#ch-' + CSS.escape(v.id)); if (!el) continue; const b = await SC.pngBlob(el, v.title, foot); if (b) { zip.file(`${String(++n).padStart(2, '0')} ${(v.title || 'chart').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 60)}.png`, b); } }
  if (!n) return UI.toast('No charts on this page', 'warn'); XL.download(await zip.generateAsync({ type: 'blob' }), `${Studio.ds.name} - ${Studio.page().name} ${U.todayStr()} (images).zip`); UI.toast(`${n} images saved — ready for PowerPoint`, 'good');
};
Studio.copyImage = async v => {
  const el = document.querySelector('#ch-' + CSS.escape(v.id)); const b = el && await SC.pngBlob(el, v.title, SG.mark(Studio.ds)); if (!b) return UI.toast('Nothing to copy on this card', 'warn');
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); UI.toast('Image copied — paste it into an email, PowerPoint or MAHAM', 'good'); } catch (e) { XL.download(b, `${v.title || 'chart'}.png`); UI.toast('This browser blocked copying, so the picture was saved instead', 'warn'); }
};
Studio.designOut = () => {
  const ds = Studio.ds, B = Studio.board(); const used = new Set(); for (const p of B.pages) for (const v of p.visuals) for (const k of [v.x, v.field, v.split, v.field2, v.drillTo, v.sinceKey]) if (k) used.add(k);
  const d = { kind: 'maham-studio-design', version: 1, name: ds.name, by: SG.who(), at: U.todayStr(), pages: B.pages, slicers: B.slicers, rangeKey: B.rangeKey, views: B.views, measures: ds.measures || [], columns: ds.cols.filter(c => used.has(c.key) || c.desc).map(c => ({ key: c.key, type: c.type, desc: c.desc || '' })) };
  XL.download(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }), `${ds.name} - dashboard design.json`); UI.toast('Design saved — it has no data in it. Share it; the other person loads their own data and then this design.', 'good');
};
Studio.designIn = async file => {
  const d = JSON.parse(await file.text()); if (d.kind !== 'maham-studio-design') throw new Error('This is not a MAHAM Studio design file.');
  const ds = Studio.ds; const missing = (d.columns || []).filter(c => !ds.cols.some(x => x.key === c.key)).map(c => c.key);
  ds.measures = [...(ds.measures || []).filter(m => !(d.measures || []).some(x => x.id === m.id)), ...(d.measures || [])]; for (const c of d.columns || []) { const x = ds.cols.find(y => y.key === c.key); if (x && c.desc && !x.desc) x.desc = c.desc; } await Studio.store(ds);
  await Studio.change(B => { B.pages = d.pages; B.page = 0; B.slicers = (d.slicers || []).filter(k => Studio.col(k)); B.rangeKey = d.rangeKey || ''; B.views = d.views || []; });
  UI.toast(missing.length ? `Design loaded — these columns are not in this data, so some charts will be empty: ${missing.join(', ')}` : 'Design loaded', missing.length ? 'warn' : 'good');
};

/* ---------- templates: ready dashboards; map your columns once ---------- */
Studio.TEMPLATES = [
  { id: 'er', name: 'ER flow', desc: 'Arrivals, waiting, length of stay, triage and where patients go', roles: [['date', 'Arrival date / time', 'date', /arriv|registr|visit|date|time/i], ['triage', 'Triage level', 'category', /triage|acuity|ctas|esi/i], ['complaint', 'Complaint / diagnosis', 'category', /complaint|diagnos|reason|problem/i], ['dispo', 'Disposition', 'category', /dispos|outcome|discharge.*(type|to)|admit/i], ['wait', 'Waiting time (number)', 'number', /door|wait|seen|doctor/i], ['los', 'Length of stay (number)', 'number', /los|length|stay|hours|duration/i]],
    build: m => [['kpi', { fn: 'count', title: 'Visits' }], ['kpi', { fn: 'avg', field: m.wait, title: 'Average wait', target: 30, lowerBetter: true }, ['wait']], ['kpitrend', { x: m.date, grain: 'month', fn: 'count', title: 'Visits — last full month' }], ['line', { x: m.date, grain: 'month', fn: 'count', title: 'Visits per month', cmp: 'yoy', w: 3, anom: true }], ['heat', { x: '§hour', split: '§weekday', fn: 'count', title: 'Busiest hours', w: 3, sort: 'label' }], ['hbar', { x: m.complaint, fn: 'count', top: 10, title: 'Top complaints', w: 1 }, ['complaint']], ['sankey', { x: m.triage, split: m.dispo, title: 'Triage → disposition', w: 2 }, ['triage', 'dispo']], ['box', { x: m.triage, field: m.los, title: 'Length of stay by triage', w: 2, sort: 'label' }, ['triage', 'los']], ['ecdf', { field: m.wait, title: 'How quickly patients are seen', w: 1 }, ['wait']], ['control', { x: m.date, grain: 'week', fn: 'avg', field: m.wait, title: 'Average wait per week (SPC)', w: 3 }, ['wait']]] },
  { id: 'or', name: 'OR utilisation', desc: 'Cases, minutes, delays and cancellations by theatre and specialty', roles: [['date', 'Surgery date', 'date', /surg|oper|date|start/i], ['room', 'Theatre / room', 'category', /room|theat|or\b|suite/i], ['spec', 'Specialty', 'category', /spec|service|depart/i], ['status', 'Status', 'category', /status|cancel|outcome/i], ['mins', 'Duration (minutes)', 'number', /dur|minute|length|time/i], ['delay', 'Start delay (minutes)', 'number', /delay|late|start/i]],
    build: m => [['kpi', { fn: 'count', title: 'Cases' }], ['kpi', { fn: 'sum', field: m.mins, title: 'Theatre minutes', fmt: 'int' }, ['mins']], ['kpi', { fn: 'avg', field: m.delay, title: 'Average start delay', lowerBetter: true, target: 15 }, ['delay']], ['combo', { x: m.date, grain: 'month', fn: 'count', fn2: 'sum', field2: m.mins, title: 'Cases and minutes per month', w: 3 }, ['mins']], ['stacked', { x: m.room, split: m.spec, fn: 'count', title: 'Cases by theatre and specialty', w: 2 }, ['room', 'spec']], ['donut', { x: m.status, fn: 'count', title: 'Status', w: 1 }, ['status']], ['box', { x: m.spec, field: m.mins, title: 'Duration by specialty', w: 2 }, ['spec', 'mins']], ['pareto', { x: m.spec, fn: 'sum', field: m.mins, title: 'Which specialties use 80% of minutes', w: 1 }, ['spec', 'mins']], ['heat', { x: '§weekday', split: m.room, fn: 'count', title: 'Cases by weekday and theatre', w: 3, sort: 'label' }, ['room']]] },
  { id: 'beds', name: 'Bed occupancy', desc: 'Admissions, discharges, length of stay by ward', roles: [['date', 'Admission date', 'date', /admi|date/i], ['ward', 'Ward / unit', 'category', /ward|unit|bed|floor/i], ['los', 'Length of stay (days)', 'number', /los|length|stay|days/i], ['type', 'Admission type', 'category', /type|source|elect|emerg/i]],
    build: m => [['kpi', { fn: 'count', title: 'Admissions' }], ['kpi', { fn: 'avg', field: m.los, title: 'Average length of stay', fmt: 'days' }, ['los']], ['kpitrend', { x: m.date, grain: 'month', fn: 'count', title: 'Admissions — last full month' }], ['area', { x: m.date, grain: 'week', fn: 'count', title: 'Admissions per week', w: 3, anom: true }], ['calendar', { x: m.date, title: 'Admissions per day', w: 3 }], ['treemap', { x: m.ward, fn: 'count', title: 'Admissions by ward', w: 1 }, ['ward']], ['box', { x: m.ward, field: m.los, title: 'Length of stay by ward', w: 2, top: 12 }, ['ward', 'los']], ['stackarea', { x: m.date, grain: 'month', split: m.type, fn: 'count', title: 'Admission type over time', w: 3 }, ['type']], ['run', { x: m.date, grain: 'week', fn: 'avg', field: m.los, title: 'Average LOS per week (run chart)', w: 3 }, ['los']]] },
  { id: 'pharm', name: 'Pharmacy turnaround', desc: 'Orders, turnaround time, STAT vs routine, by location', roles: [['date', 'Order date / time', 'date', /order|date|time|request/i], ['tat', 'Turnaround (minutes)', 'number', /turn|tat|minute|time/i], ['prio', 'Priority (STAT / routine)', 'category', /prio|stat|urgen/i], ['loc', 'Location / ward', 'category', /loc|ward|unit|dept/i], ['cls', 'Medication class', 'category', /class|categ|drug|med/i]],
    build: m => [['kpi', { fn: 'count', title: 'Orders' }], ['kpi', { fn: 'median', field: m.tat, title: 'Median turnaround', fmt: 'min', lowerBetter: true, target: 30 }, ['tat']], ['gauge', { fn: 'avg', field: m.tat, title: 'Average turnaround vs target', target: 30, lowerBetter: true }, ['tat']], ['line', { x: m.date, grain: 'week', fn: 'median', field: m.tat, title: 'Median turnaround per week', w: 3, cmp: 'prev', anom: true }, ['tat']], ['box', { x: m.prio, field: m.tat, title: 'Turnaround by priority', w: 1 }, ['prio', 'tat']], ['bar', { x: m.loc, fn: 'median', field: m.tat, title: 'Median turnaround by location', w: 2, top: 15, ruleHi: 30 }, ['loc', 'tat']], ['heat', { x: '§hour', split: '§weekday', fn: 'median', field: m.tat, title: 'Turnaround by hour and weekday', w: 3, sort: 'label' }, ['tat']], ['treemap', { x: m.cls, fn: 'count', title: 'Orders by medication class', w: 3 }, ['cls']]] },
  { id: 'hd', name: 'Help desk', desc: 'Requests, closing time, groups and departments', roles: [['date', 'Created', 'date', /creat|open|date/i], ['group', 'Group / team', 'category', /group|team|queue/i], ['dept', 'Department', 'category', /dep|ward|unit|site/i], ['tech', 'Technician', 'category', /tech|assign|owner|analyst/i], ['status', 'Status', 'category', /status|state/i], ['hrs', 'Elapsed hours', 'number', /elapsed|hour|time|duration/i]],
    build: m => [['kpi', { fn: 'count', title: 'Requests' }], ['kpi', { fn: 'median', field: m.hrs, title: 'Median hours to close', fmt: 'hrs', lowerBetter: true }, ['hrs']], ['kpitrend', { x: m.date, grain: 'month', fn: 'count', title: 'Requests — last full month' }], ['line', { x: m.date, grain: 'week', fn: 'count', title: 'Requests per week', w: 3, anom: true, cmp: 'prev' }], ['pareto', { x: m.dept, fn: 'count', title: 'Departments making 80% of requests', w: 2, top: 20 }, ['dept']], ['donut', { x: m.status, fn: 'count', title: 'Status', w: 1 }, ['status']], ['hbar', { x: m.tech, fn: 'median', field: m.hrs, title: 'Median hours by technician', w: 2, top: 15 }, ['tech', 'hrs']], ['matrix', { x: m.group, split: m.status, fn: 'count', title: 'Group × status', w: 1 }, ['group', 'status']], ['heat', { x: '§hour', split: '§weekday', fn: 'count', title: 'When requests come in', w: 3, sort: 'label' }]] },
];
Studio.templates = () => {
  const ds = Studio.ds; const T = Studio.TEMPLATES;
  UI.modal({ title: 'Start from a template', wide: true, body: `<div class="st-tpls">${T.map(t => `<button class="st-tpl" data-tpl="${t.id}"><b>${h(t.name)}</b><span>${h(t.desc)}</span></button>`).join('')}</div><div id="st-tplmap"></div>`,
    actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok disabled>Make the dashboard</button>',
    onMount: w => {
      w.querySelector('[data-c]').onclick = UI.closeModal; let cur = null;
      const guess = (re, type) => (ds.cols.find(c => c.type === type && re.test(c.label)) || {}).key || '';
      w.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => { cur = T.find(t => t.id === b.dataset.tpl); w.querySelectorAll('[data-tpl]').forEach(x => x.classList.toggle('on', x === b));
        w.querySelector('#st-tplmap').innerHTML = `<h4>Which column is which? <span class="muted small">(guessed — check them; leave empty if you don't have it)</span></h4><form class="grid-form" id="st-tplf">${cur.roles.map(([k, l, type, re]) => UI.field({ key: k, label: `${l}`, type: 'select', options: ds.cols.filter(c => c.type === type).map(c => [c.key, c.label]) }, guess(re, type))).join('')}</form>`; w.querySelector('[data-ok]').disabled = false; });
      w.querySelector('[data-ok]').onclick = async () => {
        const m = {}; for (const [k] of cur.roles) m[k] = w.querySelector(`#st-tplf [name=${k}]`).value; if (!m.date) return UI.toast('The template needs the date column', 'bad');
        const extra = {}; const needDerive = part => { const nk = `${Studio.label(m.date)} · ${SD.DERIVE[part]}`; if (!Studio.col(nk)) extra[part] = true; return nk; };
        const vis = []; for (const [type, o, needs] of cur.build(m)) { if ((needs || []).some(k => !m[k])) continue; const v = Object.assign({ id: Studio.newId(), type, w: 1, top: 12, sort: 'value' }, o); for (const k of ['x', 'split']) if (typeof v[k] === 'string' && v[k].startsWith('§')) v[k] = needDerive(v[k].slice(1)); vis.push(v); }
        UI.closeModal(); for (const part of Object.keys(extra)) { await SD.apply(ds, { op: 'derive', key: m.date, part }); ds.steps = ds.steps || []; ds.steps.push({ op: 'derive', key: m.date, part }); } await Studio.store(ds);
        await Studio.change(B => { B.pages.push({ id: Studio.newId('p'), name: cur.name, visuals: vis }); B.page = B.pages.length - 1; B.rangeKey = m.date; }, `"${cur.name}" page made with ${vis.length} charts`);
      };
    } });
};

/* ---------- events ---------- */
Studio.mount = root => {
  Studio.bindStarts(root);
  const sel = root.querySelector('#st-ds'); if (sel) sel.onchange = async () => { await Studio.open(sel.value); Studio.rerender(); };
  const add = root.querySelector('[data-add]'); if (add) add.onclick = Studio.addData;
  root.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { Studio.view = b.dataset.view; Studio.rerender(); });
  root.querySelectorAll('[data-refresh]').forEach(b => b.onclick = Studio.refresh);
  if (!Studio.ds) return;
  const ds = Studio.ds, B = Studio.board(), F = Studio.filters; const P = B.pages[B.page];
  const on = (sel2, fn) => root.querySelectorAll(sel2).forEach(fn);
  const find = id => Studio.findVis(id);
  // top bar
  on('[data-undo]', b => b.onclick = Studio.undo); on('[data-redo]', b => b.onclick = Studio.redo);
  on('[data-suggest]', b => b.onclick = () => Studio.change(B2 => { B2.pages[B2.page].visuals = SD.suggest(ds); }).then(() => Studio.store(ds)));
  on('[data-newvis]', b => b.onclick = () => Studio.editVisual(null, true)); on('[data-newtext]', b => b.onclick = () => Studio.editText(null)); on('[data-templates]', b => b.onclick = Studio.templates);
  on('[data-field]', b => b.onclick = () => { const c = Studio.col(b.dataset.field); const v = c.type === 'id' ? { type: 'kpi', fn: 'distinct', field: c.key } : c.type === 'number' ? { type: 'kpi', fn: 'avg', field: c.key } : c.type === 'date' ? { type: 'line', x: c.key, grain: 'month', fn: 'count', w: 2 } : { type: 'hbar', x: c.key, fn: 'count', top: 12, sort: c.order ? 'label' : 'value' }; Studio.editVisual(v, true); });
  const fs = root.querySelector('#st-fsearch'); if (fs) fs.oninput = () => { const q = fs.value.trim().toLowerCase(); root.querySelectorAll('[data-field]').forEach(b => { b.hidden = !!q && !b.textContent.toLowerCase().includes(q); }); };
  // tools
  const ask = root.querySelector('#st-ask'); if (ask) ask.onsubmit = e => { e.preventDefault(); const q = root.querySelector('#st-askq').value.trim(); if (q) Studio.ask(q); };
  on('[data-drivers]', b => b.onclick = Studio.drivers); on('[data-beforeafter]', b => b.onclick = Studio.beforeAfter); on('[data-season]', b => b.onclick = Studio.season); on('[data-whatif]', b => b.onclick = Studio.whatIf); on('[data-notebook]', b => b.onclick = Studio.notebook);
  on('[data-dd]', b => b.onclick = e => { e.stopPropagation(); const m = b.nextElementSibling; const open = m.hidden; Studio.closeDd(); m.hidden = !open; b.setAttribute('aria-expanded', open); });
  on('.st-ddm button, .st-ddm label', x => x.addEventListener('click', () => setTimeout(Studio.closeDd, 0)));
  on('[data-summary]', b => b.onclick = Studio.summary); on('[data-compare]', b => b.onclick = Studio.compare); on('[data-report]', b => b.onclick = () => Studio.report(true)); on('[data-endreport]', b => b.onclick = () => Studio.report(false));
  on('[data-allpng]', b => b.onclick = Studio.allImages); on('[data-design-out]', b => b.onclick = Studio.designOut);
  const di = root.querySelector('#st-design-in'); if (di) di.onchange = async () => { try { await Studio.designIn(di.files[0]); } catch (e) { UI.toast(e.message, 'bad'); } };
  // pages
  on('[data-page]', b => { b.onclick = () => { B.page = +b.dataset.page; Studio.saveMeta(); Studio.rerender(); }; b.ondblclick = () => UI.modal({ title: 'Rename page', body: `<form class="grid-form">${UI.field({ key: 'n', label: 'Page name', type: 'text', span: 2 }, B.pages[+b.dataset.page].name)}</form>`, actions: '<span class="grow"></span><button class="btn primary" data-ok>Save</button>', onMount: w => { w.querySelector('[data-ok]').onclick = () => { const n = w.querySelector('[name=n]').value.trim(); UI.closeModal(); if (n) Studio.change(B2 => { B2.pages[+b.dataset.page].name = n; }); }; } }); });
  on('[data-addpage]', b => b.onclick = () => Studio.change(B2 => { B2.pages.push({ id: Studio.newId('p'), name: 'Page ' + (B2.pages.length + 1), visuals: [] }); B2.page = B2.pages.length - 1; }));
  on('[data-delpage]', b => b.onclick = () => UI.confirm(`Delete the page "${P.name}" and its ${P.visuals.length} card${P.visuals.length === 1 ? '' : 's'}? (Ctrl+Z brings it back)`, () => Studio.change(B2 => { B2.pages.splice(B2.page, 1); B2.page = Math.max(0, B2.page - 1); })));
  // saved views
  on('[data-saveview]', b => b.onclick = () => UI.modal({ title: 'Save this view', body: `<form class="grid-form">${UI.field({ key: 'n', label: 'Name', type: 'text', span: 2, placeholder: 'ICU — last quarter' }, '')}</form><p class="muted small">Saves the current filters (date range, filters on the left, clicked selection).</p>`, actions: '<span class="grow"></span><button class="btn primary" data-ok>Save</button>', onMount: w => { w.querySelector('[data-ok]').onclick = () => { const n = w.querySelector('[name=n]').value.trim(); if (!n) return; UI.closeModal(); Studio.change(B2 => { B2.views.push({ name: n, filters: JSON.parse(JSON.stringify(Studio.filters)) }); }, `View "${n}" saved`); }; } }));
  const vsel = root.querySelector('#st-view'); if (vsel) vsel.onchange = () => { const v = B.views[+vsel.value]; if (v) { Studio.filters = JSON.parse(JSON.stringify(v.filters)); Studio.rerender(); } };
  on('[data-delview]', b => b.onclick = () => { const i = +(root.querySelector('#st-view') || {}).value; if (isNaN(i) || !B.views[i]) return UI.toast('Pick a view first', 'warn'); Studio.change(B2 => { B2.views.splice(i, 1); }); });
  // cards
  on('[data-vfull]', b => b.onclick = () => Studio.full(find(b.dataset.vfull)));
  on('[data-vedit]', b => b.onclick = () => Studio.editVisual(find(b.dataset.vedit)));
  on('[data-vmenu]', b => b.onclick = e => { e.stopPropagation(); Studio.menuOpen = Studio.menuOpen === b.dataset.vmenu ? '' : b.dataset.vmenu; Studio.rerender(); });
  const close = () => { Studio.menuOpen = ''; };
  on('[data-vdel]', b => b.onclick = () => { close(); const id = b.dataset.vdel; if (F.cross && F.cross.vid === id) F.cross = null; Studio.change(B2 => { const p = B2.pages[B2.page]; p.visuals = p.visuals.filter(v => v.id !== id); }); });
  on('[data-vdup]', b => b.onclick = () => { close(); Studio.change(B2 => { const p = B2.pages[B2.page]; const i = p.visuals.findIndex(v => v.id === b.dataset.vdup); p.visuals.splice(i + 1, 0, Object.assign(JSON.parse(JSON.stringify(p.visuals[i])), { id: Studio.newId(), title: p.visuals[i].title + ' (copy)' })); }); });
  on('[data-vmove]', b => b.onclick = () => { close(); UI.modal({ title: 'Move to page', body: `<div class="row-btns">${B.pages.map((p, i) => i === B.page ? '' : `<button class="btn" data-to="${i}">${h(p.name)}</button>`).join('')}</div>`, onMount: w => w.querySelectorAll('[data-to]').forEach(x => x.onclick = () => { UI.closeModal(); Studio.change(B2 => { const from = B2.pages[B2.page]; const i = from.visuals.findIndex(v => v.id === b.dataset.vmove); const [v] = from.visuals.splice(i, 1); B2.pages[+x.dataset.to].visuals.push(v); }, 'Moved'); }) }); });
  on('[data-vpng]', b => b.onclick = () => { close(); const v = find(b.dataset.vpng); SC.png(root.querySelector('#ch-' + CSS.escape(v.id)), v.title, SG.mark(ds)); Studio.rerender(); });
  on('[data-vcopy]', b => b.onclick = async () => { close(); await Studio.copyImage(find(b.dataset.vcopy)); Studio.rerender(); });
  on('[data-vpin]', b => b.onclick = () => { close(); const v = find(b.dataset.vpin); const el = root.querySelector('#ch-' + CSS.escape(v.id)); Studio.findDialog({ kind: 'chart', title: v.title, vis: JSON.parse(JSON.stringify(v)), el }); });
  on('[data-vrows]', b => b.onclick = () => { close(); Studio.rerender(); Studio.showRows(find(b.dataset.vrows), null); });
  on('[data-vwhy]', b => b.onclick = () => { close(); Studio.rerender(); Studio.why(find(b.dataset.vwhy)); });
  on('[data-vdrill]', b => b.onclick = () => { close(); const id = b.dataset.vdrill; Studio.drillOn[id] = !Studio.drillOn[id]; if (!Studio.drillOn[id]) delete Studio.drill[id]; UI.toast(Studio.drillOn[id] ? 'Drill mode on — click a bar or point to go one level down' : 'Drill mode off', 'good'); Studio.rerender(); });
  on('[data-dup1]', a => a.onclick = e => { e.preventDefault(); const id = a.dataset.dup1; Studio.drill[id] = (Studio.drill[id] || []).slice(0, +a.dataset.lvl); Studio.rerender(); });
  on('[data-vxl]', b => b.onclick = async () => { close(); const v = find(b.dataset.vxl); const vv = Studio.drillVis(v); const a = SD.aggregate(ds, Studio.rowsFor(v), vv); const rows = ['kpi', 'gauge'].includes(v.type) ? [['Measure', 'Value'], [a.series[0].name, a.series[0].values[0]]] : ['scatter', 'trendscatter', 'bubble'].includes(v.type) ? [[Studio.label(v.x), Studio.label(v.field)], ...(a.series[0].points || [])] : [[vv.x ? Studio.label(vv.x) : '', ...a.series.map(s => s.name)], ...a.labels.map((l, i) => [l, ...a.series.map(s => s.counts && SD.small(ds, s.counts[i]) ? '<5' : s.values[i])])]; await Studio.excel(v.title || 'Visual', rows); Studio.rerender(); });
  // drag to move (⠿) and drag the corner to resize
  let dragId = null;
  on('[data-grip]', g => { g.ondragstart = e => { dragId = g.dataset.grip; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (err) { /* */ } g.closest('.st-card').classList.add('dragging'); }; g.ondragend = () => { root.querySelectorAll('.st-card').forEach(c => c.classList.remove('dragging', 'dropto')); }; });
  on('.st-card', c => { c.ondragover = e => { if (!dragId || c.dataset.vid === dragId) return; e.preventDefault(); root.querySelectorAll('.dropto').forEach(x => x.classList.remove('dropto')); c.classList.add('dropto'); }; c.ondrop = e => { e.preventDefault(); const to = c.dataset.vid, from = dragId; dragId = null; if (!from || from === to) return; Studio.change(B2 => { const p = B2.pages[B2.page]; const i = p.visuals.findIndex(v => v.id === from); const [v] = p.visuals.splice(i, 1); const j = p.visuals.findIndex(x => x.id === to); p.visuals.splice(j, 0, v); }); }; });
  on('[data-resize]', hnd => hnd.onpointerdown = e => { e.preventDefault(); const card2 = hnd.closest('.st-card'); const grid = card2.parentElement; const colW = grid.clientWidth / 3; const r0 = card2.getBoundingClientRect(); const x0 = e.clientX, y0 = e.clientY; hnd.setPointerCapture(e.pointerId);
    const move = ev => { card2.style.outline = '2px dashed #0e7c86'; card2.dataset.nw = Math.max(1, Math.min(3, Math.round((r0.width + ev.clientX - x0) / colW))); card2.dataset.nh = ev.clientY - y0 > 80 ? 2 : ev.clientY - y0 < -80 ? 1 : ''; };
    const up = () => { hnd.removeEventListener('pointermove', move); hnd.removeEventListener('pointerup', up); card2.style.outline = ''; const id = card2.dataset.vid; const nw = +card2.dataset.nw || 0, nh = +card2.dataset.nh || 0; if (!nw && !nh) return; Studio.change(B2 => { const v = B2.pages[B2.page].visuals.find(x => x.id === id); if (nw) v.w = nw; if (nh) v.h = nh; }); };
    hnd.addEventListener('pointermove', move); hnd.addEventListener('pointerup', up); });
  // filters
  on('[data-sl]', cb => cb.onchange = () => { const k = cb.dataset.sl; const s = new Set(F.slicers[k] || []); if (cb.checked) s.add(cb.value); else s.delete(cb.value); F.slicers[k] = [...s]; Studio.rerender(); });
  on('[data-slclear]', a => a.onclick = e => { e.preventDefault(); delete F.slicers[a.dataset.slclear]; Studio.rerender(); });
  on('[data-sldel]', b => b.onclick = () => { delete F.slicers[b.dataset.sldel]; Studio.change(B2 => { B2.slicers = B2.slicers.filter(k => k !== b.dataset.sldel); }); });
  const as = root.querySelector('#st-addsl'); if (as) as.onchange = () => { if (as.value) Studio.change(B2 => { B2.slicers.push(as.value); }); };
  const rk = root.querySelector('#st-rk'); if (rk) rk.onchange = () => { F.range = {}; Studio.change(B2 => { B2.rangeKey = rk.value; }); };
  const setRange = () => { F.range = { key: (root.querySelector('#st-rk') || {}).value, from: root.querySelector('#st-from').value, to: root.querySelector('#st-to').value }; Studio.rerender(); };
  const fr = root.querySelector('#st-from'), to = root.querySelector('#st-to'); if (fr) { fr.onchange = setRange; to.onchange = setRange; }
  on('[data-qr]', b => b.onclick = () => { const k = (root.querySelector('#st-rk') || {}).value; const max = ds.rows.reduce((m, r) => { const d = String(r[k] || '').slice(0, 10); return d > m ? d : m; }, ''); F.range = { key: k, from: U.addDays(max || U.todayStr(), -(+b.dataset.qr) + 1), to: max }; Studio.rerender(); });
  const xc = root.querySelector('[data-xclear]'); if (xc) xc.onclick = () => { F.cross = null; Studio.rerender(); };
  const rc = root.querySelector('[data-rgclear]'); if (rc) rc.onclick = () => { F.range = {}; Studio.rerender(); };
  const ac = root.querySelector('[data-allclear]'); if (ac) ac.onclick = () => { Studio.filters = { slicers: {}, range: {}, cross: null }; Studio.rerender(); };
  // data view
  on('[data-type]', s => s.onchange = () => Studio.step({ op: 'type', key: s.dataset.type, type: s.value }));
  on('[data-desc]', i => i.onchange = async () => { const c = Studio.col(i.dataset.desc); if (c) { c.desc = i.value.trim(); await Studio.store(ds); UI.toast('Description saved', 'good'); } });
  on('[data-dict]', b => b.onclick = Studio.dictionary);
  on('[data-ren]', i => i.onchange = () => Studio.step({ op: 'rename', key: i.dataset.ren, label: i.value.trim() || i.dataset.ren }, { quiet: true }));
  on('[data-unify]', b => b.onclick = () => Studio.step({ op: 'unify', key: b.dataset.unify }));
  on('[data-clearodd]', b => b.onclick = () => Studio.step({ op: 'clearodd', key: b.dataset.clearodd }));
  on('[data-qfill]', b => b.onclick = () => Studio.step({ op: 'fill', key: b.dataset.qfill, value: 'Not recorded' }));
  on('[data-qhist]', b => b.onclick = () => { Studio.view = 'dash'; Studio.editVisual({ type: 'histogram', field: b.dataset.qhist, w: 2 }, true); });
  on('[data-cdel]', b => b.onclick = () => { const k = b.dataset.cdel; for (const p of B.pages) p.visuals = p.visuals.filter(v => ![v.x, v.field, v.split, v.field2].includes(k)); Studio.step({ op: 'drop', key: k }); });
  on('[data-dedupe]', b => b.onclick = () => Studio.step({ op: 'dedupe' }));
  on('[data-stepdel]', b => b.onclick = () => UI.confirm('Remove this step? The data on this PC is rebuilt from the file on the next ⟳ Refresh.', async () => { ds.steps.splice(+b.dataset.stepdel, 1); await Studio.store(ds); Studio.rerender(); }));
  const der = root.querySelector('#st-der'); if (der) der.onsubmit = e => { e.preventDefault(); Studio.step({ op: 'derive', key: der.querySelector('[name=col]').value, part: der.querySelector('[name=part]').value }); };
  const btw = root.querySelector('#st-btw'); if (btw) btw.onsubmit = e => { e.preventDefault(); const a = btw.querySelector('[name=a]').value, b = btw.querySelector('[name=b]').value; if (a === b) return UI.toast('Pick two different date columns', 'bad'); Studio.step({ op: 'between', a, b, unit: btw.querySelector('[name=unit]').value }); };
  // formula
  on('[data-ex]', x => x.onclick = () => { const t = root.querySelector('#st-fx [name=expr]'); t.value = x.dataset.ex; });
  const fxv = () => ({ name: root.querySelector('#st-fx [name=name]').value.trim(), expr: root.querySelector('#st-fx [name=expr]').value.trim() });
  on('[data-fxtest]', b => b.onclick = () => { const { expr } = fxv(); const out = root.querySelector('#st-fxprev'); try { const f = SF.compile(expr, ds); out.className = 'small'; out.textContent = 'First values: ' + ds.rows.slice(0, 6).map(r => { const v = f(r); return v == null || v === '' ? '(empty)' : typeof v === 'number' ? U.num(v, 2) : String(v); }).join(' · '); } catch (e) { out.className = 'small t-bad'; out.textContent = e.message; } });
  on('[data-fxadd]', b => b.onclick = () => { const { name, expr } = fxv(); if (!name || !expr) return UI.toast('Give the column a name and a formula', 'bad'); try { SF.compile(expr, ds); } catch (e) { return UI.toast(e.message, 'bad'); } Studio.step({ op: 'formula', name, expr }); });
  on('[data-binsadd]', b => b.onclick = () => { const f = root.querySelector('#st-bins'); const key = f.querySelector('[name=key]').value; const edges = f.querySelector('[name=edges]').value.split(/[,;\s]+/).map(Number).filter(x => isFinite(x)); if (!edges.length) return UI.toast('Write the break points, e.g. 15, 30, 60', 'bad'); const name = f.querySelector('[name=name]').value.trim() || `${Studio.label(key)} (ranges)`; Studio.step({ op: 'bins', key, edges, name }); });
  on('[data-recvals]', b => b.onclick = () => { const f = root.querySelector('#st-rec'); const key = f.querySelector('[name=key]').value; const o = {}; for (const r of ds.rows) { const v = String(r[key] ?? ''); if (v) o[v] = (o[v] || 0) + 1; } const t = f.querySelector('[name=map]'); t.value = Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, 60).map(([v]) => `${v} = ${v}`).join('\n'); });
  on('[data-recadd]', b => b.onclick = () => { const f = root.querySelector('#st-rec'); const map = {}; for (const line of f.querySelector('[name=map]').value.split('\n')) { const i = line.indexOf('='); if (i > 0) { const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim(); if (k) map[k] = v; } } if (!Object.keys(map).length) return UI.toast('Write at least one line: old = new', 'bad'); Studio.step({ op: 'recode', key: f.querySelector('[name=key]').value, name: f.querySelector('[name=name]').value.trim(), map, keepOthers: f.querySelector('[name=other]').value === 'keep' }); });
  on('[data-caladd]', b => b.onclick = () => { const f = root.querySelector('#st-cal'); Studio.step({ op: 'calendar', key: f.querySelector('[name=key]').value, kind: f.querySelector('[name=kind]').value, startMonth: +f.querySelector('[name=sm]').value }); });
  // link
  const lf = root.querySelector('#st-link'); if (lf) { const load = async () => { const o = await Lab.read('studio.ds.' + lf.querySelector('[name=ds]').value, null); const box = root.querySelector('#st-linkmore'); if (!o) { box.innerHTML = '<p class="t-bad small">Not found on this PC.</p>'; return; } box.innerHTML = `${UI.field({ key: 'okey', label: `Matching column in "${o.name}"`, type: 'select', options: o.cols.map(c => [c.key, c.label]), blank: false }, (o.cols.find(c => c.key.toLowerCase() === (lf.querySelector('[name=key]').value || '').toLowerCase()) || o.cols[0]).key)}<div class="st-linkcols">${o.cols.map(c => `<label class="check"><input type="checkbox" name="lc" value="${h(c.key)}"> ${h(c.label)}</label>`).join('')}</div>`; }; lf.querySelector('[name=ds]').onchange = load; load(); }
  on('[data-linkadd]', b => b.onclick = () => { const cols = [...root.querySelectorAll('#st-link [name=lc]:checked')].map(x => x.value); const okey = (root.querySelector('#st-link [name=okey]') || {}).value; if (!cols.length || !okey) return UI.toast('Tick the columns to bring', 'bad'); Studio.step({ op: 'link', dsId: lf.querySelector('[name=ds]').value, key: lf.querySelector('[name=key]').value, otherKey: okey, cols }); });
  // measures
  on('[data-madd]', b => b.onclick = async () => { const f = root.querySelector('#st-meas'); const m = { id: Studio.newId('m'), name: f.querySelector('[name=name]').value.trim(), kind: f.querySelector('[name=kind]').value, field: f.querySelector('[name=field]').value, cond: f.querySelector('[name=cond]').value.trim() }; if (!m.name) return UI.toast('Give the measure a name', 'bad'); if (!['count', 'pct'].includes(m.kind) && !m.field) return UI.toast('Pick the column', 'bad'); if (m.kind === 'pct' && !m.cond) return UI.toast('A % measure needs "only rows where"', 'bad'); if (m.cond) try { SF.compile(m.cond, ds); } catch (e) { return UI.toast(e.message, 'bad'); } ds.measures = [...(ds.measures || []), m]; await Studio.store(ds); UI.toast(`★ "${m.name}" saved — pick it as the Measure in any chart`, 'good'); Studio.rerender(); });
  on('[data-mdel]', b => b.onclick = async () => { ds.measures = (ds.measures || []).filter(m => m.id !== b.dataset.mdel); await Studio.store(ds); Studio.rerender(); });
  // dataset settings
  const dss = root.querySelector('#st-dsset'); if (dss) dss.onchange = async () => { ds.label = dss.querySelector('[name=label]').value; ds.about = dss.querySelector('[name=about]').value.trim(); Studio.meta.keepDays = Math.max(0, +dss.querySelector('[name=keep]').value || 0); await Studio.store(ds); UI.toast('Saved', 'good'); };
  const sm = root.querySelector('#st-small'); if (sm) sm.onchange = async () => { ds.smallCells = sm.checked; await Studio.store(ds); Studio.rerender(); };
  const dx = root.querySelector('[data-dsxl]'); if (dx) dx.onclick = () => Studio.excel(ds.name, [ds.cols.map(c => c.label), ...ds.rows.map(r => ds.cols.map(c => r[c.key]))]);
  const bk = root.querySelector('[data-backup]'); if (bk) bk.onclick = async () => { await SG.backup(); UI.toast('Backup downloaded — it contains the data, keep it somewhere safe', 'warn'); };
  const dr = root.querySelector('[data-dsren]'); if (dr) dr.onclick = () => UI.modal({ title: 'Rename', body: `<form class="grid-form" id="st-rn">${UI.field({ key: 'n', label: 'Name', type: 'text', span: 2 }, ds.name)}</form>`, actions: '<span class="grow"></span><button class="btn primary" data-ok>Save</button>', onMount: w => { w.querySelector('[data-ok]').onclick = async () => { ds.name = w.querySelector('[name=n]').value.trim() || ds.name; UI.closeModal(); await Studio.store(ds); Studio.rerender(); }; } });
  const del = root.querySelector('[data-dsdel]'); if (del) del.onclick = () => UI.confirm(`Delete "${ds.name}" and its dashboards from this PC? The original file is not touched.`, async () => { await Studio.remove(ds.id); Studio.view = 'dash'; Studio.rerender(); });
  // charts
  if (Studio.view === 'dash') requestAnimationFrame(() => Studio.drawAll(root));
};
window.addEventListener('resize', U.debounce(() => { if (LabUI.page === 'studio' && Studio.view === 'dash') Studio.drawAll(); }, 250));
document.addEventListener('keydown', e => { if (LabUI.page !== 'studio' || Studio.view !== 'dash' || document.getElementById('modal') || /input|textarea|select/i.test((e.target || {}).tagName || '')) return; const k = e.key.toLowerCase(); if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); Studio.undo(); } else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); Studio.redo(); } });
Studio.closeDd = () => document.querySelectorAll('.st-ddm').forEach(m => { m.hidden = true; const b = m.previousElementSibling; if (b) b.setAttribute('aria-expanded', 'false'); });
document.addEventListener('click', e => { if (!e.target.closest('.st-dd')) Studio.closeDd(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') Studio.closeDd(); });
document.addEventListener('click', e => { if (Studio.menuOpen && !e.target.closest('.st-menu') && !e.target.closest('[data-vmenu]')) { Studio.menuOpen = ''; document.querySelectorAll('.st-menu').forEach(m => m.remove()); } });
window.addEventListener('afterprint', () => { if (document.body.classList.contains('st-reporting')) { /* stay in report mode until closed */ } });
