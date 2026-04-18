# CLAUDE.md

Context for Claude Code sessions working in this repo. Auto-loaded.

## What this project is

**uiref** — a Chrome extension + build plugins that let users click any UI element in their running web app and send a structured reference (source file, line, component, screenshot, events, props) to Claude Code. Solves "which button does the user mean?" ambiguity for dense dashboards and unfamiliar codebases.

## Repo layout

```
extension/        Chrome extension (MV3, vanilla JS). No build step.
plugins/
  svelte/        @uiref/svelte — Svelte preprocessor (Svelte 4/5)
  react/         @uiref/babel-plugin-react — Babel plugin
  vue/           @uiref/vue — Vite plugin
  angular/       @uiref/angular — Vite plugin
cli/             @uiref/setup — npx installer (auto-detects framework)
skill/           Claude Skill (copied to ~/.claude/skills/uiref/ on install)
annotator/       (legacy) image annotation tool — kept as "screenshot mode"
.github/workflows/ CI (syntax check, plugin smoke test)
SPEC.md          uiref/v1 + uiref-flow/v1 JSON format specs
RELEASING.md     Release process (read before cutting a release)
CHANGELOG.md     Keep-a-Changelog format
```

## Versioning strategy

Independent versioning per component — they ship at different cadences.

| Component | Version source | Bump when |
|---|---|---|
| **Extension** | `extension/manifest.json` | Extension-side behavior changes (picker, buffering, popup, tray badge) |
| **@uiref/svelte** | `plugins/svelte/package.json` | Svelte preprocessor changes |
| **@uiref/babel-plugin-react** | `plugins/react/package.json` | React plugin changes |
| **@uiref/vue** | `plugins/vue/package.json` | Vue plugin changes |
| **@uiref/angular** | `plugins/angular/package.json` | Angular plugin changes |
| **@uiref/setup** | `cli/package.json` | CLI behavior or framework-detection changes |
| **GitHub release tag** | git tag `vX.Y.Z` | Aggregate "current state" marker, cut when the extension materially changes (usually coincides with an extension version bump) |

**Example:** if you fix a bug in the Svelte preprocessor, bump `@uiref/svelte` to 0.1.1 and republish. DO NOT bump the extension or other plugins. Do not cut a GitHub release unless the extension also changed.

**Don't sync versions across components.** They're independent packages on npm. The GitHub tag is a convenience marker; it doesn't need to equal any npm package's version.

## Release process

See [RELEASING.md](./RELEASING.md) for full steps. Short version:

1. Bump the relevant component's version in its `package.json` or `manifest.json`
2. Update `CHANGELOG.md` (move "Unreleased" entries to a new dated section)
3. Commit + push
4. For npm: `cd plugins/<framework> && npm publish --access public`
5. For extension: if behavior changed, bump `extension/manifest.json`, build the zip, `gh release create vX.Y.Z`

## Common tasks — how to do them

### Bump and publish a single npm plugin

```bash
cd plugins/svelte
# edit package.json, bump version
npm publish --access public
```

### Cut a GitHub release (extension behavior changed)

```bash
# 1. Bump extension/manifest.json version
# 2. Commit
# 3. Build the zip
cd extension && zip -r /tmp/uiref-extension-vX.Y.Z.zip . -x "*.DS_Store"
# 4. Tag
git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z
# 5. Create release
gh release create vX.Y.Z /tmp/uiref-extension-vX.Y.Z.zip --title "vX.Y.Z" --notes "..."
```

### Reinstall the skill locally after changing it

```bash
cp /Users/kxt/work/uiref/skill/SKILL.md ~/.claude/skills/uiref/SKILL.md
```

Or use the CLI (which also handles the plugin + config patching):

```bash
cd some-test-project && node /Users/kxt/work/uiref/cli/setup.mjs
```

## Design invariants — don't violate these

- **The extension never makes network requests.** No `fetch()`, no analytics, no remote calls. All capture stays local. PRIVACY.md commits to this publicly.
- **Build plugins never process `node_modules/`.** Third-party components have their own source. Tagging them breaks compilation (e.g., bits-ui reading its own DOM).
- **Event capture is off by default (lazy).** `window.__uirefConfig.eagerPatch` is the documented opt-in. This is a Chrome Web Store review posture — don't silently turn it on.
- **GraphQL `operationName` extraction is opt-in** via `window.__uirefConfig.captureGraphQLOperation`. Same reasoning: we ONLY read body when user asks.
- **data-uiref-* attributes** are the resolved-source mechanism. Build plugins inject them at compile time; extension reads them at click time. Don't bypass this and start parsing framework internals for source — that path is a maintenance treadmill (React 19 already broke `_debugSource`).
- **In-page UI is minimal.** Hover highlight + floating label + brief toast. Everything else (status, controls) goes to the tray badge and extension popup. The page stays clean.
- **Svelte preprocessor tags every HTML element (lowercase only)** — not just the first, not component instances. This was a bug fix; don't revert it.

## Where to look for things

- Real usage feedback / friction points — search commit messages for "real-codebase fixes" or "feedback"
- Format decisions — [SPEC.md](./SPEC.md)
- Why a given config exists — [docs/chrome-web-store.md](./docs/chrome-web-store.md) and [PRIVACY.md](./PRIVACY.md)
- How to get users — README "Who is this for?" section is the positioning doc

## If the user asks you to add a feature

Before implementing, check:
1. Does it violate an invariant above?
2. Is it a general feature or framework-specific?
3. Does it need both extension AND plugin changes, or just one?
4. Does it affect the spec? If yes, update SPEC.md and bump the relevant schema version (`uiref/v1` → `uiref/v2` is a breaking change; add fields as optional instead)

## If the user asks you to cut a release

Follow RELEASING.md verbatim. Don't skip the CHANGELOG update — it's the only user-facing release note.

## Debugging checklist (if uiref isn't working in a test project)

1. Is the build plugin in the preprocess array / Vite plugins list?
2. Does the DOM actually have `data-uiref-*` attributes? (Inspect element in Chrome)
3. Is the extension loaded and reloaded (`chrome://extensions`)?
4. Has the test page been refreshed after extension load?
5. Has the user picked the inbox folder on first use?
6. Is `~/.claude/skills/uiref/SKILL.md` installed?
