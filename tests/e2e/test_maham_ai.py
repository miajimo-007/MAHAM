"""MAHAM ✨ AI with a personal Claude key (this browser), against a stand-in for the Claude API (no real call, no cost):
the request (headers, model, the person's work only), the reply in the Assistant, a proposed To Do is saved only after
"Create it", @AI in chat answers in the thread, ✨ Draft a reply on a ticket, the admin keeps an area out, AI off."""
import json
from harness import app_session, Check, run

SEEN = []


async def fake_claude(route):
    req = route.request; body = json.loads(req.post_data or '{}'); SEEN.append({'headers': req.headers, 'body': body})
    q = body['messages'][-1]['content'] if isinstance(body['messages'][-1]['content'], str) else ''
    if 'Draft the next reply' in q: text = 'Dear customer, we replaced the fuser unit — please try again.'
    elif 'asks you, @AI' in q: text = 'The printer was fixed on Monday.'
    elif 'remind' in q.lower(): text = 'Sure.\n```maham-todo\n{"task": "Call the vendor about the scanner", "due": "2026-12-01", "priority": "High"}\n```'
    else: text = 'Start with TD-1, it is due first.'
    await route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'},
                        body=json.dumps({'id': 'msg_test', 'type': 'message', 'role': 'assistant', 'model': body.get('model'), 'stop_reason': 'end_turn',
                                         'content': [{'type': 'thinking', 'thinking': '', 'signature': 'x'}, {'type': 'text', 'text': text}]}))


