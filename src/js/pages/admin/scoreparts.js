/* MAHAM — Admin → Scoring & months: all scoring in one place.
 *  - Scoring rules (moved here from Lists), with a table editor for the tiers instead of JSON
 *  - Weights and parts: every part's weight (totals 100%), add parts from MAHAM's own data or a manager rating
 *  - Bonus / penalty points for a person's month, with a reason
 * The Manager Desk gets "Ratings" when the team's scoring has a manager rating; "Why is my score …?" shows it all. */
'use strict';

const TierEdit = {
  /* key → [label, unit, direction] for the built-in tier tables */
  KEYS: {
    todo: ['To Do on time', '%', 'ge'],
    requests: ['Help desk requests vs team average', '×', 'ge'],
    closing: ['Help desk average closing time', 'h', 'le'],
    shadow: ['Shadow work hours', 'h', 'ge'],
    quickwins: ['Quick wins completed', '', 'ge'],
    attendance: ['Permission hours', 'h', 'le'],
    projects: ['Project tasks on time', '%', 'ge'],
    projShare: ['Story points vs team average', '×', 'ge'],
  },
  isElse(t) {
    return t <= -1 || t >= 1e8;
  },
  table(id, list, unit, dir) {
    const show = t => (unit === '%' ? Math.round(t * 1000) / 10 : t);
    const rows = (list || []).filter(([t]) => !TierEdit.isElse(t));
    const other = (list || []).find(([t]) => TierEdit.isElse(t)) || [dir === 'le' ? 1e9 : -1, 50];
    return `<table class="tbl tier-ed" data-tier="${h(id)}" data-unit="${h(unit)}" data-dir="${dir}"><thead><tr><th>${dir === 'le' ? 'At most' : 'At least'}</th><th>Points</th><th></th></tr></thead><tbody>
      ${rows.map(([t, p]) => `<tr><td><input type="number" step="any" data-t value="${show(t)}"> ${h(unit)}</td><td><input type="number" step="any" data-p value="${p}"></td><td><button type="button" class="btn xs ghost" data-tdel>✕</button></td></tr>`).join('')}
      <tr class="tier-else"><td class="muted">otherwise</td><td><input type="number" step="any" data-pelse value="${other[1]}"></td><td></td></tr></tbody></table>
      <button type="button" class="btn xs" data-tadd="${h(id)}">＋ Row</button>`;
  },
  read(tbl) {
    const unit = tbl.dataset.unit,
      dir = tbl.dataset.dir;
    const out = [];
    tbl.querySelectorAll(':scope > tbody > tr:not(.tier-else)').forEach(tr => {
      const t = tr.querySelector('[data-t]').value,
        p = tr.querySelector('[data-p]').value;
      if (t !== '' && p !== '') out.push([unit === '%' ? +t / 100 : +t, +p]);
    });
    out.sort((a, b) => (dir === 'le' ? a[0] - b[0] : b[0] - a[0]));
    out.push([dir === 'le' ? 1e9 : -1, +tbl.querySelector('[data-pelse]').value || 0]);
    return out;
  },
  bind(root, onChange) {
    const ch = () => onChange && onChange();
    root.querySelectorAll('[data-tadd]').forEach(
      b =>
        (b.onclick = () => {
          const tb = root.querySelector(`[data-tier="${b.dataset.tadd}"] > tbody`);
          tb.insertAdjacentHTML(
            'afterbegin',
            `<tr><td><input type="number" step="any" data-t> ${h(tb.closest('table').dataset.unit)}</td><td><input type="number" step="any" data-p></td><td><button type="button" class="btn xs ghost" data-tdel>✕</button></td></tr>`
          );
          TierEdit.bind(root, onChange);
        })
    );
    root.querySelectorAll('[data-tdel]').forEach(
      b =>
        (b.onclick = () => {
          b.closest('tr').remove();
          ch();
        })
    );
    root.querySelectorAll('.tier-ed input').forEach(i => (i.oninput = ch));
  },
  /* the Scoring rules card: the JSON box becomes tables (the JSON stays underneath, kept in step, for the save button) */
  mountSettings(root) {
    const ta = root.querySelector('[name=s_tiers]');
    if (!ta) return;
    let T;
    try {
      T = JSON.parse(ta.value);
    } catch (e) {
      return;
    }
    const fld = ta.closest('.fld') || ta;
    fld.style.display = 'none';
    const box = document.createElement('div');
    box.className = 'span2 tier-grid';
    box.innerHTML = `<label class="small"><b>Tiers</b> — what result gives what points</label><div class="cols2">${Object.entries(
      TierEdit.KEYS
    )
      .filter(([k]) => T[k])
      .map(([k, [l, u, d]]) => `<div><b class="small">${h(l)}</b>${TierEdit.table(k, T[k], u, d)}</div>`)
      .join('')}</div>`;
    fld.insertAdjacentElement('afterend', box);
    const sync = () => {
      const o = Object.assign({}, T);
      box.querySelectorAll('[data-tier]').forEach(t => {
        o[t.dataset.tier] = TierEdit.read(t);
      });
      ta.value = JSON.stringify(o);
    };
    TierEdit.bind(box, sync);
    sync();
  },
};

