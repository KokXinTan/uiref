# Publishing uiref packages to npm

This walks through publishing the uiref packages to npm for the first time, end to end. All of this is free. Takes ~15 minutes the first time, ~1 minute per package after that.

## One-time setup (do this once, ever)

### 1. Create an npm account

Go to [npmjs.com/signup](https://www.npmjs.com/signup). Pick a username, email, password. You'll need to verify your email before you can publish.

Your npm username appears publicly on every package you publish, so pick something you're happy with long-term.

### 2. Log in from your machine

```bash
npm login
```

It'll prompt for username, password, and email (plus a 2FA code if you enabled 2FA — recommended). This writes an auth token to `~/.npmrc` so all future `npm publish` commands just work.

Verify you're logged in:

```bash
npm whoami
# should print your username
```

### 3. Create the `uiref` organization (recommended)

To own all `@uiref/*` package names, create an npm organization:

1. Go to [npmjs.com](https://www.npmjs.com/) and log in
2. Click your avatar (top-right) → **Add Organization**
3. Enter `uiref` as the org name
4. Choose **Unlimited public packages — FREE**

Now the `@uiref` scope is reserved for you, and publishing `@uiref/svelte` etc. will work.

> **Alternative:** if you don't want to create an org, rename the packages to use your personal scope (e.g. `@kokxintan/uiref-svelte`) by editing each plugin's `package.json` `name` field. Everything else in this guide still applies.

## Publishing a single package

Each uiref package (the 4 build plugins and the setup CLI) is a separate npm publish. Let's walk through publishing `@uiref/svelte` first as a learning run.

### 1. Review the package

```bash
cd /Users/kxt/work/uiref/plugins/svelte
cat package.json
```

Key fields to verify:

- `name`: `@uiref/svelte` — the public name
- `version`: `0.1.0` — this must be unique per publish. First publish uses this, subsequent publishes bump it.
- `files`: `["index.js", "index.d.ts", "README.md"]` — only these files get published
- `license`: `MIT`
- `peerDependencies`: `svelte ^4.0.0 || ^5.0.0`

### 2. Dry-run first (don't skip this)

```bash
npm publish --dry-run --access public
```

This shows exactly what would be published without publishing. Look at the file list. Make sure no secrets, no `node_modules/`, no large files. If anything surprises you, add to `.npmignore` or tighten the `files` array.

### 3. Publish

```bash
npm publish --access public
```

The `--access public` flag is required for scoped packages (`@uiref/...`) on the free tier. Without it, npm tries to publish as private and fails.

You'll see output like:

```
+ @uiref/svelte@0.1.0
```

Now anyone can install it:

```bash
npm install @uiref/svelte
```

### 4. Verify

Visit `https://www.npmjs.com/package/@uiref/svelte`. You should see your package page.

## Publishing the other packages

Repeat the dry-run → publish flow for each:

```bash
cd /Users/kxt/work/uiref/plugins/react && npm publish --dry-run --access public && npm publish --access public
cd /Users/kxt/work/uiref/plugins/vue   && npm publish --dry-run --access public && npm publish --access public
cd /Users/kxt/work/uiref/plugins/angular && npm publish --dry-run --access public && npm publish --access public
cd /Users/kxt/work/uiref/cli && npm publish --dry-run --access public && npm publish --access public
```

## Updating a published package

Every publish needs a new version number. You can't re-publish `0.1.0` after you've published it (npm blocks this to prevent surprise changes to consumers).

To publish a bug fix:

```bash
cd plugins/svelte
# Edit package.json: bump version to 0.1.1
npm publish --access public
```

Or use npm's version bumping:

```bash
npm version patch    # 0.1.0 → 0.1.1 (bug fix)
npm version minor    # 0.1.0 → 0.2.0 (new feature, backwards-compatible)
npm version major    # 0.1.0 → 1.0.0 (breaking change)
npm publish --access public
```

`npm version` also creates a git tag, which is nice for release tracking.

## What gets made public

When you publish, the `files` array in `package.json` controls what's uploaded. For `@uiref/svelte`:

```json
"files": ["index.js", "index.d.ts", "README.md"]
```

Only those three files are published. `node_modules/`, test files, `.git/`, build artifacts — none of that is uploaded unless explicitly listed.

npm also uses `.npmignore` (similar to `.gitignore`) as a deny-list if you have one. If both `files` and `.npmignore` exist, `files` wins.

**Always do a `--dry-run` first the first few times** to build confidence about what's being uploaded.

## What's NOT private after publishing

- Your code (the files listed in `files`)
- Your `package.json` contents
- Your version history
- Your npm username
- Your package's README

## What IS still private

- Your email (unless you set it public in npm profile settings)
- Other files in your repo not in `files`
- Anything in `.gitignore` / `.npmignore`

## Unpublishing

You can unpublish a package within 72 hours of publishing. After 72 hours, only npm support can remove it (they'll do so for genuine reasons like secrets leaked). Best practice: always `--dry-run` first, never commit secrets.

```bash
npm unpublish @uiref/svelte@0.1.0  # remove a single version
npm unpublish @uiref/svelte --force  # remove the whole package (risky, breaks consumers)
```

## Publishing checklist for uiref

Before publishing any package, run through this:

- [ ] `README.md` is present and accurate for the specific package
- [ ] `package.json` `name` uses `@uiref/` scope
- [ ] `package.json` `version` is unique (not previously published)
- [ ] `package.json` `files` array lists only what should be public
- [ ] `package.json` `license` is `MIT`
- [ ] `package.json` `repository` points to the monorepo
- [ ] `npm publish --dry-run --access public` output looks right
- [ ] You've tested the package locally (via `file:` install or `npm link`)

## Automating with GitHub Actions (later)

Once you're comfortable, you can automate publishing via GitHub Actions on release tags. Example workflow at `.github/workflows/publish.yml` — not set up yet, but easy to add.

For now, manual publishing is totally fine for a small project.

## Troubleshooting

### `npm publish` says `403 Forbidden`

You're not logged in, or the package name is taken, or you're missing `--access public` for a scoped package. Re-run `npm login` and add `--access public`.

### `npm publish` says `version already exists`

You're trying to publish a version that's already on npm. Bump the version in `package.json` and retry.

### `npm whoami` says you're not logged in

Run `npm login` again. Check `~/.npmrc` — auth tokens can expire.

### I published something I shouldn't have!

If it's within 72 hours: `npm unpublish @uiref/pkg@version`. If older, email npm support (support@npmjs.com) and explain. They're helpful for genuine mistakes.
