# @uiref/vue

Vite plugin that injects `data-uiref-file`, `data-uiref-line`, and `data-uiref-component` attributes into the root element of each Vue 3 SFC template. The [uiref Chrome extension](https://github.com/KokXinTan/uiref) reads these attributes to know which source file produced a DOM element.

## Install

```bash
npm install --save-dev @uiref/vue
```

## Usage

```js
// vite.config.js
import vue from '@vitejs/plugin-vue';
import uirefVue from '@uiref/vue';

export default {
  plugins: [
    uirefVue(),  // MUST come before vue()
    vue(),
  ],
};
```

The plugin runs in dev only by default (`NODE_ENV !== 'production'`).

### Recommended: enable richest event capture

Add to the top of `src/main.ts` (before `app.mount()`):

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
uirefVue({
  enabled: true,          // or a function(id) => boolean
  cwd: process.cwd(),
})
```

## What it does

Input (`src/components/SaveButton.vue`):

```vue
<script setup>
defineProps({ onSave: Function });
</script>

<template>
  <button @click="onSave">Save</button>
</template>
```

After the plugin runs, the template's root element gets decorated:

```vue
<template>
  <button data-uiref-file="src/components/SaveButton.vue" data-uiref-line="6" data-uiref-component="SaveButton" @click="onSave">Save</button>
</template>
```

## License

MIT
