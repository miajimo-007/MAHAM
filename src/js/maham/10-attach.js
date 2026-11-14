/* MAHAM — 📎 Attachments on any piece of work (To Do, shadow work, quick win, follow-up, project task, project, request,
 * meeting, personal task, Good Catch, ticket, deal …).
 * The file itself goes into the data folder: Attachments/<person>/<id>-<name> — through the same storage as everything
 * else, so it works online (database), with a shared folder and on this device. What it is (name, size, type, which
 * item) is a small record in the person's own data, like a note:
 *   { c: 'attach', id: 'attach-<by>-<time>', on: <item id>, onC, team, by, at, name, size, type, path }
 * Everyone who can open the item sees and downloads its files; the person who added one (or an admin) removes it.
 * Online, the database lets each person write only under Attachments/<their id>/ (supabase/schema.sql). */
'use strict';

const Attach = {
  MAX: 10 * 1024 * 1024, // 10 MB a file
  BLOCKED: /\.(exe|bat|cmd|com|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|msi|msp|scr|cpl|hta|jar|lnk|reg|dll)$/i,
  COLLS: [
    'todo',
    'shadow',
    'quickwin',
    'gcatch',
    'central',
    'mytask',
    'mgrtask',
    'ptask',
    'action',
    'oncall',
    'project',
    'request',
    'meeting',
    'kbarticle',
  ],
  extraColls: [], // later modules add theirs (tickets, deals …)
  index() {
    return Calc.memo('attach', () => {
      const m = new Map();
      for (const a of Store.byC.attach || []) {
        if (!a || a._del || !a.on) continue;
        if (!m.has(a.on)) m.set(a.on, []);
        m.get(a.on).push(a);
      }
      for (const l of m.values()) l.sort((x, y) => (y.at || 0) - (x.at || 0));
      return m;
    });
  },
  of(id) {
    if (!id) return [];
    const ix = Attach.index();
    const ids = typeof Conv !== 'undefined' ? Conv.family(id) : [id];
    return ids.flatMap(i => ix.get(i) || []).sort((a, b) => (b.at || 0) - (a.at || 0));
  },
  count(id) {
    return Attach.of(id).length;
  },
  canRemove(a) {
    return !!a && !App.preview && (a.by === App.me || App.isSuper());
  },
  safeName(n) {
    const t = [...String(n || 'file')]
      .map(ch => (ch.charCodeAt(0) < 32 || (String.fromCharCode(92) + '/:*?"<>|').includes(ch) ? '_' : ch))
      .join('');
    return t.replace(/^[._ ]+/, '').slice(0, 120) || 'file';
  },
  kb(n) {
    return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';
  },
  icon(a) {
    const n = (a.name || '').toLowerCase();
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n)
      ? '🖼'
      : /\.pdf$/.test(n)
        ? '📕'
        : /\.(xlsx?|csv)$/.test(n)
          ? '📊'
          : /\.(docx?|txt|rtf|odt)$/.test(n)
            ? '📄'
            : /\.(zip|7z|rar)$/.test(n)
              ? '🗜'
              : '📎';
  },
  async dir(create) {
    if (!Store.dataDir) throw new Error('The data folder is not open');
    const top = await Store.dataDir.getDirectoryHandle('Attachments', { create });
    return { top, mine: create ? await top.getDirectoryHandle(App.me, { create: true }) : null };
  },
  /* why a file cannot be added ('' = it can) */
  refuse(f) {
    if (!f) return 'Choose a file';
    if (Attach.BLOCKED.test(f.name)) return `${f.name}: programs and scripts cannot be attached`;
    if (f.size > Attach.MAX) return `${f.name} is ${Attach.kb(f.size)} — the most is ${Attach.kb(Attach.MAX)}`;
    if (!f.size) return `${f.name} is empty`;
    return '';
  },
  async add(rec, file) {
    const why = Attach.refuse(file);
    if (why) throw new Error(why);
    if (!App.me || App.preview) throw new Error('Sign in to attach files');
    const id = `attach-${App.me}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const fname = `${id.slice(7)}-${Attach.safeName(file.name)}`;
    const { mine } = await Attach.dir(true);
    const fh = await mine.getFileHandle(fname, { create: true });
    const w = await fh.createWritable();
    await w.write(file);
    await w.close();
    const a = {
      c: 'attach',
      id,
      on: rec.id,
      onC: rec.c,
      by: App.me,
      at: Date.now(),
      name: file.name,
      size: file.size,
      type: file.type || '',
      path: `Attachments/${App.me}/${fname}`,
    };
    if (rec.team) a.team = rec.team;
    Store.save(a);
    return a;
  },
  async open(a) {
    const parts = (a.path || '').split('/');
    if (parts.length !== 3) throw new Error('This file cannot be found');
    const { top } = await Attach.dir(false);
    const d = await top.getDirectoryHandle(parts[1]);
    const f = await (await d.getFileHandle(parts[2])).getFile();
    const url = URL.createObjectURL(new Blob([f], { type: a.type || 'application/octet-stream' }));
    const x = document.createElement('a');
    x.href = url;
    x.download = a.name || parts[2];
    document.body.appendChild(x);
    x.click();
    x.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
  async remove(a) {
    if (!Attach.canRemove(a)) throw new Error('Only the person who added it can remove it');
    const parts = (a.path || '').split('/');
    try {
      const { top } = await Attach.dir(false);
      const d = await top.getDirectoryHandle(parts[1]);
      await d.removeEntry(parts[2]);
    } catch (e) {
      /* the file is already gone */
    }
    Store.save(Object.assign({}, a, { _del: true }));
  },
  box(rec) {
    if (!rec || !rec.id || !Store.get(rec.id)) return '';
    const list = Attach.of(rec.id);
    const can = !App.preview && !!App.me;
    const li =
      a => `<div class="at-item" data-at="${h(a.id)}"><span class="at-ic">${Attach.icon(a)}</span><a href="#" class="link at-name" data-atopen="${h(a.id)}" title="Download">${h(a.name)}</a>
      <span class="muted small">${Attach.kb(a.size || 0)} · ${h(Store.memberShort(a.by) || a.by)} · ${h(U.fmtTs(a.at))}</span>${Attach.canRemove(a) ? `<span class="grow"></span><a href="#" class="link small" data-atdel="${h(a.id)}">Remove</a>` : ''}</div>`;
    return `<div class="attach" id="attachbox"><div class="at-head">📎 <b>Attachments</b> <span class="count">${list.length}</span>${can ? `<span class="grow"></span><label class="btn sm">＋ Add files<input type="file" id="atfile" multiple hidden></label>` : ''}</div>
      ${can ? '<div class="at-drop muted small" id="atdrop">…or drop files here · up to 10 MB each</div>' : ''}
      <div class="at-list">${list.length ? list.map(li).join('') : '<div class="muted small">No files yet.</div>'}</div></div>`;
  },
  bind(w, rec) {
    const host = w.querySelector('#attachbox');
    if (!host) return;
    const redraw = () => {
      const n = w.querySelector('#attachbox');
      if (n) {
        n.outerHTML = Attach.box(Store.get(rec.id) || rec);
        Attach.bind(w, rec);
      }
    };
    const addAll = async files => {
      const list = [...files];
      if (!list.length) return;
      let ok = 0;
      for (const f of list) {
        try {
          await Attach.add(rec, f);
          ok++;
        } catch (e) {
          UI.toast(e.message, 'bad');
        }
      }
      if (ok) UI.toast(ok === 1 ? 'File attached' : `${ok} files attached`, 'good');
      redraw();
    };
    const inp = host.querySelector('#atfile');
    if (inp) inp.onchange = () => addAll(inp.files);
    const drop = host.querySelector('#atdrop');
    if (drop) {
      ['dragenter', 'dragover'].forEach(t =>
        host.addEventListener(t, e => {
          e.preventDefault();
          drop.classList.add('on');
        })
      );
      ['dragleave', 'drop'].forEach(t =>
        host.addEventListener(t, e => {
          e.preventDefault();
          drop.classList.remove('on');
        })
      );
      host.addEventListener('drop', e => addAll(e.dataTransfer.files));
    }
    host.querySelectorAll('[data-atopen]').forEach(
      x =>
        (x.onclick = async e => {
          e.preventDefault();
          const a = Store.get(x.dataset.atopen);
          try {
            await Attach.open(a);
          } catch (er) {
            UI.toast(er.message || 'Could not open the file', 'bad');
          }
        })
    );
    host.querySelectorAll('[data-atdel]').forEach(
      x =>
        (x.onclick = e => {
          e.preventDefault();
          const a = Store.get(x.dataset.atdel);
          if (!a) return;
          UI.confirm(`Remove ${a.name}?`, async () => {
            try {
              await Attach.remove(a);
              UI.toast('File removed', 'good');
            } catch (er) {
              UI.toast(er.message, 'bad');
            }
            redraw();
          });
        })
    );
  },
  /* the box in every record form of these kinds (after the notes) */
  install(coll) {
    if (!Schemas[coll] || (Schemas[coll]._ext || []).some(e => e.name === 'attach')) return;
    Schemas.extend(coll, {
      name: 'attach',
      mount(form, base) {
        if (!base || !base.id || !Store.get(base.id)) return;
        const w = form.closest('.modal') || form.parentNode || form;
        if (w.querySelector('#attachbox')) return;
        const after = w.querySelector('#refnotes') || w.querySelector('#recform');
        if (!after) return;
        after.insertAdjacentHTML('afterend', Attach.box(base));
        Attach.bind(w, base);
      },
    });
  },
};

Attach.COLLS.forEach(c => Attach.install(c));
