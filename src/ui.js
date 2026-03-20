import { TILE, COLS, ROWS, resourceTypes, zoomIn, zoomOut, setZoom, BASE_TILE, ZOOM } from './util.js';
import { game } from './gameState.js';
import { createNpcByType, NPC_TYPES } from './npcs/index.js';
import { Task } from './task.js';
import { resourceIcons, resourcePalette } from './resources/resource_ui.js';
import { toolDisplayName, toolSprite, TOOL_DEFINITIONS } from './items/tools.js';
import { materialDisplayName, materialIcon, materialSprite, MATERIAL_DEFINITIONS } from './items/materials.js';
import {
  getNpcJobsFor,
  npcSupportsJobs,
  npcDisplayName as getNpcDisplayName,
  formatTaskLabel as formatNpcTaskLabel
} from './npcs/npc_ui.js';
import { StockpileBuilding } from './buildings/stockpile/stockpile.js';
import { StorageBuilding } from './buildings/storage/storage.js';
import {
  getStockpileDefinition as getStockpileDefinitionUI,
  drawStockpileTile as drawStockpileTileUI,
  drawPlacedStockpiles as drawPlacedStockpilesUI
} from './buildings/stockpile/stockpile_ui.js';
import {
  getStorageDefinition as getStorageDefinitionUI,
  drawStorageTile as drawStorageTileUI,
  drawPlacedStorages as drawPlacedStoragesUI
} from './buildings/storage/storage_ui.js';
import { HorseWagonBuilding } from './buildings/horse_wagon/horse_wagon.js';
import {
  getHorseWagonDefinition as getHorseWagonDefinitionUI,
  drawHorseWagonTile as drawHorseWagonTileUI,
  drawPlacedHorseWagons as drawPlacedHorseWagonsUI
} from './buildings/horse_wagon/horse_wagon_ui.js';
import { initSidebarTabs } from './ui/sidebar/sidebar_tabs.js';
import { createBuildSidebarController } from './ui/sidebar/build_sidebar.js';
import { createBuildingsSidebarController } from './ui/sidebar/buildings_sidebar.js';
import { createStorageSidebarController } from './ui/sidebar/storage_sidebar.js';
import { createNpcSidebarController } from './ui/sidebar/npc_sidebar.js';
import { createLogsSidebarController } from './ui/sidebar/logs_sidebar.js';
import { createAlertSystem } from './ui/alert_system.js';
import { subscribeGameAlerts, publishGameAlert } from './ui/alerts_bus.js';
import { drawSpriteInRect } from './ui/sprite_renderer.js';

let canvas, ctx, npcListEl, storageListEl, logsListEl, buildingsListEl, selectedNpcId=null;
let buildSidebar = null;
let buildingsSidebar = null;
let storageSidebar = null;
let npcSidebar = null;
let logsSidebar = null;
let buildStockpileBtn = null;
let buildStorageBtn = null;
let buildHorseWagonBtn = null;
let selectedResource = null;
let hoveredResource = null;
let markedGatherResources = [];
let previewMarkedResources = [];
let rightDragSelect = {
  active: false,
  hasDragged: false,
  startWorldX: 0,
  startWorldY: 0,
  currentWorldX: 0,
  currentWorldY: 0
};
let suppressNextContextMenu = false;
let hoveredNpcId = null;
let selectedBuilding = null;
let hoveredBuilding = null;
let buildMode = null;
let buildHoverTile = null;
let resourceInfoEl = null;
let npcInfoEl = null;
let buildingInfoEl = null;
let alertSystem = null;
let unsubscribeAlerts = null;

function capitalize(s){ return s && s[0] ? (s[0].toUpperCase() + s.slice(1)) : s }

function npcDisplayName(n){
  return getNpcDisplayName(n);
}

function formatTaskLabel(t){
  return formatNpcTaskLabel(t, capitalize);
}

function getBuildingFilterCatalog() {
  const toolItems = Object.values(TOOL_DEFINITIONS).map(def => ({
    key: def.key,
    label: `Tool: ${def.name}`
  }));
  const materialItems = Object.values(MATERIAL_DEFINITIONS).map(def => ({
    key: def.key,
    label: `Material: ${def.name}`
  }));
  return [...toolItems, ...materialItems].sort((a, b) => a.label.localeCompare(b.label));
}

function activateSidebarPanel(panelId) {
  const btn = document.querySelector(`#sidebarMenu .menu-btn[data-panel="${panelId}"]`);
  if (btn) btn.click();
}

function refreshBuildListUI() {
  if (buildSidebar) buildSidebar.refresh(buildMode);
}

// return a canvas font size appropriate for current TILE
function fontForTile(scale=1){
  const px = Math.max(6, Math.round(TILE * 0.32 * scale));
  return `${px}px sans-serif`;
}

// viewport size in CSS pixels available for the map canvas
let mapViewportW = BASE_TILE * 20;
let mapViewportH = BASE_TILE * 20;
function viewCols(){ return Math.max(3, Math.min(COLS, Math.floor(mapViewportW / TILE))); }
function viewRows(){ return Math.max(3, Math.min(ROWS, Math.floor(mapViewportH / TILE))); }
let cameraX = 0; // top-left tile index (float for smooth pan)
let cameraY = 0;
let lastMouseCanvasX = null, lastMouseCanvasY = null, mouseInCanvas = false;
const EDGE_PAN_PX = 48; // pixels from edge to start panning
const PAN_SPEED_TILES_PER_SEC = 10;
const SHIFT_PAN_MULTIPLIER = 4;
const RESOURCE_DRAG_SELECT_THRESHOLD_PX = 6;
let keyboardPanX = 0, keyboardPanY = 0;
let shiftPanBoost = false;
let renderResourceRows = new Map();
let renderResourceCount = -1;

function getStockpileDefinition(){
  return getStockpileDefinitionUI();
}

function getStorageDefinition(){
  return getStorageDefinitionUI();
}

function getHorseWagonDefinition(){
  return getHorseWagonDefinitionUI();
}

function formatBuildingRules(def){
  const currentCount = game.countBuildings(def.kind);
  const footprint = def.footprint || { w: 1, h: 1 };
  const tilesConsumed = Math.max(1, Number(footprint.w || 1)) * Math.max(1, Number(footprint.h || 1));
  const tilesText = `Tiles: ${footprint.w || 1}x${footprint.h || 1} (${tilesConsumed})`;
  const remainingText = Number.isFinite(def.maxCount)
    ? `Remaining: ${Math.max(0, def.maxCount - currentCount)}`
    : 'Remaining: Unlimited';
  const depsText = (def.requiresBuildings && def.requiresBuildings.length)
    ? `Deps: ${def.requiresBuildings.map(d => `${capitalize(d.kind)} x${d.count ?? 1}`).join(', ')}`
    : 'Deps: None';
  const costEntries = Object.entries(def.cost || {});
  const costText = costEntries.length
    ? `Cost: ${costEntries.map(([k, v]) => `${capitalize(k)} ${v}`).join(', ')}`
    : 'Cost: Free';
  const buildDiffText = `Build Diff: x${Number(def.buildDifficulty ?? 1).toFixed(2)}`;
  return `${tilesText} | ${remainingText} | ${depsText} | ${costText} | ${buildDiffText}`;
}

function updateBuildRulesText(){
  const stockpileRulesEl = document.getElementById('stockpileBuildRules');
  if (stockpileRulesEl) stockpileRulesEl.textContent = formatBuildingRules(getStockpileDefinition());
  const storageRulesEl = document.getElementById('storageBuildRules');
  if (storageRulesEl) storageRulesEl.textContent = formatBuildingRules(getStorageDefinition());
  const horseWagonRulesEl = document.getElementById('horseWagonBuildRules');
  if (horseWagonRulesEl) horseWagonRulesEl.textContent = formatBuildingRules(getHorseWagonDefinition());
  refreshBuildListUI();
}

function setBuildMode(mode){
  buildMode = mode;
  if (!mode) buildHoverTile = null;
  if (buildStockpileBtn) {
    const stockpileActive = buildMode === 'stockpile';
    buildStockpileBtn.classList.toggle('active', stockpileActive);
    buildStockpileBtn.setAttribute('aria-pressed', stockpileActive ? 'true' : 'false');
  }
  if (buildStorageBtn) {
    const storageActive = buildMode === 'storage';
    buildStorageBtn.classList.toggle('active', storageActive);
    buildStorageBtn.setAttribute('aria-pressed', storageActive ? 'true' : 'false');
  }
  if (buildHorseWagonBtn) {
    const horseWagonActive = buildMode === 'horseWagon';
    buildHorseWagonBtn.classList.toggle('active', horseWagonActive);
    buildHorseWagonBtn.setAttribute('aria-pressed', horseWagonActive ? 'true' : 'false');
  }
}

function layoutCanvasCssSize(){
  if(!canvas) return;
  const appEl = document.getElementById('app');
  const uiEl = document.getElementById('ui');
  const appRect = appEl ? appEl.getBoundingClientRect() : canvas.getBoundingClientRect();
  const uiRect = uiEl ? uiEl.getBoundingClientRect() : { width: 0 };
  const availW = Math.max(1, Math.floor(appRect.width - uiRect.width));
  const availH = Math.max(1, Math.floor(appRect.height));
  mapViewportW = Math.max(TILE * 3, availW);
  mapViewportH = Math.max(TILE * 3, availH);
  const cols = viewCols();
  const rows = viewRows();
  canvas.width = cols * TILE;
  canvas.height = rows * TILE;
  // Scale canvas in CSS so it always fits available area (full map remains centered when zoomed out).
  const scaleX = availW / Math.max(1, canvas.width);
  const scaleY = availH / Math.max(1, canvas.height);
  const cssScale = Math.max(0.01, Math.min(scaleX, scaleY));
  canvas.style.width = `${Math.max(1, Math.floor(canvas.width * cssScale))}px`;
  canvas.style.height = `${Math.max(1, Math.floor(canvas.height * cssScale))}px`;
  // clamp camera to valid bounds after viewport size changes
  cameraX = Math.max(0, Math.min(COLS - cols, cameraX));
  cameraY = Math.max(0, Math.min(ROWS - rows, cameraY));
  updateResourceInfoPosition();
  updateNpcInfoPosition();
}

