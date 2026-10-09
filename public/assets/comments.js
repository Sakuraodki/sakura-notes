// SakuraNotes — 記事・ひとことページのコメント欄（表示と投稿）
(() => {
  const api = document.body.dataset.commentsApi;
  const siteKey = document.body.dataset.turnstileKey;
  const section = document.querySelector('[data-comment-page]');
  if (!api || !siteKey || !section) return;

  const page = section.dataset.commentPage;
  const list = section.querySelector('[data-comment-list]');
  const countEl = section.querySelector('[data-comment-count]');
  const form = section.querySelector('[data-comment-form]');
  const bodyInput = form.querySelector('#c-body');
  const nameInput = form.querySelector('#c-name');
  const charCount = form.querySelector('[data-char-count]');
  const status = form.querySelector('[data-form-status]');
  const submit = form.querySelector('[data-comment-submit]');
  const holder = form.querySelector('[data-turnstile]');
  let token = '';
  let widget = null;

  // ---------- 一覧 ----------
  function formatDate(iso) {
    const d = new Date(iso);
    const p = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
    const g = (t) => p.find((x) => x.type === t).value;
    return `${g('year')}.${g('month')}.${g('day')} ${g('hour')}:${g('minute')}`;
  }

  function render(comments) {
    list.textContent = '';
    countEl.textContent = comments.length ? String(comments.length) : '';
    if (!comments.length) {
      const p = document.createElement('p');
      p.className = 'muted comment-empty';
      p.textContent = 'まだコメントはありません。';
      list.append(p);
      return;
    }
    comments.forEach((c, i) => {
      const art = document.createElement('article');
      art.className = 'comment';
      const head = document.createElement('div');
      head.className = 'comment-head';
      const num = document.createElement('span');
      num.className = 'comment-num';
      num.textContent = String(i + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.className = 'comment-name';
      name.textContent = c.name;
      const time = document.createElement('time');
      time.className = 'comment-date';
      time.dateTime = c.createdAt;
      time.textContent = formatDate(c.createdAt);
      head.append(num, name, time);
      const body = document.createElement('p');
      body.className = 'comment-body';
      body.textContent = c.body; // textContent なので HTML は実行されない
      art.append(head, body);
      list.append(art);
    });
  }

  async function load(fresh) {
    try {
      const res = await fetch(`${api}/comments?page=${encodeURIComponent(page)}`, fresh ? { cache: 'reload' } : {});
      if (!res.ok) throw new Error(res.status);
      render((await res.json()).comments || []);
    } catch {
      list.textContent = '';
      const p = document.createElement('p');
      p.className = 'muted comment-empty';
      p.textContent = 'コメントを読み込めませんでした。';
      list.append(p);
    }
  }

  // ---------- Turnstile（ボット判定） ----------
  function setupTurnstile() {
    if (!window.turnstile) { setTimeout(setupTurnstile, 200); return; }
    widget = window.turnstile.render(holder, {
      sitekey: siteKey,
      language: 'ja',
      // サイトの表示（ダークモードかどうか）に合わせる
      theme: document.documentElement.dataset.theme || 'auto',
      callback: (t) => { token = t; },
      'expired-callback': () => { token = ''; },
      'error-callback': () => { token = ''; },
    });
  }

  // ---------- 投稿 ----------
  function setStatus(text, kind) {
    status.textContent = text;
    status.dataset.kind = kind || '';
  }

  bodyInput.addEventListener('input', () => {
    charCount.textContent = `${bodyInput.value.length} / 1000`;
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const body = bodyInput.value.trim();
    if (!body) { setStatus('コメントを入力してください。', 'error'); bodyInput.focus(); return; }
    if (/(https?:\/\/|www\.)/i.test(body)) { setStatus('URL（リンク）は書き込めません。', 'error'); return; }
    if (!token) { setStatus('ボットでないことの確認が終わるまでお待ちください。', 'error'); return; }

    submit.disabled = true;
    setStatus('送信中…');
    try {
      const res = await fetch(`${api}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page, name: nameInput.value, body, token, website: form.elements.website.value }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(out.error || '送信できませんでした。', 'error');
      } else {
        form.reset();
        charCount.textContent = '0 / 1000';
        if (out.status === 'approved') {
          setStatus('コメントを公開しました。ありがとうございます！', 'ok');
          load(true);
        } else {
          setStatus('送信しました。内容を確認してから公開されます。ありがとうございます！', 'ok');
        }
      }
    } catch {
      setStatus('通信に失敗しました。時間をおいてもう一度お試しください。', 'error');
    } finally {
      submit.disabled = false;
      token = '';
      if (widget !== null && window.turnstile) window.turnstile.reset(widget);
    }
  });

  load();
  setupTurnstile();
})();
