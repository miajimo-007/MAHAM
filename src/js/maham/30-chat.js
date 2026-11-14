/* MAHAM — 💬 Chat: channels, direct messages, threads and @mentions, next to the work.
 * Records (each in the writer's own data, like everything else):
 *   chchan  { id: 'chchan-<by>-…', name, about, priv (only its members), members [ids], by, at, archived }
 *   chmsg   { id: 'chmsg-<by>-…', ch (channel id, or 'dm:<a>|<b>'), by, at, text, parent (a thread's first message),
 *             on (an item id this message is about), aud [ids] (who may read it — private channels and direct messages) }
 *   chread  { id: 'chread-<me>', last: { <channel>: time } }   what I have read
 * Everyone in the company sees public channels. A private channel or a direct message carries its readers in "aud";
 * online, the database gives such messages only to them (supabase/schema.sql, records_read). Each item form gets
 * "💬 Discuss": a thread about that item in its team's channel. @Name tells that person (🔔). */
'use strict';

const Chat = {
  LIMIT: 300, // messages shown per channel
  cur: '',
  thread: '', // the open channel and thread
  /* ---------- channels ---------- */
  general() {
    return {
      id: 'chchan-general',
      c: 'chchan',
      name: 'general',
      about: 'Everyone in the company',
      priv: false,
      members: [],
      builtin: true,
    };
  },
  channels() {
    const list = (Store.byC.chchan || []).filter(
      c => c && !c._del && !c.archived && (!c.priv || (c.members || []).includes(App.me) || App.isSuper())
    );
    return [Chat.general(), ...list.sort((a, b) => String(a.name).localeCompare(String(b.name)))];
  },
  chan(id) {
    return id === 'chchan-general' ? Chat.general() : Store.get(id);
  },
  dmId(other) {
    return 'dm:' + [App.me, other].sort().join('|');
  },
  dmOther(id) {
    const p = id.slice(3).split('|');
    return p[0] === App.me ? p[1] : p[0];
  },
  isDm(id) {
    return String(id).startsWith('dm:');
  },
  canSee(id) {
    if (Chat.isDm(id)) return id.slice(3).split('|').includes(App.me);
    const c = Chat.chan(id);
    return !!c && (!c.priv || (c.members || []).includes(App.me) || App.isSuper());
  },
  title(id) {
    if (Chat.isDm(id)) return '@' + (Store.memberShort(Chat.dmOther(id)) || Chat.dmOther(id));
    const c = Chat.chan(id);
    return c ? '#' + c.name : '#?';
  },
  audience(id) {
    if (Chat.isDm(id)) return id.slice(3).split('|');
    const c = Chat.chan(id);
    return c && c.priv ? [...new Set([...(c.members || []), c.by].filter(Boolean))] : null;
  },
  /* ---------- messages ---------- */
  msgs(ch) {
    return (Store.byC.chmsg || [])
      .filter(m => m && !m._del && m.ch === ch && !m.parent)
      .sort((a, b) => (a.at || 0) - (b.at || 0))
      .slice(-Chat.LIMIT);
  },
  replies(id) {
    return (Store.byC.chmsg || []).filter(m => m && !m._del && m.parent === id).sort((a, b) => (a.at || 0) - (b.at || 0));
  },
  dms() {
    // my direct-message conversations, newest first
    const last = new Map();
    for (const m of Store.byC.chmsg || []) {
      if (!m || m._del || !Chat.isDm(m.ch) || !Chat.canSee(m.ch)) continue;
      if (!last.has(m.ch) || last.get(m.ch) < m.at) last.set(m.ch, m.at);
    }
    return [...last.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  },
  readRec() {
    return Store.get('chread-' + App.me) || { id: 'chread-' + App.me, c: 'chread', member: App.me, last: {} };
  },
  unread(ch) {
    const t = (Chat.readRec().last || {})[ch] || 0;
    return (Store.byC.chmsg || []).filter(m => m && !m._del && m.ch === ch && m.by !== App.me && (m.at || 0) > t).length;
  },
  unreadAll() {
    if (!App.me) return 0;
    return [...Chat.channels().map(c => c.id), ...Chat.dms()].reduce((n, id) => n + (Chat.canSee(id) ? Chat.unread(id) : 0), 0);
  },
  markRead(ch) {
    if (!App.me || App.preview || !Chat.unread(ch)) return;
    const r = Chat.readRec();
    Store.save(Object.assign({}, r, { last: Object.assign({}, r.last || {}, { [ch]: Date.now() }), _nolog: true }));
  },
  send(ch, text, parent, on) {
    text = String(text || '').trim();
    if (!text || !App.me || App.preview) return null;
    if (text.length > 4000) {
      UI.toast('A message can be up to 4000 characters', 'bad');
      return null;
    }
    const m = { c: 'chmsg', id: Maham.uid('chmsg'), ch, by: App.me, at: Date.now(), text };
    if (parent) m.parent = parent;
    if (on) m.on = on;
    const aud = Chat.audience(ch);
    if (aud) m.aud = aud;
    Store.save(m);
    return m;
  },
  edit(m, text) {
    if (!m || m.by !== App.me) return;
    Store.save(Object.assign({}, m, { text: String(text).trim(), edited: Date.now() }));
  },
  remove(m) {
    if (!m || !(m.by === App.me || App.isSuper())) return;
    Store.save(Object.assign({}, m, { _del: true }));
  },
  newChannel() {
    UI.modal({
      title: 'New channel',
      body: `<div class="grid-form" style="grid-template-columns:1fr">
        <label class="fld"><span>Name</span><input id="chname" maxlength="40" placeholder="e.g. support, project-x"></label>
        <label class="fld"><span>What it is for</span><input id="chabout" maxlength="160"></label>
        <label class="fld"><span><input type="checkbox" id="chpriv"> Private — only the people below see it</span></label>
        <label class="fld"><span>People (for a private channel)</span><select id="chmem" multiple size="6">${Maham.people()
          .filter(p => p.id !== App.me)
          .map(p => `<option value="${h(p.id)}">${h(p.name)}</option>`)
          .join('')}</select></label></div>`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Create</button>',
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = () => {
          const name = w
            .querySelector('#chname')
            .value.trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
          if (!name) return UI.toast('Give the channel a name', 'bad');
          if (Chat.channels().some(c => c.name === name)) return UI.toast('There is already a #' + name, 'bad');
          const priv = w.querySelector('#chpriv').checked;
          const members = priv ? [App.me, ...[...w.querySelector('#chmem').selectedOptions].map(o => o.value)] : [];
          const c = {
            c: 'chchan',
            id: Maham.uid('chchan'),
            name,
            about: w.querySelector('#chabout').value.trim(),
            priv,
            members,
            by: App.me,
            at: Date.now(),
          };
          Store.save(c);
          UI.closeModal();
          location.hash = '#/chat/' + encodeURIComponent(c.id);
        };
      },
    });
  },
  /* ---------- the page ---------- */
  msgHtml(m, inThread) {
    const n = inThread ? 0 : Chat.replies(m.id).length;
    const mine = m.by === App.me;
    const item = m.on && Store.get(m.on);
    return `<div class="ch-msg${mine ? ' mine' : ''}" data-msg="${h(m.id)}"><div class="ch-meta"><b>${h(Store.memberShort(m.by) || m.by)}</b> <span class="muted small">${h(Maham.when(m.at))}${m.edited ? ' · edited' : ''}</span>
      <span class="ch-acts">${inThread ? '' : `<a href="#" class="link small" data-reply="${h(m.id)}">Reply</a>`}${mine ? ` <a href="#" class="link small" data-medit="${h(m.id)}">Edit</a>` : ''}${mine || App.isSuper() ? ` <a href="#" class="link small" data-mdel="${h(m.id)}">Delete</a>` : ''}</span></div>
      ${item ? `<div class="ch-on">about <a href="#" class="link" data-onitem="${h(item.id)}">${h(Chat.itemLabel(item))}</a></div>` : ''}
      <div class="ch-text">${Maham.rich(m.text)}</div>${n ? `<a href="#" class="link small ch-thr" data-reply="${h(m.id)}">💬 ${n} repl${n === 1 ? 'y' : 'ies'}</a>` : ''}</div>`;
  },
  itemLabel(r) {
    const k = (Schemas[r.c] && Schemas[r.c].keyOf && Schemas[r.c].keyOf(r)) || (r.tdNo ? 'TD-' + r.tdNo : '');
    return (k ? k + ' ' : '') + (r.task || r.title || r.subject || r.name || r.id);
  },
  composer(id, ph) {
    return `<div class="ch-comp"><textarea id="${id}" rows="2" placeholder="${h(ph)}" aria-label="Message"></textarea><button class="btn primary" data-send="${id}">Send</button></div><div class="muted small ch-hint">Enter sends · Shift+Enter new line · @Name tells them</div>`;
  },
  render(sub) {
    if (!App.me) return { title: 'Chat', html: '<div class="card"><p>Sign in to chat.</p></div>' };
    const chans = Chat.channels();
    const dms = Chat.dms();
    let cur = sub ? decodeURIComponent(sub) : Chat.cur || 'chchan-general';
    if (!Chat.canSee(cur)) cur = 'chchan-general';
    Chat.cur = cur;
    const side = `<div class="ch-side"><div class="ch-sh">Channels <a href="#" class="link small" id="chnew" title="New channel">＋</a></div>
      ${chans
        .map(c => {
          const u = Chat.unread(c.id);
          return `<a href="#/chat/${encodeURIComponent(c.id)}" class="ch-it${c.id === cur ? ' on' : ''}">${c.priv ? '🔒' : '#'} ${h(c.name)}${u ? `<span class="count">${u}</span>` : ''}</a>`;
        })
        .join('')}
      <div class="ch-sh">Direct messages <a href="#" class="link small" id="chdm" title="Message someone">＋</a></div>
      ${
        dms
          .map(id => {
            const u = Chat.unread(id);
            return `<a href="#/chat/${encodeURIComponent(id)}" class="ch-it${id === cur ? ' on' : ''}">@ ${h(Store.memberShort(Chat.dmOther(id)) || Chat.dmOther(id))}${u ? `<span class="count">${u}</span>` : ''}</a>`;
          })
          .join('') || '<div class="muted small ch-none">None yet</div>'
      }</div>`;
    const c = Chat.chan(cur);
    const list = Chat.msgs(cur);
    const head = `<div class="ch-head"><b>${h(Chat.title(cur))}</b>${c && c.about ? ` <span class="muted small">— ${h(c.about)}</span>` : ''}${c && c.priv ? ` <span class="muted small">· ${(c.members || []).length} people</span>` : ''}${Chat.isDm(cur) ? ' <span class="muted small">· only the two of you</span>' : ''}</div>`;
    const thr = Chat.thread && Store.get(Chat.thread) && Store.get(Chat.thread).ch === cur ? Store.get(Chat.thread) : null;
    const html = `<div class="chat${thr ? ' with-thread' : ''}">${side}<div class="ch-main">${head}<div class="ch-list" id="chlist">${list.length ? list.map(m => Chat.msgHtml(m)).join('') : '<div class="muted ch-empty">No messages yet — say hello.</div>'}</div>${Chat.composer('chtext', 'Message ' + Chat.title(cur))}</div>
      ${
        thr
          ? `<div class="ch-thread"><div class="ch-head"><b>Thread</b><span class="grow"></span><a href="#" class="link small" id="chclose">Close</a></div><div class="ch-list">${Chat.msgHtml(thr, true)}${Chat.replies(
              thr.id
            )
              .map(m => Chat.msgHtml(m, true))
              .join('')}</div>${Chat.composer('chreply', 'Reply')}</div>`
          : ''
      }</div>`;
    return {
      title: 'Chat',
      html,
      mount(root) {
        Chat.mount(root, cur, thr);
      },
    };
  },
  mount(root, cur, thr) {
    const list = root.querySelector('#chlist');
    if (list) list.scrollTop = list.scrollHeight;
    Chat.markRead(cur);
    const send = (id, parent) => {
      const t = root.querySelector('#' + id);
      if (!t) return;
      const m = Chat.send(cur, t.value, parent);
      if (m) {
        t.value = '';
        Chat.keep = '';
        App.render();
        setTimeout(() => {
          const x = document.querySelector('#' + id);
          if (x) x.focus();
        }, 30);
      }
    };
    root
      .querySelectorAll('[data-send]')
      .forEach(b => (b.onclick = () => send(b.dataset.send, b.dataset.send === 'chreply' && thr ? thr.id : '')));
    root.querySelectorAll('.ch-comp textarea').forEach(t => {
      if (t.id === 'chtext' && Chat.keep) t.value = Chat.keep;
      t.addEventListener('input', () => {
        if (t.id === 'chtext') Chat.keep = t.value;
        Chat.suggest(t);
      });
      t.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey && !document.querySelector('.ch-sug')) {
          e.preventDefault();
          send(t.id, t.id === 'chreply' && thr ? thr.id : '');
        }
      });
    });
    root.querySelectorAll('[data-reply]').forEach(
      a =>
        (a.onclick = e => {
          e.preventDefault();
          Chat.thread = a.dataset.reply;
          App.render();
        })
    );
    const cl = root.querySelector('#chclose');
    if (cl)
      cl.onclick = e => {
        e.preventDefault();
        Chat.thread = '';
        App.render();
      };
    root.querySelectorAll('[data-medit]').forEach(
      a =>
        (a.onclick = e => {
          e.preventDefault();
          const m = Store.get(a.dataset.medit);
          if (!m) return;
          const box = root.querySelector(`[data-msg="${CSS.escape(m.id)}"] .ch-text`);
          box.innerHTML = `<textarea rows="2" class="ch-edit">${h(m.text)}</textarea><div><button class="btn sm primary" data-esave>Save</button> <button class="btn sm ghost" data-ecancel>Cancel</button></div>`;
          const t = box.querySelector('textarea');
          t.focus();
          t.addEventListener('keydown', ev => ev.stopPropagation());
          box.querySelector('[data-esave]').onclick = () => {
            Chat.edit(m, t.value);
            App.render();
          };
          box.querySelector('[data-ecancel]').onclick = () => App.render();
        })
    );
    root.querySelectorAll('[data-mdel]').forEach(
      a =>
        (a.onclick = e => {
          e.preventDefault();
          const m = Store.get(a.dataset.mdel);
          if (m)
            UI.confirm('Delete this message?', () => {
              Chat.remove(m);
              App.render();
            });
        })
    );
    root.querySelectorAll('[data-onitem]').forEach(
      a =>
        (a.onclick = e => {
          e.preventDefault();
          const r = Store.get(a.dataset.onitem);
          if (r && Schemas[r.c]) UI.editRecord(r.c, r);
        })
    );
    const nc = root.querySelector('#chnew');
    if (nc)
      nc.onclick = e => {
        e.preventDefault();
        Chat.newChannel();
      };
    const nd = root.querySelector('#chdm');
    if (nd)
      nd.onclick = e => {
        e.preventDefault();
        Chat.pickPerson(id => {
          location.hash = '#/chat/' + encodeURIComponent(Chat.dmId(id));
        });
      };
  },
  pickPerson(done) {
    UI.modal({
      title: 'Message someone',
      body: `<input id="chpq" placeholder="Name…" style="width:100%"><div class="ch-pick" id="chpl"></div>`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button>',
      onMount: w => {
        const draw = () => {
          const q = U.lc(w.querySelector('#chpq').value);
          w.querySelector('#chpl').innerHTML = Maham.people()
            .filter(p => p.id !== App.me && (!q || U.lc(p.name).includes(q)))
            .slice(0, 30)
            .map(p => `<a href="#" class="ch-it" data-pp="${h(p.id)}">${h(p.name)}</a>`)
            .join('');
          w.querySelectorAll('[data-pp]').forEach(
            a =>
              (a.onclick = e => {
                e.preventDefault();
                UI.closeModal();
                done(a.dataset.pp);
              })
          );
        };
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('#chpq').oninput = draw;
        draw();
        w.querySelector('#chpq').focus();
      },
    });
  },
  /* @ while typing: the people whose name starts like that */
  suggest(t) {
    const old = document.querySelector('.ch-sug');
    if (old) old.remove();
    const m = /(^|\s)@([\w.-]{0,30})$/.exec(t.value.slice(0, t.selectionStart));
    if (!m) return;
    const q = U.lc(m[2]);
    const list = Maham.people()
      .filter(p => p.id !== App.me && (U.lc(Maham.handle(p.id)).startsWith(q) || U.lc(p.name).includes(q)))
      .slice(0, 6);
    if (!list.length) return;
    t.insertAdjacentHTML(
      'beforebegin',
      `<div class="ch-sug">${list.map((p, i) => `<a href="#" data-sug="${h(Maham.handle(p.id))}"${i ? '' : ' class="on"'}>${h(p.name)} <span class="muted small">@${h(Maham.handle(p.id))}</span></a>`).join('')}</div>`
    );
    const box = document.querySelector('.ch-sug');
    const pick = handle => {
      const pos = t.selectionStart;
      const before = t.value.slice(0, pos).replace(/@[\w.-]*$/, '@' + handle + ' ');
      t.value = before + t.value.slice(pos);
      t.focus();
      t.selectionStart = t.selectionEnd = before.length;
      box.remove();
      Chat.keep = t.value;
    };
    box.querySelectorAll('[data-sug]').forEach(
      a =>
        (a.onmousedown = e => {
          e.preventDefault();
          pick(a.dataset.sug);
        })
    );
    t.onkeydown = e => {
      const b = document.querySelector('.ch-sug');
      if (!b) return;
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        pick(b.querySelector('.on').dataset.sug);
      } else if (e.key === 'Escape') b.remove();
    };
  },
  /* 💬 Discuss on an item: a thread about it in its team's channel (the first message starts it) */
  discuss(rec) {
    const first = (Store.byC.chmsg || []).find(m => m && !m._del && m.on === rec.id && !m.parent && Chat.canSee(m.ch));
    if (first) {
      Chat.thread = first.id;
      UI.closeModal();
      location.hash = '#/chat/' + encodeURIComponent(first.ch);
      return;
    }
    UI.modal({
      title: '💬 Discuss: ' + Chat.itemLabel(rec),
      body: `<p class="muted small">Starts a thread about this item in <b>#general</b>. Write @Name to tell someone.</p><textarea id="dsc" rows="3" style="width:100%"></textarea>`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Post</button>',
      onMount: w => {
        w.querySelector('[data-c]').onclick = UI.closeModal;
        const t = w.querySelector('#dsc');
        t.focus();
        t.addEventListener('keydown', e => e.stopPropagation());
        w.querySelector('[data-ok]').onclick = () => {
          const m = Chat.send('chchan-general', t.value, '', rec.id);
          if (!m) return UI.toast('Write something first', 'bad');
          Chat.thread = m.id;
          UI.closeModal();
          location.hash = '#/chat/chchan-general';
        };
      },
    });
  },
};

