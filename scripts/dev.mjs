// 手元でサイトを確認するための小さなサーバー。
//   npm run dev  →  http://localhost:4321
// content/ や public/ を保存すると自動でビルドし直します（ブラウザは手動で再読み込み）。

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT || 4321);

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
};

function build() {
  spawnSync(process.execPath, [path.join(root, 'scripts/build.mjs')], { stdio: 'inherit', env: { ...process.env, BASE_PATH: '' } });
}
build();

let timer;
for (const dir of ['content', 'public', 'site.config.mjs']) {
  const p = path.join(root, dir);
  if (!fs.existsSync(p)) continue;
  try {
    fs.watch(p, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(build, 150); });
  } catch {
    fs.watch(p, () => { clearTimeout(timer); timer = setTimeout(build, 150); });
  }
}

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(dist, url);
  if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'content-type': types['.html'] });
    fs.createReadStream(path.join(dist, '404.html')).pipe(res);
    return;
  }
  const type = types[path.extname(file).toLowerCase()] || 'application/octet-stream';
  // 動画のシーク（と Safari での再生）には Range リクエストへの対応が必要
  const size = fs.statSync(file).size;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) { res.writeHead(416, { 'content-range': `bytes */${size}` }).end(); return; }
    res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`\n▶ http://localhost:${port} で確認できます（終了は Ctrl + C）\n`));
