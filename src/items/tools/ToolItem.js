import { BaseItem } from '../BaseItem.js';

export class ToolItem extends BaseItem {
  static key = 'tool';
  static displayName = 'Tool';
  static maxDurability = 100;
  static durabilityCostPerUnit = 1;
  static icon = '🛠️';
  static sprite = '';

  constructor(durability = null) {
    const Ctor = new.target || ToolItem;
    super({
      key: Ctor.key,
      type: Ctor.key,
      name: Ctor.displayName,
      icon: Ctor.icon || '',
      sprite: Ctor.sprite || ''
    });
    this.key = Ctor.key;
    this.maxDurability = Math.max(1, Number(Ctor.maxDurability || 1));
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
