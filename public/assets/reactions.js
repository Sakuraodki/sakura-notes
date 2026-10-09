// SakuraNotes — いいねボタンとコメント数（一覧・記事・ひとことページ）
(() => {
  const api = document.body.dataset.commentsApi;
  const holders = [...document.querySelectorAll('[data-stats]')];
  if (!api || !holders.length) return;

  const byPage = new Map();
  for (const h of holders) {
    const key = h.dataset.stats;
    if (!byPage.has(key)) byPage.set(key, []);
    byPage.get(key).push(h);
  }

  function show(page, { likes, comments, liked }) {
    for (const h of byPage.get(page) || []) {
      const btn = h.querySelector('[data-like]');
      if (btn) {
        if (likes != null) btn.querySelector('[data-like-count]').textContent = likes ? String(likes) : '';
        if (liked != null) btn.setAttribute('aria-pressed', String(liked));
        btn.hidden = false;
      }
      const total = h.querySelector('[data-comment-total]');
      if (total && comments != null) total.textContent = comments ? ` ${comments}` : '';
    }
  }

  // ---------- 数を読み込む（50 ページずつ） ----------
  const pages = [...byPage.keys()];
  for (let i = 0; i < pages.length; i += 50) {
    const chunk = pages.slice(i, i + 50);
    fetch(`${api}/stats?pages=${chunk.map(encodeURIComponent).join(',')}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const liked = new Set(data.liked || []);
        for (const p of chunk) show(p, { ...(data.stats[p] || { likes: 0, comments: 0 }), liked: liked.has(p) });
      })
      .catch(() => {}); // 読めなければボタンは隠したまま
  }

  // ---------- いいね ----------
  document.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-like]');
    if (!btn || btn.disabled) return;
    const page = btn.closest('[data-stats]').dataset.stats;
    const wasLiked = btn.getAttribute('aria-pressed') === 'true';
    const before = Number(btn.querySelector('[data-like-count]').textContent || 0);
    // 先に見た目を変えて、失敗したら戻す
    show(page, { liked: !wasLiked, likes: Math.max(0, before + (wasLiked ? -1 : 1)) });
    btn.disabled = true;
    try {
      const res = await fetch(`${api}/likes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || 'いいねできませんでした。');
      show(page, { liked: out.liked, likes: out.likes });
    } catch (e) {
      show(page, { liked: wasLiked, likes: before });
      btn.title = e.message;
    } finally {
      btn.disabled = false;
    }
  });
})();
