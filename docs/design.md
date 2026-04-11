# Design & Rationale

This document captures the reasoning behind anchorfile's architecture, scope, and roadmap. It's meant to be honest about tradeoffs — what we're building, what we're deliberately not building, and why.

## The problem we're solving

Placing UI elements, tap targets, hitboxes, or overlays at precise coordinates on a fixed image asset is a surprisingly painful class of problem. It affects:

- **Game level maps and sprite scenes** — collision regions, spawn points, interactive hotspots, trigger zones on static art.
- **Illustrated app backgrounds** — painted or photographed backdrops with tap targets layered on top.
- **HTML image maps** — the 90s solution to this exact problem, still used, still badly tooled.
- **PDF form authoring** — placing fields over a scanned or designed page layout.
- **UI backgrounds and nine-patch images** — cap insets, safe zones, stretch regions.

The status quo for all of these is one of three unhappy paths:

1. **Hand-tune magic offsets in code.** Iterate: edit, build, run, screenshot, squint, adjust. Every screen size, every future edit, every asset swap pays the cost again.
2. **Write a one-off measurement script.** Template matching or manual image-editor inspection. Works once. Rots the moment the art changes.
3. **Ask an LLM with vision to read coordinates.** Frontier vision-language models drift 5–30 pixels on coordinate regression tasks, which destroys any UI that needs to align to visible edges.

Each failure mode has a different root cause. Let's name them.

## Why this is hard (four root causes)

**1. Vision-model coordinate regression is genuinely weak.** LLMs with vision are trained primarily on "what" tasks (classification, description) and secondarily on "where" tasks (detection, grounding). Even frontier models return bounding boxes with drift that's unusable for pixel-level UI. This is unlikely to be fully fixed soon, and even if it is, problems 2–4 remain.

**2. Coordinate-space chains compound error.** A typical SwiftUI overlay has to reason about: intrinsic image size → aspect-fit letterbox inside a GeometryReader → view-space point coordinates → device safe-area insets. That's four transforms, no verification at any step. Even if every individual step is "close", the end result drifts.

**3. There's no feedback loop.** When an LLM writes `.offset(y: geo.size.height * 0.27)`, it has no cheap way to see the result. The round-trip is "build, run simulator, screenshot, describe back" — 30+ seconds per iteration, with every iteration a coin flip. Humans tuning offsets by hand face the same loop, just slightly faster.

**4. There's no semantic ground truth.** "The boss arena trigger zone" or "the door hitbox" means something specific to the human who drew the art. To anyone else (human or AI), it's ambiguous — where exactly is the boundary? Where does one region end and the next begin? Without an authored answer, every consumer has to guess.

Problems 2, 3, and 4 are tooling problems. Tooling problems are fixable. That's the wedge.

## Design principles

**Human authors ground truth once; machines consume it deterministically.** The human is the only entity that actually knows what "the trigger zone boundary" means. The right move is to let them mark it once in a frictionless UI and then give every downstream consumer a deterministic file to read. No guessing, no vision inference, no iteration cycles.

**The format is the product; tools wrap it.** Naming the project after the file format (like `Dockerfile`, `Makefile`, `Brewfile`) is deliberate. The format should outlive any particular tool. In five years someone can write a better annotator and it will still read and write anchor files.

**Commit ground truth to version control.** Anchorfiles live beside assets in git. They diff cleanly, they travel with the art, they get reviewed alongside code changes. No external SaaS, no cloud database, no auth flow to lose access to.

**Don't tie value to any single LLM.** The tool must be useful to a hand-coder with no AI assistant. LLM integration is additive, not the core value proposition.

**Fail loudly on asset drift.** When art changes, anchors silently become wrong. The `content_hash` field and `anchor verify` command exist specifically to make drift detectable in CI.

## Architecture

Three peer interfaces sit on a common core:

