"""Good Catch: report, take, update, resolve; finder sees it on My Day; department-wide; authority; quick win; counts."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('good catch')
    async with app_session() as s:
        pg = s.page; J = s.js
        await s.sign_in_as('yousef'); t = await s.go('#/oncall')
        c('menu: Good Catch (Follow-up) and On-Call sheet (Team & Time)', 'Good Catch' in await pg.inner_text('nav') and 'On-Call sheet' in await pg.inner_text('nav') )
        await s.go('#/oncall/goodcatch'); await pg.click('[data-add="gcatch"]'); await pg.wait_for_selector('#recform')
        c('patient-privacy reminder on the form', 'identify a patient' in await pg.inner_text('.modal'))
        await pg.fill('#recform [name=title]', 'Allergy banner hidden on small screens'); await pg.select_option('#recform [name=kind]', 'Enhancement opportunity')
        await pg.fill('#recform [name=system]', 'EHR chart'); await pg.fill('#recform [name=action]', 'Told the nurse to widen the window'); await pg.click('[data-save]'); await pg.wait_for_timeout(300)
        g = await J("GC.all().find(x => x.title.startsWith('Allergy banner')).id")
        c('saved: New, found by yousef today', await J(f"(x => x.status === 'New' && x.createdBy === 'yousef' && x.found === U.todayStr())(Store.get('{g}'))"))
        # someone from another team sees it and takes it (department-wide)
        await s.sign_in_as('lab-mgr'); t = await s.go('#/oncall/goodcatch')
        c('another team (LAB) sees it', 'Allergy banner hidden' in t)
        lab = 'layla'
        await s.sign_in_as(lab); t = await s.go('#/oncall/goodcatch')
        await J(f"UI.editRecord('gcatch', Store.get('{g}'))"); await pg.wait_for_selector('.gc-panel')
        c('not theirs: details read-only, but they can take it', await pg.locator('#recform [name=title]').count() == 0 and await pg.locator('[data-gct]').count() == 1)
        await J("UI.closeModal()")
        bad = await J(f"(() => {{ Store.save(Object.assign({{}}, Store.get('{g}'), {{ title: 'changed' }})); return Store.get('{g}').title; }})()")
        c("cannot change the finder's details", bad != 'changed')
        await pg.click(f'[data-gctake="{g}"]'); await pg.wait_for_timeout(300)
        c('took it: In progress, taker set, update logged', await J(f"(x => x.status === 'In progress' && x.taker === '{lab}')(Store.get('{g}'))") and await J(f"GC.updates('{g}').length") == 1)
        await J(f"UI.editRecord('gcatch', Store.get('{g}'))"); await pg.wait_for_selector('#gcnew'); await pg.fill('#gcnew', 'Raised with the vendor'); await pg.click('#gcadd'); await pg.wait_for_timeout(250)
        c('update added', await J(f"GC.updates('{g}').length") == 2)
        await pg.click('[data-gcr]'); await pg.wait_for_selector('#gcr'); await pg.fill('#gcr [name=resolution]', 'Vendor patch moved the banner up'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300)
        c('resolved by the taker', await J(f"(x => x.status === 'Resolved' && x.resolvedBy === '{lab}' && x.resolution.includes('patch'))(Store.get('{g}'))"))
        # finder gets it on My Day
        await s.sign_in_as('yousef'); t = await s.go('#/home')
        c('finder sees it on My Day', 'Your good catches were resolved' in t and 'Allergy banner' in t)
        await pg.click('[data-gcseen]'); await pg.wait_for_timeout(300); c('OK, seen hides it', 'Your good catches were resolved' not in await pg.inner_text('#main'))
        # finder turns it into a quick win
        await s.go('#/oncall/goodcatch'); await J(f"UI.editRecord('gcatch', Store.get('{g}'))"); await pg.wait_for_selector('[data-gcqw]'); await pg.click('[data-gcqw]'); await pg.wait_for_selector('#recform [name=module]')
        await pg.fill('#recform [name=module]', 'Chart'); await pg.click('[data-save]')
        for _ in range(40):   # wait for the save (slower machines), not a fixed time
            if await J(f"Store.all('quickwin').some(q => q.fromCatch === '{g}')"): break
            await pg.wait_for_timeout(250)
        if await pg.locator('#modal').count(): print('   form still open:', (await pg.inner_text('#modal'))[:300].replace('\n', ' | '), await pg.inner_text('#toasts'))
        c('quick win made from it and marked', await J(f"Store.all('quickwin').some(q => q.fromCatch === '{g}')") and await J(f"Store.get('{g}').convertedTo") == 'quickwin')
        await pg.screenshot(path=f'{SHOTS}/good_catch.png', full_page=True)
        # counts
        t = await s.go('#/performance'); await pg.click('[data-tab="gc"]'); await pg.wait_for_timeout(300)
        c('Performance shows good catches', 'recognition, not scored' in await pg.inner_text('#main'))
        c('counts', await J("GC.counts('yousef', new Date().getFullYear()).found") == 1)
        # on-call tab still works
        t = await s.go('#/oncall/oncall'); c('On-Call tab unchanged', 'On-call plan' in t)
        c.done(s)
run(main())
