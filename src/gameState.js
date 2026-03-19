import { createResourceByType } from './resources/index.js';
import { resourceTypes, TILE, COLS, ROWS, randInt } from './util.js';
import { createEmptyToolStorage } from './items/tools.js';
import { createEmptyMaterialStorage } from './items/materials.js';

function createEmptyItemStorage(){
  return {
    ...createEmptyToolStorage(),
    ...createEmptyMaterialStorage()
  };
}

export const game = {
  grid:[],
  resources:[],
  buildings: [],
  storages: [],
  stockpiles: [],
  npcs:[],
  itemStorage: {},
  storageTile: null,
  resourceByType: new Map(),
  addBuilding(building){
    game.buildings.push(building);
    if (building.kind === 'storage') game.storages.push(building);
    if (building.kind === 'stockpile') game.stockpiles.push(building);
  },
  countBuildings(kind, options = {}){
    const constructedOnly = !!options.constructedOnly;
    return game.buildings.reduce((n, b) => {
      if (b.kind !== kind) return n;
      if (constructedOnly && !b.isConstructed) return n;
      return n + 1;
    }, 0);
  },
  hasBuildingAt(x, y){
    return !!game.buildings.find(b => (typeof b.occupiesTile === 'function') ? b.occupiesTile(x, y) : (b.x === x && b.y === y));
  },
  getAllDepositTargets(){
    return [...game.storages, ...game.stockpiles].filter(t => !!t && t.isConstructed);
  },
  isDepositTarget(target){
    return !!target && !!target.isConstructed && (target.kind === 'storage' || target.kind === 'stockpile');
  },
  getAllItemStorageBuckets(){
    const buckets = [game.itemStorage];
    for (const b of game.getAllDepositTargets()) {
      if (b.itemStorage) buckets.push(b.itemStorage);
    }
    return buckets;
  },
  addToolsToStorage(toolKey, amount = 1){
    const add = Math.max(0, Math.floor(Number(amount) || 0));
    if (add <= 0) return 0;
    if (!game.itemStorage) game.itemStorage = createEmptyItemStorage();
    game.itemStorage[toolKey] = (game.itemStorage[toolKey] || 0) + add;
    return add;
  },
  takeToolsFromStorage(toolKey, amount = 1){
    let remain = Math.max(0, Math.floor(Number(amount) || 0));
    if (remain <= 0) return 0;
    let taken = 0;
    for (const bucket of game.getAllItemStorageBuckets()) {
      const avail = Math.max(0, Number(bucket?.[toolKey] || 0));
      if (avail <= 0) continue;
      const use = Math.min(avail, remain);
      bucket[toolKey] = avail - use;
      taken += use;
      remain -= use;
      if (remain <= 0) break;
    }
    return taken;
  },
  findNearestDepositTarget(npc){
    let best = game.storageTile || null;
    let bestDist = Infinity;
    for (const t of game.getAllDepositTargets()) {
      const fw = t.footprint?.w || 1;
      const fh = t.footprint?.h || 1;
      const cx = (t.x + fw / 2) * TILE;
      const cy = (t.y + fh / 2) * TILE;
      const d = Math.hypot(cx - npc.x, cy - npc.y);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  },
  getTargetStoredTotal(target){
    if (!target || !target.itemStorage) return 0;
    return Object.values(target.itemStorage).reduce((sum, amount) => sum + Math.max(0, Number(amount) || 0), 0);
  },
  getTargetRemainingCapacity(target){
    if (!target) return Infinity;
    const cap = Number(target.storageCapacity);
    if (!Number.isFinite(cap)) return Infinity;
    return Math.max(0, cap - game.getTargetStoredTotal(target));
  },
  targetHasDepositSpace(target){
    return game.getTargetRemainingCapacity(target) > 0;
  },
  findNearestDepositTargetWithSpace(npc){
    let best = null;
    let bestDist = Infinity;
    for (const t of game.getAllDepositTargets()) {
      if (!game.targetHasDepositSpace(t)) continue;
      const fw = t.footprint?.w || 1;
      const fh = t.footprint?.h || 1;
      const cx = (t.x + fw / 2) * TILE;
      const cy = (t.y + fh / 2) * TILE;
      const d = Math.hypot(cx - npc.x, cy - npc.y);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  },
  depositCarryToTarget(target, carry){
    const targetStorage = (target && target.itemStorage)
      ? target.itemStorage
      : game.itemStorage;

    let remainingCapacity = (target && target.itemStorage)
      ? game.getTargetRemainingCapacity(target)
      : Infinity;
    let deposited = 0;

    for (const k in carry) {
      const amount = carry[k] || 0;
      if (amount <= 0) continue;

      if (remainingCapacity <= 0) break;

      const put = Math.min(amount, remainingCapacity);
      if (put <= 0) continue;
      targetStorage[k] = (targetStorage[k] || 0) + put;
      carry[k] = amount - put;
      deposited += put;
      if (Number.isFinite(remainingCapacity)) remainingCapacity -= put;
    }

    return {
      deposited,
      remainingCarry: Object.values(carry).reduce((sum, amount) => sum + Math.max(0, Number(amount) || 0), 0),
      blockedByCapacity: Number.isFinite(remainingCapacity) && remainingCapacity <= 0
    };
  },
  getPooledToolItems(){
    const totals = createEmptyToolStorage();
    for (const bucket of game.getAllItemStorageBuckets()) {
      for (const k of Object.keys(totals)) {
        totals[k] = (totals[k] || 0) + (bucket?.[k] || 0);
      }
    }
    return totals;
  },
  getPooledMaterialItems(){
    const totals = createEmptyMaterialStorage();
    for (const bucket of game.getAllItemStorageBuckets()) {
      for (const k of Object.keys(totals)) {
        totals[k] = (totals[k] || 0) + (bucket?.[k] || 0);
      }
    }
    return totals;
  },
  getPooledItemCounts(){
    const totals = createEmptyItemStorage();
    for (const bucket of game.getAllItemStorageBuckets()) {
      for (const k of Object.keys(totals)) {
        totals[k] = (totals[k] || 0) + (bucket?.[k] || 0);
      }
    }
    return totals;
  },
  getPooledCarriedItemCounts(){
    const totals = createEmptyItemStorage();
    for (const npc of game.npcs) {
      const carry = npc?.carry || {};
      for (const key of Object.keys(carry)) {
        const amount = Math.max(0, Number(carry[key]) || 0);
        if (amount <= 0) continue;
        totals[key] = (totals[key] || 0) + amount;
      }
    }
    return totals;
  },
  getPooledBuildAvailableItems(){
    const totals = game.getPooledItemCounts();
    const carried = game.getPooledCarriedItemCounts();
    for (const [key, amount] of Object.entries(carried)) {
      totals[key] = (totals[key] || 0) + (amount || 0);
    }
    return totals;
  },
  // Compatibility wrappers for existing callers.
  getPooledStorage(){
    return game.getPooledMaterialItems();
  },
  getPooledToolStorage(){
    return game.getPooledToolItems();
  },
  hasRequiredBuildings(requirements = []){
    for (const req of requirements) {
      const kind = req.kind;
      const minCount = req.count ?? 1;
      if (!kind) continue;
      if (game.countBuildings(kind, { constructedOnly: true }) < minCount) return false;
    }
    return true;
  },
  canAfford(cost = {}){
    const totals = game.getPooledBuildAvailableItems();
    for (const [itemKey, amount] of Object.entries(cost)) {
      if ((totals[itemKey] || 0) < amount) return false;
    }
    return true;
  },
  spendCost(cost = {}){
    if (!game.canAfford(cost)) return false;
    for (const [itemKey, amount] of Object.entries(cost)) {
      let remain = Math.max(0, Number(amount) || 0);

      // Spend from pooled storage first.
      for (const bucket of game.getAllItemStorageBuckets()) {
        const avail = Math.max(0, Number(bucket?.[itemKey] || 0));
        if (avail <= 0) continue;
        const take = Math.min(avail, remain);
        bucket[itemKey] = avail - take;
        remain -= take;
        if (remain <= 0) break;
      }

      // If needed, spend from villagers currently carrying items.
      if (remain > 0) {
        for (const npc of game.npcs) {
          const carry = npc?.carry;
          if (!carry) continue;
          const avail = Math.max(0, Number(carry[itemKey] || 0));
          if (avail <= 0) continue;
          const take = Math.min(avail, remain);
          carry[itemKey] = avail - take;
          remain -= take;
          if (remain <= 0) break;
        }
      }
    }
    return true;
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
      const fw = r.footprint?.w || 1;
      const fh = r.footprint?.h || 1;
      const cx = (r.x + fw / 2) * TILE;
      const cy = (r.y + fh / 2) * TILE;
      const d = Math.hypot(cx - npc.x, cy - npc.y);
      if(d < bestDist){ bestDist = d; best = r }
    }}
    return best;
  },
  findNearestUnfinishedBuilding(npc){
    let best = null;
    let bestDist = Infinity;
    for (const b of game.buildings) {
      if (b.isConstructed) continue;
      const fw = b.footprint?.w || 1;
      const fh = b.footprint?.h || 1;
      const cx = (b.x + fw / 2) * TILE;
      const cy = (b.y + fh / 2) * TILE;
      const d = Math.hypot(cx - npc.x, cy - npc.y);
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  },
  getResourceAtTile(tx, ty){
    return game.resources.find(r => r.amount > 0 && ((typeof r.occupiesTile === 'function') ? r.occupiesTile(tx, ty) : (r.x === tx && r.y === ty))) || null;
  },
  hasResourceAt(tx, ty){
    return !!game.getResourceAtTile(tx, ty);
  }
};

// init main storage counts
game.itemStorage = createEmptyItemStorage();
game.itemStorage.log = 30;
game.itemStorage.stone = 12;
game.itemStorage.axe = 4;
game.itemStorage.pickaxe = 4;

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
        if (game.hasResourceAt(x, y)) continue;
        const amount = randInt(40, 220);
        game.resources.push(createResourceByType(t.key, x, y, amount));
      }
    }
  }
}

// add a few stray scattered resources
for (let i = 0; i < Math.floor((COLS * ROWS) * 0.01); i++) {
  const x = randInt(0, COLS - 1), y = randInt(0, ROWS - 1 - 2);
  if (x === Math.floor(COLS/2) && y === ROWS-2) continue;
  if (game.hasResourceAt(x, y)) continue;
  if (Math.random() < 0.02) {
    const t = resourceTypes[randInt(0, resourceTypes.length - 1)];
    game.resources.push(createResourceByType(t.key, x, y, randInt(30, 150)));
  }
}

// no initial placed storage building; player starts with minimal resources.
game.storageTile = null;
game.rebuildResourceTypeIndex();
