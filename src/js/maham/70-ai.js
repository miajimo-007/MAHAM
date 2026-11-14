/* MAHAM — ✨ AI: each company (and, if the admin allows, each person) connects the AI it uses — Claude, OpenAI,
 * Google Gemini, Azure OpenAI or any OpenAI-compatible address (a company's own server, or a model on this PC such as
 * Ollama). Used in: the ✨ Assistant panel (ask anything, optionally about "my work"), @AI in chat (answers in the
 * thread), ✨ Draft reply on tickets. The AI can PROPOSE a To Do; a person always confirms before anything is saved.
 *
 * Where keys are kept:
 *   online (cloud)      — in the database, write-only (table ai_keys): nobody can read a key back, not even the admin;
 *                         calls go through the function supabase/functions/ai-proxy, which adds the key on the server.
 *   shared folder / this device — a personal key is kept in THIS browser only and calls go straight to the provider.
 *   a model on this PC (Ollama, LM Studio …) — called straight from the browser in every mode; nothing leaves the PC.
 * The AI only ever gets what the person could see on their own screens; the admin can keep areas out (settings-ai). */
'use strict';

const AI = {
  PROVIDERS: {
    anthropic: {
      label: 'Claude (Anthropic)',
      models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
      keyHelp:
        'An API key from platform.claude.com → Settings → API keys. Claude Max, Ultra and Team plans include monthly API credits: the plan owner links them on claude.ai → Settings → Billing.',
    },
    openai: {
      label: 'OpenAI',
      models: ['gpt-4.1', 'gpt-4.1-mini'],
      keyHelp: 'An API key from platform.openai.com → API keys (a ChatGPT subscription is not an API key).',
    },
    google: {
      label: 'Google Gemini',
      models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
      keyHelp: 'An API key from aistudio.google.com → Get API key.',
    },
    azure: {
      label: 'Azure OpenAI',
      models: [],
      keyHelp: 'Your Azure OpenAI endpoint (…/openai/deployments/<name>) and its key.',
      needsBase: true,
    },
    compatible: {
      label: 'Other (OpenAI-compatible)',
      models: [],
      keyHelp: "Any address that speaks the OpenAI chat API — e.g. your company's gateway.",
      needsBase: true,
    },
    local: {
      label: 'A model on this PC (Ollama …)',
      models: ['llama3.1', 'qwen2.5'],
      keyHelp: 'Runs on this PC; nothing leaves it. Ollama: allow this page with OLLAMA_ORIGINS, address http://localhost:11434/v1',
      needsBase: true,
      local: true,
    },
  },
  AREAS: [
    ['hr', 'People & HR (attendance, requests, scores)'],
    ['sales', 'Sales & marketing'],
    ['tickets', 'Service desk'],
    ['chat', 'Chat messages'],
    ['projects', 'Projects'],
  ],
  cfg() {
    const s = Store.get('settings-ai') || {};
    return {
      on: s.on !== false,
      personal: s.personal !== false,
      providers: s.providers || Object.keys(AI.PROVIDERS),
      off: s.off || [],
      monthly: +s.monthly || 0,
    };
  },
  cloud() {
    return Store.storageMode === 'cloud' && typeof CloudBackend !== 'undefined' && !!CloudBackend.company;
  },
  /* ---------- connections ---------- */
  _list: null,
  localConns() {
    try {
      return JSON.parse(localStorage.getItem('maham.ai.' + App.me) || '[]');
    } catch (e) {
      return [];
    }
  },
  saveLocal(list) {
    try {
      localStorage.setItem('maham.ai.' + App.me, JSON.stringify(list));
    } catch (e) {
      /* private window */
    }
  },
  async conns(fresh) {
    if (AI._list && !fresh) return AI._list;
    let list = AI.localConns().map(x => Object.assign({ scope: 'device' }, x));
    if (AI.cloud()) {
      try {
        const r = await CloudBackend.rpc('ai_list', { c: CloudBackend.company });
        list = list
          .filter(x => x.provider === 'local')
          .concat((r || []).map(x => ({ id: x.id, scope: x.scope, provider: x.provider, model: x.model, base: x.base_url, name: x.name })));
      } catch (e) {
        /* the database has no AI yet */
      }
    }
    const cfg = AI.cfg();
    AI._list = list.filter(x => cfg.providers.includes(x.provider) && (x.scope === 'company' || cfg.personal || x.provider === 'local'));
    return AI._list;
  },
  pick() {
    const want = (() => {
      try {
        return localStorage.getItem('maham.ai.use.' + App.me) || '';
      } catch (e) {
        return '';
      }
    })();
    const l = AI._list || [];
    return l.find(x => x.id === want) || l.find(x => x.scope === 'company') || l[0] || null;
  },
  setPick(id) {
    try {
      localStorage.setItem('maham.ai.use.' + App.me, id);
    } catch (e) {
      /* */
    }
  },
  /* ---------- usage and the monthly limit ---------- */
  usedThisMonth() {
    const m = U.todayStr().slice(0, 7);
    return Store.all('aiuse', '*')
      .filter(u => (u.month || '') === m)
      .reduce((n, u) => n + (u.calls || 0), 0);
  },
  note(conn, chars) {
    const m = U.todayStr().slice(0, 7);
    const id = `aiuse-${App.me}-${m}`;
    const cur = Store.get(id) || { id, c: 'aiuse', member: App.me, month: m, calls: 0, chars: 0, by: {} };
    const by = Object.assign({}, cur.by || {});
    const k = conn.provider + ':' + (conn.model || '');
    by[k] = (by[k] || 0) + 1;
    Store.save(Object.assign({}, cur, { calls: (cur.calls || 0) + 1, chars: (cur.chars || 0) + chars, by, _nolog: true }));
  },
  /* ---------- one call: system text + messages [{ role: 'user'|'assistant', content }] → reply text ---------- */
  async ask(conn, system, messages) {
    const cfg = AI.cfg();
    if (!cfg.on) throw new Error('AI is switched off by your admin');
    if (!conn) throw new Error('No AI is connected yet — ✨ → Connections');
    if (cfg.monthly && conn.scope === 'company' && AI.usedThisMonth() >= cfg.monthly)
      throw new Error(`The company's AI limit for this month (${cfg.monthly} questions) is reached`);
    let text;
    if (conn.scope !== 'device' && conn.provider !== 'local' && AI.cloud()) text = await AI.viaProxy(conn, system, messages);
    else text = await AI.direct(conn, system, messages);
    try {
      AI.note(conn, (system || '').length + messages.reduce((n, m) => n + String(m.content).length, 0) + text.length);
    } catch (e) {
      /* usage only */
    }
    return text;
  },
  async viaProxy(conn, system, messages) {
    const r = await fetch(CloudBackend.base() + '/functions/v1/ai-proxy', {
      method: 'POST',
      headers: CloudBackend.headers(),
      body: JSON.stringify({ company: CloudBackend.company, conn: conn.id, system, messages }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'The AI did not answer (' + r.status + ')');
    return String(j.text || '');
  },
  /* the provider's own API, from this browser (personal keys on a shared folder / this device, and local models) */
  async direct(conn, system, messages) {
    const p = conn.provider;
    const key = conn.key || '';
    let r, j;
    try {
      if (p === 'anthropic') {
        const model = conn.model || 'claude-opus-5-5';
        const body = { model, max_tokens: 16000, system, messages };
        const headers = {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2026-10-21',
          'anthropic-dangerous-direct-browser-access': 'true',
        };
        if (/^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5)/.test(model)) {
          body.fallbacks = 'default';
          headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
        } // a declined request is re-run on another model
        r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
        j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((j.error && j.error.message) || 'Claude did not answer (' + r.status + ')');
        if (j.stop_reason === 'refusal') throw new Error('Claude declined this request');
        return (j.content || [])
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n')
          .trim();
      }
      if (p === 'google') {
        r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(conn.model || 'gemini-2.5-flash')}:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] })),
            }),
          }
        );
        j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((j.error && j.error.message) || 'Gemini did not answer (' + r.status + ')');
        return ((((j.candidates || [])[0] || {}).content || {}).parts || [])
          .map(x => x.text || '')
          .join('')
          .trim();
      }
      // OpenAI and everything that speaks its chat API (Azure, a gateway, Ollama / LM Studio on this PC)
      const base = (conn.base || (p === 'openai' ? 'https://api.openai.com/v1' : '')).replace(/\/+$/, '');
      if (!base) throw new Error('This connection has no address');
      const url = p === 'azure' ? `${base}/chat/completions?api-version=2024-10-21` : `${base}/chat/completions`;
      const headers = { 'Content-Type': 'application/json' };
      if (key) {
        if (p === 'azure') headers['api-key'] = key;
        else headers.Authorization = 'Bearer ' + key;
      }
      r = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: conn.model || undefined, messages: [{ role: 'system', content: system }, ...messages] }),
      });
      j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || 'The AI did not answer (' + r.status + ')');
      return String((((j.choices || [])[0] || {}).message || {}).content || '').trim();
    } catch (e) {
      if (e instanceof TypeError)
        throw new Error(
          p === 'local'
            ? 'The model on this PC did not answer — is it running, and does it allow this page (OLLAMA_ORIGINS)?'
            : 'Could not reach the AI service — check the network',
          { cause: e }
        );
      throw e;
    }
  },

  /* ---------- what the AI may know: only what this person sees, minus the areas the admin keeps out ---------- */
  SYSTEM:
    'You are the assistant inside MAHAM, a work-management app (tasks, projects, tickets, sales). Be brief and practical. Answer in the language the user writes in. Never invent records: if the data below does not say, say you do not know. If the user asks you to create a task, add at the end a block ```maham-todo\n{"task": "...", "due": "YYYY-MM-DD", "priority": "Normal"}\n``` — the app shows it for the user to confirm; never claim you created it.',
  myWork() {
    const off = new Set(AI.cfg().off);
    const out = [];
    const today = U.todayStr();
    const mine = (c, f) => Store.all(c, '*').filter(f);
    out.push(`Today is ${today}. The user is ${Store.memberName ? Store.memberName(App.me) : App.me}.`);
    out.push(
      'Open To Dos: ' +
        (mine('todo', t => t.analyst === App.me && !['Resolved', 'Canceled'].includes(t.status))
          .slice(0, 25)
          .map(t => `${t.tdNo ? 'TD-' + t.tdNo + ' ' : ''}${t.task} (due ${t.due || '-'}, ${t.status})`)
          .join('; ') || 'none')
    );
    if (!off.has('projects'))
      out.push(
        'Project tasks: ' +
          (mine('ptask', t => t.assignee === App.me && !(typeof Scrum !== 'undefined' && Scrum.isDone(t)))
            .slice(0, 20)
            .map(t => `${t.title} (${t.status || ''}${t.due ? ', due ' + t.due : ''})`)
            .join('; ') || 'none')
      );
    if (!off.has('tickets') && typeof TK !== 'undefined')
      out.push(
        'Tickets assigned: ' +
          (TK.all()
            .filter(t => t.assignee === App.me && TK.isOpen(t))
            .slice(0, 20)
            .map(t => `${TK.key(t)} ${t.subject} (${t.status}, ${t.priority})`)
            .join('; ') || 'none')
      );
    if (!off.has('sales') && typeof CRM !== 'undefined')
      out.push(
        'My open deals: ' +
          (CRM.all('deal')
            .filter(d => d.owner === App.me && CRM.open(d))
            .slice(0, 20)
            .map(d => `${CRM.key(d)} ${d.title} ${CRM.money(d.value)} (${d.stage})`)
            .join('; ') || 'none')
      );
    return out.join('\n');
  },
  /* a proposed To Do in a reply → a "Create this To Do" button; nothing is saved without the person's click */
  proposals(text) {
    const out = [];
    String(text).replace(/```maham-todo\s*([\s\S]*?)```/g, (m, j) => {
      try {
        const o = JSON.parse(j);
        if (o && o.task) out.push(o);
      } catch (e) {
        /* not valid */
      }
      return m;
    });
    return out;
  },
  clean(text) {
    return String(text)
      .replace(/```maham-todo[\s\S]*?```/g, '')
      .trim();
  },
  /* To Dos come from managers in this app: someone who may give To Dos gets one; anyone else a personal task */
  canTodo() {
    return App.isSuper() || App.isMgr() || (Store.member(App.me) || {}).role === 'teamleader' || (App.isActing && App.isActing());
  }, // the app's rule: managers and team leaders give To Dos
  createTodo(o) {
    const due = /^\d{4}-\d{2}-\d{2}$/.test(o.due || '') ? o.due : '';
    if (AI.canTodo()) {
      const id = U.uid('todo');
      Store.save({
        id,
        c: 'todo',
        task: String(o.task).slice(0, 300),
        analyst: App.me,
        team: (Store.member(App.me) || {}).team,
        assigned: U.todayStr(),
        due,
        priority: ['High', 'Medium', 'Normal', 'Low'].includes(o.priority) ? o.priority : 'Normal',
        status: 'In Progress',
        fromAI: true,
      });
      if (Store.get(id)) UI.toast('To Do created', 'good'); // the save's own rules may still refuse it (they say why)
    } else {
      Store.save({
        c: 'mytask',
        title: String(o.task).slice(0, 300),
        owner: App.me,
        due,
        plan: '',
        priority: o.priority === 'High' ? 'High' : 'Normal',
        status: 'Open',
        fromAI: true,
      });
      UI.toast('Added to your personal tasks', 'good');
    }
  },

  /* ---------- ✨ the Assistant panel ---------- */
  chat: [],
  async panel() {
    const old = document.getElementById('aipanel');
    if (old) {
      old.remove();
      return;
    }
    const list = await AI.conns();
    const cur = AI.pick();
    const cfg = AI.cfg();
    document.body.insertAdjacentHTML(
      'beforeend',
      `<aside class="ai-panel" id="aipanel" role="dialog" aria-label="AI assistant"><div class="ai-head"><b>✨ Assistant</b><span class="grow"></span>
        ${list.length ? `<select id="aiconn" aria-label="Which AI">${list.map(x => `<option value="${h(x.id)}" ${cur && x.id === cur.id ? 'selected' : ''}>${h(x.name || AI.PROVIDERS[x.provider].label)}${x.scope === 'company' ? ' (company)' : ''}</option>`).join('')}</select>` : ''}
        <a href="#" class="link small" id="aicfg">Connections</a> <button class="icon-btn" id="aiclose" aria-label="Close">✕</button></div>
      <div class="ai-list" id="ailist">${!cfg.on ? '<p class="muted">AI is switched off by your admin.</p>' : !list.length ? '<p class="muted">No AI connected yet. <a href="#" class="link" id="aicfg2">Connect one</a> — your own key, or ask your admin for a company one.</p>' : AI.chat.map(AI.bubble).join('') || '<p class="muted small">Ask anything — e.g. “What should I do first today?”, “Write a short status update for my project”.</p>'}</div>
      ${cfg.on && list.length ? `<div class="ai-comp"><label class="small"><input type="checkbox" id="aiwork" checked> Use my work (To Dos, tasks, tickets, deals)</label><textarea id="aitext" rows="3" placeholder="Ask the AI…"></textarea><div class="row-btns"><a href="#" class="link small" id="aiclear">Clear</a><span class="grow"></span><button class="btn primary" id="aisend">Ask</button></div></div>` : ''}</aside>`
    );
    const p = document.getElementById('aipanel');
    p.querySelector('#aiclose').onclick = () => p.remove();
    [p.querySelector('#aicfg'), p.querySelector('#aicfg2')].forEach(
      a =>
        a &&
        (a.onclick = e => {
          e.preventDefault();
          p.remove();
          location.hash = '#/ai';
        })
    );
    const sel = p.querySelector('#aiconn');
    if (sel) sel.onchange = () => AI.setPick(sel.value);
    const ta = p.querySelector('#aitext');
    if (!ta) return;
    ta.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        p.querySelector('#aisend').click();
      }
    });
    p.querySelector('#aiclear').onclick = e => {
      e.preventDefault();
      AI.chat = [];
      p.remove();
      AI.panel();
    };
    p.querySelector('#aisend').onclick = async () => {
      const q = ta.value.trim();
      if (!q) return;
      ta.value = '';
      AI.chat.push({ role: 'user', content: q });
      AI.chat.push({ role: 'assistant', content: '…', wait: true });
      AI.redraw();
      try {
        const sys =
          AI.SYSTEM + (p.querySelector('#aiwork').checked ? "\n\nThe user's work (what they can see in the app):\n" + AI.myWork() : '');
        const text = await AI.ask(
          AI.pick(),
          sys,
          AI.chat
            .filter(m => !m.wait)
            .slice(-12)
            .map(m => ({ role: m.role, content: m.content }))
        );
        AI.chat[AI.chat.length - 1] = { role: 'assistant', content: text };
      } catch (e) {
        AI.chat[AI.chat.length - 1] = { role: 'assistant', content: '⚠ ' + e.message, err: true };
      }
      AI.redraw();
    };
    ta.focus();
  },
  bubble(m, i) {
    const props = m.role === 'assistant' && !m.err ? AI.proposals(m.content) : [];
    return `<div class="ai-msg ${m.role}${m.err ? ' err' : ''}">${m.role === 'user' ? h(m.content).replace(/\n/g, '<br>') : Maham.rich(AI.clean(m.content))}${props.map((o, k) => `<div class="ai-prop">Proposed ${AI.canTodo() ? 'To Do' : 'personal task'}: <b>${h(o.task)}</b>${o.due ? ' · due ' + h(U.fmtDate(o.due)) : ''} <button class="btn xs primary" data-aiprop="${i}|${k}">Create it</button></div>`).join('')}</div>`;
  },
  redraw() {
    const l = document.getElementById('ailist');
    if (!l) return;
    l.innerHTML = AI.chat.map(AI.bubble).join('');
    l.scrollTop = l.scrollHeight;
    l.querySelectorAll('[data-aiprop]').forEach(
      b =>
        (b.onclick = () => {
          const [i, k] = b.dataset.aiprop.split('|').map(Number);
          AI.createTodo(AI.proposals(AI.chat[i].content)[k]);
          b.replaceWith(document.createTextNode('✓ created'));
        })
    );
  },

  /* ---------- the page: connections (mine, and the company's for the admin), the admin's policy and usage ---------- */
  page() {
    const cfg = AI.cfg();
    const sup = App.isSuper();
    const html = `<div id="aipage"><p class="muted">Loading…</p></div>`;
    return {
      title: 'AI connections',
      html,
      mount: async root => {
        const list = await AI.conns(true);
        const box = root.querySelector('#aipage');
        const row =
          x => `<tr><td><b>${h(x.name || '')}</b></td><td>${h(AI.PROVIDERS[x.provider] ? AI.PROVIDERS[x.provider].label : x.provider)}</td><td>${h(x.model || '')}</td><td>${x.scope === 'company' ? 'Company' : x.scope === 'device' ? 'Mine — this browser' : 'Mine'}</td>
        <td class="act">${x.scope !== 'company' || sup ? `<button class="btn xs ghost" data-aitest="${h(x.id)}">Test</button> <button class="btn xs ghost" data-aidel="${h(x.id)}">Remove</button>` : `<button class="btn xs ghost" data-aitest="${h(x.id)}">Test</button>`}</td></tr>`;
        const used = AI.usedThisMonth();
        box.innerHTML = `${!cfg.on ? '<div class="insights warnbox"><div>AI is switched off for this company.</div></div>' : ''}
        ${card('Connected AI', list.length ? `<table class="tbl"><thead><tr><th>Name</th><th>Service</th><th>Model</th><th>Whose</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>` : '<p class="muted">Nothing connected yet.</p>', `<button class="btn sm primary" id="aiadd">＋ Connect an AI</button>`)}
        <p class="muted small">${AI.cloud() ? 'Online, keys are kept in the database where nobody can read them back — not even your admin; the AI is called from the server.' : 'On a shared folder or this device, your key is kept in this browser only and the AI is called from here.'} A model on this PC is called from here in every mode, so nothing leaves the PC. The AI only gets what you can see yourself${cfg.off.length ? ', and never: ' + cfg.off.map(a => (AI.AREAS.find(x => x[0] === a) || [a, a])[1]).join(', ') : ''}.</p>
        ${
          sup
            ? card(
                'Company policy (admin)',
                `<label class="check"><input type="checkbox" id="apon" ${cfg.on ? 'checked' : ''}> AI is on for the company</label><br><label class="check"><input type="checkbox" id="appers" ${cfg.personal ? 'checked' : ''}> People may connect their own AI</label>
          <h4>Services allowed</h4>${Object.entries(AI.PROVIDERS)
            .map(
              ([k, v]) =>
                `<label class="check"><input type="checkbox" data-approv="${k}" ${cfg.providers.includes(k) ? 'checked' : ''}> ${h(v.label)}</label>`
            )
            .join('<br>')}
          <h4>Never share with the AI</h4>${AI.AREAS.map(([k, l]) => `<label class="check"><input type="checkbox" data-apoff="${k}" ${cfg.off.includes(k) ? 'checked' : ''}> ${h(l)}</label>`).join('<br>')}
          <h4>Limit</h4><label>Questions a month on the company AI (0 = no limit) <input id="aplim" type="number" min="0" value="${cfg.monthly}" style="width:110px"></label>
          <p class="small">This month: <b>${used}</b> questions${cfg.monthly ? ' of ' + cfg.monthly : ''} · ${AI.usage()}</p>
          <div class="row-btns"><span class="grow"></span><button class="btn primary" id="apsave">Save policy</button></div>`
              )
            : ''
        }`;
        const again = () => App.render();
        box.querySelector('#aiadd').onclick = () => AI.addDialog(again);
        box.querySelectorAll('[data-aidel]').forEach(
          b =>
            (b.onclick = () =>
              UI.confirm('Remove this connection?', async () => {
                await AI.remove((await AI.conns()).find(x => x.id === b.dataset.aidel));
                again();
              }))
        );
        box.querySelectorAll('[data-aitest]').forEach(
          b =>
            (b.onclick = async () => {
              b.disabled = true;
              try {
                const t = await AI.ask(
                  (await AI.conns()).find(x => x.id === b.dataset.aitest),
                  'Reply with one short friendly sentence.',
                  [{ role: 'user', content: 'Say hello to MAHAM.' }]
                );
                UI.toast('✓ ' + t.slice(0, 120), 'good');
              } catch (e) {
                UI.toast(e.message, 'bad');
              }
              b.disabled = false;
            })
        );
        const sv = box.querySelector('#apsave');
        if (sv)
          sv.onclick = () => {
            Store.save(
              Object.assign({ id: 'settings-ai', c: 'settings' }, Store.get('settings-ai') || {}, {
                on: box.querySelector('#apon').checked,
                personal: box.querySelector('#appers').checked,
                providers: [...box.querySelectorAll('[data-approv]:checked')].map(i => i.dataset.approv),
                off: [...box.querySelectorAll('[data-apoff]:checked')].map(i => i.dataset.apoff),
                monthly: Math.max(0, +box.querySelector('#aplim').value || 0),
              })
            );
            AI._list = null;
            UI.toast('AI policy saved', 'good');
            again();
          };
      },
    };
  },
  usage() {
    const m = U.todayStr().slice(0, 7);
    const rows = Store.all('aiuse', '*')
      .filter(u => u.month === m)
      .sort((a, b) => (b.calls || 0) - (a.calls || 0));
    return rows.length
      ? rows
          .slice(0, 8)
          .map(u => `${h(Store.memberShort(u.member) || u.member)} ${u.calls}`)
          .join(' · ')
      : 'nobody yet';
  },
  addDialog(done) {
    const cfg = AI.cfg();
    const sup = App.isSuper();
    const provs = Object.entries(AI.PROVIDERS).filter(([k]) => cfg.providers.includes(k));
    UI.modal({
      title: 'Connect an AI',
      body: `<div class="grid-form">
        <label class="fld"><span>Service</span><select id="acp">${provs.map(([k, v]) => `<option value="${k}">${h(v.label)}</option>`).join('')}</select></label>
        <label class="fld"><span>Name (yours to choose)</span><input id="acn" placeholder="e.g. My Claude"></label>
        <label class="fld"><span>Model</span><input id="acm" list="acml"><datalist id="acml"></datalist></label>
        <label class="fld" id="acbw"><span>Address</span><input id="acb" placeholder="https://…/v1"></label>
        <label class="fld span2"><span>Key</span><input id="ack" type="password" autocomplete="off" placeholder="paste it here"></label>
        ${sup && AI.cloud() ? '<label class="fld span2"><span><input type="checkbox" id="acco"> For the whole company (people use it without seeing the key)</span></label>' : ''}</div><p class="muted small" id="achelp"></p>`,
      actions: '<span class="grow"></span><button class="btn" data-c>Cancel</button><button class="btn primary" data-ok>Connect</button>',
      onMount: w => {
        const sync = () => {
          const p = AI.PROVIDERS[w.querySelector('#acp').value];
          w.querySelector('#acml').innerHTML = p.models.map(m => `<option value="${h(m)}">`).join('');
          if (!w.querySelector('#acm').value || !p.models.includes(w.querySelector('#acm').value))
            w.querySelector('#acm').value = p.models[0] || '';
          w.querySelector('#acbw').hidden = !p.needsBase;
          if (p.local && !w.querySelector('#acb').value) w.querySelector('#acb').value = 'http://localhost:11434/v1';
          w.querySelector('#achelp').textContent = p.keyHelp;
        };
        w.querySelector('#acp').onchange = sync;
        sync();
        w.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
        w.querySelector('[data-c]').onclick = UI.closeModal;
        w.querySelector('[data-ok]').onclick = async () => {
          const c = {
            id: Maham.uid('aiconn'),
            provider: w.querySelector('#acp').value,
            name: w.querySelector('#acn').value.trim() || AI.PROVIDERS[w.querySelector('#acp').value].label,
            model: w.querySelector('#acm').value.trim(),
            base: w.querySelector('#acb').value.trim(),
            key: w.querySelector('#ack').value.trim(),
          };
          if (!c.key && !AI.PROVIDERS[c.provider].local) return UI.toast('Paste the key', 'bad');
          if (AI.PROVIDERS[c.provider].needsBase && !c.base) return UI.toast('Write the address', 'bad');
          const company = !!(w.querySelector('#acco') || {}).checked;
          try {
            await AI.add(c, company);
            UI.closeModal();
            UI.toast('Connected — press Test to try it', 'good');
            done();
          } catch (e) {
            UI.toast(e.message, 'bad');
          }
        };
      },
    });
  },
  async add(c, company) {
    if (AI.cloud() && c.provider !== 'local') {
      await CloudBackend.rpc('ai_set_key', {
        c: CloudBackend.company,
        p_scope: company ? 'company' : 'person',
        p_provider: c.provider,
        p_model: c.model,
        p_base: c.base || '',
        p_name: c.name,
        p_key: c.key,
      });
    } else {
      const l = AI.localConns();
      l.push(c);
      AI.saveLocal(l);
    }
    AI._list = null;
  },
  async remove(c) {
    if (!c) return;
    if (c.scope === 'device' || (c.provider === 'local' && !AI.cloud())) AI.saveLocal(AI.localConns().filter(x => x.id !== c.id));
    else if (c.provider === 'local') AI.saveLocal(AI.localConns().filter(x => x.id !== c.id));
    else await CloudBackend.rpc('ai_delete', { c: CloudBackend.company, p_id: c.id });
    AI._list = null;
  },
};

