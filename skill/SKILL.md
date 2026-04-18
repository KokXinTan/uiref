---
name: uiref
description: Use whenever the user references a specific UI element, component, button, view, section, or anything visual in their running web app. Reads the most recent `.uiref.json` file from `~/.claude/uiref-inbox/` to get the authoritative source file, line, and component name the user is pointing at. Eliminates ambiguity in "fix this button" / "change this header" / "modify that card" type requests.
---

# uiref — pointing at UI → knowing the code

The user has (or should have) the uiref Chrome extension installed. When they want to reference a UI element, they click on it in their browser; the extension writes a JSON file to `~/.claude/uiref-inbox/<timestamp>.uiref.json` containing:

- `target.file` — the exact source file (relative to project root)
- `target.line` — the line number where the component is defined
- `target.component` — the component's display name
- `element.tag` / `element.text` / `element.attributes` — what the DOM looked like
- `screenshot` — a base64 PNG of the element itself (you can view it via Read)

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

**1. Check the inbox.**

```bash
ls -t ~/.claude/uiref-inbox/*.uiref.json 2>/dev/null | head -1
```

If empty or the most recent file is older than ~10 minutes, the user probably hasn't captured a uiref recently. Ask them: "Open the uiref Chrome extension and click the element you're referring to — I'll pick it up from your inbox."

**2. Read the most recent uiref.**

Use the Read tool on the file. The JSON contains `target.file`, `target.line`, `target.component`.

**3. Acknowledge the selection to the user.**

Respond naturally, making it clear you understand which element they pointed at:

> I see you pointed at `<SaveButton>` at `src/components/SaveButton.tsx:42`. What would you like me to change?

Or, if the user already stated their intent:

> Got it — `<SaveButton>` at `src/components/SaveButton.tsx:42`. Applying the danger variant now.

**4. Act on the target with precision.**

- Open the file at `target.file` and start editing near `target.line`.
- If `target.file` is null (unresolved), fall back to greping the codebase for `element.text` and `element.tag`. Propose candidate files and ask the user to confirm.
- If `screenshot` is present, you may view it using the Read tool to understand the visual context.

**5. After making the change, optionally clean up.**

Delete the processed uiref file so it doesn't linger:

```bash
rm ~/.claude/uiref-inbox/<the-file-you-used>.uiref.json
```

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
3. On first capture, grant the extension permission to write to `~/.claude/uiref-inbox/`.
4. Press Cmd+Shift+C (Mac) or Ctrl+Shift+C (Win/Linux) on any page, click an element, done.

## Do not

- Do not ask for screenshots or paste-of-code when a uiref already gives you the source location.
- Do not guess pixel coordinates or visual positions from the screenshot — the structured fields are authoritative.
- Do not process uirefs older than 10-15 minutes unless the user explicitly references them — they're probably stale.
