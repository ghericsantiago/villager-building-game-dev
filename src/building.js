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
  }
}
