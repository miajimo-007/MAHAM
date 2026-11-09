/* MAHAM — Projects in the monthly score, and fair months (from November 2026 on; earlier months unchanged).
 *  - a sixth part "Projects" (weight 0 until someone sets it): on-time % of the person's project tasks (tiers, like
 *    To Do) + their share of the team's story points against the team average (tiers, like help desk requests)
 *  - no activity, no penalty: a part with nothing to score that month (no To Dos given, no project tasks, a team with
 *    no help desk requests) is left out and its weight moves to the other parts
 *  - a month partly on leave: shadow hours and quick wins are compared for the days the person was there
 *  - each month keeps the parts list (c.parts) so "Why is my score …?" can explain it */
'use strict';

const ProjScore = {
  FROM: 202611, // YYYYMM: the first month scored this way
  DEF: {
    weight: 0,
    split: { onTime: 70, share: 30 },
    tiers: {
      projects: [
        [1, 100],
        [0.9, 90],
        [0.8, 80],
        [0.6, 70],
        [-1, 50],
      ],
      projShare: [
        [1.2, 100],
        [1, 95],
        [0.8, 85],
        [0.6, 70],
        [-1, 50],
      ],
    },
  },
  LABEL: {
    todo: 'To Do on time',
    helpdesk: 'IT help desk',
    attendance: 'Attendance',
    quickwins: 'Quick wins',
    shadow: 'Shadow work',
    projects: 'Projects',
  },
  /* working days in the month (to today for the current month), and how many the person was there */
  presence(year, mid, mo) {
    const first = `${year}-${U.pad(mo)}-01`;
    const today = U.todayStr();
    let all = 0,
      here = 0;
    for (let d = first; d.slice(0, 7) === first.slice(0, 7) && d <= today; d = U.addDays(d, 1)) {
      if (U.isOff(d)) continue;
      all++;
      if (!TimeRules.leaveOn(mid, d)) here++;
    }
    return all ? here / all : 1;
  },
};

