import { Building } from '../../building.js';

export class CarpentryWorkshopBuilding extends Building {
  static definition = {
    kind: 'carpentryWorkshop',
    name: 'Carpentry Workshop',
    icon: '🪚',
    sprite: 'src/sprites/building_carpentry_workshop_64x64.svg',
    mapSymbol: 'C',
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
    super(CarpentryWorkshopBuilding.definition.kind, x, y, { ...CarpentryWorkshopBuilding.definition, ...overrides });

    this.palette = {
      frame: '#594132',
      fill: '#7c5c43',
      stroke: '#2f2219',
      text: '#f4dfbf'
    };
  }
}