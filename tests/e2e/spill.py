"""Shared by test_no_spill.py: fill the app with long names and texts, open every page (menu, tabs, sub-tabs, Admin,
a project's tabs) and report text that spills out of its box, or a page that scrolls sideways."""

SEED = r"""(() => { const t = U.todayStr(); const L = 'Pharmacy inventory reconciliation dashboard for the inpatient wards and outpatient clinics';
  const tt = Store.list('taskTypes')[0] || 'Support', src = Store.list('sources')[0] || 'Phone';
  const recs = [];
  recs.push({ c: 'project', id: 'sp-p1', key: 'PHX', name: L, team: 'apps', status: 'In Progress', manager: 'apps-mgr', members: ['yousef', 'layla'], start: U.addDays(t, -30), end: U.addDays(t, 60), category: 'Enhancement', priority: 'High', description: L + ' ' + L });
  recs.push({ c: 'project', id: 'sp-p3', name: L, team: 'apps', status: 'In Progress', manager: 'apps-mgr', members: ['yousef'], mode: 'lanes', start: t, lanes: [{ id: 'a', name: 'Waiting for the vendor to answer', color: '#d97706', cat: 'wait', limit: 1 }, { id: 'b', name: 'Being built and tested together', color: '#2563eb', cat: 'doing' }, { id: 'c', name: 'Delivered to the wards', color: '#16a34a', cat: 'done' }] });
  recs.push({ c: 'ptask', id: 'sp-l1', project: 'sp-p3', team: 'apps', n: 1, title: L, type: 'Task', points: 1, status: 'Waiting for the vendor to answer', assignee: 'yousef' }, { c: 'ptask', id: 'sp-l2', project: 'sp-p3', team: 'apps', n: 2, title: L, type: 'Task', points: 1, status: 'Waiting for the vendor to answer', assignee: 'layla' });
  recs.push({ c: 'project', id: 'sp-p2', name: 'Radiology label reprint automation with the vendor integration engine', team: 'apps', status: 'In Progress', manager: 'apps-mgr', members: ['yousef'], start: U.addDays(t, -10) });
  ['To Do', 'In Progress', 'In Progress', 'Done', 'Done', 'To Do'].forEach((st, i) => recs.push({ c: 'ptask', id: 'sp-t' + i, project: i % 2 ? 'sp-p2' : 'sp-p1', team: 'apps', n: i + 1, title: L + ' — part ' + (i + 1), type: ['Task', 'Story', 'Bug'][i % 3], points: i + 1, status: st, assignee: i % 2 ? 'yousef' : 'layla', due: U.addDays(t, i - 3), est: 8, actual: i, epic: i === 2 ? 'sp-t0' : '' }));
  for (let i = 0; i < 4; i++) recs.push({ c: 'todo', id: 'sp-td' + i, task: L + ' (' + i + ')', analyst: i % 2 ? 'yousef' : 'layla', team: 'apps', assigned: U.addDays(t, -i * 3), duration: 2, status: 'In Progress', priority: 'High', instruction: L, comment: L, ref: 'REQ-' + (9000 + i) });
  for (let i = 0; i < 4; i++) recs.push({ c: 'shadow', id: 'sp-sw' + i, analyst: i % 2 ? 'yousef' : 'layla', team: 'apps', date: U.addDays(t, -i), subject: L, minutes: 45 + i, taskType: tt, source: src, ref: 'REQ-' + (9000 + i), note: L });
  for (let i = 0; i < 3; i++) recs.push({ c: 'quickwin', id: 'sp-qw' + i, analyst: 'yousef', team: 'apps', date: U.addDays(t, -i), expected: t, subject: L, module: 'Pharmacy and medication management', status: 'In-Progress', type: 'Modification', impact: L });
  for (let i = 0; i < 3; i++) recs.push({ c: 'central', id: 'sp-ry' + i, analyst: 'yousef', team: 'apps', party: 'central', fuv: 2, n: 700 + i, date: U.addDays(t, -40 * i), subject: L, module: 'Pharmacy and medication management', status: 'Accepted', redmine: 'RM-' + (55000 + i), requester: 'Pharmacy department head office', chases: [{ on: t, how: 'Email', reply: L, by: 'yousef', at: Date.now() }] });
  recs.push({ c: 'mgrtask', id: 'sp-mt', task: L, manager: 'apps-mgr', team: 'apps', date: t, due: U.addDays(t, 5), urgency: 'High', comment: L });
  recs.push({ c: 'meeting', id: 'meeting-adam-sp', owner: 'adam', title: L, date: t, type: 'Team meeting', attendees: ['yousef', 'layla'], notes: L });
  recs.push({ c: 'request', id: 'sp-rq', type: 'other', title: L, requester: 'yousef', team: 'apps', from: t, status: 'Pending manager', details: L });
  recs.push({ c: 'announcement', id: 'sp-an', title: L, text: L + ' ' + L, team: '', at: Date.now() });
  recs.push({ c: 'info', id: 'sp-in', title: L, text: L + ' https://example.org/a/very/long/link/that/goes/on/and/on/without/any/break/at/all/' + 'x'.repeat(60), team: 'apps', createdBy: 'adam' });
  recs.push({ c: 'mytask', id: 'mytask-adam-sp', owner: 'adam', title: L, plan: t, status: 'Open', priority: 'Normal', note: L });
  Store.saveMany(recs); })()"""

