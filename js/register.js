// 会計画面（現金のみ。お釣りを出し、売上を記録する）
import { h, nav, yen, uid, toast, modal } from './ui.js';
import { state, save, currentEvent, blobUrl, coverIdOf, sortedCircles, sortedProducts } from './store.js';
import { isSelling, priceOf, remaining, computeCart, fullTitle } from './logic.js';

// カート。editingSaleId があるときは、その会計を直している最中。
const cart = { lines: [], received: '', editingSaleId: null };

export function startEdit(sale) {
  const missing = sale.lines.filter(l => !state.products.some(p => p.id === l.productId));
  if (missing.length && !confirm(`削除済みの商品（${missing.map(l => l.title).join('、')}）は編集の対象から外れます。続けますか？`)) return false;
  cart.lines = sale.lines.filter(l => !missing.includes(l)).map(l => ({ productId: l.productId, qty: l.qty, manualDiscount: l.manualDiscount || 0 }));
  cart.received = sale.received ? String(sale.received) : '';
  cart.editingSaleId = sale.id;
  return true;
}

function resetCart() {
  cart.lines = [];
  cart.received = '';
  cart.editingSaleId = null;
}

const qtyInCart = pid => cart.lines.find(l => l.productId === pid)?.qty || 0;

function add(pid) {
  const line = cart.lines.find(l => l.productId === pid);
  if (line) line.qty++;
  else cart.lines.push({ productId: pid, qty: 1, manualDiscount: 0 });
  nav.render();
}

function changeQty(line, d) {
  line.qty += d;
  if (line.qty <= 0) cart.lines = cart.lines.filter(l => l !== line);
  nav.render();
}

function setManualDiscount(line) {
  const v = prompt('この商品の値引き額（円）。0 で値引きなし', line.manualDiscount || '');
  if (v === null) return;
  line.manualDiscount = Math.max(0, parseInt(v, 10) || 0);
  nav.render();
}

export function renderRegister() {
  const ev = currentEvent();
  if (!ev) return h('div', { class: 'empty' }, 'イベントがまだ選ばれていません。「イベント」タブで作成してください。');
  const editing = cart.editingSaleId && state.sales.find(s => s.id === cart.editingSaleId);
  const products = sortedProducts().filter(p => isSelling(ev, p.id));
  const calc = computeCart(ev, cart.lines, state.products, state.circles);

  const left = h('div', { class: 'reg-products', 'data-scroll': 'reg-products' },
    products.length ? null : h('p', { class: 'muted' }, 'このイベントで売る商品がありません（イベント → 編集）。'),
    sortedCircles().map(c => {
      const list = products.filter(p => p.circleId === c.id);
      if (!list.length) return null;
      return h('section', { class: 'reg-group' },
        h('h3', {}, c.name),
        h('div', { class: 'reg-buttons' }, list.map(p => {
          const rem = remaining(ev, p, state.sales, cart.editingSaleId);
          const left = rem === null ? null : rem - qtyInCart(p.id);
          const url = blobUrl(coverIdOf(p));
          return h('button', { class: 'reg-item', disabled: left !== null && left <= 0, onclick: () => add(p.id) },
            h('span', { class: 'thumb' }, url ? h('img', { src: url, alt: '' }) : '♪'),
            h('span', { class: 'reg-item-text' },
              h('span', { class: 'reg-item-title' }, fullTitle(p, state.products)),
              h('span', { class: 'reg-item-sub' }, yen(priceOf(ev, p)),
                left === null ? null : h('span', { class: left <= 0 ? 'stock out' : left <= 3 ? 'stock low' : 'stock' }, left <= 0 ? '完売' : `残り ${left}`))),
            qtyInCart(p.id) ? h('span', { class: 'in-cart' }, qtyInCart(p.id)) : null);
        })));
    }));

  const received = cart.received === '' ? null : parseInt(cart.received, 10);
  const change = received === null ? null : received - calc.total;
  const changeText = () => (change === null ? '—' : change < 0 ? `${yen(-change)} 足りません` : yen(change));

  const right = h('div', { class: 'reg-cart' },
    editing ? h('div', { class: 'editing' }, `会計 #${editing.no} を直しています`,
      h('button', { class: 'btn small', onclick: () => { resetCart(); nav.render(); } }, '直すのをやめる')) : null,
    h('div', { class: 'cart-lines', 'data-scroll': 'cart' },
      calc.lines.length ? null : h('p', { class: 'muted center' }, '左の商品をタップして追加'),
      calc.lines.map(l => {
        const line = cart.lines.find(x => x.productId === l.productId);
        return h('div', { class: 'cart-line' },
          h('div', { class: 'cart-title' }, l.title, h('small', {}, `${l.circleName}・${yen(l.unitPrice)}`)),
          h('div', { class: 'cart-ctrl' },
            h('button', { class: 'btn small', onclick: () => changeQty(line, -1) }, '−'),
            h('span', { class: 'qty' }, l.qty),
            h('button', { class: 'btn small', onclick: () => changeQty(line, 1) }, '＋'),
            h('button', { class: 'btn small', onclick: () => setManualDiscount(line) }, '値引き'),
            h('span', { class: 'amount' }, yen(l.unitPrice * l.qty))),
          l.manualDiscount ? h('div', { class: 'cart-discount' }, '値引き', h('span', {}, `−${yen(l.manualDiscount)}`)) : null);
      }),
      calc.discounts.map(d => h('div', { class: 'cart-discount auto' }, `${d.name}（${d.circleName}）`, h('span', {}, `−${yen(d.amount)}`)))),
    h('div', { class: 'cart-total' }, h('span', {}, '合計'), h('strong', {}, yen(calc.total))),
    h('div', { class: 'cash' },
      h('label', {}, '預かり',
        h('input', { type: 'number', inputmode: 'numeric', id: 'received', min: 0, value: cart.received, placeholder: '空欄ならちょうど',
          oninput: e => { cart.received = e.target.value; refreshChange(calc.total); } })),
      h('div', { class: 'quick' }, [1000, 2000, 5000, 10000].map(n =>
        h('button', { class: 'btn small', onclick: () => { cart.received = String(n); nav.render(); } }, yen(n))),
        h('button', { class: 'btn small', onclick: () => { cart.received = ''; nav.render(); } }, 'ちょうど'))),
    h('div', { class: 'change' + (change !== null && change < 0 ? ' short' : '') }, h('span', {}, 'お釣り'), h('strong', { id: 'change' }, changeText())),
    h('div', { class: 'cart-actions' },
      h('button', { class: 'btn', disabled: !cart.lines.length && !editing, onclick: () => { if (cart.lines.length && !confirm('カートを空にしますか？')) return; resetCart(); nav.render(); } }, editing ? 'やめる' : '空にする'),
      h('button', { class: 'btn primary big', disabled: !calc.lines.length, onclick: () => confirmSale(ev, calc, editing) }, editing ? '直した内容で確定' : '会計を確定')));

  return h('div', { class: 'register' }, left, right);
}

