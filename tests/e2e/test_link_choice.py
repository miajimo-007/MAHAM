"""Linking is the person's choice: the same Reference is offered, never linked by itself — on the Analyst Desk's Log shadow
work (suggestion chips + 🔗 Link to…) and in forms; ⏱ Log time links to its item; converting shadow work can keep its
time as shadow work linked to the new item (and Undo takes that copy away again)."""
from harness import app_session, Check, run, SHOTS

async def main():
    c = Check('link choice')
    async with app_session() as s:
        pg = s.page
        await s.js("""(() => { const t = U.todayStr(); const tt = Store.list('taskTypes')[0] || 'Support', src = Store.list('sources')[0] || 'Phone';
          Store.save({ c: 'shadow', id: 'lc-x', analyst: 'yousef', team: 'apps', date: t, subject: 'Lab result interface', ref: 'INC-555', minutes: 40, taskType: tt, source: src });
          Store.save({ c: 'todo', id: 'lc-td', task: 'Fix lab interface mapping', analyst: 'yousef', team: 'apps', assigned: t, duration: 3, status: 'In Progress', priority: 'Normal' }); })()""")
        await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/shadow'); await s.go('#/home', 600)
        tt = await s.js("Store.list('taskTypes')[0] || 'Support'"); src = await s.js("Store.list('sources')[0] || 'Phone'")
        async def fill(subject, ref):
            await pg.select_option('#quicksw [name=taskType]', index=1); await pg.select_option('#quicksw [name=source]', index=1)
            await pg.fill('#quicksw [name=subject]', subject); await pg.fill('#quicksw [name=ref]', ref); await pg.wait_for_timeout(500)
        # same reference: offered, not linked unless clicked
        await fill('Interface retest', 'INC-555')
        c('typing a Reference that others have offers them', await pg.locator('#qslinks [data-qsadd="lc-x"]').count() == 1)
        await pg.click('#quicksw [type=submit]'); await pg.wait_for_timeout(400)
        n1 = await s.js("Store.all('shadow').find(r => r.subject === 'Interface retest')")
        c('not clicked → saved WITHOUT a link', n1 and await s.js(f"WorkLinks.of(Store.get('{n1['id']}')).length") == 0)
        c('…the same reference is still offered in its form', await s.js(f"WorkLinks.sameRef(Store.get('{n1['id']}')).some(x => x.id === 'lc-x')"))
        await fill('Interface fix confirmed', 'INC-555')
        await pg.click('#qslinks [data-qsadd="lc-x"]'); await pg.wait_for_timeout(200)
        c('clicked → shows as a chosen link', await pg.locator('#qslinks [data-qsun="lc-x"]').count() == 1)
        await pg.click('#quicksw [type=submit]'); await pg.wait_for_timeout(400)
        n2 = await s.js("Store.all('shadow').find(r => r.subject === 'Interface fix confirmed')")
        c('…saved and linked to it', n2 and await s.js(f"WorkLinks.of(Store.get('{n2['id']}')).some(x => x.r.id === 'lc-x')"))
        # 🔗 Link to… keeps what was typed
        await fill('Mapping call with vendor', '')
        await pg.click('#qslinks [data-qspick]'); await pg.wait_for_selector('#wllist')
        await pg.fill('#wlq', 'mapping'); await pg.wait_for_timeout(150); await pg.check('#wllist input[value="lc-td"]'); await pg.click('#modal [data-ok]'); await pg.wait_for_timeout(400)
        c('🔗 Link to… keeps what was typed', await pg.input_value('#quicksw [name=subject]') == 'Mapping call with vendor' and await pg.locator('#qslinks [data-qsun="lc-td"]').count() == 1)
        await pg.screenshot(path=f'{SHOTS}/link_choice_desk.png')
        await pg.click('#quicksw [type=submit]'); await pg.wait_for_timeout(400)
        n3 = await s.js("Store.all('shadow').find(r => r.subject === 'Mapping call with vendor')")
        c('…saved and linked to the To Do', n3 and await s.js(f"WorkLinks.of(Store.get('lc-td')).some(x => x.r.id === '{n3['id']}')"))
        # ⏱ Log time links to its item
        await s.js("MyLog.open(Store.get('lc-td'))"); await pg.wait_for_selector('#recform')
        if not await pg.input_value('#recform [name=taskType]'): await pg.select_option('#recform [name=taskType]', index=1)
        if not await pg.input_value('#recform [name=source]'): await pg.select_option('#recform [name=source]', index=1)
        await pg.click('[data-save]'); await pg.wait_for_timeout(400)
        c('⏱ Log time: the entry is linked to the To Do', await s.js("WorkLinks.of(Store.get('lc-td')).filter(x => x.r.c === 'shadow').length") == 2)
        await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        # converting shadow work to a To Do keeps the time (manager)
        await s.sign_in_as('apps-mgr')
        before = await s.js("U.sum(Store.all('shadow', '*').filter(r => r.analyst === 'yousef').map(r => +r.minutes || 0))")
        await s.js("Conv.start(Store.get('lc-x'))"); await pg.wait_for_selector('#cvkeep')
        c('the convert window offers to keep the time (ticked)', await pg.is_checked('#cvkeep') and '40 min' in await pg.inner_text('#modal'))
        await pg.click('[data-cvto="todo"]'); await pg.wait_for_selector('#recform'); await pg.click('[data-save]'); await pg.wait_for_timeout(500)
        td = await s.js("Store.all('todo', '*').find(t => t.convertedFrom && t.convertedFrom.id === 'lc-x')")
        kept = await s.js("Store.all('shadow', '*').find(r => r.keptFrom === 'lc-x')")
        after = await s.js("U.sum(Store.all('shadow', '*').filter(r => r.analyst === 'yousef').map(r => +r.minutes || 0))")
        c('converted: the To Do exists, the shadow time is kept (same total)', bool(td) and bool(kept) and kept['minutes'] == 40 and after == before, (before, after))
        c('…the kept time is linked to the new To Do', await s.js(f"WorkLinks.of(Store.get('{td['id']}')).some(x => x.r.id === '{kept['id']}')"))
        c('…and the old links followed the To Do', await s.js(f"WorkLinks.of(Store.get('{td['id']}')).some(x => x.r.id === '{n2['id']}')"))
        await s.js(f"UI.editRecord('todo', Store.get('{td['id']}'))"); await pg.wait_for_selector('[data-cvundo]'); await pg.click('[data-cvundo]'); await pg.wait_for_timeout(500)
        c('Undo: back to the shadow work, the kept copy is gone', await s.js("!!Store.get('lc-x') && !Store.all('shadow', '*').some(r => r.keptFrom === 'lc-x')"))
        # without keeping
        await s.js("Conv.start(Store.get('lc-x'))"); await pg.wait_for_selector('#cvkeep'); await pg.uncheck('#cvkeep')
        await pg.click('[data-cvto="todo"]'); await pg.wait_for_selector('#recform'); await pg.click('[data-save]'); await pg.wait_for_timeout(500)
        c('unticked: no copy, the time leaves shadow work', not await s.js("Store.all('shadow', '*').some(r => r.keptFrom === 'lc-x')") and not await s.js("Store.get('lc-x')"))
        await s.js("Store.flush()"); await pg.wait_for_timeout(300); await s.js("Store.sync(true)")
        c('nothing refused by the trust check', not await s.js("Store.rejected.some(x => ['shadow', 'worklink', 'todo'].includes(x.c))"), await s.js("JSON.stringify(Store.rejected)"))
        c.done(s)

run(main())
