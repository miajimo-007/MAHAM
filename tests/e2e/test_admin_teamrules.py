"""Admin overhaul: grouped tabs, Team rules (role defaults per team, team targets), new admin-given permissions."""
from harness import app_session, Check, run
async def main():
    c = Check('admin team rules')
    async with app_session() as s:
        pg = s.page
        c('analyst cannot approve quick wins by default', not await s.js("Store.can('layla', 'approveQW')"))
        c('manager cannot post announcements or add help desk rows by default', not await s.js("Store.can('apps-mgr', 'postAnnouncements')") and not await s.js("Store.can('apps-mgr', 'editHelpdeskByHand')"))
        await s.sign_in_as('adam', 'admin'); t = await s.go('#/admin/teamrules')
        tt = (await pg.inner_text('.adm-top')).lower() + (await pg.inner_text('.adm-sub')).lower(); c('grouped admin tabs: People → Roles & access (team rules), Scoring, System', all(x.lower() in tt for x in ['People', 'Roles & access', 'Scoring', 'System']) and 'What each role can do' in t)
        await pg.select_option('#trteam', 'apps'); await pg.wait_for_timeout(300)
        await pg.check('[data-tr="analyst|approveQW"]'); await pg.check('[data-tr="manager|postAnnouncements"]'); await pg.click('#trsave'); await pg.wait_for_timeout(300)
        c('APPS analysts now approve quick wins', await s.js("Store.can('layla', 'approveQW')"))
        c('only APPS — other teams keep the default', await s.js("(m => !m || !Store.can(m.id, 'approveQW'))(Store.members().find(m => m.team === 'lab' && (m.role || 'analyst') === 'analyst' && m.active !== false))"))
        c('APPS manager may post announcements', await s.js("Store.can('apps-mgr', 'postAnnouncements')"))
        await s.js("saveMembersAll(Store.members().map(m => m.id === 'layla' ? Object.assign({}, m, { perms: { approveQW: false } }) : m), 'x')"); await pg.wait_for_timeout(200)
        c('person override beats the team rule', not await s.js("Store.can('layla', 'approveQW')"))
        # targets per team
        await pg.fill('#trtg [name=hdDays]', '7'); await pg.click('#trtgsave'); await pg.wait_for_timeout(300)
        c('team target', await s.js("Custom.target('hdDays', 'apps')") == 7 and await s.js("Custom.target('hdDays', 'lab')") == 3)
        # help desk months tab
        t = await s.go('#/admin/hdmonths'); c('help desk months on its own tab', 'Months open automatically' in t)
        # the manager posts an announcement now
        await s.sign_in_as('apps-mgr'); await s.go('#/announcements')
        c('manager sees the post button', await pg.locator('[data-add="announcement"], #annnew, [data-annnew]').count() >= 1 or 'can post' in await pg.inner_text('#main'))
        c.done(s)
run(main())
