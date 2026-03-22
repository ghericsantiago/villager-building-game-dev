export function createBuildSidebarController(deps) {
  const {
    game,
    getBuildEntries,
    getDeveloperBuildMode,
    formatBuildRules,
    onBuildModeInvalid,
    onSelectBuildMode
  } = deps;

  let buildListEl = null;
  let buildSearchEl = null;
  let buildSortTitleBtn = null;
  let buildSearchQuery = '';
  let buildSortDir = 'asc';
  let lastRenderSignature = '';

  function normalizedBuildSearch(value) {
    return String(value || '').trim().toLowerCase();
  }

  function matchesBuildSearch(entry) {
    if (!buildSearchQuery) return true;
    const text = [
      entry.label || '',
      entry.kind || '',
      entry.description || '',
      entry.group || '',
      entry.subgroup || ''
    ].join(' ').toLowerCase();
    return text.includes(buildSearchQuery);
  }

  function compareBuildEntries(a, b) {
    const nameCmp = String(a.label || '').localeCompare(String(b.label || ''));
    return buildSortDir === 'asc' ? nameCmp : -nameCmp;
  }

  function updateBuildSortHeadUI() {
    if (!buildSortTitleBtn) return;
    buildSortTitleBtn.classList.add('active');
    buildSortTitleBtn.textContent = `Title${buildSortDir === 'asc' ? ' ▲' : ' ▼'}`;
  }

  function toggleBuildTitleSort() {
    buildSortDir = buildSortDir === 'asc' ? 'desc' : 'asc';
    updateBuildSortHeadUI();
    refresh();
  }

  function getBuildDisableReason(def, count) {
    if (!def) return 'Unavailable';
    if (typeof getDeveloperBuildMode === 'function' && getDeveloperBuildMode()) return null;
    if (Number.isFinite(def.maxCount) && count >= def.maxCount) {
      return `Reached max count (${def.maxCount})`;
    }
    if (!game.hasRequiredBuildings(def.requiresBuildings)) {
      return 'Requirements not met';
    }
    if (!game.canAfford(def.cost)) {
      return 'Not enough resources';
    }
    return null;
  }

  function getEntries() {
    return (typeof getBuildEntries === 'function') ? (getBuildEntries() || []) : [];
  }

  function compareGroupedEntries(a, b) {
    const groupCmp = Number(a.groupOrder || 0) - Number(b.groupOrder || 0);
    if (groupCmp !== 0) return groupCmp;
    const subgroupCmp = Number(a.subgroupOrder || 0) - Number(b.subgroupOrder || 0);
    if (subgroupCmp !== 0) return subgroupCmp;
    return compareBuildEntries(a, b);
  }

  function createBuildButton(entry, currentBuildMode) {
    const disabledReason = getBuildDisableReason(entry.def, entry.count);
    const disabled = !!disabledReason;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'build-item';
    button.dataset.buildMode = entry.kind;
    button.disabled = disabled;
    button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    button.setAttribute('aria-pressed', currentBuildMode === entry.kind ? 'true' : 'false');
    if (currentBuildMode === entry.kind) button.classList.add('active');
    button.title = disabled ? `${entry.label}: ${disabledReason}` : entry.label;
    button.innerHTML = `
      <span class="build-icon" aria-hidden="true">${entry.icon || '🧱'}</span>
      <span class="build-meta">
        <span class="build-name">${entry.label}</span>
        <span class="build-desc">${entry.description || ''}</span>
        <span class="build-rules">${typeof formatBuildRules === 'function' ? formatBuildRules(entry.def) : ''}</span>
      </span>
    `;
    button.addEventListener('click', () => {
      if (disabled) return;
      if (typeof onSelectBuildMode === 'function') onSelectBuildMode(entry.kind);
    });
    if (disabled && currentBuildMode === entry.kind && typeof onBuildModeInvalid === 'function') {
      onBuildModeInvalid(entry.kind);
    }
    return button;
  }

  function renderGroupedEntries(entries, currentBuildMode) {
    buildListEl.innerHTML = '';
    if (entries.length <= 0) {
      const empty = document.createElement('div');
      empty.className = 'build-empty';
      empty.textContent = buildSearchQuery
        ? 'No buildable objects match your search.'
        : 'No buildable objects are currently available.';
      buildListEl.appendChild(empty);
      return;
    }

    let currentGroupKey = '';
    let currentSubgroupKey = '';
    let currentSection = null;
    let currentSubgroupList = null;

    for (const entry of entries) {
      const groupKey = `${entry.group || 'Objects'}::${entry.groupOrder || 0}`;
      const subgroupKey = `${entry.subgroup || 'General'}::${entry.subgroupOrder || 0}`;
      if (groupKey !== currentGroupKey) {
        currentGroupKey = groupKey;
        currentSubgroupKey = '';
        currentSection = document.createElement('section');
        currentSection.className = 'build-group';

        const title = document.createElement('div');
        title.className = 'build-group-title';
        title.textContent = entry.group || 'Objects';
        currentSection.appendChild(title);
        buildListEl.appendChild(currentSection);
      }

      if (subgroupKey !== currentSubgroupKey) {
        currentSubgroupKey = subgroupKey;
        const subgroup = document.createElement('div');
        subgroup.className = 'build-subgroup';

        const subgroupTitle = document.createElement('div');
        subgroupTitle.className = 'build-subgroup-title';
        subgroupTitle.textContent = entry.subgroup || 'General';
        subgroup.appendChild(subgroupTitle);

        currentSubgroupList = document.createElement('div');
        currentSubgroupList.className = 'build-subgroup-list';
        subgroup.appendChild(currentSubgroupList);
        currentSection.appendChild(subgroup);
      }

      currentSubgroupList.appendChild(createBuildButton(entry, currentBuildMode));
    }
  }

  function refresh(currentBuildMode = null) {
    if (!buildListEl) return;

    const entries = getEntries().map((entry) => ({
      ...entry,
      count: game.countBuildings(entry.kind),
      maxCount: entry.def?.maxCount
    }));

    const visible = entries.filter((e) => {
      if (!matchesBuildSearch(e)) return false;
      if (!(typeof getDeveloperBuildMode === 'function' && getDeveloperBuildMode()) && Number.isFinite(e.maxCount) && e.count >= e.maxCount) {
        if (currentBuildMode === e.kind && typeof onBuildModeInvalid === 'function') {
          onBuildModeInvalid(e.kind);
        }
        return false;
      }
      return true;
    });
    visible.sort(compareGroupedEntries);

    const entryState = entries.map((entry) => {
      const disableReason = getBuildDisableReason(entry.def, entry.count);
      const isVisible = visible.includes(entry);
      return {
        kind: entry.kind,
        count: entry.count,
        visible: isVisible,
        disabled: !!disableReason,
        disableReason: disableReason || ''
      };
    });

    const signature = JSON.stringify({
      buildSearchQuery,
      buildSortDir,
      developerBuildMode: !!(typeof getDeveloperBuildMode === 'function' && getDeveloperBuildMode()),
      currentBuildMode: currentBuildMode || '',
      entryState
    });

    if (signature === lastRenderSignature) return;
    lastRenderSignature = signature;

    renderGroupedEntries(visible, currentBuildMode);
  }

  function init(elements) {
    buildListEl = elements.buildListEl || null;
    buildSearchEl = elements.buildSearchEl || null;
    buildSortTitleBtn = elements.buildSortTitleBtn || null;

    if (buildSearchEl) {
      buildSearchEl.addEventListener('input', () => {
        buildSearchQuery = normalizedBuildSearch(buildSearchEl.value);
        refresh();
      });
    }
    if (buildSortTitleBtn) buildSortTitleBtn.addEventListener('click', toggleBuildTitleSort);
    updateBuildSortHeadUI();
    refresh();
  }

  return {
    init,
    refresh
  };
}
