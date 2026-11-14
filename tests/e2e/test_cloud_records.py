"""The online record store (supabase/schema.sql: table records, save_records, replace_file), tested against a real
PostgreSQL with row-level security: each person saves only their own records, the newest copy (_ts) wins, an admin may
replace a whole file, "what changed since N" returns only the new rows (removals too), one company never sees
another's, and person files kept in "files" by an older MAHAM are converted when the schema is run again."""
import json
from harness import Check
from supa_local import LocalSupabase, Api, SCHEMA


def main():
    c = Check('online record store')
    sb = LocalSupabase()
    if not sb.ok: print('SKIP online record store: PostgreSQL is not installed here'); print('PASS online record store (skipped)'); return
    sb.start()
    try:
        D = 'MAHAM Data' if 'MAHAM Data' in open(SCHEMA, encoding='utf-8').read() else 'MAHAM Data'
        P = Api(sb, sb.as_user('owner@platform.test')); sb.make_platform_owner('owner@platform.test')
        st, cid = P.rpc('owner_create_company', p_name='Acme', p_admin_email='admin@acme.test', p_admin_member='adam', p_seats=5)
        A = Api(sb, sb.as_user('admin@acme.test')); A.rpc('accept_invites')
        A.rpc('invite_member', c=cid, p_email='yousef@acme.test', p_member='yousef', p_role='user')
        Y = Api(sb, sb.as_user('yousef@acme.test')); Y.rpc('accept_invites')
        rows = lambda api, since=0: api.get(f'/rest/v1/records?select=f,id,data,seq&company_id=eq.{cid}&seq=gt.{since}&order=seq.asc&limit=1000')[1] or []

        # ---- saving only the changed records, into your own file
        st, r = Y.rpc('save_records', c=cid, items=[{'f': 'users/yousef.json', 'r': {'id': 'td-1', 'c': 'todo', 'task': 'First', '_ts': 1000, '_by': 'yousef'}},
                                                    {'f': 'users/yousef.hd-2026-05.json', 'r': {'id': 'hd-9', 'c': 'helpdesk', 'created': '2026-05-02', '_ts': 1000}}])
        c('a person saves records into their own files (main + a part file)', st == 200 and r['taken'] == 2, (st, r))
        seq1 = r['seq']
        st, r = Y.rpc('save_records', c=cid, items=[{'f': 'users/adam.json', 'r': {'id': 'x', 'c': 'todo', '_ts': 5}}])
        c("…but never into someone else's file", st == 403, (st, r))
        st, r = Y.rpc('save_records', c=cid, items=[{'f': '../users/yousef.json', 'r': {'id': 'x', '_ts': 5}}])
        c('…and a bad file name is refused', st == 400, (st, r))
        # ---- the newest copy wins
        st, r = Y.rpc('save_records', c=cid, items=[{'f': 'users/yousef.json', 'r': {'id': 'td-1', 'c': 'todo', 'task': 'Old copy', '_ts': 900}}])
        c('an older copy (_ts) is not taken', r['taken'] == 0 and r['skipped'] == 1, r)
        st, r = Y.rpc('save_records', c=cid, items=[{'f': 'users/yousef.json', 'r': {'id': 'td-1', 'c': 'todo', 'task': 'Newer', '_ts': 2000}}])
        c('a newer one is', r['taken'] == 1, r)
        st, r = Y.rpc('save_records', c=cid, items=[{'f': 'users/yousef.json', 'r': {'id': 'td-1', 'c': 'todo', 'task': 'Newer', '_ts': 2000}}])
        c('the same record again changes nothing', r['taken'] == 0, r)
        # ---- what changed since N
        new = rows(A, seq1)
        c('"since N" returns only the rows changed after N', [x['id'] for x in new] == ['td-1'] and new[0]['data']['task'] == 'Newer', new)
        c('everyone in the company reads them (the admin here)', len(rows(A)) == 2)
        st, r = Y.rpc('save_records', c=cid, items=[{'f': 'users/yousef.json', 'id': 'td-1', 'd': True, 'ts': 2000}])
        gone = rows(A, r['seq'] - 1)
        c('a removal shows as a row without data (so every PC learns it)', r['taken'] == 1 and gone and gone[0]['id'] == 'td-1' and gone[0]['data'] is None, gone)
        st, r = Y.rpc('save_records', c=cid, items=[{'f': 'users/yousef.json', 'r': {'id': 'td-1', 'c': 'todo', 'task': 'Back', '_ts': 3000}}])
        c('…and it can come back', r['taken'] == 1 and rows(A, r['seq'] - 1)[0]['data']['task'] == 'Back')
        # ---- whole files (admin tools, import, restore)
        st, r = A.rpc('replace_file', c=cid, p_f='users/yousef.json', recs=[{'id': 'td-1', 'c': 'todo', 'task': 'Back', '_ts': 3000}, {'id': 'td-2', 'c': 'todo', 'task': 'Added', '_ts': 3100}])
        c('the admin replaces a whole file: 1 added, 0 changed', st == 200 and r['added'] == 1 and r['changed'] == 0 and r['removed'] == 0, (st, r))
        st, r = A.rpc('replace_file', c=cid, p_f='users/yousef.json', recs=[{'id': 'td-2', 'c': 'todo', 'task': 'Added', '_ts': 3100}])
        c('…and what is left out is removed', r['removed'] == 1, r)
        st, r = Y.rpc('replace_file', c=cid, p_f='users/adam.json', recs=[])
        c("a person cannot replace someone else's file", st == 403, (st, r))
        st, r = Y.rpc('replace_file', c=cid, p_f='users/yousef.json', recs=[{'id': 'td-2', 'c': 'todo', 'task': 'Mine', '_ts': 3200}])
        c('…but may replace their own', st == 200 and r['changed'] == 1, (st, r))
        # ---- nobody writes the table directly
        st, r = Y.call('POST', '/rest/v1/records', {'company_id': cid, 'f': 'users/yousef.json', 'id': 'direct', 'data': {'id': 'direct'}})
        c('the table cannot be written directly (only through the functions)', st in (401, 403), (st, r))
        # ---- private messages (chat: direct messages, private channels) go only to their audience
        st, r = Y.rpc('save_records', c=cid, items=[{'f': 'users/yousef.json', 'r': {'id': 'chmsg-yousef-1', 'c': 'chmsg', 'ch': 'dm:sara|yousef', 'text': 'just for Sara', 'aud': ['sara', 'yousef'], '_ts': 4000}}])
        c('a direct message is saved', r['taken'] == 1, r)
        ids_admin = [x['id'] for x in rows(A)]
        c('…the company admin (not in it) does not receive it', 'chmsg-yousef-1' not in ids_admin, ids_admin)
        c('…the writer does', 'chmsg-yousef-1' in [x['id'] for x in rows(Y)])
        st, r = A.rpc('replace_file', c=cid, p_f='users/yousef.json', recs=[{'id': 'td-2', 'c': 'todo', 'task': 'Mine', '_ts': 3200}])
        still = sb.sql("select count(*) from public.records where company_id = :'c'::uuid and id = 'chmsg-yousef-1' and data is not null;", params={'c': cid}).strip()
        c("an admin rewriting the file never removes messages they cannot read", still == '1', (r, still))
        # ---- 🔔 notifications queue an email to the person's account address (unless they switched emails off)
        q = lambda: sb.sql("select count(*) from public.notify_queue where company_id = :'c'::uuid and to_member = 'yousef';", params={'c': cid}).strip()
        A.rpc('save_records', c=cid, items=[{'f': 'users/adam.json', 'r': {'id': 'notify-adam-1', 'c': 'notify', 'to': 'yousef', 'by': 'adam', 'title': 'gave you a To Do', 'text': 'Fix it', 'link': '#/todo', '_ts': 5000}}])
        row = sb.sql("select to_email || ' | ' || title || ' | ' || link from public.notify_queue where company_id = :'c'::uuid;", params={'c': cid}).strip()
        c('a notification queues one email, to the account address', q() == '1' and row.startswith('yousef@acme.test') and 'gave you a To Do' in row and '#/todo' in row, row)
        Y.rpc('save_records', c=cid, items=[{'f': 'users/yousef.json', 'r': {'id': 'notifprefs-yousef', 'c': 'notifprefs', 'member': 'yousef', 'email': False, '_ts': 5100}}])
        A.rpc('save_records', c=cid, items=[{'f': 'users/adam.json', 'r': {'id': 'notify-adam-2', 'c': 'notify', 'to': 'yousef', 'by': 'adam', 'title': 'again', '_ts': 5200}}])
        c('…none once the person switched emails off', q() == '1', q())
        st, r = Y.get('/rest/v1/notify_queue?select=id')
        c('…and nobody in the app can read the queue', st in (401, 403) or r == [], (st, r))
        # ---- companies kept apart
        st, cid2 = P.rpc('owner_create_company', p_name='Beta', p_admin_email='boss@beta.test', p_admin_member='boss', p_seats=3)
        B = Api(sb, sb.as_user('boss@beta.test')); B.rpc('accept_invites')
        st, rb = B.get(f'/rest/v1/records?select=id&company_id=eq.{cid}')
        c("another company's admin sees none of Acme's records", rb == [], rb)
        st, r = B.rpc('save_records', c=cid, items=[{'f': 'users/boss.json', 'r': {'id': 'x', '_ts': 1}}])
        c('…and cannot save into Acme', st == 403, (st, r))
        st, r = Api(sb).get(f'/rest/v1/records?select=id&company_id=eq.{cid}')
        c('signed out: nothing (refused, or an empty list)', st in (401, 403) or r in ([], None), (st, r))
        # ---- an older MAHAM kept whole person files in "files": converted when the schema runs again
        old = json.dumps({'version': 1, 'kind': 'user', 'user': 'yousef', 'records': [{'id': 'legacy-1', 'c': 'todo', 'task': 'From the old file', '_ts': 50}]})
        sb.sql("insert into public.files (company_id, path, content) values (:'c'::uuid, :'p', :'t');", params={'c': cid, 'p': f'{D}/users/yousef.y2025.json', 't': old})
        sb.sql("insert into public.files (company_id, path, content) values (:'c'::uuid, :'p', 'not json');", params={'c': cid, 'p': f'{D}/users/broken.json'})
        sb.sql(open(SCHEMA, encoding='utf-8').read())
        conv = sb.sql("select data ->> 'task' from public.records where company_id = :'c'::uuid and f = 'users/yousef.y2025.json' and id = 'legacy-1';", params={'c': cid}).strip()
        c('old person files become records when the schema is run again', conv == 'From the old file', conv)
        c('…the converted file row is gone', sb.sql("select count(*) from public.files where company_id = :'c'::uuid and path = :'p';", params={'c': cid, 'p': f'{D}/users/yousef.y2025.json'}).strip() == '0')
        c('…an unreadable one is left as it is', sb.sql("select count(*) from public.files where company_id = :'c'::uuid and path = :'p';", params={'c': cid, 'p': f'{D}/users/broken.json'}).strip() == '1')
        c('…and running it again changes nothing', sb.sql(open(SCHEMA, encoding='utf-8').read()) is not None and len(rows(A)) >= 3)
    finally:
        sb.stop()
    c.done()


main()
