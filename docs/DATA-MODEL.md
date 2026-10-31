# Data model

## Files in the shared folder

```
<shared folder>/
  DARRIK.html
  DARRIK Data/
    users/<memberId>.json     one per person: { version, kind: "user", user, updated, records: [...] }
    Import/                   a place to drop the old Excel files (optional)
    Backups/backup-YYYY-MM-DD.zip   daily copy of users/*.json (last 30 kept; restore in System Check)
```

## Every record

| Field  | Meaning                                                                                              |
| ------ | ---------------------------------------------------------------------------------------------------- |
| `id`   | unique id, e.g. `todo-yousef-mvj…` (imports use stable hashed ids, so re-importing never duplicates) |
| `c`    | collection (record type), see below                                                                  |
| `team` | team id for team-scoped collections (missing = `apps`, the original data)                            |
| `_ts`  | time of the last edit (ms); the newest wins when files are merged                                    |
| `_by`  | member id of the last editor                                                                         |
| `_del` | `true` = deleted (tombstone)                                                                         |

## Collections

| `c`                   | What                                                                                                                                                                                  | Team-scoped | Function (page)  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------- |
| `todo`                | To Do task (`fromTask` = forwarded from a director task, `fromMeeting` = action from a meeting)                                                                                       | yes         | todo             |
| `shadow`              | shadow-work entry                                                                                                                                                                     | yes         | shadow           |
| `helpdesk`            | ManageEngine request (`id` = `hd-<Request ID>`)                                                                                                                                       | yes         | helpdesk         |
| `attendance`          | one person-day                                                                                                                                                                        | yes         | attendance       |
| `quickwin`            | quick win (`approval`: Accepted / Rejected / empty)                                                                                                                                   | yes         | quickwins        |
| `central`             | Central follow-up                                                                                                                                                                     | yes         | central          |
| `oncall`              | on-call log                                                                                                                                                                           | yes         | oncall           |
| `course`, `reccourse` | course taken / recommended course                                                                                                                                                     | yes         | courses          |
| `srs`, `info`         | SRS / E-CTS numbers, info items                                                                                                                                                       | yes         | info             |
| `itdir`               | IT directory contact (hospital-wide)                                                                                                                                                  | no          | directory        |
| `emrdir`              | EMR directory contact                                                                                                                                                                 | yes         | directory        |
| `mgrtask`             | task from the director to a manager (`team` = `_top` when assigned to a director)                                                                                                     | no          | mgrtasks         |
| `project`             | project (`origin`: `team` = created by the manager, else director; `members`: [ids])                                                                                                  | no          | projects         |
| `sprint`              | sprint of a project (`status`: Planned / Active / Completed)                                                                                                                          | no          | projects         |
| `ptask`               | project task (`sprint` empty = backlog; `status`: To Do / In Progress / In Review / Done)                                                                                             | no          | projects         |
| `request`             | request for approval: `type, title, related ('todo:<id>' / 'ptask:<id>'), requester, from, to, hours, leaveType, reason, status, mgrBy/On/Ok/Comment, dirBy/On/Ok/Comment, escalated` | yes         | requests         |
| `meeting`             | minutes: `title, type, series, date, owner, attendees[], items[{id,title,notes,decision}], privateNotes, followups{taskId:{outcome,on,due}}` (id starts with `meeting-<owner>-`)      | no          | meetings         |
| `mytask`              | personal task: `owner, title, due, status (Open/Done/Canceled), note, fromMeeting, project`                                                                                           | no          | meetings         |
| `announcement`        | `title, body, audience[] (empty = everyone), until, pinned, posted` — super admin only                                                                                                | no          | —                |
| `annread`             | read receipt `{ann, at}`, id `annread-<person>-<announcement>`                                                                                                                        | no          | —                |
| `scoresnap`           | locked monthly score of one person                                                                                                                                                    | yes         | —                |
| `settings`            | settings records (below)                                                                                                                                                              | —           | super admin only |

## Settings records (`c: "settings"`)

| `id`                                          | Content                                                                              | Who may change it                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `settings-team`                               | `members`: people with role, team, permissions, function levels, PIN hash            | super admin (each person may change only their own PIN) |
| `settings-teams`                              | `teams`: id, name, function levels per team                                          | super admin                                             |
| `settings-requests`                           | `types`: request types `{ id, label, kind: days/hours/other, director, attendance }` | super admin                                             |
| `settings-delegations`                        | `list`: manager leave — `{ from, to, start, end, note }`                             | super admin                                             |
| `settings-features`                           | `orgLevels` (show AED / extra directors)                                             | super admin                                             |
| `settings-lists`, `settings-lists-<team>`     | drop-down lists                                                                      | super admin                                             |
| `settings-scoring`, `settings-scoring-<team>` | score weights and tiers                                                              | super admin                                             |
| `settings-meta-<team>`                        | `helpdeskUpdated` (last ManageEngine import date)                                    | anyone with importME                                    |

Patient privacy: only MRNs appear in imported data — no names or national IDs. Do not store passwords.
