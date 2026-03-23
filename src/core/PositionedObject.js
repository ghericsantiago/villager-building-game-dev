import { BaseObject } from './BaseObject.js';

export class PositionedObject extends BaseObject {
  constructor(x, y, props = {}) {
    super(props);
    this.x = Number.isFinite(x) ? x : 0;
    this.y = Number.isFinite(y) ? y : 0;
  }

  setPosition(x, y) {
    if (Number.isFinite(x)) this.x = x;
    if (Number.isFinite(y)) this.y = y;
  }
}
