/* ==========================================================================
   Studio — yazma masası
   GitHub Contents API ile çalışır. Anahtar yalnızca bu cihazda tutulur.
   ========================================================================== */

import {
  slugify,
  todayISO,
  isValidISO,
  formatShort,
  formatNumber,
  normalizePosts,
  postTitle,
  wordCount,
  escapeHTML,
  normalize
} from './core.js';
import { renderMarkdown, rewriteRelativeAssets } from './markdown.js';
import { GitHub, githubErrorMessage } from './github.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const CONFIG_KEY = 'notlar:github:v1';
const DRAFT_PREFIX = 'notlar:draft:v1:';

const DEFAULT_SITE = {
  title: 'Notlar',
  author: ''
};

const state = {
  config: null,
  github: null,
  user: null,
  posts: [],
  site: { ...DEFAULT_SITE },
  current: null,
  original: null,
  dirty: false,
  publishing: false,
  saveTimer: 0,
  toastTimer: 0,
  confirmResolver: null,
  confirmValue: false,
  preview: false,
  sidebarOpen: false
};

const dom = {};

function cacheDom() {
  dom.authView = $('#auth-view');
  dom.appView = $('#app-view');
  dom.authForm = $('#auth-form');
  dom.authOwner = $('#auth-owner');
  dom.authRepo = $('#auth-repo');
  dom.authBranch = $('#auth-branch');
  dom.authToken = $('#auth-token');
  dom.authError = $('#auth-error');
  dom.authSubmit = $('#auth-submit');

  dom.sidebar = $('#studio-sidebar');
  dom.sidebarScrim = $('#sidebar-scrim');
  dom.sidebarToggle = $('#sidebar-toggle');
  dom.sidebarClose = $('#sidebar-close');
  dom.newPost = $('#new-post');
  dom.postSearch = $('#post-search');
  dom.sidebarList = $('#sidebar-list');
  dom.sidebarCount = $('#sidebar-count');
  dom.settingsButton = $('#settings-button');
  dom.logoutButton = $('#logout-button');

  dom.saveStatus = $('#save-status');
  dom.publishButton = $('#publish-button');
  dom.deleteButton = $('#delete-button');
  dom.dateInput = $('#date-input');
  dom.editorState = $('#editor-state');
  dom.titleInput = $('#title-input');
  dom.contentInput = $('#content-input');
  dom.preview = $('#preview');
  dom.previewToggle = $('#preview-toggle');
  dom.wordCount = $('#word-count');
  dom.toolbar = $('.editor-toolbar');

  dom.settingsDialog = $('#settings-dialog');
  dom.siteTitle = $('#site-title');
  dom.siteAuthor = $('#site-author');
  dom.siteDescription = $('#site-description');
  dom.connectionInfo = $('#connection-info');
  dom.settingsSave = $('#settings-save');

  dom.confirmDialog = $('#confirm-dialog');
  dom.confirmTitle = $('#confirm-title');
  dom.confirmMessage = $('#confirm-message');
  dom.confirmOk = $('#confirm-ok');
  dom.confirmCancel = $('#confirm-cancel');

  dom.toast = $('#toast');
}

function init() {
  cacheDom();
  bindAuth();
  bindSidebar();
  bindEditor();
  bindModals();
  initShortcuts();

  const savedConfig = readConfig();
  prefillAuth(savedConfig);

  if (savedConfig?.token) {
    connect(savedConfig, true);
  }
}

/* --------------------------------------------------------------------------
   Yerel ayar & taslaklar
   -------------------------------------------------------------------------- */

function readConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeConfig(config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* sessiz */
  }
}

function clearConfig() {
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* sessiz */
  }
}

function draftKey(id) {
  return `${DRAFT_PREFIX}${id || 'new'}`;
}

function readDraft(id) {
  try {
    const raw = localStorage.getItem(draftKey(id));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !data.post) return null;
    return data;
  } catch {
    return null;
  }
}

