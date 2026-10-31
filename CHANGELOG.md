# Changelog

Versions are dates (`YYYY.MM.DD.n`).

## 2026.10.30.10 — first public source release

- Single-file app: My Day, To Do list (priority, follow-up, milestone, manager confirmation), shadow work,
  IT help-desk import, attendance, requests and approvals, meetings, announcements.
- Manager and director desks, director → manager → analyst task chain, team activity.
- Projects with scrum boards, sprints and customizable workflows with approvals.
- Dynamic scoring per team and month, performance dashboards, weekly / monthly / yearly reports (print, PDF, Excel).
- Directory with hierarchy import from Excel.
- Admin: people, teams, departments, permissions, functions, scoring, feedback, data tools, change log.
- Phones: layout for small screens, install as an app (Add to Home Screen) when served over https, data kept on the
  device when there is no shared folder.
- Online database ready (Supabase): settings file `darrik.config.js`, `supabase/schema.sql` with row-level security,
  sign-in, one account per person, guide in docs/HOSTING.md. Off until configured.
- Admin → Customize: name, logo, tagline, colours, menu, words, targets, weekend days, sign-in message,
  report header, start page per role, My Day tiles, backup / restore of all customizations.
