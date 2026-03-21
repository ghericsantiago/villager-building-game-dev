import { ResourceNode } from './ResourceNode.js';

export class IronResource extends ResourceNode {
  static definition = {
    key: 'iron',
    name: 'Iron Vein',
    category: 'mineral',
    color: '#664422',
    gatherDifficulty: 1.7,
    requiredTools: ['pickaxe'],
    requiredMiningSkillLevel: 5,
    gatheredMaterial: 'iron_ore',
    yieldItems: { iron_ore: 1 },
    concealedUntilMined: true,
    disguisedAsType: 'stone',
    hiddenName: 'Stone Deposit',
    footprint: { w: 1, h: 1 }
  };

  constructor(x, y, amount, props = {}) {
    const d = IronResource.definition;
    super(d.key, x, y, amount, {
      ...d,
      ...props
    });
  }
}
