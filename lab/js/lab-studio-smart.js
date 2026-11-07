/* MAHAM Lab — Studio, the smarter parts: why did it change, unusual points, ask in words, written summary,
 * is a difference real (Welch's t-test), and a correlation chart. No internet, no AI service — plain statistics. */
'use strict';

const SS = {
  /* ---------- unusual points: far from the median (robust z-score, MAD) ---------- */
  anomalies(vals, k = 3.5) {
    const v = vals.filter(x => x != null && isFinite(x)); if (v.length < 6) return new Set();
    const s = v.slice().sort((a, b) => a - b); const med = SC.q(s, 0.5); const mad = SC.q(s.map(x => Math.abs(x - med)).sort((a, b) => a - b), 0.5) * 1.4826;
    const out = new Set(); if (!mad) return out; vals.forEach((x, i) => { if (x != null && Math.abs(x - med) / mad > k) out.add(i); }); return out;
  },
  /* ---------- why did it change? split the change between two periods by every category column ---------- */
  why(ds, rows, v) {
    const x = Studio.col(v.x); if (!x || x.type !== 'date') return { error: 'Pick a chart with a date on the X axis.' };
    const grain = v.grain || 'month'; const fn = v.fn === 'top' ? 'count' : (v.fn || 'count');
    const per = new Map(); for (const r of rows) { const k = SD.bucket(r[x.key], grain); if (k === '(blank)') continue; let a = per.get(k); if (!a) per.set(k, a = []); a.push(r); }
    let ps = [...per.keys()].sort(); const cur = SD.bucket(U.todayStr(), grain); if (ps[ps.length - 1] === cur && ps.length > 2) ps = ps.slice(0, -1);
    if (ps.length < 2) return { error: 'Needs at least two periods.' };
    const [pa, pb] = [ps[ps.length - 2], ps[ps.length - 1]]; const A = per.get(pa), B = per.get(pb);
    const tA = SD.calc(fn, A, v.field), tB = SD.calc(fn, B, v.field); const delta = (tB || 0) - (tA || 0);
    const add = fn === 'count' || fn === 'sum' || (typeof fn === 'string' && fn.startsWith('m:') && ['count', 'sum'].includes(((ds.measures || []).find(m => 'm:' + m.id === fn) || {}).kind));
    const cols = ds.cols.filter(c => c.type === 'category' && !c.coded && c.key !== x.key).map(c => {
      const g = (list) => { const m = new Map(); for (const r of list) { const k = String(r[c.key] ?? '') || '(blank)'; let a = m.get(k); if (!a) m.set(k, a = []); a.push(r); } return m; };
      const ga = g(A), gb = g(B); const keys = new Set([...ga.keys(), ...gb.keys()]); if (keys.size < 2 || keys.size > 60) return null;
      const items = [...keys].map(k => { const a = ga.get(k) || [], b = gb.get(k) || []; const va = add ? (SD.calc(fn, a, v.field) || 0) : SD.calc(fn, a, v.field), vb = add ? (SD.calc(fn, b, v.field) || 0) : SD.calc(fn, b, v.field);
        // for averages: the effect of this group = how its value changed, weighted by its share of rows
        const eff = add ? vb - va : (va != null && vb != null ? (vb - va) * (b.length / (B.length || 1)) : 0); return { k, va, vb, eff, na: a.length, nb: b.length }; }).filter(o => !(SD.small(ds, o.na) && SD.small(ds, o.nb)));
      items.sort((p, q) => Math.abs(q.eff) - Math.abs(p.eff)); const top = items.slice(0, 5); const explained = delta ? top.slice(0, 3).reduce((s, o) => s + o.eff, 0) / delta : 0;
      return { c, top, score: Math.min(1.5, Math.abs(explained)) * (Math.abs(top[0] ? top[0].eff : 0)) };
    }).filter(Boolean).sort((p, q) => q.score - p.score).slice(0, 4);
    return { pa, pb, tA, tB, delta, grain, fn, cols, add };
  },
  /* ---------- ask in words → a visual ---------- */
  ask(ds, text) {
    const t = ' ' + String(text || '').toLowerCase().replace(/[?.!,]/g, ' ') + ' ';
    const words = s => s.toLowerCase().replace(/[()·\-_/]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'per', 'for', 'of'].includes(w));
    const score = c => { const w = words(c.label); return w.length ? w.filter(x => t.includes(' ' + x) || t.includes(x)).length / w.length : 0; };
    const best = (pred, avoid) => ds.cols.filter(c => pred(c) && c.key !== avoid).map(c => [c, score(c)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1])[0];
    let fn = /\b(average|avg|mean)\b/.test(t) ? 'avg' : /\bmedian\b/.test(t) ? 'median' : /\b(total|sum)\b/.test(t) ? 'sum' : /\b(max|maximum|highest|longest)\b/.test(t) ? 'max' : /\b(min|minimum|lowest|shortest)\b/.test(t) ? 'min' : /\b(distinct|unique|different)\b/.test(t) ? 'distinct' : 'count';
    const ms = (ds.measures || []).map(m => [m, words(m.name).filter(w => t.includes(w)).length / Math.max(1, words(m.name).length)]).filter(x => x[1] >= 0.6).sort((a, b) => b[1] - a[1])[0];
    let x = null, grain = '', type = '';
    const byM = /\b(?:by|per|for each|across|split by)\s+(.+?)(?:\s+(?:in|over|during|last|this|top|as|for|from|since)\b|$)/.exec(t);
    if (/\b(per|by|each)\s+(day|daily)\b|\bdaily\b/.test(t)) grain = 'day'; else if (/\b(per|by|each)\s+week\b|\bweekly\b/.test(t)) grain = 'week'; else if (/\b(per|by|each)\s+year\b|\byearly\b|\bannual/.test(t)) grain = 'year'; else if (/\b(per|by|each)\s+month\b|\bmonthly\b|\btrend\b|\bover time\b/.test(t)) grain = 'month';
    const d = ds.cols.find(c => c.type === 'date');
    if (grain && d) x = (best(c => c.type === 'date') || [d])[0];
    else if (byM) { const part = ' ' + byM[1] + ' '; const c = ds.cols.filter(c => c.type === 'category' || c.type === 'date').map(c => [c, words(c.label).filter(w => part.includes(w)).length / Math.max(1, words(c.label).length)]).filter(z => z[1] > 0).sort((a, b) => b[1] - a[1])[0]; if (c) x = c[0]; }
    let field = null; if (fn !== 'count') { const f = best(c => c.type === 'number' || (fn === 'distinct' && (c.type === 'category' || c.type === 'id')), x && x.key); if (f) field = f[0]; else if (fn !== 'distinct') return { error: `Which number column? I could not find one in "${text}".` }; }
    if (fn === 'count' && /\b(how long|time|wait|los|duration|minutes|hours)\b/.test(t)) { const f = best(c => c.type === 'number', x && x.key); if (f) { fn = 'avg'; field = f[0]; } }
    if (ms) { fn = 'm:' + ms[0].id; field = null; }
    const top = (/\btop\s+(\d+)/.exec(t) || [])[1]; const last = /\b(?:last|past)\s+(\d+)?\s*(day|week|month|year)s?\b/.exec(t);
    for (const [re, ty] of [[/\bpie\b/, 'pie'], [/\bdonut\b/, 'donut'], [/\bline\b/, 'line'], [/\barea\b/, 'area'], [/\b(column|bar chart|columns)\b/, 'bar'], [/\bbars?\b/, 'hbar'], [/\btable\b/, 'table'], [/\btreemap\b/, 'treemap'], [/\bheat ?map\b/, 'heat'], [/\bbox ?plot\b/, 'box'], [/\bhistogram\b|\bspread\b|\bdistribution\b/, 'histogram'], [/\bforecast\b|\bpredict\b|\bnext month/, 'forecast'], [/\bcontrol chart\b|\bspc\b/, 'control'], [/\bpareto\b|\b80\/20\b/, 'pareto']]) if (re.test(t)) { type = ty; break; }
    if (/\b(share|percent|%|proportion)\b/.test(t) && !type && x && x.type === 'category') type = 'donut';
    if (!type) type = x ? (x.type === 'date' ? 'line' : 'hbar') : 'kpi';
    if (type === 'histogram' && !field) { const f = best(c => c.type === 'number'); if (!f) return { error: 'A spread needs a number column.' }; field = f[0]; }
    if (['line', 'area', 'forecast', 'control'].includes(type) && (!x || x.type !== 'date') && d) { x = d; grain = grain || 'month'; }
    const v = { id: 'v' + Math.random().toString(36).slice(2, 8), type, fn: type === 'histogram' ? 'count' : fn, field: field ? field.key : '', x: x ? x.key : '', grain: x && x.type === 'date' ? (grain || 'month') : undefined, top: top ? +top : (x && x.type !== 'date' ? 12 : 0), w: type === 'kpi' ? 1 : 2, sort: 'value' };
    if (last && d) { const n = +(last[1] || 1); const unit = last[2]; const from = unit === 'day' ? U.addDays(U.todayStr(), -n) : unit === 'week' ? U.addDays(U.todayStr(), -7 * n) : unit === 'year' ? U.addDays(U.todayStr(), -365 * n) : (() => { const dt = new Date(); dt.setMonth(dt.getMonth() - n); return U.ds(dt); })(); v.since = from; v.sinceKey = d.key; }
    v.title = (text || '').trim().replace(/^./, c => c.toUpperCase()).slice(0, 80);
    const how = `${SD.measureName(v, ds)}${v.x ? ` by ${Studio.label(v.x)}${v.grain ? ' (' + v.grain + ')' : ''}` : ''}${v.since ? ` since ${U.fmtDate(v.since)}` : ''}${v.top ? ` · top ${v.top}` : ''} · ${(SC.TYPES.find(z => z[0] === type) || [, type])[1]}`;
    return { vis: v, how };
  },
  /* ---------- the written summary of a dashboard ---------- */
  summary(ds, rows, visuals) {
    const out = []; const F = Studio.filters; const parts = [];
    for (const [k, v] of Object.entries(F.slicers || {})) if (v && v.length) parts.push(`${Studio.label(k)}: ${v.join(', ')}`);
    if (F.range && (F.range.from || F.range.to)) parts.push(`${Studio.label(F.range.key)} ${F.range.from ? 'from ' + U.fmtDate(F.range.from) : ''} ${F.range.to ? 'to ' + U.fmtDate(F.range.to) : ''}`.trim());
    out.push(`${ds.name}: ${rows.length.toLocaleString()} rows${parts.length ? ` (filtered — ${parts.join('; ')})` : ''}.`);
    for (const i of SD.insights(ds, rows)) out.push(i.text);
    for (const v of visuals.filter(z => z.type !== 'text').slice(0, 10)) {
      try {
        const r = Studio.rowsFor(v); if (['kpi', 'gauge'].includes(v.type)) { const val = SD.calc(v.fn, r, v.field); out.push(`${v.title}: ${typeof val === 'number' ? SC.f(val, v) : val}${v.target != null && v.target !== '' ? ` (target ${SC.f(+v.target, v)})` : ''}.`); continue; }
        if (!v.x || ['scatter', 'trendscatter', 'bubble', 'histogram', 'ecdf', 'corr', 'sankey', 'calendar'].includes(v.type)) continue;
        const a = SD.aggregate(ds, r, Object.assign({}, v, { split: '' })); const s = a.series[0]; if (!a.labels.length) continue;
        if (a.grain) { const vals = s.values; const n = vals.length; const cur = SD.bucket(U.todayStr(), a.grain); const end = a.labels[n - 1] === cur && n > 2 ? n - 1 : n; if (end < 2) continue;
          const last = vals[end - 1], prev = vals[end - 2]; const first = vals[0]; const ch = prev ? (last - prev) / Math.abs(prev) : null;
          out.push(`${v.title}: ${SC.short(a.labels[end - 1], a.grain)} was ${SC.f(last, v)}${ch != null ? `, ${ch >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(ch * 100))}% on ${SC.short(a.labels[end - 2], a.grain)}` : ''}; over the whole period it went from ${SC.f(first, v)} to ${SC.f(last, v)}.`); }
        else { const tot = s.values.reduce((p, q) => p + (q || 0), 0); const i = s.values.indexOf(Math.max(...s.values.map(x => x || 0)));
          out.push(`${v.title}: highest is ${a.labels[i]} (${SC.f(s.values[i], v)}${(v.fn === 'count' || v.fn === 'sum') && tot ? `, ${Math.round((s.values[i] / tot) * 100)}% of the total` : ''})${a.labels.length > 1 ? `; lowest shown is ${a.labels[a.labels.length - 1] === 'Other' ? a.labels[a.labels.length - 2] : a.labels[a.labels.length - 1]}` : ''}.`); }
      } catch (e) { /* skip a card that cannot be summarised */ }
    }
    return out;
  },
  /* ---------- is the difference real? Welch's t-test ---------- */
  lnGamma(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp); let ser = 1.000000000190015; for (const k of c) ser += k / ++y; return -tmp + Math.log((2.5066282746310005 * ser) / x); },
  betacf(a, b, x) { let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d; let hh = d; for (let m = 1; m <= 200; m++) { const m2 = 2 * m; let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; hh *= d * c; aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; const del = d * c; hh *= del; if (Math.abs(del - 1) < 3e-7) break; } return hh; },
  ibeta(a, b, x) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(SS.lnGamma(a + b) - SS.lnGamma(a) - SS.lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? (bt * SS.betacf(a, b, x)) / a : 1 - (bt * SS.betacf(b, a, 1 - x)) / b; },
  tTest(a, b) {
    const st = v => { const n = v.length, m = v.reduce((p, q) => p + q, 0) / n, s2 = v.reduce((p, q) => p + (q - m) ** 2, 0) / Math.max(1, n - 1); return { n, m, s2, med: SC.q(v.slice().sort((x, y) => x - y), 0.5) }; };
    const A = st(a), B = st(b); if (A.n < 2 || B.n < 2) return null; const se = Math.sqrt(A.s2 / A.n + B.s2 / B.n); if (!se) return { A, B, p: A.m === B.m ? 1 : 0, diff: B.m - A.m, lo: B.m - A.m, hi: B.m - A.m };
    const t = (B.m - A.m) / se; const df = (A.s2 / A.n + B.s2 / B.n) ** 2 / ((A.s2 / A.n) ** 2 / Math.max(1, A.n - 1) + (B.s2 / B.n) ** 2 / Math.max(1, B.n - 1));
    const p = SS.ibeta(df / 2, 0.5, df / (df + t * t)); const tc = df > 120 ? 1.98 : df > 30 ? 2.04 : df > 10 ? 2.23 : 2.57;
    return { A, B, t, df, p, diff: B.m - A.m, lo: B.m - A.m - tc * se, hi: B.m - A.m + tc * se };
  },
  verdict(p) { return p < 0.01 ? ['Very likely a real difference', 'good'] : p < 0.05 ? ['Probably a real difference', 'good'] : p < 0.1 ? ['Weak sign of a difference — collect more data', 'warn'] : ['Could easily be chance — no clear difference', '']; },
  /* ---------- correlation between number columns ---------- */
  corr(ds, rows) {
    const nums = ds.cols.filter(c => c.type === 'number' && !c.coded).slice(0, 10); const out = [];
    for (let i = 0; i < nums.length; i++) for (let j = 0; j < nums.length; j++) {
      let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0; for (const r of rows) { const x = r[nums[i].key], y = r[nums[j].key]; if (typeof x !== 'number' || typeof y !== 'number') continue; n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; }
      const cov = sxy - (sx * sy) / (n || 1), vx = sxx - (sx * sx) / (n || 1), vy = syy - (sy * sy) / (n || 1); out.push({ i, j, n, r: n > 2 && vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : null });
    }
    return { nums, cells: out };
  },
};

