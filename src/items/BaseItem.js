import { BaseObject } from '../core/BaseObject.js';

export class BaseItem extends BaseObject {
  constructor(props = {}) {
    super(props);
    this.key = props.key || this.type || this.kind || '';
  }
}
