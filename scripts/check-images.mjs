// public/ にある画像・動画に撮影場所の位置情報（GPS）が残っていないかを調べます（依存パッケージなし）。
//   node scripts/check-images.mjs
// build.mjs からも呼ばれ、見つかったときはビルドを止めます（位置情報つきのまま公開されないように）。
// 対応: JPEG / PNG / WebP / HEIC / AVIF / TIFF（EXIF の GPS 情報）、MP4 / MOV（iPhone などが書く撮影場所）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MEDIA = /\.(jpe?g|png|webp|heic|heif|avif|tiff?|mp4|m4v|mov)$/i;
const VIDEO = /\.(mp4|m4v|mov)$/i;

// TIFF 形式の EXIF を読み、GPS の緯度か経度が入っていれば true
function tiffHasGps(buf, start) {
  if (start + 8 > buf.length) return false;
  const le = buf[start] === 0x49;
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const ifd = (off) => {
    const at = start + off;
    if (off < 8 || at + 2 > buf.length) return null;
    const n = u16(at);
    if (n === 0 || n > 512 || at + 2 + n * 12 > buf.length) return null;
    const tags = new Map();
    for (let k = 0; k < n; k++) {
      const e = at + 2 + k * 12;
      tags.set(u16(e), { count: u32(e + 4), value: u32(e + 8) });
    }
    return tags;
  };
  const ifd0 = ifd(u32(start + 4));
  const gpsPtr = ifd0?.get(0x8825);
  if (!gpsPtr) return false;
  const gps = ifd(gpsPtr.value);
  // 0x0002 = GPSLatitude, 0x0004 = GPSLongitude
  return !!gps && (gps.has(0x0002) || gps.has(0x0004));
}

// ファイルの形式に関係なく、埋め込まれた TIFF ヘッダ（II*\0 / MM\0*）を探して確かめる
function imageHasGps(buf) {
  for (let i = buf.indexOf('II*\0', 0, 'latin1'); i !== -1; i = buf.indexOf('II*\0', i + 1, 'latin1')) {
    if (tiffHasGps(buf, i)) return true;
  }
  for (let i = buf.indexOf('MM\0*', 0, 'latin1'); i !== -1; i = buf.indexOf('MM\0*', i + 1, 'latin1')) {
    if (tiffHasGps(buf, i)) return true;
  }
  return false;
}

// QuickTime / MP4 の撮影場所（©xyz や location の値に入る「+35.681+139.767/」のような ISO 6709 形式）
const ISO6709 = /[+-]\d{2}\.\d{3,}[+-]\d{3}\.\d{3,}/;
function videoHasGps(buf) {
  return buf.includes(Buffer.from([0xa9, 0x78, 0x79, 0x7a])) || ISO6709.test(buf.toString('latin1'));
}

export function hasLocation(file) {
  const buf = fs.readFileSync(file);
  return VIDEO.test(file) ? videoHasGps(buf) || imageHasGps(buf) : imageHasGps(buf);
}

export function findLocationFiles(dir) {
  const found = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (MEDIA.test(ent.name) && hasLocation(p)) found.push(p);
    }
  };
  walk(dir);
  return found;
}

export function reportLocationFiles(files, root) {
  console.error('\n✗ 撮影場所の位置情報（GPS）が入ったファイルがあります。このままだと誰でも場所を読み取れます:');
  for (const f of files) console.error('  - ' + path.relative(root, f).split(path.sep).join('/'));
  console.error('  位置情報を消してから置き直してください（iPhone なら共有時の「オプション」で「位置情報」をオフ）。\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const files = findLocationFiles(path.join(root, 'public'));
  if (files.length) { reportLocationFiles(files, root); process.exit(1); }
  console.log('✓ 位置情報の入った画像・動画はありません');
}
