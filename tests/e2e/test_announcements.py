"""Announcements: only the super admin posts; people see unread ones on their start page; admin sees who read them."""
import json
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('announcements')
    async with app_session() as s:
        pg = s.page; J = s.js
        await s.go('#/announcements'); await pg.click('#newann'); await pg.wait_for_selector('#anf')
        await pg.fill('#anf [name=title]', 'EHR downtime Friday 22:00'); await pg.fill('#anf [name=body]', 'Read-only mode for 2 hours. Downtime forms are on the shared drive.')
        await pg.click('[data-ok]'); await pg.wait_for_timeout(300)
        await pg.click('#newann'); await pg.wait_for_selector('#anf'); await pg.fill('#anf [name=title]', 'LAB only: new analyzer go-live')
        await pg.uncheck('#anf [name=aud][value=""]'); await pg.check('#anf [name=aud][value="lab"]'); await pg.click('[data-ok]'); await pg.wait_for_timeout(300)
        c('admin posted 2 announcements', await J("Store.all('announcement').length") == 2)
        # analyst sees it and confirms
        await s.sign_in_as('yousef'); t = await s.go('#/home')
        c('analyst sees the unread announcement on My Day', 'EHR downtime Friday 22:00' in t and 'Got it' in t)
        c('…not the LAB-only one', 'new analyzer' not in t)
        c('unread count next to the menu item', await pg.locator('nav [data-nav="announcements"] .count').count() == 1)
        await pg.screenshot(path=f'{SHOTS}/announcement_myday.png')
        await pg.click('[data-annread]'); await pg.wait_for_timeout(300)
        c('"Got it" hides it from My Day', 'EHR downtime' not in await pg.inner_text('#main'))
        c('…but it stays on the Announcements page', 'EHR downtime' in await s.go('#/announcements'))
        c('analyst has no "New announcement" button', await pg.locator('#newann').count() == 0)
        await J("Store.save({c: 'announcement', id: 'announcement-yousef-x', title: 'Fake', posted: U.todayStr()})")
        c('analyst cannot post', not await J("Store.get('announcement-yousef-x')"))
        # hand-edited file
        payload = json.dumps({'version': 1, 'kind': 'user', 'user': 'layla', 'records': [{'id': 'announcement-layla-1', 'c': 'announcement', 'title': 'Forged', 'posted': '2026-10-23', '_ts': await J('Date.now()'), '_by': 'layla'}, {'id': 'annread-nora-' + await J("Store.all('announcement')[0].id"), 'c': 'annread', '_ts': await J('Date.now()'), '_by': 'layla'}]})
        await J(f"(async () => {{ const fh = await Store.usersDir.getFileHandle('layla.json', {{create: true}}); const w = await fh.createWritable(); await w.write({json.dumps(payload)}); await w.close(); }})()"); await J("Store.sync(true)")
        c('forged announcement / read receipt in a file are ignored', not await J("Store.get('announcement-layla-1')") and await J("Store.rejected.filter(x => x.c === 'announcement' || x.c === 'annread').length") == 2)
        # LAB manager sees the LAB one; director sees all
        await s.sign_in_as('lab-mgr'); c('LAB manager sees the LAB announcement', 'new analyzer go-live' in await s.go('#/manager'))
        await s.sign_in_as('khalid'); c('director sees every announcement', 'new analyzer go-live' in await s.go('#/home') and 'EHR downtime' in await pg.inner_text('#main'))
        # admin: who has read it
        await s.sign_in_as('adam'); await s.go('#/announcements')
        t = await pg.inner_text('#main'); c('admin sees how many read it', '1 of 10 read' in t, t[:300])
        await pg.click('[data-annwho] >> nth=1'); await pg.wait_for_timeout(200)
        w = await pg.inner_text('#modal'); c('…and who exactly', 'Qahtani Yousef A' in w and 'not yet' in w)
        await pg.screenshot(path=f'{SHOTS}/announcement_admin.png')
        c.done(s)
run(main())
