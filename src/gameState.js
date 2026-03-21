import { createResourceByType } from './resources/index.js';
import { resourceTypes, TILE, COLS, ROWS } from './util.js';
import { createEmptyToolStorage } from './items/tools.js';
import { createEmptyMaterialStorage } from './items/materials.js';
import { createEmptyItemStorage, createInitialItemStorage } from './state/game_defaults.js';
import { resolveInitialMapSeed } from './state/map_seed.js';
import { generateResourceMapResources } from './state/resource_map_generation.js';

function getCarryTotal(carry = {}) {
  return Object.values(carry).reduce((sum, amount) => sum + Math.max(0, Number(amount) || 0), 0);
}

function generateResourceMap(seedInput) {
  const result = generateResourceMapResources({
    seedInput,
    cols: COLS,
    rows: ROWS,
    resourceTypes,
    createResourceByType
  });
  game.mapSeed = result.seedText;
  game.resources = result.resources;
  game.rebuildResourceTypeIndex();
  return result.seedText;
}

export const game = {
  grid:[],
  resources:[],
  mapSeed: '',
  globalTaskQueue: [],
  globalTaskCursor: 0,
  buildings: [],
  storages: [],
  stockpiles: [],
  npcs:[],
  itemStorage: {},
  storageTile: null,
  resourceByType: new Map(),
  addBuilding(building){
    game.buildings.push(building);
    if (building.kind === 'storage' || building.kind === 'horseWagon') game.storages.push(building);
    if (building.kind === 'stockpile') game.stockpiles.push(building);
  },
  removeBuilding(building){
    if (!building) return false;
    const before = game.buildings.length;
    game.buildings = game.buildings.filter(b => b !== building);
    game.storages = game.storages.filter(b => b !== building);
    game.stockpiles = game.stockpiles.filter(b => b !== building);

    // Remove dangling build/deposit tasks that target the destroyed building.
    for (const npc of game.npcs) {
      if (!npc) continue;
      if (npc.target === building) npc.target = null;
      if (npc.currentTask?.target === building) npc.currentTask = null;
      if (Array.isArray(npc.tasks) && npc.tasks.length > 0) {
        npc.tasks = npc.tasks.filter(t => t?.target !== building);
      }
      if (!npc.currentTask && !npc.target && npc.state !== 'storageFull') npc.state = 'idle';
    }

    return game.buildings.length < before;
  },
  destroyBuilding(building){
    if (!building) return { removed: false, refunded: {} };

    const refund = (typeof building.getDestroyRefund === 'function')
      ? building.getDestroyRefund()
      : {};

    const removed = game.removeBuilding(building);
    if (!removed) return { removed: false, refunded: {} };

    if (!game.itemStorage) game.itemStorage = createEmptyItemStorage();
    const refunded = {};
    for (const [key, amount] of Object.entries(refund || {})) {
      const add = Math.max(0, Math.floor(Number(amount) || 0));
      if (add <= 0) continue;
      game.itemStorage[key] = (game.itemStorage[key] || 0) + add;
      refunded[key] = add;
    }

    return { removed: true, refunded };
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
    return !!target && !!target.isConstructed && (target.kind === 'storage' || target.kind === 'stockpile' || target.kind === 'horseWagon');
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
  findNearestDepositTarget(npc, carry = null){
    return game.findNearestDepositTargetForCarry(npc, carry ?? npc?.carry);
  },
  targetAcceptsItem(target, itemKey){
    if (!target) return true;
    // If the target provides a custom acceptsItem, prefer that.
    if (typeof target.acceptsItem === 'function') return !!target.acceptsItem(itemKey);
    // Enforce hard rules: logs and stones only go to stockpiles or horse wagons.
    const specialOnlyStockpile = new Set(['log', 'stone']);
    if (specialOnlyStockpile.has(itemKey)) {
      return (target.kind === 'stockpile' || target.kind === 'horseWagon');
    }
    if (!Array.isArray(target.acceptedItemKeys)) return true;
    return target.acceptedItemKeys.includes(itemKey);
  },
  targetCanAcceptAnyCarry(target, carry){
    if (!target || !carry) return false;
    if (!game.targetHasDepositSpace(target)) return false;
    for (const [itemKey, amount] of Object.entries(carry)) {
      if ((Number(amount) || 0) <= 0) continue;
      if (game.targetAcceptsItem(target, itemKey)) return true;
    }
    return false;
  },
  findNearestDepositTargetForCarry(npc, carry){
    let best = game.storageTile || null;
    let bestDist = Infinity;
    for (const t of game.getAllDepositTargets()) {
      if (carry && !game.targetCanAcceptAnyCarry(t, carry)) continue;
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
  findNearestDepositTargetWithSpace(npc, carry = null){
    let best = null;
    let bestDist = Infinity;
    for (const t of game.getAllDepositTargets()) {
      if (!game.targetHasDepositSpace(t)) continue;
      if (carry && !game.targetCanAcceptAnyCarry(t, carry)) continue;
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
    let hasFilteredRemaining = false;

    for (const k in carry) {
      const amount = carry[k] || 0;
      if (amount <= 0) continue;

      if (!game.targetAcceptsItem(target, k)) {
        hasFilteredRemaining = true;
        continue;
      }

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
      remainingCarry: getCarryTotal(carry),
      blockedByCapacity: Number.isFinite(remainingCapacity) && remainingCapacity <= 0,
      blockedByFilter: hasFilteredRemaining
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
  findNearestResourceOfType(npc, type, options = {}){
    let best = null; let bestDist = Infinity;
    const mineableTypes = new Set(['stone', 'iron', 'copper', 'silver', 'gold']);
    const isMinerSearch = type === 'miner';
    const excluded = new Set(Array.isArray(options.excludeResources) ? options.excludeResources.filter(Boolean) : []);
    const list = isMinerSearch
      ? game.resources
      : (game.resourceByType.get(type) || game.resources);
    for(const r of list){ if(r.amount>0 && !excluded.has(r) && (isMinerSearch ? mineableTypes.has(r.type) : r.type===type)){
      const requiredSkill = Math.max(0, Number(r.requiredMiningSkillLevel || 0));
      const currentSkill = Math.max(0, Number(typeof npc?.getJobSkillLevel === 'function' ? npc.getJobSkillLevel('miner') : (npc?.miningSkillLevel || 0)));
      if (currentSkill < requiredSkill) continue;
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
  },
  pruneGlobalTaskQueue(){
    game.globalTaskQueue = game.globalTaskQueue.filter((task) => {
      if (!task || task.kind !== 'gatherTile') return false;
      const tile = task.target;
      if (!tile) return false;
      if (Number(tile.amount || 0) <= 0) return false;
      return game.resources.includes(tile);
    });
    if (game.globalTaskQueue.length <= 0) {
      game.globalTaskCursor = 0;
      return;
    }
    game.globalTaskCursor %= game.globalTaskQueue.length;
  },
  enqueueGlobalGatherResources(resources = []){
    game.pruneGlobalTaskQueue();
    const existing = new Set(game.globalTaskQueue.map(t => t?.target).filter(Boolean));
    let added = 0;
    for (const res of resources) {
      if (!res || Number(res.amount || 0) <= 0) continue;
      if (!game.resources.includes(res)) continue;
      if (existing.has(res)) continue;
      game.globalTaskQueue.push({ kind: 'gatherTile', target: res });
      existing.add(res);
      added += 1;
    }
    return added;
  },
  getGlobalQueuedGatherResources(){
    game.pruneGlobalTaskQueue();
    const unique = [];
    const seen = new Set();
    for (const task of game.globalTaskQueue) {
      const target = task?.target;
      if (!target || seen.has(target)) continue;
      seen.add(target);
      unique.push(target);
    }
    return unique;
  },
  removeGlobalGatherResources(resources = []){
    game.pruneGlobalTaskQueue();
    const targets = new Set((resources || []).filter(Boolean));
    if (targets.size <= 0 || game.globalTaskQueue.length <= 0) return 0;
    const before = game.globalTaskQueue.length;
    game.globalTaskQueue = game.globalTaskQueue.filter((task) => !targets.has(task?.target));
    const removed = before - game.globalTaskQueue.length;
    if (game.globalTaskQueue.length <= 0) {
      game.globalTaskCursor = 0;
    } else {
      game.globalTaskCursor %= game.globalTaskQueue.length;
    }
    return removed;
  },
  getNextGlobalTaskForNpc(){
    game.pruneGlobalTaskQueue();
    if (game.globalTaskQueue.length <= 0) return null;

    const idx = game.globalTaskCursor % game.globalTaskQueue.length;
    const task = game.globalTaskQueue[idx];
    game.globalTaskCursor = (idx + 1) % game.globalTaskQueue.length;
    return task ? { kind: task.kind, target: task.target } : null;
  },
  regenerateResourceMap(seedInput){
    const seed = generateResourceMap(seedInput);
    game.pruneGlobalTaskQueue();
    return seed;
  }
};

// init main storage counts
game.itemStorage = createInitialItemStorage();

generateResourceMap(resolveInitialMapSeed());

// no initial placed storage building; player starts with minimal resources.
game.storageTile = null;
