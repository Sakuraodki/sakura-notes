# sakura-comments（コメント API）

SakuraNotes の匿名コメントを保存・配信する Cloudflare Workers の API です。
データは Cloudflare D1（SQLite）に保存します。
コメントはふつうはすぐ公開され、要注意ワードを含むものだけ承認待ちになります。テーブルは最初のアクセスで自動で作られます。

## 必要な設定（Cloudflare ダッシュボード）

1. **D1 データベース** `sakura-comments` を作り、その ID を `wrangler.toml` の `database_id` に書く
2. **Turnstile** のウィジェットを作る（ドメイン: `sakuraodki.github.io`、`localhost`）
   - サイトキー → ブログの `site.config.mjs` の `comments.turnstileSiteKey`
   - シークレットキー → Worker のシークレット `TURNSTILE_SECRET`
3. **Worker** `sakura-comments` をダッシュボードで作り（Hello World から）、`src/index.js` の中身に置き換えてデプロイ
   - GitHub 連携はしていないので、このファイルを変えたときはダッシュボードでコードを差し替えて再デプロイする
4. Worker の **Settings → Bindings** に D1 データベースを `DB` という名前で追加
5. Worker の **Settings → Variables and Secrets**（環境は **Production**）に次を追加
   - 変数 `ALLOWED_ORIGINS`：`https://sakuraodki.github.io,http://localhost:4321`
   - シークレット `TURNSTILE_SECRET`：Turnstile のシークレットキー
   - シークレット `ADMIN_PASSWORD`：管理ページのパスワード（長めのものにする）
   - シークレット `DISCORD_WEBHOOK_URL`（任意）：新しいコメントを通知する Discord の Webhook URL
6. Worker の URL（`https://sakura-comments.○○○.workers.dev`）を `site.config.mjs` の `comments.api` に書く

シークレットはファイルに書かず、必ずダッシュボードで設定してください。
