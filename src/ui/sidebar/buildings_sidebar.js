export function createBuildingsSidebarController(deps) {
  const {
    game,
    capitalize,
    onSelectBuilding
  } = deps;

  let buildingsListEl = null;
  let lastSignature = '';

  function getBuildingName(building) {
    return building?.name || capitalize(building?.kind || 'building');
  }

  function getBuildingStatusText(building) {
    if (!building) return 'Unknown';
    if (building.isConstructed) return 'Complete';
    const pct = Math.max(0, Math.min(100, Math.round((building.buildCompletion || 0) * 100)));
    return `Under Construction (${pct}%)`;
  }

  function refresh() {
    if (!buildingsListEl) return;

    const signature = JSON.stringify(game.buildings.map(b => ({
      kind: b.kind,
      x: b.x,
      y: b.y,
      complete: !!b.isConstructed,
      progress: Number(b.buildCompletion || 0)
    })));
    if (signature === lastSignature) return;
    lastSignature = signature;

    buildingsListEl.innerHTML = '';

    if (!game.buildings.length) {
      const empty = document.createElement('div');
      empty.className = 'buildings-empty';
      empty.textContent = 'No buildings placed yet.';
      buildingsListEl.appendChild(empty);
      return;
    }

    for (const building of game.buildings) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'building-map-item';

      const title = document.createElement('div');
      title.className = 'building-map-title';
      title.textContent = getBuildingName(building);

      const meta = document.createElement('div');
      meta.className = 'building-map-meta';
      meta.textContent = `${getBuildingStatusText(building)} | @${building.x},${building.y}`;

      item.appendChild(title);
      item.appendChild(meta);

      item.addEventListener('click', () => {
        if (typeof onSelectBuilding === 'function') onSelectBuilding(building);
      });

      buildingsListEl.appendChild(item);
    }
  }

  function init(elements) {
    buildingsListEl = elements.buildingsListEl || null;
    refresh();
  }

  return {
    init,
    refresh
  };
}
