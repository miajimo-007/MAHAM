/* MAHAM Lab — Studio chart engine (MAHAM's own, SVG, no libraries).
 * Core: scales, axes, rich tooltips, crosshair, legend on/off, click-to-filter, drag-to-zoom, value labels,
 * target / average lines, number formats, palettes, small-number privacy, PNG export.
 * The 50 chart types are registered in SC.R (this file: numbers, bars, trends; lab-studio-charts2.js: the rest).
 * SC.draw(el, vis, { ds, rows, onPick, redraw }) */
'use strict';

const SC = {
  PALETTES: {
    teal: ['#0e7c86', '#e07a2e', '#5b6cc8', '#2f9e5b', '#c0436a', '#a07a2c', '#3a8fc7', '#8e5bb5', '#5f7f8c', '#d4a017'],
    ocean: ['#0b4f6c', '#01baef', '#20bf55', '#757575', '#fbb13c', '#d81159', '#8f2d56', '#218380', '#73d2de', '#ffbc42'],
    warm: ['#c2410c', '#ea580c', '#f59e0b', '#a16207', '#b91c1c', '#9d174d', '#7c2d12', '#d97706', '#be123c', '#78350f'],
    calm: ['#335c67', '#9e2a2b', '#e09f3e', '#540b0e', '#5f8575', '#7c6a9c', '#4f6d7a', '#c08552', '#2a9d8f', '#8d99ae'],
    mono: ['#0e4a6b', '#1f6f8f', '#3a90ab', '#62acc1', '#8fc5d3', '#b9dbe4', '#0b3550', '#477f99', '#7aa9bc', '#a9cbd8'],
  },
  PAL_NAMES: [['teal', 'MAHAM teal'], ['ocean', 'Ocean'], ['warm', 'Warm'], ['calm', 'Calm'], ['mono', 'One colour']],
  FORMATS: [['auto', 'Automatic'], ['int', 'Whole numbers'], ['1dp', '1 decimal'], ['2dp', '2 decimals'], ['pct', 'Percent'], ['hrs', 'Hours'], ['min', 'Minutes'], ['days', 'Days']],
  hidden: {}, zoom: {},
  R: {},   // chart types: id → draw(c)
  /* the 50 types: [id, label, group]; NEED says which editor fields apply */
  TYPES: [
    ['kpi', 'Number card', 'Numbers'], ['kpitrend', 'Number + trend', 'Numbers'], ['gauge', 'Gauge', 'Numbers'], ['bullet', 'Bullet (vs target)', 'Numbers'],
    ['bar', 'Columns', 'Bars'], ['hbar', 'Bars', 'Bars'], ['grouped', 'Grouped columns', 'Bars'], ['stacked', 'Stacked columns', 'Bars'], ['hstacked', 'Stacked bars', 'Bars'], ['pct', '100% stacked', 'Bars'], ['lollipop', 'Lollipop', 'Bars'], ['dot', 'Dot plot', 'Bars'], ['dumbbell', 'Dumbbell (2 groups)', 'Bars'], ['diverging', 'Diverging (vs average)', 'Bars'], ['radialbar', 'Radial bars', 'Bars'],
    ['pareto', 'Pareto (80/20)', 'Analysis'], ['waterfall', 'Waterfall', 'Analysis'],
    ['line', 'Line', 'Trends'], ['smooth', 'Smooth line', 'Trends'], ['step', 'Step line', 'Trends'], ['area', 'Area', 'Trends'], ['stackarea', 'Stacked area', 'Trends'], ['pctarea', '100% area', 'Trends'], ['combo', 'Columns + line', 'Trends'], ['movavg', 'Moving average', 'Trends'], ['forecast', 'Forecast', 'Trends'], ['band', 'Min–max band', 'Trends'], ['control', 'Control chart (SPC)', 'Trends'], ['run', 'Run chart (median)', 'Trends'],
    ['calendar', 'Calendar heat map', 'Time grids'], ['sparkgrid', 'Small multiples', 'Time grids'],
    ['pie', 'Pie', 'Part of whole'], ['donut', 'Donut', 'Part of whole'], ['halfdonut', 'Half donut', 'Part of whole'], ['treemap', 'Treemap', 'Part of whole'], ['sunburst', 'Sunburst', 'Part of whole'], ['waffle', 'Waffle (100 squares)', 'Part of whole'], ['funnel', 'Funnel', 'Part of whole'],
    ['histogram', 'Histogram', 'Distribution'], ['box', 'Box plot', 'Distribution'], ['strip', 'Strip plot', 'Distribution'], ['ecdf', 'Cumulative distribution', 'Distribution'], ['scatter', 'Scatter', 'Distribution'], ['trendscatter', 'Scatter + trend line', 'Distribution'], ['bubble', 'Bubble', 'Distribution'],
    ['heat', 'Heat map', 'Matrix'], ['radar', 'Radar', 'Matrix'], ['sankey', 'Sankey flow', 'Matrix'], ['matrix', 'Pivot matrix', 'Matrix'], ['table', 'Table with bars', 'Matrix'],
  ],
  /* x: what the X field must be ('cat' category/date, 'date', 'num', 0 = none) · split: 0 / 1 / 'req' · field: 'm' measure column, 'num' must be a number · field2 · target · win · bins */
  NEED: {
    kpi: { x: 0, split: 0 }, kpitrend: { x: 'date', split: 0 }, gauge: { x: 0, split: 0, target: 1 }, bullet: { split: 0, target: 1 },
    grouped: { split: 'req' }, stacked: { split: 'req' }, hstacked: { split: 'req' }, pct: { split: 'req' }, dumbbell: { split: 'req' }, dot: {}, radialbar: { split: 0 },
    pareto: { split: 0 }, waterfall: { split: 0 }, diverging: { split: 0 },
    stackarea: { split: 'req' }, pctarea: { split: 'req' }, combo: { split: 0, field2: 1 }, movavg: { split: 0, win: 1 }, forecast: { split: 0 }, band: { split: 0, fn: 0, field: 'num' }, control: { split: 0 }, run: { split: 0 },
    calendar: { x: 'date', split: 0 }, sparkgrid: { x: 'date', split: 'req' },
    pie: { split: 0 }, donut: { split: 0 }, halfdonut: { split: 0 }, treemap: {}, sunburst: { split: 'req' }, waffle: { split: 0 }, funnel: { split: 0 },
    histogram: { x: 0, split: 0, fn: 0, field: 'num', bins: 1 }, box: { fn: 0, field: 'num', split: 0 }, strip: { fn: 0, field: 'num', split: 0 }, ecdf: { x: 0, fn: 0, field: 'num' },
    scatter: { x: 'num', fn: 0, field: 'num' }, trendscatter: { x: 'num', fn: 0, field: 'num' }, bubble: { x: 'num', fn: 0, field: 'num', field2: 'num' },
    heat: { split: 'req' }, radar: {}, sankey: { split: 'req', fn: 0 }, matrix: { split: 'req' }, table: {},
  },
  need(t) { return Object.assign({ x: 'cat', split: 1, fn: 1, field: 'm', field2: 0, target: 0, win: 0, bins: 0 }, SC.NEED[t] || {}); },
  TIME: new Set(['line', 'smooth', 'step', 'area', 'stackarea', 'pctarea', 'combo', 'movavg', 'forecast', 'band', 'control', 'run']),
  pal(vis) { return SC.PALETTES[vis.palette] || SC.PALETTES.teal; },
  /* number formats */
  f(v, vis, fnHint) {
    if (v == null || (typeof v === 'number' && !isFinite(v))) return '–'; if (typeof v === 'string') return v;
    let m = (vis && vis.fmt) || 'auto';
    if (m === 'auto') { const f = fnHint || (vis && vis.fn); if (typeof f === 'string' && f.startsWith('m:')) { const ms = ((SD.cur || {}).measures || []).find(x => x.id === f.slice(2)); if (ms && ms.kind === 'pct') m = 'pct'; } }
    if (m === 'int') return Math.round(v).toLocaleString(); if (m === '1dp') return U.num(v, 1); if (m === '2dp') return U.num(v, 2);
    if (m === 'pct') return U.num(v * (Math.abs(v) <= 1.5 ? 100 : 1), 1) + '%'; if (m === 'hrs') return U.num(v, 1) + ' h'; if (m === 'min') return Math.round(v) + ' min'; if (m === 'days') return U.num(v, 1) + ' d';
    return SD.fmt(v, fnHint || (vis && vis.fn));
  },
  /* privacy: counts under 5 on patient-level data are hidden */
  guard(agg, vis, ds) {
    if (!ds || !ds.smallCells) return agg;
    for (const s of agg.series || []) if (s.values) s.values = s.values.map((v, i) => s.counts && SD.small(ds, s.counts[i]) ? null : v);
    if (vis.type === 'kpi' && SD.small(ds, agg.n)) agg.series[0].values = [null], agg.hidden = true;
    return agg;
  },
  nice(min, max, n = 5) {
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; } if (min === max) { if (max === 0) max = 1; else if (max > 0) min = 0; else max = 0; }
    const span = max - min; const p = Math.pow(10, Math.floor(Math.log10(span / n))); const step = [1, 2, 2.5, 5, 10].map(x => x * p).find(x => span / x <= n) || p * 10;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step; const ticks = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
    return { min: lo, max: hi, step, ticks };
  },
  short(l, grain) { const s = String(l); if (grain === 'month' && /^\d{4}-\d{2}$/.test(s)) return U.MONTHS[+s.slice(5) - 1].slice(0, 3) + ' ' + s.slice(2, 4); if ((grain === 'day' || grain === 'week') && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(8, 10) + '/' + s.slice(5, 7); return s.length > 16 ? s.slice(0, 15) + '…' : s; },
  long(l, grain) { const s = String(l); if (grain === 'month' && /^\d{4}-\d{2}$/.test(s)) return U.MONTHS[+s.slice(5) - 1] + ' ' + s.slice(0, 4); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return U.fmtDate(s) + (grain === 'week' ? ' (week)' : ''); return s; },
  esc: s => h(String(s == null ? '' : s)),
  _inst: new Map(), dispose() { }, disposeAll() { },
  /* ---------- drawing context ---------- */
  draw(el, vis, ctx) {
    const W = Math.max(220, Math.floor(el.clientWidth || 400)), H = Math.max(80, Math.floor(el.clientHeight || 260));
    const c = SC.ctx(el, vis, ctx, W, H);
    const fn = (+vis.fc > 0 && ['line', 'smooth', 'step', 'area'].includes(vis.type) && !vis.split && !vis.cmp ? SC.R.forecast : SC.R[vis.type]) || SC.R.bar;
    try { fn(c); } catch (e) { console.error(e); c.html(`<div class="sv-empty t-bad">Could not draw this chart: ${h(e.message)}</div>`); }
    SC.finish(c);
  },
  ctx(el, vis, ctx, W, H) {
    const c = { el, vis, ds: ctx.ds, rows: ctx.rows || [], ctx, W, H, parts: [], tips: [], legendItems: null, out: null, P: SC.pal(vis), zoomable: false, geom: null, anim: !ctx.noAnim };
    c.f = (v, fh) => SC.f(v, vis, fh);
    c.add = s => { c.parts.push(s); };
    c.html = s => { c.out = s; };
    c.empty = m => c.html(`<div class="sv-empty">${h(m || 'No data for this selection.')}</div>`);
    c.tip = (t, rows, foot) => { c.tips.push({ t, r: rows || [], f: foot || '' }); return ` data-ti="${c.tips.length - 1}"`; };
    c.pick = l => (l == null || !ctx.onPick ? '' : ` data-pick="${h(String(l))}"`);
    c.small = n => SD.small(c.ds, n);
    c.hiddenSet = () => (SC.hidden[vis.id] = SC.hidden[vis.id] || new Set());
    c.agg = (over) => {
      const v = Object.assign({}, vis, over || {});
      const a = SC.guard(SD.aggregate(c.ds, c.rows, v), v, c.ds);
      const z = SC.zoom[vis.id]; if (z && a.labels && a.labels.length > 2 && !(over && over.noZoom)) { const [i0, i1] = z; a.labels = a.labels.slice(i0, i1 + 1); for (const s of a.series) { if (s.values) s.values = s.values.slice(i0, i1 + 1); if (s.counts) s.counts = s.counts.slice(i0, i1 + 1); } a.zoomed = true; }
      const hid = c.hiddenSet(); a.all = a.series; a.series = a.series.filter(s => !hid.has(s.name)); return a;
    };
    c.legend = (items, toggle = true) => { c.legendItems = { items, toggle }; };
    c.lh = () => 0;
    /* colour rules: red above / green below (per chart) */
    c.rule = (v, base) => { if (v == null) return base; if (vis.ruleHi !== '' && vis.ruleHi != null && isFinite(+vis.ruleHi) && v > +vis.ruleHi) return '#c0392b'; if (vis.ruleLo !== '' && vis.ruleLo != null && isFinite(+vis.ruleLo) && v < +vis.ruleLo) return '#2f9e5b'; return base; };
    return c;
  },
  finish(c) {
    const { el, vis, W, H } = c;
    const legend = c.legendItems ? `<div class="sv-legend">${c.legendItems.items.map((it, i) => `<button type="button" class="sv-lg ${it.off ? 'off' : ''}" ${c.legendItems.toggle ? `data-lg="${h(it.name)}"` : 'disabled'} title="${c.legendItems.toggle ? 'Show / hide' : ''}"><i style="background:${it.color || c.P[i % c.P.length]}"></i>${h(it.grain ? SC.short(it.name, it.grain) : String(it.name).length > 26 ? String(it.name).slice(0, 25) + '…' : it.name)}</button>`).join('')}</div>` : '';
    const lh = legend ? 28 : 0;
    if (SC.zoom[vis.id] && c.geom) c.zoomable = true;   // stays zoomable (and resettable) once zoomed in
    const zoomBtn = SC.zoom[vis.id] ? '<button type="button" class="sv-zoomreset" data-zr>⤺ Reset zoom</button>' : '';
    if (c.out != null) el.innerHTML = `<div class="sv-box">${c.out}</div>${legend}`;
    else el.innerHTML = `<svg class="sv ${c.anim ? 'sv-anim' : ''}" width="${W}" height="${H - lh}" viewBox="0 0 ${W} ${H - lh}" role="img" aria-label="${h(vis.title || '')}"><g class="sv-plot">${c.parts.join('')}</g>${c.geom && c.geom.guide ? `<line class="sv-guide" x1="0" x2="0" y1="${c.geom.T}" y2="${c.geom.T + c.geom.ph}" visibility="hidden"/>` : ''}${c.zoomable ? `<rect class="sv-sel" x="0" y="${c.geom.T}" width="0" height="${c.geom.ph}" visibility="hidden"/>` : ''}</svg>${zoomBtn}${legend}`;
    SC.bind(c);
  },
  /* tooltips, picks, legend, crosshair, zoom */
  bind(c) {
    const { el, ctx, vis } = c;
    let tipEl = document.getElementById('sv-tip'); if (!tipEl) { tipEl = document.createElement('div'); tipEl.id = 'sv-tip'; tipEl.hidden = true; document.body.appendChild(tipEl); }
    const show = (n, e) => { const t = c.tips[+n.dataset.ti]; if (!t) return; tipEl.innerHTML = `${t.t ? `<div class="tt-t">${h(t.t)}</div>` : ''}${t.r.map(r => `<div class="tt-r">${r[0] ? `<i style="background:${r[0]}"></i>` : ''}<span>${h(r[1])}</span><b>${h(r[2])}</b></div>`).join('')}${t.f ? `<div class="tt-f">${h(t.f)}</div>` : ''}`; tipEl.hidden = false;
      const x = e.clientX + 14, y = e.clientY + 12; const w = tipEl.offsetWidth, hh = tipEl.offsetHeight; tipEl.style.left = Math.min(x, window.innerWidth - w - 8) + 'px'; tipEl.style.top = (y + hh > window.innerHeight - 8 ? e.clientY - hh - 10 : y) + 'px'; };
    const guide = el.querySelector('.sv-guide');
    el.querySelectorAll('[data-ti]').forEach(n => {
      n.addEventListener('mousemove', e => { show(n, e); if (guide && n.dataset.gx) { guide.setAttribute('x1', n.dataset.gx); guide.setAttribute('x2', n.dataset.gx); guide.setAttribute('visibility', 'visible'); } });
      n.addEventListener('mouseleave', () => { tipEl.hidden = true; if (guide) guide.setAttribute('visibility', 'hidden'); });
    });
    el.querySelectorAll('[data-pick]').forEach(n => n.addEventListener('click', e => { if (el._dragged) return; tipEl.hidden = true; if (ctx.onPick) ctx.onPick(n.dataset.pick, e); }));
    el.querySelectorAll('[data-lg]').forEach(b => b.onclick = () => { const s = c.hiddenSet(); const k = b.dataset.lg; if (s.has(k)) s.delete(k); else if (c.legendItems.items.filter(i => !i.off).length > 1) s.add(k); (ctx.redraw || (() => SC.draw(el, vis, ctx)))(); });
    const zr = el.querySelector('[data-zr]'); if (zr) zr.onclick = () => { delete SC.zoom[vis.id]; (ctx.redraw || (() => SC.draw(el, vis, ctx)))(); };
    if (c.zoomable && c.geom) {
      const svg = el.querySelector('svg'); const sel = el.querySelector('.sv-sel'); const G = c.geom; let x0 = null;
      const px = e => e.clientX - svg.getBoundingClientRect().left;
      svg.addEventListener('mousedown', e => { if (e.button !== 0) return; x0 = px(e); el._dragged = false; });
      svg.addEventListener('mousemove', e => { if (x0 == null) return; const x = px(e); if (Math.abs(x - x0) > 6) { el._dragged = true; sel.setAttribute('visibility', 'visible'); sel.setAttribute('x', Math.min(x, x0)); sel.setAttribute('width', Math.abs(x - x0)); } });
      const end = e => { if (x0 == null) return; const x = px(e); const was = el._dragged; sel.setAttribute('visibility', 'hidden');
        if (was) { const idx = v => Math.max(0, Math.min(G.n - 1, Math.round((v - G.L - G.step / 2) / G.step))); const a = idx(Math.min(x, x0)), b = idx(Math.max(x, x0)); const base = SC.zoom[vis.id] ? SC.zoom[vis.id][0] : 0; if (b - a >= 1) { SC.zoom[vis.id] = [base + a, base + b]; (ctx.redraw || (() => SC.draw(el, vis, ctx)))(); } }
        x0 = null; setTimeout(() => { el._dragged = false; }, 0); };
      svg.addEventListener('mouseup', end); svg.addEventListener('mouseleave', e => { if (x0 != null) end(e); });
      svg.addEventListener('dblclick', () => { if (SC.zoom[vis.id]) { delete SC.zoom[vis.id]; (ctx.redraw || (() => SC.draw(el, vis, ctx)))(); } });
    }
  },
  /* ---------- a cartesian frame: category X, value Y (optional right axis) ---------- */
  frame(c, o) {
    const { W, H, vis } = c; const lh = c.legendItems ? 28 : 0; const labels = o.labels;
    const yk = SC.nice(Math.min(0, o.vmin == null ? 0 : o.vmin), o.vmax == null ? 1 : o.vmax, Math.max(3, Math.floor((H - lh) / 55)));
    const fmtY = o.fmtY || (v => c.f(v));
    const yw = Math.max(...yk.ticks.map(t => fmtY(t).length)) * 6.4 + 10;
    const L = Math.max(34, yw), R = o.right ? 44 : 12, T = 10; const many = labels.length > 8 && !o.noRotate; const B = o.hideX ? 8 : many ? 48 : 24;
    const pw = Math.max(40, W - L - R), ph = Math.max(30, H - lh - B - T); const n = labels.length; const step = pw / Math.max(1, n);
    const Y = v => T + ph - ((v - yk.min) / ((yk.max - yk.min) || 1)) * ph; const X = i => L + i * step + step / 2;
    let s = '';
    for (const t of yk.ticks) s += `<line x1="${L}" x2="${L + pw}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" class="sv-grid${t === 0 ? ' zero' : ''}"/><text x="${L - 6}" y="${(Y(t) + 4).toFixed(1)}" class="sv-ax" text-anchor="end">${h(fmtY(t))}</text>`;
    let Y2 = null; if (o.right) { const rk = SC.nice(o.right.min || 0, o.right.max, Math.max(3, Math.floor((H - lh) / 55))); Y2 = v => T + ph - ((v - rk.min) / ((rk.max - rk.min) || 1)) * ph; for (const t of rk.ticks) s += `<text x="${L + pw + 6}" y="${(Y2(t) + 4).toFixed(1)}" class="sv-ax">${h(o.right.fmt ? o.right.fmt(t) : c.f(t))}</text>`; }
    if (!o.hideX) { const every = Math.max(1, Math.ceil(n / Math.floor(pw / (many ? 20 : 54)))); labels.forEach((l, i) => { if (i % every) return; const t = h(SC.short(l, o.grain)); s += many ? `<text transform="translate(${X(i).toFixed(1)},${T + ph + 10}) rotate(-40)" class="sv-ax" text-anchor="end">${t}</text>` : `<text x="${X(i).toFixed(1)}" y="${T + ph + 16}" class="sv-ax" text-anchor="middle">${t}</text>`; }); }
    c.add(s); c.geom = { L, R, T, pw, ph, n, step, X, Y, Y2, yk, guide: !!o.guide };
    return c.geom;
  },
  /* target / average lines */
  refLines(c, G, values, horizontal) {
    const v = c.vis; const out = [];
    if (v.target != null && v.target !== '' && isFinite(+v.target)) out.push([+v.target, 'Target ' + c.f(+v.target), 'sv-target']);
    if (v.avgLine) { const a = values.filter(x => x != null); if (a.length) out.push([a.reduce((p, q) => p + q, 0) / a.length, 'Average ' + c.f(a.reduce((p, q) => p + q, 0) / a.length), 'sv-avg']); }
    for (const [val, lab, cls] of out) {
      if (horizontal) { const x = G.Xv(val); c.add(`<line x1="${x}" x2="${x}" y1="${G.T}" y2="${G.T + G.ph}" class="${cls}"/><text x="${x + 3}" y="${G.T + 10}" class="sv-reflab ${cls}">${h(lab)}</text>`); }
      else { const y = G.Y(val); c.add(`<line x1="${G.L}" x2="${G.L + G.pw}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="${cls}"/><text x="${G.L + G.pw - 2}" y="${(y - 4).toFixed(1)}" class="sv-reflab ${cls}" text-anchor="end">${h(lab)}</text>`); }
    }
    return out.map(o => o[0]);
  },
  extraMax(c) { const v = c.vis; return v.target != null && v.target !== '' && isFinite(+v.target) ? +v.target : -Infinity; },
  /* crosshair for line charts: one invisible column per X with every series in its tooltip */
  cross(c, G, a, lines) {
    const { vis } = c; let s = '';
    a.labels.forEach((l, i) => { const rows = (lines || a.series).map((sr, si) => [sr.color || c.P[sr.ci != null ? sr.ci : si % c.P.length], sr.name, sr.values[i] == null ? (sr.counts && sr.counts[i] ? '<5' : '–') : c.f(sr.values[i])]);
      s += `<rect x="${(G.X(i) - G.step / 2).toFixed(1)}" y="${G.T}" width="${G.step.toFixed(1)}" height="${G.ph}" fill="transparent" class="sv-col" data-gx="${G.X(i).toFixed(1)}"${c.tip(SC.long(l, a.grain), rows, a.series[0] && a.series[0].counts ? `${(a.series.reduce((t, sr) => t + (sr.counts[i] || 0), 0)).toLocaleString()} rows` : '')}${c.pick(l)}/>`; });
    c.add(s); void vis;
  },
  path(pts, mode) {
    const p = pts.filter(Boolean); if (!p.length) return '';
    if (mode === 'step') return p.map((q, i) => i ? `H${q[0].toFixed(1)}V${q[1].toFixed(1)}` : `M${q[0].toFixed(1)},${q[1].toFixed(1)}`).join('');
    if (mode === 'smooth' && p.length > 2) { let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`; for (let i = 0; i < p.length - 1; i++) { const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2; const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]; d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`; } return d; }
    return p.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join('');
  },
  /* the current period is not finished: leave it out of trend maths (returns its label, or '') */
  dropPartial(a) {
    if (!a.grain || !a.labels.length) return ''; const cur = SD.bucket(U.todayStr(), a.grain); if (a.labels[a.labels.length - 1] !== cur) return '';
    a.labels = a.labels.slice(0, -1); for (const s of a.series) { if (s.values) s.values = s.values.slice(0, -1); if (s.counts) s.counts = s.counts.slice(0, -1); } return cur;
  },
  /* compare periods: the same measure one period earlier (prev) or one year earlier (yoy), on the same labels */
  prevSeries(c, a) {
    const v = c.vis; if (!v.cmp || !a.grain) return null; const rows = c.ctx.allRows || c.rows; const g = a.grain; const yoy = v.cmp === 'yoy' || g === 'year';
    const shift = d => { const s = String(d).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''; if (yoy) return (+s.slice(0, 4) + 1) + s.slice(4); if (g === 'month') { let y = +s.slice(0, 4), m = +s.slice(5, 7) + 1; if (m > 12) { m = 1; y++; } return `${y}-${U.pad(m)}-01`; } return U.addDays(s, g === 'week' ? 7 : 1); };
    const want = new Set(a.labels); const grp = new Map(); for (const r of rows) { const d = r[v.x]; if (!d) continue; const k = SD.bucket(shift(d), g); if (!want.has(k)) continue; let x = grp.get(k); if (!x) grp.set(k, x = []); x.push(r); }
    const vals = a.labels.map(l => { const x = grp.get(l); return !x || SD.small(c.ds, x.length) ? null : SD.calc(v.fn || 'count', x, v.field); });
    return { name: yoy ? 'Same period last year' : 'Previous period', values: vals };
  },
  seriesLegend(c, a) { if (a.all.length > 1) c.legend(a.all.map((s, i) => ({ name: s.name, color: c.P[i % c.P.length], off: !a.series.includes(s) }))); a.series.forEach(s => { s.ci = a.all.indexOf(s); }); },
  /* ---------- PNG ---------- */
  SVG_CSS: '.sv-ax{font:11px Segoe UI,Arial;fill:#5b6b78}.sv-val{font:11px Segoe UI,Arial;fill:#24323d}.sv-in{font:600 11px Segoe UI,Arial;fill:#fff;text-anchor:middle}.sv-big{font:700 20px Segoe UI,Arial;fill:#12222e;text-anchor:middle}.sv-grid{stroke:#e8eef1}.sv-grid.zero{stroke:#b8c6cd}.sv-target{stroke:#c0392b;stroke-dasharray:5 4}.sv-avg{stroke:#5b6b78;stroke-dasharray:2 3}.sv-reflab{font:10.5px Segoe UI,Arial;fill:#5b6b78}.sv-guide,.sv-sel{display:none}',
  /* a picture of a chart: title on top, a footer line (sensitivity label, who, date) at the bottom */
  async pngBlob(el, title, foot) {
    const svg = el.querySelector('svg'); if (!svg) return null;
    const c = svg.cloneNode(true); c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); c.classList.remove('sv-anim'); const st = document.createElementNS('http://www.w3.org/2000/svg', 'style'); st.textContent = SC.SVG_CSS; c.insertBefore(st, c.firstChild);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(c)], { type: 'image/svg+xml' })); const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const w = svg.width.baseVal.value, hh = svg.height.baseVal.value; const tt = 30, ft = foot ? 22 : 0; const cv = document.createElement('canvas'); cv.width = w * 2; cv.height = (hh + tt + ft) * 2; const g = cv.getContext('2d'); g.scale(2, 2);
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh + tt + ft); g.fillStyle = '#12222e'; g.font = '600 14px Segoe UI, Arial'; g.fillText(title || '', 8, 20); g.drawImage(img, 0, tt); URL.revokeObjectURL(url);
    if (foot) { g.fillStyle = '#7a8a96'; g.font = '11px Segoe UI, Arial'; g.fillText(foot, 8, hh + tt + 15); }
    return new Promise(res => cv.toBlob(res, 'image/png'));
  },
  async png(el, title, foot) {
    const b = await SC.pngBlob(el, title, foot); if (!b) { UI.toast('This card is a table or text — use ⬇ Excel instead', 'warn'); return; }
    XL.download(b, `${(title || 'chart').replace(/[\\/:*?"<>|]/g, ' ')}.png`);
  },
  /* ---------- small helpers for the specialised charts ---------- */
  numsBy(rows, key, field, grain, top) {   // label → [numbers]
    const m = new Map(); for (const r of rows) { const v = r[field]; if (typeof v !== 'number' || !isFinite(v)) continue; const k = key ? SD.bucket(r[key], grain) : 'All'; if (k === '(blank)') continue; let a = m.get(k); if (!a) m.set(k, a = []); a.push(v); }
    let ks = [...m.keys()]; ks.sort((a, b) => m.get(b).length - m.get(a).length); if (top) ks = ks.slice(0, top); return ks.map(k => ({ name: k, vals: m.get(k) }));
  },
  q(sorted, p) { if (!sorted.length) return null; const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); },
  counts(rows, key, grain) { const m = new Map(); for (const r of rows) { const k = SD.bucket(r[key], grain); if (k === '(blank)') continue; m.set(k, (m.get(k) || 0) + 1); } return m; },
  arc(cx, cy, r0, r1, a0, a1) {
    const P = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`; const big = a1 - a0 > Math.PI ? 1 : 0;
    if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
    return r0 > 0 ? `M${P(r1, a0)}A${r1},${r1} 0 ${big} 1 ${P(r1, a1)}L${P(r0, a1)}A${r0},${r0} 0 ${big} 0 ${P(r0, a0)}Z` : `M${cx},${cy}L${P(r1, a0)}A${r1},${r1} 0 ${big} 1 ${P(r1, a1)}Z`;
  },
};

/* ============================ NUMBERS ============================ */
SC.R.kpi = c => {
  const a = SC.guard(SD.aggregate(c.ds, c.rows, Object.assign({}, c.vis, { type: 'kpi' })), Object.assign({}, c.vis, { type: 'kpi' }), c.ds); const v = a.series[0].values[0];
  const tgt = c.vis.target != null && c.vis.target !== '' && isFinite(+c.vis.target) ? +c.vis.target : null;
  const good = tgt != null && typeof v === 'number' ? (c.vis.lowerBetter ? v <= tgt : v >= tgt) : null;
  c.html(`<div class="sv-kpi"${c.tip(a.series[0].name, [[null, 'Value', a.hidden ? '<5' : typeof v === 'string' ? v : c.f(v)], [null, 'Rows', a.n.toLocaleString()]], tgt != null ? 'Target ' + c.f(tgt) : '')}><div class="sv-kpi-v ${good === true ? 'ok' : good === false ? 'bad' : ''}">${a.hidden ? '&lt;5' : typeof v === 'string' ? h(v) : h(v != null && Math.abs(v) < 1e7 && Number.isInteger(v) && (c.vis.fmt || 'auto') === 'auto' ? v.toLocaleString() : c.f(v))}</div><div class="sv-kpi-s">${h(a.series[0].name)}${c.vis.fn !== 'count' ? ` · ${a.n.toLocaleString()} rows` : ''}${tgt != null ? ` · target ${h(c.f(tgt))} ${good ? '✓' : '✗'}` : ''}</div></div>`);
};
SC.R.kpitrend = c => {
  const a = c.agg({ grain: c.vis.grain || 'month', sort: 'label', split: '', noZoom: true }); const part = SC.dropPartial(a); const s = a.series[0]; if (!a.labels.length) return c.empty();
  const vals = s.values; const n = vals.length; const cur = vals[n - 1], prev = n > 1 ? vals[n - 2] : null; const ch = prev ? (cur - prev) / Math.abs(prev) : null;
  const w = c.W, hh = Math.max(36, c.H - 74); const mx = Math.max(1e-9, ...vals.map(v => v || 0)), mn = Math.min(0, ...vals.map(v => v || 0));
  const pts = vals.map((v, i) => v == null ? null : [4 + (i * (w - 8)) / Math.max(1, n - 1), 4 + (hh - 8) * (1 - ((v - mn) / ((mx - mn) || 1)))]);
  const up = ch != null && ch > 0; const goodUp = !c.vis.lowerBetter;
  c.html(`<div class="sv-kt"><div class="sv-kpi-v">${h(cur == null ? '<5' : c.f(cur))}</div><div class="sv-kpi-s">${h(SC.long(a.labels[n - 1], a.grain))}${part ? ' (last full)' : ''}${ch != null ? ` · <b class="${up === goodUp ? 't-good' : 't-bad'}">${up ? '▲' : '▼'} ${Math.abs(Math.round(ch * 100))}%</b> vs ${h(SC.short(a.labels[n - 2], a.grain))}` : ''}</div>
    <svg width="${w}" height="${hh}" class="sv"><path d="${SC.path(pts)}L${(w - 4).toFixed(1)},${hh}L4,${hh}Z" fill="${c.P[0]}" fill-opacity=".12"/><path d="${SC.path(pts)}" fill="none" stroke="${c.P[0]}" stroke-width="2"/>${pts.map((p, i) => p ? `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === n - 1 ? 4 : 6}" fill="${i === n - 1 ? c.P[0] : 'transparent'}" class="sv-hit"${c.tip(SC.long(a.labels[i], a.grain), [[c.P[0], s.name, c.f(vals[i])]])}${c.pick(a.labels[i])}/>` : '').join('')}</svg></div>`);
};
SC.R.gauge = c => {
  const a = SC.guard(SD.aggregate(c.ds, c.rows, Object.assign({}, c.vis, { type: 'kpi' })), Object.assign({}, c.vis, { type: 'kpi' }), c.ds); const v = a.series[0].values[0];
  if (typeof v !== 'number') return c.html(`<div class="sv-kpi"><div class="sv-kpi-v">${a.hidden ? '&lt;5' : h(v || '–')}</div></div>`);
  const tgt = isFinite(+c.vis.target) && c.vis.target !== '' && c.vis.target != null ? +c.vis.target : null; const max = c.vis.gmax ? +c.vis.gmax : SC.nice(0, Math.max(v, tgt || 0) * 1.15).max;
  const W = c.W, H = c.H; const cx = W / 2, R = Math.min(W / 2 - 16, H - 40), cy = R + 14, r0 = R * 0.7; const ang = x => Math.PI + Math.PI * Math.max(0, Math.min(1, x / max));
  c.add(`<path d="${SC.arc(cx, cy, r0, R, Math.PI, 2 * Math.PI)}" fill="#e8eef1"/><path d="${SC.arc(cx, cy, r0, R, Math.PI, ang(v))}" fill="${tgt != null ? ((c.vis.lowerBetter ? v <= tgt : v >= tgt) ? '#2f9e5b' : '#c0436a') : c.P[0]}" class="sv-hit"${c.tip(a.series[0].name, [[null, 'Value', c.f(v)], ...(tgt != null ? [[null, 'Target', c.f(tgt)]] : []), [null, 'Scale', '0 – ' + c.f(max)]])}/>`);
  if (tgt != null) { const t = ang(tgt); c.add(`<line x1="${(cx + (r0 - 6) * Math.cos(t)).toFixed(1)}" y1="${(cy + (r0 - 6) * Math.sin(t)).toFixed(1)}" x2="${(cx + (R + 6) * Math.cos(t)).toFixed(1)}" y2="${(cy + (R + 6) * Math.sin(t)).toFixed(1)}" stroke="#12222e" stroke-width="2.5"/>`); }
  c.add(`<text x="${cx}" y="${cy - 6}" class="sv-big" style="font-size:${Math.max(16, R / 3.2)}px">${h(c.f(v))}</text><text x="${cx - R + (R - r0) / 2}" y="${cy + 14}" class="sv-ax" text-anchor="middle">0</text><text x="${cx + R - (R - r0) / 2}" y="${cy + 14}" class="sv-ax" text-anchor="middle">${h(c.f(max))}</text>`);
};
SC.R.bullet = c => {
  const a = c.agg({ split: '', other: false }); if (!a.labels.length) return c.empty(); const s = a.series[0]; const tgt = isFinite(+c.vis.target) && c.vis.target !== '' && c.vis.target != null ? +c.vis.target : null;
  const mx = SC.nice(0, Math.max(...s.values.map(v => v || 0), tgt || 0) * 1.1).max; const Lw = Math.min(170, Math.max(60, Math.max(...a.labels.map(l => String(l).length)) * 6.6)); const R = 50; const rh = (c.H - 16) / a.labels.length; const Xv = v => Lw + (v / mx) * (c.W - Lw - R);
  a.labels.forEach((l, i) => { const y = 4 + i * rh; const bh = Math.min(26, rh * 0.7); const v = s.values[i];
    c.add(`<text x="${Lw - 6}" y="${(y + rh / 2 + 4).toFixed(1)}" class="sv-ax" text-anchor="end">${h(SC.short(l, a.grain))}</text>`);
    if (tgt != null) [[tgt * 1.2, '#eef2f4'], [tgt, '#e2e8ec'], [tgt * 0.75, '#d5dee3']].forEach(([b, col]) => c.add(`<rect x="${Lw}" y="${(y + rh / 2 - bh / 2).toFixed(1)}" width="${Math.max(0, Xv(Math.min(b, mx)) - Lw).toFixed(1)}" height="${bh.toFixed(1)}" fill="${col}"/>`));
    c.add(`<rect x="${Lw}" y="${(y + rh / 2 - bh / 4).toFixed(1)}" width="${Math.max(0, Xv(v || 0) - Lw).toFixed(1)}" height="${(bh / 2).toFixed(1)}" fill="${tgt != null && v != null ? ((c.vis.lowerBetter ? v <= tgt : v >= tgt) ? '#2f9e5b' : c.P[0]) : c.P[0]}" class="sv-hit sv-hb"${c.tip(SC.long(l, a.grain), [[c.P[0], s.name, v == null ? '<5' : c.f(v)], ...(tgt != null ? [[null, 'Target', c.f(tgt)]] : [])], `${s.counts[i].toLocaleString()} rows`)}${c.pick(l)}/>`);
    if (tgt != null) c.add(`<line x1="${Xv(tgt)}" x2="${Xv(tgt)}" y1="${(y + rh / 2 - bh / 2).toFixed(1)}" y2="${(y + rh / 2 + bh / 2).toFixed(1)}" stroke="#12222e" stroke-width="2.5"/>`);
    c.add(`<text x="${(Xv(v || 0) + 5).toFixed(1)}" y="${(y + rh / 2 + 4).toFixed(1)}" class="sv-val">${h(v == null ? '<5' : c.f(v))}</text>`); });
};

/* ============================ BARS ============================ */
/* vertical columns: plain, grouped, stacked, 100% */
SC.cols = (c, mode) => {
  const a = c.agg(); if (!a.labels.length) return c.empty(); SC.seriesLegend(c, a);
  const stack = mode === 'stacked' || mode === 'pct'; const pct = mode === 'pct';
  const prev = !stack && a.series.length === 1 ? SC.prevSeries(c, a) : null; if (prev) c.legend([{ name: a.series[0].name, color: c.P[0] }, { name: prev.name + ' (mark)', color: '#12222e' }], false);
  const anom = c.vis.anom && a.series.length === 1 ? SC.anomFull(a, a.series[0].values) : new Set();
  const tot = a.labels.map((_, i) => a.series.reduce((t, s) => t + (s.values[i] || 0), 0));
  const vals = a.series.map(s => s.values.map((v, i) => pct ? (tot[i] ? (v || 0) / tot[i] : 0) : v));
  const tops = a.labels.map((_, i) => stack ? vals.reduce((t, v) => t + Math.max(0, v[i] || 0), 0) : Math.max(...vals.map(v => v[i] || 0)));
  const lows = a.labels.map((_, i) => Math.min(0, ...vals.map(v => v[i] || 0)));
  const G = SC.frame(c, { labels: a.labels, vmin: Math.min(...lows), vmax: pct ? 1 : Math.max(...tops, SC.extraMax(c), prev ? Math.max(...prev.values.map(x => x || 0)) : 0), grain: a.grain, fmtY: pct ? (v => Math.round(v * 100) + '%') : null });
  c.zoomable = !!a.grain && a.labels.length > 6;
  const n = stack ? 1 : a.series.length; const bw = Math.max(1, (G.step * 0.76) / n);
  a.labels.forEach((l, i) => { let base = 0;
    a.series.forEach((s, si) => { const v = vals[si][i]; const raw = s.values[i]; const x = G.X(i) - (G.step * 0.76) / 2 + (stack ? 0 : si * bw); const top = stack ? base + (v || 0) : (v || 0); const y0 = G.Y(Math.max(top, stack ? base : 0)), y1 = G.Y(Math.min(top, stack ? base : 0)); if (stack) base += v || 0;
      const col = stack ? c.P[(s.ci != null ? s.ci : si) % c.P.length] : c.rule(raw, c.P[(s.ci != null ? s.ci : si) % c.P.length]);
      const pv = prev ? prev.values[i] : null;
      c.add(`<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${Math.max(1, bw - (n > 1 ? 1.5 : 0)).toFixed(1)}" height="${Math.max(0, y1 - y0).toFixed(1)}" rx="${stack ? 0 : 3}" fill="${col}" class="sv-hit sv-vb"${c.tip(SC.long(l, a.grain), [[col, a.series.length > 1 || a.all.length > 1 ? s.name : SD.measureName(c.vis, c.ds), raw == null ? '<5' : c.f(raw)], ...(stack ? [[null, 'Share of column', tot[i] ? Math.round(((raw || 0) / tot[i]) * 100) + '%' : '–']] : []), ...(prev ? [['#12222e', prev.name, pv == null ? '–' : c.f(pv)], [null, 'Change', pv && raw != null ? `${raw >= pv ? '+' : ''}${Math.round(((raw - pv) / Math.abs(pv)) * 100)}%` : '–']] : [])], `${(s.counts[i] || 0).toLocaleString()} rows${anom.has(i) ? ' · ⚠ unusual' : ''}`)}${c.pick(l)}/>`);
      if (prev && pv != null) c.add(`<line x1="${(x - 2).toFixed(1)}" x2="${(x + bw + 2).toFixed(1)}" y1="${G.Y(pv).toFixed(1)}" y2="${G.Y(pv).toFixed(1)}" stroke="#12222e" stroke-width="2.5"/>`);
      if (anom.has(i)) c.add(`<text x="${(x + bw / 2).toFixed(1)}" y="${(y0 - (c.vis.labels ? 16 : 4)).toFixed(1)}" text-anchor="middle" style="font-size:12px;fill:#c0392b">⚠</text>`);
      if (c.vis.labels && v && (y1 - y0 > 14 || !stack)) c.add(stack ? `<text x="${(x + bw / 2).toFixed(1)}" y="${((y0 + y1) / 2 + 4).toFixed(1)}" class="sv-in">${h(pct ? Math.round(v * 100) + '%' : c.f(raw))}</text>` : `<text x="${(x + bw / 2).toFixed(1)}" y="${(y0 - 4).toFixed(1)}" class="sv-val" text-anchor="middle">${h(c.f(raw))}</text>`); });
    if (stack && c.vis.labels && !pct) c.add(`<text x="${G.X(i).toFixed(1)}" y="${(G.Y(tot[i]) - 4).toFixed(1)}" class="sv-val" text-anchor="middle">${h(c.f(tot[i]))}</text>`); });
  if (!pct) SC.refLines(c, G, stack ? tot : a.series.flatMap(s => s.values));
};
SC.R.bar = c => SC.cols(c, 'grouped');
SC.R.grouped = c => SC.cols(c, 'grouped');
SC.R.stacked = c => SC.cols(c, 'stacked');
SC.R.pct = c => SC.cols(c, 'pct');
/* horizontal bars: plain, stacked, lollipop, dot */
SC.hbars = (c, mode) => {
  const a = c.agg(); if (!a.labels.length) return c.empty(); SC.seriesLegend(c, a); const lh = c.legendItems ? 28 : 0;
  const stack = mode === 'stacked'; const tot = a.labels.map((_, i) => a.series.reduce((t, s) => t + (s.values[i] || 0), 0));
  const mx = Math.max(1e-9, ...(stack ? tot : a.series.flatMap(s => s.values.map(v => v || 0))), SC.extraMax(c)); const xk = SC.nice(0, mx, Math.max(2, Math.min(6, Math.floor((c.W - 200) / 70))));
  const Lw = Math.min(180, Math.max(60, Math.max(...a.labels.map(l => SC.short(l, a.grain).length)) * 6.6)); const R = c.vis.labels || a.series.length === 1 ? 52 : 14; const T = 4, B = 20; const pw = c.W - Lw - R, ph = c.H - lh - T - B; const rh = ph / a.labels.length;
  const Xv = v => Lw + (v / xk.max) * pw; const G = { L: Lw, T, pw, ph, Xv };
  for (const t of xk.ticks) c.add(`<line x1="${Xv(t).toFixed(1)}" x2="${Xv(t).toFixed(1)}" y1="${T}" y2="${T + ph}" class="sv-grid"/><text x="${Xv(t).toFixed(1)}" y="${T + ph + 14}" class="sv-ax" text-anchor="middle">${h(c.f(t))}</text>`);
  const n = stack ? 1 : a.series.length;
  a.labels.forEach((l, i) => { const y = T + i * rh; let base = 0; c.add(`<text x="${Lw - 6}" y="${(y + rh / 2 + 4).toFixed(1)}" class="sv-ax" text-anchor="end">${h(SC.short(l, a.grain))}</text>`);
    a.series.forEach((s, si) => { const v = s.values[i]; const bh = Math.min(28, (rh * 0.72) / n); const yy = y + (rh - bh * n) / 2 + (stack ? 0 : si * bh); const x0 = Xv(stack ? base : 0), x1 = Xv((stack ? base : 0) + (v || 0)); if (stack) base += v || 0; const col = stack ? c.P[(s.ci != null ? s.ci : si) % c.P.length] : c.rule(v, c.P[(s.ci != null ? s.ci : si) % c.P.length]);
      const tip = c.tip(SC.long(l, a.grain), [[col, a.all.length > 1 ? s.name : SD.measureName(c.vis, c.ds), v == null ? '<5' : c.f(v)], ...(a.all.length === 1 && c.vis.fn === 'count' ? [[null, 'Share', Math.round(((v || 0) / (a.n || 1)) * 100) + '%']] : [])], `${(s.counts[i] || 0).toLocaleString()} rows`) + c.pick(l);
      if (mode === 'lollipop') c.add(`<line x1="${Lw}" x2="${x1.toFixed(1)}" y1="${(yy + bh / 2).toFixed(1)}" y2="${(yy + bh / 2).toFixed(1)}" stroke="${col}" stroke-width="2"/><circle cx="${x1.toFixed(1)}" cy="${(yy + bh / 2).toFixed(1)}" r="${Math.min(7, bh / 2 + 1).toFixed(1)}" fill="${col}" class="sv-hit"${tip}/>`);
      else if (mode === 'dot') { if (si === 0) c.add(`<line x1="${Lw}" x2="${Lw + pw}" y1="${(y + rh / 2).toFixed(1)}" y2="${(y + rh / 2).toFixed(1)}" class="sv-grid"/>`); c.add(`<circle cx="${x1.toFixed(1)}" cy="${(y + rh / 2).toFixed(1)}" r="6" fill="${col}" stroke="#fff" stroke-width="1.5" class="sv-hit"${tip}/>`); }
      else c.add(`<rect x="${x0.toFixed(1)}" y="${yy.toFixed(1)}" width="${Math.max(0, x1 - x0).toFixed(1)}" height="${Math.max(1, bh - (n > 1 ? 1 : 0)).toFixed(1)}" rx="${stack ? 0 : 3}" fill="${col}" class="sv-hit sv-hb"${tip}/>`);
      if ((c.vis.labels || (a.series.length === 1 && mode !== 'dot')) && !stack) c.add(`<text x="${(x1 + (mode === 'lollipop' ? 10 : 5)).toFixed(1)}" y="${(yy + bh / 2 + 4).toFixed(1)}" class="sv-val">${h(v == null ? '<5' : c.f(v))}</text>`); });
    if (stack && c.vis.labels) c.add(`<text x="${(Xv(tot[i]) + 5).toFixed(1)}" y="${(y + rh / 2 + 4).toFixed(1)}" class="sv-val">${h(c.f(tot[i]))}</text>`); });
  SC.refLines(c, G, stack ? tot : a.series.flatMap(s => s.values), true);
};
SC.R.hbar = c => SC.hbars(c, 'bars');
SC.R.hstacked = c => SC.hbars(c, 'stacked');
SC.R.lollipop = c => SC.hbars(c, 'lollipop');
SC.R.dot = c => SC.hbars(c, 'dot');
SC.R.dumbbell = c => {
  const a = c.agg({ other: false }); if (!a.labels.length || a.all.length < 2) return c.empty('Pick a "Split by" column with at least two values — the first two are compared.');
  const [s1, s2] = a.all; c.legend([{ name: s1.name, color: c.P[0] }, { name: s2.name, color: c.P[1] }], false); const lh = 28;
  const mx = Math.max(1e-9, ...s1.values.map(v => v || 0), ...s2.values.map(v => v || 0)); const xk = SC.nice(0, mx, Math.max(2, Math.min(6, Math.floor((c.W - 200) / 70)))); const Lw = Math.min(180, Math.max(60, Math.max(...a.labels.map(l => String(l).length)) * 6.6)); const T = 4, B = 20, R = 16; const pw = c.W - Lw - R, ph = c.H - lh - T - B, rh = ph / a.labels.length; const Xv = v => Lw + (v / xk.max) * pw;
  for (const t of xk.ticks) c.add(`<line x1="${Xv(t)}" x2="${Xv(t)}" y1="${T}" y2="${T + ph}" class="sv-grid"/><text x="${Xv(t)}" y="${T + ph + 14}" class="sv-ax" text-anchor="middle">${h(c.f(t))}</text>`);
  a.labels.forEach((l, i) => { const y = T + i * rh + rh / 2; const v1 = s1.values[i], v2 = s2.values[i]; const tip = c.tip(SC.long(l, a.grain), [[c.P[0], s1.name, v1 == null ? '<5' : c.f(v1)], [c.P[1], s2.name, v2 == null ? '<5' : c.f(v2)], [null, 'Difference', v1 != null && v2 != null ? c.f(v2 - v1) : '–']]) + c.pick(l);
    c.add(`<text x="${Lw - 6}" y="${y + 4}" class="sv-ax" text-anchor="end">${h(SC.short(l, a.grain))}</text><line x1="${Xv(v1 || 0)}" x2="${Xv(v2 || 0)}" y1="${y}" y2="${y}" stroke="#b8c6cd" stroke-width="3"/><circle cx="${Xv(v1 || 0)}" cy="${y}" r="6" fill="${c.P[0]}" class="sv-hit"${tip}/><circle cx="${Xv(v2 || 0)}" cy="${y}" r="6" fill="${c.P[1]}" class="sv-hit"${tip}/>`); });
};
SC.R.diverging = c => {
  const a = c.agg({ split: '', other: false }); if (!a.labels.length) return c.empty(); const s = a.series[0]; const ok = s.values.filter(v => v != null); const avg = ok.reduce((p, q) => p + q, 0) / (ok.length || 1);
  const d = s.values.map(v => v == null ? null : v - avg); const mx = Math.max(1e-9, ...d.map(v => Math.abs(v || 0))); const Lw = Math.min(180, Math.max(60, Math.max(...a.labels.map(l => String(l).length)) * 6.6)); const T = 18, B = 6, R = 50; const pw = c.W - Lw - R, ph = c.H - T - B, rh = ph / a.labels.length; const X0 = Lw + pw / 2; const Xv = v => X0 + (v / mx) * (pw / 2);
  c.add(`<text x="${X0}" y="12" class="sv-ax" text-anchor="middle">average ${h(c.f(avg))}</text><line x1="${X0}" x2="${X0}" y1="${T}" y2="${T + ph}" class="sv-grid zero"/>`);
  a.labels.forEach((l, i) => { const y = T + i * rh; const v = d[i]; const bh = Math.min(24, rh * 0.7); const col = v >= 0 ? (c.vis.lowerBetter ? '#c0436a' : c.P[0]) : (c.vis.lowerBetter ? c.P[0] : '#c0436a');
    c.add(`<text x="${Lw - 6}" y="${(y + rh / 2 + 4).toFixed(1)}" class="sv-ax" text-anchor="end">${h(SC.short(l, a.grain))}</text><rect x="${Math.min(X0, Xv(v || 0)).toFixed(1)}" y="${(y + (rh - bh) / 2).toFixed(1)}" width="${Math.abs(Xv(v || 0) - X0).toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${col}" class="sv-hit"${c.tip(SC.long(l, a.grain), [[col, SD.measureName(c.vis, c.ds), s.values[i] == null ? '<5' : c.f(s.values[i])], [null, 'vs average', v == null ? '–' : (v > 0 ? '+' : '') + c.f(v)]], `${s.counts[i].toLocaleString()} rows`)}${c.pick(l)}/><text x="${(v >= 0 ? Xv(v || 0) + 4 : Xv(v || 0) - 4).toFixed(1)}" y="${(y + rh / 2 + 4).toFixed(1)}" class="sv-val" text-anchor="${v >= 0 ? 'start' : 'end'}">${h(v == null ? '<5' : (v > 0 ? '+' : '') + c.f(v))}</text>`); });
};
SC.R.radialbar = c => {
  const a = c.agg({ split: '', other: false, top: Math.min(+c.vis.top || 8, Math.max(2, Math.floor((Math.min(c.W * 0.4, c.H / 2 - 6) * 0.75) / 14))) }); if (!a.labels.length) return c.empty(); const s = a.series[0]; const mx = Math.max(1e-9, ...s.values.map(v => v || 0));
  const cx = c.W * 0.5, cy = c.H / 2, R = Math.min(c.W * 0.4, c.H / 2 - 6); const n = a.labels.length; const ring = (R * 0.75) / n;
  a.labels.forEach((l, i) => { const r1 = R - i * ring, r0 = r1 - ring * 0.72; const v = s.values[i] || 0; const a1 = -Math.PI / 2 + (Math.PI * 1.5) * (v / mx); const col = c.P[i % c.P.length];
    c.add(`<path d="${SC.arc(cx, cy, r0, r1, -Math.PI / 2, Math.PI)}" fill="#eef2f4"/><path d="${SC.arc(cx, cy, r0, r1, -Math.PI / 2, Math.max(-Math.PI / 2 + 0.01, a1))}" fill="${col}" class="sv-hit"${c.tip(SC.long(l, a.grain), [[col, SD.measureName(c.vis, c.ds), s.values[i] == null ? '<5' : c.f(s.values[i])]], `${s.counts[i].toLocaleString()} rows`)}${c.pick(l)}/><text x="${cx - 6}" y="${(cy - (r0 + r1) / 2 + 4).toFixed(1)}" class="sv-ax" text-anchor="end">${h(SC.short(l, a.grain))} · ${h(s.values[i] == null ? '<5' : c.f(s.values[i]))}</text>`); });
};

