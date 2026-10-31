// イベントごとの設定（売る商品・イベント価格・在庫・まとめ買い割・デモ映像）
import { h, nav, yen, uid, today, toast, numField } from './ui.js';
import { state, save, remove, setting, setSetting, currentEvent, sortedCircles, sortedProducts } from './store.js';
import { itemOf, soldQty, fullTitle } from './logic.js';

let editingId = null;

export function renderEvents() {
  const ev = editingId && state.events.find(e => e.id === editingId);
  return ev ? renderEditor(ev) : renderList();
}

function renderList() {
  const cur = currentEvent();
  const events = [...state.events].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return h('div', { class: 'page' },
    h('section', { class: 'card' },
      h('h2', {}, 'イベント'),
      h('p', { class: 'muted' }, '売上・在庫・値引き・デモ映像はイベントごとに分かれます。前回の設定を使い回すときは「複製」が便利です。'),
      h('button', { class: 'btn primary', onclick: createEvent }, '＋ 新しいイベント'),
      h('div', { class: 'rows' }, events.map(ev => {
        const count = state.sales.filter(s => s.eventId === ev.id && s.status !== 'cancelled').length;
        return h('div', { class: 'row' + (ev === cur ? ' current' : '') },
          h('span', { class: 'grow' }, ev.name, h('small', {}, ` ${ev.date}・会計 ${count} 件`), ev === cur ? h('span', { class: 'badge' }, '使用中') : null),
          ev === cur ? null : h('button', { class: 'btn small primary', onclick: () => use(ev) }, 'このイベントを使う'),
          h('button', { class: 'btn small', onclick: () => { editingId = ev.id; nav.render(); } }, '編集'),
          h('button', { class: 'btn small', onclick: () => duplicate(ev) }, '複製'),
          h('button', { class: 'btn small danger', onclick: () => deleteEvent(ev) }, '削除'));
      })),
      events.length ? null : h('p', { class: 'muted' }, 'まだイベントがありません。')));
}

async function use(ev) {
  await setSetting('currentEventId', ev.id);
  toast(`「${ev.name}」を使います`);
  nav.render();
}

async function createEvent() {
  const name = prompt('イベント名（例：M3-2026秋）')?.trim();
  if (!name) return;
  const items = {};
  for (const p of state.products) items[p.id] = { selling: true };
  const ev = { id: uid(), name, date: today(), createdAt: new Date().toISOString(), items, stockCircles: {}, discountRules: [], demoVideoIds: [] };
  await save('events', ev);
  if (!currentEvent()) await setSetting('currentEventId', ev.id);
  editingId = ev.id;
  nav.render();
}

async function duplicate(src) {
  const name = prompt('新しいイベント名', `${src.name}（複製）`)?.trim();
  if (!name) return;
  const ev = structuredClone(src);
  Object.assign(ev, { id: uid(), name, date: today(), createdAt: new Date().toISOString() });
  ev.discountRules = (ev.discountRules || []).map(r => ({ ...r, id: uid() }));
  await save('events', ev);
  editingId = ev.id;
  toast('複製しました。在庫数などを確認してください');
  nav.render();
}

async function deleteEvent(ev) {
  const count = state.sales.filter(s => s.eventId === ev.id).length;
  if (count) { alert(`このイベントには会計が ${count} 件あります。売上を守るため削除できません。`); return; }
  if (!confirm(`イベント「${ev.name}」を削除しますか？`)) return;
  await remove('events', ev.id);
  if (setting('currentEventId') === ev.id) await setSetting('currentEventId', null);
  nav.render();
}

function renderEditor(ev) {
  const commit = async (rerender = false) => { await save('events', ev); if (rerender) nav.render(); };
  const videos = setting('videos', []);
  return h('div', { class: 'page' },
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => { editingId = null; nav.render(); } }, '‹ イベント一覧へ'),
      h('span', { class: 'muted' }, '変更はその場で保存されます')),
    h('section', { class: 'card' },
      h('h2', {}, 'イベントの基本'),
      h('label', { class: 'field' }, h('span', {}, 'イベント名'), h('input', { type: 'text', value: ev.name, onchange: e => { ev.name = e.target.value.trim() || ev.name; commit(); } })),
      h('label', { class: 'field' }, h('span', {}, '日付'), h('input', { type: 'date', value: ev.date, onchange: e => { ev.date = e.target.value; commit(); } }))),
    sortedCircles().map(c => circleSection(ev, c, commit)),
    h('section', { class: 'card' },
      h('h2', {}, 'デモ映像'),
      videos.length
        ? h('div', { class: 'rows' }, videos.map(v =>
            h('label', { class: 'row' },
              h('input', { type: 'checkbox', checked: ev.demoVideoIds.includes(v.id), onchange: e => {
                const set = new Set(ev.demoVideoIds);
                e.target.checked ? set.add(v.id) : set.delete(v.id);
                ev.demoVideoIds = videos.map(x => x.id).filter(id => set.has(id));
                commit();
              } }),
              h('span', { class: 'grow' }, v.name))))
        : h('p', { class: 'muted' }, '動画は「設定」タブで取り込みます。')));
}

