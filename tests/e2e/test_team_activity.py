"""Manager Desk: team activity (first/last time today); Help Desk overview layout; priority in the assign form."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('team activity')
    async with app_session() as s:
        pg = s.page; J = s.js
        await s.sign_in_as('yousef'); await s.go('#/home', 300); await s.go('#/todo', 300); await J("Admin.flushUsage(); Store.flush()")
        await s.sign_in_as('apps-mgr'); t = await s.go('#/manager', 600)
        c('Team activity card', 'Team activity' in t)
        seen = await J("Admin.seen('yousef')")
        c('first and last time recorded for today', seen['today'] and seen['first'] and seen['last'] and seen['first'] <= seen['last'])
        row = await J("[...document.querySelectorAll('#main table tr')].find(tr => tr.innerText.includes('Yousef') && tr.querySelector('.dot.on'))?.innerText || ''")
        c('Yousef shown as opened today with a time', ':' in row, row)
        await pg.click('[data-assign]'); await pg.wait_for_selector('#modal #assign')
        c('assign form (in its dialog) has priority + milestone', await pg.locator('#assign [name=priority]').count() == 1 and await pg.locator('#assign [name=milestone]').count() == 1)
        await J("UI.closeModal()")
        await pg.screenshot(path=f'{SHOTS}/team_activity.png', full_page=True)
        t = await s.go('#/helpdesk', 500)
        c('help desk overview: no empty half box', await J("[...document.querySelectorAll('#main .cols2')].every(el => el.children.length !== 1)"))
        await pg.screenshot(path=f'{SHOTS}/helpdesk_overview.png', full_page=True)
        c.done(s)
run(main())
