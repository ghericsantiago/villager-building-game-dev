import { AxeTool, PickaxeTool, TOOL_CLASS_BY_KEY, getToolClass } from './tools/index.js';
import {
  DEFAULT_TOOL_MATERIAL,
  TOOL_MATERIAL_DEFINITIONS,
  getToolMaterialDefinition,
  normalizeToolMaterial,
  toolMaterialDisplayName
} from './tools/tool_materials.js';

export { ToolItem, AxeTool, PickaxeTool, TOOL_CLASS_BY_KEY, getToolClass } from './tools/index.js';
export {
  DEFAULT_TOOL_MATERIAL,
  TOOL_MATERIAL_DEFINITIONS,
  getToolMaterialDefinition,
  normalizeToolMaterial,
  toolMaterialDisplayName
} from './tools/tool_materials.js';

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
      icon: ToolClass.icon || '',
      sprite: ToolClass.sprite || '',
      maxDurability: Math.max(1, Number(ToolClass.maxDurability || 1)),
      durabilityCostPerUnit: Math.max(1, Number(ToolClass.durabilityCostPerUnit || 1)),
      defaultMaterial: normalizeToolMaterial(ToolClass.defaultMaterial || DEFAULT_TOOL_MATERIAL)
    }
  ])
);

export function createEmptyToolStorage() {
  const bag = {};
  for (const key of Object.keys(TOOL_DEFINITIONS)) bag[key] = [];
  return bag;
}

export function createEmptyToolCountStorage() {
  const bag = {};
  for (const key of Object.keys(TOOL_DEFINITIONS)) bag[key] = 0;
  return bag;
}

function toolDef(key) {
  return TOOL_DEFINITIONS[key] || null;
}

export function isToolKey(key) {
  return !!toolDef(key);
}

function getToolMaxDurabilityForMaterial(key, material) {
  const def = toolDef(key);
  if (!def) return 1;
  const materialDef = getToolMaterialDefinition(material);
  return Math.max(1, Math.round(Math.max(1, Number(def.maxDurability || 1)) * Math.max(0.1, Number(materialDef.durabilityMultiplier || 1))));
}

function normalizeStackCount(count) {
  return Math.max(0, Math.floor(Number(count) || 0));
}

function normalizeToolStackEntry(key, entry) {
  if (!entry) return null;
  const material = normalizeToolMaterial(entry.material);
  const maxDurability = Math.max(1, Math.floor(Number(entry.maxDurability) || getToolMaxDurabilityForMaterial(key, material)));
  const durability = Math.max(0, Math.min(maxDurability, Math.floor(Number(entry.durability) || maxDurability)));
  const count = normalizeStackCount(entry.count);
  if (count <= 0) return null;
  return {
    key,
    material,
    durability,
    maxDurability,
    count
  };
}

export function getToolStorageCount(value) {
  if (Array.isArray(value)) {
    return value.reduce((sum, entry) => sum + normalizeStackCount(entry?.count), 0);
  }
  return normalizeStackCount(value);
}

export function listToolStorageEntries(bucket, key) {
  if (!isToolKey(key)) return [];
  const value = bucket?.[key];
  if (Array.isArray(value)) {
    return value.map(entry => normalizeToolStackEntry(key, entry)).filter(Boolean);
  }

  const legacyCount = normalizeStackCount(value);
  if (legacyCount <= 0) return [];
  const material = toolDef(key)?.defaultMaterial || DEFAULT_TOOL_MATERIAL;
  const maxDurability = getToolMaxDurabilityForMaterial(key, material);
  return [{
    key,
    material,
    durability: maxDurability,
    maxDurability,
    count: legacyCount
  }];
}

export function createToolStack(toolOrKey, count = 1, options = {}) {
  const qty = normalizeStackCount(count);
  if (qty <= 0) return null;
  const tool = (typeof toolOrKey === 'string')
    ? createToolItem(toolOrKey, options.durability ?? null, options.material)
    : toolOrKey;
  if (!tool?.key || !isToolKey(tool.key)) return null;
  return {
    key: tool.key,
    material: normalizeToolMaterial(tool.material),
    durability: Math.max(0, Math.floor(Number(tool.durability) || 0)),
    maxDurability: Math.max(1, Math.floor(Number(tool.maxDurability) || 1)),
    count: qty
  };
}

