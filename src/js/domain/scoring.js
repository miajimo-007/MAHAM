/* MAHAM — Monthly scores — the same formula as the Dashboard sheet of MAHAM-tracker.xlsx (weights and tiers in Config.DEFAULT_SCORING, overridable per team). */
'use strict';

Object.assign(Calc, {
  /* scoring rules for a team and year: a year whose rules were changed later keeps its own (settings-scoring-<team>.years) */
  scoring(year) {
    if (Calc._whatIf) return Calc._whatIf; // Admin → Scoring what-if preview
    const y = +(year || App.year);
    const frozen = (Store.tset('settings-scoring', 'years', null) || {})[y];
    const s = frozen || Store.tset('settings-scoring', 'scoring', null);
    return s
      ? Object.assign({}, Config.DEFAULT_SCORING, s, { tiers: Object.assign({}, Config.DEFAULT_SCORING.tiers, s.tiers || {}) })
      : Config.DEFAULT_SCORING;
  },
  /* save scoring for a team: editing a past year changes only that year; editing the current year first freezes
   * the rules every earlier year was using, so last year's scores never change afterwards */
  saveScoring(team, sc, year) {
    const id = 'settings-scoring-' + team;
    const cur = Store.get(id) || { id, c: 'settings' };
    const years = Object.assign({}, cur.years || {});
    const now = new Date().getFullYear();
    const y = +(year || now);
    if (y < now) {
      years[y] = sc || Config.DEFAULT_SCORING;
      return Store.save(Object.assign({}, cur, { years }));
    }
    const was = cur.scoring || Store.setting('settings-scoring', 'scoring', null) || Config.DEFAULT_SCORING;
    for (let k = 2025; k < now; k++) if (!years[k]) years[k] = was;
    const out = Object.assign({}, cur, { years });
    if (sc) out.scoring = sc;
    else delete out.scoring;
    return Store.save(out);
  },
  tierGE(list, v) {
    for (const [t, p] of list) if (v >= t) return p;
    return list[list.length - 1][1];
  },
  tierLE(list, v) {
    for (const [t, p] of list) if (v <= t) return p;
    return list[list.length - 1][1];
  },
  /* ---------- Monthly metrics per member (Performance sheet) ---------- */
  perf(year) {
    return Calc.memo('perf' + year, () => {
      const team = Store.scoredTeam();
      const N = team.length || 1;
      const P = { N, members: {}, team: {} };
      const blank = () => ({ todo: 0, onTime: 0, hd: 0, hdHrs: [], hdSame: 0, swHrs: 0, swCat: {}, qw: 0, permHrs: 0, active: false });
      for (const m of team) {
        P.members[m.id] = {};
        for (let i = 1; i <= 12; i++) P.members[m.id][i] = blank();
        P.members[m.id].ytd = blank();
      }
      for (let i = 1; i <= 12; i++) P.team[i] = blank();
      P.team.ytd = blank();
      const bump = (mid, mo, f) => {
        const M = P.members[mid];
        if (M && mo) {
          f(M[mo]);
          f(M.ytd);
        }
        if (mo) {
          f(P.team[mo]);
          f(P.team.ytd);
        }
      };
      for (const t of Calc.todos(year))
        if (t.status !== 'Canceled' && P.members[t.r.analyst])
          bump(t.r.analyst, t.month, o => {
            o.todo++;
            if (t.timing === 'On Time') o.onTime++;
            o.active = true;
          });
      for (const h of Calc.helpdesk(year))
        if (h.bc)
          bump(h.mid, h.month, o => {
            o.hd++;
            if (h.hrs != null) o.hdHrs.push(h.hrs);
            if (h.sameDay === 'Same') o.hdSame++;
            o.active = true;
          });
      for (const s of Calc.shadow(year))
        if (P.members[s.r.analyst])
          bump(s.r.analyst, s.month, o => {
            o.swHrs += s.hrs;
            o.swCat[s.cat] = (o.swCat[s.cat] || 0) + s.hrs;
            if (s.hrs) o.active = true;
          });
      for (const q of Store.all('quickwin')) {
        if (!(U.lc(q.status) === 'completed' && U.lc(q.approval) !== 'rejected' && q.expected && U.year(q.expected) === year)) continue; // a rejected quick win never counts
        const mo = U.month(q.expected);
        if (P.members[q.analyst])
          bump(q.analyst, mo, o => {
            o.qw++;
          });
        // shared quick win: each teammate who confirmed gets it in their own score (the team counts it once, above)
        for (const id of QS.confirmed(q)) {
          const M = P.members[id];
          if (M && id !== q.analyst) {
            M[mo].qw++;
            M.ytd.qw++;
          }
        }
      }
      for (const a of Calc.attendance(year))
        if (P.members[a.analyst] && +a.permHrs && a.status !== 'OFF')
          bump(a.analyst, U.month(a.date), o => {
            o.permHrs += +a.permHrs;
          });
      return P;
    });
  },
  /* score for one member in one month (Dashboard!V formula) */
  monthScore(year, mid, mo) {
    const P = Calc.perf(year);
    const S = Calc.scoring(year);
    const W = S.weights,
      T = S.tiers,
      HS = S.helpdeskSplit;
    const o = P.members[mid] && P.members[mid][mo];
    if (!o) return null;
    const now = new Date();
    if (year > now.getFullYear() || (year === now.getFullYear() && mo > now.getMonth() + 1)) return null;
    if (!o.active) return null;
    const teamAvg = P.team[mo].hd / P.N;
    const c = {};
    c.todoPct = o.todo ? o.onTime / o.todo : null;
    c.todo = ((o.todo ? Calc.tierGE(T.todo, c.todoPct) : T.todo[0][1]) * W.todo) / 100;
    c.reqRatio = teamAvg ? o.hd / teamAvg : null;
    c.req = ((teamAvg ? Calc.tierGE(T.requests, c.reqRatio) : T.requests[T.requests.length - 1][1]) * HS.requests) / 100;
    c.closingHrs = U.avg(o.hdHrs);
    c.close = ((c.closingHrs != null ? Calc.tierLE(T.closing, c.closingHrs) : T.closing[T.closing.length - 1][1]) * HS.closing) / 100;
    c.helpdesk = ((c.req + c.close) * W.helpdesk) / 100;
    c.attendance = (Calc.tierLE(T.attendance, o.permHrs) * W.attendance) / 100;
    c.shadow = (Calc.tierGE(T.shadow, o.swHrs) * W.shadow) / 100;
    c.quickwins = (Calc.tierGE(T.quickwins, o.qw) * W.quickwins) / 100;
    c.score = U.r2(c.todo + c.helpdesk + c.attendance + c.shadow + c.quickwins);
    c.raw = o;
    return c;
  },
  monthLocked(year, mo) {
    return Calc.memo(`ml${year}-${mo}`, () => Store.all('scoresnap').some(r => +r.year === year && +r.month === mo));
  },
  snapshot(year, mid, mo) {
    const r = Store.get(`snap-${year}-${U.pad(mo)}-${mid}`);
    return r ? r.score : null;
  },
  /* Admin → Scoring → Months: a month (whole team) or one person's month can be "Not counted" or get a set score.
   * settings-scoremonths-<team> = { months: { 'YYYY-MM': mark }, people: { '<id>|YYYY-MM': mark } },
   * mark = { kind: 'skip' | 'set' | 'normal', score, note, by, at } — a person's mark wins over the team's */
  monthMark(year, mid, mo, team) {
    const mt = mid && Store.member(mid) && !Store.topRole(Store.member(mid).role) ? Store.member(mid).team : ''; // the person's own team, not the team being viewed
    const r = Store.get('settings-scoremonths-' + (team || mt || App.viewTeam || 'apps'));
    if (!r) return null;
    const k = `${year}-${U.pad(mo)}`;
    const p = mid ? (r.people || {})[mid + '|' + k] : null;
    const m = p || (r.months || {})[k] || null;
    return m && m.kind !== 'normal' ? m : null;
  },
  /* the score shown: a set score or "not counted" first, then the locked snapshot, otherwise live */
  score(year, mid, mo) {
    const mk = Calc.monthMark(year, mid, mo);
    if (mk && mk.kind === 'skip') return null;
    if (mk && mk.kind === 'set') return { score: +mk.score, locked: false, set: true, mark: mk };
    const s = Calc.snapshot(year, mid, mo);
    if (s != null) return { score: s, locked: true };
    if (Calc.monthLocked(year, mo)) return null; // month closed: members without an official score get none
    const c = Calc.monthScore(year, mid, mo);
    return c ? { score: c.score, locked: false, c } : null;
  },
  heatmap(year) {
    return Calc.memo('heat' + year, () => {
      const rows = Store.scoredTeam().map(m => {
        const cells = [];
        for (let mo = 1; mo <= 12; mo++) cells.push(Calc.score(year, m.id, mo));
        const vals = cells.filter(Boolean).map(x => x.score);
        return { m, cells, avg: vals.length ? U.r2(U.avg(vals)) : null };
      });
      const teamCells = [];
      for (let i = 0; i < 12; i++) {
        const v = rows
          .map(r => r.cells[i])
          .filter(Boolean)
          .map(x => x.score);
        teamCells.push(v.length ? U.r2(U.avg(v)) : null);
      }
      const avgs = rows.map(r => r.avg).filter(v => v != null);
      return { rows, teamCells, teamAvg: avgs.length ? U.r2(U.avg(avgs)) : null };
    });
  },
  lastScoredMonth(year, mid) {
    const now = new Date();
    let mo = year === now.getFullYear() ? now.getMonth() : 12; // previous month by default
    for (; mo >= 1; mo--) {
      const s = Calc.score(year, mid, mo);
      if (s) return { mo, s };
    }
    return null;
  },
  /* ---------- Lazy days (no shadow work, no help-desk activity, no to-do assigned) ---------- */
  /* records that are not "work done that day" (imports, settings, tracking, attendance marks) */
  LAZY_SKIP: new Set(['helpdesk', 'attendance', 'settings', 'usage', 'ping', 'adminlog', 'userpin', 'scoresnap', 'actlog', 'feedback']),
  lazy(year) {
    return Calc.memo('lazy' + year, () => {
      const team = Store.scoredTeam();
      const sw = new Set(),
        hd = new Set(),
        td = new Set();
      for (const s of Calc.shadow(year)) if (+s.r.minutes) sw.add(s.r.date + '|' + s.r.analyst);
      for (const h of Store.all('helpdesk'))
        if (h.resolved) {
          const mid = Store.memberByMeName(h.technician);
          if (mid) hd.add(h.resolved.slice(0, 10) + '|' + mid);
        }
      for (const t of Calc.todos(year)) {
        td.add(t.r.assigned + '|' + t.r.analyst);
        if (t.r.finish && t.status !== 'Canceled') td.add(String(t.r.finish).slice(0, 10) + '|' + t.r.analyst);
      }
      // other work saved that day: quick wins, project tasks and comments, good catches, personal tasks, meetings…
      const ot = new Set();
      const SKIP = Calc.LAZY_SKIP;
      const ids = new Set(team.map(m => m.id));
      for (const r of Store.db.values()) {
        if (r._del || SKIP.has(r.c)) continue;
        if (r._by && ids.has(r._by) && r._ts > 1e12) ot.add(U.ds(new Date(r._ts)) + '|' + r._by);
        if (r.c === 'quickwin' && r.date && ids.has(r.analyst)) ot.add(String(r.date).slice(0, 10) + '|' + r.analyst);
        if (r.c === 'mytask' && r.doneDate && ids.has(r._by)) ot.add(String(r.doneDate).slice(0, 10) + '|' + r._by);
      }
      const att = Calc.attMap(year);
      const today = U.todayStr();
      const days = [];
      const res = {};
      for (const m of team) {
        res[m.id] = {};
        for (let i = 1; i <= 12; i++) res[m.id][i] = { work: 0, lazy: 0, off: 0 };
      }
      for (let d = new Date(year, 0, 1); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
        const s = U.ds(d);
        if (s > today) break;
        if (U.isOff(s)) continue; // weekends and public holidays are not lazy days
        const row = { date: s, cells: {} };
        for (const m of team) {
          const a = att[s + '|' + m.id];
          const k = s + '|' + m.id;
          const mo = d.getMonth() + 1;
          const off = a && a.status === 'OFF';
          const cell = { sw: sw.has(k), hd: hd.has(k), td: td.has(k), ot: ot.has(k), off };
          cell.lazy = !off && !cell.sw && !cell.hd && !cell.td && !cell.ot;
          if (off) res[m.id][mo].off++;
          else {
            res[m.id][mo].work++;
            if (cell.lazy) res[m.id][mo].lazy++;
          }
          row.cells[m.id] = cell;
        }
        days.push(row);
      }
      return { days, res };
    });
  },
  /* ---------- Dashboard KPIs ---------- */
  kpis(year) {
    return Calc.memo('kpi' + year, () => {
      const hd = Calc.helpdesk(year);
      const bc = hd.filter(h => h.bc);
      const P = Calc.perf(year);
      const heat = Calc.heatmap(year);
      const hrs = bc.map(h => h.hrs).filter(v => v != null);
      const td = Calc.todos(year).filter(t => t.status !== 'Canceled');
      const qwDone = Calc.qwCompletedIds(year);
      const months = [...new Set(hd.map(h => h.month))].sort((a, b) => a - b);
      return {
        teamScore: heat.teamAvg,
        requests: hd.length,
        bcRequests: bc.length,
        closedPct: bc.length ? bc.filter(h => h.closed).length / bc.length : null,
        avgClosing: U.avg(hrs),
        onTime: td.length ? td.filter(t => t.timing === 'On Time').length / td.length : null,
        sameDay: bc.length ? bc.filter(h => h.sameDay === 'Same').length / bc.length : null,
        shadowHrs: P.team.ytd.swHrs,
        quickWins: qwDone.size,
        period: months.length ? `${U.MONTHS[months[0] - 1]}–${U.MONTHS[months[months.length - 1] - 1]}` : '–',
        employees: Store.scoredTeam().length,
      };
    });
  },
});
