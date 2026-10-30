// 無圧縮の zip を作る・読む（バックアップ用。外部ライブラリは使わない）
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// entries: [{ name, data: Uint8Array | Blob }]
export async function makeZip(entries) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const bytes = e.data instanceof Blob ? new Uint8Array(await e.data.arrayBuffer()) : e.data;
    const crc = crc32(bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // ファイル名は UTF-8
    local.setUint16(8, 0, true); // 無圧縮
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, name.length, true);
    parts.push(local.buffer, name, e.data instanceof Blob ? e.data : bytes);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, bytes.length, true);
    cd.setUint32(24, bytes.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(cd.buffer, name);
    offset += 30 + name.length + bytes.length;
  }
  const cdSize = central.reduce((s, p) => s + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

// このアプリが作った（無圧縮の）zip だけを読む。戻り値は Map(名前 → Blob)
export async function readZip(blob) {
  const tailSize = Math.min(blob.size, 22 + 65535);
  const tail = new DataView(await blob.slice(blob.size - tailSize).arrayBuffer());
  let p = -1;
  for (let i = tailSize - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { p = i; break; }
  if (p < 0) throw new Error('zip ファイルではありません');
  const count = tail.getUint16(p + 10, true);
  const cdSize = tail.getUint32(p + 12, true);
  const cdOffset = tail.getUint32(p + 16, true);
  const cd = new DataView(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const dec = new TextDecoder();
  const files = new Map();
  let q = 0;
  for (let i = 0; i < count; i++) {
    if (cd.getUint32(q, true) !== 0x02014b50) throw new Error('zip の中身が壊れています');
    const method = cd.getUint16(q + 10, true);
    const size = cd.getUint32(q + 20, true);
    const nameLen = cd.getUint16(q + 28, true);
    const extraLen = cd.getUint16(q + 30, true);
    const commentLen = cd.getUint16(q + 32, true);
    const localOffset = cd.getUint32(q + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, q + 46, nameLen));
    if (method !== 0) throw new Error('このアプリで書き出したバックアップではありません');
    const lh = new DataView(await blob.slice(localOffset, localOffset + 30).arrayBuffer());
    const start = localOffset + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    files.set(name, blob.slice(start, start + size));
    q += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
