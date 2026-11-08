"""8 Nov: someone else's change arriving (the 20-second background check) must not wipe what a person is typing on the page.
The page waits and shows the change as soon as they finish."""
import json
from harness import app_session, Check, run

WRITE = """(async (rid, subj) => { const fh = await Store.usersDir.getFileHandle('layla.json', { create: true });
  let recs = []; try { const j = JSON.parse(await (await fh.getFile()).text()); recs = Array.isArray(j.records) ? j.records : Object.values(j.records || {}); } catch (e) { /* new */ }
  recs = recs.filter(r => r.id !== rid).concat([{ c: 'shadow', id: rid, analyst: 'layla', team: 'apps', date: U.todayStr(), taskType: 'Support', source: 'Call', subject: subj, minutes: 20, _by: 'layla', _ts: Date.now() }]);
  const w = await fh.createWritable(); await w.write(JSON.stringify({ version: 1, kind: 'user', user: 'layla', records: recs })); await w.close(); })"""

async def main():
    c = Check('typing is kept when others save')
    async with app_session() as s:
        pg = s.page; J = s.js
        await s.sign_in_as('adam', 'analyst'); await s.go('#/home', 500)
        box = pg.locator('#main input[name="subject"]').first
        c('My Day has the shadow form', await box.count() == 1)
        await box.click(); await box.type('Half-written subject that must stay')
        # another person saves; the background check picks it up
        await J(f"({WRITE})('ty-1', 'From Layla while Adam types')"); await J("App.poll()"); await pg.wait_for_timeout(600)
        c('typed text kept while the box has focus', await box.input_value() == 'Half-written subject that must stay')
        c('the redraw waits', await J("App.pendingRender === true"))
        # leave the box (text still not saved): still kept
        await pg.click('#ptitle'); await pg.wait_for_timeout(500)
        c('text kept after leaving the box (not saved yet)', await pg.locator('#main input[name="subject"]').first.input_value() == 'Half-written subject that must stay')
        # a second change arrives while the text is still there
        await J(f"({WRITE})('ty-2', 'Second change')"); await J("App.poll()"); await pg.wait_for_timeout(500)
        c('still kept after another change', await pg.locator('#main input[name="subject"]').first.input_value() == 'Half-written subject that must stay')
        # clear the box → the waiting changes appear
        b2 = pg.locator('#main input[name="subject"]').first; await b2.fill(''); await pg.click('#ptitle'); await pg.wait_for_timeout(700)
        c('after clearing, the page shows the new changes', await J("App.pendingRender === false") and await J("!!Store.get('ty-2')"))
        # nobody typing: changes show straight away
        await J(f"({WRITE})('ty-3', 'Third change')"); await J("App.poll()"); await pg.wait_for_timeout(500)
        c('nobody typing: redraw happens at once', await J("App.pendingRender === false") and await J("!!Store.get('ty-3')"))
        # a comment box on the To Do list search: typing kept too
        await s.go('#/todo', 400); srch = pg.locator('#main input[type="search"], #main .tbl-tools input').first
        if await srch.count():
            await srch.click(); await srch.type('abc'); await J(f"({WRITE})('ty-4', 'Fourth')"); await J("App.poll()"); await pg.wait_for_timeout(500)
            c('search box text kept too', await srch.input_value() == 'abc')
        c('no page errors', not s.errors, s.errors[:3])
        c.done(s)

run(main())
