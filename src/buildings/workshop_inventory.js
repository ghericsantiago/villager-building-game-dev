import { createEmptyItemStorage } from '../state/game_defaults.js';
import { getToolStorageCount, isToolKey, takeToolFromStorageBucket } from '../items/tools.js';

function getStoredItemCount(itemKey, value) {
  if (isToolKey(itemKey)) return getToolStorageCount(value);
  return Math.max(0, Number(value) || 0);
}

export function formatWorkshopCost(cost = {}) {
  return Object.entries(cost)
    .map(([key, amount]) => `${key} x${Math.max(0, Math.floor(Number(amount) || 0))}`)
    .join(', ');
}

export function getWorkshopAcceptedItemKeys(recipes = []) {
  const accepted = new Set();
  for (const recipe of recipes) {
    for (const key of Object.keys(recipe?.cost || {})) {
      const normalized = String(key || '').trim();
      if (normalized) accepted.add(normalized);
    }
  }
  return [...accepted];
}

export function createWorkshopInputStorage(initialStorage = null) {
  const storage = createEmptyItemStorage();
  if (!initialStorage || typeof initialStorage !== 'object') return storage;
  for (const [key, value] of Object.entries(initialStorage)) {
    if (!Object.prototype.hasOwnProperty.call(storage, key)) continue;
    if (isToolKey(key)) continue;
    storage[key] = Math.max(0, Math.floor(Number(value) || 0));
  }
  return storage;
}

export function getStoredCostShortfall(storage, cost = {}) {
  const shortfall = {};
  for (const [itemKey, amount] of Object.entries(cost)) {
    const required = Math.max(0, Math.floor(Number(amount) || 0));
    if (required <= 0) continue;
    const available = getStoredItemCount(itemKey, storage?.[itemKey]);
    if (available >= required) continue;
    shortfall[itemKey] = required - available;
  }
  return shortfall;
}

export function hasStoredCost(storage, cost = {}) {
  return Object.keys(getStoredCostShortfall(storage, cost)).length <= 0;
}

export function sumWorkshopCosts(costs = []) {
  const total = {};
  for (const cost of costs) {
    for (const [itemKey, amount] of Object.entries(cost || {})) {
      const add = Math.max(0, Math.floor(Number(amount) || 0));
      if (add <= 0) continue;
      total[itemKey] = (total[itemKey] || 0) + add;
    }
  }
  return total;
}

export function refundExcessStoredCost(storage, requiredCost = {}, game, acceptedItemKeys = []) {
  if (!storage || !game) return {};
  const refunded = {};
  const keys = acceptedItemKeys.length > 0 ? acceptedItemKeys : Object.keys(storage || {});
  for (const itemKey of keys) {
    const required = Math.max(0, Math.floor(Number(requiredCost?.[itemKey] || 0) || 0));
    const available = getStoredItemCount(itemKey, storage?.[itemKey]);
    const excess = Math.max(0, available - required);
    if (excess <= 0) continue;

    if (isToolKey(itemKey)) {
      let refundedCount = 0;
      while (refundedCount < excess) {
        const taken = takeToolFromStorageBucket(storage, itemKey);
        if (!taken) break;
        game.addToolsToStorage(itemKey, 1, taken);
        refundedCount += 1;
      }
      if (refundedCount > 0) refunded[itemKey] = refundedCount;
      continue;
    }

    storage[itemKey] = Math.max(0, available - excess);
    if (!game.itemStorage) game.itemStorage = createEmptyItemStorage();
    game.itemStorage[itemKey] = Math.max(0, Number(game.itemStorage[itemKey] || 0)) + excess;
    refunded[itemKey] = excess;
  }
  return refunded;
}

export function consumeStoredCost(storage, cost = {}) {
  if (!hasStoredCost(storage, cost)) return false;
  for (const [itemKey, amount] of Object.entries(cost)) {
    let remaining = Math.max(0, Math.floor(Number(amount) || 0));
    if (remaining <= 0) continue;
    if (isToolKey(itemKey)) {
      while (remaining > 0) {
        const taken = takeToolFromStorageBucket(storage, itemKey);
        if (!taken) break;
        remaining -= 1;
      }
      continue;
    }
    const available = Math.max(0, Number(storage?.[itemKey] || 0));
    storage[itemKey] = Math.max(0, available - remaining);
  }
  return true;
}