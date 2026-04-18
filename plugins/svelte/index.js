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

      // Never process third-party components — they have their own component model
      // and their source locations aren't useful for the user's codebase.
      if (filename.includes('/node_modules/') || filename.includes('\\node_modules\\')) {
        return { code: content };
      }

      // Resolve a project-relative path for the data attribute
      let relFile = filename;
      try {
        relFile = path.relative(cwd, filename).replace(/\\/g, '/');
      } catch {}
      // Defensive: if the relative path escapes the project (starts with ..), skip.
      if (relFile.startsWith('..')) return { code: content };

      // Component name: filename basename without extension. Title-case if lowercase.
      const base = path.basename(filename, path.extname(filename));
      const componentName = base;

      // Find the first meaningful top-level element in the markup. This is a minimal
      // string-based approach to avoid a full AST dependency. It covers 95% of cases:
      // the first <tag ...> in the file that isn't inside a <script> or <style> block.
      const { index, openTagEnd } = findFirstElementOutsideBlocks(content);
      if (index === -1) return { code: content };

      // Compute 1-indexed line number of that element
      const line = content.slice(0, index).split('\n').length;

      // Inject data-uiref-* attributes just before the '>' (or '/>') of the open tag
      const insert =
        ` data-uiref-file="${escapeAttr(relFile)}"` +
        ` data-uiref-line="${line}"` +
        ` data-uiref-component="${escapeAttr(componentName)}"`;

      // openTagEnd points to the position of '>' or '/>'; insert before that character
      const before = content.slice(0, openTagEnd);
      const after = content.slice(openTagEnd);
      const code = before + insert + after;

      return { code };
    },
  };
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Find the first element outside of <script> and <style> blocks.
 * Returns { index, openTagEnd } where:
 *   index      = position of the '<' of the opening tag in the source
 *   openTagEnd = position of the '>' (or '/>') in the source
 * Returns { index: -1 } if no suitable element found.
 */
function findFirstElementOutsideBlocks(src) {
  // Mask out:
  //   - <script>...</script> and <style>...</style>
  //   - <!-- comments -->
  //   - <svelte:head>...</svelte:head> (and other svelte:* paired tags)
  //   - self-closing <svelte:options /> etc.
  // ...so we don't pick an element inside them.
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
  const masked = mask.join('');

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
