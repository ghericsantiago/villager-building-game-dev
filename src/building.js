export class Building {
  constructor(kind, x, y, props = {}) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.name = props.name || kind;
    this.icon = props.icon || '';
    this.mapSymbol = props.mapSymbol || '';
    this.blocksMovement = props.blocksMovement ?? false;
  }
}
