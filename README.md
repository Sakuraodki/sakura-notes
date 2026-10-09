# SakuraNotes

日々の気づきを残すブログ。Markdown で書いて GitHub に push すると、GitHub Pages に自動で公開されます。
外部パッケージは使っていません（Node.js だけで動きます）。

公開ページ: https://sakuraodki.github.io/sakura-notes/

---

## はじめて公開するまで

### 1. GitHub にリポジトリを作る

GitHub で **New repository** を開き、次のように作ります。

- **Repository name**
  - `ユーザー名.github.io` にすると → `https://ユーザー名.github.io/`
  - それ以外（例: `sakura-notes`）にすると → `https://ユーザー名.github.io/sakura-notes/`
- **Public** を選ぶ
- README などは追加しない（空のまま作る）

どちらの名前でもそのまま動きます（公開先のパスは自動で設定されます）。

### 2. このフォルダを push する

このフォルダでターミナル（PowerShell）を開いて、次を実行します。
`ユーザー名` と `リポジトリ名` は自分のものに置き換えてください。

```powershell
git init
git add .
git commit -m "SakuraNotes をはじめる"
git branch -M main
git remote add origin https://github.com/ユーザー名/リポジトリ名.git
git push -u origin main
```

GitHub Desktop を使う場合は、File → Add local repository でこのフォルダを選び、Publish repository でも OK です。

### 3. GitHub Pages を GitHub Actions で公開する設定にする

リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします。

### 4. 公開を待つ

**Actions** タブで「Deploy to GitHub Pages」が緑になったら公開完了です（1〜2分）。
次からは push するたびに自動で更新されます。

---

## 書き方

### 記事 — `content/posts/好きな名前.md`

ファイル名がそのまま URL になります（`/posts/好きな名前/`）。半角英数字とハイフンがおすすめです。

```markdown
---
title: 小さく作って、早く見せる
date: 2026-09-27
tags: [開発, 振り返り]
description: 一覧に出る要約と、記事の最初に出るリード文（省略可）
---

## 見出し

本文。**太字**、[リンク](https://example.com)、`コード` が使えます。

> 引用

- 箇条書き
1. 番号つき

![画像の説明](/images/photo.jpg)
```

- `## 見出し` は番号つきの見出しになり、記事の左側に目次が自動で出ます
- `draft: true` を書くと公開されません（下書き）
- `cover: /images/cover.jpg` で記事のトップ画像

### ひとこと — `content/notes/好きな名前.md`

```markdown
---
date: 2026-09-28 21:40
tags: [デザイン]
---

機能から形が決まっているものは、ずっと見ていても疲れない。
```

ファイル名は `2026-09-28-2140.md` のように日時にしておくと管理しやすいです。

### スマホから投稿する

GitHub のアプリか github.com でリポジトリを開き、`content/notes` フォルダで **Add file → Create new file** から上の形式で書いてコミットすれば公開されます。

### コマンドでファイルを作る

```powershell
npm run new:note -- "いま気づいたこと"
npm run new:post -- my-post "記事のタイトル"
```

### 画像

`public/images/` に置いて、本文で `![説明](/images/ファイル名.jpg)` と書きます。

### 動画

`public/videos/` に置いて、画像と同じく `![説明](/videos/ファイル名.mp4)` と書きます（.mp4 / .webm / .mov）。X のように角丸のカードで表示され、画面に見えている間だけ音なしで自動再生します。右下のボタンで音声をオン、動画をタップすると音声つきの全画面になります。端末で「視差効果を減らす」などの設定がオンの人には、自動再生せず普通のプレーヤーで表示します。

GitHub は 1 ファイル 100MB が上限（50MB から警告）で、サイト全体も 1GB 以内が目安です。数 MB〜十数 MB の短い動画にしてください。iPhone で撮った動画は、書き出すときに「互換性優先」（H.264）にしておくとどのブラウザでも再生できます。

---

## 手元で確認する

Node.js 18 以上が必要です。

