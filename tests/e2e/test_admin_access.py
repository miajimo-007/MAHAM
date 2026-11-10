"""9 Nov: Admin access follows the new Admin layout — one area per section, a level per area (view / edit), reach
(own team / chosen teams / all teams). Older Admins are read as the new areas (edit, same reach). View = read-only
screens; the trust check enforces areas, levels and teams for every settings record (and each part of shared ones),
also when files are edited by hand. Admins see only their tabs, sub-tabs and search results; templates keep working."""
import json
from harness import app_session, Check, run

async def write_file(s, name, records):
    existing = await s.js(f"(async () => {{ try {{ const f = await (await Store.usersDir.getFileHandle({json.dumps(name)})).getFile(); return JSON.parse(await f.text()).records; }} catch (e) {{ return []; }} }})()")
    ids = {r['id'] for r in records}
    payload = json.dumps({'version': 1, 'kind': 'user', 'user': name[:-5], 'records': [r for r in existing if r['id'] not in ids] + records})
    await s.js(f"(async () => {{ const fh = await Store.usersDir.getFileHandle({json.dumps(name)}, {{create: true}}); const w = await fh.createWritable(); await w.write({json.dumps(payload)}); await w.close(); }})()")

def give(who, o):
    return f"saveMembersAll(Store.members().map(m => m.id === '{who}' ? Object.assign({{}}, m, {json.dumps(o)}) : m))"

