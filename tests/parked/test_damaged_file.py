"""A data file that was damaged (edited by hand, saved by Notepad with a BOM, a missing comma) is read anyway as far as it
safely can be, the damaged original is kept in Backups before the repaired file is written, a file that cannot be read at
all is NEVER overwritten (the changes wait on this PC, with a red bar), and other people's damaged files are listed in
System Check with their whole records still used."""
import json
from harness import app_session, Check, run

async def raw(s, name):
    return await s.js(f"(async () => {{ try {{ return await (await (await Store.usersDir.getFileHandle({json.dumps(name)})).getFile()).text(); }} catch (e) {{ return null; }} }})()")
async def put(s, name, text):
    await s.js(f"(async () => {{ const fh = await Store.usersDir.getFileHandle({json.dumps(name)}, {{create: true}}); const w = await fh.createWritable(); await w.write({json.dumps(text)}); await w.close(); }})()")
async def backups(s):
    return await s.js("(async () => { const d = await Store.backupsDir(); const out = []; for await (const [n] of d.entries()) out.push(n); return out; })()")

async def main():
    c = Check('damaged data files')
    async with app_session() as s:
        pg = s.page
        await s.js("Store.saveMany([1,2,3].map(i => ({ c: 'shadow', id: 'dm' + i, analyst: 'adam', team: 'apps', date: U.todayStr(), subject: 'Mine ' + i, minutes: 10, taskType: 'Support', source: 'Phone' })))")
        await s.js("Store.flush()"); await pg.wait_for_timeout(400)
        good = await raw(s, 'adam.json'); n_good = len(json.loads(good)['records'])
        # 1) Notepad "UTF-8 with BOM"
        await put(s, 'adam.json', '﻿' + good); await s.js("Store.sync(true)"); await pg.wait_for_timeout(300)
        p = await s.js("Store.fileProblems['adam.json']")
        c('a BOM (Notepad "UTF-8 with BOM") is read without any problem', not p and await s.js("!!Store.get('dm2')"), p)
        await s.js("Store.save(Object.assign({}, Store.get('dm1'), { subject: 'Mine 1 changed' }))"); await s.js("Store.flush()"); await pg.wait_for_timeout(400)
        after = await raw(s, 'adam.json')
        c('…saving writes a clean file with everything in it', not after.startswith('﻿') and len(json.loads(after)['records']) == n_good, len(json.loads(after)['records']))
        # 2) a broken record in the middle (missing quote) — the others are rescued
        txt = after.replace('"subject":"Mine 2"', '"subject":"Mine 2')
        assert txt != after
        await put(s, 'adam.json', txt); await s.js("Store.sync(true)"); await pg.wait_for_timeout(300)
        p = await s.js("Store.fileProblems['adam.json']")
        c('a broken record: every whole record is still read', p and 'rescued' in p['fixed'] and await s.js("!!Store.get('dm1') && !!Store.get('dm3') && !!Store.get('settings-team')"), p)
        await s.js("Store.save(Object.assign({}, Store.get('dm3'), { subject: 'Mine 3 changed' }))"); await s.js("Store.flush()"); await pg.wait_for_timeout(400)
        fixed = await raw(s, 'adam.json')
        c('…saving writes the repaired file (valid again, the rescued records in it)', json.loads(fixed) and await s.js("!Store.lastError") and 'Mine 3 changed' in fixed)
        c('…and the damaged original is kept in Backups first', any('adam-damaged-' in b for b in await backups(s)), await backups(s))
        await s.go('#/home', 400)
        c('the red / warning bar tells you about your file', await pg.locator('#bnfile').count() == 1 and 'adam.json' in await pg.inner_text('#bnfile'))
        # 3) nothing can be read at all → never overwritten
        await put(s, 'adam.json', '{{ this is not json'); await s.js("Store.sync(true)"); await pg.wait_for_timeout(300)
        c('still working from the last good copy', await s.js("!!Store.get('settings-team') && !!Store.get('dm1')"))
        await s.js("Store.save(Object.assign({}, Store.get('dm3'), { subject: 'Changed while broken' }))"); await s.js("Store.flush()"); await pg.wait_for_timeout(400)
        c('a file that cannot be read is NOT overwritten', await raw(s, 'adam.json') == '{{ this is not json')
        c('…the change waits on this PC and the error says why', await s.js("Store.dirty && /cannot be read/.test(Store.lastError)"), await s.js("Store.lastError"))
        await s.go('#/about'); await s.go('#/home', 400)
        c('…the red bar says the file cannot be read', 'cannot be read' in (await pg.inner_text('#bnfile') if await pg.locator('#bnfile').count() else ''))
        # put the good file back: the waiting change is saved
        await put(s, 'adam.json', after); await s.js("Store.sync(true)"); await pg.wait_for_timeout(200); await s.js("Store.flush()"); await pg.wait_for_timeout(400)
        c('once the file is good again, the waiting change is saved', not await s.js("Store.dirty") and 'Changed while broken' in await raw(s, 'adam.json'))
        # 4) someone else's damaged file
        await s.sign_in_as('yousef', 'analyst')
        await s.js("Store.saveMany([1,2].map(i => ({ c: 'shadow', id: 'am' + i, analyst: 'yousef', team: 'apps', date: U.todayStr(), subject: 'Yousef ' + i, minutes: 10, taskType: 'Support', source: 'Phone' })))")
        await s.js("Store.flush()"); await pg.wait_for_timeout(400)
        await s.sign_in_as('adam')
        a = await raw(s, 'yousef.json'); await put(s, 'yousef.json', a.replace('"subject":"Yousef 1"', '"subject":"Yousef 1",,')); await s.js("Store.sync(true)"); await pg.wait_for_timeout(300)
        c("someone else's damaged file: their whole records are still used", await s.js("!!Store.get('am2')"))
        t = await s.go('#/syscheck', 600)
        c('System Check lists the damaged file', 'yousef.json' in t and ('damaged' in t or 'cannot be read' in t))
        c.done(s)

run(main())
