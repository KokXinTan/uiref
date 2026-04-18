# Chrome Web Store submission checklist

The uiref extension currently installs via "Load unpacked" in developer mode. To make installation one-click for end users, we submit it to the Chrome Web Store. This doc walks through what's required.

## Developer account (one-time, $5)

1. Go to [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole/)
2. Sign in with a Google account — ideally a dedicated one for this project rather than personal
3. Pay the one-time $5 developer registration fee (one-time per Google account, covers unlimited extensions)
4. Verify your email if prompted

## Prepare the extension

The extension at `/extension/` is largely ready. Verify:

- [ ] `manifest.json` has a clear `name`, `description`, `version`, `author`, and `homepage_url`
- [ ] Icons exist for 16x16, 32x32, 48x48, and 128x128 (they do, at `extension/icons/`)
- [ ] `permissions` and `host_permissions` are the minimum needed (review below)
- [ ] No `<script>` tags loading remote code (Chrome MV3 forbids this; we use bundled JS only)
- [ ] No `eval()` or similar dynamic code execution

### Permission justifications (Chrome reviewers will ask)

Be prepared to explain each permission in the reviewer dialog:

| Permission | Justification |
|---|---|
| `activeTab` | Read DOM of the active tab when the user activates the picker, to resolve the clicked element to its source location. |
| `scripting` | Inject the element picker overlay into the active tab on user action. |
| `storage` | Persist the user's inbox folder selection and workflow state locally using `chrome.storage.local`. |
| `contextMenus` | Add right-click "Send to Claude" menu items so the picker is discoverable without a keyboard shortcut. |
| `<all_urls>` (host_permissions) | The picker needs to work on any localhost, staging, or production URL where the user runs their dev server. Limiting to specific domains would prevent the extension from serving its core use case. No passive monitoring — the extension is only active when the user explicitly triggers it. |

Reviewers may ask to narrow `<all_urls>`. If rejected, consider limiting to `http://localhost/*` and `http://127.0.0.1/*` in a v2 submission.

## Package the extension

From the repo root:

```bash
cd /Users/kxt/work/uiref/extension
zip -r ../uiref-extension-v0.1.0.zip . -x "*.DS_Store"
```

Verify the zip:

```bash
unzip -l ../uiref-extension-v0.1.0.zip
```

You should see `manifest.json`, `background.js`, `content.js`, `popup.html`, `popup.js`, `picker.css`, and all icons.

## Store listing assets

The Chrome Web Store listing requires:

### Required

- [ ] **Short description** (132 chars max): "Point at any UI element in your app, send a precise reference with source file and line to Claude Code."
- [ ] **Detailed description** (up to 16,000 chars): write a longer version focused on the problem, solution, and example workflow. Use the README as a starting point.
- [ ] **Category**: "Developer Tools"
- [ ] **Language**: English
- [ ] **Icon (128x128)**: already created at `extension/icons/icon-128.png`
- [ ] **At least one screenshot** (1280x800 or 640x400, PNG or JPEG)
- [ ] **Privacy policy URL**: host `PRIVACY.md` somewhere public (e.g., as a GitHub Pages site) and link to it

### Recommended

- [ ] **Website URL**: `https://github.com/KokXinTan/uiref`
- [ ] **Support URL**: the issues page: `https://github.com/KokXinTan/uiref/issues`
- [ ] **Promo tile (440x280)** — shown in featured lists, nice to have

### Screenshots to capture

Take these in a real app ([project] is a good candidate):

1. **Picker active**: hover state showing the component name and source file floating over a button
2. **Toast after capture**: the "✓ SaveButton → Claude" toast
3. **Claude Code side**: a Claude session where it reads the uiref and acknowledges "I see you pointed at..."
4. **Workflow mode**: multi-step workflow with the counter showing "3 steps captured"
5. **Popup**: the extension popup with the two main buttons

## Privacy practices questionnaire

Chrome requires disclosure of data handling. For uiref, answer:

| Question | Answer |
|---|---|
| Does your extension collect or use user data? | **Yes** — we process the DOM of pages the user actively picks on, and take element screenshots |
| Is the data shared with third parties? | **No** |
| Is the data encrypted in transit? | N/A — no data transmission |
| Is the data used for any other purpose? | **No** |
| Do you have a privacy policy? | **Yes** — link to your hosted PRIVACY.md |

Be honest and specific. Chrome reviewers take this seriously and vague answers delay approval.

## Submit for review

1. Click **New Item** in the dev console
2. Upload the zip
3. Fill in the listing assets
4. Fill in the privacy questionnaire
5. Click **Submit for review**

## Review timeline

- **Typical:** 1–3 business days
- **Can be longer** if reviewers have questions — they'll email you. Respond promptly.
- **Longest observed:** up to 2 weeks for complex permissions or ambiguous privacy answers

You can track status in the dev console.

## Common rejection reasons

- **Permission overreach without justification.** Reviewers want specific reasons for each permission.
- **Privacy policy missing or inaccessible.** Host `PRIVACY.md` on a stable URL.
- **Remote code execution.** MV3 forbids loading external scripts. We don't do this.
- **Misleading description.** Don't claim features the extension doesn't have.
- **"Spam" categorization.** Don't keyword-stuff the description.

Our extension should pass all of these easily — it's a single-purpose developer tool with clear permissions and no data sharing.

## After approval

- Extension appears at a Chrome Web Store URL (e.g., `chrome.google.com/webstore/detail/uiref/abc123`)
- Users can install in one click
- Update the main README to replace the "Load unpacked" instructions with the store URL
- Bump the version in `manifest.json` whenever you push updates and re-submit (small updates usually review in hours, not days)

## Publishing updates

When you change the extension:

1. Bump `version` in `manifest.json` (e.g., `0.1.0` → `0.1.1`)
2. Repackage: `cd extension && zip -r ../uiref-extension-v0.1.1.zip .`
3. In the dev console, click your existing listing → **Package** tab → **Upload new package**
4. Upload the new zip
5. Submit (no need to re-enter all the listing info)

Updates go live for existing users automatically once approved.
