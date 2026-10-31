/* DARRIK — Directory: IT contacts (with team and "Reports to" → hierarchy and org chart), hospital Users
 * (pharmacy, nursing, physicians …; departments set by the administrator) and the EMR ward contacts.
 * Everyone can look and search; editing is the Directory function's "Edit" level, which the administrator gives
 * (Admin → person / team → Functions). */
'use strict';

const DirX = {
  DEFAULT_DEPTS: ['Pharmacy', 'Nursing', 'Physicians', 'Allied health', 'Other'],
  depts() {
    const l = Store.setting('settings-userdepts', 'list', null);
    return (l && l.length ? l : DirX.DEFAULT_DEPTS).slice();
  },
  it() {
    return Store.all('itdir');
  },
  get(id) {
    return Store.get(id);
  },
  /* who reports to this contact (index rebuilt when the data changes) */
  kidsMap() {
    const all = DirX.it();
    if (DirX._km && DirX._kmOf === all) return DirX._km;
    const m = new Map();
    for (const r of all)
      if (r.reportsTo) {
        if (!m.has(r.reportsTo)) m.set(r.reportsTo, []);
        m.get(r.reportsTo).push(r);
      }
    DirX._km = m;
    DirX._kmOf = all;
    return m;
  },
  reports(id) {
    return (DirX.kidsMap().get(id) || []).slice();
  },
  /* leadership levels, read from the title (top first); everyone else is staff */
  LEVELS: [
    ['Executive Director', t => /\bexecutive director\b/.test(t) && !/deputy|associate|assistant/.test(t)],
    ['Deputy Executive Director', t => /deputy executive director/.test(t)],
    ['Associate Executive Director', t => /associate executive director/.test(t)],
    ['Director', t => /\bdirector\b/.test(t)],
    ['Manager', t => /\bmanager\b/.test(t)],
  ],
  level(r) {
    const t = r.title || '';
    DirX._lv = DirX._lv || new Map();
    if (DirX._lv.has(t)) return DirX._lv.get(t);
    const l = U.lc(t);
    const i = DirX.LEVELS.findIndex(([, f]) => f(l));
    const v = i < 0 ? 9 : i;
    DirX._lv.set(t, v);
    return v;
  },
  levelName(r) {
    const i = DirX.level(r);
    return i < 9 ? DirX.LEVELS[i][0] : '';
  },
  /* link leaders who have no manager to the nearest higher level: same section, else same department, else same region,
   * else anyone — only when exactly one person fits (otherwise left for "Set Reports to") */
  autoLink(quiet) {
    const all = DirX.it();
    const out = [];
    const unsure = [];
    const cur = id => out.find(x => x.id === id) || DirX.get(id);
    for (const r of all.filter(x => !x.reportsTo && DirX.level(x) > 0).sort((a, b) => DirX.level(a) - DirX.level(b))) {
      const L = DirX.level(r);
      let pick = null;
      for (let up = Math.min(L, DirX.LEVELS.length) - 1; up >= 0 && !pick; up--) {
        const lvl = all.filter(x => x.id !== r.id && DirX.level(x) === up);
        if (!lvl.length) continue;
        const scopes = [
          x => r.section && x.section === r.section,
          x => r.dept && x.dept === r.dept,
          x => r.region && x.region === r.region,
          () => true,
        ];
        for (const sc of scopes) {
          const c = lvl.filter(sc);
          if (c.length === 1) {
            pick = c[0];
            break;
          }
          if (c.length > 1) {
            unsure.push(r);
            break;
          }
        }
        if (pick || unsure.includes(r)) break;
      }
      if (pick && !DirX.loops(r.id, pick.id)) out.push(Object.assign({}, cur(r.id), { reportsTo: pick.id }));
    }
    if (out.length) Store.saveMany(out);
    if (!quiet || out.length || unsure.length)
      UI.toast(
        `${out.length} leader(s) linked to the level above${
          unsure.length
            ? ` · ${unsure.length} left for you (more than one possible): ${unsure
                .slice(0, 4)
                .map(x => x.name)
                .join(', ')}${unsure.length > 4 ? '…' : ''}`
            : ''
        }`,
        out.length ? 'good' : 'warn'
      );
    return out.length;
  },
  /* administrator: empty the directory (after an optional Excel copy) */
  clearDialog() {
    const n = { itdir: Store.all('itdir').length, userdir: Store.all('userdir').length, emrdir: Store.all('emrdir', '*').length };
    UI.modal({
      title: '🗑 Clear directory data',
      body: `<p>Delete every contact in the parts you tick. This cannot be undone from here — download a copy first if you may need it.</p>
      <div class="pick">${[
        ['itdir', 'IT Directory'],
        ['userdir', 'Users'],
        ['emrdir', 'EMR Directory'],
      ]
        .map(
          ([k, l]) =>
            `<label class="check"><input type="checkbox" name="clr" value="${k}" ${k === 'itdir' ? 'checked' : ''}> ${l} <span class="muted small">${n[k]} contact(s)</span></label>`
        )
        .join('')}</div>
      <form class="grid-form" id="clrf">${UI.field({ key: 'typed', label: 'Type CLEAR to confirm', type: 'text', placeholder: 'CLEAR' }, '')}</form>`,
      actions: `<button class="btn ghost" data-copy>⇩ Download a copy first</button><span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn danger" data-ok>Delete</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-copy]').onclick = async () => {
          const sheets = [];
          for (const [k, l] of [
            ['itdir', 'IT Directory'],
            ['userdir', 'Users'],
            ['emrdir', 'EMR Directory'],
          ]) {
            const l2 = Store.all(k, '*');
            if (!l2.length) continue;
            const keys = [...new Set(l2.flatMap(r => Object.keys(r).filter(x => !x.startsWith('_') && x !== 'c')))];
            sheets.push({
              name: l,
              rows: [keys, ...l2.map(r => keys.map(x => (r[x] == null ? '' : Array.isArray(r[x]) ? r[x].join(', ') : String(r[x]))))],
            });
          }
          if (!sheets.length) return UI.toast('Nothing to copy', 'warn');
          XL.download(await XL.write(sheets), `Directory copy ${U.todayStr()}.xlsx`);
        };
        w.querySelector('[data-ok]').onclick = () => {
          const which = [...w.querySelectorAll('[name=clr]:checked')].map(c => c.value);
          if (!which.length) return UI.toast('Tick what to clear', 'bad');
          if (w.querySelector('[name=typed]').value.trim() !== 'CLEAR') return UI.toast('Type CLEAR to confirm', 'bad');
          const recs = which.flatMap(k => Store.all(k, '*')).map(r => Object.assign({}, r, { _del: true }));
          Store.saveMany(recs);
          UI.closeModal();
          UI.toast(`${recs.length} contact(s) deleted`, 'good');
          App.render();
        };
      },
    });
  },
  /* manager chain, top first (stops on a loop) */
  chain(r) {
    const out = [];
    const seen = new Set([r.id]);
    let m = r.reportsTo && DirX.get(r.reportsTo);
    while (m && !seen.has(m.id)) {
      out.unshift(m);
      seen.add(m.id);
      m = m.reportsTo && DirX.get(m.reportsTo);
    }
    return out;
  },
  /* everyone under this contact (all levels) */
  under(id, seen) {
    const km = DirX.kidsMap();
    if (!seen) {
      if (DirX._uOf !== km) {
        DirX._u = new Map();
        DirX._uOf = km;
      }
      if (DirX._u.has(id)) return DirX._u.get(id);
    } // counted once per load
    const s2 = seen || new Set([id]);
    let n = 0;
    for (const r of DirX.reports(id)) {
      if (s2.has(r.id)) continue;
      s2.add(r.id);
      n += 1 + DirX.under(r.id, s2);
    }
    if (!seen) DirX._u.set(id, n);
    return n;
  },
  /* would "a reports to b" make a loop? */
  loops(aId, bId) {
    let m = bId && DirX.get(bId);
    const seen = new Set();
    while (m && !seen.has(m.id)) {
      if (m.id === aId) return true;
      seen.add(m.id);
      m = m.reportsTo && DirX.get(m.reportsTo);
    }
    return false;
  },
  managerOptions(base) {
    const me = base && base.id;
    return DirX.it()
      .filter(r => r.id !== me && !(me && DirX.loops(me, r.id)))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map(r => [r.id, `${r.name}${r.title ? ' — ' + r.title : ''}`]);
  },
  /* a DARRIK user with the same email */
  appUser(r) {
    const e = U.lc((r.email || '').trim());
    if (!e) return null;
    return Store.members().find(m => U.lc(m.email || '') === e) || null;
  },
  link(r) {
    return r ? `<a class="link" href="javascript:void 0" data-dirp="${h(r.id)}">${h(r.name)}</a>` : '';
  },
  /* the person card */
  card(id) {
    const r = DirX.get(id);
    if (!r) return;
    const ch = DirX.chain(r);
    const mgr = ch[ch.length - 1];
    const reps = DirX.reports(r.id).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const team = r.team
      ? DirX.it()
          .filter(x => x.team === r.team && x.id !== r.id)
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      : [];
    const peers = mgr ? DirX.reports(mgr.id).filter(x => x.id !== r.id) : [];
    const au = DirX.appUser(r);
    const can = App.canEdit('itdir');
    const row = (l, v) => (v ? `<div class="dc-row"><span class="muted">${l}</span><span>${v}</span></div>` : '');
    UI.modal({
      title: r.name,
      wide: true,
      body: `<p class="muted">${DirX.level(r) < 9 ? `<span class="lvl lvl${DirX.level(r)}">${h(DirX.levelName(r))}</span> ` : ''}${h(r.title || '')}${r.region ? ' · ' + h(r.region) : ''}</p>
      <div class="dc-grid">${row('Ext.', h(r.office || ''))}${row('Email', r.email && /@/.test(r.email) ? `<a class="link" href="mailto:${h(r.email.trim())}">${h(r.email.trim())}</a>` : h(r.email || ''))}${row('Badge', h(r.bn || ''))}${row('Department', h([r.dept, r.section].filter(Boolean).join(' · ')))}${row('Team', h(r.team || ''))}${(() => {
        const m = r.teamEmail ? r : DirX.chain(r).slice(-1)[0];
        return m && m.teamEmail ? row('Team email', `<a class="link" href="mailto:${h(m.teamEmail)}">${h(m.teamEmail)}</a>`) : '';
      })()}${au ? row('In DARRIK', `${h(Store.teamName(au.team || 'apps'))} · ${h(Store.titleOf(au))}`) : ''}</div>
      <h4>Chain</h4><div class="dc-chain">${ch.length ? ch.map(DirX.link).join(' › ') + ' › ' : ''}<b>${h(r.name)}</b>${!r.reportsTo ? ' <span class="muted small">(top of the chart — no manager set)</span>' : ''}</div>
      ${mgr ? `<h4>Manager</h4><div>${DirX.link(mgr)} <span class="muted small">${h(mgr.title || '')}${mgr.office ? ' · ext. ' + h(mgr.office) : ''}</span></div>` : ''}
      <div class="cols2"><div><h4>Team${r.team ? ' — ' + h(r.team) : ''} <span class="count">${team.length}</span></h4>${team.length ? team.map(x => `<div>${DirX.link(x)} <span class="muted small">${h(x.title || '')}</span></div>`).join('') : '<p class="muted small">No team set, or nobody else in it.</p>'}${peers.length ? `<h4>Same manager <span class="count">${peers.length}</span></h4>${peers.map(x => `<div>${DirX.link(x)} <span class="muted small">${h(x.title || '')}</span></div>`).join('')}` : ''}</div>
      <div><h4>Reports to ${h(r.name.split(' ')[0])} <span class="count">${reps.length}</span></h4>${reps.length ? reps.map(x => `<div>${DirX.link(x)} <span class="muted small">${h(x.title || '')}${DirX.reports(x.id).length ? ' · ' + DirX.under(x.id) + ' under' : ''}</span></div>`).join('') : '<p class="muted small">Nobody.</p>'}</div></div>`,
      actions: `${can ? '<button class="btn" data-dcedit>Edit</button>' : ''}<button class="btn ghost" data-dctree>Show in the chart</button><span class="grow"></span><button class="btn" data-c>Close</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        const e = w.querySelector('[data-dcedit]');
        if (e)
          e.onclick = () => {
            UI.closeModal();
            UI.editRecord('itdir', Store.get(r.id));
          };
        w.querySelector('[data-dctree]').onclick = () => {
          UI.closeModal();
          ps('dirtree').open = r.id;
          ps('dir').tab = 'it';
          if (location.hash === '#/directory/it') App.render();
          else location.hash = '#/directory/it';
        };
        w.querySelectorAll('[data-dirp]').forEach(
          a =>
            (a.onclick = () => {
              UI.closeModal();
              setTimeout(() => DirX.card(a.dataset.dirp), 0);
            })
        );
      },
    });
  },
  /* tick several people, give them one manager */
  bulkReports() {
    const all = DirX.it()
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    UI.modal({
      title: 'Set "Reports to" for several people',
      wide: true,
      body: `<form class="grid-form" id="brf"><div class="fld span2"><label>Their manager</label><select name="mgr"><option value="">— nobody (top of the chart) —</option>${all.map(r => `<option value="${h(r.id)}">${h(r.name)}${r.title ? ' — ' + h(r.title) : ''}</option>`).join('')}</select></div>
      <div class="fld span2"><label>People <input id="brq" placeholder="Filter by name, team, section…" style="margin-left:8px"></label><div class="pick" id="brlist">${all.map(r => `<label class="check" data-q="${h(U.lc([r.name, r.team, r.section, r.dept, r.title].join(' ')))}"><input type="checkbox" name="who" value="${h(r.id)}"> ${h(r.name)} <span class="muted small">${h([r.team, r.section].filter(Boolean).join(' · '))}${r.reportsTo && DirX.get(r.reportsTo) ? ' · now: ' + h(DirX.get(r.reportsTo).name) : ''}</span></label>`).join('')}</div></div></form>`,
      actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Save</button>`,
      onMount: w => {
        w.querySelector('#brq').oninput = e => {
          const q = U.lc(e.target.value);
          w.querySelectorAll('#brlist [data-q]').forEach(l => {
            l.style.display = !q || l.dataset.q.includes(q) ? '' : 'none';
          });
        };
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const mgr = w.querySelector('[name=mgr]').value;
          const ids = [...w.querySelectorAll('[name=who]:checked')].map(c => c.value);
          if (!ids.length) return UI.toast('Tick the people first', 'bad');
          const bad = ids.filter(id => id === mgr || (mgr && DirX.loops(id, mgr)));
          if (bad.length) return UI.toast(`That would make a loop for ${bad.map(id => DirX.get(id).name).join(', ')}`, 'bad');
          Store.saveMany(ids.map(id => Object.assign({}, DirX.get(id), { reportsTo: mgr })));
          UI.closeModal();
          UI.toast(`${ids.length} updated`, 'good');
          App.render();
        };
      },
    });
  },
  /* the place to upload: what the file needs, a template to fill in, then choose the file */
  COLS: {
    itdir: [
      ['Name', 'required'],
      ['Title', ''],
      ['Team', 'e.g. APPS, Applications'],
      ['Reports to', "the manager's badge no., email or name"],
      ['Region', ''],
      ['Department', ''],
      ['Section', ''],
      ['Badge', 'used to match people already in the list'],
      ['Ext.', ''],
      ['Email', ''],
    ],
    userdir: [
      ['Name', 'required'],
      ['Department', 'one of your departments'],
      ['Position', ''],
      ['Badge', 'used to match people already in the list'],
      ['Facility', ''],
      ['Ward', ''],
      ['Ext.', ''],
      ['Mobile', ''],
      ['Email', ''],
      ['Notes', ''],
    ],
  },
  importDialog(coll) {
    const cols = DirX.COLS[coll];
    const what = coll === 'itdir' ? 'IT contacts' : 'users';
    UI.modal({
      title: `Import ${what} from Excel`,
      wide: true,
      body: `<ol class="steps"><li><b>Download the template</b> (or use your own sheet — the first row must have these column names).</li><li>Fill one row per person and save it as <b>.xlsx</b>.</li><li><b>Choose the file</b> below — you see how many will be added or updated before anything is saved.</li></ol>
      <table class="tbl"><thead><tr><th>Column</th><th>Notes</th></tr></thead><tbody>${cols.map(([c, n]) => `<tr><td><b>${h(c)}</b></td><td class="muted small">${h(n)}</td></tr>`).join('')}</tbody></table>
      ${coll === 'itdir' ? '<div class="insights"><div><b>Your IT export works as it is:</b> a <b>0</b> row (with BN · TITLE · Office · Email) opens each team; the first name under it is the <b>manager</b>, the rest report to him. <b>Levels:</b> move a whole row one column to the right to put that person under the row above that starts further left (Executive Director › Deputy › Associate › Director › team).</div></div>' : ''}
      <p class="muted small">People already in the list are matched by badge, then email, then name, and updated — nobody is duplicated.${coll === 'userdir' ? ` Departments: ${h(DirX.depts().join(', '))}.` : ''}</p>
      <label class="dropzone" id="dimpz"><input type="file" id="dimpf" accept=".xlsx" hidden><b>⇪ Choose the Excel file</b><span class="muted small">or drop it here</span></label>`,
      actions: `<button class="btn ghost" data-tpl>⇩ Download template</button><span class="grow"></span><button class="btn" data-c>Close</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-tpl]').onclick = async () => {
          const ex =
            coll === 'itdir'
              ? [
                  'Ahmed Al-Ghamdi',
                  'System Analyst',
                  'Applications',
                  '12000',
                  'Jeddah',
                  'IT',
                  'Applications',
                  '12345',
                  '2345',
                  'name@example.org',
                ]
              : [
                  'Nora Al-Harbi',
                  DirX.depts()[0] || 'Pharmacy',
                  'Clinical pharmacist',
                  '23456',
                  'MH-J',
                  'Ward 12',
                  '5501',
                  '',
                  'name@example.org',
                  '',
                ];
          XL.download(
            await XL.write([{ name: coll === 'itdir' ? 'IT Directory' : 'Users', rows: [cols.map(c => c[0]), ex] }]),
            `${coll === 'itdir' ? 'IT Directory' : 'Users'} template.xlsx`
          );
        };
        const go = async f => {
          if (!f) return;
          UI.closeModal();
          try {
            await DirX.importXl(coll, f);
          } catch (err) {
            UI.toast('Could not read that file: ' + err.message, 'bad');
          }
        };
        w.querySelector('#dimpf').onchange = e => go(e.target.files[0]);
        const z = w.querySelector('#dimpz');
        z.ondragover = e => {
          e.preventDefault();
          z.classList.add('over');
        };
        z.ondragleave = () => z.classList.remove('over');
        z.ondrop = e => {
          e.preventDefault();
          go(e.dataTransfer.files[0]);
        };
      },
    });
  },
  /* Excel import: match by badge, then email, then name; "Reports to" may be a badge, an email or a name */
  async importXl(coll, file) {
    const sheets = await XL.read(file);
    let rows = ((sheets.find(s => s.rows && s.rows.length) || {}).rows || []).map(r =>
      (r || []).map(x => String(x == null ? '' : x).trim())
    );
    // IT: a row moved to the right (indented) sits one level under the nearest row above it that starts further left
    let inds = rows.map(() => 0);
    if (
      coll === 'itdir' &&
      rows.some(r => {
        const i = r.findIndex(Boolean);
        return i > 0 && (/^0+$/.test(r[i]) || /[a-z\u0600-\u06ff]/i.test(r[i]));
      })
    ) {
      inds = rows.map(r => Math.max(0, r.findIndex(Boolean)));
      rows = rows.map((r, k) => r.slice(inds[k]));
    }
    if (!rows.length) return UI.toast('No rows found in that file', 'bad');
    const MAP =
      coll === 'itdir'
        ? {
            name: ['name', 'employee name', 'full name', 'employee'],
            title: ['title', 'job title', 'position'],
            region: ['region'],
            dept: ['department', 'dept'],
            section: ['section'],
            team: ['team'],
            bn: ['badge', 'badge no', 'badge no.', 'badge number', 'bn'],
            office: ['ext', 'ext.', 'extension', 'office', 'office / ext.'],
            email: ['email', 'e-mail', 'mail'],
            reportsTo: ['reports to', 'manager', 'reports to (badge or email)'],
          }
        : {
            name: ['name', 'full name'],
            dept: ['department', 'dept'],
            position: ['position', 'title', 'job title'],
            bn: ['badge', 'badge no', 'badge no.', 'badge number', 'bn'],
            facility: ['facility', 'hospital'],
            ward: ['ward', 'unit', 'ward / unit'],
            ext: ['ext', 'ext.', 'extension'],
            mobile: ['mobile', 'phone', 'mobile no'],
            email: ['email', 'e-mail'],
            notes: ['notes', 'note'],
          };
    // the team-block layout (IT): names in the first column; a row starting with 0 opens each team and carries that
    // block's headings (BN, TITLE, Office, "Email: team@…"); unlabeled columns are read by their values
    const blocks = coll === 'itdir' && rows.some(r => /^0+$/.test(r[0] || ''));
    let hi = blocks ? -1 : rows.slice(0, 10).findIndex(r => r.some(x => MAP.name.includes(U.lc(x))));
    const col = {};
    let bHead = null; // headings of the current block: index → field
    const REGIONS = ['central', 'jeddah', 'madinah', 'dammam', 'al ahsa', 'alahsa', 'makkah', 'taif', 'qassim', 'hofuf', 'wr', 'cr', 'er'];
    const firstHead = rows.find(r => /^0+$/.test(r[0] || '') && r.some((x, i) => i > 0 && /^(bn|badge|title|office|e-?mail)/i.test(x)));
    const headOf = row => {
      const m = {};
      let tEmail = '';
      row.forEach((x, i) => {
        const l = U.lc(x);
        if (!l || i === 0) return;
        const em = /[\w.+-]+@[\w.-]+\.\w+/.exec(x);
        if (/^e-?mail/.test(l)) {
          m[i] = 'email';
          if (em) tEmail = em[0];
        } else if (/^(bn|badge)/.test(l)) m[i] = 'bn';
        else if (/^(title|position|job)/.test(l)) m[i] = 'title';
        else if (/^(office|ext)/.test(l)) m[i] = 'office';
        else if (/^region/.test(l)) m[i] = 'region';
        else if (/^(dept|department)/.test(l)) m[i] = 'dept';
        else if (/^section/.test(l)) m[i] = 'section';
        else if (/^team/.test(l)) m[i] = 'team';
        else if (/^(reports|manager)/.test(l)) m[i] = 'reportsTo';
      });
      return { m, tEmail };
    };
    const blockRow = row => {
      if (!bHead && firstHead) bHead = headOf(firstHead); // leaders above the first team: same columns as the first block's headings
      const v = { name: (row[0] || '').replace(/\s+/g, ' ').trim() };
      const free = [];
      row.forEach((x, i) => {
        if (i === 0) return;
        const s = (x || '').replace(/\s+/g, ' ').trim();
        if (!s) return;
        const k = bHead && bHead.m[i];
        if (k) {
          if (!v[k]) v[k] = s;
          return;
        }
        if (U.lc(s) === U.lc(v.name)) return;
        if (REGIONS.includes(U.lc(s))) {
          v.region = v.region || s;
          return;
        }
        if ((s.match(/ - /g) || []).length >= 2) return;
        free.push(s);
      });
      if (free[0] && !v.dept) v.dept = free[0];
      if (free[1] && !v.section) v.section = free[1];
      return v;
    };
    if (blocks) col.name = 0;
    else if (hi >= 0) {
      const head = rows[hi].map(U.lc);
      for (const [k, names] of Object.entries(MAP)) {
        const i = head.findIndex(x => names.includes(x));
        if (i >= 0) col[k] = i;
      }
    } else {
      const width = Math.max(...rows.map(r => r.length));
      let best = 0,
        bn = -1;
      for (let i = 0; i < width; i++) {
        const n = rows.filter(r => /[a-z؀-ۿ]/i.test(r[i] || '')).length;
        if (n > bn) {
          bn = n;
          best = i;
        }
      }
      col.name = best;
      hi = -1;
    }
    const body = rows.slice(hi + 1);
    const bInd = inds.slice(hi + 1);
    // "0" rows split the sheet into teams: the first name after a 0 is the manager, the names under him report to him
    const isSep = r => /^0+$/.test(r[col.name] || '') || (!r[col.name] && r.some(x => /^0+$/.test(x)) && r.filter(Boolean).length === 1);
    const teamOf = s => (s || '').replace(new RegExp('\\s*-\\s*(' + REGIONS.join('|') + ')\\s*$', 'i'), '').trim();
    const grouped = coll === 'itdir' && body.some(isSep);
    const cur = Store.all(coll);
    const same = (a, b) => U.lc((a || '').replace(/\s+/g, ' ')) === U.lc((b || '').replace(/\s+/g, ' '));
    const find = (list, v) => {
      const x = U.lc(String(v || '').trim());
      if (!x) return null;
      return (
        list.find(r => U.lc(r.bn || '') === x) ||
        list.find(r => U.lc((r.email || '').trim()) === x) ||
        list.find(r => same(r.name, v)) ||
        null
      );
    };
    const out = [];
    let added = 0,
      updated = 0;
    const pendingMgr = [];
    const groups = [];
    let g = null;
    const stack = [];
    const parentOf = [];
    let blockInd = -1; // indented layout: people above, by indent
    const above = ind => {
      for (let k = stack.length - 1; k >= 0; k--) if (stack[k].ind < ind) return stack[k].rec;
      return null;
    };
    for (let ri = 0; ri < body.length; ri++) {
      const row = body[ri];
      const ind = bInd[ri] || 0;
      if (grouped && isSep(row)) {
        g = null;
        blockInd = ind;
        while (stack.length && stack[stack.length - 1].ind >= ind) stack.pop();
        if (blocks) bHead = headOf(row);
        continue;
      }
      const v = blocks ? blockRow(row) : {};
      if (!blocks)
        for (const [k, i] of Object.entries(col)) {
          const s = (row[i] || '').replace(/\s+/g, ' ').trim();
          if (s) v[k] = s;
        }
      if (!v.name || /^0+$/.test(v.name)) continue;
      const mgrRef = v.reportsTo;
      delete v.reportsTo;
      const b = U.lc(v.bn || ''),
        e = U.lc(v.email || '');
      const ex =
        out.find(r => (b && U.lc(r.bn || '') === b) || (e && U.lc((r.email || '').trim()) === e) || same(r.name, v.name)) ||
        cur.find(r => (b && U.lc(r.bn || '') === b) || (e && U.lc((r.email || '').trim()) === e) || same(r.name, v.name));
      let rec;
      if (ex) {
        rec = Object.assign({}, ex, v);
        const i = out.indexOf(ex);
        if (i >= 0) out[i] = rec;
        else {
          out.push(rec);
          updated++;
        }
      } else {
        rec = Object.assign({ c: coll, id: U.uid(coll) }, v);
        out.push(rec);
        added++;
      }
      if (grouped && blockInd >= 0 && ind < blockInd) {
        g = null;
        blockInd = -1;
      } // a row further left than the team: a leader, the team is over
      if (grouped && blockInd >= 0 && ind <= blockInd) {
        if (!g) {
          g = { mgr: rec, members: [], team: v.team || teamOf(v.section) || '', teamEmail: (bHead && bHead.tEmail) || '' };
          groups.push(g);
          if (g.teamEmail) rec.teamEmail = g.teamEmail;
          const up = above(ind);
          if (up && up.id !== rec.id) parentOf.push([rec, up]);
          stack.push({ ind, rec });
        } else g.members.push(rec);
      } else if (ind > 0 || stack.length) {
        // a leader row (Executive Director › Deputy › …), or someone indented under a team member
        while (stack.length && stack[stack.length - 1].ind >= ind) stack.pop();
        const up = stack.length ? stack[stack.length - 1].rec : null;
        if (up && up.id !== rec.id) parentOf.push([rec, up]);
        stack.push({ ind, rec });
      } else stack.push({ ind, rec });
      if (mgrRef) pendingMgr.push([rec, mgrRef]);
    }
    if (!out.length) return UI.toast('No names found in that file', 'bad');
    if (coll === 'userdir') {
      const known = new Set(DirX.depts().map(U.lc));
      const newD = [...new Set(out.map(r => r.dept).filter(d => d && !known.has(U.lc(d))))];
      if (newD.length) {
        for (const r of out) if (r.dept && !known.has(U.lc(r.dept))) r.dept = 'Other';
        UI.toast(`Unknown department(s) set to "Other": ${newD.join(', ')} — add them in Admin → Lists & scoring`, 'warn');
      }
    }
    const latest = id => out.find(r => r.id === id) || id;
    for (const [rec, up] of parentOf) {
      const r = latest(rec.id);
      if (r.id !== up.id && !DirX.loops(r.id, up.id)) r.reportsTo = up.id;
    }
    let noMgr = 0;
    for (const [rec, ref] of pendingMgr) {
      const m = find([...out, ...cur], ref);
      if (m && m.id !== rec.id && !DirX.loops(rec.id, m.id)) latest(rec.id).reportsTo = m.id;
      else noMgr++;
    }
    const save = () => {
      Store.saveMany(out);
      UI.toast(`${added} added · ${updated} updated`, 'good');
      if (coll === 'itdir') DirX.autoLink(true);
      App.render();
    };
    if (!grouped)
      return UI.confirm(
        `Import ${added} new and update ${updated} ${coll === 'itdir' ? 'IT contact' : 'user'}(s)?${noMgr ? ` ${noMgr} "Reports to" could not be matched and are left empty.` : ''}`,
        save
      );
    // teams found: show them, let the team names be set, then save
    UI.modal({
      title: `Import — ${groups.length} team(s) found`,
      wide: true,
      body: `<p class="muted small">Each block between the <b>0</b> rows is one team: the first name is the <b>manager</b>, the names under him report to him. Give each team a name (optional).</p>
      <div class="imp-groups">${groups.map((x, i) => `<div class="card-sub"><div class="li"><span class="grow">👤 <b>${h(x.mgr.name)}</b> <span class="muted small">manager · ${x.members.length} member(s)</span></span><input data-gteam="${i}" value="${h(x.team)}" placeholder="Team name, e.g. APPS" style="max-width:220px"></div><div class="muted small">${x.members.map(m => h(m.name)).join(' · ') || 'no members'}</div></div>`).join('')}</div>
      <p class="small">${added} new · ${updated} already in the list (updated, not duplicated).</p>`,
      actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Import</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          groups.forEach((x, i) => {
            const t = w.querySelector(`[data-gteam="${i}"]`).value.trim();
            const mgr = latest(x.mgr.id);
            if (t) mgr.team = t;
            for (const m of x.members) {
              const r = latest(m.id);
              if (r.id !== mgr.id && !DirX.loops(r.id, mgr.id)) r.reportsTo = mgr.id;
              if (t) r.team = t;
            }
          });
          UI.closeModal();
          save();
        };
      },
    });
  },
  /* the org chart */
  tree() {
    const s = ps('dirtree');
    const all = DirX.it();
    const keep = r => (!s.region || r.region === s.region) && (!s.dept || r.dept === s.dept) && (!s.team || r.team === s.team);
    const q = U.lc(s.q || '');
    const hit = q
      ? new Set(all.filter(r => U.lc([r.name, r.title, r.bn, r.office, r.email, r.team].join(' ')).includes(q)).map(r => r.id))
      : null;
    const openSet = new Set();
    const mark = id => {
      const r = DirX.get(id);
      if (!r) return;
      for (const m of DirX.chain(r)) openSet.add(m.id);
    };
    if (s.open) mark(s.open);
    if (hit) hit.forEach(mark);
    const byLvl = (a, b) => DirX.level(a) - DirX.level(b) || (a.name || '').localeCompare(b.name || '');
    const roots = all
      .filter(r => !r.reportsTo || !DirX.get(r.reportsTo))
      .sort((a, b) => DirX.level(a) - DirX.level(b) || DirX.under(b.id) - DirX.under(a.id) || (a.name || '').localeCompare(b.name || ''));
    const node = (r, depth, seen) => {
      if (seen.has(r.id) || depth > 12) return '';
      seen.add(r.id);
      const kids = DirX.reports(r.id).sort(byLvl);
      const showKids = kids.map(k => node(k, depth + 1, seen)).filter(Boolean);
      const me = keep(r) && (!hit || hit.has(r.id));
      if (!me && !showKids.length) return '';
      const label = `<span class="dt-n ${hit && hit.has(r.id) ? 'hit' : ''} ${s.open === r.id ? 'hit' : ''}">${DirX.level(r) < 9 ? `<span class="lvl lvl${DirX.level(r)}">${h(DirX.levelName(r))}</span> ` : ''}<a class="link" href="javascript:void 0" data-dirp="${h(r.id)}">${h(r.name)}</a> <span class="muted small">${h(r.title || '')}${r.team ? ' · ' + h(r.team) : ''}${r.office ? ' · ext. ' + h(r.office) : ''}</span>${kids.length ? ` <span class="count" title="Everyone under">${DirX.under(r.id)}</span>` : ''}</span>`;
      return kids.length
        ? `<details class="dt" ${depth < 2 || all.length <= 40 || openSet.has(r.id) || hit ? 'open' : ''}><summary>${label}</summary><div class="dt-kids">${showKids.join('')}</div></details>`
        : `<div class="dt leaf">${label}</div>`;
    };
    const seen = new Set();
    const body = roots.map(r => node(r, 0, seen)).join('');
    const lone = all.filter(r => !r.reportsTo && !DirX.reports(r.id).length);
    const opt = k => [...new Set(all.map(r => r[k]).filter(Boolean))].sort();
    return `<div class="page-actions"><label class="flt"><span>Search</span><input id="dtq" value="${h(s.q || '')}" placeholder="Name, badge, ext., email…"></label>${[
      'region',
      'dept',
      'team',
    ]
      .map(
        k =>
          `<label class="flt"><span>${{ region: 'Region', dept: 'Department', team: 'Team' }[k]}</span><select data-dtf="${k}"><option value="">All</option>${opt(
            k
          )
            .map(v => `<option ${s[k] === v ? 'selected' : ''}>${h(v)}</option>`)
            .join('')}</select></label>`
      )
      .join(
        ''
      )}<span class="grow"></span>${App.canEdit('itdir') ? '<button class="btn" data-dimp="itdir">⇪ Import from Excel</button><button class="btn" id="dtbulk">Set "Reports to"…</button><button class="btn" id="dtauto" title="Executive Director › Deputy › Associate › Director › Manager — linked by title, section and department">Link leaders automatically</button>' : ''}<button class="btn ghost" id="dtxl">⇩ Excel</button>${App.isSuper() ? '<button class="btn ghost danger" data-dclear>🗑 Clear…</button>' : ''}${addBtn('itdir', 'Add contact')}</div>
      ${card(`IT Directory <span class="count">${all.length}</span> <span class="muted small">click a name for the full card</span>`, body || empty(all.length ? 'Nobody matches.' : 'No IT contacts yet.'))}
      ${lone.length ? card(`No manager set <span class="count">${lone.length}</span>`, `<p class="muted small">Not linked to anyone yet — set their "Reports to" (or they are at the top on their own).</p><div class="pick">${lone.map(r => `<span>${DirX.link(r)} <span class="muted small">${h(r.title || '')}</span></span>`).join('')}</div>`) : ''}`;
  },
};