function saveDraft() {
  if (!state.current) return true;
  const post = {
    id: state.current.id,
    date: dom.dateInput.value || state.current.date || todayISO(),
    title: dom.titleInput.value,
    content: dom.contentInput.value,
    createdAt: state.current.createdAt || null,
    updatedAt: state.current.updatedAt || null
  };
  state.current = { ...state.current, ...post };
  try {
    localStorage.setItem(draftKey(post.id), JSON.stringify({ post, at: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

function removeDraft(id) {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    /* sessiz */
  }
}

function flushDraft() {
  clearTimeout(state.saveTimer);
  if (state.dirty && state.current) saveDraft();
}

/* --------------------------------------------------------------------------
   Giriş
   -------------------------------------------------------------------------- */

function hostDefaults() {
  const host = window.location.hostname;
  const segments = window.location.pathname.split('/').filter(Boolean);

  if (host.endsWith('.github.io')) {
    const owner = host.slice(0, -'.github.io'.length);
    const repo = segments[0] && segments[0] !== 'studio' ? segments[0] : `${owner}.github.io`;
    return { owner, repo };
  }

  return { owner: '', repo: '' };
}

function prefillAuth(config) {
  const defaults = hostDefaults();
  dom.authOwner.value = config?.owner || defaults.owner || '';
  dom.authRepo.value = config?.repo || defaults.repo || '';
  dom.authBranch.value = config?.branch || 'main';
  dom.authToken.value = '';
  hideAuthError();
}

function bindAuth() {
  dom.authForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const config = {
      owner: dom.authOwner.value.trim(),
      repo: dom.authRepo.value.trim(),
      branch: dom.authBranch.value.trim() || 'main',
      token: dom.authToken.value.trim()
    };

    if (!config.owner || !config.repo || !config.token) {
      showAuthError('Kullanıcı adı, depo ve erişim anahtarı gerekli.');
      return;
    }

    connect(config, false);
  });
}

function setAuthBusy(busy) {
  dom.authSubmit.disabled = busy;
  dom.authSubmit.textContent = busy ? 'Bağlanıyor…' : 'Bağlan';
}

function showAuthError(message) {
  dom.authError.textContent = message;
  dom.authError.hidden = false;
}

function hideAuthError() {
  dom.authError.hidden = true;
  dom.authError.textContent = '';
}

async function connect(config, silent) {
  hideAuthError();
  setAuthBusy(true);

  try {
    const github = new GitHub(config);
    const user = await github.getUser();
    const repo = await github.getRepo();

    if (!config.branch) config.branch = repo.default_branch || 'main';
    github.branch = config.branch;

    const postsFile = await github.getFile('data/posts.json');
    const siteFile = await github.getFile('data/site.json');

    const posts = parsePostsFile(postsFile);
    const site = parseSiteFile(siteFile);

    const nextConfig = {
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      token: config.token,
      login: user.login
    };

    state.config = nextConfig;
    state.github = github;
    state.user = user;
    state.posts = posts;
    state.site = { ...DEFAULT_SITE, ...site };
    writeConfig(nextConfig);

    showApp();
    applySiteBrand();
    renderSidebar();

    if (!state.posts.length) {
      newPost();
    } else {
      selectPost(state.posts[0].id);
    }

    dom.authToken.value = '';
    setAuthBusy(false);
  } catch (error) {
    console.error('[Studio] Bağlantı hatası:', error);
    setAuthBusy(false);
    showAuth();
    prefillAuth({ ...config, token: '' });
    showAuthError(githubErrorMessage(error));
  }
}

function parsePostsFile(file) {
  if (!file) return [];
  try {
    const payload = JSON.parse(file.content);
    const posts = Array.isArray(payload) ? payload : payload?.posts;
    return normalizePosts(posts || []);
  } catch {
    throw new Error('Depodaki data/posts.json okunamadı.');
  }
}

function parseSiteFile(file) {
  if (!file) return { ...DEFAULT_SITE };
  try {
    const payload = JSON.parse(file.content);
    return payload && typeof payload === 'object' ? payload : { ...DEFAULT_SITE };
  } catch {
    throw new Error('Depodaki data/site.json okunamadı.');
  }
}

function showAuth() {
  dom.appView.hidden = true;
  dom.authView.hidden = false;
  document.title = 'Studio — Notlar';
}

function showApp() {
  dom.authView.hidden = true;
  dom.appView.hidden = false;
  document.title = `${state.site.title || 'Notlar'} — Studio`;
}

function applySiteBrand() {
  const title = state.site.title || 'Notlar';
  const lower = title.toLocaleLowerCase('tr');
  for (const node of $$('.brand-text')) node.textContent = lower;
  if (!dom.appView.hidden) document.title = `${title} — Studio`;
}

/* --------------------------------------------------------------------------
   Kenar çubuğu
   -------------------------------------------------------------------------- */

function bindSidebar() {
  dom.newPost.addEventListener('click', newPost);
  dom.postSearch.addEventListener('input', renderSidebar);

  dom.sidebarList.addEventListener('click', (event) => {
    const item = event.target.closest('[data-post-id]');
    if (item) selectPost(item.dataset.postId);
  });

  dom.sidebarToggle.addEventListener('click', openSidebar);
  dom.sidebarClose.addEventListener('click', closeSidebar);
  dom.sidebarScrim.addEventListener('click', closeSidebar);

  dom.settingsButton.addEventListener('click', () => {
    closeSidebar();
    openSettings();
  });

  dom.logoutButton.addEventListener('click', async () => {
    closeSidebar();
    const confirmed = await confirmAction({
      title: 'Çıkış yap?',
      message: 'Erişim anahtarı bu cihazdan silinecek. Yerel taslaklar korunur.',
      okLabel: 'Çıkış yap'
    });
    if (!confirmed) return;

    const lastConfig = state.config;
    clearConfig();
    state.config = null;
    state.github = null;
    state.user = null;
    state.posts = [];
    state.current = null;
    state.original = null;
    state.dirty = false;
    prefillAuth({ ...lastConfig, token: '' });
    showAuth();
  });
}

function renderSidebar() {
  if (!dom.sidebarList) return;
  const query = normalize(dom.postSearch.value.trim());
  const posts = query
    ? state.posts.filter((post) =>
        normalize([post.title, post.content, post.date].join(' ')).includes(query)
      )
    : state.posts;

  dom.sidebarCount.textContent = String(state.posts.length);

  if (!posts.length) {
    dom.sidebarList.innerHTML = `<li class="sidebar-empty">${query ? 'Eşleşen yazı yok.' : 'Henüz yazı yok.'}</li>`;
    return;
  }

  dom.sidebarList.innerHTML = posts.map((post) => {
    const active = state.current?.id === post.id;
    return `
      <li>
        <button class="sidebar-item${active ? ' is-active' : ''}" type="button" data-post-id="${escapeHTML(post.id)}">
          <span class="sidebar-item-date">${formatShort(post.date)}</span>
          <span class="sidebar-item-title">${escapeHTML(postTitle(post))}</span>
        </button>
      </li>`;
  }).join('');
}

function openSidebar() {
  state.sidebarOpen = true;
  dom.sidebar.classList.add('is-open');
  dom.sidebarScrim.hidden = false;
  requestAnimationFrame(() => dom.sidebarScrim.classList.add('is-visible'));
  dom.sidebarToggle.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  state.sidebarOpen = false;
  dom.sidebar.classList.remove('is-open');
  dom.sidebarScrim.classList.remove('is-visible');
  setTimeout(() => {
    if (!state.sidebarOpen) dom.sidebarScrim.hidden = true;
  }, 220);
  dom.sidebarToggle.setAttribute('aria-expanded', 'false');
}

/* --------------------------------------------------------------------------
   Editör
   -------------------------------------------------------------------------- */

function bindEditor() {
  dom.dateInput.addEventListener('input', onEditorInput);
  dom.titleInput.addEventListener('input', onEditorInput);
  dom.contentInput.addEventListener('input', onEditorInput);
  dom.contentInput.addEventListener('keydown', onContentKeydown);

  dom.previewToggle.addEventListener('click', togglePreview);
  dom.deleteButton.addEventListener('click', deleteCurrent);
  dom.publishButton.addEventListener('click', publishCurrent);

  dom.toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-md]');
    if (!button) return;
    applyMarkdown(button.dataset.md);
  });

  window.addEventListener('resize', autoResize);

  window.addEventListener('beforeunload', () => {
    if (state.dirty && state.current) {
      clearTimeout(state.saveTimer);
      saveDraft();
    }
  });
}