export function addToolToStorageBucket(bucket, toolOrKey, count = 1, options = {}) {
  if (!bucket) return 0;
  const stack = createToolStack(toolOrKey, count, options);
  if (!stack) return 0;
  if (!Array.isArray(bucket[stack.key])) bucket[stack.key] = listToolStorageEntries(bucket, stack.key);
  const existing = bucket[stack.key].find(entry => (
    entry.material === stack.material
    && entry.durability === stack.durability
    && entry.maxDurability === stack.maxDurability
  ));
  if (existing) {
    existing.count += stack.count;
  } else {
    bucket[stack.key].push(stack);
  }
  return stack.count;
}

export function takeToolFromStorageBucket(bucket, key, options = {}) {
  if (!bucket || !isToolKey(key)) return null;
  const preferredMaterial = options.material ? normalizeToolMaterial(options.material) : null;
  if (!Array.isArray(bucket[key])) bucket[key] = listToolStorageEntries(bucket, key);
  const entries = bucket[key];
  if (!Array.isArray(entries) || entries.length <= 0) return null;

  let selectedIndex = -1;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = normalizeToolStackEntry(key, entries[index]);
    if (!entry) continue;
    if (preferredMaterial && entry.material !== preferredMaterial) continue;
    if (selectedIndex < 0) {
      selectedIndex = index;
      continue;
    }
    const current = normalizeToolStackEntry(key, entries[selectedIndex]);
    const entryDurabilityRatio = entry.maxDurability > 0 ? entry.durability / entry.maxDurability : 0;
    const currentDurabilityRatio = current.maxDurability > 0 ? current.durability / current.maxDurability : 0;
    const isWeaker = (entryDurabilityRatio < currentDurabilityRatio)
      || (entryDurabilityRatio === currentDurabilityRatio && entry.maxDurability < current.maxDurability)
      || (entryDurabilityRatio === currentDurabilityRatio && entry.maxDurability === current.maxDurability && entry.durability < current.durability);
    if (isWeaker) selectedIndex = index;
  }

  if (selectedIndex < 0 && preferredMaterial) return takeToolFromStorageBucket(bucket, key, {});
  if (selectedIndex < 0) return null;

  const selected = normalizeToolStackEntry(key, entries[selectedIndex]);
  if (!selected) return null;
  entries[selectedIndex].count = normalizeStackCount(entries[selectedIndex].count) - 1;
  if (entries[selectedIndex].count <= 0) entries.splice(selectedIndex, 1);
  return createToolItem(key, selected.durability, selected.material);
}

export function getPooledToolVariantEntries(buckets = []) {
  const pooled = new Map();
  for (const bucket of buckets) {
    for (const key of Object.keys(TOOL_DEFINITIONS)) {
      for (const entry of listToolStorageEntries(bucket, key)) {
        const mapKey = [entry.key, entry.material, entry.durability, entry.maxDurability].join(':');
        const existing = pooled.get(mapKey);
        if (existing) {
          existing.count += entry.count;
        } else {
          pooled.set(mapKey, { ...entry });
        }
      }
    }
  }
  return [...pooled.values()];
}

export function createToolItem(key, durability = null, material = null) {
  const ToolClass = getToolClass(key);
  if (!ToolClass) return null;
  return new ToolClass(durability, material);
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

export function toolInstanceDisplayName(tool) {
  if (!tool) return '';
  return `${toolMaterialDisplayName(tool.material)} ${toolDisplayName(tool.key)}`.trim();
}

export function formatToolDurability(tool) {
  const durability = Math.max(0, Math.round(Number(tool?.durability) || 0));
  const maxDurability = Math.max(1, Math.round(Number(tool?.maxDurability) || 1));
  return `${durability}/${maxDurability}`;
}

export function toolStorageEntryDisplayName(entry) {
  if (!entry) return '';
  return `${toolMaterialDisplayName(entry.material)} ${toolDisplayName(entry.key)} (${formatToolDurability(entry)})`;
}

export function toolIcon(toolKey) {
  const def = toolDef(toolKey);
  return def ? (def.icon || '') : '';
}

export function toolSprite(toolKey) {
  const def = toolDef(toolKey);
  return def ? (def.sprite || '') : '';
}
