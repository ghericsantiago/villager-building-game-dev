import { ResourceTile } from './resource.js';
import { resourceTypes, TILE, COLS, ROWS, randInt } from './util.js';

export const game = {
  grid:[],
  resources:[],
  npcs:[],
  storage: {},
  storageTile: null,
  findNearestResourceOfType(npc, type){
    let best = null; let bestDist = Infinity;
    for(const r of game.resources){ if(r.type===type && r.amount>0){
      const cx = r.x*TILE+TILE/2, cy=r.y*TILE+TILE/2;
      const d = Math.hypot(cx - npc.x, cy - npc.y);
      if(d < bestDist){ bestDist = d; best = r }
    }}
    return best;
  }
};

// init storage counts
resourceTypes.forEach(r=>game.storage[r.key]=0);

// generate random resources
for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){
  if(Math.random()<0.07){
    const t = resourceTypes[randInt(0,resourceTypes.length-1)];
    const amount = randInt(50,200);
    const tile = new ResourceTile(x,y,t.key,amount);
    game.resources.push(tile);
  }
}

// storage at center-bottom
const sx=Math.floor(COLS/2), sy=ROWS-2;
game.storageTile = new ResourceTile(sx,sy,'storage',0);
