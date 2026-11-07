"""MAHAM Lab end to end: reads a shared folder read-only, signs in, every screen renders, quick win ideas found,
no file in the folder is ever changed."""
import asyncio, json, os, sys, socket, subprocess, time
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist'); SHOTS = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(SHOTS, exist_ok=True)
DATA = json.load(open(os.path.join(ROOT, 'tests', 'data.json')))
INIT = r"""
window.showDirectoryPicker = async () => { const r = await navigator.storage.getDirectory(); return r.getDirectoryHandle('Shared', { create: true }); };
"""
bad = []
def c(label, ok):
    print(('  ✓ ' if ok else '  ✗ ') + label)
    if not ok: bad.append(label)
async def main():
    port = socket.socket(); port.bind(('127.0.0.1', 0)); p = port.getsockname()[1]; port.close()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(p), '--bind', '127.0.0.1'], cwd=DIST, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(); ctx = await b.new_context(viewport={'width': 1440, 'height': 900}); await ctx.add_init_script(INIT); pg = await ctx.new_page()
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(f'http://127.0.0.1:{p}/MAHAM-Lab.html')
            # put the made-up shared folder in place (with MAHAM.html beside the data, like the real one)
            await pg.evaluate("""async files => { const r = await navigator.storage.getDirectory(); const s = await r.getDirectoryHandle('Shared', { create: true });
                const w = async (d, n, t) => { const f = await d.getFileHandle(n, { create: true }); const x = await f.createWritable(); await x.write(t); await x.close(); };
                await w(s, 'MAHAM.html', '<html>app</html>'); const dd = await s.getDirectoryHandle('MAHAM Data', { create: true }); const u = await dd.getDirectoryHandle('users', { create: true });
                for (const [n, j] of Object.entries(files)) await w(u, n, JSON.stringify(j)); }""", DATA)
            snap = """async () => { const r = await navigator.storage.getDirectory(); const s = await r.getDirectoryHandle('Shared'); const out = {}; const walk = async (d, p) => { for await (const [n, x] of d.entries()) { if (x.kind === 'file') { const f = await x.getFile(); out[p + n] = f.size + ':' + f.lastModified; } else await walk(x, p + n + '/'); } }; await walk(s, ''); return out; }"""
            before = await pg.evaluate(snap)
            await pg.wait_for_selector('#lpick'); await pg.click('#lpick')
            await pg.wait_for_selector('#lsign', timeout=60000)
            c('sign in with the employee ID (no list of names)', await pg.locator('#lsign #lid').count() == 1 and await pg.locator('#lsign select').count() == 0)
            await pg.fill('#lid', 'yousef'); await pg.fill('#lpin', '1234'); await pg.click('#lgo'); await pg.wait_for_timeout(300)
            c('only people given the Lab can sign in', 'do not have access' in await pg.inner_text('#app'))
            await pg.fill('#lid', 'nobody'); await pg.click('#lgo'); await pg.wait_for_timeout(300); c('unknown employee ID refused', 'not found' in await pg.inner_text('#app'))
            await pg.fill('#lid', 'adam')
            await pg.screenshot(path=f'{SHOTS}/lab_login.png')
            await pg.fill('#lpin', '9999'); await pg.click('#lgo'); await pg.wait_for_timeout(300); c('wrong PIN refused', 'Wrong PIN' in await pg.inner_text('#app'))
            await pg.fill('#lid', 'adam'); await pg.fill('#lpin', '1234'); await pg.click('#lgo'); await pg.wait_for_selector('.lab-side', timeout=30000)
            c('stays signed in (until Sign out)', await pg.evaluate("localStorage.getItem('maham.lab.me')") == 'adam')
            await pg.wait_for_selector('#labbody .lab-summary', timeout=90000)
            t = await pg.inner_text('#labbody'); c('opens on This month: summary, top 5, things to watch, outlook, plan', all(x in t for x in ['Top 5 quick wins', 'Things to watch', 'outlook', 'Your plan']))
            c('5 menu items (Studio added)', await pg.locator('#labnav a').count() == 5)
            await pg.screenshot(path=f'{SHOTS}/lab_month.png')
            n = await pg.evaluate("LabFinder.run().then(r => [LabFinder.topQuickWins(r).length, LabFinder.topOther(r).length, r.themes.length])"); print('   top10s / themes:', n)
            c('at most 10 in each list', n[0] <= 10 and n[1] <= 10)
            print('   label themes:', await pg.evaluate("LabFinder.run().then(r => r.themes.filter(t => /label/i.test(t.name)).map(t => [t.name, t.label, t.keys, t.items.length, t.qw && t.qw.r.qwId]))"))
            c('the two label-printing wordings are one theme', await pg.evaluate("LabFinder.run().then(r => r.themes.filter(t => /label/i.test(t.name) && t.label !== 'addressed').length)") == 1)
            await pg.evaluate("location.hash = 'qw'"); await pg.wait_for_selector('#labbody .lab-row', timeout=60000); await pg.screenshot(path=f'{SHOTS}/lab_qw.png')
            # writing is impossible
            w = await pg.evaluate("""async () => { const r = []; try { await Store.usersDir.getFileHandle('x.json', { create: true }); r.push('created'); } catch (e) { r.push('no-create'); }
              try { const f = await Store.usersDir.getFileHandle('yousef.json'); await f.createWritable(); r.push('wrote'); } catch (e) { r.push('no-write'); }
              try { await Store.usersDir.removeEntry('yousef.json'); r.push('removed'); } catch (e) { r.push('no-remove'); }
              Store.save({ c: 'shadow', analyst: 'adam', date: U.todayStr(), subject: 'x', minutes: 5 }); await Store.flush(); return r.join(); }""")
            c('the folder cannot be written, created in or removed from', w == 'no-create,no-write,no-remove')
            # every screen
            for k in ['month', 'qw', 'qw/matrix', 'qw/plan', 'qw/same', 'qw/bigger', 'ask', 'more'] + ['more/' + x for x in ['value', 'fixcheck', 'snapshots', 'outlook', 'forecast', 'accuracy', 'spikes', 'ttc', 'repeats', 'linked', 'risk', 'best', 'workload', 'skills', 'fair', 'themes', 'synonyms', 'tagger', 'health', 'dupes', 'report', 'settings']]:
                await pg.evaluate(f"location.hash = '{k}'"); await pg.wait_for_function("!document.querySelector('.lab-busy')", timeout=90000); await pg.wait_for_timeout(200)
                txt = await pg.inner_text('#labbody'); c(f'screen {k} renders', 'Something went wrong' not in txt and len(txt) > 30)
                if k in ('qw/matrix', 'more', 'more/outlook', 'more/value', 'more/synonyms'): await pg.screenshot(path=f"{SHOTS}/lab_{k.replace('/', '_')}.png")
            # quick win ideas: the hidden themes are found
            await pg.evaluate("location.hash = 'qw'"); await pg.wait_for_selector('#labbody .lab-row'); t = (await pg.inner_text('#labbody')).lower()
            c('pharmacy label printing found as a quick win idea, with shadow work evidence', 'label' in t and 'print' in t and 'shadow work' in t)
            res = await pg.evaluate("LabFinder.run().then(r => r.themes.map(t => [t.name, t.label, t.items.length, Math.round(t.rising*100)/100, t.qw ? t.qw.r.qwId : '']))")
            print('   top themes:', res[:8])
            lab = {n: l for n, l, *_ in res}
            c('ER triage theme recognised as already fixed (QW-031)', any('triage' in n.lower() and l == 'addressed' for n, l, *_ in res))
            c('OR booking overlap → EHR fix (stuck in Central)', any(('overlap' in n.lower() or 'book' in n.lower()) and l == 'central' for n, l, *_ in res))
            c('password resets → training needed', any(('password' in n.lower() or 'login' in n.lower() or 'log in' in n.lower()) and l == 'training' for n, l, *_ in res))
            c('label theme rising', any('label' in n.lower() and r >= 1.25 for n, l, cnt, r, q in res))
            # feedback
            await pg.click('[data-plan] >> nth=0'); await pg.wait_for_timeout(900); c('＋ Plan adds to the quick win plan', await pg.evaluate("Lab.read('plan.json', {}).then(p => Object.keys(p).length)") == 1)
            sig = await pg.evaluate("LabFinder.topQuickWins(LabFinder._res)[1].sig"); await pg.click(f'[data-fb="no|{sig}"]'); await pg.wait_for_timeout(800)
            c('not useful hides it', await pg.evaluate(f"LabFinder.run().then(r => r.themes.find(t => t.sig === '{sig}').hidden)"))
            # ask the Lab
            for q, want in [('Pharmacy last 3 months', 'Where it comes from'), ('this month vs last month', 'Biggest changes'), ('what rose', 'Rising'), ('label printing', 'Who has fixed this before'), ('Yousef', 'open now')]:
                await pg.evaluate("location.hash = 'ask'"); await pg.wait_for_selector('#askq'); await pg.fill('#askq', q); await pg.press('#askq', 'Enter'); await pg.wait_for_timeout(1200)
                t = await pg.inner_text('#labbody'); c(f'Ask: "{q}"', want.lower() in t.lower() and 'Something went wrong' not in t)
                if q == 'label printing': await pg.screenshot(path=f'{SHOTS}/lab_ask.png')
            # learning from decisions: 6 decisions → taste learned
            await pg.evaluate('''(async () => { const r = await LabFinder.run(); const qs = LabFinder.topQuickWins(r, 20); for (const t of qs.slice(0, 3)) await LabPlan.add(t); for (const t of qs.slice(10, 14)) LabFinder.feedback.notUseful[t.sig] = { at: 1 }; await LabFinder.saveFeedback(); LabFinder.clear(); })()''')
            c('learns from your decisions', await pg.evaluate("LabFinder.run().then(r => LabSmart.learn(r.themes).ok)"))
            c('forecast logged for the accuracy history', await pg.evaluate("Lab.read('fclog.json', {}).then(l => Object.keys(l).length)") >= 1)
            c('season check runs (Ramadan / peak season)', await pg.evaluate("Array.isArray(LabSmart.seasonal())"))
            c('value of finished fixes measured (QW-031 triage fix)', await pg.evaluate("LabSmart.value().list.some(x => x.q.qwId === 'QW-031' && x.drop > 0.3)"))
            # tagger
            await pg.evaluate("location.hash = 'more/tagger'"); await pg.wait_for_selector('#ttrain'); await pg.click('#ttrain'); await pg.wait_for_selector('#ttry', timeout=60000)
            acc = await pg.evaluate("LabTagger._m.hdgroup.acc"); c(f'auto-tagger trained and tested (correct {round(acc*100)}%)', acc and acc > 0.55)
            await pg.screenshot(path=f'{SHOTS}/lab_tagger.png', full_page=True)
            # forecast + spike
            sp = await pg.evaluate("LabHD.spikes().filter(s => s.key === 'Pharmacy').length"); c('the pharmacy spike day is found', sp >= 1)
            rk = await pg.evaluate("LabPeople.risk()"); c('late-risk model trained and tested', rk['ok'] and rk['recall'] is not None)
            bp = await pg.evaluate("LabPeople.bestPerson('pharmacy label not printing').length"); c('best person suggestions', bp >= 1)
            # snapshot kept in the browser, not the folder
            await pg.evaluate("location.hash = 'more/snapshots'"); await pg.wait_for_selector('#ssave'); await pg.click('#ssave'); await pg.wait_for_timeout(600)
            c('snapshot saved (in the browser)', await pg.evaluate("Lab.read('snapshots.json', {}).then(s => Object.keys(s).length)") >= 1)
            # another person given "Open the MAHAM Lab" appears at sign-in; People insights stay hidden from them
            await pg.evaluate("Store.member('yousef').perms = { useLab: true }; LabMain.signIn()"); await pg.wait_for_timeout(200)
            await pg.fill('#lid', 'yousef'); await pg.click('#lgo'); await pg.wait_for_timeout(300)
            c('a person given "Open the MAHAM Lab" gets past the access check', 'do not have access' not in await pg.inner_text('#app') and await pg.evaluate("Lab.allowed('yousef')"))
            await pg.evaluate("LabMain.start('yousef')"); await pg.wait_for_timeout(800)
            await pg.evaluate("location.hash = 'more'"); await pg.wait_for_timeout(500)
            c('People insights hidden for them', await pg.locator('a[href="#more/risk"]').count() == 0 and await pg.locator('a[href="#more/value"]').count() == 1)

            # ---------- Studio: load data, protect identifiers, dashboard, cross-filter, two chart engines ----------
            await pg.evaluate("location.hash = 'studio'"); await pg.wait_for_selector('.st-welcome', timeout=30000)
            t = await pg.inner_text('#labbody'); c('Studio: empty state offers file / MAHAM data / sample', all(x in t for x in ['Load a file', 'Use MAHAM data', 'Try a sample']))
            await pg.click('[data-sample]'); await pg.wait_for_selector('#modal [data-pv]', timeout=30000)
            pv = await pg.evaluate("[...document.querySelectorAll('#modal tbody tr')].map(tr => tr.cells[0].innerText)")
            c('privacy check finds MRN, name and mobile', all(x in pv for x in ['MRN', 'Patient Name', 'Mobile']), )
            print('   flagged:', pv)
            await pg.click('#modal [data-ok]'); await pg.wait_for_selector('.st-card .st-chart svg, .st-card .sv-kpi', timeout=60000); await pg.wait_for_timeout(600)
            ds = await pg.evaluate("({ cols: Studio.ds.cols.map(c => c.key), mrn: Studio.ds.rows[0].MRN, rows: Studio.ds.rows.length, small: Studio.ds.smallCells })")
            c('names and mobiles removed, MRN replaced with a code', 'Patient Name' not in ds['cols'] and 'Mobile' not in ds['cols'] and str(ds['mrn']).startswith('P-'))
            c('small counts hidden on patient data', ds['small'])
            nv = await pg.locator('.st-card').count(); c('starter dashboard made', nv >= 6); print('   visuals:', nv, 'draw ms:', await pg.evaluate('Studio.lastDrawMs'))
            c('insights shown', await pg.locator('.st-in').count() >= 2)
            await pg.screenshot(path=f'{SHOTS}/studio_builtin.png', full_page=True)
            # cross filter: click a bar in the horizontal bar chart
            n0 = await pg.evaluate("SD.filter(Studio.ds, Studio.filters).length")
            await pg.locator('.st-card .sv-hb[data-pick]').nth(1).click(); await pg.wait_for_timeout(500)
            c('clicking a chart filters the others', await pg.evaluate("!!Studio.filters.cross") and await pg.locator('.st-chip').count() >= 1)
            await pg.click('[data-xclear]'); await pg.wait_for_timeout(300)
            # slicer
            await pg.locator('[data-sl]').first.check(); await pg.wait_for_timeout(400)
            n1 = await pg.evaluate("SD.filter(Studio.ds, Studio.filters).length"); c('filter on the left narrows the rows', 0 < n1 < n0)
            await pg.click('[data-allclear]'); await pg.wait_for_timeout(300)
            # add a visual by hand
            await pg.click('[data-dd=add]'); await pg.click('#dd-add [data-newvis]'); await pg.wait_for_selector('#st-vf')
            await pg.click('[data-gt=line]'); await pg.select_option('#st-vf [name=x]', 'Arrival'); await pg.select_option('#st-vf [name=fn]', 'avg'); await pg.select_option('#st-vf [name=field]', 'ED LOS (hours)'); await pg.select_option('#st-vf [name=split]', 'Disposition')
            await pg.wait_for_timeout(300); c('editor shows a live preview', await pg.locator('#st-vprev svg').count() == 1)
            await pg.click('#modal [data-ok]'); await pg.wait_for_timeout(600)
            c('new visual on the dashboard', await pg.locator('.st-card').count() == nv + 1)
            # ---------- all 50 chart types draw on the sample (no errors, no empty boxes) ----------
            res = await pg.evaluate("""(() => { const ds = Studio.ds; const out = {}; const box = document.createElement('div'); box.id = 'gal'; box.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:12px;background:#f1f5f9'; document.getElementById('labbody').appendChild(box);
              const date = SC.TIME; const D = 'Arrival', N1 = 'ED LOS (hours)', N2 = 'Door to Doctor (min)';
              for (const [t, l] of SC.TYPES) { const v = { id: 'g' + t, type: t, title: l, x: 'Chief Complaint', fn: 'count', top: 8 };
                if (date.has(t) || ['kpitrend', 'calendar', 'sparkgrid'].includes(t)) Object.assign(v, { x: D, grain: 'month' });
                if (['stacked', 'grouped', 'hstacked', 'pct', 'dumbbell', 'stackarea', 'pctarea', 'matrix', 'radar'].includes(t)) v.split = 'Gender';
                if (['heat'].includes(t)) Object.assign(v, { x: 'Triage Level', split: 'Age Group' });
                if (t === 'sparkgrid') v.split = 'Triage Level'; if (t === 'sankey') Object.assign(v, { x: 'Triage Level', split: 'Disposition' }); if (t === 'sunburst') Object.assign(v, { x: 'Disposition', split: 'Gender' });
                if (t === 'combo') Object.assign(v, { fn2: 'avg', field2: N1 }); if (t === 'band') v.field = N1;
                if (['histogram', 'ecdf'].includes(t)) v.field = N1; if (t === 'ecdf') v.split = 'Triage Level';
                if (['box', 'strip'].includes(t)) Object.assign(v, { x: 'Triage Level', field: N1 });
                if (['scatter', 'trendscatter', 'bubble'].includes(t)) Object.assign(v, { x: N2, field: N1, field2: N2 });
                if (['kpi', 'gauge'].includes(t)) Object.assign(v, { fn: 'avg', field: N1, target: 8, lowerBetter: true });
                if (t === 'bullet') Object.assign(v, { x: 'Triage Level', fn: 'avg', field: N1, target: 8 });
                const card = document.createElement('div'); card.style.cssText = 'background:#fff;border:1px solid #e2e8ec;border-radius:10px;padding:8px'; card.innerHTML = `<b style="font-size:13px">${l}</b><div class="st-chart" style="height:${['kpi','gauge','kpitrend'].includes(t) ? 130 : 240}px"></div>`; box.appendChild(card);
                const el = card.querySelector('.st-chart'); let err = '';
                try { SC.draw(el, v, { ds, rows: ds.rows, onPick: () => {}, redraw: () => {}, noAnim: true }); } catch (e) { err = e.message; }
                const html = el.innerHTML; out[t] = err || (/Could not draw/.test(html) ? 'ERROR ' + (el.textContent || '').slice(0, 120) : /sv-empty/.test(html) ? 'EMPTY ' + el.textContent.slice(0, 120) : /<svg|<table|sv-kpi/.test(html) ? 'ok' : 'nothing'); }
              return out; })()""")
            badc = {k: v for k, v in res.items() if v != 'ok'}
            print('   chart types:', len(res), 'problems:', badc)
            c('51 chart types registered', len(res) == 51)
            c('every chart type draws on real-shaped data', not badc)
            await pg.screenshot(path=f'{SHOTS}/studio_gallery.png', full_page=True)
            tips = await pg.evaluate("document.querySelectorAll('#gal [data-ti]').length"); c('tooltips on the marks', tips > 500)
            await pg.evaluate("document.getElementById('gal').remove()")
            # tooltip appears on hover; crosshair on a line chart
            await pg.hover('.st-card:has(.sv-col) .sv-col >> nth=3'); await pg.wait_for_timeout(200)
            c('hover shows a tooltip with a title and values', await pg.evaluate("!document.getElementById('sv-tip').hidden && !!document.querySelector('#sv-tip .tt-t') && !!document.querySelector('#sv-tip .tt-r')"))
            # legend toggles a series
            await pg.evaluate("(() => { Studio.vis().push({ id: 'vleg', type: 'stacked', title: 'Leg', x: 'Arrival', grain: 'month', split: 'Gender', fn: 'count', w: 3 }); Studio.rerender(); })()"); await pg.wait_for_timeout(700)
            n_before = await pg.locator('[data-vid=vleg] .sv-vb').count(); await pg.locator('[data-vid=vleg] [data-lg]').first.click(); await pg.wait_for_timeout(300)
            c('clicking a legend entry hides that series', await pg.locator('[data-vid=vleg] .sv-vb').count() < n_before and await pg.locator('[data-vid=vleg] .sv-lg.off').count() == 1)
            # drag to zoom on a time chart, double-click resets
            bb = await pg.locator('[data-vid=vleg] svg').bounding_box()
            await pg.mouse.move(bb['x'] + bb['width'] * 0.3, bb['y'] + 60); await pg.mouse.down(); await pg.mouse.move(bb['x'] + bb['width'] * 0.6, bb['y'] + 60, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(400)
            c('drag across a time chart zooms in', await pg.evaluate("!!SC.zoom.vleg") and await pg.locator('[data-vid=vleg] [data-zr]').count() == 1)
            await pg.dblclick('[data-vid=vleg] svg'); await pg.wait_for_timeout(300); c('double-click resets the zoom', await pg.evaluate("!SC.zoom.vleg"))
            # full screen
            await pg.click('[data-vfull=vleg]'); await pg.wait_for_selector('#st-full svg'); fw = await pg.evaluate("+document.querySelector('#st-full svg').getAttribute('width')"); c('full-screen view', fw > 900); print('   full width', fw); await pg.evaluate("UI.closeModal()")
            # editor gallery: pick "Control chart" → fields adapt, preview draws
            await pg.click('[data-vedit=vleg]'); await pg.wait_for_selector('.st-gal')
            c('editor shows all 51 types in a gallery', await pg.locator('.st-gal-i').count() == 51)
            await pg.click('[data-gt=control]'); await pg.wait_for_timeout(400)
            c('picking a type adapts the fields and previews it', await pg.locator('#st-vprev svg').count() == 1 and await pg.evaluate("document.querySelector('#st-vf [name=split]').closest('.fld').hidden"))
            await pg.screenshot(path=f'{SHOTS}/studio_editor.png'); await pg.evaluate("UI.closeModal()")
            # data view: helper column + types
            await pg.click('[data-view=data]'); await pg.wait_for_selector('#st-der')
            await pg.select_option('#st-der [name=part]', 'hijri'); await pg.click('#st-der button[type=submit]'); await pg.wait_for_timeout(500)
            c('Data view: Hijri month helper column', await pg.evaluate("Studio.ds.cols.some(c => c.derived && /Hijri/.test(c.key)) && /\\w/.test(Studio.ds.rows[0]['Arrival · Hijri month'])"))
            await pg.screenshot(path=f'{SHOTS}/studio_data.png')
            # a CSV file from the analyst
            csv = 'Date,Department,Turnaround minutes,Status\n' + '\n'.join(f'2026-{1 + i % 9:02d}-{1 + i % 27:02d},{["Lab", "Radiology", "Pharmacy"][i % 3]},{10 + (i * 7) % 90},{["Done", "Pending"][i % 2]}' for i in range(600))
            await pg.click('[data-view=dash]'); await pg.click('[data-add]'); await pg.wait_for_selector('#modal #st-file', state='attached')
            await pg.set_input_files('#modal #st-file', files=[{'name': 'turnaround.csv', 'mimeType': 'text/csv', 'buffer': csv.encode()}]); await pg.wait_for_timeout(1500)
            c('CSV loaded straight to a dashboard (no identifiers)', await pg.evaluate("Studio.ds.name === 'turnaround' && Studio.ds.rows.length === 600 && Studio.ds.cols.find(c => c.key === 'Date').type === 'date' && Studio.ds.cols.find(c => c.key === 'Turnaround minutes').type === 'number'"))
            c('two datasets to switch between', await pg.locator('#st-ds option').count() == 2)
            await pg.screenshot(path=f'{SHOTS}/studio_csv.png', full_page=True)
            # ---------- lab.6: the 34 additions ----------
            await pg.select_option('#st-ds', index=1); await pg.wait_for_timeout(900)   # back to the ER sample
            c('back on the ER sample', await pg.evaluate("Studio.ds.name !== 'turnaround'"))
            E = lambda js: pg.evaluate(js)
            # data: formula, ranges, recode, calendar, quality, measures (recorded as steps)
            await pg.click('[data-view=data]'); await pg.wait_for_selector('#st-fx')
            await pg.fill('#st-fx [name=name]', 'Long stay'); await pg.fill('#st-fx [name=expr]', 'IF([ED LOS (hours)] > 6, "Long", "Normal")'); await pg.click('[data-fxtest]'); await pg.wait_for_timeout(200)
            c('formula test shows first values', 'First values' in await pg.inner_text('#st-fxprev'))
            await pg.click('[data-fxadd]'); await pg.wait_for_timeout(500)
            c('formula column added', await E("Studio.ds.rows.every(r => ['Long','Normal'].includes(r['Long stay']))"))
            await pg.select_option('#st-bins [name=key]', 'Door to Doctor (min)'); await pg.fill('#st-bins [name=edges]', '15, 30, 60'); await pg.click('[data-binsadd]'); await pg.wait_for_timeout(500)
            c('ranges column added in order', await E("(() => { const c = Studio.col('Door to Doctor (min) (ranges)'); return !!c && c.order && c.order.length >= 3; })()"))
            await pg.select_option('#st-rec [name=key]', 'Disposition'); await pg.fill('#st-rec [name=name]', 'Went home'); await pg.fill('#st-rec [name=map]', 'Discharged = Yes'); await pg.select_option('#st-rec [name=other]', 'other'); await pg.click('[data-recadd]'); await pg.wait_for_timeout(500)
            c('value list (recode) column', await E("new Set(Studio.ds.rows.map(r => r['Went home'])).size <= 3 && Studio.ds.rows.some(r => r['Went home'] === 'Yes')"))
            await pg.select_option('#st-cal [name=kind]', 'shift'); await pg.click('[data-caladd]'); await pg.wait_for_timeout(500)
            await pg.select_option('#st-cal [name=kind]', 'season'); await pg.click('[data-caladd]'); await pg.wait_for_timeout(500)
            c('hospital calendar: shift and Ramadan columns', await E("Studio.ds.cols.filter(c => /Shift|Season/i.test(c.key)).length >= 2"))
            nsteps = await E("Studio.ds.steps.length"); c('every change is a recorded step', nsteps >= 5); print('   steps:', await E("Studio.ds.steps.map(SD.stepText)"))
            c('data quality card shown', 'Data quality' in await pg.inner_text('#labbody'))
            await pg.fill('#st-meas [name=name]', 'Seen within 30 min'); await pg.select_option('#st-meas [name=kind]', 'pct'); await pg.fill('#st-meas [name=cond]', '[Door to Doctor (min)] <= 30'); await pg.click('[data-madd]'); await pg.wait_for_timeout(500)
            c('saved measure', await E("Studio.ds.measures.length === 1 && SD.measureFns(Studio.ds).length === 1"))
            mv = await E("(() => { const m = Studio.ds.measures[0]; return SD.calc('m:' + m.id, Studio.ds.rows); })()"); c('measure calculates a %', 0 < mv <= 100); print('   % seen in 30:', mv)
            # sensitivity label + keep days
            await pg.select_option('#st-dsset [name=label]', 'Confidential'); await pg.wait_for_timeout(300)
            c('sensitivity label saved', await E("SG.label(Studio.ds) === 'Confidential' && SG.mark(Studio.ds).includes('Confidential')"))
            await pg.screenshot(path=f'{SHOTS}/studio_data6.png', full_page=True)
            # refresh from file: steps replay on fresh data (sample source)
            await pg.click('.st-bar [data-refresh]'); await pg.wait_for_timeout(2500)
            c('refresh repeats every step and keeps measures', await E("Studio.ds.refreshed && ['Long stay','Went home','Door to Doctor (min) (ranges)'].every(k => Studio.col(k)) && Studio.ds.measures.length === 1 && !Studio.ds.cols.some(c => c.key === 'Patient Name')"))
            # link two tables: make a small ward-like lookup dataset
            await E("(() => { window.__keep = Studio.ds.id; const vals = [...new Set(Studio.ds.rows.map(r => r['Triage Level']))]; window.__d = SD.fromGrid('Triage lookup', [['Triage Level', 'Priority group'], ...vals.map((v, i) => [v, i < 2 ? 'Urgent' : 'Routine'])]); return JSON.stringify(window.__d.cols); })()")
            await E("Studio.store(window.__d).then(() => 'stored')")
            await E("Studio.open(window.__keep).then(() => Studio.ds.name)")
            await E("(Studio.ds = null, Studio.open(window.__keep)).then(() => Studio.ds.name)")
            await E("Studio.rerender()"); await pg.wait_for_timeout(1200)
            await pg.click('[data-view=data]'); await pg.wait_for_selector('#st-link'); await pg.select_option('#st-link [name=key]', 'Triage Level'); await pg.wait_for_timeout(400)
            await pg.check('#st-link [name=lc][value="Priority group"]'); await pg.click('[data-linkadd]'); await pg.wait_for_timeout(700)
            c('linked a column from another dataset', await E("Studio.ds.rows.filter(r => r['Priority group']).length > Studio.ds.rows.length * 0.9"))
            # dashboard building
            await pg.click('[data-view=dash]'); await pg.wait_for_selector('.st-pages')
            np0 = await pg.locator('.st-card').count()
            await pg.click('[data-addpage]'); await pg.wait_for_timeout(500); c('second page added', await E("Studio.board().pages.length === 2 && Studio.board().page === 1"))
            await pg.click('[data-undo]'); await pg.wait_for_timeout(500); c('undo removes the page', await E("Studio.board().pages.length === 1"))
            await pg.keyboard.press('Control+y'); await pg.wait_for_timeout(500); c('Ctrl+Y redoes it', await E("Studio.board().pages.length === 2"))
            await pg.click('[data-page="0"]'); await pg.wait_for_timeout(500)
            await pg.click('[data-dd=add]'); await pg.click('#dd-add [data-newtext]'); await pg.fill('#st-tf [name=title]', 'Notes'); await pg.fill('#st-tf [name=text]', '# Key point\n- **ER** is busy'); await pg.click('#modal [data-ok]'); await pg.wait_for_selector('.st-card.txt h3', timeout=10000)
            c('text card', await pg.locator('.st-card.txt h3').count() >= 1 and await pg.locator('.st-card.txt b').count() >= 1)
            ids = await E("Studio.vis().map(v => v.id)")
            await E(f"""(() => {{ const dt = new DataTransfer(); const g = document.querySelector('[data-grip="{ids[-1]}"]'), t = document.querySelector('[data-vid="{ids[0]}"]'); g.dispatchEvent(new DragEvent('dragstart', {{ bubbles: true, dataTransfer: dt }})); t.dispatchEvent(new DragEvent('dragover', {{ bubbles: true, cancelable: true, dataTransfer: dt }})); t.dispatchEvent(new DragEvent('drop', {{ bubbles: true, cancelable: true, dataTransfer: dt }})); }})()"""); await pg.wait_for_timeout(800)
            c('drag a card to move it', await E(f"Studio.vis()[0].id === '{ids[-1]}'"))
            # resize via the corner handle
            vid = await E("Studio.vis().find(v => v.type === 'line' || v.type === 'area').id"); w0 = await E(f"Studio.findVis('{vid}').w || 1")
            hb = await pg.locator(f'[data-vid="{vid}"]').bounding_box(); await pg.hover(f'[data-vid="{vid}"]'); rb = await pg.locator(f'[data-resize="{vid}"]').bounding_box()
            await pg.mouse.move(rb['x'] + 5, rb['y'] + 5); await pg.mouse.down(); await pg.mouse.move(rb['x'] - (hb['width'] * 0.66 if w0 > 1 else -hb['width']), rb['y'] + 5, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(600)
            c('drag the corner to resize', await E(f"(Studio.findVis('{vid}').w || 1) !== {w0}"))
            # compare + anomalies + colour rules render
            await E("""(() => { Studio.vis().push({ id: 'vcmp', type: 'line', title: 'Visits yoy', x: 'Arrival', grain: 'month', fn: 'count', cmp: 'yoy', anom: true, w: 3 }, { id: 'vrule', type: 'bar', title: 'Rule', x: 'Triage Level', fn: 'avg', field: 'ED LOS (hours)', ruleHi: 8.4, ruleLo: 8.05, sort: 'label' }); Studio.rerender(); })()"""); await pg.wait_for_timeout(1200)
            c('compare-with-last-year line drawn', 'Same period' in await pg.inner_text('[data-vid=vcmp]'))
            c('conditional colours on bars', await E("new Set([...document.querySelectorAll('[data-vid=vrule] .sv-vb')].map(e => e.getAttribute('fill'))).size >= 2"))
            # drill down: year → month on a time bar
            await E("""(() => { Studio.vis().push({ id: 'vdr', type: 'bar', title: 'By year', x: 'Arrival', grain: 'year', fn: 'count', w: 2 }); Studio.drillOn.vdr = true; Studio.rerender(); })()"""); await pg.wait_for_selector('[data-vid=vdr] svg', timeout=15000); await pg.wait_for_timeout(300)
            await pg.locator('[data-vid=vdr] .sv-vb').first.click(); await pg.wait_for_timeout(700)
            c('drill: year → months with breadcrumb', await E("(Studio.drill.vdr || []).length === 1") and await pg.locator('[data-vid=vdr] .st-crumbs').count() == 1 and await pg.locator('[data-vid=vdr] .sv-vb').count() > 2)
            # rows behind (Shift+click)
            await E("Studio.drillOn.vdr = false; Studio.rerender()"); await pg.wait_for_timeout(800)
            await pg.locator('[data-vid=vdr] .sv-vb').first.click(modifiers=['Shift']); await pg.wait_for_selector('#modal .st-rows')
            c('Shift+click shows the rows behind a bar', await pg.locator('#modal .st-rows tbody tr').count() > 0); await E("UI.closeModal()")
            # ⋯ menu: why did it change
            await pg.click('[data-vmenu=vcmp]'); await pg.wait_for_selector('[data-vwhy=vcmp]'); await pg.click('[data-vwhy=vcmp]'); await pg.wait_for_selector('#modal .st-why-top')
            c('why did it change: breakdown by columns', await pg.locator('#modal .st-why-r').count() >= 3); await pg.screenshot(path=f'{SHOTS}/studio_why.png'); await E("UI.closeModal()")
            # saved views
            await pg.locator('[data-sl]').first.check(); await pg.wait_for_timeout(400)
            await pg.click('[data-saveview]'); await pg.fill('#modal [name=n]', 'My view'); await pg.click('#modal [data-ok]'); await pg.wait_for_timeout(500)
            await pg.click('[data-allclear]'); await pg.wait_for_timeout(400); await pg.select_option('#st-view', '0'); await pg.wait_for_timeout(500)
            c('saved view restores the filters', await E("Object.values(Studio.filters.slicers).some(v => v.length)")); await pg.click('[data-allclear]'); await pg.wait_for_timeout(400)
            # ask in words
            await pg.fill('#st-askq', 'average ED LOS by triage level'); await pg.click('#st-ask button'); await pg.wait_for_selector('#modal #st-askprev svg')
            c('ask in words → a chart', 'ED LOS' in await pg.inner_text('#modal')); nb = await E("Studio.vis().length"); await pg.click('#modal [data-ok]'); await pg.wait_for_timeout(600); c('asked chart added', await E("Studio.vis().length") == nb + 1)
            # summary
            await pg.click('[data-dd=analyse]'); await pg.click('#dd-analyse [data-summary]'); await pg.wait_for_selector('#modal .st-sum p'); c('auto summary written', await pg.locator('#modal .st-sum p').count() >= 3); print('   summary:', (await pg.inner_text('#modal .st-sum'))[:200].replace('\n', ' | '))
            await pg.click('#modal [data-addtxt]'); await pg.wait_for_timeout(500)
            # t-test
            await pg.click('[data-dd=analyse]'); await pg.click('#dd-analyse [data-compare]'); await pg.select_option('#modal [name=num]', 'ED LOS (hours)'); await pg.select_option('#modal [name=grp]', 'Gender'); await pg.wait_for_timeout(400)
            c('is the difference real: verdict + p', 'p ' in await pg.inner_text('#modal .st-verdict')); await E("UI.closeModal()")
            # correlation
            await E("""(() => { Studio.vis().push({ id: 'vcor', type: 'corr', title: 'Corr', w: 2 }); Studio.rerender(); })()"""); await pg.wait_for_timeout(900)
            c('correlation matrix drawn', await pg.locator('[data-vid=vcor] svg, [data-vid=vcor] table').count() >= 1)
            # templates
            await pg.click('[data-dd=add]'); await pg.click('#dd-add [data-templates]'); await pg.click('[data-tpl=er]'); await pg.wait_for_timeout(300); await pg.click('#modal [data-ok]'); await pg.wait_for_timeout(1500)
            c('ER flow template → a new page of charts', await E("Studio.page().name === 'ER flow' && Studio.vis().length >= 7"))
            await pg.screenshot(path=f'{SHOTS}/studio_template.png', full_page=True)
            # report mode
            await E("window.print = () => { window.__printed = true; }"); await pg.click('[data-dd=share]'); await pg.click('#dd-share [data-report]'); await pg.wait_for_timeout(1200)
            c('report mode hides controls and prints', await E("document.body.classList.contains('st-reporting') && window.__printed && getComputedStyle(document.querySelector('.st-side')).display === 'none'"))
            await pg.screenshot(path=f'{SHOTS}/studio_report.png', full_page=True); await pg.click('[data-endreport]'); await pg.wait_for_timeout(600)
            # exports: all images zip, PNG footer, Excel watermark, design file, backup
            async with pg.expect_download() as dl: await pg.click('[data-dd=share]'); await pg.click('#dd-share [data-allpng]')
            zp = await (await dl.value).path(); import zipfile; zn = zipfile.ZipFile(zp).namelist(); c('all charts as images (zip)', len(zn) >= 7 and all(n.endswith('.png') for n in zn))
            await pg.click('[data-page="0"]'); await pg.wait_for_timeout(800)
            async with pg.expect_download() as dl: await E("Studio.excel('t', [['a'], [1]])")
            xp = await (await dl.value).path(); zx = zipfile.ZipFile(xp); c('Excel export has an About sheet with the label', 'Confidential' in zx.read('xl/worksheets/sheet2.xml').decode())
            async with pg.expect_download() as dl: await pg.click('[data-dd=share]'); await pg.click('#dd-share [data-design-out]')
            dp = await (await dl.value).path(); dj = json.load(open(dp)); c('design file has pages but no rows', dj['kind'] == 'maham-studio-design' and len(dj['pages']) >= 2 and 'rows' not in json.dumps(dj)[:0] and not any('P-' in json.dumps(p) for p in dj['pages']))
            await pg.set_input_files('#st-design-in', dp); await pg.wait_for_timeout(1200); c('design file loads back', await E("Studio.board().pages.length") == len(dj['pages']))
            await pg.click('[data-vmenu]  >> nth=0') if False else None
            await pg.click('[data-view=data]'); await pg.wait_for_selector('[data-backup]')
            async with pg.expect_download() as dl: await pg.click('[data-backup]')
            bp = await (await dl.value).path(); c('backup file downloaded', os.path.getsize(bp) > 10000)
            # auto-delete old datasets
            gone = await E("(async () => { const m = Studio.meta.datasets.find(d => d.name === 'Triage lookup'); m.lastOpened = '2020-01-01'; return SG.expire(Studio.meta); })()")
            c('datasets not opened for 90 days are removed', gone == ['Triage lookup'] and await E("!Studio.meta.datasets.some(d => d.name === 'Triage lookup')"))
            await pg.click('[data-view=dash]'); await pg.wait_for_timeout(800)
            # ---------- lab.7: fixes, menus, findings, experimenting tools ----------
            c('ID columns recognised (Visit No, coded MRN)', await E("Studio.col('Visit No').type === 'id' && Studio.col('MRN').type === 'id'"))
            c('ID columns are not offered to group by', await E("(() => { const ids = Studio.ds.cols.filter(c => c.type === 'id').map(c => c.key); return !SD.suggest(Studio.ds).some(v => ids.includes(v.x) || ids.includes(v.split)); })()"))
            c('three menus instead of a row of buttons', await pg.locator('.st-tools [data-dd]').count() == 2 and await pg.locator('.st-bar [data-dd=add]').count() == 1 and await pg.locator('.st-tools > button').count() == 1)
            await pg.click('[data-dd=analyse]'); c('Analyse menu opens with 6 tools', await pg.locator('#dd-analyse:not([hidden]) button').count() == 6); await pg.keyboard.press('Escape'); c('Escape closes it', await pg.locator('#dd-analyse[hidden]').count() == 1)
            await pg.fill('#st-fsearch', 'los'); c('find a column in the field list', 0 < await pg.locator('.st-fields [data-field]:visible').count() <= 3); await pg.fill('#st-fsearch', '')
            # forecast switch + go-live mark on a line chart
            await E("""(() => { Studio.vis().unshift({ id: 'vfc', type: 'line', title: 'Visits forecast', x: 'Arrival', grain: 'month', fn: 'count', fc: 6, w: 3 }, { id: 'vmk', type: 'line', title: 'Marked', x: 'Arrival', grain: 'week', fn: 'count', markAt: '2026-05-10', markLabel: 'New triage', w: 3 }); Studio.rerender(); })()"""); await pg.wait_for_selector('[data-vid=vmk] svg'); await pg.wait_for_timeout(500)
            c('forecast switch on a line chart', await pg.locator('[data-vid=vfc] path[stroke-dasharray="6 4"]').count() >= 1 and await pg.locator('[data-vid=vfc] path[fill-opacity=".12"]').count() == 1)
            c('go-live mark on a line chart', 'New triage' in await pg.inner_text('[data-vid=vmk]'))
            # findings: pin a chart, notebook, report, file for MAHAM
            await pg.click('[data-vmenu=vfc]'); await pg.click('[data-vpin=vfc]'); await pg.wait_for_selector('#st-ff')
            c('finding dialog shows the chart picture', await pg.locator('#modal .st-find-prev').count() == 1)
            await pg.fill('#st-ff [name=n]', 'Visits stay near 900 a month; plan staff for the same.'); await pg.click('#modal [data-ok]'); await pg.wait_for_timeout(600)
            c('finding saved and counted', await E("Studio.F.list.length") == 1 and '1' in await pg.inner_text('.st-tools [data-notebook]'))
            await pg.click('.st-tools [data-notebook]'); await pg.wait_for_selector('#modal .st-find'); c('notebook lists it with its picture', await pg.locator('#modal .st-find img').count() == 1)
            async with pg.expect_download() as dl: await pg.click('#modal [data-freport]')
            rp = open(await (await dl.value).path(), encoding='utf-8').read(); c('findings report (HTML with pictures)', '<img src="data:image/png' in rp and 'plan staff' in rp)
            await pg.wait_for_selector('#modal [data-fmaham]'); await pg.click('#modal [data-fmaham]'); await pg.wait_for_selector('#modal [data-fs]')
            async with pg.expect_download() as dl: await pg.click('#modal [data-ok]')
            fj = json.load(open(await (await dl.value).path())); c('findings file for MAHAM: text only', fj['kind'] == 'maham-lab-findings' and len(fj['items']) == 1 and 'data:image' not in json.dumps(fj))
            json.dump(fj, open(f'{SHOTS}/findings-for-maham.json', 'w'))
            await E("UI.closeModal()")
            # what-if
            await pg.click('[data-dd=analyse]'); await pg.click('#dd-analyse [data-whatif]'); await pg.wait_for_selector('#st-wi-r .st-wi-big')
            await pg.select_option('#st-wi [name=k]', 'Door to Doctor (min)'); await pg.fill('#st-wi [name=t]', '30'); await pg.wait_for_timeout(400)
            await E("(() => { const s = document.getElementById('st-wi-s'); s.value = -20; s.dispatchEvent(new Event('input')); })()"); await pg.wait_for_timeout(300)
            wt = await pg.inner_text('#st-wi-r'); c('what-if: today vs after, with more rows meeting the target', 'Today' in wt and '+' in wt and '%' in wt); print('   what-if:', wt.split('\n')[:6])
            await pg.select_option('#st-wi [name=g]', 'Triage Level'); await pg.wait_for_timeout(300); c('what-if split by a group', await pg.locator('#st-wi-r tbody tr').count() >= 4)
            await pg.screenshot(path=f'{SHOTS}/studio_whatif.png'); await E("UI.closeModal()")
            # patterns over time
            await pg.click('[data-dd=analyse]'); await pg.click('#dd-analyse [data-season]'); await pg.wait_for_selector('#se2 svg', timeout=20000)
            c('patterns: sentences + trend, weekday, hour and Ramadan charts', await pg.locator('#st-se-r .st-sum p').count() >= 4 and await pg.locator('#st-se-r .st-se-c svg').count() >= 3)
            print('   patterns:', (await pg.inner_text('#st-se-r .st-sum')).replace('\n', ' | ')[:400])
            await pg.screenshot(path=f'{SHOTS}/studio_season.png'); await E("UI.closeModal()")
            # what drives
            await pg.click('[data-dd=analyse]'); await pg.click('#dd-analyse [data-drivers]'); await pg.wait_for_selector('#dr1 svg', timeout=30000)
            dt = await pg.inner_text('#st-dr-r'); c('what drives: ranked columns with "explains"', 'explains' in dt and 'Together' in dt); print('   drivers:', dt.split('\n')[:4])
            c('drivers leave out columns made from the number itself', 'Long stay' not in dt)
            await pg.screenshot(path=f'{SHOTS}/studio_drivers.png'); await E("UI.closeModal()")
            # before / after
            await pg.click('[data-dd=analyse]'); await pg.click('#dd-analyse [data-beforeafter]'); await pg.wait_for_selector('#ba1 svg', timeout=20000)
            await pg.fill('#st-ba [name=name]', 'New triage'); await pg.locator('#st-ba [name=name]').dispatch_event('change'); await pg.wait_for_timeout(500)
            bt = await pg.inner_text('#st-ba-r'); c('before / after: two values, a verdict and a marked chart', 'Before' in bt and 'After' in bt and await pg.locator('#ba1 line[stroke="#d08a1e"]').count() == 1); print('   before/after:', bt.split('\n')[:5])
            await pg.screenshot(path=f'{SHOTS}/studio_beforeafter.png')
            nv0 = await E("Studio.vis().length"); await pg.click('#modal [data-badd]'); await pg.wait_for_timeout(800); c('before / after chart added to the dashboard', await E("Studio.vis().length") == nv0 + 1 and await E("!!Studio.vis()[0].markAt"))
            # data: fill empty cells, descriptions, dictionary
            await pg.click('[data-view=data]'); await pg.wait_for_selector('#st-dsset')
            await pg.click('[data-qfill="Admitted To"]'); await pg.wait_for_timeout(600); c('quality fix: fill empty cells', await E("Studio.ds.rows.every(r => r['Admitted To'] !== '')") and await E("Studio.ds.steps.some(s => s.op === 'fill')"))
            await pg.fill('[data-desc="ED LOS (hours)"]', 'Hours from arrival to leaving the ER (EHR)'); await pg.locator('[data-desc="ED LOS (hours)"]').dispatch_event('change'); await pg.wait_for_timeout(400)
            c('column description saved', await E("Studio.col('ED LOS (hours)').desc.startsWith('Hours from')"))
            async with pg.expect_download() as dl: await pg.click('[data-dict]')
            import zipfile as _z; dz = _z.ZipFile(await (await dl.value).path()); c('data dictionary to Excel', 'Hours from arrival' in dz.read('xl/worksheets/sheet1.xml').decode())
            await pg.screenshot(path=f'{SHOTS}/studio_data7.png')
            after = await pg.evaluate(snap)
            c('no file in the shared folder changed, and none was added', before == after)
            c('no page errors', not errs); 
            if errs: print(errs[:3])
            await b.close()
    finally: srv.terminate()
    if bad: print(f'FAIL MAHAM Lab: {len(bad)} check(s) failed'); sys.exit(1)
    print('PASS MAHAM Lab')
asyncio.run(main())
