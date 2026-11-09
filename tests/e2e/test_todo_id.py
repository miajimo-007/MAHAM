"""9 Nov: every To Do has an ID (TD-12). New ones store it when first saved (tdNo); To Dos from before have a fixed number
from their order (assigned date, then id) and are never rewritten; new numbers start after the old ones. The ID shows in the
To Do list (searchable, sortable), in the form title, and in the follow-up "linked to" list and label."""
from harness import app_session, Check, run

async def main():
    c = Check('To Do IDs')
    async with app_session() as s:
        pg = s.page; J = s.js
        # two "old" To Dos (made before this version: saved without tdNo) — saved, then the number taken off, then reloaded
        await J("""(() => { Store.saveMany([
            { c: 'todo', id: 'old-b', analyst: 'yousef', team: 'apps', task: 'Old task B', assigned: '2026-01-05', duration: 1, status: 'In Progress' },
            { c: 'todo', id: 'old-a', analyst: 'yousef', team: 'apps', task: 'Old task A', assigned: '2026-01-02', duration: 1, status: 'In Progress' }]);
            for (const id of ['old-a', 'old-b']) { delete Store.own[id].tdNo; if (Store.pending[id]) delete Store.pending[id].tdNo; } })()""")
        await J("Store.flush()"); await pg.wait_for_timeout(300); await J("Store.rebuild()")
        c('the old To Dos have no stored number', await J("[Store.get('old-a').tdNo, Store.get('old-b').tdNo]") == [None, None])
        base = await J("[...Store.db.values()].filter(r => r.c === 'todo' && !r.virtual && !r.tdNo).length")
        ka, kb = await J("TodoId.key(Store.get('old-a'))"), await J("TodoId.key(Store.get('old-b'))")
        c('old To Dos get a number from their date order', ka and kb and int(ka[3:]) + 1 == int(kb[3:]), (ka, kb))
        # new To Dos: saved one by one and several at once — each gets the next number, stored
        await J("Store.save({ c: 'todo', id: 'new-1', analyst: 'yousef', team: 'apps', task: 'New one', assigned: U.todayStr(), duration: 2, status: 'In Progress' })")
        await J("Store.saveMany(['x', 'y', 'z'].map(k => ({ c: 'todo', id: 'new-' + k, analyst: 'layla', team: 'apps', task: 'Batch ' + k, assigned: U.todayStr(), duration: 1, status: 'In Progress' })))")
        nums = await J("['new-1', 'new-x', 'new-y', 'new-z'].map(i => Store.get(i).tdNo)")
        top = await J("Math.max(0, ...[...Store.db.values()].filter(r => r.c === 'todo' && r.tdNo && !/^new-/.test(r.id)).map(r => r.tdNo))")
        c('new To Dos store the next numbers, no repeats', nums == list(range(nums[0], nums[0] + 4)) and nums[0] == max(base, top) + 1, (nums, base, top))
        # editing keeps the number; an old one stays without a stored number (not rewritten)
        await J("Store.save(Object.assign({}, Store.get('new-1'), { task: 'New one (renamed)' }))")
        await J("(() => { const r = Object.assign({}, Store.get('new-x')); delete r.tdNo; Store.save(r); })()")
        c('an edit keeps the number (even if the save left it out)', await J("[Store.get('new-1').tdNo, Store.get('new-x').tdNo]") == nums[:2])
        await J("Store.save(Object.assign({}, Store.get('old-a'), { task: 'Old task A (edited)' }))")
        c('an old To Do is not given a stored number, and keeps its ID', await J("Store.get('old-a').tdNo") is None and await J("TodoId.key(Store.get('old-a'))") == ka)
        # deleting one does not move the others
        await J("Store.remove('old-a')")
        c('deleting an old one does not renumber the rest', await J("TodoId.key(Store.get('old-b'))") == kb)
        # To Do list: ID column, searchable
        await s.go('#/home', 300); t = await s.go('#/todo', 500)
        k1 = f"TD-{nums[0]}"
        c('the list shows the ID column', k1 in t and kb in t, k1)
        # form title
        await J("UI.editRecord('todo', Store.get('new-1'))"); await pg.wait_for_selector('#recform')
        title = await pg.inner_text('#modal .modal-title') if await pg.locator('#modal .modal-title').count() else await pg.inner_text('#modal')
        c('the form title shows the ID', k1 in title, title[:120])
        await J("UI.closeModal()")
        # follow-ups: the link list and the label show the ID
        await s.sign_in_as('yousef', 'analyst')
        opts = await J("FollowUp.linkOptions('yousef').filter(o => o[0] === 'todo|new-1').map(o => o[1])")
        c('follow-up "linked to" list shows the ID', opts and k1 in opts[0], opts)
        c('follow-up link label shows the ID', k1 in await J("FollowUp.linkLabel('todo|new-1')"))
        c('no page errors', not s.errors, s.errors[:3])
        c.done(s)

run(main())
