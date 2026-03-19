import { ResourceNode } from './ResourceNode.js';

export class CopperResource extends ResourceNode {
  static definition = {
    key: 'copper',
    name: 'Copper Vein',
    color: '#cc7733',
    gatherDifficulty: 1.5,
    requiredTools: ['pickaxe'],
    yieldItems: { copper_ore: 1 },
    footprint: { w: 1, h: 1 }
  };

  constructor(x, y, amount) {
    const d = CopperResource.definition;
    super(d.key, x, y, amount, d);
  }
}
