/* MAHAM — One-off import of the old per-sheet Excel files (detects each sheet by its headers; stable ids so re-import never duplicates). */
'use strict';

const Importer = {
  /* ---------- value helpers ---------- */
  s(v) {
    if (v == null) return '';
    if (typeof v === 'number' && Number.isInteger(v)) return String(v);
    return String(v).trim();
  },
  d(v) {
    // -> YYYY-MM-DD
    if (v == null || v === '') return '';
    if (typeof v === 'number') return v > 20000 && v < 80000 ? XL.serialToDT(v).slice(0, 10) : '';
    const t = parseDT(v, 'dmy');
    return t ? t.slice(0, 10) : '';
  },
  dt(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') return v > 20000 ? XL.serialToDT(v) : '';
    return parseDT(v, 'dmy');
  },
  tm(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') {
      const f = v % 1;
      const mins = Math.round(f * 1440);
      return `${U.pad(Math.floor(mins / 60) % 24)}:${U.pad(mins % 60)}`;
    }
    const m = /(\d{1,2}):(\d{2})/.exec(String(v));
    return m ? `${U.pad(m[1])}:${m[2]}` : '';
  },
  n(v) {
    const x = typeof v === 'number' ? v : parseFloat(String(v || '').replace(/[^\d.-]/g, ''));
    return isNaN(x) ? 0 : x;
  },
  who(v) {
    return Store.memberByMeName(Importer.s(v)) || '';
  },
  hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  },
  norm(v) {
    return U.lc(v)
      .replace(/\s+/g, ' ')
      .replace(/\s*\[f\]$/, '')
      .trim();
  },
  /* a Staff name that matches nobody in the app (shown on the import screen) */
  unknown(meta, raw) {
    if (!raw) return;
    meta.unknownStaff = meta.unknownStaff || [];
    if (!meta.unknownStaff.includes(raw)) meta.unknownStaff.push(raw);
  },

  /* find header row: first row (within 40) containing all `need` labels; returns {ri, col(name)} */
  header(rows, need) {
    for (let ri = 0; ri < Math.min(rows.length, 40); ri++) {
      const r = Array.from(rows[ri] || [], Importer.norm);
      if (need.every(n => r.includes(n))) {
        return {
          ri,
          col: (...names) => {
            for (const nm of names) {
              const i = r.indexOf(nm);
              if (i >= 0) return i;
            }
            return -1;
          },
          cols: r,
        };
      }
    }
    return null;
  },

  /* ---------- sheet types ---------- */
  TYPES: [
    {
      key: 'skip',
      label: 'Calculated sheet (not needed)',
      names: [
        'performance',
        'details',
        'dashboard employee',
        'dashboard first',
        'lazydays',
        'hidden attendance',
        'central',
        'central comments',
        'empty',
        'tdfu',
      ],
    },
    { key: 'todo', label: 'To Do List', names: ['to do list', 'to do list 2025'], need: ['status', 'to do', 'assined to', 'finish date'] },
    { key: 'shadow', label: 'Shadow Works', names: ['shadow works'], need: ['task type', 'source', 'subject', 'duration'] },
    { key: 'routine', label: 'Routine Tasks → Shadow Works', names: ['routine tasks'], need: ['request id', 'staff', 'task', 'cat/type'] },
    { key: 'projtasks', label: 'Project Tasks → Projects', names: ['project tasks'], need: ['project', 'task details', 'stage', 'staff'] },
    { key: 'helpdesk', label: 'MEDataSource (ManageEngine)', names: ['medatasource'], need: ['requester', 'subject', 'technician'] },
    { key: 'attendance', label: 'Attendance', names: ['attendance'], need: ['on', 'of', 'pr', 'hrs', 'type'] },
    { key: 'central', label: 'Riyad FU', names: ['riyad fu'], need: ['req id', 'redmine', 'deployed'] },
    { key: 'quickwin', label: 'Quick Wins', names: ['quick wins'], need: ['manager approval', 'expected date', 'impact'] },
    { key: 'mgrtask', label: 'Manager Tasks', names: ['manager tasks'], need: ['urgency', 'task', 'manager comment'] },
    { key: 'oncall', label: 'On-Call Sheet', names: ['on-call sheet'], need: ['analyst', 'time', 'issue', 'action'] },
    { key: 'course', label: 'Courses', names: ['courses'], need: ['course name', 'ppt date'] },
    { key: 'itdir', label: 'IT Directory', names: ['it directory'], need: ['region - dept - section', 'title', 'office'] },
    { key: 'emrdir', label: 'EMR Directory', names: ['emr directory'], need: ['facility', 'dept/ward', 'jc number'] },
    {
      key: 'info',
      label: 'Info & SRS & ECTS',
      names: ['info & srs & ects'],
      test: rows => rows.slice(0, 5).some(r => (r || []).some(c => Importer.norm(c) === 'on-call plan')),
    },
    {
      key: 'scores',
      label: 'Dashboard (monthly scores)',
      names: ['dashboard'],
      test: (rows, name) =>
        /dashboard/i.test(name) &&
        !/employee|first/i.test(name) &&
        rows.some(r => (r || []).some(c => Importer.norm(c) === 'monthly heatmap score')),
    },
    { key: 'drops', label: 'Drops (dropdown lists)', names: ['drops'], need: ['modules', 'task type', 'source', 'dept/ward'] },
    {
      key: 'tdfu',
      label: 'TDFU (copy of To Do — skipped)',
      need: ['to do', 'assined to', 'manager / team leader instruction'],
      notNeed: ['status'],
    },
  ],
  detect(name, rows, fileName) {
    const nm = U.lc(name).trim();
    for (const T of Importer.TYPES)
      if (T.names && T.names.includes(nm)) return T.key === 'tdfu' ? Importer.TYPES.find(t => t.key === 'skip') : T;
    const fn = U.lc((fileName || '').replace(/\.(xlsx|csv|txt)$/i, '')).trim();
    for (const T of Importer.TYPES) if (T.names && T.names.includes(fn)) return T;
    for (const T of Importer.TYPES) {
      if (T.key === 'skip') continue;
      if (T.test) {
        if (T.test(rows, name + ' ' + fileName)) return T;
        continue;
      }
      const H = T.need && Importer.header(rows, T.need);
      if (H && !(T.notNeed && T.notNeed.some(x => H.cols.includes(x)))) return T;
    }
    return null;
  },

  /* ---------- parsers: rows -> records ---------- */
  parse: {
    todo(rows) {
      const H = Importer.header(rows, ['to do', 'assined to']);
      if (!H) return [];
      const c = {
        st: H.col('status'),
        task: H.col('to do'),
        fu: H.col('fu'),
        an: H.col('assined to', 'assigned to'),
        as: H.col('assigned', 'assigned date'),
        dur: H.col('due', 'duration'),
        fin: H.col('finish date'),
        stats: H.col('stats'),
        ins: H.col('manager / team leader instruction'),
        com: H.col('analyst [update / comment]'),
      };
      const out = [];
      for (const r of rows.slice(H.ri + 1)) {
        const task = Importer.s(r[c.task]);
        if (!task) continue;
        const fin = Importer.d(r[c.fin]);
        let st = Importer.s(r[c.st]);
        if (!['In Progress', 'Resolved', 'Canceled'].includes(st)) st = fin ? 'Resolved' : 'In Progress';
        let comment = c.com >= 0 ? Importer.s(r[c.com]) : c.stats >= 0 ? Importer.s(r[c.stats]) : '';
        if (U.lc(comment) === 'done') comment = '';
        out.push({
          c: 'todo',
          task,
          fu: U.lc(r[c.fu]) === 'y',
          analyst: Importer.who(r[c.an]),
          assigned: Importer.d(r[c.as]),
          duration: Math.round(Importer.n(r[c.dur])),
          finish: fin,
          status: st,
          instruction: c.ins >= 0 ? Importer.s(r[c.ins]) : '',
          comment,
          _k: [task, r[c.an], Importer.d(r[c.as])].join('|'),
        });
      }
      return out;
    },
    shadow(rows) {
      const H = Importer.header(rows, ['task type', 'source', 'subject', 'duration']);
      if (!H) return [];
      const c = {
        date: H.col('date'),
        an: H.col('analyst'),
        tt: H.col('task type'),
        src: H.col('source'),
        sub: H.col('subject'),
        dur: H.col('duration'),
        arrow: H.col('-->'),
      };
      const ref = c.arrow >= 0 ? c.arrow + 1 : -1;
      const out = [];
      for (const r of rows.slice(H.ri + 1)) {
        const date = Importer.d(r[c.date]);
        const an = Importer.who(r[c.an]);
        if (!date || !an) continue;
        let src = Importer.s(r[c.src]);
        if (U.lc(src) === 'call') src = 'Call';
        out.push({
          c: 'shadow',
          date,
          analyst: an,
          taskType: Importer.s(r[c.tt]),
          source: src,
          subject: Importer.s(r[c.sub]),
          minutes: Math.round(Importer.n(r[c.dur])),
          ref: ref >= 0 ? Importer.s(r[ref]) : '',
          _k: [date, an, r[c.tt], r[c.sub], r[c.dur]].join('|'),
        });
      }
      return out;
    },
    /* a team's "Routine Tasks" sheet (Init Date, Request ID, Staff, Task, Cat/Type, Status, Complete Date, Comment, Days)
       → shadow work. The sheet has no time column: minutes are set on the import screen (meta.routineMin, default 30).
       New Cat/Type values are added to the team's task type list so the shadow form keeps them. */
    routine(rows, meta) {
      const H = Importer.header(rows, ['staff', 'task', 'cat/type']);
      if (!H) return [];
      const c = {
        init: H.col('init date', 'date'),
        rid: H.col('request id'),
        an: H.col('staff'),
        task: H.col('task'),
        cat: H.col('cat/type'),
        st: H.col('status'),
        done: H.col('complete date', 'date comp'),
        com: H.col('comment'),
      };
      if (!App.viewTeam || App.viewTeam === '*') {
        meta.needTeam = true;
        return [];
      }
      const team = App.viewTeam,
        L = Store.lists(team);
      const types = new Set(L.taskTypes || []),
        sources = L.sources || [];
      const srcReq = sources.includes('IT Request') ? 'IT Request' : sources[0] || 'IT Request',
        srcOther = sources.includes('To Do') ? 'To Do' : srcReq;
      const out = [],
        added = [];
      for (const r of rows.slice(H.ri + 1)) {
        const task = Importer.s(r[c.task]);
        if (!task) continue;
        const raw = Importer.s(r[c.an]),
          an = Importer.who(raw);
        if (!an) {
          Importer.unknown(meta, raw);
          continue;
        }
        const done = c.done >= 0 ? Importer.d(r[c.done]) : '',
          date = Importer.d(r[c.init]) || done;
        if (!date) {
          meta.noDate = (meta.noDate || 0) + 1;
          continue;
        }
        const rid = c.rid >= 0 ? Importer.s(r[c.rid]) : '',
          st = c.st >= 0 ? Importer.s(r[c.st]) : '',
          cat = Importer.s(r[c.cat]),
          com = c.com >= 0 ? Importer.s(r[c.com]) : '';
        if (cat && !types.has(cat)) {
          types.add(cat);
          added.push(cat);
        }
        const note = [st && 'Status: ' + st, done && 'Completed: ' + done, com].filter(Boolean).join(' · ');
        out.push({
          c: 'shadow',
          date,
          analyst: an,
          taskType: cat,
          source: rid ? srcReq : srcOther,
          subject: task,
          minutes: null,
          ref: rid,
          fu: !done && !/cancel/i.test(st),
          note,
          _k: ['routine', date, raw, task, rid].join('|'),
        });
      }
      if (added.length) {
        const id = 'settings-lists-' + team,
          cur = Store.get(id) || {};
        out.push(
          Object.assign({}, cur, {
            id,
            c: 'settings',
            lists: Object.assign({}, cur.lists || {}, { taskTypes: [...(L.taskTypes || []), ...added] }),
          })
        );
      }
      return out;
    },
    /* a team's "Project Tasks" sheet (Init Date, Project, TASK Details, Stage, Staff, Date Comp, Status, Days)
       → one project per Project name (owner = the team's manager) with its tasks. Stage is the task status: the stages
       become the team workflow "<team> project stages" (board columns), used by the imported projects. */
    projtasks(rows, meta) {
      const H = Importer.header(rows, ['project', 'task details', 'stage', 'staff']);
      if (!H) return [];
      const c = {
        init: H.col('init date', 'date'),
        pr: H.col('project'),
        ti: H.col('task details'),
        stg: H.col('stage'),
        an: H.col('staff'),
        done: H.col('date comp', 'complete date'),
        st: H.col('status'),
      };
      if (!App.viewTeam || App.viewTeam === '*') {
        meta.needTeam = true;
        return [];
      }
      const team = App.viewTeam,
        mgr = (Store.teamManager(team) || {}).id || App.me,
        today = U.todayStr();
      const items = [];
      for (const r of rows.slice(H.ri + 1)) {
        const proj = Importer.s(r[c.pr]).replace(/\s+/g, ' '),
          title = Importer.s(r[c.ti]);
        if (!proj || !title) continue;
        const raw = Importer.s(r[c.an]),
          an = Importer.who(raw);
        if (raw && !an) Importer.unknown(meta, raw);
        items.push({
          proj,
          key: U.lc(proj),
          title,
          stage: Importer.s(r[c.stg]).replace(/\s+/g, ' '),
          raw,
          an: an || '',
          init: Importer.d(r[c.init]),
          done: c.done >= 0 ? Importer.d(r[c.done]) : '',
          st: c.st >= 0 ? Importer.s(r[c.st]) : '',
        });
      }
      if (!items.length) return [];
      /* the stages → a workflow (kept and added to on the next import) */
      const wfId = 'tf-imported-' + team,
        trec = Store.get('settings-taskflow-' + team) || {},
        old = (trec.flows || []).find(w => w.id === wfId);
      const catOf = name => {
        if (/cancel|reject|drop/i.test(name)) return 'done';
        if (/\b(done|complete|completed|closed|finished|resolved|delivered|deployed)\b/i.test(name)) return 'done';
        if (/hold|wait|pending|blocked/i.test(name)) return 'wait';
        if (/not started|^new$|to ?do|backlog|planned|^open$/i.test(name)) return 'todo';
        const rs = items.filter(x => x.stage === name);
        return rs.every(x => x.done) ? 'done' : 'doing';
      };
      const st = (old ? old.statuses : []).map(s => Object.assign({}, s));
      for (const x of items) if (x.stage && !st.some(s => U.lc(s.name) === U.lc(x.stage))) st.push({ name: x.stage, cat: catOf(x.stage) });
      if (!st.some(s => s.cat === 'done')) st.push({ name: 'Done', cat: 'done' });
      const ORDER = ['todo', 'wait', 'doing', 'done'];
      st.sort((a, b) => ORDER.indexOf(a.cat) - ORDER.indexOf(b.cat));
      const start = (st.find(s => s.cat === 'todo') || st[0]).name,
        doneName = st.find(s => s.cat === 'done' && !/cancel|reject|drop/i.test(s.name)) || st.find(s => s.cat === 'done');
      const wf = {
        id: wfId,
        name: `${Store.teamName(team)} project stages`,
        start,
        statuses: st,
        trs: st.map((s, i) => ({ id: 'to' + i, name: s.name, from: ['*'], to: s.name })),
      };
      const statusOf = x => {
        if (!x.stage) return x.done ? doneName.name : start;
        return st.find(s => U.lc(s.name) === U.lc(x.stage)).name;
      };
      const catName = n => (st.find(s => s.name === n) || {}).cat || 'todo';
      /* projects (an existing project of this team with the same name is used, not copied) */
      const out = [],
        picks = Object.assign({}, trec.projects || {}),
        seen = {};
      const groups = new Map();
      for (const x of items) {
        if (!groups.has(x.key)) groups.set(x.key, []);
        groups.get(x.key).push(x);
      }
      for (const [key, list] of groups) {
        const ex = Store.all('project').find(
          p =>
            Scrum.teamOf(p) === team &&
            U.lc(
              String(p.name || '')
                .replace(/\s+/g, ' ')
                .trim()
            ) === key
        );
        const pid = ex ? ex.id : `xlp-${team}-${Importer.hash(key)}`;
        const tasks = list.map(x => Object.assign(x, { status: statusOf(x) }));
        const allDone = tasks.every(x => catName(x.status) === 'done');
        const dates = tasks
            .map(x => x.init)
            .filter(Boolean)
            .sort(),
          ends = tasks
            .map(x => x.done)
            .filter(Boolean)
            .sort();
        if (!ex)
          out.push({
            id: pid,
            c: 'project',
            name: list[0].proj,
            team,
            manager: mgr,
            origin: 'team',
            priority: 'Normal',
            status: allDone ? 'Done' : 'In Progress',
            progress: allDone ? 100 : 0,
            mode: 'kanban',
            start: dates[0] || today,
            due: '',
            description: '',
            members: [...new Set(tasks.map(x => x.an).filter(Boolean))],
            updatedOn: today,
            doneDate: allDone ? ends[ends.length - 1] || today : '',
          });
        if (!ex || !picks[pid]) picks[pid] = { all: wfId, types: {} };
        let n = ex
          ? Scrum.items(pid)
              .filter(t => !/^xlt-/.test(t.id))
              .reduce((a, t) => Math.max(a, t.n || 0), 0)
          : 0;
        for (const x of tasks) {
          const base = `xlt-${team}-${Importer.hash([key, x.title, x.raw, x.init].join('|'))}`;
          seen[base] = (seen[base] || 0) + 1;
          const k = catName(x.status);
          out.push({
            id: seen[base] > 1 ? `${base}-${seen[base]}` : base,
            c: 'ptask',
            project: pid,
            team,
            n: ++n,
            title: x.title,
            type: 'Task',
            priority: 'Normal',
            points: 1,
            assignee: x.an,
            status: x.status,
            start: x.init,
            due: '',
            sprint: '',
            createdOn: x.init || x.done || today,
            startedOn: k === 'todo' ? '' : x.init || '',
            doneDate: k === 'done' ? x.done || x.init || today : '',
            description: '',
            comment: x.st ? 'Status in the sheet: ' + x.st : '',
            checklist: [],
          });
        }
      }
      out.push(
        Object.assign({}, trec, {
          id: 'settings-taskflow-' + team,
          c: 'settings',
          flows: [...(trec.flows || []).filter(w => w.id !== wfId), wf],
          projects: picks,
        })
      );
      return out;
    },
    helpdesk(rows, meta) {
      const H = Importer.header(rows, ['requester', 'subject', 'technician']);
      if (!H) return [];
      const g = (...n) => H.col(...n);
      const c = {
        id: g('request id', 'requestid', 'id'),
        rq: g('requester'),
        sub: g('subject'),
        dep: g('department'),
        st: g('request status', 'status'),
        grp: g('group'),
        tech: g('technician'),
        cr: g('created time', 'created date'),
        rs: g('resolved time', 'resolved date'),
        el: g('time elapsed', 'elapsed time'),
      };
      if (c.id < 0) {
        c.id = c.rq - 1;
        const v = (rows[H.ri] || [])[c.id];
        const dd = Importer.d(v);
        if (dd) meta.helpdeskUpdated = dd;
      }
      const out = [];
      for (const r of rows.slice(H.ri + 1)) {
        const id = String(Importer.s(r[c.id])).replace(/\D/g, '');
        if (!id) continue;
        const el = r[c.el];
        out.push({
          id: 'hd-' + id,
          c: 'helpdesk',
          reqId: +id,
          requester: Importer.s(r[c.rq]),
          subject: Importer.s(r[c.sub]),
          department: Importer.s(r[c.dep]),
          status: Importer.s(r[c.st]),
          group: Importer.s(r[c.grp]),
          technician: Importer.s(r[c.tech]),
          created: Importer.dt(r[c.cr]),
          resolved: typeof r[c.rs] === 'number' ? Importer.dt(r[c.rs]) : Importer.dt(r[c.rs]),
          elapsedHrs: el == null || el === '' ? null : typeof el === 'number' ? Math.round(el * 24 * 1e4) / 1e4 : parseElapsed(el),
        });
      }
      return out;
    },
    attendance(rows) {
      const hi = rows.findIndex((r, i) => i < 40 && Array.from(r || [], Importer.norm).filter(c => c === 'on').length >= 2);
      if (hi < 1) return [];
      const names = rows[hi - 1] || [],
        hdr = Array.from(rows[hi] || [], Importer.norm);
      const blocks = [];
      hdr.forEach((v, k) => {
        if (v === 'on' && hdr[k + 1] === 'of') {
          const nm = names[k];
          const id = Importer.who(nm);
          if (id) blocks.push({ k, id });
        }
      });
      const dayCol = Math.max(0, (blocks[0] ? blocks[0].k : 2) - 1);
      const LEAVE = {
        annual: 'Annual',
        sick: 'Sick',
        admin: 'Admin',
        midy: 'Mid Year',
        'mid year': 'Mid Year',
        buss: 'Business',
        business: 'Business',
        oth: 'Other',
        other: 'Other',
      };
      const out = [];
      for (const r of rows.slice(hi + 1)) {
        const day = Importer.d(r[dayCol]);
        if (!day) continue;
        for (const { k, id } of blocks) {
          const on = r[k],
            of = r[k + 1],
            pr = r[k + 2],
            hrs = r[k + 3],
            typ = r[k + 4];
          if (![on, of, pr, hrs, typ].some(x => x != null && x !== '')) continue;
          const ph = Importer.n(hrs);
          out.push({
            id: `att-${day}-${id}`,
            c: 'attendance',
            date: day,
            analyst: id,
            status: of ? 'OFF' : on ? 'ON' : '',
            leave: LEAVE[U.lc(typ)] || Importer.s(typ),
            permHrs: pr || ph ? Math.round(ph * 100) / 100 : 0,
          });
        }
      }
      return out;
    },
    central(rows) {
      const H = Importer.header(rows, ['req id', 'analyst', 'subject']);
      if (!H) return [];
      const c = {
        date: H.col('date'),
        id: H.col('req id'),
        an: H.col('analyst'),
        mod: H.col('module'),
        sub: H.col('subject'),
        ty: H.col('type'),
        st: H.col('status'),
        rm: H.col('redmine'),
        ex: H.col('expected date'),
        dep: H.col('deployed'),
      };
      const out = [];
      for (const r of rows.slice(H.ri + 1)) {
        if (!r[c.an] && !r[c.sub]) continue;
        const rid = Importer.s(r[c.id]);
        out.push({
          c: 'central',
          date: Importer.d(r[c.date]),
          reqId: rid === '0' ? '' : rid,
          analyst: Importer.who(r[c.an]),
          module: Importer.s(r[c.mod]),
          subject: Importer.s(r[c.sub]),
          type: Importer.s(r[c.ty]),
          status: Importer.s(r[c.st]),
          redmine: Importer.s(r[c.rm]),
          expected: Importer.d(r[c.ex]),
          deployed: Importer.s(r[c.dep]),
          _k: [r[c.sub], r[c.an], rid].join('|'),
        });
      }
      return out;
    },
    quickwin(rows) {
      const H = Importer.header(rows, ['analyst', 'subject', 'manager approval']);
      if (!H) return [];
      const c = {
        date: H.col('date'),
        id: H.col('id'),
        an: H.col('analyst'),
        mod: H.col('module'),
        sub: H.col('subject'),
        ty: H.col('type'),
        st: H.col('status'),
        im: H.col('impact'),
        ex: H.col('expected date'),
        ap: H.col('manager approval'),
        mc: H.col('manager comment'),
      };
      const out = [];
      for (const r of rows.slice(H.ri + 1)) {
        if (!r[c.an]) continue;
        out.push({
          c: 'quickwin',
          date: Importer.d(r[c.date]),
          qwId: Importer.s(r[c.id]),
          analyst: Importer.who(r[c.an]),
          module: Importer.s(r[c.mod]),
          subject: Importer.s(r[c.sub]).replace(/^"|"$/g, ''),
          type: Importer.s(r[c.ty]),
          status: Importer.s(r[c.st]),
          impact: Importer.s(r[c.im]),
          expected: Importer.d(r[c.ex]),
          approval: Importer.s(r[c.ap]),
          managerComment: c.mc >= 0 ? Importer.s(r[c.mc]) : '',
          _k: [r[c.id], r[c.an], r[c.sub]].join('|'),
        });
      }
      return out;
    },
    mgrtask(rows) {
      const H = Importer.header(rows, ['urgency', 'task']);
      if (!H) return [];
      const c = { date: H.col('date'), ur: H.col('urgency'), task: H.col('task'), com: H.col('manager comment'), st: H.col('status') };
      return rows
        .slice(H.ri + 1)
        .filter(r => r[c.task])
        .map(r => ({
          c: 'mgrtask',
          manager: App.isDir() ? (Store.teamManager(App.viewTeam) || {}).id || '' : App.me,
          date: Importer.d(r[c.date]),
          urgency: Importer.s(r[c.ur]) || 'Normal',
          task: Importer.s(r[c.task]),
          comment: Importer.s(r[c.com]),
          status: Importer.s(r[c.st]) || 'Open',
          _k: [r[c.task], Importer.d(r[c.date])].join('|'),
        }));
    },
    oncall(rows) {
      const H = Importer.header(rows, ['analyst', 'issue', 'action']);
      if (!H) return [];
      const c = {
        an: H.col('analyst'),
        date: H.col('date'),
        time: H.col('time'),
        is: H.col('issue'),
        ac: H.col('action'),
        st: H.col('status'),
      };
      return rows
        .slice(H.ri + 1)
        .filter(r => r[c.an])
        .map(r => ({
          c: 'oncall',
          analyst: Importer.who(r[c.an]),
          date: Importer.d(r[c.date]),
          time: Importer.tm(r[c.time]),
          issue: Importer.s(r[c.is]),
          action: Importer.s(r[c.ac]),
          status: Importer.s(r[c.st]),
          _k: [r[c.an], Importer.d(r[c.date]), r[c.is]].join('|'),
        }));
    },
    course(rows) {
      const H = Importer.header(rows, ['course name']);
      if (!H) return [];
      const cols = H.cols;
      const c = {
        an: H.col('name'),
        cn: H.col('course name'),
        hr: cols.indexOf('hrs'),
        st: H.col('start date'),
        en: H.col('end date'),
        pp: H.col('ppt date'),
        C: H.col('c'),
        P: H.col('p'),
        stat: H.col('status'),
        cat: H.col('category'),
        rc: H.col('recomended courses', 'recommended courses'),
      };
      const rh = c.rc >= 0 ? cols.indexOf('hrs', c.rc) : -1;
      const out = [];
      for (const r of rows.slice(H.ri + 1)) {
        if (r[c.cn])
          out.push({
            c: 'course',
            analyst: Importer.who(r[c.an]),
            course: Importer.s(r[c.cn]),
            hrs: Importer.n(r[c.hr]),
            start: Importer.d(r[c.st]),
            end: Importer.d(r[c.en]),
            ppt: Importer.d(r[c.pp]),
            completed: r[c.C] === true || U.lc(r[c.C]) === 'true',
            presented: r[c.P] === true || U.lc(r[c.P]) === 'true',
            status: (Importer.s(r[c.stat]) || 'In Progress').replace(/^in progress$/i, 'In Progress'),
            _k: [r[c.an], r[c.cn]].join('|'),
          });
        if (c.rc >= 0 && r[c.rc])
          out.push({
            c: 'reccourse',
            category: Importer.s(r[c.cat]),
            course: Importer.s(r[c.rc]),
            hrs: rh >= 0 ? Importer.n(r[rh]) : 0,
            _k: [r[c.cat], r[c.rc]].join('|'),
          });
      }
      return out;
    },
    itdir(rows) {
      const H = Importer.header(rows, ['region - dept - section']);
      if (!H) return [];
      const k = H.col('region - dept - section');
      const name = k - 1;
      const c = {
        reg: H.col('region'),
        dep: H.col('dept'),
        sec: H.col('section'),
        bn: H.col('bn'),
        ti: H.col('title'),
        of: H.col('office'),
      };
      const em = H.cols.findIndex(x => x.startsWith('email'));
      const out = [];
      for (const r of rows.slice(H.ri + 1)) {
        const nm = Importer.s(r[name]);
        if (!nm || nm === '0' || /^region - dept/i.test(Importer.s(r[k]))) continue;
        out.push({
          c: 'itdir',
          name: nm,
          region: Importer.s(r[c.reg]),
          dept: Importer.s(r[c.dep]),
          section: Importer.s(r[c.sec]),
          bn: Importer.s(r[c.bn]),
          title: Importer.s(r[c.ti]),
          office: Importer.s(r[c.of]),
          email: Importer.s(r[em]),
          _k: [nm, r[c.bn], r[c.dep]].join('|'),
        });
      }
      // "Team Members" block (Badge / Name / Title / Ext)
      const T = Importer.header(rows, ['badge', 'name', 'title', 'ext']);
      if (T) {
        const b = T.col('badge'),
          n = T.col('name'),
          t = T.col('title'),
          e = T.col('ext');
        for (const r of rows.slice(T.ri + 1, T.ri + 60)) {
          if (typeof r[b] !== 'number' || !r[n]) continue;
          out.push({
            c: 'itdir',
            name: Importer.s(r[n]),
            region: 'Jeddah',
            dept: 'INFORMATION TECHNOLOGY - JEDDAH',
            section: '(LAB) - JEDDAH',
            bn: Importer.s(r[b]),
            title: Importer.s(r[t]),
            office: Importer.s(r[e]),
            email: '',
            _k: [r[n], r[b], 'team'].join('|'),
          });
        }
      }
      return out;
    },
    emrdir(rows) {
      const H = Importer.header(rows, ['facility', 'dept/ward', 'jc number']);
      if (!H) return [];
      const f = H.col('facility');
      const cols = H.cols;
      const c = {
        w: cols.indexOf('dept/ward', f),
        nu: cols.indexOf('nurse name', f),
        bn: cols.indexOf('bn', f),
        ext: cols.indexOf('ext.', f),
        jc: cols.indexOf('jc number', f),
        an: cols.indexOf('analyst', f),
      };
      const out = [];
      for (const r of rows.slice(H.ri + 1)) {
        const fac = Importer.s(r[f]);
        if (!fac || U.lc(fac) === 'facility' || fac.startsWith('#')) continue;
        out.push({
          c: 'emrdir',
          facility: fac,
          ward: Importer.s(r[c.w]),
          nurse: Importer.s(r[c.nu]),
          bn: Importer.s(r[c.bn]),
          ext: Importer.s(r[c.ext]),
          jc: Importer.s(r[c.jc]),
          analyst: c.an >= 0 ? Importer.who(r[c.an]) : '',
          _k: [fac, r[c.w], r[c.jc], r[c.nu]].join('|'),
        });
      }
      return out;
    },
    info(rows) {
      let R0 = -1,
        C0 = -1;
      rows.slice(0, 5).forEach((r, i) =>
        (r || []).forEach((v, j) => {
          if (R0 < 0 && Importer.norm(v) === 'on-call plan') {
            R0 = i;
            C0 = j;
          }
        })
      );
      if (R0 < 0) return [];
      const cell = (i, j) => (rows[R0 + i] || [])[C0 + j];
      const out = [];
      const add = (category, title, value) => out.push({ c: 'info', category, title, value, _k: [category, title].join('|') });
      for (let i = 1; i <= 6; i++) if (cell(i, 0)) add('On-Call Plan', Importer.s(cell(i, 0)), Importer.s(cell(i, 1)));
      for (let i = 8; i <= 11; i++) if (cell(i, 0)) add('Deployments', `${Importer.s(cell(i, 1))} deployment`, Importer.d(cell(i, 0)));
      for (let i = 13; i <= 18; i++) if (cell(i, 0)) add('Contract Renewal', Importer.s(cell(i, 0)), Importer.d(cell(i, 1)));
      for (let i = 19; i <= 32; i++)
        if (cell(i, 0) && Importer.norm(cell(i, 0)) !== 'projects')
          add('Initiatives & Projects', Importer.s(cell(i, 0)), typeof cell(i, 1) === 'number' ? '' : Importer.s(cell(i, 1)));
      if (cell(1, 6)) add('Links', 'EMR backup folder (MH-J)', Importer.s(cell(1, 6)));
      if (cell(2, 6)) add('Links', 'EMR backup folder (CHJ)', Importer.s(cell(2, 6)));
      if (cell(4, 6)) add('Links', 'EMR backup username', Importer.s(cell(4, 6)).replace(/^username:\s*/i, ''));
      // passwords are intentionally NOT imported
      for (let i = 1; i < 60; i++)
        if (cell(i, 5))
          out.push({ c: 'srs', owner: Importer.s(cell(i, 4)), number: Importer.s(cell(i, 5)), notes: '', _k: [cell(i, 5)].join('|') });
      return out;
    },
    scores(rows) {
      const H = Importer.header(rows, ['employee / month', 'jan', 'dec']);
      if (!H) return [];
      const e = H.col('employee / month'),
        j = H.col('jan');
      const out = [];
      for (const r of rows.slice(H.ri + 1, H.ri + 12)) {
        const id = Importer.who(r[e]);
        if (!id) continue;
        for (let m = 0; m < 12; m++) {
          const v = r[j + m];
          if (typeof v === 'number' && v)
            out.push({
              id: `snap-2026-${U.pad(m + 1)}-${id}`,
              c: 'scoresnap',
              analyst: id,
              year: 2026,
              month: m + 1,
              score: Math.round(v * 100) / 100,
            });
        }
      }
      return out;
    },
    drops(rows) {
      const H = Importer.header(rows, ['modules', 'task type', 'source']);
      if (!H) return [];
      const colVals = i =>
        rows
          .slice(H.ri + 1)
          .map(r => Importer.s(r[i]))
          .filter(Boolean);
      const lists = Object.assign({}, Store.lists());
      const set = (k, i) => {
        if (i >= 0) {
          const v = colVals(i);
          if (v.length) lists[k] = v;
        }
      };
      set('modules', H.col('modules'));
      set('taskTypes', H.col('task type'));
      set('sources', H.col('source'));
      set('wards', H.col('dept/ward'));
      set('qwTypes', H.col('type'));
      return [{ id: 'settings-lists-' + App.viewTeam, c: 'settings', lists }];
    },
  },

  /* ---------- run ---------- */
  async readFile(file) {
    if (/\.xlsx$/i.test(file.name)) {
      const zip = await JSZip.loadAsync(file instanceof Blob ? file : await file.arrayBuffer());
      return XL.readZip(zip, n => !Importer.TYPES[0].names.includes(U.lc(n).trim()));
    }
    if (/\.(csv|txt)$/i.test(file.name)) return [{ name: file.name.replace(/\.\w+$/, ''), rows: parseDelimited(await file.text()) }];
    throw new Error('Only .xlsx and .csv files are supported (save .xls files as .xlsx first)');
  },
  /* files: [{name, getFile()}] -> analysis */
  async analyse(files, progress) {
    const results = [];
    const meta = {};
    for (const [i, f] of files.entries()) {
      progress && progress(`Reading ${f.name} (${i + 1}/${files.length})…`);
      try {
        const file = f.getFile ? await f.getFile() : f;
        const sheets = await Importer.readFile(file);
        for (const sh of sheets) {
          if (!sh.rows) {
            results.push({ file: f.name, sheet: sh.name, type: Importer.TYPES[0], recs: [], skipped: true });
            continue;
          }
          const T = Importer.detect(sh.name, sh.rows, f.name);
          if (!T) {
            results.push({ file: f.name, sheet: sh.name, type: null, recs: [] });
            continue;
          }
          if (T.key === 'skip' || T.key === 'tdfu') {
            results.push({ file: f.name, sheet: sh.name, type: T, recs: [], skipped: true });
            continue;
          }
          const recs = Importer.parse[T.key](sh.rows, meta);
          results.push({ file: f.name, sheet: sh.name, type: T, recs });
        }
      } catch (e) {
        console.error(e);
        results.push({ file: f.name, error: e.message || String(e), recs: [] });
      }
    }
    // stable IDs (same row imported twice -> same record)
    const seen = {};
    for (const R of results)
      for (const r of R.recs) {
        if (!r.id) {
          const base = `xl-${r.c}-${Importer.hash(r._k || JSON.stringify(r))}`;
          seen[base] = (seen[base] || 0) + 1;
          r.id = seen[base] > 1 ? `${base}-${seen[base]}` : base;
        }
        delete r._k;
      }
    return { results, meta };
  },
  commit(analysis, overwrite) {
    const all = analysis.results.flatMap(R => R.recs);
    for (const r of all) {
      if (r.c === 'shadow' && r.minutes == null) r.minutes = Math.max(0, Math.round(+analysis.meta.routineMin || 30)); // routine tasks: time per task chosen on the screen
      if (r.c === 'helpdesk') {
        const m = Store.member(Store.memberByMeName(r.technician));
        r.team = (m && !Store.topRole(m.role) && m.team) || App.viewTeam;
      } else if (Store.TEAM_SCOPED.has(r.c)) r.team = App.viewTeam;
      if (r.c !== 'settings' && r.c !== 'helpdesk' && !/^(att|snap)-/.test(r.id) && App.viewTeam !== 'apps')
        r.id = r.id.replace(/^xl-/, `xl-${App.viewTeam}-`);
    }
    const list = all.filter(r => overwrite || r.c === 'settings' || !Store.get(r.id));
    if (analysis.meta.helpdeskUpdated || all.some(r => r.c === 'helpdesk'))
      list.push(
        Object.assign({}, Store.meta(), {
          id: Store.metaId(),
          c: 'settings',
          helpdeskUpdated: analysis.meta.helpdeskUpdated || U.todayStr(),
        })
      );
    if (list.length) Store.saveMany(list);
    return {
      added: list.filter(r => r.c !== 'settings').length,
      skipped: all.length - list.filter(r => r.c !== 'settings').length - all.filter(r => r.c === 'settings').length,
    };
  },
};
