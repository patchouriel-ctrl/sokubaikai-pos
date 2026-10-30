// 設定（表示・ロゴ・デモ映像の取り込み・バックアップ・保存状況）
import { h, nav, uid, toast, pickFiles, offerFile, modal, stamp } from './ui.js';
import { state, save, setting, setSetting, addBlob, removeBlob, blobUrl } from './store.js';
import { db, STORES } from './db.js';
import { makeZip, readZip } from './zip.js';

const BACKUP_FORMAT = 'sokubaikai-pos-backup';
let storageInfo = null;

export function renderSettings() {
  if (!storageInfo) loadStorageInfo();
  const logo = blobUrl(setting('logoBlobId'));
  const videos = setting('videos', []);
  return h('div', { class: 'page' },
    h('section', { class: 'card' },
      h('h2', {}, '試聴画面'),
      h('label', { class: 'field' }, h('span', {}, '上部に出す名前'),
        h('input', { type: 'text', value: setting('title', '試聴コーナー'), onchange: e => setSetting('title', e.target.value.trim() || '試聴コーナー') })),
      h('div', { class: 'field' }, h('span', {}, 'トップ画面のロゴ画像'),
        h('div', { class: 'cover-edit' },
          h('span', { class: 'thumb' }, logo ? h('img', { src: logo, alt: '' }) : '—'),
          h('button', { class: 'btn small', onclick: pickLogo }, '画像を選ぶ'),
          logo ? h('button', { class: 'btn small danger', onclick: removeLogo }, 'ロゴを外す') : null)),
      h('label', { class: 'field' }, h('span', {}, '操作がないとデモ映像に切り替えるまでの秒数（0 で切り替えない）'),
        h('input', { type: 'number', inputmode: 'numeric', class: 'num-input', min: 0, value: setting('idleSeconds', 60),
          onchange: e => setSetting('idleSeconds', Math.max(0, parseInt(e.target.value, 10) || 0)) }))),
    h('section', { class: 'card' },
      h('h2', {}, 'デモ映像'),
      h('p', { class: 'muted' }, '音は出さずに流します。どの映像を流すかはイベントごとに選びます（イベント → 編集）。'),
      h('button', { class: 'btn', onclick: addVideos }, '＋ 動画を取り込む（複数可）'),
      h('div', { class: 'rows' }, videos.map(v =>
        h('div', { class: 'row' },
          h('span', { class: 'grow' }, v.name),
          h('button', { class: 'btn small danger', onclick: () => deleteVideo(v) }, '削除'))))),
    h('section', { class: 'card' },
      h('h2', {}, 'バックアップ'),
      h('p', { class: 'muted' }, '商品・音源・ジャケット・イベント・売上をまとめて 1 つの zip に書き出します。イベントの前日と終了後に取っておくと安心です。読み込むと今のデータはすべて置き換わります。'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: exportBackup }, 'バックアップを書き出す'),
        h('button', { class: 'btn danger', onclick: importBackup }, 'バックアップから復元する'))),
    h('section', { class: 'card' },
      h('h2', {}, '保存状況'),
      storageInfo
        ? [h('p', {}, `使用量：${storageInfo.usage}（上限の目安：${storageInfo.quota}）`),
           h('p', {}, storageInfo.persisted ? 'データは消されにくい設定になっています。' : 'データが自動で消されないよう、iPad の空き容量に余裕を持たせてください。')]
        : h('p', { class: 'muted' }, '確認中…'),
      h('p', { class: 'muted' }, `商品 ${state.products.length} 点・イベント ${state.events.length} 件・会計 ${state.sales.length} 件`)));
}

const mb = n => `${(n / 1024 / 1024).toFixed(1)} MB`;
async function loadStorageInfo() {
  storageInfo = { usage: '不明', quota: '不明', persisted: false };
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) Object.assign(storageInfo, { usage: mb(est.usage), quota: mb(est.quota) });
    storageInfo.persisted = !!(await navigator.storage?.persisted?.());
  } catch { /* 取れない環境では不明のまま */ }
  nav.render();
}

async function pickLogo() {
  const [file] = await pickFiles('image/*');
  if (!file) return;
  const old = setting('logoBlobId');
  await setSetting('logoBlobId', await addBlob(file));
  await removeBlob(old);
  nav.render();
}

async function removeLogo() {
  const old = setting('logoBlobId');
  await setSetting('logoBlobId', null);
  await removeBlob(old);
  nav.render();
}

async function addVideos() {
  const files = await pickFiles('video/*,.mp4,.mov', true);
  if (!files.length) return;
  const videos = [...setting('videos', [])];
  for (const f of files) videos.push({ id: uid(), name: f.name, blobId: await addBlob(f) });
  await setSetting('videos', videos);
  toast(`${files.length} 本の動画を取り込みました`);
  storageInfo = null;
  nav.render();
}

async function deleteVideo(v) {
  if (!confirm(`動画「${v.name}」を削除しますか？`)) return;
  await setSetting('videos', setting('videos', []).filter(x => x.id !== v.id));
  await removeBlob(v.blobId);
  for (const ev of state.events) {
    if (!ev.demoVideoIds.includes(v.id)) continue;
    ev.demoVideoIds = ev.demoVideoIds.filter(id => id !== v.id);
    await save('events', ev);
  }
  storageInfo = null;
  nav.render();
}

async function exportBackup() {
  toast('バックアップを作っています…', 60000);
  try {
    const blobs = await db.all('blobs');
    const data = {
      format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(),
      circles: state.circles, products: state.products, events: state.events, sales: state.sales, settings: state.settings,
      blobs: blobs.map(b => ({ id: b.id, name: b.name, type: b.type })),
    };
    const zip = await makeZip([
      { name: 'data.json', data: new TextEncoder().encode(JSON.stringify(data)) },
      ...blobs.map(b => ({ name: `blobs/${b.id}`, data: b.blob })),
    ]);
    toast('できました', 1500);
    offerFile(zip, `試聴POSバックアップ_${stamp()}.zip`);
  } catch (e) {
    toast(`書き出せませんでした：${e.message}`, 5000);
  }
}

async function importBackup() {
  const [file] = await pickFiles('.zip,application/zip');
  if (!file) return;
  let data, files;
  try {
    files = await readZip(file);
    data = JSON.parse(await files.get('data.json').text());
    if (data.format !== BACKUP_FORMAT) throw new Error('このアプリのバックアップではありません');
  } catch (e) {
    alert(`読み込めませんでした：${e.message}`);
    return;
  }
  modal('バックアップから復元', h('div', {},
    h('p', {}, `書き出した日時：${new Date(data.exportedAt).toLocaleString('ja-JP')}`),
    h('p', {}, `商品 ${data.products.length} 点・イベント ${data.events.length} 件・会計 ${data.sales.length} 件`),
    h('p', { class: 'warn' }, '今この iPad に入っているデータはすべて消え、バックアップの内容に置き換わります。')), [
    { label: 'やめる' },
    { label: '置き換える', danger: true, onClick: async () => {
      toast('復元しています…', 60000);
      await db.clearAll();
      for (const s of STORES.filter(s => !['blobs', 'settings'].includes(s))) await db.putMany(s, data[s]);
      await db.putMany('settings', Object.entries(data.settings).map(([id, value]) => ({ id, value })));
      for (const b of data.blobs) {
        const part = files.get(`blobs/${b.id}`);
        if (part) await db.put('blobs', { id: b.id, name: b.name, type: b.type, blob: new Blob([part], { type: b.type }) });
      }
      location.reload();
    } },
  ]);
}
