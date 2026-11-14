/* MAHAM — ⚙ Board / ⚙ Lanes on a project's board (2026.11.12.8): a quick way for the PROJECT OWNER, an Admin with
 * Task workflows for the team, or the super admin to change this one project's board.
 *   Lanes project  → ⚙ Lanes: its lanes and each lane's statuses (the lane editor). Saving gives the project its own lanes:
 *                    it stops following its lane template (an admin can put it back: Edit project → Lane template).
 *   Kanban / Scrum → ⚙ Board: its statuses (name, colour, counts as, order) with a WIP limit and "Done when…" per column.
 *                    Only limits / "Done when…" changed → the project keeps following the team's statuses. Statuses changed →
 *                    the project gets its own statuses (project.board, TaskFlow.ownFlow) and no longer follows the team /
 *                    chosen workflow; "Follow … again" puts it back.
 * Renamed statuses are renamed on the tasks; tasks whose status is removed are moved after asking where they go. */
'use strict';

const BoardEdit = {
  can(p) {
    return (
      !!p &&
      !App.preview &&
      (App.isSuper() ||
        p.manager === App.me ||
        (typeof AdminRole !== 'undefined' && AdminRole.can(App.me, 'task-workflows', Scrum.teamOf(p))))
    );
  },
  button(p) {
    if (!BoardEdit.can(p)) return '';
    return Lanes.is(p)
      ? '<button class="btn" id="boardedit" title="Change this project\'s lanes and their statuses">⚙ Lanes</button>'
      : '<button class="btn" id="boardedit" title="Change this project\'s columns: statuses, colours, WIP limits, “Done when…”">⚙ Board</button>';
  },
  bind(root, p) {
    const b = root.querySelector('#boardedit');
    if (b)
      b.onclick = () => {
        const pr = Store.get(p.id);
        if (Lanes.is(pr)) BoardEdit.lanesDialog(pr);
        else BoardEdit.boardDialog(pr);
      };
  },
  no() {
    UI.toast('Only the project owner or an admin can change the board', 'bad');
  },
  /* when each set of own statuses was in force (null = following the team), for the workflow step check (domain/flowtrust.js) */
  histOf(p, names) {
    return [...(p.boardHist || []), { at: Date.now(), statuses: names }].slice(-30);
  },
  hist(t, to, why) {
    return Object.assign({}, t, {
      status: to,
      hist: [...(t.hist || []), { at: Date.now(), by: App.me, from: t.status, to, tr: why }].slice(-60),
    });
  },

  /* ---------- Lanes ---------- */
  lanesDialog(p) {
    if (!BoardEdit.can(p)) return BoardEdit.no();
    const tpl = Lanes.tplOf(p);
    const list = Lanes.copy(Lanes.of(p));
    const log = (p.laneLog || []).slice(-8).reverse();
    UI.modal({
      title: `⚙ Lanes — ${p.name}`,
      wide: true,
      body: `${tpl ? `<p class="small note-box">This project follows the lane template <b>${h(tpl.name)}</b>. Saving a change gives it <b>its own lanes</b>: later changes to the template no longer apply to it. (An admin can put it back on a template: Edit project → Lane template.)</p>` : '<p class="muted small">This project has its own lanes.</p>'}
        <div id="lneditor"></div>
        ${log.length ? `<h4 class="act-h">Lane changes</h4><div class="tf-hist small">${log.map(x => `<div><span class="muted">${h(U.fmtTs(x.at))}</span> ${h(Store.memberShort(x.by))}: ${h(x.what)}</div>`).join('')}</div>` : ''}`,
      actions:
        '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-lnsave>Save lanes</button>',
      onMount: w => {
        w.querySelector('.modal').classList.add('lane-modal');
        const get = LanesUI.editor(w.querySelector('#lneditor'), list);
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-lnsave]').onclick = () => {
          const m = LanesUI.missing(get());
          if (m) return UI.toast(m, 'bad');
          const next = Lanes.clean(get());
          const pr = Store.get(p.id);
          if (!Lanes.diff(Lanes.of(pr), next).length) {
            UI.closeModal();
            return UI.toast('Nothing changed', '');
          }
          const lost = Lanes.homeless(pr, next).map(x => Object.assign(x, { cat: (Lanes.statusOf(x.t, pr) || {}).cat || 'todo' }));
          LanesUI.askMoves(lost, next, moves => {
            const err = Lanes.save(Store.get(p.id), next, moves);
            UI.closeModal();
            if (err) UI.toast(err, 'bad');
            else UI.toast('Lanes saved — this project now has its own lanes', 'good');
            App.render();
          });
        };
      },
    });
  },

  /* ---------- Kanban / Scrum ---------- */
  boardDialog(p) {
    if (!BoardEdit.can(p)) return BoardEdit.no();
    const cur = TaskFlow.scheme(p);
    const own = TaskFlow.ownFlow(p);
    const base = TaskFlow.schemeBase(p);
    const ownSt = own ? Lanes.cleanStatuses(p.board.statuses) : [];
    const colorOf = s => (/^#[0-9a-f]{6}$/i.test(s.color || '') ? s.color : Lanes.CAT_COLOR[s.cat || 'todo'] || '#64748b');
    const start = cur.statuses.map((s, i) => ({
      id: (ownSt.find(x => x.name === s.name) || {}).id || Lanes.uid('s'),
      orig: s.name,
      name: s.name,
      color: colorOf(s),
      cat: s.cat || 'todo',
      wip: KanbanUI.wip(p, s.name) || '',
      pol: KanbanUI.policy(p, s.name),
    }));
    const rows = start.map(r => Object.assign({}, r));
    const log = (p.boardLog || []).slice(-8).reverse();
    const catSel = v =>
      `<select class="bd-cat" aria-label="Counts as">${Lanes.CATS.map(([k, nm]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${nm}</option>`).join('')}</select>`;
    const table =
      () => `<table class="tbl kb-cols bd-tbl"><thead><tr><th>Status (column)</th><th style="width:56px">Colour</th><th style="width:130px">Counts as</th><th style="width:90px">WIP limit</th><th>Done when…</th><th style="width:96px"></th></tr></thead><tbody>${rows
        .map(
          (r, i) => `<tr data-bdrow="${i}">
        <td><input class="bd-name" value="${h(r.name)}" maxlength="40" aria-label="Status name"></td><td><input type="color" class="bd-color" value="${h(r.color)}" aria-label="Colour"></td><td>${catSel(r.cat)}</td>
        <td><input type="number" class="bd-wip" min="0" step="1" value="${h(r.wip)}" placeholder="none" aria-label="WIP limit"></td><td><input class="bd-pol" value="${h(r.pol)}" maxlength="140" placeholder="e.g. reviewed by a second analyst" aria-label="Done when"></td>
        <td class="row-btns"><button type="button" class="btn xs ghost" data-bdup="${i}" ${i ? '' : 'disabled'} title="Move up">↑</button><button type="button" class="btn xs ghost" data-bddn="${i}" ${i < rows.length - 1 ? '' : 'disabled'} title="Move down">↓</button><button type="button" class="btn xs ghost danger" data-bddel="${i}" ${rows.length > 1 ? '' : 'disabled'} title="Remove">✕</button></td></tr>`
        )
        .join('')}</tbody></table>
      <button type="button" class="btn sm" id="bdadd">＋ Add status</button>`;
    UI.modal({
      title: `⚙ Board — ${p.name}`,
      wide: true,
      body: `<p class="small ${own ? 'muted' : 'note-box'}">${own ? 'This project has <b>its own statuses</b>.' : `This project follows <b>${h(base.name || 'the team’s statuses')}</b>. Changing only the WIP limits or “Done when…” keeps it that way. Changing the statuses (name, colour, counts as, order, add or remove) gives it <b>its own statuses</b>: later changes to the team’s workflow no longer apply to it.`}</p>
        <div id="bdhost">${table()}</div>
        <p class="muted small">WIP limit: the most open cards a column should hold (the header turns red when over — a warning, nothing is blocked). “Done when…”: what a card needs before it moves on (shown as ⓘ on the column).</p>
        ${log.length ? `<h4 class="act-h">Board changes</h4><div class="tf-hist small">${log.map(x => `<div><span class="muted">${h(U.fmtTs(x.at))}</span> ${h(Store.memberShort(x.by))}: ${h(x.what)}</div>`).join('')}</div>` : ''}`,
      actions: `${own ? `<button class="btn ghost" data-bdback title="Drop this project's own statuses">Follow ${h(base.name || 'the team’s statuses')} again</button>` : ''}<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-bdsave>Save</button>`,
      onMount: w => {
        const host = w.querySelector('#bdhost');
        const read = () => {
          host.querySelectorAll('[data-bdrow]').forEach(tr => {
            const r = rows[+tr.dataset.bdrow];
            r.name = tr.querySelector('.bd-name').value.trim();
            r.color = tr.querySelector('.bd-color').value;
            r.cat = tr.querySelector('.bd-cat').value;
            r.wip = tr.querySelector('.bd-wip').value;
            r.pol = tr.querySelector('.bd-pol').value.trim();
          });
        };
        const draw = () => {
          host.innerHTML = table();
          const on = (sel, f) =>
            host.querySelectorAll(sel).forEach(
              b =>
                (b.onclick = () => {
                  read();
                  f(b);
                  draw();
                })
            );
          on('[data-bdup]', b => {
            const i = +b.dataset.bdup;
            [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
          });
          on('[data-bddn]', b => {
            const i = +b.dataset.bddn;
            [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
          });
          on('[data-bddel]', b => {
            rows.splice(+b.dataset.bddel, 1);
          });
          const add = host.querySelector('#bdadd');
          add.onclick = () => {
            read();
            const at = rows.findIndex(r => r.cat === 'done');
            rows.splice(at < 0 ? rows.length : at, 0, {
              id: Lanes.uid('s'),
              orig: '',
              name: '',
              color: Lanes.CAT_COLOR.doing,
              cat: 'doing',
              wip: '',
              pol: '',
            });
            draw();
          };
          host.querySelectorAll('.bd-cat').forEach(
            c =>
              (c.onchange = () => {
                const col = c.closest('tr').querySelector('.bd-color');
                if (Object.values(Lanes.CAT_COLOR).includes(col.value)) col.value = Lanes.CAT_COLOR[c.value];
              })
          );
        };
        draw();
        w.querySelector('[data-c]').onclick = UI.closeModal;
        const back = w.querySelector('[data-bdback]');
        if (back) back.onclick = () => BoardEdit.dropOwn(Store.get(p.id));
        w.querySelector('[data-bdsave]').onclick = () => {
          read();
          if (rows.some(r => !r.name)) return UI.toast('Every status needs a name', 'bad');
          if (new Set(rows.map(r => U.lc(r.name))).size !== rows.length) return UI.toast('Two statuses have the same name', 'bad');
          if (!rows.some(r => r.cat === 'done')) return UI.toast('Keep at least one status that counts as Done', 'bad');
          const wip = {},
            policy = {};
          for (const r of rows) {
            const n = Math.max(0, Math.round(+r.wip || 0));
            if (n) wip[r.name] = n;
            if (r.pol) policy[r.name] = r.pol;
          }
          const pr = Store.get(p.id);
          const same =
            rows.length === start.length &&
            rows.every(
              (r, i) => r.orig === start[i].orig && r.name === start[i].name && r.cat === start[i].cat && r.color === start[i].color
            );
          if (same) {
            Store.save(Object.assign({}, pr, { wip, policy }));
            UI.closeModal();
            UI.toast('Board saved', 'good');
            return App.render();
          }
          // statuses changed → the project's own statuses; renamed ones follow, removed ones: ask where their tasks go
          const statuses = rows.map(r => ({ id: r.id, name: r.name, color: r.color, cat: r.cat }));
          const ren = new Map(rows.filter(r => r.orig).map(r => [r.orig, r.name]));
          const what = [];
          for (const r of rows) {
            if (!r.orig) what.push(`added “${r.name}”`);
            else if (r.orig !== r.name) what.push(`renamed “${r.orig}” → “${r.name}”`);
          }
          for (const s of start) if (!ren.has(s.orig)) what.push(`removed “${s.orig}”`);
          if (!what.length) what.push('colours / order / counts as');
          if (!own) what.unshift(`own statuses (stopped following “${base.name || 'the team’s statuses'}”)`);
          const np = Object.assign({}, pr, {
            board: { statuses },
            wip,
            policy,
            boardLog: [...(pr.boardLog || []), { at: Date.now(), by: App.me, what: what.join('; ') }].slice(-60),
            boardHist: BoardEdit.histOf(
              pr,
              statuses.map(x => x.name)
            ),
          });
          const tasks = Scrum.items(p.id).filter(t => t.status !== 'Canceled');
          const nw = { id: 'own-new', name: 'the new statuses', statuses: statuses.map(s => ({ name: s.name, cat: s.cat })) };
          const lost = tasks.filter(t => !ren.has(t.status));
          const guess = t => {
            const c = TaskFlow.cat(t);
            return (statuses.find(s => s.cat === c) || statuses[0]).name;
          };
          const go = map => {
            const recs = []; // the project is saved FIRST: the moves are checked against its new statuses
            for (const t of tasks) {
              if (ren.has(t.status)) {
                const to = ren.get(t.status);
                if (to !== t.status) recs.push(BoardEdit.hist(t, to, 'Status renamed'));
                continue;
              }
              const to = (map && map[t.status + '|' + nw.id]) || guess(t);
              recs.push(BoardEdit.hist(t, to, 'Board changed'));
            }
            Store.save(np);
            if (recs.length) Store.saveMany(recs);
            UI.closeModal();
            UI.toast(
              `Board saved — this project now has its own statuses${recs.length ? ` · ${recs.length} task(s) updated` : ''}`,
              'good'
            );
            App.render();
          };
          if (!lost.length) return go(null);
          TaskFlowAdmin.mapDialog(
            lost.map(t => ({ t, w: nw, to: guess(t) })),
            go
          );
        };
      },
    });
  },
  /* back to the team / chosen workflow: tasks whose status it does not have are moved (asked first) */
  dropOwn(p) {
    if (!BoardEdit.can(p) || !TaskFlow.ownFlow(p)) return;
    const base = TaskFlow.schemeBase(p);
    const names = new Set(base.statuses.map(s => s.name));
    const np = Object.assign({}, p, {
      boardLog: [
        ...(p.boardLog || []),
        { at: Date.now(), by: App.me, what: `follows “${base.name || 'the team’s statuses'}” again` },
      ].slice(-60),
      boardHist: BoardEdit.histOf(p, null),
    });
    delete np.board;
    const wip = {},
      policy = {};
    for (const [k, v] of Object.entries(p.wip || {})) if (names.has(k)) wip[k] = v;
    for (const [k, v] of Object.entries(p.policy || {})) if (names.has(k)) policy[k] = v;
    np.wip = wip;
    np.policy = policy;
    const lost = Scrum.items(p.id).filter(t => t.status !== 'Canceled' && !names.has(t.status));
    const guess = t => {
      const c = TaskFlow.cat(t);
      return (base.statuses.find(s => (s.cat || 'todo') === c) || { name: base.start }).name;
    };
    const go = map => {
      const recs = lost.map(t => BoardEdit.hist(t, (map && map[t.status + '|' + base.id]) || guess(t), 'Workflow changed'));
      Store.save(np);
      if (recs.length) Store.saveMany(recs);
      UI.closeModal();
      UI.toast(`Now follows “${base.name || 'the team’s statuses'}”${lost.length ? ` · ${lost.length} task(s) moved` : ''}`, 'good');
      App.render();
    };
    if (!lost.length) return go(null);
    TaskFlowAdmin.mapDialog(
      lost.map(t => ({ t, w: base, to: guess(t) })),
      go
    );
  },
};

/* the Kanban / Scrum boards used ⚙ Columns (WIP + "Done when…"): ⚙ Board replaces it — same place, next to ＋ Add task */
KanbanUI.button = p => BoardEdit.button(p);
KanbanUI.bind = (root, p) => BoardEdit.bind(root, p);
