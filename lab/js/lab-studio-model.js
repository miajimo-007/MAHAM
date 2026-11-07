/* MAHAM Lab — Studio data model: every change to a dataset is a recorded STEP, so "Refresh from file" can read the
 * new export and replay the same privacy choices and steps. Also: formula columns (a small, safe formula language —
 * no eval), ranges, value lists, hospital calendar columns, linking two datasets, combining a folder of files,
 * data quality, saved measures, backup / restore, auto-delete, sensitivity labels. */
'use strict';

/* ============================ formula language ============================
 * [Column name], numbers, 'text', + - * / % &, = <> < <= > >=, AND OR NOT, and functions:
 * IF, AND, OR, NOT, ROUND, ABS, MIN, MAX, LEN, UPPER, LOWER, TRIM, LEFT, RIGHT, CONTAINS, STARTSWITH, BLANK, COALESCE,
 * YEAR, MONTH, DAY, HOUR, WEEKDAY, DAYS, HOURS, MINUTES, TODAY */
const SF = {
  tokens(s) {
    const out = []; let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '[') { const j = s.indexOf(']', i); if (j < 0) throw new Error('A [column name] is missing its closing ]'); out.push({ t: 'col', v: s.slice(i + 1, j).trim() }); i = j + 1; continue; }
      if (ch === '"' || ch === "'") { const j = s.indexOf(ch, i + 1); if (j < 0) throw new Error('A text value is missing its closing quote'); out.push({ t: 'str', v: s.slice(i + 1, j) }); i = j + 1; continue; }
      const num = /^\d+(\.\d+)?/.exec(s.slice(i)); if (num) { out.push({ t: 'num', v: +num[0] }); i += num[0].length; continue; }
      const op = /^(<=|>=|<>|!=|==|[-+*/%&=<>(),])/.exec(s.slice(i)); if (op) { out.push({ t: 'op', v: op[0] }); i += op[0].length; continue; }
      const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i)); if (id) { out.push({ t: 'id', v: id[0].toUpperCase() }); i += id[0].length; continue; }
      throw new Error(`I don't understand "${ch}" in the formula`);
    }
    return out;
  },
  parse(src) {
    const T = SF.tokens(String(src || '')); let p = 0;
    const peek = () => T[p], take = () => T[p++], is = (t, v) => T[p] && T[p].t === t && (v == null || T[p].v === v);
    const expect = v => { if (!is('op', v)) throw new Error(`Expected "${v}" in the formula`); p++; };
    const orE = () => { let l = andE(); while (is('id', 'OR')) { p++; l = { k: 'or', a: l, b: andE() }; } return l; };
    const andE = () => { let l = cmpE(); while (is('id', 'AND')) { p++; l = { k: 'and', a: l, b: cmpE() }; } return l; };
    const cmpE = () => { const l = addE(); const t = peek(); if (t && t.t === 'op' && ['=', '==', '<>', '!=', '<', '<=', '>', '>='].includes(t.v)) { p++; return { k: 'cmp', o: t.v, a: l, b: addE() }; } return l; };
    const addE = () => { let l = mulE(); while (is('op', '+') || is('op', '-') || is('op', '&')) { const o = take().v; l = { k: 'bin', o, a: l, b: mulE() }; } return l; };
    const mulE = () => { let l = unE(); while (is('op', '*') || is('op', '/') || is('op', '%')) { const o = take().v; l = { k: 'bin', o, a: l, b: unE() }; } return l; };
    const unE = () => { if (is('op', '-')) { p++; return { k: 'neg', a: unE() }; } if (is('id', 'NOT')) { p++; return { k: 'not', a: unE() }; } return prim(); };
    const prim = () => {
      const t = take(); if (!t) throw new Error('The formula ends too early');
      if (t.t === 'num') return { k: 'lit', v: t.v }; if (t.t === 'str') return { k: 'lit', v: t.v }; if (t.t === 'col') return { k: 'col', v: t.v };
      if (t.t === 'op' && t.v === '(') { const e = orE(); expect(')'); return e; }
      if (t.t === 'id') { if (t.v === 'TRUE') return { k: 'lit', v: true }; if (t.v === 'FALSE') return { k: 'lit', v: false };
        if (!SF.FN[t.v]) throw new Error(`Unknown function ${t.v}. Try IF, ROUND, CONTAINS, DAYS, HOURS…`); expect('('); const args = []; if (!is('op', ')')) { args.push(orE()); while (is('op', ',')) { p++; args.push(orE()); } } expect(')'); return { k: 'fn', f: t.v, args }; }
      throw new Error(`Unexpected "${t.v}" in the formula`);
    };
    const tree = orE(); if (p < T.length) throw new Error(`Unexpected "${T[p].v}" in the formula`); return tree;
  },
  ms(d) { if (!d) return null; const t = Date.parse(String(d).length > 10 ? d : d + 'T00:00'); return isNaN(t) ? null : t; },
  FN: {
    IF: (c, a, b) => (c ? a : b), AND: (...x) => x.every(Boolean), OR: (...x) => x.some(Boolean), NOT: x => !x,
    ROUND: (x, n) => (x == null || x === '' ? null : Math.round(+x * 10 ** (+n || 0)) / 10 ** (+n || 0)), ABS: x => (x == null ? null : Math.abs(+x)),
    MIN: (...x) => Math.min(...x.filter(v => v !== '' && v != null).map(Number)), MAX: (...x) => Math.max(...x.filter(v => v !== '' && v != null).map(Number)),
    LEN: s => String(s ?? '').length, UPPER: s => String(s ?? '').toUpperCase(), LOWER: s => String(s ?? '').toLowerCase(), TRIM: s => String(s ?? '').trim(),
    LEFT: (s, n) => String(s ?? '').slice(0, +n || 0), RIGHT: (s, n) => String(s ?? '').slice(-(+n || 0)),
    CONTAINS: (s, x) => String(s ?? '').toLowerCase().includes(String(x ?? '').toLowerCase()), STARTSWITH: (s, x) => String(s ?? '').toLowerCase().startsWith(String(x ?? '').toLowerCase()),
    BLANK: x => x == null || x === '', COALESCE: (...x) => x.find(v => v != null && v !== '') ?? '',
    YEAR: d => (d ? +String(d).slice(0, 4) : null), MONTH: d => (d ? +String(d).slice(5, 7) : null), DAY: d => (d ? +String(d).slice(8, 10) : null), HOUR: d => (d && String(d).length > 11 ? +String(d).slice(11, 13) : null),
    WEEKDAY: d => { const x = d && U.pd(String(d).slice(0, 10)); return x ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][x.getDay()] : ''; },
    DAYS: (a, b) => { const x = SF.ms(a), y = SF.ms(b); return x == null || y == null ? null : Math.round(((y - x) / 864e5) * 100) / 100; },
    HOURS: (a, b) => { const x = SF.ms(a), y = SF.ms(b); return x == null || y == null ? null : Math.round(((y - x) / 36e5) * 100) / 100; },
    MINUTES: (a, b) => { const x = SF.ms(a), y = SF.ms(b); return x == null || y == null ? null : Math.round((y - x) / 6e4); },
    TODAY: () => U.todayStr(),
  },
  /* → row => value; column names are matched by label or key, ignoring case */
  compile(src, ds) {
    const tree = SF.parse(src); const find = n => { const l = n.toLowerCase(); const c = ds.cols.find(x => x.label.toLowerCase() === l) || ds.cols.find(x => x.key.toLowerCase() === l); if (!c) throw new Error(`No column called [${n}]`); return c.key; };
    const walk = t => { if (t.k === 'col') t.key = find(t.v); for (const x of [t.a, t.b, ...(t.args || [])]) if (x) walk(x); }; walk(tree);
    const num = v => (v === '' || v == null ? null : typeof v === 'number' ? v : isFinite(+v) ? +v : v);
    const ev = (t, r) => {
      switch (t.k) {
        case 'lit': return t.v; case 'col': return r[t.key];
        case 'neg': { const v = num(ev(t.a, r)); return v == null ? null : -v; } case 'not': return !ev(t.a, r);
        case 'and': return !!(ev(t.a, r) && ev(t.b, r)); case 'or': return !!(ev(t.a, r) || ev(t.b, r));
        case 'cmp': { let a = ev(t.a, r), b = ev(t.b, r); if (typeof a === 'number' || typeof b === 'number') { a = num(a); b = num(b); } else { a = String(a ?? '').toLowerCase(); b = String(b ?? '').toLowerCase(); }
          return t.o === '=' || t.o === '==' ? a === b : t.o === '<>' || t.o === '!=' ? a !== b : a == null || b == null ? false : t.o === '<' ? a < b : t.o === '<=' ? a <= b : t.o === '>' ? a > b : a >= b; }
        case 'bin': { const a = ev(t.a, r), b = ev(t.b, r); if (t.o === '&') return String(a ?? '') + String(b ?? ''); const x = num(a), y = num(b); if (x == null || y == null || typeof x !== 'number' || typeof y !== 'number') return null;
          return t.o === '+' ? x + y : t.o === '-' ? x - y : t.o === '*' ? x * y : t.o === '/' ? (y ? x / y : null) : (y ? x % y : null); }
        case 'fn': return SF.FN[t.f](...t.args.map(a => ev(a, r)));
      }
      return null;
    };
    return r => { try { const v = ev(tree, r); return typeof v === 'number' && !isFinite(v) ? null : v; } catch (e) { return null; } };
  },
  EXAMPLES: ["IF([Door to Doctor (min)] > 30, 'Late', 'On time')", '[ED LOS (hours)] * 60', "HOURS([Arrival], [Discharge])", "IF(CONTAINS([Chief Complaint], 'pain'), 'Pain', 'Other')", "[Triage Level] & ' · ' & [Gender]"],
};

