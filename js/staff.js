// 売り子用の画面（会計・売上・商品・イベント・設定のタブ）
import { h, nav } from './ui.js';
import { currentEvent } from './store.js';
import { resetListen } from './listen.js';
import { showDemo } from './demo.js';
import { renderRegister } from './register.js';
import { renderSales } from './sales.js';
import { renderProducts } from './products.js';
import { renderEvents } from './events.js';
import { renderSettings } from './settings.js';

const TABS = [
  ['register', '会計', renderRegister],
  ['sales', '売上', renderSales],
  ['products', '商品', renderProducts],
  ['events', 'イベント', renderEvents],
  ['settings', '設定', renderSettings],
];
let tab = 'register';
export function setStaffTab(t) { tab = t; }

export function renderStaff() {
  const ev = currentEvent();
  const [, , render] = TABS.find(t => t[0] === tab);
  return h('div', { class: 'staff' },
    h('header', { class: 'staff-head' },
      h('nav', { class: 'tabs' },
        TABS.map(([id, label]) => h('button', { class: 'tab' + (id === tab ? ' on' : ''), onclick: () => { tab = id; nav.render(); } }, label))),
      h('span', { class: 'cur-event' }, ev ? ev.name : 'イベント未選択'),
      h('button', { class: 'btn', onclick: () => showDemo(true) }, 'デモ映像'),
      h('button', { class: 'btn primary', onclick: () => { nav.view = 'listen'; resetListen(); nav.render(); } }, '試聴画面へ')),
    h('main', { class: 'staff-main tab-' + tab, 'data-scroll': 'staff-' + tab }, render()));
}
