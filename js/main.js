// 起動処理
import { nav, TEST, toast } from './ui.js';
import { load, state } from './store.js';
import { renderListen, updateMini } from './listen.js';
import { renderStaff } from './staff.js';
import { player } from './player.js';
import { initDemo } from './demo.js';

const app = document.getElementById('app');

// 描き直しても、一覧のスクロール位置は保つ
nav.render = () => {
  const keep = {};
  app.querySelectorAll('[data-scroll]').forEach(el => (keep[el.dataset.scroll] = el.scrollTop));
  app.replaceChildren(nav.view === 'listen' ? renderListen() : renderStaff());
  app.querySelectorAll('[data-scroll]').forEach(el => { if (keep[el.dataset.scroll]) el.scrollTop = keep[el.dataset.scroll]; });
};
player.onState = () => nav.render();
player.onTime = updateMini;

if (TEST) document.documentElement.classList.add('test');

await load();
navigator.storage?.persist?.().catch(() => {});
initDemo();
nav.render();
if (state.brokenBlobs) toast(`読めなくなった画像・音源が ${state.brokenBlobs} 件あります。取り込みパックを読み直してください。`, 8000);

// テスト中は古いファイルが残らないよう、オフライン用の保存をしない
if (!TEST && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
