"""About DARRIK page — for everyone."""
from harness import app_session, Check, run, SHOTS
async def main():
    c = Check('about DARRIK')
    async with app_session() as s:
        for who in ['yousef', 'khalid', 'adam']:
            await s.sign_in_as(who)
            c(f'{who}: About DARRIK in the menu', await s.page.locator('nav [data-nav="about"]').count() == 1)
        t = await s.go('#/about', 400)
        c('page content', all(x in t for x in ['Every Effort Matters', 'From Effort to Impact']))
        await s.page.screenshot(path=f'{SHOTS}/about.png', full_page=True)
        c.done(s)
run(main())
