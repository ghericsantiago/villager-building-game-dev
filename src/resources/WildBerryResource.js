import { ResourceNode } from './ResourceNode.js';

export class WildBerryResource extends ResourceNode {
  static definition = {
    key: 'wildberry',
    name: 'Wild Berry Bush',
    category: 'food',
    color: '#d94b7b',
    gatherDifficulty: 0.6,
    requiredTools: [],
    requiredMiningSkillLevel: 0,
    gatheredMaterial: 'fruit',
    yieldItems: { fruit: 1 },
    concealedUntilMined: false,
    disguisedAsType: '',
    hiddenName: 'Wild Berry Bush',
    footprint: { w: 1, h: 1 }
  };

  constructor(x, y, amount, props = {}) {
    const d = WildBerryResource.definition;
    super(d.key, x, y, amount, {
      ...d,
      ...props
    });
  }
}
