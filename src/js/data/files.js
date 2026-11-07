/* MAHAM — Which file each record lives in (keeps the files small as the data grows).
 * Everyone still writes only their own files; their records are just split:
 *   users/<id>.json              this year's work, settings and anything still open
 *   users/<id>.hd-YYYY-MM.json   help-desk rows imported by <id>, one file per month the request was created
 *   users/<id>.yYYYY.json        finished work of a past year (archive) — read only when someone picks that year
 * Help-desk files of this year and last year are always read (old requests can still be open).
 * The trust rules are unchanged: the owner of every one of these files is <id>. */
'use strict';

Object.assign(Store, {
  PART_RE: /^(.+?)\.(hd-\d{4}-\d{2}|y\d{4}|log-\d{4}-\d{2})\.json$/,
  fileOwner(fname) {
    const m = Store.PART_RE.exec(fname);
    return m ? m[1] : fname.replace(/\.json$/, '');
  },
  filePart(fname) {
    const m = Store.PART_RE.exec(fname);
    return m ? m[2] : '';
  },
  isMainKey(k) {
    return k.startsWith('u:') && !Store.filePart(k.slice(2));
  },
  /* finished work of years before this one moves to the archive (from February, so January can still fix December) */
  archiveCut() {
    const d = new Date();
    return d.getMonth() >= 1 ? d.getFullYear() : d.getFullYear() - 1;
  },
  ARCHIVE_DATE: {
    shadow: r => r.date,
    attendance: r => r.date,
    todo: r => (r.status === 'Resolved' && r.finish ? r.finish : ''),
    quickwin: r => (['completed', 'rejected'].includes(U.lc(r.status)) && r.approval ? r.expected || r.date : ''),
    mytask: r => (r.status !== 'Open' ? r.doneDate || r.due || r.plan || '' : ''),
  },
  fileFor(r, owner) {
    if (r && r.c === 'actlog' && /^\d{4}-\d{2}$/.test(r.month || '')) return `${owner}.log-${r.month}.json`; // activity log: one small file per month
    if (r && r.c === 'helpdesk') {
      const m = /^(\d{4}-\d{2})/.exec(r.created || '');
      if (m) return `${owner}.hd-${m[1]}.json`;
    }
    const f = r && Store.ARCHIVE_DATE[r.c];
    const d = f && f(r);
    const y = d ? +String(d).slice(0, 4) : 0;
    if (y && y < Store.archiveCut()) return `${owner}.y${y}.json`;
    return owner + '.json';
  },
  /* past years asked for (year box, reports) and the years that have archive files */
  loadYears: new Set(),
  archiveYears: new Set(),
  loadLogs: false,
  async ensureLogs() {
    if (Store.loadLogs) return false;
    Store.loadLogs = true;
    await Store.sync();
    return true;
  },
  wantFile(fname) {
    const p = Store.filePart(fname);
    if (!p) return true;
    if (p.startsWith('log-')) return Store.loadLogs || (Store.fileOwner(fname) === App.me && p.slice(4) === U.todayStr().slice(0, 7)); // my own log of this month; everyone's only on the Activity log page
    if (p.startsWith('hd-')) {
      const y = +p.slice(3, 7);
      return y >= new Date().getFullYear() - 1 || Store.loadYears.has(y);
    }
    return Store.loadYears.has(+p.slice(1));
  },
  noteFile(fname) {
    const p = Store.filePart(fname);
    if (!p || p.startsWith('log-')) return;
    const y = p.startsWith('hd-') ? +p.slice(3, 7) : +p.slice(1);
    if (y && !Store.archiveYears.has(y)) {
      Store.archiveYears.add(y);
      Store._newYears = true;
    }
  },
  /* make sure the archives of these years are read (returns true when something had to be loaded) */
  async ensureYears(years) {
    const need = (years || []).map(Number).filter(y => y && !Store.loadYears.has(y) && Store.archiveYears.has(y));
    if (!need.length) return false;
    for (const y of need) Store.loadYears.add(y);
    await Store.sync();
    return true;
  },
  /* after a file of mine is rewritten by an admin tool: my records from that file are replaced, the others kept */
  ownFromFile(fname, recs) {
    const me = App.me;
    if (Store.fileOwner(fname) !== me) return;
    for (const [id, r] of Object.entries(Store.own)) if (Store.fileFor(r, me) === fname) delete Store.own[id];
    for (const r of recs) if (r && r.id) Store.own[r.id] = r;
  },
  /* my records that sit in the wrong file (an older version kept everything in one file; a year ended): move them */
  misplaced() {
    const me = App.me;
    if (!me) return 0;
    let n = 0;
    for (const [k, s] of Object.entries(Store.sources)) {
      if (!k.startsWith('u:') || Store.fileOwner(k.slice(2)) !== me) continue;
      for (const r of Object.values(s.records || {}))
        if (r && r.id && Store.fileFor(r, me) !== k.slice(2) && !Store.pending[r.id]) {
          Store.pending[r.id] = Store.own[r.id] || r;
          Store._moveFrom.add(k.slice(2));
          n++;
        }
    }
    if (n) Store.dirty = true;
    return n;
  },
  _moveFrom: new Set(),
  stats: {}, // timings for System Check → Speed
});

/* Fast opening: this PC keeps a copy of what it last read from the shared folder (browser storage, per folder).
 * At start the app shows that copy at once, then reads only the files that changed since — usually a few. */
Object.assign(Store, {
  snapKey() {
    return 'snap:' + (Store.folderName || '') + ':' + Config.DATA_FOLDER;
  },
  async useSnapshot() {
    try {
      const s = await IDB.get(Store.snapKey());
      if (!s || !s.sources || s.app !== APP_VERSION) return false; // a new version reads everything fresh once
      Store.sources = s.sources;
      for (const y of s.archiveYears || []) Store.archiveYears.add(y);
      Store.rebuild();
      return true;
    } catch (e) {
      return false;
    }
  },
  saveSnapshotSoon() {
    clearTimeout(Store._snapT);
    Store._snapT = setTimeout(() => {
      if (!App.preview && Store.folderName)
        IDB.set(Store.snapKey(), { app: APP_VERSION, at: Date.now(), sources: Store.sources, archiveYears: [...Store.archiveYears] });
    }, 4000);
  },
});
