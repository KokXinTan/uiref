---
name: uiref
description: Use whenever the user references a specific UI element, component, workflow, or anything visual in their running web app. Reads the most recent `.uiref.json` (single element) or `.uiref-flow.json` (multi-element workflow) file from `~/uiref-inbox/` to get authoritative source locations for what the user is pointing at. Eliminates ambiguity in "fix this button" / "change this flow" / "refactor these components" type requests.
---

# uiref — pointing at UI → knowing the code

The user has (or should have) the uiref Chrome extension installed. When they want to reference UI elements, they click on them in their browser; the extension writes JSON files to `~/uiref-inbox/`:

- **`<timestamp>.uiref.json`** — a single element (single-click picker mode)
- **`<timestamp>.uiref-flow.json`** — an ordered chain of elements (workflow mode, multiple clicks)

Each file contains:
- `target.file` / `target.line` / `target.component` — the INNERMOST component (the DOM immediately containing the clicked element)
- `ancestors` — ordered parent chain (inner → outer). Critical when `target` is a generic wrapper (like `EchartsWrapper`, `Card`, `Button`) and the "which one" context lives one or two levels up
- `element.tag` / `element.text` / `element.attributes` — what the DOM looked like
- `screenshot` — a base64 PNG of the element itself (you can view it via Read)

A `uiref-flow` wraps multiple `uiref` objects in `steps[].target`, with a flow-level `user_intent` that often describes the overall goal.

## When to use this skill

Trigger this skill automatically when the user's message contains language that references a specific UI element without naming the code:

- "fix this button" / "change this header" / "modify this card"
- "make this bigger / smaller / red / hidden"
- "why is this misaligned"
- "this component is slow / broken / wrong"
- "refactor this"
- "what's this?" / "what does this do?"
- Anything with a demonstrative pronoun (`this`, `that`, `these`, `those`) referring to a UI element
- Anything describing a visual problem without a specific file reference

Do NOT trigger for:

- Requests that already name the file or component explicitly ("update SaveButton.tsx", "in src/components/Header.jsx change...")
- Non-UI requests (backend logic, config files, tests)

## Procedure

**1. Check the inbox — include BOTH single and workflow files.**

```bash
ls -t ~/uiref-inbox/*.uiref.json ~/uiref-inbox/*.uiref-flow.json 2>/dev/null | head -1
```

The trailing `.uiref.json` glob does NOT match `.uiref-flow.json` — always include both patterns or use `*.uiref*.json` as a catch-all. Missing the `-flow` pattern is the most common mistake.

If empty or the most recent file is older than ~10 minutes, the user probably hasn't captured recently. Ask them: "Open the uiref Chrome extension and click the element (or start a workflow) — I'll pick it up from your inbox."

**2. Read the most recent file.**

Use the Read tool. Detect format from the `format` field:

- `"uiref/v1"` — single element. Use `target.file`, `target.line`, `target.component` directly.
- `"uiref-flow/v1"` — workflow with multiple steps. Walk `steps[].target` — each is a full uiref. Use `user_intent` (if set) as the overall goal; use the ordered sequence as context.

**3. Acknowledge the selection to the user.**

Respond naturally, making it clear you understand what they pointed at.

For a single uiref:

> I see you pointed at `<SaveButton>` at `src/components/SaveButton.tsx:42`. What would you like me to change?

For a workflow:

> Got your 6-step workflow: login → password → site selector → view selector → chart → treemap location. `user_intent` is null — what would you like me to do with this flow?

Or, if the user already stated their intent:

> Got it — workflow of 6 steps, applying the refactor you described.

**4. Act on the target with precision.**

