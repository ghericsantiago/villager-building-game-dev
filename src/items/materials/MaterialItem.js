import { BaseItem } from '../BaseItem.js';

export class MaterialItem extends BaseItem {
  static key = 'material';
  static displayName = 'Material';
  static icon = '📦';
  static sprite = '';

  constructor() {
    const Ctor = new.target || MaterialItem;
    super({
      key: Ctor.key,
      type: Ctor.key,
      name: Ctor.displayName,
      icon: Ctor.icon || '📦',
      sprite: Ctor.sprite || ''
    });
  }
}
