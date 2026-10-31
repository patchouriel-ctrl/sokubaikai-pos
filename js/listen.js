// お客さん向けの試聴画面兼お品書き（参考コードの ContentView・AlbumTileView・AlbumDetailView・MiniPlayerView にあたる）。
// 見出しは出さず、売っている商品を画面いっぱいに並べる。音源のない商品も価格の案内として並べる。
// 別媒体（DL 版など）はタイルを分けず、元のアルバムに価格を並べる。
// 2 サークル以上の商品を売るときは、上にサークルのロゴと名前を並べ、押すとそのサークルのお品書きに切り替える。
import { h, icon, yen, nav } from './ui.js';
import { state, blobUrl, currentEvent, circleName, sortedProducts, sortedCircles } from './store.js';
import { isSelling, priceOf, remaining, variantsOf, mediaLabelOf } from './logic.js';
import { player, fmtSec } from './player.js';

let selectedId = null;
let circleId = null; // お品書きで表示中のサークル
// 画面の動き。描画は状態が変わるたびに丸ごと作り直すので、切り替えた直後の 1 回だけ動かす。
// pending = { kind: 'open'（詳細へ）| 'close'（一覧へ）| 'circle'（サークル切り替え）| 'enter'（デモ映像から戻る）, rect: 飛ばすジャケットの元の位置, id }
let pending = null;
let miniShown = false; // ミニプレイヤーが前の描画で出ていたか
let playKey = '';      // 前の描画での「再生中の曲と状態」
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
export function resetListen(anim) { selectedId = null; pending = anim ? { kind: anim } : null; }

// from：押したタイル・戻る前の詳細のジャケット。ジャケットがその位置から行き先へ飛んでいくように見せる。
function select(id, from) {
  pending = { kind: id ? 'open' : 'close', rect: from?.getBoundingClientRect(), id: id ?? selectedId };
  selectedId = id;
  nav.render();
}

export function renderListen() {
  const ev = currentEvent();
  const sel = selectedId && state.products.find(p => p.id === selectedId);
  const anim = pending;
  pending = null;
  const mini = player.track ? renderMini(!miniShown) : null;
  miniShown = !!player.track;
  const root = h('div', { class: 'listen' + (player.track ? ' with-mini' : '') + (anim && !reduce.matches ? ' anim-' + anim.kind : '') },
    sel ? renderDetail(sel, ev) : renderGrid(ev),
    h('button', { class: 'icon-btn float-gear', 'aria-label': '管理画面', onclick: () => { nav.view = 'staff'; nav.render(); } }, icon('gear')),
    mini);
  // 画面に入ってから（同じ処理の続きで、描かれる前に）ジャケットを飛ばす
  if (anim?.rect) queueMicrotask(() => {
    const target = anim.kind === 'open' ? root.querySelector('.detail-cover') : root.querySelector(`.tile[data-id="${anim.id}"] .tile-cover`);
    if (target) fly(anim.rect, target);
  });
  return root;
}

