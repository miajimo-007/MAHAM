// MAHAM — sends the emails queued for 🔔 notifications (table notify_queue, filled by the database).
// Deploy:  supabase functions deploy send-notifications --no-verify-jwt
// Secrets: supabase secrets set RESEND_API_KEY=re_… MAIL_FROM="MAHAM <no-reply@your-domain>" APP_URL=https://you.github.io/MAHAM/
// Run every minute: Supabase → Integrations → Cron → new job → "Supabase Edge Function" → send-notifications, * * * * *
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are given to every function by Supabase.)
const URL_ = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND = Deno.env.get('RESEND_API_KEY') || '';
const FROM = Deno.env.get('MAIL_FROM') || 'MAHAM <no-reply@example.com>';
const APP = (Deno.env.get('APP_URL') || '').replace(/\/+$/, '/');
const db = (path: string, init: RequestInit = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

Deno.serve(async () => {
  if (!RESEND) return new Response(JSON.stringify({ sent: 0, note: 'RESEND_API_KEY is not set' }), { status: 200 });
  const r = await db('notify_queue?select=id,to_email,title,body,link,tries&sent_at=is.null&tries=lt.5&order=created_at.asc&limit=50');
  const rows: { id: number; to_email: string; title: string; body: string; link: string; tries: number }[] = await r.json();
  let sent = 0;
  for (const m of rows) {
    const href = APP ? APP + (m.link || '') : '';
    const html = `<p><b>${esc(m.title)}</b></p>${m.body ? `<p>${esc(m.body)}</p>` : ''}${href ? `<p><a href="${esc(href)}">Open in MAHAM</a></p>` : ''}<p style="color:#888;font-size:12px">You get this because of a notification in MAHAM. Switch emails off in 🔔 → Emails.</p>`;
    const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, to: [m.to_email], subject: `MAHAM: ${m.title}`.slice(0, 150), html }) });
    const patch = res.ok ? { sent_at: new Date().toISOString(), error: null } : { tries: m.tries + 1, error: (await res.text()).slice(0, 300) };
    await db(`notify_queue?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    if (res.ok) sent++;
  }
  return new Response(JSON.stringify({ sent, waiting: rows.length - sent }), { headers: { 'Content-Type': 'application/json' } });
});