async def main():
    c = Check('MAHAM AI')
    async with app_session() as s:
        pg = s.page; J = s.js
        await pg.set_viewport_size({'width': 1366, 'height': 900})
        await pg.route('https://api.anthropic.com/v1/messages', lambda r: fake_claude(r) if r.request.method == 'POST' else r.fulfill(status=204, headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'}))
        await s.sign_in_as('yousef', 'analyst')
        await s.sign_in_as('apps-mgr', 'manager')   # To Dos are given by a manager
        await J("Store.saveMany([{ c: 'todo', id: 'ai-td1', task: 'Fix the label printer', analyst: 'yousef', team: Store.member('yousef').team, assigned: U.todayStr(), due: U.addDays(U.todayStr(), 2), status: 'In Progress' }, { c: 'todo', id: 'ai-td2', task: 'Secret task of Nora', analyst: 'nora', team: Store.member('nora').team, assigned: U.todayStr(), status: 'In Progress' }])")
        await s.sign_in_as('yousef', 'analyst')
        # ---------- connect a personal Claude key
        await s.go('#/ai', 600)
        c('AI connections page, nothing connected yet', 'Nothing connected yet' in await pg.inner_text('#main'))
        await pg.click('#aiadd'); await pg.select_option('#acp', 'anthropic')
        c('the help says where to get a key (and that Max / Team plans include API credits)', 'platform.claude.com' in await pg.inner_text('#achelp') and 'API credits' in await pg.inner_text('#achelp'))
        c('…the newest Claude model is suggested', await pg.input_value('#acm') == 'claude-opus-5-5')
        await pg.fill('#acn', 'My Claude'); await pg.fill('#ack', 'sk-ant-test-key'); await pg.click('.modal [data-ok]'); await pg.wait_for_timeout(500)
        c('it is listed as mine, in this browser', 'My Claude' in await pg.inner_text('#main') and 'this browser' in await pg.inner_text('#main'))
        # ---------- ask in the Assistant
        c('✨ is in the top bar', await J("!!document.getElementById('aibtn')"))
        await pg.click('#aibtn'); await pg.wait_for_selector('#aitext'); await pg.fill('#aitext', 'What should I do first today?'); await pg.click('#aisend')
        await pg.wait_for_function("document.querySelector('#ailist').innerText.includes('Start with TD-1')", timeout=8000)
        r = SEEN[-1]
        c('the request: x-api-key, anthropic-version, browser access header', r['headers'].get('x-api-key') == 'sk-ant-test-key' and r['headers'].get('anthropic-version') == '2026-10-21' and r['headers'].get('anthropic-dangerous-direct-browser-access') == 'true', r['headers'])
        c('…model claude-opus-5-5 with the server-side fallback for declined requests', r['body']['model'] == 'claude-opus-5-5' and r['body'].get('fallbacks') == 'default' and 'server-side-fallback' in r['headers'].get('anthropic-beta', ''), r['body'].get('model'))
        c('…it carries my work, not someone else\'s', 'Fix the label printer' in r['body']['system'] and 'Secret task of Nora' not in r['body']['system'])
        c('the reply shows (only the text, not the thinking block)', 'Start with TD-1' in await pg.inner_text('#ailist'))
        # ---------- a proposed To Do is saved only after "Create it"
        await pg.fill('#aitext', 'Please remind me to call the vendor'); await pg.click('#aisend')
        await pg.wait_for_selector('[data-aiprop]', timeout=8000)
        c('a proposed To Do is shown, not saved yet', not await J("Store.all('todo').some(t => t.task === 'Call the vendor about the scanner')"))
        await pg.click('[data-aiprop]'); await pg.wait_for_timeout(300)
        t = await J("Store.all('mytask', '*').find(t => t.title === 'Call the vendor about the scanner')")
        c('…"Create it" saves it for me — an analyst gets a personal task (To Dos come from managers), marked as from the AI', bool(t) and t['owner'] == 'yousef' and t['due'] == '2026-12-01' and t.get('fromAI'), t)
        await pg.click('#aiclose')
        # ---------- @AI in chat
        await s.go('#/chat', 500); await pg.fill('#chtext', 'When was the printer fixed? @AI'); await pg.click('[data-send="chtext"]')
        await pg.wait_for_function("Store.all('chmsg', '*').some(m => m.ai && m.text.includes('fixed on Monday'))", timeout=8000)
        c('@AI answers in the thread, marked as the AI', await J("(m => !!m && !!m.parent)(Store.all('chmsg', '*').find(m => m.ai))"))
        await s.go('#/todo', 200); await s.go('#/chat', 500); await pg.click('#chlist [data-reply]'); await pg.wait_for_selector('.ch-thread')
        c('…shown in the thread as ✨ AI (asked by …)', '✨ AI' in await pg.inner_text('.ch-thread') and 'asked by' in await pg.inner_text('.ch-thread'))
        # ---------- ✨ Draft a reply on a ticket
        await J("TK.create({ subject: 'Printer jams', assignee: 'yousef', requester: 'sara' })")
        await J("TK.open(TK.all().find(t => t.subject === 'Printer jams'))"); await pg.wait_for_selector('#tkai')
        await pg.click('#tkai'); await pg.wait_for_function("document.querySelector('#tkrt').value.includes('fuser')", timeout=8000)
        c('✨ Draft a reply fills the reply box (the agent still sends it)', 'fuser' in await pg.input_value('#tkrt') and not await J("TK.replies(TK.all().find(t => t.subject === 'Printer jams').id).length"))
        await J("UI.closeModal()")
        # ---------- the admin keeps an area out, and can switch AI off
        await s.sign_in_as('adam', 'admin'); await s.go('#/ai', 600)
        await pg.check('[data-apoff="tickets"]'); await pg.click('#apsave'); await pg.wait_for_timeout(300)
        c('the admin keeps the service desk out of the AI', await J("AI.cfg().off.includes('tickets')"))
        await s.sign_in_as('yousef', 'analyst'); await J("TK.open(TK.all().find(t => t.subject === 'Printer jams'))"); await pg.wait_for_selector('#tkrt')
        c('…no ✨ Draft on tickets then', not await J("!!document.getElementById('tkai')")); await J("UI.closeModal()")
        await s.sign_in_as('adam', 'admin'); await s.go('#/todo', 200); await s.go('#/ai', 600); await pg.uncheck('#apon'); await pg.click('#apsave'); await pg.wait_for_timeout(300)
        await s.sign_in_as('yousef', 'analyst')
        c('AI switched off: no ✨ in the top bar', not await J("!!document.getElementById('aibtn')"))
        n = len(SEEN)
        try: await J("AI.ask((AI._list || [])[0] || { provider: 'anthropic', key: 'x', scope: 'device' }, 's', [{ role: 'user', content: 'hi' }])"); blocked = False
        except Exception: blocked = True
        c('…and nothing is sent to the AI', blocked and len(SEEN) == n)
    c.done(s)

run(main())
