// uiref content script
// Runs in every page. Provides the picker UI, element resolution, and uiref JSON assembly.

(() => {
  'use strict';
  if (window.__uirefInjected) return;
  window.__uirefInjected = true;

  // =============================================================
  // STATE
  // =============================================================
  let active = false;
  let mode = 'single'; // 'single' | 'workflow'
  let hoverEl = null;
  let workflow = null; // { id, steps: [uiref, uiref, ...], startedAt: string }
  let root, highlight, label, hint, toast, counter, pausedBadge;
  let inboxHandle = null; // FileSystemDirectoryHandle, persisted across sessions in IndexedDB

  // =============================================================
  // CROSS-PAGE WORKFLOW PERSISTENCE
  // =============================================================
  // Workflow state persists in chrome.storage.local so users can capture on
  // one page, navigate (log in, change route, reload), then resume.
  const WF_KEY = 'uiref-active-workflow';

  async function saveWorkflow() {
    if (!workflow) {
      await chrome.storage.local.remove(WF_KEY);
      return;
    }
    await chrome.storage.local.set({ [WF_KEY]: workflow });
  }

  async function loadStoredWorkflow() {
    try {
      const obj = await chrome.storage.local.get(WF_KEY);
      return obj?.[WF_KEY] || null;
    } catch {
      return null;
    }
  }

  async function clearStoredWorkflow() {
    await chrome.storage.local.remove(WF_KEY);
  }

  // =============================================================
  // DOM ROOT
  // =============================================================
  function ensureRoot() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'uiref-root';
    highlight = document.createElement('div');
    highlight.id = 'uiref-highlight';
    label = document.createElement('div');
    label.id = 'uiref-label';
    // Note: hint bar, counter pill, and paused badge used to render on the page.
    // They are now 100% replaced by the tray badge + extension popup, so the
    // page stays clean. Only the hover highlight, floating label, and the
    // capture toast ever appear on the page.
    hint = document.createElement('div');      // unused — kept for code compat
    counter = document.createElement('div');   // unused
    pausedBadge = document.createElement('button'); // unused
    toast = document.createElement('div');
    toast.id = 'uiref-toast';
    root.appendChild(highlight);
    root.appendChild(label);
    root.appendChild(toast);
    document.documentElement.appendChild(root);
  }

  // =============================================================
  // PICKER ACTIVATION
  // =============================================================
  async function activatePicker(newMode = 'single') {
    ensureRoot();
    mode = newMode;
    if (mode === 'workflow') {
      // Resume existing workflow if one is in progress, otherwise start new
      if (!workflow) {
        const stored = await loadStoredWorkflow();
        workflow = stored || {
          id: 'wf-' + Date.now().toString(36),
          steps: [],
          startedAt: new Date().toISOString(),
        };
        await saveWorkflow();
      }
    }
    if (active) {
      updateHint();
      updateCounter();
      syncState();
      return;
    }
    active = true;
    root.classList.add('active');
    root.classList.toggle('workflow-mode', mode === 'workflow');
    // Scroll and hover must pass through to the page, so root stays
    // pointer-events: none (set in CSS). Clicks are intercepted via the
    // document-level capture listener, which lets us preventDefault in
    // single mode or let them flow through in workflow mode.
    // Crosshair indicator only in single mode — workflow users may want
    // to type/interact normally.
    if (mode === 'single') {
      document.documentElement.classList.add('uiref-picking-single');
    } else {
      document.documentElement.classList.remove('uiref-picking-single');
    }
    pausedBadge.style.display = 'none';
    updateHint();
    updateCounter();
    syncState();
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('scroll', positionHighlight, true);
    window.addEventListener('resize', positionHighlight, true);
  }

  // Tell the background script what state to reflect on the tray badge.
  function syncState() {
    const state =
      active && mode === 'workflow' ? 'workflow' :
      active && mode === 'single'   ? 'picking' :
      !active && workflow && workflow.steps.length > 0 ? 'paused' :
      'idle';
    const count = workflow ? workflow.steps.length : 0;
    try {
      chrome.runtime.sendMessage({ type: 'uiref:set-state', state, count });
    } catch {}
  }

  // Pause the picker but keep workflow state so the user can navigate,
  // log in, change routes, etc., and resume capturing after.
  function pauseWorkflow() {
    if (mode !== 'workflow' || !workflow) return;
    deactivatePicker();
    showPausedBadge();
    syncState(); // badge → paused
    showToast({
      title: 'Workflow paused',
      detail: `${workflow.steps.length} step${workflow.steps.length === 1 ? '' : 's'} saved. Click the uiref icon to resume.`,
    });
  }

  async function resumeWorkflow() {
    if (!workflow) {
      const stored = await loadStoredWorkflow();
      if (!stored) return;
      workflow = stored;
    }
    activatePicker('workflow');
  }

  // Paused badge is replaced by the purple tray badge that shows the step count.
  // The user can open the extension popup to see full controls (Resume, Send,
  // Cancel). No in-page badge.
  function showPausedBadge() { /* no-op — see tray badge */ }

  function deactivatePicker() {
    if (!active) return;
    active = false;
    hoverEl = null;
    root.classList.remove('active', 'workflow-mode');
    document.documentElement.classList.remove('uiref-picking-single');
    highlight.style.display = 'none';
    label.style.display = 'none';
    hint.style.display = 'none';
    counter.style.display = 'none';
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('scroll', positionHighlight, true);
    window.removeEventListener('resize', positionHighlight, true);
    syncState();
  }

  // The in-page hint bar is replaced by the extension popup + tray badge.
  // Keep as a no-op so callers still work.
  function updateHint() { /* no-op — controls are in the popup */ }
  function updateCounter() { /* no-op — count is on the tray badge */ }

  // =============================================================
  // MOUSE / KEYBOARD
  // =============================================================
  function onMouseMove(e) {
    if (!active) return;
    const el = elementFromPoint(e.clientX, e.clientY);
    if (el && el !== hoverEl) {
      hoverEl = el;
      updateHighlight();
    }
  }

  function onClick(e) {
    if (!active) return;

    // If the click landed inside our own UI (hint bar buttons, paused badge),
    // don't intercept — let the button's own handler run.
    if (root.contains(e.target)) return;

    if (mode === 'workflow') {
      // Through-click: capture the element but DO NOT preventDefault.
      // The click continues to the underlying element so the user can type
      // into inputs, submit forms, navigate via links, etc.
      if (hoverEl) captureStep(hoverEl);
      // Intentionally no preventDefault / stopPropagation here
    } else {
      // Single mode: intercept fully so we don't trigger the element.
      e.preventDefault();
      e.stopPropagation();
      if (!hoverEl) return;
      capture(hoverEl);
      deactivatePicker();
    }
  }

  function onKeyDown(e) {
    if (!active) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (mode === 'workflow') {
        workflow = null;
        showToast({ title: 'Workflow cancelled' });
      }
      deactivatePicker();
    } else if (e.key === 'Enter' && mode === 'workflow') {
      e.preventDefault();
      if (workflow && workflow.steps.length > 0) {
        finishWorkflow();
      } else {
        showToast({ title: 'Workflow empty', detail: 'Click at least one element first.' });
      }
    } else if (e.key === 'ArrowUp' && hoverEl?.parentElement) {
      e.preventDefault();
      hoverEl = hoverEl.parentElement;
      updateHighlight();
    } else if (e.key === 'ArrowDown' && hoverEl?.firstElementChild) {
      e.preventDefault();
      hoverEl = hoverEl.firstElementChild;
      updateHighlight();
    }
  }

  function elementFromPoint(x, y) {
    // Temporarily hide our own overlay so elementFromPoint can see through it
    const prev = root.style.pointerEvents;
    root.style.pointerEvents = 'none';
    const el = document.elementFromPoint(x, y);
    root.style.pointerEvents = prev;
    // Filter out our own elements
    if (el && root.contains(el)) return null;
    return el;
  }

  // =============================================================
  // HIGHLIGHT + LABEL
  // =============================================================
  function updateHighlight() {
    if (!hoverEl) {
      highlight.style.display = 'none';
      label.style.display = 'none';
      return;
    }
    positionHighlight();
    const src = resolveSource(hoverEl);
    if (src.component) {
      const unresolved = !src.file;
      label.innerHTML =
        `<span class="uiref-label-component">&lt;${escapeHtml(src.component)}&gt;</span>` +
        (unresolved
          ? `<span class="uiref-label-source uiref-label-unresolved">source unresolved — grep fallback</span>`
          : `<span class="uiref-label-source">${escapeHtml(src.file)}:${src.line}</span>`);
    } else {
      label.innerHTML =
        `<span class="uiref-label-component">&lt;${escapeHtml(hoverEl.tagName.toLowerCase())}&gt;</span>` +
        `<span class="uiref-label-source uiref-label-unresolved">no component resolved</span>`;
    }
    label.style.display = 'block';
  }

  function positionHighlight() {
    if (!hoverEl) return;
    const rect = hoverEl.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.left = rect.left + 'px';
    highlight.style.top = rect.top + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';
    // Position label near the top-left of the highlight, pushed below if near top
    const lbl = label;
    lbl.style.left = rect.left + 'px';
    const ly = rect.top > 36 ? rect.top - 34 : rect.bottom + 6;
    lbl.style.top = ly + 'px';
  }

  // =============================================================
  // SOURCE RESOLUTION (multi-tier)
  // =============================================================

  // Tier 1: data-uiref-* attributes (from build plugins)
  function resolveFromDataAttrs(el) {
    let cur = el;
    while (cur && cur !== document.documentElement) {
      if (cur.dataset) {
        const file = cur.dataset.uirefFile;
        const line = cur.dataset.uirefLine;
        const component = cur.dataset.uirefComponent;
        if (file && line && component) {
          return { file, line: parseInt(line, 10), component, tier: 1 };
        }
      }
      cur = cur.parentElement;
    }
    return null;
  }

  // Tier 2a: React Fiber _debugSource (dev builds only, pre-React-19)
  function resolveFromReactFiber(el) {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    if (!key) return null;
    let fiber = el[key];
    while (fiber) {
      const src = fiber._debugSource;
      const name =
        (typeof fiber.type === 'function' && (fiber.type.displayName || fiber.type.name)) ||
        (fiber.type && fiber.type.displayName) ||
        (fiber.elementType && fiber.elementType.displayName) ||
        null;
      if (src && src.fileName && name) {
        return {
          file: src.fileName,
          line: src.lineNumber,
          component: name,
          tier: 2,
        };
      }
      fiber = fiber.return;
    }
    return null;
  }

  // Tier 2b: Vue 3 __vueParentComponent (dev builds only)
  function resolveFromVue(el) {
    let cur = el;
    while (cur) {
      const vnode = cur.__vueParentComponent;
      if (vnode) {
        const type = vnode.type || {};
        const file = type.__file || null;
        const component = type.name || type.__name || (file ? fileNameFromPath(file) : null);
        if (component) {
          return { file, line: null, component, tier: 2 };
        }
      }
      cur = cur.parentElement;
    }
    return null;
  }

  // Tier 2c: Svelte 4/5 __svelte_meta (dev builds only, Svelte 4 guaranteed; Svelte 5 not guaranteed)
  function resolveFromSvelte(el) {
    let cur = el;
    while (cur) {
      const meta = cur.__svelte_meta;
      if (meta && meta.loc) {
        const { file, line } = meta.loc;
        const component = meta.source || fileNameFromPath(file) || 'SvelteComponent';
        return { file, line, component, tier: 2 };
      }
      cur = cur.parentElement;
    }
    return null;
  }

  // Tier 2d: Angular ng.getComponent (dev builds only, requires Ivy)
  function resolveFromAngular(el) {
    if (typeof window.ng?.getComponent !== 'function') return null;
    try {
      const comp = window.ng.getComponent(el) || window.ng.getOwningComponent(el);
      if (!comp) return null;
      const name = comp.constructor?.name;
      if (!name) return null;
      return { file: null, line: null, component: name, tier: 2 };
    } catch {
      return null;
    }
  }

  function resolveSource(el) {
    return (
      resolveFromDataAttrs(el) ||
      resolveFromReactFiber(el) ||
      resolveFromVue(el) ||
      resolveFromSvelte(el) ||
      resolveFromAngular(el) ||
      { file: null, line: null, component: null, tier: 4 }
    );
  }

  function fileNameFromPath(p) {
    if (!p) return null;
    const m = p.match(/([^\/\\]+?)(\.[^.]+)?$/);
    return m ? m[1] : null;
  }

  // =============================================================
  // CAPTURE
  // =============================================================
  // Build a uiref from an element (used by both single capture and workflow step)
  async function buildUiref(el) {
    const src = resolveSource(el);
    const rect = el.getBoundingClientRect();
    const shotResp = await chrome.runtime.sendMessage({ type: 'uiref:capture-tab' });
    let elementShot = null;
    if (shotResp?.ok) {
      elementShot = await cropScreenshot(shotResp.dataUrl, rect);
    }
    return {
      format: 'uiref/v1',
      captured_at: new Date().toISOString(),
      target: {
        file: src.file,
        line: src.line,
        component: src.component,
      },
      element: {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 200) || null,
        attributes: collectAttrs(el),
        dom_path: computeDomPath(el),
      },
      screenshot: elementShot,
      user_intent: null,
    };
  }

  async function capture(el) {
    try {
      const uiref = await buildUiref(el);
      await writeToInbox(uiref);
      const src = uiref.target;
      showToast({
        title: src.component ? `<${src.component}> → Claude` : `<${uiref.element.tag}> → Claude (unresolved)`,
        detail: src.file && src.line
          ? `${src.file}:${src.line}`
          : src.component
          ? 'Source unresolved — Claude will grep fallback'
          : 'No component. Claude will grep on element text.',
      });
    } catch (err) {
      console.error('[uiref] capture failed', err);
      showToast({ title: 'Capture failed', detail: err.message || String(err), error: true });
    }
  }

  async function captureStep(el) {
    try {
      const uiref = await buildUiref(el);
      workflow.steps.push(uiref);
      await saveWorkflow();
      updateCounter();
      updateHint(); // refresh the "Send N steps to Claude" button
      syncState();  // update the tray badge count
      showToast({
        title: `+ step ${workflow.steps.length}: <${uiref.target.component || uiref.element.tag}>`,
        detail: uiref.target.file ? `${uiref.target.file}:${uiref.target.line}` : 'unresolved',
      });
    } catch (err) {
      console.error('[uiref] step capture failed', err);
      showToast({ title: 'Step capture failed', detail: err.message || String(err), error: true });
    }
  }

  async function finishWorkflow() {
    if (!workflow || !workflow.steps.length) return;
    try {
      const startedAtMs = new Date(workflow.startedAt).getTime();
      const flow = {
        format: 'uiref-flow/v1',
        captured_at: workflow.startedAt,
        finished_at: new Date().toISOString(),
        title: null,
        user_intent: null,
        steps: workflow.steps.map((uiref, i) => ({
          order: i + 1,
          action: 'ref', // manual chain — no automatic action detection
          target: uiref,
          timestamp_ms: new Date(uiref.captured_at).getTime() - startedAtMs,
        })),
      };
      await writeFlowToInbox(flow);
      const count = workflow.steps.length;
      showToast({
        title: `Workflow → Claude (${count} step${count === 1 ? '' : 's'})`,
        detail: 'Ready for your prompt in Claude Code.',
      });
      workflow = null;
      await clearStoredWorkflow();
      deactivatePicker();
    } catch (err) {
      console.error('[uiref] workflow export failed', err);
      showToast({ title: 'Workflow export failed', detail: err.message || String(err), error: true });
    }
  }

  async function writeFlowToInbox(flow) {
    const dir = await ensureInboxHandle();
    const stamp = flow.captured_at.replace(/[:.]/g, '-');
    const filename = `${stamp}.uiref-flow.json`;
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(flow, null, 2) + '\n');
    await writable.close();
    pruneInbox(dir).catch(() => {});
  }

  function collectAttrs(el) {
    const out = {};
    for (const { name, value } of el.attributes || []) {
      if (name.startsWith('data-uiref-')) continue; // skip our own build-plugin attrs
      out[name] = value;
    }
    return Object.keys(out).length ? out : null;
  }

  function computeDomPath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && parts.length < 8) {
      let seg = cur.tagName.toLowerCase();
      if (cur.id) {
        seg += '#' + cur.id;
        parts.unshift(seg);
        break;
      }
      if (cur.className && typeof cur.className === 'string') {
        const cls = cur.className.trim().split(/\s+/).slice(0, 2).join('.');
        if (cls) seg += '.' + cls;
      }
      parts.unshift(seg);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  async function cropScreenshot(dataUrl, rect) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        const canvas = document.createElement('canvas');
        const w = Math.max(1, rect.width * dpr);
        const h = Math.max(1, rect.height * dpr);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, rect.left * dpr, rect.top * dpr, w, h, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  // =============================================================
  // INBOX WRITING — File System Access API + IndexedDB handle persistence
  // =============================================================

  const IDB_NAME = 'uiref';
  const IDB_STORE = 'handles';

  function openIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(IDB_STORE);
      };
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

  async function storeHandle(handle) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(handle, 'inbox');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function ensureInboxHandle() {
    if (inboxHandle) {
      const perm = await inboxHandle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') return inboxHandle;
      const asked = await inboxHandle.requestPermission({ mode: 'readwrite' });
      if (asked === 'granted') return inboxHandle;
    }

    const stored = await getStoredHandle();
    if (stored) {
      const perm = await stored.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        inboxHandle = stored;
        return inboxHandle;
      }
      const asked = await stored.requestPermission({ mode: 'readwrite' });
      if (asked === 'granted') {
        inboxHandle = stored;
        return inboxHandle;
      }
    }

    // First time setup: ask user to pick a directory
    showToast({
      title: 'uiref needs an inbox folder',
      detail: 'Pick ~/uiref-inbox/ (create it first in your home folder)',
    });
    const picked = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents',
      id: 'uiref-inbox',
    });
    await storeHandle(picked);
    inboxHandle = picked;
    return inboxHandle;
  }

  async function writeToInbox(uiref) {
    const dir = await ensureInboxHandle();
    const stamp = uiref.captured_at.replace(/[:.]/g, '-');
    const filename = `${stamp}.uiref.json`;
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(uiref, null, 2) + '\n');
    await writable.close();
    // Prune stale files — keep the inbox from accumulating forever.
    pruneInbox(dir).catch(() => {}); // fire and forget
  }

  // Delete uiref files older than 1 hour so the inbox doesn't accumulate.
  const PRUNE_MAX_AGE_MS = 60 * 60 * 1000;
  async function pruneInbox(dir) {
    const cutoff = Date.now() - PRUNE_MAX_AGE_MS;
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind !== 'file') continue;
      if (!name.endsWith('.uiref.json') && !name.endsWith('.uiref-flow.json')) continue;
      try {
        const file = await handle.getFile();
        if (file.lastModified < cutoff) {
          await dir.removeEntry(name);
        }
      } catch {}
    }
  }

  // =============================================================
  // TOAST
  // =============================================================
  function showToast({ title, detail, error = false }) {
    ensureRoot();
    toast.classList.toggle('error', !!error);
    toast.innerHTML =
      `<span class="uiref-toast-title">${escapeHtml(title)}</span>` +
      (detail ? `<span class="uiref-toast-detail">${escapeHtml(detail)}</span>` : '');
    toast.classList.add('show');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // =============================================================
  // MESSAGE LISTENER
  // =============================================================
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'uiref:activate-picker') {
      activatePicker(msg.mode || 'single');
      sendResponse({ ok: true });
    } else if (msg?.type === 'uiref:workflow-action') {
      // Popup → content: perform a workflow action
      switch (msg.action) {
        case 'send': finishWorkflow(); break;
        case 'hide': pauseWorkflow(); break;
        case 'resume': resumeWorkflow(); break;
        case 'cancel':
          workflow = null;
          clearStoredWorkflow();
          deactivatePicker();
          showToast({ title: 'Workflow cancelled' });
          break;
      }
      sendResponse({ ok: true });
    }
    return false;
  });

  // On page load, if there's a paused workflow in storage, show the resume badge
  // so the user can continue after navigating/logging in/reloading.
  (async () => {
    const stored = await loadStoredWorkflow();
    if (stored && stored.steps && stored.steps.length > 0) {
      workflow = stored;
      ensureRoot();
      showPausedBadge();
      syncState(); // let the tray badge reflect paused state
    } else {
      syncState(); // idle
    }
  })();
})();
