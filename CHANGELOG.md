# Changelog

Versions are dates (`YYYY.MM.DD.n`).

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
