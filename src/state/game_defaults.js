import { createEmptyToolStorage, createToolStack } from '../items/tools.js';
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
  storage.axe = [
    createToolStack('axe', 3333333, { material: 'wood' }),
    createToolStack('axe', 3333333, { material: 'stone' }),
    createToolStack('axe', 3333333, { material: 'iron' })
  ].filter(Boolean);
  storage.pickaxe = [
    createToolStack('pickaxe', 3333333, { material: 'wood' }),
    createToolStack('pickaxe', 3333333, { material: 'stone' }),
    createToolStack('pickaxe', 3333333, { material: 'iron' })
  ].filter(Boolean);
  return storage;
}
