"""Titles: the super admin shows as Admin to everyone; a custom title replaces the role."""
from harness import app_session, Check, run
async def main():
    c = Check('titles')
    async with app_session() as s:
        pg = s.page
        await s.sign_in_as('yousef')
        c('others see the super admin as Admin', await s.js("Store.titleOf('adam')") == 'Admin')
        c('menu shows my role', 'Analyst' in await pg.inner_text('.side-foot'))
        await s.sign_in_as('adam'); c('my menu says Admin', 'Admin' in await pg.inner_text('.side-foot'))
        await s.go('#/adminperson/layla', 500); await pg.fill('#pcf [name=title]', 'Senior Analyst'); await pg.click('#pcsave'); await pg.wait_for_timeout(400)
        c('custom title saved', await s.js("Store.titleOf('layla')") == 'Senior Analyst')
        await s.sign_in_as('layla'); c('shown in her menu', 'Senior Analyst' in await pg.inner_text('.side-foot'))
        await s.sign_in_as('adam'); await s.js("App.chooseMe(true)"); await pg.wait_for_timeout(300)   # only the super admin can switch person
        btn = await pg.inner_text('[data-me="adam"]'); c('Switch person list shows Admin under my name', 'Admin' in btn, btn)
        btn = await pg.inner_text('[data-me="layla"]'); c('and custom titles', 'Senior Analyst' in btn, btn)
        c.done(s)
run(main())
