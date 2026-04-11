# anchorfile Format Specification

**Schema version:** 1
**Status:** draft (subject to change until first tagged release)

This document defines the on-disk format for an **anchorfile** — a JSON sidecar that records named spatial regions on an image asset. The format is designed to be:

- **Machine-written** by annotation tools and **machine-read** by code generators, runtime loaders, and LLM assistants.
- **Human-scannable** (every anchor has a `label` describing what it is).
- **Language-agnostic** (no framework-specific fields; coordinate transforms happen in consumers).
- **Git-friendly** (deterministic key ordering, stable serialization, small diffs).

## File naming

An anchorfile lives beside its source asset and uses this naming convention:

```
<asset_basename>.anchors.json
```

Examples:

| Source asset                  | Sidecar                                  |
|-------------------------------|------------------------------------------|
| `level_01.png`                | `level_01.anchors.json`                  |
| `assets/ui/background.jpg`    | `assets/ui/background.anchors.json`      |
| `pages/form.pdf`              | `pages/form.anchors.json`                |

One anchorfile per source asset. Tools should resolve the pairing by stripping any extension from the asset path and appending `.anchors.json`.

## Top-level structure

```json
{
  "schema_version": 1,
  "source": "level_01.png",
  "intrinsic_size": [1920, 1080],
  "content_hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "coordinate_origin": "top-left",
  "anchors": [ /* ... */ ]
}
```

### Top-level fields

| Field                | Type              | Required | Description |
|----------------------|-------------------|----------|-------------|
| `schema_version`     | integer           | yes      | Currently `1`. Tools MUST refuse to parse unknown major versions with a clear error. |
| `source`             | string            | yes      | Path to the source asset, relative to the anchorfile. Conventionally the basename. |
| `intrinsic_size`     | [integer, integer]| yes      | `[width, height]` of the source asset in pixels. This is the authoritative coordinate space for all `px` fields. |
| `content_hash`       | string            | yes      | `sha256:<hex>` of the source asset's bytes at annotation time. Used by `anchor verify` to detect drift. |
| `coordinate_origin`  | string            | yes      | Always `"top-left"` in v1. Reserved for future asset types (PDF, SVG) where other origins may apply. |
| `anchors`            | array             | yes      | Ordered array of anchor objects. Order is preserved but not semantically meaningful; lookup is by `name`. |

## Anchor object

Every anchor object has these common fields, plus shape-specific coordinate fields determined by `kind`.

### Common fields

| Field    | Type   | Required | Description |
|----------|--------|----------|-------------|
| `name`   | string | yes      | Unique identifier within this anchorfile. Conventionally `snake_case`. Used by code consumers to look up the anchor. |
| `kind`   | string | yes      | One of: `"rect"`, `"point"`, `"ellipse"`. (v1 primitive set — v2 adds `polygon`, `polyline`, `rounded_rect`, `nine_slice`.) |
| `label`  | string | yes      | Human-readable description of what this anchor represents. Read by LLMs to understand semantics; read by humans for diffs and reviews. |
| `px`     | object | yes      | Coordinates in the source asset's pixel space (see `intrinsic_size`). Shape depends on `kind`. |
| `norm`   | object | yes      | Coordinates normalized to `[0, 1]` based on `intrinsic_size`. Provided redundantly so consumers never have to compute the transform. Shape matches `px`. |

`name` uniqueness is enforced across the entire `anchors` array; tools writing anchorfiles MUST reject duplicate names.

### Shape: `rect`

An axis-aligned rectangle.

```json
{
  "name": "chest_treasure",
  "kind": "rect",
  "label": "Treasure chest hitbox in the top-left room",
  "px":   { "x": 340, "y": 180, "w": 96, "h": 72 },
  "norm": { "x": 0.177, "y": 0.167, "w": 0.050, "h": 0.067 }
}
```

| `px` field | Meaning                                    |
|------------|--------------------------------------------|
| `x`, `y`   | Top-left corner in pixel coordinates.      |
| `w`, `h`   | Width and height in pixels.                |

`norm` fields mirror `px` exactly, with each value divided by the corresponding axis of `intrinsic_size`. Tools SHOULD round normalized values to 3–4 decimal places.

### Shape: `point`

A single location. Useful for label anchors, spawn points, camera look-at targets, "where the arrow points to", etc.

```json
{
  "name": "spawn_player",
  "kind": "point",
  "label": "Where the player spawns at level start",
  "px":   { "x": 240, "y": 810 },
  "norm": { "x": 0.125, "y": 0.750 }
}
```

