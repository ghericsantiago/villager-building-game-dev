export class Building {
  constructor(kind, x, y, props = {}) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.name = props.name || kind;
    this.icon = props.icon || '';
    this.mapSymbol = props.mapSymbol || '';
    this.blocksMovement = props.blocksMovement ?? false;
    this.maxCount = props.maxCount ?? Infinity;
    this.requiresBuildings = Array.isArray(props.requiresBuildings) ? [...props.requiresBuildings] : [];
    this.cost = { ...(props.cost || {}) };

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
}
