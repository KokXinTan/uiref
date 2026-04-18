// uiref popup script — renders dynamic controls based on current workflow state

const IDB_NAME = 'uiref';
const IDB_STORE = 'handles';
const WF_KEY = 'uiref-active-workflow';

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

async function getWorkflow() {
  try {
    const obj = await chrome.storage.local.get(WF_KEY);
    return obj?.[WF_KEY] || null;
  } catch {
    return null;
  }
}

async function updateInboxStatus() {
  const el = document.getElementById('inbox-status');
  if (!el) return; // popup.html might be a different version while extension reloads
  const handle = await getStoredHandle();
  if (!handle) {
    el.textContent = 'not set';
    el.className = 'row-value warn';
  } else {
    el.textContent = handle.name || 'set';
    el.className = 'row-value ok';
  }
}

// Send a workflow action via the background worker to the active tab.
async function workflowAction(action, intent = null) {
  await chrome.runtime.sendMessage({ type: 'uiref:popup-workflow-action', action, intent });
  window.close();
}

async function startPicker(mode) {
  await chrome.runtime.sendMessage({ type: 'uiref:popup-activate-picker', mode });
  window.close();
}

// Render the controls area based on whether a workflow is active/paused/absent.
async function render() {
  const controls = document.getElementById('controls');
  if (!controls) return; // different popup.html version
  controls.innerHTML = '';

  const workflow = await getWorkflow();
  const hasWorkflow = !!(workflow && workflow.steps && workflow.steps.length > 0);
  const stepCount = hasWorkflow ? workflow.steps.length : 0;

  if (hasWorkflow) {
    // Workflow exists — show status card and Send/Resume/Cancel actions.
    const card = document.createElement('div');
    card.className = 'status-card active';
    const title = document.createElement('div');
    title.className = 'status-card-title active';
    title.textContent = `${stepCount} step${stepCount === 1 ? '' : 's'} captured`;
    const detail = document.createElement('div');
    detail.className = 'status-card-detail';
    detail.textContent = 'Click elements on the page to add more. Send when ready, or hide the picker and resume later.';
    card.appendChild(title);
    card.appendChild(detail);
    controls.appendChild(card);

    // Optional intent input — seamless annotation before sending.
    // Empty = send as before; typed = attached as user_intent in the flow.
    const intentWrap = document.createElement('div');
    intentWrap.style.marginBottom = '8px';
    const intentLabel = document.createElement('div');
    intentLabel.textContent = 'What to do with this? (optional)';
    intentLabel.style.cssText = 'font-size:10px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:#7a7a8e;margin:4px 0 4px;';
    const intentInput = document.createElement('input');
    intentInput.type = 'text';
    intentInput.placeholder = 'e.g. "refactor these into one component"';
    intentInput.style.cssText = 'width:100%;background:#1a1a24;border:1px solid #2e2e3e;color:#d4d4dc;padding:7px 10px;border-radius:5px;font-size:12px;font-family:inherit;';
    intentInput.addEventListener('focus', () => { intentInput.style.borderColor = '#6c7bf0'; });
    intentInput.addEventListener('blur', () => { intentInput.style.borderColor = '#2e2e3e'; });
    intentWrap.appendChild(intentLabel);
    intentWrap.appendChild(intentInput);
    controls.appendChild(intentWrap);

    // Primary: Send to Claude — reads intent from the input if provided
    const sendBtn = document.createElement('button');
    sendBtn.className = 'btn';
    sendBtn.textContent = `Send ${stepCount} step${stepCount === 1 ? '' : 's'} to Claude`;
    sendBtn.addEventListener('click', () => {
      const intent = intentInput.value.trim() || null;
      workflowAction('send', intent);
    });
    // Enter inside the intent input also sends
    intentInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const intent = intentInput.value.trim() || null;
        workflowAction('send', intent);
      }
    });
    controls.appendChild(sendBtn);

    // Row: Resume / Hide
    const row = document.createElement('div');
    row.className = 'btn-row';
    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'btn btn-workflow';
    resumeBtn.textContent = 'Resume picking';
    resumeBtn.addEventListener('click', () => workflowAction('resume'));
    row.appendChild(resumeBtn);

    const hideBtn = document.createElement('button');
    hideBtn.className = 'btn btn-secondary';
    hideBtn.textContent = 'Hide picker';
    hideBtn.addEventListener('click', () => workflowAction('hide'));
    row.appendChild(hideBtn);
    controls.appendChild(row);

    // Undo last step
    const undoBtn = document.createElement('button');
    undoBtn.className = 'btn btn-secondary';
    undoBtn.style.marginTop = '6px';
    const lastStep = workflow.steps[workflow.steps.length - 1];
    const lastName = lastStep?.target?.component || lastStep?.element?.tag || 'last';
    undoBtn.textContent = `↶ Remove last step (${lastName})`;
    undoBtn.addEventListener('click', () => workflowAction('undo'));
    controls.appendChild(undoBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Cancel workflow';
    cancelBtn.style.marginTop = '6px';
    cancelBtn.addEventListener('click', () => {
      if (confirm(`Discard ${stepCount} captured step${stepCount === 1 ? '' : 's'}?`)) {
        workflowAction('cancel');
      }
    });
    controls.appendChild(cancelBtn);
  } else {
    // Idle — show the two primary action buttons
    const single = document.createElement('button');
    single.className = 'btn';
    single.textContent = 'Pick one element';
    single.addEventListener('click', () => startPicker('single'));
    controls.appendChild(single);

    // Rename local to avoid shadowing the outer `workflow` variable above
    const workflowBtn = document.createElement('button');
    workflowBtn.className = 'btn btn-workflow';
    workflowBtn.textContent = 'Pick multiple (workflow)';
    workflowBtn.addEventListener('click', () => startPicker('workflow'));
    controls.appendChild(workflowBtn);

    const setup = document.createElement('button');
    setup.className = 'btn btn-secondary';
    setup.textContent = 'Change inbox folder';
    setup.addEventListener('click', async () => {
      try {
        if (typeof window.showDirectoryPicker !== 'function') {
          throw new Error('showDirectoryPicker not available');
        }
        const dir = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents', id: 'uiref-inbox' });
        const db = await openIDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(dir, 'inbox');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        updateInboxStatus();
      } catch (err) {
        alert('Could not set inbox: ' + err.message);
      }
    });
    controls.appendChild(setup);
  }
}

// Detect platform for shortcut display
const shortcutEl = document.getElementById('shortcut');
if (shortcutEl) {
  shortcutEl.textContent = /Mac/.test(navigator.userAgent) ? '⌘⇧C' : 'Ctrl+Shift+C';
}

render().catch((err) => console.error('[uiref popup] render failed', err));
updateInboxStatus().catch((err) => console.error('[uiref popup] inbox status failed', err));
