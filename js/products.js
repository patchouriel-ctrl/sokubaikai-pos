// サークルと商品の登録（参考コードの AdminView・AdminAlbumDetailView にあたる）
import { h, nav, yen, uid, toast, pickFiles, numField } from './ui.js';
import { state, save, remove, addBlob, removeBlob, blobUrl, setting, setSetting, currentEvent, sortedCircles, sortedProducts } from './store.js';
import { variantsOf, mediaLabelOf, variantTitle } from './logic.js';

const AUDIO_ACCEPT = '.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/aac';
const IMAGE_ACCEPT = 'image/*';

// 編集中の下書き。取り込んだファイルは保存前でも端末に入れ、やめたら消す。
let draft = null;

export function renderProducts() {
  return draft ? renderEditor() : renderList();
}

function renderList() {
  const circles = sortedCircles();
  return h('div', { class: 'page' },
    h('section', { class: 'card' },
      h('h2', {}, 'サークル'),
      circles.length ? h('div', { class: 'rows' }, circles.map(c => {
        const count = state.products.filter(p => p.circleId === c.id).length;
        return h('div', { class: 'row' },
          h('span', { class: 'thumb logo-thumb' }, blobUrl(c.logoBlobId) ? h('img', { src: blobUrl(c.logoBlobId), alt: '' }) : '—'),
          h('span', { class: 'grow' }, c.name, h('small', {}, ` 商品 ${count} 点`)),
          h('button', { class: 'btn small', onclick: () => pickCircleLogo(c) }, c.logoBlobId ? 'ロゴを変える' : 'ロゴを設定'),
          c.logoBlobId ? h('button', { class: 'btn small', onclick: () => setCircleLogo(c, null) }, 'ロゴを外す') : null,
          h('button', { class: 'btn small', onclick: () => renameCircle(c) }, '名前を変える'),
          h('button', { class: 'btn small danger', onclick: () => deleteCircle(c, count) }, '削除'));
      })) : h('p', { class: 'muted' }, 'まだサークルがありません。'),
      h('button', { class: 'btn', onclick: addCircle }, '＋ サークルを追加')),
    h('section', { class: 'card' },
      h('h2', {}, '商品'),
      h('button', { class: 'btn primary', onclick: () => openEditor(null) }, '＋ 商品を追加'),
      circles.map(c => {
        const list = sortedProducts().filter(p => p.circleId === c.id && !p.variantOf);
        if (!list.length) return null;
        return h('div', { class: 'group' },
          h('h3', {}, c.name),
          h('div', { class: 'rows' }, list.map(p =>
            h('button', { class: 'row link', onclick: () => openEditor(p) },
              thumb(blobUrl(p.coverBlobId)),
              h('span', { class: 'grow' }, p.title, h('small', {}, p.kind === 'cd' ? ` CD・${p.tracks.length} 曲` : ' CD 以外')),
              h('span', { class: 'prices' }, [p, ...variantsOf(state.products, p.id)].map(x =>
                h('span', {}, variantsOf(state.products, p.id).length ? `${mediaLabelOf(x)} ` : '', yen(x.price)))),
              h('span', { class: 'chev' }, '›')))));
      })));
}

const thumb = url => h('span', { class: 'thumb' }, url ? h('img', { src: url, alt: '' }) : '♪');

async function addCircle() {
  const name = prompt('サークル名')?.trim();
  if (!name) return;
  await save('circles', { id: uid(), name, createdAt: new Date().toISOString() });
  nav.render();
}

// サークルのロゴ。2 サークル以上を売るイベントでは、試聴画面のサークル切り替えに出る。
async function pickCircleLogo(c) {
  const [file] = await pickFiles(IMAGE_ACCEPT);
  if (file) await setCircleLogo(c, await addBlob(file));
}
async function setCircleLogo(c, blobId) {
  const old = c.logoBlobId;
  await save('circles', { ...c, logoBlobId: blobId });
  await removeBlob(old);
  nav.render();
}

async function renameCircle(c) {
  const name = prompt('新しいサークル名', c.name)?.trim();
  if (!name) return;
  await save('circles', { ...c, name });
  nav.render();
}

async function deleteCircle(c, count) {
  if (count) { alert('このサークルの商品が残っています。先に商品を削除してください。'); return; }
  if (!confirm(`サークル「${c.name}」を削除しますか？`)) return;
  await remove('circles', c.id);
  await removeBlob(c.logoBlobId);
  for (const ev of state.events) {
    delete ev.stockCircles?.[c.id];
    ev.discountRules = (ev.discountRules || []).filter(r => r.circleId !== c.id);
    await save('events', ev);
  }
  nav.render();
}

