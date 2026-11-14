"""Menu headings without any available page are not shown."""
from harness import app_session, Check, run
async def main():
    c = Check('menu headings')
    async with app_session() as s:
        await s.sign_in_as('khalid')
        hidden = await s.js("['quickwins','central','oncall'].every(k => !App.pageAllowed(k))")
        heads = await s.js("[...document.querySelectorAll('nav a.sec')].map(e => e.querySelector('.sec-l').textContent.trim().toUpperCase())")
        c('no empty Tracking heading for the director', ('TRACKING' not in heads) if hidden else True, heads)
        # every heading has at least one link after it
        empty = await s.js("[...document.querySelectorAll('nav a.sec')].filter(e => !e.nextElementSibling || !e.nextElementSibling.querySelector('a[href]')).map(e => e.textContent)")
        c('no heading without links', not empty, empty)
        await s.sign_in_as('yousef'); heads = await s.js("[...document.querySelectorAll('nav a.sec')].map(e => e.querySelector('.sec-l').textContent.trim().toUpperCase())")
        c('analyst still sees Tracking', 'TRACKING' in heads, heads)
        c.done(s)
run(main())
