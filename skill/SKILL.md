---
name: anchorfile
description: Use when placing UI elements, tap targets, hitboxes, clickable regions, drawings, or overlays at precise coordinates on an image or PDF asset. Looks for a sidecar anchorfile (ground-truth spatial data) instead of guessing pixel coordinates from vision.
---

# anchorfile

Use this skill whenever a task involves placing something at a specific location on an image asset — UI elements, tap targets, hitboxes, clickable regions, drawings, overlays, sprite hotspots, form fields on a scanned page, or anything similar.

## Core rule

**Never hand-tune pixel coordinates against an image.** Vision-based coordinate regression drifts 5–30 pixels even in frontier models, which is unusable for UI. Instead, always reach for a sidecar anchorfile as ground truth.

## 1. Check for a sidecar anchorfile

For any image file, an anchorfile sidecar lives at `<asset_path_without_extension>.anchors.json`:

| Asset                              | Sidecar                                       |
|------------------------------------|-----------------------------------------------|
| `assets/level_01.png`              | `assets/level_01.anchors.json`                |
| `art/background.jpg`               | `art/background.anchors.json`                 |
| `pages/form.pdf`                   | `pages/form.anchors.json`                     |

If the sidecar exists, read it with the Read tool and use the anchors verbatim. Reference anchors by `name` when writing code. Use `px` when your consumer works in intrinsic image pixels; use `norm` when it works in normalized 0-1 coordinates. Both are provided so you never have to hand-convert.

## 2. If no sidecar exists, stop and ask the user to annotate

**Do not guess pixel coordinates from vision.** Do not write magic multipliers against a `GeometryReader`. Do not pattern-match fractional offsets from nearby code. All of these produce drift.

Instead, stop and tell the user:

> I need precise coordinates on `<image>`. Please run `anchor annotate <image>` — it will open a local browser annotator where you can draw named regions on the image. Save the result and I'll pick up the sidecar on the next turn.

Wait for them to complete the annotation before continuing. On the next turn, re-check for the sidecar and proceed.

## 3. When writing code that references anchors

- Look up anchors by their `name` field (e.g., `spawn_player`, not `anchors[0]`).
- Read the `label` field to understand what each anchor semantically represents — it's authored ground truth about the user's intent.
- Prefer generated code (`anchor gen <sidecar> --lang swift`) over runtime JSON loading in statically-typed languages. Constants are compile-time checked and have zero runtime cost.
- Do not hand-convert between `px` and `norm`. The file provides both; pick whichever matches your consumer's coordinate space.

## 4. After making changes, verify visually

If you've wired a new anchor into code and want to confirm it's correct:

```
anchor render <path-to-sidecar>
```

This burns every anchor's shape onto a debug copy of the source image, saved beside the sidecar. Use the Read tool to view that PNG and visually confirm your placements before the user has to build and run the app.

## 5. When the user asks to add a new tap target, hitbox, or overlay

The workflow is:

1. Check for the sidecar.
2. If absent, ask the user to run `anchor annotate <image>` and stop.
3. If present but the required anchor is missing, ask the user to run `anchor annotate <image>` again to add it.
4. Once the sidecar has the anchor, write code that references it by name.
5. Optionally run `anchor render` and read the debug PNG to verify.

## Non-goals

This skill does **not** apply to:

- Placing elements relative to other views (use SwiftUI alignment, CSS flexbox, etc.)
- Dynamic or runtime-generated content (user uploads, camera feeds)
- Text positioning inside existing layout containers
- Any image that's decorative and doesn't need tap targets or overlays

The skill is specifically for cases where a human artist or designer placed something visually and the code needs to align to that visual with pixel precision.
