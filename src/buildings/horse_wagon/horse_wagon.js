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
    buildDifficulty: 1.15,
    footprint: { w: 1, h: 2 },
    maxCount: Infinity,
    requiresBuildings: [{ kind: 'stockpile', count: 1 }],
    cost: {
      log: 18,
      stone: 8
    },
    destroyRefund: {
      log: 9,
      stone: 4
    }
  };

  constructor(x, y) {
    super(HorseWagonBuilding.definition.kind, x, y, HorseWagonBuilding.definition);

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
