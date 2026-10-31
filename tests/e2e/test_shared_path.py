"""The shared folder path: set by the admin, shown in Settings / System Check / update notice, remembered for the connect screen."""
from harness import app_session, Check, run
async def main():
    c = Check('shared folder path')
    async with app_session() as s:
        pg = s.page
        await s.sign_in_as('adam'); await s.go('#/admin/teams', 500)
        await pg.fill('#spf [name=sharedPath]', r'S:\DARRIK'); await pg.click('#savesp'); await pg.wait_for_timeout(300)
        c('saved', await s.js("Store.sharedPath()") == 'S:\\DARRIK')
        t = await s.go('#/admin/data', 500); c('Admin shows the path', 'S:\\DARRIK' in t)
        t = await s.go('#/syscheck', 500); c('System Check shows the path', 'Data folder' in t and 'S:\\DARRIK\\DARRIK Data\\Backups' in t)
        c('data folder path shown', 'S:\\DARRIK\\DARRIK Data\\users' in t and 'Backups' in t, t[:800])
        c('remembered on this PC', await s.js("LS.get('bct.sharedPath', '')") == 'S:\\DARRIK')
        t = await s.go('#/admin/data', 500); c('Admin → Data shows the folders', 'Folders & connection' in t and 'S:\\DARRIK\\DARRIK Data' in t)
        await s.sign_in_as('yousef'); await pg.click('#mebtn'); await pg.wait_for_timeout(300)
        c('not shown to other users (menu on their name)', 'DARRIK Data' not in await pg.inner_text('.modal') and 'S:\\' not in await pg.inner_text('.modal'))
        await s.js("UI.closeModal()")
        html = await s.js("(() => { const d = document.createElement('div'); d.innerHTML = App.pathHtml(); return d.innerHTML; })()")
        c('copy button next to the path', 'data-copypath' in html)
        await s.js("App.connectScreen(false)"); await pg.wait_for_timeout(200)
        c('connect screen does not show the path', 'S:\\DARRIK' not in await pg.inner_text('body'))
        c.done(s)
run(main())
