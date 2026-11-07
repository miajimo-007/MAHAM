/* MAHAM Lab — Studio chart engine, part 2: time grids, part-of-whole, distribution and matrix charts. */
'use strict';

/* ============================ TIME GRIDS ============================ */
/* one square per day for the last 12 months of the date column */
SC.R.calendar = c => {
  const k = c.vis.x; const m = SC.counts(c.rows, k, 'day'); if (!m.size) return c.empty();
  const vals = new Map(); if (c.vis.fn && c.vis.fn !== 'count') { const g = new Map(); for (const r of c.rows) { const d = SD.bucket(r[k], 'day'); if (d === '(blank)') continue; let a = g.get(d); if (!a) g.set(d, a = []); a.push(r); } for (const [d, rs] of g) vals.set(d, SD.calc(c.vis.fn, rs, c.vis.field)); } else for (const [d, n] of m) vals.set(d, n);
  const end = [...m.keys()].sort().pop(); const start = U.addDays(end, -364); const s0 = U.addDays(start, -U.pd(start).getDay());
  const weeks = Math.ceil((U.diffDays(s0, end) + 1) / 7); const L = 30, T = 18; const cs = Math.max(6, Math.min(18, Math.floor((c.W - L - 6) / weeks) - 1), 0); const gap = 1.5;
  const mx = Math.max(1, ...[...vals.entries()].filter(([d]) => d >= start).map(e => e[1] || 0));
  const W = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; [1, 3, 5].forEach(i => c.add(`<text x="${L - 4}" y="${T + i * (cs + gap) + cs - 2}" class="sv-ax" text-anchor="end">${W[i]}</text>`));
  let lastMo = '';
  for (let wk = 0; wk < weeks; wk++) for (let d = 0; d < 7; d++) {
    const day = U.addDays(s0, wk * 7 + d); if (day < start || day > end) continue; const v = vals.get(day); const n = m.get(day) || 0; const hide = c.small(n);
    if (d === 0 && day.slice(0, 7) !== lastMo) { lastMo = day.slice(0, 7); c.add(`<text x="${L + wk * (cs + gap)}" y="${T - 6}" class="sv-ax">${U.MONTHS[+day.slice(5, 7) - 1].slice(0, 3)}</text>`); }
    c.add(`<rect x="${L + wk * (cs + gap)}" y="${T + d * (cs + gap)}" width="${cs}" height="${cs}" rx="2" fill="${!v || hide ? '#eef2f4' : c.P[0]}" fill-opacity="${!v || hide ? 1 : (0.15 + 0.85 * v / mx).toFixed(3)}" class="sv-hit"${c.tip(U.fmtDate(day) + ' · ' + W[d], [[c.P[0], c.vis.fn && c.vis.fn !== 'count' ? SD.measureName(c.vis, c.ds) : 'Rows', hide ? '<5' : v == null ? '0' : c.f(v)]])}${c.pick(day)}/>`);
  }
  c.geom = null;
};
/* small multiples: one small line per value of "Split by" */
SC.R.sparkgrid = c => {
  const a = SD.aggregate(c.ds, c.rows, Object.assign({}, c.vis, { sort: 'label', top: 0 })); if (!a.labels.length || !a.series.length) return c.empty('Pick a date for X and a "Split by" column.');
  const ser = a.series.slice(0, 12); const cols = c.W > 700 ? 4 : c.W > 420 ? 3 : 2; const rows = Math.ceil(ser.length / cols); const cw = c.W / cols, ch = c.H / rows; const mx = Math.max(1e-9, ...ser.flatMap(s => s.values.map(v => v || 0)));
  ser.forEach((s, i) => { const x0 = (i % cols) * cw, y0 = Math.floor(i / cols) * ch; const pw = cw - 16, ph = ch - 34; const n = s.values.length;
    const pts = s.values.map((v, j) => SD.small(c.ds, s.counts[j]) ? null : [x0 + 8 + (j * pw) / Math.max(1, n - 1), y0 + 22 + ph - ((v || 0) / mx) * ph]); const last = [...s.values].reverse().find(v => v != null);
    c.add(`<text x="${x0 + 8}" y="${y0 + 13}" class="sv-ax" style="font-weight:600;fill:#24323d">${h(SC.short(s.name))}</text><text x="${x0 + cw - 8}" y="${y0 + 13}" class="sv-val" text-anchor="end">${h(c.f(last))}</text><rect x="${x0 + 8}" y="${y0 + 22}" width="${pw}" height="${ph}" fill="#fafcfd"/><path d="${SC.path(pts)}L${(x0 + 8 + pw).toFixed(1)},${y0 + 22 + ph}L${x0 + 8},${y0 + 22 + ph}Z" fill="${c.P[i % c.P.length]}" fill-opacity=".14"/><path d="${SC.path(pts)}" fill="none" stroke="${c.P[i % c.P.length]}" stroke-width="1.8"/><rect x="${x0}" y="${y0}" width="${cw}" height="${ch}" fill="transparent" class="sv-hit"${c.tip(s.name, s.values.slice(-4).map((v, j) => [null, SC.short(a.labels[a.labels.length - Math.min(4, a.labels.length) + j], a.grain), SD.small(c.ds, s.counts[s.counts.length - Math.min(4, a.labels.length) + j]) ? '<5' : c.f(v)]), 'last 4 periods')}/>`); });
};

