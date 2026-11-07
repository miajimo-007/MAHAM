"""7 Nov: the app mark (🧭 when no logo is set) and findings sent from MAHAM Lab → Admin → Data → info items or To Dos."""
import json, os, tempfile
from harness import app_session, Check, run, SHOTS

FILE = {'kind': 'maham-lab-findings', 'version': 1, 'at': '2026-11-07T08:00:00.000Z', 'by': 'Yousef', 'dataset': 'ER visits', 'label': 'Patient-level',
        'items': [{'title': 'ER waits jump after 4 pm on Sundays', 'note': 'Plan one more doctor 16:00–22:00 on Sundays.', 'at': '2026-11-06'},
                  {'title': 'Ramadan days are 18% quieter', 'note': '', 'at': '2026-11-06'}]}

async def main():
    c = Check('lab findings')
    async with app_session() as s:
        pg = s.page; J = s.js
        await s.sign_in_as('adam')
        c('menu shows the 🧭 mark when no logo is set', (await pg.inner_text('.side .brand .logo')).strip() == '🧭')
        c('browser tab icon is the mark', '%F0%9F%A7%AD' in await J("document.querySelector('link[rel=icon]').href"))
        t = await s.go('#/admin/data', 600)
        c('Findings from MAHAM Lab card in Admin → Data', 'Findings from MAHAM Lab' in t)
        p = os.path.join(tempfile.mkdtemp(), 'findings.json'); json.dump(FILE, open(p, 'w'))
        await pg.set_input_files('#labfind', p); await pg.wait_for_selector('#lfadd')
        c('both findings listed', await pg.locator('[data-lf]').count() == 2)
        await pg.screenshot(path=f'{SHOTS}/lab_findings_import.png', full_page=True)
        await pg.click('#lfadd'); await pg.wait_for_timeout(500)
        info = await J("Store.all('info', '*').filter(r => r.category === 'MAHAM Lab findings').map(r => [r.title, r.value])")
        c('added as info items with where they came from', len(info) == 2 and 'Plan one more doctor' in info[0][1] + info[1][1] and all('MAHAM Lab · ER visits' in x[1] for x in info), info)
        # the same file again: nothing twice
        await s.go('#/admin/data', 600); await pg.set_input_files('#labfind', p); await pg.wait_for_selector('#lfadd')
        c('loading the same file again marks them "already added"', await pg.locator('[data-lf]:disabled').count() == 2)
        # as To Dos for someone
        FILE['at'] = '2026-11-07T09:00:00.000Z'; json.dump(FILE, open(p, 'w'))
        await s.go('#/admin/data', 600); await pg.set_input_files('#labfind', p); await pg.wait_for_selector('#lfadd')
        await pg.select_option('#lff [name=as]', 'todo'); await pg.select_option('#lff [name=who]', 'yousef'); await pg.click('#lfadd'); await pg.wait_for_timeout(500)
        td = await J("Store.all('todo', '*').filter(r => r.labRef && r.analyst === 'yousef').map(r => [r.task, r.status, r.duration])")
        c('added as To Dos for the chosen person', len(td) == 2 and td[0][1] == 'In Progress' and td[0][2] == 7, td)
        # not a findings file
        bad = os.path.join(tempfile.mkdtemp(), 'x.json'); json.dump({'kind': 'other'}, open(bad, 'w'))
        await s.go('#/admin/data', 600); await pg.set_input_files('#labfind', bad); await pg.wait_for_timeout(300)
        c('another kind of file is refused', await pg.locator('#lfadd').count() == 0)
        c.done(s)

run(main())
