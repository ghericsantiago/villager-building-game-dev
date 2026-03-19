export function createAlertSystem(options = {}) {
  const {
    anchorCanvas,
    maxVisible = 4,
    defaultTtlMs = 0,
    defaultDedupeMs = 2600
  } = options;

  let containerEl = null;
  const dedupeByKey = new Map();

  function ensureContainer() {
    if (containerEl) return containerEl;
    const el = document.createElement('div');
    el.className = 'game-alert-layer';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    containerEl = el;
    updateAnchor();
    return containerEl;
  }

  function updateAnchor() {
    if (!containerEl || !anchorCanvas) return;
    const rect = anchorCanvas.getBoundingClientRect();
    const left = Math.max(8, rect.right - 320);
    const top = Math.max(8, rect.top + 8);
    containerEl.style.left = `${Math.round(left)}px`;
    containerEl.style.top = `${Math.round(top)}px`;
    containerEl.style.width = `${Math.min(312, Math.max(220, Math.floor(rect.width * 0.4)))}px`;
  }

  function trimOverflow() {
    if (!containerEl) return;
    while (containerEl.childElementCount > maxVisible) {
      const first = containerEl.firstElementChild;
      if (!first) break;
      first.remove();
    }
  }

  function notify(alert = {}) {
    const layer = ensureContainer();
    const now = Date.now();
    const dedupeKey = String(alert.dedupeKey || alert.message || '').trim();
    const dedupeMs = Math.max(0, Number(alert.dedupeMs ?? defaultDedupeMs));
    if (dedupeKey) {
      const lastAt = Number(dedupeByKey.get(dedupeKey) || 0);
      if (now - lastAt < dedupeMs) return;
      dedupeByKey.set(dedupeKey, now);
    }

    const item = document.createElement('div');
    const level = String(alert.level || 'warning').toLowerCase();
    item.className = `game-alert game-alert-${level}`;

    const title = document.createElement('div');
    title.className = 'game-alert-title';
    title.textContent = String(alert.title || (level === 'error' ? 'Error' : level === 'success' ? 'Success' : 'Warning'));

    const text = document.createElement('div');
    text.className = 'game-alert-message';
    text.textContent = String(alert.message || '');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'game-alert-close';
    closeBtn.setAttribute('aria-label', 'Dismiss alert');
    closeBtn.textContent = 'x';
    closeBtn.addEventListener('click', () => item.remove());

    item.appendChild(closeBtn);
    item.appendChild(title);
    item.appendChild(text);
    layer.appendChild(item);

    trimOverflow();

    const ttlRaw = Number(alert.ttlMs ?? defaultTtlMs);
    if (Number.isFinite(ttlRaw) && ttlRaw > 0) {
      const ttl = Math.max(1200, ttlRaw);
      window.setTimeout(() => item.remove(), ttl);
    }
  }

  return {
    notify,
    updateAnchor
  };
}
