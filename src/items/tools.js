export const TOOL_TYPES = {
  AXE: 'axe',
  PICKAXE: 'pickaxe'
};

export const TOOL_DEFINITIONS = {
  [TOOL_TYPES.AXE]: {
    key: TOOL_TYPES.AXE,
    name: 'Axe',
    maxDurability: 280,
    durabilityCostPerUnit: 1
  },
  [TOOL_TYPES.PICKAXE]: {
    key: TOOL_TYPES.PICKAXE,
    name: 'Pickaxe',
    maxDurability: 360,
    durabilityCostPerUnit: 1
  }
};

export function createEmptyToolStorage() {
  const bag = {};
  for (const key of Object.keys(TOOL_DEFINITIONS)) bag[key] = 0;
  return bag;
}

function toolDef(key) {
  return TOOL_DEFINITIONS[key] || null;
}

export function createToolItem(key, durability = null) {
  const def = toolDef(key);
  if (!def) return null;
  const maxDurability = Math.max(1, Number(def.maxDurability || 1));
  return {
    key,
    durability: Number.isFinite(durability)
      ? Math.max(0, Math.min(maxDurability, Math.floor(durability)))
      : maxDurability,
    maxDurability
  };
}

export function createStarterWorkerTools() {
  return {
    [TOOL_TYPES.AXE]: createToolItem(TOOL_TYPES.AXE),
    [TOOL_TYPES.PICKAXE]: createToolItem(TOOL_TYPES.PICKAXE)
  };
}

export function getResourceRequiredTools(resource) {
  if (!Array.isArray(resource?.requiredTools)) return [];
  return resource.requiredTools.filter(k => !!toolDef(k));
}

export function getUsableToolForResource(tools, resource) {
  const required = getResourceRequiredTools(resource);
  if (required.length <= 0) return null;

  for (const key of required) {
    const tool = tools?.[key];
    if (tool && Number(tool.durability || 0) > 0) return tool;
  }
  return null;
}

export function resourceRequiresTool(resource) {
  return getResourceRequiredTools(resource).length > 0;
}

export function consumeToolDurability(tool, resource, unitsGathered) {
  if (!tool || !Number.isFinite(unitsGathered) || unitsGathered <= 0) return;
  const def = toolDef(tool.key);
  const costPerUnit = Math.max(1, Number(def?.durabilityCostPerUnit || 1));
  const spent = Math.floor(unitsGathered * costPerUnit);
  tool.durability = Math.max(0, Number(tool.durability || 0) - spent);
}

export function toolDisplayName(toolKey) {
  const def = toolDef(toolKey);
  return def ? def.name : toolKey;
}