/* ============================ ANALYSIS ============================ */
SC.R.pareto = c => {
  const a = c.agg({ split: '', sort: 'value', other: false }); if (!a.labels.length) return c.empty(); const s = a.series[0]; const tot = s.values.reduce((t, v) => t + (v || 0), 0) || 1;
  let run = 0; const cum = s.values.map(v => (run += v || 0) / tot);
  c.legend([{ name: SD.measureName(c.vis, c.ds), color: c.P[0] }, { name: 'Cumulative %', color: c.P[1] }], false);
  const G = SC.frame(c, { labels: a.labels, vmax: Math.max(...s.values.map(v => v || 0)), right: { min: 0, max: 1, fmt: v => Math.round(v * 100) + '%' } });
  const bw = G.step * 0.7; const cut = cum.findIndex(x => x >= 0.8);
  a.labels.forEach((l, i) => { const v = s.values[i] || 0; c.add(`<rect x="${(G.X(i) - bw / 2).toFixed(1)}" y="${G.Y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(G.Y(0) - G.Y(v)).toFixed(1)}" rx="3" fill="${i <= cut ? c.P[0] : '#b8c6cd'}" class="sv-hit sv-vb"${c.tip(SC.long(l, a.grain), [[c.P[0], SD.measureName(c.vis, c.ds), s.values[i] == null ? '<5' : c.f(v)], [null, 'Share', Math.round((v / tot) * 100) + '%'], [null, 'Cumulative', Math.round(cum[i] * 100) + '%']], i <= cut ? 'part of the top 80%' : '')}${c.pick(l)}/>`); });
  const pts = cum.map((v, i) => [G.X(i), G.Y2(v)]); c.add(`<line x1="${G.L}" x2="${G.L + G.pw}" y1="${G.Y2(0.8)}" y2="${G.Y2(0.8)}" class="sv-target"/><text x="${G.L + G.pw - 2}" y="${G.Y2(0.8) - 4}" class="sv-reflab" text-anchor="end">80%</text><path d="${SC.path(pts)}" fill="none" stroke="${c.P[1]}" stroke-width="2"/>${pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${c.P[1]}"/>`).join('')}`);
};
SC.R.waterfall = c => {
  const a = c.agg({ split: '' }); if (!a.labels.length) return c.empty(); const s = a.series[0]; const tot = s.values.reduce((t, v) => t + (v || 0), 0);
  const labels = [...a.labels, 'Total']; let run = 0; const steps = s.values.map(v => { const b = run; run += v || 0; return [b, run]; }); steps.push([0, tot]);
  const G = SC.frame(c, { labels, vmin: Math.min(0, ...steps.flat()), vmax: Math.max(...steps.flat()), grain: a.grain }); const bw = G.step * 0.66;
  steps.forEach(([b, e], i) => { const last = i === steps.length - 1; const col = last ? '#0e4a6b' : e >= b ? c.P[0] : '#c0436a'; const y0 = G.Y(Math.max(b, e)), y1 = G.Y(Math.min(b, e)); const v = last ? tot : s.values[i];
    c.add(`<rect x="${(G.X(i) - bw / 2).toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, y1 - y0).toFixed(1)}" rx="2" fill="${col}" class="sv-hit"${c.tip(last ? 'Total' : SC.long(labels[i], a.grain), [[col, last ? 'Total' : 'This step', v == null ? '<5' : c.f(v)], [null, 'Running total', c.f(e)]])}${last ? '' : c.pick(labels[i])}/>${i < steps.length - 1 ? `<line x1="${(G.X(i) + bw / 2).toFixed(1)}" x2="${(G.X(i + 1) - bw / 2).toFixed(1)}" y1="${G.Y(e).toFixed(1)}" y2="${G.Y(e).toFixed(1)}" stroke="#94a3b8" stroke-dasharray="2 2"/>` : ''}${c.vis.labels ? `<text x="${G.X(i).toFixed(1)}" y="${(y0 - 4).toFixed(1)}" class="sv-val" text-anchor="middle">${h(c.f(v))}</text>` : ''}`); });
};

/* ============================ TRENDS ============================ */
SC.lines = (c, mode) => {
  const vis = c.vis; const a = c.agg({ sort: vis.x && (Studio.col(vis.x) || {}).type === 'date' ? 'label' : vis.sort }); if (!a.labels.length) return c.empty(); SC.seriesLegend(c, a);
  const stack = mode === 'stackarea' || mode === 'pctarea'; const pct = mode === 'pctarea';
  const tot = a.labels.map((_, i) => a.series.reduce((t, s) => t + (s.values[i] || 0), 0));
  const vals = a.series.map(s => s.values.map((v, i) => pct ? (tot[i] ? (v || 0) / tot[i] : 0) : v));
  const prev = !stack && a.series.length === 1 ? SC.prevSeries(c, a) : null;
  if (prev) c.legend([{ name: a.series[0].name, color: c.P[0] }, { name: prev.name, color: '#94a3b8' }], false);
  const vmax = Math.max(stack ? Math.max(...a.labels.map((_, i) => vals.reduce((t, v) => t + (v[i] || 0), 0))) : Math.max(...vals.flatMap(v => v.map(x => x || 0))), prev ? Math.max(...prev.values.map(x => x || 0)) : 0);
  const G = SC.frame(c, { labels: a.labels, vmax: pct ? 1 : Math.max(vmax, SC.extraMax(c)), vmin: Math.min(0, ...vals.flatMap(v => v.map(x => x || 0))), grain: a.grain, guide: true, fmtY: pct ? (v => Math.round(v * 100) + '%') : null });
  c.zoomable = a.labels.length > 6;
  const curve = mode === 'smooth' ? 'smooth' : mode === 'step' ? 'step' : 'line'; const cum = a.labels.map(() => 0);
  a.series.forEach((s, si) => { const col = c.P[(s.ci != null ? s.ci : si) % c.P.length];
    const top = vals[si].map((v, i) => { if (v == null && !stack) return null; const b = stack ? cum[i] : 0; const t = b + (v || 0); return [G.X(i), G.Y(t), G.Y(b)]; });
    if (stack) vals[si].forEach((v, i) => { cum[i] += v || 0; });
    if (mode === 'area' || stack) { const p = top.filter(Boolean); if (p.length > 1) c.add(`<path d="${SC.path(p.map(q => [q[0], q[1]]), curve)}L${p.slice().reverse().map(q => `${q[0].toFixed(1)},${q[2].toFixed(1)}`).join('L')}Z" fill="${col}" fill-opacity="${stack ? 0.75 : 0.15}" class="sv-area"/>`); }
    if (!stack || true) c.add(`<path d="${SC.path(top.map(q => q && [q[0], q[1]]), curve)}" fill="none" stroke="${stack ? '#fff' : col}" stroke-width="${stack ? 1 : 2.2}" stroke-linejoin="round" class="sv-line"/>`);
    if (!stack && a.labels.length <= 60) top.forEach((q, i) => { if (q) c.add(`<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${a.labels.length > 30 ? 2 : 3.2}" fill="#fff" stroke="${col}" stroke-width="2" class="sv-pt"/>`); });
    if (c.vis.labels && !stack) top.forEach((q, i) => { if (q && (a.labels.length <= 24 || i === top.length - 1)) c.add(`<text x="${q[0].toFixed(1)}" y="${(q[1] - 7).toFixed(1)}" class="sv-val" text-anchor="middle">${h(c.f(s.values[i]))}</text>`); }); });
  if (!pct) SC.refLines(c, G, stack ? tot : a.series.flatMap(s => s.values));
  SC.markAt(c, G, a);
  if (prev) c.add(`<path d="${SC.path(prev.values.map((v, i) => v == null ? null : [G.X(i), G.Y(v)]), curve)}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="5 4"/>`);
  if (c.vis.anom && !stack) a.series.forEach((s, si) => { for (const i of SC.anomFull(a, s.values)) c.add(`<circle cx="${G.X(i).toFixed(1)}" cy="${G.Y(s.values[i]).toFixed(1)}" r="8" fill="none" stroke="#c0392b" stroke-width="2"/>`); });
  SC.cross(c, G, a, prev ? [...a.series.map((s, si) => ({ name: s.name, values: s.values, counts: s.counts, color: c.P[(s.ci != null ? s.ci : si) % c.P.length] })), { name: prev.name, values: prev.values, color: '#94a3b8' }] : null);
  if (c.vis.anom) a.series.forEach(s => { for (const i of SC.anomFull(a, s.values)) { const t = c.tips[c.tips.length - a.labels.length + i]; if (t) t.f = (t.f ? t.f + ' · ' : '') + '⚠ unusual — far from the usual level'; } });
  if (prev) a.labels.forEach((_, i) => { const t = c.tips[c.tips.length - a.labels.length + i]; const cur = a.series[0].values[i], pv = prev.values[i]; if (t && cur != null && pv) t.r.push([null, 'Change', `${cur >= pv ? '+' : ''}${Math.round(((cur - pv) / Math.abs(pv)) * 100)}%`]); });
  const cur = a.grain ? SD.bucket(U.todayStr(), a.grain) : ''; const li = a.labels.length - 1;
  if (cur && a.labels[li] === cur && !stack) { c.add(`<text x="${G.X(li).toFixed(1)}" y="${G.T + G.ph - 4}" class="sv-reflab" text-anchor="end">so far ›</text>`); const t = c.tips[c.tips.length - 1]; if (t) t.f = (t.f ? t.f + ' · ' : '') + 'this period is not finished yet'; }
  return { a, G };
};
SC.R.line = c => SC.lines(c, 'line');
SC.R.smooth = c => SC.lines(c, 'smooth');
SC.R.step = c => SC.lines(c, 'step');
SC.R.area = c => SC.lines(c, 'area');
SC.R.stackarea = c => SC.lines(c, 'stackarea');
SC.R.pctarea = c => SC.lines(c, 'pctarea');
SC.R.combo = c => {
  const v = c.vis; const a = c.agg({ split: '', sort: 'label' }); if (!a.labels.length) return c.empty(); const s = a.series[0];
  const b = SD.aggregate(c.ds, c.rows, Object.assign({}, v, { split: '', fn: v.fn2 || 'avg', field: v.field2, sort: 'label', top: 0 })); const m2 = new Map(b.labels.map((l, i) => [l, b.series[0].values[i]])); const v2 = a.labels.map(l => m2.get(l) ?? null);
  const n2 = SD.measureName({ fn: v.fn2 || 'avg', field: v.field2 }, c.ds);
  c.legend([{ name: s.name, color: c.P[0] }, { name: n2 + ' (right axis)', color: c.P[1] }], false);
  const G = SC.frame(c, { labels: a.labels, vmax: Math.max(...s.values.map(x => x || 0)), grain: a.grain, guide: true, right: { min: Math.min(0, ...v2.map(x => x || 0)), max: Math.max(1e-9, ...v2.map(x => x || 0)) } }); c.zoomable = a.labels.length > 6; const bw = G.step * 0.62;
  a.labels.forEach((l, i) => { const x = s.values[i] || 0; c.add(`<rect x="${(G.X(i) - bw / 2).toFixed(1)}" y="${G.Y(x).toFixed(1)}" width="${bw.toFixed(1)}" height="${(G.Y(0) - G.Y(x)).toFixed(1)}" rx="3" fill="${c.P[0]}" fill-opacity=".85" class="sv-vb"/>`); });
  const pts = v2.map((x, i) => x == null ? null : [G.X(i), G.Y2(x)]); c.add(`<path d="${SC.path(pts)}" fill="none" stroke="${c.P[1]}" stroke-width="2.4"/>${pts.map(p => p ? `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="#fff" stroke="${c.P[1]}" stroke-width="2"/>` : '').join('')}`);
  SC.cross(c, G, a, [{ name: s.name, values: s.values, counts: s.counts, color: c.P[0] }, { name: n2 + ' (right)', values: v2, color: c.P[1] }]);
};
SC.R.movavg = c => {
  const w = Math.max(2, +c.vis.win || 3); c.legend([{ name: SD.measureName(c.vis, c.ds), color: c.P[0] }, { name: `${w}-period moving average`, color: c.P[1] }], false);
  const r = SC.lines(c, 'line'); if (!r) return; const { a, G } = r; const s = a.series[0];
  const ma = s.values.map((_, i) => { if (i < w - 1) return null; const sl = s.values.slice(i - w + 1, i + 1).filter(v => v != null); return sl.length ? sl.reduce((p, q) => p + q, 0) / sl.length : null; });
  c.parts.splice(c.parts.length - 1, 0, `<path d="${SC.path(ma.map((v, i) => v == null ? null : [G.X(i), G.Y(v)]), 'smooth')}" fill="none" stroke="${c.P[1]}" stroke-width="2.6" stroke-dasharray="6 3"/>`);
  c.tips.forEach((t, i) => { if (ma[i] != null && t.r) t.r.push([c.P[1], `${w}-period average`, c.f(ma[i])]); });
};
/* Holt's linear trend: level + trend, smoothed; the next 3 periods with a band (±1.96 × error) */
SC.holt = (ys, h = 3) => {
  const v = ys.map(x => x || 0); if (v.length < 3) return null; let l = v[0], b = v[1] - v[0]; const al = 0.5, be = 0.3; const err = [];
  for (let i = 1; i < v.length; i++) { const f = l + b; err.push(v[i] - f); const nl = al * v[i] + (1 - al) * (l + b); b = be * (nl - l) + (1 - be) * b; l = nl; }
  const rmse = Math.sqrt(err.reduce((p, e) => p + e * e, 0) / err.length); return Array.from({ length: h }, (_, k) => { const f = Math.max(0, l + (k + 1) * b); const d = 1.96 * rmse * Math.sqrt(k + 1); return { f, lo: Math.max(0, f - d), hi: f + d }; });
};
SC.nextLabel = (l, grain) => { const s = String(l); if (/^\d{4}-\d{2}$/.test(s)) { let [y, m] = s.split('-').map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${U.pad(m)}`; } if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return U.addDays(s, grain === 'week' ? 7 : 1); if (/^\d{4}$/.test(s)) return String(+s + 1); return '+1'; };
SC.R.forecast = c => {
  const a = c.agg({ split: '', sort: 'label' }); if (a.labels.length < 4) return c.empty('A forecast needs at least 4 periods on a date axis.'); const s = a.series[0];
  const hist = s.values.slice(); const thisP = SD.bucket(U.todayStr(), a.grain); const partial = a.labels[a.labels.length - 1] === thisP; const base = partial ? hist.slice(0, -1) : hist;
  const H = Math.max(1, Math.min(12, +c.vis.fc || 3)); const fc = SC.holt(base, H); if (!fc) return c.empty(); const labels = [...a.labels.slice(0, partial ? -1 : undefined)]; let last = labels[labels.length - 1]; const fl = fc.map(() => (last = SC.nextLabel(last, a.grain)));
  const all = [...labels, ...fl]; const G = SC.frame(c, { labels: all, vmax: Math.max(...base.map(x => x || 0), ...fc.map(x => x.hi)), grain: a.grain, guide: true }); const n0 = labels.length;
  const band = [[G.X(n0 - 1), G.Y(base[n0 - 1] || 0)], ...fc.map((x, k) => [G.X(n0 + k), G.Y(x.hi)])].concat([...fc.map((x, k) => [G.X(n0 + k), G.Y(x.lo)])].reverse(), [[G.X(n0 - 1), G.Y(base[n0 - 1] || 0)]]);
  c.add(`<path d="${SC.path(band)}Z" fill="${c.P[0]}" fill-opacity=".12"/><path d="${SC.path(base.map((v, i) => [G.X(i), G.Y(v || 0)]))}" fill="none" stroke="${c.P[0]}" stroke-width="2.2"/><path d="${SC.path([[G.X(n0 - 1), G.Y(base[n0 - 1] || 0)], ...fc.map((x, k) => [G.X(n0 + k), G.Y(x.f)])])}" fill="none" stroke="${c.P[0]}" stroke-width="2.2" stroke-dasharray="6 4"/><line x1="${(G.X(n0 - 1) + G.step / 2).toFixed(1)}" x2="${(G.X(n0 - 1) + G.step / 2).toFixed(1)}" y1="${G.T}" y2="${G.T + G.ph}" class="sv-avg"/><text x="${(G.X(n0 - 1) + G.step / 2 + 4).toFixed(1)}" y="${G.T + 10}" class="sv-reflab">forecast →</text>`);
  SC.cross(c, G, { labels: all, grain: a.grain, series: [{ name: 'Actual', values: [...base, ...fc.map(() => null)], counts: [...s.counts.slice(0, n0), ...fc.map(() => 0)] }] }, [{ name: 'Actual', values: [...base, ...fc.map(() => null)], color: c.P[0] }, { name: 'Forecast', values: [...base.map(() => null), ...fc.map(x => x.f)], color: c.P[0] }, { name: 'Likely range', values: [...base.map(() => null), ...fc.map(x => x.hi)], color: null }]);
  c.tips.slice(-fc.length).forEach((t, k) => { t.r[2][2] = `${c.f(fc[k].lo)} – ${c.f(fc[k].hi)}`; });
  if (partial) c.add(`<text x="${G.L + 4}" y="${G.T + 10}" class="sv-reflab">${h(SC.short(thisP, a.grain))} left out (not finished)</text>`);
};
SC.R.band = c => {
  const v = c.vis; const lo = SD.aggregate(c.ds, c.rows, Object.assign({}, v, { fn: 'min', split: '', sort: 'label', top: 0 })); if (!lo.labels.length) return c.empty();
  const hi = SD.aggregate(c.ds, c.rows, Object.assign({}, v, { fn: 'max', split: '', sort: 'label', top: 0 })), av = SD.aggregate(c.ds, c.rows, Object.assign({}, v, { fn: 'avg', split: '', sort: 'label', top: 0 }));
  const L = lo.series[0].values, Hh = hi.series[0].values, A = av.series[0].values; const ok = i => !SD.small(c.ds, lo.series[0].counts[i]);
  c.legend([{ name: 'Average', color: c.P[0] }, { name: 'Lowest – highest', color: c.P[0] + '55' }], false);
  const G = SC.frame(c, { labels: lo.labels, vmin: Math.min(0, ...L.map(x => x || 0)), vmax: Math.max(...Hh.map(x => x || 0)), grain: lo.grain, guide: true });
  const top = Hh.map((x, i) => ok(i) ? [G.X(i), G.Y(x)] : null).filter(Boolean), bot = L.map((x, i) => ok(i) ? [G.X(i), G.Y(x)] : null).filter(Boolean).reverse();
  c.add(`<path d="${SC.path([...top, ...bot])}Z" fill="${c.P[0]}" fill-opacity=".16"/><path d="${SC.path(A.map((x, i) => ok(i) ? [G.X(i), G.Y(x)] : null))}" fill="none" stroke="${c.P[0]}" stroke-width="2.2"/>`);
  SC.cross(c, G, { labels: lo.labels, grain: lo.grain, series: [{ name: 'Rows', values: A, counts: lo.series[0].counts }] }, [{ name: 'Highest', values: Hh.map((x, i) => ok(i) ? x : null), color: '#94a3b8' }, { name: 'Average', values: A.map((x, i) => ok(i) ? x : null), color: c.P[0] }, { name: 'Lowest', values: L.map((x, i) => ok(i) ? x : null), color: '#94a3b8' }]);
};
/* statistical process control: centre line = mean, limits = mean ± 3 standard deviations; points outside are flagged */
SC.R.control = c => {
  const a = c.agg({ split: '', sort: 'label' }); const part = SC.dropPartial(a); if (a.labels.length < 5) return c.empty('A control chart needs at least 5 periods.'); const s = a.series[0]; const v = s.values.filter(x => x != null);
  const m = v.reduce((p, q) => p + q, 0) / v.length; const sd = Math.sqrt(v.reduce((p, q) => p + (q - m) * (q - m), 0) / Math.max(1, v.length - 1)); const ucl = m + 3 * sd, lcl = Math.max(0, m - 3 * sd);
  const outs = s.values.filter(x => x != null && (x > ucl || x < lcl)).length; c.legend([{ name: `${outs} point${outs === 1 ? '' : 's'} outside the limits`, color: '#c0392b' }, { name: 'Mean', color: '#2f9e5b' }], false);
  const G = SC.frame(c, { labels: a.labels, vmax: Math.max(ucl, ...v), vmin: Math.min(0, lcl), grain: a.grain, guide: true }); c.zoomable = a.labels.length > 8;
  c.add(`<line x1="${G.L}" x2="${G.L + G.pw}" y1="${G.Y(ucl)}" y2="${G.Y(ucl)}" class="sv-target"/><line x1="${G.L}" x2="${G.L + G.pw}" y1="${G.Y(lcl)}" y2="${G.Y(lcl)}" class="sv-target"/><line x1="${G.L}" x2="${G.L + G.pw}" y1="${G.Y(m)}" y2="${G.Y(m)}" stroke="#2f9e5b" stroke-width="1.5"/>
    <text x="${G.L + G.pw - 2}" y="${G.Y(ucl) - 4}" class="sv-reflab" text-anchor="end">Upper limit ${h(c.f(ucl))}</text><text x="${G.L + G.pw - 2}" y="${G.Y(lcl) - 4}" class="sv-reflab" text-anchor="end">Lower limit ${h(c.f(lcl))}</text><text x="${G.L + 4}" y="${G.Y(m) - 4}" class="sv-reflab">Mean ${h(c.f(m))}</text>
    <path d="${SC.path(s.values.map((x, i) => x == null ? null : [G.X(i), G.Y(x)]))}" fill="none" stroke="${c.P[0]}" stroke-width="1.8"/>`);
  s.values.forEach((x, i) => { if (x == null) return; const out = x > ucl || x < lcl; c.add(`<circle cx="${G.X(i).toFixed(1)}" cy="${G.Y(x).toFixed(1)}" r="${out ? 5 : 3}" fill="${out ? '#c0392b' : '#fff'}" stroke="${out ? '#c0392b' : c.P[0]}" stroke-width="2"/>`); });
  SC.cross(c, G, a, [{ name: s.name, values: s.values, counts: s.counts, color: c.P[0] }]);
  c.tips.forEach((t, i) => { const x = s.values[i]; if (x != null && (x > ucl || x < lcl)) t.f = '⚠ outside the control limits — special cause likely'; });
  if (part) c.add(`<text x="${G.L + 4}" y="${G.T + G.ph - 4}" class="sv-reflab">${h(SC.short(part, a.grain))} left out (not finished)</text>`);
};
/* run chart: median line; 6+ points in a row on one side = a shift */
SC.R.run = c => {
  const a = c.agg({ split: '', sort: 'label' }); const part = SC.dropPartial(a); if (a.labels.length < 5) return c.empty('A run chart needs at least 5 periods.'); const s = a.series[0]; const v = s.values.filter(x => x != null).sort((p, q) => p - q); const med = SC.q(v, 0.5);
  c.legend([{ name: 'Shift (6+ in a row)', color: '#e07a2e' }, { name: 'Median', color: '#5b6b78' }], false);
  const G = SC.frame(c, { labels: a.labels, vmax: Math.max(...v), grain: a.grain, guide: true }); c.zoomable = a.labels.length > 8;
  const side = s.values.map(x => x == null || x === med ? 0 : x > med ? 1 : -1); const shift = new Array(side.length).fill(false);
  for (let i = 0; i < side.length;) { let j = i; while (j < side.length && side[j] === side[i] && side[i] !== 0) j++; if (j - i >= 6) for (let k = i; k < j; k++) shift[k] = true; i = Math.max(j, i + 1); }
  c.add(`<line x1="${G.L}" x2="${G.L + G.pw}" y1="${G.Y(med)}" y2="${G.Y(med)}" class="sv-avg"/><text x="${G.L + G.pw - 2}" y="${G.Y(med) - 4}" class="sv-reflab" text-anchor="end">Median ${h(c.f(med))}</text><path d="${SC.path(s.values.map((x, i) => x == null ? null : [G.X(i), G.Y(x)]))}" fill="none" stroke="${c.P[0]}" stroke-width="1.8"/>`);
  s.values.forEach((x, i) => { if (x != null) c.add(`<circle cx="${G.X(i).toFixed(1)}" cy="${G.Y(x).toFixed(1)}" r="${shift[i] ? 4.5 : 3}" fill="${shift[i] ? '#e07a2e' : '#fff'}" stroke="${shift[i] ? '#e07a2e' : c.P[0]}" stroke-width="2"/>`); });
  SC.cross(c, G, a, [{ name: s.name, values: s.values, counts: s.counts, color: c.P[0] }]);
  c.tips.forEach((t, i) => { if (shift[i]) t.f = '● part of a shift: 6 or more points in a row on one side of the median'; });
  if (part) c.add(`<text x="${G.L + 4}" y="${G.T + G.ph - 4}" class="sv-reflab">${h(SC.short(part, a.grain))} left out (not finished)</text>`);
};
/* unusual points, leaving out the current unfinished period (it is always low) */
SC.anomFull = (a, vals) => { const cur = a.grain ? SD.bucket(U.todayStr(), a.grain) : null; const v = vals.map((x, i) => (cur && a.labels[i] === cur ? null : x)); return SS.anomalies(v); };
/* a dated event on a time chart (e.g. a go-live): dashed line + label at the period that holds it */
SC.markAt = (c, G, a) => { const m = c.vis.markAt; if (!m || !a.grain) return; const k = SD.bucket(m, a.grain); let i = a.labels.indexOf(k); if (i < 0) i = a.labels.findIndex(l => String(l) >= k); if (i < 0) return; const x = G.X(i) - (a.grain === 'day' ? 0 : 0); c.add(`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${G.T}" y2="${G.T + G.ph}" stroke="#d08a1e" stroke-width="2" stroke-dasharray="6 4"/><text x="${(x + 4).toFixed(1)}" y="${G.T + 11}" class="sv-reflab" fill="#b26b00">${h(c.vis.markLabel || 'Go-live')} ${h(U.fmtDate(m))}</text>`); };
/* min / max that work on very long lists (spreading 200,000 values into Math.min overflows the stack) */
SC.mn = a => { let m = Infinity; for (const v of a) if (v < m) m = v; return m; };
SC.mx = a => { let m = -Infinity; for (const v of a) if (v > m) m = v; return m; };