function onEditorInput() {
  if (!state.current) return;
  state.current = {
    ...state.current,
    date: dom.dateInput.value || todayISO(),
    title: dom.titleInput.value,
    content: dom.contentInput.value
  };
  state.dirty = true;
  dom.editorState.textContent = 'Taslak';
  dom.saveStatus.textContent = 'Kaydediliyor…';
  document.title = `${dom.titleInput.value.trim() || 'Yeni yazı'} — Studio`;
  updateWordCount();
  autoResize();
  if (state.preview) updatePreview();

  clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(() => {
    const ok = saveDraft();
    dom.saveStatus.textContent = ok ? 'Taslak kaydedildi' : 'Taslak kaydedilemedi';
  }, 550);
}

function updateWordCount() {
  if (!dom.wordCount) return;
  const count = wordCount(dom.contentInput.value);
  dom.wordCount.textContent = `${formatNumber(count)} kelime`;
}

function autoResize() {
  if (!dom.contentInput || state.preview) return;
  dom.contentInput.style.height = 'auto';
  const minHeight = Math.max(window.innerHeight * 0.42, 280);
  dom.contentInput.style.height = `${Math.max(dom.contentInput.scrollHeight, minHeight)}px`;
}

function setPreview(on) {
  const wasPreview = state.preview;
  state.preview = on;
  dom.previewToggle.classList.toggle('is-active', on);
  dom.previewToggle.textContent = on ? 'Yaz' : 'Önizleme';
  dom.previewToggle.setAttribute('aria-pressed', String(on));

  if (on) {
    updatePreview();
    dom.preview.hidden = false;
    dom.contentInput.hidden = true;
  } else {
    dom.preview.hidden = true;
    dom.contentInput.hidden = false;
    autoResize();
    if (wasPreview) dom.contentInput.focus();
  }
}

