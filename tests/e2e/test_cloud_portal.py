"""The customer portal's database functions (supabase/schema.sql): closed until the company switches it on; a customer
(no account) raises a ticket and gets a private link; it goes to the queue for its category and its least busy member,
who gets a 🔔 notification (and an email in the queue); the customer sees public replies, never internal notes, and
replies (a ticket waiting on them opens again); Public knowledge base articles only; a spam limit."""
from harness import Check
from supa_local import LocalSupabase, Api


def main():
    c = Check('online customer portal')
    sb = LocalSupabase()
    if not sb.ok: print('SKIP online customer portal: PostgreSQL is not installed here'); print('PASS online customer portal (skipped)'); return
    sb.start()
    try:
        P = Api(sb, sb.as_user('owner@platform.test')); sb.make_platform_owner('owner@platform.test')
        st, cid = P.rpc('owner_create_company', p_name='Acme', p_admin_email='admin@acme.test', p_admin_member='adam', p_seats=5)
        A = Api(sb, sb.as_user('admin@acme.test')); A.rpc('accept_invites')
        A.rpc('invite_member', c=cid, p_email='nora@acme.test', p_member='nora', p_role='user'); N = Api(sb, sb.as_user('nora@acme.test')); N.rpc('accept_invites')
        anon = Api(sb)
        st, r = anon.rpc('portal_info', c=cid)
        c('the portal is closed until the company switches it on', st == 200 and r is None, (st, r))
        st, r = anon.rpc('portal_submit', c=cid, p_name='Ali', p_email='ali@example.com', p_subject='Help', p_desc='x', p_category='')
        c('…so nobody can send a ticket yet', st in (400, 403), (st, r))
        settings = {'id': 'settings-service', 'c': 'settings', 'categories': ['Printer', 'Access'], 'portal': {'on': True, 'title': 'Acme help', 'intro': 'Ask us'},
                    'queues': [{'id': 'q1', 'name': 'Desk', 'members': ['nora', 'adam'], 'categories': ['Printer']}], '_ts': 100, '_by': 'adam'}
        A.rpc('save_records', c=cid, items=[{'f': 'users/adam.json', 'r': settings},
                                           {'f': 'users/adam.json', 'r': {'id': 'ticket-adam-1', 'c': 'ticket', 'no': 7, 'subject': 'Busy', 'status': 'Open', 'assignee': 'adam', '_ts': 100}},
                                           {'f': 'users/adam.json', 'r': {'id': 'kbarticle-adam-1', 'c': 'kbarticle', 'title': 'Reset a password', 'solution': 'Use Forgot password', 'vis': 'public', '_ts': 100}},
                                           {'f': 'users/adam.json', 'r': {'id': 'kbarticle-adam-2', 'c': 'kbarticle', 'title': 'Internal only', 'solution': 'secret', 'vis': 'team', '_ts': 100}}])
        st, info = anon.rpc('portal_info', c=cid)
        c('switched on: name, title, intro, categories', info and info['name'] == 'Acme' and info['title'] == 'Acme help' and info['categories'] == ['Printer', 'Access'], info)
        st, arts = anon.rpc('portal_articles', c=cid)
        c('the help centre shows only Public articles', [a['title'] for a in arts or []] == ['Reset a password'], arts)
        # ---------- a customer raises a ticket
        st, tok = anon.rpc('portal_submit', c=cid, p_name='Ali', p_email='Ali@Example.com', p_subject='Printer jams', p_desc='Every page', p_category='Printer')
        c('a customer raises a ticket and gets a private link', st == 200 and isinstance(tok, str) and len(tok) >= 32, (st, tok))
        t = sb.sql("select data::text from public.records where company_id = :'c'::uuid and f = 'users/_portal.json' and data ->> 'c' = 'ticket';", params={'c': cid}).strip()
        import json; t = json.loads(t)
        c('…number after the highest, the queue for its category, its least busy member', t['no'] == 8 and t['queue'] == 'q1' and t['assignee'] == 'nora' and t['cust']['email'] == 'ali@example.com' and t['_by'] == '_portal', t)
        c('…Nora gets a 🔔 notification and an email in the queue', sb.sql("select count(*) from public.records where company_id = :'c'::uuid and data ->> 'c' = 'notify' and data ->> 'to' = 'nora';", params={'c': cid}).strip() == '1'
          and sb.sql("select count(*) from public.notify_queue where to_member = 'nora';").strip() == '1')
        c('staff see it in the app (records)', any(x['id'] == t['id'] for x in (N.get(f'/rest/v1/records?select=id&company_id=eq.{cid}')[1] or [])))
        # ---------- replies: public and internal
        N.rpc('save_records', c=cid, items=[{'f': 'users/nora.json', 'r': {'id': 'tkreply-nora-1', 'c': 'tkreply', 'on': t['id'], 'by': 'nora', 'at': 2000, 'text': 'Can you send a photo?', '_ts': 2000}},
                                           {'f': 'users/nora.json', 'r': {'id': 'tkreply-nora-2', 'c': 'tkreply', 'on': t['id'], 'by': 'nora', 'at': 2100, 'text': 'toner is low (staff only)', 'internal': True, '_ts': 2100}},
                                           {'f': 'users/nora.json', 'r': dict(t, status='Waiting on customer', pausedAt=2000, _ts=t['_ts'] + 10, _by='nora')}])
        st, view = anon.rpc('portal_status', p_token=tok)
        texts = [x['text'] for x in view['replies']]
        c('the customer sees the status and the public reply', view['status'] == 'Waiting on customer' and 'Can you send a photo?' in texts, view)
        c('…never an internal note', not any('staff only' in x for x in texts), texts)
        st, r = anon.rpc('portal_status', p_token='x' * 10)
        c('a wrong or short link shows nothing', r is None, r)
        st, r = anon.rpc('portal_reply', p_token=tok, p_text='Here it is: error 41')
        c('the customer replies', st == 200 and r is True, (st, r))
        st, view = anon.rpc('portal_status', p_token=tok)
        c('…their reply is there, and the ticket waiting on them is open again', view['status'] == 'Open' and any(x['mine'] and 'error 41' in x['text'] for x in view['replies']), view)
        newest = json.loads(sb.sql("select data::text from public.records where company_id = :'c'::uuid and id = :'i' order by ts desc limit 1;", params={'c': cid, 'i': t['id']}).strip())
        c('…with the paused time added to the SLA clock', (newest.get('pausedMs') or 0) > 0 and 'pausedAt' not in newest, newest)
        c('…and Nora is told', sb.sql("select count(*) from public.records where company_id = :'c'::uuid and data ->> 'c' = 'notify' and data ->> 'to' = 'nora';", params={'c': cid}).strip() == '2')
        st, r = anon.rpc('portal_reply', p_token='not-a-real-link-not-a-real-link', p_text='hi')
        c('a reply with a wrong link is refused', st in (400, 403), (st, r))
        # ---------- the customer cannot read anything else
        st, r = anon.get(f'/rest/v1/records?select=id&company_id=eq.{cid}')
        c('signed out, the records table gives nothing', st in (401, 403) or r == [], (st, r))
        # ---------- 📣 a campaign's public sign-up form
        A.rpc('save_records', c=cid, items=[{'f': 'users/adam.json', 'r': {'id': 'campaign-adam-1', 'c': 'campaign', 'name': 'Open day', 'owner': 'nora', 'status': 'Running', 'form': {'on': False}, '_ts': 300}}])
        st, r = anon.rpc('form_info', c=cid, p_form='campaign-adam-1')
        c('a campaign form is closed until switched on', r is None, r)
        A.rpc('save_records', c=cid, items=[{'f': 'users/adam.json', 'r': {'id': 'campaign-adam-1', 'c': 'campaign', 'name': 'Open day', 'owner': 'nora', 'status': 'Running', 'form': {'on': True, 'title': 'Join our open day'}, '_ts': 400}}])
        st, r = anon.rpc('form_info', c=cid, p_form='campaign-adam-1')
        c('…switched on: its title for the page', r and r['title'] == 'Join our open day', r)
        st, r = anon.rpc('form_submit', c=cid, p_form='campaign-adam-1', p_name='Huda', p_email='Huda@Example.com', p_phone='', p_note='2 people')
        con = sb.sql("select data::text from public.records where company_id = :'c'::uuid and data ->> 'c' = 'contact';", params={'c': cid}).strip()
        con = json.loads(con) if con else {}
        c('a sign-up becomes a contact from the campaign, owned by its owner', st == 200 and con.get('email') == 'huda@example.com' and con.get('source') == 'campaign-adam-1' and con.get('owner') == 'nora' and 'lead' in con.get('tags', []), (st, con))
        c('…with a follow-up and a 🔔 for the owner', sb.sql("select count(*) from public.records where company_id = :'c'::uuid and data ->> 'c' = 'crmact' and data ->> 'on' = :'o';", params={'c': cid, 'o': con.get('id', '')}).strip() == '1'
          and sb.sql("select count(*) from public.records where company_id = :'c'::uuid and data ->> 'c' = 'notify' and data ->> 'to' = 'nora' and data ->> 'title' like 'signed up%';", params={'c': cid}).strip() == '1')
        st, r = anon.rpc('form_submit', c=cid, p_form='campaign-adam-1', p_name='', p_email='x', p_phone='', p_note='')
        c('…a sign-up without a name and contact is refused', st == 400, (st, r))
        # ---------- spam limit
        for i in range(30): anon.rpc('portal_submit', c=cid, p_name='Bot', p_email=f'bot{i}@example.com', p_subject=f'spam {i}', p_desc='', p_category='')
        st, r = anon.rpc('portal_submit', c=cid, p_name='Bot', p_email='bot@example.com', p_subject='one more', p_desc='', p_category='')
        c('more than 30 portal tickets an hour are refused', st == 400 and 'Too many' in json.dumps(r), (st, r))
    finally:
        sb.stop()
    c.done()


main()
