import { ResourceNode } from './ResourceNode.js';

export class TreeResource extends ResourceNode {
  static definition = {
    key: 'tree',
    name: 'Tree',
    color: 'green',
    gatherDifficulty: 0.9,
    requiredTools: ['axe'],
    footprint: { w: 1, h: 1 }
  };

  constructor(x, y, amount) {
    const d = TreeResource.definition;
    super(d.key, x, y, amount, d);
  }
}
