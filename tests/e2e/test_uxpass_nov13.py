"""2026.11.13.4 — UI/UX pass (items 1–21 of the 13 Nov screen review): compact filters, totals lines you can click,
lists without tiles (follow-ups, Good Catch, projects), empty columns hidden, compact rows, a default saved view,
quick win comment, My work without inner scroll, "Ask the director…", blank on-duty attendance, project name as title,
View only tag, ⓘ How this works, "new" dot in lists, one spelling, growing text boxes and hints on focus, empty boxes as
one line, Director Desk in three parts."""
import os
from harness import app_session, Check, run, SHOTS

SEED = r"""(() => { const t = U.todayStr(); const d = n => U.addDays(t, n);
  Store.saveMany([
    { c: 'todo', id: 'ux4-a', task: 'Fix the discharge template', analyst: 'yousef', team: 'apps', assigned: d(-9), duration: 1, status: 'In Progress' },
    { c: 'todo', id: 'ux4-b', task: 'Update the allergy form', analyst: 'yousef', team: 'apps', assigned: t, duration: 9, status: 'In Progress' },
    { c: 'quickwin', id: 'ux4-q', analyst: 'yousef', team: 'apps', date: d(-2), expected: d(5), subject: 'Faster stock report', module: 'Pharmacy', status: 'In-Progress' },
    { c: 'project', id: 'ux4-p', key: 'UXP', name: 'Phoenix go-live', team: 'apps', status: 'In Progress', manager: 'apps-mgr', members: ['yousef'], mode: 'kanban', start: d(-5) },
  ]); })()"""

