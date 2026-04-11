# anchorfile

> A language-agnostic sidecar format for named spatial anchors on image assets, designed so LLMs and humans can overlay UI elements, hitboxes, and drawings at pixel-precise coordinates without guessing.

**Status:** alpha / spec stage. No implementation yet. This repo currently contains the design and format specification; tooling lands in follow-up commits.

## The problem

You need to overlay interactive elements on a fixed image asset — tap targets, hitboxes, drawings, labels, clickable regions, collision zones, form fields, spawn points — and you need them to land at pixel-precise locations. This comes up in:

- **Game level maps** — spawn points, collision regions, and trigger zones on illustrated scenes.
- **Illustrated UI backgrounds** — painted or photographed backdrops with interactive elements layered on top.
- **HTML image maps and infographics** — diagrams and charts with clickable regions.
- **PDF form authoring** — form fields placed over scanned or designed page layouts.
- **Nine-patch backgrounds** — cap insets and stretch regions on UI component art.

Today you do one of the following, and they all hurt:

- **Hand-tune magic offsets.** `.offset(y: height * 0.27)`, then build, run, screenshot, tweak, repeat. Every screen size and every future edit pays the cost again.
- **Write a one-off measurement script.** Cross-correlation, template matching, manual pixel spelunking in an image editor. Works once, rots the moment the art changes.
- **Ask an LLM to read coordinates from the image.** Vision-based coordinate regression drifts 5–30 px even in frontier models. Unusable for precise UI.

The underlying reason is that no standard format exists for saying "this rectangle on this PNG is named `spawn_player`, and here are its exact pixel bounds" in a way a toolchain can consume without guessing.

## The solution

An **anchorfile** is a small JSON sidecar committed alongside the asset:

```
assets/
├── level_01.png
└── level_01.anchors.json    ← the anchorfile
```

It looks like this:

```json
{
  "schema_version": 1,
  "source": "level_01.png",
  "intrinsic_size": [1920, 1080],
  "content_hash": "sha256:…",
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

Humans author it once through a frictionless local browser annotator. Machines (code generators, runtime loaders, LLM assistants) consume it deterministically. See [SPEC.md](./SPEC.md) for the full format.

## What ships in this repo

```
anchorfile/
├── SPEC.md               # The anchorfile JSON format (v1 schema)
├── docs/design.md        # Architecture and rationale
├── cli/                  # Planned: `anchor` CLI and web annotator
├── annotator/            # Planned: browser drawing UI (TypeScript canvas)
├── skill/                # Claude Skill for LLM consumers
└── examples/             # Worked examples
```

## Planned tooling

- **`anchor annotate <image>`** — opens a local browser UI to draw named regions on an image, writes `<image>.anchors.json` beside it.
- **`anchor render <sidecar>`** — burns all anchors onto a copy of the source image for visual verification. Framework-agnostic debug overlay.
- **`anchor verify <sidecar>`** — checks `content_hash` against the current image and warns on drift.
- **`anchor gen <sidecar> --lang swift`** — generates typed constants in your target language (Swift first, others via community).
- **Claude Skill** — teaches Claude Code to check for sidecars before placing UI on any image, and to request annotation when ground truth is missing.

See [docs/design.md](./docs/design.md) for the full architecture, roadmap, and scope locks.

## Why this exists

LLMs are increasingly the ones writing UI layout code, but they can't see pixels precisely. Rather than wait for vision models to catch up, this project treats the problem as a missing format: give LLMs (and humans) a place to *read* ground-truth spatial data instead of asking them to *guess* it. The format is designed so that `<asset>.anchors.json` is as natural a companion to `<asset>.png` as a `.d.ts` is to a `.js` file.

## License

MIT — see [LICENSE](./LICENSE).

## Contributing

The spec and design docs are the load-bearing artifacts right now. Issues and discussion about the format are more valuable than PRs to empty directories. When implementation starts, contribution guidelines will land here.
