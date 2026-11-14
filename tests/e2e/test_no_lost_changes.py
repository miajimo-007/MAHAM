"""Two people change the same item at about the same time, one from a copy a few seconds old: both changes survive
(field-level merge: each version only overwrites the fields it changed — Store.fold / _chg)."""
from harness import app_session, Check, run
async def main():
    c = Check('no lost changes')
    async with app_session() as s:
        pg = s.page; J = s.js
        # the manager gives Yousef a To Do
        await s.sign_in_as('apps-mgr')
        await J("Store.save({c:'todo', id:'nl-t1', analyst:'yousef', team:'apps', task:'Check the lab mapping', assigned:U.todayStr(), duration:3, priority:'Normal', status:'In Progress'})"); await J("Store.flush()")
        stale = await J("JSON.stringify(Store.get('nl-t1'))")
        # the manager raises the priority
        await J("Store.save(Object.assign({}, Store.get('nl-t1'), {priority:'High', instruction:'Today please'}))"); await J("Store.flush()")
        c('manager version lists only what it changed', sorted(await J("Store.own['nl-t1']._chg")) == ['instruction', 'priority'], await J("Store.own['nl-t1']._chg"))
        # Yousef presses ✓ Done from his copy, which has not seen the manager's change yet
        await s.sign_in_as('yousef')
        await J(f"Store.db.set('nl-t1', JSON.parse({stale!r}))")
        c('(Yousef has the old copy)', await J("Store.get('nl-t1').priority") == 'Normal')
        await J("Store.save(Object.assign({}, Store.get('nl-t1'), {finish:U.todayStr(), comment:'Mapped all 40 codes'}))"); await J("Store.flush()")
        await J("Store.sync(true)"); await pg.wait_for_timeout(300)
        r = await J("Store.get('nl-t1')")
        c("Yousef's Done is kept", r['finish'] and r['comment'] == 'Mapped all 40 codes', r)
        c("the manager's priority and instruction are kept too", r['priority'] == 'High' and r['instruction'] == 'Today please', r)
        c('status follows the finish (waiting for the manager)', r['status'] == 'Ready for review', r.get('status'))
        c('nothing rejected by the trust / fairness check', await J("Store.rejected.length") == 0, await J("JSON.stringify(Store.rejected.slice(0,3))"))
        # the manager's PC sees the same merged result
        await s.sign_in_as('apps-mgr'); await J("Store.sync(true)"); await pg.wait_for_timeout(200)
        r2 = await J("Store.get('nl-t1')")
        c("manager's view: both changes", r2['priority'] == 'High' and bool(r2['finish']), r2)
        # an analyst still cannot change a manager-only field by sending a stale whole copy (fairness still applies)
        await s.sign_in_as('yousef')
        await J("Store.save(Object.assign({}, Store.get('nl-t1'), {comment:'one more note'}))"); await J("Store.flush()"); await J("Store.sync(true)")
        c('a later comment does not undo the priority', await J("Store.get('nl-t1').priority") == 'High' and await J("Store.get('nl-t1').comment") == 'one more note')
        # one person saving twice: the second save still carries the first change (their file keeps only the latest version)
        await J("Store.save(Object.assign({}, Store.get('nl-t1'), {finishNote:'first'}))"); await J("Store.save(Object.assign({}, Store.get('nl-t1'), {comment:'second'}))"); await J("Store.flush()")
        c('my change list keeps my earlier changes', set(['finishNote', 'comment']) <= set(await J("Store.own['nl-t1']._chg")), await J("Store.own['nl-t1']._chg"))
        # a new item (no earlier copy) is saved whole
        await J("Store.save({c:'shadow', id:'nl-s1', analyst:'yousef', team:'apps', date:U.todayStr(), taskType:'Support', source:'Phone', subject:'x', minutes:10})")
        c('new items have no change list', await J("Store.own['nl-s1']._chg") is None)
        # deleting while someone else edits: the delete wins, their edit does not bring it back silently
        stale2 = await J("JSON.stringify(Store.get('nl-s1'))")
        await J("Store.save(Object.assign({}, Store.get('nl-s1'), {_del:true}))"); await J("Store.flush()")
        await s.sign_in_as('apps-mgr'); await J(f"Store.db.set('nl-s1', JSON.parse({stale2!r}))")
        await J("Store.save(Object.assign({}, Store.get('nl-s1'), {minutes:20}))"); await J("Store.flush()"); await J("Store.sync(true)")
        c('a delete is not undone by an edit from an old copy', await J("Store.get('nl-s1')") is None)
        c('no page errors', not s.errors, s.errors[:3])
        c.done(s)

run(main())
