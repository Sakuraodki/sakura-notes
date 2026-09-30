// SakuraNotes のコメント API（Cloudflare Workers + D1 + Turnstile）
//
// 公開 API
//   GET  /comments?page=<記事のスラッグ>     承認済みコメントの一覧
//   POST /comments                          コメントを投稿（ふつうはすぐ公開。要注意ワードを含むものだけ承認待ち）
// 管理 API（Authorization: Bearer <ADMIN_PASSWORD>）
//   GET  /admin/comments?status=pending|approved
//   POST /admin/comments/<id>/approve       承認して公開
//   POST /admin/comments/<id>/unpublish     公開を取り消して承認待ちに戻す
//   POST /admin/comments/<id>/delete        削除
//   POST /admin/comments/<id>/ban           削除して、同じ投稿者（IPのハッシュ）を今後ブロック
//
// 必要な設定
//   D1 バインディング   DB
//   シークレット         TURNSTILE_SECRET（Turnstile のシークレットキー）, ADMIN_PASSWORD（管理ページのパスワード）
//   変数                 ALLOWED_ORIGINS（コメントを受け付けるサイトのオリジン。カンマ区切り）
//   任意のシークレット   DISCORD_WEBHOOK_URL（新しいコメントを Discord に通知する Webhook の URL）
//
// プライバシー: IP アドレスはそのまま保存せず、ランダムな salt 付きのハッシュだけを保存します（連投制限とブロックのため）。

const LIMITS = {
  nameMax: 30,
  bodyMax: 1000,
  bodyMaxLines: 30,
  minIntervalSec: 60,     // 同じ人が続けて投稿できる間隔
  perDay: 10,             // 同じ人が1日に投稿できる数
  pendingMax: 300,        // 承認待ちがこれ以上たまったら受付を止める（大量投稿対策）
  loginFailMax: 10,       // 管理ページのパスワード間違いの上限（15分あたり）
};

// 承認待ちの一覧で目立たせる言葉（荒らし・攻撃的な表現の目安）
const NG_WORDS = ['死ね', 'しね', '殺す', 'ころす', '消えろ', 'きえろ', 'ゴミ', 'カス', 'クズ', 'ブス', 'キモい', 'きもい', 'ガイジ', '池沼', 'fuck', 'shit'];

const URL_PATTERN = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|jp|io|xyz|info|ru|cn|top|site|online|link|ly)\b)/i;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowed = allowedOrigins(env);
    const cors = corsHeaders(allowed.includes(origin) ? origin : '');

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      await ensureSchema(env.DB);
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (path === '/comments' && request.method === 'GET') return listPublic(url, env, cors);
      if (path === '/comments' && request.method === 'POST') {
        if (!allowed.includes(origin)) return json({ error: 'このサイトからは投稿できません。' }, 403, cors);
        return postComment(request, env, cors, ctx);
      }
      if (path.startsWith('/admin/')) return admin(request, env, cors, path, url);
      if (path === '/') return json({ ok: true, service: 'sakura-comments' }, 200, cors);
      return json({ error: 'not found' }, 404, cors);
    } catch (err) {
      console.error(err);
      return json({ error: 'サーバーでエラーが起きました。時間をおいてもう一度お試しください。' }, 500, cors);
    }
  },
};

// ---------- 公開 API ----------

async function listPublic(url, env, cors) {
  const page = url.searchParams.get('page') || '';
  if (!isValidPage(page)) return json({ error: 'page が不正です。' }, 400, cors);
  const { results } = await env.DB.prepare(
    `SELECT id, name, body, created_at FROM comments WHERE page = ? AND status = 'approved' ORDER BY created_at ASC LIMIT 500`
  ).bind(page).all();
  return json({ comments: results.map(publicShape) }, 200, { ...cors, 'Cache-Control': 'public, max-age=30' });
}