function clientToCanvasPx(clientX, clientY){
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / Math.max(1, rect.width);
  const scaleY = canvas.height / Math.max(1, rect.height);
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

function tilePointFromClient(clientX, clientY, tileSize){
  const p = clientToCanvasPx(clientX, clientY);
  return {
    tileX: cameraX + (p.x / tileSize),
    tileY: cameraY + (p.y / tileSize)
  };
}

function ensureResourceRenderIndex(){
  if (renderResourceCount === game.resources.length && renderResourceRows.size > 0) return;
  renderResourceRows = new Map();
  for (const r of game.resources) {
    let row = renderResourceRows.get(r.y);
    if (!row) {
      row = [];
      renderResourceRows.set(r.y, row);
    }
    row.push(r);
  }
  for (const row of renderResourceRows.values()) {
    row.sort((a, b) => a.x - b.x);
  }
  renderResourceCount = game.resources.length;
}

function getResourceAtTile(tx, ty){
  return game.getResourceAtTile(tx, ty);
}

function isResourceMarked(res) {
  return markedGatherResources.includes(res);
}

function isResourcePreviewMarked(res) {
  return previewMarkedResources.includes(res);
}

function pruneMarkedGatherResources() {
  markedGatherResources = markedGatherResources.filter(r => r && r.amount > 0 && game.resources.includes(r));
}

function getResourcesInWorldRect(x1, y1, x2, y2) {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const selected = [];

  for (const r of game.resources) {
    if (!r || Number(r.amount || 0) <= 0) continue;
    const rw = (r.footprint?.w || 1) * TILE;
    const rh = (r.footprint?.h || 1) * TILE;
    const rx1 = r.x * TILE;
    const ry1 = r.y * TILE;
    const rx2 = rx1 + rw;
    const ry2 = ry1 + rh;
    const intersects = !(rx2 < left || rx1 > right || ry2 < top || ry1 > bottom);
    if (intersects) selected.push(r);
  }

  return selected;
}

function updateRightDragSelectionPreview() {
  if (!rightDragSelect.active || !rightDragSelect.hasDragged) {
    previewMarkedResources = [];
    return;
  }
  previewMarkedResources = getResourcesInWorldRect(
    rightDragSelect.startWorldX,
    rightDragSelect.startWorldY,
    rightDragSelect.currentWorldX,
    rightDragSelect.currentWorldY
  );
}

function queueMarkedResourcesForSelectedNpc(options = {}) {
  const startImmediately = options.startImmediately !== false;
  pruneMarkedGatherResources();
  const npc = game.npcs.find(n => n.id === selectedNpcId);
  if (!npc || markedGatherResources.length <= 0) return 0;

  const resourcesToQueue = [...markedGatherResources];
  for (const res of resourcesToQueue) {
    npc.enqueue(new Task('gatherTile', res));
  }

  if (startImmediately && !npc.currentTask) {
    npc.popNextTask(game);
  }

  const queuedCount = markedGatherResources.length;
  markedGatherResources = [];
  refreshNPCList();
  publishGameAlert({
    level: 'info',
    title: 'Tasks Queued',
    message: `${npcDisplayName(npc)} queued ${queuedCount} gather task${queuedCount === 1 ? '' : 's'}.`,
    dedupeKey: `queued-marked-resources-${npc.id}`,
    dedupeMs: 1200,
    trackIssue: false
  });
  return queuedCount;
}

function queueMarkedResourcesForIdleManualNpcs(options = {}) {
  const startImmediately = options.startImmediately !== false;
  pruneMarkedGatherResources();
  if (markedGatherResources.length <= 0) return 0;

  const eligibleNpcs = game.npcs.filter((npc) => {
    const manualJob = !npc.job || npc.job === 'none';
    const noActiveTask = !npc.currentTask;
    const emptyQueue = !Array.isArray(npc.tasks) || npc.tasks.length <= 0;
    return manualJob && noActiveTask && emptyQueue;
  });

  if (eligibleNpcs.length <= 0) {
    publishGameAlert({
      level: 'warning',
      title: 'No Idle Villagers',
      message: 'No idle villagers with No Job (Manual) are available.',
      dedupeKey: 'no-idle-manual-villagers',
      dedupeMs: 1200,
      trackIssue: false
    });
    return 0;
  }

  const resourcesToQueue = [...markedGatherResources];

  // Give every eligible worker the full list, but rotate order so they start on different targets.
  for (let npcIndex = 0; npcIndex < eligibleNpcs.length; npcIndex += 1) {
    const npc = eligibleNpcs[npcIndex];
    for (let offset = 0; offset < resourcesToQueue.length; offset += 1) {
      const idx = (offset + npcIndex) % resourcesToQueue.length;
      npc.enqueue(new Task('gatherTile', resourcesToQueue[idx]));
    }
  }

  if (startImmediately) {
    for (const npc of eligibleNpcs) {
      if (!npc.currentTask && npc.tasks.length > 0) {
        npc.popNextTask(game);
      }
    }
  }

  const queuedCount = markedGatherResources.length;
  markedGatherResources = [];
  refreshNPCList();
  publishGameAlert({
    level: 'info',
    title: 'Tasks Queued',
    message: `Queued ${queuedCount} resource target${queuedCount === 1 ? '' : 's'} for each of ${eligibleNpcs.length} idle villager${eligibleNpcs.length === 1 ? '' : 's'}.`,
    dedupeKey: 'queued-marked-idle-manual-villagers',
    dedupeMs: 1200,
    trackIssue: false
  });
  return queuedCount;
}

function getBuildingAtTile(tx, ty){
  return game.buildings.find(b => (typeof b.occupiesTile === 'function') ? b.occupiesTile(tx, ty) : (b.x === tx && b.y === ty)) || null;
}

function buildingCenterWorldPx(b){
  const w = b?.footprint?.w || 1;
  const h = b?.footprint?.h || 1;
  return {
    x: (b.x + w / 2) * TILE,
    y: (b.y + h / 2) * TILE
  };
}

function getBuildingStoredTotal(b){
  if (!b || !b.itemStorage || !b.isConstructed) return 0;
  return Object.values(b.itemStorage).reduce((a, v) => a + (v || 0), 0);
}

function getTotalStorageCapacity(){
  return game.buildings.reduce((sum, b) => sum + (b.isConstructed ? (Number(b.storageCapacity) || 0) : 0), 0);
}

function getTotalStoredInBuildings(){
  return game.buildings.reduce((sum, b) => sum + getBuildingStoredTotal(b), 0);
}

function worldCenterTile(){
  return { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
}

function getNpcSpawnTile(){
  const firstDepot = game.getAllDepositTargets()[0] || null;
  return firstDepot ? { x: firstDepot.x, y: firstDepot.y } : worldCenterTile();
}

function spawnNpcAtTile(tx, ty){
  const id = game.npcs.length + 1;
  const n = createNpcByType(
    NPC_TYPES.PLAYER_WORKER,
    id,
    tx * TILE + TILE / 2,
    ty * TILE + TILE / 2
  );
  game.npcs.push(n);
  return n;
}

export function initUI(){
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  // size the canvas to fit available map viewport
  layoutCanvasCssSize();
  window.addEventListener('resize', layoutCanvasCssSize);

  // center camera on storage initially (or map center if none exists)
  if (game && game.storageTile) {
    cameraX = game.storageTile.x - Math.floor(viewCols()/2);
    cameraY = game.storageTile.y - Math.floor(viewRows()/2);
    cameraX = Math.max(0, Math.min(COLS - viewCols(), cameraX));
    cameraY = Math.max(0, Math.min(ROWS - viewRows(), cameraY));
  } else {
    const c = worldCenterTile();
    cameraX = c.x - Math.floor(viewCols() / 2);
    cameraY = c.y - Math.floor(viewRows() / 2);
    cameraX = Math.max(0, Math.min(COLS - viewCols(), cameraX));
    cameraY = Math.max(0, Math.min(ROWS - viewRows(), cameraY));
  }
  npcListEl = document.getElementById('npcList');
  storageListEl = document.getElementById('storageList');
  logsListEl = document.getElementById('logsList');
  buildingsListEl = document.getElementById('buildingsList');
  initSidebarTabs();
  buildStockpileBtn = document.getElementById('buildStockpileBtn');
  buildStorageBtn = document.getElementById('buildStorageBtn');
  buildHorseWagonBtn = document.getElementById('buildHorseWagonBtn');
  buildSidebar = createBuildSidebarController({
    game,
    getStockpileDefinition,
    getStorageDefinition,
    getHorseWagonDefinition,
    capitalize,
    onBuildModeInvalid: () => setBuildMode(null)
  });
  buildSidebar.init({
    buildListEl: document.getElementById('buildList'),
    buildSearchEl: document.getElementById('buildSearch'),
    buildSortTitleBtn: document.getElementById('buildSortTitle'),
    buildStockpileBtn,
    buildStorageBtn,
    buildHorseWagonBtn
  });
  buildingsSidebar = createBuildingsSidebarController({
    game,
    capitalize,
    getSelectedBuilding: () => selectedBuilding,
    onSelectBuilding: (building) => {
      selectedBuilding = building || null;
      if (!building) {
        hideBuildingInfo();
        refreshBuildings();
        return;
      }

      activateSidebarPanel('buildingsBox');

      selectedBuilding = building;
      selectedNpcId = null;
      selectedResource = null;
      hideResourceInfo();
      hideNpcInfo();
      showBuildingInfoFor(building);
      const c = buildingCenterWorldPx(building);
      focusCameraOnWorld(c.x, c.y);
      refreshBuildings();
    },
    onSetBuildingAcceptedItems: (building, acceptedItemKeys) => {
      if (!building) return;
      if (typeof building.setAcceptedItems === 'function') {
        building.setAcceptedItems(acceptedItemKeys);
      } else {
        building.acceptedItemKeys = Array.isArray(acceptedItemKeys) ? [...acceptedItemKeys] : null;
      }
      refreshBuildings();
    },
    getFilterItems: getBuildingFilterCatalog,
    onDestroyBuilding: (building) => {
      const result = game.destroyBuilding(building);
      if (!result?.removed) return;

      if (selectedBuilding === building) {
        selectedBuilding = null;
        hideBuildingInfo();
      }

      const refundText = Object.entries(result.refunded || {})
        .map(([k, v]) => `${capitalize(k)} x${v}`)
        .join(', ');
      publishGameAlert({
        level: 'info',
        title: 'Building Destroyed',
        message: refundText ? `Refunded ${refundText}.` : 'No refund for this building.',
        dedupeKey: `building-destroyed-${building.kind}-${building.x}-${building.y}`,
        trackIssue: false
      });

      refreshStorage();
      refreshBuildings();
      updateBuildRulesText();
      refreshNPCList();
    }
  });
  buildingsSidebar.init({
    buildingsListEl,
    buildingSelectedPanelEl: document.querySelector('#buildingsBox .building-selected-panel'),
    buildingSelectedSummaryEl: document.getElementById('buildingSelectedSummary'),
    buildingActionsEl: document.getElementById('buildingActions'),
    buildingFiltersEl: document.getElementById('buildingFilters')
  });
  storageSidebar = createStorageSidebarController({
    game,
    capitalize,
    toolDisplayName,
    toolSprite,
    materialDisplayName,
    materialIcon,
    materialSprite,
    getTotalStorageCapacity,
    getTotalStoredInBuildings
  });
  storageSidebar.init({
    storageListEl,
    storageSearchEl: document.getElementById('storageSearch')
  });
  npcSidebar = createNpcSidebarController({
    game,
    Task,
    npcSupportsJobs,
    getNpcJobsFor,
    npcDisplayName,
    formatTaskLabel,
    toolDisplayName,
    findNearestUnfinishedBuilding: (n) => game.findNearestUnfinishedBuilding(n),
    findNearestResourceOfType: (n, t) => game.findNearestResourceOfType(n, t),
    hideNpcInfo,
    getSelectedNpcId: () => selectedNpcId,
    setSelectedNpcId: (id) => {
      selectedNpcId = id;
      if (!id) markedGatherResources = [];
    },
    focusCameraOnWorld,
    onQueueMarkedResources: () => {
      queueMarkedResourcesForSelectedNpc();
      refreshNPCList();
    },
    getMarkedResourceCount: () => {
      pruneMarkedGatherResources();
      return markedGatherResources.length;
    }
  });
  npcSidebar.init({
    npcListSectionEl: document.getElementById('npcListSection'),
    npcListEl,
    npcSearchEl: document.getElementById('npcSearch'),
    npcSortNameBtn: document.getElementById('npcSortName'),
    npcSelectedPanelEl: document.getElementById('npcSelectedPanel'),
    npcSelectedSummaryEl: document.getElementById('npcSelectedSummary'),
    npcSelectedActionsEl: document.getElementById('npcSelectedActions'),
    npcSelectedSettingsEl: document.getElementById('npcSelectedSettings')
  });
  logsSidebar = createLogsSidebarController();
  logsSidebar.init({ logsListEl });
  updateBuildRulesText();
  alertSystem = createAlertSystem({ anchorCanvas: canvas });
  if (unsubscribeAlerts) unsubscribeAlerts();
  unsubscribeAlerts = subscribeGameAlerts((alert) => {
    if (alertSystem) alertSystem.notify(alert);
    if (logsSidebar) logsSidebar.ingestAlert(alert);
  });
  if (buildStockpileBtn) {
    buildStockpileBtn.addEventListener('click', () => {
      setBuildMode(buildMode === 'stockpile' ? null : 'stockpile');
    });
  }
  if (buildStorageBtn) {
    buildStorageBtn.addEventListener('click', () => {
      setBuildMode(buildMode === 'storage' ? null : 'storage');
    });
  }
  if (buildHorseWagonBtn) {
    buildHorseWagonBtn.addEventListener('click', () => {
      setBuildMode(buildMode === 'horseWagon' ? null : 'horseWagon');
    });
  }

  // resource info popup
  resourceInfoEl = document.getElementById('resourceInfo');
  if (!resourceInfoEl) {
    resourceInfoEl = document.createElement('div');
    resourceInfoEl.id = 'resourceInfo';
    resourceInfoEl.className = 'resource-info';
    resourceInfoEl.style.pointerEvents = 'none';
    document.body.appendChild(resourceInfoEl);
  }

  // npc info popup (for selected villager: carry & queued tasks)
  npcInfoEl = document.getElementById('npcInfo');
  if (!npcInfoEl) {
    npcInfoEl = document.createElement('div');
    npcInfoEl.id = 'npcInfo';
    npcInfoEl.className = 'resource-info';
    npcInfoEl.style.pointerEvents = 'none';
    npcInfoEl.style.display = 'none';
    document.body.appendChild(npcInfoEl);
  }

  buildingInfoEl = document.getElementById('buildingInfo');
  if (!buildingInfoEl) {
    buildingInfoEl = document.createElement('div');
    buildingInfoEl.id = 'buildingInfo';
    buildingInfoEl.className = 'resource-info';
    buildingInfoEl.style.pointerEvents = 'none';
    buildingInfoEl.style.display = 'none';
    document.body.appendChild(buildingInfoEl);
  }

  document.getElementById('addNpc').addEventListener('click', ()=>{
    const spawn = getNpcSpawnTile();
    spawnNpcAtTile(spawn.x, spawn.y);
    refreshNPCList();
  });

  // left-click: select NPC or resource (do not assign tasks)
  canvas.addEventListener('mousedown', (ev) => {
    if (ev.button !== 2) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (ev.clientX - rect.left) * scaleX;
    const my = (ev.clientY - rect.top) * scaleY;
    const worldMx = cameraX * TILE + mx;
    const worldMy = cameraY * TILE + my;

    rightDragSelect.active = true;
    rightDragSelect.hasDragged = false;
    rightDragSelect.startWorldX = worldMx;
    rightDragSelect.startWorldY = worldMy;
    rightDragSelect.currentWorldX = worldMx;
    rightDragSelect.currentWorldY = worldMy;
    previewMarkedResources = [];
  });

  canvas.addEventListener('mouseup', (ev) => {
    if (ev.button !== 2) return;
    if (!rightDragSelect.active) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (ev.clientX - rect.left) * scaleX;
    const my = (ev.clientY - rect.top) * scaleY;
    const worldMx = cameraX * TILE + mx;
    const worldMy = cameraY * TILE + my;
    rightDragSelect.currentWorldX = worldMx;
    rightDragSelect.currentWorldY = worldMy;

    if (rightDragSelect.hasDragged) {
      updateRightDragSelectionPreview();
      markedGatherResources = [...previewMarkedResources];
      previewMarkedResources = [];
      if (markedGatherResources.length > 0) {
        queueMarkedResourcesForIdleManualNpcs({ startImmediately: true });
      }
      suppressNextContextMenu = true;
      refreshNPCList();
    }

    rightDragSelect.active = false;
    rightDragSelect.hasDragged = false;
  });

  canvas.addEventListener('click', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (ev.clientX - rect.left) * scaleX;
    const my = (ev.clientY - rect.top) * scaleY;
    // convert to world coordinates
    const worldMx = cameraX * TILE + mx;
    const worldMy = cameraY * TILE + my;
    const tx = Math.floor(worldMx / TILE), ty = Math.floor(worldMy / TILE);

    if (buildMode === 'stockpile' || buildMode === 'storage' || buildMode === 'horseWagon') {
      const placedKind = buildMode;
      const issue = (buildMode === 'stockpile')
        ? getStockpilePlacementIssue(tx, ty)
        : (buildMode === 'storage')
          ? getStoragePlacementIssue(tx, ty)
          : getHorseWagonPlacementIssue(tx, ty);
      if (!issue) {
        const def = (buildMode === 'stockpile')
          ? getStockpileDefinition()
          : (buildMode === 'storage')
            ? getStorageDefinition()
            : getHorseWagonDefinition();
        if (game.spendCost(def.cost)) {
          if (buildMode === 'stockpile') {
            game.addBuilding(new StockpileBuilding(tx, ty));
          } else if (buildMode === 'storage') {
            game.addBuilding(new StorageBuilding(tx, ty));
          } else {
            game.addBuilding(new HorseWagonBuilding(tx, ty));
            let lastSpawned = null;
            for (let i = 0; i < 4; i += 1) {
              lastSpawned = spawnNpcAtTile(tx, ty);
            }
            if (lastSpawned) {
              selectedNpcId = lastSpawned.id;
              activateSidebarPanel('npcBox');
            }
            publishGameAlert({
              level: 'success',
              title: 'Village Founded',
              message: 'Horse Wagon placed. 4 villagers have joined your settlement.',
              dedupeKey: 'village-founded-horse-wagon',
              dedupeMs: 10000,
              trackIssue: false
            });
          }
          refreshStorage();
          refreshBuildings();
          updateBuildRulesText();
          refreshNPCList();
          console.log(`Placed ${placedKind} at ${tx},${ty}`);
        }
      } else {
        publishGameAlert({
          level: 'warning',
          title: 'Cannot Build',
          message: issue,
          dedupeKey: `build-issue-${buildMode}-${issue}`,
          dedupeMs: 2200,
          trackIssue: false
        });
        console.log(`Cannot place ${buildMode}: ${issue}`);
      }
      return;
    }

    const clickedNpc = game.npcs.find(n => Math.hypot(n.x - worldMx, n.y - worldMy) <= TILE/2);
    if (clickedNpc) {
      // selecting a villager clears any resource selection
      selectedNpcId = clickedNpc.id; selectedResource = null; selectedBuilding = null; hideResourceInfo(); hideBuildingInfo();
      activateSidebarPanel('npcBox');
      focusCameraOnWorld(clickedNpc.x, clickedNpc.y);
      refreshNPCList();
      refreshBuildings();
      console.log('Selected villager', clickedNpc.id);
      return;
    }

    const clickedBuilding = getBuildingAtTile(tx, ty);
    if (clickedBuilding) {
      selectedBuilding = clickedBuilding;
      selectedNpcId = null;
      selectedResource = null;
      activateSidebarPanel('buildingsBox');
      hideResourceInfo();
      hideNpcInfo();
      showBuildingInfoFor(clickedBuilding);
      const c = buildingCenterWorldPx(clickedBuilding);
      focusCameraOnWorld(c.x, c.y);
      refreshBuildings();
      return;
    }

    // check resource under cursor: left-click selects resource (show info)
    const res = getResourceAtTile(tx, ty);
    if (res) {
      selectedResource = res; selectedBuilding = null; showResourceInfoFor(res, rect, tx, ty); hideBuildingInfo();
      // deselect any selected villager when a resource is selected
      if (selectedNpcId !== null) { selectedNpcId = null; refreshNPCList(); }
      refreshBuildings();
      return;
    }

    // clicked empty space: clear selections
    if (selectedNpcId !== null) { selectedNpcId = null; refreshNPCList(); }
    if (selectedBuilding) { selectedBuilding = null; hideBuildingInfo(); refreshBuildings(); }
    if (selectedResource) { selectedResource = null; hideResourceInfo(); }
  });

  // right-click (contextmenu): assign tasks / move / gather / deposit
  canvas.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    if (suppressNextContextMenu) {
      suppressNextContextMenu = false;
      return;
    }
    if (rightDragSelect.active) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (ev.clientX - rect.left) * scaleX;
    const my = (ev.clientY - rect.top) * scaleY;
    const worldMx = cameraX * TILE + mx;
    const worldMy = cameraY * TILE + my;
    const tx = Math.floor(worldMx / TILE), ty = Math.floor(worldMy / TILE);

    if (buildMode === 'stockpile' || buildMode === 'storage' || buildMode === 'horseWagon') {
      setBuildMode(null);
      return;
    }

    if (!selectedNpcId) {
      publishGameAlert({
        level: 'warning',
        title: 'No Villager Selected',
        message: 'Select a villager first to assign tasks.',
        dedupeKey: 'no-villager-selected',
        dedupeMs: 2000,
        trackIssue: false
      });
      console.log('No villager selected');
      return;
    }
    const npc = game.npcs.find(n => n.id === selectedNpcId); if (!npc) {
      publishGameAlert({
        level: 'error',
        title: 'Selection Lost',
        message: 'Selected villager was not found.',
        dedupeKey: 'selected-villager-not-found',
        dedupeMs: 2200,
        trackIssue: false
      });
      console.log('Selected villager not found');
      return;
    }

    const res = getResourceAtTile(tx, ty);
    if (res) {
      const task = new Task('gatherTile', res);
      if (ev.ctrlKey) {
        npc.enqueue(task);
        console.log(`Queued (after current) gatherTile for villager ${npc.id} -> ${res.type}`);
      } else if (ev.shiftKey) {
        npc.tasks.unshift(task);
        console.log(`Queued PRIORITY gatherTile for villager ${npc.id} -> ${res.type}`);
      } else {
        npc.currentTask = task; npc.target = res; npc.tasks = [];
        console.log(`Immediate gatherTile for villager ${npc.id} -> ${res.type}`);
      }
      refreshNPCList();
      return;
    }

    const buildTarget = getBuildingAtTile(tx, ty);
    if (buildTarget && !buildTarget.isConstructed) {
      if (npc.job !== 'builder') {
        publishGameAlert({
          level: 'warning',
          title: 'Wrong Job',
          message: `${npcDisplayName(npc)} must be set to Builder before constructing.`,
          dedupeKey: `villager-not-builder-${npc.id}`,
          dedupeMs: 2500,
          trackIssue: true,
          issueKey: `villager-not-builder-${npc.id}`,
          resolveWhen: () => (npc.job === 'builder' || selectedNpcId !== npc.id)
        });
        console.log(`Villager ${npc.id} must be set to Builder job before constructing.`);
        return;
      }
      const task = new Task('buildBuilding', buildTarget);
      if (ev.ctrlKey) {
        npc.enqueue(task);
        console.log(`Queued (after current) build task for villager ${npc.id} -> ${buildTarget.kind}`);
      } else if (ev.shiftKey) {
        npc.tasks.unshift(task);
        console.log(`Queued PRIORITY build task for villager ${npc.id} -> ${buildTarget.kind}`);
      } else {
        npc.currentTask = task;
        npc.target = buildTarget;
        npc.tasks = [];
        console.log(`Immediate build task for villager ${npc.id} -> ${buildTarget.kind}`);
      }
      refreshNPCList();
      return;
    }

    // storage / stockpile
    const depositTarget = getDepositTargetAtTile(tx, ty);
    if (depositTarget) {
      // clicking storage clears resource selection
      if (selectedResource) { selectedResource = null; hideResourceInfo(); }
      const t = new Task('deposit', depositTarget);
      if (ev.ctrlKey) { npc.enqueue(t); console.log(`Queued (after current) deposit for villager ${npc.id}`); }
      else if (ev.shiftKey) { npc.tasks.unshift(t); console.log(`Queued PRIORITY deposit for villager ${npc.id}`); }
      else { npc.currentTask = t; npc.target = depositTarget; npc.tasks = []; console.log(`Immediate deposit for villager ${npc.id}`); }
      refreshNPCList();
      return;
    }

    // empty tile -> move command
    const moveTask = new Task('move', {x:tx, y:ty});
    // clicking empty tile clears resource selection
    if (selectedResource) { selectedResource = null; hideResourceInfo(); }
    if (ev.ctrlKey) { npc.enqueue(moveTask); console.log(`Queued (after current) move for villager ${npc.id} -> ${tx},${ty}`); }
    else if (ev.shiftKey) { npc.tasks.unshift(moveTask); console.log(`Queued PRIORITY move for villager ${npc.id} -> ${tx},${ty}`); }
    else {
      if (npc.currentTask && (npc.currentTask.kind === 'gatherTile' || npc.currentTask.kind === 'gatherType')) {
        const prev = npc.currentTask; npc.currentTask = moveTask; npc.target = {x: tx, y: ty}; npc.tasks.unshift(prev);
        console.log(`Postponed gather and Immediate move for villager ${npc.id} -> ${tx},${ty}`);
      } else { npc.currentTask = moveTask; npc.target = {x: tx, y: ty}; console.log(`Immediate move for villager ${npc.id} -> ${tx},${ty}`); }
    }
    refreshNPCList();
  });

  // mouse move tracking for edge panning
  canvas.addEventListener('mousemove', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (ev.clientX - rect.left) * scaleX;
    const my = (ev.clientY - rect.top) * scaleY;
    lastMouseCanvasX = mx;
    lastMouseCanvasY = my;

    const worldMx = cameraX * TILE + mx;
    const worldMy = cameraY * TILE + my;
    const tx = Math.floor(worldMx / TILE);
    const ty = Math.floor(worldMy / TILE);

    if (rightDragSelect.active) {
      rightDragSelect.currentWorldX = worldMx;
      rightDragSelect.currentWorldY = worldMy;
      const dragDist = Math.hypot(
        rightDragSelect.currentWorldX - rightDragSelect.startWorldX,
        rightDragSelect.currentWorldY - rightDragSelect.startWorldY
      );
      rightDragSelect.hasDragged = dragDist >= RESOURCE_DRAG_SELECT_THRESHOLD_PX;
      updateRightDragSelectionPreview();
      canvas.style.cursor = rightDragSelect.hasDragged ? 'crosshair' : 'default';
      mouseInCanvas = true;
      return;
    }

    buildHoverTile = { x: tx, y: ty };

    if (buildMode === 'stockpile' || buildMode === 'storage' || buildMode === 'horseWagon') {
      hoveredNpcId = null;
      hoveredResource = null;
      const issue = (buildMode === 'stockpile')
        ? getStockpilePlacementIssue(tx, ty)
        : (buildMode === 'storage')
          ? getStoragePlacementIssue(tx, ty)
          : getHorseWagonPlacementIssue(tx, ty);
      canvas.style.cursor = issue ? 'not-allowed' : 'copy';
      mouseInCanvas = true;
      return;
    }

    const hoverNpc = game.npcs.find(n => Math.hypot(n.x - worldMx, n.y - worldMy) <= TILE * 0.45);
    hoveredNpcId = hoverNpc ? hoverNpc.id : null;

    // When entities overlap, NPC hover wins over buildings/resources.
    if (hoveredNpcId) {
      hoveredBuilding = null;
      hoveredResource = null;
    } else {
      hoveredBuilding = getBuildingAtTile(tx, ty);
      const tileRes = getResourceAtTile(tx, ty);
      hoveredResource = (tileRes && tileRes.amount > 0) ? tileRes : null;
    }

    // Prefer NPC hover when overlapping an entity tile.
    canvas.style.cursor = (hoveredNpcId || hoveredBuilding || hoveredResource) ? 'pointer' : 'default';
    mouseInCanvas = true;
  });
  canvas.addEventListener('mouseleave', ()=>{
    mouseInCanvas = false;
    lastMouseCanvasX = lastMouseCanvasY = null;
    hoveredNpcId = null;
    hoveredBuilding = null;
    hoveredResource = null;
    if (rightDragSelect.active) {
      rightDragSelect.active = false;
      rightDragSelect.hasDragged = false;
      previewMarkedResources = [];
    }
    buildHoverTile = null;
    canvas.style.cursor = 'default';
  });

  // wheel zoom (Ctrl/Cmd + wheel or plain wheel) - discrete zoom steps
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const oldTile = TILE;
    const focusTile = tilePointFromClient(ev.clientX, ev.clientY, oldTile);
    if (ev.deltaY < 0) zoomIn(); else zoomOut();
    const newTile = TILE;
    if (newTile !== oldTile) {
      applyTileScale(oldTile, newTile, {
        clientX: ev.clientX,
        clientY: ev.clientY,
        tileX: focusTile.tileX,
        tileY: focusTile.tileY
      });
    }
  }, { passive: false });

  // keyboard pan: WASD and arrow keys
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && buildMode) { setBuildMode(null); }
    if (ev.key === 'Shift') shiftPanBoost = true;
    if (ev.key === 'ArrowLeft' || ev.key === 'a' || ev.key === 'A') keyboardPanX = -1;
    if (ev.key === 'ArrowRight' || ev.key === 'd' || ev.key === 'D') keyboardPanX = 1;
    if (ev.key === 'ArrowUp' || ev.key === 'w' || ev.key === 'W') keyboardPanY = -1;
    if (ev.key === 'ArrowDown' || ev.key === 's' || ev.key === 'S') keyboardPanY = 1;
    if (ev.key === 'PageUp') { const oldTile = TILE; zoomIn(); if (TILE !== oldTile) applyTileScale(oldTile, TILE, null); }
    if (ev.key === 'PageDown') { const oldTile = TILE; zoomOut(); if (TILE !== oldTile) applyTileScale(oldTile, TILE, null); }
    if ((ev.key === 'q' || ev.key === 'Q') && selectedNpcId && markedGatherResources.length > 0) {
      queueMarkedResourcesForSelectedNpc();
    }
  });
  window.addEventListener('keyup', (ev) => {
    if (ev.key === 'Shift') shiftPanBoost = false;
    if (ev.key === 'ArrowLeft' || ev.key === 'a' || ev.key === 'A') { if (keyboardPanX === -1) keyboardPanX = 0; }
    if (ev.key === 'ArrowRight' || ev.key === 'd' || ev.key === 'D') { if (keyboardPanX === 1) keyboardPanX = 0; }
    if (ev.key === 'ArrowUp' || ev.key === 'w' || ev.key === 'W') { if (keyboardPanY === -1) keyboardPanY = 0; }
    if (ev.key === 'ArrowDown' || ev.key === 's' || ev.key === 'S') { if (keyboardPanY === 1) keyboardPanY = 0; }
  });
  window.addEventListener('blur', ()=>{ shiftPanBoost = false; });

  setInterval(()=>{ refreshNPCList(); refreshStorage(); refreshBuildings(); refreshBuildListUI(); }, 500);
}