function togglePreview() {
  setPreview(!state.preview);
}

function updatePreview() {
  const html = renderMarkdown(dom.contentInput.value);
  dom.preview.innerHTML = rewriteRelativeAssets(html, '../');
}

function selectPost(id) {
  const post = state.posts.find((item) => item.id === id);
  if (!post) return;

  flushDraft();
  closeSidebar();

  const draft = readDraft(id);
  let working = { ...post };
  let restored = false;

  if (draft?.post) {
    const differs =
      String(draft.post.title || '') !== String(post.title || '') ||
      String(draft.post.content || '') !== String(post.content || '') ||
      String(draft.post.date || '') !== String(post.date || '');

    if (differs) {
      working = {
        ...post,
        date: isValidISO(draft.post.date) ? draft.post.date : post.date,
        title: String(draft.post.title || ''),
        content: String(draft.post.content || '')
      };
      restored = true;
    }
  }

  state.original = { ...post };
  state.current = working;
  state.dirty = restored;

  dom.dateInput.value = working.date;
  dom.titleInput.value = working.title || '';
  dom.contentInput.value = working.content || '';
  dom.deleteButton.hidden = false;
  dom.editorState.textContent = restored ? 'Yerel taslak' : 'Yayında';
  dom.saveStatus.textContent = restored ? 'Taslak yüklendi' : 'Hazır';
  document.title = `${postTitle(working)} — Studio`;

  setPreview(false);
  updateWordCount();
  autoResize();
  renderSidebar();

  if (restored) showToast('Yerel taslak geri yüklendi.');
}

