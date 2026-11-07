/* MAHAM Lab — Studio data: load an Excel / CSV file (or MAHAM's own records), find column types, protect patient
 * identifiers, add helper columns, filter and summarise. Everything stays in this browser (IndexedDB on this PC);
 * nothing is written to the shared folder. */
'use strict';

const SD = {
  /* ---------- reading files ---------- */
  async readFile(file) {
    const name = file.name.replace(/\.(xlsx|xlsm|csv|txt|tsv)$/i, '');
    let grid;
    if (/\.(csv|txt|tsv)$/i.test(file.name)) grid = parseDelimited((await file.text()).replace(/^﻿/, ''));
    else {
      const sheets = (await XL.read(file)).filter(s => s.rows && s.rows.length > 1);
      if (!sheets.length) throw new Error('No sheet with data was found in this file.');
      sheets.sort((a, b) => b.rows.length - a.rows.length); grid = sheets[0].rows;   // the biggest sheet
    }
    return SD.fromGrid(name, grid);
  },
  /* first row with several filled cells = the header */
  fromGrid(name, grid) {
    // the header is the first row (of the first 20) that is about as full as the widest rows — so report titles above it are skipped
    const filled = r => (r || []).filter(v => v != null && String(v).trim() !== '').length; const widest = Math.max(2, ...grid.slice(0, 40).map(filled));
    let hi = grid.slice(0, 20).findIndex(r => filled(r) >= Math.max(2, Math.ceil(widest * 0.6))); if (hi < 0) hi = grid.findIndex(r => filled(r) >= 2); if (hi < 0) hi = 0;
    const head = (grid[hi] || []).map((v, i) => String(v == null || v === '' ? 'Column ' + (i + 1) : v).trim());
    const seen = {}; const keys = head.map(hd => { let k = hd; while (seen[k]) k = hd + ' (' + (++seen[hd]) + ')'; seen[k] = 1; return k; });
    const rows = [];
    for (let i = hi + 1; i < grid.length; i++) { const r = grid[i] || []; if (!r.some(v => v != null && String(v).trim() !== '')) continue; if (r.every((v, j) => String(v ?? '').trim() === String(grid[hi][j] ?? '').trim())) continue;   /* a repeated header (page break) */ const o = {}; keys.forEach((k, j) => { o[k] = r[j] == null ? '' : r[j]; }); rows.push(o); }
    // "Total" / "Grand total" lines at the end of a report are not data
    const TOT = /^\s*(grand\s+)?(sub)?total\b|^\s*(المجموع|الإجمالي|الاجمالي)/i;
    while (rows.length && TOT.test(String(Object.values(rows[rows.length - 1]).find(v => v !== '' && v != null) ?? ''))) rows.pop();
    return SD.make(name, keys, rows, 'file');
  },
  make(name, keys, rows, source) {
    const ds = { id: 'ds' + Date.now().toString(36), name, source, created: U.todayStr(), cols: keys.map(k => ({ key: k, label: k, type: 'text' })), rows };
    for (const c of ds.cols) c.type = SD.guessType(c.key, rows);
    for (const c of ds.cols) if (c.type === 'date') for (const r of rows) r[c.key] = SD.toDate(r[c.key]);
    for (const c of ds.cols) if (c.type === 'number') for (const r of rows) r[c.key] = SD.toNum(r[c.key]);
    for (const c of ds.cols) if (c.type === 'category' || c.type === 'text' || c.type === 'id') for (const r of rows) r[c.key] = String(r[c.key] ?? '').trim();
    return ds;
  },
  /* ---------- column types ---------- */
  DATE_RX: /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/,
  DMY_RX: /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/,
  toDate(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') return v > 20000 && v < 80000 ? XL.serialToDT(v) : '';
    const s = String(v).trim(); let m = SD.DATE_RX.exec(s);
    if (m) return `${m[1]}-${U.pad(+m[2])}-${U.pad(+m[3])}${m[4] != null ? `T${U.pad(+m[4])}:${m[5]}` : ''}`;
    m = SD.DMY_RX.exec(s); if (m) return `${m[3]}-${U.pad(+m[2])}-${U.pad(+m[1])}${m[4] != null ? `T${U.pad(+m[4])}:${m[5]}` : ''}`;
    const d = new Date(s); return isNaN(d) ? '' : U.ds(d) + `T${U.pad(d.getHours())}:${U.pad(d.getMinutes())}`;
  },
  toNum(v) { if (v === '' || v == null) return null; if (typeof v === 'number') return v; const n = +String(v).replace(/[, ]/g, '').replace(/%$/, ''); return isFinite(n) ? n : null; },
  guessType(key, rows) {
    const vals = []; for (let i = 0; i < rows.length && vals.length < 400; i++) { const v = rows[i][key]; if (v !== '' && v != null) vals.push(v); }
    if (!vals.length) return 'text';
    const dateHead = /date|time|created|resolved|closed|opened|arriv|admi|discharg|dob|birth|visit|start|end|due|\bon$/i.test(key);
    const isDate = v => typeof v === 'number' ? dateHead && v > 20000 && v < 80000 : (SD.DATE_RX.test(String(v)) || SD.DMY_RX.test(String(v)));
    if (vals.filter(isDate).length / vals.length >= 0.9) return 'date';
    const distinct0 = new Set(vals.map(v => String(v).trim().toLowerCase())).size;
    if (/(^|\b)(id|mrn|no|number|code|phone|mobile|ext|ref|ticket|request|order|encounter|accession)(\b|$)|#/i.test(key) && !/count|hours|minutes|days|age|type|status/i.test(key)) return distinct0 > Math.max(40, vals.length * 0.3) ? 'id' : 'category';   // numbers that are labels
    if (vals.filter(v => SD.toNum(v) != null).length / vals.length >= 0.95) return 'number';
    const distinct = new Set(vals.map(v => String(v).trim().toLowerCase())).size; const avgLen = vals.reduce((a, v) => a + String(v).length, 0) / vals.length;
    if (distinct <= Math.max(60, vals.length * 0.5) && avgLen < 60) return 'category';
    return avgLen <= 24 && !/\s\S+\s/.test(String(vals[0])) ? 'id' : 'text';   // nearly every value different and short → an ID / code
  },
  TYPES: [['category', 'Category'], ['number', 'Number'], ['date', 'Date / time'], ['id', 'ID / code'], ['text', 'Free text']],
  ICON: { category: '🏷', number: '#', date: '📅', id: '🔑', text: '¶' },
  /* ---------- patient privacy ---------- */
  /* columns that could identify a person. kind: 'id' (MRN, national ID…), 'name', 'contact', 'birth' */
  scan(ds) {
    const out = [];
    for (const c of ds.cols) {
      const k = c.key.toLowerCase(); const vals = ds.rows.slice(0, 400).map(r => String(r[c.key] ?? '')).filter(Boolean);
      const share = rx => vals.length ? vals.filter(v => rx.test(v)).length / vals.length : 0;
      let kind = '', why = '';
      if (/\bmrn\b|medical record|file ?(no|number)|hospital (no|number)|patient ?id/.test(k)) { kind = 'id'; why = 'medical record number'; }
      else if (/national(?!ity)|iqama|passport|\bnid\b|civil/.test(k) || share(/^[12]\d{9}$/) > 0.6) { kind = 'id'; why = 'national ID / Iqama'; }
      else if (/phone|mobile|\btel\b|contact/.test(k) || share(/^(\+?966|0)?5\d{8}$/) > 0.6) { kind = 'contact'; why = 'phone number'; }
      else if (/e-?mail/.test(k) || share(/^[^@\s]+@[^@\s]+\.\w+$/) > 0.6) { kind = 'contact'; why = 'email address'; }
      else if (/birth|dob/.test(k)) { kind = 'birth'; why = 'date of birth'; }
      else if (/patient.*name|name.*patient|^name$|full ?name|first ?name|last ?name|family/.test(k)) { kind = 'name'; why = 'person name'; }
      if (kind) out.push({ key: c.key, kind, why, action: kind === 'name' || kind === 'contact' ? 'remove' : kind === 'birth' ? 'age' : 'code' });
    }
    return out;
  },
  ACTIONS: { remove: 'Remove the column', code: 'Replace with a code (P-0001…)', mask: 'Mask (keep last 2 characters)', age: 'Keep only the age in years', keep: 'Keep as it is' },
  /* apply the chosen actions; patient-level data is marked so small counts are hidden on charts */
  protect(ds, choices) {
    const map = {}; let n = 0;
    for (const ch of choices) {
      const c = ds.cols.find(x => x.key === ch.key); if (!c) continue;
      if (ch.action === 'remove') { ds.cols = ds.cols.filter(x => x !== c); for (const r of ds.rows) delete r[c.key]; continue; }
      if (ch.action === 'code') { const m = map[c.key] = {}; for (const r of ds.rows) { const v = String(r[c.key] ?? ''); if (!v) continue; r[c.key] = m[v] || (m[v] = 'P-' + String(++n).padStart(5, '0')); } c.type = 'id'; c.coded = true; }
      if (ch.action === 'mask') { for (const r of ds.rows) { const v = String(r[c.key] ?? ''); r[c.key] = v ? '•••' + v.slice(-2) : ''; } c.type = 'category'; }
      if (ch.action === 'age') { const nk = 'Age (years)'; for (const r of ds.rows) { const d = SD.toDate(r[c.key]); r[nk] = d ? Math.floor(U.diffDays(d.slice(0, 10), U.todayStr()) / 365.25) : null; delete r[c.key]; } ds.cols = ds.cols.filter(x => x !== c); ds.cols.push({ key: nk, label: nk, type: 'number' }); }
    }
    ds.protected = choices.map(c => ({ key: c.key, action: c.action })); ds.patientLevel = choices.length > 0; ds.smallCells = ds.patientLevel;
    return ds;
  },
  /* ---------- tidying ---------- */
  /* same value written differently ("Pharmacy", "pharmacy ", "PHARMACY") → the most common spelling */
  unify(ds, key) {
    const cnt = {}; for (const r of ds.rows) { const v = String(r[key] ?? '').trim().replace(/\s+/g, ' '); r[key] = v; const l = v.toLowerCase(); (cnt[l] = cnt[l] || {})[v] = (cnt[l][v] || 0) + 1; }
    const best = {}; for (const [l, o] of Object.entries(cnt)) best[l] = Object.entries(o).sort((a, b) => b[1] - a[1])[0][0];
    let changed = 0; for (const r of ds.rows) { const b = best[String(r[key]).toLowerCase()]; if (b !== r[key]) { r[key] = b; changed++; } }
    return changed;
  },
  dedupe(ds) { const seen = new Set(); const before = ds.rows.length; ds.rows = ds.rows.filter(r => { const k = JSON.stringify(ds.cols.map(c => r[c.key])); if (seen.has(k)) return false; seen.add(k); return true; }); return before - ds.rows.length; },
  /* helper columns from a date, or the time between two dates */
  HIJRI: (() => { try { return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'long' }); } catch (e) { return null; } })(),
  DERIVE: { month: 'Month', year: 'Year', weekday: 'Weekday', hour: 'Hour of day', hijri: 'Hijri month', week: 'Week' },
  derive(ds, key, part) {
    const nk = `${ds.cols.find(c => c.key === key).label} · ${SD.DERIVE[part]}`; if (ds.cols.some(c => c.key === nk)) return nk;
    const W = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const r of ds.rows) { const d = r[key]; if (!d) { r[nk] = ''; continue; } const dt = U.pd(d.slice(0, 10));
      r[nk] = part === 'month' ? d.slice(0, 7) : part === 'year' ? d.slice(0, 4) : part === 'weekday' ? W[dt.getDay()] : part === 'hour' ? (d.length > 11 ? d.slice(11, 13) + ':00' : '') : part === 'week' ? U.addDays(d.slice(0, 10), -dt.getDay()) : (SD.HIJRI ? SD.HIJRI.format(dt) : ''); }
    ds.cols.push({ key: nk, label: nk, type: 'category', derived: true }); return nk;
  },
  between(ds, a, b, unit) {
    const nk = `${unit === 'days' ? 'Days' : unit === 'minutes' ? 'Minutes' : 'Hours'} from ${ds.cols.find(c => c.key === a).label} to ${ds.cols.find(c => c.key === b).label}`;
    const ms = s => { if (!s) return null; const t = Date.parse(s.length > 10 ? s : s + 'T00:00'); return isNaN(t) ? null : t; };
    const div = unit === 'days' ? 864e5 : unit === 'minutes' ? 6e4 : 36e5;
    for (const r of ds.rows) { const x = ms(r[a]), y = ms(r[b]); r[nk] = x != null && y != null ? Math.round(((y - x) / div) * 100) / 100 : null; }
    ds.cols = ds.cols.filter(c => c.key !== nk); ds.cols.push({ key: nk, label: nk, type: 'number', derived: true }); return nk;
  },
  /* ---------- filtering ---------- */
  /* f = { slicers: { key: [values] }, range: { key, from, to }, cross: { key, value } } */
  filter(ds, f, skipCrossFor) {
    const sl = Object.entries((f && f.slicers) || {}).filter(([, v]) => v && v.length).map(([k, v]) => [k, new Set(v)]);
    const rg = f && f.range && f.range.key && (f.range.from || f.range.to) ? f.range : null;
    const cx = f && f.cross && f.cross.key && skipCrossFor !== f.cross.vid ? f.cross : null;
    if (!sl.length && !rg && !cx) return ds.rows;
    return ds.rows.filter(r => {
      for (const [k, s] of sl) if (!s.has(String(r[k] ?? ''))) return false;
      if (rg) { const d = String(r[rg.key] || '').slice(0, 10); if (!d || (rg.from && d < rg.from) || (rg.to && d > rg.to)) return false; }
      if (cx && SD.bucket(r[cx.key], cx.grain) !== cx.value) return false;
      return true;
    });
  },
  /* the value a row falls under on an axis (dates grouped by day / week / month / year) */
  bucket(v, grain) {
    if (!grain || v == null || v === '') return v == null || v === '' ? '(blank)' : String(v);
    const d = String(v).slice(0, 10);
    if (grain === 'day') return d; if (grain === 'month') return d.slice(0, 7); if (grain === 'year') return d.slice(0, 4);
    if (grain === 'week') { const dt = U.pd(d); return dt ? U.addDays(d, -dt.getDay()) : d; }
    return d;
  },
  /* ---------- summarising (what every chart draws) ---------- */
  FNS: [['count', 'Count of rows'], ['top', 'Most common value'], ['sum', 'Sum'], ['avg', 'Average'], ['median', 'Median'], ['min', 'Minimum'], ['max', 'Maximum'], ['distinct', 'Distinct values']],
  cur: null,   // the dataset being drawn (for saved measures)
  calc(fn, list, field) {
    if (typeof fn === 'string' && fn.startsWith('m:')) return SD.measureCalc(SD.cur, fn.slice(2), list);
    if (fn === 'count') return list.length;
    if (fn === 'top') { const o = {}; for (const r of list) { const v = r[field]; if (v !== '' && v != null) o[v] = (o[v] || 0) + 1; } const b = Object.entries(o).sort((a, b) => b[1] - a[1])[0]; return b ? b[0] : null; }
    if (fn === 'distinct') return new Set(list.map(r => r[field]).filter(v => v !== '' && v != null)).size;
    const v = list.map(r => r[field]).filter(x => typeof x === 'number' && isFinite(x)); if (!v.length) return null;
    if (fn === 'sum') return v.reduce((a, b) => a + b, 0);
    if (fn === 'avg') return v.reduce((a, b) => a + b, 0) / v.length;
    if (fn === 'min') return v.reduce((a, b) => (b < a ? b : a), Infinity); if (fn === 'max') return v.reduce((a, b) => (b > a ? b : a), -Infinity);
    if (fn === 'median') { v.sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; }
    return null;
  },
  /* vis = { type, x, grain, split, fn, field, top, sort } → { labels, series: [{ name, values, counts }], total } */
  aggregate(ds, rows, vis) {
    const fn = vis.fn || 'count';
    if (vis.type === 'kpi') { const v = SD.calc(fn, rows, vis.field); return { labels: [], series: [{ name: SD.measureName(vis, ds), values: [v], counts: [rows.length] }], total: v, n: rows.length }; }
    if (vis.type === 'scatter') { const pts = []; for (const r of rows) { const x = r[vis.x], y = r[vis.field]; if (typeof x === 'number' && typeof y === 'number') pts.push([x, y]); } return { labels: [], series: [{ name: SD.measureName(vis, ds), points: pts.slice(0, 5000) }], n: rows.length }; }
    const col = ds.cols.find(c => c.key === vis.x); const grain = col && col.type === 'date' ? (vis.grain || 'month') : '';
    const groups = new Map();
    for (const r of rows) { const k = SD.bucket(r[vis.x], grain); let g = groups.get(k); if (!g) groups.set(k, g = []); g.push(r); }
    let labels = [...groups.keys()];
    const timeAxis = !!grain || /hour|weekday|month|year|week/i.test(vis.x || '');
    const W = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const main = new Map(labels.map(l => [l, SD.calc(fn, groups.get(l), vis.field)]));
    if (col && col.order && vis.sort !== 'value') labels.sort((a, b) => (col.order.indexOf(a) + 1 || 999) - (col.order.indexOf(b) + 1 || 999));
    else if (timeAxis && vis.sort !== 'value') labels.sort((a, b) => W.includes(a) && W.includes(b) ? W.indexOf(a) - W.indexOf(b) : String(a).localeCompare(String(b), undefined, { numeric: true }));
    else labels.sort((a, b) => vis.sort === 'label' ? String(a).localeCompare(String(b), undefined, { numeric: true }) : (main.get(b) || 0) - (main.get(a) || 0));
    if (labels.includes('(blank)') && vis.hideBlank !== false) labels = labels.filter(l => l !== '(blank)');
    const top = +vis.top || 0; let other = null;
    if (top && labels.length > top && !timeAxis) { const rest = labels.slice(top); labels = labels.slice(0, top); if (vis.other !== false) { other = rest.flatMap(l => groups.get(l)); labels.push('Other'); groups.set('Other', other); } }
    const series = [];
    if (vis.split) {
      const sv = new Map(); for (const r of rows) { const k = String(r[vis.split] ?? '') || '(blank)'; sv.set(k, (sv.get(k) || 0) + 1); }
      const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; let keys = [...sv.keys()];
      keys = keys.every(k => WD.includes(k)) ? keys.sort((a, b) => WD.indexOf(a) - WD.indexOf(b)) : keys.sort((a, b) => sv.get(b) - sv.get(a)).slice(0, vis.type === 'heat' ? 24 : 8);
      for (const s of keys) series.push({ name: s, values: labels.map(l => { const g = (groups.get(l) || []).filter(r => (String(r[vis.split] ?? '') || '(blank)') === s); return g.length ? SD.calc(fn, g, vis.field) : 0; }), counts: labels.map(l => (groups.get(l) || []).filter(r => (String(r[vis.split] ?? '') || '(blank)') === s).length) });
    } else series.push({ name: SD.measureName(vis, ds), values: labels.map(l => l === 'Other' ? SD.calc(fn, other, vis.field) : main.get(l)), counts: labels.map(l => (groups.get(l) || []).length) });
    return { labels, series, n: rows.length, grain };
  },
  measureName(vis, ds) { const fn = vis.fn || 'count'; if (fn.startsWith('m:')) { const m = ((ds || SD.cur || {}).measures || []).find(x => x.id === fn.slice(2)); return m ? m.name : 'Measure'; } if (fn === 'count') return 'Count'; const c = ds.cols.find(x => x.key === vis.field); return `${(SD.FNS.find(f => f[0] === fn) || [, fn])[1]} of ${c ? c.label : vis.field}`; },
  fmt(v, fn) { if (v == null || !isFinite(v)) return '–'; const a = Math.abs(v); return a >= 1e6 ? U.num(v / 1e6, 1) + 'M' : a >= 1e4 ? U.num(v / 1e3, 1) + 'k' : Number.isInteger(v) ? v.toLocaleString() : U.num(v, fn === 'avg' || fn === 'median' ? 1 : 2); },
  /* small-number rule: on patient-level data, a count from fewer than 5 rows is shown as "<5" */
  small(ds, count) { return !!(ds && ds.smallCells && count > 0 && count < 5); },
  /* ---------- automatic findings ---------- */
  insights(ds, rows) {
    const out = []; const dcol = ds.cols.find(c => c.type === 'date'); const cats = ds.cols.filter(c => c.type === 'category' && !c.coded);
    if (dcol) {
      const by = new Map(); for (const r of rows) { const m = String(r[dcol.key] || '').slice(0, 7); if (m) by.set(m, (by.get(m) || 0) + 1); }
      const ms = [...by.keys()].sort(); const thisMo = U.todayStr().slice(0, 7); const full = ms.filter(m => m < thisMo);
      if (full.length >= 2) { const a = by.get(full[full.length - 2]), b = by.get(full[full.length - 1]); const ch = (b - a) / (a || 1); if (Math.abs(ch) >= 0.1) out.push({ kind: ch > 0 ? 'up' : 'down', text: `${U.MONTHS[+full[full.length - 1].slice(5) - 1]} had ${b.toLocaleString()} rows — ${ch > 0 ? 'up' : 'down'} ${Math.round(Math.abs(ch) * 100)}% from ${U.MONTHS[+full[full.length - 2].slice(5) - 1]}.` });
        // which category moved most
        const c = cats.find(x => { const n = new Set(rows.map(r => r[x.key])).size; return n > 1 && n <= 40; });
        if (c) { const cnt = m => { const o = {}; for (const r of rows) if (String(r[dcol.key] || '').startsWith(m)) o[r[c.key]] = (o[r[c.key]] || 0) + 1; return o; }; const A = cnt(full[full.length - 2]), B = cnt(full[full.length - 1]);
          const best = Object.keys(B).map(k => [k, (B[k] || 0) - (A[k] || 0)]).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0]; if (best && Math.abs(best[1]) >= 5 && best[0]) out.push({ kind: best[1] > 0 ? 'up' : 'down', text: `Biggest change: ${c.label} “${best[0]}” ${best[1] > 0 ? '+' : ''}${best[1]} vs the month before.` }); } }
      const W = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; const wd = [0, 0, 0, 0, 0, 0, 0]; for (const r of rows) { const d = U.pd(String(r[dcol.key] || '').slice(0, 10)); if (d) wd[d.getDay()]++; }
      const tot = wd.reduce((a, b) => a + b, 0); if (tot > 50) { const i = wd.indexOf(Math.max(...wd)); out.push({ kind: 'info', text: `${W[i]} is the busiest day (${Math.round((wd[i] / tot) * 100)}% of rows).` }); }
    }
    const c0 = cats.find(x => { const n = new Set(rows.map(r => r[x.key])).size; return n > 2 && n <= 60; });
    if (c0 && rows.length) { const o = {}; for (const r of rows) if (r[c0.key]) o[r[c0.key]] = (o[r[c0.key]] || 0) + 1; const s = Object.entries(o).sort((a, b) => b[1] - a[1]); const t3 = s.slice(0, 3).reduce((a, x) => a + x[1], 0); if (s.length > 4) out.push({ kind: 'info', text: `Top 3 ${c0.label} values (${s.slice(0, 3).map(x => x[0]).join(', ')}) make ${Math.round((t3 / rows.length) * 100)}% of all rows.` }); }
    const num = ds.cols.find(c => c.type === 'number' && !c.coded && /hour|minute|day|time|los|wait|turn/i.test(c.label));
    if (num && c0) { const g = {}; for (const r of rows) { const v = r[num.key]; if (typeof v !== 'number' || !r[c0.key]) continue; (g[r[c0.key]] = g[r[c0.key]] || []).push(v); } const av = Object.entries(g).filter(([, v]) => v.length >= 10).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]).sort((a, b) => b[1] - a[1]); if (av.length > 2) out.push({ kind: 'warn', text: `Longest average ${num.label}: ${av[0][0]} (${U.num(av[0][1], 1)}) — the overall middle value is ${U.num(av[Math.floor(av.length / 2)][1], 1)}.` }); }
    return out.slice(0, 4);
  },
  /* ---------- "Show me": a starter dashboard ---------- */
  suggest(ds) {
    const out = []; const id = () => 'v' + Math.random().toString(36).slice(2, 8);
    const d = ds.cols.find(c => c.type === 'date'); const cats = ds.cols.filter(c => c.type === 'category' && !c.coded).map(c => ({ c, n: new Set(ds.rows.slice(0, 5000).map(r => r[c.key])).size })).filter(x => x.n > 1);
    const nums = ds.cols.filter(c => c.type === 'number' && !/year|^id$/i.test(c.key));
    out.push({ id: id(), type: 'kpi', title: 'Rows', fn: 'count', w: 1 });
    if (nums[0]) out.push({ id: id(), type: 'kpi', title: 'Average ' + nums[0].label, fn: 'avg', field: nums[0].key, w: 1 });
    const few = cats.filter(x => x.n <= 8);
    if (d) out.push({ id: id(), type: 'kpitrend', title: 'Rows — latest month', x: d.key, grain: 'month', fn: 'count', w: 1 });
    else if (few[0]) out.push({ id: id(), type: 'kpi', title: `Most common ${few[0].c.label}`, fn: 'top', field: few[0].c.key, w: 1 });
    if (d) out.push({ id: id(), type: 'area', title: 'Rows per month', x: d.key, grain: 'month', fn: 'count', w: 3 });
    const mid = cats.filter(x => x.n > 2 && x.n <= 60);
    if (mid[0]) out.push({ id: id(), type: 'hbar', title: `By ${mid[0].c.label}`, x: mid[0].c.key, fn: 'count', top: 10, w: 2 });
    if (few[0]) out.push({ id: id(), type: 'donut', title: `Share by ${few[0].c.label}`, x: few[0].c.key, fn: 'count', w: 1 });
    if (mid[1] && nums[0]) out.push({ id: id(), type: 'bar', title: `Average ${nums[0].label} by ${mid[1].c.label}`, x: mid[1].c.key, fn: 'avg', field: nums[0].key, top: 12, w: 2 });
    else if (mid[1]) out.push({ id: id(), type: 'bar', title: `By ${mid[1].c.label}`, x: mid[1].c.key, fn: 'count', top: 12, w: 2 });
    if (d && few[1]) out.push({ id: id(), type: 'stacked', title: `${few[1].c.label} per month`, x: d.key, grain: 'month', split: few[1].c.key, fn: 'count', w: mid[1] ? 1 : 3 });
    if (d) { const wd = SD.derive(ds, d.key, 'weekday'); const hr = ds.rows.some(r => String(r[d.key]).length > 11) ? SD.derive(ds, d.key, 'hour') : null;
      if (hr) out.push({ id: id(), type: 'heat', title: 'Busiest hours', x: hr, split: wd, fn: 'count', w: 3, sort: 'label' }); }
    if (mid[0] && nums[0]) out.push({ id: id(), type: 'box', title: `${nums[0].label} — spread by ${mid[0].c.label}`, x: mid[0].c.key, field: nums[0].key, top: 10, w: 2 });
    if (mid[0]) out.push({ id: id(), type: 'pareto', title: `Which ${mid[0].c.label} values make 80%`, x: mid[0].c.key, fn: 'count', top: 15, w: mid[0] && nums[0] ? 1 : 3 });
    return out;
  },
  /* ---------- MAHAM's own records as a dataset ---------- */
  MAHAM: [['helpdesk', 'Help desk requests'], ['shadow', 'Shadow work'], ['todo', 'To Dos'], ['quickwin', 'Quick wins'], ['gcatch', 'Good catches']],
  fromMaham(c) {
    const recs = Store.all(c, '*'); const who = id => Store.memberShort(id) || id || '';
    const map = {
      helpdesk: r => ({ 'Request ID': String(r.reqId || ''), Created: r.created || '', Resolved: r.resolved || '', Status: r.status || '', Group: r.group || '', Department: r.department || '', Technician: r.technician || '', Subject: r.subject || '', 'Elapsed hours': r.elapsedHrs == null ? '' : r.elapsedHrs, Team: Store.teamName(r.team || 'apps') }),
      shadow: r => ({ Date: r.date || '', Analyst: who(r.analyst), 'Task type': r.taskType || '', Category: Calc.category(r.taskType), Source: r.source || '', Subject: r.subject || '', Minutes: +r.minutes || 0, Team: Store.teamName(r.team || 'apps') }),
      todo: r => { const d = Calc.todoDerive(r); return { Assigned: r.assigned || '', Due: d.due || '', Finished: r.finish || '', Analyst: who(r.analyst), Task: r.task || '', Priority: r.priority || 'Normal', Status: d.status, Timing: d.timing, 'Days late': d.days, Team: Store.teamName(r.team || 'apps') }; },
      quickwin: r => ({ Date: r.date || '', Expected: r.expected || '', Analyst: who(r.analyst), Module: r.module || '', Type: r.type || '', Status: r.status || '', Approval: r.approval || 'Pending', Subject: r.subject || '', Team: Store.teamName(r.team || 'apps') }),
      gcatch: r => ({ Found: r.found || '', Resolved: r.resolvedOn || '', Title: r.title || '', Type: r.kind || '', System: r.system || '', Where: r.where || '', Impact: r.impact || '', Status: r.status || 'New', 'Found by': who(r.createdBy), 'Taken by': who(r.taker) }),
    }[c];
    const rows = recs.map(map); const keys = rows.length ? Object.keys(rows[0]) : [];
    return SD.make((SD.MAHAM.find(x => x[0] === c) || [, c])[1], keys, rows, 'maham');
  },
  /* ---------- a sample hospital dataset (made up — no real patients) to try Studio with ---------- */
  sample(n = 12000) {
    let s = 42; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); const pick = a => a[Math.floor(rnd() * a.length)];
    const comp = ['Chest pain', 'Abdominal pain', 'Fever', 'Shortness of breath', 'Injury / fall', 'Headache', 'Back pain', 'Vomiting', 'Dizziness', 'Allergic reaction', 'Burn', 'Fracture'];
    const disp = ['Discharged', 'Discharged', 'Discharged', 'Admitted', 'Admitted', 'Left without being seen', 'Transferred'];
    const ward = ['Medical', 'Surgical', 'Pediatrics', 'ICU', 'Cardiology', 'Orthopedics'];
    const first = ['Ahmed', 'Mohammed', 'Fatimah', 'Noura', 'Khalid', 'Sara', 'Abdullah', 'Huda', 'Omar', 'Reem'], last = ['Alharbi', 'Alghamdi', 'Alzahrani', 'Alotaibi', 'Alqahtani', 'Almalki'];
    const grid = [['Visit No', 'MRN', 'Patient Name', 'Mobile', 'Arrival', 'Triage Level', 'Chief Complaint', 'Age Group', 'Gender', 'Door to Doctor (min)', 'ED LOS (hours)', 'Disposition', 'Admitted To']];
    const start = U.pd(U.addDays(U.todayStr(), -400));
    for (let i = 0; i < n; i++) {
      const d = new Date(start); d.setDate(d.getDate() + Math.floor(rnd() * 400)); const hr = Math.floor(Math.pow(rnd(), 0.8) * 24); d.setHours(hr, Math.floor(rnd() * 60));
      const tri = 1 + Math.floor(Math.pow(rnd(), 0.7) * 5); const dsp = pick(disp); const busy = (d.getDay() === 0 ? 1.4 : 1) * (hr >= 18 ? 1.3 : 1);
      grid.push([100000 + i, String(1000000 + Math.floor(rnd() * 800000)), pick(first) + ' ' + pick(last), '05' + String(Math.floor(rnd() * 1e8)).padStart(8, '0'), U.ds(d) + ' ' + U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()), 'Level ' + tri, pick(comp), pick(['0-14', '15-30', '31-45', '46-60', '61-75', '75+']), pick(['Male', 'Female']),
        Math.round((5 + rnd() * 40 * (tri / 2) * busy)), Math.round((1 + rnd() * 8 * busy + (dsp === 'Admitted' ? 4 + rnd() * 10 : 0)) * 10) / 10, dsp, dsp === 'Admitted' ? pick(ward) : '']);
    }
    return SD.fromGrid('ER visits (sample, made up)', grid);
  },
};
