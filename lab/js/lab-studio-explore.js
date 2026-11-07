/* MAHAM Lab — Studio experimenting tools: findings notebook, what-if, seasonality, what drives a number,
 * before / after a go-live, data dictionary, and a findings file for MAHAM. Calculations in SX, screens on Studio. */
'use strict';

const SX = {
  WD: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  /* a small in-memory table so the chart engine can draw computed results */
  tmp(name, cols, rows) { return { id: 'tmp', name, cols: cols.map(([key, type, order]) => ({ key, label: key, type, order })), rows, smallCells: false }; },
  draw(el, ds, vis) { const prev = SD.cur; SD.cur = ds; try { SC.draw(el, Object.assign({ id: 'x' + Math.random().toString(36).slice(2, 7), top: 0, sort: 'label', w: 1, fmt: 'auto', palette: 'teal' }, vis), { ds, rows: ds.rows, onPick: null, noAnim: true, redraw: () => {} }); } catch (e) { el.textContent = e.message; } finally { SD.cur = prev; } },
  mean: v => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null),
  median: v => { if (!v.length) return null; const s = v.slice().sort((a, b) => a - b); return SC.q(s, 0.5); },
  nums: (rows, k) => { const o = []; for (const r of rows) { const v = r[k]; if (typeof v === 'number' && isFinite(v)) o.push(v); } return o; },
  pct: (a, b) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / Math.abs(b)) * 100)}%` : '–'),
  /* the measure picker shared by the tools: count of rows, average / median of a number column, or a saved measure */
  measures(ds) { return [['count', 'Number of rows'], ...ds.cols.filter(c => c.type === 'number').flatMap(c => [['avg:' + c.key, `Average ${c.label}`], ['median:' + c.key, `Median ${c.label}`]]), ...(ds.measures || []).map(m => ['m:' + m.id, '★ ' + m.name])]; },
  value(m, rows) { if (m === 'count') return rows.length; if (m.startsWith('m:')) return SD.measureCalc(SD.cur, m.slice(2), rows); const [fn, k] = [m.slice(0, m.indexOf(':')), m.slice(m.indexOf(':') + 1)]; const v = SX.nums(rows, k); return fn === 'median' ? SX.median(v) : SX.mean(v); },
  mLabel(ds, m) { return (SX.measures(ds).find(x => x[0] === m) || [, m])[1]; },
  byDay(rows, dateKey) { const g = new Map(); for (const r of rows) { const d = String(r[dateKey] || '').slice(0, 10); if (d.length === 10) (g.get(d) || g.set(d, []).get(d)).push(r); } return g; },
  daysBetween(a, b) { const o = []; let d = a; let guard = 0; while (d <= b && guard++ < 4000) { o.push(d); d = U.addDays(d, 1); } return o; },

  /* ---------- what-if: move every value and see how many meet a target ---------- */
  whatIf(rows, key, dir, target, mode, step, grp) {
    const ok = v => (dir === 'le' ? v <= target : v >= target); const nonNeg = SX.nums(rows, key).every(v => v >= 0);
    const move = v => { const x = mode === 'pct' ? v * (1 + step / 100) : v + step; return nonNeg ? Math.max(0, x) : x; };
    const pairs = []; for (const r of rows) { const v = r[key]; if (typeof v === 'number' && isFinite(v)) pairs.push([v, grp ? String(r[grp] ?? '') || '(blank)' : '']); }
    const sum = list => { const b = list.filter(p => ok(p[0])).length, a = list.filter(p => ok(move(p[0]))).length; const vs = list.map(p => p[0]); return { n: list.length, b, a, avgB: SX.mean(vs), avgA: SX.mean(vs.map(move)), medB: SX.median(vs), medA: SX.median(vs.map(move)) }; };
    const all = sum(pairs); let groups = [];
    if (grp) { const m = new Map(); for (const p of pairs) (m.get(p[1]) || m.set(p[1], []).get(p[1])).push(p); groups = [...m.entries()].map(([k, l]) => Object.assign({ k }, sum(l))).sort((x, y) => y.n - x.n).slice(0, 10); }
    return { all, groups };
  },

  /* ---------- seasonality: trend, weekday pattern, hours, Ramadan / peak season, unusual days ---------- */
  season(ds, rows, dateKey, m) {
    const g = SX.byDay(rows, dateKey); const keys = [...g.keys()].sort(); if (keys.length < 21) return { error: 'Seasonality needs at least 3 weeks of dates.' };
    const days = SX.daysBetween(keys[0], keys[keys.length - 1]).map(d => { const l = g.get(d) || []; return { d, n: l.length, v: m === 'count' ? l.length : l.length ? SX.value(m, l) : null }; });
    const vals = days.map(x => x.v).filter(v => v != null); const avg = SX.mean(vals); if (!avg) return { error: 'No values to look at.' };
    const wdv = SX.WD.map(() => []); for (const x of days) if (x.v != null) wdv[U.pd(x.d).getDay()].push(x.v);
    const wdIdx = wdv.map(l => (l.length ? SX.mean(l) / avg : 1));
    // weekly trend (per-day average inside each week, so part weeks don't dip)
    const wk = new Map(); for (const x of days) { const w = SD.bucket(x.d, 'week'); (wk.get(w) || wk.set(w, []).get(w)).push(x); }
    const weekly = [...wk.entries()].map(([w, l]) => ({ w, v: m === 'count' ? SX.mean(l.map(x => x.v)) : SX.value(m, l.flatMap(x => g.get(x.d) || [])), full: l.length === 7 })).filter(x => x.v != null);
    // hours of the day (when the dates have times)
    const timed = rows.filter(r => String(r[dateKey] || '').length > 11).length > rows.length * 0.5; let hours = null;
    if (timed) { const hv = Array.from({ length: 24 }, () => []); for (const r of rows) { const s = String(r[dateKey] || ''); if (s.length > 11) hv[+s.slice(11, 13)].push(r); } hours = hv.map(l => (m === 'count' ? l.length / Math.max(1, days.length) : l.length ? SX.value(m, l) : null)); }
    // Ramadan / Peak season / normal days
    const sv = {}; for (const x of days) if (x.v != null) { const s = SD.calValue(x.d, 'season') || 'Normal'; (sv[s] = sv[s] || []).push(x.v); }
    const norm = sv.Normal ? SX.mean(sv.Normal) : avg; const seasons = Object.entries(sv).filter(([, l]) => l.length >= 5).map(([k, l]) => ({ k, n: l.length, v: SX.mean(l), diff: (SX.mean(l) - norm) / (norm || 1) }));
    // unusual days: far from a 7-day centred average adjusted for the weekday
    const exp = days.map((x, i) => { const w = days.slice(Math.max(0, i - 3), i + 4).map(y => y.v).filter(v => v != null); const base = SX.mean(w); const idxs = days.slice(Math.max(0, i - 3), i + 4).map(y => wdIdx[U.pd(y.d).getDay()]); return base == null ? null : base * (wdIdx[U.pd(x.d).getDay()] / (SX.mean(idxs) || 1)); });
    const res = days.map((x, i) => (x.v == null || exp[i] == null ? null : x.v - exp[i])); const flag = SS.anomalies(res, 3.5);
    const today = U.todayStr(); const odd = [...flag].filter(i => days[i].d !== today).map(i => ({ d: days[i].d, v: days[i].v, e: exp[i] })).sort((a, b) => Math.abs(b.v - b.e) - Math.abs(a.v - a.e)).slice(0, 10);
    // trend in words: last 8 full weeks vs the 8 before
    const fw = weekly.filter(x => x.full); let trend = null; if (fw.length >= 16) { const a = SX.mean(fw.slice(-16, -8).map(x => x.v)), b = SX.mean(fw.slice(-8).map(x => x.v)); trend = { a, b }; }
    return { days, avg, wdIdx, weekly, hours, seasons, odd, trend, timed };
  },

  /* ---------- what drives a number: each column on its own, then all together ---------- */
  drivers(ds, rows, target) {
    const T = ds.cols.find(c => c.key === target); let R = rows.filter(r => typeof r[target] === 'number' && isFinite(r[target]));
    if (R.length < 30) return { error: 'Needs at least 30 rows with a value.' };
    if (R.length > 30000) { const k = R.length / 30000; R = Array.from({ length: 30000 }, (_, i) => R[Math.floor(i * k)]); }
    const y = R.map(r => r[target]); const my = SX.mean(y); const sst = y.reduce((a, v) => a + (v - my) ** 2, 0); if (!sst) return { error: 'Every row has the same value — nothing to explain.' };
    const leak = c => c.key === target || c.coded || c.type === 'id' || (c.formula && c.formula.includes('[' + T.label + ']')) || (c.derived && (c.key.includes(T.key) || c.key.includes(T.label)));
    const out = [];
    for (const c of ds.cols) {
      if (leak(c)) continue;
      if (c.type === 'category') {
        const m = new Map(); R.forEach((r, i) => { const k = String(r[c.key] ?? '') || '(blank)'; const o = m.get(k) || m.set(k, { n: 0, s: 0 }).get(k); o.n++; o.s += y[i]; });
        if (m.size < 2 || m.size > 40) continue; let ssb = 0; const gs = []; for (const [k, o] of m) { const mean = o.s / o.n; ssb += o.n * (mean - my) ** 2; gs.push({ k, n: o.n, mean }); }
        const big = gs.filter(x => x.n >= Math.max(10, R.length * 0.01) && !SD.small(ds, x.n)).sort((a, b) => b.mean - a.mean);
        out.push({ c, kind: 'cat', score: ssb / sst, hi: big[0], lo: big[big.length - 1], groups: m.size });
      } else if (c.type === 'number') {
        const xs = [], ys = []; R.forEach((r, i) => { const v = r[c.key]; if (typeof v === 'number' && isFinite(v)) { xs.push(v); ys.push(y[i]); } }); if (xs.length < 30) continue;
        const mx = SX.mean(xs), m2 = SX.mean(ys); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - m2); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - m2) ** 2; } if (!sxx || !syy) continue;
        const r = sxy / Math.sqrt(sxx * syy); const sx = Math.sqrt(sxx / xs.length); const unit = 10 ** Math.floor(Math.log10(sx || 1)) || 1;
        out.push({ c, kind: 'num', score: r * r, r, per: unit, slope: (sxy / sxx) * unit });
      }
    }
    out.sort((a, b) => b.score - a.score); const top = out.filter(x => x.score >= 0.001).slice(0, 8);
    // all together: least squares on the top columns (categories as yes/no columns, the most common level as the base)
    const feats = []; for (const d of top) { if (d.kind === 'num') { const v = SX.nums(R, d.c.key); const m = SX.mean(v); const s = Math.sqrt(SX.mean(v.map(x => (x - m) ** 2))) || 1; feats.push(r => ((typeof r[d.c.key] === 'number' ? r[d.c.key] : m) - m) / s); } else { const cnt = {}; for (const r of R) { const k = String(r[d.c.key] ?? '') || '(blank)'; cnt[k] = (cnt[k] || 0) + 1; } const lv = Object.entries(cnt).sort((a, b) => b[1] - a[1]).filter(e => e[1] >= 20).slice(1, 13).map(e => e[0]); for (const l of lv) feats.push(r => ((String(r[d.c.key] ?? '') || '(blank)') === l ? 1 : 0)); } }
    let r2all = null; if (feats.length) { const p = feats.length + 1; const A = Array.from({ length: p }, () => new Float64Array(p)); const b = new Float64Array(p); const row = new Float64Array(p);
      R.forEach((r, i) => { row[0] = 1; for (let j = 0; j < feats.length; j++) row[j + 1] = feats[j](r); for (let a = 0; a < p; a++) { b[a] += row[a] * y[i]; for (let c2 = a; c2 < p; c2++) A[a][c2] += row[a] * row[c2]; } });
      for (let a = 0; a < p; a++) { for (let c2 = 0; c2 < a; c2++) A[a][c2] = A[c2][a]; A[a][a] += 1e-6 * R.length; }
      const beta = SX.solve(A, b); if (beta) { let sse = 0; R.forEach((r, i) => { let f = beta[0]; for (let j = 0; j < feats.length; j++) f += beta[j + 1] * feats[j](r); sse += (y[i] - f) ** 2; }); r2all = Math.max(0, 1 - sse / sst); } }
    return { n: R.length, mean: my, list: out.slice(0, 12), r2all, T };
  },
  solve(A, b) { const n = b.length; const M = A.map((r, i) => [...r, b[i]]); for (let i = 0; i < n; i++) { let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k; if (Math.abs(M[p][i]) < 1e-12) return null; [M[i], M[p]] = [M[p], M[i]]; for (let k = i + 1; k < n; k++) { const f = M[k][i] / M[i][i]; if (!f) continue; for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j]; } } const x = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; } return x; },

  /* ---------- before / after a go-live date ---------- */
  beforeAfter(ds, rows, o) {
    const g = SX.byDay(rows, o.dateKey); const keys = [...g.keys()].sort(); if (!keys.length) return { error: 'No dates.' };
    const dmin = keys[0], dmax = keys[keys.length - 1]; const gl = o.golive;
    if (gl <= dmin || gl > dmax) return { error: `The go-live date must be inside the data (${U.fmtDate(dmin)} – ${U.fmtDate(dmax)}).` };
    const b0 = U.addDays(gl, -o.days) < dmin ? dmin : U.addDays(gl, -o.days), b1 = U.addDays(gl, -1);
    const a0 = U.addDays(gl, o.settle || 0), a1raw = U.addDays(a0, o.days - 1); const a1 = a1raw > dmax ? dmax : a1raw; if (a0 > dmax) return { error: 'No data after the go-live (and the settling days).' };
    const dB = SX.daysBetween(b0, b1), dA = SX.daysBetween(a0, a1); const rB = dB.flatMap(d => g.get(d) || []), rA = dA.flatMap(d => g.get(d) || []);
    const m = o.meas; const perDay = ds2 => ds2.map(d => (m === 'count' ? (g.get(d) || []).length : (g.get(d) || []).length ? SX.value(m, g.get(d)) : null)).filter(v => v != null);
    let vB, vA, test; if (m === 'count') { const pB = perDay(dB), pA = perDay(dA); vB = SX.mean(pB); vA = SX.mean(pA); test = SS.tTest(pB, pA); }
    else if (m.startsWith('m:')) { vB = SX.value(m, rB); vA = SX.value(m, rA); test = SS.tTest(perDay(dB), perDay(dA)); }
    else { const k = m.slice(m.indexOf(':') + 1); vB = SX.value(m, rB); vA = SX.value(m, rA); test = SS.tTest(SX.nums(rB, k), SX.nums(rA, k)); }
    // was it already moving before? a straight line through the weekly values before go-live
    const wkv = days => { const w = new Map(); for (const d of days) { const k = SD.bucket(d, 'week'); (w.get(k) || w.set(k, []).get(k)).push(d); } return [...w.entries()].map(([k, l]) => ({ k, v: m === 'count' ? SX.mean(l.map(d => (g.get(d) || []).length)) : SX.value(m, l.flatMap(d => g.get(d) || [])), n: l.length })).filter(x => x.v != null); };
    const wB = wkv(dB); let drift = null; if (wB.length >= 6) { const xs = wB.map((_, i) => i), ys = wB.map(x => x.v); const mx = SX.mean(xs), my = SX.mean(ys); let sxy = 0, sxx = 0; xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; }); const slope = sxx ? sxy / sxx : 0; drift = slope * ((o.days + (o.settle || 0)) / 7); }
    const weekly = wkv(SX.daysBetween(b0, a1));
    return { b0, b1, a0, a1, nB: rB.length, nA: rA.length, daysB: dB.length, daysA: dA.length, vB, vA, test, drift, weekly };
  },
};

/* =================== findings notebook =================== */
Studio.F = { dsId: '', list: [] };
Studio.loadFindings = async () => { const id = Studio.ds && Studio.ds.id; if (!id) return []; if (Studio.F.dsId !== id) Studio.F = { dsId: id, list: (await Lab.read('studio.f.' + id, [])) || [] }; return Studio.F.list; };
Studio.saveFindings = () => Lab.write('studio.f.' + Studio.F.dsId, Studio.F.list);
Studio.blobUrl = b => new Promise(r => { if (!b) return r(''); const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
/* the "save as a finding" dialog: a title, what it means, and (when there is one) the picture */
Studio.findDialog = async (o) => {
  const img = o.img || (o.el ? await Studio.blobUrl(await SC.pngBlob(o.el, o.title, SG.mark(Studio.ds))) : '');
  UI.modal({ title: o.id ? 'Edit finding' : '📌 Save as a finding', wide: true, body: `${img ? `<img class="st-find-prev" src="${img}" alt="">` : ''}<form class="grid-form" id="st-ff">${UI.field({ key: 't', label: 'Finding (one line)', type: 'text', span: 2, placeholder: 'e.g. ER waits jump after 4 pm on Sundays' }, o.title || '')}${UI.field({ key: 'n', label: 'What it means / what to do', type: 'textarea', span: 2, rows: 5 }, o.note || '')}</form><p class="muted small">Kept with this dataset on this PC. The notebook (📌 Findings) turns them into a short report.</p>`,
    actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>',
    onMount: w => { w.querySelector('[data-c]').onclick = UI.closeModal; w.querySelector('[data-ok]').onclick = async () => {
      const t = w.querySelector('[name=t]').value.trim(), n = w.querySelector('[name=n]').value.trim(); if (!t) return UI.toast('Write the finding in one line', 'bad'); UI.closeModal(); await Studio.loadFindings();
      if (o.id) { const f = Studio.F.list.find(x => x.id === o.id); if (f) Object.assign(f, { title: t, note: n }); }
      else Studio.F.list.push({ id: Studio.newId('f'), at: new Date().toISOString(), by: SG.who(), kind: o.kind || 'note', title: t, note: n, img, vis: o.vis || null, filters: o.vis ? JSON.parse(JSON.stringify(Studio.filters)) : null, page: o.vis ? Studio.board().page : null });
      await Studio.saveFindings(); UI.toast(o.id ? 'Saved' : '📌 Saved to findings', 'good'); if (o.after) o.after(); else Studio.rerender(); }; } });
};
Studio.pinBtn = '<button class="btn" data-pinf>📌 Save as a finding</button>';
Studio.notebook = async () => {
  const L = await Studio.loadFindings(); const ds = Studio.ds;
  UI.modal({ title: `📌 Findings — ${ds.name}`, wide: true, body: L.length ? `<div class="st-finds">${L.map((f, i) => `<div class="st-find">${f.img ? `<img src="${f.img}" alt="">` : '<div class="st-find-noimg">📝</div>'}<div class="grow"><b>${i + 1}. ${h(f.title)}</b><div class="muted small">${h(U.fmtDate(String(f.at).slice(0, 10)))} · ${h(f.by || '')}</div>${f.note ? `<p>${h(f.note)}</p>` : ''}</div><div class="st-find-b">${f.vis ? `<button class="icon-btn sm" data-fopen="${i}" title="Open the chart with the same filters">↗</button>` : ''}<button class="icon-btn sm" data-fedit="${i}" title="Edit">✎</button>${i ? `<button class="icon-btn sm" data-fup="${i}" title="Move up">↑</button>` : ''}<button class="icon-btn sm" data-fdel="${i}" title="Delete">🗑</button></div></div>`).join('')}</div>` : '<div class="empty">No findings yet. Use ⋯ → 📌 <b>Save as a finding</b> on any chart, or the 📌 button in Why / What-if / Drivers / Before-after.</div>',
    actions: L.length ? '<button class="btn" data-fcopy>📋 Copy text</button><span class="grow"></span><button class="btn" data-fmaham>➜ Send to MAHAM</button><button class="btn primary" data-freport>⬇ Report</button>' : '<span class="grow"></span><button class="btn" data-c>Close</button>',
    onMount: w => {
      const q = (s, fn) => w.querySelectorAll(s).forEach(fn); const c = w.querySelector('[data-c]'); if (c) c.onclick = UI.closeModal;
      q('[data-fdel]', b => b.onclick = async () => { L.splice(+b.dataset.fdel, 1); await Studio.saveFindings(); Studio.notebook(); });
      q('[data-fup]', b => b.onclick = async () => { const i = +b.dataset.fup; [L[i - 1], L[i]] = [L[i], L[i - 1]]; await Studio.saveFindings(); Studio.notebook(); });
      q('[data-fedit]', b => b.onclick = () => { const f = L[+b.dataset.fedit]; Studio.findDialog({ id: f.id, title: f.title, note: f.note, img: f.img, after: Studio.notebook }); });
      q('[data-fopen]', b => b.onclick = () => { const f = L[+b.dataset.fopen]; UI.closeModal(); Studio.view = 'dash'; if (f.filters) Studio.filters = JSON.parse(JSON.stringify(f.filters)); const B = Studio.board(); if (f.page != null && B.pages[f.page]) B.page = f.page; if (!Studio.findVis(f.vis.id)) { B.pages[B.page].visuals.unshift(Object.assign({}, f.vis)); } Studio.saveMeta(); Studio.rerender(); setTimeout(() => { const el = document.querySelector(`[data-vid="${CSS.escape(f.vis.id)}"]`); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); } }, 300); });
      const cp = w.querySelector('[data-fcopy]'); if (cp) cp.onclick = () => { App.copyText(L.map((f, i) => `${i + 1}. ${f.title}${f.note ? '\n   ' + f.note.replace(/\n/g, '\n   ') : ''}`).join('\n\n')); UI.toast('Copied', 'good'); };
      const rp = w.querySelector('[data-freport]'); if (rp) rp.onclick = () => Studio.findReport(L);
      const dk = w.querySelector('[data-fmaham]'); if (dk) dk.onclick = () => Studio.toMaham(L);
    } });
};
/* the notebook as one HTML page (pictures included) — opens in any browser, prints to PDF */
Studio.findReport = L => {
  const ds = Studio.ds; const e = s => h(s || '');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(ds.name)} — findings</title><style>body{font-family:"Segoe UI",Arial,sans-serif;max-width:920px;margin:28px auto;padding:0 18px;color:#1f2d3a;background:#fff}h1{font-size:22px;margin:0 0 4px}.meta{color:#5b6b75;font-size:12px;border-bottom:2px solid #0e7c86;padding-bottom:10px;margin-bottom:22px}.f{break-inside:avoid;margin:0 0 28px}.f h2{font-size:16px;margin:0 0 4px}.f .d{color:#5b6b75;font-size:12px;margin-bottom:8px}.f img{max-width:100%;border:1px solid #e2e8ec;border-radius:8px}.f p{white-space:pre-wrap;line-height:1.55;margin:8px 0 0}.foot{color:#8a9aa5;font-size:11px;border-top:1px solid #e2e8ec;padding-top:8px}@media print{@page{size:A4;margin:14mm}body{margin:0}}</style></head><body>
<h1>${e(ds.name)} — findings</h1><div class="meta">${e(SG.label(ds))} · ${L.length} finding${L.length === 1 ? '' : 's'} · ${e(SG.who())} · ${e(U.fmtDate(U.todayStr()))}${ds.about ? `<br>${e(ds.about)}` : ''}</div>
${L.map((f, i) => `<div class="f"><h2>${i + 1}. ${e(f.title)}</h2><div class="d">${e(U.fmtDate(String(f.at).slice(0, 10)))}${f.by ? ' · ' + e(f.by) : ''}</div>${f.img ? `<img src="${f.img}" alt="">` : ''}${f.note ? `<p>${e(f.note)}</p>` : ''}</div>`).join('')}
<div class="foot">Made with MAHAM Lab · ${e(SG.mark(ds))}. Counts under 5 are hidden on patient data.</div></body></html>`;
  XL.download(new Blob([html], { type: 'text/html' }), `${ds.name} - findings ${U.todayStr()}.html`); UI.toast('Report saved — open it and press Ctrl+P for a PDF', 'good');
};
/* a findings file for MAHAM: titles and notes only (no pictures, no rows). The admin imports it in MAHAM. */
Studio.toMaham = L => {
  UI.modal({ title: 'Send findings to MAHAM', wide: true, body: `<p>Pick the findings to send. A small file is downloaded; the MAHAM admin loads it in <b>Admin → Data → Findings from MAHAM Lab</b>, where each one becomes an info item or a To Do.</p><div class="st-sendl">${L.map((f, i) => `<label class="check"><input type="checkbox" data-fs="${i}" checked> <b>${h(f.title)}</b></label>`).join('')}</div><p class="muted small">Only the titles and notes go — no pictures and no rows. Read the notes once more for anything that could identify a patient.</p>`,
    actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>⬇ Download the file</button>',
    onMount: w => { w.querySelector('[data-c]').onclick = Studio.notebook; w.querySelector('[data-ok]').onclick = () => {
      const pick = [...w.querySelectorAll('[data-fs]:checked')].map(c => L[+c.dataset.fs]); if (!pick.length) return UI.toast('Tick at least one', 'bad');
      const ds = Studio.ds; const file = { kind: 'maham-lab-findings', version: 1, at: new Date().toISOString(), by: SG.who(), dataset: ds.name, label: SG.label(ds), items: pick.map(f => ({ title: String(f.title).slice(0, 300), note: String(f.note || '').slice(0, 4000), at: String(f.at).slice(0, 10) })) };
      XL.download(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }), `MAHAM findings - ${ds.name} ${U.todayStr()}.json`); UI.closeModal(); UI.toast(`${pick.length} finding${pick.length > 1 ? 's' : ''} in the file — give it to the MAHAM admin`, 'good'); } } });
};

