"""Help desk month lock: only the last N months are changed by the import; locked months skip, except closing a request still open."""
from harness import app_session, Check, run
async def main():
    c = Check('help desk month lock')
    async with app_session() as s:
        pg = s.page
        await s.sign_in_as('apps-mgr')
        ym = lambda k: s.js(f"HDLock.ym(new Date(new Date().getFullYear(), new Date().getMonth() - {k}, 1))")
        cur, old = await ym(0), await ym(5)
        c('default: 3 months open', await s.js('HDLock.openCount()') == 3)
        c('this month open, 5 months ago locked', not await s.js(f"HDLock.isLocked('{cur}')") and await s.js(f"HDLock.isLocked('{old}')"))
        # a closed old request, an open old request, and a fresh one
        await s.js(f"Store._importing = true; Store.saveMany([{{id:'hd-900001', c:'helpdesk', reqId:900001, subject:'Old closed', status:'Closed', technician:'', created:'{old}-10 09:00', resolved:'{old}-11 09:00', elapsedHrs: 24}}, {{id:'hd-900002', c:'helpdesk', reqId:900002, subject:'Old open', status:'Open', technician:'', created:'{old}-12 09:00', resolved:'', elapsedHrs: null}}]); Store._importing = false")
        a = await s.js("HDLock.forImport(Store.get('hd-900001'), Object.assign({}, Store.get('hd-900001'), {subject:'changed', status:'Resolved'}))")
        c('locked month: a change to a closed request is skipped', a['rec'] is None and a['kind'] == 'locked')
        b = await s.js(f"HDLock.forImport(Store.get('hd-900002'), Object.assign({{}}, Store.get('hd-900002'), {{subject:'renamed', status:'Closed', resolved:'{cur}-01 10:00', elapsedHrs: 99}}))")
        c('locked month: an open request may only be closed (subject kept)', b['kind'] == 'closed' and b['rec']['status'] == 'Closed' and b['rec']['subject'] == 'Old open' and b['rec']['elapsedHrs'] == 99)
        n = await s.js(f"HDLock.forImport(null, {{id:'hd-900003', created:'{old}-02 08:00', status:'Open'}})")
        c('locked month: a new row is skipped', n['rec'] is None)
        f = await s.js(f"HDLock.forImport(null, {{id:'hd-900004', created:'{cur}-01 08:00', status:'Open'}})")
        c('open month: new row added', f['kind'] == 'new')
        # import through the screen
        csv = f"Request ID\tSubject\tStatus\tCreated Time\tResolved Time\n900001\tOld closed CHANGED\tClosed\t{old}-10 09:00\t{old}-11 09:00\n900002\tOld open\tClosed\t{old}-12 09:00\t{cur}-01 10:00\n900005\tNew one\tOpen\t{cur}-01 08:00\t\n"
        await s.go('#/helpdesk/import'); await pg.fill('#imppaste', csv); await pg.wait_for_timeout(700)
        t = await pg.inner_text('#impprev')
        c('preview tells what is locked', 'locked months' in t and 'status only' in t)
        await pg.click('#impgo'); await pg.wait_for_timeout(600)
        c('old closed request unchanged', await s.js("Store.get('hd-900001').subject") == 'Old closed')
        c('old open request closed', await s.js("Store.get('hd-900002').status") == 'Closed')
        c('new request in an open month added', bool(await s.js("Store.get('hd-900005')")))
        # by hand
        await s.sign_in_as('adam', 'admin')
        await s.js("UI.editRecord('helpdesk', Store.get('hd-900001'))"); await pg.wait_for_selector('#recform')
        c('locked month request opens read-only', await pg.locator('#recform [name=subject]').count() == 0 and 'locked by the admin' in await pg.inner_text('.modal'))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        # admin unlocks the month
        await s.go('#/admin/hdmonths'); await pg.click(f'[data-hdl="{old}|1"]'); await pg.wait_for_timeout(300)
        c('unlock by hand', not await s.js(f"HDLock.isLocked('{old}')") and 'Unlocked' in await s.js("HDLock.log()[0].what"))
        await pg.click(f'[data-hdl="{old}|0"]'); await pg.wait_for_timeout(300)
        c('lock again', await s.js(f"HDLock.isLocked('{old}')"))
        await pg.fill('#hdopen', '6'); await pg.click('#hdopensave'); await pg.wait_for_timeout(300)
        c('open months changed to 6', not await s.js(f"HDLock.isLocked('{old}')"))
        c.done(s)
run(main())
