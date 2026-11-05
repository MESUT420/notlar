/* ==========================================================================
   Notlar — yazı sayfası
   ========================================================================== */

import {
  formatLong,
  normalizePosts,
  postTitle,
  plainText
} from './core.js';
import { loadPosts, loadSite } from './data.js';
import { renderMarkdown } from './markdown.js';

const $ = (selector, root = document) => root.querySelector(selector);

const DEFAULT_SITE = {
  title: 'Notlar',
  description: '',
  author: ''
};

const state = {
  post: null,
  site: { ...DEFAULT_SITE }
};

const dom = {};

function cacheDom() {
  dom.article = $('#post');
  dom.date = $('#post-date');
  dom.title = $('#post-title');
  dom.content = $('#post-content');
  dom.status = $('#post-status');
  dom.progress = $('#reading-progress-bar');
}

function init() {
  cacheDom();
  initProgress();
  loadPost();
}

/* --------------------------------------------------------------------------
   Okuma çubuğu
   -------------------------------------------------------------------------- */

function initProgress() {
  let scheduled = false;
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, (window.scrollY || 0) / max)) : 0;
    if (dom.progress) dom.progress.style.transform = `scaleX(${ratio})`;
    scheduled = false;
  };
  const request = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request, { passive: true });
  update();
}

/* --------------------------------------------------------------------------
   Veri
   -------------------------------------------------------------------------- */

async function loadPost() {
  const id = new URLSearchParams(window.location.search).get('id');

  try {
    const [postsResult, siteResult] = await Promise.all([
      loadPosts(),
      loadSite().catch(() => null)
    ]);

    if (siteResult && typeof siteResult === 'object') {
      state.site = { ...DEFAULT_SITE, ...siteResult };
    }
    applySite();

    const payload = postsResult;
    const raw = Array.isArray(payload) ? payload : payload && Array.isArray(payload.posts) ? payload.posts : [];
    const posts = normalizePosts(raw);
    const post = id ? posts.find((item) => item.id === id) : null;

    if (!post) {
      showNotFound();
      return;
    }

    state.post = post;
    renderPost(post);
  } catch (error) {
    console.error('[Notlar] Yazı yüklenemedi:', error);
    showError();
  }
}

function applySite() {
  const site = state.site;
  const title = site.title || DEFAULT_SITE.title;
  const lower = title.toLocaleLowerCase('tr');
  const brandText = $('.brand-text');
  if (brandText) brandText.textContent = lower;
  const authorMeta = $('meta[name="author"]');
  if (authorMeta) authorMeta.setAttribute('content', site.author || title);
}

function renderPost(post) {
  const title = postTitle(post);
  const description = plainText(post.content).slice(0, 160);

  dom.date.textContent = formatLong(post.date);
  dom.title.textContent = title;
  dom.content.innerHTML = renderMarkdown(post.content);
  dom.article.hidden = false;
  dom.status.hidden = true;

  document.title = `${title} — ${state.site.title || 'Notlar'}`;

  const descriptionMeta = $('meta[name="description"]');
  if (descriptionMeta) descriptionMeta.setAttribute('content', description);
  const ogTitle = $('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', title);
  const ogDescription = $('meta[property="og:description"]');
  if (ogDescription) ogDescription.setAttribute('content', description);

  window.requestAnimationFrame(() => {
    if (window.location.hash) {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    }
  });
}

function showNotFound() {
  dom.article.hidden = true;
  dom.status.hidden = false;
  dom.status.innerHTML = '<p>Yazı bulunamadı. <a href="./">Tüm yazılara dön</a></p>';
  document.title = `Yazı bulunamadı — ${state.site.title || 'Notlar'}`;
}

function showError() {
  dom.article.hidden = true;
  dom.status.hidden = false;
  dom.status.innerHTML = '<p>Yazı yüklenemedi. <a href="./">Ana sayfaya dön</a></p>';
}

/* --------------------------------------------------------------------------
   Başlat
   -------------------------------------------------------------------------- */

init();
