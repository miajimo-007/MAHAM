"""What's new: after an update each person sees, once, the notes for their role (analyst / team leader or manager /
admin), newer than the version they last saw; "✨ What's new" in the menu opens it again."""
from harness import app_session, Check, run, SHOTS

async def main():
    c = Check("what's new")
    async with app_session() as s:
        pg = s.page
        await s.js("localStorage.removeItem('bct.test.nowhatsnew')")
        ver = await s.js('APP_VERSION')
        # an analyst who last saw the version before the newest one with notes for analysts (an admin-only update shows them nothing)
        ai = await s.js("WHATS_NEW.findIndex(v => v.items.some(x => ['all', 'analyst'].includes(x.who)))")
        aver = await s.js(f"WHATS_NEW[{ai}].ver"); prev = await s.js(f"WHATS_NEW[{ai + 1}].ver")
        await s.js(f"LS.set('bct.whatsnew.yousef', '{prev}')")
        await s.sign_in_as('yousef', 'analyst'); await pg.wait_for_selector('#modal .wn-list', timeout=5000)
        t = await pg.inner_text('#modal')
        c('opens by itself after the update, with this update\'s notes', ('This update' in t if aver == ver else 'Version ' + aver in t) and aver in t, t[:300])
        c('the window is wide (up to 1000 px)', await s.js("document.querySelector('#modal .modal').getBoundingClientRect().width") > 900)
        c('only the versions after the one they saw', await s.js(f"!document.querySelector('#modal').textContent.includes('version {prev}')"))
        c('analyst: no manager / admin lines', 'Workflow steps are protected' not in t and 'System Check' not in t, t)
        await pg.screenshot(path=f'{SHOTS}/whats_new.png')
        await pg.click('[data-wnok]'); await pg.wait_for_timeout(200)
        c('remembered as seen', await s.js("LS.get('bct.whatsnew.yousef')") == ver)
        await s.sign_in_as('yousef', 'analyst'); await pg.wait_for_timeout(1200)
        c('not shown again for the same version', await pg.locator('#modal').count() == 0)
        await pg.click('#wnbtn'); await pg.wait_for_selector('#modal .wn-list')
        c('"✨ What\'s new" in the menu opens it again', aver in await pg.inner_text('#modal'))
        await s.js('UI.closeModal()')
        # a manager and the super admin see their lines
        await s.sign_in_as('apps-mgr'); await pg.wait_for_selector('#modal .wn-list', timeout=5000)
        t = await s.js("document.querySelector('#modal').textContent")   # folded versions count too
        c('manager: sees the lead lines; never seen before → everything since 2026.11.07.3 (older folded)', 'Workflow steps are protected' in t and '2026.11.08.1' in t and await pg.locator('#modal details.wn-ver').count() >= 10, t[:400])
        await s.js('UI.closeModal()')
        await s.js("LS.set('bct.whatsnew.adam', '2026.11.10.7')")
        await s.sign_in_as('adam'); await pg.wait_for_selector('#modal .wn-list', timeout=5000)
        t = await s.js("document.querySelector('#modal').textContent")
        c('super admin: sees the admin lines', 'System Check' in t, t[:400])
        await s.js('UI.closeModal()')
        # preview (view as someone) never shows it
        await s.js("LS.set('bct.whatsnew.layla', '')")
        await s.js("App.preview = true"); await s.js("WhatsNew.auto()"); await pg.wait_for_timeout(200)
        c('not shown while previewing as someone else', await pg.locator('#modal').count() == 0)
        await s.js("App.preview = false")
        c.done(s)

run(main())
