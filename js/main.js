// 起動処理
import { nav, TEST } from './ui.js';
import { load } from './store.js';
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

// テスト中は古いファイルが残らないよう、オフライン用の保存をしない
if (!TEST && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
