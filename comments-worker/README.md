# sakura-comments（コメント API）

SakuraNotes の匿名コメントを保存・配信する Cloudflare Workers の API です。
データは Cloudflare D1（SQLite）に保存します。テーブルは最初のアクセスで自動で作られます。

## 必要な設定（Cloudflare ダッシュボード）

1. **D1 データベース** `sakura-comments` を作り、その ID を `wrangler.toml` の `database_id` に書く
2. **Turnstile** のウィジェットを作る（ドメイン: `sakuraodki.github.io`、`localhost`）
   - サイトキー → ブログの `site.config.mjs` の `comments.turnstileSiteKey`
   - シークレットキー → Worker のシークレット `TURNSTILE_SECRET`
3. **Worker** を GitHub リポジトリから作る（Root directory: `comments-worker`）
4. Worker の **Settings → Variables and Secrets** に次のシークレットを追加
   - `TURNSTILE_SECRET`：Turnstile のシークレットキー
   - `ADMIN_PASSWORD`：管理ページのパスワード（長めのものにする）
5. Worker の URL（`https://sakura-comments.○○○.workers.dev`）を `site.config.mjs` の `comments.api` に書く

シークレットはファイルに書かず、必ずダッシュボードで設定してください。
