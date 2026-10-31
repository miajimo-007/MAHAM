"""PINs live in their own record (no false "tried to change people" flags), superseded old versions are not reported,
and the super admin can clear ignored changes (backup first, legacy PINs kept)."""
import json
from harness import app_session, Check, run
async def write_file(s, name, records):
    """add forged records to a person's file, the way a hand edit would (keeping what is already there)"""
    existing = await s.js(f"(async () => {{ try {{ const f = await (await Store.usersDir.getFileHandle({json.dumps(name)})).getFile(); return JSON.parse(await f.text()).records; }} catch (e) {{ return []; }} }})()")
    ids = {r['id'] for r in records}
    payload = json.dumps({'version': 1, 'kind': 'user', 'user': name[:-5], 'records': [r for r in existing if r['id'] not in ids] + records})
    await s.js(f"(async () => {{ const fh = await Store.usersDir.getFileHandle({json.dumps(name)}, {{create: true}}); const w = await fh.createWritable(); await w.write({json.dumps(payload)}); await w.close(); }})()")
async def main():
    c = Check('PINs and ignored-change clean-up')
    async with app_session() as s:
        pg = s.page
        # a legacy PIN for Layla, saved the old way (inside the people list)
        await s.sign_in_as('layla')
        await s.js("Store.save(Object.assign({}, Store.get('settings-team'), {members: Store.members().map(m => m.id === 'layla' ? Object.assign({}, m, {pin: 'legacyhash'}) : m)}))"); await s.js("Store.flush()")
        # Yousef sets a PIN the new way
        await s.sign_in_as('yousef')
        await s.js("Store.save({id: 'userpin-yousef', c: 'userpin', member: 'yousef', pin: 'h1'})"); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        await s.sign_in_as('adam'); await s.js("Store.sync(true)"); await pg.wait_for_timeout(300)
        c("Yousef's PIN is read from its own record", await s.js("Store.pinOf('yousef')") == 'h1')
        c("legacy PIN still works", await s.js("Store.pinOf('layla')") == 'legacyhash')
        c('setting a PIN is not reported as an ignored change', await s.js("Store.rejected.length") == 0, await s.js("JSON.stringify(Store.rejected)"))
        # the manager gives Layla a To Do; an older version in Layla's file (superseded) must not be reported
        await s.sign_in_as('apps-mgr')
        await s.js("Store.save({id: 'td-p1', c: 'todo', task: 'Check orders', analyst: 'layla', team: 'apps', assigned: U.todayStr(), duration: 2, status: 'In Progress'})"); await s.js("Store.flush()")
        await s.sign_in_as('adam'); await s.js("Store.sync(true)"); await pg.wait_for_timeout(300)
        mts = await s.js("Store.get('td-p1')._ts")
        await write_file(s, 'layla.json', [
            {'id': 'td-p1', 'c': 'todo', 'task': 'Check orders', 'analyst': 'layla', 'team': 'apps', 'status': 'In Progress', '_ts': mts - 1000, '_by': 'layla'},   # older than the manager's
            {'id': 'userpin-yousef', 'c': 'userpin', 'member': 'yousef', 'pin': 'forged', '_ts': mts + 1000, '_by': 'layla'},   # sets someone else's PIN
        ])
        await s.js("Store.sync(true)"); await pg.wait_for_timeout(300)
        rej = await s.js("Store.rejected.map(x => x.id)")
        c('superseded old To Do version not reported', 'td-p1' not in rej, rej)
        c("forged PIN for someone else ignored and reported", await s.js("Store.pinOf('yousef')") == 'h1' and rej == ['userpin-yousef'], rej)
        t = await s.go('#/syscheck'); c('System Check offers "Clear ignored changes"', 'Clear ignored changes' in t)
        nb = len(await s.js("Store.listBackups()"))
        await pg.click('#sc_clear'); await pg.click('[data-yes]'); await pg.wait_for_timeout(1500)
        c('ignored changes cleared', await s.js("Store.rejected.length") == 0)
        recs = await s.js("(async () => JSON.parse(await (await (await Store.usersDir.getFileHandle('layla.json')).getFile()).text()).records.map(r => r.id))()")
        c("forged record removed from Layla's file", 'userpin-yousef' not in recs, recs)
        c('a backup was made first', len(await s.js("Store.listBackups()")) > nb)
        c("legacy PIN moved to its own record", await s.js("(Store.get('userpin-layla') || {}).pin") == 'legacyhash')
        c("Yousef's PIN unchanged", await s.js("Store.pinOf('yousef')") == 'h1')
        # an admin PIN reset still works
        await s.js("Store.save({id: 'userpin-yousef', c: 'userpin', member: 'yousef', pin: ''})"); await s.js("Store.flush()"); await s.js("Store.sync(true)")
        c('admin PIN reset works', await s.js("Store.pinOf('yousef')") == '')
        c.done(s)
run(main())
