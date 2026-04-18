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

      // Resolve a project-relative path for the data attribute
      let relFile = filename;
      try {
        relFile = path.relative(cwd, filename).replace(/\\/g, '/');
      } catch {}

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
  // Mask out <script>...</script>, <style>...</style>, and HTML comments so we don't
  // pick an element inside them.
  const mask = src.split('');
  const blockRE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
  let m;
  while ((m = blockRE.exec(src))) {
    for (let i = m.index; i < m.index + m[0].length; i++) mask[i] = ' ';
  }
  const commentRE = /<!--[\s\S]*?-->/g;
  while ((m = commentRE.exec(src))) {
    for (let i = m.index; i < m.index + m[0].length; i++) mask[i] = ' ';
  }
  const masked = mask.join('');

  // Find first <Tag ...> where Tag starts with a letter.
  // Skip Svelte special blocks like {#if}, {#each} — they use { not <.
  const tagRE = /<([A-Za-z][A-Za-z0-9_.:-]*)\b[^>]*?(\/?)>/g;
  const hit = tagRE.exec(masked);
  if (!hit) return { index: -1 };

  // Compute openTagEnd = position of '>' at end of the open tag
  const openTagEnd = hit.index + hit[0].lastIndexOf('>');
  return { index: hit.index, openTagEnd };
}
