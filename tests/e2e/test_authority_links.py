"""Info & Links (wrapping text, clickable links, Dashboards & Links with responsible) and the authority to change or
delete other people's items: owner, or someone given "Change or delete other people's items" (managers by default)."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('authority + info & links')
    async with app_session() as s:
        pg = s.page; J = s.js
        # a team leader in the team (no authority yet)
        await J("saveMembersAll(Store.members().concat([{ id: 'tl1', name: 'Team Leader One', short: 'TL One', role: 'teamleader', team: 'apps', active: true, scored: false }]))")
        await J("Store.save({ c: 'srs', id: 'srs-old', number: 'SRS-1042', owner: 'Old Owner', notes: 'from the old sheet', team: 'apps' })")
        await s.sign_in_as('yousef', 'analyst')
        await J("""Store.saveMany([
          { c: 'info', id: 'inf-1', category: 'Servers', title: 'Test server', value: 'Very long text that should wrap inside the box '.repeat(6) + ' see https://example.org/guide', url: 'intranet.example.org/test', team: 'apps' },
          { c: 'srs', id: 'lnk-1', name: 'OR utilisation dashboard', url: 'https://bi.example.org/or', responsible: 'Someone Outside', category: 'Dashboard', team: 'apps' },
          { c: 'central', id: 'cf-1', analyst: 'yousef', team: 'apps', date: U.todayStr(), subject: 'My follow-up', status: 'Under Review', type: 'Modification' },
          { c: 'oncall', id: 'oc-1', analyst: 'yousef', team: 'apps', date: U.todayStr(), time: '', status: '' }]); Store.flush()""")
        t = await s.go('#/info', 500)
        c('page is now Info & Dashboards', await J("document.querySelector('#ptitle').innerText") == 'Info & Dashboards' and 'Dashboards & Links' in t)
        c('info link is clickable (Open ↗)', await J("!!document.querySelector('.info-link a[href=\"https://intranet.example.org/test\"]')"))
        c('web address inside the text is clickable', await J("!!document.querySelector('.info-val a[href=\"https://example.org/guide\"]')"))
        c('long text wraps inside the box', await J("(() => { const el = document.querySelector('.info-val'); return getComputedStyle(el).whiteSpace === 'pre-wrap' && el.scrollWidth <= el.clientWidth + 1; })()"))
        c('dashboard name opens its link; responsible shown', await J("!!document.querySelector('a[href=\"https://bi.example.org/or\"]')") and 'Someone Outside' in t)
        c('old SRS entry shown as a link entry (number → name, owner → responsible)', 'SRS-1042' in t and 'Old Owner' in t)
        c('new entries remember who added them', await J("Store.get('inf-1').createdBy") == 'yousef')
        # another analyst: read-only, cannot change or delete
        await s.sign_in_as('layla', 'analyst'); await s.go('#/info', 400)
        await J("UI.editRecord('info', Store.get('inf-1'))"); await pg.wait_for_timeout(300)
        m = await pg.inner_text('.modal')
        c("another analyst sees it read-only, with who it belongs to", 'Belongs to' in m and 'Yousef' in m and await pg.locator('.modal [data-del]').count() == 0)
        await J("UI.closeModal()")
        for coll, rid, label in [('info', 'inf-1', 'info item'), ('srs', 'lnk-1', 'dashboard link'), ('central', 'cf-1', 'follow-up'), ('oncall', 'oc-1', 'on-call')]:
            before = await J(f"JSON.stringify(Store.get('{rid}'))")
            await J(f"Store.save(Object.assign({{}}, Store.get('{rid}'), {{ notes: 'changed by layla', subject: 'changed', title: 'changed', name: 'changed' }}))")
            await J(f"Store.save(Object.assign({{}}, Store.get('{rid}'), {{ _del: true }}))")
            c(f"analyst cannot change or delete someone else's {label}", await J(f"JSON.stringify(Store.get('{rid}'))") == before)
        await J("Store.save({ c: 'central', analyst: 'yousef', team: 'apps', date: U.todayStr(), subject: 'for yousef', status: 'Under Review', type: 'Modification' })")
        c("analyst cannot add a follow-up for someone else", not await J("Store.all('central').some(r => r.subject === 'for yousef')"))
        # team leader: blocked until the admin gives the authority
        await s.sign_in_as('tl1', 'analyst')
        await J("Store.save(Object.assign({}, Store.get('inf-1'), { title: 'TL edit' }))")
        c('team leader without the authority: blocked', await J("Store.get('inf-1').title") == 'Test server')
        await s.sign_in_as('adam', 'admin')
        await J("saveMembersAll(Store.members().map(m => m.id === 'tl1' ? Object.assign({}, m, { perms: Object.assign({}, m.perms, { editOthers: true }) }) : m))")
        c('permission listed in Admin → Permissions', "other people's items" in (await s.go('#/admin/permissions', 600)).lower())
        await s.sign_in_as('tl1', 'analyst')
        await J("Store.save(Object.assign({}, Store.get('inf-1'), { title: 'TL edit' }))")
        c('team leader given the authority: can change it', await J("Store.get('inf-1').title") == 'TL edit')
        # manager by default
        await s.sign_in_as('apps-mgr')
        await J("Store.save(Object.assign({}, Store.get('cf-1'), { subject: 'Manager edit' }))")
        c("manager can change an analyst's follow-up", await J("Store.get('cf-1').subject") == 'Manager edit')
        # the owner can still change their own
        await s.sign_in_as('yousef', 'analyst')
        await J("Store.save(Object.assign({}, Store.get('lnk-1'), { name: 'OR dashboard v2' }))")
        c('owner can change their own entry', await J("Store.get('lnk-1').name") == 'OR dashboard v2')
        # files read on another PC: a hand-made change by another analyst is ignored
        await J("(async () => { const fh = await Store.usersDir.getFileHandle('nora.json', { create: true }); const w = await fh.createWritable(); await w.write(JSON.stringify({ version: 1, kind: 'user', user: 'nora', records: [Object.assign({}, Store.get('lnk-1'), { name: 'Hacked', _by: 'nora', _ts: Date.now() + 1000 })] })); await w.close(); await Store.sync(true); })()")
        c("a change by someone without authority is ignored when files are read (listed in System Check)", await J("Store.get('lnk-1').name") == 'OR dashboard v2' and await J("Store.rejected.some(x => x.id === 'lnk-1' && /belongs to/i.test(x.why))"))
        await s.go('#/info', 400); await pg.screenshot(path=f'{SHOTS}/info_links.png', full_page=True)
        c.done(s)
run(main())
