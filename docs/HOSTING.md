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
2. **SQL Editor → New query**: paste `supabase/schema.sql`, **Run**. (Safe to run again after an update.)
3. **Authentication → URL Configuration**: set **Site URL** to the address of the app (for example
   `https://<owner>.github.io/<repo>/`), so the links in sign-up and password emails come back to the app.
4. **Authentication → Users → Add user**: create **your own** account (email + password, _Auto Confirm User_ on).
5. Make yourself the **platform owner**: the last (commented) line of `schema.sql` — put your email, run just that line.
6. **Project Settings → API**: copy the _Project URL_ and the _anon_ / _publishable_ key (never the secret key).

## 3. Connect the app

Edit `maham.config.js` next to the app (on GitHub Pages: `pages/maham.config.js`):

```js
storage: 'cloud',
cloud: { url: 'https://abcd1234.supabase.co', anonKey: 'sb_publishable_…' },
```

Refresh. Sign in with your email and password: as platform owner you land in the **Owner Console**.
The anon key is meant to be public; the database's row-level security decides who reads and writes what.

## 4. Companies and people (all by invitation)

1. **Owner Console → New company**: its name, seats, and its admin's email. Send the admin the app's link.
2. The admin opens the link, chooses **Create account** with that email, and answers three setup questions
   (company name, their name, teams).
3. The admin invites their own people in **Admin → Company & accounts** (an existing person in Admin → People, or a
   new one) and sends them the link. Each person chooses **Create account** with the invited email.
4. In the same place the admin makes people **Admin** or **User**, turns accounts off, cancels invitations, sees the
   seats used, the **audit log**, and can delete the company.

An account nobody invited sees nothing. Someone invited by two companies chooses one when signing in.
"Switch person" becomes **Sign out**. Forgot password sends a link by email.

## Who sees what

| Who                  | Can                                                                                                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform owner (you) | Owner Console: create / pause / delete companies, seats, accounts, invite an admin — and **Open as admin** in any company (all of its data). Every opening and every save there is in that company's audit log. |
| Company admin        | Everything in their own company (the app's super admin), people and invitations.                                                                                                                                |
| User                 | Their company's app, by the app's normal permissions; writes only their own data file.                                                                                                                          |

## What the database enforces

- Everyone reads only their own company; a paused company opens for nobody.
- Each person writes only their own data files (and backups); the company admin may write any file of the company.
- Seats, invitations, the last admin, support access and the audit log are checked in the database, not in the app.
- The app's own trust rules (`src/js/access/trust.js`) still run on top: changes a person is not allowed to make are
  ignored and listed in System Check.

## Backups

Supabase makes daily database backups on paid plans. The app's own backups (Admin → Data) are also saved in the
database under `MAHAM Data/Backups/`.

## Emails for 🔔 notifications (optional)

When someone gives a person work, asks for their approval or @mentions them, MAHAM shows it under 🔔 — and, online,
can also email it. The database queues the emails (table `notify_queue`); a small function sends them:

1. Create a free account at an email service with an API (the function uses **Resend**; change one `fetch` in
   `supabase/functions/send-notifications/index.ts` for another one) and verify your sending domain.
2. Deploy the function and give it its settings:
   ```
   supabase functions deploy send-notifications --no-verify-jwt
   supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="MAHAM <no-reply@your-domain>" APP_URL=https://you.github.io/MAHAM/
   ```
3. Run it every minute: Supabase → **Integrations → Cron** → new job → _Supabase Edge Function_ → `send-notifications`,
   schedule `* * * * *`.

Each person can switch emails off in 🔔 → _Emails: on/off_. Without step 1–3 nothing is sent; 🔔 in the app works anyway.

## Service desk: customer portal and email in (optional)

- **Portal:** switch it on in **Service → Tickets → Settings → Customer portal**, then give customers the address
  `https://you.github.io/MAHAM/portal.html?c=<your company id>` (Owner Console shows the company id). They raise tickets
  without an account and follow them with a private link. Knowledge base articles marked **Public** are its help centre.
- **Email in:** deploy `supabase/functions/inbound-email` (`supabase functions deploy inbound-email --no-verify-jwt`,
  `supabase secrets set INBOUND_SECRET=…`) and point your mail service's inbound webhook at
  `https://<project>.supabase.co/functions/v1/inbound-email?company=<company id>&secret=<INBOUND_SECRET>`.
  Each email becomes a ticket in the queue for it, like a portal ticket.