```
           ┌──────────────────────────────────┐
           │   anchorfile format (SPEC.md)    │
           │   • schema + sidecar JSON        │
           │   • runtime helper libraries     │
           │   • codegen templates            │
           └─────────────┬────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
     ┌────▼────┐    ┌────▼────┐   ┌────▼────┐
     │   CLI   │    │ Browser │   │  Claude │
     │ `anchor`│    │ annotate│   │  Skill  │
     │         │    │   UI    │   │         │
     └─────────┘    └─────────┘   └─────────┘
      humans          humans        LLM agents
     (scripts,        (drawing,    (look up and
      CI, gen)        editing)      use anchors)
```

**The core** is the JSON format plus per-language runtime helpers (load a sidecar, hand back typed regions) and codegen templates (emit static constants for compiled languages).

**The CLI** (`anchor`) is the primary human interface. Commands like `anchor annotate`, `anchor render`, `anchor verify`, `anchor gen`. It's usable without any LLM, and it's what indie developers, game devs, and hand-coders will reach for first.

**The browser annotator** is the drawing surface. Spawned by `anchor annotate <image>`, it runs at `localhost:<random-port>` with a single-use auth token, exits when saved. The annotator is deliberately minimal — draw, name, save. It is not a Figma clone. Feature creep toward layers, text, filters, and export modes will be refused.

**The Claude Skill** is the primary LLM interface. A tiny `SKILL.md` teaches Claude Code to check for a sidecar before placing UI on any image, to request annotation when ground truth is missing, and to use the exact coordinates from the sidecar rather than guessing. The Skill is a peer to the CLI, not glue — it's the way the tool gets used inside agent workflows, and if it's bad the LLM-user segment gets nothing.

## Why not an MCP server

An earlier version of this design included an optional MCP server that would return rendered preview PNGs directly to Claude as tool content. On reflection, it's unnecessary:

- `anchor render <sidecar>` produces a debug PNG with all anchors overlaid.
- Claude Code's `Read` tool handles PNG images natively and shows them to the model.
- `anchor render` followed by `Read` gives the LLM full visual feedback, at the cost of one extra tool call per verification.

That's not a meaningful capability delta over an MCP server, and the MCP path adds complexity (long-running process, client-specific support, protocol surface area) for nothing. **MCP is explicitly off the roadmap.**

## Format choice: JSON, not YAML or embedded metadata

We considered several format options:

- **YAML** — more readable when hand-scanned, but the file is primarily machine-written and the readability win is small once every anchor has a `label` field. YAML's parser edge cases (booleans, numerics, anchors) are a liability when the target is strict deterministic consumption across many languages.
- **TOML** — fine for config but awkward for deeply nested shape data.
- **Embedded in PNG chunks or EXIF** — bad for git review (binary diffs), easy for image pipelines to strip, couples the anchor data to a specific file format.
- **JSON5** — JSON with comments and trailing commas. Nicer for hand editing, but it complicates the reader story (every consumer needs a JSON5 parser, not just JSON).

We chose **strict JSON** because:

1. The annotator is the writer; humans rarely edit by hand.
2. Every major language has a native JSON parser — zero dependency cost for consumers.
3. JSON Schema tooling is mature, letting us ship a schema validator for editors.
4. Descriptions live in `label` *fields*, not in comments — which is more portable and survives round-tripping through any JSON tool.

JSON5 remains a possible future option if hand-editing becomes a dominant workflow; the schema is unchanged, only the outer syntax.

## Roadmap

The roadmap is deliberately phased so that each phase produces something useful on its own. Later phases can be reprioritized or cut based on real-world use.

### Phase 0 — Dog-food on a real codebase

Before building any tooling, hand-produce one anchorfile for a real asset in a real project using the format defined in this repo. Hand-write the consumer helper that reads it. Wire it in and confirm the UX feels right. **If the format is wrong, we learn here in a few hours rather than after a week of building an annotator around the wrong idea.**

### Phase 1 — v0 CLI + annotator (2 days, hard scope)

- `anchor annotate <image>` — launches the web annotator
- `anchor render <sidecar>` — burns anchors onto a debug PNG
- `anchor verify <sidecar>` — checks `content_hash`
- Annotator supports **rect + point + ellipse** primitives only
- Pan, zoom, select, arrow-key nudge, rename, save, import-existing-sidecar on open
- JSON sidecar with strict schema validation
- Swift codegen (static `let` constants + fit-transform helper)
- Minimal Claude Skill

