"""Daily backups in the shared folder, restore by the super admin, only the last 30 kept."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('backups')
    async with app_session() as s:
        pg = s.page
        await pg.wait_for_timeout(3800)
        names = await s.js("Store.listBackups().then(l => l.map(b => b.name))"); today = await s.js('U.todayStr()')
        c("today's backup is made automatically", f"backup-{today}.zip" in names, names)
        # some work (given by the manager), then a backup
        await s.sign_in_as('apps-mgr')
        await s.js("Store.saveMany([{c: 'todo', id: 'td-keep', task: 'Original task', analyst: 'yousef', assigned: U.todayStr(), duration: 3, status: 'In Progress'}, {c: 'todo', id: 'td-del', task: 'Will be deleted', analyst: 'yousef', assigned: U.todayStr(), duration: 3, status: 'In Progress'}])")
        await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        await s.sign_in_as('adam'); await s.go('#/syscheck'); await pg.wait_for_timeout(500)
        await pg.click('#bknow'); await pg.wait_for_timeout(1200)
        c('"Back up now" works', 'Backup saved' in await pg.inner_text('#toasts'))
        # mistakes happen: the manager deletes a task and changes another; a new one is added after the backup
        await s.sign_in_as('apps-mgr')
        await s.js("Store.remove('td-del'); Store.save(Object.assign({}, Store.get('td-keep'), {task: 'Overwritten by mistake'})); Store.save({c: 'todo', id: 'td-new', task: 'Added after backup', analyst: 'yousef', assigned: U.todayStr(), duration: 1, status: 'In Progress'})")
        await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        c('(mistake made)', await s.js("!Store.get('td-del') && Store.get('td-keep').task === 'Overwritten by mistake'"))
        # only the super admin may restore
        await s.sign_in_as('yousef')
        err = await s.js("Store.restoreBackup('x').then(() => 'ok', e => e.message)")
        c('others cannot restore', 'super admin' in err, err)
        # super admin restores the manager's file from today's backup
        await s.sign_in_as('adam'); await s.go('#/syscheck'); await pg.wait_for_timeout(800)
        await pg.click(f'[data-bkrs="backup-{today}.zip"]'); await pg.wait_for_selector('[name=bkf]')
        for box in await pg.query_selector_all('[name=bkf]'):
            if await box.get_attribute('value') != 'apps-mgr.json': await box.uncheck()
        await pg.click('#modal [data-ok]'); await pg.wait_for_timeout(1500)
        c('deleted task is back', await s.js("!!Store.get('td-del')"))
        c('changed task is back to its backup version', await s.js("Store.get('td-keep').task") == 'Original task')
        c('task added after the backup is kept', await s.js("!!Store.get('td-new')"))
        c('restored records are accepted by the trust check', await s.js("Store.rejected.length") == 0, await s.js("JSON.stringify(Store.rejected)"))
        after = await s.js("Store.listBackups().then(l => l.map(b => b.name))")
        c('a safety backup was made first', any('before-restore' in n for n in after), after)
        # the manager's own PC sees the restored version too
        await s.sign_in_as('apps-mgr'); await s.js("Store.sync(true)")
        c("owner's PC picks up the restore", await s.js("Store.get('td-keep').task") == 'Original task' and await s.js("!!Store.get('td-del')"))
        await s.js("Store.save(Object.assign({}, Store.get('td-new'), {task: 'Still editable'}))"); await s.js("Store.flush()"); await s.js("Store.sync(true)")
        c('owner can keep working after a restore', await s.js("Store.get('td-new').task") == 'Still editable' and await s.js("Store.get('td-keep').task") == 'Original task')
        # only the last 30 daily backups are kept
        await s.sign_in_as('adam')
        await s.js("(async () => { const d = await Store.backupsDir(); for (let i = 1; i <= 35; i++) { const fh = await d.getFileHandle('backup-2025-01-' + String(i).padStart(2, '0') + '.zip', {create: true}); const w = await fh.createWritable(); await w.write('x'); await w.close(); } })()")
        await s.js("Store.makeBackup()"); await pg.wait_for_timeout(500)
        l = await s.js("Store.listBackups().then(l => l.filter(b => !b.tag).length)")
        c('only the last 30 daily backups kept', l == 30, l)
        await s.go('#/syscheck'); await pg.wait_for_timeout(800); await pg.screenshot(path=f'{SHOTS}/backups.png', full_page=True)
        c.done(s)
run(main())
