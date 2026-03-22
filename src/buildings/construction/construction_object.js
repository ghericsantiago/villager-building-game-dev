import { Building } from '../../building.js';

const CONSTRUCTION_OBJECT_DEFINITIONS = Object.freeze([
  {
    kind: 'door',
    name: 'Door',
    icon: '🚪',
    sprite: 'src/sprites/building_door_32x32.svg',
    mapSymbol: 'D',
    owner: 'player',
    blocksMovement: false,
    rotatable: true,
    footprint: { w: 1, h: 1 },
    maxCount: Infinity,
    requiresBuildings: [{ kind: 'horseWagon', count: 1 }],
    cost: { log: 8 },
    destroyRefund: { log: 4 },
    buildDifficulty: 1.1,
    buildGroup: 'Objects',
    buildSubgroup: 'Construction',
    buildDescription: 'Simple access point for interior builds and compounds.',
    palette: { frame: '#6b4b35', fill: '#a67851', stroke: '#3d281b', text: '#f8ead7' }
  },
  {
    kind: 'gate',
    name: 'Gate',
    icon: '🚧',
    sprite: 'src/sprites/building_gate_64x32.svg',
    mapSymbol: 'G',
    owner: 'player',
    blocksMovement: false,
    rotatable: true,
    footprint: { w: 2, h: 1 },
    maxCount: Infinity,
    requiresBuildings: [{ kind: 'horseWagon', count: 1 }],
    cost: { log: 14, stone: 4 },
    destroyRefund: { log: 7, stone: 2 },
    buildDifficulty: 1.35,
    buildGroup: 'Objects',
    buildSubgroup: 'Construction',
    buildDescription: 'Wide opening for wagon paths and settlement entrances.',
    palette: { frame: '#5d4732', fill: '#8d6a47', stroke: '#2d2117', text: '#f5e6ce' }
  },
  {
    kind: 'terrain',
    name: 'Terrain',
    icon: '🪨',
    sprite: 'src/sprites/building_terrain_32x32.svg',
    mapSymbol: 'T',
    owner: 'player',
    blocksMovement: false,
    rotatable: false,
    footprint: { w: 1, h: 1 },
    maxCount: Infinity,
    requiresBuildings: [{ kind: 'horseWagon', count: 1 }],
    cost: { stone: 3 },
    destroyRefund: { stone: 1 },
    buildDifficulty: 0.75,
    buildGroup: 'Objects',
    buildSubgroup: 'Construction',
    buildDescription: 'Prepared terrain tile for foundations and pathways.',
    palette: { frame: '#5a5f46', fill: '#879265', stroke: '#303723', text: '#eef1d0' }
  },
  {
    kind: 'wall',
    name: 'Wall',
    icon: '🧱',
    sprite: 'src/sprites/building_wall_32x32.svg',
    mapSymbol: 'W',
    owner: 'player',
    blocksMovement: true,
    rotatable: true,
    footprint: { w: 1, h: 1 },
    maxCount: Infinity,
    requiresBuildings: [{ kind: 'horseWagon', count: 1 }],
    cost: { stone: 8, log: 2 },
    destroyRefund: { stone: 4, log: 1 },
    buildDifficulty: 1.6,
    buildGroup: 'Objects',
    buildSubgroup: 'Construction',
    buildDescription: 'Solid barrier section for defensive or interior layouts.',
    palette: { frame: '#4a515b', fill: '#7a8592', stroke: '#262c33', text: '#eef4fb' }
  },
  {
    kind: 'flooring',
    name: 'Flooring',
    icon: '🟫',
    sprite: 'src/sprites/building_flooring_32x32.svg',
    mapSymbol: 'F',
    owner: 'player',
    blocksMovement: false,
    rotatable: false,
    footprint: { w: 1, h: 1 },
    maxCount: Infinity,
    requiresBuildings: [{ kind: 'horseWagon', count: 1 }],
    cost: { log: 4 },
    destroyRefund: { log: 2 },
    buildDifficulty: 0.8,
    buildGroup: 'Objects',
    buildSubgroup: 'Construction',
    buildDescription: 'Finished floor tile for interiors and polished walkways.',
    palette: { frame: '#61472d', fill: '#9b744b', stroke: '#362113', text: '#f8ead0' }
  },
  {
    kind: 'roofing',
    name: 'Roofing',
    icon: '🏠',
    sprite: 'src/sprites/building_roofing_32x32.svg',
    mapSymbol: 'R',
    owner: 'player',
    blocksMovement: false,
    rotatable: false,
    footprint: { w: 1, h: 1 },
    maxCount: Infinity,
    requiresBuildings: [{ kind: 'horseWagon', count: 1 }],
    cost: { log: 5, stone: 1 },
    destroyRefund: { log: 2 },
    buildDifficulty: 1,
    buildGroup: 'Objects',
    buildSubgroup: 'Construction',
    buildDescription: 'Roof section piece for settlement structures and covers.',
    palette: { frame: '#5d3035', fill: '#a64a53', stroke: '#321418', text: '#ffe1e5' }
  },
  {
    kind: 'utility',
    name: 'Utility',
    icon: '🛠️',
    sprite: 'src/sprites/building_utility_32x32.svg',
    mapSymbol: 'U',
    owner: 'player',
    blocksMovement: false,
    rotatable: false,
    footprint: { w: 1, h: 1 },
    maxCount: Infinity,
    requiresBuildings: [{ kind: 'horseWagon', count: 1 }],
    cost: { log: 6, stone: 2 },
    destroyRefund: { log: 3, stone: 1 },
    buildDifficulty: 1.05,
    buildGroup: 'Objects',
    buildSubgroup: 'Construction',
    buildDescription: 'General-purpose utility fixture for future services and props.',
    palette: { frame: '#35515f', fill: '#4f8191', stroke: '#18303b', text: '#def8ff' }
  },
  {
    kind: 'fence',
    name: 'Fence',
    icon: '🪵',
    sprite: 'src/sprites/building_fence_32x32.svg',
    mapSymbol: 'N',
    owner: 'player',
    blocksMovement: true,
    rotatable: true,
    footprint: { w: 1, h: 1 },
    maxCount: Infinity,
    requiresBuildings: [{ kind: 'horseWagon', count: 1 }],
    cost: { log: 5 },
    destroyRefund: { log: 2 },
    buildDifficulty: 0.95,
    buildGroup: 'Objects',
    buildSubgroup: 'Construction',
    buildDescription: 'Light perimeter segment for pens, lanes, and property lines.',
    palette: { frame: '#58412f', fill: '#8b6545', stroke: '#2c1e14', text: '#f5eadc' }
  }
]);

const CONSTRUCTION_OBJECT_BY_KIND = new Map(
  CONSTRUCTION_OBJECT_DEFINITIONS.map((definition) => [definition.kind, Object.freeze({ ...definition, palette: { ...definition.palette } })])
);

export function getConstructionObjectDefinitions() {
  return CONSTRUCTION_OBJECT_DEFINITIONS.map((definition) => CONSTRUCTION_OBJECT_BY_KIND.get(definition.kind));
}

export function getConstructionObjectDefinition(kind) {
  return CONSTRUCTION_OBJECT_BY_KIND.get(String(kind || '').trim()) || null;
}

export class ConstructionObjectBuilding extends Building {
  constructor(kind, x, y, overrides = {}) {
    const definition = getConstructionObjectDefinition(kind);
    if (!definition) {
      throw new Error(`Unknown construction object kind: ${kind}`);
    }
    super(definition.kind, x, y, { ...definition, ...overrides });
    this.palette = { ...(definition.palette || {}) };
    this.buildGroup = definition.buildGroup;
    this.buildSubgroup = definition.buildSubgroup;
    this.buildDescription = definition.buildDescription;
  }
}