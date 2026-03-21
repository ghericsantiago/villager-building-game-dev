export function createBuildSidebarController(deps) {
  const {
    game,
    getStockpileDefinition,
    getStorageDefinition,
    getHorseWagonDefinition,
    getCarpentryWorkshopDefinition,
    getMasonryWorkshopDefinition,
    getDeveloperBuildMode,
    capitalize,
    onBuildModeInvalid
  } = deps;

  let buildListEl = null;
  let buildSearchEl = null;
  let buildSortTitleBtn = null;
  let buildStockpileBtn = null;
  let buildStorageBtn = null;
  let buildHorseWagonBtn = null;
  let buildCarpentryWorkshopBtn = null;
  let buildMasonryWorkshopBtn = null;
  let buildSearchQuery = '';
  let buildSortDir = 'asc';
  let lastRenderSignature = '';

  function normalizedBuildSearch(value) {
    return String(value || '').trim().toLowerCase();
  }

  function matchesBuildSearch(label, kind) {
    if (!buildSearchQuery) return true;
    const text = `${label || ''} ${kind || ''}`.toLowerCase();
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

  function refresh(currentBuildMode = null) {
    if (!buildListEl) return;

    const entries = [];
    const stockpileDef = getStockpileDefinition();
    if (buildStockpileBtn && stockpileDef) {
      entries.push({
        btn: buildStockpileBtn,
        def: stockpileDef,
        kind: stockpileDef.kind,
        label: stockpileDef.name || capitalize(stockpileDef.kind),
        count: game.countBuildings(stockpileDef.kind),
        maxCount: stockpileDef.maxCount
      });
    }
    const storageDef = getStorageDefinition();
    if (buildStorageBtn && storageDef) {
      entries.push({
        btn: buildStorageBtn,
        def: storageDef,
        kind: storageDef.kind,
        label: storageDef.name || capitalize(storageDef.kind),
        count: game.countBuildings(storageDef.kind),
        maxCount: storageDef.maxCount
      });
    }
    const horseWagonDef = getHorseWagonDefinition();
    if (buildHorseWagonBtn && horseWagonDef) {
      entries.push({
        btn: buildHorseWagonBtn,
        def: horseWagonDef,
        kind: horseWagonDef.kind,
        label: horseWagonDef.name || capitalize(horseWagonDef.kind),
        count: game.countBuildings(horseWagonDef.kind),
        maxCount: horseWagonDef.maxCount
      });
    }
    const carpentryWorkshopDef = getCarpentryWorkshopDefinition();
    if (buildCarpentryWorkshopBtn && carpentryWorkshopDef) {
      entries.push({
        btn: buildCarpentryWorkshopBtn,
        def: carpentryWorkshopDef,
        kind: carpentryWorkshopDef.kind,
        label: carpentryWorkshopDef.name || capitalize(carpentryWorkshopDef.kind),
        count: game.countBuildings(carpentryWorkshopDef.kind),
        maxCount: carpentryWorkshopDef.maxCount
      });
    }
    const masonryWorkshopDef = getMasonryWorkshopDefinition();
    if (buildMasonryWorkshopBtn && masonryWorkshopDef) {
      entries.push({
        btn: buildMasonryWorkshopBtn,
        def: masonryWorkshopDef,
        kind: masonryWorkshopDef.kind,
        label: masonryWorkshopDef.name || capitalize(masonryWorkshopDef.kind),
        count: game.countBuildings(masonryWorkshopDef.kind),
        maxCount: masonryWorkshopDef.maxCount
      });
    }

    const visible = entries.filter((e) => {
      if (!matchesBuildSearch(e.label, e.kind)) return false;
      if (!(typeof getDeveloperBuildMode === 'function' && getDeveloperBuildMode()) && Number.isFinite(e.maxCount) && e.count >= e.maxCount) {
        if (currentBuildMode === e.kind && typeof onBuildModeInvalid === 'function') {
          onBuildModeInvalid(e.kind);
        }
        return false;
      }
      return true;
    });
    visible.sort(compareBuildEntries);

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

    for (const e of entries) e.btn.style.display = 'none';
    for (const e of visible) {
      const disableReason = getBuildDisableReason(e.def, e.count);
      const disabled = !!disableReason;
      e.btn.disabled = disabled;
      e.btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      e.btn.title = disabled ? `${e.label}: ${disableReason}` : e.label;
      if (disabled && currentBuildMode === e.kind && typeof onBuildModeInvalid === 'function') {
        onBuildModeInvalid(e.kind);
      }
      e.btn.style.display = '';
      buildListEl.appendChild(e.btn);
    }
  }

  function init(elements) {
    buildListEl = elements.buildListEl || null;
    buildSearchEl = elements.buildSearchEl || null;
    buildSortTitleBtn = elements.buildSortTitleBtn || null;
    buildStockpileBtn = elements.buildStockpileBtn || null;
    buildStorageBtn = elements.buildStorageBtn || null;
    buildHorseWagonBtn = elements.buildHorseWagonBtn || null;
    buildCarpentryWorkshopBtn = elements.buildCarpentryWorkshopBtn || null;
    buildMasonryWorkshopBtn = elements.buildMasonryWorkshopBtn || null;

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