Maham.section('AI', '✨', [['ai', 'AI connections', '✨']], 'Sales');
Maham.page('ai', 'AI assistant');
P.ai = () => AI.page();

/* ✨ in the top bar opens the Assistant */
(() => {
  const launch = App.launch;
  App.launch = function () {
    const out = launch.apply(this, arguments);
    try {
      const top = document.querySelector('header.top');
      if (top && App.me && !document.getElementById('aibtn') && App.pageAllowed('ai') && AI.cfg().on) {
        const at = document.getElementById('ntbell') || top.querySelector('.theme-sw');
        const b = '<button type="button" class="icon-btn" id="aibtn" title="AI assistant" aria-label="AI assistant">✨</button>';
        if (at) at.insertAdjacentHTML('beforebegin', b);
        else top.insertAdjacentHTML('beforeend', b);
        document.getElementById('aibtn').onclick = e => {
          e.stopPropagation();
          AI.panel();
        };
      }
    } catch (e) {
      console.warn('ai button', e);
    }
    return out;
  };
})();

/* @AI in chat: the person who asked gets the answer posted in the thread (it says it is from the AI) */
(() => {
  if (typeof Chat === 'undefined') return;
  const send0 = Chat.send;
  Chat.send = function (ch, text, parent, on) {
    const m = send0.apply(this, arguments);
    if (!m || !/(^|\s)@AI\b/i.test(text) || AI.cfg().off.includes('chat')) return m;
    (async () => {
      try {
        await AI.conns();
        const root = parent || m.id;
        const first = Store.get(root);
        const thread = [first, ...Chat.replies(root)].filter(Boolean).slice(-20);
        const msgs = [
          {
            role: 'user',
            content:
              thread.map(x => `${x.ai ? 'AI' : Store.memberShort(x.by) || x.by}: ${x.text}`).join('\n') +
              `\n\n(${Store.memberShort(App.me)} asks you, @AI, to answer the last message.)`,
          },
        ];
        const text2 = await AI.ask(AI.pick(), AI.SYSTEM + '\nYou are answering in a team chat thread. Keep it short.', msgs);
        send0.call(Chat, ch, AI.clean(text2) || '(no answer)', root, on);
        const r = (Store.byC.chmsg || []).filter(x => x.by === App.me && x.parent === root).pop();
        if (r) Store.save(Object.assign({}, r, { ai: true }));
      } catch (e) {
        UI.toast('AI: ' + e.message, 'bad');
      }
    })();
    return m;
  };
  const html0 = Chat.msgHtml;
  Chat.msgHtml = function (m) {
    const out = html0.apply(this, arguments);
    return m.ai
      ? out.replace(/<b>[^<]*<\/b>/, `<b>✨ AI</b> <span class="muted small">(asked by ${h(Store.memberShort(m.by) || m.by)})</span>`)
      : out;
  };
})();