/* =================== what-if =================== */
Studio.whatIf = () => {
  const ds = Studio.ds; const nums = ds.cols.filter(c => c.type === 'number'); if (!nums.length) return UI.toast('Needs a number column', 'warn');
  const cats = ds.cols.filter(c => c.type === 'category' && !c.coded); const rows = SD.filter(ds, Studio.filters);
  UI.modal({ title: '🎚 What if…', wide: true, body: `<form class="grid-form" id="st-wi">${UI.field({ key: 'k', label: 'Number', type: 'select', options: nums.map(c => [c.key, c.label]), blank: false }, nums[0].key)}${UI.field({ key: 'dir', label: 'Target', type: 'select', options: [['le', 'At most (lower is better)'], ['ge', 'At least (higher is better)']], blank: false }, 'le')}${UI.field({ key: 't', label: 'Target value', type: 'number', step: 'any' }, '')}${UI.field({ key: 'mode', label: 'Change every value', type: 'select', options: [['pct', 'By a percent'], ['abs', 'By a fixed amount']], blank: false }, 'pct')}<div class="fld span2"><label>Change: <b id="st-wi-l"></b></label><input type="range" id="st-wi-s" min="-50" max="50" step="1" value="-10" aria-label="Change"></div>${UI.field({ key: 'g', label: 'Split by (optional)', type: 'select', options: cats.map(c => [c.key, c.label]) }, '')}</form><div id="st-wi-r"></div>`,
    actions: `${Studio.pinBtn}<span class="grow"></span><button class="btn primary" data-c>Close</button>`,
    onMount: w => {
      const g = k => w.querySelector(`[name=${k}]`); const sl = w.querySelector('#st-wi-s'); let text = '';
      const setRange = () => { const v = SX.nums(rows, g('k').value).sort((a, b) => a - b); if (!g('t').value && v.length) g('t').value = +SC.q(v, 0.5).toPrecision(3); if (g('mode').value === 'pct') { sl.min = -50; sl.max = 50; sl.step = 1; if (Math.abs(+sl.value) > 50) sl.value = -10; } else { const span = v.length ? (SC.q(v, 0.9) - SC.q(v, 0.1)) || 1 : 10; const st = 10 ** Math.floor(Math.log10(span / 50)) || 1; sl.min = -Math.ceil(span / st) * st; sl.max = -sl.min; sl.step = st; sl.value = -st * Math.round(span / st / 10); } };
      const run = () => {
        const k = g('k').value, L = Studio.label(k), t = +g('t').value, dir = g('dir').value, mode = g('mode').value, s = +sl.value, gr = g('g').value; if (!isFinite(t) || g('t').value === '') return;
        w.querySelector('#st-wi-l').textContent = mode === 'pct' ? `${s > 0 ? '+' : ''}${s}%` : `${s > 0 ? '+' : ''}${U.num(s, 2)}`;
        const r = SX.whatIf(rows, k, dir, t, mode, s, gr); const A = r.all; if (!A.n) { w.querySelector('#st-wi-r').innerHTML = '<p class="muted">No values.</p>'; return; }
        const p = x => Math.round((x / A.n) * 1000) / 10; const sign = dir === 'le' ? '≤' : '≥'; const more = A.a - A.b; const chg = mode === 'pct' ? `${s > 0 ? '+' : ''}${s}%` : `${s > 0 ? '+' : ''}${U.num(s, 2)}`;
        text = `If every ${L} changed by ${chg}: ${p(A.a)}% would be ${sign} ${U.num(t, 2)} instead of ${p(A.b)}% today (${more >= 0 ? '+' : ''}${more.toLocaleString()} rows of ${A.n.toLocaleString()}). Average ${U.num(A.avgB, 2)} → ${U.num(A.avgA, 2)}; median ${U.num(A.medB, 2)} → ${U.num(A.medA, 2)}.`;
        w.querySelector('#st-wi-r').innerHTML = `<div class="st-wi-big"><div><span class="muted small">Today</span><b>${p(A.b)}%</b><span class="small">${A.b.toLocaleString()} of ${A.n.toLocaleString()} ${sign} ${h(U.num(t, 2))}</span></div><div class="st-wi-arrow">→</div><div><span class="muted small">After ${h(chg)}</span><b class="${more >= 0 === (true) ? 't-good' : 't-bad'}">${p(A.a)}%</b><span class="small">${more >= 0 ? '+' : ''}${more.toLocaleString()} rows</span></div></div>
          <div class="st-wi-bars"><div><span>Today</span><i style="width:${p(A.b)}%"></i></div><div><span>After</span><i class="after" style="width:${p(A.a)}%"></i></div></div>
          <p class="small">Average ${h(L)}: <b>${U.num(A.avgB, 2)} → ${U.num(A.avgA, 2)}</b> · median <b>${U.num(A.medB, 2)} → ${U.num(A.medA, 2)}</b></p>
          ${r.groups.length ? `<table class="tbl"><thead><tr><th>${h(Studio.label(gr))}</th><th class="num">Rows</th><th class="num">Today</th><th class="num">After</th><th class="num">Change</th></tr></thead><tbody>${r.groups.map(x => SD.small(ds, x.n) ? '' : `<tr><td>${h(x.k)}</td><td class="num">${x.n.toLocaleString()}</td><td class="num">${Math.round((x.b / x.n) * 100)}%</td><td class="num">${Math.round((x.a / x.n) * 100)}%</td><td class="num"><b>${x.a - x.b >= 0 ? '+' : ''}${(x.a - x.b).toLocaleString()}</b></td></tr>`).join('')}</tbody></table>` : ''}
          <p class="muted small">A simple sum on the rows filtered now: every value moves the same way. Real changes rarely do — use it to size an idea, not to promise a result.</p>`;
      };
      for (const k of ['k', 'mode']) g(k).onchange = () => { if (k === 'k') g('t').value = ''; setRange(); run(); };
      for (const k of ['dir', 'g']) g(k).onchange = run; g('t').oninput = U.debounce(run, 250); sl.oninput = run; setRange(); run();
      w.querySelector('[data-c]').onclick = UI.closeModal; w.querySelector('[data-pinf]').onclick = () => Studio.findDialog({ kind: 'whatif', title: `What if ${Studio.label(g('k').value)} changed`, note: text });
    } });
};

