import { Building } from '../../building.js';

export class MasonryWorkshopBuilding extends Building {
  static definition = {
    kind: 'masonryWorkshop',
    name: 'Masonry Workshop',
    icon: '🧱',
    sprite: 'src/sprites/building_masonry_workshop_64x64.svg',
    mapSymbol: 'M',
    owner: 'player',
    blocksMovement: false,
    rotatable: false,
    footprint: { w: 2, h: 2 },
    maxCount: Infinity,
    requiresBuildings: [
      { kind: 'horseWagon', count: 1 },
      { kind: 'storage', count: 1 }
    ],
    cost: {
      log: 50,
      stone: 50
    },
    destroyRefund: {
      log: 25,
      stone: 25
    },
    buildDifficulty: 3.4
  };

  constructor(x, y, overrides = {}) {
    super(MasonryWorkshopBuilding.definition.kind, x, y, { ...MasonryWorkshopBuilding.definition, ...overrides });

    this.palette = {
      frame: '#505862',
      fill: '#77828f',
      stroke: '#293039',
      text: '#edf6ff'
    };
  }
}