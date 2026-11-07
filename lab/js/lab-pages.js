/* MAHAM Lab — the screens. Each returns { html, mount, sheets } (sheets = what "⇩ Excel" downloads). */
'use strict';

const xlBtn = name => `<button class="btn sm" data-xl="${h(name)}">⇩ Excel</button>`;
const srcChips = th => Object.entries(th.bySrc).sort((a, b) => b[1] - a[1]).map(([s, n]) => `<span class="chip" title="${h(LabData.label(s))}">${LabData.icon(s)} ${n}</span>`).join('');

/* one theme as a card (Quick win ideas, All themes) */
function themeCard(th, i, opts = {}) {
  const d = LabFinder.draft(th);
  return `<section class="card lab-idea ${th.useful ? 'useful' : ''}" data-sig="${h(th.sig)}"><div class="li-top"><span class="lab-rank">${i + 1}</span><div class="grow"><h3>${h(th.name)}</h3>
      <div class="small muted">key words: ${h(th.keys)} · ${LabFinder.evidence(th)}${th.depts.length ? ` · ${th.depts.length} department${th.depts.length === 1 ? '' : 's'}` : ''} · ${th.people.length} ${th.people.length === 1 ? 'person' : 'people'}</div></div>
      ${LabUI.label(th.label)}${th.useful ? ' <span class="badge good">👍 useful</span>' : ''}</div>
    <div class="lab-idea-body"><div class="lab-why">
      <div><b>≈ ${LabUI.hrs(th.perMonth)}</b> <span class="muted small">staff time a month</span></div>
      <div><b>≈ ${LabUI.hrs(th.saving)}</b> <span class="muted small">a month saved if fixed</span></div>
      <div><b class="${th.rising >= 1.25 ? 't-bad' : th.rising <= 0.7 ? 't-good' : ''}">${th.rising >= 1.25 ? '▲ rising' : th.rising <= 0.7 ? '▼ falling' : '● steady'}</b> <span class="muted small">${th.prevN} before → ${th.items.length} now</span></div>
      ${th.openCatches ? `<div>🎯 <b>${th.openCatches}</b> <span class="muted small">open good catch${th.openCatches === 1 ? '' : 'es'}</span></div>` : ''}
      ${th.stuck ? `<div>↗ <b>${th.stuck}</b> <span class="muted small">stuck in Central review &gt; 90 days</span></div>` : ''}
    </div><div class="lab-spk">${LabUI.bars(th.series, th.months)}</div></div>
    <div class="small">${srcChips(th)} ${th.depts.slice(0, 4).map(x => `<span class="chip">${h(x)}</span>`).join('')}</div>
    ${th.qw ? `<div class="small lab-qw">⚡ Similar fix before: <b>${h(th.qw.r.qwId || '')} ${h(th.qw.r.subject)}</b>${th.qw.days != null ? ` — took ${th.qw.days} day${th.qw.days === 1 ? '' : 's'}` : ''}${th.label === 'addressed' ? ' · the theme dropped after it' : ''}</div>` : ''}
    ${th.pj && th.label === 'project' ? `<div class="small lab-qw">◈ Similar project: <b>${h(th.pj.r.name)}</b></div>` : ''}
    ${opts.draft !== false && (th.label === 'quickwin' || opts.allDrafts) ? `<details class="lab-draft"><summary>⚡ Quick win draft</summary><div class="small"><b>Subject:</b> ${h(d.subject)}<br><b>Module:</b> ${h(d.module || '(choose)')} · <b>Type:</b> ${h(d.type)}<br><b>Impact:</b> ${h(d.impact)}</div><button class="btn xs" data-copy="${h(LabFinder.draftText(th))}">Copy</button></details>` : ''}
    <div class="row-btns tight"><button class="btn xs" data-recs="${h(th.sig)}">See ${th.items.length} records</button><span class="grow"></span>
      <button class="btn xs ghost" data-fb="useful|${h(th.sig)}">👍 Useful</button><button class="btn xs ghost" data-fb="no|${h(th.sig)}">👎 Not useful</button>${opts.tools ? `<button class="btn xs ghost" data-merge="${h(th.sig)}">Merge…</button><button class="btn xs ghost" data-split="${h(th.sig)}">Split…</button>` : ''}</div></section>`;
}
function bindThemes(root, themes) {
  const get = s => themes.find(t => t.sig === s);
  root.querySelectorAll('[data-recs]').forEach(b => b.onclick = () => { const th = get(b.dataset.recs); if (!th) return; UI.modal({ title: th.name, wide: true, body: `<p class="small muted">${LabFinder.evidence(th)} · last ${Lab.settings.months} months</p><div class="tbl-scroll"><table class="tbl"><thead><tr><th>Date</th><th>Source</th><th>Text</th><th>Department</th><th>Who</th></tr></thead><tbody>${th.items.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 400).map(x => `<tr><td class="nw">${U.fmtDate(x.date)}</td><td class="nw">${LabData.icon(x.src)} ${h(LabData.label(x.src))}</td><td>${h(x.text)}</td><td>${h(x.dept)}</td><td>${LabData.named(x.src) ? LabUI.who(x.person) : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>${th.items.length > 400 ? `<p class="small muted">Showing 400 of ${th.items.length} — use Excel for all.</p>` : ''}`, actions: '<span class="grow"></span><button class="btn" data-c>Close</button>', onMount: w => { w.querySelector('[data-c]').onclick = UI.closeModal; } }); });
  root.querySelectorAll('[data-fb]').forEach(b => b.onclick = async () => {
    const i = b.dataset.fb.indexOf('|'); const k = b.dataset.fb.slice(0, i), s = b.dataset.fb.slice(i + 1); const fb = LabFinder.feedback;   // the theme key itself contains "|"

    if (k === 'useful') { if (fb.useful[s]) delete fb.useful[s]; else fb.useful[s] = Date.now(); delete fb.notUseful[s]; }
    else { fb.notUseful[s] = { at: Date.now(), name: (get(s) || {}).name }; delete fb.useful[s]; }
    await LabFinder.saveFeedback(); LabFinder.clear(); UI.toast(k === 'useful' ? 'Marked useful — ranked higher' : 'Hidden — find it under "Hidden themes" in All themes', 'good'); LabUI.go(location.hash.slice(1) || LabUI.page);
  });
  root.querySelectorAll('[data-merge]').forEach(b => b.onclick = () => { const s = b.dataset.merge; const others = themes.filter(t => t.sig !== s).slice(0, 150);
    UI.modal({ title: 'Merge with…', body: `<form class="grid-form">${UI.field({ key: 'to', label: 'Join this theme with', type: 'select', options: others.map(t => [t.sig, `${t.name} (${t.items.length})`]), blank: false })}</form>`, actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Merge</button>',
      onMount: w => { w.querySelector('[data-c]').onclick = UI.closeModal; w.querySelector('[data-ok]').onclick = async () => { LabFinder.feedback.merges.push([s, w.querySelector('[name=to]').value]); await LabFinder.saveFeedback(); LabFinder.clear(); UI.closeModal(); UI.toast('Merged — the Lab remembers it', 'good'); LabUI.go(location.hash.slice(1) || LabUI.page); }; } }); });
  root.querySelectorAll('[data-split]').forEach(b => b.onclick = () => { const th = get(b.dataset.split); const words = [...new Set(th.items.flatMap(x => LabText.words(x.text)))].map(w => [w, th.items.filter(x => LabText.words(x.text).includes(w)).length]).filter(x => x[1] < th.items.length && x[1] >= 2).sort((a, c) => c[1] - a[1]).slice(0, 40);
    UI.modal({ title: 'Split: ' + th.name, body: `<p class="small muted">Records that contain the word you choose become their own theme.</p><form class="grid-form">${UI.field({ key: 'w', label: 'Split by the word', type: 'select', options: words.map(([w, n]) => [w, `${w} (${n})`]), blank: false })}</form>`, actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Split</button>',
      onMount: w => { w.querySelector('[data-c]').onclick = UI.closeModal; w.querySelector('[data-ok]').onclick = async () => { LabFinder.feedback.splits.push({ sig: th.sig, word: w.querySelector('[name=w]').value }); await LabFinder.saveFeedback(); LabFinder.clear(); UI.closeModal(); UI.toast('Split — the Lab remembers it', 'good'); LabUI.go(location.hash.slice(1) || LabUI.page); }; } }); });
}
const themeSheet = themes => ({ name: 'Themes', rows: [['Rank', 'Theme', 'Type', 'Records', 'Help desk', 'Shadow work', 'To Do', 'Good catches', 'On-call', 'Central', 'Personal tasks', 'Staff hours (period)', 'Hours a month', 'Could save a month', 'Before', 'Now', 'Departments', 'Similar quick win', 'Quick win draft — subject', 'Module', 'Impact'], ...themes.map((t, i) => { const d = LabFinder.draft(t); return [i + 1, t.name, (LabFinder.LABELS[t.label] || [t.label])[0], t.items.length, t.bySrc.helpdesk || 0, t.bySrc.shadow || 0, t.bySrc.todo || 0, t.bySrc.gcatch || 0, t.bySrc.oncall || 0, t.bySrc.central || 0, t.bySrc.mytask || 0, Math.round(t.hours * 10) / 10, Math.round(t.perMonth * 10) / 10, Math.round(t.saving * 10) / 10, t.prevN, t.items.length, t.depts.join(', '), t.qw ? `${t.qw.r.qwId || ''} ${t.qw.r.subject}` : '', d.subject, d.module, d.impact]; })] });

const LabPages = {
  /* ---------- Overview ---------- */
  async overview(prog) {
    const res = await LabFinder.run(prog); const c = LabData.counts(); const { from, to } = LabData.range();
    const ideas = res.themes.filter(t => t.label === 'quickwin' && !t.hidden).slice(0, 5); const sp = LabHD.spikes().slice(0, 3);
    return { html: `<div class="insights"><div>Reading the shared folder <b>read-only</b> — nothing in it can change. Period: <b>${U.fmtDate(from)} – ${U.fmtDate(to)}</b>${Lab.settings.team ? ' · team ' + h(Store.teamName(Lab.settings.team)) : ' · all teams'}. Your Lab settings and feedback are kept in this browser.</div></div>
      <div class="kpis">${Object.keys(LabData.SOURCES).map(s => UI.kpi(LabData.icon(s) + ' ' + LabData.label(s), c[s] || 0, 'records (incl. the period before, for trends)')).join('')}</div>
      <div class="cols2"><div>${card(`💡 Top quick win ideas <a href="#ideas" class="link small" data-goto="ideas">all →</a>`, ideas.length ? ideas.map((t, i) => `<div class="li"><span class="lab-rank sm">${i + 1}</span><div class="grow"><b>${h(t.name)}</b><div class="small muted">${LabFinder.evidence(t)} · ≈ ${LabUI.hrs(t.saving)} a month could be saved</div></div>${LabUI.spark(t.series)}</div>`).join('') : empty('No quick win ideas in this period.'))}</div>
      <div>${card('⚡ Unusual days (help desk)', sp.length ? sp.map(s => `<div class="li"><div class="grow"><b>${h(s.key)}</b> · ${U.fmtDate(s.day)}<div class="small muted">${s.n} requests (usual ${s.usual}) · ${s.top.map(([t, n]) => h(t) + ' ' + n).join(', ')}</div></div></div>`).join('') : empty('Nothing unusual.'))}
      ${card('What the Lab looked at', `<p class="small">${res.items} problem records became ${res.docs} distinct lines and <b>${res.themes.length}</b> themes (at least ${Lab.settings.minTheme} records each).</p>`)}</div></div>` };
  },
  /* ---------- Quick win ideas ---------- */
  async ideas(prog) {
    const res = await LabFinder.run(prog); const s = ps('labideas'); const q = U.lc(s.q || '');
    let l = res.themes.filter(t => t.label === 'quickwin' && !t.hidden); if (q) l = l.filter(t => U.lc(t.name + ' ' + t.items.map(x => x.text).join(' ')).includes(q));
    if (s.src) l = l.filter(t => t.bySrc[s.src]); if (s.multi) l = l.filter(t => Object.keys(t.bySrc).length > 1);
    const shown = l.slice(0, 40);
    return { html: `<div class="page-actions"><input class="search" id="lq" placeholder="Search ideas…" value="${h(s.q || '')}"><label class="flt"><span>Must include</span><select id="lsrc"><option value="">any source</option>${Object.keys(LabData.SOURCES).filter(k => k !== 'quickwin').map(k => `<option value="${k}" ${s.src === k ? 'selected' : ''}>${h(LabData.label(k))}</option>`).join('')}</select></label><label class="flt tog"><input type="checkbox" id="lmulti" ${s.multi ? 'checked' : ''}> Seen in 2+ sources</label><span class="grow"></span>${xlBtn('Quick win ideas')}</div>
      <p class="small muted">Small, frequent problems found across help desk, shadow work, To Dos, good catches, on-call, Central follow-up and personal tasks — ranked by staff time × how often × how widespread × trend. Each has a ready quick win draft to copy into MAHAM. Mark 👍 / 👎 so the ranking learns.</p>
      ${shown.length ? shown.map((t, i) => themeCard(t, i)).join('') : empty('No quick win ideas match.')}${l.length > 40 ? `<p class="small muted">Showing 40 of ${l.length} — Excel has all.</p>` : ''}`,
      mount(root) { bindThemes(root, l); const qi = root.querySelector('#lq'); qi.oninput = U.debounce(() => { s.q = qi.value; LabUI.go('ideas'); }, 400); root.querySelector('#lsrc').onchange = e => { s.src = e.target.value; LabUI.go('ideas'); }; root.querySelector('#lmulti').onchange = e => { s.multi = e.target.checked; LabUI.go('ideas'); }; },
      sheets: () => [themeSheet(l)] };
  },
  /* ---------- All themes ---------- */
  async themes(prog) {
    const res = await LabFinder.run(prog); const s = ps('labthemes');
    let l = res.themes.filter(t => s.hidden ? t.hidden : !t.hidden); if (s.label) l = l.filter(t => t.label === s.label); if (s.src) l = l.filter(t => t.bySrc[s.src]);
    if (s.dept) l = l.filter(t => t.depts.includes(s.dept));
    const depts = [...new Set(res.themes.flatMap(t => t.depts))].sort();
    const n = k => res.themes.filter(t => !t.hidden && t.label === k).length;
    return { html: `<div class="page-actions"><div class="pm-seg">${[['', 'All'], ...Object.keys(LabFinder.LABELS).map(k => [k, LabFinder.LABELS[k][0]])].map(([k, lab]) => `<button class="btn sm ${(s.label || '') === k ? 'primary' : 'ghost'}" data-lab="${k}">${lab} ${k ? `<span class="count">${n(k)}</span>` : ''}</button>`).join('')}</div></div>
      <div class="page-actions"><label class="flt"><span>Source</span><select id="tsrc"><option value="">any</option>${Object.keys(LabData.SOURCES).map(k => `<option value="${k}" ${s.src === k ? 'selected' : ''}>${h(LabData.label(k))}</option>`).join('')}</select></label><label class="flt"><span>Department</span><select id="tdept"><option value="">any</option>${depts.map(d => `<option ${s.dept === d ? 'selected' : ''}>${h(d)}</option>`).join('')}</select></label><label class="flt tog"><input type="checkbox" id="thid" ${s.hidden ? 'checked' : ''}> Hidden themes (${res.themes.filter(t => t.hidden).length})</label><span class="grow"></span><button class="btn sm" id="tsnap">🗂 Save this month's snapshot</button>${xlBtn('All themes')}</div>
      ${l.slice(0, 60).map((t, i) => themeCard(t, i, { tools: true, allDrafts: true })).join('') || empty('No themes match.')}${s.hidden && l.length ? '<p class="small"><a href="#" class="link" id="unhide">Show all hidden themes again</a></p>' : ''}`,
      mount(root) { bindThemes(root, l); root.querySelectorAll('[data-lab]').forEach(b => b.onclick = () => { s.label = b.dataset.lab; LabUI.go('themes'); }); root.querySelector('#tsrc').onchange = e => { s.src = e.target.value; LabUI.go('themes'); }; root.querySelector('#tdept').onchange = e => { s.dept = e.target.value; LabUI.go('themes'); }; root.querySelector('#thid').onchange = e => { s.hidden = e.target.checked; LabUI.go('themes'); };
        root.querySelector('#tsnap').onclick = async () => { const k = await LabFinder.saveSnapshot(res.themes.filter(t => !t.hidden)); UI.toast('Snapshot saved for ' + k, 'good'); };
        const u = root.querySelector('#unhide'); if (u) u.onclick = async e => { e.preventDefault(); LabFinder.feedback.notUseful = {}; await LabFinder.saveFeedback(); LabFinder.clear(); LabUI.go('themes'); }; },
      sheets: () => [themeSheet(l)] };
  },
  /* ---------- Snapshots ---------- */
  async snapshots(prog) {
    const res = await LabFinder.run(prog); const snaps = await LabFinder.snapshots(); const keys = Object.keys(snaps).sort().reverse();
    const prev = keys.find(k => k < U.todayStr().slice(0, 7)) || keys[1]; const P = prev ? snaps[prev] : null; const now = res.themes.filter(t => !t.hidden).slice(0, 80);
    const rows = now.map(t => { const o = P ? P.themes.find(x => x.sig === t.sig) : null; return { t, o, ch: o ? t.items.length - o.n : null }; });
    return { html: `<div class="page-actions"><span class="muted small">A snapshot keeps this month's theme list so you can compare month to month. Saved snapshots: ${keys.length ? keys.map(k => `<b>${k}</b>`).join(', ') : 'none yet'}.</span><span class="grow"></span><button class="btn primary" id="ssave">🗂 Save snapshot for ${U.todayStr().slice(0, 7)}</button>${xlBtn('Snapshot comparison')}</div>
      ${P ? card(`Now vs snapshot ${prev}`, `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Theme</th><th>Type</th><th class="num">${h(prev)}</th><th class="num">Now</th><th class="num">Change</th></tr></thead><tbody>${rows.map(r => `<tr><td>${h(r.t.name)}</td><td>${LabUI.label(r.t.label)}</td><td class="num">${r.o ? r.o.n : '<span class="badge warn">new</span>'}</td><td class="num">${r.t.items.length}</td><td class="num ${r.ch > 0 ? 't-bad' : r.ch < 0 ? 't-good' : ''}">${r.ch == null ? '' : (r.ch > 0 ? '+' : '') + r.ch}</td></tr>`).join('')}</tbody></table></div>
        ${(() => { const gone = P.themes.filter(o => !now.some(t => t.sig === o.sig)); return gone.length ? `<h4 class="act-h">Gone since ${h(prev)} <span class="count">${gone.length}</span></h4><div class="small">${gone.slice(0, 30).map(o => h(o.name)).join(' · ')}</div>` : ''; })()}`) : empty('Save a snapshot now, and next month you can compare.')}`,
      mount(root) { root.querySelector('#ssave').onclick = async () => { const k = await LabFinder.saveSnapshot(res.themes.filter(t => !t.hidden)); UI.toast('Snapshot saved for ' + k, 'good'); LabUI.go('snapshots'); }; },
      sheets: () => [{ name: 'Snapshot comparison', rows: [['Theme', 'Type', prev || 'before', 'Now', 'Change'], ...rows.map(r => [r.t.name, r.t.label, r.o ? r.o.n : 'new', r.t.items.length, r.ch == null ? '' : r.ch])] }] };
  },
  /* ---------- Did the fix work? ---------- */
  async fixcheck(prog) {
    const res = await LabFinder.run(prog); const s = ps('labfix'); const th = res.themes.find(t => t.sig === s.sig) || null;
    const qwd = th && th.qw ? (th.qw.r.expected || th.qw.r.date) : '';
    const date = s.date || qwd || U.addDays(U.todayStr(), -60); const r = th ? LabFinder.fixCheck(th, date) : null;
    return { html: `<div class="page-actions"><label class="flt"><span>Theme</span><select id="fxs"><option value="">— choose —</option>${res.themes.slice(0, 200).map(t => `<option value="${h(t.sig)}" ${t.sig === s.sig ? 'selected' : ''}>${h(t.name)} (${t.items.length})</option>`).join('')}</select></label><label class="flt"><span>Fixed on</span><input type="date" id="fxd" value="${h(date)}"></label>${th && th.qw ? `<span class="small muted">similar quick win: ${h(th.qw.r.qwId || '')} ${h(th.qw.r.subject)}${qwd ? ' (' + U.fmtDate(qwd) + ')' : ''}</span>` : ''}</div>
      ${r ? `<div class="kpis k4">${UI.kpi('Before (a month)', U.num(r.perBefore, 1), r.before + ' in the 6 months before')}${UI.kpi('After (a month)', U.num(r.perAfter, 1), r.after + ' since')}${UI.kpi('Change', r.change == null ? '–' : (r.change > 0 ? '+' : '') + Math.round(r.change * 100) + '%', r.change != null && r.change <= -0.3 ? 'the fix worked' : r.change != null && r.change >= 0 ? 'no drop yet' : '', r.change != null && r.change <= -0.3 ? 'sc-a' : r.change >= 0 ? 'sc-e' : '')}${UI.kpi('Hours a month saved', U.num(Math.max(0, (r.perBefore - r.perAfter)) * (th.hours / Math.max(1, th.items.length)), 1) + ' h', 'estimate')}</div>
        ${card('Per month (the fix month is marked)', `<div class="lab-bars big">${r.series.map((v, i) => `<div class="${r.months[i] === r.fixMonth ? 'fix' : ''}" title="${r.months[i]}: ${v}"><i style="height:${Math.round(v / Math.max(1, ...r.series) * 100)}%"></i><span>${h(U.MONTHS[+r.months[i].slice(5, 7) - 1].slice(0, 3))}</span></div>`).join('')}</div>`)}` : empty('Choose a theme and the date it was fixed.')}`,
      mount(root) { root.querySelector('#fxs').onchange = e => { s.sig = e.target.value; s.date = ''; LabUI.go('fixcheck'); }; root.querySelector('#fxd').onchange = e => { s.date = e.target.value; LabUI.go('fixcheck'); }; } };
  },
  /* ---------- Auto-tagger ---------- */
  async tagger() {
    const s = ps('labtag'); const job = LabTagger.JOBS[s.job] ? s.job : 'hdgroup'; const r = LabTagger._m[job]; const hist = (await LabTagger.history())[job] || [];
    return { html: `<div class="page-actions"><div class="pm-seg">${Object.entries(LabTagger.JOBS).map(([k, j]) => `<button class="btn sm ${k === job ? 'primary' : 'ghost'}" data-job="${k}">${h(j.label)}</button>`).join('')}</div><span class="grow"></span><button class="btn primary" id="ttrain">${r ? '↻ Train again' : '▶ Train'}</button>${r ? xlBtn('Auto-tagger ' + job) : ''}</div>
      ${r ? `<div class="kpis k4">${UI.kpi('Correct', LabUI.pct(r.acc), `tested on ${r.test} it did not learn from`, r.acc >= 0.8 ? 'sc-a' : r.acc >= 0.6 ? 'sc-c' : 'sc-e')}${UI.kpi('Right answer in its top 2', LabUI.pct(r.top2), '')}${UI.kpi('Learned from', r.n, `${r.classes} values${r.skipped ? ` · ${r.skipped} skipped (values with < 3 examples)` : ''}`)}${UI.kpi('Empty today', r.gapsN, 'records it could fill')}</div>
        <div class="cols2"><div>${card('Try it', `<input id="ttry" placeholder="Type a subject…" style="width:100%"><div id="ttryout" class="small"></div>`)}
          ${card('Per value', `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Value</th><th class="num">Tested</th><th class="num">Correct</th></tr></thead><tbody>${r.per.map(p => `<tr><td>${h(p.y)}</td><td class="num">${p.n}</td><td class="num ${p.acc < 0.6 ? 't-bad' : ''}">${LabUI.pct(p.acc)}</td></tr>`).join('')}</tbody></table></div>`)}
          ${card('It mixes up', r.confusion.length ? r.confusion.map(([k, n]) => `<div class="li"><span class="grow">${h(k)}</span><b>${n}</b></div>`).join('') : empty('Nothing.'))}</div>
        <div>${card(`Fill the gaps — preview only <span class="count">${r.fill.length}</span>`, r.fill.length ? r.fill.slice(0, 40).map(f => `<div class="li"><div class="grow">${h(f.text)}<div class="small muted">why: ${h(f.why.join(', ') || '—')}</div></div><b>${h(f.y)}</b> <span class="badge ${f.p >= 0.8 ? 'good' : f.p >= 0.5 ? 'warn' : ''}">${LabUI.pct(f.p)}</span></div>`).join('') : empty('No empty records.'))}
          ${card('Sample guesses (test set)', r.samples.slice(0, 25).map(x => `<div class="li"><span>${x.got === x.want ? '✅' : '❌'}</span><div class="grow">${h(x.text)}<div class="small muted">${x.got === x.want ? h(x.got) : `said <b>${h(x.got)}</b>, was <b>${h(x.want)}</b>`}</div></div></div>`).join(''))}</div></div>` : `<p class="muted">Press <b>Train</b>: it learns from records that already have a ${h(LabTagger.JOBS[job].label.split('→')[1])}, tests itself on 20% it did not see, and shows the score.</p>`}
      ${hist.length ? card('History', `<table class="tbl"><thead><tr><th>Trained</th><th class="num">Correct</th><th class="num">Top 2</th><th class="num">Examples</th><th>Team</th></tr></thead><tbody>${hist.map(x => `<tr><td>${new Date(x.at).toLocaleString()}</td><td class="num">${LabUI.pct(x.acc)}</td><td class="num">${LabUI.pct(x.top2)}</td><td class="num">${x.n}</td><td>${h(x.period)}</td></tr>`).join('')}</tbody></table>`) : ''}`,
      mount(root) {
        root.querySelectorAll('[data-job]').forEach(b => b.onclick = () => { s.job = b.dataset.job; LabUI.go('tagger'); });
        root.querySelector('#ttrain').onclick = async () => { LabUI.busy('Training…'); await new Promise(rr => setTimeout(rr, 30)); const res = LabTagger.train(job); await LabTagger.keep(res); LabUI.go('tagger'); };
        const t = root.querySelector('#ttry'); if (t) t.oninput = U.debounce(() => { const p = LabTagger.tryText(job, t.value); root.querySelector('#ttryout').innerHTML = p.map(x => `<div><b>${h(x.y)}</b> ${LabUI.pct(x.p)} <span class="muted">— ${h(x.why.join(', '))}</span></div>`).join(''); }, 250);
      },
      sheets: () => r ? [{ name: 'Fill the gaps', rows: [['Text', 'Suggested', 'Sure', 'Why'], ...r.fill.map(f => [f.text, f.y, Math.round(f.p * 100) + '%', f.why.join(', ')])] }, { name: 'Test', rows: [['Text', 'Was', 'Guessed', 'Correct'], ...r.samples.map(x => [x.text, x.want, x.got, x.got === x.want ? 'yes' : 'no'])] }] : [] };
  },
  /* ---------- Help desk ---------- */
  async forecast() {
    const l = LabHD.forecast(); const wk = d => U.fmtDate(d).slice(0, 6);
    return { html: `<div class="page-actions"><span class="small muted">Weekly requests for the last 26 weeks and the next 4 (dashed, with a likely range). Accuracy = how far the same method was off on the last 4 weeks.</span><span class="grow"></span>${xlBtn('Help desk forecast')}</div>
      <div class="cols2">${l.map(x => card(`${h(x.name)} <span class="muted small">next 4 weeks: <b>${x.next4 == null ? '–' : Math.round(x.next4)}</b>${x.lo4 != null ? ` (${Math.round(x.lo4)}–${Math.round(x.hi4)})` : ''}</span>`, `${LabUI.fcChart(x.vals, x.fc, x.weeks.map(wk))}<div class="small muted">Last 4 weeks: ${U.sum(x.vals.slice(-4))} · accuracy on them: ${x.mape == null ? '–' : 'off by ' + Math.round(x.mape * 100) + '%'}</div>`)).join('')}</div>`,
      sheets: () => [{ name: 'Forecast', rows: [['Group', 'Next 4 weeks', 'Low', 'High', 'Last 4 weeks', 'Accuracy (off by %)'], ...l.map(x => [x.name, Math.round(x.next4 || 0), Math.round(x.lo4 || 0), Math.round(x.hi4 || 0), U.sum(x.vals.slice(-4)), x.mape == null ? '' : Math.round(x.mape * 100)])] }] };
  },
  async spikes() {
    const s = ps('labsp'); const by = s.by === 'group' ? 'group' : 'department'; const l = LabHD.spikes(by);
    return { html: `<div class="page-actions"><div class="pm-seg"><button class="btn sm ${by === 'department' ? 'primary' : 'ghost'}" data-by="department">By department</button><button class="btn sm ${by === 'group' ? 'primary' : 'ghost'}" data-by="group">By group</button></div><span class="small muted">A day counts as unusual when it is far above the usual for that weekday over the 8 weeks before (and at least 5 requests).</span><span class="grow"></span>${xlBtn('Spikes')}</div>
      ${card(`Unusual days <span class="count">${l.length}</span>`, l.length ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Day</th><th>${by === 'group' ? 'Group' : 'Department'}</th><th class="num">Requests</th><th class="num">Usual</th><th class="num">×</th><th>Mostly about</th></tr></thead><tbody>${l.map(x => `<tr><td class="nw">${U.fmtDate(x.day)}</td><td>${h(x.key)}</td><td class="num"><b>${x.n}</b></td><td class="num">${x.usual}</td><td class="num">${U.num(x.ratio, 1)}</td><td class="small">${x.top.map(([t, n]) => `${h(t)} (${n})`).join(' · ')}</td></tr>`).join('')}</tbody></table></div>` : empty('Nothing unusual in this period.'))}`,
      mount(root) { root.querySelectorAll('[data-by]').forEach(b => b.onclick = () => { s.by = b.dataset.by; LabUI.go('spikes'); }); },
      sheets: () => [{ name: 'Spikes', rows: [['Day', 'Where', 'Requests', 'Usual', 'Times usual', 'Mostly about'], ...l.map(x => [x.day, x.key, x.n, x.usual, Math.round(x.ratio * 10) / 10, x.top.map(([t, n]) => `${t} (${n})`).join('; ')])] }] };
  },
  async ttc() {
    const r = LabHD.ttc(); const fh = v => v == null ? '–' : v < 48 ? U.num(v, 1) + ' h' : U.num(v / 24, 1) + ' days';
    return { html: `<div class="kpis k4">${UI.kpi('Closed requests', r.n, '')}${UI.kpi('Prediction close enough', LabUI.pct(r.within), `on the newest ${r.test} (within ±50% or 4 h)`, r.within >= 0.6 ? 'sc-a' : 'sc-c')}${UI.kpi('Average miss', fh(r.mae), '')}</div>
      <div class="page-actions"><span class="small muted">The prediction uses the group's usual time. Use it to tell requesters "usually 2–3 days" and to spot requests running much longer than usual.</span><span class="grow"></span>${xlBtn('Time to close')}</div>
      ${card('Per group', `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Group</th><th class="num">Closed</th><th class="num">Usual (median)</th><th class="num">3 in 4 within</th><th class="num">9 in 10 within</th></tr></thead><tbody>${r.groups.map(g => `<tr><td>${h(g.g)}</td><td class="num">${g.n}</td><td class="num">${fh(g.med)}</td><td class="num">${fh(g.p75)}</td><td class="num">${fh(g.p90)}</td></tr>`).join('')}</tbody></table></div>`)}`,
      sheets: () => [{ name: 'Time to close', rows: [['Group', 'Closed', 'Median h', '75% within h', '90% within h'], ...r.groups.map(g => [g.g, g.n, g.med, g.p75, g.p90])] }] };
  },
  async repeats() {
    const r = LabHD.repeats();
    const tb = (l, w) => l.length ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>${w}</th><th>About</th><th class="num">Times</th><th>Latest</th><th>Example</th></tr></thead><tbody>${l.map(x => `<tr><td>${h(x.who)}</td><td>${h(x.what)}</td><td class="num"><b>${x.n}</b></td><td class="nw">${U.fmtDate(x.last)}</td><td class="small">${h(x.sample)}</td></tr>`).join('')}</tbody></table></div>` : empty('None.');
    return { html: `<div class="page-actions"><span class="small muted">The same requester (3+ times) or department (5+ times) raising the same thing in this period — often a training need or a fix waiting to happen.</span><span class="grow"></span>${xlBtn('Repeat requesters')}</div>
      <div class="cols2"><div>${card(`Requesters <span class="count">${r.requesters.length}</span>`, tb(r.requesters, 'Requester'))}</div><div>${card(`Departments <span class="count">${r.departments.length}</span>`, tb(r.departments, 'Department'))}</div></div>`,
      sheets: () => [{ name: 'Requesters', rows: [['Requester', 'About', 'Times', 'Latest', 'Example'], ...r.requesters.map(x => [x.who, x.what, x.n, x.last, x.sample])] }, { name: 'Departments', rows: [['Department', 'About', 'Times', 'Latest', 'Example'], ...r.departments.map(x => [x.who, x.what, x.n, x.last, x.sample])] }] };
  },
  async linked(prog) {
    await LabFinder.run(prog); const l = await LabHD.linked();
    return { html: `<div class="page-actions"><span class="small muted">Themes whose daily counts go up and down together — they may share one cause (e.g. one interface down behind two kinds of complaint).</span><span class="grow"></span>${xlBtn('Linked spikes')}</div>
      ${card(`Linked themes <span class="count">${l.length}</span>`, l.length ? l.map(x => `<div class="li"><div class="grow"><b>${h(x.a.name)}</b> ↔ <b>${h(x.b.name)}</b><div class="small muted">${x.a.items.length} and ${x.b.items.length} records</div></div><span class="badge ${x.r >= 0.7 ? 'bad' : 'warn'}">together ${Math.round(x.r * 100)}%</span></div>`).join('') : empty('No themes move together strongly in this period.'))}`,
      sheets: () => [{ name: 'Linked', rows: [['Theme A', 'Theme B', 'Together %'], ...l.map(x => [x.a.name, x.b.name, Math.round(x.r * 100)])] }] };
  },
  /* ---------- People ---------- */
  async risk() {
    const R = LabPeople.risk(); if (!R.ok) return { html: empty(`Needs at least 40 finished To Dos (found ${R.n}).`) };
    const hi = R.open.filter(o => o.p >= 0.5);
    return { html: `<div class="insights"><div>A hint for follow-up, not a judgement of anyone. Learned from ${R.n} finished To Dos (${LabUI.pct(R.lateRate)} were late).</div></div>
      <div class="kpis k4">${UI.kpi('Catches late ones', R.recall == null ? '–' : Math.round(R.recall * 10) + ' of 10', `tested on the newest ${R.test}`, R.recall >= 0.6 ? 'sc-a' : 'sc-c')}${UI.kpi('When it says "high"', R.precision == null ? '–' : `right ${Math.round(R.precision * 10)} of 10`, '')}${UI.kpi('Open To Dos at high risk', hi.length, 'of ' + R.open.length + ' open')}${UI.kpi('Biggest factor', h(R.weights[0][0]), '')}</div>
      <div class="cols2"><div>${card(`Open To Dos by risk <span class="count">${R.open.length}</span>`, R.open.length ? R.open.slice(0, 40).map(o => `<div class="li"><div class="grow"><b>${h(o.x.r.task)}</b><div class="small muted">${LabUI.who(o.x.r.analyst)} · given ${U.fmtDate(o.x.r.assigned)} · due ${U.fmtDate(o.x.due)}${o.why.length ? ' · ' + h(o.why.join(', ')) : ''}</div></div><span class="badge ${o.p >= 0.7 ? 'bad' : o.p >= 0.5 ? 'warn' : 'good'}">${Math.round(o.p * 100)}%</span></div>`).join('') : empty('No open To Dos.'))}</div>
      <div>${card('What pushes the risk up (or down)', R.weights.map(([l, w]) => `<div class="li"><span class="grow">${h(l)}</span><span class="${w > 0 ? 't-bad' : 't-good'}">${w > 0 ? '▲' : '▼'} ${U.num(Math.abs(w), 2)}</span></div>`).join(''))}</div></div>`,
      sheets: () => [{ name: 'Late-risk', rows: [['To Do', 'Person', 'Given', 'Due', 'Risk %', 'Why'], ...R.open.map(o => [o.x.r.task, Store.memberShort(o.x.r.analyst), o.x.r.assigned, o.x.due, Math.round(o.p * 100), o.why.join(', ')])] }] };
  },
  async best() {
    const s = ps('labbest'); const l = s.q ? LabPeople.bestPerson(s.q) : [];
    return { html: `${card('Who is best placed?', `<div class="row-btns"><input id="bq" placeholder="Describe the problem, e.g. pharmacy label not printing" value="${h(s.q || '')}" style="flex:1"><button class="btn primary" id="bgo">Find</button></div><p class="small muted">Looks at who closed similar help desk requests, To Dos and good catches, how fast, and how much they have open now.</p>`)}
      ${s.q ? card(`Suggestions <span class="count">${l.length}</span>`, l.length ? `<table class="tbl"><thead><tr><th>Person</th><th class="num">Similar done</th><th class="num">Usual time</th><th class="num">Open now</th></tr></thead><tbody>${l.map((b, i) => `<tr><td>${i === 0 ? '⭐ ' : ''}<b>${LabUI.who(b.id)}</b></td><td class="num">${b.n}</td><td class="num">${b.med == null ? '–' : U.num(b.med, 1) + ' days'}</td><td class="num">${b.load}</td></tr>`).join('')}</tbody></table>` : empty('Nobody has done something similar yet.')) : ''}`,
      mount(root) { const go = () => { s.q = root.querySelector('#bq').value.trim(); LabUI.go('best'); }; root.querySelector('#bgo').onclick = go; root.querySelector('#bq').onkeydown = e => { if (e.key === 'Enter') go(); }; } };
  },
  async workload() {
    const r = LabPeople.workload(); if (!r) return { html: empty('Needs at least 40 finished To Dos.') };
    return { html: `${card('How often To Dos end late, by how many the person already had open', `<table class="tbl"><thead><tr><th>Already open when given</th><th class="num">To Dos</th><th class="num">Late</th><th></th></tr></thead><tbody>${r.rows.map(x => `<tr class="${r.tip === x ? 'hl' : ''}"><td>${h(x.l)}</td><td class="num">${x.n}</td><td class="num">${LabUI.pct(x.late)}</td><td style="width:40%"><div class="bar"><i style="width:${Math.round((x.late || 0) * 100)}%"></i></div></td></tr>`).join('')}</tbody></table>
      <p>${r.tip ? `👉 Lateness jumps from about <b>${h(r.tip.l)}</b> open To Dos. A good limit before giving someone more.` : 'No clear jump — lateness does not depend much on how many are open.'}</p>`)}` };
  },
  async skills() {
    const r = LabPeople.skills(); const L = ['', '1', '2', '3', '4'];
    return { html: `<div class="page-actions"><span class="small muted">Worked out from what each person actually closed or did (help desk groups, quick win modules, shadow task types). 4 = a lot of experience, 1 = a little.</span><span class="grow"></span>${xlBtn('Skills')}</div>
      ${r.single.length ? `<div class="insights warnbox"><div>⚠ Only one strong person: ${r.single.map(x => `<b>${h(x.a)}</b> (${LabUI.who(x.who)})`).join(' · ')}</div></div>` : ''}
      ${r.none.length ? `<div class="insights"><div>Nobody strong yet: ${r.none.map(a => `<b>${h(a)}</b>`).join(' · ')}</div></div>` : ''}
      ${card('Skills matrix', `<div class="tbl-scroll"><table class="tbl skills"><thead><tr><th>Person</th>${r.areas.map(a => `<th class="ctr" title="${h(a)}"><span class="vert">${h(a)}</span></th>`).join('')}</tr></thead><tbody>${r.grid.map(g => `<tr><td class="nw"><b>${LabUI.who(g.m.id)}</b></td>${g.lv.map((v, i) => `<td class="ctr lv${v}" title="${h(r.areas[i])}: ${Math.round(g.raw[i])}">${L[v]}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)}`,
      sheets: () => [{ name: 'Skills', rows: [['Person', ...r.areas], ...r.grid.map(g => [Store.memberShort(g.m.id), ...g.lv])] }] };
  },
  async fair() {
    const r = LabPeople.fairness(); const T = r.team; const flag = (v, t) => v != null && t ? (v > t * 1.3 ? 't-bad strong' : v < t * 0.7 ? 't-good' : '') : '';
    return { html: `<div class="page-actions"><span class="small muted">To Dos given in this period. Red = clearly above the team average, green = clearly below.</span><span class="grow"></span>${xlBtn('Fair assignment')}</div>
      ${card('Who gets what', `<table class="tbl"><thead><tr><th>Person</th><th class="num">To Dos</th><th class="num">Avg length (days)</th><th class="num">High priority</th><th class="num">Ended late</th></tr></thead><tbody>${r.rows.map(x => `<tr><td><b>${LabUI.who(x.m.id)}</b></td><td class="num ${flag(x.n, T.n)}">${x.n}</td><td class="num ${flag(x.dur, T.dur)}">${x.dur == null ? '–' : U.num(x.dur, 1)}</td><td class="num ${flag(x.high, T.high)}">${LabUI.pct(x.high)}</td><td class="num ${flag(x.late, T.late)}">${LabUI.pct(x.late)}</td></tr>`).join('')}<tr class="foot"><td>Team average</td><td class="num">${U.num(T.n, 1)}</td><td class="num">${U.num(T.dur, 1)}</td><td class="num">${LabUI.pct(T.high)}</td><td class="num">${LabUI.pct(T.late)}</td></tr></tbody></table>`)}`,
      sheets: () => [{ name: 'Fair assignment', rows: [['Person', 'To Dos', 'Avg days', 'High %', 'Late %'], ...r.rows.map(x => [Store.memberShort(x.m.id), x.n, x.dur, x.high, x.late])] }] };
  },
  /* ---------- Data ---------- */
  async health() {
    const r = LabHealth.run(); const cls = v => v == null ? '' : v >= 0.9 ? 'good' : v >= 0.6 ? 'warn' : 'bad';
    return { html: `<div class="page-actions"><span class="small muted">The models learn from these fields — the better they are filled, the better the results. Report only: fix things in MAHAM.</span><span class="grow"></span>${xlBtn('Data health')}</div>
      <div class="cols2"><div>${r.fields.map(([n, cnt, fs]) => card(`${h(n)} <span class="count">${cnt}</span>`, fs.map(([f, v]) => `<div class="li"><span class="grow">${h(f)}</span><span class="badge ${cls(v)}">${LabUI.pct(v)}</span></div>`).join(''))).join('')}</div>
      <div>${card(`Odd entries <span class="count">${U.sum(r.odd.map(o => o.n))}</span>`, r.odd.length ? r.odd.map(o => `<details><summary><b>${h(o.k)}</b> <span class="count">${o.n}</span></summary><div class="small">${o.ex.map(e => `<div>· ${h(e)}</div>`).join('')}</div></details>`).join('') : empty('Nothing odd found.'))}</div></div>`,
      sheets: () => [{ name: 'Fields', rows: [['Type', 'Field', 'Filled %'], ...r.fields.flatMap(([n, , fs]) => fs.map(([f, v]) => [n, f, v == null ? '' : Math.round(v * 100)]))] }, { name: 'Odd entries', rows: [['What', 'Example'], ...r.odd.flatMap(o => o.ex.map(e => [o.k, e]))] }] };
  },
  async dupes(prog) {
    await LabFinder.run(prog); const l = LabFinder.duplicates();
    return { html: `<div class="page-actions"><span class="small muted">Open records that look like the same thing (very similar wording).</span><span class="grow"></span>${xlBtn('Duplicates')}</div>
      ${card(`Possible duplicates <span class="count">${l.length}</span>`, l.length ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>One</th><th>Other</th><th class="num">Alike</th></tr></thead><tbody>${l.slice(0, 150).map(p => `<tr><td>${LabData.icon(p.a.src)} ${h(p.a.text)}<div class="small muted">${U.fmtDate(p.a.date)}${LabData.named(p.a.src) ? ' · ' + LabUI.who(p.a.person) : ''}</div></td><td>${LabData.icon(p.b.src)} ${h(p.b.text)}<div class="small muted">${U.fmtDate(p.b.date)}${LabData.named(p.b.src) ? ' · ' + LabUI.who(p.b.person) : ''}</div></td><td class="num">${Math.round(p.sim * 100)}%</td></tr>`).join('')}</tbody></table></div>` : empty('No duplicates found.'))}`,
      sheets: () => [{ name: 'Duplicates', rows: [['Source', 'Text', 'Date', 'Source', 'Text', 'Date', 'Alike %'], ...l.map(p => [LabData.label(p.a.src), p.a.text, p.a.date, LabData.label(p.b.src), p.b.text, p.b.date, Math.round(p.sim * 100)])] }] };
  },
  /* ---------- Settings ---------- */
  async settings() {
    const S = Lab.settings; const num = (k, l, step = 0.25) => UI.field({ key: k, label: l, type: 'number', min: 0, step }, S[k]);
    return { html: `<div class="cols2"><div>${card('Text cleaning', `<form class="grid-form" id="stx">${UI.field({ key: 'synonyms', label: 'Synonyms — one per line: words, … = the word to use', type: 'textarea', span: 2, rows: 10 }, S.synonyms)}${UI.field({ key: 'ignore', label: 'Ignore words (comma separated)', type: 'textarea', span: 2, rows: 4 }, S.ignore)}</form>
        <div class="row-btns"><button class="btn primary" id="stxsave">Save cleaning</button><button class="btn ghost" id="stxdef">Back to defaults</button></div>`)}
      ${card('Cleaning preview', `<input id="sprev" placeholder="Type a line, e.g. Labels not printing in Pharmacy - please help!!" style="width:100%"><div id="sprevout" class="small"></div>`)}</div>
      <div>${card('Costs and weights', `<form class="grid-form" id="scost">${num('hdHours', 'Staff hours per help desk request')}${num('todoHours', 'Staff hours per To Do', 0.5)}${num('catchHours', 'Staff hours per good catch')}${num('oncallHours', 'Staff hours per on-call issue')}${num('taskHours', 'Staff hours per personal task')}${UI.field({ key: 'fixShare', label: 'Share of the time a fix saves (0–1)', type: 'number', min: 0, step: 0.05 }, S.fixShare)}${UI.field({ key: 'minTheme', label: 'Smallest theme (records)', type: 'number', min: 2, step: 1 }, S.minTheme)}${UI.field({ key: 'simThreshold', label: 'How alike to group (0.3 loose – 0.7 strict)', type: 'number', min: 0.2, step: 0.05 }, S.simThreshold)}</form><div class="row-btns"><button class="btn primary" id="scsave">Save</button></div><p class="small muted">Shadow work uses its real minutes.</p>`)}
      ${card('Move the Lab to another PC', `<p class="small muted">Your settings, feedback, model history and snapshots are kept in this browser. Save them to a file, then load it on the other PC.</p><div class="row-btns"><button class="btn" id="sexp">⬇ Save Lab settings file</button><label class="btn">⬆ Load Lab settings file<input type="file" id="simp" accept=".json" hidden></label></div>`)}</div></div>`,
      mount(root) {
        const save = async (f, keys) => { const o = {}; for (const k of keys) { const el = root.querySelector(`#${f} [name=${k}]`); o[k] = el.type === 'number' ? +el.value : el.value; } await Lab.saveSettings(o); LabUI.invalidate(); UI.toast('Saved — results are recalculated', 'good'); };
        root.querySelector('#stxsave').onclick = () => save('stx', ['synonyms', 'ignore']);
        root.querySelector('#stxdef').onclick = async () => { await Lab.saveSettings({ synonyms: Lab.DEFAULTS.synonyms, ignore: Lab.DEFAULTS.ignore }); LabUI.invalidate(); LabUI.go('settings'); };
        root.querySelector('#scsave').onclick = () => save('scost', ['hdHours', 'todoHours', 'catchHours', 'oncallHours', 'taskHours', 'fixShare', 'minTheme', 'simThreshold']);
        const pv = root.querySelector('#sprev'); pv.oninput = () => { const w = LabText.words(pv.value); root.querySelector('#sprevout').innerHTML = `The Lab reads: ${w.length ? w.map(x => `<span class="chip">${h(x)}</span>`).join(' ') : '<i>nothing left</i>'}`; };
        root.querySelector('#sexp').onclick = async () => { const blob = new Blob([JSON.stringify(await Lab.exportAll(), null, 1)], { type: 'application/json' }); XL.download(blob, `MAHAM Lab settings ${U.todayStr()}.json`); };
        root.querySelector('#simp').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { await Lab.importAll(JSON.parse(await f.text())); await Lab.loadSettings(); await LabFinder.loadFeedback(); LabUI.invalidate(); UI.toast('Lab settings loaded', 'good'); LabUI.go('settings'); } catch (err) { UI.toast('That is not a Lab settings file', 'bad'); } };
      } };
  },
  /* ---------- Lab report ---------- */
  async report(prog) {
    const res = await LabFinder.run(prog); const { from, to } = LabData.range(); const ideas = LabFinder.topQuickWins(res, 10);
    const other = LabFinder.topOther(res, 10); const fc = LabHD.forecast()[0]; const sp = LabHD.spikes().slice(0, 5); const he = LabHealth.run();
    const save = U.sum(ideas.map(t => t.saving));
    return { html: `<div class="page-actions no-print"><span class="small muted">One page for your manager or director. Names of people are not shown.</span><span class="grow"></span><button class="btn primary" id="rprint">🖨 Print / save as PDF</button></div>
      <div class="lab-report"><h1>Improvement opportunities — ${h(Store.appName())} Lab</h1><p>${U.fmtDate(from)} – ${U.fmtDate(to)} · ${Lab.settings.team ? h(Store.teamName(Lab.settings.team)) : 'all teams'} · prepared ${U.fmtDate(U.todayStr())}</p>
      <h2>Top quick win ideas — about ${LabUI.hrs(save)} of staff time a month could be saved</h2>
      <table><tr><th>#</th><th>Idea</th><th>Evidence</th><th>Hours a month</th><th>Trend</th></tr>${ideas.map((t, i) => `<tr><td>${i + 1}</td><td><b>${h(t.name)}</b>${t.qw ? `<br><small>similar fix before: ${h(t.qw.r.subject)}</small>` : ''}</td><td>${h(LabFinder.evidence(t))}${t.depts.length ? `<br><small>${h(t.depts.slice(0, 4).join(', '))}</small>` : ''}</td><td>${LabUI.hrs(t.perMonth)}</td><td>${t.rising >= 1.25 ? '▲ rising' : t.rising <= 0.7 ? '▼ falling' : 'steady'}</td></tr>`).join('')}</table>
      ${other.length ? `<h2>Bigger themes (project, training, EHR fix)</h2><table><tr><th>Theme</th><th>Type</th><th>Records</th><th>Hours a month</th></tr>${other.map(t => `<tr><td>${h(t.name)}</td><td>${(LabFinder.LABELS[t.label] || [t.label])[0]}</td><td>${t.items.length}</td><td>${LabUI.hrs(t.perMonth)}</td></tr>`).join('')}</table>` : ''}
      ${fc && fc.next4 != null ? `<h2>Help desk — next 4 weeks</h2><p>About <b>${Math.round(fc.next4)}</b> requests expected (${Math.round(fc.lo4)}–${Math.round(fc.hi4)}); last 4 weeks: ${U.sum(fc.vals.slice(-4))}.</p>` : ''}
      ${sp.length ? `<h2>Unusual days</h2><ul>${sp.map(s => `<li>${U.fmtDate(s.day)} · ${h(s.key)}: ${s.n} requests (usual ${s.usual}) — ${s.top.map(([t]) => h(t)).join(', ')}</li>`).join('')}</ul>` : ''}
      <h2>Data quality</h2><p>${he.fields.map(([n, , fs]) => `${h(n)}: ${fs.map(([f, v]) => `${h(f)} ${LabUI.pct(v)}`).join(', ')}`).join('<br>')}</p>
      <p class="small">Found by the MAHAM Lab from the team's own records (help desk, shadow work, To Dos, good catches, on-call, Central follow-up, personal tasks). Hours are estimates.</p></div>`,
      mount(root) { root.querySelector('#rprint').onclick = () => { document.body.classList.add('lab-printing'); setTimeout(() => { window.print(); document.body.classList.remove('lab-printing'); }, 50); }; } };
  },
};

/* ===================== decision screens (replace the long lists) ===================== */
const LabPlan = {
  ST: ['To do', 'In progress', 'Done', 'Dropped'],
  data: null,
  async load() { LabPlan.data = await Lab.read('plan.json', {}); return LabPlan.data; },
  async save() { await Lab.write('plan.json', LabPlan.data); },
  has(sig) { return !!(LabPlan.data && LabPlan.data[sig]); },
  async add(th, owner) { await LabPlan.load(); LabPlan.data[th.sig] = { name: th.name, label: th.label, status: 'To do', owner: owner || '', note: '', added: Date.now(), saving: Math.round(th.saving * 10) / 10, draft: LabFinder.draftText(th), evidence: LabFinder.evidence(th), top: th.top, effort: th.effortTxt }; await LabPlan.save(); },
};
const confBadge = t => `<span class="badge ${t.confLevel === 'high' ? 'good' : t.confLevel === 'medium' ? 'warn' : ''}" title="How sure: enough records, more than one source, records really alike, still happening">${t.confLevel} confidence</span>`;
/* one compact decision row */
function decideRow(t, i, kind) {
  const inPlan = LabPlan.has(t.sig);
  return `<div class="lab-row" data-sig="${h(t.sig)}"><span class="lab-rank">${i + 1}</span><div class="grow"><div class="lab-row-t"><b>${h(t.name)}</b> ${kind === 'other' ? LabUI.label(t.label) : ''} ${confBadge(t)}</div>
    <div class="small muted">${LabFinder.evidence(t)}${t.depts.length ? ' · ' + h(t.depts.slice(0, 3).join(', ')) + (t.depts.length > 3 ? ' +' + (t.depts.length - 3) : '') : ''} · last seen ${U.fmtDate(t.last)}</div>
    <div class="lab-row-n"><span><b>≈ ${LabUI.hrs(t.saving)}</b> a month saved</span><span>⏱ ${h(t.effortTxt)}</span><span class="${t.rising >= 1.25 ? 't-bad' : t.rising <= 0.7 ? 't-good' : ''}">${t.rising >= 1.25 ? '▲ rising' : t.rising <= 0.7 ? '▼ falling' : '● steady'}</span></div></div>
    <div class="lab-row-s">${LabUI.spark(t.series, 90, 28)}</div>
    <div class="lab-row-b">${inPlan ? '<span class="badge good">✓ in plan</span>' : `<button class="btn sm primary" data-plan="${h(t.sig)}">＋ Plan</button>`}<button class="btn sm" data-det="${h(t.sig)}">Details</button><button class="btn sm ghost" data-fb="no|${h(t.sig)}" title="Not useful — hide it">👎</button></div></div>`;
}
function bindDecide(root, list) {
  bindThemes(root, list);
  const get = s => list.find(t => t.sig === s);
  root.querySelectorAll('[data-plan]').forEach(b => b.onclick = async () => { await LabPlan.add(get(b.dataset.plan)); UI.toast('Added to the quick win plan', 'good'); LabUI.go(location.hash.slice(1) || LabUI.page); });
  root.querySelectorAll('[data-det]').forEach(b => b.onclick = () => { const t = get(b.dataset.det); UI.modal({ title: t.name, wide: true, body: themeCard(t, list.indexOf(t), { allDrafts: true }).replace('<section class="card lab-idea', '<section class="lab-idea nob'), actions: '<span class="grow"></span><button class="btn" data-c>Close</button>', onMount: w => { w.querySelector('[data-c]').onclick = UI.closeModal; bindThemes(w, list); w.querySelectorAll('[data-copy]').forEach(c => c.onclick = () => { App.copyText(c.dataset.copy); UI.toast('Copied — paste it into MAHAM', 'good'); }); } }); });
}
Object.assign(LabPages, {
  async decide(prog) {
    const res = await LabFinder.run(prog); await LabPlan.load();
    const qw = LabFinder.topQuickWins(res, 10), other = LabFinder.topOther(res, 10); const list = [...qw, ...other];
    const resolved = res.themes.filter(t => t.label === 'addressed').length, quiet = res.themes.filter(t => !t.hidden && t.recentN === 0 && t.label !== 'addressed').length;
    const save = U.sum(qw.map(t => t.saving)); const planN = Object.values(LabPlan.data).filter(p => p.status !== 'Done' && p.status !== 'Dropped').length;
    return { html: `<div class="kpis k4">${UI.kpi('Quick wins to consider', qw.length, `≈ ${LabUI.hrs(save)} a month could be saved`, 'sc-a')}${UI.kpi('Bigger ideas', other.length, 'projects, training, EHR fixes')}${UI.kpi('Left out', resolved + quiet, `${resolved} resolved / quiet · ${quiet} not seen lately`)}${UI.kpi('In your plan', planN, '<a href="#plan" data-goto="plan" class="link">open the plan →</a>')}</div>
      <div class="page-actions"><span class="small muted">Ranked for a decision: hours a month a fix would save × how sure the Lab is ÷ how big the fix is. Themes that are resolved, quiet, routine or only seen once are left out. ＋ Plan puts an idea in your quick win plan.</span><span class="grow"></span>${xlBtn('Top 10 lists')}</div>
      ${card('⚡ Top 10 quick wins to work on', qw.length ? qw.map((t, i) => decideRow(t, i, 'qw')).join('') : empty('No quick wins found in this period.'))}
      ${card('💡 Top 10 bigger ideas — project, training or EHR fix', other.length ? other.map((t, i) => decideRow(t, i, 'other')).join('') : empty('No bigger ideas found.'))}`,
      mount(root) { bindDecide(root, list); },
      sheets: () => [Object.assign(themeSheet(qw), { name: 'Top 10 quick wins' }), Object.assign(themeSheet(other), { name: 'Top 10 bigger ideas' })] };
  },
  async plan() {
    const P = await LabPlan.load(); const rows = Object.entries(P).sort((a, b) => LabPlan.ST.indexOf(a[1].status) - LabPlan.ST.indexOf(b[1].status) || b[1].saving - a[1].saving);
    const open = rows.filter(([, p]) => p.status === 'To do' || p.status === 'In progress');
    return { html: `<div class="kpis k4">${UI.kpi('To do', rows.filter(([, p]) => p.status === 'To do').length, '')}${UI.kpi('In progress', rows.filter(([, p]) => p.status === 'In progress').length, '')}${UI.kpi('Done', rows.filter(([, p]) => p.status === 'Done').length, '', 'sc-a')}${UI.kpi('Could save', LabUI.hrs(U.sum(open.map(([, p]) => p.saving || 0))), 'a month, open items')}</div>
      <div class="page-actions"><span class="small muted">Your shortlist of quick wins to work on, kept in this browser. Copy the draft into MAHAM when you start one. When it's done, use "Did the fix work?" to see the effect.</span><span class="grow"></span>${xlBtn('Quick win plan')}</div>
      ${rows.length ? card('Quick win plan', rows.map(([sig, p]) => `<div class="lab-row"><div class="grow"><div class="lab-row-t"><b>${h(p.name)}</b> <span class="muted small">≈ ${LabUI.hrs(p.saving)} a month</span></div><div class="small muted">${h(p.evidence || '')} · added ${U.fmtDate(U.ds(new Date(p.added)))}</div>
        <div class="row-btns tight"><select data-pst="${h(sig)}">${LabPlan.ST.map(s => `<option ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select><input data-pown="${h(sig)}" placeholder="who" value="${h(p.owner || '')}" style="width:140px"><input data-pnote="${h(sig)}" placeholder="note" value="${h(p.note || '')}" style="flex:1"></div></div>
        <div class="lab-row-b"><button class="btn sm" data-copy="${h(p.draft || '')}">Copy draft</button><button class="btn sm ghost" data-pdel="${h(sig)}" title="Remove from the plan">✕</button></div></div>`).join('')) : empty('Nothing planned yet — use ＋ Plan on the Decide screen.')}`,
      mount(root) {
        const upd = async (sig, k, v) => { LabPlan.data[sig][k] = v; await LabPlan.save(); };
        root.querySelectorAll('[data-pst]').forEach(s => s.onchange = async () => { await upd(s.dataset.pst, 'status', s.value); if (s.value === 'Done') await upd(s.dataset.pst, 'doneAt', Date.now()); LabUI.go(location.hash.slice(1) || LabUI.page); });
        root.querySelectorAll('[data-pown]').forEach(s => s.onchange = () => upd(s.dataset.pown, 'owner', s.value));
        root.querySelectorAll('[data-pnote]').forEach(s => s.onchange = () => upd(s.dataset.pnote, 'note', s.value));
        root.querySelectorAll('[data-pdel]').forEach(b => b.onclick = async () => { delete LabPlan.data[b.dataset.pdel]; await LabPlan.save(); LabUI.go(location.hash.slice(1) || LabUI.page); });
      },
      sheets: () => [{ name: 'Quick win plan', rows: [['Idea', 'Status', 'Who', 'Note', 'Hours a month', 'Evidence', 'Draft'], ...rows.map(([, p]) => [p.name, p.status, p.owner, p.note, p.saving, p.evidence, p.draft])] }] };
  },
  /* all themes as one compact table */
  async themes(prog) {
    const res = await LabFinder.run(prog); const s = ps('labthemes'); await LabPlan.load();
    let l = res.themes.filter(t => s.hidden ? t.hidden : !t.hidden); if (s.label) l = l.filter(t => t.label === s.label); if (s.src) l = l.filter(t => t.bySrc[s.src]);
    const n = k => res.themes.filter(t => !t.hidden && t.label === k).length; const lim = s.all ? l.length : 30;
    return { html: `<div class="page-actions"><div class="pm-seg">${[['', 'All'], ...Object.keys(LabFinder.LABELS).map(k => [k, LabFinder.LABELS[k][0]])].map(([k, lab]) => `<button class="btn sm ${(s.label || '') === k ? 'primary' : 'ghost'}" data-lab="${k}">${lab} <span class="count">${k ? n(k) : res.themes.filter(t => !t.hidden).length}</span></button>`).join('')}</div></div>
      <div class="page-actions"><label class="flt"><span>Source</span><select id="tsrc"><option value="">any</option>${Object.keys(LabData.SOURCES).map(k => `<option value="${k}" ${s.src === k ? 'selected' : ''}>${h(LabData.label(k))}</option>`).join('')}</select></label><label class="flt tog"><input type="checkbox" id="thid" ${s.hidden ? 'checked' : ''}> Hidden (${res.themes.filter(t => t.hidden).length})</label><span class="grow"></span><button class="btn sm" id="tsnap">🗂 Save snapshot</button>${xlBtn('All themes')}</div>
      ${card('', `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>#</th><th>Theme</th><th>Type</th><th class="num">Records</th><th>Sources</th><th class="num">Hours / month</th><th>Trend</th><th>Sure</th><th>Last seen</th><th></th></tr></thead><tbody>${l.slice(0, lim).map((t, i) => `<tr><td>${i + 1}</td><td><b>${h(t.name)}</b><div class="small muted">${h(t.keys)}</div></td><td>${LabUI.label(t.label)}</td><td class="num">${t.items.length}</td><td class="nw">${srcChips(t)}</td><td class="num">${LabUI.hrs(t.perMonth)}</td><td class="nw">${LabUI.spark(t.series, 70, 22)}</td><td>${h(t.confLevel)}</td><td class="nw">${U.fmtDate(t.last)}</td><td class="nw"><button class="btn xs" data-det="${h(t.sig)}">Details</button> ${LabPlan.has(t.sig) ? '<span class="badge good">plan</span>' : `<button class="btn xs ghost" data-plan="${h(t.sig)}">＋</button>`} <button class="btn xs ghost" data-merge="${h(t.sig)}" title="Merge with another">⇆</button> <button class="btn xs ghost" data-split="${h(t.sig)}" title="Split by a word">✂</button> <button class="btn xs ghost" data-fb="no|${h(t.sig)}" title="Not useful">👎</button></td></tr>`).join('')}</tbody></table></div>${l.length > lim ? `<p class="small"><a href="#" class="link" id="tall">Show all ${l.length}</a></p>` : ''}${s.hidden && l.length ? '<p class="small"><a href="#" class="link" id="unhide">Show all hidden themes again</a></p>' : ''}`)}`,
      mount(root) { bindDecide(root, l); root.querySelectorAll('[data-lab]').forEach(b => b.onclick = () => { s.label = b.dataset.lab; s.all = false; LabUI.go('themes'); }); root.querySelector('#tsrc').onchange = e => { s.src = e.target.value; LabUI.go('themes'); }; root.querySelector('#thid').onchange = e => { s.hidden = e.target.checked; LabUI.go('themes'); };
        root.querySelector('#tsnap').onclick = async () => { const k = await LabFinder.saveSnapshot(res.themes.filter(t => !t.hidden)); UI.toast('Snapshot saved for ' + k, 'good'); };
        const a = root.querySelector('#tall'); if (a) a.onclick = e => { e.preventDefault(); s.all = true; LabUI.go('themes'); };
        const u = root.querySelector('#unhide'); if (u) u.onclick = async e => { e.preventDefault(); LabFinder.feedback.notUseful = {}; await LabFinder.saveFeedback(); LabFinder.clear(); LabUI.go('themes'); }; },
      sheets: () => [themeSheet(l)] };
  },
});
LabPages.overview = LabPages.decide; LabPages.ideas = LabPages.decide;
