import { AxeTool, PickaxeTool, TOOL_CLASS_BY_KEY, getToolClass } from './tools/index.js';

export { ToolItem, AxeTool, PickaxeTool, TOOL_CLASS_BY_KEY, getToolClass } from './tools/index.js';

export const TOOL_TYPES = {
  AXE: AxeTool.key,
  PICKAXE: PickaxeTool.key
};

export const TOOL_DEFINITIONS = Object.fromEntries(
  Object.entries(TOOL_CLASS_BY_KEY).map(([key, ToolClass]) => [
    key,
    {
      key,
      name: ToolClass.displayName,
      maxDurability: Math.max(1, Number(ToolClass.maxDurability || 1)),
      durabilityCostPerUnit: Math.max(1, Number(ToolClass.durabilityCostPerUnit || 1))
    }
  ])
);

export function createEmptyToolStorage() {
  const bag = {};
  for (const key of Object.keys(TOOL_DEFINITIONS)) bag[key] = 0;
  return bag;
}

function toolDef(key) {
  return TOOL_DEFINITIONS[key] || null;
}

export function createToolItem(key, durability = null) {
  const ToolClass = getToolClass(key);
  if (!ToolClass) return null;
  return new ToolClass(durability);
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
  if (typeof tool.consumeDurability === 'function') {
    tool.consumeDurability(unitsGathered);
    return;
  }
  const def = toolDef(tool.key);
  const costPerUnit = Math.max(1, Number(def?.durabilityCostPerUnit || 1));
  const spent = Math.floor(unitsGathered * costPerUnit);
  tool.durability = Math.max(0, Number(tool.durability || 0) - spent);
}

export function toolDisplayName(toolKey) {
  const def = toolDef(toolKey);
  return def ? def.name : toolKey;
}
