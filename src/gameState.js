import { ResourceTile } from './resource.js';
import { resourceTypes, TILE, COLS, ROWS, randInt } from './util.js';

export const game = {
  grid:[],
  resources:[],
  buildings: [],
  stockpiles: [],
  npcs:[],
  storage: {},
  storageTile: null,
  resourceByType: new Map(),
  addBuilding(building){
    game.buildings.push(building);
    if (building.kind === 'stockpile') game.stockpiles.push(building);
  },
  hasBuildingAt(x, y){
    return !!game.buildings.find(b => b.x === x && b.y === y);
  },
  rebuildResourceTypeIndex(){
    game.resourceByType = new Map();
    for (const t of resourceTypes) game.resourceByType.set(t.key, []);
    for (const r of game.resources) {
      const arr = game.resourceByType.get(r.type);
      if (arr) arr.push(r);
    }
  },
  findNearestResourceOfType(npc, type){
    let best = null; let bestDist = Infinity;
    const list = game.resourceByType.get(type) || game.resources;
    for(const r of list){ if(r.type===type && r.amount>0){
      const cx = r.x*TILE+TILE/2, cy=r.y*TILE+TILE/2;
      const d = Math.hypot(cx - npc.x, cy - npc.y);
      if(d < bestDist){ bestDist = d; best = r }
    }}
    return best;
  }
};

// init storage counts
resourceTypes.forEach(r=>game.storage[r.key]=0);

// generate clustered resources (partially grouped but still random)
game.resources = [];

// rarity weights (higher = more clusters)
const typeWeights = {
  tree: 1.0,
  stone: 0.9,
  iron: 0.5,
  copper: 0.6,
  gold: 0.2
};

const baseSeeds = Math.max(3, Math.floor((COLS * ROWS) / 400));

for (const t of resourceTypes) {
  const weight = typeWeights[t.key] || 0.5;
  const seeds = Math.max(1, Math.floor(baseSeeds * weight * (0.8 + Math.random() * 0.8)));
  for (let s = 0; s < seeds; s++) {
    const cx = randInt(0, COLS - 1);
    const cy = randInt(0, ROWS - 1 - 2); // avoid storage row at bottom
    const radius = randInt(2, Math.max(3, Math.floor(Math.min(COLS, ROWS) * (0.06 + 0.03 * Math.random()))));
    for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
      const x = cx + ox, y = cy + oy;
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) continue;
      // skip storage location
      if (x === Math.floor(COLS/2) && y === ROWS-2) continue;
      const dist = Math.hypot(ox, oy);
      if (dist > radius) continue;
      // higher probability near center
      const p = 0.6 * (1 - dist / (radius + 0.001)) + 0.05 * Math.random();
      if (Math.random() < p) {
        // don't duplicate a tile at same coord
        if (game.resources.find(r => r.x === x && r.y === y)) continue;
        const amount = randInt(40, 220);
        game.resources.push(new ResourceTile(x, y, t.key, amount));
      }
    }
  }
}

// add a few stray scattered resources
for (let i = 0; i < Math.floor((COLS * ROWS) * 0.01); i++) {
  const x = randInt(0, COLS - 1), y = randInt(0, ROWS - 1 - 2);
  if (x === Math.floor(COLS/2) && y === ROWS-2) continue;
  if (game.resources.find(r => r.x === x && r.y === y)) continue;
  if (Math.random() < 0.02) {
    const t = resourceTypes[randInt(0, resourceTypes.length - 1)];
    game.resources.push(new ResourceTile(x, y, t.key, randInt(30, 150)));
  }
}

// storage at center-bottom
const sx=Math.floor(COLS/2), sy=ROWS-2;
game.storageTile = new ResourceTile(sx,sy,'storage',0);
game.rebuildResourceTypeIndex();
