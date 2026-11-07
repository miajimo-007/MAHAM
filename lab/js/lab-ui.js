/* MAHAM Lab — screen frame: connect / sign-in screens, top bar, left menu, small charts, Excel export, copy. */
'use strict';

const LabUI = {
  page: 'decide',
  NAV: [
    ['decide', '🎯', 'Decide — top 10s'], ['plan', '📝', 'Quick win plan'], ['themes', '🔎', 'All themes'],
    ['_', '', 'Follow up'], ['fixcheck', '📉', 'Did the fix work?'], ['snapshots', '🗂', 'Snapshots'],
    ['_', '', 'Models'], ['tagger', '🏷', 'Auto-tagger'],
    ['_', '', 'Help desk'], ['forecast', '📈', 'Forecast'], ['spikes', '⚡', 'Spikes'], ['ttc', '⏱', 'Time to close'], ['repeats', '🔁', 'Repeat requesters'], ['linked', '🔗', 'Linked spikes'],
    ['_', '', 'People (super admin only)'], ['risk', '⚠', 'Late-risk'], ['best', '🙋', 'Best person'], ['workload', '⚖', 'Workload vs lateness'], ['skills', '🧩', 'Skills'], ['fair', '📊', 'Fair assignment'],
    ['_', '', 'Data'], ['health', '🧹', 'Data health'], ['dupes', '📋', 'Duplicates'],
    ['_', '', ''], ['settings', '⚙', 'Settings'], ['report', '🖨', 'Lab report'],
  ],
  screen(html) { document.body.className = 'lab-pre'; UI.$('#app').innerHTML = `<div class="lab-login"><div class="lab-login-card"><div class="lab-logo">💡</div>${html}</div><p class="lab-login-foot">MAHAM Lab · read-only · ${h(LAB_VERSION)}</p></div>`; },
  shell() {
    document.body.className = 'lab';
    const S = Lab.settings; const teams = Store.teams();
    const sup = App.isSuper(); let inPeople = false;
    const nav = LabUI.NAV.filter(([k, , l]) => { if (k === '_') inPeople = /^People/.test(l); return sup || !(inPeople || LabUI.PEOPLE.includes(k)); });
    UI.$('#app').innerHTML = `<aside class="lab-side"><div class="lab-brand">💡 <b>MAHAM Lab</b><div class="small">read-only · ${h(LAB_VERSION)}</div></div><nav id="labnav">${nav.map(([k, i, l]) => k === '_' ? (l ? `<div class="nav-g">${h(l)}</div>` : '<div class="nav-sep"></div>') : `<a href="#${k}" data-lp="${k}"><span class="ni">${i}</span>${h(l)}</a>`).join('')}</nav>
      <div class="lab-me small">👤 ${h(Store.memberShort(App.me))} · ${sup ? 'super admin' : 'Lab access'}<br><a href="#" class="link" id="labout">Sign out</a></div></aside>
      <div class="lab-main"><header class="lab-top"><h1 id="labtitle">Lab</h1><span class="grow"></span>
        <span class="badge good" title="The shared folder is opened with read permission only — nothing can be changed">🔒 read-only</span>
        <span class="small muted" id="labloaded"></span><button class="btn sm" id="labreload">↻ Reload data</button><a class="btn sm ghost" href="#more/settings" title="Settings">⚙</a>
        <label class="flt"><span>Period</span><select id="labmonths">${[3, 6, 12].map(m => `<option value="${m}" ${+S.months === m ? 'selected' : ''}>last ${m} months</option>`).join('')}</select></label>
        <label class="flt"><span>Team</span><select id="labteam"><option value="">All teams</option>${teams.map(t => `<option value="${h(t.id)}" ${S.team === t.id ? 'selected' : ''}>${h(t.name)}</option>`).join('')}</select></label></header>
        <main id="labbody"></main></div>`;
    UI.$('#labreload').onclick = async () => { LabUI.busy('Reading the shared folder…'); await Lab.load(); LabUI.invalidate(); LabUI.go(location.hash.slice(1) || LabUI.page); UI.toast('Data reloaded', 'good'); };
    UI.$('#labmonths').onchange = async e => { await Lab.saveSettings({ months: +e.target.value }); LabUI.invalidate(); LabUI.go(location.hash.slice(1) || LabUI.page); };
    UI.$('#labteam').onchange = async e => { await Lab.saveSettings({ team: e.target.value }); LabUI.invalidate(); LabUI.go(location.hash.slice(1) || LabUI.page); };
    UI.$('#labout').onclick = e => { e.preventDefault(); try { sessionStorage.removeItem('maham.lab.me'); } catch (err) { /* */ } location.reload(); };
    window.onhashchange = () => LabUI.go(location.hash.slice(1) || 'month');
    LabUI.go(location.hash.slice(1) || 'month');
  },
  PEOPLE: ['risk', 'best', 'workload', 'skills', 'fair'],
  invalidate() { LabCache.clear(); LabFinder.clear(); LabTagger._m = {}; LabText._typo = null; LabData.reset(); if (typeof LabSmart !== 'undefined') try { LabSmart.buildTypos(); LabData.reset(); } catch (e) { console.warn(e); } },
  busy(msg, p) { const b = UI.$('#labbody'); if (b) b.innerHTML = `<div class="lab-busy"><div class="spin"></div><p>${h(msg)}</p>${p != null ? `<div class="bar"><i style="width:${Math.round(p * 100)}%"></i></div>` : ''}</div>`; },
  async go(page) {
    if (!LabPages[page] || (!App.isSuper() && LabUI.PEOPLE.includes(page))) page = 'decide'; LabUI.page = page;
    document.querySelectorAll('#labnav a').forEach(a => a.classList.toggle('on', a.dataset.lp === page));
    const t = (LabUI.NAV.find(n => n[0] === page) || [])[2] || 'Lab'; UI.$('#labtitle').textContent = t; document.title = 'MAHAM Lab — ' + t;
    UI.$('#labloaded').textContent = Lab.loadedAt ? 'data read ' + new Date(Lab.loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    try {
      const r = await LabPages[page]((p, m) => LabUI.busy(m || 'Working…', p));
      if (LabUI.page !== page) return;
      const body = UI.$('#labbody'); body.innerHTML = r.html; if (r.mount) r.mount(body);
      body.querySelectorAll('[data-xl]').forEach(b => b.onclick = () => LabUI.excel(b.dataset.xl, r.sheets ? r.sheets() : []));
      body.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => { App.copyText(b.dataset.copy); UI.toast('Copied — paste it into MAHAM', 'good'); });
      body.querySelectorAll('[data-goto]').forEach(b => b.onclick = e => { e.preventDefault(); location.hash = b.dataset.goto; });
    } catch (e) { console.error(e); UI.$('#labbody').innerHTML = `<div class="card"><p class="t-bad">Something went wrong on this screen.</p><pre class="small">${h(e.stack || e)}</pre></div>`; }
  },
  async excel(name, sheets) { if (!sheets.length) return UI.toast('Nothing to export', 'warn'); XL.download(await XL.write(sheets), `MAHAM Lab - ${name} ${U.todayStr()}.xlsx`); },
  /* ---------- small charts (SVG) ---------- */
  spark(vals, w = 110, hh = 26) {
    if (!vals || !vals.length) return ''; const mx = Math.max(1, ...vals); const step = vals.length > 1 ? w / (vals.length - 1) : w;
    const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(hh - 2 - (v / mx) * (hh - 4)).toFixed(1)}`).join(' ');
    return `<svg class="spark" width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  },
  /* history line + forecast band */
  fcChart(vals, fc, labels) {
    const W = 520, H = 150, P = 26; const all = [...vals, ...(fc || []).map(x => x.hi)]; const mx = Math.max(1, ...all); const n = vals.length + (fc ? fc.length : 0);
    const X = i => P + (i * (W - 2 * P)) / Math.max(1, n - 1), Y = v => H - P - (v / mx) * (H - 2 * P);
    const hist = vals.map((v, i) => `${X(i)},${Y(v)}`).join(' ');
    let band = '', line = '';
    if (fc && fc.length) { const s = vals.length - 1; const top = [[s, vals[s]], ...fc.map((x, i) => [s + 1 + i, x.hi])], bot = [[s, vals[s]], ...fc.map((x, i) => [s + 1 + i, x.lo])].reverse(); band = `<polygon points="${[...top, ...bot].map(([i, v]) => `${X(i)},${Y(v)}`).join(' ')}" fill="currentColor" opacity=".12"/>`; line = `<polyline points="${[[s, vals[s]], ...fc.map((x, i) => [s + 1 + i, x.f])].map(([i, v]) => `${X(i)},${Y(v)}`).join(' ')}" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4"/>`; }
    const ticks = labels ? [0, Math.floor(vals.length / 2), vals.length - 1].map(i => `<text x="${X(i)}" y="${H - 6}" font-size="10" text-anchor="middle" fill="#64748b">${h(labels[i] || '')}</text>`).join('') : '';
    return `<svg class="fc" viewBox="0 0 ${W} ${H}" width="100%" height="${H}"><line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" stroke="#e2e8f0"/><text x="4" y="${Y(mx) + 4}" font-size="10" fill="#64748b">${Math.round(mx)}</text>${band}<polyline points="${hist}" fill="none" stroke="currentColor" stroke-width="2"/>${line}${ticks}</svg>`;
  },
  bars(series, months) { const mx = Math.max(1, ...series); return `<div class="lab-bars">${series.map((v, i) => `<div title="${h(months[i])}: ${v}"><i style="height:${Math.round((v / mx) * 100)}%"></i><span>${h(U.MONTHS[+months[i].slice(5, 7) - 1].slice(0, 3))}</span></div>`).join('')}</div>`; },
  pct(v, d = 0) { return v == null ? '–' : U.num(v * 100, d) + '%'; },
  hrs(v) { return v == null ? '–' : v < 10 ? U.num(v, 1) + ' h' : Math.round(v) + ' h'; },
  label(k) { const [t, kind] = LabFinder.LABELS[k] || [k, '']; return `<span class="badge ${kind}">${t}</span>`; },
  who(id) { return h(Store.memberShort(id) || id || ''); },
};
