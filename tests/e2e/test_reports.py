"""Reports (a function the admin gives), with charts, print and Excel; old help-desk requests → To Do."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('reports + help desk to To Do')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J("""(() => { const d = n => U.addDays(U.todayStr(), -n); const recs = [];
          ['yousef','layla','nora'].forEach((a, i) => { for (let k = 0; k < 4; k++) recs.push({c:'todo', id:`rt-${a}-${k}`, task:`Task ${k} ${a}`, analyst:a, team:'apps', assigned:d(6+k), duration:2, finish:d(k), status:'Resolved', reviewedBy:'apps-mgr', milestone: k === 0 && i === 0}); recs.push({c:'shadow', id:`rs-${a}`, analyst:a, team:'apps', date:d(1), taskType:'TRAINING >> x', source:'Phone', subject:'s', minutes:120}); });
          recs.push({c:'todo', id:'rt-late', task:'Late one', analyst:'yousef', team:'apps', assigned:d(10), duration:1, status:'In Progress'});
          const me = id => (Store.member(id) || {}).me || id;
          recs.push({c:'helpdesk', id:'hd-old1', reqId: 770001, team:'apps', technician: me('yousef'), subject:'Printer mapping', created: d(6) + ' 09:00', status:'Open', group:'EHR'});
          recs.push({c:'helpdesk', id:'hd-old2', reqId: 770002, team:'apps', technician: me('layla'), subject:'Order set missing', created: d(5) + ' 09:00', status:'Open', group:'EHR'});
          recs.push({c:'helpdesk', id:'hd-new', reqId: 770003, team:'apps', technician: me('nora'), subject:'New one', created: d(1) + ' 09:00', status:'Open', group:'EHR'});
          Store.saveMany(recs); })()""")
        # function hidden until given
        await s.sign_in_as('apps-mgr'); await s.go('#/manager', 400)
        c('hidden by default (manager)', await pg.locator('nav [data-nav="reports"]').count() == 0 and not await J("App.pageAllowed('reports')"))
        await s.sign_in_as('adam'); await J("saveMembersAll(Store.members().map(m => m.id === 'apps-mgr' ? Object.assign({}, m, {pages: Object.assign({}, m.pages, {reports: 'edit'})}) : m), 'ok')"); await pg.wait_for_timeout(300)
        await s.sign_in_as('apps-mgr'); t = await s.go('#/manager', 500)
        c('given → in the menu + Weekly report button on the desk', await pg.locator('nav [data-nav="reports"]').count() == 1 and 'Weekly report' in t)
        await pg.click('[data-repweek]'); await pg.wait_for_timeout(600)
        t = await J("document.querySelector('#main').innerText")
        c('weekly report with summary, charts, people', 'team report' in t and 'Summary' in t and 'Charts' in t and 'Per person' in t)
        c('charts drawn', await pg.locator('.rep-doc svg').count() >= 2)
        await pg.screenshot(path=f'{SHOTS}/report_week.png', full_page=True)
        await pg.click('[data-rk="month"]'); await pg.wait_for_timeout(500)
        c('monthly', 'Per person' in await J("document.querySelector('.rep-doc').innerText") and await pg.locator('#rmonth').count() == 1)
        await pg.click('[data-rk="year"]'); await pg.wait_for_timeout(500)
        c('yearly shows team score by month', 'Team score by month' in await J("document.querySelector('.rep-doc').innerText"))
        await pg.screenshot(path=f'{SHOTS}/report_year.png', full_page=True)
        await pg.click('[data-rk="week"]'); await pg.wait_for_timeout(400)
        await J("document.querySelector('.rep-opts').open = true"); await pg.uncheck('[data-rsec="charts"]'); await pg.wait_for_timeout(400)
        c('sections can be switched off', 'Charts' not in await J("document.querySelector('.rep-doc').innerText"))
        await J("document.querySelector('.rep-opts').open = true"); await pg.fill('[data-note="high"]', 'CH menus delivered'); await pg.wait_for_timeout(200)
        c('notes appear in the report', 'CH menus delivered' in await J("document.querySelector('.rep-doc').innerText"))
        # help desk → To Do
        t = await s.go('#/home', 200); t = await s.go('#/manager', 500)
        c('old requests card on Manager Desk (only > 3 days)', 'Open requests older than 3 days' in t and '770001' in t and '770002' in t and '770003' not in t)
        await pg.click('[data-h2one="hd-old1"]'); await pg.wait_for_timeout(400)
        c('one sent to To Do', await J("Store.all('todo').some(t => t.hdReq === 770001 && t.analyst === 'yousef' && t.priority === 'High')"))
        await s.go('#/home', 200); await s.go('#/helpdesk', 500)
        await pg.check('[data-h2all]'); await pg.click('[data-h2bulk]'); await pg.wait_for_timeout(400)
        c('bulk from Help Desk, no duplicates', await J("Store.all('todo').filter(t => t.hdReq === 770001).length") == 1 and await J("Store.all('todo').some(t => t.hdReq === 770002 && t.analyst === 'layla')"))
        c('marked "in To Do"', 'in To Do' in await J("document.querySelector('#main').innerText"))
        c.done(s)
run(main())
