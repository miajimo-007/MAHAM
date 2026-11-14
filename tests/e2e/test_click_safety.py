"""2026.11.13.8 — clicking anywhere never sends you to a team that does not exist (2026.11.13.9: Waiting on managers shows
its list on the Director Desk instead of opening the Manager Desk).
Before: on the Director Desk (calm desk, 13.6) the whole desk box carried data-desk="director", which the Director Desk's
"open this team's desk" buttons also use — so a click almost anywhere on it (a Watch line, a gap, Waiting on managers)
switched the viewed team to "director" and opened the Manager Desk: every list empty, "The app has no data yet".
This test clicks every plain part (not buttons, links, boxes) of the desks and the main pages, as the super admin in
Admin mode and as a manager, and after each click checks: the viewed team is a real team, the data is still there, no
page error. It also checks the fixes themselves: Waiting on managers opens that team's Manager Desk; setViewTeam refuses
a team that does not exist."""
from harness import app_session, Check, run

SEED = r"""(() => { const t = U.todayStr(); const d = n => U.addDays(t, n); const L = [];
  L.push({ c: 'quickwin', id: 'cs-q1', analyst: 'yousef', team: 'apps', date: d(-9), expected: d(-3), subject: 'Faster stock report', module: 'Pharmacy', status: 'In-Progress' });
  for (let i = 0; i < 6; i++) L.push({ c: 'todo', id: 'cs-t' + i, task: 'Job ' + i, analyst: 'yousef', team: 'apps', assigned: d(-20 + i), duration: 1, status: 'In Progress' });
  L.push({ c: 'shadow', id: 'cs-s1', analyst: 'yousef', team: 'apps', date: t, taskType: 'TRAINING >> x', source: 'Call', subject: 'Help', duration: 30 });
  Store.saveMany(L); })()"""
STATE = """({ hash: location.hash, team: App.viewTeam, real: App.viewTeam === '*' || Store.teams().some(x => x.id === App.viewTeam),
  todo: Store.all('todo', '*').length, nodata: (document.querySelector('#main') || document.body).innerText.includes('has no data yet') })"""
# every plain element on the page (not a control), one per row of text, at most N — tagged so we can click them one by one
TAG = """(n => { let k = 0; const skip = 'button,a,input,select,textarea,label,summary,option,[contenteditable],.modal,.dc-wh';
  for (const el of document.querySelectorAll('#main *')) { if (k >= n) break; if (el.closest(skip) || el.children.length > 8) continue;
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue; el.dataset.cs = ++k; } return k; })(%d)"""


async def sweep(s, c, who, page, n=120):
    pg = s.page
    await s.go('#/todo', 200); await s.go(page, 900)
    k = await s.js(TAG % n); bad = []
    for i in range(1, k + 1):
        el = pg.locator(f'[data-cs="{i}"]')
        if not await el.count(): continue
        try: await el.first.click(timeout=800, force=True, no_wait_after=True)
        except Exception: continue
        await pg.wait_for_timeout(40)
        st = await s.js(STATE)
        if not st['real'] or st['nodata']: bad.append((i, st)); break
        if await pg.locator('.modal').count(): await s.js("UI.closeModal && UI.closeModal()")
        if st['hash'] != page and not st['hash'].startswith(page): await s.go(page, 500); await s.js(TAG % n)
    c(f'{who}: {k} plain clicks on {page} keep a real team and the data', not bad, bad[:1])


async def main():
    c = Check('click safety 2026.11.13.8')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J(SEED); await J("Store.flush()"); await pg.wait_for_timeout(300)
        await pg.set_viewport_size({'width': 1366, 'height': 900})
        # ---- the reported steps: super admin, Admin mode, Director Desk → Watch → Waiting on managers
        await s.sign_in_as('adam', 'admin'); await s.go('#/todo'); await s.go('#/director', 1200)
        await pg.click('.dc-wl[data-w="Waiting on managers"] .dc-wh'); await pg.wait_for_timeout(400)
        st = await J(STATE)
        c('opening the Waiting on managers line stays on the Director Desk', st['hash'].startswith('#/director') and st['team'] == 'apps', st)
        await pg.click('.dc-wl[data-w="Waiting on managers"] .dc-wb [data-waitmgr]'); await pg.wait_for_timeout(600)
        st = await J(STATE); box = await pg.inner_text('.modal') if await pg.locator('.modal').count() else ''
        c('its row shows what is waiting, on the Director Desk (no jump to the Manager Desk)', st['hash'].startswith('#/director') and st['team'] == 'apps' and 'Faster stock report' in box and 'Quick wins to approve' in box, (st, box[:200]))
        await pg.click('.modal [data-wmask]'); await pg.wait_for_timeout(400)
        c('…"Ask for an update" sends the manager a nudge', await J("Store.all('nudge').some(n => n.kind === 'approvals' && n.about === 'apps' && n.to === Store.teamManager('apps').id)"))
        await s.go('#/todo'); await s.go('#/director', 1000)
        await pg.click('.dc-main', position={'x': 6, 'y': 6}); await pg.wait_for_timeout(400)
        st = await J(STATE)
        c('a click on the desk box itself does nothing', st['hash'].startswith('#/director') and st['team'] == 'apps', st)
        # ---- setViewTeam refuses a team that does not exist
        await J("App.setViewTeam('director')"); st = await J(STATE)
        c('setViewTeam("director") is refused (the view stays on a real team)', st['real'] and st['team'] == 'apps', st)
        await J("App.setViewTeam('lab')"); c('…a real team still works', (await J('App.viewTeam')) == 'lab')
        await J("App.setViewTeam('*')"); c('…and "all teams" still works', (await J('App.viewTeam')) == '*')
        await J("App.setViewTeam('apps')")
        # ---- click everything plain on the desks and the main pages
        for page in ['#/director', '#/manager', '#/home', '#/todo', '#/quickwins', '#/projects', '#/perf']:
            await sweep(s, c, 'super admin (Admin mode)', page)
        await s.sign_in_as('apps-mgr', 'manager')
        for page in ['#/manager', '#/home', '#/todo', '#/shadow']:
            await sweep(s, c, 'manager', page)
    c.done(s)

run(main())
