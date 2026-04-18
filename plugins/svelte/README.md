# @uiref/svelte

Svelte preprocessor that injects `data-uiref-file`, `data-uiref-line`, and `data-uiref-component` attributes onto the first element of each component. The [uiref Chrome extension](https://github.com/KokXinTan/uiref) reads these attributes to know which source file a DOM element came from.

Works with both Svelte 4 and Svelte 5. Runs before the Svelte compiler so it's immune to internal framework changes (runes, reactive primitives, etc.).

## Install

```bash
npm install --save-dev @uiref/svelte
# or
pnpm add -D @uiref/svelte
# or
bun add -D @uiref/svelte
```

## Usage

Add to your `svelte.config.js`:

```js
import uiref from '@uiref/svelte';

export default {
  preprocess: [uiref()],
};
```

Or with other preprocessors (e.g., `vitePreprocess`):

```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import uiref from '@uiref/svelte';

export default {
  preprocess: [uiref(), vitePreprocess()],
};
```

The preprocessor only runs in development by default (`NODE_ENV !== 'production'`), so your production bundle is unaffected.

### Recommended: enable richest event capture

Add to the top of `src/routes/+layout.svelte`'s `<script>` block (or an inline script in `src/app.html`):

```js
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__uirefConfig = {
    eagerPatch: true,                 // buffer events from page load
    captureGraphQLOperation: true,    // extract GraphQL operationName
  };
}
```

Without this, the uiref Chrome extension only starts buffering console logs / errors / network requests once you activate the picker on a tab. With it, you get the full 30-second pre-click history (critical for "this broke right before I clicked" scenarios).

## Options

```js
uiref({
  // Boolean or function(filename) => boolean. Default: dev-only.
  enabled: true,

  // Base dir for project-relative paths in data-uiref-file. Default: process.cwd().
  cwd: process.cwd(),
})
```

## What it does

Input (`src/lib/SaveButton.svelte`):

```svelte
<script>
  export let onSave;
</script>

<button on:click={onSave}>Save</button>
```

Output (after preprocessing):

```svelte
<script>
  export let onSave;
</script>

<button data-uiref-file="src/lib/SaveButton.svelte" data-uiref-line="5" data-uiref-component="SaveButton" on:click={onSave}>Save</button>
```

The Chrome extension walks up from the clicked DOM element until it finds one of these attributes, producing a uiref JSON like:

```json
{
  "target": {
    "file": "src/lib/SaveButton.svelte",
    "line": 5,
    "component": "SaveButton"
  },
  "element": {
    "tag": "button",
    "text": "Save"
  },
  ...
}
```

## License

MIT
