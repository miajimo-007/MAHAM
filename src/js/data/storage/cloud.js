/* MAHAM — Online storage (Supabase: Postgres + sign-in), used when maham.config.js says storage: 'cloud'.
 * Plain fetch calls to Supabase's REST API — no library to download. The database side is in supabase/schema.sql:
 * table "files" keeps each person's JSON file per company; row-level security lets everyone in the company read,
 * and each person write only their own file (the company owner may write any; anyone may write backups).
 * Nothing here runs unless the storage mode is 'cloud' and the URL and key are filled in. */
'use strict';

const CloudBackend = {
  cfg: null,
  session: null,
  company: null,
  _cache: new Map(),
  configured(c) {
    return !!(c && c.url && c.anonKey);
  },
  init(cfg) {
    CloudBackend.cfg = Object.assign({ table: 'files' }, cfg);
    CloudBackend.session = LS.get('maham.cloud.session', null);
  },
  base() {
    return CloudBackend.cfg.url.replace(/\/+$/, '');
  },
  headers(extra) {
    const h = { apikey: CloudBackend.cfg.anonKey, 'Content-Type': 'application/json' };
    if (CloudBackend.session) h.Authorization = 'Bearer ' + CloudBackend.session.access_token;
    return Object.assign(h, extra || {});
  },
  async req(path, opts = {}, retried) {
    const r = await fetch(CloudBackend.base() + path, Object.assign({}, opts, { headers: CloudBackend.headers(opts.headers) }));
    if (r.status === 401 && !retried && CloudBackend.session && CloudBackend.session.refresh_token) {
      await CloudBackend.refresh();
      return CloudBackend.req(path, opts, true);
    }
    return r;
  },
  /* ---------- sign-in ---------- */
  async signIn(email, password) {
    const r = await fetch(CloudBackend.base() + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: CloudBackend.cfg.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || 'Sign-in failed');
    CloudBackend.keep(j);
    return j;
  },
  async refresh() {
    const r = await fetch(CloudBackend.base() + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: CloudBackend.cfg.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: CloudBackend.session.refresh_token }),
    });
    if (!r.ok) {
      CloudBackend.signOut();
      throw new Error('Session expired — sign in again');
    }
    CloudBackend.keep(await r.json());
  },
  keep(j) {
    CloudBackend.session = { access_token: j.access_token, refresh_token: j.refresh_token, user: j.user };
    LS.set('maham.cloud.session', CloudBackend.session);
  },
  signOut() {
    try {
      if (CloudBackend.session)
        fetch(CloudBackend.base() + '/auth/v1/logout', { method: 'POST', headers: CloudBackend.headers() }).catch(() => {});
    } catch (e) {
      /* */
    }
    CloudBackend.session = null;
    CloudBackend.company = null;
    LS.set('maham.cloud.session', null);
  },
  /* ---------- accounts (people join only by invitation: an account without one sees nothing) ---------- */
  async signUp(email, password) {
    const r = await fetch(CloudBackend.base() + '/auth/v1/signup', {
      method: 'POST',
      headers: { apikey: CloudBackend.cfg.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.msg || j.error_description || j.message || 'Could not create the account');
    if (j.access_token) {
      CloudBackend.keep(j);
      return 'signed-in';
    }
    return 'confirm-email'; // Supabase first sends a link to confirm the address
  },
  async recover(email) {
    const r = await fetch(CloudBackend.base() + '/auth/v1/recover', {
      method: 'POST',
      headers: { apikey: CloudBackend.cfg.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.msg || j.message || 'Could not send the email');
    }
  },
  async setPassword(password) {
    const r = await CloudBackend.req('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password }) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.msg || j.message || 'Could not change the password');
    }
  },
  /* links in Supabase emails come back as #access_token=…&refresh_token=…&type=recovery|signup|invite|magiclink */
  fromLink() {
    const h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    if (!h.get('access_token')) return '';
    CloudBackend.keep({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token') || '', user: null });
    history.replaceState(null, '', location.pathname + location.search);
    return h.get('type') || 'signin';
  },
  async me() {
    const r = await CloudBackend.req('/auth/v1/user');
    if (!r.ok) return null;
    const u = await r.json();
    if (CloudBackend.session) {
      CloudBackend.session.user = u;
      LS.set('maham.cloud.session', CloudBackend.session);
    }
    return u;
  },
  email() {
    return ((CloudBackend.session || {}).user || {}).email || '';
  },
  async rpc(fn, args) {
    const r = await CloudBackend.req('/rest/v1/rpc/' + fn, { method: 'POST', body: JSON.stringify(args || {}) });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const e = new Error((j && (j.message || j.msg)) || fn + ' failed (' + r.status + ')');
      e.status = r.status;
      throw e;
    }
    return j;
  },
  /* the companies this account belongs to (open invitations for its email are accepted first) */
  async companies() {
    try {
      await CloudBackend.rpc('accept_invites');
    } catch (e) {
      /* none */
    }
    return (await CloudBackend.rpc('my_companies')) || [];
  },
  async isPlatformOwner() {
    try {
      return !!(await CloudBackend.rpc('is_platform_owner'));
    } catch (e) {
      return false;
    }
  },
  /* the company's people according to the database: who may sign in, and who is an admin */
  async people(company) {
    const r = await CloudBackend.req(`/rest/v1/company_members?select=member_id,role,active,email&company_id=eq.${company}`);
    if (!r.ok) throw new Error('Could not read the people of your company (' + r.status + ')');
    return (await r.json()).map(m => ({ id: m.member_id, admin: m.role === 'admin', active: m.active !== false, email: m.email || '' }));
  },
  async invites(company) {
    const r = await CloudBackend.req(`/rest/v1/invites?select=email,member_id,role,created_at,accepted_at&company_id=eq.${company}`);
    return r.ok ? r.json() : [];
  },
  /* the company to open: the one asked for in the settings, else the last one used, else the first */
  pick(list) {
    const ok = list.filter(
      m => m.active && m.status === 'active' && (!CloudBackend.cfg.company || m.company_id === CloudBackend.cfg.company)
    );
    const last = LS.get('maham.cloud.company', '');
    return ok.find(x => x.company_id === last) || (ok.length === 1 ? ok[0] : null);
  },
  use(m) {
    CloudBackend.company = m.company_id;
    LS.set('maham.cloud.company', m.company_id);
  },
  async membership() {
    if (!CloudBackend.session) return null;
    const m = CloudBackend.pick(await CloudBackend.companies());
    if (m) CloudBackend.use(m);
    return m;
  },
  /* ---------- the five backend methods (see vfs.js) ---------- */
  q(s) {
    return encodeURIComponent(s);
  },
  rows(filter, select) {
    return CloudBackend.req(`/rest/v1/${CloudBackend.cfg.table}?select=${select}&company_id=eq.${CloudBackend.company}&${filter}`);
  },
  async list(dir) {
    const pre = dir ? dir + '/' : '';
    const r = await CloudBackend.rows(`path=like.${CloudBackend.q(pre.replace(/[%_]/g, '\\$&'))}*`, 'path,size,updated_at');
    if (!r.ok) throw new Error('Could not list ' + (dir || 'the folder') + ' (' + r.status + ')');
    const seen = new Map();
    for (const x of await r.json()) {
      const rest = x.path.slice(pre.length);
      const i = rest.indexOf('/');
      if (i < 0) seen.set(rest, { name: rest, kind: 'file', size: x.size, mtime: Date.parse(x.updated_at) });
      else if (!seen.has(rest.slice(0, i))) seen.set(rest.slice(0, i), { name: rest.slice(0, i), kind: 'directory' });
    }
    return [...seen.values()];
  },
  async read(path, opt = {}) {
    const meta = await CloudBackend.rows(`path=eq.${CloudBackend.q(path)}`, 'size,updated_at');
    if (!meta.ok) throw new Error('Could not read ' + path + ' (' + meta.status + ')');
    const [m] = await meta.json();
    if (!m) return null;
    const mtime = Date.parse(m.updated_at);
    if (opt.head) return { size: m.size, mtime };
    const c = CloudBackend._cache.get(path);
    if (c && c.mtime === mtime) return c; // unchanged since last read: no download
    const r = await CloudBackend.rows(`path=eq.${CloudBackend.q(path)}`, 'content,size,updated_at');
    const [x] = await r.json();
    if (!x) return null;
    const data = x.content.startsWith('b64:') ? CloudBackend.fromB64(x.content.slice(4)) : x.content;
    const out = { data, size: x.size, mtime: Date.parse(x.updated_at) };
    CloudBackend._cache.set(path, out);
    return out;
  },
  async write(path, data) {
    const content = typeof data === 'string' ? data : 'b64:' + (await CloudBackend.toB64(data));
    const r = await CloudBackend.req(`/rest/v1/${CloudBackend.cfg.table}?on_conflict=company_id,path`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ company_id: CloudBackend.company, path, content }),
    });
    if (!r.ok) {
      const e = new Error(r.status === 403 || r.status === 401 ? 'Not allowed to save ' + path : 'Could not save (' + r.status + ')');
      e.name = r.status === 403 ? 'NotAllowedError' : 'Error';
      throw e;
    }
    const [x] = await r.json();
    const mtime = Date.parse(x.updated_at);
    CloudBackend._cache.set(path, { data, size: x.size, mtime });
    return { size: x.size, mtime };
  },
  async remove(path) {
    await CloudBackend.req(`/rest/v1/${CloudBackend.cfg.table}?company_id=eq.${CloudBackend.company}&path=eq.${CloudBackend.q(path)}`, {
      method: 'DELETE',
    });
    CloudBackend._cache.delete(path);
  },
  async mkdir() {
    /* folders exist as soon as a file is saved in them */
  },
  async hasDir(dir) {
    const D = Config.DATA_FOLDER;
    return dir === D || dir.startsWith(D + '/') || (await CloudBackend.list(dir)).length > 0;
  },
  async toB64(blob) {
    const b = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  },
  fromB64(s) {
    const bin = atob(s);
    const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return new Blob([b]);
  },
};
