/* MAHAM Lab — core: opens the real shared folder and reads it with MAHAM's own data code (same merge + trust
 * rules, so it sees exactly what MAHAM shows). It can NEVER change anything there — three locks:
 *   1. the folder is opened with READ permission only, so the browser itself refuses any write
 *   2. the folder handed to MAHAM's code is wrapped read-only (no file can be created, written or removed)
 *   3. MAHAM's saving is switched off (save, flush, snapshots, backups, usage)
 * The Lab's own things (settings, feedback, trained models, snapshots) are kept in THIS browser, not in the folder;
 * every result can be downloaded as Excel. */
'use strict';

const LAB_VERSION = '2026.11.07-lab.8';

/* ---------- 1. MAHAM's writing switched off ---------- */
(() => {
  const none = () => {};
  Store.saveMany = () => { console.warn('MAHAM Lab is read-only — nothing saved'); };
  Store.save = rec => rec;
  Store.flush = async () => false;
  Store.flushSoon = none;
  Store.writeUser = async () => { throw new Error('read-only'); };
  Store.saveSnapshotSoon = none;
  Store.useSnapshot = async () => false;
  if (typeof Admin !== 'undefined') { Admin.flushUsage = none; Admin.track = none; Admin.tick = none; Admin.fn = none; Admin.trackSave = none; Admin.todoMark = none; }
  App.render = none; App.launch = none; App.renderSync = none; App.preview = false;
  for (const k of Object.keys(Store)) if (/^(backup|makeBackup|writeBackup|autoBackup|daily)/i.test(k) && typeof Store[k] === 'function') Store[k] = async () => false;
})();

/* ---------- 2. a read-only view of a folder (what MAHAM's reading code gets) ---------- */
const RO = {
  file(h) {
    return { kind: 'file', name: h.name, getFile: () => h.getFile(), createWritable: async () => { throw new Error('MAHAM Lab is read-only'); }, isSameEntry: x => h.isSameEntry(x._raw || x), _raw: h };
  },
  dir(h) {
    return {
      kind: 'directory', name: h.name, _raw: h,
      async getDirectoryHandle(n) { return RO.dir(await h.getDirectoryHandle(n)); },   // never created
      async getFileHandle(n) { return RO.file(await h.getFileHandle(n)); },
      async removeEntry() { throw new Error('MAHAM Lab is read-only'); },
      async *entries() { for await (const [n, x] of h.entries()) yield [n, x.kind === 'file' ? RO.file(x) : RO.dir(x)]; },
      async *values() { for await (const x of h.values()) yield x.kind === 'file' ? RO.file(x) : RO.dir(x); },
      async queryPermission() { return 'granted'; }, async requestPermission() { return 'granted'; },
    };
  },
};

