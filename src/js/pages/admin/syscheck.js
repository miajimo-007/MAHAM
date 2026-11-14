/* MAHAM — System Check — health of the shared folder and data (super admin only). */
'use strict';

const COLL_LABEL = {
  todo: 'To Do',
  shadow: 'Shadow work',
  helpdesk: 'Help desk',
  attendance: 'Attendance',
  quickwin: 'Quick win',
  central: 'External FU',
  oncall: 'On-call',
  course: 'Course',
  reccourse: 'Recommended course',
  itdir: 'IT directory',
  emrdir: 'EMR directory',
  info: 'Info',
  srs: 'SRS',
  mgrtask: 'Director task',
  project: 'Project',
  scoresnap: 'Score lock',
  settings: 'Settings',
  ping: 'Save test',
  request: 'Request',
  userpin: 'PIN',
};

P.syscheck = () => {
  if (!App.isSuper() && !AdminRole.sees('syscheck'))
    return { title: 'Not available', html: '<div class="card"><p>You don\'t have permission to see this page.</p></div>' };
  const today = U.todayStr(),
    now = Date.now(),
    DAY = 86400000;
  const teams = Store.teams(),
    all = Store.members(),
    teamIds = new Set(teams.map(t => t.id));
  const recsAll = [...Store.db.values()].filter(r => !r._del);
  const issues = []; // [level, text]
  /* --- people & their data files --- */
  const people = all.map(m => {
    const src = Store.sources['u:' + m.id + '.json'];
    const recs = src ? Object.values(src.records).filter(r => !r._del) : [];
    const last = recs.reduce((a, r) => Math.max(a, r._ts || 0), 0);
    let st = ['OK', 'good'];
    if (m.active === false) st = ['Retired', ''];
    else if (!src) st = ['Never saved', 'warn'];
    else if (src.mtime && now - src.mtime > 14 * DAY) st = ['No activity 14+ days', 'warn'];
    return { m, src, recs: recs.length, last, st };
  });
  /* --- teams --- */
  const T = teams.map(t => {
    const mem = all.filter(m => !Store.topRole(m.role) && (m.team || 'apps') === t.id && m.active !== false);
    const cnt = c => Store.all(c, t.id).length;
    const hd = Store.all('helpdesk', t.id);
    const meta = Store.meta(t.id);
    return {
      t,
      mgr: mem.find(m => m.role === 'manager'),
      tl: mem.filter(m => m.role === 'teamleader'),
      analysts: mem.filter(m => m.role !== 'manager').length,
      todo: cnt('todo'),
      openTodo: Store.all('todo', t.id).filter(r => r.status === 'In Progress').length,
      shadow: cnt('shadow'),
      hd: hd.length,
      att: cnt('attendance'),
      qw: cnt('quickwin'),
      qwPend: Store.all('quickwin', t.id).filter(q => !q.approval).length,
      riy: cnt('central'),
      course: cnt('course') + cnt('reccourse'),
      srs: cnt('srs') + cnt('info'),
      hdUpd: meta.helpdeskUpdated,
      unmatched: [
        ...new Set(
          hd
            .map(r => r.technician)
            .filter(x => x && U.lc(x) !== 'not assigned' && !Store.memberByMeName(x) && !Admin.ignoredTech().map(U.lc).includes(U.lc(x)))
        ),
      ],
    };
  });
  /* --- checks --- */
  for (const r of T) {
    if (!r.mgr) issues.push(['warn', `${r.t.name}: no manager set (Admin → People).`]);
    if (r.hd && r.hdUpd !== today)
      issues.push(['warn', `${r.t.name}: ManageEngine not imported today (last ${r.hdUpd ? U.fmtDate(r.hdUpd) : 'never'}).`]);
    if (r.unmatched.length)
      issues.push([
        'info',
        `${r.t.name}: ${r.unmatched.length} help-desk technician name(s) don't match anyone — not counted in scores: ${r.unmatched.slice(0, 6).join(', ')}${r.unmatched.length > 6 ? '…' : ''}. If one is a team member, add it as their "Name in ManageEngine".`,
      ]);
  }
  const meNames = {};
  for (const m of all)
    if (m.me) {
      const k = U.lc(m.me);
      (meNames[k] = meNames[k] || []).push(m.name);
    }
  for (const [k, v] of Object.entries(meNames))
    if (v.length > 1) issues.push(['bad', `The ManageEngine name "${k}" is used by more than one person: ${v.join(', ')}.`]);
  for (const m of all)
    if (m.active !== false && !Store.topRole(m.role) && m.role !== 'manager' && !m.me)
      issues.push(['info', `${m.name} has no "Name in ManageEngine" — their help-desk requests won't be counted.`]);
  const noPin = all.filter(m => m.active !== false && !Store.pinOf(m.id));
  if (noPin.length)
    issues.push([
      'info',
      `${noPin.length} active ${noPin.length === 1 ? 'person has' : 'people have'} no PIN yet (anyone could open the app as them): ${noPin.map(m => m.short || m.name).join(', ')}.`,
    ]);
  const ids = new Set(all.map(m => m.id));
  const orphanTeam = recsAll.filter(r => Store.TEAM_SCOPED.has(r.c) && r.team && !teamIds.has(r.team));
  if (orphanTeam.length)
    issues.push([
      'bad',
      `${orphanTeam.length} record(s) belong to a team that no longer exists (${[...new Set(orphanTeam.map(r => r.team))].join(', ')}).`,
    ]);
  const orphanPerson = recsAll.filter(r => ['todo', 'shadow', 'quickwin', 'course'].includes(r.c) && r.analyst && !ids.has(r.analyst));
  if (orphanPerson.length)
    issues.push(['warn', `${orphanPerson.length} record(s) are assigned to a person who is not in the People list.`]);
  const mtBad = recsAll.filter(
    r =>
      (r.c === 'mgrtask' || r.c === 'project') &&
      !['Done', 'Canceled'].includes(r.status) &&
      (!Store.member(r.manager) || Store.member(r.manager).active === false)
  );
  if (mtBad.length) issues.push(['warn', `${mtBad.length} open director task(s)/project(s) are with someone who is missing or retired.`]);
  const overdueMt = recsAll.filter(r => r.c === 'mgrtask' && r.status !== 'Done' && r.due && r.due < today);
  if (overdueMt.length) issues.push(['info', `${overdueMt.length} director task(s) are overdue.`]);
  if (Store.rejected.length) {
    const files = [...new Set(Store.rejected.map(x => x.file))];
    issues.push([
      'bad',
      `${Store.rejected.length} change(s) in ${files.join(', ')} were ignored because the person was not allowed to make them — the file may have been edited by hand. See "Ignored changes" below.`,
    ]);
  }
  if (Store.lastError) issues.push(['bad', `Your last save failed: ${Store.lastError}`]);
  if (Store.dirty) issues.push(['warn', 'You have unsaved changes on this PC.']);
  const bad = issues.filter(i => i[0] === 'bad').length,
    warn = issues.filter(i => i[0] === 'warn').length;
  /* --- recent activity --- */
  const recent = recsAll
    .filter(r => r._ts > 1000 && r.c !== 'ping')
    .sort((a, b) => b._ts - a._ts)
    .slice(0, 30);
  const what = r =>
    r.task ||
    r.subject ||
    r.name ||
    r.course ||
    r.title ||
    r.number ||
    (r.c === 'attendance' ? `${U.fmtDate(r.date)} ${r.status || ''}` : '') ||
    r.id;
  const kb = n => (n ? (n < 1024 ? n + ' B' : U.num(n / 1024, 1) + ' KB') : '');
  const usersSize = Object.entries(Store.sources)
    .filter(([k]) => k.startsWith('u:'))
    .reduce((a, [, v]) => a + (v.size || 0), 0);
  const html = `
  <div class="insights ${bad ? 'warnbox' : ''}"><div>${bad ? `⛔ <b>${bad} problem${bad > 1 ? 's' : ''}</b> need attention` : warn ? `⚠ Working, with <b>${warn} warning${warn > 1 ? 's' : ''}</b>` : '✅ <b>Everything looks fine.</b>'} — checked ${U.fmtTs(now)}. Only you can see this page.</div><div class="row-btns"><button class="btn sm" id="sc_refresh">⟳ Re-read all files</button><button class="btn sm primary" id="sc_test">Test saving to the shared folder</button></div></div>
  <div class="insights"><div class="grow">📁 <b>Folders</b>${App.pathsHtml(['folder', 'data', 'users', 'backups'])}${Store.filePath() ? `<span class="muted small">You opened the app from: ${h(Store.filePath())}</span>` : ''}</div></div>
  <div class="kpis">
    ${UI.kpi('App version', h(APP_VERSION), 'shared-folder mode')}
    ${UI.kpi('People', all.filter(m => m.active !== false).length, `${people.filter(p => p.src).length} with a data file · ${all.filter(m => m.hidden).length} hidden`)}
    ${UI.kpi('Records', recsAll.length.toLocaleString(), `${kb(usersSize)} in the data folder`)}
    ${UI.kpi('Last refresh', Store.lastSync ? U.fmtTs(Store.lastSync).slice(-5) : '–', Store.lastSaved ? 'your last save ' + U.fmtTs(Store.lastSaved).slice(-5) : 'nothing saved this session')}
    ${UI.kpi('Problems', bad, `${warn} warnings`, bad ? 'sc-e' : warn ? 'sc-c' : 'sc-a')}
  </div>
  ${card(`Checks <span class="count">${issues.length}</span>`, issues.length ? issues.map(([l, t]) => `<div class="li"><span class="grow">${l === 'bad' ? '⛔' : l === 'warn' ? '⚠' : 'ⓘ'} ${h(t)}</span></div>`).join('') : empty('No issues found.'))}
  ${
    Store.rejected.length
      ? card(
          `Ignored changes <span class="count">${Store.rejected.length}</span>`,
          `<p class="muted small">These records are in the shared folder but were not accepted, so the app keeps using the last allowed version. Usually they come from an older copy of the app, or from someone trying something they are not allowed to do (the app refuses it) — or a data file was edited by hand. Nothing here changes anyone's scores.</p><div class="row-btns"><button class="btn sm" id="sc_clear">🧹 Clear ignored changes</button></div><div class="tbl-scroll"><table class="tbl"><thead><tr><th>File</th><th>Written as</th><th>What</th><th>Item</th><th>Why ignored</th></tr></thead><tbody>${Store.rejected
            .slice(0, 200)
            .map(
              x =>
                `<tr><td class="mono">${h(x.file)}</td><td>${h(Store.memberName(x.by) || x.by)}</td><td>${h(COLL_LABEL[x.c] || x.c)}</td><td class="mono small">${h(x.id)}</td><td>${h(x.why)}</td></tr>`
            )
            .join('')}</tbody></table></div>`
        )
      : ''
  }
  ${(() => {
    // Speed: how big each person's files are and how long opening / refreshing / saving took on this PC
    const S = Store.stats || {};
    const mb = n => U.num(n / 1048576, 1) + ' MB';
    const per = new Map();
    for (const [k, v] of Object.entries(Store.sources)) {
      if (!k.startsWith('u:')) continue;
      const o = Store.fileOwner(k.slice(2));
      const x = per.get(o) || { main: 0, hd: 0, n: 0 };
      if (Store.isMainKey(k)) x.main += v.size || 0;
      else x.hd += v.size || 0;
      x.n++;
      per.set(o, x);
    }
    const rows = [...per].sort((a, b) => b[1].main + b[1].hd - (a[1].main + a[1].hd)).slice(0, 12);
    const big = rows.filter(([, x]) => x.main > 8 * 1048576);
    const ms = v => (v == null ? '–' : v < 1000 ? v + ' ms' : U.num(v / 1000, 1) + ' s');
    return card(
      'Speed',
      `${big.length ? `<div class="insights warnbox"><div>⚠ ${big.map(([o]) => h(Store.memberShort(o))).join(', ')}: main data file over 8 MB — saving may slow down. It shrinks by itself after the year is archived (from February).</div></div>` : ''}
      <div class="kpis k4">${UI.kpi('Opening', ms(S.openMs), S.openedFrom || '')}${UI.kpi('Refresh (read changes)', ms(S.syncMs), 'last time')}${UI.kpi('Saving', ms(S.saveMs), S.saveFiles ? S.saveFiles + ' file(s) written' : 'nothing saved yet')}${UI.kpi('Records loaded', Store.db.size.toLocaleString(), [...Store.loadYears].length ? 'incl. ' + [...Store.loadYears].join(', ') : 'this year + open work')}</div>
      <div class="tbl-scroll"><table class="tbl"><thead><tr><th>Person</th><th class="num">Main file</th><th class="num">Help desk + archives (read)</th><th class="num">Files</th></tr></thead><tbody>${rows.map(([o, x]) => `<tr><td>${h(Store.memberShort(o))}</td><td class="num ${x.main > 8 * 1048576 ? 't-bad' : ''}">${mb(x.main)}</td><td class="num">${mb(x.hd)}</td><td class="num">${x.n}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">Archived years: ${Store.archiveYears.size ? [...Store.archiveYears].sort().join(', ') + ' (read when picked in the year box)' : 'none yet'}.</p>`
    );
  })()}
  ${card(
    'Backups',
    `<p class="muted small">Every day the <b>first person who opens the app</b> saves a copy of all data files to <code class="pathcode">${h(Store.paths().backups)}</code> (the last ${Store.backupKeep()} days are kept — change it in Admin → Data). There is no server, so on a day nobody opens the app (e.g. during Eid) no backup is made. For extra safety, download one now and then and keep it somewhere else.</p><div id="bklist"><p class="muted">Loading backups…</p></div><div class="row-btns"><button class="btn" id="bknow">Back up now</button><span class="grow"></span><button class="btn primary" id="bkfull" title="Every team's work (all years), all settings, workflows, people and permissions — one zip">⬇ Download full backup</button><button class="btn ghost" id="bkup">⬆ Restore from a backup file…</button><input type="file" id="bkfile" accept=".zip" hidden></div>
    <p class="muted small">Keep the full backup somewhere safe (not on the same shared drive). If the data is ever lost, open the app on an empty folder, sign in, come here and press “Restore from a backup file” — everything comes back as it was.</p>`
  )}
  ${card(
    'Teams',
    `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Team</th><th>Manager</th><th>Team leader</th><th class="num">People</th><th class="num">To Do (open)</th><th class="num">Shadow</th><th class="num">Help desk</th><th>ME imported</th><th class="num">Attendance</th><th class="num">Quick wins (to approve)</th><th class="num">External FU</th><th class="num">Courses</th><th class="num">Info & Dashboards</th></tr></thead><tbody>
    ${T.map(r => `<tr><td><b>${h(r.t.name)}</b></td><td>${r.mgr ? h(r.mgr.name) : '<span class="t-warn">none</span>'}</td><td>${h(r.tl.map(m => m.short || m.name).join(', ')) || '<span class="muted">—</span>'}</td><td class="num">${r.analysts}</td><td class="num">${r.todo} (${r.openTodo})</td><td class="num">${r.shadow}</td><td class="num">${r.hd}</td><td>${r.hdUpd ? (r.hdUpd === today ? UI.badge('Today', 'good') : UI.badge(U.fmtDate(r.hdUpd), 'warn')) : UI.badge('Never', '')}</td><td class="num">${r.att}</td><td class="num">${r.qw} (${r.qwPend})</td><td class="num">${r.riy}</td><td class="num">${r.course}</td><td class="num">${r.srs}</td></tr>`).join('')}
    <tr class="muted"><td><b>${h(Store.orgName())} — director level</b></td><td colspan="12">${Store.all('mgrtask').length} tasks (${Store.all('mgrtask').filter(r => r.status !== 'Done').length} open) · ${Store.all('project').length} projects (${Store.all('project').filter(r => !['Done', 'Canceled'].includes(r.status)).length} active) · ${Store.all('itdir').length} IT directory contacts</td></tr>
    </tbody></table></div>`
  )}
  ${card(
    "Everyone's data file",
    `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Person</th><th>Team</th><th>Role</th><th>Last saved work</th><th>Last opened</th><th class="num">Size</th><th class="num">Records</th><th>PIN</th><th>Status</th></tr></thead><tbody>
    ${people
      .sort((a, b) => (b.src ? b.src.mtime : 0) - (a.src ? a.src.mtime : 0))
      .map(
        p =>
          `<tr class="${p.m.hidden ? 'hid' : ''}"><td><b>${h(p.m.name)}</b>${p.m.hidden ? ' <span class="muted small">(hidden)</span>' : ''}${p.m.id === App.me ? ' <span class="muted small">(you)</span>' : ''}</td><td>${h(Store.topRole(p.m.role) ? '—' : Store.teamName(p.m.team || 'apps'))}</td><td>${h(Store.titleOf(p.m))}</td><td>${Store.lastWork(p.m.id) ? U.fmtTs(Store.lastWork(p.m.id)) : '<span class="muted">—</span>'}</td><td>${(() => {
            const u = Store.get('usage-' + p.m.id);
            const d =
              u &&
              Object.keys(u.days || {})
                .sort()
                .pop();
            return d ? U.fmtDate(d) : '<span class="muted">—</span>';
          })()}</td><td class="num">${kb(p.src && p.src.size)}</td><td class="num">${p.recs}</td><td>${Store.pinOf(p.m.id) ? '✓' : '<span class="muted">none</span>'}</td><td>${UI.badge(p.st[0], p.st[1])}</td></tr>`
      )
      .join('')}
    </tbody></table></div><p class="muted small">Each person's work is saved in <b>MAHAM Data/users/&lt;id&gt;.json</b>. "Never saved" = they haven't opened the app and changed anything yet.</p>`
  )}
  ${card('Latest changes (all teams)', recent.length ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Team</th><th>Item</th></tr></thead><tbody>${recent.map(r => `<tr><td class="nw">${U.fmtTs(r._ts)}</td><td>${h(Store.memberName(r._by) || r._by || '')}</td><td>${h(COLL_LABEL[r.c] || r.c)}</td><td>${h(r.team ? Store.teamName(r.team) : '')}</td><td>${h(String(what(r)).slice(0, 90))}</td></tr>`).join('')}</tbody></table></div>` : empty('No changes yet.'))}`;
  return {
    title: 'System Check',
    html,
    mount(root) {
      root.querySelector('#sc_refresh').onclick = () => App.refresh(true);
      const clr = root.querySelector('#sc_clear');
      if (clr)
        clr.onclick = () =>
          UI.confirm(
            'Remove the ignored changes from the data files? A backup is saved first, and nothing the app is using changes.',
            async () => {
              try {
                const n = await Store.clearRejected();
                UI.toast(`${n} ignored change(s) removed`, 'good');
                App.render();
              } catch (e) {
                UI.toast('Could not clear: ' + e.message, 'bad');
              }
            }
          );
      const kb = n => (n < 1024 ? n + ' B' : n < 1048576 ? U.num(n / 1024, 1) + ' KB' : U.num(n / 1048576, 1) + ' MB');
      const showBackups = async () => {
        const el = root.querySelector('#bklist');
        if (!el) return;
        let list;
        try {
          list = await Store.listBackups();
        } catch (e) {
          el.innerHTML = `<p class="t-bad small">Could not read the Backups folder: ${h(e.message)}</p>`;
          return;
        }
        const today = list.some(b => b.day === U.todayStr() && !b.tag);
        el.innerHTML =
          (today
            ? '<p class="small">✅ Today\'s backup exists.</p>'
            : '<p class="small t-warn">⚠ No backup yet today — it is made automatically, or press "Back up now".</p>') +
          (list.length
            ? `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Backup</th><th>Made</th><th class="num">Size</th><th></th></tr></thead><tbody>${list.map(b => `<tr><td class="mono">${h(b.name)}</td><td>${U.fmtTs(b.mtime)}</td><td class="num">${kb(b.size)}</td><td class="nw"><button class="btn xs" data-bkdl="${h(b.name)}">Download</button> <button class="btn xs ghost" data-bkrs="${h(b.name)}">Restore…</button></td></tr>`).join('')}</tbody></table></div>`
            : empty('No backups yet.'));
        el.querySelectorAll('[data-bkdl]').forEach(
          b =>
            (b.onclick = async () => {
              const { blob } = await Store.readBackup(b.dataset.bkdl);
              XL.download(blob, b.dataset.bkdl);
              Store.noteCopied();
            })
        );
        el.querySelectorAll('[data-bkrs]').forEach(b => (b.onclick = () => restoreDialog(b.dataset.bkrs)));
      };
      const restoreDialog = async name => {
        let files, info;
        try {
          ({ files, info } = await Store.readBackup(name));
        } catch (e) {
          return UI.toast('Could not open the backup: ' + e.message, 'bad');
        }
        const names = Object.keys(files).sort();
        const title = typeof name === 'string' ? name : name.name;
        const tset = new Set(
          names.flatMap(f => (files[f].records || []).map(r => Store.backupTeamOf(r, Store.fileOwner(f)))).filter(Boolean)
        );
        const tlist = [...new Set([...Store.teams().map(t => t.id), ...tset])].filter(t => tset.has(t));
        UI.modal({
          title: 'Restore ' + title,
          body: `<p>Puts records back <b>as they were in this backup</b>${info && info.made ? ` (made ${h(U.fmtTs(Date.parse(info.made)))}${info.version ? ', app ' + h(info.version) : ''})` : ''}. Records added after the backup are kept. A safety backup of today's data is made first.</p>
            <h4 class="act-h">Teams</h4><div class="pick"><label class="check"><input type="checkbox" name="bkt" value="" checked> Shared by every team <span class="muted small">(people, teams, roles, permissions, shared settings)</span></label>${tlist.map(t => `<label class="check"><input type="checkbox" name="bkt" value="${h(t)}" checked> ${h(Store.teamName(t))} <span class="muted small">(its work, settings and workflows)</span></label>`).join('')}</div>
            <h4 class="act-h">People</h4><div class="pick">${names.map(f => `<label class="check"><input type="checkbox" name="bkf" value="${h(f)}" checked> ${h(Store.memberName(f.slice(0, -5)) || f)} <span class="muted small">${(files[f].records || []).length} records</span></label>`).join('')}</div>
            <h4 class="act-h">Kinds of record</h4><div class="pick">${[
              ...new Set(
                names.flatMap(f => (files[f].records || []).map(r => r && r.c)).filter(c => c && !['usage', 'ping', 'annread'].includes(c))
              ),
            ]
              .sort()
              .map(c => `<label class="check"><input type="checkbox" name="bkc" value="${h(c)}" checked> ${h(COLL_LABEL[c] || c)}</label>`)
              .join('')}</div>`,
          actions: `<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn danger" data-ok>Restore</button>`,
          onMount: w => {
            w.querySelector('[data-c]').onclick = UI.closeModal;
            w.querySelector('[data-ok]').onclick = async () => {
              const only = [...w.querySelectorAll('[name=bkf]:checked')].map(x => x.value);
              if (!only.length) return UI.toast('Pick at least one person', 'bad');
              const kinds = [...w.querySelectorAll('[name=bkc]:checked')].map(x => x.value);
              if (!kinds.length) return UI.toast('Pick at least one kind of record', 'bad');
              const teams = [...w.querySelectorAll('[name=bkt]:checked')].map(x => x.value);
              if (!teams.length) return UI.toast('Pick at least one team', 'bad');
              w.querySelector('[data-ok]').disabled = true;
              w.querySelector('[data-ok]').textContent = 'Restoring…';
              try {
                const n = await Store.restoreBackup(
                  name,
                  only,
                  kinds.length === w.querySelectorAll('[name=bkc]').length ? null : kinds,
                  teams.length === w.querySelectorAll('[name=bkt]').length ? null : teams
                );
                UI.closeModal();
                UI.toast(`Restored ${n} records from ${title}`, 'good');
                App.render();
              } catch (e) {
                UI.toast('Restore failed: ' + e.message, 'bad');
              }
            };
          },
        });
      };
      root.querySelector('#bknow').onclick = async () => {
        try {
          await Store.makeBackup();
          Store._backupDay = U.todayStr();
          UI.toast('Backup saved', 'good');
          showBackups();
        } catch (e) {
          UI.toast('Backup failed: ' + e.message, 'bad');
        }
      };
      root.querySelector('#bkfull').onclick = async e => {
        const b = e.currentTarget;
        b.disabled = true;
        try {
          const n = await Store.downloadFullBackup();
          UI.toast(n + ' downloaded — keep it somewhere safe', 'good');
          showBackups();
        } catch (er) {
          UI.toast('Backup failed: ' + er.message, 'bad');
        }
        b.disabled = false;
      };
      const fi = root.querySelector('#bkfile');
      root.querySelector('#bkup').onclick = () => {
        fi.value = '';
        fi.click();
      };
      fi.onchange = () => {
        if (fi.files && fi.files[0]) restoreDialog(fi.files[0]);
      };
      showBackups();
      root.querySelector('#sc_test').onclick = async () => {
        const stamp = Date.now();
        Store.save({ id: 'ping-' + App.me, c: 'ping', at: stamp });
        try {
          await Store.flush();
          await Store.sync(true);
        } catch (e) {
          /* reported below */
        }
        const mine = Store.sources['u:' + App.me + '.json'];
        const back = mine && mine.records['ping-' + App.me];
        if (back && back.at === stamp) UI.toast('✓ Saved to the shared folder and read back correctly', 'good');
        else UI.toast('✗ Could not save to the shared folder' + (Store.lastError ? ': ' + Store.lastError : ''), 'bad');
        App.render();
      };
    },
  };
};
