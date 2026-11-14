/* MAHAM — 📚 Knowledge base on screen (domain/kb.js).
 *   Reference → Knowledge base: search, filters (team, tag, made from, writer), ＋ New article, open an article
 *   (problem, solution, tags, where it came from), edit / remove by the writer, the team's managers or the super admin.
 *   Item forms (To Do, shadow work, quick win, project task, follow-up, Good Catch): a "📚 Knowledge base" box at the bottom
 *   — tick it to write the article (filled from the item), untick to take it out. */
'use strict';

const KBUI = {
  fields(a) {
    return `<div class="grid-form kb-form">
      <label class="fld span2"><span>Title</span><input class="kb-title" value="${h(a.title || '')}" maxlength="120" placeholder="e.g. Lab order not reaching the analyser"></label>
      <label class="fld span2"><span>Problem</span><textarea class="kb-problem" rows="3" placeholder="What was wrong, where, how it showed">${h(a.problem || '')}</textarea></label>
      <label class="fld span2"><span>Solution</span><textarea class="kb-solution" rows="4" placeholder="How it was solved, the setting, who to contact">${h(a.solution || '')}</textarea></label>
      <label class="fld"><span>Tags / module</span><input class="kb-tags" value="${h((a.tags || []).join(', '))}" placeholder="e.g. Lab, Orders" title="Separate with commas"></label>
      <label class="fld"><span>Who can read it</span><select class="kb-vis">${KB.VIS.map(([k, l]) => `<option value="${k}" ${(a.vis || 'team') === k ? 'selected' : ''}>${h(l)}</option>`).join('')}</select></label>
      <p class="note span2 kb-patient">⚠ ${h(KB.PATIENT)}</p></div>`;
  },
  read(host) {
    const v = s => (host.querySelector(s) || {}).value || '';
    return {
      title: v('.kb-title'),
      problem: v('.kb-problem'),
      solution: v('.kb-solution'),
      tags: v('.kb-tags'),
      vis: v('.kb-vis') || 'team',
    };
  },
  srcLabel(a) {
    if (!a.on) return 'Written from scratch';
    const r = KB.source(a);
    const kind = KB.COLLS[(r || {}).c || a.onC] || 'Item';
    return r
      ? `${h(kind)}: <a href="#" class="link" data-kbsrc="${h(a.id)}">${h(KB.itemTitle(r) || 'open')}</a>`
      : `${h(kind)} (no longer there)`;
  },
  openSrc(a) {
    const r = KB.source(a);
    if (!r) return UI.toast('That item is no longer there', 'bad');
    UI.closeModal();
    setTimeout(() => UI.editRecord(r.c, r), 0);
  },

  /* new or edit (prev = the article) */
  editor(a, prev) {
    UI.modal({
      title: prev ? 'Edit article' : '📚 New Knowledge base article',
      wide: true,
      body: `<div id="kbed">${KBUI.fields(a)}</div>`,
      actions: `${prev ? '<button class="btn danger ghost" data-kbdel>Remove</button>' : ''}<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-kbsave>${prev ? 'Save' : 'Add to Knowledge base'}</button>`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-kbsave]').onclick = () => {
          const v = Object.assign({}, a, KBUI.read(w.querySelector('#kbed')));
          const m = KB.missing(v);
          if (m) return UI.toast(m, 'bad');
          KB.save(v, prev);
          UI.closeModal();
          UI.toast(prev ? 'Article saved' : 'Added to the Knowledge base', 'good');
          App.render();
        };
        const d = w.querySelector('[data-kbdel]');
        if (d)
          d.onclick = () =>
            UI.confirm(`Remove “${prev.title}” from the Knowledge base?`, () => {
              KB.remove(prev);
              UI.toast('Article removed', 'good');
              App.render();
            });
      },
    });
  },
  view(a) {
    const para = t => (t ? `<div class="kb-text">${Links.linkify(t).replace(/\n/g, '<br>')}</div>` : '<div class="muted small">—</div>');
    UI.modal({
      title: `📚 ${a.title}`,
      wide: true,
      body: `<div class="kb-meta small muted">${KBUI.badges(a)} · ${h(Store.memberShort(a.by) || a.by)}, ${h(U.fmtTs(a.at))}${a.edited ? ` · edited ${h(U.fmtTs(a.edited))}${a.editedBy && a.editedBy !== a.by ? ' by ' + h(Store.memberShort(a.editedBy)) : ''}` : ''}</div>
        <h4 class="act-h">Problem</h4>${para(a.problem)}<h4 class="act-h">Solution</h4>${para(a.solution)}
        <div class="small kb-from">From: ${KBUI.srcLabel(a)}</div>`,
      actions: `<span class="grow"></span><button class="btn" data-c>Close</button>${KB.canEdit(a) ? '<button class="btn primary" data-kbedit>Edit</button>' : ''}`,
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        const e = w.querySelector('[data-kbedit]');
        if (e) e.onclick = () => KBUI.editor(a, a);
        const s = w.querySelector('[data-kbsrc]');
        if (s)
          s.onclick = ev => {
            ev.preventDefault();
            KBUI.openSrc(a);
          };
      },
    });
  },
  badges(a) {
    return `${(a.tags || []).map(t => `<span class="chip kb-tag">${h(t)}</span>`).join(' ')} <span class="badge" title="Who can read it">${a.vis === 'all' ? 'Everyone' : h(Store.teamName(a.team || 'apps')) + ' only'}</span>`;
  },

  /* ---------- the box at the bottom of an item's form ---------- */
  box(rec) {
    if (!rec || !rec.id || !KB.COLLS[rec.c]) return '';
    const mine = KB.of(rec.id);
    const shown = mine.filter(KB.canRead);
    const can = KB.canMark(rec);
    if (!shown.length && !can) return '';
    return `<div class="kbbox" id="kbbox"><div class="rn-head">📚 <b>Knowledge base</b>${can ? ` <label class="kb-mark"><input type="checkbox" id="kbmark" ${mine.length ? 'checked' : ''}> ${mine.length ? 'In the Knowledge base' : 'Add this to the Knowledge base'}</label>` : ''}<span class="muted small"> — how it was solved, for the next person</span></div>
      ${shown.map(a => `<div class="li kb-li"><span class="grow"><a href="#" class="link" data-kbopen="${h(a.id)}"><b>${h(a.title)}</b></a> <span class="muted small">· ${h(Store.memberShort(a.by))}</span> ${KBUI.badges(a)}</span></div>`).join('')}
      <div id="kbinline"></div></div>`;
  },
  bind(w, rec) {
    const host = w.querySelector('#kbbox');
    if (!host) return;
    const redraw = () => {
      const n = w.querySelector('#kbbox');
      if (n) {
        n.outerHTML = KBUI.box(Store.get(rec.id) || rec);
        KBUI.bind(w, rec);
      }
    };
    host.querySelectorAll('[data-kbopen]').forEach(
      x =>
        (x.onclick = e => {
          e.preventDefault();
          const a = KB.get(x.dataset.kbopen);
          if (a) KBUI.view(a);
        })
    );
    host.querySelectorAll('input, textarea, select').forEach(x => x.addEventListener('keydown', e => e.stopPropagation()));
    const cb = host.querySelector('#kbmark');
    if (!cb) return;
    const inl = host.querySelector('#kbinline');
    cb.onchange = () => {
      const mine = KB.of(rec.id);
      if (cb.checked && !mine.length) {
        const d = KB.draft(Store.get(rec.id) || rec);
        inl.innerHTML = `${KBUI.fields(d)}<div class="row-btns"><span class="grow"></span><button type="button" class="btn sm ghost" data-kbx>Cancel</button><button type="button" class="btn sm primary" data-kbok>Add to Knowledge base</button></div>`;
        inl.querySelectorAll('input, textarea, select').forEach(x => x.addEventListener('keydown', e => e.stopPropagation()));
        inl.querySelector('[data-kbx]').onclick = () => {
          cb.checked = false;
          inl.innerHTML = '';
        };
        inl.querySelector('[data-kbok]').onclick = () => {
          const v = Object.assign({}, d, KBUI.read(inl));
          const m = KB.missing(v);
          if (m) return UI.toast(m, 'bad');
          KB.save(v, null);
          UI.toast('Added to the Knowledge base', 'good');
          redraw();
        };
        const t = inl.querySelector('.kb-title');
        if (t) t.focus();
      } else if (!cb.checked && mine.length) {
        const mayGo = mine.filter(KB.canEdit);
        if (!mayGo.length) {
          cb.checked = true;
          return UI.toast('Only the writer or a manager can take the article out', 'bad');
        }
        inl.innerHTML = `<div class="insights warnbox"><div>Take ${mayGo.length > 1 ? 'these articles' : '“' + h(mayGo[0].title) + '”'} out of the Knowledge base? <button type="button" class="btn sm danger" data-kbrm>Remove</button> <button type="button" class="btn sm ghost" data-kbkeep>Keep</button></div></div>`;
        inl.querySelector('[data-kbkeep]').onclick = () => {
          cb.checked = true;
          inl.innerHTML = '';
        };
        inl.querySelector('[data-kbrm]').onclick = () => {
          mayGo.forEach(KB.remove);
          UI.toast('Taken out of the Knowledge base', 'good');
          redraw();
        };
      } else inl.innerHTML = '';
    };
  },
};

