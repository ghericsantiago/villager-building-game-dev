export class ResourceNode {
  constructor(type, x, y, amount, props = {}) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.amount = amount;
    this.name = props.name || type;
    this.icon = props.icon || '';
    this.color = props.color || '#888';
    this.maxAmount = Number.isFinite(props.maxAmount) ? props.maxAmount : Infinity;
    this.gatherDifficulty = Math.max(0.1, Number(props.gatherDifficulty ?? 1));
    this.requiredTools = Array.isArray(props.requiredTools)
      ? props.requiredTools.filter(Boolean)
      : [];
    const defaultYield = { [type]: 1 };
    this.yieldItems = (props.yieldItems && typeof props.yieldItems === 'object')
      ? { ...props.yieldItems }
      : defaultYield;

    const fw = Math.max(1, Number(props.footprint?.w || 1));
    const fh = Math.max(1, Number(props.footprint?.h || 1));
    this.footprint = { w: fw, h: fh };
    this.tileConsumption = fw * fh;
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
