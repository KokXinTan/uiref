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
        const m = msg.mode === 'workflow' ? WORKFLOW_MESSAGE : PICKER_MESSAGE;
        chrome.tabs.sendMessage(tab.id, m).catch(() => {});
      }
    });
    sendResponse({ ok: true });
    return true;
  }
});
