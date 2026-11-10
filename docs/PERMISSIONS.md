# Roles and permissions

All rules live in `src/js/access/permissions.js`; the lists in `src/js/config/app-config.js`.

## Roles

| Role                               | Sees                                                                                                              | Default permissions                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Analyst                            | own team                                                                                                          | view dashboards, see others' records, export                                            |
| Team Leader                        | own team                                                                                                          | + ManageEngine import, team attendance, old-data import, create & lead projects         |
| Manager                            | own team                                                                                                          | everything except assigning to managers (incl. create & lead projects)                  |
| Director                           | the teams of their department (`settings-depts`); task lists show only the tasks / projects they gave (`givenBy`) | everything, including assigning to managers                                             |
| AED                                | all teams                                                                                                         | everything, assigns to directors (hidden until _Organisation levels_ is on)             |
| **Super admin** (flag on a person) | everything, including hidden people                                                                               | unrestricted; the only one who can change roles, permissions, functions, lists, scoring |

Nobody can see who is super admin. Hidden people are invisible to everyone except the super admin.

## Permissions (per person, set by the super admin)

`viewDashboards`, `viewOthers`, `editAttendanceOthers`, `assignTodo`, `approveQW`, `importME`, `approveRequests` (manager step of Requests; directors do the final step),
`lockScores`, `manageTeam`, `export`, `assignToManagers`, `createProjects` (create and lead team projects — owner = planner), `seeNames` (off = others appear as "Member 1, 2 …").

Super-admin-only abilities that cannot be granted to anyone (`Config.SUPER_ADMIN_ONLY`): **importing old data**.

## Requests & approvals

`Store.requestAllowed()` checks every change: people create only their own requests and may cancel them while
pending; a request moves on only when `Requests.canDecide()` is true for the person (manager step: `approveRequests`
in that team, incl. an acting manager; director step: a director over that team). Dates, type and requester
cannot be changed by the approver.

## Function levels

Every function (page) has a level: **Edit**, **View only** or **Hidden**.
Person setting → team setting → default. The default is Edit, except **Directory** (View only; only the
super admin edits unless he grants Edit).

## Manager leave (delegation)

Stored in the `settings-delegations` record (super admin only): `{ from: managerId, to: memberId, start, end, note }`.
While today is between `start` and `end`, `Store.actingFor(person)` lists the managers they cover. Then:

- `Store.can()` also grants the absent manager's permissions — except `assignToManagers` (never director-level).
- `App.forMe(managerId)` is true, so director tasks, forwarding and the manager's projects (`Scrum.planner`) work for them.
- The acting person sees an _Acting manager_ menu and the manager's team; the director sees who is covering.
- Nothing is copied or moved: work stays assigned to the manager, so it is all still there when they return.

## Tamper protection (reading the files)

The data files are plain JSON, so the app also checks every record **when it reads them** (`src/js/access/trust.js`):

| Rule                                                                                                                      | If broken                                             |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| a record in `users/<id>.json` must have `_by = <id>`                                                                      | ignored                                               |
| settings only from someone who was super admin at that time; others only their own PIN; `settings-meta-*` from any member | ignored (PIN kept)                                    |
| request decisions only from an approver, never the requester                                                              | ignored; a self-approval is kept as a waiting request |
| `scoresnap` only with `lockScores`                                                                                        | ignored                                               |
| `_ts` more than a day in the future                                                                                       | ignored                                               |

The newest _allowed_ version of each record is used, and the ignored ones are listed in Admin → System Check.
Changing a permission later never hides old work: only these rules are checked on read.

## Score fairness (`src/js/access/fairness.js`)

Applies to analysts (anyone without the manager power named in brackets); checked on save **and** on read.