const ScorePartsUI = {
  canEdit(team) {
    return App.realSuper() || AdminRole.can(App.me, 'scoring', team);
  },
  label(k, S) {
    if (k.startsWith('c_')) {
      const d = (S.custom || []).find(x => 'c_' + x.id === k);
      return d ? d.name : k;
    }
    return (ProjScore.LABEL || {})[k] || k;
  },
  /* weights of every part + extra parts */
  page() {
    const t = App.viewTeam || 'apps';
    const S = Calc.scoring(App.year);
    const W = Object.assign({}, S.weights);
    const custom = (S.custom || []).map(x => Object.assign({}, x));
    const ed = ScorePartsUI.canEdit(t);
    const html =
      card(
        `Weights and parts — ${h(Store.teamName(t))} ${App.year}`,
        `<p class="muted small">Every part's share of the score (they must add up to 100%). From November 2026 a part with nothing to score that month is left out and its weight goes to the others. Add parts from data MAHAM already keeps, or a monthly manager rating.</p>
      <div class="tbl-scroll"><table class="tbl" id="spw"><thead><tr><th>Part</th><th>Counts</th><th class="num">Weight %</th><th></th></tr></thead><tbody>
      ${Object.keys(W)
        .filter(k => !k.startsWith('c_'))
        .map(
          k =>
            `<tr data-k="${h(k)}"><td><b>${h(ScorePartsUI.label(k, S))}</b></td><td class="muted small">built in</td><td class="num"><input type="number" min="0" step="1" data-w value="${+W[k] || 0}" style="width:80px" ${ed ? '' : 'disabled'}></td><td></td></tr>`
        )
        .join('')}
      ${custom
        .map(
          d => `<tr data-k="c_${h(d.id)}" data-cid="${h(d.id)}"><td><input data-cname value="${h(d.name)}" ${ed ? '' : 'disabled'}></td><td class="small">${h(ScoreParts.src(d.source)[1])}</td><td class="num"><input type="number" min="0" step="1" data-w value="${+W['c_' + d.id] || 0}" style="width:80px" ${ed ? '' : 'disabled'}></td><td>${ed ? `<button type="button" class="btn xs ghost" data-cdel="${h(d.id)}">Remove</button>` : ''}</td></tr>
        <tr class="sp-tiers" data-tiersof="${h(d.id)}"><td colspan="4"><details><summary class="small">Tiers for “${h(d.name)}”</summary>${TierEdit.table('c_' + d.id, d.tiers && d.tiers.length ? d.tiers : ScoreParts.src(d.source)[3], ScoreParts.src(d.source)[2] === 'ratio' ? '%' : ScoreParts.src(d.source)[2] === 'rating' ? '/5' : '', 'ge')}</details></td></tr>`
        )
        .join('')}
      </tbody></table></div>
      <p id="sptot" class="small"></p>
      ${
        ed
          ? `<div class="row-btns"><select id="spsrc"><option value="">＋ Add a part…</option>${ScoreParts.SOURCES.filter(
              ([k]) => !custom.some(d => d.source === k)
            )
              .map(([k, l]) => `<option value="${k}">${h(l)}</option>`)
              .join(
                ''
              )}</select><span class="grow"></span><button type="button" class="btn primary" id="spsave">Save weights and parts</button></div>`
          : ''
      }`
      ) + ScorePartsUI.adjCard(t);
    return {
      html,
      mount(root) {
        const tot = () => {
          let n = 0;
          root.querySelectorAll('#spw [data-w]').forEach(i => (n += +i.value || 0));
          const ok = Math.abs(n - 100) < 0.01;
          root.querySelector('#sptot').innerHTML =
            `Total <b class="${ok ? 't-good' : 't-bad'}">${n}%</b>${ok ? '' : ' — must be 100% to save'}`;
          const sv = root.querySelector('#spsave');
          if (sv) sv.disabled = !ok;
        };
        root.querySelectorAll('#spw [data-w]').forEach(i => (i.oninput = tot));
        tot();
        TierEdit.bind(root.querySelector('#spw'), null);
        const add = root.querySelector('#spsrc');
        if (add)
          add.onchange = () => {
            const k = add.value;
            if (!k) return;
            const src = ScoreParts.src(k);
            const id = k + (custom.some(d => d.id === k) ? '2' : '');
            Calc.saveScoringParts(
              t,
              Object.assign({}, S.weights, { ['c_' + id]: 0 }),
              custom.concat([{ id, source: k, name: src[1], tiers: src[3] }]),
              'Part added — give it a weight (and take that much from the others), then save'
            );
          };
        root.querySelectorAll('[data-cdel]').forEach(
          b =>
            (b.onclick = () =>
              UI.confirm('Remove this part from the score (from now on)?', () => {
                const w = Object.assign({}, S.weights);
                delete w['c_' + b.dataset.cdel];
                Calc.saveScoringParts(
                  t,
                  w,
                  custom.filter(d => d.id !== b.dataset.cdel),
                  'Part removed — check the weights still add up to 100%'
                );
              }))
        );
        const sv = root.querySelector('#spsave');
        if (sv)
          sv.onclick = () => {
            const w = {};
            root.querySelectorAll('#spw [data-k]').forEach(tr => {
              w[tr.dataset.k] = +tr.querySelector('[data-w]').value || 0;
            });
            const parts = custom.map(d => {
              const tr = root.querySelector(`#spw tr[data-cid="${d.id}"]`);
              const tb = root.querySelector(`#spw [data-tier="c_${d.id}"]`);
              return Object.assign({}, d, {
                name: (tr.querySelector('[data-cname]').value || d.name).trim(),
                tiers: tb ? TierEdit.read(tb) : d.tiers,
              });
            });
            Calc.saveScoringParts(t, w, parts, `Weights and parts saved for ${Store.teamName(t)}`);
          };
        ScorePartsUI.bindAdj(root, t);
        // the what-if and rules cards on the same page: name the added parts
        root.querySelectorAll('.wif label, .grid-form label').forEach(l => {
          const m = l.textContent.match(/(?:^|\s)(c_[a-z0-9]+)/);
          if (m) l.textContent = l.textContent.replace(m[1], ScorePartsUI.label(m[1], S));
        });
      },
    };
  },
  /* bonus / penalty points */
  adjCard(t) {
    const y = App.year;
    const l = (Store.byC.scoreadj || [])
      .filter(a => a && !a._del && (a.team || 'apps') === t && +a.year === y)
      .sort((a, b) => (b._ts || 0) - (a._ts || 0));
    const ed = ScoreParts.canAdjust(t);
    return card(
      `Bonus / penalty points <span class="count">${l.length}</span>`,
      `<p class="muted small">Add or take away points for one person's month, with a reason — shown in “Why is my score …?”. The month's score stays between 0 and 100; a locked month keeps its official score.</p>
      ${l.length ? l.map(a => `<div class="li"><span class="grow"><b>${h(Store.memberShort(a.mid))}</b> · ${U.MONTHS[a.month - 1]} ${a.year} · <b class="${a.points >= 0 ? 't-good' : 't-bad'}">${a.points > 0 ? '+' : ''}${a.points}</b> — ${h(a.reason || '')} <span class="muted small">by ${h(Store.memberShort(a.by))}</span></span>${(ed && a.by === App.me) || App.realSuper() ? `<button class="btn xs ghost" data-adjdel="${h(a.id)}">Remove</button>` : ''}</div>`).join('') : '<p class="muted small">None this year.</p>'}
      ${ed ? `<div class="row-btns"><span class="grow"></span><button class="btn sm" id="adjnew">＋ Bonus / penalty…</button></div>` : ''}`
    );
  },
  bindAdj(root, t) {
    root.querySelectorAll('[data-adjdel]').forEach(
      b =>
        (b.onclick = () =>
          UI.confirm('Remove these points?', () => {
            Store.save(Object.assign({}, Store.get(b.dataset.adjdel), { _del: true }));
            App.render(true);
          }))
    );
    const n = root.querySelector('#adjnew');
    if (!n) return;
    n.onclick = () => {
      const ppl = Store.scoredTeam().filter(m => (m.team || 'apps') === t && m.id !== App.me);
      const mo = new Date().getMonth() + 1;
      UI.modal({
        title: 'Bonus / penalty points',
        body: `<form class="grid-form" id="adjf">${UI.field({ key: 'mid', label: 'Person', type: 'select', options: ppl.map(m => [m.id, m.name]), blank: false }, (ppl[0] || {}).id)}${UI.field({ key: 'month', label: 'Month', type: 'select', options: U.MONTHS.map((x, i) => [String(i + 1), x + ' ' + App.year]), blank: false }, String(mo))}
          ${UI.field({ key: 'points', label: 'Points (e.g. 3 or -2)', type: 'number', step: 0.5 }, 2)}${UI.field({ key: 'reason', label: 'Reason (shown to the person)', type: 'text', required: true }, '')}</form>`,
        actions: '<span class="grow"></span><button class="btn primary" data-ok>Save</button>',
        onMount: w =>
          (w.querySelector('[data-ok]').onclick = () => {
            const v = UI.readForm(w.querySelector('#adjf'), [
              { key: 'mid' },
              { key: 'month' },
              { key: 'points', type: 'number' },
              { key: 'reason' },
            ]);
            if (!v.reason) return UI.toast('Write the reason', 'bad');
            if (!+v.points) return UI.toast('Points cannot be 0', 'bad');
            if (Math.abs(+v.points) > 20) return UI.toast('At most 20 points either way', 'bad');
            if (Calc.monthLocked(App.year, +v.month)) return UI.toast('That month is locked — its official score does not change', 'bad');
            Store.save({
              c: 'scoreadj',
              id: `scoreadj-${App.me}-${Date.now()}`,
              mid: v.mid,
              team: t,
              year: App.year,
              month: +v.month,
              points: +v.points,
              reason: v.reason,
              by: App.me,
            });
            UI.closeModal();
            UI.toast('Saved', 'good');
            App.render(true);
          }),
      });
    };
  },
  /* Manager Desk: monthly ratings when the team's scoring has a manager rating */
  ratingCard() {
    const t = App.viewTeam || 'apps';
    const S = Calc.scoring(App.year);
    const d = (S.custom || []).find(x => x.source === 'rating');
    if (!d || !+S.weights['c_' + d.id]) return '';
    const now = new Date();
    const prev = now.getMonth() === 0 ? { y: now.getFullYear() - 1, mo: 12 } : { y: now.getFullYear(), mo: now.getMonth() };
    const cur = { y: now.getFullYear(), mo: now.getMonth() + 1 };
    const ppl = Store.scoredTeam().filter(m => (m.team || 'apps') === t && ScoreParts.canRate(m.id));
    if (!ppl.length) return '';
    const sel = ScorePartsUI._rm || prev;
    const missing = ppl.filter(m => !Store.get(`mrating-${prev.y}-${U.pad(prev.mo)}-${m.id}`)).length;
    return card(
      `⭐ Ratings — ${U.MONTHS[sel.mo - 1]} ${sel.y}${missing && sel.mo === prev.mo ? ` <span class="count">${missing} to do</span>` : ''}`,
      `<div class="row-btns"><button class="btn xs ${sel.mo === prev.mo ? 'primary' : ''}" data-rmo="${prev.y}-${prev.mo}">${U.MONTHS[prev.mo - 1]}</button><button class="btn xs ${sel.mo === cur.mo ? 'primary' : ''}" data-rmo="${cur.y}-${cur.mo}">${U.MONTHS[cur.mo - 1]}</button><span class="muted small">1 = needs improvement · 5 = excellent — part of the score (${+S.weights['c_' + d.id]}%)</span></div>
      <div class="tbl-scroll"><table class="tbl"><tbody>${ppl
        .map(m => {
          const r = Store.get(`mrating-${sel.y}-${U.pad(sel.mo)}-${m.id}`) || {};
          return `<tr data-rid="${h(m.id)}"><td><b>${h(m.name)}</b></td><td><select data-rv><option value="">—</option>${[5, 4, 3, 2, 1].map(n => `<option ${+r.rating === n ? 'selected' : ''}>${n}</option>`).join('')}</select></td><td><input data-rc value="${h(r.comment || '')}" placeholder="Comment (shown to them)" style="width:100%"></td></tr>`;
        })
        .join('')}</tbody></table></div>
      <div class="row-btns"><span class="grow"></span><button class="btn primary sm" id="rsave" ${Calc.monthLocked(sel.y, sel.mo) ? 'disabled title="Locked month"' : ''}>Save ratings</button></div>`
    );
  },
  bindRating(root) {
    root.querySelectorAll('[data-rmo]').forEach(
      b =>
        (b.onclick = () => {
          const [y, mo] = b.dataset.rmo.split('-').map(Number);
          ScorePartsUI._rm = { y, mo };
          App.render(true);
        })
    );
    const sv = root.querySelector('#rsave');
    if (!sv) return;
    sv.onclick = () => {
      const now = new Date();
      const sel =
        ScorePartsUI._rm || (now.getMonth() === 0 ? { y: now.getFullYear() - 1, mo: 12 } : { y: now.getFullYear(), mo: now.getMonth() });
      const recs = [];
      root.querySelectorAll('[data-rid]').forEach(tr => {
        const v = tr.querySelector('[data-rv]').value;
        if (!v) return;
        const id = `mrating-${sel.y}-${U.pad(sel.mo)}-${tr.dataset.rid}`;
        recs.push(
          Object.assign({}, Store.get(id) || {}, {
            c: 'mrating',
            id,
            mid: tr.dataset.rid,
            year: sel.y,
            month: sel.mo,
            rating: +v,
            comment: tr.querySelector('[data-rc]').value.trim(),
            by: App.me,
          })
        );
      });
      if (!recs.length) return UI.toast('Pick a rating first', 'bad');
      Store.saveMany(recs);
      UI.toast(`${recs.length} rating(s) saved`, 'good');
      App.render(true);
    };
  },
};

