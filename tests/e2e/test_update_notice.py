"""A newer copy of the app in the shared folder shows the update bar with the delete-and-replace steps."""
import re
from harness import app_session, Check, run, APP, SHOTS
async def main():
    c = Check('update notice')
    async with app_session() as s:
        pg = s.page
        c('version compare is numeric', await s.js("U.verCmp('2026.10.22.12', '2026.10.22.9') > 0 && U.verCmp('2026.10.22.9', '2026.10.22.12') < 0 && U.verCmp('1.2', '1.2.0') === 0"))
        c('no bar when the shared folder has the same version', await pg.locator('.updatebar').count() == 0)
        # put a "newer" copy of the app into the shared folder (the test folder)
        cur = await s.js('APP_VERSION'); parts = cur.split('.'); parts[-1] = str(int(parts[-1]) + 1); newer = '.'.join(parts)
        html = open(f'{APP}/MAHAM.html', encoding='utf-8').read().replace(f"const APP_VERSION = '{cur}'", f"const APP_VERSION = '{newer}'")
        await s.js(f"(async () => {{ const fh = await Store.root.getFileHandle('MAHAM.html', {{create: true}}); const w = await fh.createWritable(); await w.write({html!r}); await w.close(); }})()")
        await s.js("App.checkVersion()"); await pg.wait_for_timeout(1500)
        t = await pg.inner_text('.updatebar') if await pg.locator('.updatebar').count() else ''
        c('bar appears for the newer version', newer in t, t[:120])
        c('tells them to delete the old file and copy the new one', 'delete' in t and 'copy the new' in t.lower() and 'Your work is safe' in t)
        await pg.screenshot(path=f'{SHOTS}/update_notice.png')
        await s.js("App.checkVersion()"); await pg.wait_for_timeout(800)
        c('only one bar', await pg.locator('.updatebar').count() == 1)
        await pg.click('.updatebar [data-later]'); await s.js("App.checkVersion()"); await pg.wait_for_timeout(800)
        c('"Remind me later" hides it for this session', await pg.locator('.updatebar').count() == 0)
        c.done(s)
run(main())
