// 読み込んだデータを手元に持ち、保存も受け持つ
import { db } from './db.js';
import { uid } from './ui.js';

export const state = { circles: [], products: [], events: [], sales: [], settings: {} };
const urls = new Map();

export async function load() {
  for (const k of ['circles', 'products', 'events', 'sales']) state[k] = await db.all(k);
  for (const s of await db.all('settings')) state.settings[s.id] = s.value;
  for (const b of await db.all('blobs')) urls.set(b.id, URL.createObjectURL(b.blob));
}

export const blobUrl = id => (id ? urls.get(id) || null : null);

export async function addBlob(file) {
  const id = uid();
  await db.put('blobs', { id, blob: file, name: file.name, type: file.type });
  urls.set(id, URL.createObjectURL(file));
  return id;
}

export async function removeBlob(id) {
  if (!id) return;
  await db.del('blobs', id);
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
}

export async function save(kind, obj) {
  const list = state[kind];
  const i = list.findIndex(x => x.id === obj.id);
  if (i < 0) list.push(obj);
  else list[i] = obj;
  await db.put(kind, obj);
}

export async function remove(kind, id) {
  state[kind] = state[kind].filter(x => x.id !== id);
  await db.del(kind, id);
}

export const setting = (key, fallback) => state.settings[key] ?? fallback;
export async function setSetting(key, value) {
  state.settings[key] = value;
  await db.put('settings', { id: key, value });
}

export const currentEvent = () => state.events.find(e => e.id === setting('currentEventId')) || null;
export const circleName = id => state.circles.find(c => c.id === id)?.name || '（サークルなし）';

const byCreated = (a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
export const sortedCircles = () => [...state.circles].sort(byCreated);
// 別媒体（DL 版など）は元の商品のすぐ後ろに並べる
export function sortedProducts() {
  const order = new Map(sortedCircles().map((c, i) => [c.id, i]));
  const sorted = [...state.products].sort((a, b) => (order.get(a.circleId) ?? 999) - (order.get(b.circleId) ?? 999) || byCreated(a, b));
  const ids = new Set(sorted.map(p => p.id));
  const out = [];
  for (const p of sorted) {
    if (p.variantOf && ids.has(p.variantOf)) continue;
    out.push(p, ...sorted.filter(v => v.variantOf === p.id));
  }
  return out;
}

// 別媒体はジャケットを持たず、元の商品のものを使う
export function coverIdOf(p) {
  return p.coverBlobId || (p.variantOf && state.products.find(x => x.id === p.variantOf)?.coverBlobId) || null;
}
