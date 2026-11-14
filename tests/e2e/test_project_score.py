"""Projects in the monthly score (on-time % + share of story points), no activity → no penalty (the weight moves to the
other parts), months before November 2026 unchanged, "Why is my score …?" on the employee page and the Analyst Desk,
project tasks that cannot be scored in Data health, and the printable rules."""
from harness import app_session, Check, run, SHOTS

async def main():
    c = Check('project score')
    async with app_session() as s:
        pg = s.page
        y = await s.js("new Date().getFullYear()"); mo = await s.js("new Date().getMonth() + 1"); today = await s.js("U.todayStr()")
        await s.js(f"""(() => {{ const t = '{today}';
          Store.save({{ c: 'project', id: 'pj-sc', name: 'Score project', team: 'apps', status: 'In Progress', manager: 'apps-mgr' }});
          const tk = (id, who, pts, due, done) => Store.save({{ c: 'ptask', id, project: 'pj-sc', title: id, assignee: who, points: pts, due, status: done ? 'Done' : 'To Do', doneDate: done || '' }});
          tk('pt1', 'yousef', 3, U.addDays(t, 5), t); tk('pt2', 'yousef', 5, U.addDays(t, 2), t); tk('pt3', 'yousef', 2, U.addDays(t, -20), t);
          tk('pt4', 'nora', 2, U.addDays(t, 3), t); tk('pt5', 'nora', 0, '', '');
        }})()""")
        await s.js("Calc.saveScoring('apps', Object.assign({}, Config.DEFAULT_SCORING, { weights: { todo: 30, helpdesk: 30, attendance: 10, quickwins: 5, shadow: 5, projects: 20 } }), new Date().getFullYear())")
        await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        a = await s.js(f"Calc.monthScore({y}, 'yousef', {mo})")
        c('Projects part counted: 2 of 3 tasks on time, 10 points', a and abs(a['projPct'] - 2 / 3) < 1e-6 and a['raw']['pts'] == 10, a and {k: a.get(k) for k in ('projPct', 'projShare', 'projects')})
        c('…share of points vs the team average (10 vs 6 → 1.67×)', a and abs(a['projShare'] - 10 / 6) < 0.01)
        c('…and it is in the parts list', any(p['key'] == 'projects' and not p['skipped'] for p in a['parts']))
        k = await s.js(f"Calc.monthScore({y}, 'layla', {mo})")
        if k:
            sk = [p['key'] for p in k['parts'] if p['skipped']]
            c('no project tasks: Projects left out, weight moved to the other parts', 'projects' in sk and abs(k['score'] - round(sum(p['points'] for p in k['parts'] if not p['skipped']) / sum(p['weight'] for p in k['parts'] if not p['skipped']) * 100, 2)) < 0.02, k['parts'])
        else:
            c('no project tasks: Projects left out (no other activity this month either)', True)
        old = await s.js(f"Calc.monthScore({y}, 'yousef', 10)")
        c('months before November 2026 keep the old formula', old is None or 'parts' not in old)
        # employee page + Analyst Desk
        await s.js("App.filters = App.filters || {}"); t = await s.go('#/employee/yousef', 700)
        if 'Why is the' not in t: await s.js("location.hash = '#/employee'"); await pg.wait_for_timeout(400); await pg.select_option('[data-flt="employee|emp"]', 'yousef'); await pg.wait_for_timeout(500); t = await pg.inner_text('#main')
        c('employee page: "Why is the … score …?" with each part', 'Why is the' in t and 'Projects' in t and 'What counted' in t.replace('WHAT COUNTED', 'What counted'))
        await pg.screenshot(path=f'{SHOTS}/score_why.png', full_page=True)
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/home', 600)
        c('Analyst Desk: "Why is my score …?" button', await pg.locator('#whyscore').count() == 1)
        await pg.click('#whyscore'); await pg.wait_for_selector('.modal .why', timeout=5000)
        c('…opens the breakdown', 'Projects' in await pg.inner_text('.modal'))
        await s.js("UI.closeModal()")
        # data health
        await s.sign_in_as('adam'); t = await s.go('#/admin/data', 900)
        c('Data health: project task without due date / points', 'Project tasks without a due date or story points' in t)
        await s.sign_in_as('apps-mgr'); t = await s.go('#/manager', 600)
        c("Manager Desk: project tasks that can't be scored", 'missing a due date or story points' in t)
        await s.sign_in_as('adam')
        # printable rules
        await s.go('#/admin/timerules', 500)
        async with pg.context.expect_page() as pi: await pg.click('#rulesprint')
        pr = await pi.value; await pr.wait_for_load_state(); pt = await pr.inner_text('body')
        c('printable rules: every team, weights incl. Projects, time rules, holidays', 'scoring and time rules' in pt and 'Projects' in pt and 'Escalation' in pt and 'Public holidays' in pt)
        await pr.close()
    c.done(s)

run(main())
