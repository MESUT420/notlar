/**
 * Notlar — ortak yardımcılar
 * Hem okuma tarafı hem yazma masası bu dosyayı kullanır.
 */

export const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

export const MONTHS_SHORT = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'
];

export const WEEKDAYS = [
  'Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'
];

export const WEEKDAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

export const MOODS = [
  { key: 'sakin',     label: 'Sakin',     color: '#7c8b6f' },
  { key: 'neseli',    label: 'Neşeli',    color: '#c99a3b' },
  { key: 'huzunlu',   label: 'Hüzünlü',   color: '#6f86a6' },
  { key: 'yorgun',    label: 'Yorgun',    color: '#9a7f95' },
  { key: 'umutlu',    label: 'Umutlu',    color: '#b85c38' },
  { key: 'merakli',   label: 'Meraklı',   color: '#4f8f88' },
  { key: 'kaygili',   label: 'Kaygılı',   color: '#8d6a6a' },
  { key: 'minnettar', label: 'Minnettar', color: '#a8874f' }
];

const MOOD_MAP = new Map(MOODS.map((m) => [m.key, m]));

export function moodMeta(key) {
  return MOOD_MAP.get(String(key || '').toLocaleLowerCase('tr')) || null;
}

/** YYYY-MM-DD metnini yerel saat diliminde güvenli biçimde Date'e çevirir. */
export function parseISO(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) return null;
  return date;
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return toISO(new Date());
}

export function isValidISO(iso) {
  return parseISO(iso) !== null;
}

export function formatLong(iso) {
  const d = parseISO(iso);
  if (!d) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${WEEKDAYS[d.getDay()]}`;
}

export function formatDay(iso) {
  const d = parseISO(iso);
  return d ? String(d.getDate()).padStart(2, '0') : '';
}

export function formatMonthYear(iso) {
  const d = parseISO(iso);
  return d ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
}

export function formatMonth(iso) {
  const d = parseISO(iso);
  return d ? MONTHS[d.getMonth()] : '';
}

export function formatWeekday(iso, short = false) {
  const d = parseISO(iso);
  if (!d) return '';
  return (short ? WEEKDAYS_SHORT : WEEKDAYS)[d.getDay()];
}

export function formatShort(iso) {
  const d = parseISO(iso);
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

export function formatMonthYearShort(iso) {
  const d = parseISO(iso);
  return d ? `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}` : '';
}

/** "bugün", "dün", "3 gün önce" gibi okunur bir zaman farkı. */
export function relativeDay(iso, now = new Date()) {
  const d = parseISO(iso);
  if (!d) return '';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return 'bugün';
  if (diff === 1) return 'dün';
  if (diff > 1 && diff < 7) return `${diff} gün önce`;
  if (diff < 0 && diff > -7) return `${Math.abs(diff)} gün sonra`;
  return formatShort(iso);
}

export function wordCount(text) {
  const clean = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[#>*_`~]/g, ' ')
    .trim();
  return clean ? clean.split(/\s+/).length : 0;
}

export function readingTime(text) {
  const words = wordCount(text);
  return Math.max(1, Math.ceil(words / 200));
}

export function charCount(text) {
  return String(text || '').length;
}

export function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeAttr(value) {
  return escapeHTML(value);
}

/** Arama için Türkçe karakterleri sadeleştirir. */
export function normalize(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr')
    .replaceAll('ı', 'i')
    .replaceAll('İ', 'i')
    .replaceAll('ş', 's')
    .replaceAll('ğ', 'g')
    .replaceAll('ü', 'u')
    .replaceAll('ö', 'o')
    .replaceAll('ç', 'c')
    .replaceAll('â', 'a')
    .replaceAll('î', 'i')
    .replaceAll('û', 'u')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Markdown işaretlerini söküp düz metin üretir. */
export function plainText(markdown) {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function excerpt(markdown, max = 170) {
  const text = plainText(markdown);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trim()}…`;
}

export function debounce(fn, wait = 250) {
  let timer = 0;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  debounced.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return debounced;
}

export function formatNumber(value) {
  return new Intl.NumberFormat('tr-TR').format(Number(value) || 0);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Art arda gelen günleri sayar. Bugün yazılmadıysa dünden başlar. */
export function calcStreak(entries, today = todayISO()) {
  const days = new Set(entries.map((entry) => entry.date));
  const cursor = parseISO(today);
  if (!cursor) return 0;
  if (!days.has(today)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(toISO(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function sortEntries(entries, direction = 'desc') {
  return [...entries].sort((a, b) =>
    direction === 'desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)
  );
}

/** Birden fazla kayıt aynı tarihe düşerse en son güncelleneni tutar. */
export function normalizeEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const byDate = new Map();
  for (const item of raw) {
    if (!item || !isValidISO(item.date)) continue;
    const entry = {
      id: String(item.id || item.date),
      date: item.date,
      title: String(item.title || '').trim(),
      mood: String(item.mood || '').trim(),
      tags: Array.isArray(item.tags)
        ? item.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8)
        : [],
      content: String(item.content || ''),
      createdAt: item.createdAt || `${item.date}T00:00:00.000Z`,
      updatedAt: item.updatedAt || item.createdAt || `${item.date}T00:00:00.000Z`
    };
    const current = byDate.get(entry.date);
    if (!current || entry.updatedAt > current.updatedAt) byDate.set(entry.date, entry);
  }
  return sortEntries([...byDate.values()]);
}

/** Yazıları doğrular ve tarihe göre sıralar. */
export function normalizePosts(raw) {
  if (!Array.isArray(raw)) return [];
  const byId = new Map();
  for (const item of raw) {
    if (!item || !isValidISO(item.date)) continue;
    const title = String(item.title || '').trim();
    const id = slugify(item.id || `${title}-${item.date}`) || `${item.date}`;
    const post = {
      id,
      date: item.date,
      title,
      content: String(item.content || ''),
      createdAt: item.createdAt || `${item.date}T00:00:00.000Z`,
      updatedAt: item.updatedAt || item.createdAt || `${item.date}T00:00:00.000Z`
    };
    const current = byId.get(post.id);
    if (!current || post.updatedAt > current.updatedAt) byId.set(post.id, post);
  }
  return [...byId.values()].sort((a, b) =>
    b.date.localeCompare(a.date) || String(b.updatedAt).localeCompare(String(a.updatedAt))
  );
}

export function postTitle(post) {
  return post.title || formatLong(post.date);
}

export function storageGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* sessiz geç */
  }
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export function romanYear(year) {
  const map = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  let n = Number(year);
  if (!Number.isFinite(n) || n <= 0) return '';
  let out = '';
  for (const [value, numeral] of map) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out;
}

export function slugify(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'kayit';
}

export function isoFromDateInput(value) {
  return isValidISO(value) ? value : todayISO();
}

export function downloadText(filename, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
