"""The super admin's own work stays in their own team; in another team's name boxes they are listed last ("Adam (APPS)"), never pre-filled.
Super admin power is unchanged: they still add work for that team's people and see / edit everything."""
from harness import app_session, Check, run
async def main():
    c = Check('own team')
    async with app_session() as s:
        pg = s.page; J = s.js
        await s.sign_in_as('adam')
        lab = await J("(Store.members().find(m => (m.team || 'apps') === 'lab' && !Store.topRole(m.role) && !m.superAdmin) || {}).id || ''")
        if not lab:
            await J("Store.save(Object.assign({}, Store.get('settings-team') || {id:'settings-team', c:'settings'}, {members: Store.members().concat([{id:'lab-a', name:'LAB ANALYST', short:'LisA', role:'analyst', team:'lab', active:true, scored:true, aliases:[]}])}))"); lab = 'lab-a'
        await J("App.viewTeam = 'lab'"); await s.go('#/home', 300)
        await J("UI.editRecord('shadow', null)"); await pg.wait_for_selector('#recform [name=analyst]')
        c('new form in LAB is not pre-filled with me', await pg.input_value('#recform [name=analyst]') == '')
        last = await J("[...document.querySelectorAll('#recform [name=analyst] option')].pop().textContent")
        c('my name is last, with my team', last.endswith('(APPS)'), last)
        c('LAB people are listed', await J(f"!!document.querySelector('#recform [name=analyst] option[value=\"{lab}\"]')"))
        await J("UI.closeModal()")
        await J("Store.saveMany([{c:'shadow', id:'ot-me', analyst:'adam', date:U.todayStr(), subject:'Mine', minutes:10}, {c:'shadow', id:'ot-lab', analyst:'" + lab + "', date:U.todayStr(), subject:'Theirs', minutes:10}, {c:'todo', id:'ot-td', analyst:'" + lab + "', task:'For LAB', assigned:U.todayStr(), duration:1, status:'In Progress'}])")
        c('my own work is saved in APPS', await J("Store.get('ot-me').team") == 'apps')
        c("work for a LAB person is saved in LAB (super admin can add it)", await J("Store.get('ot-lab').team") == 'lab' and await J("Store.get('ot-td').team") == 'lab')
        await J("Store.saveMany([{c:'todo', id:'ot-apps', analyst:'yousef', task:'For a APPS person, added from LAB', assigned:U.todayStr(), duration:1, status:'In Progress'}])")
        c("work for a APPS person added while viewing LAB is saved in APPS", await J("Store.get('ot-apps').team") == 'apps')
        await J("Store.save(Object.assign({}, Store.get('ot-lab'), {subject:'Edited by admin'}))")
        c('super admin can edit LAB work', await J("Store.get('ot-lab').subject") == 'Edited by admin')
        t = await s.go('#/shadow', 500)
        c('LAB shadow list shows LAB work, not mine', 'Edited by admin' in t and 'Mine' not in t)
        await J("Store.saveMany([{c:'quickwin', id:'ot-q1', analyst:'yousef', team:'apps', date:U.todayStr(), subject:'Q1', module:'Orders', approval:'Accepted'}, {c:'quickwin', id:'ot-q2', analyst:'yousef', team:'apps', date:U.todayStr(), subject:'Q2', module:'Orders', approval:'Accepted'}])")
        q1, q2 = await J("Store.get('ot-q1').qwId"), await J("Store.get('ot-q2').qwId")
        c('two quick wins accepted in one save get different QW IDs', bool(q1) and bool(q2) and q1 != q2, f'{q1} {q2}')
        w = await J("[[3,''],[0,''],[-2,''],[-1,'2026-01-01'],[2,'2026-01-01'],[0,'2026-01-01']].map(([d, f]) => Calc.todoWhen({ days: d, status: f ? 'Resolved' : 'In Progress', r: { finish: f } }).text)")
        c('To Do timing in words, not -1', w == ['3 days late', 'Due today', '2 days left', 'Done 1 day early', 'Done 2 days late', 'Done on the due day'], w)
        c('nothing rejected', await J("Store.rejected.length") == 0)
        c('no page errors', not s.errors, s.errors[:3])
        c.done(s)

run(main())
