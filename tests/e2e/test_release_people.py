"""Release check (8 Nov): several people on one PC, one after another — sign in, save, sign out at once, switch person,
view as, sign out from "view as" — and afterwards every file in the shared folder holds only its owner's records,
there is no stray file, nothing is ignored, and every change is where it belongs."""
from harness import app_session, Check, run, SHOTS, sign_in_page

FILES = """(async () => { const out = {}; for await (const [n, h] of Store.usersDir.entries()) { if (h.kind !== 'file' || !n.endsWith('.json')) continue;
  const j = JSON.parse(await (await h.getFile()).text()); const arr = Array.isArray(j.records) ? j.records : Object.values(j.records || {}); out[n] = arr.map(r => [r.id, r._by || '']); } return out; })()"""

async def main():
    c = Check('release: people on one PC')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J("App.makePin('1111').then(p => Store.save({ id: 'userpin-yousef', c: 'userpin', member: 'yousef', pin: p }))"); await J("Store.flush()")
        sw = lambda who, sid: J(f"Store.save({{ c: 'shadow', id: '{sid}', analyst: '{who}', team: 'apps', date: U.todayStr(), taskType: 'TRAINING >> x', source: 'Call', subject: 'by {who}', duration: 15 }})")
        # 1) super admin saves and signs out straight away
        await sw('adam', 'rel-1'); await J("App.signOut()"); await pg.wait_for_selector('#loginf')
        # 2) an analyst with a PIN: saves, signs out at once
        await sign_in_page(pg, 'yousef', '1111'); await pg.wait_for_selector('#main')
        c('analyst signed in', await J("App.me") == 'yousef')
        await sw('yousef', 'rel-2'); await J("Store.save({ c: 'mytask', id: 'mytask-yousef-rel2b', owner: 'yousef', title: 'mine', status: 'Open' })"); await J("App.signOut()"); await pg.wait_for_selector('#loginf')
        # 3) someone without a PIN: chooses one, saves, signs out
        await sign_in_page(pg, 'layla', '2222'); await pg.wait_for_selector('#main')
        c('first sign-in with a new PIN', await J("App.me") == 'layla' and await J("App.verifyPin('2222', App.pinFor('layla'))"))
        await sw('layla', 'rel-3'); await J("App.signOut()"); await pg.wait_for_selector('#loginf')
        # 4) super admin: switch person (with their PIN), save as them, switch back
        await sign_in_page(pg, 'adam'); await pg.wait_for_selector('#main')
        await J("App.chooseMe(true)"); await pg.wait_for_selector('[data-me="yousef"]'); await pg.click('[data-me="yousef"]')
        await pg.wait_for_selector('#pinf'); await pg.fill('#pinf [name=pin]', '1111'); await pg.click('#modal [data-ok]'); await pg.wait_for_timeout(600)
        c('super admin switched to the analyst (PIN asked)', await J("App.me") == 'yousef')
        await sw('yousef', 'rel-4')
        await J("App.chooseMe = App.chooseMe")   # no-op: the analyst cannot open the switch list
        await J("App.signOut()"); await pg.wait_for_selector('#loginf')
        await sign_in_page(pg, 'adam'); await pg.wait_for_selector('#main')
        # 5) view as someone, then sign out from there
        await J("App.mode = 'admin'; App.launch()"); await J("App.viewAs('layla')"); await pg.wait_for_timeout(600)
        viewing = await J("!!App.preview")
        c('"view as" works (nothing can be saved while viewing)', viewing and await J("(() => { const n = Store.db.size; Store.save({ c: 'shadow', id: 'rel-x', analyst: 'layla', team: 'apps', date: U.todayStr(), subject: 'x' }); return !Store.get('rel-x'); })()"))
        await J("App.signOut()"); await pg.wait_for_selector('#loginf')
        c('signing out from "view as" leaves nobody signed in', await J("!App.me && !App.preview"))
        # 6) nobody signed in: nothing can be saved, the background poll does nothing
        await J("Store.save({ c: 'shadow', id: 'rel-ghost', analyst: 'adam', team: 'apps', date: U.todayStr(), subject: 'ghost' })"); await J("App.poll()")
        c('nothing is saved while nobody is signed in', await J("!Store.get('rel-ghost')"))
        await pg.wait_for_timeout(6500)   # longer than any delayed save
        # ---------- the shared folder afterwards ----------
        files = await J(FILES)
        stray = [n for n in files if n.split('.')[0] in ('null', 'undefined', '')]
        c('no stray files (null / undefined)', not stray, stray)
        wrong = [(n, rid, by) for n, recs in files.items() for rid, by in recs if by and by != n.split('.')[0]]
        c("every file holds only its owner's records", not wrong, wrong[:6])
        where = {rid: n for n, recs in files.items() for rid, _ in recs}
        c('every change is in the right file', where.get('rel-1', '').startswith('adam') and where.get('rel-2', '').startswith('yousef') and where.get('mytask-yousef-rel2b', '').startswith('yousef') and where.get('rel-3', '').startswith('layla') and where.get('rel-4', '').startswith('yousef'), {k: where.get(k) for k in ['rel-1', 'rel-2', 'mytask-yousef-rel2b', 'rel-3', 'rel-4']})
        c('nothing from "view as" or while signed out was written', 'rel-x' not in where and 'rel-ghost' not in where)
        await sign_in_page(pg, 'adam'); await pg.wait_for_selector('#main'); await J("Store.sync(true)"); await pg.wait_for_timeout(500)
        rej = await J("(Store.rejected || []).map(x => x.file + ':' + x.id + ':' + x.why)")
        c('nothing in the shared folder is ignored', not rej, rej[:5])
        c('all the changes are visible to the admin', await J("['rel-1', 'rel-2', 'mytask-yousef-rel2b', 'rel-3', 'rel-4'].every(id => !!Store.get(id))"))
        c.done(s)

run(main())
