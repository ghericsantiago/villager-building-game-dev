import { TILE, COLS, ROWS, resourceTypes } from './util.js';
import { game } from './gameState.js';
import { NPC } from './npc.js';
import { Task } from './task.js';

let canvas, ctx, npcListEl, storageListEl, selectedNpcId=null;
let selectedResource = null;
let resourceInfoEl = null;
let immediateMoveMode = true;

// viewport (camera) size in tiles
const VIEW_COLS = 20;
const VIEW_ROWS = 30;
let cameraX = 0; // top-left tile index (float for smooth pan)
let cameraY = 0;
let lastMouseCanvasX = null, lastMouseCanvasY = null, mouseInCanvas = false;
const EDGE_PAN_PX = 48; // pixels from edge to start panning
const PAN_SPEED_TILES_PER_SEC = 10;
let keyboardPanX = 0, keyboardPanY = 0;

export function initUI(){
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  // size the canvas to the viewport (camera)
  canvas.width = VIEW_COLS * TILE; canvas.height = VIEW_ROWS * TILE;

  // center camera on storage initially
  if (game && game.storageTile) {
    cameraX = game.storageTile.x - Math.floor(VIEW_COLS/2);
    cameraY = game.storageTile.y - Math.floor(VIEW_ROWS/2);
    cameraX = Math.max(0, Math.min(COLS - VIEW_COLS, cameraX));
    cameraY = Math.max(0, Math.min(ROWS - VIEW_ROWS, cameraY));
  }
  npcListEl = document.getElementById('npcList');
  storageListEl = document.getElementById('storageList');

  // resource info popup
  resourceInfoEl = document.getElementById('resourceInfo');
  if (!resourceInfoEl) {
    resourceInfoEl = document.createElement('div');
    resourceInfoEl.id = 'resourceInfo';
    resourceInfoEl.style.position = 'absolute';
    resourceInfoEl.style.background = 'rgba(255,255,255,0.95)';
    resourceInfoEl.style.border = '1px solid #ccc';
    resourceInfoEl.style.padding = '6px 8px';
    resourceInfoEl.style.fontSize = '12px';
    resourceInfoEl.style.display = 'none';
    resourceInfoEl.style.pointerEvents = 'none';
    resourceInfoEl.style.zIndex = 1000;
    document.body.appendChild(resourceInfoEl);
  }

  document.getElementById('addNpc').addEventListener('click', ()=>{
    const id = game.npcs.length+1;
    const n = new NPC(id, game.storageTile.x*TILE+TILE/2, game.storageTile.y*TILE+TILE/2);
    game.npcs.push(n); selectedNpcId = n.id; refreshNPCList();
  });

  const moveNowBtn = document.getElementById('moveNow');
  if(moveNowBtn){
    // initialize default ON
    moveNowBtn.style.background = immediateMoveMode ? '#ffd' : '';
    moveNowBtn.textContent = immediateMoveMode ? 'Move Now: ON' : 'Move Now';
    moveNowBtn.addEventListener('click', ()=>{
      immediateMoveMode = !immediateMoveMode;
      moveNowBtn.style.background = immediateMoveMode ? '#ffd' : '';
      moveNowBtn.textContent = immediateMoveMode ? 'Move Now: ON' : 'Move Now';
    });
  }

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
    const clickedNpc = game.npcs.find(n => Math.hypot(n.x - worldMx, n.y - worldMy) <= TILE/2);
    if (clickedNpc) {
      // selecting an NPC clears any resource selection
      selectedNpcId = clickedNpc.id; selectedResource = null; hideResourceInfo(); refreshNPCList();
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

    // storage
    if (tx === game.storageTile.x && ty === game.storageTile.y) {
      // clicking storage clears resource selection
      if (selectedResource) { selectedResource = null; hideResourceInfo(); }
      const t = new Task('deposit', game.storageTile);
      if (ev.ctrlKey) { npc.enqueue(t); console.log(`Queued (after current) deposit for NPC ${npc.id}`); }
      else if (ev.shiftKey) { npc.tasks.unshift(t); console.log(`Queued PRIORITY deposit for NPC ${npc.id}`); }
      else { npc.currentTask = new Task('move', {x: tx, y: ty}); npc.target = {x: tx, y: ty}; npc.tasks = []; console.log(`Immediate deposit-move for NPC ${npc.id}`); }
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
    lastMouseCanvasX = (ev.clientX - rect.left) * scaleX;
    lastMouseCanvasY = (ev.clientY - rect.top) * scaleY;
    mouseInCanvas = true;
  });
  canvas.addEventListener('mouseleave', ()=>{ mouseInCanvas = false; lastMouseCanvasX = lastMouseCanvasY = null; });

  // keyboard pan: WASD and arrow keys
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowLeft' || ev.key === 'a' || ev.key === 'A') keyboardPanX = -1;
    if (ev.key === 'ArrowRight' || ev.key === 'd' || ev.key === 'D') keyboardPanX = 1;
    if (ev.key === 'ArrowUp' || ev.key === 'w' || ev.key === 'W') keyboardPanY = -1;
    if (ev.key === 'ArrowDown' || ev.key === 's' || ev.key === 'S') keyboardPanY = 1;
  });
  window.addEventListener('keyup', (ev) => {
    if (ev.key === 'ArrowLeft' || ev.key === 'a' || ev.key === 'A') { if (keyboardPanX === -1) keyboardPanX = 0; }
    if (ev.key === 'ArrowRight' || ev.key === 'd' || ev.key === 'D') { if (keyboardPanX === 1) keyboardPanX = 0; }
    if (ev.key === 'ArrowUp' || ev.key === 'w' || ev.key === 'W') { if (keyboardPanY === -1) keyboardPanY = 0; }
    if (ev.key === 'ArrowDown' || ev.key === 's' || ev.key === 'S') { if (keyboardPanY === 1) keyboardPanY = 0; }
  });

  setInterval(()=>{ refreshNPCList(); refreshStorage(); }, 500);
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
      if (lastMouseCanvasX < EDGE_PAN_PX) panX = -1;
      else if (lastMouseCanvasX > canvas.width - EDGE_PAN_PX) panX = 1;
      if (lastMouseCanvasY < EDGE_PAN_PX) panY = -1;
      else if (lastMouseCanvasY > canvas.height - EDGE_PAN_PX) panY = 1;
      // combine edge pan and keyboard pan
      panX += keyboardPanX;
      panY += keyboardPanY;
      if (panX !== 0 || panY !== 0) {
        cameraX += panX * PAN_SPEED_TILES_PER_SEC * dt;
        cameraY += panY * PAN_SPEED_TILES_PER_SEC * dt;
        // clamp
        cameraX = Math.max(0, Math.min(COLS - VIEW_COLS, cameraX));
        cameraY = Math.max(0, Math.min(ROWS - VIEW_ROWS, cameraY));
      }
    }

    ctx.clearRect(0,0,canvas.width,canvas.height);
    // draw world with camera offset
    ctx.save();
    ctx.translate(-cameraX * TILE, -cameraY * TILE);
    drawGrid(); drawResources(); drawNPCs();
    ctx.restore();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function showResourceInfoFor(res, rect, tx, ty){
  if (!resourceInfoEl) return;
  resourceInfoEl.style.display = 'block';
  resourceInfoEl.textContent = `${res.type} — ${res.amount} left`;
  // position near tile center
  const screenX = rect.left + (tx - Math.floor(cameraX) + 0.5) * (rect.width / VIEW_COLS);
  const screenY = rect.top + (ty - Math.floor(cameraY) + 0.5) * (rect.height / VIEW_ROWS);
  resourceInfoEl.style.left = (screenX + 12) + 'px';
  resourceInfoEl.style.top = (screenY - 12) + 'px';
}

