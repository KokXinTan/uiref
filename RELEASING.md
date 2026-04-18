# Releasing uiref

Canonical release process for everyone — humans, contributors, and Claude Code agents. If you're confused about which version bumps what, or when to cut a GitHub release vs. just publish an npm package, this is the file to consult.

## Mental model

**uiref has many movable parts that version independently.** Versions are NOT synchronized across them.

| Component | Ships via | Users install via | Version source |
|---|---|---|---|
| Chrome extension | GitHub release zip (+ eventually Web Store) | "Load unpacked" or one-click from store | `extension/manifest.json` |
| `@uiref/svelte` | npm | `npm install --save-dev @uiref/svelte` | `plugins/svelte/package.json` |
| `@uiref/babel-plugin-react` | npm | `npm install --save-dev @uiref/babel-plugin-react` | `plugins/react/package.json` |
| `@uiref/vue` | npm | `npm install --save-dev @uiref/vue` | `plugins/vue/package.json` |
| `@uiref/angular` | npm | `npm install --save-dev @uiref/angular` | `plugins/angular/package.json` |
| `@uiref/setup` | npm | `npx @uiref/setup` | `cli/package.json` |
| Claude Skill | Bundled with `@uiref/setup`, copied to `~/.claude/skills/uiref/` | Via the CLI or manual copy | Not versioned explicitly — travels with the CLI |

**Rule of thumb:** bump the version of ONLY the thing that changed.

- Fixed a bug in the Svelte preprocessor? Bump `@uiref/svelte` only.
- Added a keyboard shortcut to the extension? Bump `extension/manifest.json`.
- Changed how the CLI patches `vite.config.js`? Bump `@uiref/setup`.
- Changed the uiref/v1 JSON format? **Don't** — add fields as optional, never break v1. If you really must break, bump `uiref/v2`.

## When to cut a GitHub release

Cut a GitHub release when:

- The **extension behavior has changed** and users should download a new zip
- You want to announce an aggregate milestone (a batch of plugin + extension + docs improvements worth highlighting)
- You're about to post on HN / Reddit / Twitter and want a clean "v0.X.0" link

Don't cut a GitHub release:

