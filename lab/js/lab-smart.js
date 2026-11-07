/* MAHAM Lab — the smarter parts: learns from your decisions, learned synonyms and typo matching, "same problem?"
 * suggestions, when a problem started, early warnings, forecasts (next month, season, workload vs leave, backlog,
 * quick win pace, score), value of finished fixes, follow-up of plan items, accuracy history, plain-language text. */
'use strict';

const LabSmart = {
  /* ---------- typo matching: a rare word one letter away from a common word is that word ---------- */
  buildTypos() {
    LabText._typo = null; const f = new Map();
    for (const x of LabData.items()) for (const w of LabText.words(x.text)) f.set(w, (f.get(w) || 0) + 1);
    const common = [...f].filter(([w, n]) => n >= 10 && w.length >= 4 && !/[؀-ۿ]/.test(w)).map(x => x[0]); const map = new Map();
    for (const [w, n] of f) { if (n > 2 || w.length < 5 || /[؀-ۿ]/.test(w)) continue; const hit = common.find(c => Math.abs(c.length - w.length) <= 1 && c[0] === w[0] && LabSmart.dist1(w, c)); if (hit && hit !== w) map.set(w, hit); }
    LabText._typo = map; LabSmart.freq = f; return map;
  },
  /* one insert / delete / change / swap apart */
  dist1(a, b) {
    if (a === b) return false; if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (a.length === b.length) { if (a.slice(i + 1) === b.slice(i + 1)) return true; return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); }
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  },
  /* ---------- learned synonyms: words used in the same company but rarely together ---------- */
  synonymIdeas() {
    return LabCache.get('syn-ideas', () => {
      const docs = LabData.items().filter(x => LabFinder.PROBLEM_SRC.includes(x.src)).map(x => [...new Set(LabText.words(x.text))]);
      const f = new Map(); for (const d of docs) for (const w of d) f.set(w, (f.get(w) || 0) + 1);
      const vocab = [...f].filter(([, n]) => n >= 6).map(x => x[0]).slice(0, 600); const vs = new Set(vocab);
      const ctx = new Map(vocab.map(w => [w, new Map()])); const together = new Map();
      for (const d of docs) { const ws = d.filter(w => vs.has(w)); for (const a of ws) { const c = ctx.get(a); for (const b of d) if (b !== a) c.set(b, (c.get(b) || 0) + 1); } for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) { const k = [ws[i], ws[j]].sort().join('|'); together.set(k, (together.get(k) || 0) + 1); } }
      const norm = m => { const n = Math.sqrt([...m.values()].reduce((s, v) => s + v * v, 0)) || 1; return new Map([...m].map(([k, v]) => [k, v / n])); };
      const nv = new Map(vocab.map(w => [w, norm(ctx.get(w))])); const out = []; const known = LabText.synonyms();
      for (let i = 0; i < vocab.length; i++) for (let j = i + 1; j < vocab.length; j++) {
        const a = vocab[i], b = vocab[j]; if (known.get(a) === b || known.get(b) === a) continue;
        const both = together.get([a, b].sort().join('|')) || 0; if (both > Math.min(f.get(a), f.get(b)) * 0.1) continue;   // substitutes, not neighbours
        const s = LabText.cos(nv.get(a), nv.get(b)); if (s >= 0.55) out.push({ a, b, s, na: f.get(a), nb: f.get(b) });
      }
      for (const [w, c] of LabText._typo || []) out.push({ a: w, b: c, s: 1, typo: true, na: (LabSmart.freq || new Map()).get(w) || 1, nb: (LabSmart.freq || new Map()).get(c) || 0 });
      return out.sort((x, y) => y.s - x.s).slice(0, 40);
    });
  },
  async addSynonym(a, b) { const line = `${a} = ${b}`; await Lab.saveSettings({ synonyms: (Lab.settings.synonyms || '').trim() + '\n' + line }); LabUI.invalidate(); },

  /* ---------- learns your judgement: what you plan vs what you mark "not useful" ---------- */
  feats(t) { return [Math.log1p(t.perMonth), Math.log1p(t.items.length), Object.keys(t.bySrc).length, Math.min(t.depts.length, 6) / 6, t.rising >= 1.25 ? 1 : 0, t.conf, Math.log1p(t.effort), t.qw ? 1 : 0, t.bySrc.shadow ? 1 : 0, t.openCatches ? 1 : 0]; },
  FEAT_NAMES: ['saves more hours', 'happens more often', 'seen in more sources', 'spread over many departments', 'rising', 'high confidence', 'bigger fix', 'similar fix done before', 'includes shadow work', 'has open good catches'],
  learn(themes) {
    const plan = (LabPlan.data) || {}; const fb = LabFinder.feedback; const X = [], Y = [];
    for (const t of themes) { const y = plan[t.sig] ? 1 : fb.notUseful[t.sig] ? 0 : null; if (y == null) continue; X.push(LabSmart.feats(t)); Y.push(y); }
    const pos = Y.filter(v => v).length, neg = Y.length - pos; LabSmart.taste = null;
    if (Y.length < 6 || !pos || !neg) return { ok: false, n: Y.length, pos, neg };
    const d = X[0].length; const mu = Array.from({ length: d }, (_, j) => U.avg(X.map(v => v[j]))), sd = Array.from({ length: d }, (_, j) => Math.sqrt(U.avg(X.map(v => (v[j] - mu[j]) ** 2))) || 1);
    const w = LabText.lrTrain(X.map(v => v.map((x, j) => (x - mu[j]) / sd[j])), Y, { epochs: 400, l2: 0.05 });
    LabSmart.taste = { w, mu, sd, n: Y.length, pos, neg, likes: LabSmart.FEAT_NAMES.map((nm, j) => [nm, w[j]]).filter(x => Math.abs(x[1]) > 0.15).sort((a, b) => b[1] - a[1]) };
    return Object.assign({ ok: true }, LabSmart.taste);
  },
  likeP(t) { const T = LabSmart.taste; if (!T) return null; const z = LabSmart.feats(t).map((x, j) => (x - T.mu[j]) / T.sd[j]); return LabText.sig(LabText.dot(T.w, z)); },
  /* the final order: the Lab's own ranking, nudged by what you tend to pick */
  rank(list) { for (const t of list) { const p = LabSmart.likeP(t); t.like = p; t.final = t.decide * (p == null ? 1 : 0.6 + 0.8 * p); } return list.sort((a, b) => b.final - a.final); },

  /* ---------- "same problem?" — two top themes that look alike ---------- */
  sameIdeas(themes) {
    const top = themes.filter(t => !t.hidden && t.label !== 'routine').slice(0, 60); const out = [];
    const kw = t => t.top.filter(x => !x.includes('_')).slice(0, 4); const asked = new Set((LabFinder.feedback.notSame || []).map(p => p.join('|')));
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
      const a = top[i], b = top[j]; if (asked.has(a.sig + '|' + b.sig)) continue; const sh = kw(a).filter(w => kw(b).includes(w));
      const sameDept = a.depts[0] && a.depts[0] === b.depts[0]; if (sh.length >= 2 || (sh.length >= 1 && sameDept)) out.push({ a, b, why: sh.length >= 2 ? `both about “${sh.join(', ')}”` : `both “${sh[0]}” in ${a.depts[0]}` });
    }
    return out.slice(0, 8);
  },

  /* ---------- weekly series and "when did it start?" ---------- */
  weeks(n = 26) { const end = LabHD.weekStart(U.todayStr()); return Array.from({ length: n }, (_, i) => U.addDays(end, -7 * (n - 1 - i))); },
  weekly(items, n = 26) { const ws = LabSmart.weeks(n); const m = new Map(ws.map(w => [w, 0])); for (const x of items) { const k = LabHD.weekStart(x.date); if (m.has(k)) m.set(k, m.get(k) + 1); } return { ws, v: ws.map(w => m.get(w)) }; },
  started(t) {
    const { ws, v } = LabSmart.weekly(t.items); let best = null;
    for (let k = 4; k <= v.length - 3; k++) { const b = U.avg(v.slice(0, k)), a = U.avg(v.slice(k)); if (a >= 1 && a >= Math.max(1.6 * b, b + 1) && (!best || a - b > best.d)) best = { k, d: a - b, b, a }; }
    if (!best) return null; const week = ws[best.k];
    return { week, before: best.b, after: best.a, events: LabSmart.eventsNear(week, 10, t) };
  },
  /* what happened around a date that is about the same thing: project milestones / phases, announcements, finished quick wins */
  eventsNear(d, days, t) {
    const lo = U.addDays(d, -days), hi = U.addDays(d, days); const out = [];
    const keys = t ? t.top.filter(x => !x.includes('_')).slice(0, 4) : []; const dw = t && t.depts[0] ? LabText.words(t.depts[0]) : []; const about = s => { if (!t) return true; const w = LabText.words(s); return w.some(x => keys.includes(x)) || (dw.length && dw.every(x => w.includes(x))); };
    for (const p of Store.all('pphase', '*')) { const e = p.end || p.start; if (e && e >= lo && e <= hi) out.push(`${p.kind === 'milestone' ? '◆' : '▬'} ${p.name}${Store.get(p.project) ? ' (' + Store.get(p.project).name + ')' : ''}`); }
    for (const a of Store.all('announcement', '*')) { const e = String(a.posted || '').slice(0, 10); if (e && e >= lo && e <= hi) out.push('📢 ' + a.title); }
    for (const q of Store.all('quickwin', '*')) { const e = q.expected || ''; if (U.lc(q.status) === 'completed' && e >= lo && e <= hi) out.push('⚡ ' + q.subject); }
    return out.filter(about).slice(0, 3);
  },

  /* ---------- early warnings ---------- */
  watch(res) {
    return LabCache.get('watch', () => {
      const to = U.todayStr(); const out = [];
      for (const t of res.themes) {
        if (t.hidden || t.label === 'routine') continue;
        const last14 = t.items.filter(x => x.date >= U.addDays(to, -14)).length, prior = t.items.filter(x => x.date < U.addDays(to, -14) && x.date >= U.addDays(to, -104)).length;
        if (last14 >= 4 && prior <= 1) out.push({ kind: 'new', w: 3 + last14 / 4, t, text: `New problem: “${t.name}” — ${last14} times in the last 2 weeks, almost never before.` });
        // coming back: a close match to a finished quick win, it really dropped after the fix, and now it is back up
        if (t.qw && t.qw.done && t.qw.sim >= 0.45) { const d = t.qw.r.expected || t.qw.r.date; if (d < U.addDays(to, -60)) { const r = LabFinder.fixCheck(t, d); const after = r.hits.filter(x => x.date >= d && x.date < U.addDays(to, -30)).length / Math.max(1, U.diffDays(d, U.addDays(to, -30)) / 30.4), r30 = r.hits.filter(x => x.date >= U.addDays(to, -30)).length;
          if (r.perBefore >= 3 && after <= r.perBefore * 0.5 && r30 >= Math.max(3, r.perBefore * 0.6)) out.push({ kind: 'back', w: 3, t, text: `Coming back: “${t.name}” dropped after ${t.qw.r.qwId || 'a quick win'} (${U.fmtDate(d)}) but is back to ${r30} in the last 30 days (about ${Math.round(r.perBefore)} a month before the fix).` }); } }
        if (t.rising >= 1.4 && t.items.length >= 10) { const s = LabSmart.started(t); if (s && s.week >= U.addDays(to, -120)) out.push({ kind: 'rise', w: 2 + t.rising, t, text: `Rising since the week of ${U.fmtDate(s.week)}: “${t.name}” (about ${U.num(s.before, 1)} → ${U.num(s.after, 1)} a week)${s.events.length ? ' — that week: ' + s.events.join('; ') : ''}.` }); }
      }
      for (const s of LabSmart.slowing()) out.push({ kind: 'slow', w: 2 + s.ratio, text: `Slowing down: ${s.g} now takes ${LabSmart.fh(s.now)} to close (was ${LabSmart.fh(s.was)}).` });
      for (const q of LabSmart.quietDepts()) out.push({ kind: 'quiet', w: 2.2, text: `Quiet: ${q.d} raised only ${q.last7} request${q.last7 === 1 ? '' : 's'} in the last 7 days (usually about ${Math.round(q.avg)} a week) — an outage or a workaround?` });
      for (const s of LabHD.spikes().filter(s => s.day >= U.addDays(to, -14)).slice(0, 3)) out.push({ kind: 'spike', w: 1.5 + s.ratio / 2, text: `Unusual day: ${s.key} had ${s.n} requests on ${U.fmtDate(s.day)} (usual ${s.usual}) — ${s.top.map(([x]) => x).join(', ')}.` });
      return out.sort((a, b) => b.w - a.w);
    });
  },
  ICON: { new: '🆕', back: '↩', rise: '▲', slow: '🐢', quiet: '🔇', spike: '⚡' },
  fh(v) { return v == null ? '–' : v < 48 ? U.num(v, 1) + ' h' : U.num(v / 24, 1) + ' days'; },
  slowing() {
    return LabCache.get('slow', () => { const to = U.todayStr(); const by = {}; for (const x of LabHD.rows()) if (x.closed && x.hrs != null) { const d = LabHD.day(x); const g = x.r.group || '(no group)'; const b = by[g] = by[g] || { now: [], was: [] }; if (d >= U.addDays(to, -30)) b.now.push(x.hrs); else if (d >= U.addDays(to, -120)) b.was.push(x.hrs); }
      const med = l => l.slice().sort((a, b) => a - b)[Math.floor(l.length / 2)];
      return Object.entries(by).filter(([, b]) => b.now.length >= 8 && b.was.length >= 8).map(([g, b]) => ({ g, now: med(b.now), was: med(b.was), ratio: med(b.now) / Math.max(0.1, med(b.was)) })).filter(s => s.ratio >= 1.5 && s.now - s.was >= 2).sort((a, b) => b.ratio - a.ratio); });
  },
  quietDepts() {
    return LabCache.get('quiet', () => { const to = U.todayStr(); const c = {}; for (const x of LabHD.rows()) { const dp = x.r.department; if (!dp) continue; const d = LabHD.day(x); const b = c[dp] = c[dp] || { last7: 0, prior: 0 }; if (d > U.addDays(to, -7)) b.last7++; else if (d > U.addDays(to, -63)) b.prior++; }
      return Object.entries(c).map(([d, b]) => ({ d, last7: b.last7, avg: b.prior / 8 })).filter(q => q.avg >= 5 && q.last7 <= q.avg * 0.2).sort((a, b) => b.avg - a.avg).slice(0, 3); });
  },

  /* ---------- forecasts ---------- */
  /* next month per group and per department (weekly trend, nudged by last year's same month when there is a year of data) */
  nextMonth() {
    return LabCache.get('nextmonth', () => {
      const rows = LabHD.rows(); const nm = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 1); })(); const key = U.ds(nm).slice(0, 7);
      const monthly = f => { const c = {}; for (const x of rows) { if (f && !f(x)) continue; const m = LabHD.day(x).slice(0, 7); c[m] = (c[m] || 0) + 1; } return c; };
      const season = f => { const c = monthly(f); const ly = (nm.getFullYear() - 1) + '-' + key.slice(5); const yr = Object.entries(c).filter(([m]) => m >= U.ds(new Date(nm.getFullYear() - 1, nm.getMonth() - 11, 1)).slice(0, 7) && m <= ly.slice(0, 7)); if (yr.length < 10 || !c[ly]) return 1; const avg = U.avg(yr.map(x => x[1])); return Math.pow(c[ly] / Math.max(1, avg), 0.5); };
      const one = (name, f) => { const s = LabHD.weekly(f, 26); const fc = LabHD.holt(s.vals, 5); if (!fc) return null; const k = season(f); const f4 = U.sum(fc.slice(0, 4).map(x => x.f)) * 30.4 / 28 * k; return { name, f: f4, lo: U.sum(fc.slice(0, 4).map(x => x.lo)) * 30.4 / 28 * k, hi: U.sum(fc.slice(0, 4).map(x => x.hi)) * 30.4 / 28 * k, season: k, last: U.sum(s.vals.slice(-4)) * 30.4 / 28 }; };
      const depts = (() => { const c = {}; for (const x of rows) if (x.r.department) c[x.r.department] = (c[x.r.department] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]); })();
      return { month: key, total: one('All requests', null), groups: LabHD.groups(6).map(g => one(g, x => (x.r.group || '(no group)') === g)).filter(Boolean), depts: depts.map(d => one(d, x => x.r.department === d)).filter(Boolean) };
    });
  },
  /* Ramadan / Peak season from the Islamic (Umm al-Qura) calendar, and how they changed requests last time */
  hijri(d) { try { const p = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric', day: 'numeric' }).formatToParts(U.pd(d)); return { m: +p.find(x => x.type === 'month').value, d: +p.find(x => x.type === 'day').value }; } catch (e) { return null; } },
  seasonal() {
    return LabCache.get('season', () => {
      const days = {}; for (const x of LabHD.rows()) { const d = LabHD.day(x); days[d] = (days[d] || 0) + 1; }
      const keys = Object.keys(days).sort(); if (!keys.length || !LabSmart.hijri(keys[0])) return [];
      const kind = d => { const h = LabSmart.hijri(d); if (!h) return ''; if (h.m === 9) return 'Ramadan'; if (h.m === 12 && h.d <= 15) return 'Peak season'; return ''; };
      const work = d => !U.isOff(d);
      const avg = {}; const cnt = {}; for (let d = keys[0]; d <= U.todayStr(); d = U.addDays(d, 1)) { if (!work(d)) continue; const k = kind(d) || 'normal'; avg[k] = (avg[k] || 0) + (days[d] || 0); cnt[k] = (cnt[k] || 0) + 1; }
      const out = [];
      for (const k of ['Ramadan', 'Peak season']) {
        let start = null; for (let d = U.addDays(U.todayStr(), 1), i = 0; i < 150; i++, d = U.addDays(d, 1)) if (kind(d) === k) { start = d; break; }
        if (!start) continue; const eff = cnt[k] >= 8 && cnt.normal ? (avg[k] / cnt[k]) / (avg.normal / cnt.normal) - 1 : null;
        out.push({ k, start, inDays: U.diffDays(U.todayStr(), start), eff });
      }
      // next month vs the yearly average (when there is last year's data)
      const nm = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 1); })(); const ly = U.ds(new Date(nm.getFullYear() - 1, nm.getMonth(), 1)).slice(0, 7);
      const mon = {}; for (const [d, n] of Object.entries(days)) mon[d.slice(0, 7)] = (mon[d.slice(0, 7)] || 0) + n; const yr = Object.keys(mon).filter(m => m > U.ds(new Date(nm.getFullYear() - 1, nm.getMonth() - 12, 1)).slice(0, 7) && m <= ly);
      if (yr.length >= 10 && mon[ly]) out.push({ k: 'month', month: U.MONTHS[nm.getMonth()], eff: mon[ly] / U.avg(yr.map(m => mon[m])) - 1 });
      return out;
    });
  },
  /* the next 8 weeks: expected requests vs people available after approved leave */
  workload() {
    return LabCache.get('wl', () => {
      const ppl = Store.members().filter(m => m.active !== false && m.scored && LabData.inTeam(m.team || 'apps')); const N = ppl.length || 1; const ids = new Set(ppl.map(m => m.id));
      const leave = Store.all('request', '*').filter(r => ids.has(r.requester) && Requests.isDone(r) && Requests.type(r.type).kind === 'days' && r.from);
      const s = LabHD.weekly(null, 26); const fc = LabHD.holt(s.vals, 8) || []; const normal = U.avg(s.vals.slice(-12)) / N;
      return fc.map((x, i) => { const ws = U.addDays(LabHD.weekStart(U.todayStr()), 7 * (i + 1)); let off = 0; for (const r of leave) { for (let d = ws; d < U.addDays(ws, 7); d = U.addDays(d, 1)) if (!U.isOff(d) && d >= r.from && d <= (r.to || r.from)) off++; } const avail = Math.max(0.5, N - off / 5); const per = x.f / avail; return { ws, req: x.f, avail, off: off / 5, per, over: normal ? per / normal - 1 : 0, who: leave.filter(r => r.from <= U.addDays(ws, 6) && (r.to || r.from) >= ws).map(r => Store.memberShort(r.requester)) }; });
    });
  },
  /* open help desk requests + open To Dos at the end of each week, and the next 4 */
  backlog() {
    return LabCache.get('backlog', () => {
      const ws = LabSmart.weeks(20); const hd = LabHD.rows(); const td = LabPeople.todos();
      const v = ws.map(w => { const e = U.addDays(w, 6); return hd.filter(x => LabHD.day(x) <= e && (!x.closed || (x.r.resolved && x.r.resolved.slice(0, 10) > e))).length + td.filter(x => x.r.assigned <= e && (!x.r.finish || x.r.finish > e)).length; });
      const fc = LabHD.holt(v, 4); return { ws, v, fc, now: v[v.length - 1], next: fc ? fc[3].f : null };
    });
  },
  /* quick wins finished this quarter and the pace */
  qwPace() {
    const y = new Date().getFullYear(); const q = Math.floor(new Date().getMonth() / 3); const qs = U.ds(new Date(y, q * 3, 1)), qe = U.ds(new Date(y, q * 3 + 3, 0));
    const done = Store.all('quickwin', '*').filter(r => U.lc(r.status) === 'completed' && LabData.inTeam(r.team || LabData.teamOfPerson(r.analyst)));
    const per = []; for (let i = 1; i <= 3; i++) { const d = new Date(y, new Date().getMonth() - i, 1); const m = U.ds(d).slice(0, 7); per.push(done.filter(r => (r.expected || r.date || '').startsWith(m)).length); }
    const pace = U.avg(per); const inQ = done.filter(r => (r.expected || r.date || '') >= qs && (r.expected || r.date || '') <= U.todayStr()).length; const left = U.diffDays(U.todayStr(), qe) / 30.4;
    const year = done.filter(r => (r.expected || r.date || '').startsWith(String(y))).length; const target = +Lab.settings.qwTarget || 24;
    return { q: q + 1, inQ, pace, forecastQ: Math.round(inQ + pace * Math.max(0, left)), targetQ: Math.round(target / 4), year, target, yearForecast: Math.round(year + pace * (11 - new Date().getMonth() + (1 - new Date().getDate() / 30))) };
  },
  /* team score: this month so far and the months before (MAHAM's own scoring) */
  score() {
    try {
      const y = new Date().getFullYear(), mo = new Date().getMonth() + 1; const team = Lab.settings.team || (Store.member(App.me) || {}).team || 'apps'; const keep = App.viewTeam; App.viewTeam = team; Calc.invalidate();
      const ppl = Store.scoredTeam(); const avg = m => { const v = ppl.map(p => Calc.score(y, p.id, m)).filter(x => x != null && !isNaN(x)); return v.length ? U.avg(v) : null; };
      const r = { team, now: avg(mo), months: [mo - 3, mo - 2, mo - 1].filter(m => m >= 1).map(m => ({ m, s: avg(m) })), target: Custom.target('teamScore', team) };
      App.viewTeam = keep; Calc.invalidate(); return r;
    } catch (e) { App.viewTeam = '*'; return null; }
  },

  /* ---------- value of finished quick wins: did requests drop after them? ---------- */
  value() {
    return LabCache.get('value', () => {
      const idf = LabFinder._idf; if (!idf) return { list: [], total: 0, year: 0 }; const y = String(new Date().getFullYear()); const to = U.todayStr();
      const pool = LabData.items().filter(x => LabFinder.PROBLEM_SRC.includes(x.src)); const pv = pool.map(x => LabText.vec(LabText.terms(x.text), idf));
      const out = [];
      for (const q of Store.all('quickwin', '*')) {
        if (U.lc(q.status) !== 'completed') continue; const d = q.expected || q.date; if (!d || d > U.addDays(to, -14) || d < U.addDays(to, -400)) continue;
        const v = LabText.vec(LabText.terms([q.subject, q.impact].filter(Boolean).join(' ')), idf); if (!v.size) continue;
        const hits = pool.filter((x, i) => LabText.cos(v, pv[i]) >= 0.3); const before = hits.filter(x => x.date < d && x.date >= U.addDays(d, -180)), after = hits.filter(x => x.date >= d);
        if (before.length < 3) continue; const mb = Math.max(1, Math.min(6, U.diffDays(before.reduce((m, x) => x.date < m ? x.date : m, d), d) / 30.4)), ma = Math.max(0.5, U.diffDays(d, to) / 30.4);
        const rb = before.length / mb, ra = after.length / ma; const cost = U.avg(hits.map(x => x.cost || 0)) || Lab.settings.hdHours;
        const saved = Math.max(0, rb - ra) * cost; out.push({ q, d, rb, ra, drop: rb ? (rb - ra) / rb : 0, perMonth: saved, sofar: saved * ma, months: ma });
      }
      out.sort((a, b) => b.sofar - a.sofar);
      return { list: out, total: U.sum(out.map(x => x.sofar)), year: U.sum(out.filter(x => x.d.startsWith(y)).map(x => x.perMonth * Math.min(x.months, U.diffDays(x.d, to) / 30.4))), perMonth: U.sum(out.map(x => x.perMonth)) };
    });
  },
  /* plan items marked Done 3+ weeks ago: did it work? */
  followUps() {
    const P = LabPlan.data || {}; const out = [];
    for (const [sig, p] of Object.entries(P)) { if (p.status !== 'Done' || !p.doneAt || !p.top) continue; const d = U.ds(new Date(p.doneAt)); if (U.diffDays(d, U.todayStr()) < 21) { out.push({ p, wait: 21 - U.diffDays(d, U.todayStr()) }); continue; } const r = LabFinder.fixCheck({ top: p.top }, d); out.push({ p, r }); }
    return out;
  },
  /* ---------- accuracy history (forecasts kept in this browser, checked when the month is over) ---------- */
  async logForecast() {
    const nm = LabSmart.nextMonth(); if (!nm.total) return; const log = await Lab.read('fclog.json', {});
    if (!log[nm.month]) { log[nm.month] = { at: Date.now(), total: Math.round(nm.total.f), lo: Math.round(nm.total.lo), hi: Math.round(nm.total.hi), groups: Object.fromEntries(nm.groups.map(g => [g.name, Math.round(g.f)])) }; await Lab.write('fclog.json', log); }
  },
  async accuracy() {
    const log = await Lab.read('fclog.json', {}); const cur = U.todayStr().slice(0, 7); const act = {}; for (const x of LabHD.rows()) { const m = LabHD.day(x).slice(0, 7); act[m] = (act[m] || 0) + 1; }
    const fc = Object.entries(log).filter(([m]) => m < cur).map(([m, l]) => ({ m, f: l.total, lo: l.lo, hi: l.hi, a: act[m] || 0, err: act[m] ? Math.abs(l.total - act[m]) / act[m] : null, inside: act[m] >= l.lo && act[m] <= l.hi })).sort((a, b) => b.m.localeCompare(a.m));
    // your decisions by confidence level (are "high" ideas really the ones you pick?)
    const res = LabFinder._res; const P = LabPlan.data || {}; const fb = LabFinder.feedback; const cal = {};
    if (res) for (const t of res.themes) { const y = P[t.sig] ? 1 : fb.notUseful[t.sig] ? 0 : null; if (y == null) continue; const c = cal[t.confLevel] = cal[t.confLevel] || { n: 0, yes: 0 }; c.n++; c.yes += y; }
    return { fc, cal, tag: await LabTagger.history() };
  },

  /* ---------- plain-language explanation of one idea ---------- */
  explain(t) {
    const parts = [];
    parts.push(`${t.items.length} times in the last ${Lab.settings.months} months (${LabFinder.evidence(t)})`);
    if (t.depts.length) parts.push(t.depts.length === 1 ? `all from ${t.depts[0]}` : `from ${t.depts.length} departments, mostly ${t.depts[0]}`);
    parts.push(t.rising >= 1.25 ? 'and rising' : t.rising <= 0.7 ? 'and falling' : 'and steady');
    let s = parts.join(', ') + `. It costs about ${LabUI.hrs(t.perMonth)} of staff time a month; fixing it could save about ${LabUI.hrs(t.saving)}.`;
    if (t.qw) s += ` A similar fix (${t.qw.r.qwId || 'quick win'} “${t.qw.r.subject}”)${t.qw.days != null ? ` took ${t.qw.days} day${t.qw.days === 1 ? '' : 's'}` : ' was done before'}.`;
    if (t.openCatches) s += ` ${t.openCatches} good catch${t.openCatches === 1 ? ' is' : 'es are'} still open about it.`;
    s += ' → ' + ({ quickwin: 'Suggest: a quick win.', project: 'Suggest: a project (bigger than a quick win).', training: 'Suggest: training for the users.', central: 'Suggest: follow up the EHR fix with Central.', addressed: 'It looks fixed already.', routine: 'This is normal team work.' })[t.label];
    return s;
  },
  /* ideas that could be fixed together (same place, same key word) */
  bundles(list) {
    const by = new Map(); for (const t of list) { const k = (t.depts[0] || '') + '|' + (t.top.find(x => !x.includes('_')) || ''); (by.get(k) || by.set(k, []).get(k)).push(t); }
    const kw = t => t.top.filter(x => !x.includes('_')).slice(0, 3); const out = [];
    for (let i = 0; i < list.length; i++) { const a = list[i]; const grp = list.filter(b => b !== a && (b.depts[0] || '-') === (a.depts[0] || '+') && kw(b).some(w => kw(a).includes(w))); if (grp.length && !out.some(o => o.items.includes(a))) out.push({ items: [a, ...grp], where: a.depts[0], word: kw(a).find(w => grp.every(b => kw(b).includes(w))) || kw(a)[0] }); }
    return out.filter(b => b.items.length >= 2).slice(0, 4);
  },
};
