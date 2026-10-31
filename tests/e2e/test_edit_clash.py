"""Two people edit the same record: different fields are combined; the same field asks which to keep."""
import json
from harness import app_session, Check, run, SHOTS
async def other_pc_saves(s, who, rec_id, patch):
    """simulate another person saving from their own PC (writes their file in the shared folder)"""
    rec = await s.js(f"Store.get('{rec_id}')")
    ts = await s.js("Date.now()"); new = dict(rec, **patch, _ts=ts, _by=who)
    name = who + '.json'
    existing = await s.js(f"(async () => {{ try {{ const f = await (await Store.usersDir.getFileHandle('{name}')).getFile(); return JSON.parse(await f.text()).records; }} catch (e) {{ return []; }} }})()")
    payload = json.dumps({'version': 1, 'kind': 'user', 'user': who, 'records': [r for r in existing if r['id'] != rec_id] + [new]})
    await s.js(f"(async () => {{ const fh = await Store.usersDir.getFileHandle('{name}', {{create: true}}); const w = await fh.createWritable(); await w.write({json.dumps(payload)}); await w.close(); }})()")
async def main():
    c = Check('edit clash')
    async with app_session() as s:
        pg = s.page
        await s.js("Store.save({c: 'todo', id: 'td-c', task: 'Fix order set', analyst: 'yousef', assigned: U.todayStr(), duration: 3, status: 'In Progress', instruction: '', comment: ''})"); await s.js("Store.flush()")
        await s.sign_in_as('yousef')
        # 1 — different fields: combined
        await s.js("UI.editRecord('todo', Store.get('td-c'))"); await pg.wait_for_selector('#recform'); await pg.wait_for_timeout(400)
        await other_pc_saves(s, 'apps-mgr', 'td-c', {'instruction': 'Check with pharmacy first'})
        await pg.fill('#recform [name=comment]', 'Started today'); await pg.click('[data-save]'); await pg.wait_for_selector('#recform', state='detached', timeout=10000); await pg.wait_for_timeout(200)
        r = await s.js("Store.get('td-c')")
        c("different fields: both changes kept", r['instruction'] == 'Check with pharmacy first' and r['comment'] == 'Started today', r)
        c('told that it was combined', 'combined with' in await pg.inner_text('#toasts'))
        # 2 — same field: asked, keep mine
        await s.js("UI.editRecord('todo', Store.get('td-c'))"); await pg.wait_for_selector('#recform'); await pg.wait_for_timeout(400)
        await other_pc_saves(s, 'apps-mgr', 'td-c', {'comment': "Manager's note"})
        await pg.fill('#recform [name=comment]', 'Halfway done'); await pg.click('[data-save]'); await pg.wait_for_selector('[data-mine]', timeout=10000)
        t = await pg.inner_text('#modal') if await pg.locator('#modal').count() else ''
        c('same field: asks which version to keep', 'changed this while you were editing' in t and "Manager's note" in t and 'Halfway done' in t, t[:200])
        await pg.screenshot(path=f'{SHOTS}/edit_clash.png')
        await pg.click('[data-mine]'); await pg.wait_for_timeout(400)
        c('"Keep mine" saves my version', await s.js("Store.get('td-c').comment") == 'Halfway done')
        # 3 — same field: keep theirs
        await s.js("UI.editRecord('todo', Store.get('td-c'))"); await pg.wait_for_selector('#recform'); await pg.wait_for_timeout(400)
        await other_pc_saves(s, 'apps-mgr', 'td-c', {'comment': 'Please call me'})
        await pg.fill('#recform [name=comment]', 'Almost done'); await pg.click('[data-save]'); await pg.wait_for_selector('[data-theirs]', timeout=10000)
        await pg.click('[data-theirs]'); await pg.wait_for_timeout(400)
        c('"Keep theirs" keeps the other version', await s.js("Store.get('td-c').comment") == 'Please call me')
        # 4 — nobody else changed it: plain save
        await s.js("UI.editRecord('todo', Store.get('td-c'))"); await pg.wait_for_selector('#recform'); await pg.wait_for_timeout(400)

        await pg.fill('#recform [name=comment]', 'Done soon'); await pg.click('[data-save]'); await pg.wait_for_selector('#recform', state='detached', timeout=10000); await pg.wait_for_timeout(200)
        c('no clash: saves normally', await s.js("Store.get('td-c').comment") == 'Done soon' and await pg.locator('#modal').count() == 0, [await s.js("JSON.stringify(Store.get('td-c'))"), (await pg.inner_text('#modal'))[:200] if await pg.locator('#modal').count() else 'no modal', await pg.inner_text('#toasts')])
        c.done(s)
run(main())
