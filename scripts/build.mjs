// SakuraNotes のビルドスクリプト（依存パッケージなし）
// content/ の Markdown を読み、dist/ に静的サイトを書き出します。
//   node scripts/build.mjs
// 環境変数:
//   BASE_PATH   サイトを置くパス（例: /sakura-notes）。GitHub Actions が自動で渡します。
//   SITE_ORIGIN サイトのオリジン（例: https://name.github.io）。RSS の絶対 URL に使います。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../site.config.mjs';
import { markdown, frontMatter, plainText, escapeHtml as esc } from './markdown.mjs';
import { findLocationFiles, reportLocationFiles } from './check-images.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const base = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const origin = (process.env.SITE_ORIGIN || '').replace(/\/+$/, '');
const u = (p) => base + p;
const resolveUrl = (url) => (url.startsWith('/') && !url.startsWith('//') ? base + url : url);
const gc = String(config.goatcounter || '').trim();
const commentApi = String(config.comments?.api || '').trim().replace(/\/+$/, '');
const turnstileKey = String(config.comments?.turnstileSiteKey || '').trim();
const commentsOn = !!(commentApi && turnstileKey);

const DOWS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const pad = (n) => String(n).padStart(2, '0');

// ---------- 読み込み ----------

function parseDate(value, fallbackName) {
  const src = [value, fallbackName].filter(Boolean).map(String);
  for (const s of src) {
    const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T_-]?(\d{1,2}):?(\d{2}))?/);
    if (m) {
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const hh = m[4] != null ? Number(m[4]) : null;
      const mm = m[5] != null ? Number(m[5]) : null;
      const dow = DOWS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
      return {
        y, m: mo, d, hh, mm, dow,
        iso: `${y}-${pad(mo)}-${pad(d)}`,
        month: `${y}-${pad(mo)}`,
        short: `${pad(mo)}.${pad(d)}`,
        full: `${y}.${pad(mo)}.${pad(d)}`,
        time: hh != null ? `${pad(hh)}:${pad(mm)}` : '',
        sort: `${y}${pad(mo)}${pad(d)}${hh != null ? pad(hh) + pad(mm) : '0000'}`,
        rfc: new Date(Date.UTC(y, mo - 1, d, (hh ?? 0) - 9, mm ?? 0)).toUTCString(),
      };
    }
  }
  return null;
}

function readDir(dir) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort();
}

function toTags(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[,、\s]+/);
  return [...new Set(arr.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean))];
}

const problems = [];

function load(type) {
  const dir = type === 'post' ? 'content/posts' : 'content/notes';
  return readDir(dir).flatMap((file) => {
    const raw = fs.readFileSync(path.join(root, dir, file), 'utf8');
    const { data, body } = frontMatter(raw);
    if (data.draft === true) return [];
    const name = file.replace(/\.md$/, '');
    const date = parseDate(data.date, name);
    if (!date) { problems.push(`${dir}/${file}: 日付が読めません（date: 2026-09-28 のように書いてください）`); return []; }
    const slug = String(data.slug || name).replace(/[^\w\-\u3040-\u30ff\u4e00-\u9fff]/g, '-');
    const { html, headings } = markdown(body, resolveUrl);
    const text = plainText(body);
    if (type === 'post' && !data.title) problems.push(`${dir}/${file}: title がありません`);
    return [{
      type, file, slug,
      id: `${type}-${slug}`,
      title: data.title ? String(data.title) : '',
      description: data.description ? String(data.description) : '',
      cover: data.cover ? String(data.cover) : '',
      tags: toTags(data.tags),
      date, html, headings, text,
      excerpt: data.description ? String(data.description) : text.slice(0, 90) + (text.length > 90 ? '…' : ''),
      url: type === 'post' ? `/posts/${slug}/` : `/notes/${slug}/`,
      // コメント API での識別子（記事はスラッグ、ひとことは note- をつける）
      commentKey: type === 'post' ? slug : `note-${slug}`,
    }];
  });
}

