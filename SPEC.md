# uiref Format Specification

**Schema version:** 1 (`uiref/v1`)
**Status:** draft

This document defines the `uiref/v1` JSON format — a minimal, language-agnostic reference to a UI element that an AI coding assistant (like Claude Code) can consume to know exactly which component a user is pointing at.

## Design principles

- **Minimal.** Five required fields. Everything else is optional or forward-compat.
- **Self-contained.** A single JSON file can be dropped into any AI assistant and it has enough to act.
- **Open for extension.** Unknown fields MUST be preserved by round-tripping tools but MAY be ignored by consumers.
- **Local-only.** No URLs point to anything except local file paths. No telemetry, no cloud.

## Minimal example

```json
{
  "format": "uiref/v1",
  "captured_at": "2026-04-16T14:22:00Z",
  "target": {
    "file": "src/lib/SaveButton.svelte",
    "line": 12,
    "component": "SaveButton"
  },
  "element": {
    "tag": "button",
    "text": "Save Changes"
  },
  "screenshot": "data:image/png;base64,iVBORw0KGgo...",
  "user_intent": null
}
```

That's a complete, valid uiref. Five fields: `format`, `captured_at`, `target`, `element`, `screenshot`. `user_intent` is optional and usually `null` at capture time (the user types their intent into the AI chat afterward).

## Field reference

### Top-level

| Field              | Type    | Required | Description |
|--------------------|---------|----------|-------------|
| `format`           | string  | yes      | Always `"uiref/v1"` for this schema version. |
| `captured_at`      | string  | yes      | ISO 8601 UTC timestamp of when the capture happened. |
| `page`             | object  | no       | Page context: `url`, `pathname`, `title` at capture time. In workflow mode, for click/navigate actions, always includes `url_after` and `pathname_after` (the URL ~800ms after the step — may or may not differ from `url`). Other action types (type/focus/toggle/ref) omit these fields. Consumers should compare `url` vs `url_after` to determine if a click navigated. |
| `viewport`         | object  | no       | `width`, `height`, `dpr`, `theme` ("dark" / "light" / null). |
| `target`           | object  | yes      | The innermost component whose DOM contains the clicked element. See below. |
| `ancestors`        | array   | no       | Ordered chain of parent components (inner → outer). Each entry has `file`, `line`, `component`. Useful when `target` is a generic wrapper and the specific context lives higher up. May be `null`. |
| `element`          | object  | yes      | What the DOM element looks like. See below. |
| `props_at_render`  | object  | no       | Framework-resolved component props at click time: `{ framework: "react"\|"vue"\|"angular", props: {...} }`. Null if not resolvable (Svelte, production builds without framework debug info). |
| `store_snapshot`   | object  | no       | Current store state at capture time. Populated only if the developer opts in via `window.__uirefStore` (see "Store snapshot opt-in" below). Framework-agnostic. |
| `events`           | object  | no       | Recent console logs, uncaught errors, network requests, and SPA navigations from the last ~30 seconds. See below. Null if nothing happened recently. |
| `screenshot`       | string  | yes      | Base64 data URI of the element (PNG). Enables vision-capable AIs to see what was pointed at. May be `null` if capture failed. |
| `user_intent`      | string  | no       | Optional free-text note about what the user wants done. Usually null at capture time. |

### `target` object

| Field        | Type                | Required | Description |
|--------------|---------------------|----------|-------------|
| `file`       | string \| null      | yes      | Source file path, relative to the project root when possible. May be `null` if resolution failed. |
| `line`       | integer \| null     | yes      | 1-indexed line number where the component is defined. May be `null` if resolution failed. |
| `component`  | string \| null      | yes      | The component's display name (`SaveButton`, `UserProfile`, etc.). May be `null` for unresolved elements. |

Consumers MUST handle the null case gracefully (e.g., fall back to grepping the codebase for `element.text`).

### `element` object

