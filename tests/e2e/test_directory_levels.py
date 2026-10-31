"""Directory: leadership levels linked automatically; administrator clears the directory."""
import os
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('directory levels + clear')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J("""Store.saveMany([
          {c:'itdir', id:'L1', name:'Ed Top', title:'Executive Director IT', dept:'INFORMATION TECHNOLOGY', region:'Central'},
          {c:'itdir', id:'L2', name:'Dee Deputy', title:'Deputy Executive Director', dept:'INFORMATION TECHNOLOGY', region:'Central'},
          {c:'itdir', id:'L3', name:'Assoc WR', title:'Associate Executive Director', dept:'INFORMATION TECHNOLOGY - JEDDAH', region:'Jeddah'},
          {c:'itdir', id:'L4', name:'Dir Jeddah', title:'Director IT Jeddah', dept:'INFORMATION TECHNOLOGY - JEDDAH', region:'Jeddah'},
          {c:'itdir', id:'L5', name:'Faisal Mansour', title:'Manager PACS', dept:'INFORMATION TECHNOLOGY - JEDDAH', section:'APPLICATIONS (APP) - JEDDAH', region:'Jeddah'},
          {c:'itdir', id:'L6', name:'Khalid Al Shehri', title:'Team Leader Applications', dept:'INFORMATION TECHNOLOGY - JEDDAH', section:'APPLICATIONS (APP) - JEDDAH', region:'Jeddah', reportsTo:'L5'},
          {c:'itdir', id:'L7', name:'Tariq Hamdan', title:'Manager LAB', dept:'INFORMATION TECHNOLOGY - JEDDAH', section:'LAB INFO SYS (LAB) - JEDDAH', region:'Jeddah'}])""")
        t = await s.go('#/directory/it', 500)
        await pg.click('#dtauto'); await pg.wait_for_timeout(500)
        r = await J("Object.fromEntries(['L1','L2','L3','L4','L5','L7'].map(id => [id, Store.get(id).reportsTo || '']))")
        c('Deputy → Executive Director', r['L2'] == 'L1')
        c('Associate → Deputy', r['L3'] == 'L2')
        c('Director → Associate', r['L4'] == 'L3')
        c('Managers → Director of their department', r['L5'] == 'L4' and r['L7'] == 'L4')
        c('Executive Director stays at the top', r['L1'] == '')
        t = await s.go('#/home', 200); t = await s.go('#/directory/it', 500)
        c('level tags shown', 'Executive Director' in t and 'Deputy Executive Director' in t and 'Manager' in t)
        c('chain from staff to the top', await J("DirX.chain(Store.get('L6')).map(x => x.id).join('>')") == 'L1>L2>L3>L4>L5')
        await pg.screenshot(path=f'{SHOTS}/dir_levels.png', full_page=True)
        # clear: administrator only, needs CLEAR
        await s.sign_in_as('apps-mgr'); await s.go('#/home', 200); await s.go('#/directory/it', 400)
        c('managers do not see Clear', await pg.locator('[data-dclear]').count() == 0)
        await s.sign_in_as('adam'); await s.go('#/home', 200); await s.go('#/directory/it', 400)
        await pg.click('[data-dclear]'); await pg.wait_for_selector('#clrf')
        await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300)
        c('needs CLEAR typed', await J("Store.all('itdir').length") == 7)
        await pg.fill('#clrf [name=typed]', 'CLEAR'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(500)
        c('IT Directory cleared', await J("Store.all('itdir').length") == 0)
        # indented sheet: whole rows moved right = one level down
        await pg.click('[data-dimp="itdir"]'); await pg.wait_for_selector('#dimpz')
        await pg.set_input_files('#dimpf', os.path.join(os.path.dirname(__file__), 'it_indented.xlsx')); await pg.wait_for_selector('[data-gteam="0"]')
        await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(700)
        ch = await J("(() => { const by = n => Store.all('itdir').find(r => r.name === n); const path = n => DirX.chain(by(n)).map(x => x.name).concat([n]).join(' > '); return { t: path('Khalid Al Shehri'), a: path('Hind Saleh'), hb: (by('Faisal Mansour') || {}).bn, ht: (by('Faisal Mansour') || {}).title }; })()")
        c('indent → chain Exec > Deputy > Assoc > Director > Manager > staff', ch['t'] == 'Exec Person > Deputy Person > Assoc Person > Dir Apps > Faisal Mansour > Khalid Al Shehri', ch['t'])
        c('second director block', ch['a'] == 'Exec Person > Deputy Person > Assoc Person > Dir Infra > Tariq Hamdan > Hind Saleh', ch['a'])
        c('columns still read on indented rows', ch['hb'] == '9100009' and ch['ht'] == 'Manager PACS')
        await s.go('#/home', 200); await s.go('#/directory/it', 500); await pg.screenshot(path=f'{SHOTS}/dir_indented.png', full_page=True)
        c.done(s)
run(main())
