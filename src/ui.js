import { TILE, COLS, ROWS, resourceTypes, zoomIn, zoomOut, setZoom, BASE_TILE, ZOOM } from './util.js';
import { game } from './gameState.js';
import { NPC } from './npc.js';
import { Task } from './task.js';
import { StockpileBuilding } from './buildings/stockpile.js';

let canvas, ctx, npcListEl, storageListEl, selectedNpcId=null;
let buildStockpileBtn = null;
let selectedResource = null;
let hoveredResource = null;
let hoveredNpcId = null;
let buildMode = null;
let buildHoverTile = null;
let resourceInfoEl = null;
let npcInfoEl = null;
const resourceIcons = { tree: '🌳', stone: '🪨', iron: '⛓️', copper: '🟠', gold: '🪙', storage: '📦' };
const resourcePalette = {
  tree: { base: '#1b8f2f', edge: '#10611f', accent: '#64d274' },
  stone: { base: '#a0a5ab', edge: '#72777c', accent: '#d1d5da' },
  iron: { base: '#6f4a2f', edge: '#4f311f', accent: '#9b7253' },
  copper: { base: '#cd7a3b', edge: '#9f5a2a', accent: '#efb57f' },
  gold: { base: '#d8ae1c', edge: '#ab8610', accent: '#ffe277' }
};
const npcJobs = [
  { key: 'none', label: 'No Job (Manual)' },
  { key: 'tree', label: 'Woodcutter' },
  { key: 'stone', label: 'Stone Miner' },
  { key: 'iron', label: 'Iron Miner' },
  { key: 'copper', label: 'Copper Miner' },
  { key: 'gold', label: 'Gold Miner' }
];

function capitalize(s){ return s && s[0] ? (s[0].toUpperCase() + s.slice(1)) : s }

function npcDisplayName(n){
  return (n && n.name) ? n.name : `NPC ${n.id}`;
}