/* =================== seasonality =================== */
Studio.season = () => {
  const ds = Studio.ds; const dcols = ds.cols.filter(c => c.type === 'date'); if (!dcols.length) return UI.toast('Needs a date column', 'warn');
  UI.modal({ title: '🌙 Patterns over time', wide: true, body: `<form class="grid-form" id="st-se">${UI.field({ key: 'd', label: 'Date', type: 'select', options: dcols.map(c => [c.key, c.label]), blank: false }, dcols[0].key)}${UI.field({ key: 'm', label: 'Look at', type: 'select', options: SX.measures(ds), blank: false }, 'count')}</form><div id="st-se-r"></div>`,
    actions: `${Studio.pinBtn}<span class="grow"></span><button class="btn primary" data-c>Close</button>`,
    onMount: w => {
      const g = k => w.querySelector(`#st-se [name=${k}]`); let text = '';
      const run = () => {
        SD.cur = ds; const m = g('m').value; const r = SX.season(ds, SD.filter(ds, Studio.filters), g('d').value, m); const out = w.querySelector('#st-se-r'); if (r.error) { out.innerHTML = `<p class="muted">${h(r.error)}</p>`; return; }
        const f = v => (v == null ? '–' : U.num(v, m === 'count' ? 0 : 2)); const ml = m === 'count' ? 'rows a day' : SX.mLabel(ds, m);
        const wd = r.wdIdx.map((x, i) => [SX.WD[i], x]).sort((a, b) => b[1] - a[1]); const lines = [];
        lines.push(`An average day: ${f(r.avg)} ${m === 'count' ? 'rows' : '(' + ml + ')'}.`);
        lines.push(`Highest weekday: ${wd[0][0]} (${SX.pct(wd[0][1], 1)} vs an average day). Lowest: ${wd[6][0]} (${SX.pct(wd[6][1], 1)}).`);
        for (const s of r.seasons.filter(x => x.k !== 'Normal')) lines.push(`${s.k} days (${s.n}): ${f(s.v)} — ${SX.pct(1 + s.diff, 1)} vs normal days.`);
        if (r.hours) { const hh = r.hours.map((v, i) => [i, v]).filter(x => x[1] != null).sort((a, b) => b[1] - a[1]); if (hh.length) lines.push(`Busiest hour: ${U.pad(hh[0][0])}:00; quietest: ${U.pad(hh[hh.length - 1][0])}:00.`); }
        if (r.trend) lines.push(`Trend: the last 8 full weeks are ${SX.pct(r.trend.b, r.trend.a)} vs the 8 weeks before.`);
        if (r.odd.length) lines.push(`${r.odd.length} unusual day${r.odd.length > 1 ? 's' : ''}, e.g. ${U.fmtDate(r.odd[0].d)}: ${f(r.odd[0].v)} where about ${f(r.odd[0].e)} was expected.`);
        text = lines.join('\n');
        out.innerHTML = `<div class="st-sum">${lines.map(l => `<p>${h(l)}</p>`).join('')}</div><div class="st-se-g"><div><h4>Trend (per-day average each week)</h4><div class="st-se-c" id="se1"></div></div><div><h4>Weekday pattern (vs an average day)</h4><div class="st-se-c" id="se2"></div></div>${r.hours ? '<div><h4>Hour of the day</h4><div class="st-se-c" id="se3"></div></div>' : ''}${r.seasons.length > 1 ? '<div><h4>Ramadan, Peak season and normal days</h4><div class="st-se-c" id="se4"></div></div>' : ''}</div>
          ${r.odd.length ? `<h4>Unusual days</h4><table class="tbl"><thead><tr><th>Day</th><th class="num">Actual</th><th class="num">Expected</th><th class="num">Difference</th></tr></thead><tbody>${r.odd.map(o => `<tr><td>${h(U.fmtDate(o.d))} <span class="muted small">${SX.WD[U.pd(o.d).getDay()]}</span></td><td class="num">${f(o.v)}</td><td class="num">${f(o.e)}</td><td class="num"><b class="${o.v > o.e ? 't-bad' : 't-good'}">${SX.pct(o.v, o.e)}</b></td></tr>`).join('')}</tbody></table>` : '<p class="muted small">No unusual days.</p>'}
          <p class="muted small">"Expected" = the average of the 3 days either side, adjusted for the weekday. Ramadan and Peak season use the Umm al-Qura calendar.</p>`;
        SX.draw(out.querySelector('#se1'), SX.tmp('t', [['Week', 'date'], ['Value', 'number']], r.weekly.map(x => ({ Week: x.w, Value: x.v }))), { type: 'line', x: 'Week', grain: 'week', fn: 'sum', field: 'Value', anom: true });
        SX.draw(out.querySelector('#se2'), SX.tmp('t', [['Weekday', 'category', SX.WD], ['vs average (%)', 'number']], r.wdIdx.map((x, i) => ({ Weekday: SX.WD[i], 'vs average (%)': Math.round((x - 1) * 1000) / 10 }))), { type: 'bar', x: 'Weekday', fn: 'sum', field: 'vs average (%)', labels: true, ruleHi: 0, ruleLo: 0 });
        if (r.hours) SX.draw(out.querySelector('#se3'), SX.tmp('t', [['Hour', 'category', r.hours.map((_, i) => U.pad(i))], ['Value', 'number']], r.hours.map((v, i) => ({ Hour: U.pad(i), Value: v == null ? null : Math.round(v * 100) / 100 }))), { type: 'bar', x: 'Hour', fn: 'sum', field: 'Value' });
        if (r.seasons.length > 1) SX.draw(out.querySelector('#se4'), SX.tmp('t', [['Days', 'category', ['Normal', 'Ramadan', 'Peak season']], ['Value', 'number']], r.seasons.map(s => ({ Days: s.k, Value: Math.round(s.v * 100) / 100 }))), { type: 'bar', x: 'Days', fn: 'sum', field: 'Value', labels: true });
      };
      g('d').onchange = run; g('m').onchange = run; run();
      w.querySelector('[data-c]').onclick = UI.closeModal; w.querySelector('[data-pinf]').onclick = () => Studio.findDialog({ kind: 'season', title: `Patterns in ${SX.mLabel(ds, g('m').value)}`, note: text, el: w.querySelector('#se2') });
    } });
};

