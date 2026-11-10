"""9 Nov: Admin in 6 main tabs with sub-tabs (Home · People · Work & workflows · Scoring · Settings · System).
Every sub-tab opens without errors; old #/admin/<tab> links go to the new place; the search points there too;
long sub-tabs fold; Home shows what needs action, recent Admin changes and quick links."""
from harness import app_session, Check, run

SUBS = {
    'home': ['home'],
    'people': ['people', 'access', 'teams'],
    'work': ['todo', 'projects', 'tasks', 'followups', 'time'],
    'scoring': ['rules', 'months', 'adjust', 'print'],
    'settings': ['lists', 'look', 'announcements'],
    'system': ['data', 'check', 'logs', 'feedback'],
}
# a word each sub-tab must show (its screens moved here, nothing lost)
SHOWS = {
    'people/people': ['People', 'Manager leave'], 'people/access': ['Permission matrix', 'What each role can do', 'Admin roles'],
    'people/teams': ['Teams', 'Request types', 'Departments'], 'work/todo': ['To Do workflows'], 'work/projects': ['Project lists', 'Project task sets'],
    'work/tasks': ['Which workflow', 'Resolutions'], 'work/followups': ['Parties', 'Follow-up workflows'], 'work/time': ['Escalation', 'Public holidays and Ramadan'],
    'scoring/rules': ['Weights and parts', 'Scoring rules'], 'scoring/months': ['Month locks', 'Help desk months'], 'scoring/adjust': ['Bonus / penalty points'],
    'scoring/print': ['Printable rules'], 'settings/lists': ['Dropdown lists', 'Users directory'], 'settings/look': ['Name, logo', 'Start page'],
    'settings/announcements': ['Announcement'], 'system/data': ['Export everything', 'Backups', 'Minimum version allowed to save', 'Shared folder path', 'Import old data'],
    'system/check': ['Checks', 'Possible duplicates'], 'system/logs': ['Change log', 'Activity log', 'Period'], 'system/feedback': ['Feedback'],
}

async def main():
    c = Check('Admin layout')
    async with app_session() as s:
        pg = s.page; J = s.js
        t = await s.go('#/admin', 700)
        tabs = await J("[...document.querySelectorAll('.adm-main .tab')].map(a => a.textContent)")
        c('6 main tabs', tabs == ['Home', 'People', 'Work & workflows', 'Scoring', 'Settings', 'System'], tabs)
        c('Home: needs action, Admin changes, quick links', all(x in t for x in ['Needs action', 'Changes by Admins', 'Quick links']))
        bad = []
        for tab, subs in SUBS.items():
            for sub in subs:
                await s.go('#/home', 200); t = await s.go(f'#/admin/{tab}/{sub}', 600)
                on = await J("[(document.querySelector('.adm-main .tab.on') || {}).textContent, (document.querySelector('.adm-sub .tab.on') || {}).textContent]")
                miss = [w for w in SHOWS.get(f'{tab}/{sub}', []) if w not in t]
                if miss or 'Could not show this part' in t: bad.append((tab, sub, miss, on))
        c('every sub-tab opens and shows its screens', not bad, bad)
        # sub-tabs of Work & workflows
        await s.go('#/admin/work/todo', 500)
        subs = await J("[...document.querySelectorAll('.adm-sub .tab')].map(a => a.textContent)")
        c('Work & workflows sub-tabs', subs == ['To Do', 'Projects', 'Project tasks', 'Follow-ups', 'Time rules'], subs)
        # old links
        bad = []
        for old, new in [('lists', 'settings/lists'), ('taskflows', 'work/tasks'), ('timerules', 'work/time'), ('months', 'scoring/months'), ('hdmonths', 'scoring/months'), ('custom', 'settings/look'), ('log', 'system/logs'), ('activity', 'system/logs'), ('permissions', 'people/access'), ('leave', 'people/people'), ('data', 'system/data'), ('workflows', 'work/projects')]:
            await s.go('#/home', 200); await s.go(f'#/admin/{old}', 500)
            h = await J("location.hash")
            if h != f'#/admin/{new}': bad.append((old, h))
        c('old #/admin/<tab> links go to the new place', not bad, bad)
        await s.go('#/home', 200); await s.go('#/settings', 600)
        c('#/settings → Settings → Lists', await J("location.hash") == '#/admin/settings/lists')
        # search
        await s.go('#/admin/home/home', 500)
        await pg.fill('#adsearch', 'holiday'); await pg.wait_for_timeout(200)
        hits = await J("[...document.querySelectorAll('#adresults a')].map(a => a.getAttribute('href'))")
        c('search: holidays → Work & workflows → Time rules', '#/admin/work/time' in hits, hits)
        await pg.fill('#adsearch', 'announcements'); await pg.wait_for_timeout(200)
        hits = await J("[...document.querySelectorAll('#adresults a')].map(a => a.getAttribute('href'))")
        c('search: announcements → Settings → Announcements', '#/admin/settings/announcements' in hits, hits)
        await pg.fill('#adsearch', 'system check'); await pg.wait_for_timeout(200)
        hits = await J("[...document.querySelectorAll('#adresults a')].map(a => a.getAttribute('href'))")
        c('search: System Check → System → Check', '#/admin/system/check' in hits, hits)
        # folding
        await s.go('#/admin/system/logs', 700)
        n = await J("document.querySelectorAll('details.adm-sec').length")
        c('long sub-tabs fold into sections', n == 3, n)
        await J("document.querySelector('details.adm-sec').open = false; document.querySelector('details.adm-sec').dispatchEvent(new Event('toggle'))")
        await s.go('#/home', 200); await s.go('#/admin/system/logs', 600)
        c('…and stay folded the next time', await J("document.querySelector('details.adm-sec').open") is False)
        c('no page errors', not s.errors, s.errors[:3])
    c.done(s)

run(main())
