import { Building } from '../../building.js';
import { createEmptyToolStorage } from '../../items/tools.js';
import { createEmptyMaterialStorage } from '../../items/materials.js';

export class StorageBuilding extends Building {
  static definition = {
    kind: 'storage',
    name: 'Storage',
    icon: '📦',
    sprite: 'src/sprites/building_storage_32x32.png',
    mapSymbol: 'S',
    owner: 'player',
    blocksMovement: false,
    rotatable: false,
    buildDifficulty: 1.4,
    footprint: { w: 1, h: 1 },
    maxCount: Infinity,
    requiresBuildings: [{ kind: 'horseWagon', count: 1 }],
    cost: {
      log: 30,
      stone: 30
    },
    destroyRefund: {
      log: 15,
      stone: 15
    }
  };

  constructor(x, y, overrides = {}) {
    super(StorageBuilding.definition.kind, x, y, { ...StorageBuilding.definition, ...overrides });

    this.storageCapacity = 700;
    this.itemStorage = {
      ...createEmptyToolStorage(),
      ...createEmptyMaterialStorage()
    };

    this.palette = {
      frame: '#4f5663',
      fill: '#707b8a',
      stroke: '#2f3642',
      text: '#edf6ff'
    };
  }
}
