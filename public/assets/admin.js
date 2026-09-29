// SakuraNotes — コメント管理ページ（承認・削除・ブロック）
(() => {
  const api = document.body.dataset.commentsApi;
  const root = document.querySelector('[data-admin]');
  if (!api || !root) return;

  const base = document.body.dataset.base || '';
  const KEY = 'sakura-admin-pass';
  const loginForm = root.querySelector('[data-admin-login]');
  const loginStatus = root.querySelector('[data-login-status]');
  const passInput = root.querySelector('#admin-pass');
  const panel = root.querySelector('[data-admin-panel]');
  const list = root.querySelector('[data-admin-list]');
  let current = 'pending';

  const getPass = () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } };
  const setPass = (v) => { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch {} };

  async function request(path, method = 'GET') {
    const res = await fetch(api + path, { method, headers: { Authorization: 'Bearer ' + getPass() }, cache: 'no-store' });
    const out = await res.json().catch(() => ({}));
    if (res.status === 401) { logout(out.error || 'パスワードが違います。'); throw new Error('auth'); }
    if (!res.ok) throw new Error(out.error || '失敗しました。');
    return out;
  }

  function fmt(iso) {
    return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  async function load() {
    list.textContent = '';
    list.append(el('p', 'muted', '読み込み中…'));
    let data;
    try { data = await request(`/admin/comments?status=${current}`); }
    catch (e) { if (e.message !== 'auth') { list.textContent = ''; list.append(el('p', 'muted', e.message)); } return; }
    list.textContent = '';
    if (!data.comments.length) {
      list.append(el('p', 'muted', current === 'pending' ? '承認待ちのコメントはありません。' : '公開中のコメントはありません。'));
      return;
    }
    for (const c of data.comments) {
      const card = el('article', 'admin-item' + (c.flagged ? ' is-flagged' : ''));
      const head = el('div', 'admin-item-head');
      const link = el('a', 'admin-page', '/posts/' + c.page + '/');
      link.href = `${base}/posts/${c.page}/#comments`;
      link.target = '_blank';
      link.rel = 'noopener';
      head.append(link, el('span', 'comment-name', c.name), el('span', 'comment-date', fmt(c.createdAt)), el('span', 'admin-author', '投稿者ID ' + c.author));
      if (c.flagged) head.append(el('span', 'admin-flag', '要注意ワード'));
      const body = el('p', 'comment-body', c.body);
      const actions = el('div', 'admin-actions');
      const btn = (label, action, cls, confirmText) => {
        const b = el('button', cls, label);
        b.type = 'button';
        b.addEventListener('click', async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          b.disabled = true;
          try { await request(`/admin/comments/${c.id}/${action}`, 'POST'); card.remove(); if (!list.children.length) load(); }
          catch (e) { b.disabled = false; if (e.message !== 'auth') window.alert(e.message); }
        });
        return b;
      };
      if (current === 'pending') actions.append(btn('承認して公開', 'approve', 'btn-primary'));
      else actions.append(btn('非公開に戻す', 'unpublish', 'btn-outline'));
      actions.append(btn('削除', 'delete', 'btn-outline', 'このコメントを削除しますか？（元に戻せません）'));
      actions.append(btn('削除してブロック', 'ban', 'btn-danger', 'このコメントを削除して、同じ投稿者からのコメントを今後受け付けないようにしますか？'));
      card.append(head, body, actions);
      list.append(card);
    }
  }

  function showPanel() {
    loginForm.hidden = true;
    panel.hidden = false;
    load();
  }

  function logout(message) {
    setPass('');
    panel.hidden = true;
    loginForm.hidden = false;
    loginStatus.textContent = message || '';
    passInput.value = '';
  }

  loginForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    setPass(passInput.value);
    loginStatus.textContent = '確認中…';
    try { await request('/admin/comments?status=pending'); loginStatus.textContent = ''; showPanel(); }
    catch (e) { if (e.message !== 'auth') loginStatus.textContent = e.message; }
  });

  root.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => {
    current = b.dataset.status;
    root.querySelectorAll('[data-status]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    load();
  }));
  root.querySelector('[data-admin-logout]').addEventListener('click', () => logout('ログアウトしました。'));

  if (getPass()) showPanel();
})();
