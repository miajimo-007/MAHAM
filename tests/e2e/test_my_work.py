"""Analyst Desk: one "My work" list grouped Late / Due today / Waiting on you / Coming up (help desk, follow-ups and
quick wins included — no separate "Needs your action" card); ⏱ Log time from an item (linked by its ID); "↻ again" chips."""
from harness import app_session, Check, run
async def main():
    c = Check('my work')
    async with app_session() as s:
        pg = s.page; J = s.js
        await s.sign_in_as('apps-mgr')
        await J("Store.saveMany([{c:'todo', id:'mw-late', analyst:'yousef', team:'apps', task:'Late one', assigned:U.addDays(U.todayStr(), -5), duration:1, status:'In Progress'}, {c:'todo', id:'mw-today', analyst:'yousef', team:'apps', task:'Due today one', assigned:U.todayStr(), duration:0, status:'In Progress'}, {c:'todo', id:'mw-next', analyst:'yousef', team:'apps', task:'Next week one', assigned:U.todayStr(), duration:6, status:'In Progress'}])")
        await J("Store.flush()")
        await s.sign_in_as('yousef', 'analyst')
        tt = await J("(Store.list('taskTypes').find(x => !/^>>>/.test(x)) || '')"); src = await J("(Store.list('sources')[0] || '')")
        await J(f"Store.saveMany([{{c:'shadow', id:'mw-s1', analyst:'yousef', team:'apps', date:U.todayStr(), taskType:'{tt}', source:'{src}', subject:'Printer mapping', ref:'12345', minutes:20}}])")
        await s.go('#/todo', 200); t = await s.go('#/home', 500)
        c('one My work list, no separate "Needs your action" card', 'My work' in t and 'Needs your action' not in t)
        heads = await J("[...document.querySelectorAll('.mw-h')].map(x => x.textContent.replace(/\\s*\\d+$/, '').trim())")
        c('grouped in working order', [x for x in heads if x in ('⚠ Late', 'Due today', 'Coming up')] == ['⚠ Late', 'Due today', 'Coming up'], heads)
        order = await J("(t => [t.indexOf('Late one'), t.indexOf('Due today one'), t.indexOf('Next week one')])([...document.querySelectorAll('#main .card')].find(c => /My work/.test(c.querySelector('h3') ? c.querySelector('h3').textContent : '')).innerText)")
        c('late first, then today, then coming up', order[0] < order[1] < order[2], order)
        # ⏱ Log time on the To Do → shadow work with the To Do's ID, linked to it
        key = await J("TodoId.key(Store.get('mw-late'))")
        await pg.click('[data-mwlog="mw-late"]'); await pg.wait_for_selector('#recform [name=subject]')
        c('log form is filled from the To Do', await pg.input_value('#recform [name=subject]') == 'Late one' and await pg.input_value('#recform [name=ref]') == key, key)
        if not await pg.input_value('#recform [name=taskType]'): await pg.select_option('#recform [name=taskType]', index=1)
        if not await pg.input_value('#recform [name=source]'): await pg.select_option('#recform [name=source]', index=1)
        await pg.click('[data-save]'); await pg.wait_for_timeout(500)
        c('time logged is linked to the To Do (by its ID)', await J("WorkLinks.of(Store.get('mw-late')).some(x => x.r.c === 'shadow' && x.r.subject === 'Late one')"))
        # ↻ again
        await s.go('#/todo', 200); await s.go('#/home', 500)
        c('"↻ again" chips show recent entries', await pg.locator('#quicksw [data-again]').count() >= 1)
        idx = await J("[...document.querySelectorAll('#quicksw [data-again]')].findIndex(b => b.textContent.includes('Printer mapping'))")
        await pg.click(f'#quicksw [data-again="{idx}"]')
        c('"again" fills the form', await pg.input_value('#quicksw [name=subject]') == 'Printer mapping' and await pg.input_value('#quicksw [name=ref]') == '12345')
        await pg.click('#quicksw button[type=submit]'); await pg.wait_for_timeout(400)
        c('and Add saves it', await J("Store.all('shadow').filter(r => r.analyst === 'yousef' && r.subject === 'Printer mapping').length") == 2)
        c('no page errors', not s.errors, s.errors[:3])
        c.done(s)

run(main())