| Field             | Type    | Required | Description |
|-------------------|---------|----------|-------------|
| `tag`             | string  | yes      | HTML tag name (`button`, `div`, etc.). |
| `text`            | string  | no       | Inner text content of the element, if any. |
| `attributes`      | object  | no       | Key-value map of DOM attributes (class, id, data-*, etc.). |
| `dom_path`        | string  | no       | CSS selector path from `body` to the element, e.g., `body > main > form > button.primary`. |
| `computed_styles` | object  | no       | Curated set of computed CSS values (color, background, font, padding, etc.). Only populated values are included. |
| `input_state`     | object  | no       | Present when the element is `<input>` / `<textarea>` / `<select>`. Fields: `value`, `placeholder`, `name`, `type`, `label`, `required`, `disabled`. Values of `type="password"` fields are captured as `[redacted]` regardless of content. |

Text resolution (the `text` field) tries, in order: `textContent` → `aria-label` → `title` → `alt` → inner `<img alt>` → inner `<svg><title>` → inner `<use href="#icon-name">`. This is important for icon-only buttons and accessibility-first UIs where the visible "label" is not the literal text node.

### `events` object

A snapshot of recent browser activity captured from the page's main world. Useful for debugging "this broke when I clicked X" scenarios where the state that produced the bug is not visible in the DOM alone.

```json
{
  "window_ms": 30000,
  "console": [
    { "level": "error", "args": ["Failed to load config", "NetworkError"], "t": 1713422340000 },
    { "level": "log", "args": ["[auth] user signed in"], "t": 1713422339800 }
  ],
  "errors": [
    { "message": "Cannot read properties of undefined (reading 'id')", "filename": "app.js", "line": 412, "column": 15, "stack": "...", "t": 1713422340500 }
  ],
  "network": [
    { "method": "GET",  "url": "/api/charts/water", "status": 500, "ok": false, "duration_ms": 230, "t": 1713422340100 },
    { "method": "POST", "url": "/graphql", "operation": "GetSiteWater", "status": 200, "ok": true, "duration_ms": 95, "t": 1713422340050 },
    { "method": "POST", "url": "/api/track", "status": 204, "ok": true, "duration_ms": 18, "t": 1713422339950 }
  ],
  "navigations": [
    { "from": "/login", "kind": "push", "t": 1713422330000 }
  ]
}
```

Each array entry has a `t` field (epoch millis). The `window_ms` at the top indicates the lookback window — typically 30 seconds.

**Privacy note:** `events.network` captures URL, method, status, duration, and optionally `operation` (the GraphQL `operationName` field, extracted from POST bodies specifically for disambiguating repeated calls to `/graphql` endpoints). **No request bodies, response bodies, headers, payloads, or query variables are captured.** The GraphQL operation name is a safe exception because it's already visible to anyone with DevTools access and is not sensitive. `events.console` captures stringified arguments truncated to 200 chars each.

### How event capture is scoped

Two defensive defaults keep the privacy story clear:

**1. Lazy capture (default).** The extension's main-world script *installs* the `console.*` / `fetch` / `XMLHttpRequest` / `history.*` patches on page load, but they remain **no-ops** until the user explicitly activates the picker on that tab. No events enter the buffer, no data is captured, no events are emitted — the patches exist only so that stack traces are consistent after activation. Once the picker is activated once on a tab, buffering continues for the life of the tab.

**Opt in to eager capture** (buffer from page load, so pre-click history is fuller) by setting in your app bootstrap:

```js
window.__uirefConfig = { eagerPatch: true };
```

**2. GraphQL operation name is opt-in.** To disambiguate repeated calls to `/graphql`, the extension can extract just the `operationName` field from POST bodies. This is the **only** body content ever read. It is off by default. Opt in with:

```js
window.__uirefConfig = { captureGraphQLOperation: true };
```

### Opting out of individual patches

If the patches' stack-trace presence is noisy while debugging framework warnings, opt out specific wrappers:

```js
window.__uirefConfig = {
  patchConsole: false,    // don't wrap console.*
  patchErrors: false,     // don't hook window.error / unhandledrejection
  patchNetwork: false,    // don't wrap fetch / XMLHttpRequest
  patchNavigation: false, // don't wrap history.pushState / replaceState
};
```

