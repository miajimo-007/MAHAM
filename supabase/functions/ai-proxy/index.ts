// MAHAM — calls the AI for a signed-in person with a key kept in the database (table ai_keys), so no key ever
// reaches a browser. Deploy: supabase functions deploy ai-proxy
// The browser sends { company, conn, system, messages } with the person's sign-in token; this checks the person and
// the connection (company's, or their own), adds the key, calls the service and returns { text }.
const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
type Msg = { role: 'user' | 'assistant'; content: string };

async function call(k: { provider: string; model: string; base_url: string; secret: string }, system: string, messages: Msg[]): Promise<string> {
  if (k.provider === 'anthropic') {
    const model = k.model || 'claude-opus-5-5';
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-api-key': k.secret, 'anthropic-version': '2026-10-21' };
    const body: Record<string, unknown> = { model, max_tokens: 16000, system, messages };
    if (/^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5)/.test(model)) { body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `Claude did not answer (${r.status})`);
    if (j.stop_reason === 'refusal') throw new Error('Claude declined this request');
    return (j.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n').trim();
  }
  if (k.provider === 'google') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(k.model || 'gemini-2.5-flash')}:generateContent?key=${encodeURIComponent(k.secret)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `Gemini did not answer (${r.status})`);
    return (j?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('').trim();
  }
  const base = (k.base_url || (k.provider === 'openai' ? 'https://api.openai.com/v1' : '')).replace(/\/+$/, '');
  if (!base) throw new Error('This connection has no address');
  const url = k.provider === 'azure' ? `${base}/chat/completions?api-version=2024-10-21` : `${base}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(k.provider === 'azure' ? { 'api-key': k.secret } : { Authorization: `Bearer ${k.secret}` }) };
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ model: k.model || undefined, messages: [{ role: 'system', content: system }, ...messages] }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `The AI did not answer (${r.status})`);
  return String(j?.choices?.[0]?.message?.content || '').trim();
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('authorization') || '';
    const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } });
    if (!u.ok) return out({ error: 'Sign in again' }, 401);
    const user = await u.json();
    const { company, conn, system, messages } = await req.json();
    if (!company || !conn || !Array.isArray(messages) || !messages.length) return out({ error: 'Nothing to ask' }, 400);
    const kr = await fetch(`${URL_}/rest/v1/rpc/ai_key_for`, { method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ c: company, p_id: conn, p_user: user.id }) });
    const k = await kr.json();
    if (!kr.ok || !k) return out({ error: 'This AI connection is not yours to use' }, 403);
    const clean: Msg[] = messages.slice(-30).map((m: Msg) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 60000) }));
    return out({ text: await call(k, String(system || '').slice(0, 60000), clean) });
  } catch (e) {
    return out({ error: e instanceof Error ? e.message : 'The AI did not answer' }, 502);
  }
});
