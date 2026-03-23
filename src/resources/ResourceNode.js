import { PositionedObject } from '../core/PositionedObject.js';

export class ResourceNode extends PositionedObject {
  constructor(type, x, y, amount, props = {}) {
    super(x, y, {
      type,
      name: props.name || type,
      icon: props.icon || '',
      sprite: props.sprite || '',
      spriteScale: props.spriteScale
    });
    this.amount = amount;
    this.color = props.color || '#888';
    this.maxAmount = Number.isFinite(props.maxAmount) ? props.maxAmount : Infinity;
    this.gatherDifficulty = Math.max(0.1, Number(props.gatherDifficulty ?? 1));
    this.requiredMiningSkillLevel = Math.max(0, Number(props.requiredMiningSkillLevel ?? 0));
    this.requiredTools = Array.isArray(props.requiredTools)
      ? props.requiredTools.filter(Boolean)
      : [];
    const gatheredMaterial = String(props.gatheredMaterial || '').trim();
    const defaultYield = gatheredMaterial
      ? { [gatheredMaterial]: 1 }
      : { [type]: 1 };
    this.yieldItems = (props.yieldItems && typeof props.yieldItems === 'object')
      ? { ...props.yieldItems }
      : defaultYield;
    // Dedicated single-material shortcut for extensibility while keeping yieldItems for multi-output resources.
    this.gatheredMaterial = gatheredMaterial || Object.keys(this.yieldItems)[0] || type;

    this.concealedUntilMined = !!props.concealedUntilMined;
    this.disguisedAsType = String(props.disguisedAsType || '').trim() || null;
    this.hiddenName = String(props.hiddenName || '').trim() || 'Stone Deposit';
    this.identified = this.concealedUntilMined ? !!props.identified : true;

    const fw = Math.max(1, Number(props.footprint?.w || 1));
    const fh = Math.max(1, Number(props.footprint?.h || 1));
    this.footprint = { w: fw, h: fh };
    this.tileConsumption = fw * fh;
  }

  isIdentified() {
    return !this.concealedUntilMined || this.identified;
  }

  identify() {
    if (this.concealedUntilMined) this.identified = true;
    return this;
  }

  getVisualType() {
    if (this.isIdentified()) return this.type;
    return this.disguisedAsType || this.type;
  }

  getDisplayName() {
    if (this.isIdentified()) return this.name;
    return this.hiddenName || this.name;
  }

  occupiesTile(tileX, tileY) {
    return (
      tileX >= this.x &&
      tileX < this.x + this.footprint.w &&
      tileY >= this.y &&
      tileY < this.y + this.footprint.h
    );
  }

  occupiedTiles() {
    const tiles = [];
    for (let oy = 0; oy < this.footprint.h; oy += 1) {
      for (let ox = 0; ox < this.footprint.w; ox += 1) {
        tiles.push({ x: this.x + ox, y: this.y + oy });
      }
    }
    return tiles;
  }

  centerInWorld(tileSize) {
    return {
      x: (this.x + this.footprint.w / 2) * tileSize,
      y: (this.y + this.footprint.h / 2) * tileSize
    };
  }
}