/* ---------- 3. the Lab's own folder + settings ---------- */
const Lab = {
  root: null, dataDir: null, loadedAt: 0, me: '',
  HANDLE_KEY: 'mahamLabRootHandle',
  /* the folder: the Lab's own remembered one, else the one MAHAM remembers on this PC (same shared folder) */
  async restore() {
    const h = (await IDB.get(Lab.HANDLE_KEY)) || (await IDB.get('rootHandle')); if (!h) return 'none';
    Lab._pending = h;
    try { const p = await h.queryPermission({ mode: 'read' }); return p === 'granted' ? (await Lab.use(h), 'ok') : 'needs-permission'; } catch (e) { return 'needs-permission'; }
  },
  async grant() { const h = Lab._pending; if (!h) return false; const p = await h.requestPermission({ mode: 'read' }); if (p !== 'granted') return false; await Lab.use(h); await IDB.set(Lab.HANDLE_KEY, h); return true; },
  async pick() { const h = await window.showDirectoryPicker({ id: 'maham-lab', mode: 'read' }); await Lab.use(h); await IDB.set(Lab.HANDLE_KEY, h); },
  async use(h) {
    let dataDir = null;
    if (/^ehr team data$/i.test(h.name)) dataDir = h;
    if (!dataDir) try { dataDir = await h.getDirectoryHandle(Config.DATA_FOLDER); } catch (e) { /* */ }
    if (!dataDir) try { await h.getDirectoryHandle('users'); dataDir = h; } catch (e) { /* */ }
    if (!dataDir) throw new Error(`No "${Config.DATA_FOLDER}" folder found here. Choose the shared folder (the one with MAHAM.html in it).`);
    let users; try { users = await dataDir.getDirectoryHandle(Config.USERS_FOLDER); } catch (e) { throw new Error('This folder has no "users" folder — is it the MAHAM shared folder?'); }
    Lab.root = h; Lab.dataDir = dataDir;
    // MAHAM's reading code gets the read-only view
    Store.root = RO.dir(h); Store.dataDir = RO.dir(dataDir); Store.usersDir = RO.dir(users); Store.folderName = h.name;
  },
  /* load everything (all teams; this year and the two before) with MAHAM's own merge and trust check */
  async load() {
    App.viewTeam = '*'; const y = new Date().getFullYear(); for (const k of [y - 1, y - 2]) Store.loadYears.add(k);
    Store.sources = {}; Store.own = {}; Store.pending = {};
    const me = App.me; App.me = null;   // read as nobody: MAHAM's "tidy my own files" step never runs
    try { await Store.sync(true); } finally { App.me = me; }
    Lab.loadedAt = Date.now(); Calc.invalidate && Calc.invalidate(); LabData.reset(); if (typeof LabCache !== 'undefined') LabCache.clear();
  },
  /* ---------- the Lab's own things: kept in this browser (IndexedDB), never in the shared folder ---------- */
  async read(name, dflt) { const v = await IDB.get('maham.lab.' + name); return v === undefined || v === null ? dflt : v; },
  async write(name, obj) { await IDB.set('maham.lab.' + name, JSON.parse(JSON.stringify(obj))); return true; },
  /* a full copy of the Lab's own things (to move to another PC) */
  async exportAll() { const out = {}; for (const n of ['settings.json', 'feedback.json', 'models.json', 'snapshots.json']) out[n] = await Lab.read(n, null); return out; },
  async importAll(o) { for (const [n, v] of Object.entries(o || {})) if (v != null) await Lab.write(n, v); },
  /* ---------- settings (cleaning, weights, costs) ---------- */
  DEFAULTS: {
    months: 6, team: '',
    synonyms: 'order set, ordersets, orderset, os = orderset\nmar, medication administration, med admin = mar\nprint, printing, printer, printed, reprint, reprinting = print\nlabel, labels, labelling, labeling = label\nlogin, log in, logon, sign in, signin, password = login\nreport, reports, reporting = report\nslow, slowness, hang, hanging, freeze, frozen, stuck = slow\nerror, errors, err = error\nform, forms = form\nresult, results = result\norder, orders, ordering = order',
    ignore: 'please, kindly, request, issue, issues, problem, problems, help, need, needs, regarding, re, fw, fwd, urgent, asap, dear, team, thanks, thank, hi, hello, check, system, ehr, user, users, not, unable, cannot, cant, able, new, also, still, want, would, could, via, per, due',
    qwTarget: 24, hdHours: 0.5, todoHours: 2, catchHours: 0.5, oncallHours: 1, taskHours: 0.25, fixShare: 0.7, minTheme: 3, simThreshold: 0.45,
  },
  settings: null,
  async loadSettings() { Lab.settings = Object.assign({}, Lab.DEFAULTS, await Lab.read('settings.json', {})); return Lab.settings; },
  async saveSettings(patch) { Object.assign(Lab.settings, patch); await Lab.write('settings.json', Lab.settings); LabText.reset(); LabData.reset(); },
  /* ---------- the super admin's PIN ---------- */
  supers() { return Store.members().filter(m => m.superAdmin && m.active !== false); },
  /* who may open the Lab: the super admin, and anyone given "Open the MAHAM Lab" in MAHAM (Admin → Permissions) */
  allowed(id) { const m = Store.member(id); return !!m && m.active !== false && (m.superAdmin || Store.can(id, 'useLab')); },
  people() { return Store.members().filter(m => Lab.allowed(m.id)).sort((a, b) => (b.superAdmin ? 1 : 0) - (a.superAdmin ? 1 : 0) || a.name.localeCompare(b.name)); },
  async checkPin(id, pin) { const want = App.pinFor(id); if (!want) return 'nopin'; return (await App.verifyPin(pin, want)) ? 'ok' : 'bad'; },
};
