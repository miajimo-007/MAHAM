/* MAHAM Lab — Data health: how well the fields the models learn from are filled in, and odd entries. Report only. */
'use strict';

const LabHealth = {
  run() {
    return LabCache.get('health', () => {
      const { from } = LabData.range(); const inP = d => (d || '') >= from; const fill = (l, f) => l.length ? l.filter(f).length / l.length : null;
      const hd = Store.all('helpdesk', '*').filter(r => inP(String(r.created).slice(0, 10)));
      const td = Store.all('todo', '*').filter(r => inP(r.assigned) && r.status !== 'Canceled');
      const qw = Store.all('quickwin', '*').filter(r => inP(r.date));
      const sh = Store.all('shadow', '*').filter(r => inP(r.date));
      const gc = Store.all('gcatch', '*').filter(r => inP(r.found));
      const fields = [
        ['Help desk', hd.length, [['group', fill(hd, r => r.group)], ['department', fill(hd, r => r.department)], ['technician matched to a person', fill(hd, r => !!Store.memberByMeName(r.technician))], ['resolved date on closed ones', fill(hd.filter(r => Calc.isClosed(r.status)), r => r.resolved)]]],
        ['To Do', td.length, [['due in (days)', fill(td, r => r.duration != null && r.duration !== '')], ['instruction', fill(td, r => r.instruction)], ['finish date on resolved ones', fill(td.filter(r => r.status === 'Resolved'), r => r.finish)]]],
        ['Quick wins', qw.length, [['module', fill(qw, r => r.module)], ['impact', fill(qw, r => r.impact)], ['type', fill(qw, r => r.type)], ['expected date', fill(qw, r => r.expected)]]],
        ['Shadow work', sh.length, [['task type', fill(sh, r => r.taskType)], ['source', fill(sh, r => r.source)], ['minutes', fill(sh, r => +r.minutes > 0)]]],
        ['Good catches', gc.length, [['system / module', fill(gc, r => r.system)], ['department', fill(gc, r => r.where)], ['details', fill(gc, r => r.details)]]],
      ];
      const odd = [];
      const perDay = {}; for (const r of sh) { const k = r.analyst + '|' + r.date; perDay[k] = (perDay[k] || 0) + (+r.minutes || 0); }
      for (const [k, v] of Object.entries(perDay)) if (v > 600) { const [a, d] = k.split('|'); odd.push(['Shadow work over 10 h in one day', `${Store.memberShort(a)} · ${U.fmtDate(d)} · ${Math.round(v / 60)} h`]); }
      for (const r of sh) if (+r.minutes > 480) odd.push(['One shadow entry over 8 h', `${Store.memberShort(r.analyst)} · ${U.fmtDate(r.date)} · ${r.subject}`]);
      for (const r of td) if (r.finish && r.assigned && r.finish < r.assigned) odd.push(['To Do finished before it was given', `${Store.memberShort(r.analyst)} · ${r.task}`]);
      for (const r of hd) if (r.resolved && r.created && r.resolved < r.created) odd.push(['Help desk resolved before created', `#${r.reqId} ${r.subject}`]);
      for (const r of hd) if (r.elapsedHrs != null && r.elapsedHrs < 0) odd.push(['Negative elapsed hours', `#${r.reqId}`]);
      const um = {}; for (const r of hd) if (r.technician && U.lc(r.technician) !== 'not assigned' && !Store.memberByMeName(r.technician)) um[r.technician] = (um[r.technician] || 0) + 1;
      for (const [t, n] of Object.entries(um)) odd.push(['Technician name not matched to a person', `${t} · ${n} request(s)`]);
      for (const r of qw) if (U.lc(r.status) === 'completed' && !r.expected) odd.push(['Completed quick win without an expected date', `${Store.memberShort(r.analyst)} · ${r.subject}`]);
      const groups = {}; for (const [k, v] of odd) (groups[k] = groups[k] || []).push(v);
      return { fields, odd: Object.entries(groups).map(([k, l]) => ({ k, n: l.length, ex: l.slice(0, 8) })).sort((a, b) => b.n - a.n) };
    });
  },
};
