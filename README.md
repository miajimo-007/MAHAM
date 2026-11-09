# MAHAM

**From effort to impact.** MAHAM is a team work-tracking and performance app that runs as **one HTML file** —
no server, no installation, no internet connection. A team keeps the file and its data in a shared network folder;
each person opens it in their browser and works from there.

> © 2026 Mohammed Miaji. All rights reserved. The source is published for viewing only — see [LICENSE](LICENSE).

## What it does

| Area            | Features                                                                                                                                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Daily work**  | Analyst Desk, To Do list with priorities, follow-up and milestone flags, manager confirmation, shadow work log, IT help-desk import (ManageEngine), attendance (present unless marked), requests and approvals, meetings and actions, announcements |
| **Desks**       | Manager desk, director desk (all teams), tasks from the director with a manager → analyst chain, team activity                                                                                                                                      |
| **Projects**    | Scrum boards, sprints, customizable project workflows with approvals                                                                                                                                                                                |
| **Performance** | Dynamic monthly scoring per team, heat map, employee breakdown, lazy days, weekly / monthly / yearly reports (print, PDF, Excel)                                                                                                                    |
| **Admin**       | People, teams and departments, page-level permissions, functions, workflows, scoring rules, feedback inbox, data tools, change log, and **Customize** (name, logo, colours, menu, words, targets, weekend, start pages …)                           |

## Signing in

The app opens on a login page: **employee ID + PIN** (the user name works until the admin fills the employee ID).
PINs are stored salted and stretched (PBKDF2, 150,000 rounds); a first sign-in chooses one; 5 wrong tries lock the
account on that PC for 15 minutes. People stay signed in until they sign out. Super admins can make a one-time
**recovery code** for a forgotten PIN. This controls who uses the app; files in the shared folder are protected by the
folder's own permissions.

## How it works

- **Single file.** `tools/build.py` inlines every stylesheet and script into `dist/MAHAM/MAHAM.html`.
- **Shared folder as the database.** The app uses the browser's File System Access API. Each person writes only
  their own file (`MAHAM Data/users/<id>.json`); everyone reads all files and the newest version of each record wins.
- **Trust rules.** Settings are accepted only from a super admin; records only from the people allowed to change them
  (`src/js/access/trust.js`). Changes that break the rules are ignored and listed in System Check.
- **Offline by design.** Nothing is sent anywhere. There are no external requests, analytics or CDNs.
- **Classic scripts, not ES modules.** Browsers block modules on pages opened from a folder (`file://`), so files are
  plain scripts loaded in dependency order (see `src/index.html`) and share a small set of global namespaces.

More detail: [Hosting, phones and database](docs/HOSTING.md) · [Architecture](docs/ARCHITECTURE.md) · [Data model](docs/DATA-MODEL.md) · [Permissions](docs/PERMISSIONS.md) · [Development](docs/DEVELOPMENT.md)

## Live copy (GitHub Pages)

Every push to `main` publishes the app with [`.github/workflows/pages.yml`](.github/workflows/pages.yml) to
`https://<owner>.github.io/<repo>/`. That copy uses [`pages/maham.config.js`](pages/maham.config.js): it is
**online** — many companies on one Supabase database, each kept apart by the database. Sign in with email and password;
companies and people join only by invitation (Owner Console → company admin). One-time setup: **Settings → Pages →
Source: GitHub Actions**, and the database steps in [docs/HOSTING.md](docs/HOSTING.md).

## Phones and the online database

- **Phones:** the layout adapts to small screens, and when the app is served over https (for example GitHub Pages)
  it can be installed with _Add to Home Screen_. Without a shared folder (phones, Safari, Firefox) the data is kept
  on the device.
- **Online database (many companies):** fill in `maham.config.js` (next to `MAHAM.html`) and run
  `supabase/schema.sql` — every step is in [docs/HOSTING.md](docs/HOSTING.md). The database enforces who may read
  and write (row-level security); the app does not need a rebuild. The shared-folder and this-device modes stay.

## Requirements

