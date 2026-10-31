// 取り込みパック（PC で作ったサークル・商品・音源・ジャケット・デモ映像のまとめ）を、今のデータに足し込む。
// 売上・会計・イベントの設定は変えない（新しい商品を今のイベントで「売る」にし、新しい動画を今のイベントに足すだけ）。
import { h, nav, uid, toast, pickFiles, modal } from './ui.js';
import { state, save, setting, setSetting, addBlob, removeBlob, currentEvent } from './store.js';
import { readZip } from './zip.js';
import { variantTitle } from './logic.js';

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

  // 取り込むものをチェックボックスで選ぶ（最初は全部選んだ状態）
  const entries = [];
  (pack.circles || []).forEach(c => {
    const circle = state.circles.find(x => x.name === c.name);
    if (c.logo) entries.push({ item: c, checked: true, label: `${circle?.logoBlobId ? '更新' : '追加'}：サークル「${c.name}」のロゴ` });
    for (const p of c.products || []) {
      const exists = circle && state.products.some(x => x.circleId === circle.id && x.title === p.title);
      const extra = [p.tracks?.length ? `${p.tracks.length} 曲` : '', ...(p.variants || []).map(v => `${v.label}あり`)].filter(Boolean).join('・');
      entries.push({ item: p, checked: true, label: `${exists ? '更新' : '追加'}：${c.name}「${p.title}」${extra ? `（${extra}）` : ''}` });
    }
  });
  const library = setting('videos', []);
  for (const v of pack.videos || []) {
    const dup = library.some(x => x.name === v.name);
    entries.push({ item: v, checked: !dup, disabled: dup, label: `${dup ? '同じ名前があるので飛ばす' : '追加'}：デモ映像「${v.name}」` });
  }
  const ev = currentEvent();
  const boxes = entries.map(e => h('input', { type: 'checkbox', checked: e.checked, disabled: e.disabled, onchange: x => (e.checked = x.target.checked) }));
  const setAll = on => entries.forEach((e, i) => { if (!e.disabled) boxes[i].checked = e.checked = on; });

  modal('取り込みパックを読み込む', h('div', {},
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', onclick: () => setAll(true) }, 'すべて選ぶ'),
      h('button', { class: 'btn small', onclick: () => setAll(false) }, 'すべて外す')),
    h('div', { class: 'pack-list' }, entries.map((e, i) => h('label', { class: 'check' }, boxes[i], e.label))),
    h('p', { class: 'muted' }, 'チェックを入れたものだけ取り込みます。「更新」の商品は、パックに入っているジャケット・曲・価格・備考で置き換えます。売上の記録は変わりません。'),
    ev ? h('p', { class: 'muted' }, `新しい商品と動画は、今のイベント「${ev.name}」でも使う設定にします。`) : null), [
    { label: 'やめる' },
    { label: '取り込む', primary: true, onClick: async () => {
      const chosen = new Set(entries.filter(e => e.checked && !e.disabled).map(e => e.item));
      if (!chosen.size) { toast('取り込むものを選んでください'); return false; }
      toast('取り込んでいます…', 60000);
      try {
        await applyPack(pack, files, ev, chosen);
        toast('取り込みました');
      } catch (e) {
        toast(`途中で止まりました：${e.message}`, 6000);
      }
      nav.render();
    } },
  ]);
}

// 別媒体（DL 版など）を足す・価格を直す。パックにない別媒体は消さない。
// 以前のパックで「○○（DL版）」を別の商品として入れていた場合は、それを別媒体に切り替える。
async function applyVariant(parent, v, ev) {
  const title = variantTitle(parent.title, v.label);
  const old = state.products.find(x => x.variantOf === parent.id && x.variantLabel === v.label)
    || state.products.find(x => !x.variantOf && x.circleId === parent.circleId && x.title === title);
  const product = old ? structuredClone(old) : {
    id: uid(), kind: 'goods', notes: '', coverBlobId: null, tracks: [], createdAt: new Date().toISOString(),
  };
  const dropped = [product.coverBlobId, ...product.tracks.map(t => t.blobId)];
  Object.assign(product, { circleId: parent.circleId, kind: 'goods', title, variantOf: parent.id, variantLabel: v.label, coverBlobId: null, tracks: [] });
  if (Number.isInteger(v.price)) product.price = v.price;
  else product.price ??= 0;
  await save('products', product);
  for (const id of dropped) await removeBlob(id);
  if (ev && !ev.items[product.id]?.selling) ev.items[product.id] = { ...ev.items[product.id], selling: true };
}

async function blobOf(files, path) {
  const part = files.get(path);
  if (!part) throw new Error(`パックの中に ${path} がありません`);
  const name = path.split('/').pop();
  const type = MIME[name.split('.').pop().toLowerCase()] || '';
  return addBlob(new File([part], name, { type }));
}

// chosen：取り込むと選ばれた商品・動画（pack の中のオブジェクト）
async function applyPack(pack, files, ev, chosen) {
  const now = () => new Date().toISOString();
  for (const c of pack.circles || []) {
    if (!chosen.has(c) && !(c.products || []).some(p => chosen.has(p))) continue;
    let circle = state.circles.find(x => x.name === c.name);
    if (!circle) {
      circle = { id: uid(), name: c.name, createdAt: now() };
      await save('circles', circle);
    }
    if (c.logo && chosen.has(c)) {
      const old = circle.logoBlobId;
      circle = { ...circle, logoBlobId: await blobOf(files, c.logo) };
      await save('circles', circle);
      await removeBlob(old);
    }
    for (const p of c.products || []) {
      if (!chosen.has(p)) continue;
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
      if (typeof p.mediaLabel === 'string') product.mediaLabel = p.mediaLabel;
      await save('products', product);
      for (const id of dropped) await removeBlob(id);
      if (ev && !ev.items[product.id]?.selling) ev.items[product.id] = { ...ev.items[product.id], selling: true };
      for (const v of p.variants || []) await applyVariant(product, v, ev);
    }
  }
  const library = [...setting('videos', [])];
  for (const v of pack.videos || []) {
    if (!chosen.has(v) || library.some(x => x.name === v.name)) continue;
    const video = { id: uid(), name: v.name, blobId: await blobOf(files, v.file) };
    library.push(video);
    if (ev) ev.demoVideoIds = [...ev.demoVideoIds, video.id];
  }
  await setSetting('videos', library);
  if (ev) await save('events', ev);
}
