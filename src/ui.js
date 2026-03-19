import { TILE, COLS, ROWS, resourceTypes } from './util.js';
import { game } from './gameState.js';
import { NPC } from './npc.js';
import { Task } from './task.js';

let canvas, ctx, npcListEl, storageListEl, selectedNpcId=null;
let immediateMoveMode = true;

export function initUI(){
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  canvas.width = COLS * TILE; canvas.height = ROWS * TILE;
  npcListEl = document.getElementById('npcList');
  storageListEl = document.getElementById('storageList');

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

  canvas.addEventListener('click', (ev)=>{
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (ev.clientX - rect.left) * scaleX;
    const my = (ev.clientY - rect.top) * scaleY;
    const tx = Math.floor(mx / TILE), ty = Math.floor(my / TILE);
    // first: if click on an NPC -> select it
    const clickedNpc = game.npcs.find(n => Math.hypot(n.x - mx, n.y - my) <= TILE/2);
    if (clickedNpc) { selectedNpcId = clickedNpc.id; refreshNPCList(); console.log('Selected NPC', clickedNpc.id); return; }

    // then handle actions for the selected NPC
    if (!selectedNpcId) { console.log('No NPC selected'); return; }
    const npc = game.npcs.find(n => n.id === selectedNpcId); if (!npc) { console.log('Selected NPC not found'); return; }

    const res = game.resources.find(r => r.x === tx && r.y === ty && r.amount > 0);
    if (res) {
      const task = new Task('gatherType', res.type);
      if (ev.ctrlKey) {
        // ctrl-click: immediate interrupt and move to this resource now
        npc.currentTask = new Task('move', {x: res.x, y: res.y});
        npc.target = {x: res.x, y: res.y};
        npc.tasks = [];
        console.log(`Immediate move-to-resource for NPC ${npc.id} -> ${res.type}`);
      } else if (ev.shiftKey) {
        // shift-click: priority gather
        npc.tasks.unshift(task);
        console.log(`Queued PRIORITY gatherType for NPC ${npc.id} -> ${res.type}`);
      } else {
        // normal click: enqueue gatherType (will gather that resource type)
        npc.enqueue(task);
        console.log(`Queued gatherType for NPC ${npc.id} -> ${res.type}`);
      }
      refreshNPCList();
      return;
    }

    // storage
    if (tx === game.storageTile.x && ty === game.storageTile.y) {
      const t = new Task('deposit', game.storageTile);
      if (ev.ctrlKey) {
        // ctrl-click: queue deposit after current
        npc.enqueue(t); console.log(`Queued (after current) deposit for NPC ${npc.id}`);
      } else if (ev.shiftKey) {
        npc.tasks.unshift(t); console.log(`Queued PRIORITY deposit for NPC ${npc.id}`);
      } else {
        // immediate
        npc.currentTask = new Task('move', {x: tx, y: ty}); npc.target = {x: tx, y: ty}; npc.tasks = [];
        console.log(`Immediate deposit-move for NPC ${npc.id}`);
      }
      refreshNPCList();
      return;
    }

    // empty tile -> move command
    const moveTask = new Task('move', {x:tx, y:ty});
    if (ev.ctrlKey) {
      // ctrl-click: queue move after current tasks
      npc.enqueue(moveTask); console.log(`Queued (after current) move for NPC ${npc.id} -> ${tx},${ty}`);
    } else if (ev.shiftKey) {
      npc.tasks.unshift(moveTask); console.log(`Queued PRIORITY move for NPC ${npc.id} -> ${tx},${ty}`);
    } else {
      // immediate: cancel current and move now (replacing previous immediate)
      npc.currentTask = moveTask;
      npc.target = {x: tx, y: ty};
      npc.tasks = [];
      console.log(`Immediate move for NPC ${npc.id} -> ${tx},${ty}`);
    }
    refreshNPCList();
  });

  setInterval(()=>{ refreshNPCList(); refreshStorage(); }, 500);
}

export function startLoop(){
  let last = performance.now();
  function loop(now){
    const dt = (now-last)/1000; last=now;
    for(const n of game.npcs) n.update(dt, game);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawGrid(); drawResources(); drawNPCs();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

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
  }
  ctx.fillStyle='#444'; ctx.fillRect(game.storageTile.x*TILE+2, game.storageTile.y*TILE+2, TILE-4, TILE-4);
  ctx.fillStyle='white'; ctx.font='10px sans-serif'; ctx.fillText('S', game.storageTile.x*TILE+TILE/3, game.storageTile.y*TILE+TILE/1.8);
}

function drawNPCs(){
  for(const n of game.npcs){
    ctx.beginPath(); ctx.fillStyle='#00aaff'; ctx.arc(n.x, n.y, TILE/3,0,Math.PI*2); ctx.fill();
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
      ct.textContent = 'Current: ' + (n.currentTask.kind==='gatherType'? `${n.currentTask.kind}:${n.currentTask.target}` : (n.currentTask.target && n.currentTask.target.x!==undefined? `${n.currentTask.kind}@${n.currentTask.target.x},${n.currentTask.target.y}`: n.currentTask.kind));
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
        const label = document.createElement('div'); label.style.flex='1'; label.textContent = (t.kind==='gatherType'? `${t.kind}:${t.target}` : (t.target && t.target.x!==undefined? `${t.kind}@${t.target.x},${t.target.y}`: t.kind));
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
