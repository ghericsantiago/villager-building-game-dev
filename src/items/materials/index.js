import { LogItem } from './LogItem.js';
import { StoneItem } from './StoneItem.js';
import { IronOreItem } from './IronOreItem.js';
import { CopperOreItem } from './CopperOreItem.js';
import { GoldOreItem } from './GoldOreItem.js';
import { IronIngotItem } from './IronIngotItem.js';

export { MaterialItem } from './MaterialItem.js';
export { LogItem } from './LogItem.js';
export { StoneItem } from './StoneItem.js';
export { IronOreItem } from './IronOreItem.js';
export { CopperOreItem } from './CopperOreItem.js';
export { GoldOreItem } from './GoldOreItem.js';
export { IronIngotItem } from './IronIngotItem.js';

export const MATERIAL_CLASS_BY_KEY = {
  [LogItem.key]: LogItem,
  [StoneItem.key]: StoneItem,
  [IronOreItem.key]: IronOreItem,
  [CopperOreItem.key]: CopperOreItem,
  [GoldOreItem.key]: GoldOreItem,
  [IronIngotItem.key]: IronIngotItem
};

export const MATERIAL_DEFINITIONS = Object.fromEntries(
  Object.entries(MATERIAL_CLASS_BY_KEY).map(([key, ItemClass]) => [
    key,
    {
      key,
      name: ItemClass.displayName,
      icon: ItemClass.icon || '📦',
      sprite: ItemClass.sprite || ''
    }
  ])
);

export function createEmptyMaterialStorage() {
  const bag = {};
  for (const key of Object.keys(MATERIAL_CLASS_BY_KEY)) bag[key] = 0;
  return bag;
}

export function materialDisplayName(key) {
  return MATERIAL_DEFINITIONS[key]?.name || key;
}

export function materialIcon(key) {
  return MATERIAL_DEFINITIONS[key]?.icon || '📦';
}

export function materialSprite(key) {
  return MATERIAL_DEFINITIONS[key]?.sprite || '';
}
