"""Same list behaviour: every list has ☆ Views (save the filters, search and sort under a name, one click to get them
back, only for the person who saved them, kept in their own file); External Follow-up changes the step right in the
list and acts on several ticked follow-ups (chased today with Undo, next chase date, move to a step)."""
from harness import app_session, Check, run, SHOTS

async def main():
    c = Check('list views and actions')
    async with app_session() as s:
        pg = s.page
        await s.js("""(() => { const t = U.todayStr();
          const fu = (id, n, subject, status, extra) => Store.save(Object.assign({ c: 'central', id, team: 'apps', analyst: 'yousef', party: 'central', fuv: 2, n, date: t, module: 'Pharmacy', subject, status }, extra || {}));
          fu('lv1', 801, 'Label printer', 'Accepted', { redmine: 'RM-1' }); fu('lv2', 802, 'Stock report', 'Accepted', { redmine: 'RM-2' }); fu('lv3', 803, 'Ward list', 'Under Review'); fu('lv4', 804, 'Lab interface', 'Accepted', { redmine: 'RM-4', module: 'Lab' }); })()""")
        await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        await s.sign_in_as('yousef', 'analyst')
        await s.go('#/home'); await s.go('#/central', 600)
        c('every list has ☆ Views next to the search', await pg.locator('[data-tviews="riy"]').count() == 1)
        # set a filter + search, save as a view
        await pg.select_option('[data-flt="riy|mod"]', 'Pharmacy'); await pg.wait_for_timeout(300)
        await pg.fill('[data-tsearch="riy"]', 'report'); await pg.wait_for_timeout(600)
        await pg.click('[data-tviews="riy"]'); await pg.wait_for_selector('#tvf')
        await pg.fill('#tvf [name=name]', 'Pharmacy reports'); await pg.click('[data-tvsave]'); await pg.wait_for_timeout(300); await s.js("Store.flush()")
        v = await s.js("Store.all('listview')[0]")
        c("view saved in the person's own name with filters + search", bool(v) and v['by'] == 'yousef' and v['id'].startswith('listview-yousef-') and v['st']['q'] == 'report' and v['flt']['riy']['mod'] == 'Pharmacy', v)
        c('the view chip shows as "on"', await pg.locator('.tv-chip.on').count() == 1)
        # clear everything, then one click brings it back
        await s.js("App.tableState.riy.q = ''; delete ps('riy').mod; App.render(true)"); await pg.wait_for_timeout(300)
        n_all = await pg.locator('[data-tbl="riy"] tbody tr').count()
        await pg.click('.tv-chip'); await pg.wait_for_timeout(400)
        rows = await pg.inner_text('[data-tbl="riy"] tbody')
        c('one click on the chip brings the view back', 'Stock report' in rows and 'Lab interface' not in rows and 'Label printer' not in rows and n_all >= 3, rows[:200])
        c('…the filter box shows it too', await pg.locator('[data-flt="riy|mod"]').input_value() == 'Pharmacy')
        await pg.screenshot(path=f'{SHOTS}/list_views.png')
        # someone else does not see it
        await s.sign_in_as('layla', 'analyst'); await s.go('#/home'); await s.go('#/central', 500)
        c("other people don't see your views", await pg.locator('.tv-chip').count() == 0)
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/home'); await s.go('#/central', 500)
        # change the step right in the list
        await s.js("App.tableState.riy.q = ''; delete ps('riy').mod; App.render(true)"); await pg.wait_for_timeout(300)
        sel = '[data-rid="lv1"] select.inl'
        opts = await s.js(f"[...document.querySelector('{sel}').options].map(o => o.textContent)")
        c('the Step box offers only the moves the workflow allows', opts[0] == 'Accepted' and any('In Development' in o for o in opts) and not any(o.startswith('→ Deployed') for o in opts), opts)
        dev = await s.js(f"[...document.querySelector('{sel}').options].find(o => o.textContent.includes('In Development')).value")
        await pg.select_option(sel, dev); await pg.wait_for_selector('#fugo'); await pg.click('#fugo'); await pg.wait_for_timeout(300)
        c('choosing a move runs it (its screen first)', await s.js("Store.get('lv1').status") == 'In Development')
        # several at once
        await pg.check('[data-tsel="riy|lv2"]'); await pg.wait_for_timeout(250); await pg.check('[data-tsel="riy|lv3"]'); await pg.wait_for_timeout(250)
        ch0 = await s.js("['lv2','lv3'].map(id => (Store.get(id).chases || []).length)")
        await pg.click('.bulk-bar >> text=Chased today'); await pg.wait_for_timeout(300)
        ch1 = await s.js("['lv2','lv3'].map(id => (Store.get(id).chases || []).length)")
        c('tick several → 📞 Chased today logs a chase on each', ch1 == [ch0[0] + 1, ch0[1] + 1], (ch0, ch1))
        await pg.click('.toast-act'); await pg.wait_for_timeout(300)
        c('…with Undo', await s.js("['lv2','lv3'].map(id => (Store.get(id).chases || []).length)") == ch0)
        for rid in ['lv2', 'lv4', 'lv3']: await pg.check(f'[data-tsel="riy|{rid}"]'); await pg.wait_for_timeout(250)
        await pg.click('.bulk-bar >> text=Move to step'); await pg.wait_for_selector('#mvf')
        await pg.select_option('#mvf [name=to]', 'In Development'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(400)
        st = await s.js("['lv2','lv3','lv4'].map(id => Store.get(id).status)")
        c('➜ Move to step moves the ones that may (Accepted → In Development), skips the rest', st == ['In Development', 'Under Review', 'In Development'], st)
        await pg.check('[data-tsel="riy|lv2"]'); await pg.wait_for_timeout(250)
        await pg.click('.bulk-bar >> text=Next chase on'); await pg.wait_for_selector('#ncf')
        d = await s.js("U.addDays(U.todayStr(), 3)"); await pg.fill('#ncf [name=next]', d); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300)
        c('📅 Next chase on… sets the date', await s.js("Store.get('lv2').next") == d)
        await s.js("Store.flush()"); await pg.wait_for_timeout(400); await s.js("Store.sync(true)"); await pg.wait_for_timeout(300)
        c('the moves stay after the files are read again (allowed moves)', await s.js("['lv1','lv2','lv4'].map(id => Store.get(id).status).join()") == 'In Development,In Development,In Development')
        await s.sign_in_as('adam')
        c('saved views are not rejected by the trust check', not await s.js("Store.rejected.some(x => x.c === 'listview')") and await s.js("Store.all('listview').length") == 1)
        c.done(s)

run(main())