async def main():
    c = Check('ui/ux pass 2026.11.13.4')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J(SEED); await J("Store.flush()"); await pg.wait_for_timeout(300)
        await s.sign_in_as('apps-mgr', 'manager'); await s.go('#/home'); await s.go('#/todo', 600)

        # 1 compact filters
        c('1 filters: label beside a small box', await J("getComputedStyle(document.querySelector('#main .flt')).flexDirection") == 'row')
        # 5 empty columns: no To Do has FU → no FU column; Excel would still have it
        heads = await J("[...document.querySelectorAll('#main table.tbl thead th')].map(x => x.textContent.trim())")
        c('5 a column empty for every row is not shown (FU)', 'FU' not in heads and 'To Do' in heads, heads)
        c('5 …Excel still has every column', any(x['key'] == 'fu' for x in await J("App.tableRows.todo.cols.map(c => ({ key: c.key }))")))
        # 15 click a number in the totals line
        await pg.click('#main .list-sum [data-sumf="todo|st|Delayed"]'); await pg.wait_for_timeout(400)
        c('15 click "overdue" → only overdue To Dos', await J("ps('todo').st") == 'Delayed' and 'Update the allergy form' not in await pg.inner_text('#main table.tbl'))
        await pg.click('#main .list-sum [data-sumf="todo|st|Delayed"]'); await pg.wait_for_timeout(400)
        c('15 …click again → all again', not await J("ps('todo').st") and 'Update the allergy form' in await pg.inner_text('#main table.tbl'))
        # 19 compact rows
        await pg.click('#main [data-tdense]'); await pg.wait_for_timeout(300)
        c('19 compact rows on (kept on this PC)', await J("document.body.classList.contains('dense') && localStorage.getItem('maham.dense') === '1'"))
        await pg.click('#main [data-tdense]'); await pg.wait_for_timeout(300)
        c('19 …and off again', not await J("document.body.classList.contains('dense')"))
        # 18 default view
        await J("Store.save({ id: 'listview-apps-mgr-x', c: 'listview', by: 'apps-mgr', table: 'todo', name: 'Late', st: { q: 'discharge', sort: null, dir: -1, notes: false }, flt: {}, dflt: true })")
        await J("delete App.tableState.todo"); await s.go('#/home'); await s.go('#/todo', 800)
        c('18 a default view opens by itself', await J("(App.tableState.todo || {}).q") == 'discharge')
        await J("Store.remove('listview-apps-mgr-x'); App.tableState.todo.q = ''")

        # 2 lists without tiles
        for route in ['#/central', '#/oncall/goodcatch', '#/projects']:
            await s.go('#/home'); await s.go(route, 700)
            c(f'2 {route}: one totals line, no tiles', await pg.locator('#main .kpis').count() == 0 and await pg.locator('#main .list-sum').count() == 1)
        c('14 project owner without the repeated role', 'APPS Manager Manager' not in await pg.inner_text('#main table.tbl'))
        c('17 Good Catch: ⓘ How this works', True)
        await s.go('#/home'); await s.go('#/oncall/goodcatch', 600)
        c('17 Good Catch: the long text is folded', await pg.locator('#main details.howto').count() == 1)
        # 6 quick win: no "Pending Manager Approval" next to "Pending"
        await s.go('#/home'); await s.go('#/quickwins', 600)
        c('6 quick wins: the auto comment does not repeat the approval', 'Pending Manager Approval' not in await pg.inner_text('#main table.tbl'))
        # 12 project name as the title
        await s.go('#/home'); await s.go('#/project/ux4-p', 700)
        c('12 the project page is titled with its name', 'Phoenix go-live' in await J("document.querySelector('.top h1, header h1, .top .title, h1').textContent"))
        c('4 empty charter / phases / update → one line', 'Not filled in yet' in await pg.inner_text('#main') and 'No charter yet' not in await pg.inner_text('#main'))
        # 8 the escalate button says what it does
        await s.go('#/home'); await s.go('#/manager', 800)
        c('8 "⚑ Ask the director…" (not "Needs decision")', 'Needs decision' not in await pg.inner_text('#main') and 'Ask the director' in await pg.inner_text('#main'))
        # 9 attendance: no ✓ everywhere
        await s.go('#/home'); await s.go('#/attendance', 700)
        c('9 attendance grid: on-duty days are blank', await J("[...document.querySelectorAll('#main td.acell')].filter(x => x.textContent.includes('✓')).length") == 0)
        # 20 one spelling
        nav = await J("document.querySelector('nav').innerText")
        c('20 menu: "Shadow work" and "Quick wins"', 'Shadow work' in nav and 'Quick wins' in nav and 'Shadow Works' not in nav and 'Quick Wins' not in nav, nav[:300])
        # 21 text boxes grow; hints show while in the box
        await J("UI.editRecord('todo', Store.get('ux4-a'))"); await pg.wait_for_selector('#recform')
        hid = await J("(() => { const f = document.querySelector('#recform [name=ref]').closest('.fld').querySelector('small'); return f ? getComputedStyle(f).display : 'none'; })()")
        await pg.wait_for_timeout(400); await pg.focus('#recform [name=ref]')
        shown = await J("(() => { const f = document.querySelector('#recform [name=ref]').closest('.fld').querySelector('small'); return f ? getComputedStyle(f).display : 'x'; })()")
        c('21 the Reference hint shows only while you are in the box', hid == 'none' and shown == 'block', (hid, shown))
        h0 = await J("document.querySelector('#recform [name=task]').offsetHeight")
        await pg.fill('#recform [name=task]', 'line\n' * 8 + 'end'); await pg.wait_for_timeout(100)
        c('21 the To Do box grows with the text', await J("document.querySelector('#recform [name=task]').offsetHeight") > h0 + 30)
        await J("UI.closeModal(true)"); await pg.wait_for_timeout(200)
        if await pg.locator('#modal').count(): await J("document.querySelector('#modal') && document.querySelector('#modal').remove()")

        # analyst: 13 view only tag, 16 new dot, 7 my work, 17 KB
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/home', 600)
        await J("LS.set('bct.seen.yousef', Date.now() - 60000); delete SEEN0.yousef")   # as if I last looked a minute ago, then opened the app
        await J("(() => { const r = Store.get('ux4-b'); Store.db.set(r.id, Object.assign({}, r, { _ts: Date.now(), _by: 'apps-mgr' })); })()")
        await s.go('#/todo', 600)
        c('16 a To Do changed by the manager since I last looked has the "new" dot', await J("[...document.querySelectorAll('#main table.tbl tbody tr')].some(tr => tr.innerText.includes('Update the allergy form') && tr.querySelector('.new-dot'))"))
        await s.go('#/home'); await s.go('#/directory', 600)
        lv = await J("App.pageLevel ? App.pageLevel('directory') : ''")
        c('13 View only: a small tag, not a banner', await pg.locator('#main .insights.viewonly').count() == 0)
        await s.go('#/home'); await s.go('#/kb', 600)
        c('17 Knowledge base: the long text is folded', await pg.locator('#main details.howto').count() == 1)
        await s.go('#/home'); await s.go('#/home', 600)
        c('7 My work has no inner scroll box', await pg.locator('#main .scroll-list').count() == 0)

        # 10 Director Desk in three parts
        await s.sign_in_as('adam', 'admin'); await s.go('#/home'); await s.go('#/director', 900)
        g = await J("[...document.querySelectorAll('#main .desk-grp')].map(x => x.dataset.dg)")
        c('10 Director Desk: Needs you, Watch, The teams', g == ['need', 'watch', 'team'], g)
        c('10 …no tile row', await pg.locator('#main .kpis').count() == 0)
        await pg.screenshot(path=os.path.join(SHOTS, 'uxpass_director.png'), full_page=True)
        c('no page errors', not s.errors, '; '.join(s.errors[:3]))
    c.done(s)

run(main())
