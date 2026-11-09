/* MAHAM — App-wide constants: version, roles, permissions, functions (pages), menu, default scoring.
 * Change behaviour here rather than in the code that uses it. */
'use strict';

const APP_VERSION = '2026.11.09.11';
const APP_MARK = '🧭'; // the app's mark when no logo picture is set

/* folder & polling */
const Config = {
  DATA_FOLDER: 'MAHAM Data',
  USERS_FOLDER: 'users',
  BACKUP_FOLDER: 'Backups', // inside the data folder
  BACKUP_KEEP: 30, // daily backups kept
  POLL_MS: 20000, // background refresh of teammates' changes
  SAVE_DEBOUNCE_MS: 400, // wait this long after an edit before writing
  DEFAULT_TEAM: 'apps',
  SELF_BACKDATE_DAYS: 7, // analysts may log their own shadow work this many days back
  FAIR_SINCE: Date.parse('2026-10-23T00:00:00+03:00'),
  OWN_SINCE: Date.parse('2026-11-03T00:00:00+03:00'), // "only the owner or someone with Change others' items" applies to changes saved from this version on   // fairness rules apply to changes saved from this version on
  /* starting values for lists the super admin can edit in Settings (per team) */
  DEFAULT_LISTS: {
    projectCategories: [
      'Enhancement',
      'New implementation / Go-live',
      'Integration',
      'Optimisation',
      'Upgrade',
      'Reporting',
      'Training',
      'Other',
    ],
    ptaskTypes: ['Story', 'Task', 'Bug'],
    boardColumns: ['To Do', 'In Progress', 'In Review', 'Done'], // first = new tasks, last = done
  },
  /* request types (the super admin can change them in Admin → Request types)
     kind: days | hours | other · director: needs the director's final approval · attendance: write to Attendance when approved */
  REQUEST_TYPES: [
    { id: 'leave', label: 'Vacation / leave', kind: 'days', director: true, attendance: true },
    { id: 'permission', label: 'Permission (hours)', kind: 'hours', director: false, attendance: true },
    { id: 'training', label: 'Training / course', kind: 'days', director: false, attendance: false },
    { id: 'overtime', label: 'Overtime', kind: 'hours', director: false, attendance: false },
    { id: 'other', label: 'Other approval', kind: 'other', director: false, attendance: false },
  ],
  PERMS: [
    ['viewDashboards', 'See team dashboards', 'Team Dashboard, Performance, Lazy Days'],
    ['viewOthers', "See other people's records", 'To Do, shadow work, attendance, scores of teammates'],
    ['editAttendanceOthers', 'Mark attendance for others', ''],
    [
      'editOthers',
      "Change or delete other people's items",
      'Shadow work, follow-ups, on-call, courses, attendance, info and dashboard entries added by others (To Dos and quick wins keep their own rules)',
    ],
    ['assignTodo', 'Assign / edit / delete To Dos', ''],
    ['approveQW', 'Approve quick wins', 'Give QW IDs, approve or reject'],
    ['importME', 'Import ManageEngine data', 'and edit help desk records'],
    ['lockScores', 'Lock monthly scores', ''],
    ['manageTeam', 'Manage team & settings', 'Members, lists, scoring, permissions'],
    ['export', 'Export to Excel', ''],
    ['assignToManagers', 'Assign To Dos & projects to managers', 'Director / AED desk'],
    [
      'approveRequests',
      'Approve requests',
      'Vacation, permission and other requests from the team (manager step; directors do the final step)',
    ],
    ['createProjects', 'Create and lead team projects', 'Owner plans sprints, picks the project team and assigns tasks'],
    ['seePortfolio', 'See the projects portfolio', 'Projects → Portfolio: every project of their teams with its health light'],
    [
      'editHelpdeskByHand',
      'Add, delete and fix help desk requests by hand',
      'Off for everyone until given — normally only the daily import changes them',
    ],
    ['postAnnouncements', 'Post announcements', 'Off for everyone until given'],
    [
      'useLab',
      'Open the MAHAM Lab',
      'The separate MAHAM-Lab.html (quick win ideas and patterns, read-only). People insights stay super admin only',
    ],
    ['seeUsage', 'See usage', 'When people saw / opened their To Dos, and the Usage report: screens, functions and time per person'],
    ['seeWorkload', 'See project workload', 'Projects → Workload: open project tasks per person and week'],
    ['decideProjectRequests', 'Decide project suggestions', 'Approve (turn into a project), hold or reject what the team suggests'],
    ['manageTemplates', 'Manage project templates', 'Save a project as a template, delete templates'],
    ['seeNames', "See other people's names", 'Off = others appear as Member 1, 2, … in dashboards and lists'],
  ],
  SUPER_ONLY: ['assignTodo'],
  SUPER_ADMIN_ONLY: ['importOld'], // abilities nobody but the super admin has, and that cannot be granted
  PAGES: [
    ['todo', 'To Do List'],
    ['mytasks', 'My Tasks'],
    ['shadow', 'Shadow Works'],
    ['helpdesk', 'IT Help Desk'],
    ['attendance', 'Attendance'],
    ['dashboard', 'Team Dashboard'],
    ['employee', 'Employee'],
    ['performance', 'Performance'],
    ['lazy', 'Lazy Days'],
    ['projperf', 'Project Performance'],
    ['quickwins', 'Quick Wins'],
    ['central', 'Central Follow-up'],
    ['oncall', 'On-Call / Good Catch'],
    ['courses', 'Courses'],
    ['directory', 'Directory'],
    ['info', 'Info & Dashboards'],
    ['projects', 'Projects'],
    ['mgrtasks', 'Tasks from above'],
    ['requests', 'Requests & Approvals'],
    ['meetings', 'Meetings'],
    ['reports', 'Reports'],
  ],
  /* access level per function: 'hide' | 'view' | 'edit' (person setting > team setting > edit) */
  LEVELS: [
    ['edit', 'Edit'],
    ['view', 'View only'],
    ['hide', 'Hidden'],
  ],
  /* functions only the super admin edits unless he grants Edit to a team or person */
  ADMIN_EDIT: ['directory'],
  /* functions hidden for everyone until the administrator gives them (Admin → Functions) */
  DEFAULT_HIDDEN: ['reports'],
  /* which function each kind of record belongs to */
  COLL_PAGE: {
    todo: 'todo',
    shadow: 'shadow',
    helpdesk: 'helpdesk',
    attendance: 'attendance',
    quickwin: 'quickwins',
    central: 'central',
    oncall: 'oncall',
    gcatch: 'oncall',
    gcupdate: 'oncall',
    course: 'courses',
    reccourse: 'courses',
    itdir: 'directory',
    emrdir: 'directory',
    userdir: 'directory',
    info: 'info',
    srs: 'info',
    project: 'projects',
    ptask: 'projects',
    sprint: 'projects',
    mgrtask: 'mgrtasks',
    request: 'requests',
    meeting: 'meetings',
    mytask: 'mytasks',
    pphase: 'projects',
    praid: 'projects',
    pstatus: 'projects',
    pcomment: 'projects',
    ptemplate: 'projects',
    preq: 'projects',
    action: 'meetings',
  }, // announcement / annread: no function level (always visible)
  /* team scoping: these lists belong to one team; records without a team are APPS (original data) */
  TEAM_SCOPED: new Set([
    'todo',
    'shadow',
    'helpdesk',
    'attendance',
    'central',
    'quickwin',
    'oncall',
    'course',
    'reccourse',
    'emrdir',
    'info',
    'srs',
    'scoresnap',
    'request',
  ]),
  ROLES: [
    ['analyst', 'Analyst'],
    ['teamleader', 'Team Leader'],
    ['manager', 'Manager'],
    ['director', 'Director'],
    ['aed', 'AED'],
  ],
  /* the menu: 7 headings. A heading with one item shows as a plain link; Home's name follows the person's desk.
   * item = [page key, label, icon, { href, page, mgr }] — page = whose permission it follows, mgr = managers / super admin only */
  NAV: [
    ['Home', [['home', 'Analyst Desk', '☀']]],
    [
      'Work',
      [
        ['todo', 'To Do List', '☑'],
        ['mytasks', 'Personal tasks', '✔'],
        ['shadow', 'Shadow Works', '◐'],
        ['helpdesk', 'IT Help Desk', '✉'],
      ],
    ],
    ['Projects', [['projects', 'Projects', '◈']]],
    [
      'Follow-up',
      [
        ['quickwins', 'Quick Wins', '⚡'],
        ['central', 'Central Follow-up', '↗'],
        ['goodcatch', 'Good Catch', '🎯', { href: '#/oncall/goodcatch', page: 'oncall' }],
        ['mgrtasks', 'Tasks from Director', '✦', { mgr: true }],
      ],
    ],
    [
      'Team',
      [
        ['requests', 'Requests & Approvals', '✋'],
        ['attendance', 'Attendance', '▦'],
        ['meetings', 'Meetings', '🗓'],
        ['oncall', 'On-Call sheet', '☎', { href: '#/oncall/sheet' }],
        ['announcements', 'Announcements', '📢'],
      ],
    ],
    [
      'Performance',
      [
        ['perf', 'Performance', '◆'],
        ['reports', 'Reports', '📄'],
        ['usage', 'Usage', '◷'],
        ['overview', 'All Teams Overview', '▤', { superOnly: true }],
      ],
    ],
    [
      'Reference',
      [
        ['info', 'Info & Dashboards', 'ⓘ'],
        ['directory', 'Directory', '☰'],
        ['courses', 'Courses', '✎'],
      ],
    ],
  ],
  NAV_NAMES: { Home: 'Analyst Desk', Work: 'WorkList', Team: 'Team & Time' },
  NAV_ICONS: { Home: '☀', Work: '☑', 'Follow-up': '⚡', Team: '👥', Performance: '◆', Reference: '📚', Admin: '⚙', Projects: '◈' }, // shown names of the headings (Admin → Customize can rename them)
  DEFAULT_SCORING: {
    weights: { todo: 35, helpdesk: 35, attendance: 15, quickwins: 10, shadow: 5 },
    helpdeskSplit: { closing: 70, requests: 30 },
    closingTargetHrs: 9,
    longElapsedHrs: 9,
    tiers: {
      todo: [
        [1, 100],
        [0.95, 95],
        [0.9, 90],
        [0.8, 80],
        [-1, 50],
      ], // on-time ratio >= x
      requests: [
        [1.2, 100],
        [1, 95],
        [0.8, 85],
        [0.6, 70],
        [-1, 50],
      ], // own requests / team average >= x
      closing: [
        [4.5, 100],
        [9, 98],
        [12, 90],
        [1e9, 50],
      ], // avg hours <= x
      shadow: [
        [20, 100],
        [15, 90],
        [10, 80],
        [-1, 50],
      ], // hours >= x
      quickwins: [
        [2, 100],
        [1, 90],
        [-1, 50],
      ], // completed count >= x
      attendance: [
        [2, 100],
        [4.5, 90],
        [1e9, 80],
      ], // permission hours <= x
    },
  },
};
Object.freeze(Config);
