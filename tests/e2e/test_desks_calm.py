"""2026.11.13.6 — calm desks: a number strip (the Analyst Desk numbers for the whole team / all teams), Needs you as one
list with chips (a kind with nothing = grey 0), Watch as one panel of lines beside it (the same height; click a line to
open it; Ask for update and Ask all), the team(s) below. To Do List: Days left as one number, ✓ ➜ ↩ small buttons."""
import os
from harness import app_session, Check, run, SHOTS

SEED = r"""(() => { const t = U.todayStr(); const d = n => U.addDays(t, n); const L = [];
  for (let i = 0; i < 12; i++) L.push({ c: 'todo', id: 'bx' + i, task: 'Overdue job ' + i, analyst: 'yousef', team: 'apps', assigned: d(-20 - i), duration: 1, status: 'In Progress' });
  L.push({ c: 'quickwin', id: 'bxq', analyst: 'yousef', team: 'apps', date: d(-9), expected: d(-3), subject: 'Faster stock report', module: 'Pharmacy', status: 'In-Progress' });
  L.push({ c: 'central', id: 'bxf', analyst: 'yousef', team: 'apps', party: 'central', fuv: 2, n: 702, date: d(-20), subject: 'Radiology label reprint', module: 'Radiology', status: 'Accepted' });
  L.push({ c: 'todo', id: 'bxr', task: 'Ready one', analyst: 'layla', team: 'apps', assigned: t, status: 'In Progress' });
  Store.saveMany(L); })()"""

DAYS = """(() => { const tr = [...document.querySelectorAll('#main tbody tr')].find(r => r.innerText.includes('Overdue job 0'));
  const i = [...document.querySelectorAll('#main thead th')].findIndex(x => x.textContent.trim() === 'Days left'); return tr ? tr.children[i].textContent.trim() : ''; })()"""
BTNS = """(() => { const ok = document.querySelector('[data-tdok]'); if (!ok) return null; const tr = ok.closest('tr');
  return { txt: ok.textContent.trim(), send: !!tr.querySelector('[data-tf^="send|"]'), back: !!tr.querySelector('[data-tdback]'), h: Math.round(tr.getBoundingClientRect().height) }; })()"""
LINES = "[...document.querySelectorAll('.dc-wl')].map(w => [w.dataset.w, w.querySelector('.cnt').textContent.trim(), w.classList.contains('open')])"
CHIPS = "[...document.querySelectorAll('.dc-chip')].map(b => [b.dataset.f, +b.querySelector('.n').textContent, b.disabled])"
STRIP = "[...document.querySelectorAll('.dc-strip .dc-num')].map(a => [a.dataset.k, a.querySelector('.v').textContent.trim(), (a.querySelector('.s') || {}).textContent || ''])"
HEIGHTS = "['need', 'watch'].map(k => Math.round(document.querySelector('.dc-main .desk-grp[data-dg=' + k + ']').getBoundingClientRect().height))"
PHONE = """(() => { const a = document.querySelector('.dc-main .desk-grp[data-dg=need]').getBoundingClientRect(), b = document.querySelector('.dc-main .desk-grp[data-dg=watch]').getBoundingClientRect();
  return b.top >= a.bottom - 1 && document.documentElement.scrollWidth <= window.innerWidth + 1; })()"""
OD = '.dc-wl[data-w="Overdue To Do"]'


