# Contributing to uiref

uiref is small enough that most contributions are either (1) bug reports from real codebases or (2) new framework plugins. Both are welcome.

## Reporting bugs

File a GitHub issue. Include:

- Your framework + version (`svelte@5.0.0`, `react@18.3.0`, etc.)
- Your bundler (Vite, Webpack, Next.js, Turbopack, etc.)
- Your build plugin version (`@uiref/svelte@0.1.1`, etc.)
- A minimal repro (a component or config that reproduces the issue)
- What you expected vs what happened

## Adding a new framework plugin

The architecture is simple: each framework plugin's job is to inject three attributes (`data-uiref-file`, `data-uiref-line`, `data-uiref-component`) onto DOM elements at compile time. The Chrome extension reads those attributes at runtime — it doesn't know or care about your framework.

To add a plugin for a new framework (Solid, Qwik, Lit, Stencil, etc.), create a folder under `plugins/your-framework/` with:

- `package.json` — name `@uiref/your-framework`, version `0.1.0`, license MIT
- `index.js` — the actual plugin (runs during compilation)
- `index.d.ts` — TypeScript types
- `README.md` — how to install and configure

### What your plugin must do

Given a component file (e.g., a `.jsx` / `.vue` / `.svelte` / `.tsx` file), transform it so that the first DOM element has these attributes when rendered:

```
data-uiref-file="src/components/MyComponent.tsx"
data-uiref-line="12"
data-uiref-component="MyComponent"
```

Exact mechanism depends on your framework:

- **Compiler transforms** (Svelte, Vue SFC) — add to the template / markup AST
- **Bundler transforms** (Vite, Webpack plugins) — transform the source text before it reaches the framework compiler
- **Babel plugins** (React, older JSX-based frameworks) — add attributes to JSX AST nodes

### What your plugin must NOT do

- **Process `node_modules/`.** Third-party components aren't in the user's source tree; tagging them is pointless and can break compilation. Skip any file path containing `/node_modules/`.
- **Run in production by default.** Gate behind `NODE_ENV !== 'production'` or a user-provided `enabled` option. Production builds should ship clean HTML unless the user opts in.
- **Break the framework's own semantics.** Tag only valid targets. For example, Svelte's `<svelte:head>` elements can't have arbitrary attributes — skip them.
- **Add dependencies beyond the framework's own compiler.** Keep plugins tiny.

### Testing

Each plugin should have a smoke test that runs it on a synthetic input and checks the output. See `plugins/svelte/` for an example of the structure (tests not yet formalized — pull in whatever test runner you prefer; `node --test` works great for small plugins).

### Before you submit

- Run your plugin on at least one real codebase in the framework you're targeting
- Verify the resulting `data-uiref-*` attributes show up in the rendered DOM (use Chrome DevTools)
- Verify the uiref Chrome extension picks up your data attributes (use the picker on a test page)
- Update `cli/setup.mjs` to auto-install and patch config for your framework
- Add a row to the README's install section

## Code style

- Vanilla JavaScript (no TypeScript in the extension, for auditability and no build step)
- Plugins can use whatever style is idiomatic for the framework
- Match existing formatting — 2-space indent, single quotes, semicolons in JS
- No big refactors without discussion

## License

All contributions are MIT licensed. By contributing you agree your contributions are under MIT.
