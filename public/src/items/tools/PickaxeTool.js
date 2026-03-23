import { ToolItem } from './ToolItem.js';

export class PickaxeTool extends ToolItem {
  static key = 'pickaxe';
  static displayName = 'Pickaxe';
  static maxDurability = 360;
  static durabilityCostPerUnit = 1;
}