async function postComment(request, env, cors, ctx) {
  let data;
  try { data = await request.json(); } catch { return json({ error: '送信内容が読み取れませんでした。' }, 400, cors); }

  const page = String(data.page || '');
  const name = clean(String(data.name || '')).slice(0, LIMITS.nameMax).trim() || '名無しさん';
  const body = clean(String(data.body || '')).trim();
  const token = String(data.token || '');

  // ハニーポット（人には見えない入力欄）に何か入っていればボットとみなし、保存せず成功したふりをする
  if (data.website) return json({ ok: true, status: 'pending' }, 200, cors);

  if (!isValidPage(page)) return json({ error: '投稿先が不正です。' }, 400, cors);
  if (!body) return json({ error: 'コメントを入力してください。' }, 400, cors);
  if (body.length > LIMITS.bodyMax) return json({ error: `コメントは${LIMITS.bodyMax}文字以内で書いてください。` }, 400, cors);
  if (body.split('\n').length > LIMITS.bodyMaxLines) return json({ error: '改行が多すぎます。' }, 400, cors);
  if (URL_PATTERN.test(body) || URL_PATTERN.test(name)) return json({ error: 'URL（リンク）は書き込めません。' }, 400, cors);

  if (!env.TURNSTILE_SECRET) return json({ error: 'コメント機能の設定が終わっていません。' }, 503, cors);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const human = await verifyTurnstile(token, ip, env.TURNSTILE_SECRET);
  if (!human) return json({ error: 'ボットではないことの確認に失敗しました。もう一度お試しください。' }, 400, cors);

  const ipHash = await hashIp(env.DB, ip);
  const now = Math.floor(Date.now() / 1000);

  // ブロック済みの投稿者は、保存せず成功したふりをする（荒らしに気づかせない）
  const banned = await env.DB.prepare('SELECT 1 FROM bans WHERE ip_hash = ?').bind(ipHash).first();
  if (banned) return json({ ok: true, status: 'pending' }, 200, cors);

  const recent = await env.DB.prepare(
    'SELECT MAX(created_at) AS last, COUNT(*) AS n FROM comments WHERE ip_hash = ? AND created_at > ?'
  ).bind(ipHash, now - 86400).first();
  if (recent && recent.last && now - recent.last < LIMITS.minIntervalSec) {
    return json({ error: '続けて投稿できません。少し時間をおいてください。' }, 429, cors);
  }
  if (recent && recent.n >= LIMITS.perDay) return json({ error: '今日はこれ以上投稿できません。' }, 429, cors);

  const dup = await env.DB.prepare(
    'SELECT 1 FROM comments WHERE ip_hash = ? AND body = ? AND created_at > ?'
  ).bind(ipHash, body, now - 86400).first();
  if (dup) return json({ error: '同じコメントがすでに送信されています。' }, 409, cors);

  const pending = await env.DB.prepare(`SELECT COUNT(*) AS n FROM comments WHERE status = 'pending'`).first();
  if (pending && pending.n >= LIMITS.pendingMax) return json({ error: '現在コメントを受け付けていません。' }, 503, cors);

  // 要注意ワードを含むものだけ承認待ちにして、それ以外はすぐ公開する
  const flagged = NG_WORDS.some((w) => (body + ' ' + name).toLowerCase().includes(w.toLowerCase())) ? 1 : 0;
  const status = flagged ? 'pending' : 'approved';
  const res = await env.DB.prepare(
    `INSERT INTO comments (page, name, body, status, flagged, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(page, name, body, status, flagged, ipHash, now).run();

  if (env.DISCORD_WEBHOOK_URL) {
    const task = notifyDiscord(env.DISCORD_WEBHOOK_URL, { page, name, body, status, origin: request.headers.get('Origin') || '' })
      .catch((err) => console.error('discord', err));
    if (ctx && ctx.waitUntil) ctx.waitUntil(task); else await task;
  }

  return json({ ok: true, status, id: res.meta && res.meta.last_row_id }, 201, cors);
}

// ---------- 管理 API ----------

async function admin(request, env, cors, path, url) {
  if (!env.ADMIN_PASSWORD) return json({ error: '管理パスワードが設定されていません。' }, 503, cors);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ipHash = await hashIp(env.DB, ip);
  const now = Math.floor(Date.now() / 1000);

  const fails = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE ip_hash = ? AND created_at > ?')
    .bind(ipHash, now - 900).first();
  if (fails && fails.n >= LIMITS.loginFailMax) return json({ error: 'パスワードを間違えすぎました。15分ほど待ってください。' }, 429, cors);

  const auth = request.headers.get('Authorization') || '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!(await safeEqual(given, env.ADMIN_PASSWORD))) {
    await env.DB.prepare('INSERT INTO login_failures (ip_hash, created_at) VALUES (?, ?)').bind(ipHash, now).run();
    await env.DB.prepare('DELETE FROM login_failures WHERE created_at < ?').bind(now - 86400).run();
    return json({ error: 'パスワードが違います。' }, 401, cors);
  }

  if (path === '/admin/comments' && request.method === 'GET') {
    const status = url.searchParams.get('status') === 'approved' ? 'approved' : 'pending';
    const { results } = await env.DB.prepare(
      `SELECT id, page, name, body, status, flagged, ip_hash, created_at FROM comments WHERE status = ? ORDER BY created_at DESC LIMIT 200`
    ).bind(status).all();
    return json({
      comments: results.map((c) => ({ ...publicShape(c), page: c.page, status: c.status, flagged: !!c.flagged, author: c.ip_hash.slice(0, 8) })),
    }, 200, { ...cors, 'Cache-Control': 'no-store' });
  }

  const m = path.match(/^\/admin\/comments\/(\d+)\/(approve|unpublish|delete|ban)$/);
  if (m && request.method === 'POST') {
    const id = Number(m[1]);
    const action = m[2];
    const row = await env.DB.prepare('SELECT id, ip_hash FROM comments WHERE id = ?').bind(id).first();
    if (!row) return json({ error: 'コメントが見つかりません。' }, 404, cors);
    if (action === 'approve') await env.DB.prepare(`UPDATE comments SET status = 'approved' WHERE id = ?`).bind(id).run();
    if (action === 'unpublish') await env.DB.prepare(`UPDATE comments SET status = 'pending' WHERE id = ?`).bind(id).run();
    if (action === 'delete') await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
    if (action === 'ban') {
      await env.DB.prepare('INSERT OR IGNORE INTO bans (ip_hash, created_at) VALUES (?, ?)').bind(row.ip_hash, now).run();
      await env.DB.prepare(`DELETE FROM comments WHERE ip_hash = ? AND (id = ? OR status = 'pending')`).bind(row.ip_hash, id).run();
    }
    return json({ ok: true }, 200, cors);
  }

  return json({ error: 'not found' }, 404, cors);
}

// ---------- 下まわり ----------

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page TEXT NOT NULL,
      name TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      flagged INTEGER NOT NULL DEFAULT 0,
      ip_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_comments_page ON comments (page, status, created_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_comments_ip ON comments (ip_hash, created_at)'),
    db.prepare('CREATE TABLE IF NOT EXISTS bans (ip_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS login_failures (ip_hash TEXT NOT NULL, created_at INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'),
  ]);
  schemaReady = true;
}

let saltCache = '';
async function hashIp(db, ip) {
  if (!saltCache) {
    const row = await db.prepare(`SELECT value FROM meta WHERE key = 'salt'`).first();
    if (row) saltCache = row.value;
    else {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const salt = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      await db.prepare(`INSERT OR IGNORE INTO meta (key, value) VALUES ('salt', ?)`).bind(salt).run();
      const again = await db.prepare(`SELECT value FROM meta WHERE key = 'salt'`).first();
      saltCache = again.value;
    }
  }
  return sha256(saltCache + ':' + ip);
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function safeEqual(a, b) {
  // 長さや中身の違いで処理時間が変わらないよう、ハッシュ同士を比べる
  const [x, y] = await Promise.all([sha256('cmp:' + a), sha256('cmp:' + b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0 && a.length > 0;
}

async function notifyDiscord(webhook, c) {
  const base = c.origin === 'https://sakuraodki.github.io' ? 'https://sakuraodki.github.io/sakura-notes' : c.origin;
  const head = c.status === 'pending' ? '⚠️ 要注意ワードを含むコメント（承認待ち）' : '💬 新しいコメント（公開済み）';
  const text = c.body.length > 800 ? c.body.slice(0, 800) + '…' : c.body;
  const content = `${head}\n**${c.name}** — ${base}/posts/${c.page}/#comments\n>>> ${text}\n\n管理ページ: ${base}/admin/`;
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // allowed_mentions を空にして、@everyone などのメンションが飛ばないようにする
    body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: [] } }),
  });
  if (!res.ok) throw new Error('discord webhook ' + res.status);
}

async function verifyTurnstile(token, ip, secret) {
  if (!token) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const out = await res.json();
  return out.success === true;
}

function clean(s) {
  // 制御文字（改行・タブ以外）と、見えない文字を取り除く
  return s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g, '');
}

function isValidPage(p) {
  return /^[a-z0-9][a-z0-9-]{0,99}$/.test(p);
}

function publicShape(c) {
  return { id: c.id, name: c.name, body: c.body, createdAt: new Date(c.created_at * 1000).toISOString() };
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}