/* ============================ steps (recorded, replayable) ============================ */
Object.assign(SD, {
  STEP_LABEL: { type: 'Changed type', rename: 'Renamed', unify: 'Tidied spelling', dedupe: 'Removed duplicates', derive: 'Helper column', between: 'Time between', drop: 'Removed column', formula: 'Formula column', bins: 'Ranges', recode: 'Value list', calendar: 'Calendar column', link: 'Linked data', clearodd: 'Cleared odd dates', fill: 'Filled empty cells' },
  stepText(s) { const L = SD.STEP_LABEL[s.op] || s.op; return `${L}${s.name ? ': ' + s.name : s.key ? ': ' + s.key : ''}${s.part ? ' (' + (SD.DERIVE[s.part] || s.part) + ')' : ''}`; },
  /* apply one step to a dataset; returns a short message */
  async apply(ds, s) {
    const col = k => ds.cols.find(c => c.key === k);
    const addCol = (key, type, extra) => { ds.cols = ds.cols.filter(c => c.key !== key); ds.cols.push(Object.assign({ key, label: key, type, derived: true }, extra || {})); };
    switch (s.op) {
      case 'type': { const c = col(s.key); if (!c) return 'missing'; c.type = s.type; if (c.type === 'date') for (const r of ds.rows) r[c.key] = SD.toDate(r[c.key]); if (c.type === 'number') for (const r of ds.rows) r[c.key] = SD.toNum(r[c.key]); if (c.type === 'category' || c.type === 'text' || c.type === 'id') for (const r of ds.rows) r[c.key] = r[c.key] == null ? '' : String(r[c.key]); return 'Type changed'; }
      case 'fill': { const c = col(s.key); if (!c) return 'missing'; let n = 0; for (const r of ds.rows) if (r[c.key] === '' || r[c.key] == null) { r[c.key] = s.value; n++; } return `${n.toLocaleString()} empty cells filled with "${s.value}"`; }
      case 'rename': { const c = col(s.key); if (c) c.label = s.label; return 'Renamed'; }
      case 'unify': { if (!col(s.key)) return 'missing'; const n = SD.unify(ds, s.key); return `${n.toLocaleString()} value${n === 1 ? '' : 's'} tidied`; }
      case 'dedupe': { const n = SD.dedupe(ds); return n ? `${n.toLocaleString()} duplicate rows removed` : 'No duplicate rows'; }
      case 'derive': { if (!col(s.key)) return 'missing'; return `Added "${SD.derive(ds, s.key, s.part)}"`; }
      case 'between': { if (!col(s.a) || !col(s.b)) return 'missing'; return `Added "${SD.between(ds, s.a, s.b, s.unit)}"`; }
      case 'drop': { ds.cols = ds.cols.filter(c => c.key !== s.key); for (const r of ds.rows) delete r[s.key]; return 'Column removed'; }
      case 'formula': { const f = SF.compile(s.expr, ds); for (const r of ds.rows) r[s.name] = f(r); const vals = ds.rows.slice(0, 500).map(r => r[s.name]).filter(v => v != null && v !== '');
        const type = vals.length && vals.every(v => typeof v === 'number') ? 'number' : vals.length && vals.every(v => typeof v === 'string' && SD.DATE_RX.test(v)) ? 'date' : 'category';
        if (type === 'category') for (const r of ds.rows) r[s.name] = r[s.name] == null ? '' : typeof r[s.name] === 'boolean' ? (r[s.name] ? 'Yes' : 'No') : String(r[s.name]);
        addCol(s.name, type, { formula: s.expr }); return `Added "${s.name}"`; }
      case 'bins': { const e = s.edges.slice().sort((a, b) => a - b); const fmt = v => (Number.isInteger(v) ? String(v) : U.num(v, 1)); const lab = v => { if (v == null || v === '') return ''; let i = 0; while (i < e.length && v >= e[i]) i++; return i === 0 ? `< ${fmt(e[0])}` : i === e.length ? `${fmt(e[e.length - 1])}+` : `${fmt(e[i - 1])}–${fmt(e[i])}`; };
        for (const r of ds.rows) r[s.name] = lab(r[s.key]); addCol(s.name, 'category', { order: [`< ${fmt(e[0])}`, ...e.slice(1).map((x, i) => `${fmt(e[i])}–${fmt(x)}`), `${fmt(e[e.length - 1])}+`] }); return `Added "${s.name}"`; }
      case 'recode': { const m = new Map(Object.entries(s.map).map(([k, v]) => [k.toLowerCase(), v])); const nk = s.name || s.key; let n = 0;
        for (const r of ds.rows) { const v = String(r[s.key] ?? ''); const to = m.get(v.trim().toLowerCase()); if (to != null) { r[nk] = to; n++; } else r[nk] = s.keepOthers === false ? 'Other' : v; }
        if (nk !== s.key) addCol(nk, 'category'); return `${n.toLocaleString()} values changed`; }
      case 'calendar': { if (!col(s.key)) return 'missing'; const nm = `${col(s.key).label} · ${SD.CAL[s.kind][0]}`; for (const r of ds.rows) r[nm] = SD.calValue(r[s.key], s.kind, s); addCol(nm, 'category', { order: SD.CAL[s.kind][2] }); return `Added "${nm}"`; }
      case 'clearodd': { let n = 0; const lo = '1990-01-01', hi = U.addDays(U.todayStr(), 1); for (const r of ds.rows) { const v = String(r[s.key] || '').slice(0, 10); if (v && (v < lo || v > hi)) { r[s.key] = ''; n++; } } return `${n} odd date${n === 1 ? '' : 's'} cleared`; }
      case 'link': { const other = await Lab.read('studio.ds.' + s.dsId, null); if (!other) return 'The linked dataset is not on this PC any more';
        const m = new Map(); for (const r of other.rows) { const k = String(r[s.otherKey] ?? '').trim().toLowerCase(); if (k && !m.has(k)) m.set(k, r); }
        let hit = 0; const names = s.cols.map(k => { const c = other.cols.find(x => x.key === k); return [k, ds.cols.some(x => x.key === k) ? `${k} (${other.name})` : k, c ? c.type : 'category']; });
        for (const r of ds.rows) { const o = m.get(String(r[s.key] ?? '').trim().toLowerCase()); if (o) hit++; for (const [k, nk] of names) r[nk] = o ? o[k] : (names.find(x => x[0] === k)[2] === 'number' ? null : ''); }
        for (const [, nk, t] of names) addCol(nk, t, { linked: other.name }); return `Linked ${hit.toLocaleString()} of ${ds.rows.length.toLocaleString()} rows to "${other.name}"`; }
    }
    return 'Unknown step';
  },
  /* ---------- hospital calendar ---------- */
  CAL: {
    shift: ['Shift', 'Day 07–15 · Evening 15–23 · Night 23–07', ['Day', 'Evening', 'Night']],
    hours: ['Working hours', 'Sun–Thu 07:30–15:30, else after hours, Fri/Sat weekend', ['Working hours', 'After hours', 'Weekend']],
    fiscal: ['Fiscal year', 'Year that starts in the chosen month', null],
    season: ['Season', 'Ramadan, Peak season, or normal (Hijri calendar)', ['Ramadan', 'Peak season', 'Normal']],
  },
  HNUM: (() => { try { return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { month: 'numeric' }); } catch (e) { return null; } })(),
  calValue(v, kind, s) {
    if (!v) return ''; const d = String(v); const dt = U.pd(d.slice(0, 10)); if (!dt) return '';
    const hh = d.length > 11 ? +d.slice(11, 13) + (+d.slice(14, 16) || 0) / 60 : null;
    if (kind === 'shift') return hh == null ? '' : hh >= 7 && hh < 15 ? 'Day' : hh >= 15 && hh < 23 ? 'Evening' : 'Night';
    if (kind === 'hours') { const wd = dt.getDay(); if (wd === 5 || wd === 6) return 'Weekend'; return hh == null ? 'Working hours' : hh >= 7.5 && hh < 15.5 ? 'Working hours' : 'After hours'; }
    if (kind === 'fiscal') { const sm = +(s && s.startMonth) || 1; const y = dt.getFullYear(), m = dt.getMonth() + 1; return sm === 1 ? 'FY ' + y : m >= sm ? `FY ${y}/${String(y + 1).slice(2)}` : `FY ${y - 1}/${String(y).slice(2)}`; }
    if (kind === 'season') { if (!SD.HNUM) return ''; const hm = +SD.HNUM.format(dt).replace(/\D/g, ''); return hm === 9 ? 'Ramadan' : hm === 12 || (hm === 11 && dt.getDate() > 20) ? 'Peak season' : 'Normal'; }
    return '';
  },
  /* ---------- data quality ---------- */
  quality(ds) {
    const hi = U.addDays(U.todayStr(), 1); const n = ds.rows.length || 1;
    const cols = ds.cols.map(c => {
      const vals = ds.rows.map(r => r[c.key]); const blank = vals.filter(v => v === '' || v == null).length; const o = { c, blank, blankPct: blank / n, issues: [] };
      if (c.type === 'number') { const v = vals.filter(x => typeof x === 'number').sort((a, b) => a - b); if (v.length > 8) { const q1 = SC.q(v, 0.25), q3 = SC.q(v, 0.75), k = 3 * (q3 - q1); const out = v.filter(x => x < q1 - k || x > q3 + k).length; if (out) o.issues.push(['extreme', `${out.toLocaleString()} extreme value${out > 1 ? 's' : ''} (far outside the usual range ${U.num(q1, 1)}–${U.num(q3, 1)})`]); const neg = v.filter(x => x < 0).length; if (neg && /time|hour|minute|day|los|wait|age|count/i.test(c.label)) o.issues.push(['neg', `${neg} negative value${neg > 1 ? 's' : ''}`]); } }
      if (c.type === 'date') { const odd = vals.filter(x => x && (String(x).slice(0, 10) < '1990-01-01' || String(x).slice(0, 10) > hi)).length; if (odd) o.issues.push(['odd', `${odd} date${odd > 1 ? 's' : ''} in the future or before 1990`]); }
      if (c.type === 'category') { const m = new Map(); for (const v of vals) { const s = String(v ?? '').trim(); if (!s) continue; const l = s.toLowerCase().replace(/\s+/g, ' '); (m.get(l) || m.set(l, new Set()).get(l)).add(String(v)); } const multi = [...m.values()].filter(s => s.size > 1).length; if (multi) o.issues.push(['spell', `${multi} value${multi > 1 ? 's are' : ' is'} written in more than one way`]); }
      if (o.blankPct > 0.3) o.issues.push(['blank', `${Math.round(o.blankPct * 100)}% empty`]);
      return o;
    });
    const seen = new Set(); let dup = 0; for (const r of ds.rows) { const k = JSON.stringify(ds.cols.map(c => r[c.key])); if (seen.has(k)) dup++; else seen.add(k); }
    return { cols, dup };
  },
  /* ---------- saved measures: fn 'm:<id>' ---------- */
  MEASURE_KINDS: [['count', 'Count of rows where…'], ['pct', '% of rows where…'], ['avg', 'Average of'], ['sum', 'Sum of'], ['median', 'Median of'], ['min', 'Minimum of'], ['max', 'Maximum of'], ['distinct', 'Distinct values of']],
  measureFns(ds) { return (ds && ds.measures || []).map(m => ['m:' + m.id, '★ ' + m.name]); },
  _mcache: new Map(),
  measureCalc(ds, id, list) {
    const m = (ds.measures || []).find(x => x.id === id); if (!m) return null;
    let f = SD._mcache.get(m.id + '|' + m.cond); if (m.cond && !f) { try { f = SF.compile(m.cond, ds); } catch (e) { f = () => false; } SD._mcache.set(m.id + '|' + m.cond, f); }
    const hit = m.cond ? list.filter(r => f(r)) : list;
    if (m.kind === 'pct') return list.length ? hit.length / list.length : null;
    if (m.kind === 'count') return hit.length;
    return SD.calc(m.kind, hit, m.field);
  },
  /* ---------- several files from one folder → one dataset (with the file name as a column) ---------- */
  async readFolder(dir, prog) {
    const files = []; for await (const [n, x] of dir.entries()) if (x.kind === 'file' && /\.(xlsx|xlsm|csv|txt|tsv)$/i.test(n) && !n.startsWith('~$')) files.push(x);
    if (!files.length) throw new Error('No Excel or CSV files in this folder.');
    files.sort((a, b) => a.name.localeCompare(b.name));
    const parts = []; let i = 0;
    for (const fh of files) { if (prog) prog(i++ / files.length, `Reading ${fh.name}…`); const f = await fh.getFile(); const d = await SD.readFile(f); parts.push([fh.name, d]); }
    const keys = []; for (const [, d] of parts) for (const c of d.cols) if (!keys.includes(c.key)) keys.push(c.key);
    const raw = []; for (const [n, d] of parts) for (const r of d.rows) { const o = {}; for (const k of keys) o[k] = r[k] ?? ''; o['Source file'] = n; raw.push(o); }
    const ds = SD.make(dir.name, [...keys, 'Source file'], raw.map(r => { const o = {}; for (const k of [...keys, 'Source file']) o[k] = typeof r[k] === 'string' ? r[k] : r[k] == null ? '' : r[k]; return o; }), 'folder');
    ds.fileCount = files.length; return ds;
  },
});

