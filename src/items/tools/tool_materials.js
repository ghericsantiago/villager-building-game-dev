export const DEFAULT_TOOL_MATERIAL = 'wood';

export const TOOL_MATERIAL_DEFINITIONS = {
  wood: {
    key: 'wood',
    name: 'Wood',
    durabilityMultiplier: 1
  },
  stone: {
    key: 'stone',
    name: 'Stone',
    durabilityMultiplier: 1.35
  },
  copper: {
    key: 'copper',
    name: 'Copper',
    durabilityMultiplier: 1.55
  },
  iron: {
    key: 'iron',
    name: 'Iron',
    durabilityMultiplier: 1.85
  },
  gold: {
    key: 'gold',
    name: 'Gold',
    durabilityMultiplier: 1.15
  }
};

export function normalizeToolMaterial(materialKey) {
  const key = String(materialKey || '').trim().toLowerCase();
  return TOOL_MATERIAL_DEFINITIONS[key] ? key : DEFAULT_TOOL_MATERIAL;
}

export function getToolMaterialDefinition(materialKey) {
  const key = normalizeToolMaterial(materialKey);
  return TOOL_MATERIAL_DEFINITIONS[key] || TOOL_MATERIAL_DEFINITIONS[DEFAULT_TOOL_MATERIAL];
}

export function toolMaterialDisplayName(materialKey) {
  return getToolMaterialDefinition(materialKey).name;
}