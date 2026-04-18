// uiref background service worker
// Handles keyboard shortcut, context menu, and coordinates content script ↔ popup.

const PICKER_MESSAGE = { type: 'uiref:activate-picker', mode: 'single' };
const WORKFLOW_MESSAGE = { type: 'uiref:activate-picker', mode: 'workflow' };

// Register context menu entry once on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'uiref-send-to-claude',
    title: 'Send to Claude (uiref)',
    contexts: ['all'],
  });
  chrome.contextMenus.create({
    id: 'uiref-start-workflow',
    title: 'Start uiref workflow (chain clicks)',
    contexts: ['all'],
  });
});

// =========================================================================
// BADGE — shows status on the extension icon (tray)
// States:
//   idle      → no badge, default title
//   picking   → "•" badge, gray — single-element picker is active
//   workflow  → "N" badge, blue — workflow picker is active, N steps captured
//   paused    → "N" badge, purple — workflow is paused (overlay hidden), resumable
// =========================================================================

const BADGE = {
  idle:     { text: '',  bg: '#000000', title: 'uiref — point at UI, send to Claude' },
  picking:  { text: '•', bg: '#6c7bf0', title: 'uiref — picking (click an element)' },
  workflow: (n) => ({ text: String(n), bg: '#6c7bf0', title: `uiref — workflow (${n} step${n === 1 ? '' : 's'})` }),
  paused:   (n) => ({ text: String(n), bg: '#a78bfa', title: `uiref — workflow paused (${n} step${n === 1 ? '' : 's'}) — click to resume` }),
};

async function setBadge(state) {
  const tabId = await getActiveTabId();
  const opts = tabId ? { tabId } : {};
  await chrome.action.setBadgeText({ text: state.text, ...opts });
  await chrome.action.setBadgeBackgroundColor({ color: state.bg, ...opts });
  await chrome.action.setTitle({ title: state.title, ...opts });
}

async function getActiveTabId() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
  } catch {
    return undefined;
  }
}

// Keyboard shortcuts → activate picker in current tab
chrome.commands.onCommand.addListener(async (cmd) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const msg = cmd === 'activate-workflow' ? WORKFLOW_MESSAGE : PICKER_MESSAGE;
  chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
});

// Context menus
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'uiref-send-to-claude') {
    chrome.tabs.sendMessage(tab.id, PICKER_MESSAGE).catch(() => {});
  } else if (info.menuItemId === 'uiref-start-workflow') {
    chrome.tabs.sendMessage(tab.id, WORKFLOW_MESSAGE).catch(() => {});
  }
});

// Route messages from content scripts and popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Screenshot capture (content script can't call chrome.tabs directly)
  if (msg?.type === 'uiref:capture-tab') {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true, dataUrl });
      }
    });
    return true;
  }

  // Popup → background → content: activate picker
  if (msg?.type === 'uiref:popup-activate-picker') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) {
        const m = msg.mode === 'workflow' ? WORKFLOW_MESSAGE : PICKER_MESSAGE;
        chrome.tabs.sendMessage(tab.id, m).catch(() => {});
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  // Popup → background → content: workflow actions (send / cancel / resume)
  if (msg?.type === 'uiref:popup-workflow-action') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'uiref:workflow-action',
          action: msg.action,
          intent: msg.intent || null,
        }).catch(() => {});
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  // Content script → background: update the tray badge with current state
  if (msg?.type === 'uiref:set-state') {
    const { state, count } = msg;
    if (state === 'idle')     setBadge(BADGE.idle);
    else if (state === 'picking')  setBadge(BADGE.picking);
    else if (state === 'workflow') setBadge(BADGE.workflow(count || 0));
    else if (state === 'paused')   setBadge(BADGE.paused(count || 0));
    sendResponse({ ok: true });
    return false;
  }
});

// Clear badge when a tab is closed or navigates to a new origin — state is
// per-tab so a different tab shouldn't inherit.
chrome.tabs.onRemoved.addListener(() => {
  // nothing — tab-specific badges are cleaned up by chrome itself
});
chrome.tabs.onActivated.addListener(async () => {
  // When switching tabs, check that tab's stored workflow and reflect on badge.
  // (We read from chrome.storage.local via the content script on that tab;
  // for now we just reset badge per tab.)
});
