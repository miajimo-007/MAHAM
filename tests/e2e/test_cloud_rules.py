"""The online database's rules, tested against a real PostgreSQL running supabase/schema.sql (row-level security):
platform owner vs company admin vs user vs another company vs not signed in; invitations and seats; each person's own
files (incl. help-desk months, past years, logs); support access only when the company grants it; paused companies;
the audit log; deleting a company."""
import os, sys
from harness import Check
from supa_local import LocalSupabase, Api, SCHEMA

def main():
    c = Check('online database rules')
    sb = LocalSupabase()
    if not sb.ok: print('SKIP online database rules: PostgreSQL is not installed here'); print('PASS online database rules (skipped)'); return
    sb.start()
    try:
        D = 'MAHAM Data' if 'MAHAM Data' in open(SCHEMA, encoding='utf-8').read() else 'MAHAM Data'
        f = lambda who: f'/rest/v1/files?select=path,content&path=like.{D}/users/*'
        put = lambda api, path, text='{}', cid=None: api.call('POST', '/rest/v1/files?on_conflict=company_id,path', {'company_id': cid, 'path': f'{D}/{path}', 'content': text})[0]
        P = Api(sb, sb.as_user('owner@platform.test')); sb.make_platform_owner('owner@platform.test')
        anon = Api(sb)
        # ---------- the platform owner creates a company and invites its admin ----------
        st, cid = P.rpc('owner_create_company', p_name='Acme', p_admin_email='Admin@Acme.test', p_admin_member='adam', p_seats=3)
        c('platform owner creates a company + invites its admin', st == 200 and cid, (st, cid))
        A = Api(sb, sb.as_user('admin@acme.test'))
        c('before accepting: the admin sees no company', A.rpc('my_companies')[1] == [])
        c('accepting links the invitation', A.rpc('accept_invites')[1] == 1)
        mc = A.rpc('my_companies')[1]
        c('the admin is admin of Acme as "adam"', len(mc) == 1 and mc[0]['role'] == 'admin' and mc[0]['member_id'] == 'adam' and mc[0]['name'] == 'Acme', mc)
        st, x = P.rpc('owner_companies'); row = (x or [{}])[0]
        c('Owner Console lists it with counts, not data', st == 200 and row.get('members') == 1 and row.get('admins') == 1 and 'content' not in row, x)
        # ---------- the admin invites people; seats ----------
        c('admin invites a user', A.rpc('invite_member', c=cid, p_email='yousef@acme.test', p_member='yousef', p_role='user')[0] == 200)
        c('second invite fits (3 seats: 1 used + 2 invited)', A.rpc('invite_member', c=cid, p_email='sara@acme.test', p_member='sara')[0] == 200)
        st, e = A.rpc('invite_member', c=cid, p_email='nora@acme.test', p_member='nora')
        c('a 4th person does not fit in 3 seats', st == 400 and 'seat' in (e or {}).get('message', ''), (st, e))
        c('a bad email is refused', A.rpc('invite_member', c=cid, p_email='not-an-email', p_member='x')[0] == 400)
        U = Api(sb, sb.as_user('yousef@acme.test')); U.rpc('accept_invites')
        c('the invited person joins as a user', (U.rpc('my_companies')[1] or [{}])[0].get('role') == 'user')
        # ---------- files ----------
        c('admin saves own file', put(A, 'users/adam.json', '{"a":1}', cid) == 201)
        for p_ in ['users/yousef.json', 'users/yousef.hd-2026-05.json', 'users/yousef.y2025.json', 'users/yousef.log-2026-11.json']:
            c(f'user saves own {p_.split("/")[1]}', put(U, p_, '{}', cid) == 201)
        c("user cannot save someone else's file", put(U, 'users/adam.json', 'x', cid) == 403)
        c('user cannot save a look-alike name (yousef2.json)', put(U, 'users/yousef2.json', 'x', cid) == 403)
        c('user cannot save settings outside their files', put(U, 'settings.json', 'x', cid) == 403)
        c('user may save a backup', put(U, 'Backups/backup-1.zip', 'b64:AA==', cid) == 201)
        c("admin may save anyone's file (restores, imports)", put(A, 'users/yousef.json', '{"by":"admin"}', cid) == 201)
        st, rows = U.get(f(0)); c('everyone in the company reads the company files', st == 200 and len(rows) >= 5, (st, len(rows or [])))
        big = 'x' * 200000
        c('a big file (200 KB) saves', put(U, 'users/yousef.y2024.json', big, cid) == 201 and len(U.get(f'/rest/v1/files?select=content&path=eq.{D}/users/yousef.y2024.json')[1][0]['content']) == 200000)
        # ---------- another company ----------
        st, cid2 = P.rpc('owner_create_company', p_name='Beta', p_admin_email='boss@beta.test', p_admin_member='boss')
        B = Api(sb, sb.as_user('boss@beta.test')); B.rpc('accept_invites')
        st, rows = B.get(f(0)); c("another company's admin sees none of Acme's files", st == 200 and all(r['path'] for r in rows) and not rows, rows[:2])
        c("…cannot write into Acme", put(B, 'users/boss.json', 'x', cid) == 403)
        c("…cannot invite into Acme", B.rpc('invite_member', c=cid, p_email='spy@beta.test', p_member='spy')[0] == 403)
        c("…cannot see Acme's people", B.get(f'/rest/v1/company_members?select=member_id&company_id=eq.{cid}')[1] == [])
        c("…cannot read Acme's audit", B.rpc('company_audit', c=cid)[0] == 403)
        # ---------- not signed in, or signed in without an invitation ----------
        st, rows = anon.get(f(0)); c('not signed in: nothing', st in (401, 403) or rows == [], (st, rows))
        X = Api(sb, sb.as_user('random@nowhere.test')); c('an account without an invitation sees nothing', X.rpc('accept_invites')[1] == 0 and X.get(f(0))[1] == [] and X.rpc('my_companies')[1] == [])
        # ---------- what a user may not do ----------
        for fn, kw in [('invite_member', dict(c=cid, p_email='a@b.test', p_member='z')), ('set_member', dict(c=cid, p_member='adam', p_role='user', p_active=True)),
                       ('grant_support', dict(c=cid, hours=5)), ('delete_my_company', dict(c=cid, p_confirm='Acme')), ('owner_companies', {}),
                       ('owner_create_company', dict(p_name='Mine', p_admin_email='y@y.test')), ('owner_set_company', dict(c=cid, p_status='paused', p_seats=99))]:
            c(f'a user cannot {fn}', U.rpc(fn, **kw)[0] == 403)
        c("a company admin cannot use the Owner Console", A.rpc('owner_companies')[0] == 403 and A.rpc('owner_set_company', c=cid, p_status='active', p_seats=999)[0] == 403)
        # ---------- support access: only when the company grants it ----------
        c("platform owner cannot read a company's data", P.get(f(0))[1] == [] and P.rpc('owner_open_support', c=cid)[0] == 403)
        c('company admin grants 2 hours of support', A.rpc('grant_support', c=cid, hours=2)[0] == 200)
        c('…then the platform owner can read (and the visit is logged)', len(P.get(f(0))[1]) >= 5 and P.rpc('owner_open_support', c=cid)[0] == 200)
        c("…but still cannot write", put(P, 'users/adam.json', 'x', cid) == 403)
        A.rpc('grant_support', c=cid, hours=0); c('support taken back: nothing again', P.get(f(0))[1] == [])
        # ---------- the admin manages people ----------
        st, e = A.rpc('set_member', c=cid, p_member='adam', p_role='user', p_active=True)
        c('the last admin cannot be made a user', st == 400 and 'admin' in (e or {}).get('message', ''), (st, e))
        c('admin turns a person off', A.rpc('set_member', c=cid, p_member='yousef', p_role='user', p_active=False)[0] == 200)
        c('…they see nothing and cannot save', U.get(f(0))[1] == [] and put(U, 'users/yousef.json', 'x', cid) == 403)
        A.rpc('set_member', c=cid, p_member='yousef', p_role='admin', p_active=True)
        c('…on again, now as a second admin', (U.rpc('my_companies')[1] or [{}])[0].get('role') == 'admin' and put(U, 'users/adam.json', '{}', cid) == 201)
        A.rpc('set_member', c=cid, p_member='yousef', p_role='user', p_active=True)
        # ---------- pause ----------
        c('platform owner pauses Acme', P.rpc('owner_set_company', c=cid, p_status='paused', p_seats=3)[0] == 200)
        mc = A.rpc('my_companies')[1]
        c('…its people see "paused" and no data', mc and mc[0]['status'] == 'paused' and A.get(f(0))[1] == [] and put(A, 'users/adam.json', 'x', cid) == 403, mc)
        P.rpc('owner_set_company', c=cid, p_status='active', p_seats=5)
        c('…active again (5 seats)', len(A.get(f(0))[1]) >= 5)
        # ---------- audit ----------
        st, log = A.rpc('company_audit', c=cid); acts = {r['action'] for r in (log or [])}
        c('audit log: created, invited, joined, support granted / visit / ended, member changed, company changed',
          {'company created', 'invited', 'joined', 'support granted', 'support visit', 'support ended', 'member changed', 'company changed'} <= acts, sorted(acts))
        c('a user cannot read the audit log', U.rpc('company_audit', c=cid)[0] == 403)
        # ---------- re-invite a person who left, to a new email ----------
        A.rpc('set_member', c=cid, p_member='yousef', p_role='user', p_active=False)
        c('re-invite yousef with a new email', A.rpc('invite_member', c=cid, p_email='yousef.new@acme.test', p_member='yousef')[0] == 200)
        U2 = Api(sb, sb.as_user('yousef.new@acme.test')); U2.rpc('accept_invites')
        c('…the new account is yousef, with his old files', (U2.rpc('my_companies')[1] or [{}])[0].get('member_id') == 'yousef' and len(U2.get(f'/rest/v1/files?select=path&path=like.{D}/users/yousef*')[1]) >= 4)
        c('…the old account no longer gets in', U.get(f(0))[1] == [])
        # ---------- deleting a company ----------
        c('delete needs the exact name', A.rpc('delete_my_company', c=cid, p_confirm='acme')[0] == 400)
        c('platform owner deletes Beta', P.rpc('owner_delete_company', c=cid2, p_confirm='Beta')[0] == 200 and B.rpc('my_companies')[1] == [])
        c('admin deletes Acme with all its data', A.rpc('delete_my_company', c=cid, p_confirm='Acme')[0] == 200 and sb.sql("select count(*) from public.files;").strip() == '0')
    finally:
        sb.stop()
    c.done(None)

if __name__ == '__main__': main()