/* ✨ Draft reply on a ticket */
(() => {
  if (typeof TK === 'undefined') return;
  const open0 = TK.open;
  TK.open = function (t) {
    const out = open0.apply(this, arguments);
    try {
      const ta = document.querySelector('.modal #tkrt');
      if (!ta || AI.cfg().off.includes('tickets') || !App.pageAllowed('ai')) return out;
      ta.insertAdjacentHTML('beforebegin', '<a href="#" class="link small" id="tkai">✨ Draft a reply</a>');
      document.getElementById('tkai').onclick = async e => {
        e.preventDefault();
        const tt = Store.get(t.id) || t;
        e.target.textContent = '✨ Writing…';
        try {
          await AI.conns();
          const conv = TK.replies(tt.id)
            .filter(r => !r.internal)
            .map(r => `${r.cust ? 'Customer' : 'Support'}: ${r.text}`)
            .join('\n');
          const text = await AI.ask(
            AI.pick(),
            AI.SYSTEM +
              '\nWrite a reply to the customer for the support agent to check. Plain text, polite, short. No placeholders like [Name] unless needed.',
            [
              {
                role: 'user',
                content: `Ticket ${TK.key(tt)}: ${tt.subject}\n${tt.desc || ''}\n\nConversation:\n${conv || '(none yet)'}\n\nDraft the next reply.`,
              },
            ]
          );
          ta.value = AI.clean(text);
          ta.focus();
        } catch (er) {
          UI.toast(er.message, 'bad');
        }
        e.target.textContent = '✨ Draft a reply';
      };
    } catch (e) {
      /* the ticket opens anyway */
    }
    return out;
  };
})();
