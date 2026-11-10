"""Scoring & months: Scoring rules moved here (tiers as tables), weights and added parts (from MAHAM's own data and a
manager rating), bonus / penalty points, the Manager Desk ratings, and "Why is my score …?" showing them."""
from harness import app_session, Check, run, SHOTS

async def main():
    c = Check('score parts')
    async with app_session() as s:
        pg = s.page
        y = await s.js("new Date().getFullYear()"); mo = await s.js("new Date().getMonth() + 1")
        t = await s.go('#/admin/scoring', 800)
        c('Scoring → Rules has: weights and parts, scoring rules, tiers as tables, what-if', all(x in t for x in ('Weights and parts', 'Scoring rules', 'Tiers', 'Scoring what-if')) and await pg.locator('.tier-ed').count() >= 6, t[:200])
        t = await s.go('#/admin/scoring/adjust', 600)
        c('Scoring → Adjustments has bonus / penalty points', 'Bonus / penalty points' in t)
        t = await s.go('#/admin/lists', 600)
        c('Lists no longer holds the scoring rules', 'Scoring rules' not in t and 'Dropdown lists' in t)
        # tier editor writes the JSON the save uses
        await s.go('#/admin/scoring', 800)
        await pg.fill('[data-tier="shadow"] tbody tr:first-child [data-p]', '99'); await pg.wait_for_timeout(100)
        c('tier tables keep the rules in step', '99' in await pg.input_value('[name=s_tiers]'))
        # add parts: good catches + manager rating, rebalance to 100
        await pg.select_option('#spsrc', 'goodcatch'); await pg.wait_for_timeout(500)
        await pg.select_option('#spsrc', 'rating'); await pg.wait_for_timeout(500)
        c('two parts added', await s.js("(Calc.scoring().custom || []).map(d => d.source).join()") == 'goodcatch,rating')
        await pg.fill('#spw tr[data-k="todo"] [data-w]', '25'); await pg.fill('#spw tr[data-k="c_goodcatch"] [data-w]', '5'); await pg.fill('#spw tr[data-k="c_rating"] [data-w]', '5')
        c('the total must be 100% to save', 'Total' in await pg.inner_text('#sptot') and not await pg.is_disabled('#spsave'), await pg.inner_text('#sptot'))
        await pg.click('#spsave'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        W = await s.js("Calc.scoring().weights")
        c('weights saved with the parts', W.get('c_goodcatch') == 5 and W.get('c_rating') == 5 and W['todo'] == 25, W)
        # data: a good catch by Yousef, a rating, a bonus
        await s.js("Store.save({ c: 'gcatch', id: 'gc-sp', title: 'Wrong ward', found: U.todayStr(), createdBy: 'yousef', status: 'New' }); Store.save({ c: 'shadow', id: 'sh-sp', analyst: 'yousef', team: 'apps', date: U.todayStr(), taskType: 'TRAINING >> x', source: 'Call', subject: 'x', minutes: 60 })")
        await s.sign_in_as('apps-mgr'); t = await s.go('#/manager', 700)
        c('Manager Desk: ⭐ Ratings card', 'Ratings' in t)
        await pg.click(f'[data-rmo="{y}-{mo}"]'); await pg.wait_for_timeout(400)
        await pg.select_option('[data-rid="yousef"] [data-rv]', '4'); await pg.fill('[data-rid="yousef"] [data-rc]', 'Great follow-through'); await pg.click('#rsave'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        c('rating saved', (await s.js(f"Store.get('mrating-{y}-' + U.pad({mo}) + '-yousef')"))['rating'] == 4)
        await s.sign_in_as('adam'); await s.go('#/admin/scoring/adjust', 700)
        await pg.click('#adjnew'); await pg.wait_for_selector('#adjf'); await pg.select_option('#adjf [name=mid]', 'yousef'); await pg.fill('#adjf [name=points]', '3'); await pg.fill('#adjf [name=reason]', 'Covered the night go-live'); await pg.click('.modal [data-ok]'); await s.js("Store.flush()"); await pg.wait_for_timeout(300)
        sc = await s.js(f"Calc.monthScore({y}, 'yousef', {mo})")
        keys = {p['key']: p for p in sc['parts']}
        c('parts in the score: good catches (1) and the rating (4)', keys['c_goodcatch']['value'] == 1 and keys['c_rating']['value'] == 4, {k: v.get('value') for k, v in keys.items()})
        c('bonus added after the parts (capped at 100)', abs(sc['score'] - min(100, sc['base'] + 3)) < 0.01, (sc['base'], sc['score']))
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/home', 600); await pg.click('#whyscore'); await pg.wait_for_selector('.modal .why')
        t = await pg.inner_text('.modal')
        c('"Why is my score …?" shows the new parts, the comment and the bonus', 'Good catches' in t and 'Great follow-through' in t and 'Covered the night go-live' in t)
        await pg.screenshot(path=f'{SHOTS}/score_parts_why.png')
        # an analyst cannot rate or give points (hand-edit ignored)
        await s.js(f"Store.save({{ c: 'scoreadj', id: 'scoreadj-yousef-1', mid: 'yousef', team: 'apps', year: {y}, month: {mo}, points: 20, reason: 'me', by: 'yousef' }})"); await pg.wait_for_timeout(200)
        await s.sign_in_as('adam'); await s.js("Store.sync(true)"); await pg.wait_for_timeout(300)
        c('an analyst giving himself points is ignored', not await s.js("Store.get('scoreadj-yousef-1')"))
    c.done(s)

run(main())
