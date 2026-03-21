import { createResourceByType } from './resources/index.js';
import { resourceTypes, TILE, COLS, ROWS } from './util.js';
import {
  addToolToStorageBucket,
  createEmptyToolCountStorage,
  createEmptyToolStorage,
  getPooledToolVariantEntries,
  getToolStorageCount,
  isToolKey,
  takeToolFromStorageBucket
} from './items/tools.js';
import { createEmptyMaterialStorage } from './items/materials.js';
import { createEmptyItemStorage, createInitialItemStorage } from './state/game_defaults.js';
import { resolveInitialMapSeed } from './state/map_seed.js';
import { generateResourceMapResources } from './state/resource_map_generation.js';

function getStoredItemCount(itemKey, value) {
  if (isToolKey(itemKey)) return getToolStorageCount(value);
  return Math.max(0, Number(value) || 0);
}

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
      if (isToolKey(key)) {
        game.addToolsToStorage(key, add);
      } else {
        game.itemStorage[key] = (game.itemStorage[key] || 0) + add;
      }
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
  addToolsToStorage(toolOrKey, amount = 1, options = {}){
    if (!game.itemStorage) game.itemStorage = createEmptyItemStorage();
    return addToolToStorageBucket(game.itemStorage, toolOrKey, amount, options);
  },
  takeToolsFromStorage(toolKey, options = {}){
    for (const bucket of game.getAllItemStorageBuckets()) {
      const taken = takeToolFromStorageBucket(bucket, toolKey, options);
      if (taken) return taken;
    }
    return null;
  },
  findNearestDepositTarget(npc, carry = null){
    return game.findNearestDepositTargetForCarry(npc, carry ?? npc?.carry);
  },
  targetAcceptsItem(target, itemKey){
    if (!target) return true;
    // If a building explicitly rejects some items, honor that first.
    if (Array.isArray(target.rejectItemKeys) && target.rejectItemKeys.includes(itemKey)) return false;
    // If the target provides a custom acceptsItem, prefer that.
    const accepted = (typeof target.acceptsItem === 'function')
      ? !!target.acceptsItem(itemKey)
      : (!Array.isArray(target.acceptedItemKeys) || target.acceptedItemKeys.includes(itemKey));
    if (!accepted) return false;
    return game.getTargetRemainingItemCapacity(target, itemKey) > 0;
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
    return Object.entries(target.itemStorage).reduce((sum, [key, value]) => sum + getStoredItemCount(key, value), 0);
  },
  getTargetItemLimit(target, itemKey){
    if (!target || !itemKey) return Infinity;
    if (typeof target.getItemLimit === 'function') {
      const limit = target.getItemLimit(itemKey);
      return Number.isFinite(limit) && limit >= 0 ? limit : Infinity;
    }
    const limit = Number(target?.itemLimitByKey?.[itemKey]);
    return Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : Infinity;
  },
  getTargetRemainingItemCapacity(target, itemKey){
    const limit = game.getTargetItemLimit(target, itemKey);
    if (!Number.isFinite(limit)) return Infinity;
    const current = getStoredItemCount(itemKey, target?.itemStorage?.[itemKey]);
    return Math.max(0, limit - current);
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

      const itemCapacity = game.getTargetRemainingItemCapacity(target, k);
      const put = Math.min(amount, remainingCapacity, itemCapacity);
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
    const totals = createEmptyToolCountStorage();
    for (const bucket of game.getAllItemStorageBuckets()) {
      for (const k of Object.keys(totals)) {
        totals[k] = (totals[k] || 0) + getToolStorageCount(bucket?.[k]);
      }
    }
    return totals;
  },
  getPooledToolVariants(){
    return getPooledToolVariantEntries(game.getAllItemStorageBuckets());
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
    const totals = {
      ...createEmptyToolCountStorage(),
      ...createEmptyMaterialStorage()
    };
    for (const bucket of game.getAllItemStorageBuckets()) {
      for (const k of Object.keys(totals)) {
        totals[k] = (totals[k] || 0) + getStoredItemCount(k, bucket?.[k]);
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
  canAffordStoredCost(cost = {}){
    const totals = game.getPooledItemCounts();
    for (const [itemKey, amount] of Object.entries(cost)) {
      if ((totals[itemKey] || 0) < amount) return false;
    }
    return true;
  },
  spendStoredCost(cost = {}){
    if (!game.canAffordStoredCost(cost)) return false;
    for (const [itemKey, amount] of Object.entries(cost)) {
      let remain = Math.max(0, Number(amount) || 0);
      for (const bucket of game.getAllItemStorageBuckets()) {
        const avail = getStoredItemCount(itemKey, bucket?.[itemKey]);
        if (avail <= 0) continue;
        const take = Math.min(avail, remain);
        if (isToolKey(itemKey)) {
          for (let index = 0; index < take; index += 1) takeToolFromStorageBucket(bucket, itemKey);
        } else {
          bucket[itemKey] = avail - take;
        }
        remain -= take;
        if (remain <= 0) break;
      }
    }
    return true;
  },
  spendCost(cost = {}){
    if (!game.canAfford(cost)) return false;
    for (const [itemKey, amount] of Object.entries(cost)) {
      let remain = Math.max(0, Number(amount) || 0);

      // Spend from pooled storage first.
      for (const bucket of game.getAllItemStorageBuckets()) {
        const avail = getStoredItemCount(itemKey, bucket?.[itemKey]);
        if (avail <= 0) continue;
        const take = Math.min(avail, remain);
        if (isToolKey(itemKey)) {
          for (let index = 0; index < take; index += 1) takeToolFromStorageBucket(bucket, itemKey);
        } else {
          bucket[itemKey] = avail - take;
        }
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
  findNearestWorkshopForJob(npc, jobKey, options = {}){
    const normalizedJob = String(jobKey || '').trim().toLowerCase();
    const excluded = new Set(Array.isArray(options.excludeBuildings) ? options.excludeBuildings.filter(Boolean) : []);
    let best = null;
    let bestDist = Infinity;
    for (const building of game.buildings) {
      if (!building || excluded.has(building) || !building.isConstructed) continue;
      if (String(building.requiredWorkerJob || '').trim().toLowerCase() !== normalizedJob) continue;
      const fw = building.footprint?.w || 1;
      const fh = building.footprint?.h || 1;
      const cx = (building.x + fw / 2) * TILE;
      const cy = (building.y + fh / 2) * TILE;
      const d = Math.hypot(cx - npc.x, cy - npc.y);
      if (d < bestDist) {
        bestDist = d;
        best = building;
      }
    }
    return best;
  },
  countWorkersAtBuilding(building, jobKey = null){
    if (!building) return 0;
    const normalizedJob = jobKey ? String(jobKey || '').trim().toLowerCase() : null;
    const fw = building.footprint?.w || 1;
    const fh = building.footprint?.h || 1;
    const centerX = (building.x + fw / 2) * TILE;
    const centerY = (building.y + fh / 2) * TILE;
    const threshold = Math.max(2, TILE * 0.2);
    let count = 0;
    for (const npc of game.npcs) {
      if (!npc || npc.currentTask?.kind !== 'workBuilding') continue;
      if (npc.currentTask.target !== building) continue;
      if (normalizedJob && String(npc.job || '').trim().toLowerCase() !== normalizedJob) continue;
      const distance = Math.hypot(Number(npc.x || 0) - centerX, Number(npc.y || 0) - centerY);
      if (distance > threshold) continue;
      count += 1;
    }
    return count;
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