P.directory = sub => {
  if (sub === 'tree') sub = 'it'; // old link: the IT Directory is the hierarchy now
  const tab = ['it', 'users', 'emr'].includes(sub) ? sub : ['it', 'users', 'emr'].includes(ps('dir').tab) ? ps('dir').tab : 'it';
  ps('dir').tab = tab;
  const impBtn = coll => (App.canEdit(coll) ? `<button class="btn" data-dimp="${coll}">⇪ Import from Excel</button>` : '');
  let body;
  if (tab === 'it') {
    body = DirX.tree();
  } else if (tab === 'users') {
    const s = ps('diruser');
    const all = Store.all('userdir');
    let rows = all;
    if (s.dept) rows = rows.filter(r => r.dept === s.dept);
    if (s.fac) rows = rows.filter(r => r.facility === s.fac);
    const per = DirX.depts().map(d => [d, all.filter(r => r.dept === d).length]);
    body =
      `<div class="dept-chips">${per.map(([d, n]) => `<button class="chip ${s.dept === d ? 'on' : ''}" data-udept="${h(d)}">${h(d)} <b>${n}</b></button>`).join('')}${s.dept ? '<button class="chip" data-udept="">All</button>' : ''}</div>
      <div class="page-actions">${filterBar('diruser', [
        { key: 'dept', label: 'Department', options: () => DirX.depts() },
        { key: 'fac', label: 'Facility', options: () => [...new Set(all.map(r => r.facility).filter(Boolean))].sort() },
      ])}<span class="grow"></span>${impBtn('userdir')}${App.isSuper() ? '<button class="btn ghost danger" data-dclear>🗑 Clear…</button>' : ''}${addBtn('userdir', 'Add user')}</div>` +
      UI.table({
        id: 'userdir',
        rows,
        exportName: 'Users Directory',
        onRow: true,
        cols: [
          { key: 'name', label: 'Name', html: r => `<b>${h(r.name)}</b>`, get: r => r.name },
          { key: 'dept', label: 'Department', get: r => r.dept },
          { key: 'position', label: 'Position', get: r => r.position },
          { key: 'facility', label: 'Facility', get: r => r.facility },
          { key: 'ward', label: 'Ward / unit', get: r => r.ward },
          { key: 'ext', label: 'Ext.', get: r => r.ext },
          { key: 'mobile', label: 'Mobile', get: r => r.mobile },
          { key: 'bn', label: 'Badge', get: r => r.bn },
          {
            key: 'email',
            label: 'Email',
            html: r =>
              r.email && /@/.test(r.email) ? `<a class="link" href="mailto:${h(r.email.trim())}">${h(r.email.trim())}</a>` : h(r.email),
            get: r => r.email,
          },
        ],
      });
  } else {
    const s = ps('diremr');
    let rows = Store.all('emrdir');
    if (s.analyst) rows = rows.filter(r => r.analyst === s.analyst);
    if (s.fac) rows = rows.filter(r => r.facility === s.fac);
    body =
      `<div class="page-actions">${filterBar('diremr', [
        {
          key: 'fac',
          label: 'Facility',
          options: () => [
            ...new Set(
              Store.all('emrdir')
                .map(r => r.facility)
                .filter(Boolean)
            ),
          ],
        },
        { key: 'analyst', type: 'member' },
      ])}${addBtn('emrdir', 'Add EMR contact')}</div>` +
      UI.table({
        id: 'emrdir',
        rows,
        exportName: 'EMR Directory',
        onRow: true,
        cols: [
          { key: 'facility', label: 'Facility', get: r => r.facility },
          { key: 'ward', label: 'Dept / Ward', html: r => `<b>${h(r.ward)}</b>`, get: r => r.ward },
          { key: 'nurse', label: 'Nurse', get: r => r.nurse },
          { key: 'bn', label: 'Badge', get: r => r.bn },
          { key: 'ext', label: 'Ext.', get: r => r.ext },
          { key: 'jc', label: 'JC number', get: r => r.jc },
          { key: 'analyst', label: 'Analyst', get: r => Store.memberShort(r.analyst) },
        ],
      });
  }
  const tabs = [
    ['it', 'IT Directory'],
    ['users', 'Users'],
    ['emr', 'EMR Directory'],
  ];
  return {
    title: 'Directory',
    html: `<div class="tabs">${tabs.map(([k, l]) => `<a class="tab ${tab === k ? 'on' : ''}" href="#/directory/${k}">${l}</a>`).join('')}</div>${body}`,
    mount(root) {
      UI.bindTables(root, {
        itdir: r => DirX.card(r.id),
        userdir: r => UI.editRecord('userdir', r),
        emrdir: r => UI.editRecord('emrdir', r),
      });
      root.querySelectorAll('[data-dirp]').forEach(
        a =>
          (a.onclick = e => {
            e.preventDefault();
            DirX.card(a.dataset.dirp);
          })
      );
      const bk = root.querySelector('#dtbulk');
      if (bk) bk.onclick = () => DirX.bulkReports();
      const au = root.querySelector('#dtauto');
      if (au)
        au.onclick = () => {
          DirX.autoLink(false);
          App.render();
        };
      root.querySelectorAll('[data-dclear]').forEach(b => (b.onclick = () => DirX.clearDialog()));
      root.querySelectorAll('[data-dimp]').forEach(b => (b.onclick = () => DirX.importDialog(b.dataset.dimp)));
      root.querySelectorAll('[data-udept]').forEach(
        b =>
          (b.onclick = () => {
            ps('diruser').dept = b.dataset.udept;
            App.render();
          })
      );
      const dq = root.querySelector('#dtq');
      if (dq)
        dq.oninput = U.debounce(() => {
          ps('dirtree').q = dq.value;
          ps('dirtree').open = '';
          App.render();
          const n = UI.$('#dtq');
          if (n) {
            n.focus();
            n.setSelectionRange(n.value.length, n.value.length);
          }
        }, 300);
      root.querySelectorAll('[data-dtf]').forEach(
        sl =>
          (sl.onchange = () => {
            ps('dirtree')[sl.dataset.dtf] = sl.value;
            App.render();
          })
      );
      const dx = root.querySelector('#dtxl');
      if (dx)
        dx.onclick = async () => {
          const rows = [
            ['Name', 'Title', 'Team', 'Reports to', 'Chain', 'Region', 'Department', 'Section', 'Ext.', 'Badge', 'Email', 'People under'],
          ];
          for (const r of DirX.it())
            rows.push([
              r.name,
              r.title || '',
              r.team || '',
              ((r.reportsTo && DirX.get(r.reportsTo)) || {}).name || '',
              DirX.chain(r)
                .map(m => m.name)
                .join(' › '),
              r.region || '',
              r.dept || '',
              r.section || '',
              r.office || '',
              r.bn || '',
              r.email || '',
              DirX.under(r.id),
            ]);
          XL.download(await XL.write([{ name: 'Hierarchy', rows }]), `IT hierarchy ${U.todayStr()}.xlsx`);
        };
    },
  };
};