/* =================== what drives a number =================== */
Studio.drivers = () => {
  const ds = Studio.ds; const nums = ds.cols.filter(c => c.type === 'number'); if (!nums.length) return UI.toast('Needs a number column', 'warn');
  UI.modal({ title: '🧩 What drives…', wide: true, body: `<form class="grid-form" id="st-dr">${UI.field({ key: 'k', label: 'The number to explain', type: 'select', options: nums.map(c => [c.key, c.label]), blank: false }, (nums.find(c => /los|stay|wait|time|turn|minutes|hours/i.test(c.label)) || nums[0]).key)}</form><div id="st-dr-r"></div>`,
    actions: `${Studio.pinBtn}<span class="grow"></span><button class="btn primary" data-c>Close</button>`,
    onMount: w => {
      let text = '';
      const run = () => {
        const out = w.querySelector('#st-dr-r'); out.innerHTML = '<div class="sv-empty"><span class="spin"></span> Working…</div>';
        setTimeout(() => {
          const k = w.querySelector('[name=k]').value; const r = SX.drivers(ds, SD.filter(ds, Studio.filters), k); if (r.error) { out.innerHTML = `<p class="muted">${h(r.error)}</p>`; return; }
          const L = Studio.label(k); const f = v => U.num(v, 2); const lines = r.list.slice(0, 6).map(d => d.kind === 'cat' ? `${d.c.label} — explains ${Math.round(d.score * 100)}% of the differences in ${L}.${d.hi && d.lo && d.hi !== d.lo ? ` Highest: ${d.hi.k} (${f(d.hi.mean)}), lowest: ${d.lo.k} (${f(d.lo.mean)}).` : ''}` : `${d.c.label} — explains ${Math.round(d.score * 100)}%. Each ${U.num(d.per, 4)} more ${d.c.label} goes with ${d.slope >= 0 ? '+' : ''}${f(d.slope)} ${L} (r = ${U.num(d.r, 2)}).`);
          text = [...lines, r.r2all != null ? `Together these columns explain about ${Math.round(r.r2all * 100)}% of the differences in ${L}; the rest is not in this data.` : ''].filter(Boolean).join('\n');
          out.innerHTML = r.list.length ? `<div class="st-se-c" id="dr1" style="height:${Math.max(180, r.list.length * 30 + 40)}px"></div><div class="st-sum">${lines.map(l => `<p>${h(l)}</p>`).join('')}${r.r2all != null ? `<p><b>Together</b> the top columns explain about <b>${Math.round(r.r2all * 100)}%</b> of the differences in ${h(L)} — the rest comes from things not in this data.</p>` : ''}</div><p class="muted small">Based on ${r.n.toLocaleString()} rows (filtered now). "Explains" = how much of the spread in ${h(L)} lines up with that column. It shows what goes together, not what causes what — e.g. sicker patients both get a higher triage level and stay longer.</p>` : '<p class="muted">No column lines up with this number.</p>';
          if (r.list.length) SX.draw(out.querySelector('#dr1'), SX.tmp('t', [['Column', 'category', r.list.map(d => d.c.label)], ['Explains (%)', 'number']], r.list.map(d => ({ Column: d.c.label, 'Explains (%)': Math.round(d.score * 1000) / 10 }))), { type: 'hbar', x: 'Column', fn: 'sum', field: 'Explains (%)', labels: true, sort: 'label' });
        }, 20);
      };
      w.querySelector('[name=k]').onchange = run; run();
      w.querySelector('[data-c]').onclick = UI.closeModal; w.querySelector('[data-pinf]').onclick = () => Studio.findDialog({ kind: 'drivers', title: `What goes with ${Studio.label(w.querySelector('[name=k]').value)}`, note: text, el: w.querySelector('#dr1') });
    } });
};

