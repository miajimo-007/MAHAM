"""Online AI keys (supabase/schema.sql: ai_keys, ai_set_key, ai_list, ai_delete, ai_key_for): a key is never read back
by anyone in the app — not the person, not the admin; the company AI only by the admin; personal ones only when the
admin allows; each person sees only the company's and their own; ai_key_for (the proxy's) is not callable from the app."""
from harness import Check
from supa_local import LocalSupabase, Api


def main():
    c = Check('online AI keys')
    sb = LocalSupabase()
    if not sb.ok: print('PASS online AI keys (skipped: no PostgreSQL)'); return
    sb.start()
    try:
        P = Api(sb, sb.as_user('owner@platform.test')); sb.make_platform_owner('owner@platform.test')
        st, cid = P.rpc('owner_create_company', p_name='Acme', p_admin_email='admin@acme.test', p_admin_member='adam', p_seats=5)
        A = Api(sb, sb.as_user('admin@acme.test')); A.rpc('accept_invites')
        for m in ('yousef', 'nora'): A.rpc('invite_member', c=cid, p_email=f'{m}@acme.test', p_member=m, p_role='user')
        Y = Api(sb, sb.as_user('yousef@acme.test')); Y.rpc('accept_invites'); N = Api(sb, sb.as_user('nora@acme.test')); N.rpc('accept_invites')
        st, r = Y.rpc('ai_set_key', c=cid, p_scope='company', p_provider='anthropic', p_model='claude-opus-5-5', p_base='', p_name='Company Claude', p_key='sk-company')
        c('only the admin connects the company AI', st == 403, (st, r))
        st, comp = A.rpc('ai_set_key', c=cid, p_scope='company', p_provider='anthropic', p_model='claude-opus-5-5', p_base='', p_name='Company Claude', p_key='sk-company')
        c('the admin connects the company AI', st == 200 and comp, (st, comp))
        st, mine = Y.rpc('ai_set_key', c=cid, p_scope='person', p_provider='openai', p_model='gpt-4.1', p_base='', p_name='My GPT', p_key='sk-yousef')
        c('a person connects their own AI', st == 200 and mine, (st, mine))
        st, ly = Y.rpc('ai_list', c=cid); st, ln = N.rpc('ai_list', c=cid)
        c('each person sees the company AI and their own — never another person\'s', sorted(x['name'] for x in ly) == ['Company Claude', 'My GPT'] and [x['name'] for x in ln] == ['Company Claude'], (ly, ln))
        c('…and the list never has the key', 'sk-' not in str(ly) + str(ln))
        for who, api in (('the person', Y), ('the admin', A)):
            st, r = api.get(f'/rest/v1/ai_keys?select=secret&company_id=eq.{cid}')
            c(f'{who} cannot read keys from the table', st in (401, 403) or r == [], (st, r))
        st, r = Y.rpc('ai_key_for', c=cid, p_id=comp, p_user='00000000-0000-0000-0000-000000000000')
        c('the proxy\'s function cannot be called from the app', st in (401, 403, 404), (st, r))
        k = sb.sql(f"select coalesce(public.ai_key_for('{cid}'::uuid, '{mine}'::uuid, (select id from auth.users where email = 'yousef@acme.test')) ->> 'secret', 'none');").strip()
        k2 = sb.sql(f"select coalesce(public.ai_key_for('{cid}'::uuid, '{mine}'::uuid, (select id from auth.users where email = 'nora@acme.test')) ->> 'secret', 'none');").strip()
        c('server side, the proxy gets a person\'s own key — and not for someone else', k == 'sk-yousef' and k2 == 'none', (k, k2))
        st, r = N.rpc('ai_delete', c=cid, p_id=mine)
        c("nobody removes someone else's connection", st == 403, (st, r))
        # the admin's policy: no personal AI, only some services
        A.rpc('save_records', c=cid, items=[{'f': 'users/adam.json', 'r': {'id': 'settings-ai', 'c': 'settings', 'personal': False, 'providers': ['anthropic'], '_ts': 100}}])
        st, r = N.rpc('ai_set_key', c=cid, p_scope='person', p_provider='anthropic', p_model='', p_base='', p_name='x', p_key='sk-n')
        c('personal AI switched off by the admin: refused', st == 403, (st, r))
        st, r = A.rpc('ai_set_key', c=cid, p_scope='company', p_provider='google', p_model='', p_base='', p_name='g', p_key='k')
        c('a service the admin did not allow: refused', st == 403, (st, r))
        st, r = Y.rpc('ai_delete', c=cid, p_id=mine)
        c('a person removes their own connection', st == 200 or st == 204, (st, r))
        c('…the audit log has the connections', int(sb.sql(f"select count(*) from public.audit where company_id = '{cid}'::uuid and action like 'AI %';").strip()) >= 3)
    finally:
        sb.stop()
    c.done()


main()
