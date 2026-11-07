"""Phone (iPhone size, no shared-folder support): the app opens on "this device", data survives a reload,
the main pages fit the screen, and the phone install files are served."""
import os, subprocess, sys, time
from playwright.async_api import async_playwright
from harness import APP, SHOTS, Check, free_port, run, sign_in_page

NO_FOLDER = "delete Window.prototype.showDirectoryPicker; delete window.showDirectoryPicker;"

async def main():
    c = Check('phone / this device')
    port = free_port()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=APP, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            await ctx.add_init_script(NO_FOLDER)
            pg = await ctx.new_page(); errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
            url = f'http://127.0.0.1:{port}/MAHAM.html'
            await pg.goto(url); await pg.wait_for_selector('#loginf', timeout=15000)
            c('no folder support → straight to the login page (this device)', await pg.evaluate("Store.storageMode") == 'device')
            await sign_in_page(pg, 'yousef'); await pg.wait_for_selector('#main .kpis')
            c('note under the name: saved on this device', 'this device' in await pg.inner_text('.side-foot'))
            await pg.evaluate("(async () => { Store.save({ c: 'shadow', id: 'phone-sw', analyst: 'yousef', team: 'apps', date: U.todayStr(), taskType: 'TRAINING >> x', source: 'Call', subject: 'Logged on the phone', minutes: 30 }); await Store.flush(); })()")
            await pg.wait_for_timeout(600)
            await pg.reload(); await pg.wait_for_selector('#main .kpis', timeout=15000)
            c('data is still there after closing and opening again', await pg.evaluate("!!Store.get('phone-sw')"))
            await pg.screenshot(path=f'{SHOTS}/phone_myday.png', full_page=True)
            wide = []
            for h in ['#/home', '#/todo', '#/shadow', '#/attendance', '#/requests', '#/perf', '#/quickwins']:
                await pg.evaluate(f"location.hash = '{h}'"); await pg.wait_for_timeout(450)
                over = await pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")
                if over > 2: wide.append((h, over))
                await pg.screenshot(path=f'{SHOTS}/phone_{h[2:]}.png')
            c('pages fit the phone width (no sideways page scroll)', not wide, wide)
            await pg.click('#menubtn'); await pg.wait_for_timeout(300)
            c('menu opens from the ☰ button', await pg.evaluate("document.body.classList.contains('nav-open')"))
            await pg.screenshot(path=f'{SHOTS}/phone_menu.png')
            for f in ['maham.config.js', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png']:
                r = await pg.request.get(f'http://127.0.0.1:{port}/{f}')
                c(f'served next to the app: {f}', r.ok)
            c('installable on https (manifest linked)', await pg.evaluate("!!document.querySelector('link[rel=manifest]')"))
            c('no page errors', not errors, errors[:3])
            await b.close()
    finally: srv.terminate()
    c.done()
run(main())
