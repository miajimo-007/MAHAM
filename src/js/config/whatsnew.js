/* MAHAM — "What's new" notes, newest first (app/whatsnew.js shows them once per version).
 * Each line is for: 'all' · 'analyst' (people who do the work) · 'lead' (team leaders, managers, director, acting) ·
 * 'admin' (the super admin and Admins). Write them short, in plain words, about what the person will see.
 * Add an entry at the top with every release that changes something people see (CHANGELOG.md has the full detail).
 * WHATS_NEW_FROM: the version the team ran before these notes started — someone who has never seen the window gets
 * everything after it. */
'use strict';

const WHATS_NEW_FROM = '2026.11.07.3';
const WHATS_NEW = [
  {
    ver: '2026.11.13.9',
    date: '14 Nov 2026',
    items: [
      {
        who: 'lead',
        text: '<b>Director Desk → Watch → Waiting on managers:</b> click a manager to see, right there, the quick wins and To Dos waiting for their approval — who, what and how long. <b>🔔 Ask for an update</b> reminds the manager. The Director Desk no longer jumps to the Manager Desk.',
      },
    ],
  },
  {
    ver: '2026.11.13.8',
    date: '14 Nov 2026',
    items: [
      {
        who: 'lead',
        text: '<b>Fixed — the Director Desk could empty the screen:</b> a click on the desk (for example on <b>Watch → Waiting on managers</b>) opened the Manager Desk for a team that does not exist, so every list looked empty and the app said it had no data. Nothing was lost — the data was always there. Now <b>Waiting on managers</b> opens that team’s Manager Desk, and the app never switches to a team that does not exist.',
      },
    ],
  },
  {
    ver: '2026.11.13.7',
    date: '13 Nov 2026',
    items: [
      { who: 'all', text: '<b>A new look — glass:</b> soft colours behind the page and frosted panels.' },
      {
        who: 'all',
        text: '<b>Light or Dark — your choice:</b> click <b>☀</b> or <b>☾</b> in the top bar. MAHAM remembers it for you on this PC.',
      },
    ],
  },
  {
    ver: '2026.11.13.6',
    date: '13 Nov 2026',
    items: [
      {
        who: 'lead',
        text: '<b>Manager and Director Desk, calmer:</b> a thin row of numbers at the top (team score this month, YTD average, pending To Do, open help desk, shadow work — for your whole team, or all your teams on the Director Desk); <b>Needs you</b> is one list — the chips on top show one kind at a time (grey 0 = nothing of that kind); <b>Watch</b> is one panel beside it, one line per risk with its count and the first item — click a line to open it.',
      },
      {
        who: 'lead',
        text: '<b>Ask all for an update:</b> open <b>Overdue To Do</b> in Watch — ask one person, or everyone at once. Old help desk requests go to To Do from the same panel (one, or all).',
      },
      {
        who: 'lead',
        text: '<b>Chase from the desk:</b> external follow-ups in Watch have <b>✓ Chased today</b> and <b>…</b> (chase with a note); the ones due come first. Slipping To Dos have Ask for update.',
      },
      {
        who: 'lead',
        text: '<b>Director Desk:</b> the long “Needs your attention” list is split — decisions from managers and approvals are in Needs you; projects behind, managers on leave and ManageEngine imports are lines in Watch. New Watch line: <b>Waiting on managers</b> (quick wins and To Dos waiting for a manager’s approval, per manager).',
      },
    ],
  },
  {
    ver: '2026.11.13.5',
    date: '13 Nov 2026',
    items: [
      {
        who: 'lead',
        text: '<b>Manager and Director Desk in boxes:</b> Needs you and Watch show one box per kind (quick wins to approve, To Dos to confirm, overdue, slipping, follow-ups …) side by side — each the same height, scroll inside a box for more. The team table stays as it was. On a smaller screen fewer boxes per row, on a phone one under the other.',
      },
      {
        who: 'all',
        text: '<b>To Do List rows are shorter:</b> “Time” is now one number — <b>Days left</b> (5 = five days left, 0 = due today, −6 in red = six days late; the sentence on hover). Confirm, Send on and Send back are small buttons ✓ ➜ ↩ (the name on hover).',
      },
    ],
  },
  {
    ver: '2026.11.13.4',
    date: '13 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>Lists start higher:</b> the filters sit on one compact row (label beside a small box, tick boxes as chips), and External Follow-up, Good Catch and Projects show one line of totals instead of number tiles.',
      },
      {
        who: 'all',
        text: '<b>Click a number in the totals line</b> to show only those — e.g. “3 overdue” on the To Do List; click it again for all. A column that is empty for every row is left out (Excel keeps it).',
      },
      {
        who: 'all',
        text: '<b>☰ Compact rows</b> (next to Excel) fits about twice as many rows on the screen — your choice, kept on this PC. In <b>☆ Views</b> a view can be <b>★ Default</b>: the list opens that way every time.',
      },
      {
        who: 'all',
        text: 'A small <b>dot</b> marks To Dos and quick wins that someone else gave you or changed since you last looked. Long explanations fold under <b>ⓘ How this works</b>. Text boxes grow as you type, and a box’s grey hint shows while you are in it.',
      },
      {
        who: 'all',
        text: 'Smaller things: the project page shows the project’s name at the top; an empty charter, phases and status update are one line; My work no longer scrolls inside its box; attendance shows only leave and permission (blank = on duty); “Shadow work”, “Quick wins” and “Tasks from the director” are written one way.',
      },
      {
        who: 'lead',
        text: '<b>Director Desk</b> in the same three parts as the Manager Desk: Needs you, Watch, The teams. On the Manager Desk the project button now reads <b>⚑ Ask the director…</b>.',
      },
    ],
  },
  {
    ver: '2026.11.13.3',
    date: '13 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>Analyst Desk:</b> the greeting, the date and <b>Today: On duty · Off / leave · Permission</b> are on one slim line at the top. The buttons are there every day — on a weekend or holiday they say “only if you worked”.',
      },
      {
        who: 'lead',
        text: '<b>Manager Desk in three parts:</b> <b>Needs you</b> (decisions: approvals, To Dos to confirm, quick wins to approve — with how long they have waited — from the director, your projects), <b>Watch</b> (overdue To Dos, late work, and new: <i>Slipping</i> — due today or tomorrow with no update yet, quick wins past their expected date, follow-up chases due) and <b>The team</b> (one row per person: today, when they opened the app, open To Dos, shadow work this week, this month’s score — click a row for their page).',
      },
    ],
  },
  {
    ver: '2026.11.13.2',
    date: '13 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>WorkList pages look the same:</b> To Do, Shadow Works, Quick wins and Personal tasks have the filters on the left and the <b>＋ New</b> button at the right end of the same row, then one line of totals (“2 To Dos · 1 in progress · 0 overdue …”, “23 entries · 41.5 h”) and the list.',
      },
      {
        who: 'all',
        text: '<b>One coloured status everywhere:</b> To Do, quick wins and help desk requests show their status in the same coloured box as project tasks and follow-ups — grey to do, amber waiting / review, blue in progress, green done.',
      },
      {
        who: 'all',
        text: '<b>Forms in one order:</b> the main text first (To Do, Subject, Title), then who, then type / source / module, Reference, the dates and the status, then the tick boxes and notes. On the Analyst Desk, <b>Subject</b> and <b>Reference</b> now come first when you log shadow work.',
      },
      {
        who: 'lead',
        text: 'The Quick wins KPI tiles and the “completed by month” chart moved to <b>Performance → Tasks overview</b> (the lists keep a line of totals with a link there).',
      },
    ],
  },
  {
    ver: '2026.11.13.1',
    date: '13 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>🔎 Search</b> (top bar, or <b>Ctrl+K</b>): type a key (TD-12, RYD-702, PHX-3), a title, a reference or a page name and press Enter — To Dos, project tasks, projects, follow-ups, quick wins, shadow work, personal tasks and Knowledge base articles you can see.',
      },
      {
        who: 'all',
        text: '<b>＋ New</b> (top bar): one place to add a To Do, shadow work, quick win, follow-up, project task, personal task, request or Knowledge base article — it lists only what you can add.',
      },
      {
        who: 'all',
        text: '<b>Dates are written day first everywhere</b>, also in the boxes: 13-Nov-2026. Type <i>13-11-2026</i>, <i>13/11</i>, <i>13 nov</i> or <i>today</i>, or pick it with 📅.',
      },
      {
        who: 'all',
        text: '<b>Shorter forms:</b> boxes only your manager fills (QW ID, approval, comment …) no longer show while they are empty. A project task’s extra boxes (points, hours, start date, subtask, depends on) are under <b>More details</b> — they open by themselves when one is filled; Scrum projects keep points and sprint on top, and projects without sprints have no Sprint box.',
      },
      {
        who: 'all',
        text: '<b>Lists are easier to read:</b> subjects and titles keep a readable width, boxes in a list show the whole word (“Accepted”, “In progress”), and the buttons column (✓ Done, ✓ Chased today) stays at the right edge.',
      },
      {
        who: 'all',
        text: 'Names in the boxes are the short names you see in the lists (e.g. “Layla”); “In progress” is written the same way everywhere. Analyst Desk: “Due in the next 7 days” no longer repeats what is in My work.',
      },
      {
        who: 'lead',
        text: '<b>Manager Desk</b> in a clearer order: <b>Needs you</b> and the things to act on first (approvals, quick wins to approve, overdue To Dos, from the director), then <b>The team</b> (score, To Dos in progress, team today, activity). Tiles that repeated the “Needs you” counts are gone; the “not imported today” note is at the top.',
      },
      { who: 'lead', text: 'A new To Do no longer shows the “Finish date” and “Analyst update” boxes — the analyst fills them later.' },
      {
        who: 'admin',
        text: 'Admin Home: the month-lock tile and the checklist now agree (every team with someone scored); backup and month lock show only as tiles, not again in the checklist.',
      },
    ],
  },
  {
    ver: '2026.11.12.8',
    date: '12 Nov 2026',
    items: [
      { who: 'all', text: 'Analyst Desk: the shadow work <b>Subject</b> box is wide again, Reference small.' },
      {
        who: 'all',
        text: 'Shadow Works: “Hours by category” moved to <b>Performance → Tasks overview</b> — To Do, shadow work, quick wins, help desk, project tasks and follow-ups for a month or the year, the team or one person.',
      },
      {
        who: 'lead',
        text: 'Project owners: <b>⚙ Board</b> (Kanban / Scrum) or <b>⚙ Lanes</b> next to ＋ Add task changes this project’s columns or lanes — statuses, colours, WIP limits, “Done when…”. Changing the statuses gives the project its own setup.',
      },
      {
        who: 'admin',
        text: 'Admins (Task workflows) and the super admin get ⚙ Board / ⚙ Lanes on every project of their teams; “Follow … again” puts a project back on the team’s statuses, Edit project → Lane template back on a template.',
      },
    ],
  },
  {
    ver: '2026.11.11.11',
    date: '11 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>📚 Knowledge base</b> (Reference): search how problems were solved. Tick <b>📚 Add this to the Knowledge base</b> at the bottom of your To Do, shadow work, quick win, project task, follow-up or Good Catch — or write one with ＋ New article. Choose who can read it: your team or everyone.',
      },
      { who: 'lead', text: 'Managers can add any of their team’s work to the Knowledge base and correct or remove the team’s articles.' },
    ],
  },
  {
    ver: '2026.11.11.10',
    date: '11 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>Lanes projects</b> now use <b>lane templates made by the admin</b> — pick one when you create the project. A lane whose tasks are all done shows as <b>✓ Closed</b>.',
      },
      {
        who: 'admin',
        text: '<b>Admin → Project tasks → Lane templates:</b> make templates (per team or shared), edit them (every project using one follows), switch a project’s template in Edit project, and turn lanes made before into templates.',
      },
    ],
  },
  {
    ver: '2026.11.11.9',
    date: '11 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>Scrum projects:</b> a <b>📅 Daily</b> view on the sprint board, a <b>Definition of Done</b> checked when a task is finished, and the backlog in the order the owner sets.',
      },
      {
        who: 'lead',
        text: 'Edit project: Product owner, Scrum master, sprint length, Definition of Done. Drag backlog rows to order them; sprints show capacity against your average velocity; Complete sprint keeps the review and retrospective.',
      },
    ],
  },
  {
    ver: '2026.11.11.8',
    date: '11 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>Project boards:</b> columns can have a <b>work-in-progress limit</b> (the header turns red when over) and a <b>“Done when…”</b> note (ⓘ on the header).',
      },
      {
        who: 'lead',
        text: 'Set them with <b>⚙ Columns</b> on the Board. The project’s <b>Reports</b> tab now shows cycle time, throughput and a cumulative flow chart.',
      },
    ],
  },
  {
    ver: '2026.11.11.7',
    date: '11 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>Projects:</b> every task of a project now follows the <b>same statuses</b>, whatever its type — the board always shows one column per status.',
      },
      {
        who: 'lead',
        text: '<b>Edit project → Task statuses</b> shows which statuses the project uses (the team default or a workflow). An admin changes it there; tasks whose status is missing are moved after asking.',
      },
      {
        who: 'admin',
        text: 'Admin → Project tasks: the per-type workflow boxes are gone; “Which statuses each project uses” is a read-only overview.',
      },
    ],
  },
  {
    ver: '2026.11.11.3',
    date: '11 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>Lanes:</b> a project can be run as <b>lanes</b> — boards of their own (e.g. Build, Validation), each with <b>its own statuses</b>. A task stays in its lane; change its status <b>right on its card</b>. Colours on the board, the List, My work and the Work dashboard.',
      },
      {
        who: 'lead',
        text: 'On a Lanes project’s Board, <b>⚙ Lanes</b> adds lanes and their statuses (name, colour, counts as), sets an optional <b>limit</b> of open tasks per lane, and saves the lanes as a <b>template</b>. Deleting a status or a lane that has tasks asks where they go.',
      },
      {
        who: 'admin',
        text: '<b>Admin → Work & workflows → Project tasks → Lanes:</b> each team’s default lanes for new Lanes projects, and the saved lane templates.',
      },
    ],
  },
  {
    ver: '2026.11.11.2',
    date: '11 Nov 2026',
    items: [{ who: 'all', text: '<b>Safer saving:</b> the newest checks can no longer stop a save or a refresh.' }],
  },
  {
    ver: '2026.11.11.1',
    date: '11 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>✨ What’s new</b> — this window. It opens once after each update; open it again any time from the bottom of the menu.',
      },
      {
        who: 'all',
        text: '<b>🔗 Linking is your choice.</b> Items with the same Reference are no longer linked by themselves — they are offered (“Same reference — not linked”) and you press <b>🔗 Link</b> for the ones that belong together. <b>Log shadow work</b> on the Analyst Desk now has <b>🔗 Link to…</b> too.',
      },
      {
        who: 'all',
        text: '<b>Converting shadow work</b> to a To Do or a quick win can <b>keep its time</b> as shadow work, linked to the new item (ticked by default), so the hours still count.',
      },
      {
        who: 'all',
        text: '<b>To Do, Shadow work and Quick wins work alike:</b> one <b>Reference</b> field on all three forms, the 🔗 number in all three lists, and <b>＋ Quick win</b> in My work on the Analyst Desk.',
      },
      {
        who: 'lead',
        text: '<b>Manager Desk → ＋ Assign a To Do</b> starts the due days from your team’s time rules for the priority, has a Reference field, and saves like the To Do form.',
      },
      {
        who: 'all',
        text: '<b>☆ Views on every list</b> — set the filters, search and sort you like, press <b>☆ Views → Save this view</b>, and get them back with one click next time (on any PC).',
      },
      {
        who: 'all',
        text: '<b>Attendance:</b> permission time is typed in minutes and shown as <b>1 h 30 min</b> (it is scored exactly as before).',
      },
      {
        who: 'all',
        text: '<b>External Follow-up:</b> change the <b>Step</b> right in the list (only the moves the workflow allows). Tick several to mark them <b>📞 Chased today</b>, set the <b>next chase date</b>, or <b>move them to a step</b> together.',
      },
      {
        who: 'lead',
        text: '<b>Converting</b> Shadow work / Quick win ⇄ To Do is offered only to people who may give To Dos (also someone acting for a manager on leave), and it is all or nothing: if the new record is refused, the original stays.',
      },
      {
        who: 'lead',
        text: '<b>Workflow steps are protected.</b> A project task or follow-up can only change step by a move its workflow allows, made by someone allowed to make it. Any other step change (even by editing a data file) is undone.',
      },
      { who: 'admin', text: 'Refused step changes are listed in <b>Admin → System Check → Ignored changes</b>, with the reason.' },
    ],
  },
  {
    ver: '2026.11.10.7',
    date: '10 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>No more lost changes:</b> when two people change the same item at about the same time, both changes are kept.',
      },
      {
        who: 'analyst',
        text: '<b>Analyst Desk → My work:</b> one list in the order to work through it — ⚠ Late · Due today · Waiting on you · Coming up.',
      },
      {
        who: 'analyst',
        text: '<b>⏱ Log time</b> next to an item opens a shadow work entry already filled in and linked to it. In Log shadow work, <b>↻ Again</b> repeats a recent entry in one click.',
      },
    ],
  },
  {
    ver: '2026.11.10.6',
    date: '10 Nov 2026',
    items: [
      {
        who: 'all',
        text: 'The menu section with Quick Wins, External Follow-up, Good Catch and Tasks from Director is now called <b>Tracking</b>.',
      },
    ],
  },
  {
    ver: '2026.11.10.5',
    date: '10 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>To Do list:</b> the Days column is now <b>Time</b>, in words — “2 days left”, “Due today”, “3 days late”, “Done 1 day early”.',
      },
      {
        who: 'lead',
        text: 'Work you add for someone (To Do, shadow work, quick win, follow-up, on-call, attendance) is saved in <b>that person’s team</b>, whichever team you are looking at.',
      },
    ],
  },
  {
    ver: '2026.11.10.3',
    date: '10 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>🔗 Linked work</b> in the Shadow work, To Do and Quick win forms: link the items that belong to the same thing, see the shadow time on it, and start <b>＋ Linked shadow work</b>.',
      },
      {
        who: 'all',
        text: 'Converting between To Do, Shadow work and Quick win keeps the <b>📝 notes</b>, the Reference and the links. “Central Follow-up” is now <b>External Follow-up</b>.',
      },
      {
        who: 'admin',
        text: '<b>⬇ Download full backup</b> and <b>⬆ Restore from a backup file</b> (Admin → System → Data, System Check).',
      },
    ],
  },
  {
    ver: '2026.11.10.1',
    date: '10 Nov 2026',
    items: [
      {
        who: 'admin',
        text: '<b>Import Old Data</b> reads a team’s <b>Routine Tasks</b> (→ shadow work) and <b>Project Tasks</b> (→ projects) sheets, and any import can be <b>undone</b> later (Past imports).',
      },
    ],
  },
  {
    ver: '2026.11.09.14',
    date: '9 Nov 2026',
    items: [
      {
        who: 'admin',
        text: '<b>Admin has 6 tabs</b> (Home · People · Work & workflows · Scoring · Settings · System) with sub-tabs; old links still work. Admin roles follow the same areas, each at Edit or View only.',
      },
    ],
  },
  {
    ver: '2026.11.09.12',
    date: '9 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>Every To Do has an ID</b> like <b>TD-12</b> — in the To Do List (ID column, search, Excel) and in the form’s title.',
      },
    ],
  },
  {
    ver: '2026.11.09.11',
    date: '9 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>External follow-ups on steps:</b> Under Review → Accepted → In Development → Waiting deployment → Deployed. A <b>chase log</b> (✓ Chased today), <b>next chase</b> date, escalation counted from the last chase, keys like <b>RYD-12</b>, and a Summary tab.',
      },
    ],
  },
  {
    ver: '2026.11.09.10',
    date: '9 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>Projects work like Jira:</b> epics, project keys (BC-101), types per project, your own fields, moves that need approval, requests from other teams, and a work dashboard.',
      },
      {
        who: 'lead',
        text: '<b>Automation rules</b> per team (when created / reaches a status / overdue / epic done → assign, tell someone, set priority …) and <b>project permissions</b> (who sees, adds, moves).',
      },
    ],
  },
  {
    ver: '2026.11.09.9',
    date: '9 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>Task workflows</b> for project tasks: statuses and named moves with rules. On the board a move that is not allowed snaps back with the reason; cards show the allowed moves as buttons.',
      },
    ],
  },
  {
    ver: '2026.11.09.8',
    date: '9 Nov 2026',
    items: [
      {
        who: 'lead',
        text: '<b>Calmer late work:</b> counted from an item’s last update, grouped and folded on the desks, with <b>Seen · 7 days</b> to hide one for a week.',
      },
    ],
  },
  {
    ver: '2026.11.09.7',
    date: '9 Nov 2026',
    items: [
      { who: 'lead', text: '<b>Task sets:</b> groups of project tasks added to a project in one go (＋ Add task set / Save as task set).' },
      { who: 'all', text: 'Shadow work groups follow <b>your team’s own list</b> of task types (no more “OTHER”).' },
    ],
  },
  {
    ver: '2026.11.09.4',
    date: '9 Nov 2026',
    items: [
      { who: 'all', text: '<b>“Why is my score …?”</b> shows each part, what counted, the rule and the points.' },
      {
        who: 'lead',
        text: '<b>⭐ Manager rating</b> (1–5 with a comment) on the Manager Desk, <b>bonus / penalty points</b> with a reason, and more score parts.',
      },
    ],
  },
  {
    ver: '2026.11.09.1',
    date: '9 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>To Do time:</b> due days by priority and type, <b>⏸ On hold</b> with a reason, <b>⏳ Ask for more time</b>. Weekends, holidays and approved leave are not counted.',
      },
      {
        who: 'analyst',
        text: '<b>🤝 Hand over my work</b> on the Analyst Desk when you are away: who covers, dates and a note per open item.',
      },
      {
        who: 'lead',
        text: 'Manager Desk: holds and time asks to answer, late work, projects at risk. <b>Projects can count in the monthly score</b> (weight 0 until set). A month with nothing to score in a part leaves that part out.',
      },
      {
        who: 'admin',
        text: '<b>Admin role</b> for limited admins (chosen areas, own team or all teams) and <b>Time rules & holidays</b> per team (with Ramadan).',
      },
    ],
  },
  {
    ver: '2026.11.08.5',
    date: '8 Nov 2026',
    items: [{ who: 'all', text: 'Works on <b>phones</b>: nothing scrolls sideways, finger-sized buttons, full-screen windows.' }],
  },
  {
    ver: '2026.11.08.4',
    date: '8 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>➜ Send on</b> gives the next person (validation, testing …) a real To Do of their own; <b>↩ Send back</b> with a reason reopens the one before until ✓ Fixed. <b>🔀 Hand-on chain</b> in the form.',
      },
    ],
  },
  {
    ver: '2026.11.08.3',
    date: '8 Nov 2026',
    items: [
      { who: 'lead', text: '<b>↪ Follow-up To Do</b> from a To Do’s form (linked both ways).' },
      {
        who: 'analyst',
        text: 'Need another To Do for the same thing? <b>🙋 Ask for a follow-up To Do</b> (your manager makes it or declines with a reason), or add a <b>＋ Personal follow-up</b>.',
      },
    ],
  },
  {
    ver: '2026.11.08.2',
    date: '8 Nov 2026',
    items: [
      {
        who: 'all',
        text: '<b>📝 Notes for future reference</b> on To Dos, shadow work, quick wins, follow-ups and more — a running log kept after the item is done.',
      },
      {
        who: 'lead',
        text: '<b>↻ Repeating To Dos</b> (every working day / week / month / 3 months) and <b>To Do workflows</b> (steps that hand on by themselves).',
      },
    ],
  },
  {
    ver: '2026.11.08.1',
    date: '8 Nov 2026',
    items: [
      { who: 'all', text: '<b>Typing is no longer wiped</b> when a teammate saves — the page waits until you finish.' },
      {
        who: 'lead',
        text: 'Each team’s To Dos are counted, confirmed and finished only by that team’s manager / team leader (or someone acting for them).',
      },
    ],
  },
];
