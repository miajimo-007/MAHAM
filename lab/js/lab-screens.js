/* MAHAM Lab — the four screens: This month · Quick wins · Ask the Lab · More (everything else, one click away). */
'use strict';

LabUI.NAV = [['month', '🏠', 'This month'], ['qw', '⚡', 'Quick wins'], ['ask', '🔎', 'Ask the Lab'], ['studio', '📊', 'Studio'], ['more', '⋯', 'More']];
LabUI.page = 'month';
/* "More" holds every other view: #more/<view> */
LabUI.MORE = [
  ['Follow up', [['value', '💰', 'Value of finished fixes', 'Hours saved by quick wins already done, measured from the real drop'], ['fixcheck', '📉', 'Did the fix work?', 'Pick a problem and a date, see before and after'], ['snapshots', '🗂', 'Snapshots', 'Compare this month\'s list with last month']]],
  ['Forecast', [['outlook', '🔮', 'Outlook', 'Next month per module and department, season, workload vs leave, backlog, quick win pace, score'], ['forecast', '📈', 'Weekly forecast charts', 'Last 26 weeks and the next 4 per group'], ['accuracy', '🎯', 'How accurate is the Lab?', 'Past forecasts vs what happened, and your decisions']]],
  ['Help desk', [['spikes', '⚡', 'Unusual days', 'Days far above normal, per department or group'], ['ttc', '⏱', 'Time to close', 'Usual closing time per group'], ['repeats', '🔁', 'Repeat requesters', 'Same person / department, same problem'], ['linked', '🔗', 'Linked problems', 'Problems that rise and fall together']]],
  ['People (super admin only)', [['risk', '⚠', 'Late-risk', 'Open To Dos likely to end late, and why'], ['best', '🙋', 'Best person', 'Who solved something similar, and their load'], ['workload', '⚖', 'Workload vs lateness', 'Where lateness jumps'], ['skills', '🧩', 'Skills', 'Who knows what, from real work'], ['fair', '📊', 'Fair assignment', 'Who gets what']]],
  ['Data and tuning', [['themes', '🔎', 'All themes', 'Every problem group, with merge and split'], ['synonyms', '🔤', 'Word suggestions', 'Words that mean the same thing, typos'], ['tagger', '🏷', 'Auto-tagger', 'Suggest group / module / task type'], ['health', '🧹', 'Data health', 'How well fields are filled, odd entries'], ['dupes', '📋', 'Duplicates', 'Open records that look the same'], ['report', '🖨', 'Lab report', 'One printable page'], ['settings', '⚙', 'Settings', 'Cleaning, costs, targets, move to another PC']]],
];
LabUI.sub = '';
LabUI.go = async function (hash) {
  let [page, sub] = String(hash || '').split('/'); if (!['month', 'qw', 'ask', 'studio', 'more'].includes(page)) { sub = page; page = LabPages[page] && page !== 'decide' ? 'more' : 'month'; if (page === 'month') sub = ''; }
  const view = page === 'more' && sub ? sub : page;
  if (!LabPages[view] || (!App.isSuper() && LabUI.PEOPLE.includes(view))) return LabUI.go('more');
  LabUI.page = view; LabUI.sub = sub || '';
  document.querySelectorAll('#labnav a').forEach(a => a.classList.toggle('on', a.dataset.lp === page));
  const mt = LabUI.MORE.flatMap(g => g[1]).find(x => x[0] === view); const t = mt ? mt[2] : (LabUI.NAV.find(n => n[0] === page) || [])[2] || 'Lab';
  UI.$('#labtitle').innerHTML = mt ? `<a href="#more" class="link small" data-goto="more">← More</a> ${h(t)}` : h(t); document.title = 'MAHAM Lab — ' + t;
  UI.$('#labloaded').textContent = Lab.loadedAt ? 'data read ' + new Date(Lab.loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  UI.$('#labtitle').querySelectorAll('[data-goto]').forEach(b => b.onclick = e => { e.preventDefault(); location.hash = b.dataset.goto; });
  try {
    const r = await LabPages[view]((p, m) => LabUI.busy(m || 'Working…', p), sub);
    if (LabUI.page !== view) return;
    const body = UI.$('#labbody'); body.innerHTML = r.html; if (r.mount) r.mount(body);
    body.querySelectorAll('[data-xl]').forEach(b => b.onclick = () => LabUI.excel(b.dataset.xl, r.sheets ? r.sheets() : []));
    body.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { App.copyText(b.dataset.copy); UI.toast('Copied — paste it into MAHAM', 'good'); });
    body.querySelectorAll('[data-goto]').forEach(b => b.onclick = e => { e.preventDefault(); location.hash = b.dataset.goto; });
  } catch (e) { console.error(e); UI.$('#labbody').innerHTML = `<div class="card"><p class="t-bad">Something went wrong on this screen.</p><pre class="small">${h(e.stack || e)}</pre></div>`; }
};

