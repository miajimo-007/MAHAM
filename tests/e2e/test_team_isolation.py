"""8 Nov: every team is separate. Four teams (APPS, LAB, BI, OPS), each with its own analyst and work. Signed in as each
team's manager: lists, menu numbers, Manager Desk and the right to confirm / finish / approve cover only that team; the team
box offers only their team. The super admin and the director see every team."""
from harness import app_session, Check, run

TEAMS = {'apps': 'yousef', 'lab': 'lab-a1', 'bi': 'bi-a1', 'ops': 'ops-a1'}
PAGES = ['#/todo', '#/quickwins', '#/shadow', '#/central', '#/requests/approve', '#/attendance', '#/projects', '#/manager']

SEED = """(() => {
  const T = %s; const base = Store.members().find(m => m.id === 'yousef');
  const add = Object.entries(T).filter(([t, a]) => !Store.member(a)).map(([t, a]) => Object.assign({}, base, { id: a, name: a.toUpperCase() + ', TEST', username: a, team: t, empId: '', superAdmin: false }));
  Store.save(Object.assign({}, Store.get('settings-team'), { id: 'settings-team', c: 'settings', members: Store.members().concat(add) }));
  const d = U.todayStr(), L = [];
  for (const [t, a] of Object.entries(T)) {
    const tag = 'ZZ-' + t.toUpperCase();
    L.push({ c: 'todo', id: 'ti-rv-' + t, analyst: a, team: t, task: tag + ' todo waiting', assigned: d, status: 'In Progress' },
           { c: 'todo', id: 'ti-ip-' + t, analyst: a, team: t, task: tag + ' todo open', assigned: d, status: 'In Progress' },
           { c: 'quickwin', id: 'ti-qw-' + t, analyst: a, team: t, date: d, subject: tag + ' quick win' },
           { c: 'shadow', id: 'ti-sw-' + t, analyst: a, team: t, date: d, taskType: 'Support', subject: tag + ' shadow', minutes: 30 },
           { c: 'central', id: 'ti-ry-' + t, analyst: a, team: t, date: d, subject: tag + ' follow-up', status: 'Under Review', type: 'Modification' },
           { c: 'request', id: 'ti-rq-' + t, type: 'leave', title: tag + ' leave', requester: a, team: t, from: U.addDays(d, 10), to: U.addDays(d, 11), status: 'Pending manager', created: d },
           { c: 'attendance', id: 'ti-at-' + t, analyst: a, team: t, date: d, status: 'OFF', leave: 'Annual' },
           { c: 'project', id: 'ti-pj-' + t, name: tag + ' project', manager: t + '-mgr', team: t, origin: 'team', start: d, status: 'In Progress', members: [a] });
  }
  Store.saveMany(L);
})()"""

async def main():
    c = Check('team isolation')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J(SEED % repr(TEAMS).replace("'", '"')); await pg.wait_for_timeout(500)
        # each analyst finishes their own To Do → it waits for their manager (saved as the super admin it would self-confirm)
        for t, a in TEAMS.items():
            await s.sign_in_as(a, 'analyst')
            await J(f"Store.save(Object.assign({{}}, Store.get('ti-rv-{t}'), {{ status: 'In Progress', finish: U.todayStr() }}))")
        c('every team has one To Do waiting for its manager', await J(f"{list(TEAMS)}.every(t => Store.get('ti-rv-' + t).status === 'Ready for review')"),
          await J(f"{list(TEAMS)}.map(t => Store.get('ti-rv-' + t).status)"))
        c('4 teams, each with an analyst', await J("['lab-a1','bi-a1','ops-a1'].every(id => !!Store.member(id))"))
        cnt = lambda sel: J(f"(document.querySelector('nav a[data-nav=\"{sel}\"] .count') || {{}}).textContent || '0'")
        for t, a in TEAMS.items():
            mgr = t + '-mgr'; others = [o.upper() for o in TEAMS if o != t]
            await s.sign_in_as(mgr, 'analyst'); await pg.wait_for_timeout(300)
            c(f'{t}: manager works in their own team only', await J("App.myTeams().map(x => x.id).join()") == t and await J("App.viewTeam") == t)
            leak = []
            for p in PAGES:
                txt = await s.go(p, 450)
                if 'Something went wrong' in txt: leak.append(p + ' ERROR')
                leak += [f'{p}: ZZ-{o}' for o in others if f'ZZ-{o}' in txt]
            c(f"{t}: no other team's items on any page", not leak, leak[:6])
            txt = await s.go('#/todo', 450); c(f"{t}: own team's To Dos are listed", f'ZZ-{t.upper()} todo open' in txt)
            c(f'{t}: To Do number = 1 (own team waiting)', await cnt('todo') == '1', await cnt('todo'))
            c(f'{t}: Requests number = 1 (own team)', await cnt('requests') == '1', await cnt('requests'))
            rights = await J(f"""(() => {{ const o = {[o for o in TEAMS if o != t]}; return {{
              confirm: o.filter(x => Store.canConfirmTodo(Store.get('ti-rv-' + x), App.me)),
              finish: o.filter(x => Store.canFinishTodo(Store.get('ti-ip-' + x), App.me)),
              approve: o.filter(x => Requests.canApproveMgr(Store.get('ti-rq-' + x))),
              ownConfirm: Store.canConfirmTodo(Store.get('ti-rv-{t}'), App.me), ownApprove: Requests.canApproveMgr(Store.get('ti-rq-{t}')) }}; }})()""")
            c(f"{t}: cannot confirm / finish / approve other teams' items", not rights['confirm'] and not rights['finish'] and not rights['approve'], rights)
            c(f"{t}: can confirm and approve their own team's", rights['ownConfirm'] and rights['ownApprove'], rights)
            mgrTxt = await s.go('#/manager', 500)
            c(f'{t}: Manager Desk "Needs you" counts only their team', 'ZZ-' not in mgrTxt or all(f'ZZ-{o}' not in mgrTxt for o in others))
        # analysts: only their own team too
        await s.sign_in_as('bi-a1', 'analyst'); txt = await s.go('#/todo', 450)
        c('BI analyst sees no other team on To Do', all(f'ZZ-{o.upper()}' not in txt for o in TEAMS if o != 'bi'))
        # super admin: every team through the team box, and every request waits for him
        await s.sign_in_as('adam', 'admin')
        seen = []
        for t in TEAMS:
            await s.go('#/todo', 300); await pg.select_option('#teamsel', t); await pg.wait_for_timeout(450); txt = await pg.inner_text('#main')
            seen.append(f'ZZ-{t.upper()} todo open' in txt and all(f'ZZ-{o.upper()}' not in txt for o in TEAMS if o != t))
        c('super admin: each team shows only that team when picked', all(seen), seen)
        c('super admin: can confirm in every team', await J(f"{list(TEAMS)}.every(t => Store.canConfirmTodo(Store.get('ti-rv-' + t), 'adam'))"))
        c('no page errors', not s.errors, s.errors[:3])
        c.done(s)

run(main())
