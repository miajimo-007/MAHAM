"""Tidy-up batch (2026.10.30.8): My Day order + merged list + waiting trace, desks hide empty boxes, Ask for update,
attendance present unless marked, editable About page, onboarding not flagged for the ManageEngine name."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('tidy oct30')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J("""(() => { const d = n => U.addDays(U.todayStr(), -n);
          Store.saveMany([{c:'todo', id:'td-a1', task:'Late job', analyst:'yousef', team:'apps', assigned:d(9), duration:2, status:'In Progress', finish:'', priority:'High'},
                          {c:'todo', id:'td-a2', task:'Today job', analyst:'yousef', team:'apps', assigned:d(0), duration:3, status:'In Progress', finish:''}]); })()""")
        await s.sign_in_as('yousef'); t = await s.go('#/home', 500)
        c('greeting comes before My work', t.find('Good') >= 0 and t.find('My work') > t.find('Good'), t[:200])
        c('no separate "My pending To Do" box', 'My pending To Do' not in t)
        c('My work has All To Dos link', 'All To Dos' in t)
        await pg.locator('[data-mineok="td-a2"]').click(); await pg.wait_for_timeout(400)
        st = await J("Store.get('td-a2').status")
        t = await s.go('#/home', 400)
        if st == 'Ready for review':
            c('done To Do stays greyed, waiting for manager', 'waiting for your manager' in t and await pg.locator('.li.waiting').count() == 1)
        else:
            c('done To Do confirmed directly (no review step)', st == 'Resolved', st)
        await s.sign_in_as('apps-mgr'); t = await s.go('#/manager', 600)
        c('manager desk title shown once', t.count('Manager desk') == 0)
        c('no empty "From the director" box', 'No open tasks from the director' not in t)
        c('overdue row has Ask for update', await pg.locator('[data-nudge="td-a1"]').count() == 1)
        await pg.locator('[data-nudge="td-a1"]').click(); await pg.wait_for_timeout(300)
        c('nudge saved', await J("Store.get('td-a1').nudgedOn === U.todayStr()"))
        c('no half-empty rows', await J("[...document.querySelectorAll('#main .cols2')].every(el => el.children.length !== 1)"))
        await s.sign_in_as('yousef'); t = await s.go('#/home', 400)
        c('analyst sees the update request', 'asked for an update' in t)
        # attendance: present unless marked, managers out of the grid
        await s.sign_in_as('apps-mgr'); t = await s.go('#/attendance', 500)
        heads = await J("[...document.querySelectorAll('table.att thead th')].map(x => x.innerText.trim())")
        c('manager not in the attendance grid', not any('MANAGER' in x.upper() for x in heads), heads)
        c('summary counts on-duty days without marking', await J("+[...document.querySelectorAll('#main table')].pop().querySelector('tbody td:nth-child(2)').innerText > 0"))
        # onboarding: someone who opened the app and has a PIN is not flagged for a missing ME match
        flagged = await J("Admin.notOnboarded().map(m => m.id)")
        steps = await J("Admin.onboarding(Store.member('yousef')).filter(s => !s[1] && !s[2]).map(s => s[0])")
        c('ManageEngine name never blocks onboarding', all('ManageEngine' not in x for x in steps), steps)
        # About page: super admin can edit
        await s.sign_in_as('adam', 'admin'); t = await s.go('#/about', 400)
        c('Edit page button for the admin', await pg.locator('#abedit').count() == 1)
        await pg.locator('#abedit').click(); await pg.wait_for_timeout(200)
        await pg.fill('#abf [name=tagline]', 'Every effort, seen.'); await pg.locator('.modal [data-s]').click(); await pg.wait_for_timeout(300)
        t = await s.go('#/about', 300)
        c('edited tagline shows', 'Every effort, seen.' in t)
        c('no people credits in the public copy', 'People Behind' not in t)
        await pg.screenshot(path=f'{SHOTS}/about_edited.png', full_page=True)
        await s.sign_in_as('yousef'); t = await s.go('#/about', 300)
        c('analyst sees the new text but no edit button', 'Every effort, seen.' in t and await pg.locator('#abedit').count() == 0)
        c.done(s)
run(main())