// 行き先のジャケットの写しを画面の一番上に置き、元の位置から行き先まで動かす（本物は動き終わるまで隠す）
function fly(from, target) {
  const to = target.getBoundingClientRect();
  if (reduce.matches || !to.width || !from.width || !target.isConnected) return;
  const ghost = target.cloneNode(true);
  ghost.classList.add('ghost');
  Object.assign(ghost.style, { left: to.left + 'px', top: to.top + 'px', width: to.width + 'px', height: to.height + 'px' });
  document.body.append(ghost);
  target.style.visibility = 'hidden';
  const done = () => { target.style.visibility = ''; ghost.remove(); };
  setTimeout(done, 800); // 動きが止まっても（画面が裏に回ったときなど）本物を隠したままにしない
  ghost.animate([
    { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})` },
    { transform: 'none' },
  ], { duration: 460, easing: 'cubic-bezier(.2, .8, .2, 1)' }).finished.then(done, done);
}

// 向きや大きさが変わったら並べ方を計算し直す
addEventListener('resize', () => { if (nav.view === 'listen') nav.render(); });

function cover(p, cls) {
  const url = blobUrl(p.coverBlobId);
  return h('div', { class: cls }, url ? h('img', { src: url, alt: '' }) : h('span', { class: 'ph' }, '♪'));
}

// 画面いっぱいに並べたときに、ジャケットが一番大きくなる列数を選ぶ。
// 文字の大きさはジャケットの 4.5%（12〜22px）、文字の部分の高さはその 13 倍とみなす。小さくなりすぎるときは縦にスクロールさせる。
const GAP = 16, PAD = 16, GEAR = 56, MINI = 130, BAR = 72, MIN_SIZE = 150, TEXT_LINES = 13;
const fontOf = size => Math.min(22, Math.max(12, size * 0.045));
function layout(n, withBar) {
  const W = innerWidth - PAD - GEAR, H = innerHeight - PAD * 2 - (player.track ? MINI : 0) - (withBar ? BAR : 0);
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const w = (W - GAP * (cols - 1)) / cols, ht = (H - GAP * (rows - 1)) / rows - 16;
    let size = ht / (1 + 0.045 * TEXT_LINES);
    if (fontOf(size) === 12) size = ht - 12 * TEXT_LINES;
    if (fontOf(size) === 22) size = ht - 22 * TEXT_LINES;
    size = Math.floor(Math.min(w - 16, size));
    // 横幅で決まって縦が余るときは、文字を少し大きくし（1.15 倍まで）、さらに余れば曲名を 2 行まで折り返す
    const fs = Math.min(22, fontOf(size) * 1.15, Math.max(fontOf(size), (ht - size) / TEXT_LINES));
    const wrap = ht - size >= (TEXT_LINES + 6) * fs;
    if (!best || size > best.size) best = { cols, rows, size, fs, wrap };
  }
  return best.size >= MIN_SIZE ? best : null;
}

function renderGrid(ev) {
  const all = sortedProducts().filter(p => !p.variantOf && (isSelling(ev, p.id) || sellingVariants(ev, p).length));
  if (!all.length) {
    return h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, '▦'), '登録されているアルバムがありません。');
  }
  const circles = sortedCircles().filter(c => all.some(p => p.circleId === c.id));
  if (!circles.some(c => c.id === circleId)) circleId = circles[0]?.id ?? null;
  const multi = circles.length > 1;
  const list = multi ? all.filter(p => p.circleId === circleId) : all;
  const fit = layout(list.length, multi);
  const size = fit ? fit.size : MIN_SIZE;
  const style = `--size:${size}px; --fs:${(fit ? fit.fs : fontOf(size)).toFixed(1)}px;` + (fit ? ` --cols:${fit.cols};` : '');
  return [
    multi ? h('nav', { class: 'circle-bar' }, circles.map(c =>
      h('button', { class: 'circle-tab' + (c.id === circleId ? ' on' : ''), onclick: () => { if (c.id !== circleId) pending = { kind: 'circle' }; circleId = c.id; nav.render(); } },
        blobUrl(c.logoBlobId) ? h('img', { src: blobUrl(c.logoBlobId), alt: '' }) : null,
        h('span', {}, c.name)))) : null,
    h('div', { class: 'grid-scroll', 'data-scroll': 'grid' },
      h('div', { class: 'grid' + (fit ? ' fit' : '') + (fit?.wrap ? ' wrap' : ''), style }, list.map((p, i) => tile(p, ev, i))))];
}

const sellingVariants = (ev, p) => variantsOf(state.products, p.id).filter(v => isSelling(ev, v.id));
const soldOut = (ev, p) => { const r = remaining(ev, p, state.sales); return r !== null && r <= 0; };

// 価格の欄。別媒体があれば「CD 2,000円 ／ DL版 1,500円」のように媒体ごとに並べる。
function prices(ev, p, cls) {
  const vs = sellingVariants(ev, p);
  if (!vs.length) return h('span', { class: cls }, yen(priceOf(ev, p)), soldOut(ev, p) && cls.includes('big') ? h('span', { class: 'soldout-inline' }, '完売') : null);
  const all = [...(isSelling(ev, p.id) ? [p] : []), ...vs];
  return h('span', { class: cls + ' media-prices' }, all.map(x =>
    h('span', { class: 'media-price' + (soldOut(ev, x) ? ' out' : '') },
      h('span', { class: 'media' }, mediaLabelOf(x)), yen(priceOf(ev, x)), soldOut(ev, x) ? h('span', { class: 'media-out' }, '完売') : null)));
}

function tile(p, ev, i) {
  const c = cover(p, 'tile-cover');
  const vs = sellingVariants(ev, p);
  if ([...(isSelling(ev, p.id) ? [p] : []), ...vs].every(x => soldOut(ev, x))) c.append(h('span', { class: 'soldout' }, '完売'));
  // --i：現れるときに少しずつずらす順番
  return h('button', { class: 'tile', 'data-id': p.id, style: `--i:${i}`, onclick: () => select(p.id, c) },
    c,
    h('div', { class: 'tile-body' },
      h('div', { class: 'tile-title' }, p.title),
      // サークル名は一覧では出さず、詳細画面で出す（情報を絞るため）
      h('div', { class: 'tile-meta' }, prices(ev, p, 'price')),
      h('hr'),
      p.kind !== 'cd'
        ? h('div', { class: 'tile-notes' }, p.notes || '')
        : p.tracks.length
          ? [p.tracks.slice(0, 5).map(t => h('div', { class: 'tile-track' }, h('span', { class: 'note' }, '♪'), t.title)),
             p.tracks.length > 5 ? h('div', { class: 'tile-more' }, `他 ${p.tracks.length - 5} 楽曲`) : null]
          : h('div', { class: 'tile-more' }, '楽曲なし')));
}

function renderDetail(p, ev) {
  // 再生する曲や再生・一時停止が変わった直後だけ、その曲の行を光らせる
  const key = player.track ? `${player.track.id}:${player.playing}` : '';
  const changed = key !== playKey;
  playKey = key;
  return h('div', { class: 'detail' },
    cover(p, 'detail-cover'),
    h('div', { class: 'detail-side' },
      h('button', { class: 'back-btn', onclick: () => select(null, document.querySelector('.detail-cover')) }, icon('back'), '一覧に戻る'),
      h('div', { class: 'detail-info' },
        h('h2', {}, p.title),
        h('div', { class: 'detail-circle' }, circleName(p.circleId)),
        h('div', {}, prices(ev, p, 'price big')),
        p.notes ? h('div', { class: 'detail-notes' }, p.notes) : null,
        p.kind === 'cd' ? h('div', { class: 'detail-count' }, `${p.tracks.length} 楽曲収録`) : null),
      p.tracks.length ? h('div', { class: 'track-list', 'data-scroll': 'tracks' },
        p.tracks.map((t, i) => {
          const current = player.track?.id === t.id;
          return h('div', { class: 'track' + (current ? ' current' : '') + (current && changed ? ' just' : ''), style: `--i:${i}`, onclick: () => player.toggle(t, p.tracks) },
            h('div', { class: 'track-title' }, t.title),
            current && player.playing ? h('span', { class: 'eq' }, h('i'), h('i'), h('i')) : null,
            h('button', { class: 'play-btn', 'aria-label': '再生' }, icon(current && player.playing ? 'pause' : 'play')));
        })) : null));
}

// enter：出てきたばかりなら下からせり上がる。停止は沈んでから止める。
function renderMini(enter) {
  const t = player.track;
  const btn = (name, label, fn) => h('button', { class: 'icon-btn', 'aria-label': label, onclick: fn }, icon(name));
  const stop = () => {
    const el = document.querySelector('.mini');
    if (!el || reduce.matches) return player.stop();
    let stopped = false;
    const done = () => { if (!stopped) { stopped = true; player.stop(); } };
    setTimeout(done, 400); // 動きが止まっても必ず止める
    el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(40px)', opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' })
      .finished.then(done, done);
  };
  return h('div', { class: 'mini' + (enter ? ' enter' : '') },
    h('div', { class: 'mini-row' },
      h('span', { class: 'note' }, '♪'),
      h('div', { class: 'mini-info' }, h('div', { class: 'mini-label' }, '再生中'), h('div', { class: 'mini-title' }, t.title)),
      btn('prev', '前の曲', () => player.prev()),
      btn(player.playing ? 'pause' : 'play', '再生・一時停止', () => player.toggle(t)),
      btn('next', '次の曲', () => player.next()),
      btn('close', '停止', stop)),
    h('input', {
      type: 'range', id: 'mp-range', class: 'mini-range', min: 0, max: Math.max(player.duration, 1), step: 0.1, value: player.time,
      oninput: e => { player.seeking = true; document.getElementById('mp-cur').textContent = fmtSec(+e.target.value); },
      onchange: e => { player.seek(+e.target.value); player.seeking = false; },
    }),
    h('div', { class: 'mini-times' }, h('span', { id: 'mp-cur' }, fmtSec(player.time)), h('span', { id: 'mp-dur' }, fmtSec(player.duration))));
}

export function updateMini() {
  const r = document.getElementById('mp-range');
  if (!r) return;
  r.max = Math.max(player.duration, 1);
  if (!player.seeking) {
    r.value = player.time;
    document.getElementById('mp-cur').textContent = fmtSec(player.time);
  }
  document.getElementById('mp-dur').textContent = fmtSec(player.duration);
}
