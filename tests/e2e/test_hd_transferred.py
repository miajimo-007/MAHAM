"""Help desk: a request transferred to another team (no longer in the daily export) disappears on import."""
from harness import app_session, Check, run
async def main():
    c = Check('help desk transferred requests')
    async with app_session() as s:
        pg = s.page
        await s.sign_in_as('apps-mgr')
        ym = lambda k: s.js(f"HDLock.ym(new Date(new Date().getFullYear(), new Date().getMonth() - {k}, 1))")
        cur, last, old = await ym(0), await ym(1), await ym(5)
        seed = [f"{{id:'hd-800001', c:'helpdesk', reqId:800001, subject:'Kept', status:'Open', technician:'', created:'{last}-05 09:00', team:'apps'}}",
                f"{{id:'hd-800002', c:'helpdesk', reqId:800002, subject:'Transferred yesterday', status:'Open', technician:'', created:'{last}-06 09:00', team:'apps'}}",
                f"{{id:'hd-800003', c:'helpdesk', reqId:800003, subject:'Old open, transferred', status:'Open', technician:'', created:'{old}-15 09:00', team:'apps'}}",
                f"{{id:'hd-800004', c:'helpdesk', reqId:800004, subject:'Old closed, locked month', status:'Closed', technician:'', created:'{old}-16 09:00', resolved:'{old}-17 09:00', team:'apps'}}"]
        await s.js(f"Store._importing = true; Store.saveMany([{','.join(seed)}]); Store._importing = false")
        rows = f"Request ID\tSubject\tStatus\tCreated Time\tResolved Time\n800009\tFirst of the file\tClosed\t{old}-02 08:00\t{old}-02 09:00\n800001\tKept\tOpen\t{last}-05 09:00\t\n800010\tNew today\tOpen\t{cur}-01 08:00\t\n"
        await s.go('#/helpdesk/import'); await pg.fill('#imppaste', rows); await pg.wait_for_timeout(800)
        t = await pg.inner_text('#impprev')
        c('preview: 1 no longer with the team, ticked for you; locked month kept', 'Remove 1 request(s) no longer with the team' in t and '2 more in locked months are kept' in t and await pg.is_checked('#impdelmiss'))
        await pg.click('#impgo'); await pg.wait_for_timeout(600)
        c('transferred open request gone', not await s.js("Store.get('hd-800002')"))
        c('locked month: missing request kept', bool(await s.js("Store.get('hd-800003')")))
        c('closed request in a locked month kept (its KPI stays)', bool(await s.js("Store.get('hd-800004')")))
        c('request still in the file kept', bool(await s.js("Store.get('hd-800001')")))
        # a short paste (less than 5 months) never removes on its own
        await s.js(f"Store._importing = true; Store.save({{id:'hd-800005', c:'helpdesk', reqId:800005, subject:'x', status:'Open', technician:'', created:'{cur}-01 07:00', team:'apps'}}); Store._importing = false")
        await s.go('#/helpdesk/overview'); await s.go('#/helpdesk/import')
        await pg.fill('#imppaste', f"Request ID\tSubject\tStatus\tCreated Time\n800010\tNew today\tOpen\t{cur}-01 08:00\n800011\tAnother\tOpen\t{cur}-01 06:00\n"); await pg.wait_for_timeout(800)
        c('short file: offered but not ticked', await pg.locator('#impdelmiss').count() == 1 and not await pg.is_checked('#impdelmiss'))
        # the admin locks the current month by hand → missing requests there are kept
        await s.sign_in_as('adam', 'admin'); await s.go('#/admin/hdmonths'); await pg.click(f'[data-hdl="{cur}|0"]'); await pg.wait_for_timeout(300)
        c('admin locks a recent month by hand', await s.js(f"HDLock.isLocked('{cur}')"))
        await pg.click(f'[data-hdl="{cur}|1"]'); await pg.wait_for_timeout(300)
        c('and unlocks it again', not await s.js(f"HDLock.isLocked('{cur}')"))
        await pg.click(f'[data-hdl="{last}|0"]'); await pg.wait_for_timeout(300)
        await s.sign_in_as('apps-mgr'); await s.go('#/helpdesk/overview'); await s.go('#/helpdesk/import')
        await pg.fill('#imppaste', rows.replace('800001\tKept\tOpen', '800099\tOther\tOpen')); await pg.wait_for_timeout(800)
        t = await pg.inner_text('#impprev')
        c('locked by hand: its missing request is kept, open month still cleaned', '#800001' not in t and '#800005' in t and 'locked months are kept' in t)
        c.done(s)
run(main())
