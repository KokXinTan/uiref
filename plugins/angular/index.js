/**
 * @uiref/angular — Vite plugin for Angular 17+ that injects data-uiref-* attributes
 * into component templates at build time.
 *
 * Supports:
 *   - External templates (*.component.html)
 *   - Inline templates in @Component decorator (template: `...`)
 *
 * Requires Angular 17+ with the esbuild/Vite dev server (@angular-devkit/build-angular).
 *
 * Usage (angular.json or vite.config.ts):
 *
 *   import uirefAngular from '@uiref/angular';
 *   export default {
 *     plugins: [uirefAngular()],
 *   };
 *
 * Note: Angular's AOT compiler may strip unknown attributes by default. Ensure
 * `data-*` attributes are allowed (they are, by default).
 */

import path from 'node:path';

function defaultEnabled() {
  return process.env.NODE_ENV !== 'production';
}

export default function uirefAngularPlugin(options = {}) {
  const enabled = options.enabled ?? defaultEnabled;
  const cwd = options.cwd ?? process.cwd();

  return {
    name: 'uiref-angular',
    enforce: 'pre',
    transform(code, id) {
      const isEnabled = typeof enabled === 'function' ? enabled(id) : enabled;
      if (!isEnabled) return null;

      const cleanId = id.split('?')[0];
      const relFile = path.relative(cwd, cleanId).replace(/\\/g, '/');

      // Case 1: external Angular template file (*.component.html)
      if (cleanId.endsWith('.component.html') || cleanId.endsWith('.html')) {
        const componentName = componentNameFromHtml(cleanId);
        const newCode = injectFirstElement(code, relFile, componentName, 1);
        if (newCode === code) return null;
        return { code: newCode, map: null };
      }

      // Case 2: Angular TypeScript component with inline template
      if (cleanId.endsWith('.component.ts') || cleanId.endsWith('.ts')) {
        return transformInlineTemplate(code, relFile);
      }

      return null;
    },
  };
}

function componentNameFromHtml(htmlPath) {
  // foo-bar.component.html -> FooBarComponent
  const base = path.basename(htmlPath, '.html').replace(/\.component$/, '');
  return base
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('') + 'Component';
}

function injectFirstElement(template, file, component, startLine) {
  const match = template.match(/<([A-Za-z][A-Za-z0-9_.-]*)\b([^>]*?)(\/?)>/);
  if (!match) return template;

  const openTagFull = match[0];
  const offset = match.index;
  const isSelfClosing = match[3] === '/';

  const line = startLine + template.slice(0, offset).split('\n').length - 1;

  const insertion =
    ` data-uiref-file="${escapeAttr(file)}"` +
    ` data-uiref-line="${line}"` +
    ` data-uiref-component="${escapeAttr(component)}"`;

  const insertionPoint = isSelfClosing ? openTagFull.length - 2 : openTagFull.length - 1;
  const newOpenTag = openTagFull.slice(0, insertionPoint) + insertion + openTagFull.slice(insertionPoint);

  return template.slice(0, offset) + newOpenTag + template.slice(offset + openTagFull.length);
}

function transformInlineTemplate(code, relFile) {
  // Find @Component({ ... template: `...` ... }) blocks
  const componentRE = /@Component\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
  let changed = false;
  let out = '';
  let lastIndex = 0;
  let m;

  while ((m = componentRE.exec(code))) {
    const blockStart = m.index;
    const blockInner = m[1];
    const blockInnerStart = blockStart + m[0].indexOf(m[1]);

    // Find component class name: the class that follows this decorator
    const afterBlock = code.slice(blockStart + m[0].length);
    const classMatch = afterBlock.match(/\bexport\s+class\s+(\w+)/) || afterBlock.match(/\bclass\s+(\w+)/);
    const componentName = classMatch ? classMatch[1] : 'AngularComponent';

    // Find `template: \`...\`` within the block
    const templateRE = /template\s*:\s*`([\s\S]*?)`/;
    const tMatch = blockInner.match(templateRE);
    if (!tMatch) {
      out += code.slice(lastIndex, blockStart + m[0].length);
      lastIndex = blockStart + m[0].length;
      continue;
    }

    const templateContentStart = blockInnerStart + tMatch.index + tMatch[0].indexOf('`') + 1;
    const templateContent = tMatch[1];
    const startLineInFile = code.slice(0, templateContentStart).split('\n').length;

    const newTemplate = injectFirstElement(templateContent, relFile, componentName, startLineInFile);
    if (newTemplate !== templateContent) {
      out += code.slice(lastIndex, templateContentStart);
      out += newTemplate;
      lastIndex = templateContentStart + templateContent.length;
      changed = true;
    } else {
      out += code.slice(lastIndex, blockStart + m[0].length);
      lastIndex = blockStart + m[0].length;
    }
  }

  if (!changed) return null;
  out += code.slice(lastIndex);
  return { code: out, map: null };
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