(function () {
  // scoring rules always carry the Projects part (weight 0 unless set)
  const sc = Calc.scoring;
  Calc.scoring = function () {
    const S = sc.apply(Calc, arguments);
    if (Calc._whatIf && S === Calc._whatIf && S.weights && S.weights.projects !== undefined && S.projectsSplit) return S;
    return Object.assign({}, S, {
      weights: Object.assign({ projects: 0 }, S.weights),
      projectsSplit: Object.assign({}, ProjScore.DEF.split, S.projectsSplit || {}),
      tiers: Object.assign({}, ProjScore.DEF.tiers, S.tiers || {}),
    });
  };
  // project tasks per person per month: done (by done date), on time, story points; open tasks past due count as late in their due month
  const perf = Calc.perf;
  Calc.perf = function (year) {
    const P = perf.apply(Calc, arguments);
    if (P._proj || typeof Scrum === 'undefined') return P;
    P._proj = true;
    const add = (mid, mo, f) => {
      const M = P.members[mid];
      if (!M || !mo) return;
      for (const o of [M[mo], M.ytd, P.team[mo], P.team.ytd]) {
        if (o.pt === undefined) Object.assign(o, { pt: 0, ptOn: 0, pts: 0, ptPeople: 0 });
      }
      f(M[mo]);
      f(M.ytd);
      f(P.team[mo], true);
      f(P.team.ytd, true);
    };
    for (const k of Object.values(P.members)) for (const o of Object.values(k)) Object.assign(o, { pt: 0, ptOn: 0, pts: 0 });
    for (const o of Object.values(P.team)) Object.assign(o, { pt: 0, ptOn: 0, pts: 0, ptPeople: 0 });
    const today = U.todayStr();
    const seen = new Set();
    for (const t of Store.all('ptask', '*')) {
      if (!t.assignee || !P.members[t.assignee] || t.status === 'Canceled') continue;
      const p = Scrum.proj(t.project);
      if (!p || p.status === 'Canceled') continue;
      const done = Scrum.isDone(t) && t.doneDate;
      const day = done ? t.doneDate : t.due && t.due < today ? t.due : '';
      if (!day || U.year(day) !== year) continue;
      const mo = U.month(day);
      const grace = +((TimeRules.at(p.team || (Store.member(t.assignee) || {}).team || 'apps', t.due || day).ptask || {}).grace || 0);
      const late = t.due
        ? done
          ? TimeRules.workBetween(t.due, t.doneDate, TimeRules.offFn(TimeRules.at(p.team || 'apps', t.due), t.assignee)) > grace
          : true
        : false;
      add(t.assignee, mo, (o, team) => {
        if (t.due) {
          o.pt++;
          if (!late) o.ptOn++;
        }
        if (done) o.pts += +t.points || 0;
        if (!team) o.active = true;
      });
      const key = t.assignee + '|' + mo;
      if (!seen.has(key)) {
        seen.add(key);
        P.team[mo].ptPeople++;
      }
    }
    return P;
  };
  // the month's score: old months exactly as before; from November 2026 the fair rules above
  const ms = Calc.monthScore;
  Calc.monthScore = function (year, mid, mo) {
    const c = ms.apply(Calc, arguments);
    if (!c || year * 100 + mo < ProjScore.FROM) return c;
    const P = Calc.perf(year);
    const S = Calc.scoring(year);
    const W = S.weights,
      T = S.tiers;
    const o = P.members[mid][mo];
    const team = P.team[mo];
    const f = Math.max(0.2, ProjScore.presence(year, mid, mo));
    // shadow hours and quick wins: for the days the person was there
    const swHrs = f < 1 ? o.swHrs / f : o.swHrs,
      qw = f < 1 ? o.qw / f : o.qw;
    c.shadow = (Calc.tierGE(T.shadow, swHrs) * W.shadow) / 100;
    c.quickwins = (Calc.tierGE(T.quickwins, qw) * W.quickwins) / 100;
    // projects
    const PS = S.projectsSplit;
    const avg = team.ptPeople ? team.pts / team.ptPeople : 0;
    c.projPct = o.pt ? o.ptOn / o.pt : null;
    c.projShare = avg ? o.pts / avg : null;
    const projAct = (o.pt || o.pts) > 0;
    c.projects =
      projAct && W.projects
        ? ((((o.pt ? Calc.tierGE(T.projects, c.projPct) : T.projects[0][1]) * PS.onTime) / 100 +
            ((avg ? Calc.tierGE(T.projShare, c.projShare) : T.projShare[0][1]) * PS.share) / 100) *
            W.projects) /
          100
        : 0;
    // no activity, no penalty
    const skip = new Set();
    if (!o.todo) skip.add('todo');
    if (!team.hd) skip.add('helpdesk');
    if (!projAct || !W.projects) skip.add('projects');
    const keys = ['todo', 'helpdesk', 'attendance', 'shadow', 'quickwins', 'projects'];
    const wAct = keys.filter(k => !skip.has(k)).reduce((a, k) => a + (+W[k] || 0), 0);
    const pts = keys.filter(k => !skip.has(k)).reduce((a, k) => a + (c[k] || 0), 0);
    c.score = U.r2(wAct ? (pts / wAct) * 100 : pts);
    c.presence = f;
    c.skipped = [...skip].filter(k => +W[k]);
    c.parts = keys
      .filter(k => +W[k])
      .map(k => ({
        key: k,
        label: ProjScore.LABEL[k],
        weight: +W[k],
        points: skip.has(k) ? null : U.r2(c[k] || 0),
        max: +W[k],
        skipped: skip.has(k),
      }));
    c.scale = wAct ? 100 / wAct : 1;
    return c;
  };
  // data health: project tasks that cannot be scored
  if (typeof Health !== 'undefined') {
    const hc = Health.checks;
    Health.checks = function () {
      const out = hc.apply(Health, arguments);
      const list = Store.all('ptask', '*')
        .filter(t => !Scrum.isDone(t) && t.status !== 'Canceled' && t.assignee && (!t.due || !(+t.points > 0)))
        .map(r => ({
          r,
          why: !r.due && !(+r.points > 0) ? 'no due date and no story points' : !r.due ? 'no due date' : 'no story points',
        }));
      if (list.length)
        out.push({
          key: 'ptmissing',
          title: 'Project tasks without a due date or story points',
          help: 'They cannot be scored under Projects. Open the project and fill them in.',
          list,
        });
      return out;
    };
  }
})();
