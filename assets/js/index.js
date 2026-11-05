/* ==========================================================================
   Notlar — ana sayfa
   ========================================================================== */

import {
  formatShort,
  formatLong,
  normalizePosts,
  postTitle,
  escapeHTML,
  normalize,
  isEditableTarget
} from './core.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const DEFAULT_SITE = {
  title: 'Notlar',
  description: '',
  author: ''
};

const state = {
  posts: [],
  site: { ...DEFAULT_SITE },
  query: '',
  year: 'all',
  searchIndex: new Map(),
  loaded: false
};

const dom = {};

function cacheDom() {
  dom.yearTabs = $('#year-tabs');
  dom.searchInput = $('#search-input');
  dom.list = $('#post-list');
  dom.empty = $('#empty-state');
}

function init() {
  cacheDom();
  initFilters();
  initShortcuts();
  loadData();
}

/* --------------------------------------------------------------------------
   Veri
   -------------------------------------------------------------------------- */

async function fetchJSON(path) {
  const url = new URL(path, document.baseURI);
  url.searchParams.set('v', Date.now().toString(36));
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`İstek başarısız (${response.status})`);
  return response.json();
}

async function loadData() {
  const [postsResult, siteResult] = await Promise.allSettled([
    fetchJSON('data/posts.json'),
    fetchJSON('data/site.json')
  ]);

  if (siteResult.status === 'fulfilled' && siteResult.value && typeof siteResult.value === 'object') {
    state.site = { ...DEFAULT_SITE, ...siteResult.value };
  }
  applySite();

  if (postsResult.status === 'rejected') {
    state.loaded = false;
    state.posts = [];
    renderError();
    return;
  }

  const payload = postsResult.value;
  const raw = Array.isArray(payload) ? payload : payload && Array.isArray(payload.posts) ? payload.posts : [];
  state.posts = normalizePosts(raw);
  state.loaded = true;
  state.searchIndex = new Map(
    state.posts.map((post) => [
      post.id,
      normalize([
        post.title,
        post.content,
        formatLong(post.date),
        formatShort(post.date)
      ].join(' '))
    ])
  );

  renderTabs();
  renderPosts();
}

function applySite() {
  const site = state.site;
  const title = site.title || DEFAULT_SITE.title;
  const description = site.description || title;
  const lower = title.toLocaleLowerCase('tr');

  document.title = title;
  const brandText = $('.brand-text');
  if (brandText) brandText.textContent = lower;

  const descriptionMeta = $('meta[name="description"]');
  if (descriptionMeta) descriptionMeta.setAttribute('content', description);
  const authorMeta = $('meta[name="author"]');
  if (authorMeta) authorMeta.setAttribute('content', site.author || title);

  for (const [property, value] of [
    ['og:title', title],
    ['og:description', description],
    ['twitter:title', title],
    ['twitter:description', description]
  ]) {
    const meta = $(`meta[property="${property}"], meta[name="${property}"]`);
    if (meta) meta.setAttribute('content', value);
  }
}

/* --------------------------------------------------------------------------
   Sekmeler & liste
   -------------------------------------------------------------------------- */

function renderTabs() {
  if (!dom.yearTabs) return;
  const years = [...new Set(state.posts.map((post) => post.date.slice(0, 4)))].sort().reverse();
  if (state.year !== 'all' && !years.includes(state.year)) state.year = 'all';

  dom.yearTabs.innerHTML = [
    `<button class="year-tab" type="button" data-year="all" aria-pressed="${state.year === 'all'}">Tümü</button>`,
    ...years.map((year) =>
      `<button class="year-tab" type="button" data-year="${year}" aria-pressed="${state.year === year}">${year}</button>`
    )
  ].join('');
}

function renderPosts() {
  if (!dom.list) return;
  dom.list.setAttribute('aria-busy', 'false');

  if (!state.posts.length) {
    dom.list.innerHTML = '';
    if (dom.empty) {
      dom.empty.hidden = false;
      dom.empty.innerHTML = '<p>Henüz yazı yok.</p>';
    }
    return;
  }

  if (dom.empty) dom.empty.hidden = true;
  dom.list.innerHTML = state.posts.map((post, index) => `
    <li class="post-item" style="--i:${Math.min(index, 8)}">
      <a class="post-row" href="post.html?id=${encodeURIComponent(post.id)}" data-id="${escapeHTML(post.id)}" data-year="${post.date.slice(0, 4)}">
        <time class="post-date" datetime="${post.date}">${formatShort(post.date)}</time>
        <span class="post-row-title">${escapeHTML(postTitle(post))}</span>
        <svg class="post-arrow" aria-hidden="true"><use href="#i-arrow-up-right"></use></svg>
      </a>
    </li>`).join('');

  applyFilters();
}

function applyFilters() {
  const terms = normalize(state.query.trim()).split(/\s+/).filter(Boolean);
  let visible = 0;

  for (const row of $$('.post-item', dom.list)) {
    const anchor = $('.post-row', row);
    const id = anchor.dataset.id;
    const matchesYear = state.year === 'all' || anchor.dataset.year === state.year;
    const haystack = state.searchIndex.get(id) || '';
    const matchesQuery = terms.every((term) => haystack.includes(term));
    const show = matchesYear && matchesQuery;
    row.hidden = !show;
    if (show) visible += 1;
  }

  if (!visible) {
    const filtered = Boolean(state.query.trim() || state.year !== 'all');
    renderEmpty(filtered ? 'Eşleşen yazı yok.' : 'Henüz yazı yok.', filtered);
  } else if (dom.empty) {
    dom.empty.hidden = true;
  }
}

function renderEmpty(message, withClear = false) {
  if (!dom.empty) return;
  dom.empty.hidden = false;
  dom.empty.innerHTML = `
    <p>${escapeHTML(message)}</p>
    ${withClear ? '<button type="button" id="clear-filters">Filtreleri temizle</button>' : ''}`;
  $('#clear-filters')?.addEventListener('click', clearFilters);
}

function clearFilters() {
  state.query = '';
  state.year = 'all';
  if (dom.searchInput) dom.searchInput.value = '';
  renderTabs();
  applyFilters();
  dom.searchInput?.focus();
}

function initFilters() {
  dom.yearTabs?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-year]');
    if (!button) return;
    state.year = button.dataset.year;
    renderTabs();
    applyFilters();
  });

  dom.searchInput?.addEventListener('input', () => {
    state.query = dom.searchInput.value;
    applyFilters();
  });
}

function renderError() {
  if (dom.list) {
    dom.list.innerHTML = '';
    dom.list.setAttribute('aria-busy', 'false');
  }
  if (dom.empty) {
    dom.empty.hidden = false;
    dom.empty.innerHTML = `
      <p>Yazılar yüklenemedi.</p>
      <button type="button" id="retry-load">Yeniden dene</button>`;
    $('#retry-load')?.addEventListener('click', () => {
      dom.empty.hidden = true;
      dom.list.innerHTML = '<li class="list-loading">Yükleniyor…</li>';
      dom.list.setAttribute('aria-busy', 'true');
      loadData();
    });
  }
}

function initShortcuts() {
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      dom.searchInput?.focus();
      dom.searchInput?.select();
      return;
    }

    if (event.key === '/' && !isEditableTarget(event.target)) {
      event.preventDefault();
      dom.searchInput?.focus();
    }
  });
}

/* --------------------------------------------------------------------------
   Başlat
   -------------------------------------------------------------------------- */

init();
