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

// ピンチやダブルタップで画面が拡大されないようにする（iPad の Safari は viewport の指定だけでは拡大を止めない）
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, e => e.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
// ボタンなど押す場所以外を素早く 2 回たたいたときは、2 回目を無かったことにする（押す場所は CSS で拡大しないようにしてある）
let lastTap = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTap < 350 && !e.target.closest('button, input, select, textarea, label, a, .track, .kp')) e.preventDefault();
  lastTap = now;
}, { passive: false });

// 起動中・起動に失敗したときも真っ暗にしない
const boot = text => app.replaceChildren(Object.assign(document.createElement('div'), { className: 'booting', textContent: text }));
try {
  await load((n, total) => boot(`データを新しい形に移しています…（${n} / ${total}）
初回だけ時間がかかります`));
} catch (e) {
  boot(`起動できませんでした：${e?.message || e}
アプリを閉じて開き直してください。直らないときはこの文面を伝えてください。`);
  throw e;
}
navigator.storage?.persist?.().catch(() => {});
initDemo();
nav.render();
if (state.brokenBlobs) toast(`読めなくなった画像・音源が ${state.brokenBlobs} 件あります。取り込みパックを読み直してください。`, 8000);

// テスト中は古いファイルが残らないよう、オフライン用の保存をしない
if (!TEST && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