/* =================== before / after a go-live =================== */
Studio.beforeAfter = () => {
  const ds = Studio.ds; const dcols = ds.cols.filter(c => c.type === 'date'); if (!dcols.length) return UI.toast('Needs a date column', 'warn');
  const mid = (() => { const v = ds.rows.map(r => String(r[dcols[0].key] || '').slice(0, 10)).filter(Boolean).sort(); return v[Math.floor(v.length / 2)] || U.todayStr(); })();
  UI.modal({ title: '🚦 Before and after a change', wide: true, body: `<form class="grid-form" id="st-ba">${UI.field({ key: 'd', label: 'Date', type: 'select', options: dcols.map(c => [c.key, c.label]), blank: false }, dcols[0].key)}${UI.field({ key: 'gl', label: 'Go-live / change date', type: 'date' }, mid)}${UI.field({ key: 'm', label: 'Look at', type: 'select', options: SX.measures(ds), blank: false }, (SX.measures(ds).find(x => x[0].startsWith('avg:')) || ['count'])[0])}${UI.field({ key: 'days', label: 'Days on each side', type: 'number', min: 7, step: 1 }, 90)}${UI.field({ key: 'settle', label: 'Settling days to skip after go-live', type: 'number', min: 0, step: 1, hint: 'e.g. the first 2 weeks while people learn it' }, 0)}${UI.field({ key: 'name', label: 'What changed (for the chart)', type: 'text', placeholder: 'New triage workflow' }, '')}</form><div id="st-ba-r"></div>`,
    actions: `${Studio.pinBtn}<button class="btn" data-badd>＋ Add the chart to the dashboard</button><span class="grow"></span><button class="btn primary" data-c>Close</button>`,
    onMount: w => {
      const g = k => w.querySelector(`#st-ba [name=${k}]`); let text = '', last = null;
      const run = () => {
        SD.cur = ds; const o = { dateKey: g('d').value, golive: g('gl').value, meas: g('m').value, days: Math.max(7, +g('days').value || 90), settle: Math.max(0, +g('settle').value || 0) }; const out = w.querySelector('#st-ba-r'); if (!o.golive) return;
        const r = SX.beforeAfter(ds, SD.filter(ds, Studio.filters), o); last = { o, r }; if (r.error) { out.innerHTML = `<p class="muted">${h(r.error)}</p>`; return; }
        const ml = o.meas === 'count' ? 'rows per day' : SX.mLabel(ds, o.meas); const pctM = o.meas.startsWith('m:') && (Studio.ds.measures || []).find(x => 'm:' + x.id === o.meas && x.kind === 'pct'); const f = v => (v == null ? '–' : pctM ? Math.round(v * 1000) / 10 + '%' : U.num(v, 2));
        const [vt, kind] = r.test ? SS.verdict(r.test.p) : ['Not enough data to test', 'muted']; const name = g('name').value.trim() || 'the change';
        const drifty = r.drift != null && r.vA != null && r.vB != null && Math.abs(r.drift) > 0.5 * Math.abs(r.vA - r.vB) && Math.sign(r.drift) === Math.sign(r.vA - r.vB);
        text = `${ml}: ${f(r.vB)} in the ${r.daysB} days before ${name} (${U.fmtDate(o.golive)}) → ${f(r.vA)} in the ${r.daysA} days after (${SX.pct(r.vA, r.vB)}). ${vt}${r.test ? ` (p ${r.test.p < 0.001 ? '< 0.001' : '= ' + U.num(r.test.p, 3)})` : ''}.${drifty ? ' Part of this was already happening before the change.' : ''}`;
        out.innerHTML = `<div class="st-wi-big"><div><span class="muted small">Before · ${U.fmtDate(r.b0)} – ${U.fmtDate(r.b1)}</span><b>${h(f(r.vB))}</b><span class="small">${h(ml)} · ${r.nB.toLocaleString()} rows</span></div><div class="st-wi-arrow">→</div><div><span class="muted small">After · ${U.fmtDate(r.a0)} – ${U.fmtDate(r.a1)}</span><b>${h(f(r.vA))}</b><span class="small">${h(SX.pct(r.vA, r.vB))} · ${r.nA.toLocaleString()} rows</span></div></div>
          <div class="st-verdict ${kind}"><b>${h(vt)}</b><span>${r.test ? `p ${r.test.p < 0.001 ? '< 0.001' : '= ' + U.num(r.test.p, 3)}` : ''}</span></div>
          ${drifty ? '<p class="t-warn small">⚠ It was already moving this way before the go-live — part of the change is that earlier trend, not the change itself. Look at the chart.</p>' : ''}
          <div class="st-se-c" id="ba1" style="height:260px"></div><p class="muted small">Weekly ${o.meas === 'count' ? 'average rows per day' : h(ml)}. Other things also change over time (season, staff, Ramadan) — compare the same months of another year if you can.</p>`;
        SX.draw(out.querySelector('#ba1'), SX.tmp('t', [['Week', 'date'], ['Value', 'number']], r.weekly.map(x => ({ Week: x.k, Value: x.v }))), { type: 'line', x: 'Week', grain: 'week', fn: 'sum', field: 'Value', markAt: o.golive, markLabel: name === 'the change' ? 'Go-live' : name.slice(0, 30), fmt: pctM ? 'pct' : 'auto' });
      };
      w.querySelectorAll('#st-ba [name]').forEach(x => { x.onchange = run; }); run();
      w.querySelector('[data-c]').onclick = UI.closeModal; w.querySelector('[data-pinf]').onclick = () => Studio.findDialog({ kind: 'beforeafter', title: `${g('name').value.trim() || 'Change'} on ${U.fmtDate(g('gl').value)}: before vs after`, note: text, el: w.querySelector('#ba1') });
      w.querySelector('[data-badd]').onclick = async () => { if (!last || last.r.error) return; const { o, r } = last; const m = o.meas; const v = { id: Studio.newId(), type: 'line', x: o.dateKey, grain: 'week', fn: m === 'count' ? 'count' : m.startsWith('m:') ? m : m.slice(0, m.indexOf(':')), field: m.includes(':') && !m.startsWith('m:') ? m.slice(m.indexOf(':') + 1) : '', markAt: o.golive, markLabel: g('name').value.trim() || 'Go-live', since: r.b0, sinceKey: o.dateKey, w: 3, title: `${SX.mLabel(ds, m)} — before and after ${g('name').value.trim() || 'go-live'}` }; UI.closeModal(); await Studio.change(B => { B.pages[B.page].visuals.unshift(v); }, 'Chart added'); };
    } });
};

/* =================== data dictionary =================== */
Studio.dictionary = async () => {
  const ds = Studio.ds; const Q = SD.quality(ds);
  const rows = [['Column', 'Type', 'Description', 'Filled', 'Distinct values', 'Example'], ...ds.cols.map(c => { const q = Q.cols.find(x => x.c === c); const ex = c.coded || c.type === 'id' || c.type === 'text' ? '' : (ds.rows.find(r => r[c.key] !== '' && r[c.key] != null) || {})[c.key]; return [c.label, (SD.TYPES.find(t => t[0] === c.type) || [, c.type])[1], c.desc || '', `${Math.round((1 - q.blankPct) * 100)}%`, new Set(ds.rows.slice(0, 20000).map(r => r[c.key])).size, ex == null ? '' : ex]; })];
  if (ds.about) rows.push([], ['About this data', ds.about]);
  await Studio.excel(`${ds.name} - data dictionary`.slice(0, 31), rows);
};
