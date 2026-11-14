# What wraps what (written by tools/build.py — do not edit)

Some files replace a function made by an earlier file and call the old one inside. The **last file listed runs first**;
each calls the one before it. Order = the script order in `src/index.html`.

| Function | Wrapped by (in load order) |
|---|---|
| `App.launch` | `js/app/whatsnew.js` → `js/data/storage/storage.js` → `js/app/always-admin.js` → `js/maham/20-notify.js` → `js/maham/30-chat.js` → `js/maham/70-ai.js` → `js/maham/95-platform.js` |
| `App.modeUi` | `js/app/always-admin.js` |
| `App.render` | `js/maham/95-platform.js` |
| `App.switchMode` | `js/app/always-admin.js` |
| `App.teamFor` | `js/app/always-admin.js` |
| `Calc.monthScore` | `js/domain/projscore.js` → `js/domain/scoreparts.js` |
| `Calc.perf` | `js/domain/projscore.js` |
| `Calc.saveScoring` | `js/pages/admin/admin-role.js` |
| `Calc.scoring` | `js/domain/projscore.js` |
| `Calc.todoDerive` | `js/domain/timerules.js` |
| `P.adminperson` | `js/pages/admin/admin-role.js` |
| `P.director` | `js/pages/admin/timerules.js` → `js/pages/desks/deskcalm.js` |
| `P.employee` | `js/pages/performance/scorewhy.js` |
| `P.home` | `js/pages/performance/scorewhy.js` → `js/pages/work/handover.js` → `js/pages/follow-up/central.js` |
| `P.manager` | `js/pages/admin/timerules.js` → `js/pages/admin/scoreparts.js` → `js/pages/work/handover.js` → `js/pages/follow-up/central.js` → `js/pages/desks/deskcalm.js` |
| `P.project` | `js/pages/work/tasksets.js` → `js/pages/work/workitems.js` |
| `P.projects` | `js/pages/work/workitems.js` |
| `Scrum.canSee` | `js/domain/workitems.js` |
| `Scrum.canWork` | `js/domain/workitems.js` |
| `Store.all` | `js/domain/private.js` |
| `Store.extraBlock` | `js/domain/flowtrust.js` |
| `Store.normalize` | `js/domain/todoid.js` |
| `Store.save` | `js/pages/admin/admin-role.js` → `js/maham/45-kbpublic.js` |
| `Store.saveMany` | `js/domain/todoid.js` → `js/maham/20-notify.js` |
| `Store.team` | `js/app/always-admin.js` |
| `Store.verify` | `js/app/mode.js` |
| `UI.memberOptions` | `js/app/always-admin.js` |
