# Architecture

## Constraints that shape the design

| Constraint                                                       | Consequence                                                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Runs from a shared network folder, opened as a file (`file://`)  | No server. Data is read and written with the browser's File System Access API (Edge / Chrome).                            |
| No `.bat`, PowerShell or installs allowed                        | No build step on users' PCs. One self-contained HTML file is shipped.                                                     |
| Browsers block ES modules (`import`/`export`) on `file://` pages | Classic `<script>` files that share **one namespace per area** (`Store`, `Calc`, `UI`, `App` …), loaded in a fixed order. |
| Several people edit at the same time                             | Each person writes **only their own file**; files are merged on read (see _Data flow_).                                   |
| No internet                                                      | All libraries are vendored (`src/vendor/jszip.min.js`). Nothing is sent anywhere.                                         |

## Layers

Each layer may use the layers above it, never the ones below. Load order in `src/index.html` follows this list.

```
config     js/config/      constants (roles, permissions, functions, menu, scoring), starting settings
util       js/util/        pure helpers: dates, formatting, CSV, XLSX, browser storage
data       js/data/        Store: in-memory database, shared-folder connection, sync, people & teams
access     js/access/      authorisation: roles, permissions, function levels (edit / view / hide)
domain     js/domain/      business rules: metrics, scoring, scrum, workflows (no HTML here)
ui         js/ui/          reusable UI: modal, toast, form fields, record editor, table, widgets, board
schemas    js/schemas/     record types for the generic editor (fields, defaults, hooks)
importers  js/importers/   ManageEngine daily report, old per-sheet Excel files
pages      js/pages/       one file per screen, registered as P.<name>
app        js/app/         App: state, start-up, sign-in, layout, routing; main.js starts everything
```

### Namespaces

A namespace is created once and extended by later files of the same layer:

```js
// js/data/store.js
const Store = { /* state + record API */ };
// js/data/sync.js
Object.assign(Store, { async sync() { … }, async flush() { … } });
```

Methods always refer to their namespace by name (`Store.get(…)`, never `this`), so they can live in any file.

| Namespace                                        | Files                                | Responsibility                                                 |
| ------------------------------------------------ | ------------------------------------ | -------------------------------------------------------------- |
| `Config`, `APP_VERSION`                          | config/app-config.js                 | constants; frozen                                              |
| `U`, `h`                                         | util/utils.js, util/dates.js         | helpers; `h()` escapes text for HTML                           |
| `IDB`, `LS`, `XL`, `parseDelimited`              | util/\*                              | browser storage, Excel, CSV                                    |
| `Store`                                          | data/\*, access/permissions.js       | records, sync, people, permissions                             |
| `Calc`                                           | domain/metrics.js, domain/scoring.js | derived values and scores (memoised)                           |
| `Scrum`                                          | domain/scrum.js                      | project roles, sprints, story points                           |
| `UI`                                             | ui/\*                                | rendering helpers                                              |
| `Schemas`                                        | schemas/\*                           | record type definitions                                        |
| `Importer`, `HD_COLS`, `parseDT`, `parseElapsed` | importers/\*                         | imports                                                        |
| `P`                                              | pages/\*                             | page registry: `P.todo = () => ({ title, html, mount(root) })` |
| `App`                                            | app/\*                               | the running app: who is signed in, routing, rendering          |

## Data flow

```
         user edits a record
                 │
        Store.saveMany(list) ── permission guard (canEditColl, settingAllowed)
                 │
     Store.own[id] = rec (+ _ts, _by)  ──►  localStorage backup (unsaved changes)
                 │
        Store.flushSoon()  (debounced)
                 │
   write  DARRIK Data/users/<me>.json        ◄── only this person's PC writes this file
                 ▲
   every 20 s / Refresh: Store.sync() re-reads files whose modified time changed
                 │
   Store.rebuild(): merge all files — Store.verify() (access/trust.js) keeps only records the writer
                    was allowed to write; newest _ts wins per record id  ──►  Calc.invalidate() ──► App.render()
```

- **No write conflicts on files:** nobody writes anyone else's file.
- **Record conflicts:** if two people edit the _same_ record, the later edit wins (last-write-wins by `_ts`).
  The record editor checks first: different fields are combined, the same field asks which version to keep.
- **Backups:** once a day the first person to open the app zips `users/*.json` into `Backups/` (data/backup.js).
- **Deletes** are tombstones (`_del: true`) so they spread to every PC.
- **Starting settings** (`js/config/seed-data.js`) have `_ts` 0/1, so any real edit beats them.

## Rendering

`App.route()` reads the URL hash (`#/page/sub`), checks `App.pageAllowed()`, calls `P[page](sub)` to get
`{ title, html, mount }`, puts the HTML in `<main>`, then calls `mount(root)` to attach event handlers.
Pages are plain functions of the current data, so re-rendering after a sync is always safe.
All user text goes through `h()` before it is placed in HTML.

## Build

`tools/build.py` checks that every file exists, that every `.js`/`.css` under `src/` is referenced exactly
once by `index.html`, and that every script passes `node --check`. It then inlines everything, in the same
order, into `dist/DARRIK/DARRIK.html`.
