# Hosting MAHAM (website, phones and the online database)

MAHAM runs in three ways from the same build. Choose one in **`maham.config.js`** (next to `MAHAM.html`):

| `storage`          | Where the data is                                                                | Good for                               |
| ------------------ | -------------------------------------------------------------------------------- | -------------------------------------- |
| `'auto'` (default) | Shared folder on desktop Chrome / Edge; this device on phones and other browsers | Trying it out, a team on one network   |
| `'folder'`         | A shared network folder (desktop Chrome / Edge)                                  | Teams with a shared drive, no internet |
| `'device'`         | This browser only                                                                | A demo, one person, a phone            |
| `'cloud'`          | The online database (Supabase)                                                   | Several people, phones, a company      |

No rebuild is needed after changing the settings file: edit it and refresh the page.

## 1. Put the app on the web (GitHub Pages)

1. Build: `npm run build` → `dist/MAHAM/` holds `MAHAM.html`, `maham.config.js`, `manifest.webmanifest`, `sw.js`, `icons/`.
2. Publish the **contents** of `dist/MAHAM/` — for example to a `gh-pages` branch, or any static host (Cloudflare Pages,
   Netlify, your own server). HTTPS is required for phones to install it.
3. Open `https://<you>.github.io/<repo>/MAHAM.html`. On a phone: **Share → Add to Home Screen** (iPhone) or
   **⋮ → Install app** (Android).

Until the database is set up, phones keep their data on the phone (`'auto'` / `'device'`).

## 2. Create the online database (Supabase)

1. Create a project at supabase.com. Choose the region closest to your customers — and check where your customers
   require their data to be stored (for Saudi organisations, the Personal Data Protection Law; hospitals often require
   in-Kingdom hosting — Supabase can also be self-hosted on a cloud region in the Kingdom).
2. **SQL Editor → New query**: paste `supabase/schema.sql`, **Run**.
3. **Authentication → Providers**: keep _Email_ on. For a company, turn off public sign-ups (**Authentication →
   Sign In / Providers → Allow new users to sign up: off**) — the owner creates accounts.
4. **Authentication → Users → Add user**: create the owner's account (email + password).
5. Create the company and link the owner (bottom of `schema.sql`, the commented `insert` — replace the email). The
   `member_id` must be the owner's id in the app (the super admin in Admin → People; `adam` in the sample data).
6. **Project Settings → API**: copy the _Project URL_ and the _anon public_ key.

## 3. Connect the app

Edit `maham.config.js` on the website:

```js
storage: 'cloud',
cloud: { url: 'https://abcd1234.supabase.co', anonKey: 'eyJ…', company: '', companyName: 'My Company' },
```

Refresh. The app asks for email and password, finds the company and opens as that person.
The _anon_ key is meant to be public; the database's row-level security decides who reads and writes what.

## 4. Add people

1. In the app: **Admin → People → add the person** (note their id).
2. In Supabase: **Authentication → Users → Add user** (their email and a first password).
3. Link them (SQL, bottom of `schema.sql`): company id + their email + their id in the app.

They sign in on any phone or PC. "Switch person" becomes **Sign out**.

## What the database enforces

- Everyone reads only their own company.
- Each person writes only their own data file (and backups); the owner may write any file of the company.
- The app's own trust rules (`src/js/access/trust.js`) still run on top: changes a person is not allowed to make are
  ignored and listed in System Check.

## Backups

Supabase makes daily database backups on paid plans. The app's own backups (Admin → Data) are also saved in the
database under `MAHAM Data/Backups/`.