/* shared bits */
const pct = v => v == null ? '–' : (v > 0 ? '+' : '') + Math.round(v * 100) + '%';
async function ready(prog) { const res = await LabFinder.run(prog); await LabPlan.load(); return res; }
function ideaRow(t, i, opts = {}) {
  const inPlan = LabPlan.has(t.sig); const bp = opts.who ? LabPeople.bestPerson(t.name + ' ' + t.keys)[0] : null;
  return `<div class="lab-row" data-sig="${h(t.sig)}"><span class="lab-rank">${i + 1}</span><div class="grow"><div class="lab-row-t"><b>${h(t.name)}</b> ${opts.label ? LabUI.label(t.label) : ''} ${confBadge(t)}${t.like != null && t.like >= 0.65 ? ' <span class="badge cat" title="Like the ideas you usually pick">★ your kind of idea</span>' : ''}</div>
    <div class="small lab-explain">${h(LabSmart.explain(t))}</div>
    <div class="lab-row-n"><span><b>≈ ${LabUI.hrs(t.saving)}</b> a month saved</span><span>⏱ ${h(t.effortTxt)}</span>${bp ? `<span>🙋 best placed: <b>${LabUI.who(bp.id)}</b> <span class="muted">(${bp.n} similar, ${bp.load} open)</span></span>` : ''}</div></div>
    <div class="lab-row-s">${LabUI.spark(t.series, 90, 28)}</div>
    <div class="lab-row-b">${inPlan ? '<span class="badge good">✓ in plan</span>' : `<button class="btn sm primary" data-plan="${h(t.sig)}"${bp ? ` data-owner="${h(Store.memberShort(bp.id))}"` : ''}>＋ Plan it</button>`}<button class="btn sm" data-det="${h(t.sig)}">Details</button>${opts.card ? `<button class="btn sm ghost" data-slide="${h(t.sig)}" title="One-page card to present">▭ Card</button>` : ''}<button class="btn sm ghost" data-fb="no|${h(t.sig)}" title="Not useful — hide it and learn">👎</button></div></div>`;
}
function bindIdeas(root, list) {
  bindDecide(root, list);
  root.querySelectorAll('[data-plan]').forEach(b => b.onclick = async () => { await LabPlan.add(list.find(t => t.sig === b.dataset.plan), b.dataset.owner); UI.toast('Added to the quick win plan', 'good'); LabUI.go(location.hash.slice(1) || LabUI.page); });
  root.querySelectorAll('[data-slide]').forEach(b => b.onclick = () => slideCard(list.find(t => t.sig === b.dataset.slide)));
}
/* a one-page card for an idea, to show the manager */
function slideCard(t) {
  const d = LabFinder.draft(t); const bp = LabPeople.bestPerson(t.name + ' ' + t.keys)[0];
  const html = `<div class="lab-slide"><div class="ls-k">QUICK WIN PROPOSAL</div><h1>${h(t.name)}</h1>
    <div class="ls-grid"><div><h3>The problem</h3><p>${h(LabSmart.explain(t).split(' → ')[0])}</p></div><div><h3>The fix</h3><p>${h(d.subject)}${d.module ? ` · module ${h(d.module)}` : ''}</p><p class="small">Effort: ${h(t.effortTxt)}${bp ? ` · suggested: ${h(Store.memberShort(bp.id))}` : ''}</p></div>
    <div><h3>Expected gain</h3><p class="ls-big">≈ ${LabUI.hrs(t.saving)} / month</p><p class="small">about ${LabUI.hrs(t.saving * 12)} a year of staff time</p></div><div><h3>Evidence</h3><p>${h(LabFinder.evidence(t))}</p>${LabUI.bars(t.series, t.months)}</div></div>
    <p class="small muted">MAHAM Lab · ${U.fmtDate(U.todayStr())} · estimates from the team's own records</p></div>`;
  UI.modal({ title: 'Card — ' + t.name, wide: true, body: html, actions: '<span class="grow"></span><button class="btn" data-c>Close</button><button class="btn primary" data-p>🖨 Print</button>', onMount: w => { w.querySelector('[data-c]').onclick = UI.closeModal; w.querySelector('[data-p]').onclick = () => { document.body.classList.add('lab-print-slide'); setTimeout(() => { window.print(); document.body.classList.remove('lab-print-slide'); }, 50); }; } });
}

