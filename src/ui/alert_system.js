export function createAlertSystem(options = {}) {
  const {
    anchorCanvas,
    onAlertClick = null,
    maxVisible = 4,
    defaultTtlMs = 0,
    defaultDedupeMs = 2600
  } = options;

  let containerEl = null;
  const dedupeByKey = new Map();
  const activeByKey = new Map();

  function removeAlertItem(item) {
    if (!item) return;
    const key = String(item.dataset.alertKey || '');
    if (key && activeByKey.get(key) === item) activeByKey.delete(key);
    item.remove();
  }

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
      removeAlertItem(first);
    }
  }

  function hasClickableTarget(alert) {
    const target = alert?.focusTarget;
    if (!target || typeof onAlertClick !== 'function') return false;
    return (
      Number.isFinite(Number(target.worldX)) && Number.isFinite(Number(target.worldY))
    ) || (
      Number.isFinite(Number(target.tileX)) && Number.isFinite(Number(target.tileY))
    );
  }

  function notify(alert = {}) {
    const layer = ensureContainer();
    const now = Date.now();
    const level = String(alert.level || 'warning').toLowerCase();
    const titleText = String(alert.title || (level === 'error' ? 'Error' : level === 'success' ? 'Success' : 'Warning'));
    const messageText = String(alert.message || '');
    const dedupeKey = String(alert.dedupeKey || alert.message || '').trim();
    const activeKey = String(alert.uniqueKey || dedupeKey || `${level}:${titleText}:${messageText}`).trim();

    if (activeKey) {
      const existing = activeByKey.get(activeKey);
      if (existing && existing.isConnected) return;
      if (existing && !existing.isConnected) activeByKey.delete(activeKey);
    }

    const dedupeMs = Math.max(0, Number(alert.dedupeMs ?? defaultDedupeMs));
    if (dedupeKey) {
      const lastAt = Number(dedupeByKey.get(dedupeKey) || 0);
      if (now - lastAt < dedupeMs) return;
      dedupeByKey.set(dedupeKey, now);
    }

    const item = document.createElement('div');
    item.className = `game-alert game-alert-${level}`;
    item.dataset.alertKey = activeKey;
    if (activeKey) activeByKey.set(activeKey, item);

    if (hasClickableTarget(alert)) {
      item.classList.add('game-alert-clickable');
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `${titleText}. Focus camera on alert target.`);
      item.addEventListener('click', () => onAlertClick(alert));
      item.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        onAlertClick(alert);
      });
    }

    const title = document.createElement('div');
    title.className = 'game-alert-title';
    title.textContent = titleText;

    const text = document.createElement('div');
    text.className = 'game-alert-message';
    text.textContent = messageText;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'game-alert-close';
    closeBtn.setAttribute('aria-label', 'Dismiss alert');
    closeBtn.textContent = 'x';
    closeBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      removeAlertItem(item);
    });

    item.appendChild(closeBtn);
    item.appendChild(title);
    item.appendChild(text);
    layer.appendChild(item);

    trimOverflow();

    const ttlRaw = Number(alert.ttlMs ?? defaultTtlMs);
    if (Number.isFinite(ttlRaw) && ttlRaw > 0) {
      const ttl = Math.max(1200, ttlRaw);
      window.setTimeout(() => removeAlertItem(item), ttl);
    }
  }

  return {
    notify,
    updateAnchor
  };
}
