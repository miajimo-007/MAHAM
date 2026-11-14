"""📚 Knowledge base (2026.11.11.11): an article from an item (the 📚 box at the bottom of its form, filled from the item) or
from scratch (Reference → Knowledge base → ＋ New article). Who marks: the item's owner, the team's managers, the super admin.
Who reads: chosen per article (my team / everyone). Who changes: the writer, the team's managers, the super admin — and the
trust check keeps it that way. Articles stay when the item goes."""
from harness import app_session, Check, run, SHOTS

async def main():
    c = Check('knowledge base')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J("""Store.save({ c: 'todo', id: 'kb-td1', team: 'apps', analyst: 'yousef', task: 'Printer queue stuck', instruction: 'Labels not printing on ward 3', finishNote: 'Restarted the print spooler', assigned: U.todayStr(), status: 'Resolved', finish: U.todayStr() })""")
        await J("Store.flush()"); await pg.wait_for_timeout(300)
        # ---------- the owner ticks 📚 on their To Do ----------
        await s.sign_in_as('yousef')
        c('Reference has a Knowledge base page', await pg.locator('[data-nav="kb"]').count() >= 1)
        await J("UI.editRecord('todo', Store.get('kb-td1'))"); await pg.wait_for_selector('#kbbox #kbmark')
        await pg.check('#kbmark'); await pg.wait_for_selector('#kbinline .kb-title')
        got = await J("[...['.kb-title', '.kb-problem', '.kb-solution']].map(x => document.querySelector('#kbinline ' + x).value)")
        c('ticking it fills the article from the item', got[0] == 'Printer queue stuck' and 'ward 3' in got[1] and 'spooler' in got[2], got)
        c('the patient-data reminder shows', 'patient' in await pg.inner_text('#kbinline'))
        await pg.fill('#kbinline .kb-tags', 'Printing, Wards'); await pg.click('[data-kbok]'); await pg.wait_for_timeout(300)
        a = await J("KB.of('kb-td1')[0]")
        c('the article is saved, linked to the item, readable by the team', a and a['by'] == 'yousef' and a['on'] == 'kb-td1' and a['vis'] == 'team' and a['team'] == 'apps' and a['tags'] == ['Printing', 'Wards'], a)
        c('…and the box now says it is in the Knowledge base', 'In the Knowledge base' in await pg.inner_text('#kbbox'))
        aid = a['id']; await J("UI.closeModal()")
        # ---------- an article from scratch, for everyone ----------
        await s.go('#/home'); t = await s.go('#/kb', 600)
        c('the page lists the article', 'Printer queue stuck' in t)
        await pg.click('#kbnew'); await pg.wait_for_selector('#kbed .kb-title')
        await pg.click('[data-kbsave]'); await pg.wait_for_timeout(200)
        c('a title is required', await pg.locator('#kbed').count() == 1)
        await pg.fill('#kbed .kb-title', 'How to reset a MAHAM PIN'); await pg.fill('#kbed .kb-solution', 'Ask the admin: Admin → People → Reset PIN')
        await pg.select_option('#kbed .kb-vis', 'all'); await pg.click('[data-kbsave]'); await pg.wait_for_timeout(400)
        c('the free article is saved for everyone', await J("KB.all().some(a => a.title === 'How to reset a MAHAM PIN' && a.vis === 'all' && !a.on)"))
        await pg.fill('#kbq', 'spooler'); await pg.wait_for_timeout(600)
        t = await pg.inner_text('#main'); c('search finds words in the solution', 'Printer queue stuck' in t and 'reset a MAHAM PIN' not in t)
        await pg.fill('#kbq', ''); await pg.wait_for_timeout(500)
        await pg.select_option('#kbsrc', 'free'); await pg.wait_for_timeout(300)
        t = await pg.inner_text('#main'); c('filter: written from scratch', 'reset a MAHAM PIN' in t and 'Printer queue stuck' not in t)
        await pg.select_option('#kbsrc', ''); await pg.wait_for_timeout(300)
        await pg.click(f'[data-kb="{aid}"]'); await pg.wait_for_selector('[data-kbsrc]')
        c('opening an article shows the problem, solution and where it came from', 'ward 3' in await pg.inner_text('#modal') and 'To Do' in await pg.inner_text('#modal'))
        await pg.screenshot(path=f'{SHOTS}/kb_article.png'); await J("UI.closeModal()")
        await J("Store.flush()"); await pg.wait_for_timeout(300)
        # ---------- someone else in the team: reads, cannot mark or change ----------
        await s.sign_in_as('layla')
        c('a teammate reads both articles', await J("KB.list().length") == 2)
        c("…but cannot mark someone else's item or change the article", not await J("KB.canMark(Store.get('kb-td1'))") and not await J(f"KB.canEdit(KB.get('{aid}'))"))
        # ---------- another team: only the article for everyone ----------
        await s.sign_in_as('bi-mgr')
        c('another team sees only the "everyone" article', await J("KB.list().map(a => a.title).join()") == 'How to reset a MAHAM PIN')
        c("…and a manager of another team cannot change this team's article", not await J(f"KB.canEdit(KB.get('{aid}'))"))
        # ---------- the team manager edits it ----------
        await s.sign_in_as('apps-mgr'); await s.go('#/home'); await s.go('#/kb', 600)
        await pg.click(f'[data-kb="{aid}"]'); await pg.click('[data-kbedit]'); await pg.wait_for_selector('#kbed .kb-solution')
        await pg.fill('#kbed .kb-solution', 'Restarted the print spooler; if it happens again call the vendor'); await pg.click('[data-kbsave]'); await pg.wait_for_timeout(300)
        a = await J(f"KB.get('{aid}')")
        c("the team manager can change it; the writer stays the writer", 'vendor' in a['solution'] and a['by'] == 'yousef' and a['editedBy'] == 'apps-mgr')
        c('a manager can mark an item of the team', await J("KB.canMark(Store.get('kb-td1'))"))
        await J("Store.flush()"); await pg.wait_for_timeout(300)
        # ---------- a forged article in someone else's name is ignored ----------
        await s.sign_in_as('layla')
        await J("Store.save({ c: 'kbarticle', id: 'kbarticle-yousef-forged', by: 'yousef', at: Date.now(), team: 'apps', title: 'Forged', solution: 'x', vis: 'all', tags: [] })")
        await J("Store.flush()"); await pg.wait_for_timeout(400); await J("Store.sync(true)"); await pg.wait_for_timeout(400)
        c('the trust check ignores an article written in someone else\'s name', await J("Store.rejected.some(x => x.c === 'kbarticle' && x.id === 'kbarticle-yousef-forged')") and not await J("KB.get('kbarticle-yousef-forged')"))
        c('…and keeps the real ones (incl. the manager\'s edit)', not await J(f"Store.rejected.some(x => x.c === 'kbarticle' && x.id === '{aid}')") and 'vendor' in await J(f"KB.get('{aid}').solution"))
        # ---------- untick: the owner takes it out; the article outlives the item ----------
        await s.sign_in_as('yousef')
        await J("UI.editRecord('todo', Store.get('kb-td1'))"); await pg.wait_for_selector('#kbmark')
        await pg.uncheck('#kbmark'); await pg.click('[data-kbkeep]'); await pg.wait_for_timeout(200)
        c('unticking asks first (Keep leaves it)', await J(f"!!KB.get('{aid}')") and await pg.is_checked('#kbmark'))
        await J("UI.closeModal()")
        await s.sign_in_as('adam'); await J("Store.save(Object.assign({}, Store.get('kb-td1'), { _del: true }))"); await pg.wait_for_timeout(200)
        c('the article stays when the item is deleted', await J(f"!!KB.get('{aid}') && !KB.source(KB.get('{aid}'))"), await J(f"[!!Store.get('kb-td1'), !!KB.get('{aid}')]"))
        c('no page errors', not s.errors, s.errors)
        c.done(s)

run(main())