| `px` field | Meaning                               |
|------------|---------------------------------------|
| `x`, `y`   | Point location in pixel coordinates.  |

### Shape: `ellipse`

An axis-aligned ellipse defined by center and radii. Useful for circular or ovular regions that would be awkwardly approximated by a rectangle, such as a radial trigger zone, a sensor field of view, or a rounded decorative motif.

```json
{
  "name": "trigger_boss_arena",
  "kind": "ellipse",
  "label": "Circular trigger zone that starts the boss encounter",
  "px":   { "cx": 1440, "cy": 540, "rx": 220, "ry": 220 },
  "norm": { "cx": 0.750, "cy": 0.500, "rx": 0.115, "ry": 0.204 }
}
```

| `px` field   | Meaning                                   |
|--------------|-------------------------------------------|
| `cx`, `cy`   | Center in pixel coordinates.              |
| `rx`, `ry`   | Semi-axis lengths (half-width, half-height) in pixels. |

For a circle, set `rx == ry`. Rotated ellipses are not supported in v1 and are reserved for a future `kind: "ellipse_rotated"`.

## Serialization rules

To keep anchorfiles diff-friendly in git, tools that write anchorfiles MUST follow these rules:

1. **Two-space indentation.** No tabs.
2. **Trailing newline** at end of file.
3. **Key ordering** at the top level is fixed: `schema_version`, `source`, `intrinsic_size`, `content_hash`, `coordinate_origin`, `anchors`.
4. **Key ordering** within each anchor is fixed: `name`, `kind`, `label`, `px`, `norm`.
5. **Numeric precision** for `norm` values: 3 decimal places minimum, 4 maximum. Do not emit `0.15400000000001`.
6. **UTF-8 without BOM.**

Readers MUST NOT rely on these rules — they MUST accept any valid JSON that matches the schema. The rules apply to writers only.

## `content_hash` semantics

The `content_hash` field records `sha256:<hex>` of the source asset's bytes at the moment the anchorfile was saved. Tools use it to detect when the image has changed out from under the anchors:

- **`anchor verify`** re-hashes the source and warns if it differs.
- **Codegen tools** MAY embed the expected hash in generated code as a defensive check.
- **`anchor annotate`** on open: if the current asset hash differs from the stored hash, the annotator SHOULD show a warning banner before letting the user edit — old anchors may no longer make sense against new art.

Format: `sha256:` prefix followed by 64 lowercase hex characters. Other hash algorithms MAY be supported in future schema versions.

## Supported asset types (v1)

v1 supports raster images only: **PNG**, **JPEG**, **WebP**. `intrinsic_size` is the image's pixel dimensions at its native resolution.

Reserved for future versions:

- **PDF** — one anchorfile per page, `source` references `document.pdf#page=N`, `intrinsic_size` derived from a declared rasterization DPI.
- **SVG** — anchors may optionally reference element IDs in addition to pixel coordinates; rasterization rules TBD.
- **Video** — temporal anchors with start/end timestamps.

## Forward compatibility

Unknown fields inside an anchor object MUST be preserved by round-tripping tools but MAY be ignored by consumers. This allows experimental fields to be added without breaking older readers.

Unknown top-level fields are reserved for schema evolution; tools should preserve them when rewriting but should not rely on their presence.

## Example: a full anchorfile

```json
{
  "schema_version": 1,
  "source": "level_01.png",
  "intrinsic_size": [1920, 1080],
  "content_hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "coordinate_origin": "top-left",
  "anchors": [
    {
      "name": "spawn_player",
      "kind": "point",
      "label": "Where the player spawns at level start",
      "px":   { "x": 240, "y": 810 },
      "norm": { "x": 0.125, "y": 0.750 }
    },
    {
      "name": "chest_treasure",
      "kind": "rect",
      "label": "Treasure chest hitbox in the top-left room",
      "px":   { "x": 340, "y": 180, "w": 96, "h": 72 },
      "norm": { "x": 0.177, "y": 0.167, "w": 0.050, "h": 0.067 }
    },
    {
      "name": "trigger_boss_arena",
      "kind": "ellipse",
      "label": "Circular trigger zone that starts the boss encounter",
      "px":   { "cx": 1440, "cy": 540, "rx": 220, "ry": 220 },
      "norm": { "cx": 0.750, "cy": 0.500, "rx": 0.115, "ry": 0.204 }
    }
  ]
}
```
