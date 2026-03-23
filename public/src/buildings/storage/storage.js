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
    startConstructed: true,
    buildDifficulty: 0,
    footprint: { w: 1, h: 1 },
    maxCount: Infinity,
    requiresBuildings: [{ kind: 'horseWagon', count: 1 }],
    cost: {
      log: 50,
      stone: 50
    },
    destroyRefund: {
      log: 15,
      stone: 15
    }
    ,
    // Storage should reject quick-droppable building materials like logs and stone
    rejectItemKeys: ['log','stone']
    ,
    // items per second
    storageSpeed: 6
  };

  constructor(x, y, overrides = {}) {
    super(StorageBuilding.definition.kind, x, y, { ...StorageBuilding.definition, ...overrides });

    this.storageCapacity = 500;
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
