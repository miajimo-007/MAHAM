/* MAHAM Lab — Help desk insights: forecast, spikes, time to close, repeat requesters / departments, linked spikes. */
'use strict';

const LabHD = {
  rows() { return LabCache.get('hd-rows', () => Store.all('helpdesk', '*').map(r => Object.assign({ r }, Calc.hdDerive(r))).filter(x => x.r.created && LabData.inTeam(x.r.team || LabData.teamOfPerson(x.mid)))); },
  day(x) { return x.r.created.slice(0, 10); },
  weekStart(d) { const x = U.pd(d); return U.addDays(d, -x.getDay()); },
  groups(n = 6) { const c = {}; for (const x of LabHD.rows()) { const g = x.r.group || '(no group)'; c[g] = (c[g] || 0) + 1; } return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(x => x[0]); },
  /* weekly counts for the last `w` full weeks */
  weekly(filter, w = 26) {
    const end = LabHD.weekStart(U.todayStr()); const weeks = Array.from({ length: w }, (_, i) => U.addDays(end, -7 * (w - i)));
    const c = new Map(weeks.map(k => [k, 0])); for (const x of LabHD.rows()) { if (filter && !filter(x)) continue; const k = LabHD.weekStart(LabHD.day(x)); if (c.has(k)) c.set(k, c.get(k) + 1); }
    return { weeks, vals: weeks.map(k => c.get(k)) };
  },
  /* Holt (level + trend) smoothing → next h weeks, with a range from past one-step errors */
  holt(vals, h = 4, a = 0.4, b = 0.15) {
    if (vals.length < 4) return null; let L = vals[0], T = (vals[3] - vals[0]) / 3; const err = [];
    for (let i = 1; i < vals.length; i++) { const f = L + T; err.push(vals[i] - f); const L2 = a * vals[i] + (1 - a) * (L + T); T = b * (L2 - L) + (1 - b) * T; L = L2; }
    const sd = Math.sqrt(U.avg(err.slice(-12).map(e => e * e)) || 0);
    return Array.from({ length: h }, (_, i) => { const f = Math.max(0, L + T * (i + 1)); return { f, lo: Math.max(0, f - 1.28 * sd * Math.sqrt(i + 1)), hi: f + 1.28 * sd * Math.sqrt(i + 1) }; });
  },
  forecast() {
    return LabCache.get('hd-fc', () => [['All requests', null], ...LabHD.groups(6).map(g => [g, x => (x.r.group || '(no group)') === g])].map(([name, f]) => {
      const s = LabHD.weekly(f); const fc = LabHD.holt(s.vals);
      // accuracy: forecast the last 4 weeks from the weeks before them
      const bt = LabHD.holt(s.vals.slice(0, -4)); const act = s.vals.slice(-4); let mape = null;
      if (bt && U.sum(act)) mape = Math.abs(U.sum(bt.map(x => x.f)) - U.sum(act)) / U.sum(act);
      return { name, weeks: s.weeks, vals: s.vals, fc, next4: fc ? U.sum(fc.map(x => x.f)) : null, lo4: fc ? U.sum(fc.map(x => x.lo)) : null, hi4: fc ? U.sum(fc.map(x => x.hi)) : null, mape };
    }));
  },
  /* unusual days: far above the usual for that weekday over the 8 weeks before */
  spikes(by = 'department') {
    return LabCache.get('hd-sp-' + by, () => {
      const { from } = LabData.range(); const key = x => (by === 'group' ? x.r.group : x.r.department) || '';
      const daily = new Map(); for (const x of LabHD.rows()) { const k = key(x); if (!k) continue; const d = LabHD.day(x); const m = daily.get(k) || daily.set(k, new Map()).get(k); (m.get(d) || m.set(d, []).get(d)).push(x); }
      const out = [];
      for (const [k, m] of daily) for (const [d, list] of m) {
        if (d < from || list.length < 5) continue;
        const base = []; for (let w = 1; w <= 8; w++) base.push((m.get(U.addDays(d, -7 * w)) || []).length);
        const med = base.slice().sort((a, b) => a - b)[4]; const mad = base.map(v => Math.abs(v - med)).sort((a, b) => a - b)[4];
        const thr = med + 3 * Math.max(1, 1.4826 * mad);
        if (list.length >= thr) { const c = new Map(); for (const x of list) { const t = LabText.words(x.r.subject).slice(0, 4).join(' '); c.set(t, (c.get(t) || 0) + 1); } out.push({ key: k, day: d, n: list.length, usual: med, ratio: list.length / Math.max(1, med), top: [...c].sort((a, b) => b[1] - a[1]).slice(0, 3) }); }
      }
      return out.sort((a, b) => b.ratio - a.ratio || b.n - a.n).slice(0, 60);
    });
  },
  /* time to close per group, and how good "the group's usual" is as a prediction */
  ttc() {
    return LabCache.get('hd-ttc', () => {
      const closed = LabHD.rows().filter(x => x.closed && x.hrs != null && x.hrs >= 0).sort((a, b) => LabHD.day(a).localeCompare(LabHD.day(b)));
      const cut = Math.floor(closed.length * 0.8); const tr = closed.slice(0, cut), te = closed.slice(cut);
      const med = l => { const s = l.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; }; const pct = (l, p) => { const s = l.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
      const by = {}; for (const x of tr) (by[x.r.group || '(no group)'] = by[x.r.group || '(no group)'] || []).push(x.hrs);
      const all = med(tr.map(x => x.hrs)); let within = 0, absErr = [];
      for (const x of te) { const p = by[x.r.group || '(no group)'] ? med(by[x.r.group || '(no group)']) : all; if (p == null) continue; absErr.push(Math.abs(p - x.hrs)); if (Math.abs(p - x.hrs) <= Math.max(4, 0.5 * x.hrs)) within++; }
      const groups = {}; for (const x of closed) (groups[x.r.group || '(no group)'] = groups[x.r.group || '(no group)'] || []).push(x.hrs);
      return { n: closed.length, test: te.length, within: te.length ? within / te.length : null, mae: absErr.length ? U.avg(absErr) : null,
        groups: Object.entries(groups).map(([g, l]) => ({ g, n: l.length, med: med(l), p75: pct(l, 0.75), p90: pct(l, 0.9) })).sort((a, b) => b.n - a.n) };
    });
  },
  /* the same person / department raising the same thing again and again */
  repeats() {
    return LabCache.get('hd-rep', () => {
      const { from } = LabData.range(); const key = x => LabText.words(x.r.subject).slice(0, 3).sort().join(' ');
      const req = new Map(), dep = new Map();
      for (const x of LabHD.rows()) { if (LabHD.day(x) < from) continue; const k = key(x); if (!k) continue; if (x.r.requester) { const a = x.r.requester + '|' + k; (req.get(a) || req.set(a, []).get(a)).push(x); } if (x.r.department) { const b = x.r.department + '|' + k; (dep.get(b) || dep.set(b, []).get(b)).push(x); } }
      const fmt = (m, min) => [...m].filter(([, l]) => l.length >= min).map(([k, l]) => ({ who: k.split('|')[0], what: k.split('|')[1], n: l.length, sample: l[l.length - 1].r.subject, last: LabHD.day(l[l.length - 1]) })).sort((a, b) => b.n - a.n).slice(0, 50);
      return { requesters: fmt(req, 3), departments: fmt(dep, 5) };
    });
  },
  /* themes whose daily counts rise and fall together (a shared cause?) */
  async linked() {
    const res = await LabFinder.run(); const { from, to } = LabData.range(); const days = []; for (let d = from; d <= to; d = U.addDays(d, 1)) days.push(d);
    const th = res.themes.filter(t => t.items.length >= 10).slice(0, 30);
    const ser = th.map(t => { const m = new Map(); for (const x of t.items) m.set(x.date, (m.get(x.date) || 0) + 1); return days.map(d => m.get(d) || 0); });
    const r = (a, b) => { const ma = U.avg(a), mb = U.avg(b); let s = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return sa && sb ? s / Math.sqrt(sa * sb) : 0; };
    const out = []; for (let i = 0; i < th.length; i++) for (let j = i + 1; j < th.length; j++) { const c = r(ser[i], ser[j]); if (c >= 0.5) out.push({ a: th[i], b: th[j], r: c }); }
    return out.sort((x, y) => y.r - x.r).slice(0, 20);
  },
};
