# DARRIK

**From effort to impact.** DARRIK is a team work-tracking and performance app that runs as **one HTML file** —
no server, no installation, no internet connection. A team keeps the file and its data in a shared network folder;
each person opens it in their browser and works from there.

> © 2026 Mohammed Miaji. All rights reserved. The source is published for viewing only — see [LICENSE](LICENSE).

## What it does

| Area            | Features                                                                                                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Daily work**  | My Day, To Do list with priorities, follow-up and milestone flags, manager confirmation, shadow work log, IT help-desk import (ManageEngine), attendance (present unless marked), requests and approvals, meetings and actions, announcements |
| **Desks**       | Manager desk, director desk (all teams), tasks from the director with a manager → analyst chain, team activity                                                                                                                                |
| **Projects**    | Scrum boards, sprints, customizable project workflows with approvals                                                                                                                                                                          |
| **Performance** | Dynamic monthly scoring per team, heat map, employee breakdown, lazy days, weekly / monthly / yearly reports (print, PDF, Excel)                                                                                                              |
| **Admin**       | People, teams and departments, page-level permissions, functions, workflows, scoring rules, feedback inbox, data tools, change log, and **Customize** (name, logo, colours, menu, words, targets, weekend, start pages …)                     |

## How it works

- **Single file.** `tools/build.py` inlines every stylesheet and script into `dist/DARRIK/DARRIK.html`.
- **Shared folder as the database.** The app uses the browser's File System Access API. Each person writes only
  their own file (`DARRIK Data/users/<id>.json`); everyone reads all files and the newest version of each record wins.
- **Trust rules.** Settings are accepted only from a super admin; records only from the people allowed to change them
  (`src/js/access/trust.js`). Changes that break the rules are ignored and listed in System Check.
- **Offline by design.** Nothing is sent anywhere. There are no external requests, analytics or CDNs.
- **Classic scripts, not ES modules.** Browsers block modules on pages opened from a folder (`file://`), so files are
  plain scripts loaded in dependency order (see `src/index.html`) and share a small set of global namespaces.

More detail: [Hosting, phones and database](docs/HOSTING.md) · [Architecture](docs/ARCHITECTURE.md) · [Data model](docs/DATA-MODEL.md) · [Permissions](docs/PERMISSIONS.md) · [Development](docs/DEVELOPMENT.md)

## Phones and the online database

- **Phones:** the layout adapts to small screens, and when the app is served over https (for example GitHub Pages)
  it can be installed with _Add to Home Screen_. Without a shared folder (phones, Safari, Firefox) the data is kept
  on the device.
- **Online database:** ready but off. Fill in `darrik.config.js` (next to `DARRIK.html`) and run
  `supabase/schema.sql` — every step is in [docs/HOSTING.md](docs/HOSTING.md). The database enforces who may read
  and write (row-level security); the app does not need a rebuild.

## Requirements

- Shared folder: Microsoft Edge or Google Chrome on a desktop (the File System Access API).
- This device / online database: any current browser, including Safari and Chrome on phones.
- To build and test: Python 3.10+, Node.js 20+ (formatting and linting only), Playwright for Python (tests).

## Quick start

```bash
python3 tools/build.py          # → dist/DARRIK/DARRIK.html and dist/DARRIK_App_<version>.zip
```

Open `dist/DARRIK/DARRIK.html` in Edge or Chrome, choose the `dist/DARRIK` folder when asked, and pick a name.
The sample data contains fictional people only.

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
public/                 served next to the app as is: darrik.config.js (settings), manifest, service worker, icons
supabase/schema.sql     the online database: tables and security rules
tools/build.py          checks and bundles everything into one HTML file
tests/                  end-to-end tests (Playwright) and fixtures with fictional data
docs/                   architecture, data model, permissions, development notes
```

## Coding standard

- Formatting: [Prettier](https://prettier.io) (`.prettierrc.json`) and [EditorConfig](https://editorconfig.org).
- Linting: [ESLint](https://eslint.org) with the recommended rules (`eslint.config.js`).
- `'use strict'` in every script; no inline event handlers; all user text escaped before it reaches the page (`h()`).
- Every change ships with an end-to-end test; CI runs lint, format check, build and the full suite on every push.

## Versioning

Versions are dates: `YYYY.MM.DD.n`. Current version: **2026.10.30.10**. See [CHANGELOG](CHANGELOG.md).

## License

Copyright © 2026 Mohammed Miaji. All rights reserved. Viewing only — no use, copying, modification or distribution
without written permission. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