/* ---------- Reference → 📚 Knowledge base ---------- */
P.kb = () => {
  const s = ps('kb');
  const q = U.lc(s.q || '');
  const all = KB.list();
  const tags = [...new Set(all.flatMap(a => a.tags || []))].sort((a, b) => a.localeCompare(b));
  const teams = [...new Set(all.map(a => a.team || 'apps'))];
  const writers = [...new Set(all.map(a => a.by))];
  const srcOf = a => (a.on ? (KB.source(a) || {}).c || a.onC : 'free');
  const rows = all.filter(
    a =>
      (!q || [a.title, a.problem, a.solution, (a.tags || []).join(' '), Store.memberShort(a.by)].some(x => U.lc(x || '').includes(q))) &&
      (!s.tag || (a.tags || []).includes(s.tag)) &&
      (!s.team || (a.team || 'apps') === s.team) &&
      (!s.by || a.by === s.by) &&
      (!s.src || srcOf(a) === s.src)
  );
  const sel = (id, label, cur, opts) =>
    `<select class="flt" id="${id}" aria-label="${h(label)}"><option value="">${h(label)}: all</option>${opts.map(([v, l]) => `<option value="${h(v)}" ${cur === v ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>`;
  const snip = t => {
    t = String(t || '')
      .replace(/\s+/g, ' ')
      .trim();
    return t.length > 170 ? t.slice(0, 170) + '…' : t;
  };
  const html = `<div class="page-actions kb-bar"><input class="search" type="search" id="kbq" placeholder="Search the Knowledge base…" value="${h(s.q || '')}" aria-label="Search">
      ${sel(
        'kbtag',
        'Tag',
        s.tag || '',
        tags.map(t => [t, t])
      )}${
        teams.length > 1
          ? sel(
              'kbteam',
              'Team',
              s.team || '',
              teams.map(t => [t, Store.teamName(t)])
            )
          : ''
      }
      ${sel('kbsrc', 'Made from', s.src || '', [...Object.entries(KB.COLLS), ['free', 'Written from scratch']])}${sel(
        'kbby',
        'Writer',
        s.by || '',
        writers.map(w => [w, Store.memberShort(w) || w])
      )}
      <span class="grow"></span>${App.preview ? '' : '<button class="btn primary" id="kbnew">＋ New article</button>'}</div>
    ${UI.howto('How problems were solved, for the next person. Add one with ＋ New article, or tick <b>📚 Knowledge base</b> at the bottom of a To Do, shadow work, quick win, project task, follow-up or Good Catch.')}
    ${
      rows.length
        ? `<div class="kb-list">${rows
            .map(
              a => `<div class="card kb-card click" data-kb="${h(a.id)}"><div class="kb-h"><b>${h(a.title)}</b><span class="grow"></span><span class="muted small nw">${h(U.fmtDate(U.ds(new Date(a.edited || a.at))))}</span></div>
      <div class="small">${h(snip(a.solution || a.problem))}</div><div class="small muted kb-meta">${KBUI.badges(a)} · ${h(Store.memberShort(a.by) || a.by)} · ${a.on ? h(KB.COLLS[srcOf(a)] || 'Item') : 'Written from scratch'}</div></div>`
            )
            .join('')}</div>`
        : empty(all.length ? 'No articles match.' : 'No articles yet — ＋ New article, or tick 📚 Knowledge base on a piece of work.')
    }`;
  return {
    title: '📚 Knowledge base',
    html,
    mount(root) {
      const qi = root.querySelector('#kbq');
      if (qi)
        qi.oninput = U.debounce(() => {
          s.q = qi.value;
          App.render(true);
          const n = UI.$('#kbq');
          if (n) {
            n.focus();
            n.setSelectionRange(n.value.length, n.value.length);
          }
        }, 250);
      [
        ['kbtag', 'tag'],
        ['kbteam', 'team'],
        ['kbsrc', 'src'],
        ['kbby', 'by'],
      ].forEach(([id, k]) => {
        const e = root.querySelector('#' + id);
        if (e)
          e.onchange = () => {
            s[k] = e.value;
            App.render();
          };
      });
      const nw = root.querySelector('#kbnew');
      if (nw) nw.onclick = () => KBUI.editor({ vis: 'team', team: (Store.member(App.me) || {}).team || 'apps', tags: [] }, null);
      root.querySelectorAll('[data-kb]').forEach(
        c =>
          (c.onclick = () => {
            const a = KB.get(c.dataset.kb);
            if (a) KBUI.view(a);
          })
      );
    },
  };
};
