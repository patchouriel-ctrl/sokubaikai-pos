// 画面づくりの共通部品
export const TEST = new URLSearchParams(location.search).has('test');

// 画面の切り替え状態。render は main.js が差し込む。
export const nav = { view: 'listen', render: () => {} };

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  // select の値は選択肢を入れたあとで設定する
  if (value !== undefined) el.value = value;
  return el;
}

const ICONS = {
  play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
  pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/>',
  prev: '<path d="M6 6h2v12H6zM9.5 12 18 18V6z" fill="currentColor"/>',
  next: '<path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" fill="currentColor"/>',
  close: '<path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  back: '<path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  gear: '<circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
};
export function icon(name) {
  const t = document.createElement('template');
  t.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">${ICONS[name]}</svg>`;
  return t.content.firstChild;
}

export const yen = n => `${(n || 0).toLocaleString('ja-JP')}円`;

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

const pad = n => String(n).padStart(2, '0');
export function fmtDateTime(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fmtTime(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

let toastTimer;
export function toast(msg, ms = 2500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

// buttons: [{ label, primary, danger, onClick }]。onClick が false を返したら閉じない。
export function modal(title, body, buttons) {
  const back = h('div', { class: 'modal-back' });
  const close = () => back.remove();
  back.append(
    h('div', { class: 'modal' },
      title ? h('h2', {}, title) : null,
      h('div', { class: 'modal-body' }, body),
      h('div', { class: 'modal-buttons' },
        buttons.map(b =>
          h('button', {
            class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''),
            onclick: async () => { if ((await b.onClick?.()) !== false) close(); },
          }, b.label)))));
  document.body.append(back);
  return close;
}

// 数字だけの入力。iPad には数字だけのキーボードがないので、画面上のテンキーで入れる。
// 決定で数値（allowEmpty なら空欄は null）、やめたら undefined を返す。
export function keypad(title, value, { allowEmpty = false, emptyLabel = '空欄', unit = '' } = {}) {
  return new Promise(resolve => {
    let text = value == null ? '' : String(value);
    let done = false;
    let fresh = true; // 開いて最初の数字は、前の値を置き換える
    const show = h('div', { class: 'kp-show' });
    const draw = () => {
      show.replaceChildren(text === '' ? h('span', { class: 'muted' }, allowEmpty ? emptyLabel : '0') : Number(text).toLocaleString('ja-JP'), unit && text !== '' ? h('small', {}, unit) : null);
    };
    const press = k => {
      if (k === '⌫') text = text.slice(0, -1);
      else if (k === 'C') text = '';
      else {
        if (fresh) text = '';
        if (text.length < 9) text = (text + k).replace(/^0+(?=\d)/, '');
      }
      fresh = false;
      draw();
    };
    const finish = v => {
      if (done) return;
      done = true;
      removeEventListener('keydown', onKey, true);
      close();
      resolve(v);
    };
    const result = () => (text === '' ? (allowEmpty ? null : 0) : parseInt(text, 10));
    const onKey = e => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('⌫');
      else if (e.key === 'Enter') finish(result());
      else if (e.key === 'Escape') finish(undefined);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    addEventListener('keydown', onKey, true);
    draw();
    const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '⌫'];
    const close = modal(title, h('div', { class: 'kp' },
      show,
      h('div', { class: 'kp-keys' }, keys.map(k => h('button', { class: 'btn kp-key' + (k === 'C' || k === '⌫' ? ' sub' : ''), onclick: () => press(k) }, k)))), [
      allowEmpty ? { label: `${emptyLabel}にする`, onClick: () => { finish(null); return false; } } : null,
      { label: 'やめる', onClick: () => { finish(undefined); return false; } },
      { label: '決定', primary: true, onClick: () => { finish(result()); return false; } },
    ].filter(Boolean));
  });
}

// 数字の欄。押すとテンキーが開く。onchange には数値（allowEmpty なら null も）が渡る。
export function numField({ value, title, placeholder = '', allowEmpty = false, emptyLabel, unit, cls = 'num-input', onchange }) {
  const label = v => (v == null || v === '' ? h('span', { class: 'ph-text' }, placeholder) : Number(v).toLocaleString('ja-JP'));
  const btn = h('button', { type: 'button', class: 'num-field ' + cls, onclick: async () => {
    const v = await keypad(title || placeholder || '数字を入力', value, { allowEmpty, emptyLabel: emptyLabel || placeholder || '空欄', unit });
    if (v === undefined) return;
    value = v;
    btn.replaceChildren(label(v));
    onchange(v);
  } }, label(value));
  return btn;
}

// ファイル選択。テスト時は window.__nextFiles に入れたファイルを返す。
export function pickFiles(accept, multiple = false) {
  if (TEST && window.__nextFiles) {
    const files = window.__nextFiles;
    window.__nextFiles = null;
    return Promise.resolve(files);
  }
  return new Promise(resolve => {
    const input = h('input', { type: 'file', accept, multiple, style: 'display:none' });
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

// 共有メニュー（「ファイル」・Google ドライブ・LINE など）で書き出す。使えなければダウンロード。
export async function shareFile(blob, name) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

// 時間のかかる作成のあとは、改めてボタンを押してもらってから共有する（iPad の制限対策）
export function offerFile(blob, name) {
  modal('書き出しの準備ができました', h('p', {}, name), [
    { label: 'やめる' },
    { label: '保存・共有する', primary: true, onClick: () => shareFile(blob, name) },
  ]);
}
