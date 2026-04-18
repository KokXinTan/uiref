# @uiref/angular

Vite plugin for Angular 17+ that injects `data-uiref-*` attributes into component templates (both external `.component.html` and inline template strings). The [uiref Chrome extension](https://github.com/KokXinTan/uiref) reads these attributes to resolve DOM elements to source files.

## Install

```bash
npm install --save-dev @uiref/angular
```

## Usage

Angular 17+ uses a Vite-based dev server under the hood. Add the plugin to the Vite config used by the Angular builder, or wrap via a custom builder.

For standard Angular CLI projects, add to the Vite plugin list exposed by `@angular-devkit/build-angular`:

```ts
import uirefAngular from '@uiref/angular';

export default {
  plugins: [uirefAngular()],
};
```

(Consult your specific Angular version's docs for exact integration — Angular is a moving target.)

## What it does

For external templates (`hero.component.html`):

```html
<div>
  <h1>Hello {{name}}</h1>
</div>
```

Becomes:

```html
<div data-uiref-file="src/app/hero.component.html" data-uiref-line="1" data-uiref-component="HeroComponent">
  <h1>Hello {{name}}</h1>
</div>
```

For inline templates in `@Component({ template: '...' })`, same injection on the first element.

## Recommended: enable richest event capture

Add to the top of `src/main.ts` (before `bootstrapApplication()`):

```js
if (!window.location.hostname.includes('production')) {
  (window as any).__uirefConfig = {
    eagerPatch: true,                 // buffer events from page load
    captureGraphQLOperation: true,    // extract GraphQL operationName
  };
}
```

Without this, the uiref Chrome extension only starts buffering console logs / errors / network requests once you activate the picker on a tab.

## Known limitations (v0.1)

- Only injects on the first element of each template. Nested components rely on the Chrome extension walking up the DOM.
- Component name inferred from the filename (for external templates) or the class declaration following the `@Component` decorator.
- Does not yet handle Angular's new `@defer` blocks or control-flow blocks (`@if`, `@for`) specially.
- Not tested against every Angular build system (standalone, zoneless, SSR). Please open an issue if something breaks.

## License

MIT
