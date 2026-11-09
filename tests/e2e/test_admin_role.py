"""The "Admin" role: the super admin gives areas (person card), the Admin sees only those (in their normal mode), changes
inside them go live; outside them (other team, other areas, admins, permissions) are refused at save and ignored when
hand-edited; a template; the acting manager inherits the areas; a scored Admin raising their own score waits for approval;
the super admin's Admin home lists what Admins changed."""
import json
from harness import app_session, Check, run, SHOTS

async def write_file(s, name, records):
    existing = await s.js(f"(async () => {{ try {{ const f = await (await Store.usersDir.getFileHandle({json.dumps(name)})).getFile(); return JSON.parse(await f.text()).records; }} catch (e) {{ return []; }} }})()")
    ids = {r['id'] for r in records}
    payload = json.dumps({'version': 1, 'kind': 'user', 'user': name[:-5], 'records': [r for r in existing if r['id'] not in ids] + records})
    await s.js(f"(async () => {{ const fh = await Store.usersDir.getFileHandle({json.dumps(name)}, {{create: true}}); const w = await fh.createWritable(); await w.write({json.dumps(payload)}); await w.close(); }})()")

async def main():
    c = Check('Admin role')
    async with app_session() as s:
        pg = s.page
        # ---------- the super admin gives Yousef some areas on his person card ----------
        await s.go('#/adminperson/yousef', 600)
        c('person card has the Admin role box', await pg.locator('#ar-on').count() == 1)
        await pg.check('#ar-on')
        for a in ['scoring', 'workflows', 'people']: await pg.check(f'[data-area="{a}"]')
        await pg.select_option('#ar-reach', 'team')
        await pg.click('#ar-savetpl'); await pg.wait_for_timeout(200)
        if await pg.locator('.modal input').count(): await pg.fill('.modal input', 'Manager-Admin'); await pg.click('.modal [data-ok], .modal [data-yes]')
        await pg.wait_for_timeout(300)
        await pg.click('#ar-save'); await s.js("Store.flush()"); await pg.wait_for_timeout(400)
        m = await s.js("Store.member('yousef')")
        c('saved: admin, 3 areas, own team', m.get('admin') and sorted(m.get('adminAreas') or []) == ['people', 'scoring', 'workflows'] and m.get('adminReach') == 'team', m)
        c('…and a template', any(t['name'] == 'Manager-Admin' for t in await s.js("AdminRole.templates()")))
        # ---------- Yousef: in analyst mode, an Admin menu with only his areas ----------
        await s.sign_in_as('yousef', 'analyst')
        c('Admin is in his menu', await pg.locator('nav a[href="#/admin"]').count() >= 1)
        t = await s.go('#/admin', 500)
        tabs = await s.js("[...document.querySelectorAll('.adm-tabs .tab')].map(a => a.textContent.trim())")
        c('only his tabs: Home, People, Workflows, Task workflows, Scoring', set(tabs) == {'Home', 'People', 'Workflows', 'Task workflows', 'Scoring'} and 'You are an Admin' in t, tabs)
        t = await s.go('#/admin/teams', 400); c('a tab he was not given opens his Home instead', 'Your Admin areas' in t)
        c('System Check is not open to him', not await s.js("App.pageAllowed('syscheck')"))
        # scoring for his team: goes live
        await s.js("Calc.score = () => ({ score: 100 - Calc.scoring().weights.todo })")   # stand-in: his score falls as the To Do weight rises
        await s.js("Calc.saveScoring('apps', Object.assign({}, Config.DEFAULT_SCORING, { weights: { todo: 40, helpdesk: 30, attendance: 15, quickwins: 10, shadow: 5 } }), new Date().getFullYear())")
        await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        await s.sign_in_as('adam'); await s.js("Store.sync(true)"); await pg.wait_for_timeout(400)
        c('his scoring change for his team is live (seen by others)', (await s.js("(Store.get('settings-scoring-apps') || {}).scoring"))['weights']['todo'] == 40)
        # conflict guard: a change that raises his own score waits for the super admin
        await s.sign_in_as('yousef', 'analyst')
        await s.js("Calc.score = () => ({ score: 100 - Calc.scoring().weights.todo })")
        await s.js("Calc.saveScoring('apps', Object.assign({}, Config.DEFAULT_SCORING, { weights: { todo: 20, helpdesk: 50, attendance: 15, quickwins: 10, shadow: 5 } }), new Date().getFullYear())")
        await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        c('raising his own score: not saved, sent for approval', (await s.js("(Store.get('settings-scoring-apps') || {}).scoring"))['weights']['todo'] == 40 and len(await s.js("AdminUI.asks()")) == 1)
        # outside his reach: refused at save
        before = await s.js("JSON.stringify(Store.get('settings-scoring-lab') || null)")
        await s.js("Store.save({ id: 'settings-scoring-lab', c: 'settings', scoring: Object.assign({}, Config.DEFAULT_SCORING, { closingTargetHrs: 1 }) })"); await pg.wait_for_timeout(200)
        c("another team's scoring is refused", await s.js("JSON.stringify(Store.get('settings-scoring-lab') || null)") == before)
        await s.js("Store.save(Object.assign({}, Store.get('settings-holidays') || { id: 'settings-holidays', c: 'settings' }, { list: [{ from: '2026-12-01', name: 'x' }] }))"); await pg.wait_for_timeout(200)
        c('an area he does not have (holidays) is refused', not any(h.get('name') == 'x' for h in await s.js("Store.holidays()")))
        # people (limited): add someone to his team
        t = await s.go('#/admin/people', 500)
        c('People shows plain people of his team; the manager and super admin are not editable', 'managed by the super admin' in t)
        await pg.click('#pladd'); await pg.fill('.modal [name=name]', 'Nora New'); await pg.fill('.modal [name=short]', 'Nora'); await pg.click('.modal [data-ok]')
        await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        await s.js("Store.save(Object.assign({}, Store.get('settings-team'), { members: Store.members().map(x => x.id === 'apps-mgr' ? Object.assign({}, x, { name: 'Changed' }) : x) }))"); await pg.wait_for_timeout(200)
        # workflows: one for his team
        await s.js("Store.save(Object.assign({ id: 'settings-todoflows', c: 'settings', list: [], types: [] }, TodoFlow.set(), { list: (TodoFlow.set().list || []).concat([{ id: 'tfw-yousef', name: 'APPS check', team: 'apps', types: [], steps: [{ name: 'Check', who: 'pick', days: 1 }] }]) }))")
        await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        await s.sign_in_as('adam'); await s.js("Store.sync(true)"); await pg.wait_for_timeout(400)
        c('the new person is in People (seen by others)', await s.js("Store.members().some(m => m.name === 'Nora New' && m.team === 'apps' && m.role === 'analyst')"))
        c("…but the manager's name was not changed", await s.js("Store.member('apps-mgr').name") != 'Changed')
        c('his workflow for his team is live', await s.js("(TodoFlow.set().list || []).some(w => w.id === 'tfw-yousef')"))
        # ---------- hand-edited files: outside his areas → ignored ----------
        far = await s.js('Date.now() + 1000'); team = await s.js("Store.get('settings-team')")
        forged = json.loads(json.dumps(team)); [x.update({'superAdmin': True}) for x in forged['members'] if x['id'] == 'yousef']; forged.update({'_ts': far, '_by': 'yousef'})
        forged2 = json.loads(json.dumps(team)); [x.update({'adminAreas': ['scoring', 'workflows', 'people', 'teams'], 'adminReach': 'all'}) for x in forged2['members'] if x['id'] == 'yousef']; forged2.update({'_ts': far + 1, '_by': 'yousef'})
        flows = await s.js("TodoFlow.set()")
        await write_file(s, 'yousef.json', [forged, forged2,
            {'id': 'settings-scoring-lab', 'c': 'settings', 'scoring': {'closingTargetHrs': 1}, '_ts': far + 2, '_by': 'yousef'},
            dict(flows, list=(flows.get('list') or []) + [{'id': 'tfw-lab', 'name': 'LAB', 'team': 'lab', 'types': [], 'steps': []}], _ts=far + 3, _by='yousef'),
            {'id': 'settings-scoring-apps', 'c': 'settings', 'scoring': dict(await s.js("Config.DEFAULT_SCORING"), closingTargetHrs=7), '_ts': far + 4, '_by': 'yousef'}])
        await s.js("Store.sync(true)"); await pg.wait_for_timeout(500)
        c('hand-edit: making himself super admin ignored', not await s.js("Store.isSuper('yousef')"))
        c('hand-edit: widening his own areas ignored', sorted(await s.js("Store.member('yousef').adminAreas")) == ['people', 'scoring', 'workflows'])
        c("hand-edit: another team's scoring ignored", await s.js("Store.get('settings-scoring-lab')") is None or (await s.js("Store.get('settings-scoring-lab')")).get('_by') != 'yousef')
        c("hand-edit: another team's workflow ignored", not await s.js("(TodoFlow.set().list || []).some(w => w.id === 'tfw-lab')"))
        c('hand-edit inside his area (his team scoring) accepted', (await s.js("Store.get('settings-scoring-apps').scoring"))['closingTargetHrs'] == 7)
        rej = await s.js("Store.rejected.map(r => r.id)")
        c('the refused ones are listed in System Check', {'settings-team', 'settings-scoring-lab', 'settings-todoflows'} <= set(rej), rej)
        # ---------- the super admin's Admin home ----------
        t = await s.go('#/admin', 600)
        c('Admin home: "Changes by Admins" with his changes', 'Changes by Admins' in t and 'Yousef' in t[t.index('Changes by Admins'):] if 'Changes by Admins' in t else False)
        c('…and his request to approve', 'waiting for you' in t)
        await pg.click('[data-askok]'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        c('approved: the change is live', (await s.js("Store.get('settings-scoring-apps').scoring"))['weights']['todo'] == 20)
        await pg.screenshot(path=f'{SHOTS}/admin_role_home.png', full_page=True)
        # ---------- acting manager: the manager's areas while acting ----------
        await s.js("saveMembersAll(Store.members().map(x => x.id === 'apps-mgr' ? Object.assign({}, x, { admin: true, adminAreas: ['scoring'], adminReach: 'team' }) : x))")
        await s.js("Store.save({ id: 'settings-delegations', c: 'settings', list: [{ id: 'dl1', from: 'apps-mgr', to: 'layla', start: U.todayStr(), end: U.addDays(U.todayStr(), 5) }] })"); await s.js("Store.flush()")
        await s.sign_in_as('layla', 'analyst')
        c('acting for the manager: Admin with the manager\'s area', await s.js("AdminRole.can('layla', 'scoring', 'apps')") and not await s.js("AdminRole.can('layla', 'people', 'apps')"))
        await s.sign_in_as('adam'); await s.js("Store.save({ id: 'settings-delegations', c: 'settings', list: [] })"); await s.js("Store.flush()")
        await s.sign_in_as('layla', 'analyst'); c('…and no longer once the delegation ends', not await s.js("AdminRole.any('layla')"))
        # ---------- People table: the ⛨ Admin button, and "Save people" keeps the role ----------
        await s.sign_in_as('adam'); await s.go('#/admin/people', 700)
        c('People table: ⛨ Admin button, highlighted for Yousef', 'primary' in (await pg.get_attribute('[data-adminrole="yousef"]', 'class') or '') and 'Scoring' in (await pg.get_attribute('[data-adminrole="yousef"]', 'title') or ''))
        await pg.click('[data-adminrole="nora"]'); await pg.wait_for_selector('.modal #ar-on')
        await pg.check('.modal #ar-on'); await pg.check('.modal [data-area="workflows"]'); await pg.click('.modal #ar-save'); await s.js("Store.flush()"); await pg.wait_for_timeout(400)
        c('…opens the role editor; saving it gives Nora the role', await s.js("(Store.member('nora').adminAreas || []).join()") == 'workflows')
        await s.go('#/admin/people', 600); await pg.click('#saveppl, [id^=savepeople], button:has-text("Save people")'); await pg.wait_for_timeout(400)
        if await pg.locator('.modal [data-yes], .modal [data-ok]').count(): await pg.click('.modal [data-yes], .modal [data-ok]')
        await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        c('"Save people" keeps the Admin roles', await s.js("!!(Store.member('nora').admin && Store.member('yousef').admin)"))
        t = await s.go('#/adminperson/yousef', 600)
        c('person card shows "⛨ Admin for APPS: …"', 'Admin for APPS' in t)
        # ---------- removing the role ----------
        await s.sign_in_as('adam'); await s.go('#/adminperson/yousef', 500); await pg.uncheck('#ar-on'); await pg.click('#ar-save'); await s.js("Store.flush()")
        await s.sign_in_as('yousef', 'analyst')
        c('role removed: no Admin menu', await pg.locator('nav a[href="#/admin"]').count() == 0 and not await s.js("App.pageAllowed('admin')"))
    c.done(s)

run(main())
