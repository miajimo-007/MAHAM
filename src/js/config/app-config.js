/* DARRIK — App-wide constants: version, roles, permissions, functions (pages), menu, default scoring.
 * Change behaviour here rather than in the code that uses it. */
'use strict';

const APP_VERSION = '2026.10.30.10';

/* folder & polling */
const Config = {
  DATA_FOLDER: 'DARRIK Data',
  USERS_FOLDER: 'users',
  BACKUP_FOLDER: 'Backups', // inside the data folder
  BACKUP_KEEP: 30, // daily backups kept
  POLL_MS: 20000, // background refresh of teammates' changes
  SAVE_DEBOUNCE_MS: 400, // wait this long after an edit before writing
  DEFAULT_TEAM: 'apps',
  SELF_BACKDATE_DAYS: 7, // analysts may log their own shadow work this many days back
  FAIR_SINCE: Date.parse('2026-10-23T00:00:00+03:00'), // fairness rules apply to changes saved from this version on
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
    ['seeNames', "See other people's names", 'Off = others appear as Member 1, 2, … in dashboards and lists'],
  ],
  SUPER_ONLY: ['assignTodo'],
  SUPER_ADMIN_ONLY: ['importOld'], // abilities nobody but the super admin has, and that cannot be granted
  PAGES: [
    ['todo', 'To Do List'],
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
    ['oncall', 'On-Call'],
    ['courses', 'Courses'],
    ['directory', 'Directory'],
    ['info', 'Info & SRS'],
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
    mytask: 'meetings',
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
  NAV: [
    [
      'Work',
      [
        ['home', 'My Day', '☀'],
        ['todo', 'To Do List', '☑'],
        ['shadow', 'Shadow Works', '◐'],
        ['helpdesk', 'IT Help Desk', '✉'],
        ['attendance', 'Attendance', '▦'],
        ['requests', 'Requests', '✋'],
        ['meetings', 'Meetings', '🗓'],
        ['announcements', 'Announcements', '📢'],
      ],
    ],
    [
      'Performance',
      [
        ['perf', 'Performance', '◆'],
        ['reports', 'Reports', '📄'],
      ],
    ], // one page with tabs: Team Dashboard · Employee · Details · Lazy Days · Projects
    [
      'Follow-up',
      [
        ['quickwins', 'Quick Wins', '⚡'],
        ['central', 'Central Follow-up', '↗'],
        ['oncall', 'On-Call', '☎'],
      ],
    ],
    [
      'Reference',
      [
        ['courses', 'Courses', '✎'],
        ['directory', 'Directory', '☰'],
        ['info', 'Info & SRS', 'ⓘ'],
      ],
    ],
  ],
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
