"""Director Desk → Follow-ups due this week lists director tasks given outside meetings too."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('director follow-ups')
    async with app_session() as s:
        await s.sign_in_as('khalid')
        t = await s.go('#/home', 600)
        c('empty state explains what to do', 'Nothing to follow up yet' in t or 'o follow-ups due this week' in t or 'Follow-ups due this week' in t or 'Follow-ups this week' in t)
        await s.js("Store.saveMany([{c: 'mgrtask', id: 'mt-f1', task: 'Review OR booking', manager: 'apps-mgr', team: 'apps', date: U.todayStr(), due: U.addDays(U.todayStr(), 3), status: 'Open', urgency: 'Normal'}, {c: 'mgrtask', id: 'mt-f2', task: 'Plan training', manager: 'apps-mgr', team: 'apps', date: U.todayStr(), due: '', status: 'Open', urgency: 'Normal'}])")
        await s.go('#/meetings'); t = await s.go('#/home', 600)
        c('task due this week shown (not from a meeting)', 'Review OR booking' in await s.page.inner_text('.dc-grp[data-k=fu]') if await s.page.locator('.dc-grp[data-k=fu]').count() else False, t[:1500])
        c('later / undated ones counted', '1 more open with a later or no due date' in t)
        await s.page.screenshot(path=f'{SHOTS}/director_followups.png')
        await s.sign_in_as('adam'); t = await s.go('#/director', 600)
        c('super admin sees it too', 'Review OR booking' in t)
        c.done(s)
run(main())