DETECT = r"""(() => {
  const out = []; const W = innerWidth; const main = document.querySelector('#main'); if (!main) return out;
  const de = document.documentElement; if (de.scrollWidth > W + 1) out.push({ k: 'page scrolls sideways', over: de.scrollWidth - W, where: '', text: '' });
  const roots = [main, document.querySelector('#modal .modal')].filter(Boolean);
  const BOX = '.card, .kpi, .modal, .tbl-wrap, .li, .chip, .badge, .btn, button, .flt, .fld, .tab, .wl-same, .insights, .note';
  const scrolls = el => ['auto', 'scroll'].includes(getComputedStyle(el).overflowX);
  const name = el => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const seen = new Set(); const add = (k, el, over, text) => { const key = k + name(el) + text.slice(0, 30); if (seen.has(key)) return; seen.add(key); out.push({ k, over: Math.round(over), where: name(el), text }); };
  for (const root of roots) for (const el of root.querySelectorAll('*')) {
    if (!el.getClientRects().length || /^(svg|path|g|line|rect|circle|polyline|polygon|text|OPTION)$/i.test(el.tagName)) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    // 1) sticks out of the box it sits in (not inside a scrolling area between them)
    let a = el.parentElement, box = null, scrolled = false;
    while (a && a !== document.body) { if (scrolls(a)) { scrolled = true; break; } if (a.matches(BOX)) { box = a; break; } a = a.parentElement; }
    if (box && !scrolled) { const b = box.getBoundingClientRect(); const over = Math.max(r.right - b.right, b.left - r.left); if (over > 2) add(['hidden', 'clip'].includes(getComputedStyle(box).overflowX) ? 'cut off' : 'spills out of its box', el, over, (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)); }
  }
  // 2) a short word, key or date broken across lines (e.g. "PHX-" / "1", "08-" / "Nov-" / "2026")
  for (const root of roots) { const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = tw.nextNode())) { const t = n.textContent.trim(); if (!t || t.length > 24 || /\s/.test(t) || t.length < 3) continue; const pe = n.parentElement; if (!pe || !pe.getClientRects().length || pe.closest('svg, option, select')) continue;
      const rg = document.createRange(); rg.selectNodeContents(n); const lines = new Set([...rg.getClientRects()].map(x => Math.round(x.top))); if (lines.size > 1) add('word broken across lines', pe, 0, t); } }
  return out;
})()"""

LINKS = r"""(() => [...new Set([...document.querySelectorAll('nav a[href^="#/"], #main .tabs a[href^="#/"], #main .adm-sub a[href^="#/"], #main .adm-tabs a[href^="#/"], #main a.tab[href^="#/"]')].map(a => a.getAttribute('href').split('?')[0]))])()"""

async def crawl(s, widths, extra=()):
    """→ { route: [problems…] } for each width"""
    pg = s.page; found = {}
    await s.js(SEED); await s.js("Store.flush()"); await pg.wait_for_timeout(400)
    for w in widths:
        await pg.set_viewport_size({'width': w, 'height': 900})
        await s.go('#/home', 400)
        todo = list(dict.fromkeys(list(await s.js(LINKS)) + list(extra))); done = set()
        while todo:
            r = todo.pop(0)
            if r in done or 'logout' in r: continue
            done.add(r)
            await s.go('#/about', 120); await s.go(r, 450)
            probs = await s.js(DETECT)
            if probs: found.setdefault(r, []).extend([dict(p, w=w) for p in probs])
            # in-page tabs that are buttons, not links (a project's tabs, Follow-ups / Summary …)
            n_in = await s.js("document.querySelectorAll('#main .tabs a:not([href^=\"#/\"])').length")
            for i in range(min(n_in, 12)):
                try:
                    name = await s.js(f"(a => a ? (a.click(), a.textContent.trim()) : '')(document.querySelectorAll('#main .tabs a:not([href^=\"#/\"])')[{i}])")
                except Exception: continue
                await pg.wait_for_timeout(350)
                probs = await s.js(DETECT)
                if probs: found.setdefault(r + ' › ' + name, []).extend([dict(p, w=w) for p in probs])
            for n in await s.js(LINKS):
                if n not in done and n not in todo and len(done) + len(todo) < 260: todo.append(n)
        # the forms and windows (long texts inside them)
        wins = ["UI.editRecord('todo', Store.get('sp-td0'))", "UI.editRecord('shadow', Store.get('sp-sw0'))", "UI.editRecord('quickwin', Store.get('sp-qw0'))",
                "UI.editRecord('central', Store.get('sp-ry0'))", "UI.editRecord('ptask', Store.get('sp-t0'))", "UI.editRecord('project', Store.get('sp-p1'))",
                "UI.editRecord('mgrtask', Store.get('sp-mt'))", "UI.editRecord('todo', {})", "UI.editRecord('shadow', {})", "UI.editRecord('quickwin', {})",
                "Conv.start(Store.get('sp-sw1'))", "WhatsNew.show()", "UI.viewsDialog('todo')", "WorkLinks.pick(Store.get('sp-sw0'))"]
        for wjs in wins:
            await s.go('#/home', 300)
            try: await s.js(wjs)
            except Exception as e: found.setdefault('window: ' + wjs, []).append({'k': 'error', 'over': 0, 'where': str(e)[:80], 'text': '', 'w': w}); continue
            await pg.wait_for_timeout(450)
            probs = await s.js(DETECT)
            if probs: found.setdefault('window: ' + wjs, []).extend([dict(p, w=w) for p in probs])
            await s.js('UI.closeModal()')
        print(f'  {w} px: {len(done)} pages and {len(wins)} windows checked')
    return found
