/* MAHAM — Extra score parts (from November 2026, like Projects): parts the admin adds from data MAHAM already
 * keeps, a monthly manager rating, and bonus / penalty points.
 *   scoring.custom = [{ id, source, name, tiers }]; its weight is scoring.weights['c_' + id] (so totals stay 100%)
 *   mrating  { id: mrating-<year>-<mm>-<person>, mid, year, month, rating 1–5, comment, by }   — the team's manager
 *   scoreadj { id: scoreadj-<by>-<ts>, mid, team, year, month, points (+/-), reason, by }      — super admin / Admin (Scoring)
 * A part with nothing to score that month is left out (its weight goes to the others), as for the built-in parts. */
'use strict';

const ScoreParts = {
  SOURCES: [
    [
      'actions',
      'Meeting actions done on time',
      'ratio',
      [
        [1, 100],
        [0.9, 90],
        [0.75, 80],
        [0.5, 65],
        [-1, 50],
      ],
    ],
    [
      'goodcatch',
      'Good catches logged',
      'count',
      [
        [3, 100],
        [2, 90],
        [1, 80],
        [-1, 60],
      ],
    ],
    [
      'courses',
      'Courses completed',
      'count',
      [
        [2, 100],
        [1, 90],
        [-1, 70],
      ],
    ],
    [
      'central',
      'Central follow-ups solved',
      'count',
      [
        [5, 100],
        [3, 90],
        [1, 80],
        [-1, 60],
      ],
    ],
    [
      'present',
      'Days present',
      'ratio',
      [
        [1, 100],
        [0.95, 95],
        [0.9, 90],
        [0.8, 80],
        [-1, 60],
      ],
    ],
    [
      'decide',
      'Requests decided on time (approvers)',
      'ratio',
      [
        [1, 100],
        [0.9, 90],
        [0.75, 80],
        [-1, 60],
      ],
    ],
    [
      'rating',
      'Manager rating (1–5)',
      'rating',
      [
        [5, 100],
        [4, 90],
        [3, 80],
        [2, 65],
        [-1, 50],
      ],
    ],
  ],
  src(k) {
    return ScoreParts.SOURCES.find(s => s[0] === k) || [k, k, 'count', [[-1, 50]]];
  },
  inMonth(d, y, mo) {
    return !!d && U.year(d) === y && U.month(d) === mo;
  },
  monthDays(y, mo) {
    const out = [];
    const today = U.todayStr();
    for (let d = `${y}-${U.pad(mo)}-01`; U.month(d) === mo && d <= today; d = U.addDays(d, 1)) if (!U.isOff(d)) out.push(d);
    return out;
  },
  /* the person's value for one month (null = nothing to score) */
  _c: new Map(),
  _cv: -1,
  value(source, mid, y, mo) {
    if (ScoreParts._cv !== Store.ver) {
      ScoreParts._c.clear();
      ScoreParts._cv = Store.ver;
    }
    const k = `${source}|${mid}|${y}|${mo}`;
    if (ScoreParts._c.has(k)) return ScoreParts._c.get(k);
    const v = ScoreParts._value(source, mid, y, mo);
    ScoreParts._c.set(k, v);
    return v;
  },
  _value(source, mid, y, mo) {
    const today = U.todayStr();
    switch (source) {
      case 'actions': {
        const l = Store.all('action', '*').filter(
          a =>
            a.who === mid && a.due && ScoreParts.inMonth(a.due, y, mo) && a.status !== 'Canceled' && (a.status === 'Done' || a.due < today)
        );
        return l.length ? l.filter(a => a.status === 'Done' && (a.doneDate || a.due) <= a.due).length / l.length : null;
      }
      case 'goodcatch':
        return Store.all('gcatch', '*').filter(
          g => (g.createdBy || g._by) === mid && ScoreParts.inMonth(g.found || U.ds(new Date(g._ts || 0)), y, mo)
        ).length;
      case 'courses':
        return Store.all('course', '*').filter(
          c => c.analyst === mid && (c.completed || U.lc(c.status) === 'completed') && ScoreParts.inMonth(c.end || c.start, y, mo)
        ).length;
      case 'central':
        return Store.all('central', '*').filter(
          r => r.analyst === mid && r.status === 'Solved' && ScoreParts.inMonth(U.ds(new Date(r._ts || 0)), y, mo)
        ).length;
      case 'present': {
        const d = ScoreParts.monthDays(y, mo);
        return d.length ? d.filter(x => !TimeRules.leaveOn(mid, x)).length / d.length : null;
      }
      case 'decide': {
        const l = Store.all('request', '*').filter(
          q => (q.mgrBy === mid || q.dirBy === mid) && ScoreParts.inMonth(q.mgrOn || q.dirOn, y, mo)
        );
        if (!l.length) return null;
        const R = TimeRules.at((Store.member(mid) || {}).team || 'apps');
        const off = TimeRules.offFn(R, null);
        return (
          l.filter(q => {
            const from = U.ds(new Date(q.createdAt || q._created || q._ts || 0));
            const on = q.mgrBy === mid ? q.mgrOn : q.dirOn;
            return TimeRules.workBetween(from, on, off) <= +R.requests.approveDays;
          }).length / l.length
        );
      }
      case 'rating': {
        const r = Store.get(`mrating-${y}-${U.pad(mo)}-${mid}`);
        return r && !r._del && +r.rating ? +r.rating : null;
      }
      default:
        return null;
    }
  },
  /* counts: if nobody in the team has any that month, the part is left out for everyone */
  teamHasAny(source, y, mo) {
    return Store.scoredTeam().some(m => +ScoreParts.value(source, m.id, y, mo) > 0);
  },
  adjOf(mid, y, mo) {
    return (Store.byC.scoreadj || []).filter(a => a && !a._del && a.mid === mid && +a.year === y && +a.month === mo);
  },
  canAdjust(team) {
    return App.realSuper() || AdminRole.can(App.me, 'scoring', team);
  },
  canRate(mid) {
    const m = Store.member(mid);
    return (
      !!m &&
      mid !== App.me &&
      (App.realSuper() || (Store.can(App.me, 'assignTodo') && Store.teamsFor(App.me).some(t => t.id === (m.team || 'apps'))))
    );
  },
  fmt(source, v) {
    const k = ScoreParts.src(source)[2];
    return v == null ? '—' : k === 'ratio' ? U.pct(v, 0) : k === 'rating' ? `${v} / 5` : String(v);
  },
};