/* ============================ governance + backup ============================ */
const SG = {
  LABELS: [['Internal', 'Internal'], ['Confidential', 'Confidential'], ['Patient-level', 'Patient-level (confidential)']],
  label(ds) { return ds.label || (ds.patientLevel ? 'Patient-level' : 'Internal'); },
  who() { try { return Store.memberName(App.me) || App.me || ''; } catch (e) { return ''; } },
  mark(ds) { return `${SG.label(ds)} · MEH internal use · ${SG.who()} · ${U.fmtDate(U.todayStr())}`; },
  /* datasets not opened for N days are removed from this PC (patient-level data should not stay forever) */
  async expire(meta) {
    const days = meta.keepDays == null ? 90 : +meta.keepDays; if (!days) return [];
    const cut = U.addDays(U.todayStr(), -days); const gone = meta.datasets.filter(d => (d.lastOpened || d.created || U.todayStr()) < cut);
    for (const d of gone) await Studio.remove(d.id); return gone.map(d => d.name);
  },
  async backup() {
    const meta = Studio.meta; const sets = [], findings = {}; for (const d of meta.datasets) { sets.push(await Lab.read('studio.ds.' + d.id, null)); const f = await Lab.read('studio.f.' + d.id, null); if (f && f.length) findings[d.id] = f; }
    const blob = new Blob([JSON.stringify({ kind: 'maham-studio-backup', version: 1, at: new Date().toISOString(), by: SG.who(), meta, datasets: sets.filter(Boolean), findings })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `MAHAM Studio backup ${U.todayStr()}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  },
  async restore(file) {
    const j = JSON.parse(await file.text()); if (j.kind !== 'maham-studio-backup') throw new Error('This is not a MAHAM Studio backup file.');
    for (const d of j.datasets) await Lab.write('studio.ds.' + d.id, d); for (const [id, f] of Object.entries(j.findings || {})) await Lab.write('studio.f.' + id, f);
    const M = Studio.meta; const ids = new Set(j.meta.datasets.map(d => d.id));
    M.datasets = [...j.meta.datasets, ...M.datasets.filter(d => !ids.has(d.id))]; Object.assign(M.boards, j.meta.boards); await Studio.saveMeta();
    return j.datasets.length;
  },
};