/* save weights + parts through Calc.saveScoring (keeps the year-freezing and the Admin checks) */
Calc.saveScoringParts = function (team, weights, custom, msg) {
  const S = Calc.scoring(App.year);
  const sc = Object.assign({}, S, { weights, custom });
  delete sc.projectsSplit;
  Calc.saveScoring(team, Object.assign(sc, { projectsSplit: S.projectsSplit }), App.year);
  if (msg) UI.toast(msg, 'good');
  App.render(true);
};

(function () {
  // "Why is my score …?": the added parts, ratings (with the manager's comment) and bonus / penalty points
  const rows = ScoreWhy.rows;
  ScoreWhy.rows = function (y, mid, mo) {
    const x = rows.apply(ScoreWhy, arguments);
    if (!x) return x;
    for (const p of x.parts)
      if (!x.v[p.key]) {
        const r = p.source === 'rating' ? Store.get(`mrating-${y}-${U.pad(mo)}-${mid}`) : null;
        x.v[p.key] = [
          p.skipped
            ? p.source === 'rating'
              ? 'not rated yet'
              : 'nothing this month'
            : ScoreParts.fmt(p.source, p.value) + (r && r.comment ? ` — “${r.comment}”` : ''),
          ScoreWhy.tierText(
            ((Calc.scoring(y).custom || []).find(d => 'c_' + d.id === p.key) || {}).tiers || ScoreParts.src(p.source)[3],
            true,
            ScoreParts.src(p.source)[2] === 'ratio' ? '%' : ''
          ),
        ];
      }
    return x;
  };
  const box = ScoreWhy.box;
  ScoreWhy.box = function (y, mid, mo) {
    let out = box.apply(ScoreWhy, arguments);
    const c = Calc.monthScore(y, mid, mo);
    if (out && c && c.adj && c.adj.length)
      out = out.replace(
        /<\/p><\/section>$/,
        `</p><div class="small">${c.adj.map(a => `${a.points > 0 ? '➕' : '➖'} <b>${a.points > 0 ? '+' : ''}${a.points}</b> ${h(a.reason || '')} <span class="muted">(${h(Store.memberShort(a.by))})</span>`).join('<br>')}<br>Parts ${U.num(c.base, 2)} ${c.adj.reduce((s, a) => s + +a.points, 0) >= 0 ? '+' : '−'} ${Math.abs(c.adj.reduce((s, a) => s + +a.points, 0))} → <b>${U.num(c.score, 2)}</b></div></section>`
      );
    return out;
  };
  // Manager Desk: ratings
  if (P.manager) {
    const base = P.manager;
    P.manager = function () {
      const out = base.apply(this, arguments);
      if (!out || !out.html) return out;
      const rc = ScorePartsUI.ratingCard();
      if (!rc) return out;
      const at = out.html.indexOf('<div class="needs-you');
      const end = at >= 0 ? out.html.indexOf('</div>', at) + 6 : -1;
      out.html = end > 5 ? out.html.slice(0, end) + rc + out.html.slice(end) : out.html + rc;
      const m0 = out.mount;
      out.mount = root => {
        if (m0) m0(root);
        ScorePartsUI.bindRating(root);
      };
      return out;
    };
  }
})();