/* ============================ PART OF WHOLE ============================ */
SC.pies = (c, kind) => {
  const a = c.agg({ split: '', top: +c.vis.top || 8 }); if (!a.labels.length) return c.empty(); const s = a.series[0]; const vals = s.values.map(v => v || 0); const tot = vals.reduce((p, q) => p + q, 0) || 1;
  c.legend(a.labels.map((l, i) => ({ name: l, color: c.P[i % c.P.length] })), false); const lh = 28;
  const half = kind === 'half'; const H = c.H - lh; const R = half ? Math.min(c.W / 2 - 10, H - 24) : Math.min(c.W, H) / 2 - 8; const cx = c.W / 2, cy = half ? H - 14 : H / 2; const r0 = kind === 'pie' ? 0 : R * 0.58;
  let ang = half ? Math.PI : -Math.PI / 2; const span = half ? Math.PI : Math.PI * 2;
  vals.forEach((v, i) => { const a1 = ang + (v / tot) * span; const col = c.P[i % c.P.length]; const mid = (ang + a1) / 2; const rl = r0 ? (R + r0) / 2 : R * 0.64;
    c.add(`<path d="${SC.arc(cx, cy, r0, R, ang, a1)}" fill="${col}" stroke="#fff" stroke-width="1.5" class="sv-hit sv-slice"${c.tip(SC.long(a.labels[i], a.grain), [[col, SD.measureName(c.vis, c.ds), s.values[i] == null ? '<5' : c.f(s.values[i])], [null, 'Share', U.num((v / tot) * 100, 1) + '%']], `${s.counts[i].toLocaleString()} rows`)}${c.pick(a.labels[i])}/>${v / tot > 0.05 ? `<text x="${(cx + rl * Math.cos(mid)).toFixed(1)}" y="${(cy + rl * Math.sin(mid) + 4).toFixed(1)}" class="sv-in">${c.vis.labels ? h(c.f(s.values[i])) : Math.round((v / tot) * 100) + '%'}</text>` : ''}`); ang = a1; });
  if (kind !== 'pie') c.add(`<text x="${cx}" y="${cy + (half ? -6 : 7)}" class="sv-big">${h(c.f(tot))}</text><text x="${cx}" y="${cy + (half ? 10 : 22)}" class="sv-ax" text-anchor="middle">total</text>`);
};
SC.R.pie = c => SC.pies(c, 'pie');
SC.R.donut = c => SC.pies(c, 'donut');
SC.R.halfdonut = c => SC.pies(c, 'half');
/* squarified treemap */
SC.squarify = (items, x, y, w, hh) => {
  const out = []; const tot = items.reduce((p, q) => p + q.v, 0) || 1; let rest = items.map(it => Object.assign({}, it, { a: (it.v / tot) * w * hh })).filter(it => it.a > 0);
  const worst = (row, side) => { const s = row.reduce((p, q) => p + q.a, 0); const mx = Math.max(...row.map(r => r.a)), mn = Math.min(...row.map(r => r.a)); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
  while (rest.length) { const side = Math.min(w, hh); let row = [rest[0]]; let i = 1; while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) { row.push(rest[i]); i++; }
    const s = row.reduce((p, q) => p + q.a, 0); if (w >= hh) { const rw = s / hh; let yy = y; for (const r of row) { const rh = r.a / rw; out.push(Object.assign(r, { x, y: yy, w: rw, h: rh })); yy += rh; } x += rw; w -= rw; } else { const rh = s / w; let xx = x; for (const r of row) { const rw = r.a / rh; out.push(Object.assign(r, { x: xx, y, w: rw, h: rh })); xx += rw; } y += rh; hh -= rh; }
    rest = rest.slice(i); }
  return out;
};
SC.R.treemap = c => {
  const a = SD.aggregate(c.ds, c.rows, Object.assign({}, c.vis, { split: '', top: +c.vis.top || 20, other: true })); if (!a.labels.length) return c.empty(); const s = a.series[0];
  const items = a.labels.map((l, i) => ({ l, v: SD.small(c.ds, s.counts[i]) ? 0 : (s.values[i] || 0), n: s.counts[i], i })).filter(x => x.v > 0).sort((p, q) => q.v - p.v); const tot = items.reduce((p, q) => p + q.v, 0);
  for (const r of SC.squarify(items, 0, 0, c.W, c.H)) { const col = c.P[r.i % c.P.length];
    c.add(`<rect x="${(r.x + 1).toFixed(1)}" y="${(r.y + 1).toFixed(1)}" width="${Math.max(0, r.w - 2).toFixed(1)}" height="${Math.max(0, r.h - 2).toFixed(1)}" rx="3" fill="${col}" class="sv-hit"${c.tip(r.l, [[col, SD.measureName(c.vis, c.ds), c.f(r.v)], [null, 'Share', U.num((r.v / tot) * 100, 1) + '%']], `${r.n.toLocaleString()} rows`)}${c.pick(r.l)}/>${r.w > 54 && r.h > 30 ? `<text x="${(r.x + 7).toFixed(1)}" y="${(r.y + 17).toFixed(1)}" class="sv-in" text-anchor="start" style="text-anchor:start">${h(String(r.l).slice(0, Math.floor(r.w / 7)))}</text><text x="${(r.x + 7).toFixed(1)}" y="${(r.y + 31).toFixed(1)}" class="sv-in" style="text-anchor:start;font-weight:400">${h(c.f(r.v))}</text>` : ''}`); }
};
/* sunburst: inner ring = X, outer ring = Split by inside each X */
SC.R.sunburst = c => {
  const a = SD.aggregate(c.ds, c.rows, Object.assign({}, c.vis, { top: Math.min(+c.vis.top || 8, 10) })); if (!a.labels.length || !c.vis.split) return c.empty('Pick X (inner ring) and "Split by" (outer ring).');
  const inner = a.labels.map((l, i) => ({ l, v: a.series.reduce((t, s) => t + (SD.small(c.ds, s.counts[i]) ? 0 : (s.values[i] || 0)), 0), i })); const tot = inner.reduce((p, q) => p + q.v, 0) || 1;
  const cx = c.W / 2, cy = c.H / 2, R = Math.min(c.W, c.H) / 2 - 6, r1 = R * 0.55, r0 = R * 0.2; let ang = -Math.PI / 2;
  inner.forEach(it => { const a1 = ang + (it.v / tot) * Math.PI * 2; const col = c.P[it.i % c.P.length];
    c.add(`<path d="${SC.arc(cx, cy, r0, r1, ang, a1)}" fill="${col}" stroke="#fff" stroke-width="1.5" class="sv-hit"${c.tip(it.l, [[col, SD.measureName(c.vis, c.ds), c.f(it.v)], [null, 'Share', U.num((it.v / tot) * 100, 1) + '%']])}${c.pick(it.l)}/>`);
    let b = ang; a.series.forEach((s, si) => { const v = SD.small(c.ds, s.counts[it.i]) ? 0 : (s.values[it.i] || 0); if (!v) return; const b1 = b + (v / tot) * Math.PI * 2;
      c.add(`<path d="${SC.arc(cx, cy, r1 + 2, R, b, b1)}" fill="${col}" fill-opacity="${(0.35 + 0.55 * (1 - si / Math.max(1, a.series.length))).toFixed(2)}" stroke="#fff" stroke-width="1" class="sv-hit"${c.tip(`${it.l} › ${s.name}`, [[col, SD.measureName(c.vis, c.ds), c.f(v)], [null, `Share of ${it.l}`, U.num((v / (it.v || 1)) * 100, 1) + '%']])}${c.pick(it.l)}/>`); b = b1; });
    const mid = (ang + a1) / 2; const room = Math.floor(((a1 - ang) * (r0 + r1)) / 2 / 6.5); if (room >= 4) c.add(`<text x="${(cx + ((r0 + r1) / 2) * Math.cos(mid)).toFixed(1)}" y="${(cy + ((r0 + r1) / 2) * Math.sin(mid) + 4).toFixed(1)}" class="sv-in">${h(String(it.l).length > room ? String(it.l).slice(0, room - 1) + '…' : String(it.l))}</text>`); ang = a1; });
  c.add(`<text x="${cx}" y="${cy + 6}" class="sv-big" style="font-size:15px">${h(c.f(tot))}</text>`);
};
SC.R.waffle = c => {
  const a = c.agg({ split: '', top: Math.min(+c.vis.top || 6, 8) }); if (!a.labels.length) return c.empty(); const s = a.series[0]; const vals = s.values.map(v => v || 0); const tot = vals.reduce((p, q) => p + q, 0) || 1;
  c.legend(a.labels.map((l, i) => ({ name: `${l} ${Math.round((vals[i] / tot) * 100)}%`, color: c.P[i % c.P.length] })), false);
  let cells = vals.map(v => Math.round((v / tot) * 100)); let diff = 100 - cells.reduce((p, q) => p + q, 0); for (let i = 0; diff !== 0 && i < 200; i++) { const k = i % cells.length; if (diff > 0) { cells[k]++; diff--; } else if (cells[k] > 0) { cells[k]--; diff++; } }
  const H = c.H - 28; const sz = Math.min((c.W - 10) / 10, (H - 6) / 10); const x0 = (c.W - sz * 10) / 2; let k = 0;
  cells.forEach((n, ci) => { for (let j = 0; j < n; j++, k++) { const col = c.P[ci % c.P.length]; c.add(`<rect x="${(x0 + (k % 10) * sz + 1).toFixed(1)}" y="${(3 + Math.floor(k / 10) * sz + 1).toFixed(1)}" width="${(sz - 2).toFixed(1)}" height="${(sz - 2).toFixed(1)}" rx="2" fill="${col}" class="sv-hit"${c.tip(a.labels[ci], [[col, 'Share', Math.round((vals[ci] / tot) * 100) + '%'], [null, SD.measureName(c.vis, c.ds), s.values[ci] == null ? '<5' : c.f(s.values[ci])]], 'each square = 1%')}${c.pick(a.labels[ci])}/>`); } });
};
SC.R.funnel = c => {
  const a = c.agg({ split: '', other: false, top: Math.min(+c.vis.top || 8, 10) }); if (!a.labels.length) return c.empty(); const s = a.series[0]; const vals = s.values.map(v => v || 0); const mx = Math.max(1e-9, ...vals);
  const n = a.labels.length; const rh = (c.H - 4) / n; const cx = c.W / 2; const maxW = c.W - 40;
  a.labels.forEach((l, i) => { const w0 = (vals[i] / mx) * maxW, w1 = ((i + 1 < n ? vals[i + 1] : vals[i] * 0.8) / mx) * maxW; const y = 2 + i * rh; const col = c.P[i % c.P.length];
    c.add(`<path d="M${(cx - w0 / 2).toFixed(1)},${y.toFixed(1)}L${(cx + w0 / 2).toFixed(1)},${y.toFixed(1)}L${(cx + w1 / 2).toFixed(1)},${(y + rh - 2).toFixed(1)}L${(cx - w1 / 2).toFixed(1)},${(y + rh - 2).toFixed(1)}Z" fill="${col}" class="sv-hit"${c.tip(SC.long(l, a.grain), [[col, SD.measureName(c.vis, c.ds), s.values[i] == null ? '<5' : c.f(s.values[i])], [null, 'Of the first step', Math.round((vals[i] / (vals[0] || 1)) * 100) + '%'], ...(i ? [[null, 'From the step before', Math.round((vals[i] / (vals[i - 1] || 1)) * 100) + '%']] : [])])}${c.pick(l)}/><text x="${cx}" y="${(y + rh / 2 + 4).toFixed(1)}" class="sv-in">${h(SC.short(l, a.grain))} · ${h(s.values[i] == null ? '<5' : c.f(s.values[i]))}</text>`); });
};

