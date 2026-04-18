// uiref — main-world injected script
//
// Runs in the page's MAIN world (unlike content.js which runs in the isolated
// world) so it can patch global APIs (console, fetch, XHR, onerror). Patches
// are minimal: they call the original unchanged and emit a CustomEvent for the
// isolated-world content script to buffer. Events cross the world boundary
// because `document` is shared.
//
// Guard against multiple injections (Chrome sometimes re-injects on SPA nav).

(function () {
  if (window.__uirefInjected_main) return;
  window.__uirefInjected_main = true;

  // Opt-out config. Set BEFORE uiref loads (e.g., in your app bootstrap):
  //   window.__uirefConfig = { patchConsole: false, patchNetwork: false };
  // Useful when debugging framework warnings — uiref's console wrapper
  // shows at the top of every stack trace otherwise.
  const cfg = window.__uirefConfig || {};
  const patchConsole = cfg.patchConsole !== false;
  const patchErrors  = cfg.patchErrors  !== false;
  const patchNetwork = cfg.patchNetwork !== false;
  const patchNavigation = cfg.patchNavigation !== false;

  const MAX_ARG_LEN = 200;

  function safeStringify(v) {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    const t = typeof v;
    if (t === 'string') return v.length > MAX_ARG_LEN ? v.slice(0, MAX_ARG_LEN) + '…' : v;
    if (t === 'number' || t === 'boolean') return String(v);
    if (t === 'function') return '[Function]';
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    try {
      const s = JSON.stringify(v);
      return s.length > MAX_ARG_LEN ? s.slice(0, MAX_ARG_LEN) + '…' : s;
    } catch {
      return '[Object]';
    }
  }

  function emit(type, detail) {
    try {
      document.dispatchEvent(new CustomEvent(type, { detail: { ...detail, t: Date.now() } }));
    } catch {}
  }

  // ----- Console -----
  if (patchConsole) {
    ['log', 'info', 'warn', 'error'].forEach((level) => {
      const orig = console[level];
      if (!orig) return;
      console[level] = function (...args) {
        // Call the original FIRST so the browser's "real" stack for the
        // warning is captured before our wrapper adds itself. The emit
        // happens after, in a microtask, so it never affects the caller's
        // perceived stack.
        try { orig.apply(console, args); } finally {
          try {
            queueMicrotask(() => emit('uiref:console', { level, args: args.map(safeStringify) }));
          } catch {}
        }
      };
    });
  }

  // ----- Uncaught errors -----
  if (patchErrors) {
  window.addEventListener('error', (ev) => {
    emit('uiref:error', {
      message: ev.message,
      filename: ev.filename || null,
      line: ev.lineno || null,
      column: ev.colno || null,
      stack: ev.error?.stack ? String(ev.error.stack).slice(0, 1200) : null,
    });
  }, true);

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    emit('uiref:error', {
      message: reason?.message || safeStringify(reason),
      stack: reason?.stack ? String(reason.stack).slice(0, 1200) : null,
      kind: 'unhandledrejection',
    });
  });
  }

  // Extract just the GraphQL operationName from a request body if present.
  // This is the ONLY body field we capture (it's not sensitive — it's visible
  // in any DevTools Network tab — and makes repeated calls to /graphql
  // distinguishable). No variables, no query, no other body content.
  function extractGqlOperationName(body) {
    if (!body) return null;
    try {
      if (typeof body === 'string' && body.length < 200_000 && body[0] === '{') {
        const parsed = JSON.parse(body);
        const name = parsed?.operationName;
        if (typeof name === 'string' && name.length <= 100) return name;
      }
    } catch {}
    return null;
  }

  // ----- Fetch -----
  const origFetch = window.fetch;
  if (patchNetwork && origFetch) {
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const start = performance.now();
      const opName = extractGqlOperationName(init && init.body);
      try {
        const p = origFetch.apply(this, arguments);
        p.then(
          (response) => {
            emit('uiref:network', {
              method, url,
              operation: opName,
              status: response.status,
              ok: response.ok,
              duration_ms: Math.round(performance.now() - start),
            });
          },
          (err) => {
            emit('uiref:network', {
              method, url,
              operation: opName,
              status: null,
              ok: false,
              error: err?.message || String(err),
              duration_ms: Math.round(performance.now() - start),
            });
          },
        );
        return p;
      } catch (err) {
        emit('uiref:network', {
          method, url, operation: opName,
          status: null, ok: false,
          error: err?.message || String(err),
          duration_ms: Math.round(performance.now() - start),
        });
        throw err;
      }
    };
  }

  // ----- XMLHttpRequest -----
  const OrigXHR = window.XMLHttpRequest;
  if (patchNetwork && OrigXHR) {
    const origOpen = OrigXHR.prototype.open;
    const origSend = OrigXHR.prototype.send;
    OrigXHR.prototype.open = function (method, url) {
      this.__uirefMethod = method;
      this.__uirefUrl = url;
      return origOpen.apply(this, arguments);
    };
    OrigXHR.prototype.send = function (body) {
      const start = performance.now();
      const method = this.__uirefMethod || 'GET';
      const url = this.__uirefUrl || '';
      const opName = extractGqlOperationName(body);
      this.addEventListener('loadend', () => {
        emit('uiref:network', {
          method: method.toUpperCase(), url,
          operation: opName,
          status: this.status || null,
          ok: this.status >= 200 && this.status < 400,
          duration_ms: Math.round(performance.now() - start),
        });
      });
      return origSend.apply(this, arguments);
    };
  }

  // ----- Store snapshot (opt-in via window.__uirefStore) -----
  // Developers expose their store state at dev time:
  //   if (import.meta.env.DEV) window.__uirefStore = () => myStore.getState();
  // The extension requests the current snapshot via a CustomEvent and we
  // respond with the serialized state. Works for any library because the
  // developer controls the accessor.
  document.addEventListener('uiref:request-store', () => {
    let snapshot = null;
    try {
      const src = window.__uirefStore;
      if (typeof src === 'function') snapshot = src();
      else if (src && typeof src === 'object') snapshot = src;
    } catch (err) {
      snapshot = { __uiref_error: err?.message || String(err) };
    }
    // Serialize carefully — caller is isolated-world JS, so keep to plain JSON
    let serialized = null;
    if (snapshot !== null && snapshot !== undefined) {
      try {
        serialized = JSON.parse(JSON.stringify(snapshot, (k, v) => {
          if (typeof v === 'function') return '[Function]';
          if (v instanceof Element) return '[DOMElement]';
          if (v instanceof Map) return Object.fromEntries(v);
          if (v instanceof Set) return Array.from(v);
          return v;
        }));
      } catch (err) {
        serialized = { __uiref_error: 'Could not serialize store: ' + (err?.message || err) };
      }
    }
    try {
      document.dispatchEvent(new CustomEvent('uiref:store-response', { detail: serialized }));
    } catch {}
  });

  // ----- SPA navigation -----
  if (patchNavigation) {
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function () {
      emit('uiref:navigate', { from: location.pathname, kind: 'push' });
      return origPush.apply(this, arguments);
    };
    history.replaceState = function () {
      emit('uiref:navigate', { from: location.pathname, kind: 'replace' });
      return origReplace.apply(this, arguments);
    };
    window.addEventListener('popstate', () => {
      emit('uiref:navigate', { to: location.pathname, kind: 'pop' });
    });
  }
})();
