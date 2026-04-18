// uiref popup script

const IDB_NAME = 'uiref';
const IDB_STORE = 'handles';

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStoredHandle() {
  try {
    const db = await openIDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get('inbox');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function updateStatus() {
  const handle = await getStoredHandle();
  const el = document.getElementById('inbox-status');
  if (!handle) {
    el.textContent = 'not set';
    el.className = 'row-value warn';
  } else {
    el.textContent = handle.name || 'set';
    el.className = 'row-value ok';
  }
}

document.getElementById('btn-activate').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'uiref:popup-activate-picker', mode: 'single' });
  window.close();
});

document.getElementById('btn-activate-workflow').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'uiref:popup-activate-picker', mode: 'workflow' });
  window.close();
});

document.getElementById('btn-setup').addEventListener('click', async () => {
  // The directory picker must be called from the content script context because it
  // needs a gesture in a real page. Opening the picker from the popup works in recent
  // Chrome, so try it first; fall back to a tip.
  try {
    if (typeof window.showDirectoryPicker !== 'function') {
      throw new Error('showDirectoryPicker not available — use the picker on any webpage first');
    }
    const dir = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents', id: 'uiref-inbox' });
    const db = await openIDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(dir, 'inbox');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    updateStatus();
  } catch (err) {
    alert('Could not set inbox: ' + err.message);
  }
});

// Detect platform for shortcut display
const isMac = /Mac/.test(navigator.userAgent);
document.getElementById('shortcut').textContent = isMac ? '⌘⇧C' : 'Ctrl+Shift+C';

updateStatus();
