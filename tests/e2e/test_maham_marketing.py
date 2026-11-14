"""MAHAM marketing: campaigns (budget, spent), a deal whose source is the campaign → its won value is the campaign's
revenue and return; segments of contacts by tag, with their CSV for a WhatsApp broadcast."""
from harness import app_session, Check, run


async def main():
    c = Check('MAHAM marketing')
    async with app_session() as s:
        pg = s.page; J = s.js
        await pg.set_viewport_size({'width': 1366, 'height': 900})
        await s.sign_in_as('adam', 'admin')
        c('Marketing is in the Sales section', await J("!!document.querySelector('nav [data-nav=\"marketing\"]')"))
        await s.go('#/marketing/campaigns', 400); await pg.click('#mknew')
        await pg.fill('#mkn', 'Clinic open day'); await pg.select_option('#mkk', 'Event'); await pg.select_option('#mks', 'Running'); await pg.fill('#mkb', '20000'); await pg.fill('#mksp', '10000')
        await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300)
        camp = await J("MKT.all('campaign').find(x => x.name === 'Clinic open day')")
        c('a campaign is saved with its budget and spend', bool(camp) and camp['budget'] == 20000 and camp['spent'] == 10000 and camp['status'] == 'Running', camp)
        # a deal from the campaign, won
        await s.go('#/crm/pipeline', 400); await pg.click('#crmnew')
        c('a deal can name the campaign as its source', await J(f"!![...document.querySelectorAll('#dlsrc option')].find(o => o.value === '{camp['id']}')"))
        await pg.fill('#dlt', 'Open day follow-up'); await pg.fill('#dlv', '30000'); await pg.select_option('#dlsrc', camp['id']); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(400); await J("UI.closeModal()")
        await J("CRM.saveDeal(CRM.all('deal').find(d => d.title === 'Open day follow-up'), { status: 'won' })")
        t = await s.go('#/marketing/campaigns', 500)
        c("the campaign shows the deal's won value and its return (30,000 / 10,000 = 3×)", '30,000' in t and '3×' in t, t[:300])
        # segments
        await J("Store.saveMany([{ c: 'contact', id: 'mk-c1', name: 'Huda', email: 'huda@example.com', phone: '0500000001', tags: ['vip'] }, { c: 'contact', id: 'mk-c2', name: 'Omar', tags: ['lead'] }, { c: 'contact', id: 'mk-c3', name: 'Sara', email: 's@example.com', tags: ['VIP', 'lead'] }])")
        await s.go('#/marketing/segments', 400); await pg.click('#sgnew'); await pg.fill('#sgn', 'VIP'); await pg.fill('#sgt', 'vip'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(300)
        seg = await J("MKT.all('segment').find(x => x.name === 'VIP')")
        c('a segment by tag finds its contacts (any case)', sorted(await J(f"MKT.members(Store.get('{seg['id']}')).map(x => x.name)")) == ['Huda', 'Sara'])
        await J(f"MKT.editSeg(Store.get('{seg['id']}'))"); await pg.wait_for_selector('[data-sgcsv]')
        async with pg.expect_download() as dl: await pg.click('[data-sgcsv]')
        body = open(await (await dl.value).path(), encoding='utf-8-sig').read()
        c('…its CSV (name, phone, email) is ready for a WhatsApp broadcast', 'Name,Phone,Email' in body and '0500000001' in body and 'Omar' not in body, body[:200])
    c.done(s)

run(main())
