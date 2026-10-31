// デモ映像。試聴画面で操作がしばらくないと流れ、タップで試聴画面に戻る。音は常に出さない。
import { nav, toast } from './ui.js';
import { blobUrl, currentEvent, setting } from './store.js';
import { player } from './player.js';
import { resetListen } from './listen.js';

const overlay = document.getElementById('demo');
const video = document.getElementById('demo-video');
let lastActive = Date.now();
let list = [];
let idx = 0;

export function initDemo() {
  video.muted = true;
  for (const type of ['pointerdown', 'keydown', 'touchstart']) {
    document.addEventListener(type, () => (lastActive = Date.now()), { capture: true, passive: true });
  }
  overlay.addEventListener('click', hideDemo);
  video.addEventListener('ended', () => { idx = (idx + 1) % list.length; playCurrent(); });
  setInterval(() => {
    if (nav.view !== 'listen' || player.playing || !overlay.hidden) return;
    const sec = setting('idleSeconds', 60);
    if (sec > 0 && Date.now() - lastActive >= sec * 1000) showDemo(false);
  }, 1000);
}

function videosOfEvent() {
  const lib = setting('videos', []);
  return (currentEvent()?.demoVideoIds || []).map(id => lib.find(v => v.id === id)).filter(Boolean);
}

export function showDemo(manual) {
  const chosen = videosOfEvent();
  // 読めない動画（端末から中身が消えたもの）は飛ばす
  list = chosen.filter(v => blobUrl(v.blobId));
  if (!list.length) {
    if (manual) toast(chosen.length
      ? 'デモ映像が読めなくなっています。取り込みパックを読み直すか、設定で動画を取り込み直してください'
      : 'このイベントのデモ映像が選ばれていません（イベント → 編集）', 6000);
    else lastActive = Date.now();
    return;
  }
  if (player.track) player.stop();
  nav.view = 'listen';
  resetListen();
  nav.render();
  idx = 0;
  overlay.hidden = false;
  playCurrent();
}

function playCurrent() {
  video.src = blobUrl(list[idx].blobId);
  video.loop = list.length === 1;
  video.play().catch(() => {});
}

function hideDemo() {
  overlay.hidden = true;
  video.pause();
  video.removeAttribute('src');
  video.load();
  lastActive = Date.now();
  resetListen();
  nav.render();
}
