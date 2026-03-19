export function createStorageSidebarController(deps) {
  const {
    game,
    capitalize,
    toolDisplayName,
    materialDisplayName,
    materialIcon,
    getTotalStorageCapacity,
    getTotalStoredInBuildings
  } = deps;

  let storageListEl = null;
  let storageSearchEl = null;
  let storageSearchQuery = '';
  let storageSortKey = 'title';
  let storageSortDir = 'asc';

  function normalizedStorageSearch(value) {
    return String(value || '').trim().toLowerCase();
  }

  function matchesStorageSearch(label, key) {
    if (!storageSearchQuery) return true;
    const text = `${label || ''} ${key || ''}`.toLowerCase();
    return text.includes(storageSearchQuery);
  }

  function setStorageSort(nextKey) {
    if (storageSortKey === nextKey) {
      storageSortDir = storageSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      storageSortKey = nextKey;
      storageSortDir = nextKey === 'count' ? 'desc' : 'asc';
    }
    refresh();
  }

  function compareStorageEntries(a, b) {
    if (storageSortKey === 'count') {
      const diff = (a.count || 0) - (b.count || 0);
      if (diff !== 0) return storageSortDir === 'asc' ? diff : -diff;
    }
    const nameCmp = String(a.label || a.key || '').localeCompare(String(b.label || b.key || ''));
    return storageSortDir === 'asc' ? nameCmp : -nameCmp;
  }

  function renderHead() {
    const head = document.createElement('div');
    head.className = 'storage-table-head';

    const titleBtn = document.createElement('button');
    titleBtn.type = 'button';
    titleBtn.className = `storage-head-btn${storageSortKey === 'title' ? ' active' : ''}`;
    titleBtn.textContent = `Title${storageSortKey === 'title' ? (storageSortDir === 'asc' ? ' ▲' : ' ▼') : ''}`;
    titleBtn.addEventListener('click', () => setStorageSort('title'));

    const countBtn = document.createElement('button');
    countBtn.type = 'button';
    countBtn.className = `storage-head-btn count${storageSortKey === 'count' ? ' active' : ''}`;
    countBtn.textContent = `Count${storageSortKey === 'count' ? (storageSortDir === 'asc' ? ' ▲' : ' ▼') : ''}`;
    countBtn.addEventListener('click', () => setStorageSort('count'));

    head.appendChild(titleBtn);
    head.appendChild(countBtn);
    storageListEl.appendChild(head);
  }

  function refresh() {
    if (!storageListEl) return;
    storageListEl.innerHTML = '';

    const totalCapacity = getTotalStorageCapacity();
    const totalUsed = getTotalStoredInBuildings();
    const summary = document.createElement('div');
    summary.className = 'storage-summary';
    summary.textContent = `Building Item Capacity ${totalUsed}/${totalCapacity}`;
    storageListEl.appendChild(summary);

    renderHead();

    const toolTotals = game.getPooledToolItems();
    const toolKeys = Object.keys(toolTotals);
    const toolIcons = {
      axe: '🪓',
      pickaxe: '⛏️'
    };
    const toolEntries = [];
    for (const key of toolKeys) {
      const labelText = toolDisplayName(key) || capitalize(key);
      if (!matchesStorageSearch(labelText, key)) continue;
      toolEntries.push({ key, label: labelText, icon: toolIcons[key] || '🧰', count: Number(toolTotals[key] || 0) });
    }
    toolEntries.sort(compareStorageEntries);
    for (const entry of toolEntries) {
      const row = document.createElement('div'); row.className = 'storage-item';
      const icon = document.createElement('span'); icon.className = 'storage-icon'; icon.textContent = entry.icon;
      const label = document.createElement('span'); label.className = 'storage-label'; label.textContent = entry.label;
      const val = document.createElement('span'); val.className = 'storage-val'; val.textContent = String(entry.count);
      row.appendChild(icon); row.appendChild(label); row.appendChild(val);
      storageListEl.appendChild(row);
    }

    const materialTotals = game.getPooledMaterialItems();
    const materialKeys = Object.keys(materialTotals);
    const materialRows = [];
    const materialEntries = [];
    if (materialKeys.length > 0) {
      for (const key of materialKeys) {
        const labelText = materialDisplayName(key);
        if (!matchesStorageSearch(labelText, key)) continue;
        materialEntries.push({ key, label: labelText, icon: materialIcon(key), count: Number(materialTotals[key] || 0) });
      }
    }
    materialEntries.sort(compareStorageEntries);
    for (const entry of materialEntries) {
      const row = document.createElement('div'); row.className = 'storage-item';
      const icon = document.createElement('span'); icon.className = 'storage-icon'; icon.textContent = entry.icon;
      const label = document.createElement('span'); label.className = 'storage-label'; label.textContent = entry.label;
      const val = document.createElement('span'); val.className = 'storage-val'; val.textContent = String(entry.count);
      row.appendChild(icon); row.appendChild(label); row.appendChild(val);
      materialRows.push(row);
    }

    if (toolEntries.length > 0 && materialRows.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'storage-divider';
      storageListEl.appendChild(divider);
    }
    for (const row of materialRows) storageListEl.appendChild(row);
  }

  function init(elements) {
    storageListEl = elements.storageListEl || null;
    storageSearchEl = elements.storageSearchEl || null;
    if (storageSearchEl) {
      storageSearchEl.addEventListener('input', () => {
        storageSearchQuery = normalizedStorageSearch(storageSearchEl.value);
        refresh();
      });
    }
    refresh();
  }

  return {
    init,
    refresh
  };
}
