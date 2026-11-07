/* MAHAM Lab — text tools: cleaning (English + Arabic), word fingerprints (TF-IDF), similarity, grouping into themes,
 * and two small learners: Naive Bayes (tagging) and logistic regression (risk). Plain JavaScript, no model files. */
'use strict';

const LabText = {
  _syn: null, _ign: null,
  reset() { LabText._syn = null; LabText._ign = null; },
  STOP: new Set('a an the and or of to in on at for from by with without is are was were be been being it its this that these those there here as into than then so but if when while which who whom what where why how do does did done has have had can will shall should may might must i we you he she they me my our your his her their them us am pm today yesterday tomorrow sir madam mr ms dr also only just very more most some any all each every no yes ok okay same other another one two three get got go going come make made use used using give given take taken see seen show shown let keep kept put still well even back like etc'.split(' ')),
  STOP_AR: new Set('في من على الى إلى عن مع هذا هذه ذلك تلك التي الذي الذين هو هي هم انا أنا نحن انت أنت كان كانت يكون تم لا لم لن ما ماذا متى اين أين كيف هل او أو ثم قد كل بعض غير بين عند حتى اذا إذا لكن و يا الرجاء رجاء شكرا شكراً'.split(' ')),
  synonyms() {
    if (LabText._syn) return LabText._syn; const m = new Map();
    for (const line of String(Lab.settings.synonyms || '').split('\n')) { const [l, r] = line.split('='); if (!r) continue; const to = LabText.norm(r.trim()).replace(/\s+/g, ''); for (const w of l.split(',')) { const k = LabText.norm(w.trim()); if (k) m.set(k, to); } }
    return (LabText._syn = m);
  },
  ignore() { if (LabText._ign) return LabText._ign; return (LabText._ign = new Set(String(Lab.settings.ignore || '').split(/[,\n]/).map(w => LabText.norm(w.trim())).filter(Boolean))); },
  /* lower case, Arabic letters unified, numbers and IDs out */
  norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/\b[\w.+-]+@[\w.-]+\b/g, ' ').replace(/https?:\S+/g, ' ')
      .replace(/\d+/g, ' ').replace(/[^a-z؀-ۿ]+/g, ' ').replace(/\s+/g, ' ').trim();
  },
  stem(w) {
    if (/[؀-ۿ]/.test(w)) return w.replace(/^(وال|بال|كال|فال|لل|ال)/, '').replace(/(ات|ون|ين|ها|هم|ه)$/, '') || w;
    if (w.length <= 4) return w;
    return w.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '').replace(/(ation|ion)$/, '') || w;
  },
  /* text → list of words (after synonyms, stop words, stemming) */
  words(text) {
    const syn = LabText.synonyms(), ign = LabText.ignore();
    let s = ' ' + LabText.norm(text) + ' ';
    for (const [k, v] of syn) if (k.includes(' ') && s.includes(' ' + k + ' ')) s = s.split(' ' + k + ' ').join(' ' + v + ' ');
    const out = [];
    for (let w of s.split(' ')) {
      if (!w || w.length < 2) continue; if (syn.has(w)) w = syn.get(w);
      if (LabText.STOP.has(w) || LabText.STOP_AR.has(w) || ign.has(w)) continue;
      w = LabText.stem(w); if (LabText._typo && LabText._typo.has(w)) w = LabText._typo.get(w);   // a rare misspelling of a common word
      if (w.length < 2 || ign.has(w)) continue; out.push(w);
    }
    return out;
  },
  /* words + 2-word phrases */
  terms(text) { const w = LabText.words(text); const t = w.slice(); for (let i = 0; i + 1 < w.length; i++) t.push(w[i] + '_' + w[i + 1]); return t; },
  /* ---------- TF-IDF ---------- */
  idf(docs) { const df = new Map(); for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1); const n = docs.length; const idf = new Map(); for (const [t, c] of df) idf.set(t, Math.log((n + 1) / (c + 0.5))); return idf; },
  vec(terms, idf) {
    const tf = new Map(); for (const t of terms) tf.set(t, (tf.get(t) || 0) + 1);
    const v = new Map(); let n2 = 0; for (const [t, c] of tf) { const w = (1 + Math.log(c)) * (idf.get(t) || 0) * (t.includes('_') ? 1.2 : 1); if (w > 0) { v.set(t, w); n2 += w * w; } }
    const n = Math.sqrt(n2) || 1; for (const [t, w] of v) v.set(t, w / n); return v;
  },
  cos(a, b) { if (a.size > b.size) [a, b] = [b, a]; let s = 0; for (const [t, w] of a) { const x = b.get(t); if (x) s += w * x; } return s; },
  top(v, n) { return [...v].sort((a, b) => b[1] - a[1]).slice(0, n).map(x => x[0]); },
  /* ---------- grouping: similar fingerprints join one theme (union-find over candidates sharing a top word) ---------- */
  async group(vecs, thr, onProgress) {
    const n = vecs.length; const parent = Int32Array.from({ length: n }, (_, i) => i);
    const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const tops = vecs.map(v => LabText.top(v, 4)); const post = new Map();
    for (let i = 0; i < n; i++) for (const t of tops[i]) { let l = post.get(t); if (!l) post.set(t, l = []); l.push(i); }
    for (let i = 0; i < n; i++) {
      const seen = new Set();
      for (const t of tops[i]) { const l = post.get(t); const lim = l.length > 1500 ? l.slice(-1500) : l; for (const j of lim) { if (j <= i || seen.has(j)) continue; seen.add(j); if (LabText.cos(vecs[i], vecs[j]) >= thr) { const a = find(i), b = find(j); if (a !== b) parent[a] = b; } } }
      if (onProgress && i % 400 === 0) { onProgress(i / n); await new Promise(r => setTimeout(r, 0)); }
    }
    const groups = new Map(); for (let i = 0; i < n; i++) { const r = find(i); let g = groups.get(r); if (!g) groups.set(r, g = []); g.push(i); }
    return [...groups.values()];
  },
  /* ---------- Naive Bayes (multinomial) ---------- */
  nbTrain(rows) {   // rows: [{ terms, y }]
    const cls = new Map(); const vocab = new Set();
    for (const r of rows) { let c = cls.get(r.y); if (!c) cls.set(r.y, c = { n: 0, tot: 0, w: new Map() }); c.n++; for (const t of r.terms) { c.w.set(t, (c.w.get(t) || 0) + 1); c.tot++; vocab.add(t); } }
    const V = vocab.size || 1, N = rows.length || 1; const model = { V, classes: {} };
    for (const [y, c] of cls) { const words = {}; for (const [t, k] of c.w) if (k >= 1) words[t] = k; model.classes[y] = { prior: Math.log(c.n / N), tot: c.tot, words }; }
    return model;
  },
  nbPredict(model, terms) {
    const sc = []; for (const [y, c] of Object.entries(model.classes)) { let s = c.prior; const den = Math.log(c.tot + model.V); for (const t of terms) s += Math.log((c.words[t] || 0) + 1) - den; sc.push([y, s]); }
    sc.sort((a, b) => b[1] - a[1]); const mx = sc.length ? sc[0][1] : 0; const ex = sc.map(([y, s]) => [y, Math.exp(s - mx)]); const z = ex.reduce((a, x) => a + x[1], 0) || 1;
    return ex.map(([y, e]) => ({ y, p: e / z }));
  },
  nbWhy(model, terms, y) { const c = model.classes[y]; if (!c) return []; const den = Math.log(c.tot + model.V); const avg = t => { let s = 0, k = 0; for (const cc of Object.values(model.classes)) { s += Math.log((cc.words[t] || 0) + 1) - Math.log(cc.tot + model.V); k++; } return s / (k || 1); }; return [...new Set(terms)].map(t => [t, Math.log((c.words[t] || 0) + 1) - den - avg(t)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0].replace('_', ' ')); },
  /* ---------- logistic regression (risk) ---------- */
  lrTrain(X, y, opts = {}) {
    const d = X[0] ? X[0].length : 0; const w = new Float64Array(d + 1); const lr = opts.lr || 0.1, l2 = opts.l2 || 0.001, ep = opts.epochs || 300;
    const pos = y.filter(v => v).length, neg = y.length - pos; const wp = pos ? y.length / (2 * pos) : 1, wn = neg ? y.length / (2 * neg) : 1;   // balance late / on time
    for (let e = 0; e < ep; e++) {
      const g = new Float64Array(d + 1);
      for (let i = 0; i < X.length; i++) { const p = LabText.sig(LabText.dot(w, X[i])); const err = (p - y[i]) * (y[i] ? wp : wn); for (let j = 0; j < d; j++) g[j] += err * X[i][j]; g[d] += err; }
      for (let j = 0; j <= d; j++) w[j] -= lr * (g[j] / X.length + (j < d ? l2 * w[j] : 0));
    }
    return Array.from(w);
  },
  dot(w, x) { let s = w[x.length] || 0; for (let j = 0; j < x.length; j++) s += w[j] * x[j]; return s; },
  sig(z) { return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z)))); },
  /* deterministic shuffle so test scores are repeatable */
  shuffle(a, seed = 7) { const r = a.slice(); let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; },
};
