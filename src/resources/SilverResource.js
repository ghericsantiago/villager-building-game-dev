import { ResourceNode } from './ResourceNode.js';

export class SilverResource extends ResourceNode {
  static definition = {
    key: 'silver',
    name: 'Silver Vein',
    category: 'mineral',
    color: '#c0c6d0',
    gatherDifficulty: 1.9,
    requiredTools: ['pickaxe'],
    requiredMiningSkillLevel: 8,
    gatheredMaterial: 'silver_ore',
    yieldItems: { silver_ore: 1 },
    concealedUntilMined: true,
    disguisedAsType: 'stone',
    hiddenName: 'Stone Deposit',
    footprint: { w: 1, h: 1 }
  };

  constructor(x, y, amount, props = {}) {
    const d = SilverResource.definition;
    super(d.key, x, y, amount, {
      ...d,
      ...props
    });
  }
}
