import { Building } from '../../building.js';
import { createEmptyToolStorage } from '../../items/tools.js';
import { createEmptyMaterialStorage } from '../../items/materials.js';

export class StockpileBuilding extends Building {
  static definition = {
    kind: 'stockpile',
    name: 'Stockpile',
    icon: '🪵',
    mapSymbol: 'P',
    blocksMovement: false,
    startConstructed: true,
    buildDifficulty: 0,
    footprint: { w: 2, h: 1 },
    maxCount: 1,
    requiresBuildings: [],
    cost: {
      log: 30,
      stone: 12
    }
  };

  constructor(x, y) {
    super(StockpileBuilding.definition.kind, x, y, StockpileBuilding.definition);

    this.storageCapacity = 300;
    this.itemStorage = {
      ...createEmptyToolStorage(),
      ...createEmptyMaterialStorage()
    };

    // Keep render props on the instance so this building can be themed or customized later.
    this.palette = {
      frame: '#6d4d30',
      fill: '#8c6642',
      stroke: '#4a311f',
      text: '#f0dfbf'
    };
  }
}