/* the menu: a "Connect" section after Home, as a function admins can switch per team */
Maham.section('Connect', '💬', [['chat', 'Chat', '💬']], 'Home');
Maham.page('chat', 'Chat', ['chchan', 'chmsg']);
P.chat = sub => Chat.render(sub);

/* @mentions and direct messages tell the person (🔔) */
Notify.rules.push((r, prev) => {
  if (r.c !== 'chmsg' || prev) return [];
  const to = new Set(Maham.mentions(r.text));
  if (Chat.isDm(r.ch)) to.add(Chat.dmOther(r.ch));
  if (r.parent) {
    const p = Store.get(r.parent);
    if (p && p.by) to.add(p.by);
  }
  const aud = r.aud;
  const link = '#/chat/' + encodeURIComponent(r.ch);
  return [...to]
    .filter(x => x !== App.me && (!aud || aud.includes(x)))
    .map(x => ({
      to: x,
      kind: 'chat',
      title: Chat.isDm(r.ch) ? 'sent you a message' : `mentioned you in ${Chat.title(r.ch)}`,
      text: r.text.slice(0, 160),
      link,
    }));
});

/* 💬 Discuss on every item form (with its number of messages) */
['todo', 'shadow', 'quickwin', 'gcatch', 'central', 'ptask', 'project', 'request', 'mgrtask', 'meeting', 'action', 'kbarticle'].forEach(
  coll => {
    if (!Schemas[coll]) return;
    Schemas.extend(coll, {
      name: 'chat',
      mount(form, base) {
        if (!base || !base.id || !Store.get(base.id) || !Store.pageOn(App.me, 'chat', App.viewTeam)) return;
        const w = form.closest('.modal');
        const foot = w && w.querySelector('.modal-foot');
        if (!foot || foot.querySelector('[data-discuss]')) return;
        const n = (Store.byC.chmsg || []).filter(
          m => m && !m._del && (m.on === base.id || (m.parent && (Store.get(m.parent) || {}).on === base.id))
        ).length;
        foot.insertAdjacentHTML(
          'afterbegin',
          `<button type="button" class="btn ghost" data-discuss>💬 Discuss${n ? ` (${n})` : ''}</button>`
        );
        foot.querySelector('[data-discuss]').onclick = () => Chat.discuss(base);
      },
    });
  }
);

/* unread count on the menu item, and a quicker refresh while the chat is open */
(() => {
  const draw = () => {
    const a = document.querySelector('nav [data-nav="chat"]');
    if (!a) return;
    const n = Chat.unreadAll();
    let b = a.querySelector('.count');
    if (!n) {
      if (b) b.remove();
      return;
    }
    if (!b) {
      a.insertAdjacentHTML('beforeend', ' <span class="count"></span>');
      b = a.querySelector('.count');
    }
    b.textContent = n;
  };
  Store.on(() => {
    try {
      draw();
      if (App.page === 'chat' && !document.querySelector('.ch-comp textarea:focus') && !document.querySelector('.ch-edit'))
        App.render(true);
    } catch (e) {
      /* never break a refresh */
    }
  });
  const launch = App.launch;
  App.launch = function () {
    const out = launch.apply(this, arguments);
    try {
      draw();
    } catch (e) {
      /* */
    }
    return out;
  };
  setInterval(() => {
    if (App.page === 'chat' && App.me && Store.sync && !document.hidden)
      Store.sync()
        .then(ch => {
          if (ch) Store.emit();
        })
        .catch(() => {});
  }, 5000);
})();
