// IndexedDB の薄いラッパー。データはすべてこの端末の中だけに保存する。
const DB_NAME = 'sokubaikai-pos';
const VERSION = 1;
export const STORES = ['circles', 'products', 'events', 'sales', 'blobs', 'settings'];

let opening = null;
function open() {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, VERSION);
      r.onupgradeneeded = () => {
        for (const s of STORES) {
          if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' });
        }
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return opening;
}

function done(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function result(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const db = {
  async all(store) {
    const d = await open();
    return result(d.transaction(store).objectStore(store).getAll());
  },
  async get(store, id) {
    const d = await open();
    return result(d.transaction(store).objectStore(store).get(id));
  },
  async put(store, obj) {
    const d = await open();
    const t = d.transaction(store, 'readwrite');
    t.objectStore(store).put(obj);
    return done(t);
  },
  async putMany(store, list) {
    const d = await open();
    const t = d.transaction(store, 'readwrite');
    for (const obj of list) t.objectStore(store).put(obj);
    return done(t);
  },
  async del(store, id) {
    const d = await open();
    const t = d.transaction(store, 'readwrite');
    t.objectStore(store).delete(id);
    return done(t);
  },
  async clearAll() {
    const d = await open();
    const t = d.transaction(STORES, 'readwrite');
    for (const s of STORES) t.objectStore(s).clear();
    return done(t);
  },
};
