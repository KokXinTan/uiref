/**
 * @uiref/babel-plugin-react — injects data-uiref-* attributes onto JSX elements.
 *
 * Usage (babel.config.js):
 *   module.exports = {
 *     plugins: [['@uiref/babel-plugin-react', { enabled: process.env.NODE_ENV !== 'production' }]],
 *   };
 *
 * Or via Vite (vite.config.js):
 *   import react from '@vitejs/plugin-react';
 *   export default {
 *     plugins: [react({ babel: { plugins: ['@uiref/babel-plugin-react'] } })],
 *   };
 *
 * Options:
 *   - enabled: boolean   (default: true — use your build pipeline's NODE_ENV to gate)
 *   - cwd: string        (default: process.cwd())
 */

const path = require('node:path');

module.exports = function uirefReactBabelPlugin(babel, options = {}) {
  const { types: t } = babel;
  const enabled = options.enabled !== false;
  const cwd = options.cwd || process.cwd();

  function relPath(absPath) {
    if (!absPath) return null;
    try {
      return path.relative(cwd, absPath).replace(/\\/g, '/');
    } catch {
      return absPath;
    }
  }

  // Walk up the AST to find the nearest enclosing component function/class name
  function findEnclosingComponent(path) {
    let p = path;
    while (p) {
      if (p.isFunctionDeclaration() && p.node.id) {
        return p.node.id.name;
      }
      if (p.isClassDeclaration() && p.node.id) {
        return p.node.id.name;
      }
      if (p.isVariableDeclarator() && t.isIdentifier(p.node.id)) {
        // const MyComponent = () => ...  or  const MyComponent = function() { ... }
        const init = p.node.init;
        if (init && (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init))) {
          return p.node.id.name;
        }
      }
      if (p.isFunctionExpression() || p.isArrowFunctionExpression() || p.isClassExpression()) {
        // Look up — the parent might be a VariableDeclarator, AssignmentExpression, or Property
        const parent = p.parent;
        if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) return parent.id.name;
        if (t.isAssignmentExpression(parent) && t.isIdentifier(parent.left)) return parent.left.name;
        if (t.isObjectProperty(parent) && t.isIdentifier(parent.key)) return parent.key.name;
      }
      p = p.parentPath;
    }
    return null;
  }

  function hasAttr(openingEl, name) {
    return openingEl.attributes.some((attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name }));
  }

  // Only inject onto DOM elements (lowercase tag) and React components with upper-case names.
  // Skip Fragments.
  function isInjectable(openingEl) {
    const nameNode = openingEl.name;
    if (t.isJSXMemberExpression(nameNode)) return true; // e.g., <Foo.Bar>
    if (t.isJSXIdentifier(nameNode)) {
      return nameNode.name !== 'Fragment';
    }
    return false;
  }

  return {
    name: 'uiref-react',
    visitor: {
      JSXOpeningElement(p, state) {
        if (!enabled) return;
        const node = p.node;
        if (!isInjectable(node)) return;
        if (hasAttr(node, 'data-uiref-file')) return; // already injected

        const loc = node.loc;
        if (!loc) return;

        const filename = state.file?.opts?.filename || state.filename || null;
        const file = relPath(filename);
        const line = loc.start.line;
        const component = findEnclosingComponent(p) || null;

        if (!file) return; // can't inject without source info

        const attrs = [
          t.jsxAttribute(t.jsxIdentifier('data-uiref-file'), t.stringLiteral(file)),
          t.jsxAttribute(t.jsxIdentifier('data-uiref-line'), t.stringLiteral(String(line))),
        ];
        if (component) {
          attrs.push(
            t.jsxAttribute(t.jsxIdentifier('data-uiref-component'), t.stringLiteral(component)),
          );
        }
        node.attributes.push(...attrs);
      },
    },
  };
};
