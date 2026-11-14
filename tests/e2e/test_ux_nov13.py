"""2026.11.13.1 — easier to use: day-first date boxes, shorter forms (empty manager boxes hidden, More details on project
tasks, no Sprint box without sprints), lists (text width, fixed buttons column, whole words in boxes), Manager Desk
order and no repeated tiles, Analyst Desk glance without repeats, Admin Home month-lock rule, one "In progress",
short names in name boxes, 🔎 Search (Ctrl+K) and ＋ New."""
from harness import app_session, Check, run, SHOTS

SEED = r"""(() => { const t = U.todayStr();
  Store.saveMany([
    { c: 'project', id: 'ux-k', key: 'UXK', name: 'Kanban ward labels', team: 'apps', status: 'In Progress', manager: 'apps-mgr', members: ['yousef'], mode: 'kanban', start: t },
    { c: 'project', id: 'ux-s', key: 'UXS', name: 'Scrum order sets', team: 'apps', status: 'In Progress', manager: 'apps-mgr', members: ['yousef'], mode: 'scrum', start: t },
    { c: 'ptask', id: 'ux-t1', project: 'ux-k', team: 'apps', n: 1, title: 'Print the ward labels', type: 'Task', points: 1, status: 'To Do', assignee: 'yousef', due: U.addDays(t, 2) },
    { c: 'ptask', id: 'ux-t2', project: 'ux-k', team: 'apps', n: 2, title: 'Check label sizes', type: 'Task', points: 1, status: 'To Do', assignee: 'yousef', due: U.addDays(t, 3), est: 4 },
    { c: 'todo', id: 'ux-td', task: 'Fix the discharge template', analyst: 'yousef', team: 'apps', assigned: U.addDays(t, -1), duration: 3, status: 'In Progress', priority: 'High' },
    { c: 'quickwin', id: 'ux-qw', analyst: 'yousef', team: 'apps', date: t, expected: U.addDays(t, 2), subject: 'Faster pharmacy stock report', module: 'Pharmacy', status: 'In-Progress', type: 'Modification' },
    { c: 'central', id: 'ux-fu', analyst: 'yousef', team: 'apps', party: 'central', fuv: 2, n: 950, date: t, subject: 'Radiology label reprint automation with the vendor integration engine for every ward', module: 'Radiology', status: 'Accepted', redmine: 'RM-9' },
  ]); })()"""

