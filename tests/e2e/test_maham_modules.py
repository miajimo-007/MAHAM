"""MAHAM-only modules in the app: 📎 attachments on a piece of work, 🔔 notifications ("For you"), 💬 chat (channels,
@mentions, direct messages, private channels, Discuss on an item, Chat as a function admins can switch off)."""
from harness import app_session, Check, run

TD = r"""(() => { Store.save({ c: 'todo', id: 'mm-td1', task: 'Fix the label printer', analyst: 'yousef', team: 'apps', assigned: U.todayStr(), duration: 2, status: 'In Progress' }); return Store.flush(); })()"""


async def main():
    c = Check('MAHAM modules')
    async with app_session() as s:
        pg = s.page; J = s.js
        await pg.set_viewport_size({'width': 1366, 'height': 900})
        await s.sign_in_as('apps-mgr', 'manager')
        await J(TD); await pg.wait_for_timeout(600)
        # ---------- 🔔 the manager gave Yousef a To Do → Yousef is told
        n = await J("Store.all('notify', '*').filter(x => x.to === 'yousef' && x.on === 'mm-td1').length")
        c('giving a To Do makes a notification for that person', n == 1, n)
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/todo', 500)
        bell = await J("(document.querySelector('#ntbell .nt-n') || {}).textContent || ''")
        c('🔔 in the top bar shows 1 new', bell == '1', bell)
        await pg.click('#ntbell'); await pg.wait_for_timeout(200)
        txt = await pg.inner_text('#ntpanel')
        c('"For you" lists it with who and what', 'gave you a To Do' in txt and 'Fix the label printer' in txt, txt[:200])
        await pg.click('#ntpanel [data-ntid]'); await pg.wait_for_timeout(500)
        c('clicking it opens the To Do List and marks it read', (await J('location.hash')) == '#/todo' and not await J("document.querySelector('#ntbell .nt-n')"))
        # ---------- 📎 attachments on the To Do
        await J("UI.editRecord('todo', Store.get('mm-td1'))"); await pg.wait_for_selector('#attachbox', timeout=5000)
        c('the To Do form has 📎 Attachments', 'Attachments' in await pg.inner_text('#attachbox'))
        await pg.set_input_files('#atfile', files=[{'name': 'printer-log.txt', 'mimeType': 'text/plain', 'buffer': b'paper jam at 09:12'}])
        await pg.wait_for_function("document.querySelectorAll('#attachbox [data-at]').length === 1", timeout=8000)
        c('a file is attached and listed', 'printer-log.txt' in await pg.inner_text('#attachbox'))
        rec = await J("(Store.all('attach', '*').find(a => a.on === 'mm-td1') || {})")
        c('…as a small record in my own data, with its path', rec.get('by') == 'yousef' and rec.get('path', '').startswith('Attachments/yousef/'), rec)
        async with pg.expect_download() as dl:
            await pg.click('#attachbox [data-atopen]')
        d = await dl.value; body = open(await d.path(), 'rb').read()
        c('downloading it gives back the same file', d.suggested_filename == 'printer-log.txt' and body == b'paper jam at 09:12', (d.suggested_filename, body[:30]))
        await pg.set_input_files('#atfile', files=[{'name': 'setup.exe', 'mimeType': 'application/octet-stream', 'buffer': b'MZ'}]); await pg.wait_for_timeout(600)
        c('a program cannot be attached', await J("document.querySelectorAll('#attachbox [data-at]').length") == 1 and 'cannot be attached' in await pg.inner_text('body'))
        await pg.click('#attachbox [data-atdel]'); await pg.click('.modal [data-ok], .confirm [data-ok], [data-yes]', timeout=3000) if await pg.locator('.modal [data-ok], [data-yes]').count() else None
        await pg.wait_for_timeout(500)
        c('the person who added it can remove it', await J("Store.all('attach', '*').filter(a => a.on === 'mm-td1').length") == 0)
        await J("UI.closeModal && UI.closeModal()")
        # ---------- 💬 chat
        c('Connect → Chat is in the menu', await J("!!document.querySelector('nav [data-nav=\"chat\"]')"))
        await s.go('#/chat', 600)
        c('#general is there for everyone', '# general' in await pg.inner_text('.ch-side'))
        await pg.fill('#chtext', 'Printer fixed, @Nora please check'); await pg.keyboard.press('Escape'); await pg.click('[data-send="chtext"]'); await pg.wait_for_timeout(400)
        c('a message is posted', 'Printer fixed' in await pg.inner_text('#chlist'))
        c('…the @mention is highlighted', await J("!!document.querySelector('#chlist .mention')"))
        n = await J("Store.all('notify', '*').filter(x => x.to === 'nora' && x.kind === 'chat').length")
        c('…and Nora is told', n == 1, n)
        # a reply in a thread
        await pg.click('#chlist [data-reply]'); await pg.wait_for_selector('#chreply')
        await pg.fill('#chreply', 'thanks!'); await pg.click('[data-send="chreply"]'); await pg.wait_for_timeout(400)
        c('a reply goes into the thread', 'thanks!' in await pg.inner_text('.ch-thread') and '1 reply' in await pg.inner_text('#chlist'))
        # a direct message and a private channel
        await J("location.hash = '#/chat/' + encodeURIComponent(Chat.dmId('nora'))"); await pg.wait_for_timeout(500)
        await pg.fill('#chtext', 'just between us'); await pg.click('[data-send="chtext"]'); await pg.wait_for_timeout(400)
        dm = await J("Store.all('chmsg', '*').find(m => m.text === 'just between us') || {}")
        c('a direct message carries its two readers', sorted(dm.get('aud', [])) == ['nora', 'yousef'], dm)
        await J("Store.save({ c: 'chchan', id: 'chchan-yousef-priv', name: 'secret', priv: true, members: ['yousef'], by: 'yousef', at: Date.now() })"); await pg.wait_for_timeout(300)
        c('a private channel shows for its member', await J("Chat.channels().some(x => x.name === 'secret')"))
        await s.sign_in_as('nora', 'analyst'); await pg.wait_for_timeout(300)
        c("…not for someone outside it", not await J("Chat.channels().some(x => x.name === 'secret')"))
        c('Nora sees the direct message to her', await J("Chat.dms().includes(Chat.dmId('yousef'))"))
        # Discuss on an item
        await s.go('#/todo', 400); await J("UI.editRecord('todo', Store.get('mm-td1'))"); await pg.wait_for_selector('[data-discuss]', timeout=5000)
        await pg.click('[data-discuss]'); await pg.wait_for_selector('#dsc'); await pg.fill('#dsc', 'Is the printer done?'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(600)
        c('💬 Discuss starts a thread about the To Do in #general', await J("(m => !!m && m.ch === 'chchan-general')(Store.all('chmsg', '*').find(m => m.on === 'mm-td1'))") and 'Thread' in await pg.inner_text('#main'))
        # Chat as a function: switched off for a team, it leaves the menu
        await s.sign_in_as('adam', 'admin')
        await J("Store.save(Object.assign({}, Store.get('settings-teams'), { teams: Store.teams().map(t => t.id === 'apps' ? Object.assign({}, t, { hidePages: [...(t.hidePages || []), 'chat'] }) : t) }))"); await pg.wait_for_timeout(300)
        await s.sign_in_as('nora', 'analyst'); await s.go('#/todo', 400)
        c('Admin → Functions can switch Chat off for a team', not await J("!!document.querySelector('nav [data-nav=\"chat\"]')") and not await J("App.pageAllowed('chat')"))
    c.done(s)

run(main())