/* ============================ DISTRIBUTION ============================ */
SC.R.histogram = c => {
  const v = c.rows.map(r => r[c.vis.field]).filter(x => typeof x === 'number' && isFinite(x)).sort((p, q) => p - q); if (v.length < 2) return c.empty('Pick a number column.');
  const lo = SC.q(v, 0.005), hi = SC.q(v, 0.995); const nb = +c.vis.bins || Math.min(40, Math.max(6, Math.ceil(Math.log2(v.length) + 1))); const w = (hi - lo) / nb || 1;
  const bins = Array.from({ length: nb }, (_, i) => ({ a: lo + i * w, b: lo + (i + 1) * w, n: 0 })); let out = 0; for (const x of v) { if (x < lo || x > hi) { out++; continue; } bins[Math.min(nb - 1, Math.floor((x - lo) / w))].n++; }
  const labels = bins.map(b => c.f(b.a)); const G = SC.frame(c, { labels, vmax: Math.max(...bins.map(b => b.n)), fmtY: t => Math.round(t).toLocaleString() });
  const mean = v.reduce((p, q) => p + q, 0) / v.length, med = SC.q(v, 0.5);
  bins.forEach((b, i) => { const hide = c.small(b.n); c.add(`<rect x="${(G.X(i) - G.step / 2 + 0.5).toFixed(1)}" y="${G.Y(hide ? 0 : b.n).toFixed(1)}" width="${(G.step - 1).toFixed(1)}" height="${(G.Y(0) - G.Y(hide ? 0 : b.n)).toFixed(1)}" fill="${c.P[0]}" class="sv-hit sv-vb"${c.tip(`${c.f(b.a)} – ${c.f(b.b)}`, [[c.P[0], 'Rows', hide ? '<5' : b.n.toLocaleString()], [null, 'Share', hide ? '–' : U.num((b.n / v.length) * 100, 1) + '%']])}/>`); });
  const X = x => G.L + ((x - lo) / ((hi - lo) || 1)) * G.pw;
  c.add(`<line x1="${X(mean)}" x2="${X(mean)}" y1="${G.T}" y2="${G.T + G.ph}" class="sv-target"/><text x="${X(mean) + 3}" y="${G.T + 10}" class="sv-reflab">mean ${h(c.f(mean))}</text><line x1="${X(med)}" x2="${X(med)}" y1="${G.T + 14}" y2="${G.T + G.ph}" class="sv-avg"/><text x="${X(med) + 3}" y="${G.T + 24}" class="sv-reflab">median ${h(c.f(med))}</text>`);
  if (out) c.add(`<text x="${G.L + G.pw}" y="${G.T + 10}" class="sv-reflab" text-anchor="end">${out} extreme value${out > 1 ? 's' : ''} not shown</text>`);
};
SC.R.box = c => {
  const groups = SC.numsBy(c.rows, c.vis.x, c.vis.field, (Studio.col(c.vis.x) || {}).type === 'date' ? (c.vis.grain || 'month') : '', Math.min(+c.vis.top || 12, 20)).filter(g => !c.small(g.vals.length)); if (!groups.length) return c.empty('Pick a number column, and what to group by.');
  if ((Studio.col(c.vis.x) || {}).type === 'date') groups.sort((p, q) => String(p.name).localeCompare(String(q.name)));
  const st = groups.map(g => { const s = g.vals.slice().sort((p, q) => p - q); const q1 = SC.q(s, 0.25), q3 = SC.q(s, 0.75), iqr = q3 - q1; const lo = s.find(x => x >= q1 - 1.5 * iqr), hi = [...s].reverse().find(x => x <= q3 + 1.5 * iqr); return { name: g.name, n: s.length, q1, med: SC.q(s, 0.5), q3, lo, hi, out: s.filter(x => x < lo || x > hi), mean: s.reduce((p, q) => p + q, 0) / s.length }; });
  const G = SC.frame(c, { labels: st.map(s => s.name), vmin: Math.min(0, ...st.map(s => Math.min(s.lo, ...s.out.slice(0, 1)))), vmax: Math.max(...st.map(s => Math.max(s.hi, ...(s.out.length ? [s.out[s.out.length - 1]] : [])))), grain: c.vis.grain }); const bw = Math.min(46, G.step * 0.5);
  st.forEach((s, i) => { const x = G.X(i); const col = c.P[i % c.P.length];
    c.add(`<line x1="${x}" x2="${x}" y1="${G.Y(s.hi)}" y2="${G.Y(s.lo)}" stroke="#5b6b78"/><line x1="${x - bw / 4}" x2="${x + bw / 4}" y1="${G.Y(s.hi)}" y2="${G.Y(s.hi)}" stroke="#5b6b78"/><line x1="${x - bw / 4}" x2="${x + bw / 4}" y1="${G.Y(s.lo)}" y2="${G.Y(s.lo)}" stroke="#5b6b78"/><rect x="${x - bw / 2}" y="${G.Y(s.q3)}" width="${bw}" height="${Math.max(1, G.Y(s.q1) - G.Y(s.q3))}" rx="3" fill="${col}" fill-opacity=".3" stroke="${col}" stroke-width="1.5" class="sv-hit"${c.tip(SC.long(s.name, c.vis.grain), [[col, 'Median', c.f(s.med)], [null, 'Middle half', `${c.f(s.q1)} – ${c.f(s.q3)}`], [null, 'Range (no outliers)', `${c.f(s.lo)} – ${c.f(s.hi)}`], [null, 'Average', c.f(s.mean)], [null, 'Outliers', String(s.out.length)]], `${s.n.toLocaleString()} rows`)}${c.pick(s.name)}/><line x1="${x - bw / 2}" x2="${x + bw / 2}" y1="${G.Y(s.med)}" y2="${G.Y(s.med)}" stroke="${col}" stroke-width="2.5"/>${s.out.slice(0, 40).map(o => `<circle cx="${x}" cy="${G.Y(o).toFixed(1)}" r="2.2" fill="none" stroke="${col}"/>`).join('')}`); });
};
SC.R.strip = c => {
  const groups = SC.numsBy(c.rows, c.vis.x, c.vis.field, (Studio.col(c.vis.x) || {}).type === 'date' ? (c.vis.grain || 'month') : '', Math.min(+c.vis.top || 10, 16)).filter(g => !c.small(g.vals.length)); if (!groups.length) return c.empty('Pick a number column, and what to group by.');
  const all = groups.flatMap(g => g.vals); const G = SC.frame(c, { labels: groups.map(g => g.name), vmin: Math.min(0, SC.mn(all)), vmax: SC.mx(all) }); let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  groups.forEach((g, i) => { const col = c.P[i % c.P.length]; const sample = g.vals.length > 400 ? g.vals.filter((_, k) => k % Math.ceil(g.vals.length / 400) === 0) : g.vals; const s = g.vals.slice().sort((p, q) => p - q);
    c.add(sample.map(v => `<circle cx="${(G.X(i) + (rnd() - 0.5) * G.step * 0.6).toFixed(1)}" cy="${G.Y(v).toFixed(1)}" r="2.4" fill="${col}" fill-opacity=".38"/>`).join('') + `<line x1="${G.X(i) - G.step * 0.34}" x2="${G.X(i) + G.step * 0.34}" y1="${G.Y(SC.q(s, 0.5))}" y2="${G.Y(SC.q(s, 0.5))}" stroke="#12222e" stroke-width="2"/><rect x="${G.X(i) - G.step / 2}" y="${G.T}" width="${G.step}" height="${G.ph}" fill="transparent" class="sv-hit"${c.tip(g.name, [[col, 'Median', c.f(SC.q(s, 0.5))], [null, 'Lowest – highest', `${c.f(s[0])} – ${c.f(s[s.length - 1])}`]], `${g.vals.length.toLocaleString()} rows${sample.length < g.vals.length ? ` (${sample.length} dots shown)` : ''}`)}${c.pick(g.name)}/>`); });
};
SC.R.ecdf = c => {
  const groups = c.vis.split ? SC.numsBy(c.rows, c.vis.split, c.vis.field, '', 6) : SC.numsBy(c.rows, '', c.vis.field); const ok = groups.filter(g => g.vals.length >= 5); if (!ok.length) return c.empty('Pick a number column.');
  c.legend(ok.map((g, i) => ({ name: g.name, color: c.P[i % c.P.length] })), false); const lh = ok.length > 1 || c.vis.split ? 28 : 0; if (!lh) c.legendItems = null;
  const all = ok.flatMap(g => g.vals); const lo = SC.q(all.slice().sort((p, q) => p - q), 0), hi = SC.q(all.slice().sort((p, q) => p - q), 0.99); const xk = SC.nice(lo, hi);
  const L = 40, T = 8, B = 22, R = 12; const pw = c.W - L - R, ph = c.H - (c.legendItems ? 28 : 0) - T - B; const X = v => L + ((Math.min(v, xk.max) - xk.min) / ((xk.max - xk.min) || 1)) * pw, Y = p => T + ph - p * ph;
  [0, 0.25, 0.5, 0.75, 1].forEach(p => c.add(`<line x1="${L}" x2="${L + pw}" y1="${Y(p)}" y2="${Y(p)}" class="sv-grid"/><text x="${L - 6}" y="${Y(p) + 4}" class="sv-ax" text-anchor="end">${p * 100}%</text>`));
  xk.ticks.forEach(t => c.add(`<text x="${X(t)}" y="${T + ph + 15}" class="sv-ax" text-anchor="middle">${h(c.f(t))}</text>`));
  ok.forEach((g, gi) => { const s = g.vals.slice().sort((p, q) => p - q); const n = s.length; const step = Math.max(1, Math.floor(n / 300)); const pts = []; for (let i = 0; i < n; i += step) pts.push([X(s[i]), Y((i + 1) / n)]); pts.push([X(s[n - 1]), Y(1)]); const col = c.P[gi % c.P.length];
    c.add(`<path d="${SC.path(pts, 'step')}" fill="none" stroke="${col}" stroke-width="2"/>`);
    [0.5, 0.9].forEach(p => { const v = SC.q(s, p); c.add(`<circle cx="${X(v)}" cy="${Y(p)}" r="4" fill="${col}" class="sv-hit"${c.tip(g.name, [[col, `${p * 100}% of rows are at or below`, c.f(v)]], `${n.toLocaleString()} rows`)}/>`); }); });
};
SC.scatter = (c, mode) => {
  const v = c.vis; const sz = mode === 'bubble' ? v.field2 : null; const cat = v.split; const pts = []; const cats = new Map();
  for (const r of c.rows) { const x = r[v.x], y = r[v.field]; if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) continue; const g = cat ? String(r[cat] ?? '') || '(blank)' : ''; if (cat && !cats.has(g)) cats.set(g, cats.size); pts.push([x, y, sz ? (+r[sz] || 0) : 1, g]); }
  if (pts.length < 2) return c.empty('Pick two number columns.');
  const sample = pts.length > 3000 ? pts.filter((_, i) => i % Math.ceil(pts.length / 3000) === 0) : pts; const capCats = [...cats.keys()].slice(0, 8);
  if (cat) c.legend(capCats.map((g, i) => ({ name: g, color: c.P[i % c.P.length] })), false);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); const xk = SC.nice(SC.mn(xs), SC.mx(xs)), yk = SC.nice(Math.min(0, SC.mn(ys)), SC.mx(ys)); const lh = c.legendItems ? 28 : 0;
  const yw = Math.max(...yk.ticks.map(t => c.f(t).length)) * 6.4 + 10; const L = Math.max(34, yw), T = 10, B = 34, R = 14; const pw = c.W - L - R, ph = c.H - lh - T - B;
  const X = x => L + ((x - xk.min) / ((xk.max - xk.min) || 1)) * pw, Y = y => T + ph - ((y - yk.min) / ((yk.max - yk.min) || 1)) * ph;
  yk.ticks.forEach(t => c.add(`<line x1="${L}" x2="${L + pw}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" class="sv-grid"/><text x="${L - 6}" y="${(Y(t) + 4).toFixed(1)}" class="sv-ax" text-anchor="end">${h(c.f(t))}</text>`));
  xk.ticks.forEach(t => c.add(`<text x="${X(t).toFixed(1)}" y="${T + ph + 15}" class="sv-ax" text-anchor="middle">${h(c.f(t))}</text>`));
  c.add(`<text x="${L + pw / 2}" y="${T + ph + 30}" class="sv-ax" text-anchor="middle" style="font-weight:600">${h(Studio.label(v.x))}</text>`);
  const smx = sz ? Math.max(1e-9, SC.mx(pts.map(p => p[2]))) : 1;
  c.add(sample.map(p => { const ci = cat ? cats.get(p[3]) : 0; const col = ci >= 8 ? '#94a3b8' : c.P[ci % c.P.length]; const r = sz ? 2 + (sample.length > 600 ? 7 : 14) * Math.sqrt(Math.max(0, p[2]) / smx) : 3.2; return `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="${r.toFixed(1)}" fill="${col}" fill-opacity="${sz ? 0.22 : 0.45}" stroke="${sz ? col : 'none'}" class="sv-dot"${pts.length <= 1500 ? c.tip(cat ? p[3] : '', [[col, Studio.label(v.x), c.f(p[0])], [null, Studio.label(v.field), c.f(p[1])], ...(sz ? [[null, Studio.label(sz), c.f(p[2])]] : [])]) : ''}/>`; }).join(''));
  if (mode === 'trend') { const n = pts.length; const mx = xs.reduce((p, q) => p + q, 0) / n, my = ys.reduce((p, q) => p + q, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (const p of pts) { sxy += (p[0] - mx) * (p[1] - my); sxx += (p[0] - mx) ** 2; syy += (p[1] - my) ** 2; } const b = sxx ? sxy / sxx : 0, a0 = my - b * mx; const r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : 0;
    c.add(`<line x1="${X(xk.min)}" y1="${Y(a0 + b * xk.min)}" x2="${X(xk.max)}" y2="${Y(a0 + b * xk.max)}" stroke="#c0392b" stroke-width="2.2" clip-path="none"/><rect x="${L + pw - 230}" y="${T + 2}" width="228" height="34" rx="6" fill="#fff" fill-opacity=".92" stroke="#e2e8ec"/><text x="${L + pw - 222}" y="${T + 16}" class="sv-val">Trend: +1 ${h(Studio.label(v.x).slice(0, 18))} → ${b >= 0 ? '+' : ''}${h(c.f(b))}</text><text x="${L + pw - 222}" y="${T + 30}" class="sv-reflab">R² = ${U.num(r2, 2)} · ${r2 >= 0.5 ? 'strong' : r2 >= 0.2 ? 'moderate' : 'weak'} link · ${n.toLocaleString()} points</text>`); }
  if (pts.length > sample.length) c.add(`<text x="${L + pw}" y="${T + ph - 4}" class="sv-reflab" text-anchor="end">${sample.length.toLocaleString()} of ${pts.length.toLocaleString()} points shown</text>`);
};
SC.R.scatter = c => SC.scatter(c, 'plain');
SC.R.trendscatter = c => SC.scatter(c, 'trend');
SC.R.bubble = c => SC.scatter(c, 'bubble');