// 預かり金の入力中は、画面全体を描き直さずにお釣りだけ更新する
function refreshChange(total) {
  const el = document.getElementById('change');
  const box = el.parentElement;
  const received = cart.received === '' ? null : parseInt(cart.received, 10);
  const change = received === null || Number.isNaN(received) ? null : received - total;
  el.textContent = change === null ? '—' : change < 0 ? `${yen(-change)} 足りません` : yen(change);
  box.classList.toggle('short', change !== null && change < 0);
}

async function confirmSale(ev, calc, editing) {
  const received = cart.received === '' ? calc.total : parseInt(cart.received, 10);
  if (!(received >= calc.total)) { alert('預かり金が合計より少なくなっています。'); return; }
  const now = new Date().toISOString();
  const body = { lines: calc.lines, discounts: calc.discounts, subtotal: calc.subtotal, total: calc.total, received, change: received - calc.total, updatedAt: now };
  let sale;
  if (editing) {
    sale = editing;
    sale.history = [...(sale.history || []), {
      at: now, action: '編集',
      before: { lines: sale.lines, discounts: sale.discounts, subtotal: sale.subtotal, total: sale.total, received: sale.received, change: sale.change },
    }];
    Object.assign(sale, body);
  } else {
    const no = Math.max(0, ...state.sales.filter(s => s.eventId === ev.id).map(s => s.no)) + 1;
    sale = { id: uid(), eventId: ev.id, no, createdAt: now, status: 'ok', history: [], ...body };
  }
  await save('sales', sale);
  resetCart();
  nav.render();
  if (sale.change > 0) {
    modal(null, h('div', { class: 'change-modal' },
      h('div', {}, `合計 ${yen(sale.total)}／預かり ${yen(sale.received)}`),
      h('div', { class: 'change-big' }, 'お釣り ', h('strong', {}, yen(sale.change)))), [{ label: 'OK', primary: true }]);
  } else {
    toast(editing ? `会計 #${sale.no} を直しました` : `会計 #${sale.no} を記録しました`);
  }
}
