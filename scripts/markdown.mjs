// 依存ゼロの小さな Markdown 変換器。
// 対応: 見出し / 段落 / 改行 / リスト / 引用 / コード / 区切り線 / 画像 / 動画 / リンク / 太字 / 斜体 / インラインコード

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url) {
  const u = url.trim();
  if (/^(javascript|data|vbscript):/i.test(u)) return '#';
  return u;
}

// 画像と同じ書き方で、拡張子が動画なら X のようなインライン動画にする（再生の動きは assets/app.js）
const VIDEO_EXT = /\.(mp4|m4v|webm|mov)(?:[?#].*)?$/i;
const isVideo = (src) => VIDEO_EXT.test(src);
const SOUND_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path class="sound-off" d="M17 9l5 6M22 9l-5 6"/><path class="sound-on" d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12"/></svg>';
function videoHtml(url, alt) {
  // JavaScript が動かない環境でも再生できるよう controls を付けておき、app.js が外す
  return `<span class="video-frame" data-video><video src="${url}" muted loop playsinline preload="metadata" controls${alt ? ` aria-label="${alt}"` : ''}></video>` +
    `<span class="video-time" data-video-time></span>` +
    `<button type="button" class="video-sound" data-video-sound aria-label="音声をオンにする" aria-pressed="false">${SOUND_ICON}</button></span>`;
}

// resolve: 画像やリンクの相対パス（/ で始まるもの）にベースパスを付けるための関数
export function inline(text, resolve = (u) => u) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = escapeHtml(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, alt, src, title) => {
    const url = escapeHtml(resolve(safeUrl(unescape(src))));
    if (isVideo(src)) return videoHtml(url, alt);
    return `<img src="${url}" alt="${alt}" loading="lazy"${title ? ` title="${title}"` : ''}>`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const h = resolve(safeUrl(unescape(href)));
    const ext = /^https?:\/\//.test(h);
    return `<a href="${escapeHtml(h)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
  return s;

  function unescape(v) {
    return v.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }
}

// 戻り値: { html, headings: [{ id, text }] }
export function markdown(src, resolve) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const headings = [];
  let i = 0;

  const isBlockStart = (l) =>
    /^#{1,4}\s/.test(l) || /^```/.test(l) || /^>\s?/.test(l) || /^\s*[-*]\s+/.test(l) ||
    /^\s*\d+\.\s+/.test(l) || /^(-{3,}|\*{3,})\s*$/.test(l);

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // コードブロック
    const fence = line.match(/^```\s*([\w-]*)/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      const cls = fence[1] ? ` class="language-${fence[1]}"` : '';
      out.push(`<pre><code${cls}>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // 見出し
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = Math.max(2, h[1].length); // # と ## は h2（h1 は記事タイトル）、### は h3、#### は h4
      const text = h[2].trim();
      if (level === 2) {
        const id = `section-${headings.length + 1}`;
        headings.push({ id, text });
        out.push(`<h2 id="${id}"><span class="h-num">${String(headings.length).padStart(2, '0')}</span>${inline(text, resolve)}</h2>`);
      } else {
        out.push(`<h${level}>${inline(text, resolve)}</h${level}>`);
      }
      i++;
      continue;
    }

    // 区切り線
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    // 引用
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${markdown(buf.join('\n'), resolve).html}</blockquote>`);
      continue;
    }

    // リスト
    const ul = /^\s*[-*]\s+/;
    const ol = /^\s*\d+\.\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line);
      const re = ordered ? ol : ul;
      const items = [];
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ''));
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li><span>${inline(t, resolve)}</span></li>`).join('')}</${tag}>`);
      continue;
    }

    // 画像だけの行は figure に
    const img = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) {
      const cls = isVideo(img[2].trim().split(/\s+/)[0]) ? ' class="video"' : '';
      out.push(`<figure${cls}>${inline(line.trim(), resolve)}${img[1] ? `<figcaption>${escapeHtml(img[1])}</figcaption>` : ''}</figure>`);
      i++;
      continue;
    }

    // 段落（1行の改行は <br> にする）
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    out.push(`<p>${buf.map((l) => inline(l.trim(), resolve)).join('<br>')}</p>`);
  }

  return { html: out.join('\n'), headings };
}

// 先頭の --- で囲まれた部分（front matter）を読む。値は文字列・配列 [a, b]・真偽値のみ。
export function frontMatter(src) {
  const m = src.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: src };
  const data = {};
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (/^\[.*\]$/.test(val)) {
      val = val.slice(1, -1).split(',').map((v) => unquote(v.trim())).filter(Boolean);
    } else if (val === 'true' || val === 'false') {
      val = val === 'true';
    } else {
      val = unquote(val);
    }
    data[key] = val;
  }
  return { data, body: m[2] };
}

function unquote(v) {
  return v.replace(/^(['"])(.*)\1$/, '$2');
}

// Markdown からプレーンテキスト（抜粋・検索用）
export function plainText(md) {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*([-*]|\d+\.)\s+/gm, '')
    .replace(/[*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
