/* MAHAM — Import Old Data — screen for the old per-sheet Excel files. */
'use strict';

/* ---------- page ---------- */
P.importdata = () => {
  const mgr = App.can('importOld');
  const teamNote = `<p class="note">Data will be imported into the <b>${h(Store.teamName(App.viewTeam))}</b> team${App.isDir() ? ' — switch team at the top first if needed' : ''}.</p>`;
  const html = !mgr
    ? card('Import old data', "<p>You don't have permission to import data.</p>")
    : `
  ${card(
    'Import old data from Excel (one time)',
    `<ol class="steps">
    <li>Save each sheet of the old workbook as its own Excel file (in Excel: right-click the sheet tab → <b>Move or Copy</b> → <i>(new book)</i> → <b>Create a copy</b>, then save it). Any file name is fine.</li>
    <li>Put all the files in the <b>Import</b> folder inside <b>MAHAM Data</b> on the shared drive — or pick them below.</li>
    <li>Press <b>Read files</b>, check what was recognised, then press <b>Import</b>.</li></ol>
    <p class="muted small">Sheets used: To Do List (and 2025), Shadow Works, MEDataSource, Attendance, Quick Wins, Riyad FU, Manager Tasks, On-Call Sheet, Courses, IT Directory, EMR Directory, Info &amp; SRS &amp; ECTS, Dashboard (monthly scores), Drops — and a team's <b>Routine Tasks</b> (→ Shadow Works) and <b>Project Tasks</b> (→ projects with their tasks; each Stage becomes a board column). Calculated sheets (Performance, Details, LazyDays…) are not needed. Importing the same file again does not create duplicates.</p>
    <div class="row-btns"><button class="btn primary" id="impfolder">📁 Read files from the Import folder</button><label class="btn">📄 Pick files…<input type="file" id="impfiles" multiple accept=".xlsx,.csv" hidden></label></div>
    ${teamNote}<div id="impstatus"></div>`
  )}
  ${App.isSuper() ? '<div id="implogs"></div>' : ''}`;
  /* past imports, each can be undone by the super admin (removes what that import added) */
  const NAMES = {
    shadow: 'shadow work',
    todo: 'To Dos',
    project: 'projects',
    ptask: 'project tasks',
    helpdesk: 'help desk',
    attendance: 'attendance',
  };
  const logsCard = () => {
    const L = Importer.logs();
    return card(
      `Past imports <span class="count">${L.length}</span>`,
      L.length
        ? `<p class="muted small">Undo removes everything that import added (and puts back records it overwrote) — also any changes people made to those records since. Imports made before version 2026.11.10.2 are not listed.</p>
      <div class="tbl-scroll"><table class="tbl"><thead><tr><th>When</th><th>By</th><th>Team</th><th>File(s)</th><th>What came in</th><th></th></tr></thead><tbody>
      ${L.map(
        g => `<tr class="${g.undone ? 'muted' : ''}"><td>${U.fmtTs(g.at)}</td><td>${h(Store.memberShort(g.by))}</td><td>${h(Store.teamName(g.team))}</td><td>${h((g.files || []).join(', '))}</td>
        <td>${Object.entries(g.counts || {})
          .map(([c, n]) => `${n.toLocaleString()} ${h(NAMES[c] || c)}`)
          .join(' · ')}</td>
        <td>${g.undone ? `Undone ${U.fmtTs(g.undone.at)}` : `<button class="btn xs danger" data-impundo="${h(g.id)}">Undo</button>`}</td></tr>`
      ).join('')}
      </tbody></table></div>`
        : '<p class="muted">No imports yet (imports are listed from version 2026.11.10.2).</p>'
    );
  };
  return {
    title: 'Import Old Data',
    html,
    mount(root) {
      if (!mgr) return;
      const st = root.querySelector('#impstatus'),
        lg = root.querySelector('#implogs');
      const drawLogs = () => {
        if (!lg) return;
        lg.innerHTML = logsCard();
        lg.querySelectorAll('[data-impundo]').forEach(
          b =>
            (b.onclick = () => {
              const g = Store.get(b.dataset.impundo);
              if (!g) return;
              const n = (g.ids || []).filter(id => Store.get(id)).length,
                ch = Importer.changedSince(g),
                back = Object.keys(g.prev || {}).length;
              UI.confirm(
                `Undo the import of ${U.fmtTs(g.at)} (${Store.teamName(g.team)})? This removes ${n.toLocaleString()} record(s)${back ? ` and puts back ${back} it overwrote` : ''}.${ch ? ` ${ch} of them were changed since the import — those changes go too.` : ''}`,
                () => {
                  const r = Importer.undo(g);
                  if (!r) return UI.toast('This import can no longer be undone', 'bad');
                  UI.toast(
                    `Import undone — ${r.removed.toLocaleString()} record(s) removed${r.restored ? `, ${r.restored} put back` : ''}`,
                    'good'
                  );
                  drawLogs();
                }
              );
            })
        );
      };
      drawLogs();
      const show = analysis => {
        const rows = analysis.results;
        const total = rows.reduce((a, R) => a + R.recs.filter(r => r.c !== 'settings').length, 0);
        const exist = rows.reduce((a, R) => a + R.recs.filter(r => r.c !== 'settings' && Store.get(r.id)).length, 0);
        st.innerHTML = `<table class="tbl" style="margin-top:14px"><thead><tr><th>File</th><th>Sheet</th><th>Recognised as</th><th class="num">Rows</th><th class="num">Already in app</th></tr></thead><tbody>
          ${rows.map(R => `<tr><td>${h(R.file)}</td><td>${h(R.sheet || '')}</td><td>${R.error ? UI.badge('Error: ' + R.error, 'bad') : !R.type ? UI.badge('Not used (not a data sheet?)', '') : R.skipped ? UI.badge(R.type.label, '') : UI.badge(R.type.label, 'good')}</td><td class="num">${R.recs.filter(r => r.c !== 'settings').length || (R.recs.length ? 'lists' : '')}</td><td class="num">${R.recs.filter(r => r.c !== 'settings' && Store.get(r.id)).length || ''}</td></tr>`).join('')}
          </tbody></table>
          ${analysis.meta.needTeam ? '<p class="t-bad">Routine Tasks / Project Tasks need one team: choose the team at the top (not "All teams") and read the file again.</p>' : ''}
          ${(analysis.meta.unknownStaff || []).length ? `<p class="t-warn small">Staff names not found in the app: <b>${analysis.meta.unknownStaff.map(h).join(', ')}</b> — their Routine Tasks are left out and their project tasks come in unassigned. Fix the name in the sheet (or add it as the person's alias) and read the file again.</p>` : ''}
          ${analysis.meta.noDate ? `<p class="t-warn small">${analysis.meta.noDate} Routine Task row(s) have no Init Date or Complete Date and are left out.</p>` : ''}
          ${rows.some(R => R.type && R.type.key === 'routine' && R.recs.length) ? `<div class="row-btns"><label class="flt">Routine Tasks have no time column — minutes to count for each one: <input type="number" id="impmin" min="0" step="5" value="${+analysis.meta.routineMin || 30}" style="width:80px"></label></div>` : ''}
          ${rows.some(R => !R.type && !R.error) ? '<p class="muted small">"Not used": calculated sheets (Performance, Dashboard Employee, LazyDays…) are fine to skip. If a data sheet shows this, make sure its header row was copied too, or name the file after the sheet (e.g. "Shadow Works.xlsx").</p>' : ''}
          <div class="row-btns"><label class="flt tog"><input type="checkbox" id="impover"> Overwrite records already in the app (normally leave off)</label><span class="grow"></span><button class="btn primary" id="impgo2" ${total ? '' : 'disabled'}>Import ${(total - exist).toLocaleString()} new records</button></div>`;
        const ov = st.querySelector('#impover'),
          go = st.querySelector('#impgo2'),
          mn = st.querySelector('#impmin');
        if (mn)
          mn.oninput = () => {
            analysis.meta.routineMin = Math.max(0, +mn.value || 0);
          };
        ov.onchange = () => {
          go.textContent = `Import ${(ov.checked ? total : total - exist).toLocaleString()} ${ov.checked ? '' : 'new '}records`;
        };
        go.onclick = () => {
          const r = Importer.commit(analysis, ov.checked);
          UI.toast(`Imported ${r.added.toLocaleString()} records`, 'good');
          drawLogs();
          st.innerHTML = `<p class="t-good" style="margin-top:12px">✓ Imported ${r.added.toLocaleString()} records${r.skipped ? ` (${r.skipped.toLocaleString()} already in the app were kept as they are)` : ''}. Press <b>Save</b> at the top if it doesn't say Saved yet.</p>`;
        };
      };
      const run = async files => {
        if (!files.length) {
          st.innerHTML = '<p class="t-warn">No .xlsx or .csv files found.</p>';
          return;
        }
        st.innerHTML = '<p class="muted">Reading…</p>';
        try {
          show(
            await Importer.analyse(files, msg => {
              st.innerHTML = `<p class="muted">${h(msg)}</p>`;
            })
          );
        } catch (e) {
          st.innerHTML = `<p class="t-bad">${h(e.message)}</p>`;
        }
      };
      root.querySelector('#impfiles').onchange = e => run([...e.target.files]);
      root.querySelector('#impfolder').onclick = async () => {
        try {
          const dir = await Store.dataDir.getDirectoryHandle('Import', { create: true });
          const files = [];
          for await (const [name, hnd] of dir.entries())
            if (hnd.kind === 'file' && /\.(xlsx|csv)$/i.test(name) && !name.startsWith('~$'))
              files.push({ name, getFile: () => hnd.getFile() });
          if (!files.length) {
            st.innerHTML =
              '<p class="t-warn">The <b>Import</b> folder (inside MAHAM Data) is empty. Put the Excel files there and press the button again.</p>';
            return;
          }
          run(files.sort((a, b) => a.name.localeCompare(b.name)));
        } catch (e) {
          st.innerHTML = `<p class="t-bad">Could not open the Import folder: ${h(e.message)}</p>`;
        }
      };
    },
  };
};