All patches are enabled (but dormant) by default. Disabling a patch means the corresponding events won't be captured in uirefs for that page.

## Store snapshot opt-in

Universal store introspection (Redux / Zustand / Pinia / Svelte stores / Jotai / Valtio / custom) is impossible for a browser extension because each library exposes state differently — many not at all. Instead, uiref supports a one-line developer opt-in.

In your app's dev entry point:

```js
// Expose your store for uiref captures (dev only).
if (import.meta.env.DEV) {
  window.__uirefStore = () => myStore.getState();
}
```

The accessor can return any JSON-serializable value. Use cases:

- **Single store:** `() => store.getState()` (Redux, Zustand)
- **Multiple stores:** `() => ({ auth: authStore.get(), cart: cartStore.get() })`
- **Slice of state:** `() => ({ user: authStore.user, route: router.pathname })` (only what's useful)
- **Pinia:** `() => pinia.state.value`
- **Svelte stores:** `() => ({ user: get(userStore), cart: get(cartStore) })` (using `get` from `svelte/store`)

At capture time, the uiref extension calls `window.__uirefStore()` and includes the result as `store_snapshot` in the uiref. Functions, DOM elements, Maps, and Sets are serialized sensibly; circular references are broken. If nothing is exposed, `store_snapshot` is `null`.

## Delivery convention

A uiref is a standalone JSON file. Tools that produce uirefs SHOULD write them to a directory that the AI assistant watches. The conventional location is:

```
~/uiref-inbox/<ISO-8601-timestamp>.json
```

AI assistants that consume uirefs SHOULD:

1. Check this directory when the user's message references a UI element ("fix this", "change the...", "modify that...", etc.).
2. Read the most recent file within a reasonable recency window (e.g., 5 minutes).
3. Use `target.file` and `target.line` as the authoritative reference for code modifications.
4. Fall back to grepping for `element.text` in the codebase if `target.file` is null.
5. Acknowledge the reference to the user: "I see you pointed at `SaveButton` (src/lib/SaveButton.svelte:12). ..."

## Resolution mechanism: `data-uiref-*` attributes

The recommended mechanism for surfacing source locations to the DOM is a set of reserved `data-*` attributes that build tools inject at compile time.

| Attribute                | Value                                          |
|--------------------------|------------------------------------------------|
| `data-uiref-file`        | Source file path (relative to project root).   |
| `data-uiref-line`        | 1-indexed line number (as string).             |
| `data-uiref-component`   | Component display name.                        |

Extensions that capture uirefs SHOULD prefer these attributes over framework-specific APIs when present.

This approach works in dev AND production builds, is immune to framework internal changes, and is framework-agnostic at the attribute level.

### Per-framework build integrations

| Framework   | Integration            | Status  |
|-------------|------------------------|---------|
| Svelte 5    | `@uiref/svelte` preprocessor | v1 target |
| React (Vite)| `@uiref/vite-react`    | planned |
| Vue 3       | `@uiref/vue`           | planned |
| Angular     | `@uiref/angular-builder` | planned |

### Fallback resolution tiers

Capture tools should attempt resolution in this order:

1. **Tier 1 (highest):** Read `data-uiref-*` attributes from the element or its ancestors.
2. **Tier 2:** Framework dev-mode internals (React Fiber `_debugSource`, Vue `__vueParentComponent`, Angular `ng.getComponent`). Works only in dev builds and specific framework versions.
3. **Tier 3:** Source map lookup for any onClick handlers or bundled JS referencing the element.
4. **Tier 4 (last resort):** Return `target.*` as `null` and let the AI fall back to text-based codebase search using `element.text`.

Each tier that fails degrades gracefully to the next.

## Forward compatibility

Unknown top-level fields MUST be preserved by round-tripping tools. Unknown fields inside `target` or `element` MAY be ignored by consumers but SHOULD be preserved. This allows frameworks and tools to add metadata without breaking older readers.

Future versions (`uiref/v2`, etc.) will bump the `format` field. Consumers SHOULD refuse to parse unknown major versions with a clear error rather than best-effort.

## Related format: `uiref-flow/v1`

A `uiref-flow` is an ordered collection of uirefs, used to describe a multi-element workflow, a user journey, or a set of related components. It reuses the `uiref/v1` object as its step target.

Filename convention: `<timestamp>.uiref-flow.json` (distinct from `.uiref.json`).

### Example

```json
{
  "format": "uiref-flow/v1",
  "captured_at": "2026-04-16T14:22:00Z",
  "finished_at": "2026-04-16T14:23:15Z",
  "title": null,
  "user_intent": null,
  "steps": [
    {
      "order": 1,
      "action": "ref",
      "target": {
        "format": "uiref/v1",
        "captured_at": "2026-04-16T14:22:02Z",
        "target": { "file": "src/lib/LoginForm.svelte", "line": 5, "component": "LoginForm" },
        "element": { "tag": "input", "text": null, "attributes": { "name": "email" } },
        "screenshot": "data:image/png;base64,…",
        "user_intent": null
      },
      "timestamp_ms": 1820
    },
    {
      "order": 2,
      "action": "ref",
      "target": { "format": "uiref/v1", "...": "another uiref" },
      "timestamp_ms": 4210
    }
  ]
}
```

### Fields

| Field          | Type    | Required | Description |
|----------------|---------|----------|-------------|
| `format`       | string  | yes      | Always `"uiref-flow/v1"`. |
| `captured_at`  | string  | yes      | ISO 8601 timestamp when the workflow started. |
| `finished_at`  | string  | yes      | ISO 8601 timestamp when the workflow was finalized. |
| `title`        | string  | no       | Optional human-readable title for the workflow. May be `null`. |
| `user_intent`  | string  | no       | Optional free-text description of the user's goal. May be `null`. |
| `steps`        | array   | yes      | Ordered array of step objects. Always 1-indexed by `order`. |

### Step object

| Field          | Type    | Required | Description |
|----------------|---------|----------|-------------|
| `order`        | integer | yes      | 1-indexed position in the flow. |
| `action`       | string  | yes      | What the user was doing with this element. See action vocabulary below. |
| `target`       | object  | yes      | A full `uiref/v1` object (same schema). |
| `timestamp_ms` | integer | no       | Milliseconds since the flow's `captured_at`. Optional; omitted when the flow is a manual unordered grouping. |

### Action vocabulary

| Action          | Meaning | Inferred from |
|-----------------|---------|---------------|
| `ref`           | The user pointed at this element as a reference. No interaction implied. Default for non-interactive elements. | Everything not below |
| `click`         | Pointer click on a button or button-role element. | `<button>`, `[role="button"]` |
| `navigate`      | User intends to navigate via a link. | `<a>`, `[role="link"]` |
| `type`          | Text input target — user is typing or will type here. | `<input>`, `<textarea>`, `<select>`, `[role="textbox"]` |
| `focus`         | Focus transition (e.g. clicking a label focuses its paired input). | `<label>` |
| `toggle`        | Toggle a disclosure / expandable section. | `<summary>` |
| `hover`         | Pointer hover. (Not automatically inferred — reserved for future event-based capture.) | — |
| `assert_visible`, `assert_text`, `assert_absent` | User-marked assertions. | — |

For manual workflow chaining (the default mode — click to capture), actions are **auto-inferred from the captured element's tag / role** so flows carry meaningful intent. Unknown actions MUST be preserved by tools that round-trip flows but MAY be ignored by consumers.

### Consumption

AI assistants that support `uiref/v1` SHOULD also support `uiref-flow/v1`:

1. Detect `.uiref-flow.json` files alongside `.uiref.json` files in the inbox.
2. Walk `steps[].target` to extract all referenced components — each is a full uiref.
3. Use the flow's `title` and `user_intent` (if set) as context, plus the sequence order.
4. Acknowledge the workflow to the user: "Got your 4-step workflow referencing LoginForm, EmailInput, SubmitButton, and DashboardHeader. What would you like me to do?"
