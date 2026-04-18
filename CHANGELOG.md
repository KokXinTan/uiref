# Changelog

All notable changes to uiref will be documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

_Nothing yet. Add new entries here as you work; they roll into the next tagged release._

## [0.2.0] — 2026-04-18

Second working build. Major additions around workflows, richer capture context, and Chrome Web Store review hygiene.

### Added

**Workflow mode (`uiref-flow/v1`)**
- Pick multiple elements and chain them into a single flow JSON
- Cross-page persistence via `chrome.storage.local` — pause on login page, navigate, resume on dashboard
- Through-click: in workflow mode, clicks capture AND propagate so you can type, submit, navigate normally
- Explicit "Hide picker" / Resume flow — purple tray badge + popup controls
- Undo last step (`⌘Z` / `Ctrl+Z`, or the "Remove last step" button in the popup)
- Auto-inferred `action` type per step (click / type / navigate / focus / toggle / ref)

**Richer capture context**
- Ancestor chain — when clicking inside generic wrappers (e.g. `EchartsWrapper`), the parent component that uses it is captured too
- `page` — URL, pathname, title at capture time
- `page.url_after` — for click/navigate actions, always populated so consumers can diff
- `viewport` — width, height, DPR, dark/light theme
- `element.computed_styles` — curated set of resolved CSS values
- `element.input_state` — form fields get value/placeholder/name/label/type; passwords auto-redacted
- Text fallback chain: `textContent` → `aria-label` → `title` → `alt` → inner `<img alt>` → `<svg><title>` → `<use href>` for icon-only buttons
- `props_at_render` — component props at click time (React/Vue/Angular; null for Svelte)
- `store_snapshot` — opt-in via `window.__uirefStore`, works for any state library
- `events` — last 30s of console logs / uncaught errors / network requests / SPA navigations, scoped by a privacy-first lazy-capture default

**UX**
- Tray badge shows state (picking / workflow / paused) with step count
- All controls moved to the extension popup — page stays clean
- Crosshair cursor only in single mode; workflow keeps native cursors so you can still interact
- Flow-level `user_intent` inline input in the popup before Send

**Build plugins**
- Svelte preprocessor now tags EVERY HTML element (not just the first) so inline `<a>`, `<button>`, `<input>` resolve to their exact source line
- GraphQL `operationName` extraction from POST bodies (opt-in via `window.__uirefConfig.captureGraphQLOperation`)

**Tooling**
- `@uiref/setup` CLI: `npx @uiref/setup` detects framework, installs plugin, patches config, copies skill, creates inbox
- Lazy event capture by default (better Chrome Web Store review posture; opt into eager via `window.__uirefConfig.eagerPatch`)
- Per-patch opt-out config (`patchConsole`, `patchNetwork`, etc.)
- Dynamic config reads so late-set `window.__uirefConfig` still works

**Docs**
- `PRIVACY.md` — explicit data-handling statement
- `CONTRIBUTING.md` — plugin development guide
- `docs/npm-publishing.md` — first-time npm publishing walkthrough
- `docs/chrome-web-store.md` — submission checklist with permission justifications
- "Recommended: enable richest capture on local dev" section per framework

### Fixed

- Picker wasn't working at all — root had `pointer-events: auto` in single mode causing clicks to target the overlay (always returned early via the `root.contains()` guard). Root is now always `pointer-events: none`, clicks intercepted via document-level capture listener.
- Scroll wheel was swallowed on pages with active picker (same root cause).
- Svelte preprocessor skipped `node_modules/` (was breaking `bits-ui` etc.).
- Svelte preprocessor handled arrow-function attribute expressions (`{(v) => fn(v)}` matched `>` inside `=>`).
- Svelte preprocessor masked `<svelte:head>` contents (children were being tagged incorrectly).
- Svelte preprocessor self-closing tags (`<Tag />`) no longer produce `<Tag / data-...>`.
- Default inbox path changed from `~/.claude/uiref-inbox/` (hidden on macOS Finder) to `~/uiref-inbox/` (visible).
- Extension auto-prunes inbox files older than 1 hour to prevent unbounded growth.
- Skill correctly detects `.uiref-flow.json` files (previous glob only matched `.uiref.json`).
- `url_after` always emitted for click/navigate actions (was conditional on URL change, causing inconsistent semantics).
- Console patch calls original first, emits in microtask so the "real" stack trace is clean.

### Changed

- Repository renamed `anchorfile` → `uiref`. The static image annotation tool lives on as the "screenshot mode" secondary capture path.
- `uiref/v1` spec is the authoritative format (see `SPEC.md`).
- In-page hint bar and paused badge fully removed — state shown on extension tray badge, controls in the popup.

## [0.1.0] — 2026-04-18

Initial release.

### Added
- `uiref/v1` JSON format specification
- Chrome extension (Manifest V3) with hover picker, screenshot capture, and 4-tier source resolution (data attributes → React Fiber → Vue → Svelte → Angular)
- `@uiref/svelte` Svelte preprocessor (Svelte 4/5 compatible)
- `@uiref/babel-plugin-react` Babel plugin for React
- `@uiref/vue` Vite plugin for Vue 3
- `@uiref/angular` Vite plugin for Angular 17+
- Claude Skill for auto-consuming uirefs from the inbox
- File System Access API integration for writing uirefs to a user-chosen folder
- Keyboard shortcut (⌘⇧C / Ctrl+Shift+C)
