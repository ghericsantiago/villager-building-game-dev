import { ResourceNode } from './ResourceNode.js';

export class IronResource extends ResourceNode {
  static definition = {
    key: 'iron',
    name: 'Iron Vein',
    color: '#664422',
    gatherDifficulty: 1.7,
    requiredTools: ['pickaxe'],
    footprint: { w: 1, h: 1 }
  };

  constructor(x, y, amount) {
    const d = IronResource.definition;
    super(d.key, x, y, amount, d);
  }
}
