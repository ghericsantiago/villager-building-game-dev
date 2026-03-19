import { ResourceNode } from './ResourceNode.js';

export class GoldResource extends ResourceNode {
  static definition = {
    key: 'gold',
    name: 'Gold Vein',
    color: 'gold',
    gatherDifficulty: 2.2,
    requiredTools: ['pickaxe'],
    footprint: { w: 1, h: 1 }
  };

  constructor(x, y, amount) {
    const d = GoldResource.definition;
    super(d.key, x, y, amount, d);
  }
}