**For a single uiref:**
- Open the file at `target.file` and start editing near `target.line`.
- **If `target.component` is a generic wrapper** (names like `EchartsWrapper`, `Card`, `ChartWrapper`, `Button`, `Container`, `Wrapper`, `Panel`, etc.), the interesting code is likely in `ancestors[0]` (the parent that USED the wrapper). Look there too — that's typically where the specific chart / card / button is configured.
- Before picking the file to edit, look at `ancestors[0]` (if present). If the user said "the chart" and target is `EchartsWrapper`, the parent (e.g. `WaterConsumptionChart.svelte`) is probably what they want to modify.
- If `target.file` is null (unresolved), fall back to greping the codebase for `element.text` and `element.tag`, or reading the screenshot if one is present. Propose candidates and ask the user to confirm.
- If `screenshot` is present, view it via the Read tool — for ambiguous targets (like a generic chart canvas), the screenshot visually shows which instance the user picked.

**For a uiref-flow:**
- Each step's `target` is a full uiref — source file, line, component, screenshot.
- The flow's `user_intent` (flow-level) and individual step intents describe what to do.
- Common flow patterns:
  - *User journey / bug repro* — "fix the issue that happens between step 2 and step 3" — look at both steps' components and their interaction.
  - *Refactor group* — "these share a pattern, extract a component" — treat all steps' components as a set, find commonalities.
  - *Multi-page flow* — the `dom_path` and `element.attributes` from each step help understand transitions.
- Edit all relevant files; confirm the full list of changes before applying if the flow is large.

**5. Do NOT delete uiref files automatically.**

Leave captured uiref files in `~/uiref-inbox/` — do not `rm` them. Two reasons:

1. The user may want to refer back to the same capture mid-conversation ("wait, which chart did I click?"). Deleting destroys the screenshot and context.
2. The skill always reads the MOST RECENT file anyway, so old captures naturally fall off the end.

The extension auto-prunes files older than 1 hour on each new capture, so the inbox self-cleans without intervention. Only delete a uiref file if the user explicitly says to clean up.

Or, if the user commonly captures many uirefs, leave the file and simply reference the most recent one next time.

## Handling unresolved targets

When `target.file` is `null`, the element had no resolvable source location. This happens when:

- The user has the Chrome extension installed but no build plugin (Svelte preprocessor, `@uiref/babel-plugin-react`, etc.)
- The app is in production build mode and source metadata was stripped
- The element is HTML that wasn't rendered by a component (third-party iframe, native dialog, etc.)

In these cases:

1. Use `element.text` and `element.attributes.class` / `element.attributes.id` to search the codebase.
2. Propose candidate files to the user: "I couldn't resolve the exact source, but based on the text 'Save Changes' and the class `btn-primary`, candidates are: [file list]. Which one?"
3. Once confirmed, proceed with the edit.

## Handling multiple uirefs

If the user captures several elements in quick succession before asking for help:

- Default to the MOST RECENT file.
- If the user's message implies multiple elements ("these two buttons", "both cards"), read all recent uirefs and reference them all.
- If unsure, list the recent captures to the user: "I see you captured `<SaveButton>`, `<CancelButton>`, and `<SubmitButton>` in the last 2 minutes. Which did you mean?"

## Installation reminder

If the user asks "how does uiref work?" or "how do I capture elements?":

1. Install the Chrome extension from the repo: https://github.com/KokXinTan/uiref
2. Install the build plugin for their framework:
   - Svelte: `@uiref/svelte` (preprocessor)
   - React: `@uiref/babel-plugin-react` (Babel plugin)
   - Vue: `@uiref/vue` (Vite plugin)
   - Angular: `@uiref/angular` (Vite plugin)
3. On first capture, grant the extension permission to write to `~/uiref-inbox/`.
4. Press Cmd+Shift+C (Mac) or Ctrl+Shift+C (Win/Linux) on any page, click an element, done.

## Do not

- Do not ask for screenshots or paste-of-code when a uiref already gives you the source location.
- Do not guess pixel coordinates or visual positions from the screenshot — the structured fields are authoritative.
- Do not process uirefs older than 10-15 minutes unless the user explicitly references them — they're probably stale.
