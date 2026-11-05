/**
 * Küçük, bağımlılıksız Markdown yorumlayıcısı.
 * Notlar için gereken kadarı: başlık, paragraf, liste, alıntı,
 * bağlantı, görsel, kod, kalın/italik, üstü çizili ve yatay çizgi.
 *
 * Girdi önce HTML'den kaçırılır; ardından yalnızca bilinen etiketler
 * üretilir. Görsel/bağlantı adresleri şemaya göre doğrulanır.
 */

import { escapeHTML, escapeAttr } from './core.js';

const TOKEN_OPEN = '\uE000';
const TOKEN_CLOSE = '\uE001';

function safeUrl(raw, { image = false } = {}) {
  const url = String(raw || '').trim().replace(/^<|>$/g, '');
  if (!url) return '';
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (image && /^data:image\/(png|jpe?g|gif|webp|avif);/i.test(url)) return url;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith('//')) return url;
  return '';
}

function renderInline(source) {
  let text = escapeHTML(String(source ?? ''));
  const tokens = [];

  const keep = (html) => {
    const index = tokens.push(html) - 1;
    return `${TOKEN_OPEN}${index}${TOKEN_CLOSE}`;
  };

  // Satır içi kod — diğer biçimlendirmelerden önce ayrılır.
  text = text.replace(/`([^`\n]+)`/g, (_match, code) => keep(`<code>${code}</code>`));

  // Görseller.
  text = text.replace(
    /!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)/g,
    (match, alt, rawUrl, title) => {
      const url = safeUrl(rawUrl, { image: true });
      if (!url) return escapeHTML(alt || '');
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
      return keep(
        `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}"${titleAttr} loading="lazy" decoding="async">`
      );
    }
  );

  // Bağlantılar.
  text = text.replace(
    /\[([^\]]+)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)/g,
    (match, label, rawUrl, title) => {
      const url = safeUrl(rawUrl);
      if (!url) return label;
      const external = /^https?:/i.test(url);
      const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
      return keep(`<a href="${escapeAttr(url)}"${titleAttr}${attrs}>${label}</a>`);
    }
  );

  // Kalın, italik, üstü çizili.
  text = text
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

  // Tek satır sonları şiir gibi okunsun diye korunur.
  text = text.replace(/\n/g, '<br>');

  // Parçaları geri yerleştir. Kod içindeki özel karakterler zaten kaçırıldı.
  return text.replace(new RegExp(`${TOKEN_OPEN}(\\d+)${TOKEN_CLOSE}`, 'g'), (_m, index) => tokens[Number(index)] ?? '');
}

function isBlockStart(line) {
  const value = line.trim();
  return (
    !value ||
    /^@@GUNLUKCODE\d+@@$/.test(value) ||
    /^#{1,4}\s+/.test(value) ||
    /^>\s?/.test(value) ||
    /^([-*+]|\d+[.)])\s+/.test(value) ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(value)
  );
}

export function renderMarkdown(source) {
  if (!source) return '';
  const codeBlocks = [];
  let text = String(source).replace(/\r\n?/g, '\n');

  // Kapalı kod blokları.
  text = text.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const language = lang ? ` class="language-${escapeAttr(lang)}"` : '';
    const index = codeBlocks.push(`<pre><code${language}>${escapeHTML(code.replace(/\n$/, ''))}</code></pre>`) - 1;
    return `\n\n@@GUNLUKCODE${index}@@\n\n`;
  });

  const lines = text.split('\n');
  const output = [];
  let listType = null;
  let index = 0;

  const closeList = () => {
    if (listType) {
      output.push(`</${listType}>`);
      listType = null;
    }
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      index += 1;
      continue;
    }

    const codeMatch = /^@@GUNLUKCODE(\d+)@@$/.exec(trimmed);
    if (codeMatch) {
      closeList();
      output.push(codeBlocks[Number(codeMatch[1])] || '');
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      closeList();
      output.push('<hr>');
      index += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = Math.min(5, heading[1].length + 1);
      output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeList();
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      output.push(`<blockquote>${renderInline(quote.join('\n'))}</blockquote>`);
      continue;
    }

    const unordered = /^[-*+]\s+(.*)$/.exec(line);
    if (unordered) {
      if (listType !== 'ul') {
        closeList();
        output.push('<ul>');
        listType = 'ul';
      }
      output.push(`<li>${renderInline(unordered[1])}</li>`);
      index += 1;
      continue;
    }

    const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ordered) {
      if (listType !== 'ol') {
        closeList();
        output.push('<ol>');
        listType = 'ol';
      }
      output.push(`<li>${renderInline(ordered[1])}</li>`);
      index += 1;
      continue;
    }

    closeList();
    const paragraph = [line];
    index += 1;
    while (index < lines.length && !isBlockStart(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    output.push(`<p>${renderInline(paragraph.join('\n'))}</p>`);
  }

  closeList();
  return output.join('\n');
}

/** Düzenleyici önizlemesinde repo-kökü görsellerini doğru yola çevirir. */
export function rewriteRelativeAssets(html, prefix = '../') {
  return String(html).replace(/(src|href)="(assets\/)/g, `$1="${escapeAttr(prefix)}$2`);
}