function hideResourceInfo(){ if(resourceInfoEl) resourceInfoEl.style.display='none'; }

function drawGrid(){
  ctx.strokeStyle='#222';
  for(let x=0;x<=COLS;x++){ctx.beginPath();ctx.moveTo(x*TILE,0);ctx.lineTo(x*TILE,ROWS*TILE);ctx.stroke()}
  for(let y=0;y<=ROWS;y++){ctx.beginPath();ctx.moveTo(0,y*TILE);ctx.lineTo(COLS*TILE,y*TILE);ctx.stroke()}
}

function drawResources(){
  for(const r of game.resources){
    if(r.amount<=0) continue;
    const color = resourceTypes.find(t=>t.key===r.type).color;
    ctx.fillStyle=color; ctx.fillRect(r.x*TILE+2,r.y*TILE+2,TILE-4,TILE-4);
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.font='10px sans-serif'; ctx.fillText(r.amount, r.x*TILE+4, r.y*TILE+12);
    // draw selection square if this resource is selected
    if (selectedResource === r) {
      ctx.beginPath(); ctx.strokeStyle='gold'; ctx.lineWidth = 3;
      ctx.strokeRect(r.x*TILE+2, r.y*TILE+2, TILE-4, TILE-4);
      ctx.lineWidth = 1;
    }
  }
  ctx.fillStyle='#444'; ctx.fillRect(game.storageTile.x*TILE+2, game.storageTile.y*TILE+2, TILE-4, TILE-4);
  ctx.fillStyle='white'; ctx.font='10px sans-serif'; ctx.fillText('S', game.storageTile.x*TILE+TILE/3, game.storageTile.y*TILE+TILE/1.8);
}