const posts = load('post');
const notes = load('note');
const all = [...posts, ...notes].sort((a, b) => b.date.sort.localeCompare(a.date.sort) || a.id.localeCompare(b.id));
posts.sort((a, b) => b.date.sort.localeCompare(a.date.sort));
notes.sort((a, b) => b.date.sort.localeCompare(a.date.sort));

const tagCounts = new Map();
for (const e of all) for (const t of e.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
const tagList = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'));

const monthCounts = new Map();
for (const e of all) monthCounts.set(e.date.month, (monthCounts.get(e.date.month) || 0) + 1);
const monthList = [...monthCounts.entries()].sort((a, b) => b[0].localeCompare(a[0]));

const latestYear = all[0]?.date.y ?? new Date().getFullYear();
const aboutSrc = fs.existsSync(path.join(root, 'content/about.md')) ? frontMatter(fs.readFileSync(path.join(root, 'content/about.md'), 'utf8')) : { data: {}, body: '' };

// ---------- 部品 ----------

const icon = {
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  menu: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 8h16M4 16h16"/></svg>',
  prev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  logo: '<svg class="logo" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="1" y="9" width="18" height="18" fill="currentColor"/><circle cx="19" cy="9" r="8" fill="var(--accent)"/></svg>',
};

const tagHref = (t) => u(`/?tag=${encodeURIComponent(t)}`);
const chip = (t, count, cls = '') =>
  `<a class="chip${cls}" href="${tagHref(t)}" data-tag="${esc(t)}">#${esc(t)}${count != null ? `<span class="count">${count}</span>` : ''}</a>`;

function dateLabel(e) {
  return e.date.y === latestYear ? e.date.short : e.date.full;
}

function entryHtml(e) {
  const tags = e.tags.length ? `<div class="tags">${e.tags.map((t) => chip(t, null, ' chip-sm')).join('')}</div>` : '';
  if (e.type === 'post') {
    return `<article class="entry entry-post" id="${e.id}">
<div class="entry-date"><time datetime="${e.date.iso}">${dateLabel(e)}</time><span class="dow">${e.date.dow}</span></div>
<div class="entry-body">
<span class="entry-kind">ARTICLE</span>
<h2 class="entry-title"><a href="${u(e.url)}">${esc(e.title)}</a></h2>
<p class="entry-excerpt">${esc(e.excerpt)}</p>
${tags}
</div>
</article>`;
  }
  return `<article class="entry entry-note" id="${e.id}">
<div class="entry-date"><time datetime="${e.date.iso}${e.date.time ? 'T' + e.date.time : ''}">${dateLabel(e)}</time><span class="dow">${e.date.time || e.date.dow}</span></div>
<div class="entry-body">
<span class="entry-kind"><span class="dot"></span>ひとこと</span>
<div class="note-text">${e.html}</div>
${tags}
<a class="note-link" href="${u(e.url)}${commentsOn ? '#comments' : ''}">${commentsOn ? 'コメントする' : 'この投稿へ'}<span aria-hidden="true">→</span></a>
</div>
</article>`;
}

function layout({ title, description = config.description, body, page = '', ogType = 'website', noindex = false, scripts = '' }) {
  const fullTitle = title ? `${title} — ${config.title}` : config.title;
  const drawerTags = tagList.map(([t]) => chip(t, null)).join('');
  return `<!doctype html>
<html lang="${config.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex, nofollow">\n' : ''}
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${esc(config.title)}">
<meta name="theme-color" content="#F2F1ED">
<link rel="icon" href="${u('/favicon.svg')}" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${esc(config.title)}" href="${u('/feed.xml')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+JP:wght@400;500;700&display=swap">
<link rel="stylesheet" href="${u('/assets/style.css')}">
<style>:root{--accent:${esc(config.accent || '#D4561E')}}</style>
</head>
<body data-page="${page}" data-base="${base}"${gc && !noindex ? ` data-gc="${esc(gc)}"` : ''}${commentsOn ? ` data-comments-api="${esc(commentApi)}" data-turnstile-key="${esc(turnstileKey)}"` : ''}>
<a class="skip" href="#main">本文へ移動</a>
<header class="site-header">
<a class="brand" href="${u('/')}" aria-label="${esc(config.title)} ホーム">${icon.logo}<span>${esc(config.title)}</span></a>
<nav class="nav" aria-label="メインメニュー">
<a href="${u('/?type=post')}">記事</a>
<a href="${u('/?type=note')}">ひとこと</a>
<a href="${u('/archive/')}">アーカイブ</a>
<a href="${u('/about/')}">About</a>
</nav>
<div class="header-actions">
<button type="button" class="icon-btn" data-toggle="drawer-search" aria-controls="drawer-search" aria-expanded="false" aria-label="検索">${icon.search}</button>
<button type="button" class="icon-btn" data-toggle="drawer-menu" aria-controls="drawer-menu" aria-expanded="false" aria-label="メニュー">${icon.menu}</button>
</div>
</header>
<div class="drawer" id="drawer-search" hidden>
<form action="${u('/')}" method="get" role="search" data-search-form>
<label class="visually-hidden" for="q-drawer">キーワードで検索</label>
<input id="q-drawer" name="q" type="search" placeholder="キーワードで探す" autocomplete="off" data-search>
</form>
</div>
<nav class="drawer" id="drawer-menu" aria-label="メニュー" hidden>
<div class="drawer-links">
<a href="${u('/?type=post')}">記事</a>
<a href="${u('/?type=note')}">ひとこと</a>
<a href="${u('/archive/')}">アーカイブ</a>
<a href="${u('/about/')}">About</a>
</div>
${drawerTags ? `<div class="drawer-tags"><span class="eyebrow">TAGS</span><div class="chips">${drawerTags}</div></div>` : ''}
</nav>
<main id="main">
${body}
</main>
<footer class="site-footer">
<div class="footer-meta"><span>© ${new Date().getFullYear()} ${esc(config.title)}</span><span class="gc-only">TOTAL VIEWS <span data-views="TOTAL">—</span></span></div>
<div class="footer-links"><a href="${u('/about/')}">About</a><a href="${u('/feed.xml')}">RSS</a></div>
</footer>
<script src="${u('/assets/app.js')}" defer></script>
${scripts}
${gc && !noindex ? `<script data-goatcounter="https://${esc(gc)}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>` : ''}
</body>
</html>
`;
}

// ---------- ページ ----------

function homePage() {
  const postCount = posts.length;
  const noteCount = notes.length;
  const index = all.map((e) => ({ id: e.id, type: e.type, date: e.date.iso, month: e.date.month, tags: e.tags, text: (e.title + ' ' + e.text + ' ' + e.tags.join(' ')).toLowerCase() }));
  const lines = config.catchcopy.split('\n').map(esc).join('<br>');
  const months = monthList.slice(0, 6).map(([m, n]) =>
    `<a class="archive-row" href="${u(`/?month=${m}`)}" data-month="${m}"><span>${m.replace('-', '.')}</span><span class="count">${n}</span></a>`).join('');

  const body = `
<section class="hero container">
<div class="hero-text">
<span class="eyebrow">A NOTEBOOK OF SMALL FINDINGS</span>
<h1>${lines}</h1>
<p class="lead">${esc(config.description)}</p>
</div>
<div class="today-panel">
<div class="today-head"><span class="eyebrow">TODAY</span><span class="dot dot-lg"></span></div>
<div class="today-date"><span data-today></span><span class="today-dow" data-today-dow></span></div>
<dl class="stats">
<div><dt>記事</dt><dd>${postCount}</dd></div>
<div><dt>ひとこと</dt><dd>${noteCount}</dd></div>
<div class="gc-only"><dt>閲覧数</dt><dd data-views="TOTAL">—</dd></div>
</dl>
</div>
</section>

<div class="home container">
<div class="feed" id="feed">
<div class="feed-bar">
<div class="tabs" role="group" aria-label="種類で絞り込み">
<button type="button" data-type="all" aria-pressed="true">すべて<span class="count">${all.length}</span></button>
<button type="button" data-type="post" aria-pressed="false">記事<span class="count">${postCount}</span></button>
<button type="button" data-type="note" aria-pressed="false">ひとこと<span class="count">${noteCount}</span></button>
</div>
<div class="feed-status">
<button type="button" class="active-filter" data-clear hidden><span data-active-label></span><span aria-hidden="true">×</span></button>
<span class="result-count" aria-live="polite"><span data-count>${all.length}</span> 件</span>
</div>
</div>
<div class="entries">
${all.map(entryHtml).join('\n')}
</div>
<div class="empty" data-empty ${all.length ? 'hidden' : ''}>
<span class="eyebrow">NO RESULTS</span>
<p>${all.length ? '条件に合う投稿がありません。' : 'まだ投稿がありません。'}</p>
${all.length ? '<button type="button" class="btn-outline" data-clear>絞り込みを解除</button>' : ''}
</div>
<div class="more"><button type="button" class="more-btn" data-more hidden>もっと見る<span aria-hidden="true">↓</span></button></div>
</div>

<aside class="sidebar">
<section class="side-block">
<form action="${u('/')}" method="get" role="search" data-search-form>
<label for="q" class="side-title"><span class="num">01</span>検索</label>
<div class="search-box">${icon.search}<input id="q" name="q" type="search" placeholder="キーワードで探す" autocomplete="off" data-search></div>
</form>
</section>
<section class="side-block" aria-labelledby="cal-title">
<div class="side-head">
<h2 id="cal-title" class="side-title"><span class="num">02</span>カレンダー</h2>
<div class="cal-nav">
<button type="button" class="icon-btn" data-cal="-1" aria-label="前の月">${icon.prev}</button>
<span class="cal-label" data-cal-label></span>
<button type="button" class="icon-btn" data-cal="1" aria-label="次の月">${icon.next}</button>
</div>
</div>
<div class="calendar" data-calendar></div>
</section>
${tagList.length ? `<section class="side-block" aria-labelledby="tag-title">
<h2 id="tag-title" class="side-title"><span class="num">03</span>タグ</h2>
<div class="chips">${tagList.map(([t, n]) => chip(t, n)).join('')}</div>
</section>` : ''}
${monthList.length ? `<section class="side-block" aria-labelledby="archive-title">
<h2 id="archive-title" class="side-title"><span class="num">04</span>アーカイブ</h2>
<div class="archive-list">${months}<a class="archive-all" href="${u('/archive/')}">すべての月を見る</a></div>
</section>` : ''}
</aside>
</div>
<script type="application/json" id="entry-index">${JSON.stringify({ pageSize: config.pageSize || 15, entries: index }).replace(/</g, '\\u003c')}</script>
`;
  return layout({ body, page: 'home' });
}

function postPage(p, i) {
  const newer = posts[i - 1];
  const older = posts[i + 1];
  const related = notes.filter((n) => n.tags.some((t) => p.tags.includes(t))).slice(0, 3);
  const toc = p.headings.length ? `<nav class="meta-block toc" aria-label="目次">
<span class="eyebrow">CONTENTS</span>
${p.headings.map((h, k) => `<a href="#${h.id}"><span class="num">${pad(k + 1)}</span>${esc(h.text)}</a>`).join('')}
</nav>` : '';
  const cover = p.cover ? `<figure class="cover"><img src="${esc(resolveUrl(p.cover))}" alt=""></figure>` : '';
  const nav = `<nav class="post-nav" aria-label="前後の記事">
${older ? `<a href="${u(older.url)}"><span class="eyebrow">← PREV · ${older.date.short}</span><span class="post-nav-title">${esc(older.title)}</span></a>` : '<span class="post-nav-empty"><span class="eyebrow">← PREV</span><span class="post-nav-title">これが最初の記事です</span></span>'}
${newer ? `<a href="${u(newer.url)}" class="post-nav-next"><span class="eyebrow">NEXT · ${newer.date.short} →</span><span class="post-nav-title">${esc(newer.title)}</span></a>` : '<span class="post-nav-empty post-nav-next"><span class="eyebrow">NEXT →</span><span class="post-nav-title">最新の記事です</span></span>'}
</nav>`;
  const rel = related.length ? `<section class="related" aria-labelledby="related-title">
<h2 id="related-title" class="eyebrow"><span class="dot"></span>関連するひとこと</h2>
${related.map((n) => `<a class="related-row" href="${u(n.url)}"><span class="related-date">${n.date.short}</span><span class="related-text">${esc(n.text)}</span></a>`).join('')}
</section>` : '';

  const body = `
<div class="container back-row"><a class="back" href="${u('/')}"><span aria-hidden="true">←</span>一覧にもどる</a></div>
<article class="post container">
<aside class="post-meta">
<div class="meta-block"><span class="eyebrow">PUBLISHED</span><time class="meta-date" datetime="${p.date.iso}">${p.date.full}</time><span class="meta-sub">${p.date.dow}</span></div>
<div class="meta-block gc-only"><span class="eyebrow"><span class="dot"></span>VIEWS</span><span class="meta-views" data-views="page">—</span></div>
${p.tags.length ? `<div class="meta-block"><span class="eyebrow">TAGS</span><div class="chips">${p.tags.map((t) => chip(t, null)).join('')}</div></div>` : ''}
${toc}
</aside>
<div class="post-main">
<span class="eyebrow">ARTICLE</span>
<h1 class="post-title">${esc(p.title)}</h1>
${p.description ? `<p class="post-lead">${esc(p.description)}</p>` : ''}
${cover}
<div class="prose">
${p.html}
</div>
${nav}
${rel}
${commentsOn ? commentsSection(p) : ''}
</div>
</article>
`;
  return layout({ title: p.title, description: p.description || p.excerpt, body, page: 'post', ogType: 'article', scripts: commentScripts() });
}

function notePage(n, i) {
  const newer = notes[i - 1];
  const older = notes[i + 1];
  const navText = (e) => esc(e.text.length > 40 ? e.text.slice(0, 40) + '…' : e.text);
  const nav = `<nav class="post-nav" aria-label="前後のひとこと">
${older ? `<a href="${u(older.url)}"><span class="eyebrow">← PREV · ${older.date.short}</span><span class="post-nav-title">${navText(older)}</span></a>` : '<span class="post-nav-empty"><span class="eyebrow">← PREV</span><span class="post-nav-title">これが最初のひとことです</span></span>'}
${newer ? `<a href="${u(newer.url)}" class="post-nav-next"><span class="eyebrow">NEXT · ${newer.date.short} →</span><span class="post-nav-title">${navText(newer)}</span></a>` : '<span class="post-nav-empty post-nav-next"><span class="eyebrow">NEXT →</span><span class="post-nav-title">最新のひとことです</span></span>'}
</nav>`;
  const body = `
<div class="container back-row"><a class="back" href="${u('/?type=note')}"><span aria-hidden="true">←</span>ひとこと一覧にもどる</a></div>
<article class="post container note-page">
<aside class="post-meta">
<div class="meta-block"><span class="eyebrow">PUBLISHED</span><time class="meta-date" datetime="${n.date.iso}${n.date.time ? 'T' + n.date.time : ''}">${n.date.full}</time><span class="meta-sub">${n.date.dow}${n.date.time ? ' · ' + n.date.time : ''}</span></div>
<div class="meta-block gc-only"><span class="eyebrow"><span class="dot"></span>VIEWS</span><span class="meta-views" data-views="page">—</span></div>
${n.tags.length ? `<div class="meta-block"><span class="eyebrow">TAGS</span><div class="chips">${n.tags.map((t) => chip(t, null)).join('')}</div></div>` : ''}
</aside>
<div class="post-main">
<span class="entry-kind"><span class="dot"></span>ひとこと</span>
<div class="note-text">${n.html}</div>
${nav}
${commentsOn ? commentsSection(n) : ''}
</div>
</article>
`;
  const title = `ひとこと ${n.date.full}${n.date.time ? ' ' + n.date.time : ''}`;
  return layout({ title, description: n.excerpt, body, page: 'note', ogType: 'article', scripts: commentScripts() });
}

function commentScripts() {
  return commentsOn
    ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>\n<script src="${u('/assets/comments.js')}" defer></script>`
    : '';
}

function archivePage() {
  const groups = monthList.map(([m, n]) => {
    const items = all.filter((e) => e.date.month === m).map((e) => e.type === 'post'
      ? `<li><a class="arc-item" href="${u(e.url)}"><span class="arc-date">${e.date.short}</span><span class="arc-kind">記事</span><span class="arc-title">${esc(e.title)}</span></a></li>`
      : `<li><a class="arc-item" href="${u(e.url)}"><span class="arc-date">${e.date.short}</span><span class="arc-kind"><span class="dot"></span></span><span class="arc-title arc-note">${esc(e.text)}</span></a></li>`).join('');
    return `<section class="arc-month"><h2><a href="${u(`/?month=${m}`)}">${m.replace('-', '.')}</a><span class="count">${n}</span></h2><ul>${items}</ul></section>`;
  }).join('');
  const body = `<div class="container page">
<span class="eyebrow">ARCHIVE</span>
<h1 class="page-title">アーカイブ</h1>
${groups || '<p class="muted">まだ投稿がありません。</p>'}
</div>`;
  return layout({ title: 'アーカイブ', body, page: 'archive' });
}

function aboutPage() {
  const { html } = markdown(aboutSrc.body || '', resolveUrl);
  const body = `<div class="container page">
<span class="eyebrow">ABOUT</span>
<h1 class="page-title">${esc(aboutSrc.data.title || 'About')}</h1>
<div class="prose">${html}</div>
</div>`;
  return layout({ title: 'About', body, page: 'about' });
}

function commentsSection(p) {
  return `<section class="comments" id="comments" data-comment-page="${esc(p.commentKey)}" aria-labelledby="comments-title">
<h2 id="comments-title" class="comments-title"><span class="eyebrow">COMMENTS</span><span>コメント</span><span class="comments-count" data-comment-count></span></h2>
<div class="comment-list" data-comment-list aria-live="polite"><p class="muted comment-empty">読み込み中…</p></div>
<form class="comment-form" data-comment-form novalidate>
<div class="field">
<label for="c-name">名前<span class="optional">（任意）</span></label>
<input id="c-name" name="name" type="text" maxlength="30" placeholder="名無しさん" autocomplete="off">
</div>
<div class="field">
<label for="c-body">コメント</label>
<textarea id="c-body" name="body" rows="4" maxlength="1000" required></textarea>
<span class="char-count" data-char-count>0 / 1000</span>
</div>
<div class="hp" aria-hidden="true"><label>Website <input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>
<div class="turnstile" data-turnstile></div>
<p class="form-note">内容によっては、管理者が確認してから公開されます。URL（リンク）は書き込めません。IP アドレスは保存せず、連投防止のために暗号化した値だけを使います。</p>
<div class="form-actions">
<button type="submit" class="btn-primary" data-comment-submit>送信する</button>
<span class="form-status" data-form-status role="status"></span>
</div>
</form>
</section>`;
}

function adminPage() {
  const body = `<div class="container page admin" data-admin>
<span class="eyebrow">ADMIN</span>
<h1 class="page-title">コメント管理</h1>
<form class="admin-login" data-admin-login>
<div class="field">
<label for="admin-pass">管理パスワード</label>
<input id="admin-pass" type="password" autocomplete="current-password" required>
</div>
<div class="form-actions"><button type="submit" class="btn-primary">ログイン</button><span class="form-status" data-login-status role="status"></span></div>
<p class="form-note">パスワードはこのタブを閉じると消えます。</p>
</form>
<div class="admin-panel" data-admin-panel hidden>
<div class="admin-bar">
<div class="tabs" role="group" aria-label="表示するコメント">
<button type="button" data-status="pending" aria-pressed="true">承認待ち</button>
<button type="button" data-status="approved" aria-pressed="false">公開中</button>
</div>
<button type="button" class="btn-outline" data-admin-logout>ログアウト</button>
</div>
<div class="admin-list" data-admin-list aria-live="polite"></div>
</div>
</div>`;
  return layout({
    title: 'コメント管理',
    body,
    page: 'admin',
    noindex: true,
    scripts: `<script src="${u('/assets/admin.js')}" defer></script>`,
  });
}

function notFoundPage() {
  const body = `<div class="container page page-center">
<span class="eyebrow">404 — NOT FOUND</span>
<h1 class="page-title">ページが見つかりません</h1>
<p class="muted">URL が変わったか、削除された可能性があります。</p>
<a class="btn-outline" href="${u('/')}">ホームへ</a>
</div>`;
  return layout({ title: 'ページが見つかりません', body, page: '404' });
}

function feed() {
  const site = origin + base;
  const items = all.slice(0, 30).map((e) => `<item>
<title>${esc(e.type === 'post' ? e.title : `ひとこと ${e.date.full}${e.date.time ? ' ' + e.date.time : ''}`)}</title>
<link>${esc(site + e.url)}</link>
<guid isPermaLink="false">${esc(e.id)}</guid>
<pubDate>${e.date.rfc}</pubDate>
<description>${esc(e.type === 'post' ? e.excerpt : e.text)}</description>
${e.tags.map((t) => `<category>${esc(t)}</category>`).join('')}
</item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${esc(config.title)}</title>
<link>${esc(site + '/')}</link>
<description>${esc(config.description)}</description>
<language>${config.lang}</language>
${items}
</channel>
</rss>
`;
}

// ---------- 書き出し ----------

function write(rel, content) {
  const file = path.join(dist, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyDir(s, d); }
    else fs.copyFileSync(s, d);
  }
}

if (problems.length) {
  console.error('\n⚠ 読み込めなかったファイルがあります:');
  for (const p of problems) console.error('  - ' + p);
  console.error('');
}

// 位置情報（GPS）つきの画像・動画があれば公開しないように止める
const located = findLocationFiles(path.join(root, 'public'));
if (located.length) {
  reportLocationFiles(located, root);
  process.exit(1);
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
copyDir(path.join(root, 'public'), dist);
write('index.html', homePage());
posts.forEach((p, i) => write(`posts/${p.slug}/index.html`, postPage(p, i)));
notes.forEach((n, i) => write(`notes/${n.slug}/index.html`, notePage(n, i)));
write('archive/index.html', archivePage());
write('about/index.html', aboutPage());
write('404.html', notFoundPage());
if (commentsOn) write('admin/index.html', adminPage());
write('feed.xml', feed());
write('.nojekyll', '');

console.log(`✓ ビルド完了: 記事 ${posts.length} 件 / ひとこと ${notes.length} 件 → dist/${base ? `（ベースパス ${base}）` : ''}`);
if (process.argv.includes('--strict') && problems.length) process.exit(1);
