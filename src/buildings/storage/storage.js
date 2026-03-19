import { Building } from '../../building.js';
import { resourceTypes } from '../../util.js';

export class StorageBuilding extends Building {
  static definition = {
    kind: 'storage',
    name: 'Storage',
    icon: '📦',
    mapSymbol: 'S',
    blocksMovement: false,
    buildDifficulty: 1.4,
    footprint: { w: 1, h: 1 },
    maxCount: Infinity,
    requiresBuildings: [{ kind: 'stockpile', count: 1 }],
    cost: {
      tree: 50,
      stone: 50
    }
  };

  constructor(x, y) {
    super(StorageBuilding.definition.kind, x, y, StorageBuilding.definition);

    this.storageCapacity = 700;
    this.storage = {};
    for (const r of resourceTypes) this.storage[r.key] = 0;

    this.palette = {
      frame: '#4f5663',
      fill: '#707b8a',
      stroke: '#2f3642',
      text: '#edf6ff'
    };
  }
}
