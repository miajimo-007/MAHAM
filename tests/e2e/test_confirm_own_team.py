"""8 Nov: a new BI manager saw "2" on WorkList / To Do List but an empty list — the count (and the right to confirm)
included other teams' To Dos waiting for review. Only the To Do's own team's manager (or the super admin) counts / confirms."""
from harness import app_session, Check, run

async def main():
    c = Check('confirm only own team')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J("""Store.saveMany([
          { c: 'todo', id: 'ct-c1', analyst: 'yousef', team: 'apps', task: 'APPS waiting 1', assigned: U.todayStr(), status: 'In Progress' },
          { c: 'todo', id: 'ct-c2', analyst: 'layla', team: 'apps', task: 'APPS waiting 2', assigned: U.todayStr(), status: 'In Progress' }])""")
        await pg.wait_for_timeout(300)
        for a, i in (('yousef', 'ct-c1'), ('layla', 'ct-c2')):   # each analyst finishes their own → waits for the APPS manager
            await s.sign_in_as(a, 'analyst'); await J(f"Store.save(Object.assign({{}}, Store.get('{i}'), {{ status: 'In Progress', finish: U.todayStr() }}))")
        await s.sign_in_as('adam')
        c('both wait for review', await J("['ct-c1','ct-c2'].every(i => Store.get(i).status === 'Ready for review')"))
        c('BI manager cannot confirm a APPS To Do', await J("!Store.canConfirmTodo(Store.get('ct-c1'), 'bi-mgr')"))
        c('APPS manager can', await J("Store.canConfirmTodo(Store.get('ct-c1'), 'apps-mgr')"))
        c('super admin can', await J("Store.canConfirmTodo(Store.get('ct-c1'), 'adam')"))
        c('nobody confirms their own', await J("!Store.canConfirmTodo(Store.get('ct-c1'), 'yousef')"))
        # the menu number as the BI manager sees it
        await s.sign_in_as('bi-mgr', 'analyst'); await s.go('#/todo', 500)
        n = await J("(document.querySelector('nav a[data-nav=\"todo\"] .count') || {}).textContent || ''")
        c('BI manager: no number on To Do List', n == '', n)
        await s.sign_in_as('apps-mgr', 'analyst'); await s.go('#/todo', 500)
        n = await J("(document.querySelector('nav a[data-nav=\"todo\"] .count') || {}).textContent || ''")
        c('APPS manager: 2 to confirm', n == '2', n)
        c('no page errors', not s.errors, s.errors[:3])
        c.done(s)

run(main())
