/* MAHAM — Virtual folder.
 * The app reads and writes through folder / file handles (the browser's File System Access API). This file gives it
 * the same kind of handles over any storage "backend", so the app runs unchanged on a phone (this device) or on an
 * online database. Only what the app uses is implemented: getDirectoryHandle, getFileHandle, entries, values,
 * removeEntry, getFile, createWritable, queryPermission, requestPermission.
 *
 * A backend has five async methods (paths use "/" and are relative to the root, e.g. "MAHAM Data/users/ana.json"):
 *   list(dir)            → [{ name, kind: 'file' | 'directory', size, mtime }]   direct children only
 *   read(path)           → { data: string | Blob, size, mtime }  or null when missing
 *   write(path, data)    → { size, mtime }                         data is a string or a Blob
 *   remove(path)         → void
 *   mkdir(dir) / hasDir(dir) → void / boolean
 */
'use strict';

const VFS = {
  notFound(path) {
    const e = new Error('Not found: ' + path);
    e.name = 'NotFoundError';
    return e;
  },
  join(dir, name) {
    return dir ? dir + '/' + name : name;
  },
  root(backend, name) {
    return new VFS.Dir(backend, '', name || 'MAHAM');
  },
};

VFS.Dir = class {
  constructor(backend, path, name) {
    this.backend = backend;
    this.path = path;
    this.name = name;
    this.kind = 'directory';
  }
  async queryPermission() {
    return 'granted';
  }
  async requestPermission() {
    return 'granted';
  }
  async isSameEntry(other) {
    return !!other && other.kind === 'directory' && other.path === this.path;
  }
  async getDirectoryHandle(name, opts = {}) {
    const p = VFS.join(this.path, name);
    if (!(await this.backend.hasDir(p))) {
      if (!opts.create) throw VFS.notFound(p);
      await this.backend.mkdir(p);
    }
    return new VFS.Dir(this.backend, p, name);
  }
  async getFileHandle(name, opts = {}) {
    const p = VFS.join(this.path, name);
    const fh = new VFS.File(this.backend, p, name);
    if (!(await fh.exists())) {
      if (!opts.create) throw VFS.notFound(p);
      await this.backend.write(p, '');
    }
    return fh;
  }
  async removeEntry(name) {
    await this.backend.remove(VFS.join(this.path, name));
  }
  async *entries() {
    for (const x of await this.backend.list(this.path)) {
      const p = VFS.join(this.path, x.name);
      yield [x.name, x.kind === 'directory' ? new VFS.Dir(this.backend, p, x.name) : new VFS.File(this.backend, p, x.name, x)];
    }
  }
  async *values() {
    for await (const [, h] of this.entries()) yield h;
  }
  async *keys() {
    for await (const [n] of this.entries()) yield n;
  }
};

VFS.File = class {
  constructor(backend, path, name, meta) {
    this.backend = backend;
    this.path = path;
    this.name = name;
    this.kind = 'file';
    this.meta = meta || null;
  }
  async exists() {
    return !!(await this.backend.read(this.path, { head: true }));
  }
  async isSameEntry(other) {
    return !!other && other.kind === 'file' && other.path === this.path;
  }
  async getFile() {
    const r = await this.backend.read(this.path);
    if (!r) throw VFS.notFound(this.path);
    return new File([r.data], this.name, {
      lastModified: r.mtime || Date.now(),
      type: /\.json$/i.test(this.name) ? 'application/json' : '',
    });
  }
  async createWritable() {
    const parts = [];
    const self = this;
    return {
      async write(chunk) {
        parts.push(chunk && chunk.type === 'write' ? chunk.data : chunk);
      },
      async truncate() {
        parts.length = 0;
      },
      async abort() {
        parts.length = 0;
      },
      async close() {
        const strings = parts.every(x => typeof x === 'string');
        await self.backend.write(self.path, strings ? parts.join('') : new Blob(parts));
      },
    };
  }
};

/* This device: everything in the browser's own database (IndexedDB). Used on phones and when there is no shared folder. */
const DeviceBackend = {
  DB: 'maham-device',
  STORE: 'files',
  _db: null,
  open() {
    if (DeviceBackend._db) return DeviceBackend._db;
    DeviceBackend._db = new Promise((res, rej) => {
      const r = indexedDB.open(DeviceBackend.DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(DeviceBackend.STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return DeviceBackend._db;
  },
  async tx(mode, fn) {
    const db = await DeviceBackend.open();
    return new Promise((res, rej) => {
      const t = db.transaction(DeviceBackend.STORE, mode);
      const out = fn(t.objectStore(DeviceBackend.STORE));
      t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
      t.onerror = () => rej(t.error);
    });
  },
  async all() {
    const db = await DeviceBackend.open();
    return new Promise((res, rej) => {
      const out = [];
      const c = db.transaction(DeviceBackend.STORE).objectStore(DeviceBackend.STORE).openCursor();
      c.onsuccess = () => {
        const cur = c.result;
        if (!cur) return res(out);
        out.push([cur.key, cur.value]);
        cur.continue();
      };
      c.onerror = () => rej(c.error);
    });
  },
  async list(dir) {
    const pre = dir ? dir + '/' : '';
    const seen = new Map();
    for (const [k, v] of await DeviceBackend.all()) {
      if (!k.startsWith(pre) || k === dir) continue;
      const rest = k.slice(pre.length);
      const i = rest.indexOf('/');
      if (i < 0)
        seen.set(
          rest,
          v.kind === 'directory' ? { name: rest, kind: 'directory' } : { name: rest, kind: 'file', size: v.size, mtime: v.mtime }
        );
      else if (!seen.has(rest.slice(0, i))) seen.set(rest.slice(0, i), { name: rest.slice(0, i), kind: 'directory' });
    }
    return [...seen.values()];
  },
  async read(path) {
    const v = await DeviceBackend.tx('readonly', s => s.get(path));
    return v && v.kind === 'file' ? v : null;
  },
  async write(path, data) {
    const size = typeof data === 'string' ? new Blob([data]).size : data.size;
    const v = { kind: 'file', data, size, mtime: Date.now() };
    await DeviceBackend.tx('readwrite', s => s.put(v, path));
    return { size, mtime: v.mtime };
  },
  async remove(path) {
    await DeviceBackend.tx('readwrite', s => s.delete(path));
  },
  async mkdir(dir) {
    await DeviceBackend.tx('readwrite', s => s.put({ kind: 'directory' }, dir));
  },
  async hasDir(dir) {
    const v = await DeviceBackend.tx('readonly', s => s.get(dir));
    if (v && v.kind === 'directory') return true;
    return (await DeviceBackend.list(dir)).length > 0;
  },
};
