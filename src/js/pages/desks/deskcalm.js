/* MAHAM — calm desks (2026.11.13.6): Manager Desk and Director Desk (Today) as
 *   1. a thin number strip — the Analyst Desk numbers for the whole team / all my teams,
 *   2. Needs you — ONE list: the boxes become groups in it, chips on top filter it (a kind with nothing = grey 0),
 *   3. Watch — ONE panel beside it, the same height: one line per risk (count + first item); click a line to open it,
 *   4. The team(s) — unchanged.
 * Built on top of the finished page: the boxes other files put in (deskPut) keep their own buttons and bindings —
 * this file only moves them. Loaded after every other wrap of P.manager / P.director. */
'use strict';

const DeskCalm = {
  filt: {}, // desk → chip on
  open: new Set(), // Watch lines open (kept while the app is open)
  NEED: {
    manager: [
      ['appr', 'Approvals', /^Waiting for your approval/],
      ['qw', 'Quick wins', /^Quick wins waiting/],
      ['conf', 'To confirm', /^To Dos to confirm/],
      ['proj', 'My projects', /^My projects/],
      ['dir', 'From the director', /^From the director/],
      ['work', 'My work', /^My work/],
      ['ask', 'Other asks', null],
    ],
    director: [
      ['dec', 'Decisions', /^Decisions from managers/],
      ['appr', 'Approvals', /^Waiting for your approval/],
      ['fu', 'Follow-ups this week', /^Follow-ups due/],
      ['aed', 'From the AED', /^From the AED/],
      ['proj', 'My projects', /^My projects/],
      ['task', 'My tasks', null],
    ],
  },
  WATCH: {
    // [label, title match, red when not 0]
    manager: [
      ['Overdue To Do', /^Overdue To Do/, 1],
      ['Late work', /^Late work/, 1],
      ['Slipping', /^Slipping/],
      ['External follow-ups', /^External follow-ups/],
      ['Open help desk > 5 days', /^Open requests older/],
      ['Projects at risk', /^Projects at risk/, 1],
    ],
    director: [
      ['Open tasks you assigned', /^Open tasks you assigned/, 1],
      ['Projects behind', /^Projects behind/, 1],
      ['Late work', /^Late work/],
      ['Waiting on managers', /^Waiting on managers/],
      ['Managers on leave', /^Managers on leave/],
      ['ManageEngine not imported', /^ManageEngine not imported/],
    ],
  },
  DROP: {}, // (My work stays: it also holds project approvals and meeting actions for the manager)

  /* ---------- 1. the number strip ---------- */
  nums(teamIds) {
    // the Analyst Desk numbers, for everyone in these teams (each counted in its own team)
    const y = App.year;
    const mo = new Date().getFullYear() === y ? new Date().getMonth() + 1 : 12;
    const saved = App.viewTeam;
    const per = teamIds.map(t => {
      App.viewTeam = t;
      const ppl = Store.scoredTeam();
      const ids = new Set(ppl.map(m => m.id));
      const month = ppl
        .map(m => {
          try {
            const c = Calc.monthScore(y, m.id, mo);
            return c ? c.score : null;
          } catch (e) {
            return null;
          }
        })
        .filter(v => v != null);
      const ytd = Calc.heatmap(y)
        .rows.filter(r => ids.has(r.m.id))
        .map(r => r.avg)
        .filter(v => v != null);
      const td = Calc.todos(null).filter(t2 => t2.status === 'In Progress' && !t2.r.virtual && ids.has(t2.r.analyst));
      const hd = Calc.helpdesk(null).filter(x => !x.closed && ids.has(x.mid)).length;
      const sw = U.sum(
        Calc.shadow(y)
          .filter(s => s.month === mo && ids.has(s.r.analyst))
          .map(s => s.hrs)
      );
      return { t, n: ppl.length, month, ytd, open: td.length, late: td.filter(x => x.timing === 'Delayed').length, hd, sw };
    });
    App.viewTeam = saved;
    const all = k => per.flatMap(p => p[k]);
    const sum = k => U.sum(per.map(p => p[k]));
    const people = sum('n');
    return {
      per,
      mo,
      people,
      month: all('month').length ? U.avg(all('month')) : null,
      ytd: all('ytd').length ? U.avg(all('ytd')) : null,
      open: sum('open'),
      late: sum('late'),
      hd: sum('hd'),
      sw: sum('sw'),
    };
  },
  strip(level) {
    const ids = level === 'director' ? App.myTeams().map(t => t.id) : [App.viewTeam || 'apps'];
    const N = DeskCalm.nums(ids);
    const many = N.per.length > 1;
    const SH = Custom.target('shadowHrs');
    const by = (k, f) =>
      many
        ? N.per
            .filter(p => p[k] && (!Array.isArray(p[k]) || p[k].length))
            .map(p => `${h(Store.teamName(p.t))} ${f(p)}`)
            .join(' · ')
        : '';
    const who = level === 'director' ? 'Department' : 'Team';
    const go = level === 'director' ? '#/director/team' : null;
    const tile = (k, label, v, sub, href, cls = '') =>
      `<a class="dc-num" data-k="${k}" href="${go || href}"><span class="l">${label}</span><span class="v ${cls}">${v}</span>${sub ? `<span class="s">${sub}</span>` : ''}</a>`;
    const perPerson = N.people ? N.sw / N.people : 0;
    return `<div class="dc-strip">${[
      tile(
        'score',
        `${who} score this month`,
        N.month != null ? U.num(N.month, 1) : '–',
        many ? by('month', p => U.num(U.avg(p.month), 1)) : `live · ${N.people} analyst${N.people === 1 ? '' : 's'}`,
        '#/perf/dashboard',
        N.month != null ? 'dc-sc-' + UI.scoreClass(N.month) : ''
      ),
      tile(
        'ytd',
        `${who} YTD average`,
        N.ytd != null ? U.num(N.ytd, 1) : '–',
        many ? by('ytd', p => U.num(U.avg(p.ytd), 1)) : String(App.year),
        '#/perf/dashboard'
      ),
      tile(
        'todo',
        'Pending To Do',
        N.open,
        N.late ? `<b class="t-bad">${N.late} delayed</b>${many ? ' · ' + by('late', p => p.late) : ''}` : 'none delayed',
        '#/todo'
      ),
      tile('hd', 'Open help desk', N.hd, many ? by('hd', p => p.hd) || 'none open' : 'requests with the team', '#/helpdesk'),
      tile(
        'sw',
        'Shadow work',
        U.num(N.sw, 1) + ' h',
        `${U.MONTHS[N.mo - 1]} · ${U.num(perPerson, 1)} h a person · target ≥ ${SH} h`,
        '#/shadow',
        perPerson >= SH ? 'good' : ''
      ),
    ].join('')}</div>`;
  },

  /* ---------- Director: approvals stuck with a manager (new Watch line) ---------- */
  waitingOnManagers() {
    const rows = App.myTeams()
      .map(t => {
        const qw = Store.all('quickwin', '*').filter(q => (q.team || 'apps') === t.id && !q.approval && !q.deleted);
        const rv = Store.all('todo', '*').filter(x => (x.team || 'apps') === t.id && x.status === 'Ready for review');
        const old = qw
          .map(q => q.date)
          .filter(Boolean)
          .sort()[0];
        const m = Store.teamManager(t.id);
        return { t, m, qw: qw.length, rv: rv.length, old };
      })
      .filter(r => r.qw || r.rv);
    const n = U.sum(rows.map(r => r.qw + r.rv));
    return card(
      `Waiting on managers <span class="count">${n}</span>`,
      rows
        .map(
          r =>
            `<div class="li click" data-deskteam="${h(r.t.id)}"><div class="grow"><b>${h(r.m ? Store.memberShort(r.m.id) : Store.teamName(r.t.id))}</b> <span class="muted small">· ${h(Store.teamName(r.t.id))}</span><div class="muted small">${[r.qw ? `${r.qw} quick win${r.qw === 1 ? '' : 's'} to approve${r.old ? ` (oldest ${U.diffDays(r.old, U.todayStr())} d)` : ''}` : '', r.rv ? `${r.rv} To Do${r.rv === 1 ? '' : 's'} to confirm` : ''].filter(Boolean).join(' · ')}</div></div></div>`
        )
        .join('')
    );
  },

  /* ---------- the page ---------- */
  wrapHtml(html, level) {
    const a = '<section class="desk-grp" data-dg="need">',
      b = '<section class="desk-grp" data-dg="team">';
    if (!html.includes(a) || !html.includes(b)) return html;
    let strip;
    try {
      strip = DeskCalm.strip(level);
    } catch (e) {
      strip = '';
    }
    return html.replace(a, `${strip}<div class="dc-main" data-desk="${level}">${a}`).replace(b, `</div>${b}`);
  },
  titleOf(cardEl) {
    const h3 = cardEl.querySelector(':scope > .card-head h3');
    if (!h3) return '';
    const c = h3.cloneNode(true);
    c.querySelectorAll('.count, .badge').forEach(x => x.remove());
    return c.textContent.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  },
  countOf(cardEl, body) {
    const n = cardEl.querySelector(':scope > .card-head h3 .count');
    const v = n ? parseInt(n.textContent, 10) : NaN;
    if (!isNaN(v)) return v;
    return body.reduce((s, x) => s + (x.matches('.li') ? 1 : x.querySelectorAll('.li, tbody tr').length), 0);
  },
  bodyOf(cardEl) {
    return [...cardEl.childNodes].filter(
      x => !(x.nodeType === 1 && x.classList.contains('card-head')) && !(x.nodeType === 3 && !x.textContent.trim())
    );
  },
  previewOf(body) {
    for (const x of body) {
      if (x.nodeType !== 1) continue;
      const li = x.matches('.li') ? x : x.querySelector('.li, tbody tr');
      if (!li) continue;
      const b = li.querySelector('b');
      const t = (b && b.textContent.trim()) || li.textContent.trim();
      return t.replace(/\s+/g, ' ').slice(0, 90);
    }
    return '';
  },
  /* a fake box (for rows split out of the Director's mixed "Needs your attention" list) */
  makeCard(title, rows) {
    const s = document.createElement('section');
    s.className = 'card';
    s.innerHTML = `<div class="card-head"><h3>${h(title)} <span class="count">${rows.length}</span></h3></div>`;
    rows.forEach(r => s.appendChild(r));
    return s;
  },

  mount(root, level) {
    const main = root.querySelector('.dc-main');
    if (!main) return;
    const need = main.querySelector('.desk-grp[data-dg="need"]'),
      watch = main.querySelector('.desk-grp[data-dg="watch"]');
    if (!need || !watch) return;
    const cardsIn = sec => [...sec.querySelectorAll('.card')].filter(c => !c.parentElement.closest('.card'));
    let needCards = cardsIn(need);
    const watchCards = cardsIn(watch);
    // Director: split "Needs your attention" — decisions / approvals stay, the rest is something to watch
    const att = needCards.find(c => /^Needs your attention/.test(DeskCalm.titleOf(c)));
    if (att) {
      const rows = [...att.querySelectorAll('.att-item')];
      const kindOf = r => {
        const k = r.querySelector('.grow > .muted.small');
        return k ? k.textContent.trim() : '';
      };
      const dec = rows.filter(r => /^Decision/.test(kindOf(r))),
        appr = rows.filter(r => /Approval/i.test(kindOf(r)));
      const proj = rows.filter(r => /^Project/.test(kindOf(r)) && !appr.includes(r)),
        me = rows.filter(r => /ManageEngine/.test(kindOf(r))),
        away = rows.filter(r => /on leave/i.test(kindOf(r)));
      // a manager on leave with nobody acting joins Managers on leave
      needCards = needCards.filter(c => c !== att);
      if (dec.length) needCards.push(DeskCalm.makeCard('Decisions from managers', dec));
      if (appr.length) needCards.push(DeskCalm.makeCard('Waiting for your approval', appr));
      if (proj.length) watchCards.push(DeskCalm.makeCard('Projects behind', proj));
      if (me.length) watchCards.push(DeskCalm.makeCard('ManageEngine not imported', me));
      if (away.length) watchCards.push(DeskCalm.makeCard('Managers on leave', away));
      // overdue tasks with managers: their "Ask for update" goes to the top of Open tasks you assigned (the count stays)
      const late = rows.filter(r => /^Overdue task/.test(kindOf(r)));
      if (late.length) {
        const ot = watchCards.find(c => /^Open tasks you assigned/.test(DeskCalm.titleOf(c)));
        if (ot) {
          const hd = ot.querySelector(':scope > .card-head');
          const box = document.createElement('div');
          box.className = 'dc-late';
          late.forEach(r => box.appendChild(r));
          hd.after(box);
        } else watchCards.push(DeskCalm.makeCard('Open tasks you assigned', late));
      }
      att.remove();
    }
    const drop = DeskCalm.DROP[level];
    if (drop)
      needCards = needCards.filter(c => {
        if (drop.test(DeskCalm.titleOf(c))) {
          c.remove();
          return false;
        }
        return true;
      });

    /* ----- Needs you: one list, grouped by kind, chips on top ----- */
    const kinds = DeskCalm.NEED[level];
    const fallback = kinds.find(k => !k[2]) || kinds[kinds.length - 1];
    const groups = new Map(kinds.map(k => [k[0], []]));
    for (const c of needCards) {
      const t = DeskCalm.titleOf(c);
      const k = kinds.find(x => x[2] && x[2].test(t)) || fallback;
      groups.get(k[0]).push(c);
    }
    const head = need.querySelector(':scope > .dg-head');
    const extras = [...need.querySelectorAll(':scope > .oneline-btns')];
    const list = document.createElement('div');
    list.className = 'dc-list';
    const counts = {};
    for (const [k, label] of kinds) {
      const cs = groups.get(k);
      counts[k] = 0;
      if (!cs.length) continue;
      const g = document.createElement('div');
      g.className = 'dc-grp';
      g.dataset.k = k;
      for (const c of cs) {
        const body = DeskCalm.bodyOf(c);
        const n = DeskCalm.countOf(c, body);
        counts[k] += n;
        const t = DeskCalm.titleOf(c);
        const gh = document.createElement('div');
        gh.className = 'dc-gh';
        gh.innerHTML = `<span class="dc-kind">${h(t)}</span><span class="count">${n}</span>`;
        c.querySelectorAll(':scope > .card-head > :not(h3)').forEach(x => gh.appendChild(x));
        const h3 = c.querySelector(':scope > .card-head h3');
        if (h3) h3.querySelectorAll('.badge').forEach(x => gh.insertBefore(x, gh.querySelector('.count').nextSibling));
        g.appendChild(gh);
        body.forEach(x => g.appendChild(x));
        c.remove();
      }
      list.appendChild(g);
    }
    const total = U.sum(Object.values(counts));
    const on = DeskCalm.filt[level] && counts[DeskCalm.filt[level]] ? DeskCalm.filt[level] : 'all';
    const chips = document.createElement('div');
    chips.className = 'dc-chips';
    chips.innerHTML =
      `<button type="button" class="dc-chip" data-f="all" aria-pressed="${on === 'all'}">All <span class="n">${total}</span></button>` +
      kinds
        .map(
          ([k, label]) =>
            `<button type="button" class="dc-chip${counts[k] ? '' : ' zero'}" data-f="${k}" aria-pressed="${on === k}"${counts[k] ? '' : ' disabled'}>${h(label)} <span class="n">${counts[k]}</span></button>`
        )
        .join('');
    if (!total) list.innerHTML = '<div class="dc-done">✓ Nothing waiting for you</div>';
    [...need.childNodes].forEach(x => {
      if (x !== head) x.remove();
    });
    extras.forEach(x => head.appendChild(x));
    need.appendChild(chips);
    need.appendChild(list);
    const apply = f => {
      DeskCalm.filt[level] = f;
      chips.querySelectorAll('.dc-chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === f));
      list.querySelectorAll('.dc-grp').forEach(g => {
        g.hidden = f !== 'all' && g.dataset.k !== f;
      });
    };
    chips
      .querySelectorAll('.dc-chip:not([disabled])')
      .forEach(b => (b.onclick = () => apply(DeskCalm.filt[level] === b.dataset.f && b.dataset.f !== 'all' ? 'all' : b.dataset.f)));
    apply(on);

    /* ----- Watch: one line per risk ----- */
    const notes = [...watch.querySelectorAll(':scope > .oneline:not(.dg-empty)')];
    const fixed = DeskCalm.WATCH[level];
    const used = new Set();
    const lines = [];
    const lineOf = (label, cs, red) => {
      const body = cs.flatMap(c => DeskCalm.bodyOf(c));
      const n = U.sum(cs.map(c => DeskCalm.countOf(c, DeskCalm.bodyOf(c))));
      const links = cs.flatMap(c => [...c.querySelectorAll(':scope > .card-head > :not(h3)')]);
      const pv = DeskCalm.previewOf(body);
      const id = level + '|' + label;
      const w = document.createElement('div');
      w.className = 'dc-wl' + (n && DeskCalm.open.has(id) ? ' open' : '');
      w.dataset.w = label;
      w.innerHTML = `<button type="button" class="dc-wh" aria-expanded="${w.classList.contains('open')}"${n ? '' : ' disabled'}><span class="chev">${n ? '›' : ''}</span><span class="lbl">${h(label)}<span class="pv">${n ? h(pv) + (n > 1 ? ` · +${n - 1} more` : '') : 'nothing right now'}</span></span><span class="cnt ${n ? (red ? 'bad' : '') : 'ok'}">${n ? n : '✓ 0'}</span></button><div class="dc-wb"></div>`;
      const wb = w.querySelector('.dc-wb');
      body.forEach(x => wb.appendChild(x));
      const nudges = [...wb.querySelectorAll('[data-nudge]')];
      if (links.length || nudges.length > 1) {
        const f = document.createElement('div');
        f.className = 'dc-wf';
        links.forEach(x => f.appendChild(x));
        if (nudges.length > 1) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn xs';
          b.dataset.nudgeall = '1';
          b.textContent = 'Ask all for an update';
          f.appendChild(b);
        }
        wb.appendChild(f);
      }
      cs.forEach(c => c.remove());
      w.querySelector('.dc-wh').onclick = () => {
        if (!n) return;
        w.classList.toggle('open');
        const o = w.classList.contains('open');
        w.querySelector('.dc-wh').setAttribute('aria-expanded', o);
        if (o) DeskCalm.open.add(id);
        else DeskCalm.open.delete(id);
      };
      return w;
    };
    for (const [label0, re, red] of fixed) {
      const label = /^Open help desk/.test(label0) && typeof HD2T !== 'undefined' ? `Open help desk > ${HD2T.DAYS} days` : label0;
      const cs = watchCards.filter(c => !used.has(c) && re.test(DeskCalm.titleOf(c)));
      cs.forEach(c => used.add(c));
      lines.push(lineOf(label, cs, red));
    }
    for (const c of watchCards.filter(c => !used.has(c))) lines.push(lineOf(DeskCalm.titleOf(c), [c], 1));
    const wls = document.createElement('div');
    wls.className = 'dc-wls';
    lines.forEach(l => wls.appendChild(l));
    const whead = watch.querySelector(':scope > .dg-head');
    [...watch.childNodes].forEach(x => {
      if (x !== whead) x.remove();
    });
    watch.appendChild(wls);
    notes.forEach(x => {
      x.classList.add('dc-note');
      watch.appendChild(x);
    });
    // Ask all for an update — the same as pressing each "Ask for update" (one save, one message)
    watch.querySelectorAll('[data-nudgeall]').forEach(
      b =>
        (b.onclick = e => {
          e.stopPropagation();
          // every overdue To Do of the team (the box may show only the first ones), plus any other "Ask for update" in the line
          const ids = new Set([...b.closest('.dc-wb').querySelectorAll('[data-nudge]')].map(x => x.dataset.nudge));
          if (b.closest('.dc-wl').dataset.w === 'Overdue To Do')
            Calc.todos(null)
              .filter(t => t.status === 'In Progress' && t.timing === 'Delayed' && !t.r.virtual)
              .forEach(t => ids.add(t.r.id));
          const recs = [...ids].map(id => Store.get(id)).filter(r => r && r.nudgedOn !== U.todayStr());
          if (!recs.length) return;
          Store.saveMany(recs.map(r => Object.assign({}, r, { nudgedOn: U.todayStr(), nudgedBy: App.me })));
          UI.toast(`Asked ${recs.length} for an update`, 'good');
          App.render();
        })
    );
  },
};

(function () {
  if (P.manager) {
    const base = P.manager;
    P.manager = function () {
      const out = base.apply(this, arguments);
      if (!out || !out.html) return out;
      out.html = DeskCalm.wrapHtml(out.html, 'manager');
      const m0 = out.mount;
      out.mount = root => {
        if (m0) m0(root);
        DeskCalm.mount(root, 'manager');
      };
      return out;
    };
  }
  if (P.director) {
    const base = P.director;
    P.director = function () {
      const out = base.apply(this, arguments);
      if (!out || !out.html || !out.html.includes('data-dg="need"')) return out;
      try {
        out.html = deskPut(out.html, 'watch', DeskCalm.waitingOnManagers());
      } catch (e) {
        /* never break the desk */
      }
      out.html = DeskCalm.wrapHtml(out.html, 'director');
      const m0 = out.mount;
      out.mount = root => {
        if (m0) m0(root);
        DeskCalm.mount(root, 'director');
      };
      return out;
    };
  }
})();