function openEditor(p) {
  if (!state.circles.length) { alert('先にサークルを追加してください。'); return; }
  draft = {
    isNew: !p,
    product: p ? structuredClone(p) : {
      id: uid(), circleId: sortedCircles()[0].id, kind: 'cd', title: '', price: 0, notes: '',
      coverBlobId: null, tracks: [], createdAt: new Date().toISOString(),
    },
    variants: p ? variantsOf(state.products, p.id).map(v => ({ id: v.id, label: v.variantLabel, price: v.price })) : [],
    newBlobs: new Set(),
    dropBlobs: new Set(),
  };
  nav.render();
}

function renderEditor() {
  const p = draft.product;
  const history = setting('titleHistory', []);
  // ボタンを含む欄を label で囲むと、周りを押したとき最初のボタンが押されてしまうので div にする
  const field = (label, input) =>
    h(['INPUT', 'SELECT'].includes(input.tagName) ? 'label' : 'div', { class: 'field' }, h('span', {}, label), input);
  return h('div', { class: 'page' },
    h('section', { class: 'card' },
      h('h2', {}, draft.isNew ? '商品の登録' : '商品の情報と曲'),
      field('サークル', h('select', { value: p.circleId, onchange: e => (p.circleId = e.target.value) },
        sortedCircles().map(c => h('option', { value: c.id }, c.name)))),
      field('種類', h('div', { class: 'seg' },
        [['cd', 'CD（試聴あり）'], ['goods', 'CD 以外（会計のみ）']].map(([k, label]) =>
          h('button', { class: 'seg-btn' + (p.kind === k ? ' on' : ''), onclick: () => { p.kind = k; nav.render(); } }, label)))),
      field('タイトル', h('input', { type: 'text', value: p.title, list: 'title-history', placeholder: 'アルバム・商品の名前', oninput: e => (p.title = e.target.value) })),
      h('datalist', { id: 'title-history' }, history.map(t => h('option', { value: t }))),
      field('通常価格（円）', numField({ title: '通常価格（円）', unit: '円', cls: '', value: p.price, onchange: v => (p.price = v) })),
      field('備考・補足', h('input', { type: 'text', value: p.notes, placeholder: '例：新刊セットあり／イベント限定', oninput: e => (p.notes = e.target.value) })),
      field('ジャケット画像', h('div', { class: 'cover-edit' },
        thumb(blobUrl(p.coverBlobId)),
        h('button', { class: 'btn small', onclick: pickCover }, '画像を選ぶ（Google ドライブ対応）'),
        p.coverBlobId ? h('button', { class: 'btn small danger', onclick: () => { dropBlob(p.coverBlobId); p.coverBlobId = null; nav.render(); } }, '外す') : null))),
    p.kind === 'cd' ? h('section', { class: 'card' },
      h('h2', {}, `収録曲（${p.tracks.length} 曲）`),
      h('button', { class: 'btn', onclick: addTracks }, '＋ 音源を選ぶ（複数可・Google ドライブ対応）'),
      h('p', { class: 'muted' }, 'MP3・WAV・M4A。ファイル名がそのまま曲名になり、ファイル名の順に並びます。曲名はあとで直せます。'),
      h('div', { class: 'rows' }, p.tracks.map((t, i) =>
        h('div', { class: 'row' },
          h('span', { class: 'num' }, i + 1),
          h('input', { type: 'text', class: 'grow', value: t.title, oninput: e => (t.title = e.target.value) }),
          h('button', { class: 'btn small', disabled: i === 0, onclick: () => moveTrack(i, -1) }, '↑'),
          h('button', { class: 'btn small', disabled: i === p.tracks.length - 1, onclick: () => moveTrack(i, 1) }, '↓'),
          h('button', { class: 'btn small danger', onclick: () => { dropBlob(t.blobId); p.tracks.splice(i, 1); nav.render(); } }, '削除'))))) : null,
    p.kind === 'cd' ? renderVariants(p) : null,
    h('div', { class: 'actions' },
      draft.isNew ? null : h('button', { class: 'btn danger', onclick: deleteProduct }, 'この商品を削除'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: cancel }, 'やめる'),
      h('button', { class: 'btn primary', onclick: commit }, draft.isNew ? '登録する' : '保存する')));
}

// 内容は同じで価格だけ違う媒体（DL 版など）。試聴画面では 1 枚にまとめ、会計では別のボタンになる。
function renderVariants(p) {
  const vs = draft.variants;
  return h('section', { class: 'card' },
    h('h2', {}, 'ほかの媒体（内容は同じで価格が違うもの）'),
    h('p', { class: 'muted' }, '例：DL 版。試聴画面ではこのアルバムにまとめて価格を並べ、会計では別のボタンになります。在庫・イベント価格・売上は媒体ごとです。'),
    vs.length ? h('label', { class: 'field' }, h('span', {}, 'この商品自体の媒体名'),
      h('input', { type: 'text', value: p.mediaLabel || 'CD', oninput: e => (p.mediaLabel = e.target.value.trim()) })) : null,
    h('div', { class: 'rows' }, vs.map((v, i) =>
      h('div', { class: 'row' },
        h('input', { type: 'text', class: 'grow', value: v.label, placeholder: '媒体名（例：DL版）', oninput: e => (v.label = e.target.value) }),
        numField({ title: `${v.label || 'この媒体'}の価格（円）`, unit: '円', value: v.price, onchange: x => (v.price = x) }),
        h('span', {}, '円'),
        h('button', { class: 'btn small danger', onclick: () => { vs.splice(i, 1); nav.render(); } }, '削除')))),
    h('button', { class: 'btn', onclick: () => { vs.push({ id: null, label: vs.length ? '' : 'DL版', price: 0 }); nav.render(); } }, '＋ 媒体を追加'));
}

