export function createBuildSidebarController(deps) {
  const {
    game,
    getStockpileDefinition,
    getStorageDefinition,
    getHorseWagonDefinition,
    capitalize,
    onBuildModeInvalid
  } = deps;

  let buildListEl = null;
  let buildSearchEl = null;
  let buildSortTitleBtn = null;
  let buildStockpileBtn = null;
  let buildStorageBtn = null;
  let buildHorseWagonBtn = null;
  let buildSearchQuery = '';
  let buildSortDir = 'asc';

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

  function refresh(currentBuildMode = null) {
    if (!buildListEl) return;

    const entries = [];
    const stockpileDef = getStockpileDefinition();
    if (buildStockpileBtn && stockpileDef) {
      entries.push({
        btn: buildStockpileBtn,
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
        kind: horseWagonDef.kind,
        label: horseWagonDef.name || capitalize(horseWagonDef.kind),
        count: game.countBuildings(horseWagonDef.kind),
        maxCount: horseWagonDef.maxCount
      });
    }

    const visible = entries.filter(e => matchesBuildSearch(e.label, e.kind));
    visible.sort(compareBuildEntries);

    for (const e of entries) e.btn.style.display = 'none';
    for (const e of visible) {
      const reachedMax = Number.isFinite(e.maxCount) && e.count >= e.maxCount;
      e.btn.disabled = reachedMax;
      e.btn.setAttribute('aria-disabled', reachedMax ? 'true' : 'false');
      if (reachedMax && currentBuildMode === e.kind && typeof onBuildModeInvalid === 'function') {
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