function formatTaskLabel(t){
  if(!t) return '';
  if(t.kind === 'gatherType'){
    const type = t.target;
    const icon = resourceIcons[type] || '';
    return `<span class="task-icon">${icon}</span><span class="task-text">Gather ${capitalize(type)}</span>`;
  }
  if(t.kind === 'gatherTile'){
    const tile = t.target;
    const icon = resourceIcons[tile.type] || '';
    return `<span class="task-icon">${icon}</span><span class="task-text">Gather ${capitalize(tile.type)} <small>@${tile.x},${tile.y}</small></span>`;
  }
  if(t.kind === 'move'){
    return `<span class="task-icon">🔜</span><span class="task-text">Move @${t.target.x},${t.target.y}</span>`;
  }
  if(t.kind === 'deposit'){
    return `<span class="task-icon">${resourceIcons.storage}</span><span class="task-text">Deposit</span>`;
  }
  return `<span class="task-text">${t.kind}</span>`;
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
let keyboardPanX = 0, keyboardPanY = 0;
let shiftPanBoost = false;
let npcListRenderSignature = '';
let npcListRefreshDeferred = false;
let npcDetailsOpenById = new Map();
let renderResourceRows = new Map();
let renderResourceCount = -1;

function isJobSelectFocused(){
  const active = document.activeElement;
  return !!(active && active.classList && active.classList.contains('npc-job-select'));
}

function isNpcDetailsOpen(npcId){
  return npcDetailsOpenById.get(npcId) !== false;
}

function getStockpileDefinition(){
  return StockpileBuilding.definition;
}

function formatBuildingRules(def){
  const currentCount = game.countBuildings(def.kind);
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
  return `${remainingText} | ${depsText} | ${costText}`;
}

function updateBuildRulesText(){
  const stockpileRulesEl = document.getElementById('stockpileBuildRules');
  if (!stockpileRulesEl) return;
  stockpileRulesEl.textContent = formatBuildingRules(getStockpileDefinition());
}

function setBuildMode(mode){
  buildMode = mode;
  if (!mode) buildHoverTile = null;
  if (buildStockpileBtn) {
    const active = buildMode === 'stockpile';
    buildStockpileBtn.classList.toggle('active', active);
    buildStockpileBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
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

function initSidebarMenu(){
  const menu = document.getElementById('sidebarMenu');
  if (!menu) return;
  const buttons = Array.from(menu.querySelectorAll('.menu-btn'));
  const panels = [
    document.getElementById('buildPanel'),
    document.getElementById('storageBox'),
    document.getElementById('npcBox')
  ].filter(Boolean);

  function setActive(panelId){
    for (const btn of buttons) {
      const active = btn.dataset.panel === panelId;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    for (const panel of panels) {
      panel.classList.toggle('active', panel.id === panelId);
    }
  }

  for (const btn of buttons) {
    btn.addEventListener('click', () => setActive(btn.dataset.panel));
  }

  const activeBtn = buttons.find(b => b.classList.contains('active')) || buttons[0];
  if (activeBtn) setActive(activeBtn.dataset.panel);
}

function getResourceAtTile(tx, ty){
  ensureResourceRenderIndex();
  const row = renderResourceRows.get(ty);
  if (!row) return null;
  for (const r of row) {
    if (r.x === tx) return r;
    if (r.x > tx) break;
  }
  return null;
}

export function initUI(){
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  // size the canvas to fit available map viewport
  layoutCanvasCssSize();
  window.addEventListener('resize', layoutCanvasCssSize);

  // center camera on storage initially
  if (game && game.storageTile) {
    cameraX = game.storageTile.x - Math.floor(viewCols()/2);
    cameraY = game.storageTile.y - Math.floor(viewRows()/2);
    cameraX = Math.max(0, Math.min(COLS - viewCols(), cameraX));
    cameraY = Math.max(0, Math.min(ROWS - viewRows(), cameraY));
  }
  npcListEl = document.getElementById('npcList');
  storageListEl = document.getElementById('storageList');
  initSidebarMenu();
  buildStockpileBtn = document.getElementById('buildStockpileBtn');
  updateBuildRulesText();
  if (buildStockpileBtn) {
    buildStockpileBtn.addEventListener('click', () => {
      setBuildMode(buildMode === 'stockpile' ? null : 'stockpile');
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

  // npc info popup (for selected NPC: carry & queued tasks)
  npcInfoEl = document.getElementById('npcInfo');
  if (!npcInfoEl) {
    npcInfoEl = document.createElement('div');
    npcInfoEl.id = 'npcInfo';
    npcInfoEl.className = 'resource-info';
    npcInfoEl.style.pointerEvents = 'none';
    npcInfoEl.style.display = 'none';
    document.body.appendChild(npcInfoEl);
  }

  document.getElementById('addNpc').addEventListener('click', ()=>{
    const id = game.npcs.length+1;
    const n = new NPC(id, game.storageTile.x*TILE+TILE/2, game.storageTile.y*TILE+TILE/2);
    game.npcs.push(n); selectedNpcId = n.id; refreshNPCList();
  });

  // left-click: select NPC or resource (do not assign tasks)
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

    if (buildMode === 'stockpile') {
      const issue = getStockpilePlacementIssue(tx, ty);
      if (!issue) {
        const def = getStockpileDefinition();
        if (game.spendCost(def.cost)) {
          game.addBuilding(new StockpileBuilding(tx, ty));
          refreshStorage();
          updateBuildRulesText();
          console.log(`Placed stockpile at ${tx},${ty}`);
        }
      } else {
        console.log(`Cannot place stockpile: ${issue}`);
      }
      return;
    }

    const clickedNpc = game.npcs.find(n => Math.hypot(n.x - worldMx, n.y - worldMy) <= TILE/2);
    if (clickedNpc) {
      // selecting an NPC clears any resource selection
      selectedNpcId = clickedNpc.id; selectedResource = null; hideResourceInfo();
      focusCameraOnWorld(clickedNpc.x, clickedNpc.y);
      refreshNPCList();
      console.log('Selected NPC', clickedNpc.id);
      return;
    }

    // check resource under cursor: left-click selects resource (show info)
    const res = game.resources.find(r => r.x === tx && r.y === ty && r.amount > 0);
    if (res) {
      selectedResource = res; showResourceInfoFor(res, rect, tx, ty);
      // deselect any selected NPC when a resource is selected
      if (selectedNpcId !== null) { selectedNpcId = null; refreshNPCList(); }
      return;
    }

    // clicked empty space: clear selections
    if (selectedNpcId !== null) { selectedNpcId = null; refreshNPCList(); }
    if (selectedResource) { selectedResource = null; hideResourceInfo(); }
  });

  // right-click (contextmenu): assign tasks / move / gather / deposit
  canvas.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (ev.clientX - rect.left) * scaleX;
    const my = (ev.clientY - rect.top) * scaleY;
    const worldMx = cameraX * TILE + mx;
    const worldMy = cameraY * TILE + my;
    const tx = Math.floor(worldMx / TILE), ty = Math.floor(worldMy / TILE);

    if (buildMode === 'stockpile') {
      setBuildMode(null);
      return;
    }

    if (!selectedNpcId) { console.log('No NPC selected'); return; }
    const npc = game.npcs.find(n => n.id === selectedNpcId); if (!npc) { console.log('Selected NPC not found'); return; }

    const res = game.resources.find(r => r.x === tx && r.y === ty && r.amount > 0);
    if (res) {
      const task = new Task('gatherTile', res);
      if (ev.ctrlKey) {
        npc.enqueue(task);
        console.log(`Queued (after current) gatherTile for NPC ${npc.id} -> ${res.type}`);
      } else if (ev.shiftKey) {
        npc.tasks.unshift(task);
        console.log(`Queued PRIORITY gatherTile for NPC ${npc.id} -> ${res.type}`);
      } else {
        npc.currentTask = task; npc.target = res; npc.tasks = [];
        console.log(`Immediate gatherTile for NPC ${npc.id} -> ${res.type}`);
      }
      refreshNPCList();
      return;
    }

    // storage / stockpile
    const clickedStockpile = getStockpileAtTile(tx, ty);
    const depositTarget = (tx === game.storageTile.x && ty === game.storageTile.y)
      ? game.storageTile
      : clickedStockpile;
    if (depositTarget) {
      // clicking storage clears resource selection
      if (selectedResource) { selectedResource = null; hideResourceInfo(); }
      const t = new Task('deposit', depositTarget);
      if (ev.ctrlKey) { npc.enqueue(t); console.log(`Queued (after current) deposit for NPC ${npc.id}`); }
      else if (ev.shiftKey) { npc.tasks.unshift(t); console.log(`Queued PRIORITY deposit for NPC ${npc.id}`); }
      else { npc.currentTask = t; npc.target = depositTarget; npc.tasks = []; console.log(`Immediate deposit for NPC ${npc.id}`); }
      refreshNPCList();
      return;
    }

    // empty tile -> move command
    const moveTask = new Task('move', {x:tx, y:ty});
    // clicking empty tile clears resource selection
    if (selectedResource) { selectedResource = null; hideResourceInfo(); }
    if (ev.ctrlKey) { npc.enqueue(moveTask); console.log(`Queued (after current) move for NPC ${npc.id} -> ${tx},${ty}`); }
    else if (ev.shiftKey) { npc.tasks.unshift(moveTask); console.log(`Queued PRIORITY move for NPC ${npc.id} -> ${tx},${ty}`); }
    else {
      if (npc.currentTask && (npc.currentTask.kind === 'gatherTile' || npc.currentTask.kind === 'gatherType')) {
        const prev = npc.currentTask; npc.currentTask = moveTask; npc.target = {x: tx, y: ty}; npc.tasks.unshift(prev);
        console.log(`Postponed gather and Immediate move for NPC ${npc.id} -> ${tx},${ty}`);
      } else { npc.currentTask = moveTask; npc.target = {x: tx, y: ty}; console.log(`Immediate move for NPC ${npc.id} -> ${tx},${ty}`); }
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
    buildHoverTile = { x: tx, y: ty };

    if (buildMode === 'stockpile') {
      hoveredNpcId = null;
      hoveredResource = null;
      canvas.style.cursor = getStockpilePlacementIssue(tx, ty) ? 'not-allowed' : 'copy';
      mouseInCanvas = true;
      return;
    }

    const hoverNpc = game.npcs.find(n => Math.hypot(n.x - worldMx, n.y - worldMy) <= TILE * 0.45);
    hoveredNpcId = hoverNpc ? hoverNpc.id : null;
    const tileRes = getResourceAtTile(tx, ty);
    hoveredResource = (tileRes && tileRes.amount > 0) ? tileRes : null;

    // Prefer NPC hover when overlapping an entity tile.
    canvas.style.cursor = (hoveredNpcId || hoveredResource) ? 'pointer' : 'default';
    mouseInCanvas = true;
  });
  canvas.addEventListener('mouseleave', ()=>{
    mouseInCanvas = false;
    lastMouseCanvasX = lastMouseCanvasY = null;
    hoveredNpcId = null;
    hoveredResource = null;
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
  });
  window.addEventListener('keyup', (ev) => {
    if (ev.key === 'Shift') shiftPanBoost = false;
    if (ev.key === 'ArrowLeft' || ev.key === 'a' || ev.key === 'A') { if (keyboardPanX === -1) keyboardPanX = 0; }
    if (ev.key === 'ArrowRight' || ev.key === 'd' || ev.key === 'D') { if (keyboardPanX === 1) keyboardPanX = 0; }
    if (ev.key === 'ArrowUp' || ev.key === 'w' || ev.key === 'W') { if (keyboardPanY === -1) keyboardPanY = 0; }
    if (ev.key === 'ArrowDown' || ev.key === 's' || ev.key === 'S') { if (keyboardPanY === 1) keyboardPanY = 0; }
  });
  window.addEventListener('blur', ()=>{ shiftPanBoost = false; });

  setInterval(()=>{ refreshNPCList(); refreshStorage(); }, 500);
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
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function showResourceInfoFor(res, rect, tx, ty){
  if (!resourceInfoEl) return;
  resourceInfoEl.style.display = 'block';
  const color = resourceTypes.find(t => t.key === res.type)?.color || '#888';
  resourceInfoEl.innerHTML = `<div class="title"><span class="dot" style="background:${color}"></span><span class="name">${res.type}</span></div><div class="amount">${res.amount} left</div>`;
  // position will be updated by updateResourceInfoPosition to follow camera
  updateResourceInfoPosition();
}

function hideResourceInfo(){ if(resourceInfoEl) resourceInfoEl.style.display='none'; }

function updateResourceInfoPosition(){
  if (!resourceInfoEl || !selectedResource) return;
  const rect = canvas.getBoundingClientRect();
  // world pixel position of resource center
  const worldPxX = selectedResource.x * TILE + TILE/2;
  const worldPxY = selectedResource.y * TILE + TILE/2;
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
  const queued = n.tasks.length ? `<div style="margin-top:8px"><strong>Queued:</strong><div style="margin-top:6px">${n.tasks.map(t=>`<div style=\"margin-bottom:6px\">${formatTaskLabel(t)}</div>`).join('')}</div></div>` : '<div style="margin-top:8px;color:var(--muted)">Queued: (none)</div>';
  npcInfoEl.innerHTML = `<div class="title"><span class="name">${npcDisplayName(n)}</span></div>${carrySummary}${queued}`;
  npcInfoEl.style.display = 'block';
}

function hideNpcInfo(){ if(npcInfoEl) npcInfoEl.style.display='none'; }

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
  const x = r.x * TILE;
  const y = r.y * TILE;

  if (r.type === 'tree') {
    drawTreeTile(x, y, palette);
    return;
  }
  if (r.type === 'stone') {
    drawStoneTile(x, y, palette);
    return;
  }
  if (r.type === 'iron' || r.type === 'copper' || r.type === 'gold') {
    drawOreTile(x, y, r.type, palette);
    return;
  }

  drawTileFrame(x, y, palette);
}

function hasStockpileAtTile(tx, ty){
  return !!game.stockpiles.find(s => s.x === tx && s.y === ty);
}

function getStockpileAtTile(tx, ty){
  return game.stockpiles.find(s => s.x === tx && s.y === ty) || null;
}

function getStockpilePlacementIssue(tx, ty){
  const def = getStockpileDefinition();
  if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return 'Tile is out of bounds';
  if (tx === game.storageTile.x && ty === game.storageTile.y) return 'Main storage tile is reserved';
  if (game.hasBuildingAt(tx, ty)) return 'Another building is already on this tile';
  if (hasStockpileAtTile(tx, ty)) return 'Stockpile already exists on this tile';
  const tileRes = getResourceAtTile(tx, ty);
  if (tileRes && tileRes.amount > 0) return 'Tile is occupied by a resource';
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
  const isPlacedStockpile = typeof stockpileOrX === 'object' && stockpileOrX !== null;
  const tx = isPlacedStockpile ? stockpileOrX.x : stockpileOrX;
  const ty = isPlacedStockpile ? stockpileOrX.y : tileYOrOptions;
  const options = isPlacedStockpile ? (tileYOrOptions || {}) : (maybeOptions || {});
  const ghost = !!options.ghost;
  const valid = options.valid !== false;
  const x = tx * TILE;
  const y = ty * TILE;

  if (ghost) {
    ctx.fillStyle = valid ? 'rgba(84, 181, 165, 0.18)' : 'rgba(191, 82, 82, 0.2)';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = valid ? 'rgba(150, 247, 225, 0.9)' : 'rgba(255, 154, 154, 0.95)';
    ctx.lineWidth = Math.max(1, TILE * 0.08);
    ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    const step = Math.max(4, Math.round(TILE * 0.26));
    ctx.beginPath();
    for (let ox = -TILE; ox <= TILE; ox += step) {
      ctx.moveTo(x + ox, y);
      ctx.lineTo(x + ox + TILE, y + TILE);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    return;
  }

  // Wooden stockpile marker.
  const palette = isPlacedStockpile && stockpileOrX.palette
    ? stockpileOrX.palette
    : { frame: '#6d4d30', fill: '#8c6642', stroke: '#4a311f', text: '#f0dfbf' };
  const mapSymbol = isPlacedStockpile && stockpileOrX.mapSymbol ? stockpileOrX.mapSymbol : 'P';

  ctx.fillStyle = palette.frame;
  ctx.fillRect(x, y, TILE, TILE);
  const inset = Math.max(1, Math.floor(TILE * 0.12));
  ctx.fillStyle = palette.fill;
  ctx.fillRect(x + inset, y + inset, TILE - inset * 2, TILE - inset * 2);
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = Math.max(1, Math.floor(TILE * 0.07));
  ctx.strokeRect(x + inset, y + inset, TILE - inset * 2, TILE - inset * 2);
  ctx.lineWidth = 1;
  ctx.fillStyle = palette.text;
  ctx.font = fontForTile(0.7);
  ctx.fillText(mapSymbol, x + TILE * 0.34, y + TILE * 0.67);
}

function drawPlacedStockpiles(minTileX, maxTileX, minTileY, maxTileY){
  for (const s of game.stockpiles) {
    if (s.x < minTileX || s.x > maxTileX || s.y < minTileY || s.y > maxTileY) continue;
    drawStockpileTile(s);
  }
}

function drawBuildGhost(){
  if (buildMode !== 'stockpile' || !buildHoverTile) return;
  const valid = !getStockpilePlacementIssue(buildHoverTile.x, buildHoverTile.y);
  drawStockpileTile(buildHoverTile.x, buildHoverTile.y, { ghost: true, valid });
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
  const sx = game.storageTile.x * TILE + TILE / 2;
  const sy = game.storageTile.y * TILE + TILE / 2;
  drawLightAt(sx, sy, Math.max(120, TILE * 8), 'rgba(255, 231, 160, 0.22)', 0);

  // Slight guidance light around selected NPC.
  if (selectedNpcId) {
    const n = game.npcs.find(p => p.id === selectedNpcId);
    if (n) drawLightAt(n.x, n.y, Math.max(84, TILE * 5), 'rgba(150, 230, 255, 0.16)', 0);
  }
}

function drawResources(){
  ensureResourceRenderIndex();
  drawTerrain();
  const minTileX = Math.max(0, Math.floor(cameraX) - 1);
  const maxTileX = Math.min(COLS - 1, Math.ceil(cameraX + viewCols()) + 1);
  const minTileY = Math.max(0, Math.floor(cameraY) - 1);
  const maxTileY = Math.min(ROWS - 1, Math.ceil(cameraY + viewRows()) + 1);

  // Render only resources intersecting the camera viewport.
  for (let ty = minTileY; ty <= maxTileY; ty++) {
    const row = renderResourceRows.get(ty);
    if (!row) continue;
    for (const r of row) {
      if (r.x < minTileX) continue;
      if (r.x > maxTileX) break;
      if (r.amount <= 0) continue;
      drawResourceTile(r);
      if (hoveredResource === r && selectedResource !== r) {
        const x = r.x * TILE, y = r.y * TILE;
        const line = Math.max(1, TILE * 0.08);
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(130, 230, 255, 0.9)';
        ctx.lineWidth = line;
        ctx.strokeRect(x + line * 0.5, y + line * 0.5, TILE - line, TILE - line);
        ctx.lineWidth = 1;
      }
      // draw selection square if this resource is selected
      if (selectedResource === r) {
        const x = r.x * TILE, y = r.y * TILE;
        const line = Math.max(1.5, TILE * 0.11);
        ctx.beginPath(); ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = line;
        ctx.strokeRect(x + line * 0.5, y + line * 0.5, TILE - line, TILE - line);
        ctx.lineWidth = 1;
      }
    }
  }

  drawPlacedStockpiles(minTileX, maxTileX, minTileY, maxTileY);

  // draw storage as a metallic crate tile
  const sx = game.storageTile.x * TILE;
  const sy = game.storageTile.y * TILE;
  ctx.fillStyle = '#4f5663';
  ctx.fillRect(sx, sy, TILE, TILE);
  const inner = Math.max(1, Math.floor(TILE * 0.12));
  ctx.fillStyle = '#707b8a';
  ctx.fillRect(sx + inner, sy + inner, TILE - inner * 2, TILE - inner * 2);
  ctx.strokeStyle = '#2f3642';
  ctx.lineWidth = Math.max(1, Math.floor(TILE * 0.08));
  ctx.strokeRect(sx + inner, sy + inner, TILE - inner * 2, TILE - inner * 2);
  ctx.lineWidth = 1;
  ctx.fillStyle = '#edf6ff';
  ctx.font = fontForTile(0.95);
  ctx.fillText('S', sx + TILE * 0.34, sy + TILE * 0.68);
}

function drawNPCs(){
  for(const n of game.npcs){
    const radius = Math.max(2, TILE * 0.32);
    // soft shadow
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.ellipse(n.x, n.y + radius * 0.85, radius * 0.9, radius * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    // main body gradient
    const g = ctx.createRadialGradient(n.x - radius * 0.25, n.y - radius * 0.35, radius * 0.2, n.x, n.y, radius * 1.05);
    g.addColorStop(0, '#8de9ff');
    g.addColorStop(1, '#0f89d8');
    ctx.beginPath(); ctx.fillStyle = g; ctx.arc(n.x, n.y, radius,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#0a5f94';
    ctx.lineWidth = Math.max(1, TILE * 0.06);
    ctx.stroke();
    ctx.lineWidth = 1;

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

    const mapLabel = npcDisplayName(n).slice(0, 2).toUpperCase();
    const textSize = Math.max(6, Math.round(TILE * 0.26));
    ctx.fillStyle='#f2fbff';
    ctx.font = `${textSize}px sans-serif`;
    const labelW = ctx.measureText(mapLabel).width;
    ctx.fillText(mapLabel, n.x - labelW / 2, n.y + Math.max(2, textSize * 0.33));
    let i=0;
    const carrySize = Math.max(2, Math.floor(TILE * 0.12));
    for(const r of resourceTypes){
      const amount = n.carry[r.key];
      if(amount>0){
        ctx.fillStyle = resourcePalette[r.key]?.base || r.color;
        ctx.fillRect(n.x - TILE * 0.32 + i * (carrySize + 1), n.y + TILE * 0.35, carrySize, carrySize);
        i++;
      }
    }
  }
}

function refreshNPCList(){
  if(!npcListEl) return;
  // Avoid replacing the active <select> while the user is interacting with it.
  if (isJobSelectFocused()) {
    npcListRefreshDeferred = true;
    return;
  }
  const signature = JSON.stringify({
    selectedNpcId,
    npcs: game.npcs.map(n => ({
      id: n.id,
      detailsOpen: n.id === selectedNpcId ? isNpcDetailsOpen(n.id) : undefined,
      job: n.job || 'none',
      carry: n.totalCarry(),
      capacity: n.capacity,
      currentTask: n.currentTask ? { kind: n.currentTask.kind, target: n.currentTask.target } : null,
      queued: n.tasks.map(t => ({ kind: t.kind, target: t.target }))
    }))
  });
  if (signature === npcListRenderSignature) {
    hideNpcInfo();
    return;
  }
  npcListRenderSignature = signature;
  npcListEl.innerHTML = '';
  game.npcs.forEach(n => {
    const isSelected = n.id === selectedNpcId;
    const div = document.createElement('div'); div.className = 'npc-item' + (isSelected ? ' selected' : '');
    const headerRow = document.createElement('div'); headerRow.className = 'npc-header-row';
    const header = document.createElement('div'); header.className = 'npc-header'; header.textContent = npcDisplayName(n);
    header.style.fontSize = '12px';
    headerRow.appendChild(header);
    if (isSelected) {
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'npc-info-toggle-btn';
      const detailsOpen = isNpcDetailsOpen(n.id);
      toggleBtn.textContent = detailsOpen ? 'Hide info' : 'Show info';
      toggleBtn.onclick = (e) => {
        e.stopPropagation();
        npcDetailsOpenById.set(n.id, !detailsOpen);
        refreshNPCList();
      };
      headerRow.appendChild(toggleBtn);
    }
    div.appendChild(headerRow);

    // show only current task inline (compact)
    if (n.currentTask) {
      const ct = document.createElement('div'); ct.className = 'npc-current'; ct.style.marginTop = '4px';
      const label = document.createElement('div'); label.className = 'task-label'; label.style.flex = '1'; label.style.overflow = 'hidden'; label.style.textOverflow = 'ellipsis'; label.style.whiteSpace = 'nowrap';
      label.innerHTML = formatTaskLabel(n.currentTask);
      const cancelBtn = document.createElement('button'); cancelBtn.className = 'npc-cancel-btn'; cancelBtn.title = 'Cancel current task'; cancelBtn.innerHTML = '✖';
      cancelBtn.onclick = (e) => { e.stopPropagation(); n.currentTask = null; n.target = null; refreshNPCList(); };
      ct.style.display = 'flex'; ct.style.alignItems = 'center'; ct.style.gap = '8px'; ct.appendChild(label); ct.appendChild(cancelBtn);
      div.appendChild(ct);
    }

    // if this NPC is selected, render carry & queued info inline in sidebar
    if (isSelected && isNpcDetailsOpen(n.id)) {
      const details = document.createElement('div'); details.className = 'npc-details';
      const jobRow = document.createElement('div');
      jobRow.className = 'npc-job-row';
      const jobLabel = document.createElement('label');
      jobLabel.className = 'npc-job-label';
      jobLabel.textContent = 'Job';
      jobLabel.setAttribute('for', `npc-job-${n.id}`);
      const jobSelect = document.createElement('select');
      jobSelect.id = `npc-job-${n.id}`;
      jobSelect.className = 'npc-job-select';
      for (const job of npcJobs) {
        const option = document.createElement('option');
        option.value = job.key;
        option.textContent = job.label;
        if ((n.job || 'none') === job.key) option.selected = true;
        jobSelect.appendChild(option);
      }
      jobSelect.addEventListener('mousedown', (e) => e.stopPropagation());
      jobSelect.addEventListener('click', (e) => e.stopPropagation());
      jobSelect.addEventListener('focus', () => { npcListRefreshDeferred = false; });
      jobSelect.addEventListener('change', (e) => {
        e.stopPropagation();
        const newJob = jobSelect.value;
        n.job = newJob;
        // Switch jobs immediately: clear active/queued work and start new gather loop.
        n.tasks = [];
        n.currentTask = null;
        n.target = null;
        n.gatherProgress = 0;
        if (newJob !== 'none') {
          n.currentTask = new Task('gatherType', newJob);
          n.target = game.findNearestResourceOfType(n, newJob);
        }
        refreshNPCList();
      });
      jobSelect.addEventListener('blur', () => {
        if (npcListRefreshDeferred) {
          npcListRefreshDeferred = false;
          refreshNPCList();
        }
      });
      jobRow.appendChild(jobLabel);
      jobRow.appendChild(jobSelect);
      details.appendChild(jobRow);

      // carry summary (only total, not per-item)
      const carryWrap = document.createElement('div'); carryWrap.style.marginTop = '6px';
      const carryTitle = document.createElement('div'); carryTitle.style.fontWeight = '700'; carryTitle.style.fontSize = '12px'; carryTitle.textContent = `Carry ${n.totalCarry()}/${n.capacity}`; carryWrap.appendChild(carryTitle);
      details.appendChild(carryWrap);

      // queued tasks
      const queuedWrap = document.createElement('div'); queuedWrap.style.marginTop = '8px';
      const qTitle = document.createElement('div'); qTitle.style.fontWeight='700'; qTitle.style.fontSize='12px'; qTitle.textContent = 'Queued'; queuedWrap.appendChild(qTitle);
      if (n.tasks.length === 0) {
        const none = document.createElement('div'); none.style.color = 'var(--muted)'; none.style.fontSize='12px'; none.textContent = '(none)'; queuedWrap.appendChild(none);
      } else {
        n.tasks.forEach(t => {
          const tr = document.createElement('div'); tr.style.marginTop='6px'; tr.innerHTML = formatTaskLabel(t); queuedWrap.appendChild(tr);
        });
      }
      details.appendChild(queuedWrap);
      div.appendChild(details);
    }

    div.onclick = () => {
      selectedNpcId = n.id;
      focusCameraOnWorld(n.x, n.y);
      refreshNPCList();
    };
    npcListEl.appendChild(div);
  });

  // hide floating npc popup (we moved details to sidebar)
  hideNpcInfo();
}

function refreshStorage(){
  if(!storageListEl) return; 
  storageListEl.innerHTML = ''; 
  const totals = game.getPooledStorage();
  for(const k in totals){ 
    const row = document.createElement('div'); row.className = 'storage-item'; 
    const icon = document.createElement('span'); icon.className = 'storage-icon'; icon.textContent = resourceIcons[k] || '•'; 
    const label = document.createElement('span'); label.className = 'storage-label'; label.textContent = capitalize(k); 
    const val = document.createElement('span'); val.className = 'storage-val'; val.textContent = String(totals[k]); 
    row.appendChild(icon); row.appendChild(label); row.appendChild(val); 
    storageListEl.appendChild(row); 
  }
}

export function selectFirstNpc(){
  if(game.npcs.length>0){
    selectedNpcId = game.npcs[0].id;
    focusCameraOnWorld(game.npcs[0].x, game.npcs[0].y);
    refreshNPCList();
  }
}