function circleSection(ev, c, commit) {
  const products = sortedProducts().filter(p => p.circleId === c.id);
  const counting = !!ev.stockCircles[c.id];
  const item = p => (ev.items[p.id] ||= { selling: false });
  return h('section', { class: 'card' },
    h('h2', {}, c.name),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: counting, onchange: e => { ev.stockCircles[c.id] = e.target.checked; commit(true); } }),
      '在庫を数える（在庫数を空欄にした商品は数えません）'),
    products.length ? h('table', { class: 'table' },
      h('thead', {}, h('tr', {},
        h('th', {}, allSelling(ev, products, item, commit)), h('th', {}, '商品'), h('th', {}, '通常価格'), h('th', {}, 'イベント価格'),
        counting ? [h('th', {}, '在庫'), h('th', {}, '売れた'), h('th', {}, '残り')] : null)),
      h('tbody', {}, products.map(p => {
        const it = itemOf(ev, p.id);
        const sold = soldQty(state.sales, ev.id, p.id);
        return h('tr', {},
          h('td', {}, h('input', { type: 'checkbox', checked: !!it.selling, onchange: e => { item(p).selling = e.target.checked; commit(true); } })),
          h('td', {}, fullTitle(p, state.products), p.kind === 'cd' || p.variantOf ? null : h('small', {}, '（CD 以外）')),
          h('td', {}, yen(p.price)),
          h('td', {}, numField({ title: `${fullTitle(p, state.products)} のイベント価格（円）`, placeholder: '通常', emptyLabel: '通常価格', allowEmpty: true, unit: '円', value: Number.isInteger(it.price) ? it.price : null,
            onchange: v => { item(p).price = v; commit(); } })),
          counting ? [
            h('td', {}, numField({ title: `${fullTitle(p, state.products)} の在庫`, placeholder: '数えない', allowEmpty: true, value: Number.isInteger(it.stock) ? it.stock : null,
              onchange: v => { item(p).stock = v; commit(true); } })),
            h('td', {}, sold),
            h('td', {}, Number.isInteger(it.stock) ? it.stock - sold : '—'),
          ] : null);
      }))) : h('p', { class: 'muted' }, 'このサークルの商品はまだありません。'),
    rulesSection(ev, c, products, commit));
}

// 「売る」の見出しのチェック：このサークルの商品をまとめて売る・売らないにする（一部だけなら中間の表示）
function allSelling(ev, products, item, commit) {
  const on = products.filter(p => itemOf(ev, p.id).selling).length;
  const box = h('input', { type: 'checkbox', checked: on > 0 && on === products.length, 'aria-label': 'すべて売る',
    onchange: e => { for (const p of products) item(p).selling = e.target.checked; commit(true); } });
  box.indeterminate = on > 0 && on < products.length;
  return h('label', { class: 'check' }, box, '売る');
}

function rulesSection(ev, c, products, commit) {
  const rules = ev.discountRules.filter(r => r.circleId === c.id);
  return h('div', { class: 'rules' },
    h('h3', {}, 'まとめ買い割'),
    rules.map(r => h('div', { class: 'rule' },
      h('div', { class: 'rule-line' },
        h('input', { type: 'text', class: 'grow', value: r.name, placeholder: '名前（例：既刊まとめ買い）', onchange: e => { r.name = e.target.value; commit(); } }),
        h('button', { class: 'btn small danger', onclick: () => { ev.discountRules = ev.discountRules.filter(x => x !== r); commit(true); } }, '削除')),
      h('div', { class: 'rule-line' },
        '下の対象から',
        numField({ title: '何枚以上で割り引くか', unit: '枚', value: r.minQty, onchange: v => { r.minQty = v; commit(); } }),
        '枚以上で',
        numField({ title: '割引額（円）', unit: '円', value: r.amount, onchange: v => { r.amount = v; commit(); } }),
        '円引き',
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!r.repeat, onchange: e => { r.repeat = e.target.checked; commit(); } }), '枚数の倍数ごとに繰り返す（例：4 枚なら 2 回）')),
      h('div', { class: 'rule-targets' }, products.map(p =>
        h('label', { class: 'chip' + (r.productIds.includes(p.id) ? ' on' : '') },
          h('input', { type: 'checkbox', checked: r.productIds.includes(p.id), onchange: e => {
            r.productIds = e.target.checked ? [...r.productIds, p.id] : r.productIds.filter(id => id !== p.id);
            commit(true);
          } }),
          fullTitle(p, state.products)))))),
    h('button', { class: 'btn small', onclick: () => {
      ev.discountRules.push({ id: uid(), circleId: c.id, name: '', productIds: [], minQty: 2, amount: 0, repeat: false });
      commit(true);
    } }, '＋ まとめ買い割を追加'));
}
