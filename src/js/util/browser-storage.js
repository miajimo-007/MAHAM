/* DARRIK — Browser-local storage: IndexedDB (remembers the chosen folder) and localStorage (per-PC preferences, unsaved-change backup). */
'use strict';

/* ---------------- IndexedDB (remember the folder handle) ---------------- */
const IDB = {
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('ehr-team', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async get(k) {
    try {
      const db = await IDB.open();
      return await new Promise(res => {
        const t = db.transaction('kv').objectStore('kv').get(k);
        t.onsuccess = () => res(t.result);
        t.onerror = () => res(null);
      });
    } catch (e) {
      return null;
    }
  },
  async set(k, v) {
    try {
      const db = await IDB.open();
      await new Promise(res => {
        const t = db.transaction('kv', 'readwrite');
        t.objectStore('kv').put(v, k);
        t.oncomplete = res;
        t.onerror = res;
      });
    } catch (e) {
      /* ignore */
    }
  },
};

const LS = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {
      /* ignore */
    }
  },
};
