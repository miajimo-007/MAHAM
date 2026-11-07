/* MAHAM Lab — People insights (only the super admin sees the Lab): late-risk for To Dos, best person for a problem,
 * workload vs lateness, skills from real work, fair assignment. Hints, not judgements. */
'use strict';

const LabPeople = {
  analysts() { return Store.members().filter(m => m.active !== false && !Store.topRole(m.role) && m.role !== 'manager' && LabData.inTeam(m.team || 'apps')); },
  todos() { return LabCache.get('pp-todos', () => Store.all('todo', '*').filter(r => r.status !== 'Canceled' && r.assigned && r.analyst && LabData.inTeam(r.team || LabData.teamOfPerson(r.analyst))).map(r => Object.assign({ r }, Calc.todoDerive(r))).sort((a, b) => a.r.assigned.localeCompare(b.r.assigned))); },
  /* how many To Dos the person already had open on a day */
  loadAt(list, who, day) { let n = 0; for (const x of list) { if (x.r.analyst !== who || x.r.assigned >= day) continue; if (!x.r.finish || x.r.finish >= day) n++; } return n; },
  FEATS: [['dur', 'long task'], ['high', 'high priority'], ['low', 'low priority'], ['load', 'many open To Dos'], ['hist', 'person was often late before'], ['thu', 'given on Thursday'], ['words', 'long description'], ['fu', 'follow-up'], ['dir', 'from the director'], ['instr', 'has an instruction']],
  feats(x, list, prior) {
    const r = x.r; const load = LabPeople.loadAt(list, r.analyst, r.assigned); const p = prior[r.analyst] || { n: 0, late: 0 }; const teamRate = prior._team || 0.3;
    return { v: [Math.log1p(+r.duration || 0), r.priority === 'High' ? 1 : 0, r.priority === 'Low' ? 1 : 0, Math.log1p(load), (p.late + 2 * teamRate) / (p.n + 2), U.pd(r.assigned).getDay() === 4 ? 1 : 0, Math.log1p(String(r.task || '').split(/\s+/).length), r.fu ? 1 : 0, r.fromTask ? 1 : 0, r.instruction ? 1 : 0], load };
  },
  /* train on the older 80% of finished To Dos, test on the newest 20% */
  risk() {
    return LabCache.get('pp-risk', () => {
      const list = LabPeople.todos(); const done = list.filter(x => x.r.finish && x.timing);
      if (done.length < 40) return { ok: false, n: done.length };
      const prior = { _team: done.filter(x => x.timing === 'Delayed').length / done.length }; const X = [], Y = [], meta = [];
      for (const x of done) { const f = LabPeople.feats(x, list, prior); X.push(f.v); Y.push(x.timing === 'Delayed' ? 1 : 0); meta.push(f.load); const p = prior[x.r.analyst] = prior[x.r.analyst] || { n: 0, late: 0 }; p.n++; if (x.timing === 'Delayed') p.late++; }
      const d = X[0].length; const mu = Array.from({ length: d }, (_, j) => U.avg(X.map(v => v[j]))); const sd = Array.from({ length: d }, (_, j) => Math.sqrt(U.avg(X.map(v => (v[j] - mu[j]) ** 2))) || 1);
      const Z = X.map(v => v.map((x, j) => (x - mu[j]) / sd[j]));
      const cut = Math.floor(Z.length * 0.8); const w0 = LabText.lrTrain(Z.slice(0, cut), Y.slice(0, cut));
      let tp = 0, fp = 0, fn = 0; for (let i = cut; i < Z.length; i++) { const hi = LabText.sig(LabText.dot(w0, Z[i])) >= 0.5; if (hi && Y[i]) tp++; else if (hi && !Y[i]) fp++; else if (!hi && Y[i]) fn++; }
      const w = LabText.lrTrain(Z, Y);
      // open To Dos now
      const open = list.filter(x => !x.r.finish).map(x => { const f = LabPeople.feats(x, list, prior); const z = f.v.map((v, j) => (v - mu[j]) / sd[j]); const p = LabText.sig(LabText.dot(w, z)); const why = z.map((v, j) => [LabPeople.FEATS[j][1], w[j] * v]).filter(c => c[1] > 0.15).sort((a, b) => b[1] - a[1]).slice(0, 3).map(c => c[0]); return { x, p, why, load: f.load }; }).sort((a, b) => b.p - a.p);
      return { ok: true, n: done.length, test: Z.length - cut, lateRate: prior._team, recall: tp + fn ? tp / (tp + fn) : null, precision: tp + fp ? tp / (tp + fp) : null, weights: LabPeople.FEATS.map((f, j) => [f[1], w[j]]).sort((a, b) => b[1] - a[1]), open, loads: meta, done };
    });
  },
  /* lateness by how many To Dos were already open */
  workload() {
    const R = LabPeople.risk(); if (!R.ok) return null; const B = [[0, 1, '0–1'], [2, 3, '2–3'], [4, 5, '4–5'], [6, 7, '6–7'], [8, 999, '8 or more']];
    const rows = B.map(([a, b, l]) => { const idx = R.loads.map((v, i) => [v, i]).filter(([v]) => v >= a && v <= b).map(x => x[1]); const late = idx.filter(i => R.done[i].timing === 'Delayed').length; return { l, n: idx.length, late: idx.length ? late / idx.length : null }; });
    const base = Math.min(...rows.filter(r => r.n >= 5 && r.late != null).map(r => r.late)); const tip = rows.find(r => r.n >= 5 && r.late != null && base >= 0 && r.late >= Math.max(base * 1.5, base + 0.1));
    return { rows, tip };
  },
  /* who solved similar things, how fast, and how busy they are now */
  bestPerson(text) {
    const idf = LabFinder._idf || LabText.idf(LabData.items().map(x => LabText.terms(x.text))); const q = LabText.vec(LabText.terms(text), idf); if (!q.size) return [];
    const by = {};
    const add = (id, sim, speed) => { if (!id) return; const b = by[id] = by[id] || { id, n: 0, sim: 0, speed: [] }; b.n++; b.sim += sim; if (speed != null) b.speed.push(speed); };
    for (const x of LabHD.rows()) if (x.closed && x.mid) { const s = LabText.cos(q, LabText.vec(LabText.terms(x.r.subject), idf)); if (s >= 0.3) add(x.mid, s, x.hrs != null ? x.hrs / 24 : null); }
    for (const x of LabPeople.todos()) if (x.r.finish) { const s = LabText.cos(q, LabText.vec(LabText.terms(x.r.task), idf)); if (s >= 0.3) add(x.r.analyst, s, U.diffDays(x.r.assigned, x.r.finish)); }
    for (const r of Store.all('gcatch', '*')) if (r.resolvedBy && r.status === 'Resolved') { const s = LabText.cos(q, LabText.vec(LabText.terms([r.title, r.details].join(' ')), idf)); if (s >= 0.3) add(r.resolvedBy, s, r.found && r.resolvedOn ? U.diffDays(r.found, r.resolvedOn) : null); }
    for (const r of Store.all('quickwin', '*')) { const s = LabText.cos(q, LabText.vec(LabText.terms([r.subject, r.impact].join(' ')), idf)); if (s >= 0.3) add(r.analyst, s, null); }
    const load = id => LabPeople.todos().filter(x => x.r.analyst === id && !x.r.finish).length + LabHD.rows().filter(x => x.mid === id && !x.closed).length;
    return Object.values(by).filter(b => Store.member(b.id) && Store.member(b.id).active !== false).map(b => { const sp = b.speed.length ? b.speed.slice().sort((a, c) => a - c)[Math.floor(b.speed.length / 2)] : null; const l = load(b.id); return Object.assign(b, { med: sp, load: l, score: b.sim * (1 + Math.log2(b.n)) / (1 + l / 6) / (1 + (sp || 1) / 10) }); }).sort((a, b) => b.score - a.score).slice(0, 8);
  },
  /* person × group / module from what they actually did */
  skills() {
    return LabCache.get('pp-skills', () => {
      const ppl = LabPeople.analysts(); const cnt = {}; const add = (id, k, n = 1) => { if (!id || !k) return; (cnt[id] = cnt[id] || {})[k] = (cnt[id][k] || 0) + n; };
      for (const x of LabHD.rows()) if (x.closed && x.mid) add(x.mid, x.r.group);
      for (const r of Store.all('quickwin', '*')) add(r.analyst, r.module, 3);
      for (const r of Store.all('shadow', '*')) add(r.analyst, r.taskType, 0.5);
      const tot = {}; for (const m of Object.values(cnt)) for (const [k, v] of Object.entries(m)) tot[k] = (tot[k] || 0) + v;
      const areas = Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, 14).map(x => x[0]);
      const lvl = v => v >= 20 ? 4 : v >= 8 ? 3 : v >= 3 ? 2 : v > 0 ? 1 : 0;
      const grid = ppl.map(m => ({ m, lv: areas.map(a => lvl((cnt[m.id] || {})[a] || 0)), raw: areas.map(a => (cnt[m.id] || {})[a] || 0) }));
      const single = areas.filter((a, i) => grid.filter(g => g.lv[i] >= 3).length === 1).map(a => ({ a, who: grid.find(g => g.lv[areas.indexOf(a)] >= 3).m.id }));
      const none = areas.filter((a, i) => !grid.some(g => g.lv[i] >= 3));
      return { areas, grid, single, none };
    });
  },
  /* is work spread evenly? */
  fairness() {
    const { from } = LabData.range(); const R = LabPeople.risk(); const pr = new Map(R.ok ? R.open.map(o => [o.x.r.id, o.p]) : []);
    const rows = LabPeople.analysts().map(m => { const l = LabPeople.todos().filter(x => x.r.analyst === m.id && x.r.assigned >= from); const done = l.filter(x => x.r.finish); return { m, n: l.length, dur: l.length ? U.avg(l.map(x => +x.r.duration || 0)) : null, high: l.length ? l.filter(x => x.r.priority === 'High').length / l.length : null, late: done.length ? done.filter(x => x.timing === 'Delayed').length / done.length : null, risk: l.filter(x => pr.has(x.r.id)).map(x => pr.get(x.r.id)) }; }).filter(r => r.n);
    const avg = k => U.avg(rows.map(r => r[k]).filter(v => v != null));
    return { rows, team: { n: avg('n'), dur: avg('dur'), high: avg('high'), late: avg('late') } };
  },
};
