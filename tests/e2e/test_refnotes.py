"""8 Nov: 📝 notes for future reference on every task type — add, see, edit / delete your own, kept after done,
📝 mark + "Has notes" filter + search inside notes + Notes column in Excel, nobody can write a note in someone else's name."""
from harness import app_session, Check, run

async def open_form(s, c, rid):
    await s.js(f"UI.editRecord('{c}', Store.get('{rid}'))"); await s.page.wait_for_selector('#modal #refnotes', timeout=5000)
    await s.page.wait_for_function("(() => { const b = document.querySelector('#modal #rnaddbtn'); return !b || !!b.onclick; })()", timeout=5000)

async def add_note(s, text):
    await s.page.fill('#modal #rnnew', text); await s.page.click('#modal #rnaddbtn')
    try: await s.page.wait_for_function(f"(() => (document.querySelector('#modal #refnotes') || {{}}).innerText && document.querySelector('#modal #refnotes').innerText.includes({text[:30]!r}))()", timeout=5000)   # a busy PC (4 tests at once) can take longer than a fixed wait
    except Exception: pass
    await s.page.wait_for_timeout(150)

async def main():
    c = Check('reference notes')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J("""Store.saveMany([
          { c: 'todo', id: 'rn-td', analyst: 'yousef', team: 'apps', task: 'Fix order set', assigned: U.todayStr(), status: 'In Progress' },
          { c: 'todo', id: 'rn-td2', analyst: 'yousef', team: 'apps', task: 'Other task', assigned: U.todayStr(), status: 'In Progress' },
          { c: 'quickwin', id: 'rn-qw', analyst: 'yousef', team: 'apps', date: U.todayStr(), subject: 'Faster triage' },
          { c: 'gcatch', id: 'rn-gc', title: 'Wrong dose unit', createdBy: 'adam', status: 'Open', date: U.todayStr() } ])""")
        # manager adds a note on the analyst's To Do
        await open_form(s, 'todo', 'rn-td'); await add_note(s, 'The fix is in the order-set table, not the template')
        c('note saved as its own record', await J("RefNotes.of('rn-td').length === 1 && RefNotes.of('rn-td')[0].by === 'adam'"))
        c('note shows in the form at once', 'order-set table' in await pg.inner_text('#modal #refnotes'))
        await J("UI.closeModal()")
        # the analyst sees it, adds their own, cannot edit the manager's
        await s.sign_in_as('yousef', 'analyst'); await open_form(s, 'todo', 'rn-td')
        t = await pg.inner_text('#modal #refnotes'); c("analyst sees the manager's note", 'order-set table' in t and 'Adam' in t)
        c("no Edit / Delete on someone else's note", await pg.locator('#modal [data-rnedit]').count() == 0)
        await add_note(s, 'Contact pharmacy IT (ext 1234) next time')
        c('analyst adds a note', await J("RefNotes.of('rn-td').length") == 2)
        c('own note can be edited', await pg.locator('#modal [data-rnedit]').count() == 1)
        await pg.click('#modal [data-rnedit]'); await pg.fill('#modal .rn-edit', 'Contact pharmacy IT (ext 1235) next time'); await pg.click('#modal [data-rnsave]'); await pg.wait_for_timeout(250)
        c('edited', await J("RefNotes.of('rn-td').some(n => n.text.includes('1235') && n.edited)"))
        # a note typed but not added: closing asks first
        await pg.fill('#modal #rnnew', 'half a note'); await J("UI.tryClose()"); await pg.wait_for_timeout(200)
        c('closing with a note typed asks first', await pg.locator('#modal .unsaved-bar').count() == 1)
        await pg.click('[data-discard]')
        # notes on other task types (own quick win, the department's good catch)
        await open_form(s, 'quickwin', 'rn-qw'); await add_note(s, 'Saved 3 clicks per order'); await J("UI.closeModal()")
        await open_form(s, 'gcatch', 'rn-gc'); await add_note(s, 'Check the unit table every release'); await J("UI.closeModal()")
        ok = True
        try: await pg.wait_for_function("RefNotes.count('rn-qw') === 1 && RefNotes.count('rn-gc') === 1", timeout=3000)
        except Exception: ok = False
        c('notes on quick win and good catch', ok)
        # kept after the To Do is done
        await J("Store.save(Object.assign({}, Store.get('rn-td'), { finish: U.todayStr() }))")
        c('notes stay after done', await J("RefNotes.count('rn-td')") == 2)
        # lists: mark, filter, search, Excel
        t = await s.go('#/todo', 500)
        c('📝 mark on the row with notes', await pg.locator('tr[data-rid="rn-td"] .rn-mark').count() == 1 and await pg.locator('tr[data-rid="rn-td2"] .rn-mark').count() == 0)
        await pg.check('[data-tnotes="todo"]'); await pg.wait_for_timeout(300)
        c('"Has notes" shows only items with notes', await pg.locator('tr[data-rid="rn-td"]').count() == 1 and await pg.locator('tr[data-rid="rn-td2"]').count() == 0)
        await pg.uncheck('[data-tnotes="todo"]'); await pg.wait_for_timeout(300)
        await J("App.tableState.todo.q = 'pharmacy IT'; App.render()"); await pg.wait_for_timeout(300)
        c('search finds words inside notes', await pg.locator('tr[data-rid="rn-td"]').count() == 1 and await pg.locator('tr[data-rid="rn-td2"]').count() == 0)
        await J("App.tableState.todo.q = ''; App.render()")
        c('Excel gets a Notes column', 'order-set table' in await J("(() => { const T = App.tableRows.todo; const r = T.list.find(x => (x.r || x).id === 'rn-td'); return T.notes ? T.notes(r) : ''; })()"))
        # the writer can delete; nobody can write a note in someone else's name
        await open_form(s, 'todo', 'rn-td'); await pg.click('#modal [data-rndel]'); await pg.wait_for_timeout(250); await J("UI.closeModal()")
        c('own note deleted, the other stays', await J("RefNotes.count('rn-td')") == 1)
        await J("Store.save({ c: 'refnote', id: 'refnote-yousef-forged', on: 'rn-td2', onC: 'todo', by: 'layla', at: Date.now(), text: 'forged' })"); await J("Store.flush()"); await J("Store.sync(true)"); await pg.wait_for_timeout(300)
        c("a note in someone else's name is ignored", await J("RefNotes.count('rn-td2')") == 0)
        # super admin can remove anyone's note
        await s.sign_in_as('adam', 'admin'); await open_form(s, 'todo', 'rn-td')
        c('super admin can edit / delete any note', await pg.locator('#modal [data-rndel]').count() >= 1); await J("UI.closeModal()")
        c('no page errors', not s.errors, s.errors[:3])
        c.done(s)

run(main())
