# @uiref/setup

One-command installer for [uiref](https://github.com/KokXinTan/uiref). Detects your framework, installs the matching build plugin, patches your build config, copies the Claude skill, and creates the inbox folder.

## Usage

Run in your project root:

```bash
npx @uiref/setup
```

That's it. The CLI:

1. Reads your `package.json`, detects the framework (Svelte / React / Vue / Angular) and package manager (npm / pnpm / yarn / bun)
2. Installs the matching `@uiref/*` plugin
3. Patches `svelte.config.js` / `vite.config.*` to wire the plugin in
4. Copies the Claude skill to `~/.claude/skills/uiref/`
5. Creates `~/uiref-inbox/`
6. Prints the last manual step (install the Chrome extension)

## What it detects

| Framework | Detected via | Plugin installed |
|---|---|---|
| Svelte / SvelteKit | `svelte` or `@sveltejs/kit` in deps | `@uiref/svelte` |
| React / Next.js | `react` or `next` in deps | `@uiref/babel-plugin-react` |
| Vue 3 / Nuxt | `vue` or `nuxt` in deps | `@uiref/vue` |
| Angular 17+ | `@angular/core` in deps | `@uiref/angular` |

| Package manager | Detected via |
|---|---|
| pnpm | `pnpm-lock.yaml` |
| yarn | `yarn.lock` |
| bun | `bun.lock` / `bun.lockb` |
| npm | fallback |

## Last manual step

The CLI can't install the Chrome extension for you — that's a browser thing. After `npx @uiref/setup` succeeds:

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `extension/` folder (clone the repo or download from [GitHub](https://github.com/KokXinTan/uiref))

Once the Chrome Web Store listing is approved, this becomes a one-click install.

## Recommended optional config

After setup, consider adding this to your app bootstrap (e.g., SvelteKit's `src/hooks.client.ts`, React's `src/main.tsx`):

```js
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__uirefConfig = {
    eagerPatch: true,                 // buffer events from page load
    captureGraphQLOperation: true,    // extract GraphQL operationName
  };
}
```

Without this, uiref only buffers console/network/error events after you first activate the picker on a tab. With it, you get the full 30-second pre-click history — critical for "this broke right before I clicked" debugging. The block is stripped from production builds via dead-code elimination (zero runtime cost).

## License

MIT — see the main [uiref](https://github.com/KokXinTan/uiref) repo.