/* Admin → Lists & scoring: the Users directory departments (administrator only) */
function adminUserDepts() {
  const l = DirX.depts();
  const html = card(
    'Users directory — departments',
    `<p class="muted small">The departments on Directory → Users (pharmacy, nursing, physicians …). Renaming one also renames it on every user.</p>
    <div id="udl">${l.map((d, i) => `<div class="li"><input data-ud="${i}" value="${h(d)}" data-was="${h(d)}" class="grow"> <span class="muted small">${Store.all('userdir').filter(r => r.dept === d).length} user(s)</span> <button class="btn xs ghost" data-udx="${i}">✕</button></div>`).join('')}</div>
    <div class="row-btns"><button class="btn" id="udadd">＋ Add department</button><span class="grow"></span><button class="btn primary" id="udsave">Save departments</button></div>`
  );
  return {
    html,
    mount(root) {
      root.querySelector('#udadd').onclick = () => {
        root
          .querySelector('#udl')
          .insertAdjacentHTML(
            'beforeend',
            `<div class="li"><input data-ud="n" value="" data-was="" class="grow" placeholder="Department name"></div>`
          );
        root.querySelector('#udl .li:last-child input').focus();
      };
      root.querySelectorAll('[data-udx]').forEach(
        b =>
          (b.onclick = () => {
            const li = b.closest('.li');
            const d = li.querySelector('input').dataset.was;
            const n = Store.all('userdir').filter(r => r.dept === d).length;
            if (n) return UI.toast(`${n} user(s) are in ${d} — move them first, or rename it`, 'bad');
            li.remove();
          })
      );
      root.querySelector('#udsave').onclick = () => {
        const ins = [...root.querySelectorAll('#udl input')];
        const list = ins.map(i => i.value.trim()).filter(Boolean);
        if (new Set(list.map(U.lc)).size !== list.length) return UI.toast('Two departments have the same name', 'bad');
        const ren = ins
          .filter(i => i.dataset.was && i.value.trim() && i.value.trim() !== i.dataset.was)
          .map(i => [i.dataset.was, i.value.trim()]);
        const recs = [Object.assign({}, Store.get('settings-userdepts') || { id: 'settings-userdepts', c: 'settings' }, { list })];
        for (const [a, b] of ren)
          for (const r of Store.all('userdir').filter(x => x.dept === a)) recs.push(Object.assign({}, r, { dept: b }));
        Store.saveMany(recs);
        UI.toast('Departments saved', 'good');
        App.render();
      };
    },
  };
}
