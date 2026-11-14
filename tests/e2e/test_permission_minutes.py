"""Permission time is shown and typed in minutes, but still saved and scored in hours: 90 minutes typed = 1.5 h saved;
an older 1.6 h shows as 96 min and stays exactly 1.6 h when the day is saved again; the score uses the same hours."""
from harness import app_session, Check, run, SHOTS

async def main():
    c = Check('permission in minutes')
    async with app_session() as s:
        pg = s.page
        y = await s.js('App.year'); mo = await s.js('new Date().getMonth() + 1')
        day = await s.js("(() => { let d = U.todayStr(); while (U.isOff(d)) d = U.addDays(d, -1); return d; })()")
        old = await s.js("(() => { let d = U.addDays(U.todayStr(), -1); while (U.isOff(d) || d.slice(0, 7) !== U.todayStr().slice(0, 7)) { d = U.addDays(d, d.slice(0, 7) !== U.todayStr().slice(0, 7) ? 2 : -1); } return d; })()")
        await s.js(f"Store.save({{ id: 'att-{old}-layla', c: 'attendance', date: '{old}', analyst: 'layla', status: 'ON', leave: '', permHrs: 1.6 }})")
        await s.go('#/home'); await s.go('#/attendance', 600)
        await s.js(f"editAttendance('{day}', 'yousef', 'PR')"); await pg.wait_for_selector('#attf [name=permMin]')
        c('the box asks for minutes', 'Permission (minutes)' in await pg.inner_text('#attf'))
        await pg.fill('#attf [name=permMin]', '90'); await pg.wait_for_timeout(100)
        c('while typing it says "= 1 h 30 min"', '= 1 h 30 min' in await pg.inner_text('#attf'))
        await pg.click('.modal [data-s]'); await pg.wait_for_timeout(300)
        c('90 minutes typed → 1.5 hours saved', await s.js(f"Store.get('att-{day}-yousef').permHrs") == 1.5)
        t = await pg.inner_text('#main')
        c('the grid shows "PR 1 h 30 min"', 'PR 1 h 30 min' in t)
        c('an older 1.6 h shows as 1 h 36 min', 'PR 1 h 36 min' in t)
        c('the yearly table and summary show hours and minutes, the score rule too', 'Permission time' in t and '≤ 2 h →' in t and '≤ 4 h 30 min' in t, t[-600:])
        await pg.screenshot(path=f'{SHOTS}/permission_minutes.png', full_page=True)
        await s.js(f"editAttendance('{old}', 'layla')"); await pg.wait_for_selector('#attf [name=permMin]')
        c('the box shows 96 for 1.6 h', await pg.input_value('#attf [name=permMin]') == '96')
        await pg.click('.modal [data-s]'); await pg.wait_for_timeout(300)
        c('saving without changing keeps exactly 1.6 h (scores do not move)', await s.js(f"Store.get('att-{old}-layla').permHrs") == 1.6)
        raw = await s.js(f"((Calc.perf({y}).members.yousef || {{}})[{mo}] || {{}}).permHrs")
        c('the score still counts hours (1.5)', raw == 1.5, raw)
        c.done(s)

run(main())
