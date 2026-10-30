// 売上の集計・会計の履歴（取消・編集）・CSV 書き出し
import { h, nav, yen, fmtTime, fmtDateTime, shareFile, stamp } from './ui.js';
import { state, save, currentEvent } from './store.js';
import { summarize, toCsv, detailRows, summaryRows, isEdited } from './logic.js';
import { startEdit } from './register.js';
import { setStaffTab } from './staff.js';

let viewEventId = null;

export function renderSales() {
  const events = [...state.events].sort((a, b) => (a.date < b.date ? 1 : -1));
  const ev = state.events.find(e => e.id === viewEventId) || currentEvent() || events[0];
  if (!ev) return h('div', { class: 'empty' }, 'イベントがまだありません。');
  const sales = state.sales.filter(s => s.eventId === ev.id).sort((a, b) => b.no - a.no);
  const sum = summarize(sales);
  const safeName = ev.name.replace(/[\\/:*?"<>|]/g, '_');

  return h('div', { class: 'page' },
    h('div', { class: 'actions' },
      h('select', { value: ev.id, onchange: e => { viewEventId = e.target.value; nav.render(); } },
        events.map(e => h('option', { value: e.id }, `${e.name}（${e.date}）`))),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => shareFile(new Blob([toCsv(summaryRows(sum))], { type: 'text/csv' }), `売上集計_${safeName}_${stamp()}.csv`) }, '集計を CSV で書き出す'),
      h('button', { class: 'btn', onclick: () => shareFile(new Blob([toCsv(detailRows(sales))], { type: 'text/csv' }), `売上明細_${safeName}_${stamp()}.csv`) }, '明細を CSV で書き出す')),
    h('section', { class: 'card' },
      h('div', { class: 'sum-head' }, h('h2', {}, '集計'), h('div', {}, `会計 ${sum.count} 件　`, h('strong', { class: 'sum-total' }, yen(sum.total)))),
      sum.circles.length ? h('table', { class: 'table sum' },
        h('thead', {}, h('tr', {}, h('th', {}, 'サークル・商品'), h('th', {}, '数量'), h('th', {}, '金額'))),
        sum.circles.map(c => h('tbody', {},
          h('tr', { class: 'circle-row' }, h('td', { colSpan: 2 }, c.name), h('td', {}, yen(c.net))),
          [...c.items.values()].map(it => h('tr', {}, h('td', {}, it.title), h('td', {}, it.qty), h('td', {}, yen(it.amount)))),
          c.rule ? h('tr', { class: 'minus' }, h('td', {}, 'まとめ買い割'), h('td', {}), h('td', {}, `−${yen(c.rule)}`)) : null,
          c.manual ? h('tr', { class: 'minus' }, h('td', {}, '手動値引き'), h('td', {}), h('td', {}, `−${yen(c.manual)}`)) : null))) : h('p', { class: 'muted' }, 'まだ会計がありません。')),
    h('section', { class: 'card' },
      h('h2', {}, '会計の履歴'),
      h('div', { class: 'rows' }, sales.map(s => saleRow(s)))));
}

function saleRow(s) {
  const cancelled = s.status === 'cancelled';
  return h('div', { class: 'sale' + (cancelled ? ' cancelled' : '') },
    h('div', { class: 'sale-head' },
      h('strong', {}, `#${s.no}`),
      h('span', {}, fmtTime(s.createdAt)),
      cancelled ? h('span', { class: 'badge red' }, '取消済み') : null,
      isEdited(s) ? h('span', { class: 'badge' }, '編集あり') : null,
      h('span', { class: 'grow' }),
      h('strong', {}, yen(s.total)),
      cancelled
        ? h('button', { class: 'btn small', onclick: () => setStatus(s, 'ok', '取消を戻す') }, '取消を戻す')
        : [h('button', { class: 'btn small', onclick: () => { if (startEdit(s)) { setStaffTab('register'); nav.render(); } } }, '直す'),
           h('button', { class: 'btn small danger', onclick: () => { if (confirm(`会計 #${s.no}（${yen(s.total)}）を取り消しますか？ 記録は「取消済み」として残ります。`)) setStatus(s, 'cancelled', '取消'); } }, '取消')]),
    h('div', { class: 'sale-lines' },
      s.lines.map(l => `${l.title} ×${l.qty}`).join('、'),
      s.discounts.length || s.lines.some(l => l.manualDiscount) ? h('small', {}, '（値引きあり）') : null),
    s.history?.length ? h('details', {},
      h('summary', {}, `変更履歴（${s.history.length} 件）`),
      s.history.map(x => h('div', { class: 'hist' },
        `${fmtDateTime(x.at)} ${x.action}`,
        x.before ? `：変更前 ${x.before.lines.map(l => `${l.title} ×${l.qty}`).join('、')} 合計 ${yen(x.before.total)}` : ''))) : null);
}

async function setStatus(s, status, action) {
  s.status = status;
  s.history = [...(s.history || []), { at: new Date().toISOString(), action }];
  await save('sales', s);
  nav.render();
}
