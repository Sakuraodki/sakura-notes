// 投稿に、身バレにつながる言葉（学校名・地名・本名など、自分で決めたもの）が入っていないかを調べます（依存パッケージなし）。
//   node scripts/check-private.mjs
// build.mjs からも呼ばれ、見つかったときはビルドを止めます（そのまま公開されないように）。
//
// 調べる言葉は、リポジトリには書かずに次のどちらかに置きます（両方あれば合わせて使います）。
//   - 環境変数 PRIVATE_WORDS        GitHub の Secrets に登録して、Actions から渡す
//   - ファイル .private-words       手元で確かめる用（.gitignore 済みなので公開されない）
// 1行に1つ（またはカンマ区切り）。# で始まる行は無視します。
// 結果に言葉そのものは出しません。GitHub Actions では場所（ファイル・行）も出しません。
// Actions のログは誰でも見られるので、場所が出ると「この行の言葉を隠したいのだな」と分かってしまうためです。
// 場所は、手元で .private-words を置いて実行すると表示されます。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 全角・半角や大文字・小文字の違いは同じものとして比べる
const norm = (s) => s.normalize('NFKC').toLowerCase();

export function loadPrivateWords(dir = root) {
  const src = [process.env.PRIVATE_WORDS || ''];
  const file = path.join(dir, '.private-words');
  if (fs.existsSync(file)) src.push(fs.readFileSync(file, 'utf8'));
  return [...new Set(
    src.join('\n').split(/[\n,]/).map((w) => w.trim()).filter((w) => w && !w.startsWith('#')).map(norm)
  )];
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// 見つかった場所の一覧を返す（[{ file, line, word }]。word は何番目の言葉か、1 から）
export function findPrivateWords(dir = root, words = loadPrivateWords(dir)) {
  if (!words.length) return [];
  const hits = [];
  const check = (file, text, lineNo) => {
    const t = norm(text);
    words.forEach((w, i) => { if (t.includes(w)) hits.push({ file, line: lineNo, word: i + 1 }); });
  };
  // 本文: content/ の Markdown とサイト設定
  const texts = [...walk(path.join(dir, 'content')).filter((f) => f.endsWith('.md')), path.join(dir, 'site.config.mjs')];
  for (const file of texts) {
    if (!fs.existsSync(file)) continue;
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, k) => check(file, line, k + 1));
  }
  // ファイル名: 画像や動画の名前に入っていることもあるので public/ と content/ の名前も見る
  for (const file of [...walk(path.join(dir, 'public')), ...walk(path.join(dir, 'content'))]) {
    check(file, path.relative(dir, file), 0);
  }
  return hits;
}

export function reportPrivateWords(hits, dir = root) {
  console.error('\n✋ 身バレにつながる言葉が見つかったので、止めました。');
  if (process.env.GITHUB_ACTIONS) {
    console.error('  （公開されるログなので、場所は表示しません。最近書いた投稿やファイル名を見直してください）\n');
    return;
  }
  for (const h of hits) {
    const where = h.line ? `${h.line} 行目` : 'ファイル名';
    console.error(`  - ${path.relative(dir, h.file)}（${where}）: 登録した言葉の ${h.word} 番目`);
  }
  console.error('\n  言い換えるか消してから、もう一度試してください。\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const words = loadPrivateWords();
  if (!words.length) {
    console.log('調べる言葉が登録されていません（PRIVATE_WORDS か .private-words）。チェックは行いませんでした。');
    process.exit(0);
  }
  const hits = findPrivateWords(root, words);
  if (hits.length) { reportPrivateWords(hits); process.exit(1); }
  console.log(`✓ 登録した ${words.length} 個の言葉は見つかりませんでした。`);
}
