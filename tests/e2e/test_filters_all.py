"""Every list screen has a Month filter (with the usual person / status filters) and a Clear filters button."""
from harness import app_session, Check, run
async def main():
    c = Check('filters on every screen')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J("""Store.saveMany([{ c: 'quickwin', id: 'fq1', analyst: 'yousef', team: 'apps', date: '2026-03-04', subject: 'March QW', module: 'Orders', type: 'Modification', status: 'In-Progress', expected: '2026-03-20' },
                                  { c: 'quickwin', id: 'fq2', analyst: 'yousef', team: 'apps', date: '2026-05-04', subject: 'May QW', module: 'Orders', type: 'Modification', status: 'In-Progress', expected: '2026-05-20' }])""")
        pages = {'#/todo': 'todo', '#/shadow': 'shadow', '#/quickwins': 'qw', '#/central': 'riy', '#/oncall': 'oc', '#/requests/approve': 'rq', '#/mgrtasks': 'mgr', '#/projects': 'proj', '#/meetings': 'meet', '#/courses': 'course', '#/announcements': 'ann', '#/mytasks': 'mytasks', '#/helpdesk/requests': 'hdreq'}
        missing = []
        for hsh, key in pages.items():
            await s.go(hsh, 350)
            if not await J(f"!!document.querySelector('[data-flt=\"{key}|month\"]')"): missing.append(hsh)
        c('Month filter on every list screen', not missing, missing)
        t = await s.go('#/admin/feedback', 350); c('Admin → Feedback has a Month filter', await J("!!document.querySelector('[data-fbf=\"month\"]')"))
        await s.go('#/quickwins', 400)
        await pg.select_option('[data-flt="qw|month"]', '3'); await pg.wait_for_timeout(300)
        t = await J("document.querySelector('#main').innerText")
        c('month filter works (March only)', 'March QW' in t and 'May QW' not in t)
        c('Clear filters appears when a filter is set', await pg.locator('[data-fltclear="qw"]').count() == 1)
        await pg.click('[data-fltclear="qw"]'); await pg.wait_for_timeout(300)
        t = await J("document.querySelector('#main').innerText")
        c('Clear filters brings everything back', 'March QW' in t and 'May QW' in t and await pg.locator('[data-fltclear="qw"]').count() == 0)
        c.done(s)
run(main())
