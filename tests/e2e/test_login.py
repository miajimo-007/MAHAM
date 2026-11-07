"""7 Nov: the login page — employee ID + PIN, existing PINs keep working (and are stored the strong way after the first
sign-in), first sign-in chooses a PIN, wrong PINs lock for 15 minutes, signed in until "Sign out", and only the super
admin can switch person. Employee IDs in Admin → People (typed, or filled from the IT directory)."""
from harness import app_session, Check, run, SHOTS, sign_in_page

async def main():
    c = Check('login')
    async with app_session() as s:
        pg = s.page; J = s.js
        c('first sign-in chose a PIN, stored the strong way', (await J("App.pinFor('adam')")).startswith('p2$'))
        # stays signed in: open the app again → straight in, no login page
        await pg.reload(); await pg.wait_for_timeout(1500)
        if await pg.locator('#grant').count(): await pg.click('#grant'); await pg.wait_for_timeout(1200)
        c('opening the app again: still signed in', await pg.locator('#main').count() == 1 and await pg.locator('#loginf').count() == 0)
        # employee IDs in Admin → People
        await J("App.mode = 'admin'; App.launch()"); await s.go('#/admin/people', 600)
        c('Employee ID column in People', await pg.locator('#adminrows [data-k=empId]').count() >= 5)
        await pg.fill('#adminrows tr[data-id=yousef] [data-k=empId]', '4501'); await pg.fill('#adminrows tr[data-id=layla] [data-k=empId]', '4501')
        await pg.click('#savepeople'); await pg.wait_for_timeout(300)
        c('the same employee ID twice is refused', await J("!(Store.member('yousef').empId)"))
        await pg.fill('#adminrows tr[data-id=layla] [data-k=empId]', '04502'); await pg.click('#savepeople'); await pg.wait_for_timeout(500)
        c('employee IDs saved', await J("Store.member('yousef').empId === '4501' && Store.member('layla').empId === '04502'"))
        # IT directory → employee IDs
        await J("Store.save({ id: 'it-x1', c: 'itdir', name: Store.member('sara').name, bn: '7788', team: 'APPS' })"); await s.go('#/home', 200); await s.go('#/admin/people', 600)
        c('"fill from the IT directory" offered', await pg.locator('#empfill').count() == 1)
        await pg.click('#empfill'); await pg.click('#modal [data-yes]'); await pg.wait_for_timeout(500)
        c('employee ID filled from the badge number', await J("Store.member('sara').empId") == '7788')
        await pg.screenshot(path=f'{SHOTS}/login_people.png')
        # PINs: yousef a new-style PIN set by the admin; layla an older-style PIN
        await J("App.makePin('4321').then(p => Store.save({ id: 'userpin-yousef', c: 'userpin', member: 'yousef', pin: p }))")
        await J("App.hash('1111').then(p => Store.save({ id: 'userpin-layla', c: 'userpin', member: 'layla', pin: p }))"); await J("Store.flush()")
        # the super admin sees "Switch person" and "Sign out"
        await pg.click('#mebtn'); await pg.wait_for_selector('#m_out')
        c('super admin: Switch person + Sign out', await pg.locator('#m_switch').count() == 1)
        await pg.click('#m_out'); await pg.wait_for_selector('#loginf')
        c('sign out → the login page', await pg.locator('#lid').count() == 1 and await J("!App.me"))
        await pg.screenshot(path=f'{SHOTS}/login_page.png')
        await pg.reload(); await pg.wait_for_timeout(1500)
        if await pg.locator('#grant').count(): await pg.click('#grant'); await pg.wait_for_timeout(1200)
        c('after signing out, opening the app asks to sign in', await pg.locator('#loginf').count() == 1)
        # wrong things
        await pg.fill('#lid', '99999'); await pg.click('#lgo'); await pg.wait_for_timeout(300)
        c('unknown employee ID', 'not found' in await pg.inner_text('.login-err'))
        for i in range(4):
            await pg.fill('#lid', '4501'); await pg.fill('#lpin', '0000'); await pg.click('#lgo'); await pg.wait_for_selector('.login-err'); await pg.wait_for_timeout(150)
        c('wrong PIN: tries left shown', '1 try left' in await pg.inner_text('.login-err'))
        await pg.fill('#lpin', '0000'); await pg.click('#lgo'); await pg.wait_for_timeout(300)
        c('5 wrong PINs → locked for 15 minutes', 'locked' in await pg.inner_text('.login-err'))
        await pg.fill('#lpin', '4321'); await pg.click('#lgo'); await pg.wait_for_timeout(300)
        c('while locked, even the right PIN waits', 'try again in' in await pg.inner_text('.login-err'))
        await J("localStorage.removeItem('bct.lock.yousef')")
        # the right PIN by employee ID (leading zeros do not matter)
        await pg.fill('#lid', '4502'); await pg.fill('#lpin', '1111'); await pg.click('#lgo'); await pg.wait_for_selector('#main', timeout=15000)
        c('an older PIN still works (employee ID typed without the leading 0)', await J("App.me") == 'layla')
        c('…and is stored the strong way from now on', (await J("App.pinFor('layla')")).startswith('p2$') and await J("App.verifyPin('1111', App.pinFor('layla'))"))
        await pg.click('#mebtn'); await pg.wait_for_selector('#m_out')
        c('others: no Switch person, only their PIN and Sign out', await pg.locator('#m_switch').count() == 0 and await pg.locator('#m_pin').count() == 1)
        await J("App.chooseMe(true)"); await pg.wait_for_timeout(200); c('switching cannot be opened another way', await pg.locator('[data-me]').count() == 0)
        await J("UI.closeModal()")
        # change my PIN needs the current one
        await J("App.setPin()"); await pg.wait_for_selector('#pinf [name=c]')
        await pg.fill('#pinf [name=c]', '9999'); await pg.fill('#pinf [name=a]', '2468'); await pg.fill('#pinf [name=b]', '2468'); await pg.click('#modal [data-ok]'); await pg.wait_for_timeout(300)
        c('changing the PIN needs the current PIN', await J("App.verifyPin('1111', App.pinFor('layla'))"))
        await pg.fill('#pinf [name=c]', '1111'); await pg.click('#modal [data-ok]'); await pg.wait_for_timeout(400)
        c('PIN changed', await J("App.verifyPin('2468', App.pinFor('layla'))"))
        await J("App.signOut()"); await pg.wait_for_selector('#loginf')
        # a retired person cannot sign in
        await J("Store.member('nora') && (Store.member('nora').active = false)")
        await pg.fill('#lid', 'nora'); await pg.click('#lgo'); await pg.wait_for_timeout(300)
        c('a retired person cannot sign in', 'no longer active' in await pg.inner_text('.login-err'))
        # someone without an employee ID yet: user name; no PIN yet → chooses one
        await pg.fill('#lid', 'fahad'); await pg.click('#lgo'); await pg.wait_for_selector('#lnew')
        c('no PIN yet → choose one', 'Choose a PIN' in await pg.inner_text('.login-card'))
        await pg.fill('#lnew', '12'); await pg.fill('#lnew2', '12'); await pg.click('#lset'); await pg.wait_for_timeout(200)
        t = await pg.inner_text('.login-card'); c('a too-short PIN is refused', 'at least 4' in t.lower() and await J('App.me') != 'fahad', t)
        await pg.fill('#lnew', '5555'); await pg.fill('#lnew2', '5555'); await pg.click('#lset'); await pg.wait_for_selector('#main', timeout=15000)
        c('signed in and the PIN saved in their own file', await J("App.me") == 'fahad' and await J("App.verifyPin('5555', App.pinFor('fahad'))"))
        await J("App.signOut()"); await pg.wait_for_selector('#loginf'); await sign_in_page(pg, 'adam'); await pg.wait_for_selector('#main'); await J("App.mode = 'admin'; App.launch()")
        c('super admin signs back in', await J("App.me") == 'adam')
        # ---------- recovery code ----------
        t = await s.go('#/admin/home', 600); c('Admin home asks for a recovery code while there is none', 'Make a recovery code' in t)
        await pg.click('#mebtn'); await pg.wait_for_selector('#m_rc'); await pg.click('#m_rc'); await pg.wait_for_selector('#rcgo'); await pg.click('#rcgo'); await pg.wait_for_selector('#rccode')
        code = (await pg.inner_text('#rccode')).strip(); c('a recovery code is shown once (5 groups of 4)', len(code) == 24 and code.count('-') == 4, code)
        c('only a scrambled copy is kept', await J("(r => !!r.rc && r.rc.startsWith('p2$') && !JSON.stringify(r).includes('" + code.replace('-', '')[:8] + "'))(Store.get('userpin-adam'))"))
        await pg.screenshot(path=f'{SHOTS}/login_recovery_code.png')
        await pg.click('#rcgo'); await pg.wait_for_timeout(300)
        t = await s.go('#/home', 200); t = await s.go('#/admin/home', 600); c('…and the nudge goes away', 'Make a recovery code' not in t)
        await J("App.signOut()"); await pg.wait_for_selector('#lrec')
        await pg.click('#lrec'); await pg.wait_for_selector('#recf')
        await pg.fill('#lid', 'adam'); await pg.fill('#lcode', 'ABCD-EFGH-JKLM-NPQR-STUV'); await pg.fill('#lnew', '7777'); await pg.fill('#lnew2', '7777'); await pg.click('#lrgo'); await pg.wait_for_selector('.login-err')
        c('a wrong recovery code is refused (and counts as a wrong try)', 'not right' in await pg.inner_text('.login-err') and '4 tries left' in await pg.inner_text('.login-err'))
        await pg.screenshot(path=f'{SHOTS}/login_recover.png')
        await pg.fill('#lcode', code.lower().replace('-', ' ')); await pg.fill('#lnew', '7777'); await pg.fill('#lnew2', '7777'); await pg.click('#lrgo'); await pg.wait_for_selector('#main', timeout=15000)
        c('the right code (any case, spaces fine) sets a new PIN and signs in', await J("App.me") == 'adam' and await J("App.verifyPin('7777', App.pinFor('adam'))"))
        c('the code is used up', await J("!App.recoveryOf('adam')"))
        await J("App.signOut()"); await pg.wait_for_selector('#lrec'); await pg.click('#lrec'); await pg.wait_for_selector('#recf')
        await pg.fill('#lid', 'adam'); await pg.fill('#lcode', code); await pg.fill('#lnew', '8888'); await pg.fill('#lnew2', '8888'); await pg.click('#lrgo'); await pg.wait_for_selector('.login-err')
        c('the same code cannot be used twice', 'no recovery code' in await pg.inner_text('.login-err'))
        await pg.click('#lback'); await pg.wait_for_selector('#loginf'); await sign_in_page(pg, 'adam', '7777'); await pg.wait_for_selector('#main')
        await J("App.setMe('layla'); App.launch()"); await pg.click('#mebtn'); await pg.wait_for_selector('#m_out'); c('others have no recovery code button', await pg.locator('#m_rc').count() == 0)
        # ---------- 2026.11.07.3: sign out never writes a "null" file; one written by .2 is rescued and ignored ----------
        await J("App.setMe('adam'); App.mode = 'admin'; App.launch()"); await pg.wait_for_timeout(300)
        await J("Store.save({ c: 'mytask', id: 'mt-bye', owner: 'adam', title: 'Saved just before sign out', status: 'Open' }); Admin.flushUsage && Admin.flushUsage()")
        await J("App.signOut()"); await pg.wait_for_selector('#loginf'); await pg.wait_for_timeout(6500)
        files = await J("(async () => { const o = []; for await (const [n] of Store.usersDir.entries()) o.push(n); return o; })()")
        c('signing out right after a change writes no "null" file', not any(f.startswith('null') for f in files), files)
        mine = await J("Store.usersDir.getFileHandle('adam.json').then(h => h.getFile()).then(f => f.text())")
        c('…the change went to my own file', 'mt-bye' in mine)
        # a stray null.json like the one 2026.11.07.2 wrote: one newer record of mine + an old copy of settings
        await J("""(async () => { const own = JSON.parse(await (await (await Store.usersDir.getFileHandle('adam.json')).getFile()).text());
            const recs = (Array.isArray(own.records) ? own.records : Object.values(own.records)).slice(0, 50);
            recs.push({ c: 'mytask', id: 'mt-lost', owner: 'adam', title: 'Only in the stray file', status: 'Open', _ts: Date.now() + 5000, _by: 'adam' });
            const h = await Store.usersDir.getFileHandle('null.json', { create: true }); const w = await h.createWritable(); await w.write(JSON.stringify({ user: 'null', records: recs })); await w.close(); })()""")
        await sign_in_page(pg, 'adam', '7777'); await pg.wait_for_selector('#main'); await pg.wait_for_timeout(1500)
        c('my newer change from the stray file is put back in my file', await J("!!Store.get('mt-lost') && !!Store.own['mt-lost']"))
        await J("Store.flush()"); await pg.wait_for_timeout(800)
        c('…and saved there', 'mt-lost' in await J("Store.usersDir.getFileHandle('adam.json').then(h => h.getFile()).then(f => f.text())"))
        c('the stray file is never read (no ignored changes from it)', await J("!Store.sources['u:null.json'] && !(Store.rejected || []).some(x => /null/.test(x.file || ''))"))
        c.done(s)

run(main())