async def main():
    c = Check('calm desks 2026.11.13.6')
    async with app_session() as s:
        pg = s.page; J = s.js
        await J(SEED); await J("Store.flush()"); await pg.wait_for_timeout(300)
        await pg.set_viewport_size({'width': 1366, 'height': 900})
        await s.sign_in_as('apps-mgr', 'manager'); await s.go('#/todo'); await s.go('#/manager', 900)
        # 1. the number strip
        st = await J(STRIP)
        c('strip: the 5 Analyst Desk numbers, for the team', [x[0] for x in st] == ['score', 'ytd', 'todo', 'hd', 'sw'], st)
        td = dict((x[0], x) for x in st).get('todo', ['', '0', ''])
        c('strip: pending To Do with the delayed ones', int(td[1]) >= 12 and 'delayed' in td[2], td)
        # 2. Needs you: one list with chips
        ch = await J(CHIPS)
        c('Needs you: a chip for every kind, always shown', [x[0] for x in ch] == ['all', 'appr', 'qw', 'conf', 'proj', 'dir', 'work', 'ask'], ch)
        c('a kind with nothing is a grey 0 (not clickable)', all(x[2] for x in ch if x[0] != 'all' and x[1] == 0) and dict((x[0], x[1]) for x in ch)['qw'] == 1, ch)
        c('the quick win to approve is in the list, with Approve', await J("(() => { const g = document.querySelector('.dc-list .dc-grp[data-k=qw]'); return !!g && /Faster stock report/.test(g.innerText) && !!g.querySelector('[data-qwa]'); })()"))
        # 3. Watch: one panel of lines, as tall as Needs you
        ln = await J(LINES)
        c('Watch: the six lines, always shown', [x[0] if not x[0].startswith('Open help desk >') else 'HD' for x in ln] == ['Overdue To Do', 'Late work', 'Slipping', 'External follow-ups', 'HD', 'Projects at risk'], ln)
        c('Overdue To Do 12, closed until clicked', ln[0][1] == '12' and not ln[0][2], ln[0])
        c('nothing there = a green ✓ 0', any(x[1] == '✓ 0' for x in ln), ln)
        c('External follow-ups is a Watch line', dict((x[0], x[1]) for x in ln)['External follow-ups'] != '✓ 0', ln)
        hh = await J(HEIGHTS)
        c('Watch is as tall as Needs you', abs(hh[0] - hh[1]) <= 2, hh)
        await pg.click(OD + ' .dc-wh'); await pg.wait_for_timeout(200)
        c('click the line: its To Dos open, each with Ask for update', await pg.locator(OD + ' [data-nudge]').first.is_visible())
        c('…and Ask all for an update at the bottom', await pg.locator(OD + ' [data-nudgeall]').is_visible())
        await pg.screenshot(path=os.path.join(SHOTS, 'desk_calm.png'))
        await pg.click(OD + ' [data-nudgeall]'); await pg.wait_for_timeout(500)
        c('Ask all: every overdue To Do asked today', await J("Array.from({ length: 12 }, (_, i) => Store.get('bx' + i)).every(r => r.nudgedOn === U.todayStr() && r.nudgedBy === App.me)"))
        c('the line stays open after the page refreshes', await pg.locator(OD + '.open').count() == 1)
        # every item that needs doing has its button (2026.11.13.6)
        c('External follow-ups: ✓ Chased today and … on each follow-up', await pg.locator('.dc-wl[data-w="External follow-ups"] [data-fuqc]').count() >= 1 and await pg.locator('.dc-wl[data-w="External follow-ups"] [data-fuch]').count() >= 1)
        c('Slipping: a To Do due with no update has Ask for update', await pg.locator('.dc-wl[data-w="Slipping"] [data-nudge="bxr"]').count() == 1)
        await pg.click('.dc-wl[data-w="External follow-ups"] .dc-wh'); await pg.wait_for_timeout(200)
        before = await J("JSON.stringify(Store.get('bxf'))")
        await pg.click('.dc-wl[data-w="External follow-ups"] [data-fuqc="bxf"]'); await pg.wait_for_timeout(500)
        c('✓ Chased today logs the chase from the desk', await J("JSON.stringify(Store.get('bxf'))") != before and not await pg.locator('.modal').is_visible())
        # chips filter the list
        await pg.click('.dc-chip[data-f="qw"]'); await pg.wait_for_timeout(100)
        c('a chip shows only that kind', await J("[...document.querySelectorAll('.dc-grp')].every(g => g.hidden === (g.dataset.k !== 'qw'))"))
        await pg.click('.dc-chip[data-f="qw"]'); await pg.wait_for_timeout(100)
        c('…click it again for all', await J("document.querySelector('.dc-chip[data-f=all]').getAttribute('aria-pressed') === 'true'"))
        # phone: one column, nothing wider than the screen
        await pg.set_viewport_size({'width': 390, 'height': 844}); await s.go('#/todo'); await s.go('#/manager', 800)
        c('phone: Watch under Needs you, nothing wider than the screen', await J(PHONE))
        await pg.set_viewport_size({'width': 1366, 'height': 900})
        # Director Desk: the same, for all teams
        await s.sign_in_as('adam', 'director'); await s.go('#/todo'); await s.go('#/director/today', 900)
        ch = await J(CHIPS); ln = await J(LINES)
        c('Director: chips Decisions · Approvals · Follow-ups · From the AED · My projects · My tasks', [x[0] for x in ch] == ['all', 'dec', 'appr', 'fu', 'aed', 'proj', 'task'], ch)
        c('Director: the six Watch lines', [x[0] for x in ln] == ['Open tasks you assigned', 'Projects behind', 'Late work', 'Waiting on managers', 'Managers on leave', 'ManageEngine not imported'], ln)
        c('Director: Waiting on managers counts the quick win the APPS manager has not approved', dict((x[0], x[1]) for x in ln).get('Waiting on managers') == '1', ln)
        c('Director: Department numbers in the strip', await J("/Department score/.test(document.querySelector('.dc-strip').innerText)"))
        c('Director: the teams tables are still there', await pg.locator('.desk-grp[data-dg="team"] table').count() >= 1)
        # To Do List (a finished one waiting for the manager to confirm)
        await s.sign_in_as('layla', 'analyst'); await s.go('#/todo', 400)
        await J("Store.save(Object.assign({}, Store.get('bxr'), { status: 'In Progress', finish: U.todayStr() }))"); await J("Store.flush()")
        c('the finished To Do waits for review', await J("Store.get('bxr').status") == 'Ready for review')
        await s.sign_in_as('apps-mgr', 'analyst'); await s.go('#/home'); await s.go('#/todo', 800)
        heads = await J("[...document.querySelectorAll('#main table.tbl thead th')].map(x => x.textContent.trim())")
        c('To Do List: "Days left" instead of "Time"', 'Days left' in heads and 'Time' not in heads, heads)
        v = await J(DAYS)
        c('a late To Do shows a negative number', v.startswith('−') and v[1:].isdigit(), v)
        b = await J(BTNS)
        c('Confirm · Send on · Send back as small ✓ ➜ ↩ on one line', b is not None and b['txt'] == '✓' and b['send'] and b['back'] and b['h'] < 60, b)
        c('no page errors', not s.errors, '; '.join(s.errors[:3]))
    c.done(s)

run(main())
