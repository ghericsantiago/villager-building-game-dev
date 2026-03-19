import { ResourceNode } from './ResourceNode.js';

export class StoneResource extends ResourceNode {
  static definition = {
    key: 'stone',
    name: 'Stone',
    color: '#999',
    footprint: { w: 1, h: 1 }
  };

  constructor(x, y, amount) {
    const d = StoneResource.definition;
    super(d.key, x, y, amount, d);
  }
}