function newPost() {
  flushDraft();
  closeSidebar();

  const draft = readDraft('new');
  const base = {
    id: null,
    date: todayISO(),
    title: '',
    content: '',
    createdAt: null,
    updatedAt: null
  };

  const restored = Boolean(draft?.post && (String(draft.post.title || '').trim() || String(draft.post.content || '').trim()));
  const working = restored
    ? {
        ...base,
        date: isValidISO(draft.post.date) ? draft.post.date : base.date,
        title: String(draft.post.title || ''),
        content: String(draft.post.content || '')
      }
    : base;

  state.original = null;
  state.current = working;
  state.dirty = restored;

  dom.dateInput.value = working.date;
  dom.titleInput.value = working.title;
  dom.contentInput.value = working.content;
  dom.deleteButton.hidden = true;
  dom.editorState.textContent = restored ? 'Yerel taslak' : 'Yeni yazı';
  dom.saveStatus.textContent = restored ? 'Taslak yüklendi' : 'Hazır';
  document.title = 'Yeni yazı — Studio';

  setPreview(false);
  updateWordCount();
  autoResize();
  renderSidebar();
  dom.titleInput.focus();

  if (restored) showToast('Yerel taslak geri yüklendi.');
}

/* --------------------------------------------------------------------------
   Markdown araçları
   -------------------------------------------------------------------------- */

function applyMarkdown(action) {
  if (state.preview) setPreview(false);
  const input = dom.contentInput;

  if (action === 'bold') wrapSelection(input, '**', '**');
  else if (action === 'italic') wrapSelection(input, '*', '*');
  else if (action === 'h2') prefixLines(input, '## ');
  else if (action === 'quote') prefixLines(input, '> ');
  else if (action === 'list') prefixLines(input, '- ');
  else if (action === 'link') insertLink(input);
}