| Record                      | Rule                                                                                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| To Do (`assignTodo`)        | update and finish only their own; no cancel / reopen; manager fields (task, analyst, dates, due, instruction) stay the manager's; finish date not in the future, not before assigned; earlier than today needs `finishNote` |
| Quick win (`approveQW`)     | only for themselves; approval, QW ID, manager comment are the manager's; after approval subject / dates / analyst are locked                                                                                                |
| Shadow work (`manageTeam`)  | only for themselves; dated today or up to `Config.SELF_BACKDATE_DAYS` (3) days back                                                                                                                                         |
| Locked month (`lockScores`) | To Do, shadow work, quick wins and attendance in a locked month are read-only after the lock                                                                                                                                |

On read, manager-owned fields are taken from the latest manager version (so a stale or hand-edited analyst
save cannot change them); a forbidden cancel / finish is undone; locked-month edits are ignored. Corrections
are listed in System Check.

## Where it is enforced

- **Pages:** `App.pageAllowed()` (router) hides menu items and blocks direct URLs.
- **Editing:** `UI.editRecord` opens read-only without Edit; `Store.saveMany` drops any record the person
  may not change, so a blocked change is never saved, whatever the screen shows.
- **New records:** `Store.createAllowed()` applies a schema's `canCreate` rule (e.g. projects need `createProjects`).
- **Settings:** `Store.settingAllowed()` lets the super admin save settings, and an Admin only inside their areas, at edit level, for their teams (`AdminRole.settingOk`).
- **Scrum:** `Scrum.planner()` (owner manager, director, super admin) plans; members move only their own tasks (`Scrum.canWork`).

## Admin tools (super admin)

Change log (`adminlog`, only the super admin may write it; undo for 15 min), usage (`usage-<id>`, only that person),
"View as" preview (App.preview — Store.saveMany and Store.flush refuse everything while it is on).

## The Admin role (`access/adminrole.js`, `pages/admin-nav.js`, `pages/admin-role.js`)

The super admin can give a person some Admin areas on their card. One area per Admin section:

| Main tab         | Sub-tab                                   | Areas                                                                                                |
| ---------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| People           | People                                    | `people`, `acting-leave`                                                                             |
| People           | Teams & departments                       | `teams` (all teams only)                                                                             |
| Work & workflows | To Do · Projects · Project tasks          | `todo-workflows` · `project-stages`, `task-sets` · `task-workflows`, `workitem-fields`, `automation` |
| Work & workflows | Follow-ups · Time rules                   | `followups` · `timerules`, `holidays` (all teams only)                                               |
| Scoring          | Rules · Months · Adjustments              | `scoring-rules` · `score-months` · `adjustments`                                                     |
| Settings         | Lists · Look & home pages · Announcements | `lists` · `look` · `announcements`                                                                   |
| System           | Data · Check · Logs · Feedback            | `data` (export only) · `syscheck` (view) · `logs` (view) · `feedback`                                |

Super admin only: Roles & access (permissions, team rules, giving Admin roles and templates), import / restore, undo,
fixing in System Check, the minimum app version and folder paths.

Member fields: `admin`, `adminV: 2`, `adminAreas`, `adminLevels` (`{ area: 'view' }`; missing = edit), `adminReach`
(`team` / `teams` + `adminTeams` / `all`). Entries without `adminV` use the older areas and are read as the new ones
(`AdminRole.MIGRATE`, all at edit level, same reach) — the people list is not rewritten.

- **What they see:** only the tabs, sub-tabs, cards and search results of their areas, only their teams. At view level
  the screens are read-only (`AdminNav.lock`: inputs disabled, buttons removed).
- **What they may save:** `AdminRole.needs()` maps every settings record — and each part of shared ones
  (`settings-teams`, `settings-custom`, `settings-features`, `settings-lists-*`, `settings-taskflow-*`) — to an area
  and team; `settingOk` needs edit level for each. The trust check replays this with the people list as it was at the
  time, so hand-edited files outside an Admin's access are ignored and listed in System Check.
- Every Admin change is logged, shown on the super admin's Admin home, and can be undone by the super admin.
