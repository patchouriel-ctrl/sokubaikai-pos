// 価格・在庫・値引き・集計・CSV の計算（画面に依存しない）
import { fmtDateTime } from './ui.js';

export const itemOf = (ev, pid) => (ev && ev.items[pid]) || {};
export const isSelling = (ev, pid) => (ev ? !!itemOf(ev, pid).selling : true);

export function priceOf(ev, p) {
  const v = itemOf(ev, p.id).price;
  return Number.isInteger(v) ? v : p.price;
}

export const countsStock = (ev, p) =>
  !!ev && !!ev.stockCircles?.[p.circleId] && Number.isInteger(itemOf(ev, p.id).stock);

export function soldQty(sales, eventId, pid, exceptSaleId) {
  let n = 0;
  for (const s of sales) {
    if (s.eventId !== eventId || s.status === 'cancelled' || s.id === exceptSaleId) continue;
    for (const l of s.lines) if (l.productId === pid) n += l.qty;
  }
  return n;
}

// 在庫を数えない商品は null
export function remaining(ev, p, sales, exceptSaleId) {
  if (!countsStock(ev, p)) return null;
  return itemOf(ev, p.id).stock - soldQty(sales, ev.id, p.id, exceptSaleId);
}

// cartLines: [{ productId, qty, manualDiscount }]
export function computeCart(ev, cartLines, products, circles) {
  const cname = id => circles.find(c => c.id === id)?.name || '（サークルなし）';
  const lines = [];
  for (const l of cartLines) {
    const p = products.find(x => x.id === l.productId);
    if (!p || l.qty <= 0) continue;
    const unitPrice = priceOf(ev, p);
    lines.push({
      productId: p.id, circleId: p.circleId, circleName: cname(p.circleId), title: p.title,
      unitPrice, qty: l.qty, manualDiscount: Math.min(l.manualDiscount || 0, unitPrice * l.qty),
    });
  }
  const discounts = [];
  for (const r of ev?.discountRules || []) {
    const targets = lines.filter(l => r.productIds.includes(l.productId));
    const qty = targets.reduce((s, l) => s + l.qty, 0);
    if (!(r.minQty > 0) || !(r.amount > 0)) continue;
    const times = r.repeat ? Math.floor(qty / r.minQty) : qty >= r.minQty ? 1 : 0;
    if (!times) continue;
    // 対象商品の金額を超えて引かない
    const room = targets.reduce((s, l) => s + l.unitPrice * l.qty - l.manualDiscount, 0);
    const amount = Math.min(r.amount * times, room);
    if (amount > 0) discounts.push({ ruleId: r.id, circleId: r.circleId, circleName: cname(r.circleId), name: r.name || 'まとめ買い割', amount });
  }
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const manual = lines.reduce((s, l) => s + l.manualDiscount, 0);
  const rule = discounts.reduce((s, d) => s + d.amount, 0);
  return { lines, discounts, subtotal, total: Math.max(0, subtotal - manual - rule) };
}

export const isEdited = s => (s.history || []).some(x => x.action === '編集');

export function summarize(sales) {
  const circles = new Map();
  let total = 0, count = 0;
  const get = (id, name) => {
    if (!circles.has(id)) circles.set(id, { circleId: id, name, items: new Map(), gross: 0, manual: 0, rule: 0 });
    return circles.get(id);
  };
  for (const s of sales) {
    if (s.status === 'cancelled') continue;
    count++;
    total += s.total;
    for (const l of s.lines) {
      const c = get(l.circleId, l.circleName);
      const it = c.items.get(l.productId) || { title: l.title, qty: 0, amount: 0 };
      it.qty += l.qty;
      it.amount += l.unitPrice * l.qty;
      c.items.set(l.productId, it);
      c.gross += l.unitPrice * l.qty;
      c.manual += l.manualDiscount || 0;
    }
    for (const d of s.discounts) get(d.circleId, d.circleName).rule += d.amount;
  }
  for (const c of circles.values()) c.net = c.gross - c.manual - c.rule;
  return { circles: [...circles.values()], total, count };
}

const cell = v => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// Excel で文字化けしないよう BOM を付ける
export const toCsv = rows => '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';

export function detailRows(sales) {
  const rows = [['会計番号', '日時', '状態', '編集あり', '種別', 'サークル', '名前', '単価', '数量', '金額']];
  for (const s of [...sales].sort((a, b) => a.no - b.no)) {
    const base = [s.no, fmtDateTime(s.createdAt), s.status === 'cancelled' ? '取消' : '有効', isEdited(s) ? 'あり' : ''];
    for (const l of s.lines) {
      rows.push([...base, '商品', l.circleName, l.title, l.unitPrice, l.qty, l.unitPrice * l.qty]);
      if (l.manualDiscount) rows.push([...base, '手動値引き', l.circleName, l.title, '', '', -l.manualDiscount]);
    }
    for (const d of s.discounts) rows.push([...base, 'まとめ買い割', d.circleName, d.name, '', '', -d.amount]);
  }
  return rows;
}

export function summaryRows(sum) {
  const rows = [['サークル', '商品', '数量', '金額']];
  for (const c of sum.circles) {
    for (const it of c.items.values()) rows.push([c.name, it.title, it.qty, it.amount]);
    if (c.rule) rows.push([c.name, 'まとめ買い割', '', -c.rule]);
    if (c.manual) rows.push([c.name, '手動値引き', '', -c.manual]);
    rows.push([c.name, 'サークル計', '', c.net]);
  }
  rows.push(['合計', `会計 ${sum.count} 件`, '', sum.total]);
  return rows;
}