/* ============================ MATRIX ============================ */
SC.R.heat = c => {
  const a = c.agg({ top: c.vis.top || 0 }); if (!a.labels.length || !a.all.length) return c.empty('Pick X and "Split by" (the rows).'); const ser = a.all;
  const L = Math.min(120, Math.max(40, Math.max(...ser.map(s => String(s.name).length)) * 6.6)), T = 4, B = 26; const cw = (c.W - L - 6) / a.labels.length, ch = (c.H - T - B) / ser.length; const mx = Math.max(1e-9, ...ser.flatMap(s => s.values.map(v => v || 0)));
  ser.forEach((s, yi) => { c.add(`<text x="${L - 6}" y="${(T + yi * ch + ch / 2 + 4).toFixed(1)}" class="sv-ax" text-anchor="end">${h(SC.short(s.name))}</text>`);
    s.values.forEach((v, xi) => { const col = c.P[0]; c.add(`<rect x="${(L + xi * cw).toFixed(1)}" y="${(T + yi * ch).toFixed(1)}" width="${Math.max(1, cw - 1.5).toFixed(1)}" height="${Math.max(1, ch - 1.5).toFixed(1)}" rx="2" fill="${v == null ? '#eef2f4' : col}" fill-opacity="${v == null ? 1 : (0.07 + 0.93 * (v || 0) / mx).toFixed(3)}" class="sv-hit"${c.tip(`${SC.long(a.labels[xi], a.grain)} · ${s.name}`, [[col, SD.measureName(c.vis, c.ds), v == null ? (s.counts[xi] ? '<5' : '0') : c.f(v)]], `${(s.counts[xi] || 0).toLocaleString()} rows`)}${c.pick(a.labels[xi])}/>${c.vis.labels && cw > 26 && ch > 14 && v ? `<text x="${(L + xi * cw + cw / 2).toFixed(1)}" y="${(T + yi * ch + ch / 2 + 4).toFixed(1)}" class="sv-in" style="fill:${(v || 0) / mx > 0.5 ? '#fff' : '#12222e'}">${h(c.f(v))}</text>` : ''}`); }); });
  const every = Math.max(1, Math.ceil(a.labels.length / Math.floor((c.W - L) / 40))); a.labels.forEach((l, xi) => { if (!(xi % every)) c.add(`<text x="${(L + xi * cw + cw / 2).toFixed(1)}" y="${c.H - 8}" class="sv-ax" text-anchor="middle">${h(SC.short(l, a.grain).slice(0, 8))}</text>`); });
};
SC.R.radar = c => {
  const a = c.agg({ top: Math.min(+c.vis.top || 8, 12), other: false }); if (a.labels.length < 3) return c.empty('A radar needs at least 3 values on X.'); SC.seriesLegend(c, a); const lh = c.legendItems ? 28 : 0;
  const n = a.labels.length; const cx = c.W / 2, cy = (c.H - lh) / 2 + 4, R = Math.min(c.W / 2 - 70, (c.H - lh) / 2 - 18); const mx = Math.max(1e-9, ...a.series.flatMap(s => s.values.map(v => v || 0))); const ang = i => -Math.PI / 2 + (i / n) * Math.PI * 2;
  [0.25, 0.5, 0.75, 1].forEach(f => c.add(`<polygon points="${a.labels.map((_, i) => `${(cx + R * f * Math.cos(ang(i))).toFixed(1)},${(cy + R * f * Math.sin(ang(i))).toFixed(1)}`).join(' ')}" fill="none" class="sv-grid"/>`));
  a.labels.forEach((l, i) => c.add(`<line x1="${cx}" y1="${cy}" x2="${(cx + R * Math.cos(ang(i))).toFixed(1)}" y2="${(cy + R * Math.sin(ang(i))).toFixed(1)}" class="sv-grid"/><text x="${(cx + (R + 10) * Math.cos(ang(i))).toFixed(1)}" y="${(cy + (R + 10) * Math.sin(ang(i)) + 4).toFixed(1)}" class="sv-ax" text-anchor="${Math.cos(ang(i)) > 0.2 ? 'start' : Math.cos(ang(i)) < -0.2 ? 'end' : 'middle'}">${h(SC.short(l, a.grain))}</text>`));
  a.series.forEach((s, si) => { const col = c.P[(s.ci != null ? s.ci : si) % c.P.length]; const pts = s.values.map((v, i) => [cx + R * ((v || 0) / mx) * Math.cos(ang(i)), cy + R * ((v || 0) / mx) * Math.sin(ang(i))]);
    c.add(`<polygon points="${pts.map(p => p.map(x => x.toFixed(1)).join(',')).join(' ')}" fill="${col}" fill-opacity=".15" stroke="${col}" stroke-width="2"/>` + pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="${col}" class="sv-hit"${c.tip(`${a.labels[i]}`, [[col, s.name, s.values[i] == null ? '<5' : c.f(s.values[i])]])}${c.pick(a.labels[i])}/>`).join('')); });
};
/* Sankey: flows from X (left) to Split by (right); band thickness = rows */
SC.R.sankey = c => {
  const v = c.vis; if (!v.split) return c.empty('Pick X (left side) and "Split by" (right side).');
  const pair = new Map(), L = new Map(), Rr = new Map(); for (const r of c.rows) { const a = String(r[v.x] ?? '') || '(blank)', b = String(r[v.split] ?? '') || '(blank)'; L.set(a, (L.get(a) || 0) + 1); Rr.set(b, (Rr.get(b) || 0) + 1); const k = a + '\u0001' + b; pair.set(k, (pair.get(k) || 0) + 1); }
  const top = (m, n) => new Set([...m.entries()].sort((p, q) => q[1] - p[1]).slice(0, n).map(e => e[0])); const lt = top(L, 8), rt = top(Rr, 8); const nm = (s, set) => set.has(s) ? s : 'Other';
  const links = new Map(); for (const [k, n] of pair) { const [a, b] = k.split('\u0001'); const kk = nm(a, lt) + '\u0001' + nm(b, rt); links.set(kk, (links.get(kk) || 0) + n); }
  for (const [k, n] of [...links]) if (c.small(n)) links.delete(k);
  const lefts = new Map(), rights = new Map(); for (const [k, n] of links) { const [a, b] = k.split('\u0001'); lefts.set(a, (lefts.get(a) || 0) + n); rights.set(b, (rights.get(b) || 0) + n); }
  const tot = [...lefts.values()].reduce((p, q) => p + q, 0); if (!tot) return c.empty();
  const order = m => [...m.entries()].sort((p, q) => (p[0] === 'Other') - (q[0] === 'Other') || q[1] - p[1]);
  const nw = 12, gap = 6; const lw = Math.min(150, c.W * 0.22); const x0 = lw, x1 = c.W - lw; const H = c.H - 6; const scale = (H - gap * (Math.max(lefts.size, rights.size) - 1)) / tot;
  const place = (m) => { let y = 3; const pos = new Map(); for (const [k, n] of order(m)) { pos.set(k, { y, h: n * scale, off: 0, n }); y += n * scale + gap; } return pos; };
  const PL = place(lefts), PR = place(rights); const li = new Map(order(lefts).map(([k], i) => [k, i]));
  const sortedLinks = [...links.entries()].map(([k, n]) => { const [a, b] = k.split('\u0001'); return { a, b, n }; }).sort((p, q) => li.get(p.a) - li.get(q.a) || [...PR.keys()].indexOf(p.b) - [...PR.keys()].indexOf(q.b));
  for (const l of sortedLinks) { const A = PL.get(l.a), B = PR.get(l.b); const th = l.n * scale; const ya = A.y + A.off + th / 2, yb = B.y + B.off + th / 2; A.off += th; B.off += th; const col = c.P[li.get(l.a) % c.P.length]; const mx = (x0 + nw + x1) / 2;
    c.add(`<path d="M${x0 + nw},${ya.toFixed(1)}C${mx},${ya.toFixed(1)} ${mx},${yb.toFixed(1)} ${x1},${yb.toFixed(1)}" fill="none" stroke="${col}" stroke-opacity=".32" stroke-width="${Math.max(1, th).toFixed(1)}" class="sv-hit sv-link"${c.tip(`${l.a} → ${l.b}`, [[col, 'Rows', l.n.toLocaleString()], [null, `Share of ${l.a}`, Math.round((l.n / lefts.get(l.a)) * 100) + '%'], [null, `Share of ${l.b}`, Math.round((l.n / rights.get(l.b)) * 100) + '%']])}${c.pick(l.a)}/>`); }
  for (const [k, p] of PL) { const col = c.P[li.get(k) % c.P.length]; c.add(`<rect x="${x0}" y="${p.y.toFixed(1)}" width="${nw}" height="${Math.max(1, p.h).toFixed(1)}" fill="${col}"/><text x="${x0 - 6}" y="${(p.y + p.h / 2 + 4).toFixed(1)}" class="sv-ax" text-anchor="end">${h(SC.short(k))} · ${p.n.toLocaleString()}</text>`); }
  for (const [k, p] of PR) c.add(`<rect x="${x1}" y="${p.y.toFixed(1)}" width="${nw}" height="${Math.max(1, p.h).toFixed(1)}" fill="#5b6b78"/><text x="${x1 + nw + 6}" y="${(p.y + p.h / 2 + 4).toFixed(1)}" class="sv-ax">${h(SC.short(k))} · ${p.n.toLocaleString()}</text>`);
};
/* pivot matrix: X down, Split by across, coloured cells, totals */
SC.R.matrix = c => {
  const a = c.agg({ top: +c.vis.top || 0 }); if (!a.labels.length) return c.empty(); const ser = a.all.slice(0, 14); const sum = c.vis.fn === 'count' || c.vis.fn === 'sum';
  const mx = Math.max(1e-9, ...ser.flatMap(s => s.values.map(v => v || 0))); const rowT = a.labels.map((_, i) => ser.reduce((t, s) => t + (s.values[i] || 0), 0)); const colT = ser.map(s => s.values.reduce((t, v) => t + (v || 0), 0));
  const cell = (v, n, l, s) => `<td class="num sv-mc${c.ctx.onPick ? ' click' : ''}" style="background:${v == null ? '#f6f8f9' : `rgba(14,124,134,${(0.06 + 0.7 * (v || 0) / mx).toFixed(3)})`};color:${(v || 0) / mx > 0.62 ? '#fff' : 'inherit'}"${c.tip(`${l} · ${s}`, [[null, SD.measureName(c.vis, c.ds), v == null ? (n ? '<5' : '–') : c.f(v)]], n ? `${n.toLocaleString()} rows` : '')}${c.pick(l)}>${v == null ? (n ? '&lt;5' : '') : h(c.f(v))}</td>`;
  c.html(`<div class="sv-tbl"><table class="tbl sv-matrix"><thead><tr><th>${h(Studio.label(c.vis.x))} \\ ${h(Studio.label(c.vis.split))}</th>${ser.map(s => `<th class="num">${h(SC.short(s.name))}</th>`).join('')}${sum ? '<th class="num">Total</th>' : ''}</tr></thead><tbody>${a.labels.map((l, i) => `<tr><td><b>${h(SC.long(l, a.grain))}</b></td>${ser.map(s => cell(s.values[i], s.counts[i], l, s.name)).join('')}${sum ? `<td class="num"><b>${h(c.f(rowT[i]))}</b></td>` : ''}</tr>`).join('')}</tbody>${sum ? `<tfoot><tr><td>Total</td>${colT.map(t => `<td class="num">${h(c.f(t))}</td>`).join('')}<td class="num">${h(c.f(colT.reduce((p, q) => p + q, 0)))}</td></tr></tfoot>` : ''}</table></div>`);
};
SC.R.table = c => {
  const a = c.agg(); if (!a.labels.length) return c.empty(); const ser = a.all; const one = ser.length === 1; const s0 = ser[0]; const tot = s0.values.reduce((t, v) => t + (v || 0), 0) || 1; const mx = Math.max(1e-9, ...ser.flatMap(s => s.values.map(v => v || 0)));
  c.html(`<div class="sv-tbl"><table class="tbl"><thead><tr><th>${h(Studio.label(c.vis.x) || 'Value')}</th>${ser.map(s => `<th class="num">${h(s.name)}</th>`).join('')}${one && (c.vis.fn === 'count' || c.vis.fn === 'sum') ? '<th class="num">Share</th>' : ''}<th class="num">Rows</th></tr></thead><tbody>${a.labels.map((l, i) => `<tr class="${c.ctx.onPick ? 'click' : ''}"${c.pick(l)}><td>${h(SC.long(l, a.grain))}</td>${ser.map((s, si) => `<td class="num sv-db"><span class="sv-bar" style="width:${Math.round(((s.values[i] || 0) / mx) * 100)}%;background:${c.P[si % c.P.length]}"></span><span class="sv-dv">${s.values[i] == null ? '&lt;5' : h(c.f(s.values[i]))}</span></td>`).join('')}${one && (c.vis.fn === 'count' || c.vis.fn === 'sum') ? `<td class="num">${s0.values[i] == null ? '–' : U.num(((s0.values[i] || 0) / tot) * 100, 1) + '%'}</td>` : ''}<td class="num muted">${ser.reduce((t, s) => t + (s.counts[i] || 0), 0).toLocaleString()}</td></tr>`).join('')}</tbody></table></div>`);
};

/* gallery icons and one-line descriptions (shown in the visual editor) */
SC.ICONS = { kpi: '123', kpitrend: '📈', gauge: '◔', bullet: '▭', bar: '▮▮', hbar: '☰', grouped: '▮▯', stacked: '▤', hstacked: '▬', pct: '%', lollipop: '⚲', dot: '•—', dumbbell: '●─●', diverging: '⇆', radialbar: '◎', pareto: '⫼', waterfall: '⊟', line: '╱', smooth: '∿', step: '⎍', area: '◢', stackarea: '▲', pctarea: '◭', combo: '▮╱', movavg: '〰', forecast: '⇢', band: '≋', control: '⊶', run: '⇄', calendar: '▦', sparkgrid: '⊞', pie: '◕', donut: '◍', halfdonut: '◠', treemap: '▚', sunburst: '✺', waffle: '▩', funnel: '⏷', histogram: '▁▃▅', box: '⊡', strip: '⁘', ecdf: '⌐', scatter: '⁙', trendscatter: '⁄', bubble: '⚬', heat: '▓', radar: '✶', sankey: '⫸', matrix: '⊞', table: '≡' };
SC.DESC = {
  kpi: 'One number — count, total, average or most common value. Add a target to colour it.', kpitrend: 'The latest period, its change vs the one before, and a small trend line.', gauge: 'A value on a dial, with a target marker.', bullet: 'Each group as a bar against the target, with shaded ranges.',
  bar: 'Compare groups side by side.', hbar: 'Compare many groups with long names.', grouped: 'Each group split into coloured columns.', stacked: 'Totals made of parts.', hstacked: 'Totals made of parts, as horizontal bars.', pct: 'The mix inside each group (adds to 100%).', lollipop: 'A lighter bar chart: a line and a dot.', dot: 'Dots on a line — easy to compare several measures.', dumbbell: 'Two values per group joined by a line (e.g. Male vs Female).', diverging: 'How far each group is above or below the average.', radialbar: 'Groups as rings — good for a few top items.',
  pareto: 'Biggest first with the cumulative % — which few cause 80%.', waterfall: 'How each part adds up to the total.',
  line: 'A trend over time.', smooth: 'A trend with a smoothed line.', step: 'Changes that happen in steps (levels, counts).', area: 'A trend with the area filled.', stackarea: 'Parts stacked over time.', pctarea: 'The mix over time (adds to 100%).', combo: 'Columns for one measure, a line for another on its own axis.', movavg: 'The trend with a moving average to remove noise.', forecast: 'The next 3 periods (Holt trend method) with a likely range.', band: 'Lowest, average and highest per period.', control: 'Quality control (SPC): mean and limits at ±3 standard deviations; red points need a look.', run: 'Median line; 6+ points in a row on one side mark a real shift.',
  calendar: 'One square per day for the last year — spot busy days and weeks.', sparkgrid: 'One small trend per group, side by side.',
  pie: 'Share of the whole (best with 2–6 parts).', donut: 'Share of the whole with the total in the middle.', halfdonut: 'A compact half-circle share chart.', treemap: 'Share of the whole as boxes — works with many parts.', sunburst: 'Two levels of share: inner ring and outer ring.', waffle: '100 squares — each square is 1%.', funnel: 'Steps that get smaller (e.g. referred → seen → admitted).',
  histogram: 'How values are spread (e.g. waiting times), with mean and median.', box: 'Spread per group: median, middle half, range and outliers.', strip: 'Every value as a dot, per group.', ecdf: 'What share of rows are at or below a value (e.g. 90% seen within X minutes).', scatter: 'Two numbers against each other.', trendscatter: 'Scatter with a trend line and how strong the link is (R²).', bubble: 'Scatter where the dot size is a third number.',
  heat: 'Two categories as a grid of colour (e.g. weekday × hour).', radar: 'Several measures around a circle — compare profiles.', sankey: 'Flows from one category to another (e.g. triage → disposition).', matrix: 'A pivot table with coloured cells and totals.', table: 'A table with bars inside the cells.',
};
