# uiref

> Point at any UI element in your running web app. Send a structured reference (source file, line, component, screenshot) to Claude. Stop saying "this button" — show Claude exactly which one.

**Status:** alpha. Extension + Svelte / React / Vue / Angular build plugins + Claude Skill all functional.

## The problem

When you tell an AI coding assistant "fix this button" or "change that header," it has to guess which component you mean. Across a real codebase with dozens of similar elements, that guess is often wrong. You spend your turn explaining location instead of intent.

Vision-based "send Claude a screenshot" doesn't fix this — even frontier vision models drift 5–30 pixels on coordinate regression, and a screenshot tells Claude what the element looks like, not which source file rendered it.

## The fix

1. Install the **uiref Chrome extension**.
2. Add the **build plugin** for your framework (Svelte, React, Vue, or Angular — 2 minutes of config).
3. Install the **Claude Skill** so Claude auto-checks your uiref inbox.
4. Press **⌘⇧C** (⌃⇧C on Win/Linux), click the element, done.

The extension writes a JSON file containing the exact source file, line, and component name to `~/.claude/uiref-inbox/`. Next time you ask Claude "fix this," it reads the most recent file and knows exactly what you meant.

```
you:    *clicks Save button in browser*
        *switches to Claude Code*
        "make this use the danger variant"

claude: I see you pointed at <SaveButton> at src/components/SaveButton.tsx:42.
        Applying the danger variant…
        [edit file]
```

No more ambiguity, no more wasted turns.

## Quick start

**1. Install the Chrome extension** (development mode for now — Web Store submission pending):

```bash
git clone https://github.com/KokXinTan/uiref.git
cd uiref/extension
# Open chrome://extensions → Developer mode → Load unpacked → select this folder
```

**2. Install the build plugin for your framework:**

Svelte 4 / 5:
```bash
npm install --save-dev @uiref/svelte
```
```js
// svelte.config.js
import uiref from '@uiref/svelte';
export default { preprocess: [uiref()] };
```

React (Vite):
```bash
npm install --save-dev @uiref/babel-plugin-react
```
```js
// vite.config.js
import react from '@vitejs/plugin-react';
export default {
  plugins: [react({ babel: { plugins: ['@uiref/babel-plugin-react'] } })],
};
```

Vue 3 (Vite):
```bash
npm install --save-dev @uiref/vue
```
```js
// vite.config.js
import vue from '@vitejs/plugin-vue';
import uirefVue from '@uiref/vue';
export default { plugins: [uirefVue(), vue()] };
```

Angular 17+:
```bash
npm install --save-dev @uiref/angular
```
(See `plugins/angular/README.md` for integration.)

**3. Install the Claude Skill:**

```bash
cp -r skill/ ~/.claude/skills/uiref/
```

**4. First run:**

- Visit any page served by your dev server with the build plugin active.
- Press ⌘⇧C (Mac) or Ctrl+Shift+C (Win/Linux).
- Click any element.
- Extension prompts once: "pick an inbox folder" — choose `~/.claude/uiref-inbox/` (create it if needed).
- You'll see `<SaveButton> → Claude` toast.
- Switch to Claude Code, say "change this to the danger variant."
- Claude reads the inbox, acknowledges the target, edits the right file.

## How it works

```
┌─────────────────────────────────────┐
│  Your app (React / Vue / Svelte /   │
│  Angular), built with the build     │
│  plugin → DOM has data-uiref-*      │
│  attributes                          │
└────────────────┬────────────────────┘
                 │  click element
                 ▼
┌─────────────────────────────────────┐
│  uiref Chrome extension             │
│    • hover highlight + source label │
│    • click captures element         │
│    • reads data-uiref-* attrs       │
│    • screenshots the element        │
│    • writes uiref/v1 JSON           │
└────────────────┬────────────────────┘
                 │  ~/.claude/uiref-inbox/
                 │  2026-04-16T14-22-00.uiref.json
                 ▼
┌─────────────────────────────────────┐
│  Claude Code + uiref skill          │
│    • detects UI-reference language  │
│    • reads latest uiref             │
│    • edits target.file:line         │
└─────────────────────────────────────┘
```

The `data-uiref-*` attribute mechanism is resilient: it's injected at build time by the plugin, works in both dev and production, and is immune to framework internal changes (React 19's `_debugSource` removal, Svelte 5's compiler rewrite, etc.).

## Format

A uiref is a small JSON file:

```json
{
  "format": "uiref/v1",
  "captured_at": "2026-04-16T14:22:00Z",
  "target": {
    "file": "src/lib/SaveButton.svelte",
    "line": 12,
    "component": "SaveButton"
  },
  "element": {
    "tag": "button",
    "text": "Save Changes",
    "attributes": { "class": "btn btn-primary" },
    "dom_path": "body > main > form > button.btn-primary"
  },
  "screenshot": "data:image/png;base64,…",
  "user_intent": null
}
```

Full spec: [SPEC.md](./SPEC.md).

## Repo layout

```
uiref/
├── SPEC.md                  # uiref/v1 format specification
├── extension/               # Chrome extension (MV3, vanilla JS)
├── plugins/
│   ├── svelte/              # @uiref/svelte — preprocessor
│   ├── react/               # @uiref/babel-plugin-react
│   ├── vue/                 # @uiref/vue — Vite plugin
│   └── angular/             # @uiref/angular — Vite plugin
├── skill/                   # Claude Skill
├── annotator/               # (legacy) image annotation tool — separate mode
└── docs/
```

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| ⌘⇧C / Ctrl+Shift+C | Activate picker |
| Click | Capture hovered element |
| Escape | Cancel picker |
| ↑ | Select parent element |
| ↓ | Select first child element |

## Known limitations (v0.1)

- **Chrome only.** Firefox port planned.
- **Dev builds only by default.** Production use requires `enabled: true` on the build plugin. Still works, but you probably don't want data attributes in shipped HTML.
- **Angular plugin is minimal.** Covers external `.component.html` templates and simple inline templates. Complex inline template strings and `@defer` blocks may not be handled yet.
- **First element only.** Build plugins inject on the first element of each component's template. Nested components still resolve correctly because the extension walks up the DOM tree.

## Why not [...other tool]?

- **React DevTools:** inspects components but doesn't output structured data to AI assistants. Also React-only.
- **click-to-component / LocatorJS:** open the file in your editor. Similar mechanism, different destination. uiref pipes to AI assistants, supports multiple frameworks, and produces a protocol other tools can adopt.
- **Claude for Chrome:** agentic browser automation, not component-to-source resolution. Complementary to uiref.
- **Claude Design:** generates prototypes. Different workflow (design → code), not running-app → source.

## License

MIT — see [LICENSE](./LICENSE).

## Contributing

Issues and feature requests welcome. The protocol is load-bearing — changes to `uiref/v1` are versioned carefully. Build plugins for other frameworks (Solid, Qwik, Lit, etc.) are welcome as community contributions.