function applyTileScale(oldTile, newTile, zoomFocus){
  const scale = newTile / oldTile;
  const centerTileX = cameraX + (canvas.width / Math.max(1, oldTile)) / 2;
  const centerTileY = cameraY + (canvas.height / Math.max(1, oldTile)) / 2;
  // scale NPC pixel positions so they stay at same tile coordinates
  for(const n of game.npcs){ n.x = n.x * scale; n.y = n.y * scale; }
  // update canvas size to fit viewport under new tile size
  layoutCanvasCssSize();
  // preserve focus point during zoom in tile-space: mouse pointer when provided, otherwise viewport center.
  const focusTileX = zoomFocus ? zoomFocus.tileX : centerTileX;
  const focusTileY = zoomFocus ? zoomFocus.tileY : centerTileY;
  let focusCanvasX = canvas.width / 2;
  let focusCanvasY = canvas.height / 2;
  if (zoomFocus) {
    const p = clientToCanvasPx(zoomFocus.clientX, zoomFocus.clientY);
    focusCanvasX = p.x;
    focusCanvasY = p.y;
  }
  cameraX = focusTileX - (focusCanvasX / TILE);
  cameraY = focusTileY - (focusCanvasY / TILE);
  cameraX = Math.max(0, Math.min(COLS - viewCols(), cameraX));
  cameraY = Math.max(0, Math.min(ROWS - viewRows(), cameraY));
  // refresh UI
  refreshNPCList(); refreshStorage(); updateResourceInfoPosition(); updateNpcInfoPosition();
}