(function () {
  const ms = Calc.monthScore;
  Calc.monthScore = function (y, mid, mo) {
    const c = ms.apply(Calc, arguments);
    if (!c || !c.parts) return c;
    const S = Calc.scoring(y);
    const W = S.weights || {};
    for (const d of S.custom || []) {
      const w = +W['c_' + d.id] || 0;
      if (!w) continue;
      const kind = ScoreParts.src(d.source)[2];
      let v = ScoreParts.value(d.source, mid, y, mo);
      if (kind === 'count' && !ScoreParts.teamHasAny(d.source, y, mo)) v = null;
      const skip = v == null;
      const pts = skip ? null : U.r2((Calc.tierGE(d.tiers && d.tiers.length ? d.tiers : ScoreParts.src(d.source)[3], v) * w) / 100);
      c.parts.push({
        key: 'c_' + d.id,
        label: d.name || ScoreParts.src(d.source)[1],
        weight: w,
        points: pts,
        max: w,
        skipped: skip,
        value: v,
        source: d.source,
      });
      c['c_' + d.id] = pts || 0;
    }
    const act = c.parts.filter(p => !p.skipped);
    const wAct = act.reduce((a, p) => a + p.weight, 0);
    c.base = U.r2(wAct ? (act.reduce((a, p) => a + (p.points || 0), 0) / wAct) * 100 : 0);
    c.skipped = c.parts.filter(p => p.skipped).map(p => p.key);
    const adj = ScoreParts.adjOf(mid, y, mo);
    c.adj = adj;
    c.score = U.r2(Math.max(0, Math.min(100, c.base + adj.reduce((a, x) => a + (+x.points || 0), 0))));
    return c;
  };
})();
