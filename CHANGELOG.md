# Changelog

Versions are dates (`YYYY.MM.DD.n`).

## 2026.11.09.1

- **Admin role** (shared-folder and this-device copies): the super admin gives a person some admin areas (Scoring, Time
  rules, Workflows, People limited, Lists, Teams, Help desk months, Announcements, Feedback, System Check / Activity log
  view), for their own team or all teams; templates; acting managers inherit them; checked by the trust rules at the
  time of each change. Online companies keep their database roles (admin / user).
- **Time rules & holidays**: per-team rules for when work is late, working days (weekend, holidays, leave, confirmed
  holds), on hold, extensions with reasons, asking for more time, escalation to the manager and director desks,
  preview, Ramadan hours, printable rules.
- **Projects in the monthly score** (weight 0 until set), no penalty for parts with nothing to score (from November
  2026), "Why is my score …?".
- **Analyst handover** with notes, accept, one-click hand on and give back.

## 2026.11.08.5 — many companies (online)

- **Three levels:** the platform owner (Owner Console: create, pause or delete companies, seats, invite an admin, and
  full admin access to every company, always logged), each company's **own admin** (the super admin of that company only) and its users. The database
  keeps every company apart (row-level security) and checks seats, invitations and the last admin.
- **Email sign-in:** sign in, create an account (invited emails only), forgot password, reset link. Someone in two
  companies chooses one; an account nobody invited sees nothing; a paused company opens for nobody.
- **Admin → Company & accounts:** invite people (existing or new), Admin / User, turn accounts off, cancel
  invitations, seats used, audit log, delete the company.
- **Platform owner has full admin access** to every company (also a paused one): Owner Console → **Accounts** (roles,
  on / off, invitations) and **Open as admin** (all of its data, as a hidden "Platform owner"). Every opening, and the
  owner's saves (grouped per 10 minutes), are in that company's audit log. First open of a new company: a short setup (company name, your name, teams).
- **An admin is always an admin** (online): no "Switch to Admin" / "Back to analyst", and an admin is not part of a
  team (not in team lists or scoring; sees every team). The shared-folder and this-device copies keep the two modes.
- **GitHub Pages copy is online** (`pages/maham.config.js`). Tested against a real PostgreSQL running
  `supabase/schema.sql` (`test_cloud_rules`, `test_cloud_signin`, `test_cloud_console`).

## 2026.11.08.4

- **Hand-on chains:** "➜ Send on" gives the next person a new To Do of their own (filled-in form: who, wording, due
  days). The person before counts as done once handed on. The next person can "↩ Send back" with a reason: the To Do
  before reopens (scored as not done) until "✓ Fixed". Each step is scored as a To Do of its own person.
- **To Do workflows** (Admin → Workflows, super admin): steps hand on by themselves — to a named person, a team role,
  or one chosen by whoever finishes the step before; "a comment is needed to finish it"; where Send back goes; To Do
  types that use a workflow by themselves. A workflow's next-step To Do is accepted by the trust check only when it
  matches the workflow (checked after the To Do before it).
- **Follow-up To Dos** from a To Do (managers create; analysts add a personal follow-up or ask the manager, who makes
  it a To Do or declines with a reason).
- **Phones:** nothing scrolls sideways — tiles two by two, header on two rows, sliding tabs, filters two per row,
  tables scroll in their own box, full-screen dialogs, 16 px fields (no iPhone zoom), finger-sized buttons.
- **GitHub Pages:** `.github/workflows/pages.yml` publishes the app on every push to main; `pages/maham.config.js`
  starts it with one owner as super admin, data kept on the device.

## 2026.11.08.2

- **📝 Notes for future reference** on every kind of task (each note is its own record in the writer's file; 📝 mark,
  "Has notes" filter, search inside notes, Notes column in Excel).
- **↻ Repeating To Dos** (every working day / week / month / 3 months; until a date or N times). Each copy is made by
  the person's own app on its day (missed days caught up, never twice) and accepted only if it matches a manager's
  rule. To Do List → ↻ Scheduled: pause, resume, edit (from today), stop.

## 2026.11.08.1

- Fixed: Reports could fail to open when remembered filters came back without the chosen sections and people.
- Teams kept apart: the To Do number, confirming and finishing a To Do cover only the manager's own team.
- Typing is no longer wiped when someone else saves: the page waits until you finish, then shows their changes.

## 2026.11.07.3

- Fixed: signing out right after a change could write a stray "null.json" in the users folder. Sign out now waits for
  every save; nothing is ever saved while nobody is signed in; a stray file is ignored and its owner's newer records
  are put back into their own file at their next sign-in.
- Fixed: Switch person and the recovery code were hidden while the super admin worked in analyst mode.
- The login page closes any window left open; the background refresh does nothing while signed out.
- Release test: several people on one PC (sign in, save, sign out at once, switch person, view as) — every file holds
  only its owner's records, no stray files, nothing ignored.

## 2026.11.07.2

- Login page (same look as the Lab): employee ID + PIN. Existing PINs keep working and are re-stored as salted
  PBKDF2 at the next sign-in; a first sign-in (or after a reset) chooses a PIN; 5 wrong PINs lock that account on
  that PC for 15 minutes; people stay signed in until **Sign out**.
- Only the super admin can switch person; everyone else has Change my PIN and Sign out.
- Employee IDs in Admin → People (typed, or filled from the IT directory's badge numbers).
- Recovery code for super admins: a one-time code that sets a new PIN from the login page.
- The Lab signs in with the same accounts.
- With the online database, the online account is the sign-in (no PIN page on top).

## 2026.11.07.1

- Renamed to MAHAM for the public source.
- Added the analysis Lab (`lab/`): read-only team insights and Studio (dashboards, data steps, experimenting tools).
- The app mark is now 🧭 when no logo is set (menu, start screen, About, browser tab).
- Admin → Data: load a findings file from the companion analysis app; each finding becomes an info item or a To Do
  (loading the same file twice adds nothing twice).

## 2026.11.06.4

- Simpler menu: sections in the side bar with their pages as tabs; Analyst Desk, WorkList, Projects, Follow-up, Team & Time,
  Performance, Reference.
- Bulk actions with undo, change a value straight in a table, warning before leaving unsaved changes, required fields marked,
  remembered filters per page.
- Manager Desk "needs you" line and To Do assignment dialog; month at a glance on the Analyst Desk.
- Data health check and an activity log (one file per month).
- Logic fixes: lazy days, month marks follow the person's own team, permission hours on days off, rejected quick wins
  never counted, task clashes ignore finished tasks.

## 2026.10.30.10 — first public source release

- Single-file app: Analyst Desk, To Do list (priority, follow-up, milestone, manager confirmation), shadow work,
  IT help-desk import, attendance, requests and approvals, meetings, announcements.
- Manager and director desks, director → manager → analyst task chain, team activity.
- Projects with scrum boards, sprints and customizable workflows with approvals.
- Dynamic scoring per team and month, performance dashboards, weekly / monthly / yearly reports (print, PDF, Excel).
- Directory with hierarchy import from Excel.
- Admin: people, teams, departments, permissions, functions, scoring, feedback, data tools, change log.
- Phones: layout for small screens, install as an app (Add to Home Screen) when served over https, data kept on the
  device when there is no shared folder.
- Online database ready (Supabase): settings file `maham.config.js`, `supabase/schema.sql` with row-level security,
  sign-in, one account per person, guide in docs/HOSTING.md. Off until configured.
- Admin → Customize: name, logo, tagline, colours, menu, words, targets, weekend days, sign-in message,
  report header, start page per role, My Day tiles, backup / restore of all customizations.
