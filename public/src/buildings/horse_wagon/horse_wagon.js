import { Building } from '../../building.js';
import { createEmptyToolStorage } from '../../items/tools.js';
import { createEmptyMaterialStorage } from '../../items/materials.js';

export class HorseWagonBuilding extends Building {
  static definition = {
    kind: 'horseWagon',
    name: 'Horse Wagon',
    icon: '🛻',
    sprite: 'src/sprites/building_horse_wagon_32x64.png',
    mapSymbol: 'W',
    owner: 'player',
    blocksMovement: false,
    rotatable: true,
    startConstructed: true,
    buildDifficulty: 1.15,
    footprint: { w: 1, h: 2 },
    maxCount: 1,
    requiresBuildings: [],
    cost: {
      log: 18,
      stone: 8
    },
    destroyRefund: {
      log: 9,
      stone: 4
    }
    ,
    // wagon is reasonably quick but limited capacity
    storageSpeed: 12
  };

  constructor(x, y, overrides = {}) {
    super(HorseWagonBuilding.definition.kind, x, y, { ...HorseWagonBuilding.definition, ...overrides });

    this.storageCapacity = 220;
    this.itemStorage = {
      ...createEmptyToolStorage(),
      ...createEmptyMaterialStorage()
    };

    this.palette = {
      frame: '#5b4635',
      fill: '#725944',
      stroke: '#35271d',
      text: '#ead7be'
    };
  }
}