- Just because one plugin got a patch (that's an npm publish, not a release)
- For documentation-only changes
- For every commit — this isn't a Kubernetes-style automated release cadence

The GitHub tag `vX.Y.Z` uses the **extension version** as its source of truth, since the extension is the most user-visible artifact.

## Versioning semantics

Follow [SemVer](https://semver.org/). For alpha/pre-1.0:

- **MAJOR (x.0.0)** — breaking change to the `uiref/v1` JSON format (avoid until v1 has real users)
- **MINOR (0.x.0)** — new feature, new capture field, new option. Backwards-compatible.
- **PATCH (0.0.x)** — bug fix, doc change, internal refactor.

## Release processes by scenario

### Scenario A: You fixed a bug in ONE plugin (e.g., Svelte preprocessor)

1. Update the plugin's code and test it
2. Bump version in `plugins/svelte/package.json` (e.g., `0.1.0` → `0.1.1`)
3. Update `CHANGELOG.md` under a new section if the fix is notable
4. Commit + push
5. Publish:

   ```bash
   cd plugins/svelte
   npm publish --access public
   ```

No GitHub release needed. No extension rebuild. Other plugins and the extension stay on their current versions.

### Scenario B: You changed extension behavior

1. Update `extension/*.js` and/or `extension/*.html`
2. Bump `extension/manifest.json` version (e.g., `0.2.0` → `0.3.0`)
3. Update `CHANGELOG.md`
4. Commit + push
5. Build the zip:

   ```bash
   cd extension
   zip -r /tmp/uiref-extension-vX.Y.Z.zip . -x "*.DS_Store"
   ```
6. Tag and create the release:

   ```bash
   cd /Users/kxt/work/uiref  # or wherever the repo is
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   gh release create vX.Y.Z /tmp/uiref-extension-vX.Y.Z.zip \
     --title "vX.Y.Z — summary of changes" \
     --notes-file /tmp/release-notes.md
   ```

   Or `--notes "..."` inline.

7. Update the README "Install" section if the version number is referenced.

### Scenario C: Coordinated milestone (extension + multiple plugins + CLI)

Like a big "v0.3.0 release" when many things changed together.

1. Decide on a version number for each package independently (they may all go to 0.3.0 or not — depends on what actually changed)
2. Bump each package.json / manifest.json that changed
3. Update `CHANGELOG.md` comprehensively
4. Commit + push
5. Publish npm packages one by one:

   ```bash
   for p in plugins/svelte plugins/react plugins/vue plugins/angular cli; do
     (cd "$p" && npm publish --access public)
   done
   ```
6. Build extension zip, tag, create GitHub release (as in Scenario B, steps 5-7)

### Scenario D: Pre-release / beta

Use npm's `--tag` flag to publish without bumping the default version:

```bash
cd plugins/svelte
# package.json: "version": "0.2.0-beta.1"
npm publish --tag beta --access public
```

Users install via `npm install @uiref/svelte@beta`. Default `latest` tag is unaffected.

## CHANGELOG discipline

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format:

- Keep an `[Unreleased]` section at the top
- Add entries there as you work — use Added / Changed / Deprecated / Removed / Fixed / Security headings
- When cutting a release, move `[Unreleased]` entries to a new dated section `[X.Y.Z] — YYYY-MM-DD`
- Reset `[Unreleased]` to empty (or note "_Nothing yet._")

**Claude Code agents: do NOT update CHANGELOG on every commit.** Only update when cutting an actual release. Commits have commit messages; changelog captures user-facing summaries.

## npm publishing quick reference

One-time setup:
- Ensure you have an npm account
- Log in: `npm login`
- Create the `uiref` organization on npmjs.com (free)
- For 2FA-enabled accounts: either pass `--otp=<code>` per publish, or use a granular access token with "bypass 2FA" scoped to `@uiref/*`

Per-package publish:
```bash
cd plugins/<name>
npm publish --dry-run --access public   # verify files
npm publish --access public              # actually publish
```

`--access public` is **required** for scoped packages (`@uiref/*`) on the free npm tier. Without it, publish fails with 402.

## Chrome Web Store

Separate pipeline from GitHub releases. See [docs/chrome-web-store.md](./docs/chrome-web-store.md) for submission checklist.

When you submit a new extension version to the Chrome Web Store:

1. The version in `extension/manifest.json` must be higher than the previously approved version
2. Repackage the zip from `extension/`
3. Upload via Chrome dev console → your existing listing → Package → Upload new package
4. Fill out any questionnaire changes
5. Wait for approval (typically hours for minor updates, 1-3 days for major)

The Chrome Web Store and GitHub releases are independent channels. You can ship a GitHub release before or after Web Store approval; they don't block each other.

## Rollback

### Rolling back an npm publish

Within 72 hours:
```bash
npm unpublish @uiref/svelte@0.1.5
```

After 72 hours, only npm support can remove a published version. Best practice: always dry-run first.

If a bad version was published, bump and publish a fixed version rather than unpublishing. Consumers who installed the bad version will upgrade on their next `npm install`.

### Rolling back a GitHub release

```bash
gh release delete vX.Y.Z
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
```

The tag can be re-created later pointing at a fixed commit.

### Rolling back the Chrome extension

Submit a new version with the old behavior restored. Chrome doesn't have a "revert to previous version" — you ship a new version that happens to behave like the old one.

## Communication

After a notable release:

- **GitHub release notes** — primary source of truth for users looking at the repo
- **Twitter/X** — if you're announcing (short summary + link to release)
- **CHANGELOG.md** — in-repo record
- **README** — update "Status" section if the state of alpha/beta/stable changed

Avoid posting to HN/Reddit for every patch release — you'd burn goodwill. Save those channels for meaningful milestones.
