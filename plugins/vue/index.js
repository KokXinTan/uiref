/**
 * @uiref/vue — Vite plugin that injects data-uiref-* attributes into Vue 3 SFC templates.
 *
 * Usage (vite.config.js):
 *
 *   import vue from '@vitejs/plugin-vue';
 *   import uirefVue from '@uiref/vue';
 *   export default {
 *     plugins: [uirefVue(), vue()],   // IMPORTANT: uirefVue() before vue()
 *   };
 *
 * The plugin must run BEFORE @vitejs/plugin-vue so we transform the raw .vue source
 * before Vue's compiler parses it.
 *
 * Options:
 *   - enabled: boolean | (id: string) => boolean   (default: process.env.NODE_ENV !== 'production')
 *   - cwd: string                                    (default: process.cwd())
 */

import path from 'node:path';

function defaultEnabled() {
  return process.env.NODE_ENV !== 'production';
}

export default function uirefVuePlugin(options = {}) {
  const enabled = options.enabled ?? defaultEnabled;
  const cwd = options.cwd ?? process.cwd();

  return {
    name: 'uiref-vue',
    enforce: 'pre', // must run before @vitejs/plugin-vue
    transform(code, id) {
      if (!id.endsWith('.vue')) return null;
      const isEnabled = typeof enabled === 'function' ? enabled(id) : enabled;
      if (!isEnabled) return null;

      // Strip query suffix if present (Vite appends ?vue&type=template etc.)
      const cleanId = id.split('?')[0];
      const relFile = path.relative(cwd, cleanId).replace(/\\/g, '/');
      const componentName = path.basename(cleanId, '.vue');

      // Only touch the <template> block; leave <script>/<style> alone
      const templateMatch = code.match(/<template(\s[^>]*)?>([\s\S]*?)<\/template\s*>/);
      if (!templateMatch) return null;

      const templateContent = templateMatch[2];
      const templateStartIdx = templateMatch.index + templateMatch[0].indexOf(templateMatch[2]);

      // Find the first real element in the template
      const elMatch = templateContent.match(/<([A-Za-z][A-Za-z0-9_.-]*)\b([^>]*?)(\/?)>/);
      if (!elMatch) return null;

      const elStartInTemplate = elMatch.index;
      const openTagFull = elMatch[0];
      const isSelfClosing = elMatch[3] === '/';

      // Compute line number in the source file
      const elAbsIdx = templateStartIdx + elStartInTemplate;
      const line = code.slice(0, elAbsIdx).split('\n').length;

      // Insert data-uiref-* attributes just before the closing '>' or '/>'
      const insertion =
        ` data-uiref-file="${escapeAttr(relFile)}"` +
        ` data-uiref-line="${line}"` +
        ` data-uiref-component="${escapeAttr(componentName)}"`;

      const insertionPoint = isSelfClosing ? openTagFull.length - 2 : openTagFull.length - 1;
      const newOpenTag = openTagFull.slice(0, insertionPoint) + insertion + openTagFull.slice(insertionPoint);

      const newCode =
        code.slice(0, elAbsIdx) + newOpenTag + code.slice(elAbsIdx + openTagFull.length);

      return { code: newCode, map: null };
    },
  };
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
