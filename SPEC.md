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

| Field          | Type    | Required | Description |
|----------------|---------|----------|-------------|
| `format`       | string  | yes      | Always `"uiref/v1"` for this schema version. |
| `captured_at`  | string  | yes      | ISO 8601 UTC timestamp of when the capture happened. |
| `target`       | object  | yes      | Where the component is defined. See below. |
| `element`      | object  | yes      | What the DOM element looks like. See below. |
| `screenshot`   | string  | yes      | Base64 data URI of the element (PNG). Enables vision-capable AIs to see what was pointed at. May be `null` if capture failed. |
| `user_intent`  | string  | no       | Optional free-text note about what the user wants done. Usually null at capture time; the user types intent into the AI chat afterward. |

### `target` object

| Field        | Type                | Required | Description |
|--------------|---------------------|----------|-------------|
| `file`       | string \| null      | yes      | Source file path, relative to the project root when possible. May be `null` if resolution failed. |
| `line`       | integer \| null     | yes      | 1-indexed line number where the component is defined. May be `null` if resolution failed. |
| `component`  | string \| null      | yes      | The component's display name (`SaveButton`, `UserProfile`, etc.). May be `null` for unresolved elements. |

Consumers MUST handle the null case gracefully (e.g., fall back to grepping the codebase for `element.text`).

### `element` object

| Field           | Type    | Required | Description |
|-----------------|---------|----------|-------------|
| `tag`           | string  | yes      | HTML tag name (`button`, `div`, etc.). |
| `text`          | string  | no       | Inner text content of the element, if any. |
| `attributes`    | object  | no       | Key-value map of DOM attributes (class, id, data-*, etc.). |
| `dom_path`      | string  | no       | CSS selector path from `body` to the element, e.g., `body > main > form > button.primary`. |

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

## Related formats (future)

- `uiref-flow/v1` — an ordered sequence of uirefs with interaction actions, for describing multi-step user journeys. Not yet specified.
