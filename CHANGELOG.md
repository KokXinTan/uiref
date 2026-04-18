# Changelog

All notable changes to uiref will be documented here.

## [Unreleased]

### Added
- `uiref-flow/v1` format for workflows (ordered collections of uirefs)
- Chrome extension workflow mode: pick multiple elements and chain them into a single flow
- Cross-page workflow persistence via `chrome.storage.local` — pause on login page, navigate, resume on dashboard
- Popup UI: dedicated "Pick one element" and "Pick multiple (workflow)" buttons (no longer keyboard-only)
- In-picker toolbar with clickable "Send", "Pause", "Cancel" buttons
- Persistent "Resume workflow" badge across page loads
- `@uiref/setup` CLI — one-command installer that auto-detects framework, installs plugin, patches config, copies skill
- `docs/npm-publishing.md` — step-by-step guide for first-time npm publishing
- `docs/chrome-web-store.md` — submission checklist
- `PRIVACY.md` — explicit privacy statement
- `CONTRIBUTING.md` — contribution guidelines

### Fixed
- Svelte preprocessor skips `node_modules/` (was breaking third-party libraries like bits-ui)
- Svelte preprocessor handles `{(v) => fn(v)}` style attribute expressions (was matching `>` inside arrow functions)
- Svelte preprocessor masks `<svelte:head>` block contents so children don't get tagged
- Svelte preprocessor correctly handles self-closing tags (`<Tag ... />`) — was producing `<Tag / data-...>`
- Default inbox path changed from `~/.claude/uiref-inbox/` (hidden on macOS) to `~/uiref-inbox/` (visible)
- Extension auto-prunes inbox files older than 1 hour to prevent unbounded growth

## [0.1.0] — 2026-04-18

### Added
- Initial release
- `uiref/v1` JSON format specification
- Chrome extension (Manifest V3) with hover picker, screenshot capture, and 4-tier source resolution (data attributes → React Fiber → Vue → Svelte → Angular)
- `@uiref/svelte` Svelte preprocessor (Svelte 4/5 compatible)
- `@uiref/babel-plugin-react` Babel plugin for React
- `@uiref/vue` Vite plugin for Vue 3
- `@uiref/angular` Vite plugin for Angular 17+
- Claude Skill for auto-consuming uirefs from the inbox
- File System Access API integration for writing uirefs to a user-chosen folder
- Keyboard shortcut (⌘⇧C / Ctrl+Shift+C)