async def main():
    c = Check('Admin access')
    async with app_session() as s:
        pg = s.page; J = s.js
        lis_mgr = await J("(Store.members().find(m => m.team === 'lab' && m.role === 'manager') || {}).id")
        teams = await J("Store.teams().map(t => t.id)"); other = [t for t in teams if t not in ('apps', 'lab')][0]
        # ---------- older Admins: read as the new areas, all at edit level, same reach ----------
        mig = await J("(() => { const a = AdminRole.areasOf({ admin: true, adminAreas: ['workflows', 'scoring', 'hdmonths', 'lists', 'people', 'activity', 'timerules', 'feedback'] }); return Object.fromEntries(a); })()")
        want = {'todo-workflows', 'project-stages', 'task-workflows', 'workitem-fields', 'automation', 'followups', 'scoring-rules', 'adjustments', 'score-months', 'lists', 'task-sets', 'people', 'acting-leave', 'logs', 'timerules', 'holidays', 'feedback'}
        c('old areas → new areas (workflows → To Do, stages, tasks, fields, automation, follow-ups; scoring → rules + adjustments …)', set(mig) == want, sorted(set(mig) ^ want))
        c('…all at edit level (logs: view)', all(v == 'edit' for k, v in mig.items() if k != 'logs') and mig['logs'] == 'view', mig)
        # ---------- Layla: scoring rules VIEW, task workflows EDIT, own team ----------
        await J(give('layla', {'admin': True, 'adminV': 2, 'adminAreas': ['scoring-rules', 'task-workflows'], 'adminLevels': {'scoring-rules': 'view'}, 'adminReach': 'team'})); await J("Store.flush()")
        await s.sign_in_as('layla', 'analyst')
        t = await s.go('#/admin', 600)
        tabs = await J("[...document.querySelectorAll('.adm-main .tab')].map(a => a.textContent)")
        c('she sees only her tabs: Home, Work & workflows, Scoring', tabs == ['Home', 'Work & workflows', 'Scoring'], tabs)
        await s.go('#/admin/scoring/rules', 700)
        subs = await J("[...document.querySelectorAll('.adm-sub .tab')].map(a => a.textContent)")
        c('…and only her sub-tabs (Rules, Printable rules)', subs == ['Rules', 'Printable rules'], subs)
        c('view level: read-only (note, no Save buttons, inputs disabled)', await pg.locator('.adm-viewnote').count() >= 1 and await pg.locator('#main #savescore, #main #spsave, #main button:has-text("Save")').count() == 0 and await J("[...document.querySelectorAll('#main .adm-part input:not([type=search])')].every(i => i.disabled)"))
        before = await J("JSON.stringify((Store.get('settings-scoring-apps') || {}).scoring || null)")
        await J("Store.save({ id: 'settings-scoring-apps', c: 'settings', scoring: Object.assign({}, Config.DEFAULT_SCORING, { closingTargetHrs: 2 }) })"); await pg.wait_for_timeout(200)
        c('view level: a save is refused', await J("JSON.stringify((Store.get('settings-scoring-apps') || {}).scoring || null)") == before)
        await s.go('#/admin/work/tasks', 700)
        c('edit level: Project tasks has its Save', await pg.locator('#tfusesave').count() == 1 and await pg.locator('.adm-viewnote').count() == 0)
        await J("Store.save(Object.assign({ id: 'settings-taskflow-apps', c: 'settings' }, TaskFlow.teamRec('apps'), { use: '' }))"); await J("Store.flush()")
        c('edit level: her save for her team goes through', await J("Store.get('settings-taskflow-apps') && Store.get('settings-taskflow-apps')._by") == 'layla')
        await J("Store.save({ id: 'settings-taskflow-lab', c: 'settings', use: 'x' })"); await pg.wait_for_timeout(200)
        c("…another team's is refused", not await J("Store.get('settings-taskflow-lab') && Store.get('settings-taskflow-lab').use === 'x'"))
        await J("Store.save(Object.assign({ id: 'settings-taskflow-apps', c: 'settings' }, TaskFlow.teamRec('apps'), { autos: [{ id: 'a1', on: true, do: [{ k: 'notify' }] }] }))"); await pg.wait_for_timeout(200)
        c('automation rules need the Automation area', not (await J("TaskFlow.teamRec('apps').autos || []")))
        # super admin only and others' areas: not there
        await s.go('#/home', 200); await s.go('#/admin/people/access', 500)
        c('Roles & access (super admin only) is not open to her', await J("location.hash") != '#/admin/people/access' and 'Permission matrix' not in await pg.inner_text('#main'))
        await pg.fill('#adsearch', 'holiday'); await pg.wait_for_timeout(200)
        c('search: nothing outside her areas (holidays)', 'Time rules' not in await pg.inner_text('#adresults'))
        await pg.fill('#adsearch', 'workflow'); await pg.wait_for_timeout(200)
        hits = await J("[...document.querySelectorAll('#adresults a')].map(a => a.getAttribute('href'))")
        c('search: her areas are found (Project tasks)', '#/admin/work/tasks' in hits and not any('todo' in x for x in hits), hits)
        # ---------- Yousef: chosen teams (APPS + LAB) ----------
        await s.sign_in_as('adam')
        await J(give('yousef', {'admin': True, 'adminV': 2, 'adminAreas': ['timerules', 'lists'], 'adminReach': 'teams', 'adminTeams': ['apps', 'lab']})); await J("Store.flush()")
        c('chosen teams: APPS and LAB yes, the others no', await J(f"AdminRole.can('yousef', 'timerules', 'apps') && AdminRole.can('yousef', 'timerules', 'lab') && !AdminRole.can('yousef', 'timerules', '{other}') && !AdminRole.can('yousef', 'timerules', '*')"))
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/admin/work/time', 700)
        opts = await J("[...document.querySelectorAll('#trscope option')].map(o => o.value)")
        c('Time rules: only his two teams to pick', sorted(opts) == ['apps', 'lab'], opts)
        await J("Store.save({ id: 'settings-timerules-lab', c: 'settings', rules: { todo: { High: 1 } } })"); await J(f"Store.save({{ id: 'settings-timerules-{other}', c: 'settings', rules: {{ todo: {{ High: 1 }} }} }})"); await J("Store.flush()")
        c('…a save for LAB goes through, for another team it is refused', await J("!!Store.get('settings-timerules-lab')") and not await J(f"!!Store.get('settings-timerules-{other}')"))
        c('holidays need an Admin for all teams', not await J("AdminRole.can('yousef', 'holidays')"))
        # ---------- the trust check: every kind of settings record, by area, level and team ----------
        await s.sign_in_as('adam')
        ok = await J(f"""(() => {{ const base = Store.members(); const M = o => base.concat([Object.assign({{ id: 'adm1', name: 'A', role: 'analyst', team: 'apps', active: true, admin: true, adminV: 2, adminReach: 'team' }}, o)]);
          const T = (areas, rec, prev, o) => AdminRole.settingOk(Object.assign({{ c: 'settings' }}, rec), prev ? Object.assign({{ c: 'settings', id: rec.id }}, prev) : null, 'adm1', M(Object.assign({{ adminAreas: areas }}, o || {{}})));
          const lv = {{ id: 'settings-lists-apps', lists: {{ modules: ['A'], projectCategories: ['P'] }} }};
          return {{
            scoring: T(['scoring-rules'], {{ id: 'settings-scoring-apps', scoring: {{}} }}) && !T(['adjustments'], {{ id: 'settings-scoring-apps', scoring: {{}} }}),
            scoringView: !T(['scoring-rules'], {{ id: 'settings-scoring-apps', scoring: {{}} }}, null, {{ adminLevels: {{ 'scoring-rules': 'view' }} }}),
            otherTeam: !T(['scoring-rules'], {{ id: 'settings-scoring-lab', scoring: {{}} }}) && !T(['scoring-rules'], {{ id: 'settings-scoring', scoring: {{}} }}),
            autos: T(['automation'], {{ id: 'settings-taskflow-apps', autos: [1] }}, {{}}) && !T(['task-workflows'], {{ id: 'settings-taskflow-apps', autos: [1] }}, {{}}),
            scheme: T(['task-workflows'], {{ id: 'settings-taskflow-apps', use: 'w' }}, {{}}) && !T(['automation'], {{ id: 'settings-taskflow-apps', use: 'w' }}, {{}}),
            fields: T(['workitem-fields'], {{ id: 'settings-taskfields-apps', list: [1] }}) && !T(['task-workflows'], {{ id: 'settings-taskfields-apps', list: [1] }}),
            followups: T(['followups'], {{ id: 'settings-fuflow', parties: [1] }}, null, {{ adminReach: 'all' }}) && !T(['followups'], {{ id: 'settings-fuflow', parties: [1] }}),
            teamRules: !T(['teams'], {{ id: 'settings-teams', teams: [{{ id: 'apps', name: 'APPS', targets: {{ x: 1 }} }}] }}, {{ teams: [{{ id: 'apps', name: 'APPS' }}] }}, {{ adminReach: 'all' }}),
            teamNames: T(['teams'], {{ id: 'settings-teams', teams: [{{ id: 'apps', name: 'APPS 2' }}] }}, {{ teams: [{{ id: 'apps', name: 'APPS' }}] }}, {{ adminReach: 'all' }}) && !T(['teams'], {{ id: 'settings-teams', teams: [{{ id: 'apps', name: 'APPS 2' }}] }}, {{ teams: [{{ id: 'apps', name: 'APPS' }}] }}),
            minVersion: !T(['look'], {{ id: 'settings-features', minVersion: '9' }}, {{}}, {{ adminReach: 'all' }}),
            appName: T(['look'], {{ id: 'settings-features', appName: 'X' }}, {{}}) && !T(['lists'], {{ id: 'settings-features', appName: 'X' }}, {{}}),
            customHd: T(['score-months'], {{ id: 'settings-custom', hdLocked: [1] }}, {{}}) && !T(['look'], {{ id: 'settings-custom', hdLocked: [1] }}, {{}}),
            customLook: T(['look'], {{ id: 'settings-custom', menu: [1] }}, {{}}) && !T(['score-months'], {{ id: 'settings-custom', menu: [1] }}, {{}}),
            listsProject: T(['project-stages'], lv, {{ lists: {{ modules: ['A'] }} }}) && !T(['lists'], lv, {{ lists: {{ modules: ['A'] }} }}),
            listsOther: T(['lists'], lv, {{ lists: {{ projectCategories: ['P'] }} }}) && !T(['project-stages'], lv, {{ lists: {{ projectCategories: ['P'] }} }}),
            userDepts: T(['lists'], {{ id: 'settings-userdepts', list: [1] }}, null, {{ adminReach: 'all' }}) && !T(['lists'], {{ id: 'settings-userdepts', list: [1] }}),
            holidays: T(['holidays'], {{ id: 'settings-holidays', list: [1] }}, null, {{ adminReach: 'all' }}) && !T(['holidays'], {{ id: 'settings-holidays', list: [1] }}) && !T(['timerules'], {{ id: 'settings-holidays', list: [1] }}, null, {{ adminReach: 'all' }}),
            leaveOwn: T(['acting-leave'], {{ id: 'settings-delegations', list: [{{ from: 'apps-mgr', to: 'yousef', start: '2026-01-01' }}] }}, {{ list: [] }}),
            leaveOther: !T(['acting-leave'], {{ id: 'settings-delegations', list: [{{ from: '{lis_mgr}', to: 'yousef', start: '2026-01-01' }}] }}, {{ list: [] }}),
            todoFlows: T(['todo-workflows'], {{ id: 'settings-todoflows', list: [{{ id: 'f', team: 'apps' }}] }}, {{ list: [] }}) && !T(['todo-workflows'], {{ id: 'settings-todoflows', list: [{{ id: 'f', team: 'lab' }}] }}, {{ list: [] }}) && !T(['todo-workflows'], {{ id: 'settings-todoflows', list: [], types: ['X'] }}, {{ list: [] }}),
            stages: T(['project-stages'], {{ id: 'settings-workflows', list: [{{ id: 'f', team: 'apps' }}] }}, {{ list: [] }}) && !T(['todo-workflows'], {{ id: 'settings-workflows', list: [{{ id: 'f', team: 'apps' }}] }}, {{ list: [] }}),
            months: T(['score-months'], {{ id: 'settings-scoremonths-apps', x: 1 }}) && !T(['score-months'], {{ id: 'settings-scoremonths-lab', x: 1 }}),
            superOnly: ['settings-permtemplates', 'settings-admintemplates', 'settings-backup', 'settings-techignore'].every(id => !T(AdminRole.AREAS.map(a => a[0]), {{ id, x: 1 }}, null, {{ adminReach: 'all' }})),
            chosen: T(['timerules'], {{ id: 'settings-timerules-lab', rules: {{}} }}, null, {{ adminReach: 'teams', adminTeams: ['lab'] }}) && !T(['timerules'], {{ id: 'settings-timerules-apps', rules: {{}} }}, null, {{ adminReach: 'teams', adminTeams: ['lab'] }}),
          }}; }})()""")
        c('trust check per record: ' + ', '.join(k for k, v in ok.items() if v), all(ok.values()), [k for k, v in ok.items() if not v])
        # ---------- hand-edited file: Layla (scoring rules at view level) changes scoring ----------
        far = await J('Date.now() + 1000')
        await write_file(s, 'layla.json', [{'id': 'settings-scoring-apps', 'c': 'settings', 'scoring': dict(await J("Config.DEFAULT_SCORING"), closingTargetHrs=9), '_ts': far, '_by': 'layla'},
                                             {'id': 'settings-holidays', 'c': 'settings', 'list': [{'from': '2026-12-30', 'name': 'forged'}], '_ts': far + 1, '_by': 'layla'}])
        await J("Store.sync(true)"); await pg.wait_for_timeout(500)
        c('hand-edit at view level: ignored', ((await J("(Store.get('settings-scoring-apps') || {}).scoring")) or {}).get('closingTargetHrs') != 9)
        c('hand-edit outside her areas: ignored', not any(x.get('name') == 'forged' for x in await J("Store.holidays()")))
        rej = await J("Store.rejected.filter(r => r.by === 'layla').map(r => r.id)")
        c('…and listed in System Check', {'settings-scoring-apps', 'settings-holidays'} <= set(rej), rej)
        # ---------- her change is on the super admin's Home, logged ----------
        t = await s.go('#/admin/home/home', 700)
        c("super admin's Home: her change under Changes by Admins", 'Changes by Admins' in t and 'Layla' in t[t.index('Changes by Admins'):])
        # ---------- templates: new (levels, chosen teams) and old ones ----------
        await J("AdminUI.saveTemplate('Viewer', { v: 2, areas: ['logs', 'scoring-rules'], levels: { 'scoring-rules': 'view' }, reach: 'teams', teams: ['lab'] })"); await J("Store.flush()")
        tp = await J("(() => { const t = AdminRole.templates().find(x => x.name === 'Viewer'); return { a: Object.fromEntries(AdminRole.areasOf(t)), r: AdminRole.reachOf(t), t: t.teams }; })()")
        c('a template keeps levels and chosen teams', tp == {'a': {'logs': 'view', 'scoring-rules': 'view'}, 'r': 'teams', 't': ['lab']}, tp)
        c('an old template is read as the new areas', await J("[...AdminRole.areasOf({ areas: ['hdmonths'], reach: 'team' }).keys()].join()") == 'score-months')
        await s.go('#/adminperson/nora', 600); await pg.check('#ar-on'); await pg.select_option('#ar-tpl', label='Viewer'); await pg.wait_for_timeout(100)
        c('applying it in the editor ticks the areas, levels and teams', await J("document.querySelector('[data-area=\"scoring-rules\"]').checked && document.querySelector('[data-lv=\"scoring-rules\"]').value === 'view' && document.querySelector('#ar-reach').value === 'teams' && document.querySelector('[data-arteam=\"lab\"]').checked"))
        await pg.click('#ar-save'); await J("Store.flush()"); await pg.wait_for_timeout(300)
        m = await J("Store.member('nora')")
        c('saved: areas, view level, chosen teams', m.get('adminV') == 2 and sorted(m.get('adminAreas')) == ['logs', 'scoring-rules'] and m.get('adminLevels') == {'scoring-rules': 'view'} and m.get('adminReach') == 'teams' and m.get('adminTeams') == ['lab'], m)
        await J(give('nora', {'adminAreas': ['teams'], 'adminReach': 'team'}))
        await s.go('#/adminperson/nora', 600); await pg.click('#ar-save'); await pg.wait_for_timeout(200)
        c('the editor refuses Teams & departments without "All teams"', 'All teams' in await pg.inner_text('body'))
        c('no page errors', not s.errors, s.errors[:3])
    c.done(s)

run(main())
