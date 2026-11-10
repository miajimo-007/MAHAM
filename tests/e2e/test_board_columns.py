"""Board columns are an admin list: the board, moves, Done, progress and old tasks follow it."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('board columns')
    async with app_session() as s:
        pg = s.page
        await s.js("Store.save({c: 'project', id: 'pj-b', name: 'Board test', manager: 'apps-mgr', team: 'apps', origin: 'team', members: ['yousef']})")
        await s.js("Store.saveMany([{c: 'ptask', id: 'pt-old', project: 'pj-b', title: 'Already done (old Done)', status: 'Done', points: 2, assignee: 'yousef', n: 1}, {c: 'ptask', id: 'pt-rev', project: 'pj-b', title: 'In review task', status: 'In Review', points: 3, assignee: 'yousef', n: 2}])")
        # super admin changes the columns
        await s.go('#/admin/work/projects', 600)
        await pg.fill('[data-list="boardColumns"]', 'Backlog\nBuilding\nTesting\nWaiting for vendor\nDeployed'); await pg.click('#savelists'); await pg.wait_for_timeout(400)
        c('columns saved', await s.js("Scrum.columns(Store.get('pj-b')).join('|')") == 'Backlog|Building|Testing|Waiting for vendor|Deployed')
        await s.sign_in_as('yousef'); await s.go('#/project/pj-b'); await pg.click('[data-ptab="board"]'); await pg.wait_for_timeout(300)
        heads = await pg.eval_on_selector_all('.kcol-h b', 'e => e.map(x => x.textContent)')
        c('board shows the 5 new columns', heads == ['Backlog', 'Building', 'Testing', 'Waiting for vendor', 'Deployed'], heads)
        c('old "Done" task sits in the last column and still counts as done', await s.js("Scrum.colIndex(Store.get('pt-old'))") == 4 and await s.js("Scrum.isDone(Store.get('pt-old'))"))
        c('task in a removed column ("In Review") shows in the first column', await s.js("Scrum.colIndex(Store.get('pt-rev'))") == 0)
        await pg.click('[data-ptab="backlog"]'); await pg.wait_for_timeout(200); await pg.click('#additem'); await pg.wait_for_selector('#recform')
        c('new task starts in the first column', await pg.eval_on_selector('#recform [name=status]', 'e => e.value') == 'Backlog')
        await pg.fill('#recform [name=title]', 'Build interface'); await pg.click('[data-save]'); await pg.wait_for_timeout(300)
        tid = await s.js("Store.all('ptask').find(t => t.title === 'Build interface').id")
        await s.js(f"Store.save(Object.assign({{}}, Store.get('{tid}'), {{assignee: 'yousef'}}))")
        await pg.click('[data-ptab="board"]'); await pg.wait_for_timeout(300)
        for _ in range(3): await pg.click(f'[data-mv="{tid}|1"]'); await pg.wait_for_timeout(200)
        c('moves step through the new columns', await s.js(f"Store.get('{tid}').status") == 'Waiting for vendor')
        btn = await pg.inner_text(f'[data-mv="{tid}|1"]'); c('last step button is named after the last column', 'Deployed' in btn, btn)
        await pg.screenshot(path=f'{SHOTS}/board_columns.png', full_page=True)
        await pg.click(f'[data-mv="{tid}|1"]'); await pg.wait_for_timeout(300)
        c('last column = done (done date set)', await s.js(f"(t => t.status === 'Deployed' && !!t.doneDate)(Store.get('{tid}'))"))
        c('progress counts the last column', await s.js("Scrum.progress(Store.get('pj-b'))") == round(100 * (2 + 1) / (2 + 3 + 1)))
        c.done(s)
run(main())