Explicit cuts: polygons, polylines, 9-slice, Sobel snap, template replication, keyboard-only mode, TypeScript codegen, PDF, SVG, Figma import, preview MCP.

### Phase 2 — Ergonomics pass

After v0 works, use it to annotate a real asset set end to end. Every moment of friction becomes a Phase 2 task. Likely wins:

- **Sobel snap-to-edge** — aligns drawn regions to high-contrast edges in the underlying image. Single biggest ergonomic multiplier. ~50 lines of code.
- **Template replication** — draw one anchor, stamp it at N other locations.
- **Duplicate-and-tweak** — select existing anchor, duplicate, drag to new location.
- **Multi-select + batch nudge.**
- **Keyboard-only mode** for power users.

No speculative polish. Only things that hurt during real use.

### Phase 3 — More primitives

- `polygon` — for truly irregular regions.
- `polyline` — for open paths (trajectories, guide lines).
- `nine_slice` — cap insets for nine-patch backgrounds. Critical for UI component work.
- `rounded_rect` — rectangles with corner radius.

### Phase 4 — Codegen story

Replace the single-language codegen with a template-based system that makes adding languages easy. Targets:

- TypeScript (native and React helpers)
- Kotlin / Jetpack Compose
- Dart / Flutter
- CSS `clip-path` values
- Python dataclasses

Community PRs land here. Core maintainer commits to Swift + TypeScript + "generic JSON loader docs".

### Phase 5 — Figma import

For design-led teams, read Figma frames via the public API and emit anchorfiles. Turns the tool from "new annotator" into "the bridge between Figma's spatial data and code".

### Phase 6 — Probably never

- Video / temporal anchors (different problem)
- 3D meshes (different problem)
- A hosted SaaS (the tool is local-first by design)
- An MCP server (see above)

## Known risks

**1. Annotator ergonomics is the whole product.** If the first use of `anchor annotate` doesn't feel useful within 60 seconds, adoption dies. The real competitor is "8 minutes of hand-tuning offsets", and the bar for replacing that is high. Phase 2 exists entirely to close the ergonomics gap, and Phase 0 exists to validate the format before the annotator is built.

**2. Asset drift.** PNGs get re-exported, re-cropped, re-scaled. Every such change silently invalidates every anchor's pixel coordinates. Mitigated by `content_hash` + `anchor verify`, but the user still has to notice the warning and re-annotate.

**3. Retina / 1x/2x/3x asset catalogs.** iOS Asset Catalogs hold multiple resolutions of the same image. The annotator must commit to one (the highest-resolution slice) and normalize everything to that space. The Swift runtime helper handles the scaling at consume time.

**4. Claude Skill compliance drift.** Skills are the right tool for teaching LLMs "when X, do Y", but LLMs still drift. If this becomes a problem, a settings-level pre-tool hook can enforce "don't write `.offset` or `.position` near an image reference without consulting a sidecar first". Not shipping in v1 — waiting to see if it's actually needed.

**5. The existential case.** If vision models become pixel-accurate, one of the four root causes disappears. The other three (coordinate-space transforms, feedback loop, semantic ground truth) remain. The format still has value as a commit-to-git record of spatial decisions, and the annotator still serves humans. The value proposition shifts from "workaround for bad vision" to "canonical ground truth", but the tool survives.

**6. Scope creep.** Every user will want one more feature. The scope locks above exist specifically to say no aggressively. The tool is for naming regions on images. It is not a design tool, not a prototyping tool, not a layout engine, not a game editor. Say no.

## Scope locks (explicitly not building)

- Text rendering, font handling, rich labels
- Layers, groups, z-ordering
- Image filters or adjustments
- Color pickers or palettes
- Export to PNG/SVG of drawn content
- Animation timelines
- Video or temporal data
- 3D geometry
- Cloud storage, user accounts, hosted SaaS
- MCP server (see above)
- CRDT / multi-user collaborative editing

If any of these turn out to be wrong exclusions based on real demand, we can revisit — but the default answer is no.
