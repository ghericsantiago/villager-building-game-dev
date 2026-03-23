import { ResourceNode } from './ResourceNode.js';

export class CopperResource extends ResourceNode {
  static definition = {
    key: 'copper',
    name: 'Copper Vein',
    category: 'mineral',
    color: '#cc7733',
    gatherDifficulty: 1.5,
    requiredTools: ['pickaxe'],
    requiredMiningSkillLevel: 3,
    gatheredMaterial: 'copper_ore',
    yieldItems: { copper_ore: 1 },
    concealedUntilMined: true,
    disguisedAsType: 'stone',
    hiddenName: 'Stone Deposit',
    footprint: { w: 1, h: 1 }
  };

  constructor(x, y, amount, props = {}) {
    const d = CopperResource.definition;
    super(d.key, x, y, amount, {
      ...d,
      ...props
    });
  }
}
