// お客さん向けの試聴画面（参考コードの ContentView・AlbumTileView・AlbumDetailView・MiniPlayerView にあたる）
import { h, icon, yen, nav } from './ui.js';
import { state, blobUrl, currentEvent, circleName, setting, sortedProducts } from './store.js';
import { isSelling, priceOf, remaining } from './logic.js';
import { player, fmtSec } from './player.js';

let selectedId = null;
export function resetListen() { selectedId = null; }

const select = id => { selectedId = id; nav.render(); };

export function renderListen() {
  const ev = currentEvent();
  const sel = selectedId && state.products.find(p => p.id === selectedId);
  const logo = blobUrl(setting('logoBlobId'));
  const header = h('header', { class: 'listen-head' },
    sel
      ? h('button', { class: 'icon-btn', 'aria-label': '戻る', onclick: () => select(null) }, icon('back'))
      : logo ? h('img', { class: 'logo', src: logo, alt: '' }) : h('span', { class: 'icon-spacer' }),
    h('h1', {}, sel ? '' : setting('title', '試聴コーナー')),
    h('button', { class: 'icon-btn', 'aria-label': '管理画面', onclick: () => { nav.view = 'staff'; nav.render(); } }, icon('gear')));
  return h('div', { class: 'listen' + (player.track ? ' with-mini' : '') },
    header,
    sel ? renderDetail(sel, ev) : renderGrid(ev),
    player.track ? renderMini() : null);
}

function cover(p, cls) {
  const url = blobUrl(p.coverBlobId);
  return h('div', { class: cls }, url ? h('img', { src: url, alt: '' }) : h('span', { class: 'ph' }, '♪'));
}

function renderGrid(ev) {
  const list = sortedProducts().filter(p => p.kind === 'cd' && isSelling(ev, p.id));
  if (!list.length) {
    return h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, '▦'), '登録されているアルバムがありません。');
  }
  return h('div', { class: 'grid-scroll', 'data-scroll': 'grid' },
    h('div', { class: 'grid' }, list.map(p => tile(p, ev))));
}

function tile(p, ev) {
  const rem = remaining(ev, p, state.sales);
  const c = cover(p, 'tile-cover');
  if (rem !== null && rem <= 0) c.append(h('span', { class: 'soldout' }, '完売'));
  return h('button', { class: 'tile', onclick: () => select(p.id) },
    c,
    h('div', { class: 'tile-body' },
      h('div', { class: 'tile-title' }, p.title),
      h('div', { class: 'tile-meta' },
        h('span', { class: 'tile-circle' }, circleName(p.circleId)),
        h('span', { class: 'price' }, yen(priceOf(ev, p)))),
      h('hr'),
      p.tracks.length
        ? [p.tracks.slice(0, 5).map(t => h('div', { class: 'tile-track' }, h('span', { class: 'note' }, '♪'), t.title)),
           p.tracks.length > 5 ? h('div', { class: 'tile-more' }, `他 ${p.tracks.length - 5} 楽曲`) : null]
        : h('div', { class: 'tile-more' }, '楽曲なし')));
}

function renderDetail(p, ev) {
  const rem = remaining(ev, p, state.sales);
  return h('div', { class: 'detail' },
    h('div', { class: 'detail-head' },
      cover(p, 'detail-cover'),
      h('div', { class: 'detail-info' },
        h('h2', {}, p.title),
        h('div', { class: 'detail-circle' }, circleName(p.circleId)),
        h('div', { class: 'price big' }, yen(priceOf(ev, p)), rem !== null && rem <= 0 ? h('span', { class: 'soldout-inline' }, '完売') : null),
        p.notes ? h('div', { class: 'detail-notes' }, p.notes) : null,
        h('div', { class: 'detail-count' }, `${p.tracks.length} 楽曲収録`))),
    h('div', { class: 'track-list', 'data-scroll': 'tracks' },
      p.tracks.map(t => {
        const current = player.track?.id === t.id;
        return h('div', { class: 'track' + (current ? ' current' : ''), onclick: () => player.toggle(t, p.tracks) },
          cover(p, 'track-cover'),
          h('div', { class: 'track-title' }, t.title),
          current && player.playing ? h('span', { class: 'eq' }, h('i'), h('i'), h('i')) : null,
          h('button', { class: 'play-btn', 'aria-label': '再生' }, icon(current && player.playing ? 'pause' : 'play')));
      })));
}

function renderMini() {
  const t = player.track;
  const btn = (name, label, fn) => h('button', { class: 'icon-btn', 'aria-label': label, onclick: fn }, icon(name));
  return h('div', { class: 'mini' },
    h('div', { class: 'mini-row' },
      h('span', { class: 'note' }, '♪'),
      h('div', { class: 'mini-info' }, h('div', { class: 'mini-label' }, '再生中'), h('div', { class: 'mini-title' }, t.title)),
      btn('prev', '前の曲', () => player.prev()),
      btn(player.playing ? 'pause' : 'play', '再生・一時停止', () => player.toggle(t)),
      btn('next', '次の曲', () => player.next()),
      btn('close', '停止', () => player.stop())),
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
