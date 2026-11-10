/* MAHAM — Admin → Task workflows → "Follow-ups (Central, vendors)": the parties (Central HQ today; vendors later),
 * which workflow each follows, their fields, and the same workflow editor as tasks. Super admin / Admin with Workflows
 * for all teams. Settings: settings-fuflow (parties, flows) and settings-taskfields-fu (fields). */
'use strict';

(function wire() {
  const A = TaskFlowAdmin;
  // Follow-ups have their own Admin sub-tab (Work & workflows → Follow-ups), which opens this page with TFE.scope = 'fu'
  const ri = A.recId;
  A.recId = scope => (scope === 'fu' ? 'settings-fuflow' : ri(scope));
  const tt = Work.teamTypes;
  Work.teamTypes = team => (team === 'fu' ? FollowUp.parties().map(p => p.name) : tt(team));
  const us = A.users;
  A.users = wfId => (TFE.scope === 'fu' ? Store.all('central', '*').filter(r => FollowUp.flowOf(r).id === wfId) : us(wfId));

  /* the follow-ups page of the admin */
  const pg = A.page;
  A.page = function () {
    const out = pg.apply(this, arguments);
    if (TFE.scope !== 'fu' || TFE.draft) return out;
    const opt = (v, l, sel) => `<option value="${h(v)}" ${v === sel ? 'selected' : ''}>${h(l)}</option>`;
    const rec = FollowUp.rec();
    const flows = FollowUp.flows();
    const parties = FollowUp.parties();
    if (!TFE.parties) TFE.parties = JSON.parse(JSON.stringify(parties));
    const chips = w =>
      `<div class="fl-chips">${TaskFlow.norm(w)
        .statuses.map(s => `<span class="tf-st" style="--c:${h(s.color || TaskFlow.CAT_COLOR[s.cat || 'todo'])}">${h(s.name)}</span>`)
        .join(' → ')}</div>`;
    const html = `<div class="page-actions"><span class="muted small">Follow-ups with parties outside the department — <b>Central HQ</b> today, <b>vendors</b> later. Each party has its own reference name, key and workflow. The escalation days (analyst / team leader / manager) and the next-chase gap are in <a class="link" href="#/admin/timerules">Time rules</a>.</span></div>
      ${card(
        'Parties',
        `${TFE.parties.map((p, i) => `<div class="cf-row" data-pt="${i}" style="grid-template-columns: 1.3fr .6fr 1fr 1.3fr 30px"><input class="pt-n" value="${h(p.name)}" placeholder="Name, e.g. Vendor A"><input class="pt-p" value="${h(p.prefix || '')}" placeholder="Key, e.g. VA"><input class="pt-r" value="${h(p.ref || '')}" placeholder="Their reference, e.g. Case ID"><select class="pt-f">${flows.map(w => opt(w.id, w.name, p.flow || flows[0].id)).join('')}</select>${p.id === 'central' ? '<span></span>' : `<button class="btn xs ghost" data-ptdel="${i}">✕</button>`}</div>`).join('')}
        <div class="row-btns"><button class="btn xs" id="ptadd">＋ Party (vendor)</button><span class="grow"></span><button class="btn primary" id="ptsave">Save parties</button></div>`
      )}
      ${A.fieldsCard('fu')}
      ${card(
        'Follow-up workflows',
        `<div class="row-btns"><button class="btn" id="fuflnew">＋ New from the Central workflow</button></div>
        ${flows
          .map(w => {
            const n = Store.all('central', '*').filter(r => FollowUp.flowOf(r).id === w.id).length;
            return `<div class="tf-tr"><b>${h(w.name)}</b> <span class="muted small">· ${(w.trs || []).length} move(s) · ${n} follow-up(s)${(rec.flows || []).length ? '' : ' · built in'}</span>${chips(w)}<span class="row-btns tight"><button class="btn xs" data-fufl="${h(w.id)}">Edit</button></span></div>`;
          })
          .join('')}`
      )}`;
    return {
      html,
      mount(root) {
        A.bindFields(root, 'fu');
        const keep = () => {
          TFE.parties = [...root.querySelectorAll('[data-pt]')].map(r => {
            const o = TFE.parties[+r.dataset.pt] || {};
            return {
              id: o.id || U.uid('pty'),
              name: r.querySelector('.pt-n').value.trim(),
              prefix: r
                .querySelector('.pt-p')
                .value.trim()
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
                .slice(0, 6),
              ref: r.querySelector('.pt-r').value.trim(),
              flow: r.querySelector('.pt-f').value,
            };
          });
        };
        root.querySelector('#ptadd').onclick = () => {
          keep();
          TFE.parties.push({ name: '', prefix: '', ref: 'Case ID' });
          App.render();
        };
        root.querySelectorAll('[data-ptdel]').forEach(
          b =>
            (b.onclick = () => {
              keep();
              const p = TFE.parties[+b.dataset.ptdel];
              if (Store.all('central', '*').some(r => r.party === p.id)) return UI.toast('It has follow-ups — keep it', 'bad');
              TFE.parties.splice(+b.dataset.ptdel, 1);
              App.render();
            })
        );
        root.querySelector('#ptsave').onclick = () => {
          keep();
          const l = TFE.parties.filter(p => p.name);
          if (l.some(p => !p.prefix)) return UI.toast('Every party needs a key (e.g. RYD)', 'bad');
          if (new Set(l.map(p => p.prefix)).size !== l.length) return UI.toast('Two parties have the same key', 'bad');
          A.save('fu', { parties: l, flows: (rec.flows || []).length ? rec.flows : flows });
          TFE.parties = null;
          UI.toast('Parties saved', 'good');
          App.render();
        };
        const open = w => {
          TFE.draft = JSON.parse(JSON.stringify(w));
          App.render();
        };
        root.querySelector('#fuflnew').onclick = () =>
          open(
            Object.assign(JSON.parse(JSON.stringify(FollowUp.defaultFlow())), { id: U.uid('fuf'), name: 'Vendor follow-up', _new: true })
          );
        root.querySelectorAll('[data-fufl]').forEach(b => (b.onclick = () => open(flows.find(w => w.id === b.dataset.fufl))));
      },
    };
  };

  /* saving a follow-up workflow: renamed steps follow; follow-ups in a removed step are asked where they go */
  const sd = A.saveDraft;
  A.saveDraft = function () {
    if (TFE.scope !== 'fu') return sd.apply(this, arguments);
    const w = TFE.draft;
    const names = w.statuses.map(s => s.name);
    const err = !w.name
      ? 'Give the workflow a name'
      : names.some(n => !n)
        ? 'Every step needs a name'
        : new Set(names).size !== names.length
          ? 'Two steps have the same name'
          : names.length < 2
            ? 'At least two steps'
            : !w.statuses.some(s => s.cat === 'done')
              ? 'At least one step must be in the Done category'
              : !(w.trs || []).length
                ? 'Add at least one move'
                : '';
    if (err) return UI.toast(err, 'bad');
    const clean = Object.assign({}, w);
    for (const k of ['_new', '_ren', 'simple', 'shared']) delete clean[k];
    clean.trs = clean.trs.map(t => Object.assign({}, t, { name: t.name || t.to }));
    const base = FollowUp.rec();
    const flows = ((base.flows || []).length ? base.flows : FollowUp.flows()).filter(x => x.id !== w.id).concat([clean]);
    const ren = w._ren || {};
    const plan = [];
    for (const r0 of Store.all('central', '*').filter(r => FollowUp.flowOf(r).id === w.id)) {
      const r = FollowUp.norm(r0);
      if (names.includes(r.status)) continue;
      const to = ren[r.status] && names.includes(ren[r.status]) ? ren[r.status] : null;
      const c = FollowUp.cat(r);
      plan.push({ t: r, to: to || (clean.statuses.find(s => s.cat === c) || {}).name || clean.start, w: TaskFlow.norm(clean), auto: !!to });
    }
    const go = map => {
      const recs = [
        Object.assign({ id: 'settings-fuflow', c: 'settings' }, base, {
          id: 'settings-fuflow',
          c: 'settings',
          flows,
          parties: (base.parties || []).length ? base.parties : FollowUp.parties(),
        }),
      ];
      for (const x of plan) {
        const to = !x.auto && map ? map[x.t.status + '|' + x.w.id] || x.to : x.to;
        recs.push(
          Object.assign({}, x.t, {
            status: to,
            hist: [...(x.t.hist || []), { at: Date.now(), by: App.me, from: x.t.status, to, tr: 'Workflow changed' }].slice(-60),
          })
        );
      }
      Store.saveMany(recs);
      TFE.draft = null;
      UI.closeModal();
      UI.toast(`Workflow saved${plan.length ? ` · ${plan.length} follow-up(s) moved` : ''}`, 'good');
      App.render();
    };
    if (!plan.some(x => !x.auto)) return go(null);
    A.mapDialog(
      plan.filter(x => !x.auto),
      go
    );
  };
  /* "Test as…" on a follow-up workflow */
  const te = A.test;
  A.test = function (w, who, status, mine) {
    if (TFE.scope !== 'fu') return te.apply(this, arguments);
    const t = {
      id: '_futest',
      c: 'central',
      party: 'central',
      fuv: 2,
      status,
      analyst: mine ? who : '_nobody',
      team: (Store.member(who) || {}).team || 'apps',
    };
    const o = FollowUp.flowOf;
    FollowUp.flowOf = () => TaskFlow.norm(w);
    try {
      const ms = TaskFlow.moves(t, who);
      return ms.length
        ? `<div class="li-list">${ms.map(m => `<div class="li"><span>${m.ok ? '✓' : '🔒'} <b>${h(m.tr.name || m.tr.to)}</b> → ${h(m.tr.to)}</span><span class="muted small">${h(m.ok ? '' : m.why.join(', '))}</span></div>`).join('')}</div>`
        : empty(`No way out of “${status}”.`);
    } finally {
      FollowUp.flowOf = o;
    }
  };
})();
