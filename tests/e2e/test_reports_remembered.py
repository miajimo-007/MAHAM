"""8 Nov: Reports opened after remembered filters came back without the section / people lists
("Cannot read properties of undefined (reading 'includes')"). It must open, and the lists are now remembered."""
from harness import app_session, Check, run

async def main():
    c = Check('reports with remembered filters')
    async with app_session() as s:
        pg = s.page; J = s.js
        # 1) what a PC from the last release holds: the report state without its lists
        await J("LS.set('bct.view.adam', { ps: { rep: { kind: 'month', anchor: U.todayStr() } }, ts: {} }); App.restoreView('adam')")
        t = await s.go('#/reports', 600)
        c('Reports opens (no error page)', 'Something went wrong' not in t and await pg.locator('[data-rsec]').count() > 0, t[:200])
        c('the remembered period is kept', await J("ps('rep').kind") == 'month')
        c('sections filled with the defaults', await J("Array.isArray(ps('rep').secs) && ps('rep').secs.length > 0"))
        # 2) choose sections and people, leave, come back on a fresh load: they are remembered
        await J("ps('rep').secs = ['summary', 'people']; ps('rep').people = ['yousef']; App.saveView()"); await pg.wait_for_timeout(900)
        saved = await J("LS.get('bct.view.adam', {}).ps.rep")
        c('sections and people are now remembered', saved.get('secs') == ['summary', 'people'] and saved.get('people') == ['yousef'], saved)
        await J("App.ps = {}; App.restoreView('adam')"); t = await s.go('#/reports', 600)
        c('opens again with the remembered choices', 'Something went wrong' not in t and await J("ps('rep').secs.join() === 'summary,people' && ps('rep').people.join() === 'yousef'"))
        # 3) every page still opens with remembered state from every page
        bad = []
        for p in ['#/todo', '#/shadow', '#/quickwins', '#/projects', '#/helpdesk', '#/attendance', '#/perf', '#/reports', '#/usage', '#/info', '#/directory', '#/manager', '#/admin']:
            await J("App.saveView()"); await pg.wait_for_timeout(700); await J("App.ps = {}; App.restoreView('adam')")
            if 'Something went wrong' in await s.go(p, 400): bad.append(p)
        c('all pages open after a restore', not bad, bad)
        c('no page errors', not s.errors, s.errors[:3])
        c.done(s)

run(main())
