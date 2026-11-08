/* MAHAM settings for the GitHub Pages copy (published by .github/workflows/pages.yml).
 * Online: the data is kept in the Supabase database below, each company apart (supabase/schema.sql, docs/HOSTING.md).
 * People sign in with email + password; companies and people join only by invitation (Owner Console → company admin).
 * The anon / publishable key is meant to be public — the database's row-level security does the protecting.
 * Never put the service_role / secret key here. */
window.MAHAM_CONFIG = {
  storage: 'cloud',
  cloud: { url: 'https://hmrvcxyltbcrpipisbpg.supabase.co', anonKey: 'sb_publishable_0AbqZlc55Ute70MaZcYOnw_CXFcVz1j' },
  installable: true,
};
