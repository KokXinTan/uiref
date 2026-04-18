/**
 * @uiref/svelte — Svelte preprocessor that injects data-uiref-* attributes
 * onto the first element of each component so the uiref Chrome extension
 * can resolve DOM → source location.
 *
 * Works with both Svelte 4 and Svelte 5 (the preprocessor runs before the
 * main compiler, so it's framework-version-stable).
 *
 * Usage (svelte.config.js):
 *
 *   import uiref from '@uiref/svelte';
 *   export default {
 *     preprocess: [uiref()],
 *   };
 *
 * Options:
 *   - enabled: boolean | (filename) => boolean   (default: process.env.NODE_ENV !== 'production')
 *   - cwd: string                                 (default: process.cwd())  -- used to make paths project-relative
 */

import path from 'node:path';

function defaultEnabled() {
  return process.env.NODE_ENV !== 'production';
}

export default function uirefPreprocess(options = {}) {
  const enabled = options.enabled ?? defaultEnabled;
  const cwd = options.cwd ?? process.cwd();

  return {
    name: 'uiref',
    markup({ content, filename }) {
      const isEnabled = typeof enabled === 'function' ? enabled(filename) : enabled;
      if (!isEnabled) return { code: content };
      if (!filename) return { code: content };

      // Never process third-party components.
      if (filename.includes('/node_modules/') || filename.includes('\\node_modules\\')) {
        return { code: content };
      }

      let relFile = filename;
      try {
        relFile = path.relative(cwd, filename).replace(/\\/g, '/');
      } catch {}
      if (relFile.startsWith('..')) return { code: content };

      const componentName = path.basename(filename, path.extname(filename));

      // Tag EVERY HTML element in the template (not just the first). This
      // ensures inline <a>, <button>, <input> etc. resolve to their exact
      // source line even when they're inside {#if}/{#each} blocks or portaled
      // out of the component root. Component instances (capital-letter or
      // dotted tag names) are left alone — their data-uiref-* comes from
      // the child component's own preprocessing.
      const insertions = findAllInjectableElements(content);
      if (insertions.length === 0) return { code: content };

      // Apply insertions in reverse order so earlier offsets stay valid
      let code = content;
      for (let i = insertions.length - 1; i >= 0; i--) {
        const { insertAt, line } = insertions[i];
        const attrs =
          ` data-uiref-file="${escapeAttr(relFile)}"` +
          ` data-uiref-line="${line}"` +
          ` data-uiref-component="${escapeAttr(componentName)}"`;
        code = code.slice(0, insertAt) + attrs + code.slice(insertAt);
      }

      return { code };
    },
  };
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Find ALL HTML element opens outside of script/style/comment/svelte:* blocks.
 * Returns an array of { insertAt, line } for each element, in source order.
 *
 * Only lowercase-tag elements (HTML) are returned; Svelte component instances
 * (capital-letter or dotted tags like <MyComponent> or <Menu.Item>) are
 * skipped because they don't emit their own DOM root from the parent's side.
 * Those components' root elements get tagged by their own preprocessing.
 */
function findAllInjectableElements(src) {
  const masked = buildMask(src);
  const out = [];

  // Only match lowercase-start tags (HTML elements), not component instances.
  const tagRE = /<([a-z][a-zA-Z0-9-]*)\b/g;
  let m;
  while ((m = tagRE.exec(masked))) {
    const end = findOpenTagEnd(masked, m.index);
    if (!end) continue;
    const insertAt = end.selfClosing ? end.end - 1 : end.end;
    const line = src.slice(0, m.index).split('\n').length;
    out.push({ insertAt, line });
  }
  return out;
}

/**
 * Build a masked version of the source where script/style/svelte:* blocks
 * and HTML comments are replaced with whitespace so element-finding regexes
 * don't match things inside them.
 */
function buildMask(src) {
  const mask = src.split('');
  const patterns = [
    /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    /<!--[\s\S]*?-->/g,
    /<svelte:[a-z]+\b[^>]*>[\s\S]*?<\/svelte:[a-z]+\s*>/gi,
    /<svelte:[a-z]+\b[^>]*\/?>/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src))) {
      for (let i = m.index; i < m.index + m[0].length; i++) mask[i] = ' ';
    }
  }
  return mask.join('');
}

/**
 * Legacy: find the FIRST element outside blocks.
 * Kept for backward compat; not used by the preprocessor anymore.
 */
function findFirstElementOutsideBlocks(src) {
  const masked = buildMask(src);

  // Find first <Tag ...> where Tag starts with a letter.
  // Skip Svelte special blocks like {#if}, {#each} — they use { not <.
  // Also skip <svelte:*> elements: head, window, body, document, options, element,
  // component, self, fragment, boundary — these cannot have arbitrary attributes.
  // Find candidate tag starts. We can't rely on a simple regex to find the
  // tag end because Svelte attribute values can contain { ... } expressions
  // with arrow functions (=>), comparisons (>), nested objects, etc. We use
  // a regex only to locate '<Tag', then walk the open tag respecting
  // braces and quotes to find the true end.
  const startRE = /<([A-Za-z][A-Za-z0-9_.:-]*)\b/g;
  let startHit;
  while ((startHit = startRE.exec(masked))) {
    const tagName = startHit[1];
    if (tagName.startsWith('svelte:')) continue;
    const end = findOpenTagEnd(masked, startHit.index);
    if (!end) continue;
    // openTagEnd = position where attributes should be inserted — before the
    // terminating '>' (or before the '/' of a self-closing '/>').
    const openTagEnd = end.selfClosing ? end.end - 1 : end.end;
    return { index: startHit.index, openTagEnd };
  }
  return { index: -1 };
}

/**
 * Walk an open tag from its '<' character, respecting {...} expressions and
 * quoted strings, until finding the terminating '>' or '/>'.
 * Returns { end, selfClosing } where `end` is the position of '>'.
 */
function findOpenTagEnd(src, tagStart) {
  let i = tagStart + 1;
  // Skip tag name
  while (i < src.length && /[A-Za-z0-9_.:-]/.test(src[i])) i++;
  let braceDepth = 0;
  let inQuote = null;
  while (i < src.length) {
    const c = src[i];
    if (inQuote) {
      if (c === '\\' && i + 1 < src.length) { i += 2; continue; }
      if (c === inQuote) inQuote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      if (braceDepth === 0 || c !== '`') {
        inQuote = c;
        i++;
        continue;
      }
    }
    if (c === '{') { braceDepth++; i++; continue; }
    if (c === '}') { braceDepth--; i++; continue; }
    if (braceDepth === 0) {
      if (c === '/' && src[i + 1] === '>') return { end: i + 1, selfClosing: true };
      if (c === '>') return { end: i, selfClosing: false };
    }
    i++;
  }
  return null;
}