function drawNPCs(){
  for(const n of game.npcs){
    // main body
    ctx.beginPath(); ctx.fillStyle='#00aaff'; ctx.arc(n.x, n.y, TILE/3,0,Math.PI*2); ctx.fill();

    // selection ring when this NPC is selected
    if (n.id === selectedNpcId) {
      ctx.beginPath();
      ctx.strokeStyle = 'gold';
      ctx.lineWidth = 3;
      ctx.arc(n.x, n.y, TILE/2.4, 0, Math.PI*2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    ctx.fillStyle='white'; ctx.font='10px sans-serif'; ctx.fillText(n.id, n.x-6, n.y+4);
    let i=0;
    for(const r of resourceTypes){ const amount = n.carry[r.key]; if(amount>0){ctx.fillStyle=r.color; ctx.fillRect(n.x-10+i*6, n.y+12,4,4); i++}}}
}

function refreshNPCList(){
  if(!npcListEl) return;
  npcListEl.innerHTML = '';
  game.npcs.forEach(n => {
    const div = document.createElement('div'); div.className = 'npc-item' + (n.id === selectedNpcId ? ' selected' : '');
    const header = document.createElement('div'); header.textContent = `NPC ${n.id} — carry ${n.totalCarry()}/${n.capacity}`;
    header.style.fontWeight = '600'; header.style.marginBottom = '4px';
    div.appendChild(header);
    const q = document.createElement('div'); q.style.fontSize = '12px'; q.style.color = '#333';
    if (n.currentTask) {
      const ct = document.createElement('div'); ct.style.marginBottom='4px';
      let curLabel = n.currentTask.kind;
      if (n.currentTask.kind === 'gatherType') curLabel = `gatherType:${n.currentTask.target}`;
      else if (n.currentTask.kind === 'gatherTile') curLabel = `gatherTile:${n.currentTask.target.type}@${n.currentTask.target.x},${n.currentTask.target.y}`;
      else if (n.currentTask.target && n.currentTask.target.x!==undefined) curLabel = `${n.currentTask.kind}@${n.currentTask.target.x},${n.currentTask.target.y}`;
      ct.textContent = 'Current: ' + curLabel;
      const cancelBtn = document.createElement('button'); cancelBtn.textContent='Cancel'; cancelBtn.style.marginLeft='8px';
      cancelBtn.onclick = (e)=>{ e.stopPropagation(); n.currentTask = null; n.target = null; refreshNPCList(); };
      ct.appendChild(cancelBtn);
      q.appendChild(ct);
    }
    if (n.tasks.length === 0) { const none = document.createElement('div'); none.textContent='Queued: (none)'; q.appendChild(none); }
    else {
      const ul = document.createElement('div'); ul.style.display='flex'; ul.style.flexDirection='column'; ul.style.gap='4px';
      n.tasks.forEach((t,idx)=>{
        const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center';
        const label = document.createElement('div'); label.style.flex='1';
        if (t.kind === 'gatherType') label.textContent = `${t.kind}:${t.target}`;
        else if (t.kind === 'gatherTile') label.textContent = `${t.kind}:${t.target.type}@${t.target.x},${t.target.y}`;
        else if (t.target && t.target.x!==undefined) label.textContent = `${t.kind}@${t.target.x},${t.target.y}`;
        else label.textContent = t.kind;
        const up = document.createElement('button'); up.textContent='↑'; up.title='Move up'; up.onclick=(e)=>{ e.stopPropagation(); if(idx>0){ const a=n.tasks[idx-1]; n.tasks[idx-1]=n.tasks[idx]; n.tasks[idx]=a; refreshNPCList(); }};
        const down = document.createElement('button'); down.textContent='↓'; down.title='Move down'; down.onclick=(e)=>{ e.stopPropagation(); if(idx<n.tasks.length-1){ const a=n.tasks[idx+1]; n.tasks[idx+1]=n.tasks[idx]; n.tasks[idx]=a; refreshNPCList(); }};
        const del = document.createElement('button'); del.textContent='✖'; del.title='Remove'; del.onclick=(e)=>{ e.stopPropagation(); n.tasks.splice(idx,1); refreshNPCList(); };
        row.appendChild(label); row.appendChild(up); row.appendChild(down); row.appendChild(del); ul.appendChild(row);
      }); q.appendChild(ul);
    }
    div.appendChild(q);
    div.onclick = () => { selectedNpcId = n.id; refreshNPCList(); };
    npcListEl.appendChild(div);
  });
}

function refreshStorage(){ if(!storageListEl) return; storageListEl.innerHTML=''; for(const k in game.storage){ const d=document.createElement('div'); d.textContent=`${k}: ${game.storage[k]}`; storageListEl.appendChild(d); } }

export function selectFirstNpc(){ if(game.npcs.length>0){ selectedNpcId = game.npcs[0].id; refreshNPCList(); } }
