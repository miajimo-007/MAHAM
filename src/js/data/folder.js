/* DARRIK — Connecting to the shared folder (File System Access API) and remembering it between visits. */
'use strict';

Object.assign(Store, {
  supported() {
    return 'showDirectoryPicker' in window;
  },
  async tryRestore() {
    const h = await IDB.get('rootHandle');
    if (!h) return 'none';
    try {
      const p = await h.queryPermission({ mode: 'readwrite' });
      Store._pending = h;
      if (p === 'granted') {
        await Store.useRoot(h);
        return 'ok';
      }
      return 'needs-permission';
    } catch (e) {
      return 'none';
    }
  },
  async grantPending() {
    const h = Store._pending;
    if (!h) return false;
    const p = await h.requestPermission({ mode: 'readwrite' });
    if (p !== 'granted') return false;
    await Store.useRoot(h);
    return true;
  },
  async pick() {
    const h = await window.showDirectoryPicker({ id: 'ehr-team', mode: 'readwrite' });
    await Store.useHandle(h);
  },
  /* make sure we may WRITE before using a folder; otherwise ask for a separate click */
  async useHandle(h) {
    let p = 'prompt';
    try {
      p = await h.queryPermission({ mode: 'readwrite' });
    } catch (e) {
      /* */
    }
    if (p !== 'granted') {
      try {
        p = await h.requestPermission({ mode: 'readwrite' });
      } catch (e) {
        p = 'needs-click';
      }
    }
    if (p !== 'granted') {
      Store._pending = h;
      await IDB.set('rootHandle', h);
      const e = new Error(p === 'denied' ? 'WRITE_DENIED' : 'NEEDS_CLICK');
      e.name = 'WriteError';
      throw e;
    }
    await Store.useRoot(h);
    await IDB.set('rootHandle', h);
  },
  async grantWrite() {
    const h = Store._pending;
    if (!h) throw new Error('Choose the folder first');
    const p = await h.requestPermission({ mode: 'readwrite' });
    if (p !== 'granted') {
      const e = new Error('WRITE_DENIED');
      e.name = 'WriteError';
      throw e;
    }
    await Store.useRoot(h);
    await IDB.set('rootHandle', h);
  },
  async useRoot(h) {
    // Accept either the app folder (containing /data) or the data folder itself.
    // Any folder works: the app keeps its data in a "DARRIK Data" subfolder (created automatically).
    let dataDir = null;
    if (/^(data|ehr team data)$/i.test(h.name)) dataDir = h;
    if (!dataDir) {
      try {
        dataDir = await h.getDirectoryHandle('data');
      } catch (e) {
        /* */
      }
    }
    if (!dataDir) {
      try {
        await h.getFileHandle('seed.json');
        dataDir = h;
      } catch (e) {
        /* */
      }
    }
    if (!dataDir) dataDir = await h.getDirectoryHandle(Config.DATA_FOLDER, { create: true });
    Store.root = h;
    Store.dataDir = dataDir;
    Store.usersDir = await dataDir.getDirectoryHandle(Config.USERS_FOLDER, { create: true });
    Store.folderName = h.name;
  },
  /* Where the shared folder is. Browsers never tell a page the full path of a folder it was given, so:
   * 1. the path the super admin typed in Admin → Teams & departments (settings-features.sharedPath), else
   * 2. worked out from where this .html was opened, when it was opened from inside the shared folder, else
   * 3. the last path this PC knew. */
  filePath() {
    try {
      if (location.protocol !== 'file:') return '';
      let p = decodeURIComponent(location.pathname);
      if (location.host) p = '//' + location.host + p;
      return p.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\');
    } catch (e) {
      return '';
    }
  },
  detectedPath() {
    const f = Store.filePath();
    if (!f) return '';
    const dir = f.replace(/\\[^\\]*$/, '');
    const last = dir.split('\\').pop();
    return Store.folderName && U.lc(last) === U.lc(Store.folderName) ? dir : '';
  },
  sharedPath() {
    return (
      (Store.get && Store.setting('settings-features', 'sharedPath', '')) || Store.detectedPath() || LS.get('bct.sharedPath', '') || ''
    );
  },
  /* full paths of the app folder, the data folder, everyone's files, backups and my own file */
  paths() {
    const base = Store.sharedPath() || Store.folderName || 'shared folder';
    const data = Store.dataDir && Store.root && Store.dataDir !== Store.root ? base + '\\' + Store.dataDir.name : base;
    const users = data + '\\' + Config.USERS_FOLDER;
    return {
      folder: base,
      data,
      users,
      backups: data + '\\' + Config.BACKUP_FOLDER,
      mine: App.me ? users + '\\' + App.me + '.json' : '',
      full: !!Store.sharedPath(),
    };
  },
  async readJSON(dir, name) {
    const fh = await dir.getFileHandle(name);
    const f = await fh.getFile();
    return { file: f, json: JSON.parse(await f.text()) };
  },
});
