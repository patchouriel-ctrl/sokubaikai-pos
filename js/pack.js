// 取り込みパック（PC で作ったサークル・商品・音源・ジャケット・デモ映像のまとめ）を、今のデータに足し込む。
// 売上・会計・イベントの設定は変えない（新しい商品を今のイベントで「売る」にし、新しい動画を今のイベントに足すだけ）。
import { h, nav, uid, toast, pickFiles, modal } from './ui.js';
import { state, save, setting, setSetting, addBlob, removeBlob, currentEvent } from './store.js';
import { readZip } from './zip.js';

const PACK_FORMAT = 'sokubaikai-pos-pack';
const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
};

export async function importPack() {
  const [file] = await pickFiles('.zip,application/zip');
  if (!file) return;
  let pack, files;
  try {
    files = await readZip(file);
    if (!files.has('pack.json')) throw new Error('取り込みパックではありません');
    pack = JSON.parse(await files.get('pack.json').text());
    if (pack.format !== PACK_FORMAT) throw new Error('取り込みパックではありません');
  } catch (e) {
    alert(`読み込めませんでした：${e.message}`);
    return;
  }

  const lines = [];
  for (const c of pack.circles || []) {
    const circle = state.circles.find(x => x.name === c.name);
    for (const p of c.products || []) {
      const exists = circle && state.products.some(x => x.circleId === circle.id && x.title === p.title);
      lines.push(`${exists ? '更新' : '追加'}：${c.name}「${p.title}」${p.tracks?.length ? `（${p.tracks.length} 曲）` : ''}`);
    }
  }
  const library = setting('videos', []);
  for (const v of pack.videos || []) lines.push(`${library.some(x => x.name === v.name) ? '同じ名前があるので飛ばす' : '追加'}：デモ映像「${v.name}」`);
  const ev = currentEvent();

  modal('取り込みパックを読み込む', h('div', {},
    h('ul', { class: 'pack-list' }, lines.map(l => h('li', {}, l))),
    h('p', { class: 'muted' }, '「更新」の商品は、パックに入っているジャケット・曲・価格・備考で置き換えます。売上の記録は変わりません。'),
    ev ? h('p', { class: 'muted' }, `新しい商品と動画は、今のイベント「${ev.name}」でも使う設定にします。`) : null), [
    { label: 'やめる' },
    { label: '取り込む', primary: true, onClick: async () => {
      toast('取り込んでいます…', 60000);
      try {
        await applyPack(pack, files, ev);
        toast('取り込みました');
      } catch (e) {
        toast(`途中で止まりました：${e.message}`, 6000);
      }
      nav.render();
    } },
  ]);
}

async function blobOf(files, path) {
  const part = files.get(path);
  if (!part) throw new Error(`パックの中に ${path} がありません`);
  const name = path.split('/').pop();
  const type = MIME[name.split('.').pop().toLowerCase()] || '';
  return addBlob(new File([part], name, { type }));
}

async function applyPack(pack, files, ev) {
  const now = () => new Date().toISOString();
  for (const c of pack.circles || []) {
    let circle = state.circles.find(x => x.name === c.name);
    if (!circle) {
      circle = { id: uid(), name: c.name, createdAt: now() };
      await save('circles', circle);
    }
    for (const p of c.products || []) {
      const old = state.products.find(x => x.circleId === circle.id && x.title === p.title);
      const product = old ? structuredClone(old) : {
        id: uid(), circleId: circle.id, kind: 'cd', title: p.title, price: 0, notes: '', coverBlobId: null, tracks: [], createdAt: now(),
      };
      const dropped = [];
      if (p.kind) product.kind = p.kind;
      if (Number.isInteger(p.price)) product.price = p.price;
      if (typeof p.notes === 'string') product.notes = p.notes;
      if (p.cover) {
        dropped.push(product.coverBlobId);
        product.coverBlobId = await blobOf(files, p.cover);
      }
      if (p.tracks) {
        dropped.push(...product.tracks.map(t => t.blobId));
        product.tracks = [];
        for (const t of p.tracks) product.tracks.push({ id: uid(), title: t.title, blobId: await blobOf(files, t.file) });
      }
      await save('products', product);
      for (const id of dropped) await removeBlob(id);
      if (ev && !ev.items[product.id]?.selling) ev.items[product.id] = { ...ev.items[product.id], selling: true };
    }
  }
  const library = [...setting('videos', [])];
  for (const v of pack.videos || []) {
    if (library.some(x => x.name === v.name)) continue;
    const video = { id: uid(), name: v.name, blobId: await blobOf(files, v.file) };
    library.push(video);
    if (ev) ev.demoVideoIds = [...ev.demoVideoIds, video.id];
  }
  await setSetting('videos', library);
  if (ev) await save('events', ev);
}
