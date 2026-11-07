/* MAHAM Lab — Opportunity Finder: groups similar text from every source into themes, measures them (how often, staff
 * hours, spread, trend), compares them with past quick wins / projects, labels and ranks them. Quick win ideas are the
 * themes labelled "Quick win". Feedback (not useful, merge, split) is remembered in this browser. */
'use strict';

const LabCache = { m: new Map(), get(k, f) { if (!this.m.has(k)) this.m.set(k, f()); return this.m.get(k); }, clear() { this.m.clear(); } };

const LabFinder = {
  PROBLEM_SRC: ['helpdesk', 'shadow', 'todo', 'gcatch', 'oncall', 'central', 'mytask'],
  PROBLEM_RE: /\b(error|errors|fail\w*|not|cannot|unable|issue\w*|problem\w*|stuck|slow\w*|freez\w*|hang\w*|missing|wrong|manual\w*|reprint\w*|workaround|fix\w*|broken|down|overlap\w*|duplicat\w*|crash\w*|delay\w*)\b|n't|خطأ|مشكل|لا يعمل|عطل/i,
  LABELS: { quickwin: ['⚡ Quick win', 'good'], routine: ['🔁 Recurring team work', ''], project: ['◈ Project', 'cat'], training: ['🎓 Training needed', 'warn'], central: ['↗ EHR fix (Central)', ''], addressed: ['✓ Resolved / quiet', ''] },
  TRAIN_RE: /\b(how|how to|training|train|trained|guide|where is|where can|explain|show me|teach)\b|كيف|تدريب|شرح/i,
  feedback: { notUseful: {}, useful: {}, merges: [], splits: [] },
  async loadFeedback() { LabFinder.feedback = Object.assign({ notUseful: {}, useful: {}, merges: [], splits: [] }, await Lab.read('feedback.json', {})); },
  async saveFeedback() { await Lab.write('feedback.json', LabFinder.feedback); LabCache.clear(); },
  _res: null,
  months(from, to) { const out = []; let d = new Date(+from.slice(0, 4), +from.slice(5, 7) - 1, 1); while (U.ds(d).slice(0, 7) <= to.slice(0, 7)) { out.push(U.ds(d).slice(0, 7)); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); } return out; },
  sigOf(terms) { return terms.slice(0, 3).slice().sort().join('|'); },
  /* the whole run — cached until data, settings or feedback change */
  async run(onProgress) {
    if (LabFinder._res) return LabFinder._res;
    const S = Lab.settings, { from, to, prevFrom } = LabData.range(); const all = LabData.items();
    const probs = all.filter(x => LabFinder.PROBLEM_SRC.includes(x.src));
    const qws = all.filter(x => x.src === 'quickwin');
    // identical cleaned texts are one "document" (help desk subjects repeat a lot)
    const uniq = new Map();
    for (const x of probs) { const t = LabText.terms(x.text); if (!t.length) continue; const k = [...new Set(t.filter(w => !w.includes('_')))].sort().join(' '); let u = uniq.get(k); if (!u) uniq.set(k, u = { terms: t, items: [] }); u.items.push(x); }
    const docs = [...uniq.values()];
    const idf = LabText.idf(docs.map(d => d.terms)); LabFinder._idf = idf;
    const vecs = docs.map(d => LabText.vec(d.terms, idf));
    if (onProgress) onProgress(0.05, 'Grouping similar text…');
    const groups = await LabText.group(vecs, S.simThreshold, p => onProgress && onProgress(0.05 + p * 0.75, 'Grouping similar text…'));
    // quick wins and projects for "has something like this been fixed before?"
    const qwv = qws.map(q => ({ q, v: LabText.vec(LabText.terms(q.text), idf) }));
    const projs = Store.all('project', '*').map(p => ({ p, v: LabText.vec(LabText.terms([p.name, p.description, p.goal].filter(Boolean).join(' ')), idf) }));
    const ms = LabFinder.months(from, to);
    let themes = groups.map(g => {
      const items = g.flatMap(i => docs[i].items); const cv = new Map();
      for (const i of g) for (const [t, w] of vecs[i]) cv.set(t, (cv.get(t) || 0) + w * docs[i].items.length);
      return { items, cv };
    });
    // feedback: splits, then merges
    const fb = LabFinder.feedback; const named = th => LabText.top(th.cv, 6);
    for (const sp of fb.splits || []) for (const th of themes.slice()) {
      if (LabFinder.sigOf(named(th)) !== sp.sig) continue;
      const yes = th.items.filter(x => LabText.words(x.text).includes(sp.word)); if (!yes.length || yes.length === th.items.length) continue;
      const mk = list => { const cv = new Map(); for (const x of list) for (const [t, w] of LabText.vec(LabText.terms(x.text), idf)) cv.set(t, (cv.get(t) || 0) + w); return { items: list, cv }; };
      themes.splice(themes.indexOf(th), 1, mk(yes), mk(th.items.filter(x => !yes.includes(x))));
    }
    // second pass: themes that are really the same thing ("labels not printing" / "labels not coming out") become one
    themes = LabFinder.mergeSimilar(themes, from);
    for (const [a, b] of fb.merges || []) {
      const A = themes.find(t => LabFinder.sigOf(named(t)) === a), B = themes.find(t => LabFinder.sigOf(named(t)) === b);
      if (A && B && A !== B) { A.items.push(...B.items); for (const [t, w] of B.cv) A.cv.set(t, (A.cv.get(t) || 0) + w); themes.splice(themes.indexOf(B), 1); }
    }
    if (onProgress) onProgress(0.85, 'Measuring themes…');
    const out = [];
    for (const th of themes) {
      const cur = th.items.filter(x => x.date >= from && x.date <= to); const prev = th.items.filter(x => x.date >= prevFrom && x.date < from);
      if (cur.length < S.minTheme) continue;
      const top = named(th); const sig = LabFinder.sigOf(top);
      const bySrc = {}; for (const x of cur) bySrc[x.src] = (bySrc[x.src] || 0) + 1;
      const hours = cur.reduce((a, x) => a + (x.cost || 0), 0);
      const depts = new Set(cur.map(x => x.dept).filter(Boolean)); const people = new Set(cur.map(x => x.person).filter(Boolean));
      const series = ms.map(m => cur.filter(x => x.date.startsWith(m)).length);
      const half = Math.floor(ms.length / 2); const early = U.sum(series.slice(0, half)) || 0, late = U.sum(series.slice(half)) || 0;
      const rising = prev.length ? cur.length / prev.length : (early ? late / early : late ? 2 : 1);
      const openCatches = cur.filter(x => x.src === 'gcatch' && x.open).length; const stuck = cur.filter(x => x.src === 'central' && x.stuck).length;
      const training = cur.filter(x => LabFinder.TRAIN_RE.test(x.text)).length / cur.length;
      // centroid vs past quick wins / projects
      const cn = Math.sqrt([...th.cv.values()].reduce((a, w) => a + w * w, 0)) || 1; const cvn = new Map([...th.cv].map(([t, w]) => [t, w / cn]));
      let qw = null; for (const x of qwv) { const s = LabText.cos(cvn, x.v); if (s > 0.3 && (!qw || s > qw.sim)) qw = { r: x.q.raw, sim: s }; }
      let pj = null; for (const x of projs) { const s = LabText.cos(cvn, x.v); if (s > 0.3 && (!pj || s > pj.sim)) pj = { r: x.p, sim: s }; }
      if (qw) { const r = qw.r; qw.days = r.date && r.expected ? Math.max(0, U.diffDays(r.date, r.expected)) : null; qw.done = U.lc(r.status) === 'completed'; }
      // was it already fixed? a completed similar quick win, and the theme fell afterwards
      let addressed = false;
      if (qw && qw.done && qw.sim > 0.4 && (qw.r.expected || qw.r.date)) {   // rate a month before vs after the fix
        const d = qw.r.expected || qw.r.date; const b = th.items.filter(x => x.date < d && x.date >= U.addDays(d, -180)), a = th.items.filter(x => x.date >= d);
        const mb = Math.max(1, Math.min(6, U.diffDays(b.reduce((m, x) => x.date < m ? x.date : m, d), d) / 30.4)), ma = Math.max(0.5, U.diffDays(d, to) / 30.4);
        if (b.length >= 3 && a.length / ma <= (b.length / mb) * 0.5) addressed = true;
      }
      // made only of the team's own work (shadow work, To Dos, personal tasks) and no sign of a problem = normal recurring work
      const problemSrc = ['helpdesk', 'gcatch', 'oncall', 'central'].some(s => bySrc[s]); const problemShare = cur.filter(x => LabFinder.PROBLEM_RE.test(x.text)).length / cur.length;
      // resolved or quiet: nothing in the last 60 days, or it fell sharply in the last two months
      const last = cur.reduce((a, x) => x.date > a ? x.date : a, ''); const recent2 = cur.filter(x => x.date >= U.addDays(to, -60)).length, before2 = cur.filter(x => x.date < U.addDays(to, -60) && x.date >= U.addDays(to, -120)).length;
      const quiet = last < U.addDays(to, -60) || (before2 >= 6 && recent2 <= before2 * 0.3);
      let label = 'quickwin';
      if (addressed || quiet) label = 'addressed';
      else if (!problemSrc && problemShare < 0.3) label = 'routine';
      else if ((bySrc.central || 0) / cur.length >= 0.3 || stuck) label = 'central';
      else if (training >= 0.4) label = 'training';
      else if ((pj && pj.sim > 0.35 && !(qw && qw.sim > pj.sim)) || (cur.length >= 60 && depts.size >= 5 && !qw)) label = 'project';
      const srcN = Object.keys(bySrc).length;
      let score = (hours + 0.25 * cur.length) * (1 + Math.log2(cur.length)) * (1 + 0.25 * (srcN - 1)) * (1 + 0.1 * Math.min(depts.size, 5)) * (rising >= 1.25 ? 1.3 : rising <= 0.7 ? 0.8 : 1) * (openCatches ? 1.15 : 1);
      score /= { project: 2, central: 1.5, training: 1.2, addressed: 2.5, routine: 3, quickwin: 1 }[label];
      if (fb.useful[sig]) score *= 1.5;
      const perMonth = hours / Math.max(1, ms.length);
      // how sure we are: enough records, more than one source, records that really are alike, still happening
      const cohesion = LabFinder.cohesion(th, idf); const recentN = cur.filter(x => x.date >= U.addDays(to, -45)).length;
      const conf = Math.min(1, Math.log(cur.length) / Math.log(60)) * 0.4 + Math.min(1, (srcN - 1) / 2) * 0.2 + cohesion * 0.3 + (recentN ? 0.1 : 0);
      // how big the fix is: a similar quick win's real days, else a guess from how spread it is
      const effort = qw && qw.days != null && qw.sim > 0.35 ? Math.max(1, qw.days) : label === 'project' ? 20 : depts.size <= 1 ? 2 : depts.size <= 3 ? 4 : 7;
      const decide = (perMonth * S.fixShare + 0.5) * (0.4 + conf) / Math.sqrt(effort) * (rising >= 1.25 ? 1.2 : 1) * (fb.useful[sig] ? 1.5 : 1);
      const nm = LabFinder.niceName(top);
      // shown as the most common wording people actually used (the key words underneath)
      const cnt = new Map(); for (const x of cur) { const k = String(x.text || '').split(' · ')[0].trim(); cnt.set(k, (cnt.get(k) || 0) + (['helpdesk', 'gcatch', 'oncall', 'central'].includes(x.src) ? 1 : 0.3)); }   // the users' own wording first
      const common = [...cnt].sort((a, b) => b[1] - a[1])[0][0]; const title = (common.length > 70 ? common.slice(0, 68) + '…' : common).replace(/^./, ch => ch.toUpperCase());
      out.push({ sig, name: title, keys: nm, top, items: cur, prevN: prev.length, bySrc, hours, perMonth, saving: perMonth * S.fixShare, depts: [...depts], people: [...people], series, months: ms, rising, openCatches, stuck, training, qw, pj, label, score, useful: !!fb.useful[sig], hidden: !!fb.notUseful[sig], conf, confLevel: conf >= 0.78 ? 'high' : conf >= 0.58 ? 'medium' : 'low', cohesion, effort, effortTxt: qw && qw.days != null && qw.sim > 0.35 ? `about ${Math.max(1, qw.days)} day${qw.days > 1 ? 's' : ''} (like ${qw.r.qwId || 'a past quick win'})` : effort <= 2 ? '1–2 days (guess)' : effort <= 4 ? '3–5 days (guess)' : effort <= 7 ? 'about a week (guess)' : 'weeks — a project', decide, last, recentN });
    }
    out.sort((a, b) => b.score - a.score);
    if (onProgress) onProgress(1, 'Done');
    return (LabFinder._res = { themes: out, docs: docs.length, items: probs.length, from, to, idf });
  },
  clear() { LabFinder._res = null; },
  /* how alike the records in a theme really are (0–1) */
  cohesion(th, idf) {
    const cn = Math.sqrt([...th.cv.values()].reduce((a, w) => a + w * w, 0)) || 1; const c = new Map([...th.cv].map(([t, w]) => [t, w / cn]));
    const sample = th.items.length > 60 ? LabText.shuffle(th.items).slice(0, 60) : th.items;
    return U.avg(sample.map(x => LabText.cos(c, LabText.vec(LabText.terms(x.text), idf)))) || 0;
  },
  /* join themes that are the same thing: very alike overall, or sharing 2 of their top 3 key words and fairly alike */
  mergeSimilar(themes, from) {
    const norm = th => { const n = Math.sqrt([...th.cv.values()].reduce((a, w) => a + w * w, 0)) || 1; return new Map([...th.cv].map(([t, w]) => [t, w / n])); };
    const keyw = th => LabText.top(new Map([...th.cv].filter(([t]) => !t.includes('_'))), 5);
    // where a theme mostly comes from (help desk group / module and department, when 60%+ share one)
    const home = th => { const l = th.items.filter(x => x.src === 'helpdesk' || x.src === 'gcatch'); const top = f => { const c = {}; for (const x of l) { const v = f(x); if (v) c[v] = (c[v] || 0) + 1; } const e = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return e && e[1] >= l.length * 0.6 ? e[0] : ''; }; return [top(x => x.module), top(x => x.dept)]; };
    const list = themes.map(t => ({ t, n: t.items.filter(x => x.date >= from).length })).sort((a, b) => b.n - a.n);
    const kept = [];
    for (const x of list) {
      const v = norm(x.t), k = keyw(x.t), hm = home(x.t); let into = null;
      if (x.n) for (const y of kept) {
        const s = LabText.cos(v, y.v); const shared = k.filter(w => y.k.includes(w)).length;
        const sameHome = hm[0] && hm[0] === y.hm[0] && (!hm[1] || !y.hm[1] || hm[1] === y.hm[1]);   // same group and same department: one shared key word is enough
        if (s >= 0.5 || (shared >= 2 && s >= 0.18) || (sameHome && ((shared >= 2 && s >= 0.05) || (k.slice(0, 3).includes(y.k[0]) && s >= 0.08) || (k.slice(0, 3).some(w => y.k.includes(w)) && s >= 0.12)))) { into = y; break; }
      }
      if (into) { into.t.items.push(...x.t.items); for (const [t, w] of x.t.cv) into.t.cv.set(t, (into.t.cv.get(t) || 0) + w); into.v = norm(into.t); }
      else kept.push({ t: x.t, v, k, hm });
    }
    return kept.map(y => y.t);
  },
  /* the lists the Lab is for */
  topQuickWins(res, n = 10) { return res.themes.filter(t => t.label === 'quickwin' && !t.hidden && t.recentN > 0).sort((a, b) => b.decide - a.decide).slice(0, n); },
  topOther(res, n = 10) { return res.themes.filter(t => ['project', 'training', 'central'].includes(t.label) && !t.hidden && t.recentN > 0).sort((a, b) => b.decide * (b.label === 'project' ? 3 : 1) - a.decide * (a.label === 'project' ? 3 : 1)).slice(0, n); },
  niceName(top) {
    const bi = top.find(t => t.includes('_')); const words = [];
    if (bi) words.push(...bi.split('_'));
    for (const t of top) if (!t.includes('_') && !words.includes(t)) words.push(t);
    return words.slice(0, 4).join(' · ');
  },
  /* the module a quick win would be filed under (most common one, if it is a MAHAM module) */
  moduleOf(th) {
    const mods = (Store.list('modules') || []).map(String); const cnt = {};
    for (const x of th.items) { const m = mods.find(mm => U.lc(mm) === U.lc(x.module || '') || U.lc(x.module || '').includes(U.lc(mm))); if (m) cnt[m] = (cnt[m] || 0) + 1; }
    return Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || '';
  },
  evidence(th) { return Object.entries(th.bySrc).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${n} ${LabData.label(s).toLowerCase()}`).join(' + '); },
  samples(th, n = 5) { const c = new Map(); for (const x of th.items) { const k = String(x.text).trim(); c.set(k, (c.get(k) || 0) + 1); } return [...c].sort((a, b) => b[1] - a[1]).slice(0, n); },
  /* a ready-to-copy quick win draft */
  draft(th) {
    const mod = LabFinder.moduleOf(th); const top = LabFinder.samples(th, 1)[0];
    const subject = 'Fix: ' + (top ? top[0].slice(0, 90) : th.name);
    const impact = `Removes about ${U.num(th.saving, 1)} staff hours a month. Evidence (last ${Lab.settings.months} months): ${LabFinder.evidence(th)}${th.depts.length ? ' · departments: ' + th.depts.slice(0, 5).join(', ') : ''}${th.rising >= 1.25 ? ' · rising' : ''}.${th.qw ? ` Similar fix done before: ${th.qw.r.qwId || ''} "${th.qw.r.subject}"${th.qw.days != null ? ` (${th.qw.days} days)` : ''}.` : ''}`;
    return { subject, module: mod, type: 'Modification', impact };
  },
  draftText(th) { const d = LabFinder.draft(th); return `Subject: ${d.subject}\nModule: ${d.module || '(choose)'}\nType: ${d.type}\nImpact: ${d.impact}`; },
  /* ---------- snapshots ---------- */
  async snapshots() { return await Lab.read('snapshots.json', {}); },
  async saveSnapshot(themes) {
    const s = await LabFinder.snapshots(); const k = U.todayStr().slice(0, 7);
    s[k] = { at: Date.now(), period: Lab.settings.months, themes: themes.slice(0, 80).map(t => ({ sig: t.sig, name: t.name, n: t.items.length, hours: Math.round(t.hours * 10) / 10, label: t.label, score: Math.round(t.score) })) };
    await Lab.write('snapshots.json', s); return k;
  },
  /* ---------- did the fix work? counts per month before and after a date ---------- */
  fixCheck(th, date) {
    const words = new Set(th.top.filter(t => !t.includes('_')).slice(0, 3)); const idf = LabFinder._idf; const cv = LabText.vec(th.top, idf);
    const pool = LabData.items().filter(x => LabFinder.PROBLEM_SRC.includes(x.src));
    const hits = pool.filter(x => { const t = LabText.terms(x.text); if (!t.some(w => words.has(w))) return false; return LabText.cos(LabText.vec(t, idf), cv) >= Lab.settings.simThreshold * 0.8; });
    const before = hits.filter(x => x.date < date && x.date >= U.addDays(date, -180)), after = hits.filter(x => x.date >= date);
    const earliest = pool.reduce((a, x) => x.date < a ? x.date : a, U.todayStr()); const startB = earliest > U.addDays(date, -180) ? earliest : U.addDays(date, -180);
    const mb = Math.max(1, U.diffDays(startB, date) / 30.4);
    const ma = Math.max(0.5, U.diffDays(date, U.todayStr()) / 30.4);
    const pb = before.length / mb, pa = after.length / ma;
    const ms = LabFinder.months(U.addDays(date, -180), U.todayStr());
    return { hits, before: before.length, after: after.length, perBefore: pb, perAfter: pa, change: pb ? (pa - pb) / pb : null, series: ms.map(m => hits.filter(x => x.date.startsWith(m)).length), months: ms, fixMonth: date.slice(0, 7) };
  },
  /* ---------- duplicates among open records ---------- */
  duplicates() {
    const idf = LabFinder._idf || LabText.idf(LabData.items().map(x => LabText.terms(x.text)));
    const open = LabData.items().filter(x => x.open && ['helpdesk', 'todo', 'gcatch', 'mytask', 'central', 'quickwin'].includes(x.src));
    const v = open.map(x => LabText.vec(LabText.terms(x.text), idf)); const pairs = [];
    for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) { if (open[i].id === open[j].id) continue; const s = LabText.cos(v[i], v[j]); if (s >= 0.8) pairs.push({ a: open[i], b: open[j], sim: s }); if (pairs.length > 400) break; }
    return pairs.sort((a, b) => b.sim - a.sim);
  },
};
