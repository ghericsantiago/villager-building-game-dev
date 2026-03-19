export class ToolItem {
  static key = 'tool';
  static displayName = 'Tool';
  static maxDurability = 100;
  static durabilityCostPerUnit = 1;

  constructor(durability = null) {
    this.key = this.constructor.key;
    this.maxDurability = Math.max(1, Number(this.constructor.maxDurability || 1));
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
