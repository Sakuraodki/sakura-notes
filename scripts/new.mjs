// 新しい記事・ひとことのファイルを作ります。
//   npm run new:note -- "いま気づいたこと"          → content/notes/2026-09-28-2140.md
//   npm run new:post -- my-first-post "タイトル"    → content/posts/my-first-post.md

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [type, ...args] = process.argv.slice(2);

const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
const pad = (n) => String(n).padStart(2, '0');
const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

function save(rel, text) {
  const file = path.join(root, rel);
  if (fs.existsSync(file)) { console.error(`すでに存在します: ${rel}`); process.exit(1); }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  console.log(`✓ 作成しました: ${rel}`);
}

if (type === 'note') {
  const body = args.join(' ') || 'ここに気づいたことを書く';
  save(`content/notes/${date}-${time.replace(':', '')}.md`, `---\ndate: ${date} ${time}\ntags: []\n---\n\n${body}\n`);
} else if (type === 'post') {
  const [slug, ...rest] = args;
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    console.error('URL 用の名前を半角英数字とハイフンで指定してください。例: npm run new:post -- my-first-post "タイトル"');
    process.exit(1);
  }
  const title = rest.join(' ') || 'タイトル';
  save(`content/posts/${slug}.md`, `---\ntitle: ${title}\ndate: ${date}\ntags: []\ndescription: \n---\n\n## 見出し\n\n本文を書く。\n`);
} else {
  console.error('使い方: npm run new:note -- "本文"  /  npm run new:post -- slug "タイトル"');
  process.exit(1);
}