// 保存前に取り込んだものはすぐ消し、保存済みのものは「保存する」まで残す
function dropBlob(id) {
  if (!id) return;
  if (draft.newBlobs.has(id)) { draft.newBlobs.delete(id); removeBlob(id); }
  else draft.dropBlobs.add(id);
}

async function pickCover() {
  const [file] = await pickFiles(IMAGE_ACCEPT);
  if (!file) return;
  const id = await addBlob(file);
  draft.newBlobs.add(id);
  dropBlob(draft.product.coverBlobId);
  draft.product.coverBlobId = id;
  nav.render();
}

async function addTracks() {
  const files = (await pickFiles(AUDIO_ACCEPT, true))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true }));
  if (!files.length) return;
  toast(`${files.length} 曲を取り込んでいます…`);
  for (const f of files) {
    const blobId = await addBlob(f);
    draft.newBlobs.add(blobId);
    draft.product.tracks.push({ id: uid(), title: f.name.replace(/\.[^.]+$/, ''), blobId });
  }
  toast(`${files.length} 曲を追加しました`);
  nav.render();
}

function moveTrack(i, d) {
  const t = draft.product.tracks;
  [t[i], t[i + d]] = [t[i + d], t[i]];
  nav.render();
}

async function cancel() {
  for (const id of draft.newBlobs) await removeBlob(id);
  draft = null;
  nav.render();
}

async function commit() {
  const p = draft.product;
  p.title = p.title.trim();
  if (!p.title) { alert('タイトルを入れてください。'); return; }
  const vs = p.kind === 'cd' ? draft.variants.map(v => ({ ...v, label: v.label.trim() })) : [];
  if (vs.some(v => !v.label)) { alert('ほかの媒体の媒体名を入れてください。'); return; }
  if (p.kind !== 'cd') {
    for (const t of p.tracks) dropBlob(t.blobId);
    p.tracks = [];
  }
  for (const id of draft.dropBlobs) await removeBlob(id);
  await save('products', p);
  const ev = currentEvent();
  // 新しい商品は、今のイベントで「売る」にしておく
  if (draft.isNew && ev) ev.items[p.id] = { selling: true };
  const keep = new Set();
  for (const v of vs) {
    const old = v.id && state.products.find(x => x.id === v.id);
    const product = old ? { ...old } : { id: uid(), kind: 'goods', notes: '', coverBlobId: null, tracks: [], createdAt: new Date().toISOString(), variantOf: p.id };
    Object.assign(product, { circleId: p.circleId, title: variantTitle(p.title, v.label), variantLabel: v.label, price: v.price });
    await save('products', product);
    keep.add(product.id);
    if (!old && ev) ev.items[product.id] = { selling: !!ev.items[p.id]?.selling };
  }
  for (const v of variantsOf(state.products, p.id)) if (!keep.has(v.id)) await removeProductData(v);
  if (ev) await save('events', ev);
  const history = [p.title, ...setting('titleHistory', []).filter(t => t !== p.title)].slice(0, 10);
  await setSetting('titleHistory', history);
  toast(draft.isNew ? '登録しました' : '保存しました');
  draft = null;
  nav.render();
}

async function deleteProduct() {
  const p = draft.product;
  if (!confirm(`「${p.title || '無題'}」を削除しますか？ ジャケットと音源のファイル、ほかの媒体（DL 版など）も消えます。（売上の記録は残ります）`)) return;
  for (const id of draft.newBlobs) await removeBlob(id);
  for (const v of variantsOf(state.products, p.id)) await removeProductData(v);
  await removeProductData(state.products.find(x => x.id === p.id) || p);
  toast(`「${p.title}」を削除しました`);
  draft = null;
  nav.render();
}

// 商品とそのファイルを消し、イベントの設定からも外す（売上の記録は残す）
async function removeProductData(p) {
  for (const id of [p.coverBlobId, ...(p.tracks || []).map(t => t.blobId)]) await removeBlob(id);
  await remove('products', p.id);
  for (const ev of state.events) {
    delete ev.items[p.id];
    for (const r of ev.discountRules || []) r.productIds = r.productIds.filter(id => id !== p.id);
    await save('events', ev);
  }
}