Object.assign(LabPages, {
  /* =================== 🏠 THIS MONTH =================== */
  async month(prog) {
    const res = await ready(prog); LabSmart.learn(res.themes);
    const qw = LabSmart.rank(LabFinder.topQuickWins(res, 30)).slice(0, 5); const watch = LabSmart.watch(res).slice(0, 5);
    const nm = LabSmart.nextMonth(); const sea = LabSmart.seasonal(); const wl = LabSmart.workload(); const bl = LabSmart.backlog(); const pace = LabSmart.qwPace(); const val = LabSmart.value(); const fu = LabSmart.followUps();
    LabSmart.logForecast();
    const P = Object.values(LabPlan.data); const open = P.filter(p => p.status === 'To do' || p.status === 'In progress');
    const tight = wl.filter(w => w.over >= 0.25).slice(0, 2);
    const nmName = U.MONTHS[+nm.month.slice(5, 7) - 1];
    const summary = [`In the last ${Lab.settings.months} months the Lab found ${res.themes.filter(t => !t.hidden && t.label !== 'routine').length} problem groups; the top 5 quick wins could save about ${LabUI.hrs(U.sum(qw.map(t => t.saving)))} of staff time a month.`,
      nm.total ? `About ${Math.round(nm.total.f)} help desk requests are expected in ${nmName} (${Math.round(nm.total.lo)}–${Math.round(nm.total.hi)}).` : '',
      watch.length ? `${watch.length} thing${watch.length === 1 ? '' : 's'} to watch.` : 'Nothing unusual right now.',
      val.list.length ? `Finished quick wins have saved about ${LabUI.hrs(val.total)} so far.` : ''].filter(Boolean).join(' ');
    return { html: `<div class="lab-summary">📝 ${h(summary)}</div>
      ${card(`⚡ Top 5 quick wins <a href="#qw" class="link small" data-goto="qw">all 10 →</a>`, qw.length ? qw.map((t, i) => ideaRow(t, i, { who: true })).join('') : empty('No quick wins found in this period.'))}
      <div class="lab-cols3"><div>
        ${card('👀 Things to watch', watch.length ? watch.map(w => `<div class="li"><span class="lab-wi">${LabSmart.ICON[w.kind]}</span><div class="grow small">${h(w.text)}</div></div>`).join('') : empty('Nothing unusual right now.'))}
      </div><div>
        ${card(`📝 Your plan <a href="#qw/plan" class="link small" data-goto="qw/plan">open →</a>`, `<div class="lab-mini">${[['To do', 'To do'], ['In progress', 'In progress'], ['Done', 'Done']].map(([k, l]) => `<div><b>${P.filter(p => p.status === k).length}</b><span>${l}</span></div>`).join('')}<div><b>${LabUI.hrs(U.sum(open.map(p => p.saving || 0)))}</b><span>a month, open items</span></div></div>
          ${fu.length ? fu.slice(0, 4).map(f => f.r ? `<div class="li"><span>${f.r.change != null && f.r.change <= -0.3 ? '✅' : '⚠'}</span><div class="grow"><b>${h(f.p.name)}</b><div class="small muted">${f.r.change == null ? 'not enough data yet' : f.r.change <= -0.3 ? `worked — down ${Math.round(-f.r.change * 100)}% since it was done` : `no clear drop yet (${pct(f.r.change)})`}</div></div></div>` : `<div class="li"><span>⏳</span><div class="grow"><b>${h(f.p.name)}</b><div class="small muted">done — the Lab checks the effect in ${f.wait} day${f.wait === 1 ? '' : 's'}</div></div></div>`).join('') : '<p class="small muted">When a plan item is marked Done, the Lab checks 3 weeks later whether the problem dropped.</p>'}
          <div class="small">🎯 Quick wins this year: <b>${pace.year}</b> of ${pace.target} · this quarter ${pace.inQ}, heading for about <b>${pace.forecastQ}</b> (target ${pace.targetQ})${pace.forecastQ < pace.targetQ ? ' <span class="t-bad">— behind</span>' : ' <span class="t-good">— on track</span>'}</div>`)}
      </div><div>
        ${card(`🔮 ${h(nmName)} outlook <a href="#more/outlook" class="link small" data-goto="more/outlook">details →</a>`, `${nm.total ? `<div class="lab-mini"><div><b>${Math.round(nm.total.f)}</b><span>requests expected</span></div><div><b>${Math.round(nm.total.lo)}–${Math.round(nm.total.hi)}</b><span>likely range</span></div><div><b>${bl.next != null ? Math.round(bl.next) : '–'}</b><span>open items in 4 weeks (now ${bl.now})</span></div></div>` : ''}
          ${nm.groups.slice(0, 4).map(g => `<div class="li"><span class="grow">${h(g.name)}</span><b>${Math.round(g.f)}</b><span class="small ${g.f > g.last * 1.15 ? 't-bad' : g.f < g.last * 0.85 ? 't-good' : 'muted'}">${pct(g.f / Math.max(1, g.last) - 1)}</span></div>`).join('')}
          ${sea.filter(s => s.k !== 'month' && s.inDays <= 60).map(s => `<p class="small">🌙 <b>${h(s.k)}</b> starts in ${s.inDays} days (${U.fmtDate(s.start)})${s.eff != null ? ` — last time requests were <b>${pct(s.eff)}</b>` : ''}.</p>`).join('')}
          ${sea.filter(s => s.k === 'month' && Math.abs(s.eff) >= 0.1).map(s => `<p class="small">📅 Last year ${h(s.month)} was <b>${pct(s.eff)}</b> against the average month.</p>`).join('')}
          ${tight.map(w => `<p class="small">👥 Week of ${U.fmtDate(w.ws)}: <b>${pct(w.over)}</b> more requests per person${w.who.length ? ` — on leave: ${h(w.who.join(', '))}` : ''}.</p>`).join('')}`)}
      </div></div>`,
      mount(root) { bindIdeas(root, qw); } };
  },

  /* =================== ⚡ QUICK WINS =================== */
  async qw(prog, sub) {
    const res = await ready(prog); const T = LabSmart.learn(res.themes); const tab = ['top', 'matrix', 'plan', 'same', 'bigger'].includes(sub) ? sub : 'top';
    const all = LabSmart.rank(LabFinder.topQuickWins(res, 40)); const top = all.slice(0, 10);
    const tabs = `<div class="tabs">${[['top', 'Top 10'], ['matrix', 'Effort × value'], ['plan', `My plan (${Object.keys(LabPlan.data).length})`], ['same', 'Same problem?'], ['bigger', 'Bigger ideas']].map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#qw/${k}">${l}</a>`).join('')}</div>`;
    let body = '', list = top, sheets = () => [Object.assign(themeSheet(top), { name: 'Top 10 quick wins' })];
    if (tab === 'top') {
      const bun = LabSmart.bundles(all.slice(0, 20));
      body = `<div class="page-actions"><span class="small muted">Ranked by staff hours a fix saves × how sure the Lab is ÷ how big the fix is${T.ok ? ', nudged by what you usually pick' : ''}. Resolved, quiet and routine work are left out.</span><span class="grow"></span>${xlBtn('Top 10 quick wins')}</div>
        ${T.ok ? `<div class="insights"><div>🧠 Learned from your ${T.n} decisions: you tend to pick ideas that ${T.likes.filter(x => x[1] > 0).slice(0, 3).map(x => x[0]).join(', ') || '—'}${T.likes.some(x => x[1] < 0) ? `, and skip ones that ${T.likes.filter(x => x[1] < 0).slice(-2).map(x => x[0]).join(', ')}` : ''}.</div></div>` : `<div class="insights"><div>🧠 After about 6 decisions (＋ Plan it / 👎) the Lab learns what you consider a good quick win and ranks accordingly${T.n ? ` — ${T.n} so far` : ''}.</div></div>`}
        ${card('⚡ Top 10 quick wins to work on', top.length ? top.map((t, i) => ideaRow(t, i, { who: true, card: true })).join('') : empty('No quick wins found.'))}
        ${bun.length ? card('🧺 Could be fixed together', bun.map(b => `<div class="li"><div class="grow"><b>${b.items.length} ideas</b> about “${h(b.word)}”${b.where ? ' in ' + h(b.where) : ''}: ${b.items.map(t => h(t.name)).join(' · ')}<div class="small muted">one fix might cover all — about ${LabUI.hrs(U.sum(b.items.map(t => t.saving)))} a month together</div></div></div>`).join('')) : ''}`;
    } else if (tab === 'matrix') {
      const vals = all.map(t => t.saving).sort((a, b) => a - b); const mid = vals[Math.floor(vals.length / 2)] || 0;
      const box = (k, title, hint, f) => { const l = all.filter(f).slice(0, 8); return `<div class="lab-q ${k}"><h4>${title} <span class="count">${all.filter(f).length}</span></h4><p class="small muted">${hint}</p>${l.map(t => `<div class="small lab-qi" data-det="${h(t.sig)}">• <b>${h(t.name)}</b> <span class="muted">≈ ${LabUI.hrs(t.saving)}/mo · ${h(t.effortTxt)}</span></div>`).join('') || '<p class="small muted">—</p>'}</div>`; };
      body = `<p class="small muted">Value = hours a month a fix would save (split at the middle, ${LabUI.hrs(mid)}). Effort = from a similar past fix, or a guess from how spread the problem is.</p><div class="lab-matrix">
        ${box('q1', '🥇 Do first', 'valuable and quick', t => t.saving >= mid && t.effort <= 3)}${box('q2', '📅 Plan', 'valuable but bigger', t => t.saving >= mid && t.effort > 3)}${box('q3', '👍 Easy extras', 'quick, smaller gain', t => t.saving < mid && t.effort <= 3)}${box('q4', '⏸ Later', 'smaller gain, bigger fix', t => t.saving < mid && t.effort > 3)}</div>`;
      list = all;
    } else if (tab === 'plan') { const p = await LabPages.plan(); return { html: tabs + p.html, mount: p.mount, sheets: p.sheets }; }
    else if (tab === 'same') {
      const s = LabSmart.sameIdeas(res.themes); list = s.flatMap(x => [x.a, x.b]);
      body = `<p class="small muted">The Lab thinks these might be the same problem written differently. Join them and it remembers.</p>${card(`Same problem? <span class="count">${s.length}</span>`, s.length ? s.map((x, i) => `<div class="li"><div class="grow"><b>${h(x.a.name)}</b> (${x.a.items.length}) &nbsp;＋&nbsp; <b>${h(x.b.name)}</b> (${x.b.items.length})<div class="small muted">${h(x.why)}</div></div><button class="btn sm primary" data-join="${i}">Join</button><button class="btn sm ghost" data-nojoin="${i}">Not the same</button></div>`).join('') : empty('Nothing to join right now.'))}`;
      const mount = root => { bindIdeas(root, list); root.querySelectorAll('[data-join]').forEach(b => b.onclick = async () => { const x = s[+b.dataset.join]; LabFinder.feedback.merges.push([x.b.sig, x.a.sig]); await LabFinder.saveFeedback(); LabFinder.clear(); UI.toast('Joined', 'good'); LabUI.go('qw/same'); }); root.querySelectorAll('[data-nojoin]').forEach(b => b.onclick = async () => { const x = s[+b.dataset.nojoin]; (LabFinder.feedback.notSame = LabFinder.feedback.notSame || []).push([x.a.sig, x.b.sig]); await LabFinder.saveFeedback(); LabUI.go('qw/same'); }); };
      return { html: tabs + body, mount };
    } else {
      const other = LabFinder.topOther(res, 10); list = other;
      body = `<p class="small muted">Bigger than a quick win: projects, training needs, and fixes that need Central (EHR central).</p>${card('💡 Top 10 bigger ideas', other.length ? other.map((t, i) => ideaRow(t, i, { label: true, card: true })).join('') : empty('None.'))}`;
      sheets = () => [Object.assign(themeSheet(other), { name: 'Bigger ideas' })];
    }
    return { html: tabs + body, mount(root) { bindIdeas(root, list); root.querySelectorAll('.lab-qi[data-det]').forEach(el => el.style.cursor = 'pointer'); }, sheets };
  },

  /* =================== 🔎 ASK THE LAB =================== */
  async ask(prog) {
    const res = await ready(prog); const s = ps('labask'); const q = (s.q || '').trim(); const A = q ? LabAsk.answer(q, res) : null;
    const ex = ['what rose this month', 'Pharmacy last 3 months', 'order set ICU', 'this month vs last month', 'what is new', 'Emergency', ...(App.isSuper() ? [Store.memberShort((LabPeople.analysts()[0] || {}).id) || ''] : [])].filter(Boolean);
    return { html: `<div class="lab-ask"><form id="askf"><input id="askq" placeholder="Ask about a problem, a department, a period… e.g. “Pharmacy labels last 3 months”" value="${h(q)}" autocomplete="off"><button class="btn primary" type="submit">Ask</button></form>
        <div class="small">Try: ${ex.map(e => `<a href="#" class="chip" data-ex="${h(e)}">${h(e)}</a>`).join(' ')}</div></div>
      ${A ? A.html : `<div class="empty-state">Type a problem (“label not printing”), a department (“ICU”), a period (“last month”, “Q3”, “2026”), “what rose”, “what is new”, or compare (“this month vs last month”).</div>`}`,
      mount(root) { const go = v => { s.q = v; LabUI.go('ask'); }; root.querySelector('#askf').onsubmit = e => { e.preventDefault(); go(root.querySelector('#askq').value); }; root.querySelectorAll('[data-ex]').forEach(a => a.onclick = e => { e.preventDefault(); go(a.dataset.ex); }); if (A && A.mount) A.mount(root); setTimeout(() => { const i = root.querySelector('#askq'); if (i && !q) i.focus(); }, 30); },
      sheets: () => A && A.sheets ? A.sheets() : [] };
  },

  /* =================== ⋯ MORE =================== */
  async more() {
    return { html: LabUI.MORE.filter(([g]) => App.isSuper() || !/^People/.test(g)).map(([g, l]) => `<h3 class="lab-mh">${h(g)}</h3><div class="lab-tiles">${l.map(([k, i, t, d]) => `<a class="lab-tile" href="#more/${k}"><span class="lt-i">${i}</span><b>${h(t)}</b><span class="small muted">${h(d)}</span></a>`).join('')}</div>`).join('') };
  },

  /* ---------- More → Outlook ---------- */
  async outlook(prog) {
    await ready(prog); const nm = LabSmart.nextMonth(); const sea = LabSmart.seasonal(); const wl = LabSmart.workload(); const bl = LabSmart.backlog(); const pace = LabSmart.qwPace(); const sc = LabSmart.score(); const nmName = U.MONTHS[+nm.month.slice(5, 7) - 1];
    const tb = (l, w) => `<table class="tbl"><thead><tr><th>${w}</th><th class="num">Expected</th><th class="num">Range</th><th class="num">vs last 4 weeks</th></tr></thead><tbody>${l.map(g => `<tr><td>${h(g.name)}</td><td class="num"><b>${Math.round(g.f)}</b></td><td class="num">${Math.round(g.lo)}–${Math.round(g.hi)}</td><td class="num ${g.f > g.last * 1.15 ? 't-bad' : g.f < g.last * 0.85 ? 't-good' : ''}">${pct(g.f / Math.max(1, g.last) - 1)}</td></tr>`).join('')}</tbody></table>`;
    return { html: `<div class="page-actions"><span class="small muted">Help desk requests expected in ${h(nmName)}, from the weekly trend${nm.total && nm.total.season !== 1 ? ' and last year\'s same month' : ''}.</span><span class="grow"></span>${xlBtn('Outlook')}</div>
      <div class="cols2"><div>${card(`By group — ${h(nmName)}${nm.total ? ` · all: <b>${Math.round(nm.total.f)}</b> (${Math.round(nm.total.lo)}–${Math.round(nm.total.hi)})` : ''}`, tb(nm.groups, 'Group'))}${card('By department', tb(nm.depts, 'Department'))}</div>
      <div>${card('🌙 Season', sea.length ? sea.map(s => s.k === 'month' ? `<div class="li"><span class="grow">Last year ${h(s.month)} vs the average month</span><b class="${s.eff > 0.1 ? 't-bad' : s.eff < -0.1 ? 't-good' : ''}">${pct(s.eff)}</b></div>` : `<div class="li"><span class="grow"><b>${h(s.k)}</b> starts ${U.fmtDate(s.start)} (in ${s.inDays} days)</span><b>${s.eff == null ? 'no history yet' : pct(s.eff) + ' last time'}</b></div>`).join('') : empty('Needs about a year of data.'))}
        ${card('👥 Workload vs leave — next 8 weeks', wl.length ? `<table class="tbl"><thead><tr><th>Week of</th><th class="num">Requests</th><th class="num">People</th><th class="num">Per person vs normal</th><th>On leave</th></tr></thead><tbody>${wl.map(w => `<tr class="${w.over >= 0.25 ? 'hl' : ''}"><td class="nw">${U.fmtDate(w.ws)}</td><td class="num">${Math.round(w.req)}</td><td class="num">${U.num(w.avail, 1)}</td><td class="num ${w.over >= 0.25 ? 't-bad strong' : ''}">${pct(w.over)}</td><td class="small">${h(w.who.join(', '))}</td></tr>`).join('')}</tbody></table>` : empty('Not enough data.'))}
        ${card('📦 Backlog — open help desk + To Dos', `${LabUI.fcChart(bl.v, bl.fc, bl.ws.map(w => U.fmtDate(w).slice(0, 6)))}<p class="small">Now <b>${bl.now}</b> open · in 4 weeks about <b>${bl.next != null ? Math.round(bl.next) : '–'}</b>${bl.next != null ? (bl.next > bl.now * 1.1 ? ' — <span class="t-bad">growing</span>' : bl.next < bl.now * 0.9 ? ' — <span class="t-good">shrinking</span>' : ' — steady') : ''}</p>`)}
        ${card('⚡ Quick win pace', `<div class="lab-mini"><div><b>${pace.inQ}</b><span>done this quarter (Q${pace.q})</span></div><div><b>${pace.forecastQ}</b><span>expected by quarter end (target ${pace.targetQ})</span></div><div><b>${pace.year}</b><span>this year (target ${pace.target})</span></div><div><b>${pace.yearForecast}</b><span>expected by year end</span></div></div><p class="small muted">Pace: ${U.num(pace.pace, 1)} a month (average of the last 3 months). Set the yearly target in Settings.</p>`)}
        ${sc && sc.now != null ? card('🏅 Team score', `<div class="lab-mini">${sc.months.map(m => `<div><b>${m.s == null ? '–' : U.num(m.s, 1)}</b><span>${U.MONTHS[m.m - 1]}</span></div>`).join('')}<div><b>${U.num(sc.now, 1)}</b><span>this month so far</span></div></div><p class="small ${sc.now < sc.target ? 't-bad' : 't-good'}">${sc.now < sc.target ? `Below the target (${sc.target}) so far.` : `On or above the target (${sc.target}).`} ${h(Store.teamName(sc.team))}.</p>`) : ''}
      </div></div>`,
      sheets: () => [{ name: 'By group', rows: [['Group', 'Expected', 'Low', 'High'], ...nm.groups.map(g => [g.name, Math.round(g.f), Math.round(g.lo), Math.round(g.hi)])] }, { name: 'By department', rows: [['Department', 'Expected', 'Low', 'High'], ...nm.depts.map(g => [g.name, Math.round(g.f), Math.round(g.lo), Math.round(g.hi)])] }, { name: 'Workload', rows: [['Week of', 'Requests', 'People', 'Per person vs normal %', 'On leave'], ...wl.map(w => [w.ws, Math.round(w.req), w.avail, Math.round(w.over * 100), w.who.join(', ')])] }] };
  },
  /* ---------- More → Value ---------- */
  async value(prog) {
    await ready(prog); const v = LabSmart.value();
    return { html: `<div class="kpis k4">${UI.kpi('Saved so far', LabUI.hrs(v.total), 'staff time, all measured fixes', 'sc-a')}${UI.kpi('Saving now', LabUI.hrs(v.perMonth) + ' / month', '')}${UI.kpi('This year', LabUI.hrs(v.year), '')}${UI.kpi('Fixes measured', v.list.length, 'quick wins with a clear before')}</div>
      <div class="page-actions"><span class="small muted">For each finished quick win, the Lab finds the records about the same thing and compares how often they happened a month before and after. Estimates.</span><span class="grow"></span>${xlBtn('Value of fixes')}</div>
      ${card('Before and after each fix', v.list.length ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Quick win</th><th>Done</th><th class="num">Before / month</th><th class="num">After / month</th><th class="num">Change</th><th class="num">Saved so far</th></tr></thead><tbody>${v.list.map(x => `<tr><td><b>${h(x.q.qwId || '')} ${h(x.q.subject)}</b><div class="small muted">${LabUI.who(x.q.analyst)}</div></td><td class="nw">${U.fmtDate(x.d)}</td><td class="num">${U.num(x.rb, 1)}</td><td class="num">${U.num(x.ra, 1)}</td><td class="num ${x.drop >= 0.3 ? 't-good strong' : x.drop <= 0 ? 't-bad' : ''}">${pct(-x.drop)}</td><td class="num">${LabUI.hrs(x.sofar)}</td></tr>`).join('')}</tbody></table></div>` : empty('No finished quick win with enough records before it yet.'))}`,
      sheets: () => [{ name: 'Value', rows: [['QW', 'Subject', 'Done', 'Before/month', 'After/month', 'Change %', 'Saved hours so far'], ...v.list.map(x => [x.q.qwId || '', x.q.subject, x.d, Math.round(x.rb * 10) / 10, Math.round(x.ra * 10) / 10, Math.round(-x.drop * 100), Math.round(x.sofar * 10) / 10])] }] };
  },
  /* ---------- More → Accuracy ---------- */
  async accuracy(prog) {
    await ready(prog); await LabSmart.logForecast(); const a = await LabSmart.accuracy(); const nm = LabSmart.nextMonth();
    return { html: `${card('Monthly forecasts vs what happened', a.fc.length ? `<table class="tbl"><thead><tr><th>Month</th><th class="num">Forecast</th><th class="num">Actual</th><th class="num">Off by</th><th>Inside the range?</th></tr></thead><tbody>${a.fc.map(f => `<tr><td>${h(f.m)}</td><td class="num">${f.f} (${f.lo}–${f.hi})</td><td class="num">${f.a}</td><td class="num">${f.err == null ? '–' : Math.round(f.err * 100) + '%'}</td><td>${f.inside ? '✅' : '❌'}</td></tr>`).join('')}</tbody></table>` : `<p class="small muted">The Lab keeps each month's forecast (now: ${nm.total ? Math.round(nm.total.f) : '–'} for ${h(nm.month)}) and checks it when the month is over. Open the Lab at least once a month.</p>`)}
      ${card('Your decisions by confidence', Object.keys(a.cal).length ? `<table class="tbl"><thead><tr><th>Lab said</th><th class="num">Decided</th><th class="num">You planned</th></tr></thead><tbody>${['high', 'medium', 'low'].filter(k => a.cal[k]).map(k => `<tr><td>${k} confidence</td><td class="num">${a.cal[k].n}</td><td class="num">${Math.round(a.cal[k].yes / a.cal[k].n * 100)}%</td></tr>`).join('')}</tbody></table><p class="small muted">If "high" is not clearly above "low", tell me — the confidence needs tuning.</p>` : empty('No decisions yet.'))}
      ${card('Auto-tagger tests', Object.keys(a.tag).length ? Object.entries(a.tag).map(([k, l]) => `<div class="li"><span class="grow">${h(LabTagger.JOBS[k] ? LabTagger.JOBS[k].label : k)}</span>${l.slice(0, 5).map(x => `<span class="chip">${LabUI.pct(x.acc)}</span>`).join('')}</div>`).join('') : empty('Train the auto-tagger to see its scores here.'))}` };
  },
  /* ---------- More → Word suggestions ---------- */
  async synonyms(prog) {
    await ready(prog); const l = LabSmart.synonymIdeas();
    return { html: `<p class="small muted">Words that seem to mean the same thing in your data (used in the same way, rarely together), and likely typos. Accept one and the Lab treats them as the same word everywhere. Typos one letter away from a common word are already matched automatically.</p>
      ${card(`Suggestions <span class="count">${l.length}</span>`, l.length ? l.map((x, i) => `<div class="li"><div class="grow"><b>${h(x.a)}</b> ${x.typo ? '≈ (typo of)' : '≈'} <b>${h(x.b)}</b> <span class="small muted">· ${x.na} and ${x.nb} times${x.typo ? '' : ` · ${Math.round(x.s * 100)}% alike`}</span></div>${x.typo ? '<span class="badge good">matched automatically</span>' : `<button class="btn sm primary" data-syn="${i}">Same word</button>`}</div>`).join('') : empty('No suggestions.'))}`,
      mount(root) { root.querySelectorAll('[data-syn]').forEach(b => b.onclick = async () => { const x = l[+b.dataset.syn]; await LabSmart.addSynonym(x.a, x.b); UI.toast(`“${x.a}” now counts as “${x.b}”`, 'good'); LabUI.go('more/synonyms'); }); } };
  },
});

/* =================== Ask the Lab: understands simple questions =================== */
const LabAsk = {
  period(q) {
    const t = U.todayStr(), d = U.pd(t); const lc = q.toLowerCase(); let m;
    const mStart = (y, mo) => U.ds(new Date(y, mo, 1)), mEnd = (y, mo) => U.ds(new Date(y, mo + 1, 0));
    const P = [];
    const take = (re, f) => { const x = re.exec(lc); if (x) { P.push(Object.assign(f(x), { at: x.index, len: x[0].length })); } };
    take(/this month/, () => ({ from: mStart(d.getFullYear(), d.getMonth()), to: t, name: 'this month' }));
    take(/last month/, () => ({ from: mStart(d.getFullYear(), d.getMonth() - 1), to: mEnd(d.getFullYear(), d.getMonth() - 1), name: 'last month' }));
    take(/this week/, () => ({ from: LabHD.weekStart(t), to: t, name: 'this week' })); take(/last week/, () => ({ from: U.addDays(LabHD.weekStart(t), -7), to: U.addDays(LabHD.weekStart(t), -1), name: 'last week' }));
    take(/last (\d+) (month|week|day)s?/, x => ({ from: U.addDays(t, -(+x[1]) * ({ month: 30.4, week: 7, day: 1 })[x[2]]), to: t, name: x[0] }));
    take(/\bq([1-4])\s*(20\d\d)?/, x => { const y = +(x[2] || d.getFullYear()); return { from: mStart(y, (x[1] - 1) * 3), to: mEnd(y, x[1] * 3 - 1), name: 'Q' + x[1] + ' ' + y }; });
    if ((m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b\s*(20\d\d)?/.exec(lc))) { const mo = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1]); const y = +(m[2] || (mo > d.getMonth() ? d.getFullYear() - 1 : d.getFullYear())); P.push({ from: mStart(y, mo), to: mEnd(y, mo), name: U.MONTHS[mo] + ' ' + y, at: m.index, len: m[0].length }); }
    if ((m = /\b(20\d\d)\b/.exec(lc)) && !P.some(p => p.name.includes(m[1]))) P.push({ from: m[1] + '-01-01', to: m[1] + '-12-31', name: m[1], at: m.index, len: 4 });
    return P.sort((a, b) => a.at - b.at);
  },
  answer(q, res) {
    const lc = q.toLowerCase(); const periods = LabAsk.period(q); const cmp = /\bvs\b|versus|compared? (to|with)/.test(lc) && periods.length >= 2;
    let rest = lc; for (const p of periods) rest = rest.replace(lc.substr(p.at, p.len), ' ');
    const depts = [...new Set(LabData.items().map(x => x.dept).filter(Boolean))]; const groups = [...new Set(LabHD.rows().map(x => x.r.group).filter(Boolean))];
    const dept = depts.filter(d => rest.includes(d.toLowerCase())).sort((a, b) => b.length - a.length)[0] || depts.find(d => d.toLowerCase().split(/\s+/).some(w => w.length > 3 && new RegExp('\\b' + w + '\\b').test(rest)));
    const grp = groups.find(g => rest.includes(g.toLowerCase()) || rest.includes(g.toLowerCase().replace('ehr ', '')));
    const person = App.isSuper() ? Store.members().find(m => m.active !== false && [m.short, m.name, m.id].some(n => n && n.length > 2 && new RegExp('\\b' + n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(rest))) : null;
    if (dept) rest = rest.replace(dept.toLowerCase(), ' '); if (grp) rest = rest.replace(grp.toLowerCase(), ' ').replace(grp.toLowerCase().replace('ehr ', ''), ' '); if (person) [person.short, person.name, person.id].forEach(n => { if (n) rest = rest.replace(n.toLowerCase(), ' '); });
    const rising = /\b(rose|rising|rise|increas\w*|grow\w*|up|worse)\b/.test(rest), isNew = /\bnew\b/.test(rest);
    const text = rest.replace(/\b(what|which|show|me|the|in|for|of|about|is|are|did|was|were|rose|rising|rise|increased?|grow\w*|up|worse|new|vs|versus|compared?|to|with|and|problems?|requests?|issues?|top|most)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const per = periods[0] || (() => { const r = LabData.range(); return { from: r.from, to: r.to, name: `the last ${Lab.settings.months} months` }; })();
    const filt = (x, p) => x.date >= p.from && x.date <= p.to && (!dept || x.dept === dept) && (!grp || x.module === grp) && (!person || x.person === person.id) && LabFinder.PROBLEM_SRC.includes(x.src);
    const idf = LabFinder._idf; const qv = text ? LabText.vec(LabText.terms(text), idf) : null; const qw = text ? LabText.words(text) : [];
    const match = x => !qv || !qv.size || LabText.cos(qv, LabText.vec(LabText.terms(x.text), idf)) >= 0.25 || (qw.length && qw.every(w => LabText.words(x.text).includes(w)));
    const where = [dept, grp && grp.replace('EHR ', ''), person && Store.memberShort(person.id)].filter(Boolean).join(' · ');
    const themeOf = new Map(); for (const t of res.themes) for (const x of t.items) themeOf.set(x.id, t);
    // 1) compare two periods
    if (cmp) {
      const [A, B] = periods; const ia = LabData.items().filter(x => filt(x, A) && match(x)), ib = LabData.items().filter(x => filt(x, B) && match(x));
      const by = (l) => { const m = new Map(); for (const x of l) { const t = themeOf.get(x.id); const k = t ? t.sig : '_'; m.set(k, (m.get(k) || 0) + 1); } return m; }; const ma = by(ia), mb = by(ib);
      const rows = [...new Set([...ma.keys(), ...mb.keys()])].filter(k => k !== '_').map(k => ({ t: res.themes.find(t => t.sig === k), a: ma.get(k) || 0, b: mb.get(k) || 0 })).filter(r => r.t).map(r => Object.assign(r, { d: r.a - r.b })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 15);
      return { html: `<div class="lab-summary">📝 ${h(A.name)}: <b>${ia.length}</b> records${where ? ' (' + h(where) + ')' : ''} · ${h(B.name)}: <b>${ib.length}</b> → <b>${pct(ib.length ? ia.length / ib.length - 1 : null)}</b>.</div>${card('Biggest changes', rows.length ? `<table class="tbl"><thead><tr><th>Problem</th><th class="num">${h(A.name)}</th><th class="num">${h(B.name)}</th><th class="num">Change</th></tr></thead><tbody>${rows.map(r => `<tr><td>${h(r.t.name)}</td><td class="num">${r.a}</td><td class="num">${r.b}</td><td class="num ${r.d > 0 ? 't-bad' : 't-good'}">${r.d > 0 ? '+' : ''}${r.d}</td></tr>`).join('')}</tbody></table>` : empty('No difference found.'))}`, sheets: () => [{ name: 'Compare', rows: [['Problem', A.name, B.name, 'Change'], ...rows.map(r => [r.t.name, r.a, r.b, r.d])] }] };
    }
    const hits = LabData.items().filter(x => filt(x, per) && match(x));
    // 2) "what rose" / "what is new"
    if ((rising || isNew) && !text) {
      const W = LabSmart.watch(res).filter(w => w.t && (!dept || w.t.depts.includes(dept)) && (isNew ? w.kind === 'new' : ['rise', 'new', 'back'].includes(w.kind)));
      const l = res.themes.filter(t => !t.hidden && (!dept || t.depts.includes(dept)) && (isNew ? false : t.rising >= 1.25 && t.items.length >= 5)).sort((a, b) => b.rising - a.rising).slice(0, 10);
      return { html: `${W.length ? card(isNew ? '🆕 New problems' : '👀 Rising and new', W.slice(0, 8).map(w => `<div class="li"><span class="lab-wi">${LabSmart.ICON[w.kind]}</span><div class="grow small">${h(w.text)}</div></div>`).join('')) : ''}${!isNew ? card(`▲ Rising most${where ? ' — ' + h(where) : ''}`, l.length ? l.map((t, i) => ideaRow(t, i, { label: true })).join('') : empty('Nothing is clearly rising.')) : (W.length ? '' : empty('Nothing new in the last 2 weeks.'))}`, mount: root => bindIdeas(root, l) };
    }
    if (!hits.length) return { html: `<div class="lab-summary">Nothing found for “${h(q)}” in ${h(per.name)}${where ? ' (' + h(where) + ')' : ''}. Try fewer words, or another period.</div>` };
    // 3) a profile of what was asked: summary, trend, where, who, similar fixes, related problems
    const ms = LabFinder.months(per.from, per.to); const ser = ms.map(m => hits.filter(x => x.date.startsWith(m)).length);
    const cnt = (f) => { const c = {}; for (const x of hits) { const v = f(x); if (v) c[v] = (c[v] || 0) + 1; } return Object.entries(c).sort((a, b) => b[1] - a[1]); };
    const depC = cnt(x => x.dept), srcC = cnt(x => LabData.label(x.src)), grpC = cnt(x => x.src === 'helpdesk' ? x.module : '');
    const rel = [...new Set(hits.map(x => themeOf.get(x.id)).filter(Boolean))].map(t => ({ t, n: hits.filter(x => themeOf.get(x.id) === t).length })).sort((a, b) => b.n - a.n).slice(0, 6);
    const half = Math.floor(ser.length / 2); const tr = U.sum(ser.slice(0, half)) ? U.sum(ser.slice(half)) / U.sum(ser.slice(0, half)) : null;
    const bp = text ? LabPeople.bestPerson(text).slice(0, 4) : [];
    const qwv = text ? Store.all('quickwin', '*').map(r => ({ r, s: LabText.cos(qv, LabText.vec(LabText.terms([r.subject, r.impact].filter(Boolean).join(' ')), idf)) })).filter(x => x.s >= 0.25).sort((a, b) => b.s - a.s).slice(0, 4) : [];
    const hrs = U.sum(hits.map(x => x.cost || 0));
    const sum = `${hits.length} records${text ? ` about “${text}”` : ''}${where ? ` · ${where}` : ''} in ${per.name}${tr != null ? `, ${tr >= 1.25 ? 'rising' : tr <= 0.7 ? 'falling' : 'steady'}` : ''} — about ${LabUI.hrs(hrs)} of staff time.${depC[0] ? ` Most from ${depC[0][0]} (${depC[0][1]}).` : ''}${qwv[0] ? ` A similar quick win exists: ${qwv[0].r.qwId || ''} “${qwv[0].r.subject}”.` : ''}`;
    let prof = '';
    if (person && !text) { const sk = LabPeople.skills(); const g = sk.grid.find(x => x.m.id === person.id); const open = LabPeople.todos().filter(x => x.r.analyst === person.id && !x.r.finish).length + LabHD.rows().filter(x => x.mid === person.id && !x.closed).length; prof = card(`👤 ${h(Store.memberName(person.id))}`, `<div class="lab-mini"><div><b>${open}</b><span>open now (To Dos + help desk)</span></div><div><b>${hits.length}</b><span>records in ${h(per.name)}</span></div></div>${g ? `<p class="small">Strongest in: ${sk.areas.map((a, i) => [a, g.lv[i]]).filter(x => x[1] >= 3).map(x => `<span class="chip">${h(x[0])}</span>`).join(' ') || '—'}</p>` : ''}`); }
    return { html: `<div class="lab-summary">📝 ${h(sum)}</div>${prof}
      <div class="cols2"><div>${card('Per month', LabUI.bars(ser, ms).replace('lab-bars', 'lab-bars big'))}${card('Where it comes from', `${depC.slice(0, 6).map(([d, n]) => `<div class="li"><span class="grow">${h(d)}</span><b>${n}</b></div>`).join('') || '<p class="small muted">—</p>'}<p class="small muted">Sources: ${srcC.map(([s, n]) => `${h(s)} ${n}`).join(' · ')}${grpC.length ? ' · groups: ' + grpC.slice(0, 3).map(([g, n]) => `${h(g)} ${n}`).join(', ') : ''}</p>`)}</div>
      <div>${rel.length ? card('Related problems', rel.map(({ t, n }) => `<div class="li"><div class="grow"><b>${h(t.name)}</b> ${LabUI.label(t.label)}<div class="small muted">${n} of these · theme total ${t.items.length}</div></div>${LabPlan.has(t.sig) ? '<span class="badge good">in plan</span>' : `<button class="btn xs primary" data-plan="${h(t.sig)}">＋ Plan</button>`}<button class="btn xs" data-det="${h(t.sig)}">Details</button></div>`).join('')) : ''}
        ${bp.length ? card('Who has fixed this before', bp.map(b => `<div class="li"><span class="grow"><b>${LabUI.who(b.id)}</b></span><span class="small">${b.n} similar · ${b.med == null ? '' : U.num(b.med, 1) + ' days usually · '}${b.load} open now</span></div>`).join('')) : ''}
        ${qwv.length ? card('Similar quick wins', qwv.map(x => `<div class="li"><span class="grow"><b>${h(x.r.qwId || '')} ${h(x.r.subject)}</b><div class="small muted">${h(x.r.status || '')} · ${U.fmtDate(x.r.expected || x.r.date)}</div></span></div>`).join('')) : ''}
        ${card('Examples', LabFinder.samples({ items: hits }, 6).map(([s, n]) => `<div class="li"><span class="grow small">${h(s)}</span><b>${n}</b></div>`).join(''))}</div></div>`,
      mount: root => bindIdeas(root, rel.map(r => r.t)),
      sheets: () => [{ name: 'Records', rows: [['Date', 'Source', 'Text', 'Department'], ...hits.map(x => [x.date, LabData.label(x.src), x.text, x.dept])] }] };
  },
};