function focusCameraOnWorld(worldX, worldY){
  cameraX = (worldX / TILE) - (viewCols() / 2);
  cameraY = (worldY / TILE) - (viewRows() / 2);
  cameraX = Math.max(0, Math.min(COLS - viewCols(), cameraX));
  cameraY = Math.max(0, Math.min(ROWS - viewRows(), cameraY));
}

function followSelectedNpc(dt){
  if (!selectedNpcId) return;
  const npc = game.npcs.find(n => n.id === selectedNpcId);
  if (!npc) return;
  const targetCameraX = (npc.x / TILE) - (viewCols() / 2);
  const targetCameraY = (npc.y / TILE) - (viewRows() / 2);
  const t = Math.min(1, dt * 8);
  cameraX += (targetCameraX - cameraX) * t;
  cameraY += (targetCameraY - cameraY) * t;
  cameraX = Math.max(0, Math.min(COLS - viewCols(), cameraX));
  cameraY = Math.max(0, Math.min(ROWS - viewRows(), cameraY));
}

export function startLoop(){
  let last = performance.now();
  function loop(now){
    const dt = (now-last)/1000; last=now;
    // update NPCs
    for(const n of game.npcs) n.update(dt, game);

    // camera edge-panning based on mouse position
    if (mouseInCanvas && lastMouseCanvasX !== null) {
      let panX = 0, panY = 0;
      const rect = canvas.getBoundingClientRect();
      const edgeX = EDGE_PAN_PX * (canvas.width / Math.max(1, rect.width));
      const edgeY = EDGE_PAN_PX * (canvas.height / Math.max(1, rect.height));
      if (lastMouseCanvasX < edgeX) panX = -1;
      else if (lastMouseCanvasX > canvas.width - edgeX) panX = 1;
      if (lastMouseCanvasY < edgeY) panY = -1;
      else if (lastMouseCanvasY > canvas.height - edgeY) panY = 1;
      // combine edge pan and keyboard pan
      panX += keyboardPanX;
      panY += keyboardPanY;
      if (panX !== 0 || panY !== 0) {
        const panSpeed = PAN_SPEED_TILES_PER_SEC * (shiftPanBoost ? SHIFT_PAN_MULTIPLIER : 1);
        cameraX += panX * panSpeed * dt;
        cameraY += panY * panSpeed * dt;
        // clamp
        cameraX = Math.max(0, Math.min(COLS - viewCols(), cameraX));
        cameraY = Math.max(0, Math.min(ROWS - viewRows(), cameraY));
      }
    }

    // Follow selected NPC while it moves.
    followSelectedNpc(dt);

    ctx.clearRect(0,0,canvas.width,canvas.height);
    // draw world with camera offset
    ctx.save();
    ctx.translate(-cameraX * TILE, -cameraY * TILE);
    drawResources(); drawNPCs(); drawBuildGhost();
    ctx.restore();
    drawAtmosphere();
    drawVignette();
    // keep resource popup positioned over the resource as camera moves
    updateResourceInfoPosition();
    updateNpcInfoPosition();
    updateBuildingInfoPosition();
    if (alertSystem) alertSystem.updateAnchor();
    if (logsSidebar) logsSidebar.tickResolve();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function showResourceInfoFor(res, rect, tx, ty){
  if (!resourceInfoEl) return;
  resourceInfoEl.style.display = 'block';
  const color = res.color || resourceTypes.find(t => t.key === res.type)?.color || '#888';
  const tiles = res.tileConsumption || ((res.footprint?.w || 1) * (res.footprint?.h || 1));
  const difficulty = Math.max(0.1, Number(res.gatherDifficulty ?? 1));
  const requiredTools = Array.isArray(res.requiredTools) ? res.requiredTools : [];
  const toolsText = requiredTools.length
    ? requiredTools.map(toolDisplayName).join(', ')
    : 'None';
  const yields = (res && typeof res.yieldItems === 'object') ? res.yieldItems : null;
  const yieldText = yields
    ? Object.entries(yields)
      .map(([k, v]) => `${materialDisplayName(k)} x${Math.max(0, Number(v) || 0)}`)
      .join(', ')
    : capitalize(res.type || 'item');
  const title = res.name || res.type;
  resourceInfoEl.innerHTML = `<div class="title"><span class="dot" style="background:${color}"></span><span class="name">${title}</span></div><div class="amount">${res.amount} left${tiles > 1 ? ` | tiles ${tiles}` : ''}</div><div class="amount">Gather Difficulty x${difficulty.toFixed(2)}</div><div class="amount">Yield: ${yieldText}</div><div class="amount">Required Tool: ${toolsText}</div>`;
  // position will be updated by updateResourceInfoPosition to follow camera
  updateResourceInfoPosition();
}

function hideResourceInfo(){ if(resourceInfoEl) resourceInfoEl.style.display='none'; }

function updateResourceInfoPosition(){
  if (!resourceInfoEl || !selectedResource) return;
  const rect = canvas.getBoundingClientRect();
  // world pixel position of resource center
  const fw = selectedResource.footprint?.w || 1;
  const fh = selectedResource.footprint?.h || 1;
  const worldPxX = (selectedResource.x + fw / 2) * TILE;
  const worldPxY = (selectedResource.y + fh / 2) * TILE;
  // pixel position inside canvas (canvas drawing pixels)
  const canvasPxX = worldPxX - cameraX * TILE;
  const canvasPxY = worldPxY - cameraY * TILE;
  // map canvas drawing pixels to CSS pixels on screen
  const screenX = rect.left + (canvasPxX / canvas.width) * rect.width;
  const screenY = rect.top + (canvasPxY / canvas.height) * rect.height;
  resourceInfoEl.style.left = (screenX + 12) + 'px';
  resourceInfoEl.style.top = (screenY - 12) + 'px';
}

function updateNpcInfoPosition(){
  if(!npcInfoEl || !selectedNpcId) return;
  const npc = game.npcs.find(p=>p.id===selectedNpcId);
  if(!npc) return;
  const rect = canvas.getBoundingClientRect();
  const worldPxX = npc.x; // npc.x already in world pixels
  const worldPxY = npc.y;
  const canvasPxX = worldPxX - cameraX * TILE;
  const canvasPxY = worldPxY - cameraY * TILE;
  const screenX = rect.left + (canvasPxX / canvas.width) * rect.width;
  const screenY = rect.top + (canvasPxY / canvas.height) * rect.height;
  npcInfoEl.style.left = (screenX + 12) + 'px';
  npcInfoEl.style.top = (screenY - 20) + 'px';
}

function showNpcInfoFor(n){
  if(!npcInfoEl || !n) return;
  // show only total carry (not per-item)
  const carrySummary = `<div style="font-size:12px;margin-top:6px"><strong>Carry</strong><div style=\"margin-top:6px;font-weight:700;color:#cfeaf3\">${n.totalCarry()}/${n.capacity}</div></div>`;
  const toolEntries = Object.values(n.tools || {}).filter(Boolean);
  const toolsSummary = toolEntries.length
    ? `<div style="font-size:12px;margin-top:8px"><strong>Tools</strong><div style=\"margin-top:6px\">${toolEntries.map(t => `<div>${toolDisplayName(t.key)}: ${Math.max(0, Math.round(t.durability || 0))}/${Math.max(1, Math.round(t.maxDurability || 1))}</div>`).join('')}</div></div>`
    : '';
  const queued = n.tasks.length ? `<div style="margin-top:8px"><strong>Queued:</strong><div style="margin-top:6px">${n.tasks.map(t=>`<div style=\"margin-bottom:6px\">${formatTaskLabel(t)}</div>`).join('')}</div></div>` : '<div style="margin-top:8px;color:var(--muted)">Queued: (none)</div>';
  npcInfoEl.innerHTML = `<div class="title"><span class="name">${npcDisplayName(n)}</span></div>${carrySummary}${toolsSummary}${queued}`;
  npcInfoEl.style.display = 'block';
}

function hideNpcInfo(){ if(npcInfoEl) npcInfoEl.style.display='none'; }

function getBuildingInfoHtml(b){
  const footprint = b.footprint || { w: 1, h: 1 };
  const base = `<div class="title"><span class="name">${b.name || capitalize(b.kind || 'Building')}</span></div>`;
  const details = `<div class="amount">Kind: ${capitalize(b.kind || 'building')} | Tiles: ${footprint.w}x${footprint.h}</div><div class="amount">Pos: ${b.x},${b.y}</div>`;
  const completion = Math.round((b.buildCompletion || 0) * 100);
  const constructionInfo = b.isConstructed
    ? `<div class="amount">Status: Complete</div>`
    : `<div class="amount">Status: Under Construction (${completion}%) | Build Difficulty x${Number(b.buildDifficulty || 1).toFixed(2)}</div>`;
  let storageInfo = '';
  if (b.isConstructed && Number.isFinite(b.storageCapacity)) {
    storageInfo = `<div class="amount">Item Capacity: ${getBuildingStoredTotal(b)}/${b.storageCapacity}</div>`;
  }
  return `${base}${details}${constructionInfo}${storageInfo}`;
}

function drawConstructionOverlay(building){
  if (!building || building.isConstructed) return;
  const fw = building.footprint?.w || 1;
  const fh = building.footprint?.h || 1;
  const x = building.x * TILE;
  const y = building.y * TILE;
  const w = fw * TILE;
  const h = fh * TILE;
  const completion = Math.max(0, Math.min(1, building.buildCompletion || 0));

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(x, y, w, h);

  const barH = Math.max(3, Math.floor(TILE * 0.15));
  const pad = Math.max(1, Math.floor(TILE * 0.08));
  ctx.fillStyle = 'rgba(26, 36, 46, 0.88)';
  ctx.fillRect(x + pad, y + h - barH - pad, w - pad * 2, barH);
  ctx.fillStyle = 'rgba(109, 223, 186, 0.95)';
  ctx.fillRect(x + pad, y + h - barH - pad, (w - pad * 2) * completion, barH);
}

function showBuildingInfoFor(b){
  if(!buildingInfoEl || !b) return;
  buildingInfoEl.innerHTML = getBuildingInfoHtml(b);
  buildingInfoEl.style.display = 'block';
  updateBuildingInfoPosition();
}

function hideBuildingInfo(){ if(buildingInfoEl) buildingInfoEl.style.display='none'; }

function updateBuildingInfoPosition(){
  if(!buildingInfoEl || !selectedBuilding) return;
  buildingInfoEl.innerHTML = getBuildingInfoHtml(selectedBuilding);
  const rect = canvas.getBoundingClientRect();
  const p = buildingCenterWorldPx(selectedBuilding);
  const canvasPxX = p.x - cameraX * TILE;
  const canvasPxY = p.y - cameraY * TILE;
  const screenX = rect.left + (canvasPxX / canvas.width) * rect.width;
  const screenY = rect.top + (canvasPxY / canvas.height) * rect.height;
  buildingInfoEl.style.left = (screenX + 12) + 'px';
  buildingInfoEl.style.top = (screenY - 16) + 'px';
}

// grid removed — keep function removed so canvas is clean for a grassy background

function hash2(x, y){
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return v - Math.floor(v);
}

function pickTerrainTone(gx, gy){
  const biome = hash2(gx * 0.27, gy * 0.27);
  const detail = hash2(gx * 1.13 + 11.2, gy * 1.07 - 4.9);
  if (biome < 0.33) {
    // dry plateau
    return detail > 0.62 ? '#cba777' : '#be9666';
  }
  if (biome < 0.66) {
    // grassy transition
    return detail > 0.58 ? '#b59060' : '#ab8355';
  }
  // rocky highland
  return detail > 0.6 ? '#a9835a' : '#9e774f';
}

function drawTerrain(){
  const left = Math.floor(cameraX * TILE);
  const top = Math.floor(cameraY * TILE);
  const width = Math.ceil(viewCols() * TILE + TILE * 2);
  const height = Math.ceil(viewRows() * TILE + TILE * 2);

  // Base terrain tone.
  ctx.fillStyle = '#be9463';
  ctx.fillRect(left, top, width, height);

  // Coarse biome patches to avoid flat look while staying fast at any zoom.
  const patch = Math.max(10, Math.round(TILE * 1.9));
  const x0 = Math.floor(left / patch) - 1;
  const y0 = Math.floor(top / patch) - 1;
  const x1 = Math.ceil((left + width) / patch) + 1;
  const y1 = Math.ceil((top + height) / patch) + 1;
  for(let gy = y0; gy <= y1; gy++){
    for(let gx = x0; gx <= x1; gx++){
      ctx.fillStyle = pickTerrainTone(gx, gy);
      ctx.fillRect(gx * patch, gy * patch, patch + 1, patch + 1);

      // Sparse tiny freckles add micro-texture when zoomed in.
      if (TILE >= 8 && hash2(gx * 2.7 + 3.1, gy * 2.1 - 7.3) > 0.78) {
        const fx = gx * patch + Math.floor(hash2(gx + 9.3, gy - 2.4) * patch * 0.8);
        const fy = gy * patch + Math.floor(hash2(gx - 5.2, gy + 8.7) * patch * 0.8);
        const size = Math.max(1, Math.floor(TILE * 0.14));
        ctx.fillStyle = 'rgba(80, 58, 36, 0.28)';
        ctx.fillRect(fx, fy, size, size);
      }
    }
  }
}

function drawTileFrame(x, y, palette){
  ctx.fillStyle = palette.edge;
  ctx.fillRect(x, y, TILE, TILE);
  const inset = Math.max(1, Math.floor(TILE * 0.1));
  ctx.fillStyle = palette.base;
  ctx.fillRect(x + inset, y + inset, TILE - inset * 2, TILE - inset * 2);
  return inset;
}

function drawTreeTile(x, y, palette){
  const inset = drawTileFrame(x, y, palette);
  if (TILE <= 7) {
    ctx.fillStyle = '#1a6f2d';
    ctx.fillRect(x + inset, y + inset, TILE - inset * 2, TILE - inset * 2);
    return;
  }
  const trunkW = Math.max(1, Math.floor(TILE * 0.18));
  const trunkH = Math.max(2, Math.floor(TILE * 0.28));
  const trunkX = x + Math.floor(TILE * 0.5 - trunkW * 0.5);
  const trunkY = y + Math.floor(TILE * 0.62);
  ctx.fillStyle = '#5c3d22';
  ctx.fillRect(trunkX, trunkY, trunkW, trunkH);

  const leafR = Math.max(2, Math.floor(TILE * 0.2));
  const centers = [
    [x + Math.floor(TILE * 0.34), y + Math.floor(TILE * 0.42)],
    [x + Math.floor(TILE * 0.52), y + Math.floor(TILE * 0.35)],
    [x + Math.floor(TILE * 0.66), y + Math.floor(TILE * 0.44)],
    [x + Math.floor(TILE * 0.50), y + Math.floor(TILE * 0.5)]
  ];
  for (const [cx, cy] of centers) {
    const lg = ctx.createRadialGradient(cx - leafR * 0.3, cy - leafR * 0.35, leafR * 0.2, cx, cy, leafR * 1.15);
    lg.addColorStop(0, '#6ddd78');
    lg.addColorStop(1, '#1d8f34');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(cx, cy, leafR, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStoneTile(x, y, palette){
  drawTileFrame(x, y, palette);
  const blobs = TILE <= 7
    ? [[0.5, 0.5, 0.22]]
    : [[0.36, 0.57, 0.22], [0.6, 0.47, 0.24], [0.48, 0.33, 0.17]];
  for (const [ux, uy, ur] of blobs) {
    const cx = x + Math.floor(TILE * ux);
    const cy = y + Math.floor(TILE * uy);
    const r = Math.max(1, Math.floor(TILE * ur));
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.2, cx, cy, r * 1.1);
    g.addColorStop(0, '#d9dde2');
    g.addColorStop(1, '#868d95');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawOreTile(x, y, type, palette){
  drawTileFrame(x, y, palette);
  // Host rock
  ctx.fillStyle = type === 'iron' ? '#5a4638' : '#665245';
  const pad = Math.max(1, Math.floor(TILE * 0.16));
  ctx.fillRect(x + pad, y + pad, TILE - pad * 2, TILE - pad * 2);

  const veinColor = type === 'iron' ? '#8f6b4c' : type === 'copper' ? '#d1874f' : '#f0c738';
  const veinHi = type === 'iron' ? '#b48c67' : type === 'copper' ? '#efb27d' : '#ffe47d';
  const dots = TILE <= 7
    ? [[0.45, 0.5], [0.62, 0.38]]
    : [[0.34, 0.42], [0.56, 0.34], [0.67, 0.56], [0.42, 0.62]];
  for (const [ux, uy] of dots) {
    const cx = x + Math.floor(TILE * ux);
    const cy = y + Math.floor(TILE * uy);
    const r = Math.max(1, Math.floor(TILE * (TILE <= 7 ? 0.1 : 0.12)));
    ctx.fillStyle = veinColor;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    if (TILE >= 9) {
      ctx.fillStyle = veinHi;
      ctx.beginPath();
      ctx.arc(cx - 1, cy - 1, Math.max(1, r - 1), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawResourceTile(r){
  const palette = resourcePalette[r.type] || { base: '#888', edge: '#666', accent: '#bbb' };

  const tiles = (typeof r.occupiedTiles === 'function')
    ? r.occupiedTiles()
    : [{ x: r.x, y: r.y }];

  for (const t of tiles) {
    const x = t.x * TILE;
    const y = t.y * TILE;
    if (r.sprite) {
      const drawn = drawSpriteInRect(ctx, r.sprite, x, y, TILE, TILE);
      if (drawn) continue;
    }
    if (r.type === 'tree') {
      drawTreeTile(x, y, palette);
      continue;
    }
    if (r.type === 'stone') {
      drawStoneTile(x, y, palette);
      continue;
    }
    if (r.type === 'iron' || r.type === 'copper' || r.type === 'gold') {
      drawOreTile(x, y, r.type, palette);
      continue;
    }
    drawTileFrame(x, y, palette);
  }
}

function hasStockpileAtTile(tx, ty){
  return !!game.stockpiles.find(s => (typeof s.occupiesTile === 'function') ? s.occupiesTile(tx, ty) : (s.x === tx && s.y === ty));
}

function getStorageAtTile(tx, ty){
  return game.storages.find(s => (typeof s.occupiesTile === 'function') ? s.occupiesTile(tx, ty) : (s.x === tx && s.y === ty)) || null;
}

function getStockpileAtTile(tx, ty){
  return game.stockpiles.find(s => (typeof s.occupiesTile === 'function') ? s.occupiesTile(tx, ty) : (s.x === tx && s.y === ty)) || null;
}

function getDepositTargetAtTile(tx, ty){
  return game.getAllDepositTargets().find(t => (typeof t.occupiesTile === 'function') ? t.occupiesTile(tx, ty) : (t.x === tx && t.y === ty)) || null;
}

function getFootprintTiles(startX, startY, footprint){
  const w = Math.max(1, Number(footprint?.w || 1));
  const h = Math.max(1, Number(footprint?.h || 1));
  const tiles = [];
  for (let oy = 0; oy < h; oy += 1) {
    for (let ox = 0; ox < w; ox += 1) {
      tiles.push({ x: startX + ox, y: startY + oy });
    }
  }
  return tiles;
}

function getCommonPlacementIssue(tx, ty, def){
  const tiles = getFootprintTiles(tx, ty, def.footprint);
  for (const tile of tiles) {
    if (tile.x < 0 || tile.x >= COLS || tile.y < 0 || tile.y >= ROWS) return 'Tile is out of bounds';
    if (game.hasBuildingAt(tile.x, tile.y)) return 'Another building is already on this tile';
    const tileRes = getResourceAtTile(tile.x, tile.y);
    if (tileRes && tileRes.amount > 0) return 'Tile is occupied by a resource';
  }
  return null;
}

function getStockpilePlacementIssue(tx, ty){
  const def = getStockpileDefinition();
  const areaIssue = getCommonPlacementIssue(tx, ty, def);
  if (areaIssue) return areaIssue;
  if (Number.isFinite(def.maxCount) && game.countBuildings(def.kind) >= def.maxCount) {
    return `Reached max ${def.name} count (${def.maxCount})`;
  }
  if (!game.hasRequiredBuildings(def.requiresBuildings)) {
    return 'Required buildings are missing';
  }
  if (!game.canAfford(def.cost)) {
    return 'Not enough resources';
  }
  return null;
}

function getStoragePlacementIssue(tx, ty){
  const def = getStorageDefinition();
  const areaIssue = getCommonPlacementIssue(tx, ty, def);
  if (areaIssue) return areaIssue;
  if (Number.isFinite(def.maxCount) && game.countBuildings(def.kind) >= def.maxCount) {
    return `Reached max ${def.name} count (${def.maxCount})`;
  }
  if (!game.hasRequiredBuildings(def.requiresBuildings)) {
    return 'Required buildings are missing';
  }
  if (!game.canAfford(def.cost)) {
    return 'Not enough resources';
  }
  return null;
}

function getHorseWagonPlacementIssue(tx, ty){
  const def = getHorseWagonDefinition();
  const areaIssue = getCommonPlacementIssue(tx, ty, def);
  if (areaIssue) return areaIssue;
  if (Number.isFinite(def.maxCount) && game.countBuildings(def.kind) >= def.maxCount) {
    return `Reached max ${def.name} count (${def.maxCount})`;
  }
  if (!game.hasRequiredBuildings(def.requiresBuildings)) {
    return 'Required buildings are missing';
  }
  if (!game.canAfford(def.cost)) {
    return 'Not enough resources';
  }
  return null;
}

function drawStockpileTile(stockpileOrX, tileYOrOptions, maybeOptions){
  drawStockpileTileUI({ ctx, TILE, fontForTile }, stockpileOrX, tileYOrOptions, maybeOptions);
}

function drawPlacedStockpiles(minTileX, maxTileX, minTileY, maxTileY){
  drawPlacedStockpilesUI({
    ctx,
    TILE,
    game,
    hoveredBuilding,
    selectedBuilding,
    drawConstructionOverlay,
    fontForTile
  }, minTileX, maxTileX, minTileY, maxTileY);
}

function drawStorageTile(storageOrX, tileYOrOptions, maybeOptions){
  drawStorageTileUI({ ctx, TILE, fontForTile }, storageOrX, tileYOrOptions, maybeOptions);
}

function drawPlacedStorages(minTileX, maxTileX, minTileY, maxTileY){
  drawPlacedStoragesUI({
    ctx,
    TILE,
    game,
    hoveredBuilding,
    selectedBuilding,
    drawConstructionOverlay,
    fontForTile
  }, minTileX, maxTileX, minTileY, maxTileY);
}

function drawHorseWagonTile(wagonOrX, tileYOrOptions, maybeOptions){
  drawHorseWagonTileUI({ ctx, TILE, fontForTile }, wagonOrX, tileYOrOptions, maybeOptions);
}

function drawPlacedHorseWagons(minTileX, maxTileX, minTileY, maxTileY){
  drawPlacedHorseWagonsUI({
    ctx,
    TILE,
    game,
    hoveredBuilding,
    selectedBuilding,
    drawConstructionOverlay,
    fontForTile
  }, minTileX, maxTileX, minTileY, maxTileY);
}

function drawBuildGhost(){
  if (!buildHoverTile) return;
  if (buildMode === 'stockpile') {
    const valid = !getStockpilePlacementIssue(buildHoverTile.x, buildHoverTile.y);
    drawStockpileTile(buildHoverTile.x, buildHoverTile.y, { ghost: true, valid, footprint: getStockpileDefinition().footprint });
    return;
  }
  if (buildMode === 'storage') {
    const valid = !getStoragePlacementIssue(buildHoverTile.x, buildHoverTile.y);
    drawStorageTile(buildHoverTile.x, buildHoverTile.y, { ghost: true, valid, footprint: getStorageDefinition().footprint });
    return;
  }
  if (buildMode === 'horseWagon') {
    const valid = !getHorseWagonPlacementIssue(buildHoverTile.x, buildHoverTile.y);
    drawHorseWagonTile(buildHoverTile.x, buildHoverTile.y, { ghost: true, valid, footprint: getHorseWagonDefinition().footprint });
  }
}

function drawVignette(){
  const grad = ctx.createRadialGradient(
    canvas.width * 0.5,
    canvas.height * 0.45,
    Math.min(canvas.width, canvas.height) * 0.15,
    canvas.width * 0.5,
    canvas.height * 0.5,
    Math.max(canvas.width, canvas.height) * 0.75
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.24)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function worldToCanvas(worldX, worldY){
  return {
    x: worldX - cameraX * TILE,
    y: worldY - cameraY * TILE
  };
}

function drawLightAt(worldX, worldY, radiusPx, innerColor, outerAlpha=0){
  const p = worldToCanvas(worldX, worldY);
  const g = ctx.createRadialGradient(p.x, p.y, radiusPx * 0.18, p.x, p.y, radiusPx);
  g.addColorStop(0, innerColor);
  g.addColorStop(1, `rgba(0,0,0,${outerAlpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(p.x - radiusPx, p.y - radiusPx, radiusPx * 2, radiusPx * 2);
}

function drawAtmosphere(){
  // Warm global tint.
  ctx.fillStyle = 'rgba(80, 46, 18, 0.07)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Soft light source around storage tile.
  if (game.storageTile) {
    const sx = game.storageTile.x * TILE + TILE / 2;
    const sy = game.storageTile.y * TILE + TILE / 2;
    drawLightAt(sx, sy, Math.max(120, TILE * 8), 'rgba(255, 231, 160, 0.22)', 0);
  }

  // Slight guidance light around selected NPC.
  if (selectedNpcId) {
    const n = game.npcs.find(p => p.id === selectedNpcId);
    if (n) drawLightAt(n.x, n.y, Math.max(84, TILE * 5), 'rgba(150, 230, 255, 0.16)', 0);
  }
}

function drawResources(){
  drawTerrain();
  const minTileX = Math.max(0, Math.floor(cameraX) - 1);
  const maxTileX = Math.min(COLS - 1, Math.ceil(cameraX + viewCols()) + 1);
  const minTileY = Math.max(0, Math.floor(cameraY) - 1);
  const maxTileY = Math.min(ROWS - 1, Math.ceil(cameraY + viewRows()) + 1);

  // Render resources intersecting the camera viewport (footprint-aware).
  for (const r of game.resources) {
    if (r.amount <= 0) continue;
    const w = r.footprint?.w || 1;
    const h = r.footprint?.h || 1;
    const right = r.x + w - 1;
    const bottom = r.y + h - 1;
    if (right < minTileX || r.x > maxTileX || bottom < minTileY || r.y > maxTileY) continue;

    drawResourceTile(r);
    if (hoveredResource === r && selectedResource !== r) {
      const x = r.x * TILE;
      const y = r.y * TILE;
      const line = Math.max(1, TILE * 0.08);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(130, 230, 255, 0.9)';
      ctx.lineWidth = line;
      ctx.strokeRect(x + line * 0.5, y + line * 0.5, w * TILE - line, h * TILE - line);
      ctx.lineWidth = 1;
    }
    if (selectedResource === r) {
      const x = r.x * TILE;
      const y = r.y * TILE;
      const line = Math.max(1.5, TILE * 0.11);
      ctx.beginPath();
      ctx.strokeStyle = '#ffd84d';
      ctx.lineWidth = line;
      ctx.strokeRect(x + line * 0.5, y + line * 0.5, w * TILE - line, h * TILE - line);
      ctx.lineWidth = 1;
    }
    if (isResourceMarked(r) || isResourcePreviewMarked(r)) {
      const x = r.x * TILE;
      const y = r.y * TILE;
      const line = Math.max(1.2, TILE * 0.09);
      ctx.beginPath();
      ctx.strokeStyle = isResourcePreviewMarked(r) ? '#8fe8ff' : '#62ffd0';
      ctx.lineWidth = line;
      ctx.strokeRect(x + line * 0.5, y + line * 0.5, w * TILE - line, h * TILE - line);
      ctx.lineWidth = 1;
    }
  }

  if (rightDragSelect.active && rightDragSelect.hasDragged) {
    const x = Math.min(rightDragSelect.startWorldX, rightDragSelect.currentWorldX);
    const y = Math.min(rightDragSelect.startWorldY, rightDragSelect.currentWorldY);
    const w = Math.abs(rightDragSelect.currentWorldX - rightDragSelect.startWorldX);
    const h = Math.abs(rightDragSelect.currentWorldY - rightDragSelect.startWorldY);
    ctx.fillStyle = 'rgba(120, 214, 255, 0.14)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(156, 229, 255, 0.95)';
    ctx.lineWidth = Math.max(1, TILE * 0.06);
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
    ctx.lineWidth = 1;
  }

  drawPlacedStorages(minTileX, maxTileX, minTileY, maxTileY);
  drawPlacedHorseWagons(minTileX, maxTileX, minTileY, maxTileY);
  drawPlacedStockpiles(minTileX, maxTileX, minTileY, maxTileY);
}

function drawNPCs(){
  for(const n of game.npcs){
    const radius = Math.max(2, TILE * 0.32);
    // soft shadow
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.ellipse(n.x, n.y + radius * 0.85, radius * 0.9, radius * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    let drewNpcSprite = false;
    if (n.sprite) {
      const size = Math.max(6, Math.floor(TILE * 0.9 * (Number(n.spriteScale) || 1)));
      drewNpcSprite = drawSpriteInRect(ctx, n.sprite, n.x - size / 2, n.y - size / 2, size, size);
    }

    if (!drewNpcSprite) {
      // main body gradient
      const g = ctx.createRadialGradient(n.x - radius * 0.25, n.y - radius * 0.35, radius * 0.2, n.x, n.y, radius * 1.05);
      g.addColorStop(0, '#8de9ff');
      g.addColorStop(1, '#0f89d8');
      ctx.beginPath(); ctx.fillStyle = g; ctx.arc(n.x, n.y, radius,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#0a5f94';
      ctx.lineWidth = Math.max(1, TILE * 0.06);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // selection ring when this NPC is selected
    if (n.id === selectedNpcId) {
      ctx.beginPath();
      ctx.strokeStyle = '#ffd84d';
      ctx.lineWidth = Math.max(2, TILE * 0.1);
      ctx.arc(n.x, n.y, radius * 1.38, 0, Math.PI*2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    if (n.id === hoveredNpcId && n.id !== selectedNpcId) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(130, 230, 255, 0.95)';
      ctx.lineWidth = Math.max(1.5, TILE * 0.07);
      ctx.arc(n.x, n.y, radius * 1.2, 0, Math.PI*2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    if (!drewNpcSprite) {
      const mapLabel = npcDisplayName(n).slice(0, 2).toUpperCase();
      const textSize = Math.max(6, Math.round(TILE * 0.26));
      ctx.fillStyle='#f2fbff';
      ctx.font = `${textSize}px sans-serif`;
      const labelW = ctx.measureText(mapLabel).width;
      ctx.fillText(mapLabel, n.x - labelW / 2, n.y + Math.max(2, textSize * 0.33));
    }
    let i=0;
    const carrySize = Math.max(2, Math.floor(TILE * 0.12));
    const carriedKeys = Object.keys(n.carry || {}).filter(k => Number(n.carry[k] || 0) > 0);
    for (const key of carriedKeys) {
      const typeInfo = resourceTypes.find(r => r.key === key);
      ctx.fillStyle = resourcePalette[key]?.base || typeInfo?.color || '#a6c2cc';
      ctx.fillRect(n.x - TILE * 0.32 + i * (carrySize + 1), n.y + TILE * 0.35, carrySize, carrySize);
      i += 1;
      if (i >= 6) break;
    }
  }
}

function refreshNPCList(){
  if (npcSidebar) npcSidebar.refresh();
}

function refreshStorage(){
  if (storageSidebar) storageSidebar.refresh();
}

function refreshBuildings(){
  if (buildingsSidebar) buildingsSidebar.refresh();
}

export function selectFirstNpc(){
  if(game.npcs.length>0){
    selectedNpcId = game.npcs[0].id;
    focusCameraOnWorld(game.npcs[0].x, game.npcs[0].y);
    activateSidebarPanel('npcBox');
    refreshNPCList();
  }
}