- Shared folder: Microsoft Edge or Google Chrome on a desktop (the File System Access API).
- This device / online database: any current browser, including Safari and Chrome on phones.
- To build and test: Python 3.10+, Node.js 20+ (formatting and linting only), Playwright for Python (tests).

## Quick start

```bash
python3 tools/build.py          # → dist/MAHAM/MAHAM.html and dist/MAHAM_App_<version>.zip
```

Open `dist/MAHAM/MAHAM.html` in Edge or Chrome, choose the `dist/MAHAM` folder when asked, and pick a name.
The sample data contains fictional people only.

## MAHAM Lab — the analysis app

`lab/` is a second single-file app for analysts. It reads the team's shared folder **read-only** (it never writes
there) and adds:

- **Team insights** from the shared data: quick-win ideas from repeated help-desk requests, an auto-tagger, late-risk
  scoring, forecasts and snapshots.
- **Studio** — load an Excel / CSV file (or a folder of them) and build multi-page dashboards from 51 chart types,
  drawn by its own engine (no chart library, nothing online). Patient identifiers are found and removed or coded
  before anything is kept, and counts under 5 are hidden. Data and dashboards stay in that browser (IndexedDB).
- **Experimenting:** recorded data steps with refresh, formulas, ranges, value lists, hospital calendar columns,
  linking two datasets, saved measures, drill-down, compare periods, "why did it change", ask in words, before / after
  a go-live, what drives a number, patterns over time (weekday, hour, Ramadan / peak season), what-if, a findings
  notebook and a findings file the main app can import (Admin → Data).

```bash
python3 lab/tools/build.py      # → lab/dist/MAHAM-Lab.html
python3 lab/tests/test_lab.py   # end-to-end test on a made-up shared folder
```

## Development

```bash
npm install                     # dev tools only: Prettier, ESLint
npm run lint                    # ESLint
npm run format                  # Prettier (write)  ·  npm run format:check
pip install playwright openpyxl && python3 -m playwright install chromium
npm run build && npm test       # build, then the end-to-end test suite (Playwright)
```

## Project structure

```
src/
  index.html            page shell; lists every stylesheet and script in load order
  css/                  design tokens, base, layout, components, page styles
  vendor/               third-party (JSZip)
  js/
    config/             app constants, sample seed data
    util/               dates, strings, browser storage, xlsx/csv
    data/               store (records in memory), shared-folder I/O, sync, backups, people
      storage/          where the data lives: virtual folder, this device (IndexedDB), online database (Supabase)
    access/             permissions, fairness rules, trust rules for incoming changes
    domain/             business logic: scoring, metrics, workflows, requests, meetings, projects, customize …
    ui/                 widgets, forms, tables, modal
    schemas/            record types (fields, validation, hooks)
    importers/          ManageEngine export, legacy Excel tracker
    pages/              one file per screen, grouped by area
      admin/ desks/ work/ performance/ follow-up/ reference/ about/
    app/                state, router, shell (menu and top bar), sign-in, connect, mode
public/                 served next to the app as is: maham.config.js (settings), manifest, service worker, icons
supabase/schema.sql     the online database: tables and security rules
tools/build.py          checks and bundles everything into one HTML file
lab/                    the analysis app: lab.html, js/, css/, tools/build.py, tests/
tests/                  end-to-end tests (Playwright) and fixtures with fictional data
docs/                   architecture, data model, permissions, development notes
```

## Coding standard

- Formatting: [Prettier](https://prettier.io) (`.prettierrc.json`) and [EditorConfig](https://editorconfig.org).
- Linting: [ESLint](https://eslint.org) with the recommended rules (`eslint.config.js`).
- `'use strict'` in every script; no inline event handlers; all user text escaped before it reaches the page (`h()`).
- Every change ships with an end-to-end test; CI runs lint, format check, build and the full suite on every push.

## Versioning

Versions are dates: `YYYY.MM.DD.n`. Current version: **2026.11.09.10**. See [CHANGELOG](CHANGELOG.md).

## License

Copyright © 2026 Mohammed Miaji. All rights reserved. Viewing only — no use, copying, modification or distribution
without written permission. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
