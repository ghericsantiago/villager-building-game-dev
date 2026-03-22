export function createBuildingsSidebarController(deps) {
  const {
    game,
    capitalize,
    getSelectedBuilding,
    onSelectBuilding,
    onDestroyBuilding,
    onSetBuildingAcceptedItems,
    onSetBuildingItemLimit,
    getFilterItems,
    getBuildingStoredTotal,
    renderBuildingSettings,
    getBuildingSettingsSignature
  } = deps;

  let buildingsListEl = null;
  let buildingSelectedPanelEl = null;
  let buildingSelectedSummaryEl = null;
  let buildingActionsEl = null;
  let buildingSettingsEl = null;
  let buildingFiltersEl = null;
  let filterSearchText = '';
  let filterListScrollTop = 0;
  let lastSignature = '';

  function captureInputState(container) {
    const active = document.activeElement;
    if (!container || !active || !container.contains(active)) return null;
    const tagName = String(active.tagName || '').toLowerCase();
    if (!['input', 'textarea', 'select'].includes(tagName)) return null;
    return {
      tagName,
      type: String(active.getAttribute('type') || '').toLowerCase(),
      className: String(active.className || ''),
      itemKey: String(active.dataset?.itemKey || ''),
      value: 'value' in active ? String(active.value || '') : '',
      selectionStart: typeof active.selectionStart === 'number' ? active.selectionStart : null,
      selectionEnd: typeof active.selectionEnd === 'number' ? active.selectionEnd : null
    };
  }

  function findMatchingInput(container, state) {
    if (!container || !state) return null;
    const candidates = Array.from(container.querySelectorAll(state.tagName));
    return candidates.find((candidate) => {
      const sameType = String(candidate.getAttribute('type') || '').toLowerCase() === state.type;
      const sameClass = String(candidate.className || '') === state.className;
      const sameKey = String(candidate.dataset?.itemKey || '') === state.itemKey;
      if (!sameType || !sameClass) return false;
      if (state.itemKey) return sameKey;
      return true;
    }) || null;
  }

  function restoreInputState(container, state) {
    const match = findMatchingInput(container, state);
    if (!match) return;
    match.focus({ preventScroll: true });
    if ('value' in match && state.value !== '' && match.value !== state.value) {
      match.value = state.value;
    }
    if (typeof state.selectionStart === 'number' && typeof match.setSelectionRange === 'function') {
      match.setSelectionRange(state.selectionStart, state.selectionEnd ?? state.selectionStart);
    }
  }

  function getBuildingName(building) {
    return building?.name || capitalize(building?.kind || 'building');
  }

  function getBuildingKey(building) {
    if (!building) return 'none';
    return `${building.kind || 'building'}@${building.x},${building.y}`;
  }

  function getBuildingStatusText(building) {
    if (!building) return 'Unknown';
    if (building.isConstructed) return 'Complete';
    const pct = Math.max(0, Math.min(100, Math.round((building.buildCompletion || 0) * 100)));
    return `Under Construction (${pct}%)`;
  }

  function countStoredItems(building) {
    if (typeof getBuildingStoredTotal === 'function') return getBuildingStoredTotal(building);
    if (!building?.itemStorage) return 0;
    return Object.values(building.itemStorage).reduce((sum, value) => {
      if (Array.isArray(value)) {
        return sum + value.reduce((inner, entry) => inner + Math.max(0, Number(entry?.count) || 0), 0);
      }
      return sum + Math.max(0, Number(value) || 0);
    }, 0);
  }

  function getCurrentSelectedBuilding() {
    const selected = (typeof getSelectedBuilding === 'function') ? getSelectedBuilding() : null;
    if (!selected) return null;
    if (!game.buildings.includes(selected)) {
      if (typeof onSelectBuilding === 'function') onSelectBuilding(null);
      return null;
    }
    return selected;
  }

  function getFilterCatalog() {
    if (typeof getFilterItems === 'function') return getFilterItems() || [];
    return [];
  }

  function isStorageFilterable(building) {
    return !!building && Number.isFinite(Number(building.storageCapacity)) && !!building.itemStorage;
  }

  function renderSelectedSummary(building) {
    if (!buildingSelectedSummaryEl) return;
    if (!building) {
      buildingSelectedSummaryEl.innerHTML = '<div class="building-selected-empty">Select a building on the map or from this list.</div>';
      return;
    }

    const status = getBuildingStatusText(building);
    const owner = capitalize(building.owner || 'neutral');
    const capacityText = Number.isFinite(Number(building.storageCapacity))
      ? ` | Capacity ${countStoredItems(building)}/${building.storageCapacity}`
      : '';
    buildingSelectedSummaryEl.innerHTML = `
      <div class="building-selected-title">${getBuildingName(building)}</div>
      <div class="building-selected-meta">${status} | ${owner} | @${building.x},${building.y}${capacityText}</div>
    `;
  }

  function renderSelectedActions(building) {
    if (!buildingActionsEl) return;
    buildingActionsEl.innerHTML = '';
    if (!building) return;

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'building-back-btn';
    backBtn.textContent = '←';
    backBtn.title = 'Back to Buildings';
    backBtn.setAttribute('aria-label', 'Back to Buildings');
    backBtn.addEventListener('click', () => {
      if (typeof onSelectBuilding === 'function') onSelectBuilding(null);
    });
    buildingActionsEl.appendChild(backBtn);

    const destroyBtn = document.createElement('button');
    destroyBtn.type = 'button';
    destroyBtn.className = 'building-destroy-btn';
    destroyBtn.textContent = '✖';
    destroyBtn.setAttribute('aria-label', 'Destroy Selected Building');
    destroyBtn.disabled = String(building.owner || '').toLowerCase() !== 'player';
    destroyBtn.title = destroyBtn.disabled ? 'Only player buildings can be refunded/destroyed from here.' : 'Destroy Selected Building';
    destroyBtn.addEventListener('click', () => {
      if (destroyBtn.disabled) return;
      if (typeof onDestroyBuilding === 'function') onDestroyBuilding(building);
    });
    buildingActionsEl.appendChild(destroyBtn);
  }

  function normalizeAcceptedSet(building, allKeys) {
    if (!Array.isArray(building?.acceptedItemKeys)) return null;
    const allowed = new Set();
    for (const key of building.acceptedItemKeys) {
      if (allKeys.includes(key)) allowed.add(key);
    }
    return allowed;
  }

  function setBuildingAcceptedItems(building, nextAcceptedKeys) {
    if (!building) return;
    if (typeof onSetBuildingAcceptedItems === 'function') {
      onSetBuildingAcceptedItems(building, nextAcceptedKeys);
      return;
    }
    if (typeof building.setAcceptedItems === 'function') building.setAcceptedItems(nextAcceptedKeys);
  }

  function setBuildingItemLimit(building, itemKey, limit) {
    if (!building) return;
    if (typeof onSetBuildingItemLimit === 'function') {
      onSetBuildingItemLimit(building, itemKey, limit);
      return;
    }
    if (typeof building.setItemLimit === 'function') building.setItemLimit(itemKey, limit);
  }

  function renderSelectedFilters(building) {
    if (!buildingFiltersEl) return;
    const inputState = captureInputState(buildingFiltersEl);
    buildingFiltersEl.innerHTML = '';

    if (!building || !isStorageFilterable(building)) return;

    const catalog = getFilterCatalog();
    if (!catalog.length) return;

    const isStorageKind = String(building.kind || '').toLowerCase() === 'storage';

    const wrap = document.createElement('div');
    wrap.className = 'building-filter-wrap';

    const title = document.createElement('div');
    title.className = 'building-filter-title';
    title.textContent = 'Accepted Items';
    wrap.appendChild(title);

    const allKeys = catalog.map(item => item.key);
    const acceptedSet = normalizeAcceptedSet(building, allKeys);

    const toolbar = document.createElement('div');
    toolbar.className = 'building-filter-toolbar';

    const allowAllBtn = document.createElement('button');
    allowAllBtn.type = 'button';
    allowAllBtn.className = 'building-filter-btn';
    allowAllBtn.textContent = '+All';
    allowAllBtn.title = 'Accept All';
    allowAllBtn.setAttribute('aria-label', 'Accept All');
    allowAllBtn.addEventListener('click', () => {
      filterListScrollTop = list.scrollTop;
      // Accept all non-rejected items; passing `null` is fine because
      // `game.targetAcceptsItem` checks `rejectItemKeys` first.
      setBuildingAcceptedItems(building, null);
      refresh();
    });
    toolbar.appendChild(allowAllBtn);

    const allowNoneBtn = document.createElement('button');
    allowNoneBtn.type = 'button';
    allowNoneBtn.className = 'building-filter-btn';
    allowNoneBtn.textContent = '-All';
    allowNoneBtn.title = 'Accept None';
    allowNoneBtn.setAttribute('aria-label', 'Accept None');
    allowNoneBtn.addEventListener('click', () => {
      filterListScrollTop = list.scrollTop;
      // Accept none of the non-rejected items.
      setBuildingAcceptedItems(building, []);
      refresh();
    });
    toolbar.appendChild(allowNoneBtn);

    const selectVisibleBtn = document.createElement('button');
    selectVisibleBtn.type = 'button';
    selectVisibleBtn.className = 'building-filter-btn';
    selectVisibleBtn.textContent = '+Vis';
    selectVisibleBtn.title = 'Select Visible';
    selectVisibleBtn.setAttribute('aria-label', 'Select Visible');
    selectVisibleBtn.addEventListener('click', () => {
      filterListScrollTop = list.scrollTop;
      const next = acceptedSet ? new Set(acceptedSet) : new Set(allKeys);
      for (const row of rows) {
        if (row.style.display === 'none') continue;
        if (row.dataset.rejected === 'true') continue;
        if (row.dataset.itemKey) next.add(row.dataset.itemKey);
      }
      setBuildingAcceptedItems(building, Array.from(next));
      refresh();
    });
    toolbar.appendChild(selectVisibleBtn);

    const unselectVisibleBtn = document.createElement('button');
    unselectVisibleBtn.type = 'button';
    unselectVisibleBtn.className = 'building-filter-btn';
    unselectVisibleBtn.textContent = '-Vis';
    unselectVisibleBtn.title = 'Unselect Visible';
    unselectVisibleBtn.setAttribute('aria-label', 'Unselect Visible');
    unselectVisibleBtn.addEventListener('click', () => {
      filterListScrollTop = list.scrollTop;
      const next = acceptedSet ? new Set(acceptedSet) : new Set(allKeys);
      for (const row of rows) {
        if (row.style.display === 'none') continue;
        if (row.dataset.rejected === 'true') continue;
        if (row.dataset.itemKey) next.delete(row.dataset.itemKey);
      }
      setBuildingAcceptedItems(building, Array.from(next));
      refresh();
    });
    toolbar.appendChild(unselectVisibleBtn);

    wrap.appendChild(toolbar);

    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'building-filter-search';
    search.placeholder = 'Search accepted items...';
    search.setAttribute('aria-label', 'Search accepted items');
    search.value = filterSearchText;
    wrap.appendChild(search);

    const list = document.createElement('div');
    list.className = 'building-filter-list';

    const rows = [];

    for (const item of catalog) {
      const row = document.createElement('div');
      row.className = 'building-filter-item';
      row.dataset.searchText = String(item.label || '').toLowerCase();
      row.dataset.itemKey = item.key;

      const toggleWrap = document.createElement('label');
      toggleWrap.className = 'building-filter-toggle';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      // If this item is explicitly rejected by the building, show it as
      // unchecked and disabled so the user can't toggle it here.
      const isRejected = Array.isArray(building.rejectItemKeys) && building.rejectItemKeys.includes(item.key);
      row.dataset.rejected = isRejected ? 'true' : 'false';
      checkbox.checked = isRejected ? false : (!acceptedSet || acceptedSet.has(item.key));
      if (isRejected) checkbox.disabled = true;
      checkbox.addEventListener('change', () => {
        filterListScrollTop = list.scrollTop;
        const next = acceptedSet ? new Set(acceptedSet) : new Set(allKeys);
        if (checkbox.checked) next.add(item.key);
        else next.delete(item.key);
        setBuildingAcceptedItems(building, Array.from(next));
        refresh();
      });

      const text = document.createElement('span');
      text.className = 'building-filter-item-name';
      text.textContent = item.label;

      toggleWrap.appendChild(checkbox);
      toggleWrap.appendChild(text);

      const limitWrap = document.createElement('div');
      limitWrap.className = 'building-filter-limit';

      const limitLabel = document.createElement('span');
      limitLabel.className = 'building-filter-limit-label';
      limitLabel.textContent = 'Max';

      const limitInput = document.createElement('input');
      limitInput.type = 'number';
      limitInput.min = '0';
      limitInput.step = '1';
      limitInput.className = 'building-filter-limit-input';
      limitInput.dataset.itemKey = item.key;
      limitInput.placeholder = '∞';
      limitInput.setAttribute('aria-label', `${item.label} max allowed`);
      const currentLimit = typeof building.getItemLimit === 'function'
        ? building.getItemLimit(item.key)
        : (building.itemLimitByKey && Object.prototype.hasOwnProperty.call(building.itemLimitByKey, item.key)
          ? building.itemLimitByKey[item.key]
          : null);
      limitInput.value = Number.isFinite(currentLimit) ? String(currentLimit) : '';
      if (isRejected) limitInput.disabled = true;
      limitInput.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      limitInput.addEventListener('keydown', (event) => {
        event.stopPropagation();
      });
      limitInput.addEventListener('change', () => {
        filterListScrollTop = list.scrollTop;
        const nextValue = String(limitInput.value || '').trim();
        setBuildingItemLimit(building, item.key, nextValue === '' ? null : nextValue);
        refresh();
      });

      limitWrap.appendChild(limitLabel);
      limitWrap.appendChild(limitInput);

      row.appendChild(toggleWrap);
      row.appendChild(limitWrap);
      list.appendChild(row);
      rows.push(row);
    }

    const empty = document.createElement('div');
    empty.className = 'building-filter-empty';
    empty.textContent = 'No accepted items match your search.';
    list.appendChild(empty);

    function applySearch(query) {
      const q = String(query || '').trim().toLowerCase();
      let shown = 0;
      for (const row of rows) {
        const match = !q || row.dataset.searchText.includes(q);
        row.style.display = match ? 'flex' : 'none';
        if (match) shown += 1;
      }
      empty.style.display = shown > 0 ? 'none' : 'block';
    }

    search.addEventListener('input', () => {
      filterSearchText = search.value || '';
      applySearch(filterSearchText);
    });

    list.addEventListener('scroll', () => {
      filterListScrollTop = list.scrollTop;
    });

    applySearch(filterSearchText);

    wrap.appendChild(list);
    buildingFiltersEl.appendChild(wrap);
    list.scrollTop = filterListScrollTop;
    restoreInputState(buildingFiltersEl, inputState);
  }

  function renderSelectedSettings(building) {
    if (!buildingSettingsEl) return;
    const inputState = captureInputState(buildingSettingsEl);
    buildingSettingsEl.innerHTML = '';
    if (!building || typeof renderBuildingSettings !== 'function') return;
    renderBuildingSettings(building, buildingSettingsEl, { refresh });
    restoreInputState(buildingSettingsEl, inputState);
  }

  function renderSelectedPanel(building) {
    const hasSelection = !!building;
    if (buildingsListEl) buildingsListEl.classList.toggle('hidden', hasSelection);
    if (buildingSelectedPanelEl) buildingSelectedPanelEl.classList.toggle('active', hasSelection);

    renderSelectedSummary(building);
    renderSelectedActions(building);
    renderSelectedSettings(building);
    renderSelectedFilters(building);
  }

  function refresh() {
    if (!buildingsListEl) return;

    const selectedBuilding = getCurrentSelectedBuilding();
    const selectedKey = getBuildingKey(selectedBuilding);
    const selectedAccepted = Array.isArray(selectedBuilding?.acceptedItemKeys)
      ? selectedBuilding.acceptedItemKeys.join('|')
      : '*';
    const selectedRejected = Array.isArray(selectedBuilding?.rejectItemKeys)
      ? selectedBuilding.rejectItemKeys.join('|')
      : '*';
    const selectedItemLimits = selectedBuilding?.itemLimitByKey
      ? JSON.stringify(selectedBuilding.itemLimitByKey)
      : '*';
    const selectedStored = selectedBuilding?.itemStorage
      ? countStoredItems(selectedBuilding)
      : -1;
    const selectedSettings = selectedBuilding && typeof getBuildingSettingsSignature === 'function'
      ? getBuildingSettingsSignature(selectedBuilding)
      : '';

    const signature = JSON.stringify(game.buildings.map(b => ({
      kind: b.kind,
      x: b.x,
      y: b.y,
      owner: b.owner || 'neutral',
      complete: !!b.isConstructed,
      progress: Number(b.buildCompletion || 0),
      accepted: Array.isArray(b.acceptedItemKeys) ? b.acceptedItemKeys.join('|') : '*',
      rejected: Array.isArray(b.rejectItemKeys) ? b.rejectItemKeys.join('|') : '*',
      itemLimits: b.itemLimitByKey ? JSON.stringify(b.itemLimitByKey) : '*'
    })).concat([{ selectedKey, selectedAccepted, selectedRejected, selectedItemLimits, selectedStored, selectedSettings }]));
    if (signature === lastSignature) return;
    lastSignature = signature;

    buildingsListEl.innerHTML = '';

    if (!game.buildings.length) {
      const empty = document.createElement('div');
      empty.className = 'buildings-empty';
      empty.textContent = 'No buildings placed yet.';
      buildingsListEl.appendChild(empty);
      renderSelectedPanel(null);
      return;
    }

    for (const building of game.buildings) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'building-map-item';
      if (selectedBuilding === building) item.classList.add('selected');

      const title = document.createElement('div');
      title.className = 'building-map-title';
      title.textContent = getBuildingName(building);

      const meta = document.createElement('div');
      meta.className = 'building-map-meta';
      meta.textContent = `${getBuildingStatusText(building)} | ${capitalize(building.owner || 'neutral')} | @${building.x},${building.y}`;

      item.appendChild(title);
      item.appendChild(meta);

      item.addEventListener('click', () => {
        if (typeof onSelectBuilding === 'function') onSelectBuilding(building);
      });

      buildingsListEl.appendChild(item);
    }

    renderSelectedPanel(selectedBuilding);
  }

  function init(elements) {
    buildingsListEl = elements.buildingsListEl || null;
    buildingSelectedSummaryEl = elements.buildingSelectedSummaryEl || null;
    buildingActionsEl = elements.buildingActionsEl || null;
    buildingSettingsEl = elements.buildingSettingsEl || null;
    buildingFiltersEl = elements.buildingFiltersEl || null;
    buildingSelectedPanelEl = elements.buildingSelectedPanelEl
      || buildingSelectedSummaryEl?.closest('.building-selected-panel')
      || null;
    refresh();
  }

  return {
    init,
    refresh
  };
}
