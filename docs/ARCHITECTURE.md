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
| `IDB`, `LS`, `XL`, `parseDelimited`              | util/*                               | browser storage, Excel, CSV                                    |
| `Store`                                          | data/*, access/permissions.js        | records, sync, people, permissions                             |
| `Calc`                                           | domain/metrics.js, domain/scoring.js | derived values and scores (memoised)                           |
| `Scrum`                                          | domain/scrum.js                      | project roles, sprints, story points                           |
| `UI`                                             | ui/*                                 | rendering helpers                                              |
| `Schemas`                                        | schemas/*                            | record type definitions                                        |
| `Importer`, `HD_COLS`, `parseDT`, `parseElapsed` | importers/*                          | imports                                                        |
| `P`                                              | pages/*                              | page registry: `P.todo = () => ({ title, html, mount(root) })` |
| `App`                                            | app/*                                | the running app: who is signed in, routing, rendering          |

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
   write  MAHAM Data/users/<me>.json        ◄── only this person's PC writes this file
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

## Design notes (things that surprise people)

- **Files wrap earlier files.** Some files replace a function an earlier file made and call the old one inside
  (`const o = P.home; P.home = (...) => …`). What actually runs depends on the script order in `src/index.html`.
  `tools/build.py` writes the current list to **`docs/WRAPS.md`** on every build: read it before changing a wrapped function.
- **Converting an item gives it a new ID.** To Do ⇄ Shadow work ⇄ Quick win are different kinds of record with different
  owners and rules (fairness, trust), so a conversion deletes the original (kept as a tombstone with `convertedTo`) and
  saves a new record with `convertedFrom { c, id }`. Anything attached to an item by its ID (📝 notes, 🔗 links, and any
  future attachment / history / approval) must look the item up through **`Conv.family(id)`** (every ID it has had)
  or **`Conv.current(id)`** (the live record an old ID became), never `Store.get(id)` alone. Keeping one ID across kinds
  was considered and rejected: the trust and fairness replays compare versions of one ID, and a version that changes kind
  would look like an edit the person was not allowed to make, so both replays would need reworking.
- **"External follow-ups" are stored as `central`.** The screens say External Follow-up; the collection, the page file
  (`pages/central.js`), the route (`#/central`) and the first party ("Central HQ", keys RYD-n) keep their old names so no
  data has to move. New parties (vendors) are added in Admin → Work & workflows → Follow-ups, with their own key.
- **Two people changing the same item** (`Store.MERGE_COLLS`, `Store.fold`, `data/store.js`): each saved version of a work
  item lists the fields its writer changed (`_chg`, cumulative for that writer, worked out against what they saw). The merge
  (`pick` in `access/trust.js`, and the fairness replay) applies versions oldest → newest; a version with `_chg` only
  overwrites those fields. New items and versions from older app copies (no `_chg`) replace the whole record, as before.
- **Which team a new record belongs to** (`Store.saveTeam`, `data/people.js`): a person's work (To Do, shadow work, quick
  win, follow-up, on-call, attendance) goes to **that person's own team**; anything else goes to the team being viewed.
- **Project tasks: where things plug in (no wrapping).** Several features add to project tasks; they register instead of
  replacing each other's functions, so the order is visible and one file cannot silently undo another:
  - **Which workflow a task follows — one place:** `TaskFlow.forTask(t)` asks `TaskFlow.KINDS[t.c]` (records of another
    kind on the engine: follow-ups, `domain/followup.js`), then `TaskFlow.MODES[project.mode]` (project modes with their own
    statuses: Lanes, `domain/lanes.js`), then `TaskFlow.scheme(project, type)` (project → team → department → board columns).
    `TaskFlow.of(p, type)` does the same without a task. A KIND may also give its own `condFail`, `validMsg`, `canMove`,
    `afterApply`, `approvers`, `toApprove`, `key`.
  - **The board card:** `PT_CARD.decorate` (html add-ons, in order), `PT_CARD.bind` (their handlers), `PT_CARD.move` (how
    ◀ ▶ / drag move a card) in `ui/scrum-board.js`.
  - **Record forms:** `Schemas.extend(coll, { prepare, defaults, fields, mount, before, after, validate, saved })`
    (`schemas/index.js`); `ui/forms.js` runs them. Saving: every `before` → the type's own `beforeSave` → every `after`;
    checks: the last added first. `Schemas.extensions('ptask')` lists them. `tests/e2e/test_project_setups.py` checks
    Kanban, Scrum, a stage workflow, Lanes and follow-ups side by side.
- **Workflow moves are trusted only if allowed** (`domain/flowtrust.js`, called from `Store.verify`): project tasks and
  follow-ups that change step are replayed in time order; each move (walked from the `hist` lines a version added) must be
  a transition of the workflow, passing its people rules (`cond` / `approve`) for the writer or someone they act for. The
  workflow used is the one in force at that moment (settings versions + `adminlog.before`) or today's. A refused move puts
  back status / resolution / pending / hist / approvals / doneDate and keeps the rest. State-dependent rules (subtasks,
  checklist, comment, stage, blockers) are screen-only. Saving uses the same check (`Store.flowBlock` via `extraBlock`).
- **Lanes** (`domain/lanes.js`, `pages/lanes.js`): a project with `mode: 'lanes'` keeps `lanes: [{ id, name, color, limit,
statuses: [{ id, name, color, cat }] }]` and `laneLog`; a task has `lane` (id) and a `status` of that lane.
  `TaskFlow.forTask(t)` returns the task's lane as a workflow (free moves inside the lane), so chips, done-by-category,
  progress, scoring, late work, dashboards and the step protection work unchanged. Templates are signed `lanetpl` records;
  the team default is `settings-taskflow-<team>.lanes` (Admin area Task workflows). The 2026.11.11.2 shape (lanes without
  `statuses`) is read as one lane "Work".
- **What's new** (`config/whatsnew.js`, `app/whatsnew.js`): add an entry at the top for every release people will notice;
  lines are for `all` / `analyst` / `lead` / `admin`. Seen version per person in `localStorage` (`bct.whatsnew.<id>`).
- **Saved views** (`ui/views.js`): `listview` records (signed, own file) hold a table's search / sort and the filter
  bars shown on the same page (`FLT_ROUTE`). Any `UI.table` gets them; nothing to add per page.
- **Signed records** (notes, links, follow-up requests, To Do steps — `Store.SIGNED`, `access/trust.js`) share one trust
  rule: written by the person named in `by`, with an ID that starts `<kind>-<by>-`. Add a new kind there. A kind with no
  rule at all is accepted, but only ever in the writer's own file and name.

## Build

`tools/build.py` checks that every file exists, that every `.js`/`.css` under `src/` is referenced exactly
once by `index.html`, and that every script passes `node --check`. It then inlines everything, in the same
order, into `dist/MAHAM/MAHAM.html`.
