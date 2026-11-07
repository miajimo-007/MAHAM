"""The app must open straight from a folder (file://) — that is how people use it on the shared drive."""
import os, asyncio
from playwright.async_api import async_playwright
from harness import APP, Check
async def main():
    c = Check('open from folder')
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto('file://' + os.path.join(APP, 'MAHAM.html')); await pg.wait_for_timeout(1200)
        c('connect screen shown', await pg.locator('#pick').count() == 1)
        c('all pages registered', await pg.evaluate('Object.keys(P).length') >= 24)
        c('no errors on load', not errs, errs)
        await b.close()
    c.done()
asyncio.run(main())
