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
    createToolStack('axe', 5, { material: 'wood' }),
    createToolStack('axe', 0, { material: 'stone' }),
    createToolStack('axe', 0, { material: 'iron' })
  ].filter(Boolean);
  storage.pickaxe = [
    createToolStack('pickaxe', 5, { material: 'wood' }),
    createToolStack('pickaxe', 0, { material: 'stone' }),
    createToolStack('pickaxe', 0, { material: 'iron' })
  ].filter(Boolean);
  return storage;
}
