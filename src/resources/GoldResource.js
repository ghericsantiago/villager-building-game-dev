import { ResourceNode } from './ResourceNode.js';

export class GoldResource extends ResourceNode {
  static definition = {
    key: 'gold',
    name: 'Gold Vein',
    color: 'gold',
    gatherDifficulty: 2.2,
    requiredTools: ['pickaxe'],
    requiredMiningSkillLevel: 15,
    gatheredMaterial: 'gold_ore',
    yieldItems: { gold_ore: 1 },
    concealedUntilMined: true,
    disguisedAsType: 'stone',
    hiddenName: 'Stone Deposit',
    footprint: { w: 1, h: 1 }
  };

  constructor(x, y, amount, props = {}) {
    const d = GoldResource.definition;
    super(d.key, x, y, amount, {
      ...d,
      ...props
    });
  }
}
