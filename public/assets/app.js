// SakuraNotes — ブラウザ側の動き（絞り込み・検索・カレンダー・閲覧数・メニュー）
(() => {
  const body = document.body;
  const base = body.dataset.base || '';
  const gc = body.dataset.gc || '';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, '0');
  const DOWS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  // 日本時間の今日
  function todayJST() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    return { y: get('year'), m: get('month'), d: get('day') };
  }
  const today = todayJST();
  const todayIso = `${today.y}-${pad(today.m)}-${pad(today.d)}`;

  // ---------- ヘッダーのドロワー（スマホ） ----------
  $$('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.toggle);
      const open = target.hidden;
      $$('[data-toggle]').forEach((b) => {
        document.getElementById(b.dataset.toggle).hidden = true;
        b.setAttribute('aria-expanded', 'false');
      });
      target.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open) { const input = $('input', target); if (input) input.focus(); }
    });
  });

  // ---------- TODAY パネル ----------
  const todayEl = $('[data-today]');
  if (todayEl) {
    todayEl.textContent = `${today.y}.${pad(today.m)}.${pad(today.d)}`;
    $('[data-today-dow]').textContent = DOWS[new Date(Date.UTC(today.y, today.m - 1, today.d)).getUTCDay()];
  }

  // ---------- 閲覧数（GoatCounter） ----------
  if (gc) {
    const cache = {};
    const fetchCount = (p) => {
      if (!cache[p]) {
        cache[p] = fetch(`https://${gc}.goatcounter.com/counter/${encodeURIComponent(p)}.json`)
          .then((r) => (r.status === 404 ? { count: '0' } : r.ok ? r.json() : null))
          .then((j) => (j && j.count != null ? String(j.count) : null))
          .catch(() => null);
      }
      return cache[p];
    };
    $$('[data-views]').forEach((el) => {
      const key = el.dataset.views === 'page' ? location.pathname : el.dataset.views;
      fetchCount(key).then((c) => { if (c != null) el.textContent = c; });
    });
  }

  // ---------- ホーム以外での検索は、ホームへ移動 ----------
  const indexEl = $('#entry-index');
  if (!indexEl) return;

  // ---------- ホーム：絞り込み ----------
  const { pageSize, entries: index } = JSON.parse(indexEl.textContent);
  const byId = new Map(index.map((e) => [e.id, e]));
  const els = $$('.entries > .entry');
  const params = new URLSearchParams(location.search);
  const state = {
    type: ['post', 'note'].includes(params.get('type')) ? params.get('type') : 'all',
    tag: params.get('tag') || '',
    month: params.get('month') || '',
    date: params.get('date') || '',
    q: params.get('q') || '',
    shown: pageSize,
  };

  const searchInputs = $$('[data-search]');
  searchInputs.forEach((input) => {
    input.value = state.q;
    input.addEventListener('input', () => {
      state.q = input.value;
      searchInputs.forEach((o) => { if (o !== input) o.value = input.value; });
      state.shown = pageSize;
      apply();
    });
  });
  $$('[data-search-form]').forEach((f) => f.addEventListener('submit', (ev) => ev.preventDefault()));

  $$('.tabs [data-type]').forEach((btn) => btn.addEventListener('click', () => {
    state.type = btn.dataset.type;
    state.shown = pageSize;
    apply();
  }));

  // タグ・月のリンクはページ遷移せずにその場で絞り込む
  document.addEventListener('click', (ev) => {
    const tagLink = ev.target.closest('a[data-tag]');
    const monthLink = ev.target.closest('a[data-month]');
    if (!tagLink && !monthLink) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
    ev.preventDefault();
    if (tagLink) {
      const t = tagLink.dataset.tag;
      state.tag = state.tag === t ? '' : t;
      $('#drawer-menu').hidden = true;
    } else {
      const m = monthLink.dataset.month;
      state.month = state.month === m ? '' : m;
      state.date = '';
      if (state.month) setCal(state.month);
    }
    state.shown = pageSize;
    apply();
    $('#feed').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $$('[data-clear]').forEach((b) => b.addEventListener('click', () => {
    Object.assign(state, { type: 'all', tag: '', month: '', date: '', q: '', shown: pageSize });
    searchInputs.forEach((i) => { i.value = ''; });
    apply();
  }));

  const moreBtn = $('[data-more]');
  moreBtn.addEventListener('click', () => { state.shown += pageSize; apply(); });

  function matches(e) {
    const q = state.q.trim().toLowerCase();
    return (state.type === 'all' || e.type === state.type) &&
      (!state.tag || e.tags.includes(state.tag)) &&
      (!state.month || e.month === state.month) &&
      (!state.date || e.date === state.date) &&
      (!q || q.split(/\s+/).every((w) => e.text.includes(w)));
  }

  function apply() {
    let count = 0;
    els.forEach((el) => {
      const ok = matches(byId.get(el.id));
      if (ok) count++;
      el.hidden = !ok || count > state.shown;
    });
    $('[data-count]').textContent = count;
    $('[data-empty]').hidden = count > 0;
    moreBtn.hidden = count <= state.shown;

    $$('.tabs [data-type]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === state.type)));
    $$('a.chip[data-tag]').forEach((a) => a.classList.toggle('is-active', a.dataset.tag === state.tag));
    $$('a[data-month]').forEach((a) => a.classList.toggle('is-active', a.dataset.month === state.month));

    const bits = [];
    if (state.tag) bits.push('#' + state.tag);
    if (state.month) bits.push(state.month.replace('-', '.'));
    if (state.date) bits.push(state.date.replace(/-/g, '.'));
    if (state.q.trim()) bits.push(`「${state.q.trim()}」`);
    $$('button.active-filter').forEach((b) => {
      b.hidden = !bits.length;
      $('[data-active-label]', b).textContent = bits.join(' ');
    });

    const p = new URLSearchParams();
    if (state.type !== 'all') p.set('type', state.type);
    if (state.tag) p.set('tag', state.tag);
    if (state.month) p.set('month', state.month);
    if (state.date) p.set('date', state.date);
    if (state.q.trim()) p.set('q', state.q.trim());
    const qs = p.toString();
    history.replaceState(null, '', (qs ? `?${qs}` : location.pathname) + location.hash);
    renderCal();
  }

  // ---------- カレンダー ----------
  const calEl = $('[data-calendar]');
  const days = new Set(index.map((e) => e.date));
  let cal = { y: today.y, m: today.m };
  function setCal(ym) { const [y, m] = ym.split('-').map(Number); cal = { y, m }; }
  if (state.date) setCal(state.date.slice(0, 7));
  else if (state.month) setCal(state.month);
  else if (index.length && !index.some((e) => e.month === `${today.y}-${pad(today.m)}`)) setCal(index[0].month);

  $$('[data-cal]').forEach((b) => b.addEventListener('click', () => {
    const d = new Date(Date.UTC(cal.y, cal.m - 1 + Number(b.dataset.cal), 1));
    cal = { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
    renderCal();
  }));

  function renderCal() {
    if (!calEl) return;
    $('[data-cal-label]').textContent = `${cal.y}.${pad(cal.m)}`;
    const first = (new Date(Date.UTC(cal.y, cal.m - 1, 1)).getUTCDay() + 6) % 7; // 月曜はじまり
    const total = new Date(Date.UTC(cal.y, cal.m, 0)).getUTCDate();
    const html = ['月', '火', '水', '木', '金', '土', '日'].map((w) => `<span class="cal-wd">${w}</span>`);
    for (let i = 0; i < first; i++) html.push('<span class="cal-cell"></span>');
    for (let d = 1; d <= total; d++) {
      const iso = `${cal.y}-${pad(cal.m)}-${pad(d)}`;
      const cls = ['cal-cell', days.has(iso) && 'has', iso === todayIso && 'today', iso === state.date && 'selected'].filter(Boolean).join(' ');
      html.push(days.has(iso)
        ? `<button type="button" class="${cls}" data-day="${iso}" aria-label="${cal.m}月${d}日の投稿を表示" aria-pressed="${iso === state.date}"><span class="n">${d}</span><span class="d"></span></button>`
        : `<span class="${cls}"><span class="n">${d}</span><span class="d"></span></span>`);
    }
    calEl.innerHTML = html.join('');
  }
  calEl && calEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-day]');
    if (!b) return;
    state.date = state.date === b.dataset.day ? '' : b.dataset.day;
    state.month = '';
    state.shown = pageSize;
    apply();
  });

  apply();
  if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t && !t.hidden) t.scrollIntoView(); }
})();
