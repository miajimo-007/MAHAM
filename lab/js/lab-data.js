/* MAHAM Lab — one line of text per record, from every source, with its cost in staff hours and who / where / when. */
'use strict';

const LabData = {
  _c: null,
  reset() { LabData._c = null; },
  SOURCES: {
    helpdesk: { label: 'Help desk', icon: '✉' }, shadow: { label: 'Shadow work', icon: '◐' }, todo: { label: 'To Do', icon: '☑' },
    quickwin: { label: 'Quick win', icon: '⚡' }, gcatch: { label: 'Good catch', icon: '🎯' }, oncall: { label: 'On-call', icon: '☎' },
    central: { label: 'Central follow-up', icon: '↗' }, mytask: { label: 'Personal task', icon: '✔' },
  },
  teamOfPerson(id) { const m = Store.member(id); return m ? (m.team || 'apps') : ''; },
  range() { const to = U.todayStr(); const from = U.addDays(to, -Math.round((Lab.settings.months || 6) * 30.4)); return { from, to, prevFrom: U.addDays(from, -Math.round((Lab.settings.months || 6) * 30.4)) }; },
  inTeam(team) { const t = Lab.settings.team; return !t || team === t; },
  /* every record as { src, id, text, date, cost, dept, person, team, module, open, raw } — from the start of the previous
   * period (for trends) to today */
  items() {
    if (LabData._c) return LabData._c;
    const S = Lab.settings, { prevFrom } = LabData.range(); const out = []; const d10 = d => String(d || '').slice(0, 10);
    const push = o => { if (!o.text || !o.date || o.date < prevFrom) return; o.team = o.team || LabData.teamOfPerson(o.person) || 'apps'; if (!LabData.inTeam(o.team)) return; out.push(o); };
    for (const r of Store.all('helpdesk', '*')) { const x = Calc.hdDerive(r); push({ src: 'helpdesk', id: r.id, text: r.subject, date: d10(r.created), cost: S.hdHours, dept: r.department || '', person: x.mid || '', team: r.team, module: r.group || '', open: !x.closed, hrs: x.hrs, requester: r.requester || '', raw: r }); }
    for (const r of Store.all('shadow', '*')) push({ src: 'shadow', id: r.id, text: r.subject, date: r.date, cost: (+r.minutes || 0) / 60, dept: r.source || '', person: r.analyst, team: r.team, module: r.taskType || '', raw: r });
    for (const r of Store.all('todo', '*')) { if (r.status === 'Canceled') continue; push({ src: 'todo', id: r.id, text: [r.task, r.instruction].filter(Boolean).join(' · '), date: r.assigned, cost: S.todoHours, dept: '', person: r.analyst, team: r.team, module: '', open: !r.finish, raw: r }); }
    for (const r of Store.all('quickwin', '*')) push({ src: 'quickwin', id: r.id, text: [r.subject, r.impact].filter(Boolean).join(' · '), date: r.date || r.expected, cost: 0, dept: '', person: r.analyst, team: r.team, module: r.module || '', open: !['completed', 'rejected'].includes(U.lc(r.status)), raw: r });
    for (const r of Store.all('gcatch', '*')) push({ src: 'gcatch', id: r.id, text: [r.title, r.details, r.system].filter(Boolean).join(' · '), date: r.found, cost: S.catchHours, dept: r.where || '', person: r.createdBy || r._by, team: r.team, module: r.system || '', open: ['New', 'In progress'].includes(r.status || 'New'), raw: r });
    for (const r of Store.all('oncall', '*')) push({ src: 'oncall', id: r.id, text: r.issue, date: r.date, cost: S.oncallHours, dept: '', person: r.analyst, team: r.team, module: '', raw: r });
    for (const r of Store.all('central', '*')) push({ src: 'central', id: r.id, text: r.subject, date: r.date, cost: 0, dept: '', person: r.analyst, team: r.team, module: r.module || '', open: !/deployed|closed|rejected|done/i.test(r.status || '') && r.deployed !== 'Yes', stuck: /review/i.test(r.status || '') && r.date && U.diffDays(r.date, U.todayStr()) > 90, raw: r });
    for (const r of Store.all('mytask', '*')) { if (r.declineOf) continue; push({ src: 'mytask', id: r.id, text: r.title, date: r.plan || r.due || r.doneDate || U.ds(new Date(r._ts || Date.now())), cost: S.taskHours, dept: '', person: r.owner, team: '', module: '', open: r.status === 'Open', raw: r }); }
    return (LabData._c = out);
  },
  counts() { const c = {}; for (const x of LabData.items()) c[x.src] = (c[x.src] || 0) + 1; return c; },
  label(src) { return (LabData.SOURCES[src] || {}).label || src; },
  icon(src) { return (LabData.SOURCES[src] || {}).icon || '·'; },
  /* who may be named: shadow work and personal tasks are shown as counts only (the Lab is for the super admin, but reports leave the Lab) */
  named(src) { return !['shadow', 'mytask'].includes(src); },
};