```powershell
npm run dev
```

→ http://localhost:4321 を開きます。ファイルを保存すると自動でビルドし直すので、ブラウザを再読み込みしてください。

---

## 閲覧数（GoatCounter）

1. https://www.goatcounter.com/ でアカウントを作る（個人の非商用利用なら無料）
   - 登録時の **Code** が `https://○○○.goatcounter.com` の ○○○ になります
2. `site.config.mjs` の `goatcounter: ''` に、その Code を入れて push
3. GoatCounter の **Settings** で **Allow adding visitor counts on your website** をオンにして保存

これで計測が始まり、ホームの「閲覧数」、記事の「VIEWS」、フッターの「TOTAL VIEWS」に数字が出ます。
GoatCounter 側のキャッシュで、反映まで最大 4 時間ほどかかることがあります。空のままなら閲覧数の表示は出ません。

---

## コメント機能

記事ページの下に、匿名で書き込めるコメント欄があります（ひとことにはありません）。
コメントはふつうは **すぐに公開** されます。暴言などの要注意ワードを含むものだけ、管理者が承認するまで公開されません。
新しいコメントが来ると Discord に通知できます（下の「Discord 通知」）。

### 荒らし対策

- **Cloudflare Turnstile**：ボットかどうかを自動で判定します（画像選びなどは基本的に出ません）
- **連投制限**：同じ人は 60 秒に 1 回、1 日 10 回まで
- **URL 禁止**：リンクを含むコメントは受け付けません
- **要注意ワード**：暴言などを含むコメントは自動で「承認待ち」になり、管理ページで赤く表示されます
- **ブロック**：「削除してブロック」で、同じ投稿者からのコメントを今後受け付けません（本人には分からない形で捨てます）
- **ハニーポット**：人には見えない入力欄に書き込むボットを除外します
- IP アドレスはそのまま保存せず、ランダムな値を混ぜたハッシュだけを保存します

### 管理ページ

`https://sakuraodki.github.io/sakura-notes/admin/` を開き、管理パスワードでログインします。
「承認待ち」から **承認して公開 / 削除 / 削除してブロック**、「公開中」から **非公開に戻す / 削除 / 削除してブロック** を選べます。
荒らしが来たら「公開中」で「削除してブロック」を押してください。

### Discord 通知

1. Discord で自分用のサーバーのチャンネルを開き、**チャンネルの編集 → 連携サービス → ウェブフック → 新しいウェブフック** を作って **URL をコピー**
2. Cloudflare の Worker（sakura-comments）の **Settings → Variables and Secrets → Add** で、環境は **Production**、Key を `DISCORD_WEBHOOK_URL`、Value にコピーした URL を入れて **Secret** にチェックして保存

コメントが来るたびに、そのチャンネルに本文と記事へのリンクが届きます。
（このページは検索エンジンに載らない設定で、ナビゲーションにも出していません）

### 仕組み

- `comments-worker/` … コメントを保存・配信する API（Cloudflare Workers + D1）
- `public/assets/comments.js` … 記事ページのコメント欄
- `public/assets/admin.js` … 管理ページ
- `site.config.mjs` の `comments.api` と `comments.turnstileSiteKey` が両方入っているときだけ、コメント欄と管理ページが作られます

---

## 設定

`site.config.mjs` でサイト名・キャッチコピー・説明文・アクセントカラー・1ページの表示件数などを変えられます。
About ページの中身は `content/about.md` です。

## ファイル構成

```
content/
  posts/      記事
  notes/      ひとこと
  about.md    About ページ
public/
  assets/     スタイル（style.css）と動き（app.js）
  images/     画像置き場
comments-worker/  コメント API（Cloudflare Workers）
scripts/
  build.mjs   サイトを dist/ に書き出す
  markdown.mjs  Markdown の変換
  dev.mjs     手元確認用サーバー
  new.mjs     新規ファイル作成
site.config.mjs  設定
.github/workflows/deploy.yml  GitHub Pages への自動公開
```
