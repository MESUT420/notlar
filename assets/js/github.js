/* ==========================================================================
   GitHub Contents API — küçük, bağımlılıksız istemci
   ========================================================================== */

const API = 'https://api.github.com';

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(String(value).replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodePath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

export class GitHubError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.data = data;
  }
}

export class GitHub {
  constructor({ token, owner, repo, branch = 'main' }) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch || 'main';
  }

  async request(path, { method = 'GET', body = null } = {}) {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      let data = null;
      try { data = await response.json(); } catch { /* boş yanıt */ }
      throw new GitHubError(data?.message || `GitHub isteği başarısız (${response.status})`, response.status, data);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  async getUser() {
    return this.request('/user');
  }

  async getRepo() {
    return this.request(`/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`);
  }

  async getFile(path) {
    const endpoint = `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(this.branch)}`;
    try {
      const data = await this.request(endpoint);
      if (Array.isArray(data)) throw new GitHubError('Yol bir dosya değil.', 400);
      return {
        content: decodeBase64(data.content || ''),
        sha: data.sha,
        path: data.path
      };
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return null;
      throw error;
    }
  }

  async putFile(path, content, message, sha = null) {
    const body = {
      message,
      content: encodeBase64(content),
      branch: this.branch
    };
    if (sha) body.sha = sha;

    return this.request(
      `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/contents/${encodePath(path)}`,
      { method: 'PUT', body }
    );
  }
}

export function githubErrorMessage(error) {
  if (!(error instanceof GitHubError)) {
    if (error?.name === 'TypeError') return 'Bağlantı kurulamadı. İnternetini kontrol et.';
    return error?.message || 'Bağlantı kurulamadı.';
  }
  switch (error.status) {
    case 401:
      return 'Erişim anahtarı geçersiz veya süresi dolmuş.';
    case 403:
      return 'Bu işlem için izin yok. Anahtarda “Contents: Read and write” yetkisi olmalı.';
    case 404:
      return 'Depo bulunamadı ya da anahtarın bu depoya erişimi yok.';
    case 409:
      return 'Dosya bu sırada değişti. Tekrar deniyorum…';
    case 422:
      return 'Değişiklik uygulanamadı. Dosya biçimini kontrol et.';
    default:
      return error.message || 'GitHub isteği başarısız oldu.';
  }
}
