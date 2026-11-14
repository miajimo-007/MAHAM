// MAHAM — email in: an email to your support address becomes a ticket (the same way as the customer portal).
// Point your mail service's "inbound email" webhook (Resend, Postmark, SendGrid Inbound Parse, Mailgun routes …) at:
//   https://<project>.supabase.co/functions/v1/inbound-email?company=<company id>&secret=<INBOUND_SECRET>
// Deploy:  supabase functions deploy inbound-email --no-verify-jwt
// Secret:  supabase secrets set INBOUND_SECRET=<a long random text>
// The company's portal must be switched on (Service desk → Settings). The sender gets the private link by the reply
// your team sends; a reply to that email with the link opens the same ticket on the portal.
const URL_ = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('INBOUND_SECRET') || '';

/* the parts every service sends, under its own names */
function pick(b: Record<string, unknown>) {
  const s = (v: unknown) => (typeof v === 'string' ? v : v && typeof v === 'object' && 'email' in (v as object) ? String((v as { email: string }).email) : '');
  const from = s(b.from) || s(b.From) || s(b.sender) || s((b.envelope as Record<string, unknown> | undefined)?.from);
  const m = /^(.*?)\s*<([^>]+)>$/.exec(from);
  return {
    name: m ? m[1].replace(/"/g, '').trim() : '',
    email: (m ? m[2] : from).trim().toLowerCase(),
    subject: s(b.subject) || s(b.Subject) || '(no subject)',
    text: s(b.text) || s(b.TextBody) || s(b['body-plain']) || s(b.plain) || '',
  };
}

Deno.serve(async req => {
  const u = new URL(req.url);
  if (!SECRET || u.searchParams.get('secret') !== SECRET) return new Response('not allowed', { status: 403 });
  const company = u.searchParams.get('company') || '';
  let body: Record<string, unknown> = {};
  const type = req.headers.get('content-type') || '';
  if (type.includes('json')) body = await req.json();
  else { const f = await req.formData(); f.forEach((v, k) => { body[k] = typeof v === 'string' ? v : ''; }); }
  const m = pick(body);
  if (!m.email.includes('@')) return new Response('no sender', { status: 400 });
  const r = await fetch(`${URL_}/rest/v1/rpc/portal_submit`, {
    method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ c: company, p_name: m.name, p_email: m.email, p_subject: m.subject.slice(0, 200), p_desc: m.text.slice(0, 8000), p_category: '' }),
  });
  // the portal function now marks the channel as "portal"; an email ticket is the same ticket, the subject says it came by mail
  return new Response(await r.text(), { status: r.ok ? 200 : 400, headers: { 'Content-Type': 'application/json' } });
});
