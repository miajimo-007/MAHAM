/* DARRIK settings for a hosted copy. Edit this file next to DARRIK.html — no rebuild needed.
 * Full guide: docs/HOSTING.md */
window.DARRIK_CONFIG = {
  /* Where the data is kept:
   *   'auto'   — the shared folder on desktop Chrome / Edge, this device on phones and other browsers (default)
   *   'folder' — always the shared folder (desktop Chrome / Edge)
   *   'device' — this browser only (a phone, a demo, one person)
   *   'cloud'  — the online database below */
  storage: 'auto',

  /* Online database (Supabase). Leave empty until it is hosted.
   *   url      — Project Settings → API → Project URL, e.g. 'https://abcd1234.supabase.co'
   *   anonKey  — Project Settings → API → anon / public key (safe to publish: security is enforced by the database)
   *   company  — optional: a company id, when one sign-in can belong to several companies
   *   companyName — shown in the app where the folder name used to be */
  cloud: {
    url: '',
    anonKey: '',
    company: '',
    companyName: '',
  },

  /* Phones: offer "Add to Home Screen" when served over https (GitHub Pages, your own domain). */
  installable: true,
};
