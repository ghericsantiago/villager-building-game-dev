import { createEmptyToolStorage } from '../items/tools.js';
import { createEmptyMaterialStorage } from '../items/materials.js';

export function createEmptyItemStorage() {
  return {
    ...createEmptyToolStorage(),
    ...createEmptyMaterialStorage()
  };
}

export function createInitialItemStorage() {
  const storage = createEmptyItemStorage();
  storage.log = 30;
  storage.stone = 12;
  storage.axe = 9999999;
  storage.pickaxe = 9999999;
  return storage;
}