function notifyInput() {
  dom.contentInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function wrapSelection(input, before, after = before) {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const value = input.value;
  const selected = value.slice(start, end) || 'metin';
  const replacement = `${before}${selected}${after}`;
  input.value = value.slice(0, start) + replacement + value.slice(end);
  input.focus();
  input.setSelectionRange(start + before.length, start + before.length + selected.length);
  notifyInput();
}

function prefixLines(input, prefix) {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const value = input.value;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = value.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const block = value.slice(lineStart, lineEnd);
  const replacement = block.split('\n').map((line) => `${prefix}${line}`).join('\n');
  input.value = value.slice(0, lineStart) + replacement + value.slice(lineEnd);
  input.focus();
  input.setSelectionRange(lineStart, lineStart + replacement.length);
  notifyInput();
}

function insertLink(input) {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const value = input.value;
  const selected = value.slice(start, end) || 'bağlantı';
  const replacement = `[${selected}](https://)`;
  input.value = value.slice(0, start) + replacement + value.slice(end);

  const urlStart = start + selected.length + 3;
  input.focus();
  input.setSelectionRange(urlStart, urlStart + 'https://'.length);
  notifyInput();
}

function onContentKeydown(event) {
  if (!(event.metaKey || event.ctrlKey)) return;
  const key = event.key.toLowerCase();
  if (key === 'b') {
    event.preventDefault();
    applyMarkdown('bold');
  } else if (key === 'i') {
    event.preventDefault();
    applyMarkdown('italic');
  }
}

/* --------------------------------------------------------------------------
   Yayınlama
   -------------------------------------------------------------------------- */

async function publishCurrent() {
  if (state.publishing || !state.github) return;

  if (!dom.contentInput.value.trim()) {
    showToast('Yazı boş. Önce bir şeyler yaz.');
    dom.contentInput.focus();
    return;
  }

  flushDraft();
  state.publishing = true;
  dom.publishButton.disabled = true;
  dom.publishButton.textContent = 'Yayınlanıyor…';
  dom.saveStatus.textContent = 'Yayınlanıyor…';

  const now = new Date().toISOString();
  const base = {
    id: state.current?.id || null,
    date: isValidISO(dom.dateInput.value) ? dom.dateInput.value : todayISO(),
    title: dom.titleInput.value.trim(),
    content: dom.contentInput.value,
    createdAt: state.current?.createdAt || now,
    updatedAt: now
  };

  let chosenId = base.id;
  let finalPost = null;

  try {
    const message = `yazı: ${base.title || formatShort(base.date)}`;

    const merged = await commitPosts((latest) => {
      if (!chosenId) chosenId = uniqueId(base, latest);
      finalPost = { ...base, id: chosenId };
      return [...latest.filter((post) => post.id !== chosenId), finalPost];
    }, message);

    state.posts = merged;
    state.current = finalPost ? { ...finalPost } : state.current;
    state.original = finalPost ? { ...finalPost } : null;
    state.dirty = false;

    removeDraft('new');
    if (finalPost?.id) removeDraft(finalPost.id);

    dom.deleteButton.hidden = !finalPost?.id;
    dom.editorState.textContent = 'Yayında';
    dom.saveStatus.textContent = 'Yayınlandı';
    document.title = `${postTitle(finalPost || base)} — Studio`;

    renderSidebar();
    showToast('Yayınlandı. Siteyi yenilediğinde görünür.', 4200);
  } catch (error) {
    console.error('[Studio] Yayın hatası:', error);
    dom.saveStatus.textContent = 'Yayınlanamadı';
    showToast(githubErrorMessage(error));
  } finally {
    state.publishing = false;
    dom.publishButton.disabled = false;
    dom.publishButton.textContent = 'Yayınla';
  }
}

function uniqueId(post, latest) {
  const base = post.title.trim() ? slugify(post.title) : `not-${post.date}`;
  let id = base;
  let counter = 2;
  while (latest.some((item) => item.id === id)) {
    id = `${base}-${counter}`;
    counter += 1;
  }
  return id;
}

async function commitPosts(mutator, message) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const file = await state.github.getFile('data/posts.json');
    const latest = parsePostsFile(file);
    const merged = normalizePosts(mutator(latest));
    const content = `${JSON.stringify({ version: 2, posts: merged }, null, 2)}\n`;

    try {
      await state.github.putFile('data/posts.json', content, message, file?.sha || null);
      return merged;
    } catch (error) {
      lastError = error;
      if (error.status === 409 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

async function deleteCurrent() {
  if (!state.current?.id || !state.github) return;

  const confirmed = await confirmAction({
    title: 'Yazıyı sil?',
    message: `“${postTitle(state.current)}” kalıcı olarak silinecek.`,
    okLabel: 'Sil'
  });
  if (!confirmed) return;

  const deletingId = state.current.id;
  clearTimeout(state.saveTimer);
  state.dirty = false;
  dom.deleteButton.disabled = true;
  dom.saveStatus.textContent = 'Siliniyor…';

  try {
    const merged = await commitPosts(
      (latest) => latest.filter((post) => post.id !== deletingId),
      `sil: ${postTitle(state.current)}`
    );

    state.posts = merged;
    removeDraft(deletingId);
    state.current = null;
    state.original = null;
    state.dirty = false;

    if (merged.length) selectPost(merged[0].id);
    else newPost();

    showToast('Yazı silindi. Siteyi yenilediğinde listeden kalkar.', 4200);
  } catch (error) {
    console.error('[Studio] Silme hatası:', error);
    state.dirty = true;
    showToast(githubErrorMessage(error));
    dom.saveStatus.textContent = 'Silinemedi';
  } finally {
    dom.deleteButton.disabled = false;
  }
}

/* --------------------------------------------------------------------------
   Ayarlar
   -------------------------------------------------------------------------- */

function openSettings() {
  if (!state.github) return;
  dom.siteTitle.value = state.site.title || 'Notlar';
  dom.siteAuthor.value = state.site.author || '';
  dom.siteDescription.value = state.site.description || '';
  dom.connectionInfo.textContent = `@${state.config.login} · ${state.config.owner}/${state.config.repo} · ${state.config.branch}`;
  dom.settingsDialog.showModal();
}

function bindModals() {
  for (const button of $$('[data-close-settings]')) {
    button.addEventListener('click', () => dom.settingsDialog.close());
  }

  dom.settingsDialog.addEventListener('click', (event) => {
    if (event.target === dom.settingsDialog) dom.settingsDialog.close();
  });

  dom.settingsSave.addEventListener('click', saveSettings);

  dom.confirmOk.addEventListener('click', () => {
    state.confirmValue = true;
    dom.confirmDialog.close();
  });

  dom.confirmCancel.addEventListener('click', () => {
    state.confirmValue = false;
    dom.confirmDialog.close();
  });

  dom.confirmDialog.addEventListener('close', () => {
    if (!state.confirmResolver) return;
    const resolve = state.confirmResolver;
    state.confirmResolver = null;
    resolve(state.confirmValue);
  });
}

async function saveSettings() {
  if (!state.github) return;

  const title = dom.siteTitle.value.trim() || 'Notlar';
  const author = dom.siteAuthor.value.trim();
  const description = dom.siteDescription.value.trim();

  dom.settingsSave.disabled = true;
  dom.settingsSave.textContent = 'Kaydediliyor…';

  try {
    const updated = await commitSite((latest) => ({
      ...latest,
      title,
      author,
      description
    }), 'ayarlar: site');

    state.site = { ...state.site, ...updated };
    applySiteBrand();
    dom.settingsDialog.close();
    showToast('Ayarlar kaydedildi.');
  } catch (error) {
    console.error('[Studio] Ayar hatası:', error);
    showToast(githubErrorMessage(error));
  } finally {
    dom.settingsSave.disabled = false;
    dom.settingsSave.textContent = 'Kaydet';
  }
}

async function commitSite(mutator, message) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const file = await state.github.getFile('data/site.json');
    let latest = {};
    if (file) {
      try {
        latest = JSON.parse(file.content);
      } catch {
        throw new Error('data/site.json okunamadı.');
      }
    }

    const merged = mutator(latest);
    const content = `${JSON.stringify(merged, null, 2)}\n`;

    try {
      await state.github.putFile('data/site.json', content, message, file?.sha || null);
      return merged;
    } catch (error) {
      lastError = error;
      if (error.status === 409 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

/* --------------------------------------------------------------------------
   Onay & bildirim
   -------------------------------------------------------------------------- */

function confirmAction({ title, message, okLabel = 'Sil' }) {
  return new Promise((resolve) => {
    if (state.confirmResolver) {
      const previous = state.confirmResolver;
      state.confirmResolver = null;
      previous(false);
    }

    state.confirmValue = false;
    state.confirmResolver = resolve;
    dom.confirmTitle.textContent = title;
    dom.confirmMessage.textContent = message;
    dom.confirmOk.textContent = okLabel;
    dom.confirmDialog.showModal();
  });
}

function showToast(message, duration = 2800) {
  if (!dom.toast) return;
  dom.toast.textContent = message;
  const supportsPopover = typeof dom.toast.showPopover === 'function';
  if (supportsPopover) {
    try {
      if (!dom.toast.matches(':popover-open')) dom.toast.showPopover();
    } catch {
      dom.toast.classList.add('is-visible');
    }
  } else {
    dom.toast.classList.add('is-visible');
  }
  clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    if (supportsPopover) {
      try { dom.toast.hidePopover(); } catch { /* kapalı */ }
    }
    dom.toast.classList.remove('is-visible');
  }, duration);
}

/* --------------------------------------------------------------------------
   Kısayollar
   -------------------------------------------------------------------------- */

function initShortcuts() {
  document.addEventListener('keydown', (event) => {
    if (state.sidebarOpen && event.key === 'Escape') {
      closeSidebar();
      return;
    }

    if (dom.appView.hidden) return;

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      clearTimeout(state.saveTimer);
      const ok = saveDraft();
      dom.saveStatus.textContent = ok ? 'Taslak kaydedildi' : 'Taslak kaydedilemedi';
      showToast(ok ? 'Taslak kaydedildi.' : 'Taslak kaydedilemedi.');
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      publishCurrent();
    }
  });
}

/* --------------------------------------------------------------------------
   Başlat
   -------------------------------------------------------------------------- */

init();
