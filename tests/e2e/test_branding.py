"""App name & logo: set by the admin, shown in the menu, browser tab, About page and the start screen."""
import os
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('branding')
    async with app_session() as s:
        pg = s.page
        await s.sign_in_as('adam')
        c('default name DARRIK in the menu', (await pg.inner_text('#brandapp')) == 'DARRIK')
        c('team name under it', len((await pg.inner_text('#brandteam')).strip()) > 0)
        await s.go('#/admin/home'); await s.go('#/admin/custom', 500)
        c('Name & logo card in Customize', 'Name, logo, tagline and colour' in await pg.inner_text('#app'))
        await pg.fill('#cz-look [name=appName]', 'DARRIK Pro')
        await pg.set_input_files('#logofile', os.path.join(os.path.dirname(__file__), 'logo_sample.png'))
        await pg.wait_for_timeout(500)
        await pg.click('[data-csave=look]'); await pg.wait_for_timeout(800)
        c('name saved', await s.js("Store.appName() === 'DARRIK Pro'"))
        c('logo resized to 256px', await s.js("new Promise(r => { const i = new Image(); i.onload = () => r(Math.max(i.width, i.height) === 256); i.src = Store.appLogo(); })"))
        c('menu shows the new name', (await pg.inner_text('#brandapp')) == 'DARRIK Pro')
        c('menu shows the logo image', await pg.locator('.side .brand .logo img').count() == 1)
        c('favicon is the logo', await s.js("document.querySelector('link[rel=icon]').href.startsWith('data:image/png')"))
        await s.go('#/about', 400)
        c('browser tab title', await s.js("document.title.endsWith('· DARRIK Pro')"))
        c('About shows the logo', await pg.locator('.ab-logo').count() == 1)
        c('cached for the start screen', await s.js("JSON.parse(localStorage.getItem('bct.brand') || '{}').name === 'DARRIK Pro'"))
        await s.go('#/admin/custom', 500)
        await pg.screenshot(path=f'{SHOTS}/branding.png')
        c.done(s)
run(main())
