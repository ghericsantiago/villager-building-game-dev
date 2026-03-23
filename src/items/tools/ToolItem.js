import { BaseItem } from '../BaseItem.js';
import {
  getToolMaterialDefinition,
  normalizeToolMaterial,
  toolMaterialDisplayName
} from './tool_materials.js';

export class ToolItem extends BaseItem {
  static key = 'tool';
  static displayName = 'Tool';
  static maxDurability = 100;
  static durabilityCostPerUnit = 1;
  static icon = '🛠️';
  static sprite = '';

  constructor(durability = null, material = null) {
    const Ctor = new.target || ToolItem;
    const materialKey = normalizeToolMaterial(material ?? Ctor.defaultMaterial);
    const materialDef = getToolMaterialDefinition(materialKey);
    const baseMaxDurability = Math.max(1, Number(Ctor.maxDurability || 1));
    const scaledMaxDurability = Math.max(1, Math.round(baseMaxDurability * Math.max(0.1, Number(materialDef.durabilityMultiplier || 1))));
    super({
      key: Ctor.key,
      type: Ctor.key,
      name: `${toolMaterialDisplayName(materialKey)} ${Ctor.displayName}`.trim(),
      icon: Ctor.icon || '',
      sprite: Ctor.sprite || ''
    });
    this.key = Ctor.key;
    this.material = materialKey;
    this.baseMaxDurability = baseMaxDurability;
    this.maxDurability = scaledMaxDurability;
    this.durability = Number.isFinite(durability)
      ? Math.max(0, Math.min(this.maxDurability, Math.floor(durability)))
      : this.maxDurability;
  }

  isUsable() {
    return Number(this.durability || 0) > 0;
  }

  consumeDurability(unitsGathered) {
    if (!Number.isFinite(unitsGathered) || unitsGathered <= 0) return;
    const costPerUnit = Math.max(1, Number(this.constructor.durabilityCostPerUnit || 1));
    const spent = Math.floor(unitsGathered * costPerUnit);
    this.durability = Math.max(0, Number(this.durability || 0) - spent);
  }
}
