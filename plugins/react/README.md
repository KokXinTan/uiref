# @uiref/babel-plugin-react

Babel plugin that injects `data-uiref-file`, `data-uiref-line`, and `data-uiref-component` attributes onto every JSX element. The [uiref Chrome extension](https://github.com/KokXinTan/uiref) reads these attributes to know which source file produced a DOM element.

Works with any setup that uses Babel to compile JSX: Create React App, Next.js, Vite+React, Remix, Parcel, etc.

## Install

```bash
npm install --save-dev @uiref/babel-plugin-react
```

## Usage

### Vite + React

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

### Next.js

Add to `babel.config.js` (creating it if it doesn't exist):

```js
module.exports = {
  presets: ['next/babel'],
  plugins: [
    ['@uiref/babel-plugin-react', { enabled: process.env.NODE_ENV !== 'production' }],
  ],
};
```

### Create React App

Use with [`craco`](https://craco.js.org/) or eject:

```js
// craco.config.js
module.exports = {
  babel: {
    plugins: [
      ['@uiref/babel-plugin-react', { enabled: process.env.NODE_ENV !== 'production' }],
    ],
  },
};
```

## Options

```js
{
  enabled: true,          // default: true. Gate via NODE_ENV in your config.
  cwd: process.cwd(),     // base dir for data-uiref-file paths
}
```

## Recommended: enable richest event capture

Add to the top of your app entry (e.g. `src/main.tsx`, `src/index.tsx`, or `app/layout.tsx`):

```js
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__uirefConfig = {
    eagerPatch: true,                 // buffer events from page load
    captureGraphQLOperation: true,    // extract GraphQL operationName
  };
}
```

Without this, the uiref Chrome extension only starts buffering console logs / errors / network requests once you activate the picker on a tab. With it, you get the full 30-second pre-click history.

## What it does

Input:

```jsx
// src/components/SaveButton.jsx
export function SaveButton({ onSave }) {
  return <button onClick={onSave}>Save</button>;
}
```

Output (conceptually, after Babel):

```jsx
export function SaveButton({ onSave }) {
  return (
    <button
      onClick={onSave}
      data-uiref-file="src/components/SaveButton.jsx"
      data-uiref-line="3"
      data-uiref-component="SaveButton"
    >
      Save
    </button>
  );
}
```

Injects on every JSX element — the Chrome extension walks up until it finds a match, so nested components still resolve correctly.

## License

MIT
