import { ResourceNode } from './ResourceNode.js';
import { TreeResource } from './TreeResource.js';
import { StoneResource } from './StoneResource.js';
import { IronResource } from './IronResource.js';
import { CopperResource } from './CopperResource.js';
import { GoldResource } from './GoldResource.js';
import { SilverResource } from './SilverResource.js';
import { WildBerryResource } from './WildBerryResource.js';

export { ResourceNode, TreeResource, StoneResource, IronResource, CopperResource, GoldResource, SilverResource, WildBerryResource };

export const RESOURCE_CLASS_BY_TYPE = {
  tree: TreeResource,
  stone: StoneResource,
  iron: IronResource,
  copper: CopperResource,
  wildberry: WildBerryResource,
  silver: SilverResource,
  gold: GoldResource
};

export const RESOURCE_DEFINITIONS = Object.entries(RESOURCE_CLASS_BY_TYPE).map(([key, Ctor]) => {
  const def = Ctor.definition || { key };
  return {
    key,
    name: def.name || key,
    icon: def.icon || '',
    sprite: def.sprite || '',
    color: def.color || '#888',
    gatherDifficulty: Math.max(0.1, Number(def.gatherDifficulty ?? 1)),
    requiredTools: Array.isArray(def.requiredTools) ? def.requiredTools.filter(Boolean) : [],
    gatheredMaterial: def.gatheredMaterial || Object.keys(def.yieldItems || {})[0] || key,
    footprint: {
      w: Math.max(1, Number(def.footprint?.w || 1)),
      h: Math.max(1, Number(def.footprint?.h || 1))
    }
  };
});

export const RESOURCE_KEYS = RESOURCE_DEFINITIONS.map(d => d.key);

export function getResourceDefinition(type) {
  return RESOURCE_DEFINITIONS.find(d => d.key === type) || null;
}

export function createResourceByType(type, x, y, amount, props = {}) {
  const Ctor = RESOURCE_CLASS_BY_TYPE[type] || ResourceNode;
  if (Ctor === ResourceNode) return new ResourceNode(type, x, y, amount, props);
  return new Ctor(x, y, amount, props);
}
