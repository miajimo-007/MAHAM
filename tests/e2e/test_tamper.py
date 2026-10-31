"""Hand-edited data files are ignored: fake super admin, self-approval, writing under another name, score locks."""
import json
from harness import app_session, Check, run, SHOTS
async def write_file(s, name, records):
    """add forged records to a person's file, the way a hand edit would (keeping what is already there)"""
    existing = await s.js(f"(async () => {{ try {{ const f = await (await Store.usersDir.getFileHandle({json.dumps(name)})).getFile(); return JSON.parse(await f.text()).records; }} catch (e) {{ return []; }} }})()")
    ids = {r['id'] for r in records}
    payload = json.dumps({'version': 1, 'kind': 'user', 'user': name[:-5], 'records': [r for r in existing if r['id'] not in ids] + records})
    await s.js(f"(async () => {{ const fh = await Store.usersDir.getFileHandle({json.dumps(name)}, {{create: true}}); const w = await fh.createWritable(); await w.write({json.dumps(payload)}); await w.close(); }})()")
async def main():
    c = Check('tamper protection')
    async with app_session() as s:
        pg = s.page
        # a genuine request from Yousef, waiting for the manager
        await s.sign_in_as('yousef')
        await s.js("Store.save({c: 'request', id: 'rq-x', type: 'other', title: 'New laptop', requester: 'yousef', team: 'apps', from: U.todayStr(), status: 'Pending manager'})")
        await s.js("Store.flush()"); await pg.wait_for_timeout(500)
        await s.sign_in_as('adam')
        team = await s.js("Store.get('settings-team')"); far = await s.js('Date.now() + 1000')   # a believable time, like a hand edit would use
        forged_team = json.loads(json.dumps(team)); [m.update({'superAdmin': True, 'role': 'director'}) for m in forged_team['members'] if m['id'] == 'yousef']
        forged_team.update({'_ts': far, '_by': 'yousef'})
        rq = await s.js("Store.get('rq-x')")
        await write_file(s, 'yousef.json', [
            dict(rq, status='Completed', mgrBy='yousef', _ts=far, _by='yousef'),                      # approves own request
            forged_team,                                                                             # makes himself super admin
            {'id': 'settings-holidays', 'c': 'settings', 'list': [{'from': '2026-01-01', 'name': 'fake'}], '_ts': far, '_by': 'yousef'},  # changes a setting
            {'id': 'snap-2026-01-yousef', 'c': 'scoresnap', 'score': 100, 'analyst': 'yousef', 'team': 'apps', '_ts': far, '_by': 'yousef'},  # locks a score
            {'id': 'td-future', 'c': 'todo', 'task': 'Frozen task', 'analyst': 'yousef', 'team': 'apps', 'status': 'In Progress', '_ts': 9_999_999_999_999, '_by': 'yousef'},  # far-future time stamp
        ])
        await write_file(s, 'layla.json', [dict(rq, status='Completed', mgrBy='apps-mgr', _ts=far, _by='apps-mgr')])  # writes as the manager
        await s.js("Store.sync(true)"); await pg.wait_for_timeout(500)
        c('fake super admin ignored', not await s.js("Store.isSuper('yousef')") and await s.js("Store.member('yousef').role") != 'director')
        c('fake setting ignored', not await s.js("Store.holidays().length"))
        c('self-approval ignored', await s.js("Store.get('rq-x').status") == 'Pending manager')
        c("record written under the manager's name in another file ignored", await s.js("Store.get('rq-x').mgrBy") is None)
        c('fake score lock ignored', not await s.js("Store.get('snap-2026-01-yousef')"))
        c('far-future time stamp ignored', not await s.js("Store.get('td-future')"))
        c("the real request is kept, still waiting", await s.js("(r => !!r && r.status === 'Pending manager' && !r.mgrBy)(Store.get('rq-x'))"))
        n = await s.js("Store.rejected.length"); c('all 6 forged changes listed', n == 6, await s.js("JSON.stringify(Store.rejected)"))
        t = await s.go('#/syscheck'); c('System Check shows "Ignored changes"', 'Ignored changes' in t and 'edited by hand' in t)
        await pg.screenshot(path=f'{SHOTS}/tamper_syscheck.png', full_page=True)
        # genuine actions still work
        await s.sign_in_as('apps-mgr'); await s.go('#/requests/approve'); await pg.click('[data-rqok="rq-x"]'); await pg.wait_for_selector('#rqd'); await pg.click('[data-ok]'); await pg.wait_for_timeout(300)
        c('real manager approval accepted', await s.js("Store.get('rq-x').status") == 'Completed')
        await s.sign_in_as('layla'); await s.js("App.setPin = App.setPin"); await s.js("Store.save(Object.assign({}, Store.get('settings-team'), {members: Store.members().map(m => m.id === 'layla' ? Object.assign({}, m, {pin: 'abc123'}) : m)}))"); await s.js("Store.flush()"); await pg.wait_for_timeout(400); await s.js("Store.sync(true)")
        c("a person's own PIN change still works", await s.js("Store.member('layla').pin") == 'abc123')
        await s.sign_in_as('adam'); await s.js("Store.save({id: 'settings-features', c: 'settings', orgLevels: false, note: 'x'})"); await s.js("Store.flush()"); await pg.wait_for_timeout(300); await s.js("Store.sync(true)")
        c('super admin settings still accepted', await s.js("Store.get('settings-features').note") == 'x')
        c.done(s)
run(main())
