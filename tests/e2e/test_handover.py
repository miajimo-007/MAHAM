"""Analyst handover: the analyst lists open work with notes and picks a colleague; the colleague accepts it on the
Analyst Desk; the manager hands on the ticked To Dos / project tasks in one click and gives them back when the analyst
is back; only the right people can change it."""
import json
from harness import app_session, Check, run, SHOTS

async def main():
    c = Check('analyst handover')
    async with app_session() as s:
        pg = s.page
        await s.js("""(() => { const t = U.todayStr();
          Store.save({ c: 'todo', id: 'ho-td1', task: 'Order set update', analyst: 'yousef', team: 'apps', assigned: t, duration: 5, status: 'In Progress' });
          Store.save({ c: 'todo', id: 'ho-td2', task: 'Report check', analyst: 'yousef', team: 'apps', assigned: t, duration: 5, status: 'In Progress' });
          Store.save({ c: 'project', id: 'ho-pj', name: 'Ward go-live', team: 'apps', status: 'In Progress', manager: 'apps-mgr' });
          Store.save({ c: 'ptask', id: 'ho-pt', project: 'ho-pj', title: 'Build screens', assignee: 'yousef', status: 'To Do', points: 3, due: U.addDays(t, 4) }); })()""")
        await s.js("Store.flush()")
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/home', 600)
        c('Analyst Desk: "Hand over my work"', await pg.locator('#hoNew').count() == 1)
        await pg.click('#hoNew'); await pg.wait_for_selector('#hof')
        t = await pg.inner_text('.modal')
        c('the form lists his open work', 'Order set update' in t and 'Build screens' in t)
        await pg.select_option('#hof [name=to]', 'layla'); await pg.fill('#hof [name=note]', 'Call the vendor on Monday')
        rows = await s.js("[...document.querySelectorAll('[data-hoi]')].map(tr => tr.textContent)")
        for i, txt in enumerate(rows):
            if 'Order set update' in txt or 'Build screens' in txt:
                await pg.check(f'[data-hoi="{i}"] [data-hom]'); await pg.fill(f'[data-hoi="{i}"] [data-hon]', 'Half done — see the comment')
        await pg.click('.modal [data-ok]'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        h = await s.js("Handover.mine()[0]")
        c('saved: colleague, dates, note, 2 items to hand on', h and h['to'] == 'layla' and sum(1 for i in h['items'] if i['move']) == 2 and h['note'] == 'Call the vendor on Monday', h)
        # the colleague
        await s.sign_in_as('layla', 'analyst'); await s.js("Store.sync(true)"); t = await s.go('#/home', 600)
        c('colleague sees "Handover from Yousef" with notes', 'Handover from Yousef' in t and 'Call the vendor on Monday' in t and 'Half done' in t)
        await pg.click('[data-hoacc]'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        c('…and accepts it', bool((await s.js("Store.get(%s)" % json.dumps(h['id'])))['acceptedOn']))
        # the colleague cannot move the work herself
        await s.js("Store.save(Object.assign({}, Store.get('ho-td1'), { analyst: 'layla' }))"); await pg.wait_for_timeout(200)
        c('the colleague cannot take the To Do herself', await s.js("Store.get('ho-td1').analyst") == 'yousef')
        # the manager hands on
        await s.sign_in_as('apps-mgr'); await s.js("Store.sync(true)"); t = await s.go('#/manager', 600)
        c('Manager Desk: the handover, with "Hand on 2"', 'Handovers' in t and 'Hand on 2' in t)
        await pg.click('[data-homove]'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        c('one click: To Do and project task moved to the colleague', await s.js("Store.get('ho-td1').analyst") == 'layla' and await s.js("Store.get('ho-pt').assignee") == 'layla' and await s.js("Store.get('ho-td2').analyst") == 'yousef')
        # back
        await s.sign_in_as('yousef', 'analyst'); await s.js("Store.sync(true)"); await s.go('#/home', 600)
        await pg.click('[data-hoback]'); await s.js("Store.flush()")
        await s.sign_in_as('apps-mgr'); await s.js("Store.sync(true)"); t = await s.go('#/manager', 600)
        c('when he is back: "Give back" on the Manager Desk', 'Give back' in t)
        await pg.click('[data-homback]'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        c('one click: the work is his again, the handover ends', await s.js("Store.get('ho-td1').analyst") == 'yousef' and await s.js("Store.get('ho-pt').assignee") == 'yousef' and bool((await s.js("Store.get(%s)" % json.dumps(h['id'])))['backOn']))
        await pg.screenshot(path=f'{SHOTS}/handover.png', full_page=True)
    c.done(s)

run(main())
