"""2026.11.13.7 — the glass look (always on) and Light / Dark chosen by each person with ☀ / ☾ in the top bar."""
import os
from harness import app_session, Check, run, SHOTS

LUM = """(sel, prop) => { const e = document.querySelector(sel); if (!e) return null; const c = getComputedStyle(e)[prop];
  const cv = document.createElement('canvas').getContext('2d'); cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); const d = cv.getImageData(0, 0, 1, 1).data;
  return Math.round((0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 2.55); }"""


async def main():
    c = Check('theme 2026.11.13.7')
    async with app_session() as s:
        pg = s.page; J = s.js
        lum = lambda sel, prop: pg.evaluate(f"({LUM})('{sel}', '{prop}')")
        await pg.set_viewport_size({'width': 1366, 'height': 800})
        await s.sign_in_as('apps-mgr', 'manager'); await s.go('#/todo'); await s.go('#/manager', 700)
        c('the ☀ / ☾ switch is in the top bar', await pg.locator('.top .theme-sw [data-theme="dark"]').count() == 1)
        c('Light by default', not await J("document.documentElement.classList.contains('dark')") and await pg.locator('.theme-sw [data-theme="light"][aria-pressed="true"]').count() == 1)
        c('glass: panels are frosted', await J("getComputedStyle(document.querySelector('.desk-grp, .card')).backdropFilter.includes('blur')"))
        c('Light: the page and the text as before (light page, dark text)', await lum('body', 'backgroundColor') > 80 and await lum('#ptitle', 'color') < 30)
        await pg.click('.theme-sw [data-theme="dark"]'); await pg.wait_for_timeout(300)
        c('☾ → Dark', await J("document.documentElement.classList.contains('dark')") and await pg.locator('.theme-sw [data-theme="dark"][aria-pressed="true"]').count() == 1)
        c('Dark: dark page, light text', await lum('body', 'backgroundColor') < 15 and await lum('#ptitle', 'color') > 70)
        c('Dark: the menu text is readable', await lum('.side a', 'color') > 60)
        await pg.screenshot(path=os.path.join(SHOTS, 'theme_dark_desk.png'))
        # a form window in Dark: a solid dark box with light text and dark fields
        await s.go('#/home'); await s.go('#/todo', 600)
        await J("(() => { const b = [...document.querySelectorAll('button')].find(x => /New To Do/.test(x.textContent)); if (b) b.click(); })()"); await pg.wait_for_timeout(500)
        c('Dark: a form window is dark and solid', await pg.locator('.modal').count() >= 1 and await lum('.modal', 'backgroundColor') < 20, await lum('.modal', 'backgroundColor'))
        c('Dark: fields are dark with light text', await lum('.modal input, .modal select', 'backgroundColor') < 20 and await lum('.modal input, .modal select', 'color') > 70)
        await pg.screenshot(path=os.path.join(SHOTS, 'theme_dark_form.png'))
        await J("UI.closeModal()")
        # each person keeps their own choice
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/todo', 400)
        await pg.click('.theme-sw [data-theme="light"]'); await pg.wait_for_timeout(200)
        c('another person can choose Light', not await J("document.documentElement.classList.contains('dark')"))
        await s.sign_in_as('apps-mgr', 'manager'); await s.go('#/home'); await s.go('#/todo', 400)
        c('…and the manager still gets Dark (kept for each person)', await J("document.documentElement.classList.contains('dark')"))
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/home'); await s.go('#/todo', 400)
        c('…and Yousef still gets Light', not await J("document.documentElement.classList.contains('dark')"))
        c('no page errors', not s.errors, '; '.join(s.errors[:3]))
    c.done(s)

run(main())
