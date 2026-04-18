# Privacy

uiref is designed to be **local-only**. No data is sent to any server, including ours, by default.

## What data uiref handles

The Chrome extension captures:

| Data | Source | Stored where | Shared with |
|---|---|---|---|
| Element screenshot (PNG) | The element you click on | Local: inside the uiref JSON in your inbox folder | Nothing — stays on your machine |
| DOM text content | The element's `textContent` | Local: inside the uiref JSON | Nothing |
| DOM attributes (class, id, data-*, etc.) | The element's attribute list | Local: inside the uiref JSON | Nothing |
| Source file path + line + component name | Injected at build time by the build plugin | Local: inside the uiref JSON | Nothing |
| DOM path (CSS selector) | Walked from the clicked element | Local: inside the uiref JSON | Nothing |

The JSON file is written to a folder **you pick** on first use (default `~/uiref-inbox/`). It stays there until you delete it or the extension auto-prunes (files older than 1 hour are deleted on each new capture).

## What uiref does NOT do

- **No network requests.** The extension does not `fetch()` or `XMLHttpRequest` anywhere. You can verify this by reading `extension/content.js` and `extension/background.js` — there is no server URL anywhere in the codebase.
- **No telemetry.** No analytics, no crash reporting, no usage tracking.
- **No accounts.** You don't sign up, you don't log in, there's nothing to be logged in to.
- **No cloud storage.** The uiref JSONs are local files written via Chrome's File System Access API. They never leave your machine unless *you* explicitly upload them somewhere (e.g., by pasting one into a chat).

## What Claude Code sees

When you ask Claude Code to act on a uiref, Claude reads the JSON file from your local inbox. The contents of that JSON (including screenshots and DOM data) are part of your conversation with Claude and follow Anthropic's privacy policy for Claude — **not** uiref's. uiref is not involved in any transmission to Anthropic's servers; that's between you and Claude Code.

If you're annotating proprietary UI, be mindful that sending a uiref to Claude means sending those screenshots and DOM contents to Anthropic as part of your conversation. This is identical to pasting a screenshot directly into Claude Code — uiref doesn't change the trust model, it just structures the data better.

## Permissions the Chrome extension requests

| Permission | Why |
|---|---|
| `activeTab` | Read the DOM of the current tab when you activate the picker. |
| `scripting` | Inject the picker overlay into the active tab. |
| `storage` | Persist your inbox folder choice and workflow state locally (`chrome.storage.local`). |
| `contextMenus` | Add the right-click "Send to Claude" menu item. |
| `<all_urls>` host permission | Allow the picker to work on any website you choose (localhost, internal dev servers, staging, etc.). |

The `<all_urls>` permission looks scary but is necessary because the extension has to work on whatever URL your dev server runs at (could be `localhost:3000`, `localhost:5173`, `example.local`, internal staging URLs, etc.). The extension only reads DOM data and only when you explicitly activate the picker — no passive monitoring.

## Where the code is

Everything is open source and MIT-licensed. You can audit:

- Extension: [`extension/`](../extension/)
- Build plugins: [`plugins/`](../plugins/)
- Setup CLI: [`cli/`](../cli/)
- Claude Skill: [`skill/`](../skill/)

If you find any code that violates this privacy stance (e.g., a hidden fetch, telemetry, tracking), please file a GitHub issue — that's a bug.

## Changes to this policy

If the project ever adds a cloud/hosted component (which isn't planned), this document will be updated before that change ships. Watch the repo for commits to `PRIVACY.md`.