/* the correlation chart (51st type, in the Matrix group) */
SC.TYPES.push(['corr', 'Correlation matrix', 'Matrix']);
SC.NEED.corr = { x: 0, split: 0, fn: 0, field: 0 };
SC.ICONS.corr = '⊠'; SC.DESC.corr = 'How strongly every pair of number columns moves together (−1 to +1).';
SC.R.corr = c => {
  const { nums, cells } = SS.corr(c.ds, c.rows); if (nums.length < 2) return c.empty('Needs at least two number columns.');
  const n = nums.length; const L = Math.min(150, Math.max(...nums.map(x => x.label.length)) * 6.4 + 10); const T = 6, B = 64; const cs = Math.max(14, Math.min((c.W - L - 8) / n, (c.H - T - B) / n));
  const col = r => r == null ? '#eef2f4' : r >= 0 ? `rgba(14,124,134,${Math.abs(r).toFixed(2)})` : `rgba(192,67,106,${Math.abs(r).toFixed(2)})`;
  nums.forEach((x, i) => { c.add(`<text x="${L - 6}" y="${(T + i * cs + cs / 2 + 4).toFixed(1)}" class="sv-ax" text-anchor="end">${h(SC.short(x.label))}</text><text transform="translate(${(L + i * cs + cs / 2).toFixed(1)},${T + n * cs + 8}) rotate(-40)" class="sv-ax" text-anchor="end">${h(SC.short(x.label))}</text>`); });
  for (const e of cells) { const strength = e.r == null ? '–' : Math.abs(e.r) >= 0.7 ? 'strong' : Math.abs(e.r) >= 0.4 ? 'moderate' : Math.abs(e.r) >= 0.2 ? 'weak' : 'none'; c.add(`<rect x="${(L + e.j * cs + 1).toFixed(1)}" y="${(T + e.i * cs + 1).toFixed(1)}" width="${(cs - 2).toFixed(1)}" height="${(cs - 2).toFixed(1)}" rx="2" fill="${col(e.r)}" class="sv-hit"${c.tip(`${nums[e.i].label} × ${nums[e.j].label}`, [[null, 'Correlation (r)', e.r == null ? '–' : U.num(e.r, 2)], [null, 'Link', strength + (e.r != null && e.r < 0 && strength !== 'none' ? ' (opposite)' : '')]], `${e.n.toLocaleString()} rows with both`)}/>${cs > 30 && e.r != null ? `<text x="${(L + e.j * cs + cs / 2).toFixed(1)}" y="${(T + e.i * cs + cs / 2 + 4).toFixed(1)}" class="sv-in" style="fill:${Math.abs(e.r) > 0.5 ? '#fff' : '#12222e'}">${U.num(e.r, 2)}</text>` : ''}`); }
};