async def main():
    c = Check('ux 2026.11.13.1')
    async with app_session() as s:
        pg = s.page
        await s.js(SEED); await s.js("Store.flush()"); await pg.wait_for_timeout(300)

        # ---- day-first date boxes
        await s.sign_in_as('apps-mgr', 'analyst'); await s.go('#/home'); await s.go('#/todo', 500)
        await s.js("UI.editRecord('todo', null)"); await pg.wait_for_selector('#recform')
        today = await s.js("U.todayStr()")
        c('date box shows day first (13-Nov-2026 style)', await pg.input_value('#f_assigned__t') == await s.js(f"U.fmtDate('{today}')"))
        await pg.fill('#f_assigned__t', '3/12/2026'); await pg.press('#f_assigned__t', 'Tab')
        c('typing 3/12/2026 means 3 December', await s.js("document.querySelector('#recform [name=assigned]').value") == '2026-12-03')
        await pg.fill('#recform [name=assigned]', '2026-12-05')
        c('a date set on the real box shows in the text box', await pg.input_value('#f_assigned__t') == '05-Dec-2026')
        await pg.fill('#f_assigned__t', '31/02/2026'); await pg.press('#f_assigned__t', 'Tab')
        c('a date that does not exist is refused (value kept)', await s.js("document.querySelector('#recform [name=assigned]').value") == '2026-12-05')
        c('parse: today / 13 nov / 2026-11-13', await s.js("DateBox.parse('today') === U.todayStr() && DateBox.parse('13 nov 2026') === '2026-11-13' && DateBox.parse('2026-11-13') === '2026-11-13' && DateBox.parse('x') === null && DateBox.parse('') === ''"))
        # ---- a new To Do: no Finish date / Analyst update
        c('new To Do: no Finish date or Analyst update box', await pg.locator('#recform [name=finish]').count() == 0 and await pg.locator('#recform [name=comment]').count() == 0)
        await s.js("UI.closeModal()")
        await s.js("UI.editRecord('todo', Store.get('ux-td'))"); await pg.wait_for_selector('#recform')
        c('existing To Do: Finish date and Analyst update are there', await pg.locator('#recform [name=finish]').count() == 1 and await pg.locator('#recform [name=comment]').count() == 1)
        await s.js("UI.closeModal()")

        # ---- project task form: More details, no Sprint without sprints
        await s.js("UI.editRecord('ptask', Store.get('ux-t1'))"); await pg.wait_for_selector('#recform')
        c('Kanban task: no Sprint box (project has no sprints)', await pg.locator('#recform [name=sprint]').count() == 0)
        c('Kanban task: points / hours / subtask under More details (closed when empty)', await s.js("(() => { const d = document.querySelector('#recform details.more-fields'); return !!d && !d.open && !!d.querySelector('[name=points]') && !!d.querySelector('[name=est]') && !!d.querySelector('[name=parent]'); })()"))
        await s.js("UI.closeModal()")
        await s.js("UI.editRecord('ptask', Store.get('ux-t2'))"); await pg.wait_for_selector('#recform')
        c('More details opens by itself when a box in it holds a value', await s.js("document.querySelector('#recform details.more-fields').open"))
        await pg.fill('#recform [name=title]', 'Check label sizes (A6)'); await pg.click('[data-save]'); await pg.wait_for_selector('#recform', state='detached', timeout=10000)
        c('saving keeps the folded values', await s.js("Store.get('ux-t2').est") == 4 and await s.js("Store.get('ux-t2').title") == 'Check label sizes (A6)')
        await s.js("UI.editRecord('ptask', { project: 'ux-s', team: 'apps' })"); await pg.wait_for_selector('#recform')
        c('Scrum task: Story points and Sprint on top', await s.js("(() => { const f = document.querySelector('#recform'); const sp = f.querySelector('[name=sprint]'), pt = f.querySelector('[name=points]'); return !!sp && !!pt && !sp.closest('details') && !pt.closest('details'); })()"))
        await s.js("UI.closeModal()")

        # ---- Manager Desk
        t = await s.go('#/manager', 600)
        c('Manager Desk: no KPI tiles (2026.11.13.3: one row per person instead)', await pg.locator('#main .kpi').count() == 0)
        order = await s.js("(() => { const m = document.querySelector('#main').innerHTML; return [m.indexOf('data-dg=\"need\"'), m.indexOf('Quick wins waiting for approval'), m.indexOf('data-dg=\"team\"')]; })()")
        c('Manager Desk: Needs you → things to act on → The team', order[0] >= 0 and 0 <= order[1] < order[2] and order[0] < order[1])

        # ---- names, statuses, lists
        await s.go('#/home'); await s.go('#/quickwins', 500)
        c('Quick Wins: "In-Progress" shows as "In progress"', 'In progress' in await pg.inner_text('#main') and 'In-Progress' not in await s.js("[...document.querySelectorAll('#main select.inl option:checked')].map(o => o.textContent).join('|')"))
        c('name boxes use short names', await s.js("UI.memberOptions('yousef').includes('>Yousef<')") and not await s.js("UI.memberOptions('yousef').includes('Qahtani')"))
        await s.sign_in_as('yousef', 'analyst'); await s.go('#/home'); await s.go('#/central', 600)
        c('follow-up list: Subject keeps a readable width', await s.js("(() => { const th = [...document.querySelectorAll('#main th')].find(x => /subject/i.test(x.textContent)); return !!th && th.classList.contains('tx') && th.getBoundingClientRect().width >= 200; })()"))
        c('follow-up list: buttons column fixed at the right edge', await s.js("(() => { const td = document.querySelector('#main td.act'); return !!td && getComputedStyle(td).position === 'sticky'; })()"))
        c('follow-up list: Step box shows the whole word', await s.js("(() => { const s = document.querySelector('#main select.inl'); return !!s && s.scrollWidth <= s.clientWidth + 2 && s.getBoundingClientRect().width >= 90; })()"))
        await pg.screenshot(path=f'{SHOTS}/ux_nov13_followups.png')

        # ---- analyst's new quick win: no empty manager boxes
        await s.go('#/home'); await s.go('#/quickwins', 500)
        await s.js("UI.editRecord('quickwin', null)"); await pg.wait_for_selector('#recform')
        lab = await s.js("[...document.querySelectorAll('#recform .fld > label')].map(l => l.textContent).join('|')")
        c('analyst new quick win: no empty manager boxes (QW ID, approval, comment)', 'QW ID' not in lab and 'Manager approval' not in lab and 'Manager comment' not in lab, lab)
        await pg.screenshot(path=f'{SHOTS}/ux_nov13_qw.png'); await s.js("UI.closeModal()")

        # ---- Analyst Desk glance
        t = await s.go('#/home', 600)
        c('Analyst Desk: glance does not repeat My work', 'Due in the next 7 days' not in t and await s.js("(() => { const g = [...document.querySelectorAll('#main .card')].find(x => /at a glance/.test(x.textContent)); return !!g && !/Print the ward labels/.test(g.textContent); })()"))

        # ---- 🔎 Search and ＋ New
        await pg.keyboard.press('Control+k'); await pg.wait_for_selector('#fq')
        await pg.fill('#fq', 'RYD-950'); await pg.wait_for_timeout(200)
        c('Search finds a follow-up by its key', 'RYD-950' in await pg.inner_text('#fres'))
        await pg.fill('#fq', 'ward labels'); await pg.wait_for_timeout(200)
        r = await pg.inner_text('#fres')
        c('Search finds projects and project tasks by words', 'Kanban ward labels' in r and 'Print the ward labels' in r)
        await pg.fill('#fq', 'UXK-1'); await pg.wait_for_timeout(200); await pg.press('#fq', 'Enter'); await pg.wait_for_selector('#recform')
        c('Enter opens the item', 'Print the ward labels' in await pg.input_value('#recform [name=title]'))
        await s.js("UI.closeModal()")
        c('Search: an analyst without "See other people\'s records" does not find others\' To Dos', await s.js("(() => { const can = App.can('viewOthers'); const hits = Find.match(Find.items(), 'discharge template'); return can || hits.every(x => x.kind !== 'To Do' || Store.get('ux-td').analyst === App.me); })()"))
        await pg.click('#gnew'); await pg.wait_for_selector('.new-grid')
        nw = await pg.inner_text('.new-grid')
        c('＋ New: an analyst gets shadow work, quick win, personal task — not To Do', 'Shadow work' in nw and 'Quick win' in nw and 'Personal task' in nw and 'To Do\n' not in nw + '\n' and not any(l.strip() == 'To Do' for l in nw.split('\n')))
        await pg.screenshot(path=f'{SHOTS}/ux_nov13_new.png')
        await pg.locator('.new-opt', has_text='Project task').click(); await pg.wait_for_timeout(300)
        c('＋ New → Project task asks which project (two projects)', await pg.locator('[data-np]').count() == 2)
        await pg.locator('[data-np="ux-k"]').click(); await pg.wait_for_selector('#recform')
        c('… and opens the task form in that project', await s.js("UI._recProject") == 'ux-k')
        await s.js("UI.closeModal()")

        # ---- Admin Home: one month-lock rule
        await s.sign_in_as('adam', 'admin'); await s.go('#/home'); await s.go('#/admin', 600)
        same = await s.js("""(() => { const ck = Admin.checklist().map(x => x.bad || x.label).join('|'); const tile = Admin.health().find(x => x.k === 'lock');
          const pm = U.addDays(U.todayStr().slice(0, 8) + '01', -1).slice(0, 7); const [y, m] = pm.split('-').map(Number);
          return { n: tile.n, rule: Admin.unlockedTeams(y, m).length, ckLock: /not locked yet/.test(ck), ckBackup: /Backup/.test(ck) }; })()""")
        c('month-lock tile uses the shared rule', same['n'] == same['rule'] and same['n'] > 0)
        c('checklist no longer repeats month lock or backup', not same['ckLock'] and not same['ckBackup'])
        c('no page errors', not s.errors, '; '.join(s.errors[:3]))
    c.done(s)

run(main())
