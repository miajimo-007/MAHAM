/* MAHAM Lab — Auto-tagger: learns from records that already have a value (help desk group, quick win module, shadow
 * task type) and suggests it for new / empty ones. Tested on 20% it did not learn from. */
'use strict';

const LabTagger = {
  JOBS: {
    hdgroup: { label: 'Help desk → group', coll: 'helpdesk', text: r => r.subject, y: r => r.group || '' },
    qwmodule: { label: 'Quick win → module', coll: 'quickwin', text: r => [r.subject, r.impact].filter(Boolean).join(' '), y: r => r.module || '' },
    shtype: { label: 'Shadow work → task type', coll: 'shadow', text: r => r.subject, y: r => r.taskType || '' },
  },
  _m: {},
  rows(job) { const J = LabTagger.JOBS[job]; return Store.all(J.coll, '*').filter(r => LabData.inTeam(r.team || LabData.teamOfPerson(r.analyst || r.createdBy))).map(r => ({ r, terms: LabText.terms(J.text(r)), y: String(J.y(r)).trim() })).filter(x => x.terms.length); },
  /* train on 80%, test on 20% → score; then the final model learns from all of it */
  train(job) {
    const all = LabTagger.rows(job); const lab = all.filter(x => x.y); const gaps = all.filter(x => !x.y);
    const cls = {}; for (const x of lab) cls[x.y] = (cls[x.y] || 0) + 1;
    const keep = lab.filter(x => cls[x.y] >= 3);   // classes with too few examples can't be learned
    const sh = LabText.shuffle(keep); const cut = Math.floor(sh.length * 0.8); const tr = sh.slice(0, cut), te = sh.slice(cut);
    const m0 = LabText.nbTrain(tr); let ok = 0, ok2 = 0; const conf = {}; const per = {}; const samples = [];
    for (const x of te) {
      const p = LabText.nbPredict(m0, x.terms); const g = p[0] ? p[0].y : '';
      const pc = per[x.y] = per[x.y] || { n: 0, ok: 0 }; pc.n++;
      if (g === x.y) { ok++; pc.ok++; } else { const k = x.y + ' → ' + g; conf[k] = (conf[k] || 0) + 1; }
      if (p.slice(0, 2).some(q => q.y === x.y)) ok2++;
      if (samples.length < 400) samples.push({ text: LabTagger.JOBS[job].text(x.r), want: x.y, got: g, p: p[0] ? p[0].p : 0, why: g ? LabText.nbWhy(m0, x.terms, g) : [] });
    }
    const model = LabText.nbTrain(keep);
    const res = { job, at: Date.now(), n: keep.length, test: te.length, classes: Object.keys(model.classes).length, acc: te.length ? ok / te.length : null, top2: te.length ? ok2 / te.length : null,
      confusion: Object.entries(conf).sort((a, b) => b[1] - a[1]).slice(0, 10), per: Object.entries(per).map(([y, v]) => ({ y, n: v.n, acc: v.ok / v.n })).sort((a, b) => b.n - a.n), samples,
      skipped: lab.length - keep.length, gapsN: gaps.length, model };
    res.fill = gaps.slice(0, 300).map(x => { const p = LabText.nbPredict(model, x.terms); return { r: x.r, text: LabTagger.JOBS[job].text(x.r), y: p[0] ? p[0].y : '', p: p[0] ? p[0].p : 0, why: p[0] ? LabText.nbWhy(model, x.terms, p[0].y) : [] }; }).sort((a, b) => b.p - a.p);
    LabTagger._m[job] = res; return res;
  },
  /* model history (scores only — the model itself is rebuilt from the data in seconds) */
  async history() { return await Lab.read('models.json', {}); },
  async keep(res) { const h = await LabTagger.history(); (h[res.job] = h[res.job] || []).unshift({ at: res.at, acc: res.acc, top2: res.top2, n: res.n, classes: res.classes, period: Lab.settings.team || 'all teams' }); h[res.job] = h[res.job].slice(0, 20); await Lab.write('models.json', h); },
  tryText(job, text) { const r = LabTagger._m[job]; if (!r) return []; const t = LabText.terms(text); return LabText.nbPredict(r.model, t).slice(0, 3).map(p => Object.assign(p, { why: LabText.nbWhy(r.model, t, p.y) })); },
};
