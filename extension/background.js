// uiref background service worker
// Handles keyboard shortcut, context menu, and coordinates content script ↔ popup.

const PICKER_MESSAGE = { type: 'uiref:activate-picker' };

// Register context menu entry once on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'uiref-send-to-claude',
    title: 'Send to Claude (uiref)',
    contexts: ['all'],
  });
});

// Keyboard shortcut → activate picker in current tab
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'activate-picker') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, PICKER_MESSAGE).catch(() => {
    // Content script not injected (e.g. chrome:// page). Silent fail.
  });
});

// Context menu → same as shortcut
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'uiref-send-to-claude') return;
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, PICKER_MESSAGE).catch(() => {});
});

// Capture a screenshot of the visible tab and return it (content script requests this
// because chrome.tabs API is not exposed to content scripts).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'uiref:capture-tab') {
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true, dataUrl });
      }
    });
    return true; // keep message channel open for async response
  }

  // Popup is asking the active tab to open the picker
  if (msg?.type === 'uiref:popup-activate-picker') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, PICKER_MESSAGE).catch(() => {});
      }
    });
    sendResponse({ ok: true });
    return true;
  }
});
