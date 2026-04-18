<div align="center">

# uiref

**Point at any UI element in your running web app. Send a precise, structured reference to Claude Code (or any AI coding assistant).**

Stop saying "fix this button" and hoping the AI guesses right. Click the element; the AI gets the exact source file, line, component name, and a screenshot.

[Install](#install) · [How it works](#how-it-works) · [Spec](./SPEC.md) · [Troubleshooting](#troubleshooting)

![status](https://img.shields.io/badge/status-alpha-orange) ![license](https://img.shields.io/badge/license-MIT-blue) ![framework](https://img.shields.io/badge/svelte%20%7C%20react%20%7C%20vue%20%7C%20angular-supported-green)

</div>

---

## The problem

When you tell an AI coding assistant "fix this button" or "change that header," it has to guess which component you mean. In a real codebase with dozens of similar elements, the guess is often wrong — you spend your turn explaining location instead of intent.

Sending a screenshot doesn't fix this. Even frontier vision models drift 5–30 pixels on coordinate regression, and a screenshot shows the AI what the element *looks like*, not which source file *rendered* it.

**uiref turns ambiguous deictic pronouns ("this," "that") into structured references.**

## How it works

```
┌──────────────────────────────────────┐
│  Your app (React / Vue / Svelte /    │
│  Angular) with the uiref build       │
│  plugin installed. DOM elements get  │
│  data-uiref-file / -line / -component│
│  attributes at compile time.         │
└──────────────────┬───────────────────┘
                   │
         ⌘⇧C · click an element
                   │
                   ▼
┌──────────────────────────────────────┐
│  uiref Chrome extension              │
│    • hover-to-highlight picker       │
│    • reads data-uiref-* attrs        │
│    • screenshots the element         │
│    • writes uiref/v1 JSON to inbox   │
└──────────────────┬───────────────────┘
                   │
                   │  ~/uiref-inbox/<timestamp>.uiref.json
                   ▼
┌──────────────────────────────────────┐
│  Claude Code + uiref skill           │
│    • detects UI-reference language   │
│    • reads the latest uiref          │
│    • edits target.file:line directly │
└──────────────────────────────────────┘
```

The flow:

```
you:    [click SaveButton in browser]
        [switch to Claude Code]
        "make this use the danger variant"

claude: I see you pointed at <SaveButton> at
        src/components/SaveButton.tsx:42. Applying now.
        [edits the exact file]
```

## What you get

- **Precise targeting.** Source file, line number, component name — no guessing.
- **Framework-aware.** Works with Svelte 4/5, React, Vue 3, Angular 17+.
- **Production-safe.** Build plugins opt-in per environment; ship clean HTML to production if you want.
- **Local only.** Screenshots and DOM data never leave your machine. No accounts, no cloud, no telemetry.
- **Resilient to framework updates.** Data attributes are injected at build time, so the mechanism doesn't depend on React's `_debugSource` or Svelte's internal APIs (which break across versions).
- **Open protocol.** Every component of the system — build plugins, extension, skill — is independent. The [`uiref/v1` JSON format](./SPEC.md) is the contract; any tool can produce or consume it.

## Install

### 1. Install the Chrome extension

Until the extension is on the Chrome Web Store (see [Status](#status) below), install in developer mode:

```bash
git clone https://github.com/KokXinTan/uiref.git
```

Then in Chrome:
1. Open `chrome://extensions/`
2. Toggle **Developer mode** on (top-right)
3. Click **Load unpacked**
4. Select the `uiref/extension/` folder

### 2. Install the build plugin for your framework

Pick one (or more) that match your projects:

<details>
<summary><strong>Svelte 4 / Svelte 5 (SvelteKit)</strong></summary>

```bash
npm install --save-dev @uiref/svelte
```

```js
// svelte.config.js
import uiref from '@uiref/svelte';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: [uiref(), vitePreprocess()],
  // ...rest of your config
};
```

The preprocessor runs dev-only by default. Restart your dev server after adding it.
</details>

<details>
<summary><strong>React (any bundler with Babel)</strong></summary>

```bash
npm install --save-dev @uiref/babel-plugin-react
```

For Vite + React:

```js
// vite.config.js
import react from '@vitejs/plugin-react';

export default {
  plugins: [
    react({
      babel: {
        plugins: [
          ['@uiref/babel-plugin-react', { enabled: process.env.NODE_ENV !== 'production' }],
        ],
      },
    }),
  ],
};
```

For Next.js / Create React App: see [`plugins/react/README.md`](./plugins/react/README.md).
</details>

<details>
<summary><strong>Vue 3 (Vite)</strong></summary>

```bash
npm install --save-dev @uiref/vue
```

```js
// vite.config.js
import vue from '@vitejs/plugin-vue';
import uirefVue from '@uiref/vue';

export default {
  plugins: [
    uirefVue(),  // must come before vue()
    vue(),
  ],
};
```
</details>

<details>
<summary><strong>Angular 17+</strong></summary>

```bash
npm install --save-dev @uiref/angular
```

See [`plugins/angular/README.md`](./plugins/angular/README.md) for the Vite integration.
</details>

### 3. Install the Claude Skill

The skill teaches Claude Code to automatically check the uiref inbox when you reference a UI element.

```bash
git clone https://github.com/KokXinTan/uiref.git /tmp/uiref
mkdir -p ~/.claude/skills/uiref
cp /tmp/uiref/skill/SKILL.md ~/.claude/skills/uiref/SKILL.md
```

Restart Claude Code. Verify by asking Claude "what skills do you have?" — `uiref` should be in the list.

### 4. Set up your inbox folder

```bash
mkdir -p ~/uiref-inbox
```

On first capture, the extension will prompt you to pick this folder. Select `~/uiref-inbox`. The extension remembers the choice, so you only do this once.

### 5. (Recommended) Enable richest capture on local dev

By default, the extension only starts buffering events (console logs, errors, network) once you activate the picker on a tab. For your own projects, you probably want **eager buffering** (full pre-click history) and **GraphQL operation-name extraction** (so repeated calls to `/graphql` are distinguishable).

Add to your app's bootstrap:

```js
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__uirefConfig = {
    eagerPatch: true,                 // buffer events from page load
    captureGraphQLOperation: true,    // extract GraphQL operationName from POST bodies
  };
}
```

**Safe in production.** `import.meta.env.DEV` is a compile-time constant in Vite. `vite build` (any `--mode`) sets it to `false`, so Rollup's dead-code elimination strips the entire block from the production bundle. The shipped JS contains zero uiref code — no `__uirefConfig`, no config object, nothing. Verified by grepping the build output.

**SvelteKit users:** for cleanest placement, use `src/hooks.client.ts` (runs before any route). For other frameworks:

- **React (Vite)** — top of `src/main.tsx`, before `createRoot()`
- **Next.js** — top of `app/layout.tsx` (client component) or in a `<Script>` in `app.html`
- **Vue** — top of `src/main.ts`, before `app.mount()`
- **Angular** — top of `src/main.ts`, before `bootstrapApplication()`

**Why this works even though inject.js runs before your app:** the extension re-reads `window.__uirefConfig` dynamically on every event emission, not just at page load. So setting the config late (after your app has started) still enables capture for subsequent events.

See [full config options](./SPEC.md#how-event-capture-is-scoped) in the spec.

## Your first capture

1. Start your dev server — verify the app runs and reloads normally.
2. Open the page in Chrome.
3. Press `⌘⇧C` (Mac) or `Ctrl+Shift+C` (Windows/Linux).
4. Hover elements — each shows its component name and source location in a floating label.
5. Click any element. A toast appears bottom-right: `<SaveButton> → Claude`.
6. Switch to Claude Code and say:
   > "make this red" — or — "explain what this does" — or — "move this to the top"

Claude reads `~/uiref-inbox/` and knows the exact component. It acknowledges the reference and edits the right file on the first try.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘⇧C` / `Ctrl+Shift+C` | Activate picker |
| `Click` | Capture the hovered element |
| `Esc` | Cancel the picker |
| `↑` | Select the parent element |
| `↓` | Select the first child element |

## Troubleshooting

### The picker does nothing when I press `⌘⇧C` or click "Start picker"

Chrome only injects content scripts into tabs loaded **after** the extension was installed or reloaded. Refresh the tab (`⌘R`) and try again. If that still doesn't work, open DevTools on the target page and check the Console for errors.

### The directory picker can't find `~/.claude/uiref-inbox/`

The `.claude` folder is hidden in macOS Finder. Use `~/uiref-inbox/` (no dot) as the default location — that's what the skill looks in. If you really want the hidden folder, press `⌘⇧.` in the Finder dialog to show hidden files.

### `<svelte:head> cannot have attributes` compile error

You're on an older version of `@uiref/svelte` (pre-0.1.1). Update: `npm install -D @uiref/svelte@latest`.

### `Expected token >` / parse errors in my Svelte components

You're on an older version of `@uiref/svelte` that didn't handle `{(v) => v}` style attribute expressions. Update: `npm install -D @uiref/svelte@latest`.

### `pnpm install` fails or my dev server can't find `@uiref/svelte`

If you installed via `file:` link, re-run `pnpm install` any time the local plugin changes. For regular use, wait for the npm publish (see [Status](#status)).

### Claude doesn't detect my uiref after I capture

Checks:
1. Does the file appear in `~/uiref-inbox/`? (`ls ~/uiref-inbox`) If not, the extension didn't write — check that you picked the right folder in the extension's first-run dialog.
2. Does Claude Code have the uiref skill installed? Ask Claude: "what skills do you have?" — `uiref` should be listed.
3. Is your message UI-referential? The skill triggers on "this/that" pronouns and UI verbs. Explicit: "use the uiref I just sent."

### The inbox keeps growing

It shouldn't — the extension auto-deletes uiref files older than 1 hour on each new capture, and the skill deletes files after using them. If it's still growing, you probably have uirefs captured in the last hour that the skill hasn't consumed. They'll auto-clean on the next capture cycle.

## Repo layout

```
uiref/
├── SPEC.md                  # uiref/v1 JSON format specification
├── PRIVACY.md               # what data the tool handles and where
├── extension/               # Chrome extension (MV3, vanilla JS)
├── plugins/
│   ├── svelte/              # @uiref/svelte — Svelte preprocessor
│   ├── react/               # @uiref/babel-plugin-react
│   ├── vue/                 # @uiref/vue — Vite plugin
│   └── angular/             # @uiref/angular — Vite plugin
├── skill/                   # Claude Skill (copy to ~/.claude/skills/uiref/)
├── docs/
│   ├── design.md            # Architecture and rationale
│   └── chrome-web-store.md  # Submission checklist
└── CHANGELOG.md
```

## Status

- **Extension:** alpha. Works locally, Chrome Web Store submission in progress (see [docs/chrome-web-store.md](./docs/chrome-web-store.md)).
- **Svelte plugin:** dogfooded on a real SvelteKit app. Handles `<svelte:*>` elements, self-closing components, arrow-function attributes, and skips `node_modules/`.
- **React, Vue, Angular plugins:** v0.1. Tested with synthetic fixtures. Expect edge cases on real codebases — please file issues.
- **npm publish:** plugins currently installable via `file:` links or git. Publishing to npm after the Web Store submission.

## Alternatives considered

| Tool | What it does | Why uiref is different |
|---|---|---|
| [React DevTools](https://react.dev/learn/react-developer-tools) | Inspects React components in the browser | No structured output for AI; React-only |
| [LocatorJS](https://www.locatorjs.com/), [click-to-component](https://github.com/ericclemmons/click-to-component) | Click → open in editor | Different target: editor vs AI. uiref produces a protocol any AI can consume |
| [Claude for Chrome](https://www.anthropic.com/news/claude-for-chrome) | Agentic browser automation | Doesn't resolve DOM → source. Complementary to uiref |
| [Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs) | Design tool for generating prototypes | Different workflow (design → code handoff), not running-app → source |
| ML annotation tools (LabelImg, CVAT, etc.) | Label images for ML training | Wrong output format, wrong audience |

## Contributing

Issues and feature requests welcome. Priority contributions:

- **Firefox port** of the extension
- **Additional framework plugins** (Solid, Qwik, Lit, Stencil)
- **Webpack loader** for React projects not on Vite
- **Edge-case bug reports** from real codebases (with a minimal repro)

See [CONTRIBUTING.md](./CONTRIBUTING.md) for plugin development guidelines.

## License

[MIT](./LICENSE)
